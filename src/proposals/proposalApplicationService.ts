/**
 * MÓDULO 005 — SERVIÇO DE APLICAÇÃO DE PROPOSTAS
 * Pipeline Comercial, Revisão, Aprovação, Apresentação e Decisão (OE-005.003)
 * AgroCore
 */

import {
  CreateProposalInput,
  PaginatedProposalsResult,
  PresentProposalInput,
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
  RecordProposalDecisionInput,
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
  SystemClock,
} from './cryptoUtils';
import {
  proposalEventBus,
  ProposalEventType,
} from './proposalEventService';

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

  constructor() {
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

  private static getNextNumber(orgId: string): string {
    const current = ProposalApplicationService.counterStore.get(orgId) || 0;
    const next = current + 1;
    ProposalApplicationService.counterStore.set(orgId, next);
    const year = new Date().getFullYear();
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
    if (!ctx.actor.permissions.includes('proposals:view')) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: você não tem permissão para visualizar esta proposta.'
      );
    }

    if (ctx.actor.role === 'capturer' && proposal.capturerUserId !== ctx.actor.userId) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: captadores só podem visualizar propostas de clientes a eles vinculados.'
      );
    }
  }

  private checkEditAccess(proposal: Proposal, ctx: ProposalAppContext): void {
    const hasEdit =
      ctx.actor.permissions.includes('proposals:edit_draft') ||
      ctx.actor.permissions.includes('proposals:edit');

    if (!hasEdit) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: você não tem permissão para editar propostas.'
      );
    }

    if (ctx.actor.role === 'capturer' && proposal.capturerUserId !== ctx.actor.userId) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: captadores só podem editar propostas de clientes a eles vinculados.'
      );
    }
  }

  // --- Gravação Imutável de Histórico e Snapshots ---
  private async recordHistoryAndSnapshot(
    proposal: Proposal,
    fromStatus: ProposalStatus,
    toStatus: ProposalStatus,
    actorUserId: string,
    actorName: string | undefined,
    reason: string | undefined,
    notes: string | undefined,
    clock: Clock
  ): Promise<void> {
    const orgId = proposal.organizationId;
    const nowIso = clock.now().toISOString();
    const correlationId = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // 1. Histórico
    const historyMap = ProposalApplicationService.getOrgHistoryStore(orgId);
    if (!historyMap.has(proposal.id)) {
      historyMap.set(proposal.id, []);
    }
    const historyEntry: ProposalStatusHistoryEntry = {
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      organizationId: orgId,
      proposalId: proposal.id,
      versionNumber: proposal.version,
      fromStatus,
      toStatus,
      actorUserId,
      actorName,
      reason,
      notes,
      correlationId,
      timestamp: nowIso,
    };
    historyMap.get(proposal.id)!.push(historyEntry);

    // 2. Snapshot Imutável de Versão com SHA-256
    const snapshotsMap = ProposalApplicationService.getOrgSnapshotsStore(orgId);
    if (!snapshotsMap.has(proposal.id)) {
      snapshotsMap.set(proposal.id, []);
    }
    const canonicalJson = canonicalJsonStringify(proposal);
    const checksumSha256 = await calculateSha256(canonicalJson);

    const snapshotEntry: ProposalVersionSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      organizationId: orgId,
      proposalId: proposal.id,
      versionNumber: proposal.version,
      snapshot: JSON.parse(JSON.stringify(proposal)),
      status: toStatus,
      createdByUserId: actorUserId,
      createdAt: nowIso,
      correlationId,
      checksumSha256,
    };
    snapshotsMap.get(proposal.id)!.push(snapshotEntry);
  }

  private emitDomainEvent(
    type: ProposalEventType,
    proposal: Proposal,
    actorUserId: string,
    payload: Record<string, unknown>,
    clock: Clock
  ): void {
    const correlationId = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    proposalEventBus.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type,
      organizationId: proposal.organizationId,
      proposalId: proposal.id,
      proposalNumber: proposal.proposalNumber,
      status: proposal.status,
      versionNumber: proposal.version,
      actorUserId,
      correlationId,
      timestamp: clock.now().toISOString(),
      payload,
    });
  }

  // --- 1. CRIAÇÃO DE PROPOSTA ---
  public async createProposal(
    input: CreateProposalInput,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);

    if (!ctx.actor.permissions.includes('proposals:create')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:create" requerida para cadastrar propostas.');
    }

    if (input.idempotencyKey && input.idempotencyKey.trim() !== '') {
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
    const id: ProposalId = `prop-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const proposalNumber = ProposalApplicationService.getNextNumber(ctx.organizationId);

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

    orgStore.set(id, newProposal);
    return newProposal;
  }

  // --- 2. ATUALIZAÇÃO DE PROPOSTA ---
  public async updateProposal(
    proposalId: ProposalId,
    input: UpdateProposalInput,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);
    try {
      return await this.executeUpdateProposal(proposalId, input, ctx, clock);
    } finally {
      release();
    }
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

    if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
      throw new ProposalDomainError(
        'CONCURRENCY_CONFLICT',
        `Conflito de versão: a proposta foi modificada por outro usuário (versão atual: ${existing.version}, versão esperada: ${input.expectedVersion}).`
      );
    }

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

    orgStore.set(proposalId, updatedProposal);
    return updatedProposal;
  }

  // --- 3. SUBMISSÃO DE PROPOSTA (draft/changes_requested -> submitted) ---
  public async submitProposal(
    proposalId: ProposalId,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);

    const hasPermission =
      ctx.actor.permissions.includes('proposals:submit') ||
      ctx.actor.permissions.includes('proposals:edit');

    if (!hasPermission) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:submit" requerida para submeter proposta.');
    }

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);

    try {
      const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
      const existing = orgStore.get(proposalId);

      if (!existing) {
        throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
      }

      if (existing.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
      }

      this.checkEditAccess(existing, ctx);

      if (!canTransitionProposalStatus(existing.status, 'submitted')) {
        throw new ProposalDomainError(
          'OPERATION_NOT_ALLOWED',
          `Transição inválida: propostas no status "${existing.status}" não podem ser submetidas.`
        );
      }

      const isResubmit = existing.status === 'changes_requested';
      const nowIso = clock.now().toISOString();

      const updatedProposal: Proposal = {
        ...existing,
        status: 'submitted',
        submittedAt: nowIso,
        updatedAt: nowIso,
        version: existing.version + 1,
      };

      orgStore.set(proposalId, updatedProposal);

      const actorMember = await ctx.memberResolver(ctx.actor.userId);
      await this.recordHistoryAndSnapshot(
        updatedProposal,
        existing.status,
        'submitted',
        ctx.actor.userId,
        actorMember?.name,
        isResubmit ? 'Reenvio após adequação de apontamentos' : 'Submissão inicial para revisão técnica',
        undefined,
        clock
      );

      const eventType: ProposalEventType = isResubmit ? 'proposal.resubmitted' : 'proposal.submitted';
      this.emitDomainEvent(eventType, updatedProposal, ctx.actor.userId, { isResubmit }, clock);

      return updatedProposal;
    } finally {
      release();
    }
  }

  // --- 4. ATRIBUIÇÃO DE REVISOR TÉCNICO ---
  public async assignProposalReviewer(
    proposalId: ProposalId,
    reviewerUserId: string,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock,
    reasonIfReassignment?: string
  ): Promise<Proposal> {
    this.validateContext(ctx);

    if (!ctx.actor.permissions.includes('proposals:assign_review')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:assign_review" requerida.');
    }

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);

    try {
      const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
      const existing = orgStore.get(proposalId);

      if (!existing) {
        throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
      }

      if (existing.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
      }

      if (isTerminalProposalStatus(existing.status)) {
        throw new ProposalDomainError(
          'OPERATION_NOT_ALLOWED',
          `Não é permitido atribuir revisor a uma proposta finalizada (${existing.status}).`
        );
      }

      const reviewerMember = await ctx.memberResolver(reviewerUserId);
      if (!reviewerMember || !reviewerMember.isActive) {
        throw new ProposalDomainError('REVIEWER_MISMATCH', 'O usuário indicado para revisão não é membro ativo da organização.');
      }

      const allowedReviewerRoles: OrganizationRole[] = ['project_designer', 'manager', 'company_admin', 'owner'];
      if (!allowedReviewerRoles.includes(reviewerMember.organizationRole)) {
        throw new ProposalDomainError('REVIEWER_MISMATCH', 'O usuário indicado não possui papel técnico ou gerencial compatível.');
      }

      const nowIso = clock.now().toISOString();
      const assignmentsMap = ProposalApplicationService.getOrgAssignmentsStore(ctx.organizationId);
      if (!assignmentsMap.has(proposalId)) {
        assignmentsMap.set(proposalId, []);
      }
      const proposalAssignments = assignmentsMap.get(proposalId)!;

      const isReassignment = !!existing.activeReviewAssignment;

      // Se já houver atribuição ativa, marca como reassigned
      for (let i = 0; i < proposalAssignments.length; i++) {
        if (proposalAssignments[i].status === 'active') {
          proposalAssignments[i] = {
            ...proposalAssignments[i],
            status: 'reassigned',
            completedAt: nowIso,
            reassignmentReason: reasonIfReassignment || 'Redistribuição de carga de trabalho',
            updatedAt: nowIso,
          };
        }
      }

      const newAssignment: ProposalReviewAssignment = {
        id: `assign_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        organizationId: ctx.organizationId,
        proposalId,
        reviewerUserId,
        reviewerName: reviewerMember.name,
        reviewerEmail: reviewerMember.email,
        status: 'active',
        assignedByUserId: ctx.actor.userId,
        assignedAt: nowIso,
        reassignmentReason: isReassignment ? reasonIfReassignment : undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      proposalAssignments.push(newAssignment);

      const updatedProposal: Proposal = {
        ...existing,
        activeReviewAssignment: newAssignment,
        updatedAt: nowIso,
        version: existing.version + 1,
      };

      orgStore.set(proposalId, updatedProposal);

      // Notificação ao revisor designado
      proposalEventBus.addNotification({
        organizationId: ctx.organizationId,
        recipientUserId: reviewerUserId,
        proposalId,
        proposalNumber: existing.proposalNumber,
        type: isReassignment ? 'proposal.review.reassigned' : 'proposal.review.assigned',
        title: isReassignment ? 'Revisão Redistribuída' : 'Nova Proposta para Revisão',
        message: `Você foi designado como revisor responsável pela proposta ${existing.proposalNumber}.`,
        createdAt: nowIso,
      });

      this.emitDomainEvent(
        isReassignment ? 'proposal.review.reassigned' : 'proposal.review.assigned',
        updatedProposal,
        ctx.actor.userId,
        { reviewerUserId, reviewerName: reviewerMember.name },
        clock
      );

      return updatedProposal;
    } finally {
      release();
    }
  }

  // --- 5. INÍCIO DA REVISÃO TÉCNICA (submitted -> under_review) ---
  public async startProposalReview(
    proposalId: ProposalId,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);

    if (!ctx.actor.permissions.includes('proposals:review')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:review" requerida.');
    }

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);

    try {
      const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
      const existing = orgStore.get(proposalId);

      if (!existing) {
        throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
      }

      if (existing.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
      }

      if (!canTransitionProposalStatus(existing.status, 'under_review')) {
        throw new ProposalDomainError(
          'OPERATION_NOT_ALLOWED',
          `Não é permitido iniciar revisão de proposta no status "${existing.status}".`
        );
      }

      // Se o projetista não for o revisor atribuído e não for gestor/admin, bloqueia
      const isPrivileged = ['manager', 'company_admin', 'owner'].includes(ctx.actor.role);
      if (!isPrivileged && existing.activeReviewAssignment && existing.activeReviewAssignment.reviewerUserId !== ctx.actor.userId) {
        throw new ProposalDomainError(
          'REVIEWER_MISMATCH',
          'Esta proposta está atribuída para análise técnica de outro profissional.'
        );
      }

      const nowIso = clock.now().toISOString();

      const updatedProposal: Proposal = {
        ...existing,
        status: 'under_review',
        updatedAt: nowIso,
        version: existing.version + 1,
      };

      orgStore.set(proposalId, updatedProposal);

      const actorMember = await ctx.memberResolver(ctx.actor.userId);
      await this.recordHistoryAndSnapshot(
        updatedProposal,
        existing.status,
        'under_review',
        ctx.actor.userId,
        actorMember?.name,
        'Início formal do processo de parecer técnico',
        undefined,
        clock
      );

      this.emitDomainEvent('proposal.review.started', updatedProposal, ctx.actor.userId, {}, clock);

      return updatedProposal;
    } finally {
      release();
    }
  }

  // --- 6. SOLICITAÇÃO DE AJUSTES (under_review -> changes_requested) ---
  public async requestProposalChanges(
    proposalId: ProposalId,
    reasons: string,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);

    if (!ctx.actor.permissions.includes('proposals:review')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:review" requerida.');
    }

    if (!reasons || reasons.trim().length < 5) {
      throw new ProposalDomainError('REASON_REQUIRED', 'É obrigatório descrever detalhadamente os apontamentos e ajustes necessários.');
    }

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);

    try {
      const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
      const existing = orgStore.get(proposalId);

      if (!existing) {
        throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
      }

      if (existing.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
      }

      if (!canTransitionProposalStatus(existing.status, 'changes_requested')) {
        throw new ProposalDomainError(
          'OPERATION_NOT_ALLOWED',
          `Não é permitido solicitar alterações em proposta no status "${existing.status}".`
        );
      }

      const nowIso = clock.now().toISOString();
      const updatedNotes = `${existing.notes || ''}\n[Apontamentos do Revisor em ${new Date(nowIso).toLocaleDateString('pt-BR')}]: ${reasons.trim()}`.trim();

      const updatedProposal: Proposal = {
        ...existing,
        status: 'changes_requested',
        notes: updatedNotes,
        updatedAt: nowIso,
        version: existing.version + 1,
      };

      orgStore.set(proposalId, updatedProposal);

      const actorMember = await ctx.memberResolver(ctx.actor.userId);
      await this.recordHistoryAndSnapshot(
        updatedProposal,
        existing.status,
        'changes_requested',
        ctx.actor.userId,
        actorMember?.name,
        'Apontamentos técnicos emitidos para adequação',
        reasons.trim(),
        clock
      );

      // Notifica o captador da proposta
      proposalEventBus.addNotification({
        organizationId: ctx.organizationId,
        recipientUserId: existing.capturerUserId,
        proposalId,
        proposalNumber: existing.proposalNumber,
        type: 'proposal.changes_requested',
        title: 'Ajustes Solicitados na Proposta',
        message: `A proposta ${existing.proposalNumber} necessita de complementação: ${reasons.trim().slice(0, 100)}...`,
        createdAt: nowIso,
      });

      this.emitDomainEvent('proposal.changes_requested', updatedProposal, ctx.actor.userId, { reasons: reasons.trim() }, clock);

      return updatedProposal;
    } finally {
      release();
    }
  }

  // --- 7. APROVAÇÃO DE PROPOSTA (under_review -> approved) COM ANTI-SELF-APPROVAL ---
  public async approveProposal(
    proposalId: ProposalId,
    ctx: ProposalAppContext,
    clockOrNotes?: Clock | string,
    maybeNotes?: string
  ): Promise<Proposal> {
    const clock: Clock =
      typeof clockOrNotes === 'object' && clockOrNotes && 'now' in clockOrNotes
        ? clockOrNotes
        : SystemClock;
    const notes: string | undefined =
      typeof clockOrNotes === 'string' ? clockOrNotes : maybeNotes;

    this.validateContext(ctx);

    if (!ctx.actor.permissions.includes('proposals:approve')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:approve" requerida para aprovar propostas.');
    }

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);

    try {
      const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
      const existing = orgStore.get(proposalId);

      if (!existing) {
        throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
      }

      if (existing.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
      }

      // SEGREGAÇÃO DE FUNÇÕES: O captador da proposta não pode auto-aprovar
      if (existing.capturerUserId === ctx.actor.userId) {
        throw new ProposalDomainError(
          'SELF_APPROVAL_FORBIDDEN',
          'Segregação de funções estrita: o captador responsável pela proposta não pode aprová-la.'
        );
      }

      if (!canTransitionProposalStatus(existing.status, 'approved')) {
        throw new ProposalDomainError(
          'OPERATION_NOT_ALLOWED',
          `Não é permitido aprovar proposta no status "${existing.status}".`
        );
      }

      const nowIso = clock.now().toISOString();
      const updatedNotes = notes ? `${existing.notes || ''}\n[Parecer de Aprovação]: ${notes.trim()}`.trim() : existing.notes;

      const updatedProposal: Proposal = {
        ...existing,
        status: 'approved',
        approvedAt: nowIso,
        approvedByUserId: ctx.actor.userId,
        notes: updatedNotes,
        updatedAt: nowIso,
        version: existing.version + 1,
      };

      orgStore.set(proposalId, updatedProposal);

      const actorMember = await ctx.memberResolver(ctx.actor.userId);
      await this.recordHistoryAndSnapshot(
        updatedProposal,
        existing.status,
        'approved',
        ctx.actor.userId,
        actorMember?.name,
        'Parecer técnico e comercial favorável homologado',
        notes,
        clock
      );

      // Notifica o captador da aprovação
      proposalEventBus.addNotification({
        organizationId: ctx.organizationId,
        recipientUserId: existing.capturerUserId,
        proposalId,
        proposalNumber: existing.proposalNumber,
        type: 'proposal.approved',
        title: 'Proposta Homologada e Aprovada',
        message: `A proposta ${existing.proposalNumber} foi aprovada e está liberada para apresentação formal ao produtor.`,
        createdAt: nowIso,
      });

      this.emitDomainEvent('proposal.approved', updatedProposal, ctx.actor.userId, { notes }, clock);

      return updatedProposal;
    } finally {
      release();
    }
  }

  // --- 8. REJEIÇÃO NA ANÁLISE TÉCNICA (under_review -> rejected) ---
  public async rejectProposal(
    proposalId: ProposalId,
    reason: string,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);

    const hasPermission =
      ctx.actor.permissions.includes('proposals:review') ||
      ctx.actor.permissions.includes('proposals:approve');

    if (!hasPermission) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão requerida para rejeitar proposta.');
    }

    if (!reason || reason.trim().length < 5) {
      throw new ProposalDomainError('REASON_REQUIRED', 'É obrigatório informar a justificativa técnica/comercial de indeferimento.');
    }

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);

    try {
      const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
      const existing = orgStore.get(proposalId);

      if (!existing) {
        throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
      }

      if (existing.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
      }

      if (!canTransitionProposalStatus(existing.status, 'rejected')) {
        throw new ProposalDomainError(
          'OPERATION_NOT_ALLOWED',
          `Não é permitido rejeitar proposta no status "${existing.status}".`
        );
      }

      const nowIso = clock.now().toISOString();
      const updatedNotes = `${existing.notes || ''}\n[Indeferimento]: ${reason.trim()}`.trim();

      const updatedProposal: Proposal = {
        ...existing,
        status: 'rejected',
        rejectedAt: nowIso,
        rejectedByUserId: ctx.actor.userId,
        notes: updatedNotes,
        updatedAt: nowIso,
        version: existing.version + 1,
      };

      orgStore.set(proposalId, updatedProposal);

      const actorMember = await ctx.memberResolver(ctx.actor.userId);
      await this.recordHistoryAndSnapshot(
        updatedProposal,
        existing.status,
        'rejected',
        ctx.actor.userId,
        actorMember?.name,
        'Proposta indeferida na análise',
        reason.trim(),
        clock
      );

      // Notifica o captador da rejeição
      proposalEventBus.addNotification({
        organizationId: ctx.organizationId,
        recipientUserId: existing.capturerUserId,
        proposalId,
        proposalNumber: existing.proposalNumber,
        type: 'proposal.rejected',
        title: 'Proposta Indeferida',
        message: `A proposta ${existing.proposalNumber} foi indeferida na análise técnica/comercial: ${reason.trim().slice(0, 100)}...`,
        createdAt: nowIso,
      });

      this.emitDomainEvent('proposal.rejected', updatedProposal, ctx.actor.userId, { reason: reason.trim() }, clock);

      return updatedProposal;
    } finally {
      release();
    }
  }

  // --- 9. REGISTRO DE APRESENTAÇÃO AO CLIENTE (approved -> presented) ---
  public async markProposalPresented(
    proposalId: ProposalId,
    input: PresentProposalInput,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);

    if (!ctx.actor.permissions.includes('proposals:present')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:present" requerida.');
    }

    const validChannels = ['email', 'phone', 'in_person', 'messaging', 'other'];
    if (!input.channel || !validChannels.includes(input.channel)) {
      throw new ProposalDomainError('INVALID_CHANNEL', 'Canal de apresentação inválido ou não informado.');
    }

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);

    try {
      const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
      const existing = orgStore.get(proposalId);

      if (!existing) {
        throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
      }

      if (existing.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
      }

      this.checkEditAccess(existing, ctx);

      if (!canTransitionProposalStatus(existing.status, 'presented')) {
        throw new ProposalDomainError(
          'NOT_APPROVED',
          `Apenas propostas aprovadas podem ser apresentadas (status atual: "${existing.status}").`
        );
      }

      const now = clock.now();
      const validFrom = now.toISOString();
      const expiresAt = new Date(now.getTime() + existing.validityDays * 24 * 60 * 60 * 1000).toISOString();

      const presentationRecord: ProposalPresentationRecord = {
        presentedAt: validFrom,
        presentedByUserId: ctx.actor.userId,
        channel: input.channel,
        presentedVersionNumber: existing.version + 1,
        notes: input.notes?.trim() || undefined,
        documentReference: input.documentReference?.trim() || undefined,
      };

      const updatedProposal: Proposal = {
        ...existing,
        status: 'presented',
        validFrom,
        expiresAt,
        presentationRecord,
        updatedAt: validFrom,
        version: existing.version + 1,
      };

      orgStore.set(proposalId, updatedProposal);

      const actorMember = await ctx.memberResolver(ctx.actor.userId);
      await this.recordHistoryAndSnapshot(
        updatedProposal,
        existing.status,
        'presented',
        ctx.actor.userId,
        actorMember?.name,
        `Apresentada via ${input.channel}. Vigência iniciada até ${new Date(expiresAt).toLocaleDateString('pt-BR')}`,
        input.notes,
        clock
      );

      this.emitDomainEvent('proposal.presented', updatedProposal, ctx.actor.userId, { channel: input.channel }, clock);

      return updatedProposal;
    } finally {
      release();
    }
  }

  // --- 10. REGISTRO DE DECISÃO DO CLIENTE (presented -> accepted | declined) ---
  public async recordProposalDecision(
    proposalId: ProposalId,
    input: RecordProposalDecisionInput,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);

    if (!ctx.actor.permissions.includes('proposals:record_decision')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:record_decision" requerida.');
    }

    if (input.decision !== 'accepted' && input.decision !== 'declined') {
      throw new ProposalDomainError('INVALID_DECISION', 'Decisão deve ser formalmente "accepted" ou "declined".');
    }

    const validChannels = ['email', 'phone', 'in_person', 'messaging', 'other'];
    if (!input.channel || !validChannels.includes(input.channel)) {
      throw new ProposalDomainError('INVALID_CHANNEL', 'Canal de manifestação de decisão inválido.');
    }

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);

    try {
      const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
      const existing = orgStore.get(proposalId);

      if (!existing) {
        throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
      }

      if (existing.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
      }

      this.checkEditAccess(existing, ctx);

      if (existing.status !== 'presented') {
        throw new ProposalDomainError(
          'NOT_PRESENTED',
          `Decisão só pode ser registrada para propostas no status "presented" (status atual: "${existing.status}").`
        );
      }

      // Verificação determinística de validade temporal
      const now = clock.now();
      const expiresTime = new Date(existing.expiresAt).getTime();
      if (now.getTime() > expiresTime) {
        // Marca como expirada automaticamente
        const expiredProposal: Proposal = {
          ...existing,
          status: 'expired',
          updatedAt: now.toISOString(),
          version: existing.version + 1,
        };
        orgStore.set(proposalId, expiredProposal);
        await this.recordHistoryAndSnapshot(
          expiredProposal,
          'presented',
          'expired',
          ctx.actor.userId,
          'Sistema Temporal AgroCore',
          'Prazo de validade da proposta esgotado antes do registro de decisão',
          undefined,
          clock
        );
        this.emitDomainEvent('proposal.expired', expiredProposal, 'system', {}, clock);

        throw new ProposalDomainError(
          'PROPOSAL_EXPIRED',
          `A proposta expirou em ${new Date(existing.expiresAt).toLocaleDateString('pt-BR')} e não pode mais receber decisão.`
        );
      }

      const targetStatus: ProposalStatus = input.decision;
      const nowIso = now.toISOString();

      const decisionRecord: ProposalDecisionRecord = {
        decision: input.decision,
        decidedAt: nowIso,
        recordedByUserId: ctx.actor.userId,
        channel: input.channel,
        versionNumber: existing.version + 1,
        operationalReference: input.operationalReference?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        disclaimerText: 'Registro declaratório formal de decisão do produtor rural/cliente.',
      };

      const updatedProposal: Proposal = {
        ...existing,
        status: targetStatus,
        decisionRecord,
        updatedAt: nowIso,
        version: existing.version + 1,
      };

      orgStore.set(proposalId, updatedProposal);

      const actorMember = await ctx.memberResolver(ctx.actor.userId);
      await this.recordHistoryAndSnapshot(
        updatedProposal,
        existing.status,
        targetStatus,
        ctx.actor.userId,
        actorMember?.name,
        targetStatus === 'accepted' ? 'Proposta aceita formalmente pelo cliente' : 'Proposta declinada pelo cliente',
        input.notes,
        clock
      );

      const eventType: ProposalEventType = targetStatus === 'accepted' ? 'proposal.accepted' : 'proposal.declined';
      this.emitDomainEvent(eventType, updatedProposal, ctx.actor.userId, { decision: input.decision, channel: input.channel }, clock);

      return updatedProposal;
    } finally {
      release();
    }
  }

  // --- 11. VARREDURA DETERMINÍSTICA DE EXPIRAÇÃO DE PROPOSTAS APRESENTADAS ---
  public async expireDueProposals(
    ctx: { organizationId: string },
    clock: Clock = SystemClock
  ): Promise<number> {
    const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
    const nowTime = clock.now().getTime();
    let expiredCount = 0;

    for (const proposal of Array.from(orgStore.values())) {
      if (proposal.organizationId === ctx.organizationId && proposal.status === 'presented') {
        const expiresTime = new Date(proposal.expiresAt).getTime();
        if (nowTime >= expiresTime) {
          const expiredProposal: Proposal = {
            ...proposal,
            status: 'expired',
            updatedAt: clock.now().toISOString(),
            version: proposal.version + 1,
          };
          orgStore.set(proposal.id, expiredProposal);
          await this.recordHistoryAndSnapshot(
            expiredProposal,
            'presented',
            'expired',
            'system',
            'Sistema Temporal AgroCore',
            'Prazo de validade decorrido sem manifestação de decisão',
            undefined,
            clock
          );
          this.emitDomainEvent('proposal.expired', expiredProposal, 'system', {}, clock);
          expiredCount++;
        }
      }
    }

    return expiredCount;
  }

  // --- 12. CANCELAMENTO DE PROPOSTA ---
  public async cancelProposal(
    proposalId: ProposalId,
    ctx: ProposalAppContext,
    clockOrReason?: Clock | string,
    maybeReason?: string
  ): Promise<Proposal> {
    const clock: Clock =
      typeof clockOrReason === 'object' && clockOrReason && 'now' in clockOrReason
        ? clockOrReason
        : SystemClock;
    const reason: string | undefined =
      typeof clockOrReason === 'string' ? clockOrReason : maybeReason;

    this.validateContext(ctx);

    const hasPermission =
      ctx.actor.permissions.includes('proposals:cancel') ||
      ctx.actor.permissions.includes('proposals:edit');

    if (!hasPermission) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão requerida para cancelar proposta.');
    }

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);

    try {
      const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
      const existing = orgStore.get(proposalId);

      if (!existing) {
        throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
      }

      if (existing.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
      }

      this.checkEditAccess(existing, ctx);

      if (isTerminalProposalStatus(existing.status)) {
        throw new ProposalDomainError(
          'CANNOT_CANCEL_TERMINAL',
          `Não é permitido cancelar uma proposta no status terminal "${existing.status}".`
        );
      }

      if (existing.status !== 'draft' && (!reason || reason.trim().length < 3)) {
        throw new ProposalDomainError('REASON_REQUIRED', 'É obrigatório informar o motivo do cancelamento para propostas fora de rascunho.');
      }

      const nowIso = clock.now().toISOString();
      const updatedNotes = reason ? `${existing.notes || ''}\n[Cancelamento]: ${reason.trim()}`.trim() : existing.notes;

      const updatedProposal: Proposal = {
        ...existing,
        status: 'cancelled',
        notes: updatedNotes,
        updatedAt: nowIso,
        version: existing.version + 1,
      };

      orgStore.set(proposalId, updatedProposal);

      const actorMember = await ctx.memberResolver(ctx.actor.userId);
      await this.recordHistoryAndSnapshot(
        updatedProposal,
        existing.status,
        'cancelled',
        ctx.actor.userId,
        actorMember?.name,
        reason || 'Cancelamento operacional',
        undefined,
        clock
      );

      this.emitDomainEvent('proposal.cancelled', updatedProposal, ctx.actor.userId, { reason }, clock);

      return updatedProposal;
    } finally {
      release();
    }
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
    return proposal;
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
    return list.slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
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
    return list.slice().sort((a, b) => a.versionNumber - b.versionNumber);
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
    return list.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

    if (!ctx.actor.permissions.includes('proposals:view')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:view" requerida.');
    }

    const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
    let items = Array.from(orgStore.values()).filter((p) => p.organizationId === ctx.organizationId);

    if (ctx.actor.role === 'capturer') {
      items = items.filter((p) => p.capturerUserId === ctx.actor.userId);
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
      items: paginatedItems,
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
