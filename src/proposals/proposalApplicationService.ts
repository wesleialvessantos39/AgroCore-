/**
 * MÓDULO 005 — SERVIÇO DE APLICAÇÃO DE PROPOSTAS
 * Pipeline Comercial, Revisão, Aprovação, Apresentação e Decisão (OE-005.003)
 * AgroCore
 */

import {
  CreateProposalInput,
  ApproveProposalCommand,
  AssignProposalReviewerCommand,
  CancelProposalCommand,
  PaginatedProposalsResult,
  PresentProposalCommand,
  Proposal,
  ProposalCalculationSummary,
  ProposalCapturerSnapshot,
  ProposalClientSnapshot,
  ProposalDecisionRecord,
  ProposalDomainError,
  ProposalFilterOptions,
  ProposalId,
  ProposalPresentationRecord,
  ProposalPropertySnapshot,
  ProposalReviewAssignment,
  ProposalStatus,
  ProposalStatusHistoryEntry,
  ProposalVersionSnapshot,
  RecordProposalDecisionCommand,
  RejectProposalCommand,
  RequestProposalChangesCommand,
  StartProposalReviewCommand,
  SubmitProposalCommand,
  UpdateProposalInput,
} from '../types/proposals';
import { Client } from '../types/client';
import { Property } from '../types/property';
import { ClientCapturerAssignmentGateway } from '../types/clientCapturerAssignment';
import { OrganizationMember } from '../auth/organizationMembersGateway';
import { OrganizationRole } from '../types/auth';
import { Permission } from '../types/authorization';
import {
  calculateProposalFinancialSummary,
  formatCentsToBRL,
} from './financialCalculator';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import {
  canTransitionProposalStatus,
  isTerminalProposalStatus,
} from './validators';
import {
  calculateSha256,
  canonicalJsonStringify,
  Clock,
  IdGenerator,
  SecureIdGenerator,
  SystemClock,
} from './cryptoUtils';
import {
  proposalEventBus,
  ProposalEventType,
  ProposalNotification,
} from './proposalEventService';
import { ROLE_PERMISSIONS_SET_MAP } from '../authorization/permissionsMatrix';

export interface ProposalAppContext {
  readonly organizationId: string;
  readonly actor: {
    readonly userId: string;
    readonly role: OrganizationRole;
    readonly isActive: boolean;
    readonly permissions: readonly Permission[];
  };
  readonly clientResolver: (clientId: string) => Promise<Client | null>;
  readonly propertyResolver?: (propertyId: string) => Promise<Property | null>;
  readonly assignmentGateway: ClientCapturerAssignmentGateway;
  readonly memberResolver: (userId: string) => Promise<OrganizationMember | null>;
}

export interface ProposalSystemContext {
  readonly organizationId: string;
  readonly systemActor: 'proposal-expiration-scheduler';
}

export class ProposalApplicationService {
  // Armazenamento em memória autoritativo por organização
  private static proposalsStore: Map<string, Map<ProposalId, Proposal>> = new Map();
  private static historyStore: Map<string, Map<ProposalId, ProposalStatusHistoryEntry[]>> = new Map();
  private static snapshotsStore: Map<string, Map<ProposalId, ProposalVersionSnapshot[]>> = new Map();
  private static assignmentsStore: Map<string, Map<ProposalId, ProposalReviewAssignment[]>> = new Map();
  private static counterStore: Map<string, number> = new Map();
  private static idempotencyStore: Map<string, { payloadHash: string; proposal: Proposal }> = new Map();
  private static inFlightOperations: Map<string, { payloadHash: string; promise: Promise<Proposal> }> = new Map();
  private static updateLocks: Map<string, Promise<void>> = new Map();

  private static isCleanupRegistered = false;

  constructor(private readonly idGenerator: IdGenerator = SecureIdGenerator) {
    if (!ProposalApplicationService.isCleanupRegistered) {
      registerDomainCleanup(() => {
        ProposalApplicationService.clearAll();
      });
      ProposalApplicationService.isCleanupRegistered = true;
    }
  }

  private static async acquireLock(key: string): Promise<() => void> {
    while (ProposalApplicationService.updateLocks.has(key)) {
      try {
        await ProposalApplicationService.updateLocks.get(key);
      } catch {
        // Ignora erros de locks anteriores
      }
    }

    let release!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      release = () => {
        ProposalApplicationService.updateLocks.delete(key);
        resolve();
      };
    });

    ProposalApplicationService.updateLocks.set(key, lockPromise);
    return release;
  }

  private static getOrgStore(orgId: string): Map<ProposalId, Proposal> {
    if (!ProposalApplicationService.proposalsStore.has(orgId)) {
      ProposalApplicationService.proposalsStore.set(orgId, new Map());
    }
    return ProposalApplicationService.proposalsStore.get(orgId)!;
  }

  private static getOrgHistoryStore(orgId: string): Map<ProposalId, ProposalStatusHistoryEntry[]> {
    if (!ProposalApplicationService.historyStore.has(orgId)) {
      ProposalApplicationService.historyStore.set(orgId, new Map());
    }
    return ProposalApplicationService.historyStore.get(orgId)!;
  }

  private static getOrgSnapshotsStore(orgId: string): Map<ProposalId, ProposalVersionSnapshot[]> {
    if (!ProposalApplicationService.snapshotsStore.has(orgId)) {
      ProposalApplicationService.snapshotsStore.set(orgId, new Map());
    }
    return ProposalApplicationService.snapshotsStore.get(orgId)!;
  }

  private static getOrgAssignmentsStore(orgId: string): Map<ProposalId, ProposalReviewAssignment[]> {
    if (!ProposalApplicationService.assignmentsStore.has(orgId)) {
      ProposalApplicationService.assignmentsStore.set(orgId, new Map());
    }
    return ProposalApplicationService.assignmentsStore.get(orgId)!;
  }

  private static getNextNumber(orgId: string, clock: Clock): string {
    const current = ProposalApplicationService.counterStore.get(orgId) || 0;
    const next = current + 1;
    ProposalApplicationService.counterStore.set(orgId, next);
    const year = clock.now().getUTCFullYear();
    return `PROP-${year}-${next.toString().padStart(4, '0')}`;
  }

  public static clearAll(): void {
    ProposalApplicationService.proposalsStore.clear();
    ProposalApplicationService.historyStore.clear();
    ProposalApplicationService.snapshotsStore.clear();
    ProposalApplicationService.assignmentsStore.clear();
    ProposalApplicationService.counterStore.clear();
    ProposalApplicationService.idempotencyStore.clear();
    ProposalApplicationService.inFlightOperations.clear();
    ProposalApplicationService.updateLocks.clear();
    proposalEventBus.clearAll();
  }

  private clone<T>(value: T): T {
    if (typeof globalThis.structuredClone === 'function') {
      return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private hasPermission(ctx: ProposalAppContext, permission: Permission): boolean {
    const canonical = ROLE_PERMISSIONS_SET_MAP.get(ctx.actor.role);
    return Boolean(canonical?.has(permission) && ctx.actor.permissions.includes(permission));
  }

  private requirePermission(ctx: ProposalAppContext, permission: Permission): void {
    if (!this.hasPermission(ctx, permission)) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        `Permissão "${permission}" requerida para esta operação.`
      );
    }
  }

  private validateCommandMetadata(
    proposal: Proposal,
    metadata: { expectedVersion: number; idempotencyKey: string }
  ): void {
    if (!metadata.idempotencyKey || metadata.idempotencyKey.trim().length < 8) {
      throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave de idempotência inválida.');
    }
    if (metadata.expectedVersion !== proposal.version) {
      throw new ProposalDomainError(
        'CONCURRENCY_CONFLICT',
        `Conflito de versão: atual ${proposal.version}, esperada ${metadata.expectedVersion}.`
      );
    }
  }

  private async runIdempotentMutation(
    operation: string,
    proposalId: ProposalId,
    idempotencyKey: string,
    payload: unknown,
    ctx: ProposalAppContext,
    execute: () => Promise<Proposal>
  ): Promise<Proposal> {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave de idempotência inválida.');
    }
    const normalizedKey = idempotencyKey.trim();
    const compositeKey = `${ctx.organizationId}:${proposalId}:${operation}:${normalizedKey}`;
    const payloadHash = canonicalJsonStringify(payload);
    const completed = ProposalApplicationService.idempotencyStore.get(compositeKey);
    if (completed) {
      if (completed.payloadHash !== payloadHash) {
        throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave reutilizada com conteúdo divergente.');
      }
      return this.clone(completed.proposal);
    }
    const inFlight = ProposalApplicationService.inFlightOperations.get(compositeKey);
    if (inFlight) {
      if (inFlight.payloadHash !== payloadHash) {
        throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave concorrente com conteúdo divergente.');
      }
      return this.clone(await inFlight.promise);
    }
    const promise = execute();
    ProposalApplicationService.inFlightOperations.set(compositeKey, { payloadHash, promise });
    try {
      const result = await promise;
      ProposalApplicationService.idempotencyStore.set(compositeKey, {
        payloadHash,
        proposal: this.clone(result),
      });
      return this.clone(result);
    } finally {
      ProposalApplicationService.inFlightOperations.delete(compositeKey);
    }
  }

  // --- Normalização Determinística de Payloads para Idempotência ---
  private normalizeCreatePayload(input: CreateProposalInput): string {
    return JSON.stringify({
      clientId: input.clientId?.trim() || '',
      propertyId: input.propertyId ? input.propertyId.trim() : null,
      title: input.title?.trim() || '',
      proposalType: input.proposalType,
      category: input.category || 'custeio',
      validityDays: input.validityDays ?? 30,
      requestedAmountCents: input.requestedAmountCents,
      financingTermMonths: input.financingTermMonths ?? null,
      gracePeriodMonths: input.gracePeriodMonths ?? null,
      interestRateAnnualPercentage: input.interestRateAnnualPercentage ?? null,
      notes: input.notes?.trim() || null,
    });
  }

  private normalizeUpdatePayload(input: UpdateProposalInput): string {
    return JSON.stringify({
      title: input.title?.trim() ?? null,
      proposalType: input.proposalType ?? null,
      category: input.category ?? null,
      propertyId: input.propertyId !== undefined ? (input.propertyId ? input.propertyId.trim() : null) : undefined,
      validityDays: input.validityDays ?? null,
      requestedAmountCents: input.requestedAmountCents ?? null,
      financingTermMonths: input.financingTermMonths ?? null,
      gracePeriodMonths: input.gracePeriodMonths ?? null,
      interestRateAnnualPercentage: input.interestRateAnnualPercentage ?? null,
      notes: input.notes?.trim() ?? null,
      expectedVersion: input.expectedVersion,
    });
  }

  // --- Validações de Contexto e Ator (Deny-by-Default) ---
  private validateContext(ctx: ProposalAppContext): void {
    if (!ctx.organizationId || ctx.organizationId.trim() === '') {
      throw new ProposalDomainError('ORGANIZATION_REQUIRED', 'Identificador de organização ativa é obrigatório.');
    }
    if (!ctx.actor || !ctx.actor.userId || ctx.actor.isActive !== true) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Usuário não autenticado ou vínculo inativo na organização.');
    }
  }

  private checkReadAccess(proposal: Proposal, ctx: ProposalAppContext): void {
    const hasOrganizationView = this.hasPermission(ctx, 'proposals:view');
    const hasRelatedView = this.hasPermission(ctx, 'proposals:view_related');
    const hasAssignedView = this.hasPermission(ctx, 'proposals:view_assigned');
    const isRelatedCapturer =
      ctx.actor.role === 'capturer' &&
      hasRelatedView &&
      proposal.capturerUserId === ctx.actor.userId;
    const isAssignedReviewer =
      ctx.actor.role === 'project_designer' &&
      hasAssignedView &&
      proposal.activeReviewAssignment?.reviewerUserId === ctx.actor.userId;

    const mayUseOrganizationView =
      hasOrganizationView && ctx.actor.role !== 'capturer' && ctx.actor.role !== 'project_designer';

    if (!mayUseOrganizationView && !isRelatedCapturer && !isAssignedReviewer) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: você não tem permissão para visualizar esta proposta.'
      );
    }

    if (!this.hasPermission(ctx, 'proposals:view_financials')) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: as condições financeiras exigem permissão específica.'
      );
    }
  }

  private checkEditAccess(proposal: Proposal, ctx: ProposalAppContext): void {
    this.requirePermission(ctx, 'proposals:edit_draft');

    if (ctx.actor.role === 'capturer' && proposal.capturerUserId !== ctx.actor.userId) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: captadores só podem editar propostas de clientes a eles vinculados.'
      );
    }
    if (ctx.actor.role === 'project_designer' && proposal.createdByUserId !== ctx.actor.userId) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: o projetista só pode editar propostas criadas por ele.'
      );
    }
  }

  // --- Preparação atômica de Histórico e Snapshots ---
  private async buildHistoryAndSnapshot(
    proposal: Proposal,
    fromStatus: ProposalStatus,
    toStatus: ProposalStatus,
    actorUserId: string,
    actorName: string | undefined,
    reason: string | undefined,
    notes: string | undefined,
    clock: Clock
  ): Promise<{
    historyEntry: ProposalStatusHistoryEntry;
    snapshotEntry: ProposalVersionSnapshot;
    correlationId: string;
  }> {
    const orgId = proposal.organizationId;
    const nowIso = clock.now().toISOString();
    const correlationId = this.idGenerator.next('corr');
    const historyEntry: ProposalStatusHistoryEntry = {
      id: this.idGenerator.next('hist'),
      organizationId: orgId,
      proposalId: proposal.id,
      versionNumber: proposal.version,
      fromStatus,
      toStatus,
      actorUserId,
      actorName: actorName ? 'Usuário autorizado' : undefined,
      reason,
      notes: notes ? 'Conteúdo protegido registrado no domínio.' : undefined,
      correlationId,
      timestamp: nowIso,
    };
    const canonicalJson = canonicalJsonStringify(proposal);
    let checksumSha256: string;
    try {
      checksumSha256 = await calculateSha256(canonicalJson);
    } catch {
      throw new ProposalDomainError('HASH_UNAVAILABLE', 'Não foi possível calcular SHA-256 verdadeiro.');
    }

    const snapshotEntry: ProposalVersionSnapshot = {
      id: this.idGenerator.next('snap'),
      organizationId: orgId,
      proposalId: proposal.id,
      versionNumber: proposal.version,
      snapshot: this.clone(proposal),
      status: toStatus,
      createdByUserId: actorUserId,
      createdAt: nowIso,
      correlationId,
      checksumSha256,
    };
    return { historyEntry, snapshotEntry, correlationId };
  }

  private commitTransition(
    previous: Proposal,
    proposal: Proposal,
    historyEntry: ProposalStatusHistoryEntry,
    snapshotEntry: ProposalVersionSnapshot,
    type: ProposalEventType,
    actorUserId: string,
    payload: Record<string, unknown>,
    clock: Clock,
    notifications: readonly Omit<ProposalNotification, 'read'>[] = [],
    assignmentState?: readonly ProposalReviewAssignment[]
  ): void {
    const orgStore = ProposalApplicationService.getOrgStore(proposal.organizationId);
    const historyMap = ProposalApplicationService.getOrgHistoryStore(proposal.organizationId);
    const snapshotsMap = ProposalApplicationService.getOrgSnapshotsStore(proposal.organizationId);
    const history = historyMap.get(proposal.id) ?? [];
    const snapshots = snapshotsMap.get(proposal.id) ?? [];
    const assignmentsMap = ProposalApplicationService.getOrgAssignmentsStore(proposal.organizationId);

    const safePayload = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) =>
        ['isResubmit', 'reviewerUserId', 'channel', 'decision', 'reasonCode'].includes(key) &&
        (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')
      )
    );

    orgStore.set(proposal.id, this.clone(proposal));
    historyMap.set(proposal.id, [...history, this.clone(historyEntry)]);
    snapshotsMap.set(proposal.id, [...snapshots, this.clone(snapshotEntry)]);
    if (assignmentState) {
      assignmentsMap.set(proposal.id, this.clone(Array.from(assignmentState)));
    }
    proposalEventBus.emit({
      id: this.idGenerator.next('evt'),
      type,
      organizationId: proposal.organizationId,
      proposalId: proposal.id,
      proposalNumber: proposal.proposalNumber,
      status: proposal.status,
      versionNumber: proposal.version,
      actorUserId,
      correlationId: historyEntry.correlationId,
      timestamp: clock.now().toISOString(),
      payload: safePayload,
    });
    for (const notification of notifications) {
      proposalEventBus.addNotification(this.clone(notification));
    }

    if (orgStore.get(proposal.id)?.version !== proposal.version) {
      orgStore.set(previous.id, this.clone(previous));
      historyMap.set(proposal.id, history);
      snapshotsMap.set(proposal.id, snapshots);
      throw new ProposalDomainError('OPERATION_NOT_ALLOWED', 'Falha ao confirmar a transição atômica.');
    }
  }

  // --- 1. CRIAÇÃO DE PROPOSTA ---
  public async createProposal(
    input: CreateProposalInput,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);

    this.requirePermission(ctx, 'proposals:create');

    if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
      throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave de idempotência inválida.');
    }

    if (input.idempotencyKey.trim() !== '') {
      const compositeKey = `${ctx.organizationId}:createProposal:${input.idempotencyKey.trim()}`;
      const payloadHash = this.normalizeCreatePayload(input);

      const existing = ProposalApplicationService.idempotencyStore.get(compositeKey);
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new ProposalDomainError(
            'IDEMPOTENCY_CONFLICT',
            'Chave de idempotência já utilizada com parâmetros divergentes.'
          );
        }
        return JSON.parse(JSON.stringify(existing.proposal));
      }

      const inFlight = ProposalApplicationService.inFlightOperations.get(compositeKey);
      if (inFlight) {
        if (inFlight.payloadHash !== payloadHash) {
          throw new ProposalDomainError(
            'IDEMPOTENCY_CONFLICT',
            'Chave de idempotência já utilizada com parâmetros divergentes em operação concorrente.'
          );
        }
        const inFlightResult = await inFlight.promise;
        return JSON.parse(JSON.stringify(inFlightResult));
      }

      const execPromise = this.executeCreateProposal(input, ctx, clock);
      ProposalApplicationService.inFlightOperations.set(compositeKey, { payloadHash, promise: execPromise });

      try {
        const createdProposal = await execPromise;
        ProposalApplicationService.idempotencyStore.set(compositeKey, {
          payloadHash,
          proposal: JSON.parse(JSON.stringify(createdProposal)),
        });
        return createdProposal;
      } finally {
        ProposalApplicationService.inFlightOperations.delete(compositeKey);
      }
    }

    return this.executeCreateProposal(input, ctx, clock);
  }

  private async executeCreateProposal(
    input: CreateProposalInput,
    ctx: ProposalAppContext,
    clock: Clock
  ): Promise<Proposal> {
    if (!input.title || input.title.trim().length < 3) {
      throw new ProposalDomainError('INVALID_FINANCIAL_VALUE', 'Título da proposta deve ter no mínimo 3 caracteres.');
    }

    if (!input.requestedAmountCents || input.requestedAmountCents <= 0 || !Number.isInteger(input.requestedAmountCents)) {
      throw new ProposalDomainError('INVALID_FINANCIAL_VALUE', 'Valor solicitado deve ser um número inteiro de centavos positivo.');
    }

    const validityDays = input.validityDays && input.validityDays > 0 ? Math.min(input.validityDays, 365) : 30;

    const client = await ctx.clientResolver(input.clientId);
    if (!client) {
      throw new ProposalDomainError('CLIENT_NOT_FOUND', `Cliente com ID "${input.clientId}" não foi encontrado.`);
    }
    if (client.status !== 'active') {
      throw new ProposalDomainError('CLIENT_INACTIVE', 'Não é permitido criar proposta para um cliente inativo.');
    }
    if (client.organizationId !== ctx.organizationId) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'O cliente não pertence à organização ativa.');
    }

    let capturerUserId = ctx.actor.userId;
    if (ctx.actor.role === 'capturer') {
      const activeAssignment = await ctx.assignmentGateway.getActiveAssignment(ctx.organizationId, client.id);
      if (!activeAssignment || activeAssignment.capturerUserId !== ctx.actor.userId || activeAssignment.status !== 'active') {
        throw new ProposalDomainError(
          'CAPTURER_NOT_ASSIGNED',
          'O captador logado não possui vínculo comercial ativo com este cliente.'
        );
      }
    } else {
      const activeAssignment = await ctx.assignmentGateway.getActiveAssignment(ctx.organizationId, client.id);
      if (activeAssignment && activeAssignment.status === 'active') {
        capturerUserId = activeAssignment.capturerUserId;
      }
    }

    const capturerMember = await ctx.memberResolver(capturerUserId);
    const capturerSnapshot: ProposalCapturerSnapshot = {
      userId: capturerUserId,
      name: capturerMember?.name || ctx.actor.userId,
      email: capturerMember?.email,
      role: capturerMember?.organizationRole || ctx.actor.role,
    };

    const isIndividual = client.personType === 'individual';
    const clientDocument = isIndividual ? client.cpf : client.cnpj;
    const clientName = isIndividual ? client.name : (client.companyName || client.tradeName || client.cnpj);
    const clientSnapshot: ProposalClientSnapshot = {
      id: client.id,
      name: clientName,
      documentNumber: clientDocument,
      documentType: isIndividual ? 'cpf' : 'cnpj',
      email: client.contact?.email,
      phone: client.contact?.primaryPhone,
    };

    let propertySnapshot: ProposalPropertySnapshot | null = null;
    let validPropertyId: string | null = null;

    if (input.propertyId && input.propertyId.trim() !== '') {
      if (!ctx.propertyResolver) {
        throw new ProposalDomainError('PROPERTY_NOT_FOUND', 'Serviço de resolução de imóveis não configurado.');
      }
      const property = await ctx.propertyResolver(input.propertyId);
      if (!property) {
        throw new ProposalDomainError('PROPERTY_NOT_FOUND', `Imóvel com ID "${input.propertyId}" não foi encontrado.`);
      }
      if (property.status !== 'active') {
        throw new ProposalDomainError('PROPERTY_INACTIVE', 'O imóvel vinculado encontra-se inativo.');
      }
      if (property.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'O imóvel não pertence à organização ativa.');
      }

      const isLinkedToClient = property.clientLinks && property.clientLinks.some((l) => l.clientId === client.id);
      if (!isLinkedToClient) {
        throw new ProposalDomainError(
          'PROPERTY_NOT_BELONGS_TO_CLIENT',
          'O imóvel informado não possui vínculo cadastral com o cliente selecionado.'
        );
      }

      validPropertyId = property.id;
      const primaryReg = property.registrations?.find((r) => r.isPrimary) || property.registrations?.[0];
      let totalAreaHectares: number | undefined = undefined;
      if (property.propertyType === 'rural') {
        const parsed = parseFloat(property.areas.totalDeclaredAreaHa);
        if (!isNaN(parsed)) totalAreaHectares = parsed;
      }
      propertySnapshot = {
        id: property.id,
        name: property.name,
        registrationNumber: primaryReg?.registrationNumber,
        totalAreaHectares,
        city: property.location?.city,
        state: property.location?.state,
      };
    }

    const now = clock.now();
    const expiresDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
    const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
    const id: ProposalId = this.idGenerator.next('prop');
    const proposalNumber = ProposalApplicationService.getNextNumber(ctx.organizationId, clock);

    const calcResult = calculateProposalFinancialSummary({
      principalCents: input.requestedAmountCents,
      financingTermMonths: input.financingTermMonths,
      interestRateAnnualPercentage: input.interestRateAnnualPercentage,
      gracePeriodMonths: input.gracePeriodMonths,
      roundingMode: 'half_even',
    });

    const calculationSummary: ProposalCalculationSummary = {
      principalCents: calcResult.principalCents,
      interestRateAnnualPercentage: calcResult.interestRateAnnualPercentage,
      financingTermMonths: calcResult.financingTermMonths,
      gracePeriodMonths: calcResult.gracePeriodMonths,
      estimatedInterestCents: calcResult.estimatedInterestCents,
      totalEstimatedCents: calcResult.totalEstimatedCents,
      installmentsCount: calcResult.installmentsCount,
      installmentEstimatedCents: calcResult.installmentEstimatedCents,
      formattedValueBRL: calcResult.formattedValueBRL,
    };

    const newProposal: Proposal = {
      id,
      organizationId: ctx.organizationId,
      proposalNumber,
      title: input.title.trim(),
      clientId: client.id,
      clientSnapshot,
      propertyId: validPropertyId,
      propertySnapshot,
      capturerUserId,
      capturerSnapshot,
      createdByUserId: ctx.actor.userId,
      submittedByUserId: null,
      proposalType: input.proposalType,
      category: input.category || 'custeio',
      status: 'draft',
      validityDays,
      expiresAt: expiresDate.toISOString(),
      estimatedValue: {
        amountCents: input.requestedAmountCents,
        currency: 'BRL',
        formattedBRL: formatCentsToBRL(input.requestedAmountCents),
      },
      calculationSummary,
      notes: input.notes?.trim() || undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
    };

    orgStore.set(id, this.clone(newProposal));
    return this.clone(newProposal);
  }

  // --- 2. ATUALIZAÇÃO DE PROPOSTA ---
  public async updateProposal(
    proposalId: ProposalId,
    input: UpdateProposalInput,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);
    return this.runIdempotentMutation(
      'update',
      proposalId,
      input.idempotencyKey,
      this.normalizeUpdatePayload(input),
      ctx,
      async () => {
        const lockKey = `${ctx.organizationId}:${proposalId}`;
        const release = await ProposalApplicationService.acquireLock(lockKey);
        try {
          return await this.executeUpdateProposal(proposalId, input, ctx, clock);
        } finally {
          release();
        }
      }
    );
  }

  private async executeUpdateProposal(
    proposalId: ProposalId,
    input: UpdateProposalInput,
    ctx: ProposalAppContext,
    clock: Clock
  ): Promise<Proposal> {
    const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
    const existing = orgStore.get(proposalId);

    if (!existing) {
      throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
    }

    if (existing.organizationId !== ctx.organizationId) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
    }

    this.checkEditAccess(existing, ctx);

    // Permite edição em draft ou changes_requested
    if (existing.status !== 'draft' && existing.status !== 'changes_requested') {
      throw new ProposalDomainError(
        'PROPOSAL_LOCKED',
        `Propostas no status "${existing.status}" não podem ser alteradas.`
      );
    }

    this.validateCommandMetadata(existing, input);

    let propertySnapshot = existing.propertySnapshot;
    let propertyId = existing.propertyId;

    if (input.propertyId !== undefined) {
      if (input.propertyId === null || input.propertyId.trim() === '') {
        propertyId = null;
        propertySnapshot = null;
      } else {
        if (!ctx.propertyResolver) {
          throw new ProposalDomainError('PROPERTY_NOT_FOUND', 'Serviço de resolução de imóveis não configurado.');
        }
        const property = await ctx.propertyResolver(input.propertyId);
        if (!property) {
          throw new ProposalDomainError('PROPERTY_NOT_FOUND', `Imóvel com ID "${input.propertyId}" não foi encontrado.`);
        }
        if (property.status !== 'active') {
          throw new ProposalDomainError('PROPERTY_INACTIVE', 'O imóvel vinculado encontra-se inativo.');
        }
        if (property.organizationId !== ctx.organizationId) {
          throw new ProposalDomainError('PERMISSION_DENIED', 'O imóvel não pertence à organização ativa.');
        }

        const isLinkedToClient = property.clientLinks && property.clientLinks.some((l) => l.clientId === existing.clientId);
        if (!isLinkedToClient) {
          throw new ProposalDomainError(
            'PROPERTY_NOT_BELONGS_TO_CLIENT',
            'O imóvel informado não possui vínculo cadastral com o cliente desta proposta.'
          );
        }

        propertyId = property.id;
        const primaryReg = property.registrations?.find((r) => r.isPrimary) || property.registrations?.[0];
        let totalAreaHectares: number | undefined = undefined;
        if (property.propertyType === 'rural') {
          const parsed = parseFloat(property.areas.totalDeclaredAreaHa);
          if (!isNaN(parsed)) totalAreaHectares = parsed;
        }
        propertySnapshot = {
          id: property.id,
          name: property.name,
          registrationNumber: primaryReg?.registrationNumber,
          totalAreaHectares,
          city: property.location?.city,
          state: property.location?.state,
        };
      }
    }

    const newAmountCents = input.requestedAmountCents ?? existing.estimatedValue.amountCents;
    if (newAmountCents <= 0 || !Number.isInteger(newAmountCents) || !Number.isSafeInteger(newAmountCents)) {
      throw new ProposalDomainError('INVALID_FINANCIAL_VALUE', 'Valor solicitado deve ser um número inteiro de centavos positivo.');
    }

    const newTerm = input.financingTermMonths !== undefined ? input.financingTermMonths : existing.calculationSummary.financingTermMonths;
    const newInterest = input.interestRateAnnualPercentage !== undefined ? input.interestRateAnnualPercentage : existing.calculationSummary.interestRateAnnualPercentage;
    const newGrace = input.gracePeriodMonths !== undefined ? input.gracePeriodMonths : existing.calculationSummary.gracePeriodMonths;

    const calcResult = calculateProposalFinancialSummary({
      principalCents: newAmountCents,
      financingTermMonths: newTerm,
      interestRateAnnualPercentage: newInterest,
      gracePeriodMonths: newGrace,
      roundingMode: 'half_even',
    });

    const calculationSummary: ProposalCalculationSummary = {
      principalCents: calcResult.principalCents,
      interestRateAnnualPercentage: calcResult.interestRateAnnualPercentage,
      financingTermMonths: calcResult.financingTermMonths,
      gracePeriodMonths: calcResult.gracePeriodMonths,
      estimatedInterestCents: calcResult.estimatedInterestCents,
      totalEstimatedCents: calcResult.totalEstimatedCents,
      installmentsCount: calcResult.installmentsCount,
      installmentEstimatedCents: calcResult.installmentEstimatedCents,
      formattedValueBRL: calcResult.formattedValueBRL,
    };

    const validityDays = input.validityDays !== undefined ? Math.min(Math.max(1, input.validityDays), 365) : existing.validityDays;
    const createdAtTime = new Date(existing.createdAt).getTime();
    const expiresAt = new Date(createdAtTime + validityDays * 24 * 60 * 60 * 1000).toISOString();

    const updatedProposal: Proposal = {
      ...existing,
      title: input.title !== undefined ? input.title.trim() : existing.title,
      proposalType: input.proposalType || existing.proposalType,
      category: input.category || existing.category,
      propertyId,
      propertySnapshot,
      validityDays,
      expiresAt,
      estimatedValue: {
        amountCents: newAmountCents,
        currency: 'BRL',
        formattedBRL: formatCentsToBRL(newAmountCents),
      },
      calculationSummary,
      notes: input.notes !== undefined ? (input.notes.trim() || undefined) : existing.notes,
      updatedAt: clock.now().toISOString(),
      version: existing.version + 1,
    };

    orgStore.set(proposalId, this.clone(updatedProposal));
    return this.clone(updatedProposal);
  }

  // --- 3. SUBMISSÃO DE PROPOSTA (draft/changes_requested -> submitted) ---
  public async submitProposal(
    command: SubmitProposalCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:submit');
    return this.runIdempotentMutation('submit', command.proposalId, command.idempotencyKey, command, ctx, async () => {
      const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
      try {
        const existing = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
        if (!existing) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
        this.validateCommandMetadata(existing, command);
        this.checkEditAccess(existing, ctx);
        if (!canTransitionProposalStatus(existing.status, 'submitted')) {
          throw new ProposalDomainError('OPERATION_NOT_ALLOWED', `Transição inválida a partir de ${existing.status}.`);
        }
        const isResubmit = existing.status === 'changes_requested';
        const nowIso = clock.now().toISOString();
        const updatedProposal: Proposal = {
          ...existing,
          status: 'submitted',
          submittedAt: nowIso,
          submittedByUserId: ctx.actor.userId,
          updatedAt: nowIso,
          version: existing.version + 1,
        };
        const actorMember = await ctx.memberResolver(ctx.actor.userId);
        const artifacts = await this.buildHistoryAndSnapshot(
          updatedProposal, existing.status, 'submitted', ctx.actor.userId, actorMember?.name,
          isResubmit ? 'RESUBMITTED' : 'SUBMITTED', undefined, clock
        );
        this.commitTransition(
          existing, updatedProposal, artifacts.historyEntry, artifacts.snapshotEntry,
          isResubmit ? 'proposal.resubmitted' : 'proposal.submitted', ctx.actor.userId,
          { isResubmit }, clock
        );
        return this.clone(updatedProposal);
      } finally {
        release();
      }
    });
  }

  // --- 4. ATRIBUIÇÃO DE REVISOR TÉCNICO ---
  public async assignProposalReviewer(
    command: AssignProposalReviewerCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:assign_review');
    return this.runIdempotentMutation('assign-review', command.proposalId, command.idempotencyKey, command, ctx, async () => {
      const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
      try {
        const existing = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
        if (!existing) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
        this.validateCommandMetadata(existing, command);
        if (existing.status !== 'submitted' && existing.status !== 'under_review') {
          throw new ProposalDomainError('OPERATION_NOT_ALLOWED', 'Atribuição permitida somente na fila ou em revisão.');
        }
        const reviewerMember = await ctx.memberResolver(command.reviewerUserId);
        if (!reviewerMember || !reviewerMember.isActive || reviewerMember.organizationRole !== 'project_designer') {
          throw new ProposalDomainError('REVIEWER_MISMATCH', 'Revisor deve ser projetista ativo da organização.');
        }
        const isReassignment = Boolean(existing.activeReviewAssignment);
        if (isReassignment && (!command.reassignmentReason || command.reassignmentReason.trim().length < 5)) {
          throw new ProposalDomainError('REASON_REQUIRED', 'Reatribuição exige motivo explícito.');
        }
        const nowIso = clock.now().toISOString();
        const currentAssignments = ProposalApplicationService
          .getOrgAssignmentsStore(ctx.organizationId).get(command.proposalId) ?? [];
        const closedAssignments = currentAssignments.map((assignment) =>
          assignment.status === 'active'
            ? {
                ...assignment,
                status: 'reassigned' as const,
                completedAt: nowIso,
                reassignmentReason: command.reassignmentReason?.trim(),
                updatedAt: nowIso,
              }
            : assignment
        );
        const newAssignment: ProposalReviewAssignment = {
          id: this.idGenerator.next('assign'),
          organizationId: ctx.organizationId,
          proposalId: command.proposalId,
          reviewerUserId: command.reviewerUserId,
          reviewerName: reviewerMember.name,
          status: 'active',
          assignedByUserId: ctx.actor.userId,
          assignedAt: nowIso,
          reassignmentReason: isReassignment ? command.reassignmentReason?.trim() : undefined,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        const updatedProposal: Proposal = {
          ...existing,
          activeReviewAssignment: newAssignment,
          updatedAt: nowIso,
          version: existing.version + 1,
        };
        const artifacts = await this.buildHistoryAndSnapshot(
          updatedProposal, existing.status, existing.status, ctx.actor.userId, undefined,
          isReassignment ? 'REVIEW_REASSIGNED' : 'REVIEW_ASSIGNED', undefined, clock
        );
        const notification: Omit<ProposalNotification, 'read'> = {
          id: this.idGenerator.next('notif'),
          organizationId: ctx.organizationId,
          recipientUserId: command.reviewerUserId,
          proposalId: command.proposalId,
          proposalNumber: existing.proposalNumber,
          type: isReassignment ? 'proposal.review.reassigned' : 'proposal.review.assigned',
          title: isReassignment ? 'Revisão redistribuída' : 'Nova revisão atribuída',
          message: 'Uma proposta foi atribuída para sua revisão.',
          createdAt: nowIso,
        };
        this.commitTransition(
          existing, updatedProposal, artifacts.historyEntry, artifacts.snapshotEntry,
          isReassignment ? 'proposal.review.reassigned' : 'proposal.review.assigned',
          ctx.actor.userId, { reviewerUserId: command.reviewerUserId }, clock,
          [notification], [...closedAssignments, newAssignment]
        );
        return this.clone(updatedProposal);
      } finally {
        release();
      }
    });
  }

  // --- 5. INÍCIO DA REVISÃO TÉCNICA (submitted -> under_review) ---
  public async startProposalReview(
    command: StartProposalReviewCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:review');
    return this.runIdempotentMutation('start-review', command.proposalId, command.idempotencyKey, command, ctx, async () => {
      const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
      try {
        const existing = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
        if (!existing) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
        this.validateCommandMetadata(existing, command);
        if (!canTransitionProposalStatus(existing.status, 'under_review')) {
          throw new ProposalDomainError('OPERATION_NOT_ALLOWED', 'A proposta não está disponível para iniciar revisão.');
        }
        if (
          ctx.actor.role !== 'project_designer' ||
          existing.activeReviewAssignment?.reviewerUserId !== ctx.actor.userId
        ) {
          throw new ProposalDomainError('REVIEWER_MISMATCH', 'Somente o revisor atribuído pode iniciar a revisão.');
        }
        const nowIso = clock.now().toISOString();
        const updatedProposal: Proposal = {
          ...existing,
          status: 'under_review',
          updatedAt: nowIso,
          version: existing.version + 1,
        };
        const artifacts = await this.buildHistoryAndSnapshot(
          updatedProposal, existing.status, 'under_review', ctx.actor.userId, undefined,
          'REVIEW_STARTED', undefined, clock
        );
        this.commitTransition(
          existing, updatedProposal, artifacts.historyEntry, artifacts.snapshotEntry,
          'proposal.review.started', ctx.actor.userId, {}, clock
        );
        return this.clone(updatedProposal);
      } finally {
        release();
      }
    });
  }

  // --- 6. SOLICITAÇÃO DE AJUSTES (under_review -> changes_requested) ---
  public async requestProposalChanges(
    command: RequestProposalChangesCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:review');
    if (!command.reasons || command.reasons.trim().length < 5) {
      throw new ProposalDomainError('REASON_REQUIRED', 'É obrigatório descrever detalhadamente os apontamentos e ajustes necessários.');
    }
    return this.runIdempotentMutation('request-changes', command.proposalId, command.idempotencyKey, command, ctx, async () => {
      const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
      try {
        const existing = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
        if (!existing) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
        this.validateCommandMetadata(existing, command);
        if (
          ctx.actor.role !== 'project_designer' ||
          existing.activeReviewAssignment?.reviewerUserId !== ctx.actor.userId
        ) {
          throw new ProposalDomainError('REVIEWER_MISMATCH', 'Somente o revisor atribuído pode solicitar ajustes.');
        }
        if (!canTransitionProposalStatus(existing.status, 'changes_requested')) {
          throw new ProposalDomainError('OPERATION_NOT_ALLOWED', 'A proposta não está em revisão.');
        }
        const nowIso = clock.now().toISOString();
        const updatedProposal: Proposal = {
          ...existing,
          status: 'changes_requested',
          reviewNotes: [
            ...(existing.reviewNotes ?? []),
            {
              id: this.idGenerator.next('review-note'),
              authorUserId: ctx.actor.userId,
              createdAt: nowIso,
              reasons: command.reasons.trim(),
            },
          ],
          updatedAt: nowIso,
          version: existing.version + 1,
        };
        const artifacts = await this.buildHistoryAndSnapshot(
          updatedProposal, existing.status, 'changes_requested', ctx.actor.userId, undefined,
          'CHANGES_REQUESTED', 'protected', clock
        );
        const notification: Omit<ProposalNotification, 'read'> = {
          id: this.idGenerator.next('notif'),
          organizationId: ctx.organizationId,
          recipientUserId: existing.capturerUserId,
          proposalId: command.proposalId,
          proposalNumber: existing.proposalNumber,
          type: 'proposal.changes_requested',
          title: 'Atualização na proposta',
          message: 'A proposta possui uma atualização que requer sua atenção.',
          createdAt: nowIso,
        };
        this.commitTransition(
          existing, updatedProposal, artifacts.historyEntry, artifacts.snapshotEntry,
          'proposal.changes_requested', ctx.actor.userId, { reasonCode: 'CHANGES_REQUESTED' },
          clock, [notification]
        );
        return this.clone(updatedProposal);
      } finally {
        release();
      }
    });
  }

  // --- 7. APROVAÇÃO DE PROPOSTA (under_review -> approved) COM ANTI-SELF-APPROVAL ---
  public async approveProposal(
    command: ApproveProposalCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:approve');
    if (!['owner', 'company_admin', 'manager'].includes(ctx.actor.role)) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Aprovação exige papel administrativo elegível.');
    }
    return this.runIdempotentMutation('approve', command.proposalId, command.idempotencyKey, command, ctx, async () => {
      const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
      try {
        const existing = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
        if (!existing) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
        this.validateCommandMetadata(existing, command);
        const incompatibleActors = new Set([
          existing.createdByUserId,
          existing.capturerUserId,
          existing.submittedByUserId ?? '',
          existing.activeReviewAssignment?.reviewerUserId ?? '',
        ]);
        if (incompatibleActors.has(ctx.actor.userId)) {
          throw new ProposalDomainError('SELF_APPROVAL_FORBIDDEN', 'Segregação de funções impede esta aprovação.');
        }
        if (!canTransitionProposalStatus(existing.status, 'approved')) {
          throw new ProposalDomainError('OPERATION_NOT_ALLOWED', 'A proposta não está apta para aprovação.');
        }
        const nowIso = clock.now().toISOString();
        const updatedProposal: Proposal = {
          ...existing,
          status: 'approved',
          approvedAt: nowIso,
          approvedByUserId: ctx.actor.userId,
          approvalNotes: command.notes?.trim() || undefined,
          updatedAt: nowIso,
          version: existing.version + 1,
        };
        const artifacts = await this.buildHistoryAndSnapshot(
          updatedProposal, existing.status, 'approved', ctx.actor.userId, undefined,
          'APPROVED', command.notes ? 'protected' : undefined, clock
        );
        const notification: Omit<ProposalNotification, 'read'> = {
          id: this.idGenerator.next('notif'), organizationId: ctx.organizationId,
          recipientUserId: existing.capturerUserId, proposalId: command.proposalId,
          proposalNumber: existing.proposalNumber, type: 'proposal.approved',
          title: 'Atualização na proposta',
          message: 'A proposta possui uma atualização que requer sua atenção.', createdAt: nowIso,
        };
        this.commitTransition(
          existing, updatedProposal, artifacts.historyEntry, artifacts.snapshotEntry,
          'proposal.approved', ctx.actor.userId, { reasonCode: 'APPROVED' }, clock, [notification]
        );
        return this.clone(updatedProposal);
      } finally {
        release();
      }
    });
  }

  // --- 8. REJEIÇÃO NA ANÁLISE TÉCNICA (under_review -> rejected) ---
  public async rejectProposal(
    command: RejectProposalCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:review');
    if (!command.reason || command.reason.trim().length < 5) {
      throw new ProposalDomainError('REASON_REQUIRED', 'É obrigatório informar a justificativa técnica/comercial de indeferimento.');
    }
    return this.runIdempotentMutation('reject', command.proposalId, command.idempotencyKey, command, ctx, async () => {
      const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
      try {
        const existing = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
        if (!existing) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
        this.validateCommandMetadata(existing, command);
        if (
          ctx.actor.role !== 'project_designer' ||
          existing.activeReviewAssignment?.reviewerUserId !== ctx.actor.userId
        ) {
          throw new ProposalDomainError('REVIEWER_MISMATCH', 'Somente o revisor atribuído pode rejeitar tecnicamente.');
        }
        if (!canTransitionProposalStatus(existing.status, 'rejected')) {
          throw new ProposalDomainError('OPERATION_NOT_ALLOWED', 'A proposta não está em revisão.');
        }
        const nowIso = clock.now().toISOString();
        const updatedProposal: Proposal = {
          ...existing,
          status: 'rejected', rejectedAt: nowIso, rejectedByUserId: ctx.actor.userId,
          reviewNotes: [
            ...(existing.reviewNotes ?? []),
            { id: this.idGenerator.next('review-note'), authorUserId: ctx.actor.userId,
              createdAt: nowIso, reasons: command.reason.trim() },
          ],
          updatedAt: nowIso, version: existing.version + 1,
        };
        const artifacts = await this.buildHistoryAndSnapshot(
          updatedProposal, existing.status, 'rejected', ctx.actor.userId, undefined,
          'REJECTED', 'protected', clock
        );
        const notification: Omit<ProposalNotification, 'read'> = {
          id: this.idGenerator.next('notif'), organizationId: ctx.organizationId,
          recipientUserId: existing.capturerUserId, proposalId: command.proposalId,
          proposalNumber: existing.proposalNumber, type: 'proposal.rejected',
          title: 'Atualização na proposta', message: 'A proposta possui uma atualização que requer sua atenção.',
          createdAt: nowIso,
        };
        this.commitTransition(
          existing, updatedProposal, artifacts.historyEntry, artifacts.snapshotEntry,
          'proposal.rejected', ctx.actor.userId, { reasonCode: 'REJECTED' }, clock, [notification]
        );
        return this.clone(updatedProposal);
      } finally {
        release();
      }
    });
  }

  // --- 9. REGISTRO DE APRESENTAÇÃO AO CLIENTE (approved -> presented) ---
  public async markProposalPresented(
    command: PresentProposalCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:present');
    const validChannels = ['email', 'phone', 'in_person', 'messaging', 'other'];
    if (!command.channel || !validChannels.includes(command.channel)) {
      throw new ProposalDomainError('INVALID_CHANNEL', 'Canal de apresentação inválido ou não informado.');
    }
    return this.runIdempotentMutation('present', command.proposalId, command.idempotencyKey, command, ctx, async () => {
      const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
      try {
        const existing = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
        if (!existing) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
        this.validateCommandMetadata(existing, command);
        if (ctx.actor.role === 'capturer' && existing.capturerUserId !== ctx.actor.userId) {
          throw new ProposalDomainError('PERMISSION_DENIED', 'Captador não relacionado à proposta.');
        }
        if (!canTransitionProposalStatus(existing.status, 'presented')) {
          throw new ProposalDomainError('NOT_APPROVED', 'Apenas propostas aprovadas podem ser apresentadas.');
        }
        const now = clock.now();
        const validFrom = now.toISOString();
        const expiresAt = new Date(now.getTime() + existing.validityDays * 86_400_000).toISOString();
        const presentationRecord: ProposalPresentationRecord = {
          presentedAt: validFrom, presentedByUserId: ctx.actor.userId,
          channel: command.channel, presentedVersionNumber: existing.version + 1,
          notes: command.notes?.trim() || undefined,
          documentReference: command.documentReference?.trim() || undefined,
        };
        const updatedProposal: Proposal = {
          ...existing, status: 'presented', validFrom, expiresAt, presentationRecord,
          updatedAt: validFrom, version: existing.version + 1,
        };
        const artifacts = await this.buildHistoryAndSnapshot(
          updatedProposal, existing.status, 'presented', ctx.actor.userId, undefined,
          'PRESENTED', command.notes ? 'protected' : undefined, clock
        );
        this.commitTransition(
          existing, updatedProposal, artifacts.historyEntry, artifacts.snapshotEntry,
          'proposal.presented', ctx.actor.userId, { channel: command.channel }, clock
        );
        return this.clone(updatedProposal);
      } finally {
        release();
      }
    });
  }

  // --- 10. REGISTRO DE DECISÃO DO CLIENTE (presented -> accepted | declined) ---
  public async recordProposalDecision(
    command: RecordProposalDecisionCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:record_decision');
    if (command.decision !== 'accepted' && command.decision !== 'declined') {
      throw new ProposalDomainError('INVALID_DECISION', 'Decisão operacional inválida.');
    }
    const validChannels = ['email', 'phone', 'in_person', 'messaging', 'other'];
    if (!command.channel || !validChannels.includes(command.channel)) {
      throw new ProposalDomainError('INVALID_CHANNEL', 'Canal de manifestação de decisão inválido.');
    }
    return this.runIdempotentMutation('decision', command.proposalId, command.idempotencyKey, command, ctx, async () => {
      const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
      try {
        const existing = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
        if (!existing) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
        this.validateCommandMetadata(existing, command);
        if (ctx.actor.role === 'capturer' && existing.capturerUserId !== ctx.actor.userId) {
          throw new ProposalDomainError('PERMISSION_DENIED', 'Captador não relacionado à proposta.');
        }
        if (existing.status !== 'presented') {
          throw new ProposalDomainError('NOT_PRESENTED', 'A proposta não está apresentada ou já possui decisão.');
        }
        const now = clock.now();
        if (now.getTime() >= new Date(existing.expiresAt).getTime()) {
          const expiredProposal: Proposal = {
            ...existing, status: 'expired', updatedAt: now.toISOString(), version: existing.version + 1,
          };
          const artifacts = await this.buildHistoryAndSnapshot(
            expiredProposal, 'presented', 'expired', 'system', undefined,
            'EXPIRED_AT_DECISION_BOUNDARY', undefined, clock
          );
          this.commitTransition(
            existing, expiredProposal, artifacts.historyEntry, artifacts.snapshotEntry,
            'proposal.expired', 'system', { reasonCode: 'EXPIRED' }, clock
          );
          throw new ProposalDomainError('PROPOSAL_EXPIRED', 'O prazo operacional da proposta expirou.');
        }
        const targetStatus: ProposalStatus = command.decision;
        const nowIso = now.toISOString();
        const decisionRecord: ProposalDecisionRecord = {
          decision: command.decision, decidedAt: nowIso, recordedByUserId: ctx.actor.userId,
          channel: command.channel, versionNumber: existing.version + 1,
          operationalReference: command.operationalReference?.trim() || undefined,
          notes: command.notes?.trim() || undefined,
          disclaimerText: 'Registro operacional interno informado pelo usuário responsável. Não constitui assinatura eletrônica, aceite contratual autenticado ou prova externa de manifestação do cliente.',
        };
        const updatedProposal: Proposal = {
          ...existing, status: targetStatus, decisionRecord, updatedAt: nowIso,
          version: existing.version + 1,
        };
        const artifacts = await this.buildHistoryAndSnapshot(
          updatedProposal, existing.status, targetStatus, ctx.actor.userId, undefined,
          targetStatus === 'accepted' ? 'DECISION_ACCEPTED_RECORDED' : 'DECISION_DECLINED_RECORDED',
          command.notes ? 'protected' : undefined, clock
        );
        const eventType: ProposalEventType = targetStatus === 'accepted' ? 'proposal.accepted' : 'proposal.declined';
        this.commitTransition(
          existing, updatedProposal, artifacts.historyEntry, artifacts.snapshotEntry,
          eventType, ctx.actor.userId, { decision: command.decision, channel: command.channel }, clock
        );
        return this.clone(updatedProposal);
      } finally {
        release();
      }
    });
  }

  // --- 11. VARREDURA DETERMINÍSTICA DE EXPIRAÇÃO DE PROPOSTAS APRESENTADAS ---
  public async expireDueProposals(
    ctx: ProposalSystemContext,
    clock: Clock = SystemClock
  ): Promise<number> {
    if (!ctx.organizationId || ctx.systemActor !== 'proposal-expiration-scheduler') {
      throw new ProposalDomainError('SYSTEM_CONTEXT_REQUIRED', 'Expiração exige contexto interno autenticado.');
    }
    const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
    const nowTime = clock.now().getTime();
    let expiredCount = 0;

    for (const proposal of Array.from(orgStore.values())) {
      if (proposal.organizationId === ctx.organizationId && proposal.status === 'presented') {
        const expiresTime = new Date(proposal.expiresAt).getTime();
        if (nowTime >= expiresTime) {
          const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${proposal.id}`);
          try {
            const current = orgStore.get(proposal.id);
            if (!current || current.status !== 'presented' || nowTime < new Date(current.expiresAt).getTime()) {
              continue;
            }
            const expiredProposal: Proposal = {
              ...current, status: 'expired', updatedAt: clock.now().toISOString(), version: current.version + 1,
            };
            const artifacts = await this.buildHistoryAndSnapshot(
              expiredProposal, 'presented', 'expired', 'system', undefined,
              'EXPIRED_BY_SCHEDULER', undefined, clock
            );
            this.commitTransition(
              current, expiredProposal, artifacts.historyEntry, artifacts.snapshotEntry,
              'proposal.expired', 'system', { reasonCode: 'EXPIRED' }, clock
            );
            expiredCount++;
          } finally {
            release();
          }
        }
      }
    }

    return expiredCount;
  }

  // --- 12. CANCELAMENTO DE PROPOSTA ---
  public async cancelProposal(
    command: CancelProposalCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:cancel');
    return this.runIdempotentMutation('cancel', command.proposalId, command.idempotencyKey, command, ctx, async () => {
      const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
      try {
        const existing = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
        if (!existing) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
        this.validateCommandMetadata(existing, command);
        if (ctx.actor.role === 'capturer' && existing.capturerUserId !== ctx.actor.userId) {
          throw new ProposalDomainError('PERMISSION_DENIED', 'Captador não relacionado à proposta.');
        }
        if (ctx.actor.role === 'project_designer' && existing.createdByUserId !== ctx.actor.userId) {
          throw new ProposalDomainError('PERMISSION_DENIED', 'Projetista não é autor desta proposta.');
        }
        if (isTerminalProposalStatus(existing.status)) {
          throw new ProposalDomainError('CANNOT_CANCEL_TERMINAL', 'Estado terminal não pode ser cancelado.');
        }
        if (existing.status !== 'draft' && (!command.reason || command.reason.trim().length < 3)) {
          throw new ProposalDomainError('REASON_REQUIRED', 'Cancelamento fora de rascunho exige motivo.');
        }
        const nowIso = clock.now().toISOString();
        const updatedProposal: Proposal = {
          ...existing, status: 'cancelled', cancellationReason: command.reason?.trim() || undefined,
          updatedAt: nowIso, version: existing.version + 1,
        };
        const artifacts = await this.buildHistoryAndSnapshot(
          updatedProposal, existing.status, 'cancelled', ctx.actor.userId, undefined,
          'CANCELLED', command.reason ? 'protected' : undefined, clock
        );
        this.commitTransition(
          existing, updatedProposal, artifacts.historyEntry, artifacts.snapshotEntry,
          'proposal.cancelled', ctx.actor.userId, { reasonCode: 'CANCELLED' }, clock
        );
        return this.clone(updatedProposal);
      } finally {
        release();
      }
    });
  }

  // --- CONSULTAS ---
  public async getProposalById(proposalId: ProposalId, ctx: ProposalAppContext): Promise<Proposal | null> {
    this.validateContext(ctx);
    const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
    const proposal = orgStore.get(proposalId);
    if (!proposal || proposal.organizationId !== ctx.organizationId) {
      throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
    }

    this.checkReadAccess(proposal, ctx);
    return this.clone(proposal);
  }

  public async getProposalHistory(
    proposalId: ProposalId,
    ctx: ProposalAppContext
  ): Promise<readonly ProposalStatusHistoryEntry[]> {
    this.validateContext(ctx);
    const proposal = await this.getProposalById(proposalId, ctx);
    if (!proposal) return [];

    const historyMap = ProposalApplicationService.getOrgHistoryStore(ctx.organizationId);
    const list = historyMap.get(proposalId) || [];
    return this.clone(list).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public async getProposalSnapshots(
    proposalId: ProposalId,
    ctx: ProposalAppContext
  ): Promise<readonly ProposalVersionSnapshot[]> {
    this.validateContext(ctx);
    const proposal = await this.getProposalById(proposalId, ctx);
    if (!proposal) return [];

    const snapshotsMap = ProposalApplicationService.getOrgSnapshotsStore(ctx.organizationId);
    const list = snapshotsMap.get(proposalId) || [];
    return this.clone(list).sort((a, b) => a.versionNumber - b.versionNumber);
  }

  public async getProposalReviewAssignments(
    proposalId: ProposalId,
    ctx: ProposalAppContext
  ): Promise<readonly ProposalReviewAssignment[]> {
    this.validateContext(ctx);
    const proposal = await this.getProposalById(proposalId, ctx);
    if (!proposal) return [];

    const assignmentsMap = ProposalApplicationService.getOrgAssignmentsStore(ctx.organizationId);
    const list = assignmentsMap.get(proposalId) || [];
    return this.clone(list).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // --- LISTAGEM PAGINADA ---
  public async listProposals(
    filters: ProposalFilterOptions = {},
    ctx: ProposalAppContext,
    signal?: AbortSignal
  ): Promise<PaginatedProposalsResult> {
    if (signal?.aborted) {
      throw new Error('Operação cancelada pelo usuário.');
    }
    this.validateContext(ctx);

    if (!this.hasPermission(ctx, 'proposals:view_financials')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Visualização financeira não autorizada.');
    }

    const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
    let items = Array.from(orgStore.values()).filter((p) => p.organizationId === ctx.organizationId);

    if (ctx.actor.role === 'capturer') {
      this.requirePermission(ctx, 'proposals:view_related');
      items = items.filter((p) => p.capturerUserId === ctx.actor.userId);
    } else if (ctx.actor.role === 'project_designer') {
      this.requirePermission(ctx, 'proposals:view_assigned');
      items = items.filter((p) => p.activeReviewAssignment?.reviewerUserId === ctx.actor.userId);
    } else {
      this.requirePermission(ctx, 'proposals:view');
    }

    if (filters.search && filters.search.trim() !== '') {
      const q = filters.search.trim().toLowerCase();
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.proposalNumber.toLowerCase().includes(q) ||
          p.clientSnapshot.name.toLowerCase().includes(q) ||
          p.clientSnapshot.documentNumber.includes(q) ||
          (p.propertySnapshot && p.propertySnapshot.name.toLowerCase().includes(q))
      );
    }

    if (filters.status) {
      items = items.filter((p) => p.status === filters.status);
    }

    if (filters.type) {
      items = items.filter((p) => p.proposalType === filters.type);
    }

    if (filters.category) {
      items = items.filter((p) => p.category === filters.category);
    }

    if (filters.clientId) {
      items = items.filter((p) => p.clientId === filters.clientId);
    }

    if (filters.propertyId) {
      items = items.filter((p) => p.propertyId === filters.propertyId);
    }

    if (filters.capturerUserId) {
      items = items.filter((p) => p.capturerUserId === filters.capturerUserId);
    }

    if (filters.reviewerUserId) {
      items = items.filter((p) => p.activeReviewAssignment?.reviewerUserId === filters.reviewerUserId);
    }

    const sortBy = filters.sortBy || 'createdAt';
    const sortDir = filters.sortDirection || 'desc';

    items.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'updatedAt') {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (sortBy === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortBy === 'amount') {
        cmp = a.estimatedValue.amountCents - b.estimatedValue.amountCents;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.max(1, Math.min(filters.pageSize || 20, 100));
    const total = items.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = items.slice(startIndex, startIndex + pageSize);

    return {
      items: this.clone(paginatedItems),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  // --- SIMULAÇÃO FINANCEIRA ---
  public simulateCreditCalculation(
    principalCents: number,
    termMonths?: number,
    interestRateAnnualPercentage?: number,
    gracePeriodMonths?: number
  ): ProposalCalculationSummary {
    const calc = calculateProposalFinancialSummary({
      principalCents,
      financingTermMonths: termMonths,
      interestRateAnnualPercentage,
      gracePeriodMonths,
      roundingMode: 'half_even',
    });

    return {
      principalCents: calc.principalCents,
      interestRateAnnualPercentage: calc.interestRateAnnualPercentage,
      financingTermMonths: calc.financingTermMonths,
      gracePeriodMonths: calc.gracePeriodMonths,
      estimatedInterestCents: calc.estimatedInterestCents,
      totalEstimatedCents: calc.totalEstimatedCents,
      installmentsCount: calc.installmentsCount,
      installmentEstimatedCents: calc.installmentEstimatedCents,
      formattedValueBRL: calc.formattedValueBRL,
    };
  }
}
