/**
 * MÓDULO 005 — SERVIÇO DE APLICAÇÃO DE PROPOSTAS
 * Pipeline, documento comercial e operações internas pós-aceite.
 * AgroCore
 */

import {
  AcknowledgeProposalHandoffCommand,
  CreateProposalInput,
  ApproveProposalCommand,
  AssignProposalReviewerCommand,
  CancelProposalFollowUpCommand,
  CancelProposalCommand,
  CompleteProposalFollowUpCommand,
  PaginatedProposalsResult,
  PresentProposalCommand,
  Proposal,
  ProposalCalculationSummary,
  ProposalCapturerSnapshot,
  ProposalClientSnapshot,
  ProposalCommercialDocument,
  ProposalCommercialDashboard,
  ProposalDecisionRecord,
  ProposalDomainError,
  ProposalFilterOptions,
  ProposalFollowUp,
  ProposalId,
  ProposalPresentationRecord,
  ProposalOperationalHandoff,
  ProposalOperationalHandoffDestination,
  ProposalHandoffQueue,
  ProposalHandoffReceipt,
  ProposalPropertySnapshot,
  ProposalRenewalLineage,
  ProposalRenewalLink,
  ProposalReviewAssignment,
  ProposalStatus,
  ProposalStatusHistoryEntry,
  ProposalVersionSnapshot,
  IssueProposalDocumentCommand,
  PrepareProposalHandoffCommand,
  RecordProposalDecisionCommand,
  RejectProposalCommand,
  RequestProposalChangesCommand,
  RenewProposalCommand,
  ScheduleProposalFollowUpCommand,
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
  private static documentsStore: Map<string, Map<ProposalId, ProposalCommercialDocument[]>> = new Map();
  private static followUpsStore: Map<string, Map<ProposalId, ProposalFollowUp[]>> = new Map();
  private static handoffsStore: Map<string, Map<ProposalId, ProposalOperationalHandoff>> = new Map();
  private static handoffReceiptsStore: Map<string, Map<ProposalId, ProposalHandoffReceipt>> = new Map();
  private static renewalLinksStore: Map<string, Map<ProposalId, ProposalRenewalLink>> = new Map();
  private static counterStore: Map<string, number> = new Map();
  private static documentCounterStore: Map<string, number> = new Map();
  private static idempotencyStore: Map<string, { payloadHash: string; proposal: Proposal }> = new Map();
  private static documentIdempotencyStore: Map<string, { payloadHash: string; document: ProposalCommercialDocument }> = new Map();
  private static followUpIdempotencyStore: Map<string, { payloadHash: string; followUp: ProposalFollowUp }> = new Map();
  private static handoffIdempotencyStore: Map<string, { payloadHash: string; handoff: ProposalOperationalHandoff }> = new Map();
  private static handoffReceiptIdempotencyStore: Map<string, { payloadHash: string; receipt: ProposalHandoffReceipt }> = new Map();
  private static inFlightOperations: Map<string, { payloadHash: string; promise: Promise<Proposal> }> = new Map();
  private static inFlightDocumentOperations: Map<string, { payloadHash: string; promise: Promise<ProposalCommercialDocument> }> = new Map();
  private static inFlightFollowUpOperations: Map<string, { payloadHash: string; promise: Promise<ProposalFollowUp> }> = new Map();
  private static inFlightHandoffOperations: Map<string, { payloadHash: string; promise: Promise<ProposalOperationalHandoff> }> = new Map();
  private static inFlightHandoffReceiptOperations: Map<string, { payloadHash: string; promise: Promise<ProposalHandoffReceipt> }> = new Map();
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

  private static getOrgDocumentsStore(orgId: string): Map<ProposalId, ProposalCommercialDocument[]> {
    if (!ProposalApplicationService.documentsStore.has(orgId)) {
      ProposalApplicationService.documentsStore.set(orgId, new Map());
    }
    return ProposalApplicationService.documentsStore.get(orgId)!;
  }

  private static getOrgFollowUpsStore(orgId: string): Map<ProposalId, ProposalFollowUp[]> {
    if (!ProposalApplicationService.followUpsStore.has(orgId)) {
      ProposalApplicationService.followUpsStore.set(orgId, new Map());
    }
    return ProposalApplicationService.followUpsStore.get(orgId)!;
  }

  private static getOrgHandoffsStore(orgId: string): Map<ProposalId, ProposalOperationalHandoff> {
    if (!ProposalApplicationService.handoffsStore.has(orgId)) {
      ProposalApplicationService.handoffsStore.set(orgId, new Map());
    }
    return ProposalApplicationService.handoffsStore.get(orgId)!;
  }

  private static getOrgHandoffReceiptsStore(orgId: string): Map<ProposalId, ProposalHandoffReceipt> {
    if (!ProposalApplicationService.handoffReceiptsStore.has(orgId)) {
      ProposalApplicationService.handoffReceiptsStore.set(orgId, new Map());
    }
    return ProposalApplicationService.handoffReceiptsStore.get(orgId)!;
  }

  private static getOrgRenewalLinksStore(orgId: string): Map<ProposalId, ProposalRenewalLink> {
    if (!ProposalApplicationService.renewalLinksStore.has(orgId)) {
      ProposalApplicationService.renewalLinksStore.set(orgId, new Map());
    }
    return ProposalApplicationService.renewalLinksStore.get(orgId)!;
  }

  private static getNextNumber(orgId: string, clock: Clock): string {
    const current = ProposalApplicationService.counterStore.get(orgId) || 0;
    const next = current + 1;
    ProposalApplicationService.counterStore.set(orgId, next);
    const year = clock.now().getUTCFullYear();
    return `PROP-${year}-${next.toString().padStart(4, '0')}`;
  }

  private static getNextDocumentNumber(orgId: string, clock: Clock): string {
    const current = ProposalApplicationService.documentCounterStore.get(orgId) || 0;
    const next = current + 1;
    ProposalApplicationService.documentCounterStore.set(orgId, next);
    return `DOC-PROP-${clock.now().getUTCFullYear()}-${next.toString().padStart(4, '0')}`;
  }

  public static clearAll(): void {
    ProposalApplicationService.proposalsStore.clear();
    ProposalApplicationService.historyStore.clear();
    ProposalApplicationService.snapshotsStore.clear();
    ProposalApplicationService.assignmentsStore.clear();
    ProposalApplicationService.documentsStore.clear();
    ProposalApplicationService.followUpsStore.clear();
    ProposalApplicationService.handoffsStore.clear();
    ProposalApplicationService.handoffReceiptsStore.clear();
    ProposalApplicationService.renewalLinksStore.clear();
    ProposalApplicationService.counterStore.clear();
    ProposalApplicationService.documentCounterStore.clear();
    ProposalApplicationService.idempotencyStore.clear();
    ProposalApplicationService.documentIdempotencyStore.clear();
    ProposalApplicationService.followUpIdempotencyStore.clear();
    ProposalApplicationService.handoffIdempotencyStore.clear();
    ProposalApplicationService.handoffReceiptIdempotencyStore.clear();
    ProposalApplicationService.inFlightOperations.clear();
    ProposalApplicationService.inFlightDocumentOperations.clear();
    ProposalApplicationService.inFlightFollowUpOperations.clear();
    ProposalApplicationService.inFlightHandoffOperations.clear();
    ProposalApplicationService.inFlightHandoffReceiptOperations.clear();
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

  private async runIdempotentDocumentMutation(
    operation: string,
    proposalId: ProposalId,
    idempotencyKey: string,
    payload: unknown,
    ctx: ProposalAppContext,
    execute: () => Promise<ProposalCommercialDocument>
  ): Promise<ProposalCommercialDocument> {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave de idempotência inválida.');
    }
    const compositeKey = `${ctx.organizationId}:${proposalId}:${operation}:${idempotencyKey.trim()}`;
    const payloadHash = canonicalJsonStringify(payload);
    const completed = ProposalApplicationService.documentIdempotencyStore.get(compositeKey);
    if (completed) {
      if (completed.payloadHash !== payloadHash) {
        throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave reutilizada com conteúdo divergente.');
      }
      return this.clone(completed.document);
    }
    const inFlight = ProposalApplicationService.inFlightDocumentOperations.get(compositeKey);
    if (inFlight) {
      if (inFlight.payloadHash !== payloadHash) {
        throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave concorrente com conteúdo divergente.');
      }
      return this.clone(await inFlight.promise);
    }
    const promise = execute();
    ProposalApplicationService.inFlightDocumentOperations.set(compositeKey, { payloadHash, promise });
    try {
      const document = await promise;
      ProposalApplicationService.documentIdempotencyStore.set(compositeKey, {
        payloadHash,
        document: this.clone(document),
      });
      return this.clone(document);
    } finally {
      ProposalApplicationService.inFlightDocumentOperations.delete(compositeKey);
    }
  }

  private async runIdempotentFollowUpMutation(
    operation: string,
    proposalId: ProposalId,
    idempotencyKey: string,
    payload: unknown,
    ctx: ProposalAppContext,
    execute: () => Promise<ProposalFollowUp>
  ): Promise<ProposalFollowUp> {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave de idempotência inválida.');
    }
    const compositeKey = `${ctx.organizationId}:${proposalId}:${operation}:${idempotencyKey.trim()}`;
    const payloadHash = canonicalJsonStringify(payload);
    const completed = ProposalApplicationService.followUpIdempotencyStore.get(compositeKey);
    if (completed) {
      if (completed.payloadHash !== payloadHash) {
        throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave reutilizada com conteúdo divergente.');
      }
      return this.clone(completed.followUp);
    }
    const inFlight = ProposalApplicationService.inFlightFollowUpOperations.get(compositeKey);
    if (inFlight) {
      if (inFlight.payloadHash !== payloadHash) {
        throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave concorrente com conteúdo divergente.');
      }
      return this.clone(await inFlight.promise);
    }
    const promise = execute();
    ProposalApplicationService.inFlightFollowUpOperations.set(compositeKey, { payloadHash, promise });
    try {
      const followUp = await promise;
      ProposalApplicationService.followUpIdempotencyStore.set(compositeKey, {
        payloadHash,
        followUp: this.clone(followUp),
      });
      return this.clone(followUp);
    } finally {
      ProposalApplicationService.inFlightFollowUpOperations.delete(compositeKey);
    }
  }

  private async runIdempotentHandoffMutation(
    operation: string,
    proposalId: ProposalId,
    idempotencyKey: string,
    payload: unknown,
    ctx: ProposalAppContext,
    execute: () => Promise<ProposalOperationalHandoff>
  ): Promise<ProposalOperationalHandoff> {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave de idempotência inválida.');
    }
    const compositeKey = `${ctx.organizationId}:${proposalId}:${operation}:${idempotencyKey.trim()}`;
    const payloadHash = canonicalJsonStringify(payload);
    const completed = ProposalApplicationService.handoffIdempotencyStore.get(compositeKey);
    if (completed) {
      if (completed.payloadHash !== payloadHash) {
        throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave reutilizada com conteúdo divergente.');
      }
      return this.clone(completed.handoff);
    }
    const inFlight = ProposalApplicationService.inFlightHandoffOperations.get(compositeKey);
    if (inFlight) {
      if (inFlight.payloadHash !== payloadHash) {
        throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave concorrente com conteúdo divergente.');
      }
      return this.clone(await inFlight.promise);
    }
    const promise = execute();
    ProposalApplicationService.inFlightHandoffOperations.set(compositeKey, { payloadHash, promise });
    try {
      const handoff = await promise;
      ProposalApplicationService.handoffIdempotencyStore.set(compositeKey, {
        payloadHash,
        handoff: this.clone(handoff),
      });
      return this.clone(handoff);
    } finally {
      ProposalApplicationService.inFlightHandoffOperations.delete(compositeKey);
    }
  }

  private async runIdempotentHandoffReceiptMutation(
    proposalId: ProposalId,
    idempotencyKey: string,
    payload: unknown,
    ctx: ProposalAppContext,
    execute: () => Promise<ProposalHandoffReceipt>
  ): Promise<ProposalHandoffReceipt> {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave de idempotência inválida.');
    }
    const compositeKey = `${ctx.organizationId}:${proposalId}:acknowledge-handoff:${idempotencyKey.trim()}`;
    const payloadHash = canonicalJsonStringify(payload);
    const completed = ProposalApplicationService.handoffReceiptIdempotencyStore.get(compositeKey);
    if (completed) {
      if (completed.payloadHash !== payloadHash) {
        throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave reutilizada com conteúdo divergente.');
      }
      return this.clone(completed.receipt);
    }
    const inFlight = ProposalApplicationService.inFlightHandoffReceiptOperations.get(compositeKey);
    if (inFlight) {
      if (inFlight.payloadHash !== payloadHash) {
        throw new ProposalDomainError('IDEMPOTENCY_CONFLICT', 'Chave concorrente com conteúdo divergente.');
      }
      return this.clone(await inFlight.promise);
    }
    const promise = execute();
    ProposalApplicationService.inFlightHandoffReceiptOperations.set(compositeKey, { payloadHash, promise });
    try {
      const receipt = await promise;
      ProposalApplicationService.handoffReceiptIdempotencyStore.set(compositeKey, {
        payloadHash,
        receipt: this.clone(receipt),
      });
      return this.clone(receipt);
    } finally {
      ProposalApplicationService.inFlightHandoffReceiptOperations.delete(compositeKey);
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

  private emitCommercialOperation(
    proposal: Proposal,
    type: ProposalEventType,
    actorUserId: string,
    payload: Record<string, string | number | boolean>,
    clock: Clock,
    recipientUserIds: readonly string[] = [],
    correlationIdOverride?: string
  ): void {
    const correlationId = correlationIdOverride ?? this.idGenerator.next('corr');
    proposalEventBus.emit({
      id: this.idGenerator.next('evt'),
      type,
      organizationId: proposal.organizationId,
      proposalId: proposal.id,
      proposalNumber: proposal.proposalNumber,
      status: proposal.status,
      versionNumber: proposal.version,
      actorUserId,
      correlationId,
      timestamp: clock.now().toISOString(),
      payload: this.clone(payload),
    });
    for (const recipientUserId of Array.from(new Set(recipientUserIds)).filter(Boolean)) {
      proposalEventBus.addNotification({
        id: this.idGenerator.next('notif'),
        organizationId: proposal.organizationId,
        recipientUserId,
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        type,
        title: type === 'proposal.handoff.prepared'
          ? 'Encaminhamento operacional preparado'
          : type === 'proposal.handoff.acknowledged'
            ? 'Encaminhamento recebido pela área responsável'
            : type === 'proposal.renewal.created'
              ? 'Nova proposta criada por renovação'
            : 'Acompanhamento comercial atualizado',
        message: type === 'proposal.follow_up.scheduled'
          ? `Novo acompanhamento interno agendado para a proposta ${proposal.proposalNumber}.`
          : type === 'proposal.handoff.prepared'
            ? `A proposta ${proposal.proposalNumber} possui referência operacional pós-aceite.`
            : type === 'proposal.handoff.acknowledged'
              ? `O encaminhamento da proposta ${proposal.proposalNumber} foi recebido internamente.`
              : type === 'proposal.renewal.created'
                ? `A proposta ${proposal.proposalNumber} foi criada como novo rascunho vinculado.`
            : `O acompanhamento interno da proposta ${proposal.proposalNumber} foi atualizado.`,
        createdAt: clock.now().toISOString(),
      });
    }
  }

  private closeOpenFollowUps(
    proposal: Proposal,
    actorUserId: string,
    reasonCode: NonNullable<ProposalFollowUp['cancellationReasonCode']>,
    clock: Clock
  ): void {
    const store = ProposalApplicationService.getOrgFollowUpsStore(proposal.organizationId);
    const current = store.get(proposal.id) ?? [];
    const nowIso = clock.now().toISOString();
    let changed = false;
    const next = current.map((followUp) => {
      if (followUp.status !== 'scheduled') return followUp;
      changed = true;
      const cancelled: ProposalFollowUp = {
        ...followUp,
        status: 'cancelled',
        cancelledAt: nowIso,
        cancellationReasonCode: reasonCode,
        version: followUp.version + 1,
      };
      this.emitCommercialOperation(
        proposal,
        'proposal.follow_up.cancelled',
        actorUserId,
        { followUpId: cancelled.id, reasonCode },
        clock,
        [cancelled.assignedUserId]
      );
      return cancelled;
    });
    if (changed) store.set(proposal.id, this.clone(next));
  }

  private getHandoffDestination(proposal: Proposal): ProposalOperationalHandoffDestination {
    if (proposal.proposalType === 'credit') return 'credit_operations';
    if (proposal.proposalType === 'appraisal') return 'appraisal_operations';
    return 'technical_operations';
  }

  private canOperateHandoffDestination(
    role: OrganizationRole,
    destination: ProposalOperationalHandoffDestination
  ): boolean {
    if (role === 'owner' || role === 'company_admin' || role === 'manager') return true;
    if (role === 'finance') return destination === 'credit_operations';
    if (role === 'project_designer') {
      return destination === 'appraisal_operations' || destination === 'technical_operations';
    }
    return false;
  }

  private isRenewableStatus(
    status: ProposalStatus
  ): status is ProposalRenewalLink['sourceStatus'] {
    return status === 'declined'
      || status === 'rejected'
      || status === 'expired'
      || status === 'cancelled';
  }

  private async verifyRenewalLink(link: ProposalRenewalLink): Promise<void> {
    const { checksumSha256, ...payload } = link;
    let calculatedChecksum: string;
    try {
      calculatedChecksum = await calculateSha256(canonicalJsonStringify(payload));
    } catch {
      throw new ProposalDomainError(
        'RENEWAL_INTEGRITY_FAILURE',
        'Não foi possível verificar a integridade do vínculo de renovação.'
      );
    }
    if (calculatedChecksum !== checksumSha256) {
      throw new ProposalDomainError(
        'RENEWAL_INTEGRITY_FAILURE',
        'O vínculo de renovação não possui integridade comprovada.'
      );
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

  // --- 9. EMISSÃO DO DOCUMENTO COMERCIAL IMUTÁVEL (OE-005.004) ---
  public async issueProposalDocument(
    command: IssueProposalDocumentCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<ProposalCommercialDocument> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:issue_document');
    return this.runIdempotentDocumentMutation(
      'issue-document',
      command.proposalId,
      command.idempotencyKey,
      command,
      ctx,
      async () => {
        const release = await ProposalApplicationService.acquireLock(
          `${ctx.organizationId}:${command.proposalId}`
        );
        try {
          const proposal = ProposalApplicationService
            .getOrgStore(ctx.organizationId)
            .get(command.proposalId);
          if (!proposal) {
            throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
          }
          this.validateCommandMetadata(proposal, command);
          if (ctx.actor.role === 'capturer' && proposal.capturerUserId !== ctx.actor.userId) {
            throw new ProposalDomainError('PERMISSION_DENIED', 'Captador não relacionado à proposta.');
          }
          if (proposal.status !== 'approved') {
            throw new ProposalDomainError(
              'DOCUMENT_NOT_ISSUABLE',
              'O documento comercial somente pode ser emitido para uma proposta aprovada.'
            );
          }

          const snapshots = ProposalApplicationService
            .getOrgSnapshotsStore(ctx.organizationId)
            .get(proposal.id) ?? [];
          const sourceSnapshot = snapshots.find(
            (snapshot) => snapshot.versionNumber === proposal.version && snapshot.status === 'approved'
          );
          if (!sourceSnapshot) {
            throw new ProposalDomainError(
              'DOCUMENT_VERSION_MISMATCH',
              'A versão aprovada não possui snapshot canônico disponível.'
            );
          }

          const documentsMap = ProposalApplicationService.getOrgDocumentsStore(ctx.organizationId);
          const documents = documentsMap.get(proposal.id) ?? [];
          const existingDocument = documents.find(
            (document) => document.sourceSnapshotId === sourceSnapshot.id
          );
          if (existingDocument) return this.clone(existingDocument);

          const nowIso = clock.now().toISOString();
          const documentNumber = ProposalApplicationService.getNextDocumentNumber(
            ctx.organizationId,
            clock
          );
          const content = {
            proposalNumber: proposal.proposalNumber,
            title: proposal.title,
            proposalType: proposal.proposalType,
            category: proposal.category,
            client: {
              id: proposal.clientId,
              name: proposal.clientSnapshot.name,
            },
            property: proposal.propertySnapshot
              ? {
                  id: proposal.propertySnapshot.id,
                  name: proposal.propertySnapshot.name,
                  city: proposal.propertySnapshot.city,
                  state: proposal.propertySnapshot.state,
                }
              : null,
            estimatedValue: this.clone(proposal.estimatedValue),
            calculationSummary: this.clone(proposal.calculationSummary),
            validityDays: proposal.validityDays,
            disclaimerText:
              'Documento comercial informativo gerado pelo AgroCore. Não constitui contrato, assinatura digital, aprovação de crédito ou garantia de liberação de recursos.',
          } as const;
          const checksumSha256 = await calculateSha256(canonicalJsonStringify({
            organizationId: ctx.organizationId,
            proposalId: proposal.id,
            documentNumber,
            sourceSnapshotId: sourceSnapshot.id,
            sourceVersionNumber: sourceSnapshot.versionNumber,
            sourceChecksumSha256: sourceSnapshot.checksumSha256,
            content,
            issuedByUserId: ctx.actor.userId,
            issuedAt: nowIso,
          })).catch(() => {
            throw new ProposalDomainError('HASH_UNAVAILABLE', 'Não foi possível calcular SHA-256 verdadeiro.');
          });

          const document: ProposalCommercialDocument = {
            id: this.idGenerator.next('proposal-doc'),
            organizationId: ctx.organizationId,
            proposalId: proposal.id,
            documentNumber,
            sourceSnapshotId: sourceSnapshot.id,
            sourceVersionNumber: sourceSnapshot.versionNumber,
            sourceChecksumSha256: sourceSnapshot.checksumSha256,
            content,
            issuedByUserId: ctx.actor.userId,
            issuedAt: nowIso,
            checksumSha256,
          };

          documentsMap.set(proposal.id, [...documents, this.clone(document)]);
          proposalEventBus.emit({
            id: this.idGenerator.next('evt'),
            type: 'proposal.document.issued',
            organizationId: ctx.organizationId,
            proposalId: proposal.id,
            proposalNumber: proposal.proposalNumber,
            status: proposal.status,
            versionNumber: proposal.version,
            actorUserId: ctx.actor.userId,
            correlationId: this.idGenerator.next('corr'),
            timestamp: nowIso,
            payload: {
              documentNumber,
              sourceVersionNumber: sourceSnapshot.versionNumber,
            },
          });
          proposalEventBus.addNotification({
            id: this.idGenerator.next('notif'),
            organizationId: ctx.organizationId,
            recipientUserId: proposal.capturerUserId,
            proposalId: proposal.id,
            proposalNumber: proposal.proposalNumber,
            type: 'proposal.document.issued',
            title: 'Documento comercial disponível',
            message: 'A proposta possui um documento comercial versionado disponível.',
            createdAt: nowIso,
          });
          return this.clone(document);
        } finally {
          release();
        }
      }
    );
  }

  // --- 10. REGISTRO DE APRESENTAÇÃO AO CLIENTE (approved -> presented) ---
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
        const documentId = command.documentId?.trim();
        const document = documentId
          ? (ProposalApplicationService.getOrgDocumentsStore(ctx.organizationId).get(existing.id) ?? [])
              .find((candidate) => candidate.id === documentId)
          : undefined;
        if (!document) {
          throw new ProposalDomainError(
            'DOCUMENT_NOT_FOUND',
            'Emita e selecione o documento comercial canônico antes de registrar a apresentação.'
          );
        }
        if (
          document.organizationId !== ctx.organizationId ||
          document.proposalId !== existing.id ||
          document.sourceVersionNumber !== existing.version
        ) {
          throw new ProposalDomainError(
            'DOCUMENT_VERSION_MISMATCH',
            'O documento informado não corresponde à versão aprovada atual.'
          );
        }
        const now = clock.now();
        const validFrom = now.toISOString();
        const expiresAt = new Date(now.getTime() + existing.validityDays * 86_400_000).toISOString();
        const presentationRecord: ProposalPresentationRecord = {
          presentedAt: validFrom, presentedByUserId: ctx.actor.userId,
          channel: command.channel, presentedVersionNumber: existing.version + 1,
          notes: command.notes?.trim() || undefined,
          documentReference: document.id,
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

  // --- 11. REGISTRO DE DECISÃO DO CLIENTE (presented -> accepted | declined) ---
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
          this.closeOpenFollowUps(expiredProposal, 'system', 'PROPOSAL_EXPIRED', clock);
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
        this.closeOpenFollowUps(
          updatedProposal,
          ctx.actor.userId,
          targetStatus === 'accepted' ? 'PROPOSAL_ACCEPTED' : 'PROPOSAL_DECLINED',
          clock
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
            this.closeOpenFollowUps(expiredProposal, 'system', 'PROPOSAL_EXPIRED', clock);
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
        this.closeOpenFollowUps(updatedProposal, ctx.actor.userId, 'PROPOSAL_CANCELLED', clock);
        return this.clone(updatedProposal);
      } finally {
        release();
      }
    });
  }

  // --- 13. ACOMPANHAMENTO COMERCIAL INTERNO (OE-005.005) ---
  public async scheduleProposalFollowUp(
    command: ScheduleProposalFollowUpCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<ProposalFollowUp> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:manage_follow_up');
    const validChannels = ['email', 'phone', 'in_person', 'messaging', 'other'];
    const validPurposes = ['decision_reminder', 'document_clarification', 'commercial_alignment', 'other'];
    if (!validChannels.includes(command.channel)) {
      throw new ProposalDomainError('INVALID_CHANNEL', 'Canal de acompanhamento inválido.');
    }
    if (!validPurposes.includes(command.purpose)) {
      throw new ProposalDomainError('FOLLOW_UP_NOT_ALLOWED', 'Finalidade de acompanhamento inválida.');
    }
    return this.runIdempotentFollowUpMutation(
      'schedule-follow-up', command.proposalId, command.idempotencyKey, command, ctx, async () => {
        const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
        try {
          const proposal = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
          if (!proposal) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
          this.validateCommandMetadata(proposal, command);
          this.checkReadAccess(proposal, ctx);
          if (proposal.status !== 'presented') {
            throw new ProposalDomainError(
              'FOLLOW_UP_NOT_ALLOWED',
              'Follow-up somente pode ser agendado para proposta apresentada e ainda sem decisão.'
            );
          }
          const scheduledTime = new Date(command.scheduledFor).getTime();
          const nowTime = clock.now().getTime();
          const expiresTime = new Date(proposal.expiresAt).getTime();
          if (!Number.isFinite(scheduledTime) || scheduledTime <= nowTime || scheduledTime >= expiresTime) {
            throw new ProposalDomainError(
              'FOLLOW_UP_DATE_INVALID',
              'A data deve ser futura e anterior ao vencimento da proposta.'
            );
          }
          const assignedUserId = command.assignedUserId?.trim();
          const assignedMember = assignedUserId ? await ctx.memberResolver(assignedUserId) : null;
          const allowedRoles: readonly OrganizationRole[] = ['owner', 'company_admin', 'manager', 'capturer'];
          if (!assignedMember || !assignedMember.isActive || !allowedRoles.includes(assignedMember.organizationRole)) {
            throw new ProposalDomainError('FOLLOW_UP_NOT_ALLOWED', 'Responsável comercial ativo não encontrado.');
          }
          if (ctx.actor.role === 'capturer') {
            if (proposal.capturerUserId !== ctx.actor.userId || assignedUserId !== ctx.actor.userId) {
              throw new ProposalDomainError(
                'PERMISSION_DENIED',
                'Captador somente agenda acompanhamento próprio em proposta relacionada.'
              );
            }
          }
          const followUpsStore = ProposalApplicationService.getOrgFollowUpsStore(ctx.organizationId);
          const current = followUpsStore.get(proposal.id) ?? [];
          if (current.some((followUp) => followUp.status === 'scheduled')) {
            throw new ProposalDomainError(
              'FOLLOW_UP_CONFLICT',
              'Já existe um acompanhamento ativo para esta proposta.'
            );
          }
          const nowIso = clock.now().toISOString();
          const followUp: ProposalFollowUp = {
            id: this.idGenerator.next('followup'),
            organizationId: ctx.organizationId,
            proposalId: proposal.id,
            proposalVersionNumber: proposal.version,
            assignedUserId,
            scheduledFor: new Date(scheduledTime).toISOString(),
            channel: command.channel,
            purpose: command.purpose,
            status: 'scheduled',
            notes: command.notes?.trim() || undefined,
            createdByUserId: ctx.actor.userId,
            createdAt: nowIso,
            version: 1,
          };
          followUpsStore.set(proposal.id, [...current, this.clone(followUp)]);
          this.emitCommercialOperation(
            proposal,
            'proposal.follow_up.scheduled',
            ctx.actor.userId,
            { followUpId: followUp.id, channel: followUp.channel, purpose: followUp.purpose },
            clock,
            [followUp.assignedUserId]
          );
          return this.clone(followUp);
        } finally {
          release();
        }
      }
    );
  }

  public async completeProposalFollowUp(
    command: CompleteProposalFollowUpCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<ProposalFollowUp> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:manage_follow_up');
    const validOutcomes = ['contacted', 'no_response', 'decision_recorded', 'not_applicable'];
    if (!validOutcomes.includes(command.outcome)) {
      throw new ProposalDomainError('FOLLOW_UP_NOT_ALLOWED', 'Resultado de acompanhamento inválido.');
    }
    return this.runIdempotentFollowUpMutation(
      'complete-follow-up', command.proposalId, command.idempotencyKey, command, ctx, async () => {
        const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
        try {
          const proposal = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
          if (!proposal) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
          this.checkReadAccess(proposal, ctx);
          if (proposal.status !== 'presented') {
            throw new ProposalDomainError('FOLLOW_UP_NOT_ALLOWED', 'A proposta já encerrou o acompanhamento.');
          }
          const store = ProposalApplicationService.getOrgFollowUpsStore(ctx.organizationId);
          const current = store.get(proposal.id) ?? [];
          const index = current.findIndex((followUp) => followUp.id === command.followUpId);
          const existing = index >= 0 ? current[index] : undefined;
          if (!existing) throw new ProposalDomainError('FOLLOW_UP_NOT_FOUND', 'Acompanhamento não encontrado.');
          if (existing.status !== 'scheduled' || existing.version !== command.expectedFollowUpVersion) {
            throw new ProposalDomainError('FOLLOW_UP_CONFLICT', 'Acompanhamento já alterado por outra operação.');
          }
          if (ctx.actor.role === 'capturer' && existing.assignedUserId !== ctx.actor.userId) {
            throw new ProposalDomainError('PERMISSION_DENIED', 'Acompanhamento atribuído a outro usuário.');
          }
          const completed: ProposalFollowUp = {
            ...existing,
            status: 'completed',
            outcome: command.outcome,
            notes: command.notes?.trim() || existing.notes,
            completedAt: clock.now().toISOString(),
            version: existing.version + 1,
          };
          const next = [...current];
          next[index] = this.clone(completed);
          store.set(proposal.id, next);
          this.emitCommercialOperation(
            proposal,
            'proposal.follow_up.completed',
            ctx.actor.userId,
            { followUpId: completed.id, outcome: completed.outcome ?? 'not_applicable' },
            clock,
            [completed.assignedUserId]
          );
          return this.clone(completed);
        } finally {
          release();
        }
      }
    );
  }

  public async cancelProposalFollowUp(
    command: CancelProposalFollowUpCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<ProposalFollowUp> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:manage_follow_up');
    if (!command.reason || command.reason.trim().length < 3) {
      throw new ProposalDomainError('REASON_REQUIRED', 'Cancelamento exige motivo operacional.');
    }
    return this.runIdempotentFollowUpMutation(
      'cancel-follow-up', command.proposalId, command.idempotencyKey, command, ctx, async () => {
        const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
        try {
          const proposal = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
          if (!proposal) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
          this.checkReadAccess(proposal, ctx);
          const store = ProposalApplicationService.getOrgFollowUpsStore(ctx.organizationId);
          const current = store.get(proposal.id) ?? [];
          const index = current.findIndex((followUp) => followUp.id === command.followUpId);
          const existing = index >= 0 ? current[index] : undefined;
          if (!existing) throw new ProposalDomainError('FOLLOW_UP_NOT_FOUND', 'Acompanhamento não encontrado.');
          if (existing.status !== 'scheduled' || existing.version !== command.expectedFollowUpVersion) {
            throw new ProposalDomainError('FOLLOW_UP_CONFLICT', 'Acompanhamento já alterado por outra operação.');
          }
          if (ctx.actor.role === 'capturer' && existing.assignedUserId !== ctx.actor.userId) {
            throw new ProposalDomainError('PERMISSION_DENIED', 'Acompanhamento atribuído a outro usuário.');
          }
          const cancelled: ProposalFollowUp = {
            ...existing,
            status: 'cancelled',
            cancelledAt: clock.now().toISOString(),
            cancellationReasonCode: 'MANUAL',
            notes: command.reason.trim(),
            version: existing.version + 1,
          };
          const next = [...current];
          next[index] = this.clone(cancelled);
          store.set(proposal.id, next);
          this.emitCommercialOperation(
            proposal,
            'proposal.follow_up.cancelled',
            ctx.actor.userId,
            { followUpId: cancelled.id, reasonCode: 'MANUAL' },
            clock,
            [cancelled.assignedUserId]
          );
          return this.clone(cancelled);
        } finally {
          release();
        }
      }
    );
  }

  // --- 14. ENCAMINHAMENTO OPERACIONAL PÓS-ACEITE (OE-005.005) ---
  public async prepareProposalHandoff(
    command: PrepareProposalHandoffCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<ProposalOperationalHandoff> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:prepare_handoff');
    return this.runIdempotentHandoffMutation(
      'prepare-handoff', command.proposalId, command.idempotencyKey, command, ctx, async () => {
        const release = await ProposalApplicationService.acquireLock(`${ctx.organizationId}:${command.proposalId}`);
        try {
          const proposal = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
          if (!proposal) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
          this.validateCommandMetadata(proposal, command);
          this.checkReadAccess(proposal, ctx);
          if (proposal.status !== 'accepted' || proposal.decisionRecord?.decision !== 'accepted') {
            throw new ProposalDomainError(
              'HANDOFF_NOT_AVAILABLE',
              'Encaminhamento somente pode ser preparado após aceite operacional registrado.'
            );
          }
          const existing = ProposalApplicationService.getOrgHandoffsStore(ctx.organizationId).get(proposal.id);
          if (existing) return this.clone(existing);
          const snapshot = (ProposalApplicationService.getOrgSnapshotsStore(ctx.organizationId).get(proposal.id) ?? [])
            .find((candidate) => candidate.versionNumber === proposal.version && candidate.status === 'accepted');
          const documentId = proposal.presentationRecord?.documentReference;
          const document = documentId
            ? (ProposalApplicationService.getOrgDocumentsStore(ctx.organizationId).get(proposal.id) ?? [])
                .find((candidate) => candidate.id === documentId)
            : undefined;
          const presentedVersionNumber = proposal.presentationRecord?.presentedVersionNumber;
          if (
            !snapshot
            || snapshot.snapshot.decisionRecord?.decision !== 'accepted'
            || snapshot.snapshot.presentationRecord?.documentReference !== document?.id
            || !document
            || document.organizationId !== ctx.organizationId
            || document.proposalId !== proposal.id
            || presentedVersionNumber === undefined
            || document.sourceVersionNumber !== presentedVersionNumber - 1
          ) {
            throw new ProposalDomainError(
              'HANDOFF_INTEGRITY_FAILURE',
              'Snapshot aceito ou documento comercial de origem não pôde ser comprovado.'
            );
          }
          const preparedAt = clock.now().toISOString();
          const handoffWithoutChecksum = {
            id: this.idGenerator.next('handoff'),
            organizationId: ctx.organizationId,
            proposalId: proposal.id,
            proposalNumber: proposal.proposalNumber,
            acceptedVersionNumber: proposal.version,
            acceptedSnapshotId: snapshot.id,
            acceptedSnapshotChecksumSha256: snapshot.checksumSha256,
            commercialDocumentId: document.id,
            clientId: proposal.clientId,
            propertyId: proposal.propertyId,
            destination: this.getHandoffDestination(proposal),
            preparedByUserId: ctx.actor.userId,
            preparedAt,
            disclaimerText: 'Referência operacional interna. Não cria contrato, projeto, laudo, operação de crédito, cobrança, assinatura ou obrigação financeira.',
          } as const;
          let checksumSha256: string;
          try {
            checksumSha256 = await calculateSha256(canonicalJsonStringify(handoffWithoutChecksum));
          } catch {
            throw new ProposalDomainError('HASH_UNAVAILABLE', 'Não foi possível calcular SHA-256 verdadeiro.');
          }
          const handoff: ProposalOperationalHandoff = { ...handoffWithoutChecksum, checksumSha256 };
          ProposalApplicationService.getOrgHandoffsStore(ctx.organizationId).set(proposal.id, this.clone(handoff));
          this.emitCommercialOperation(
            proposal,
            'proposal.handoff.prepared',
            ctx.actor.userId,
            { handoffId: handoff.id, destination: handoff.destination },
            clock,
            [proposal.capturerUserId]
          );
          return this.clone(handoff);
        } finally {
          release();
        }
      }
    );
  }

  public async acknowledgeProposalHandoff(
    command: AcknowledgeProposalHandoffCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<ProposalHandoffReceipt> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:acknowledge_handoff');
    return this.runIdempotentHandoffReceiptMutation(
      command.proposalId,
      command.idempotencyKey,
      command,
      ctx,
      async () => {
        const release = await ProposalApplicationService.acquireLock(
          `${ctx.organizationId}:${command.proposalId}:handoff-receipt`
        );
        try {
          const proposal = ProposalApplicationService.getOrgStore(ctx.organizationId).get(command.proposalId);
          if (!proposal) throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
          const handoff = ProposalApplicationService.getOrgHandoffsStore(ctx.organizationId).get(command.proposalId);
          if (!handoff || handoff.id !== command.handoffId) {
            throw new ProposalDomainError('HANDOFF_NOT_AVAILABLE', 'Encaminhamento não encontrado.');
          }
          if (handoff.checksumSha256 !== command.expectedHandoffChecksumSha256) {
            throw new ProposalDomainError(
              'HANDOFF_RECEIPT_CONFLICT',
              'O encaminhamento foi alterado ou a referência de integridade está desatualizada.'
            );
          }
          if (!this.canOperateHandoffDestination(ctx.actor.role, handoff.destination)) {
            throw new ProposalDomainError(
              'HANDOFF_DESTINATION_MISMATCH',
              'Seu perfil não pertence à área de destino deste encaminhamento.'
            );
          }
          const actorMember = await ctx.memberResolver(ctx.actor.userId);
          if (
            !actorMember
            || !actorMember.isActive
            || actorMember.organizationRole !== ctx.actor.role
          ) {
            throw new ProposalDomainError(
              'HANDOFF_RECEIPT_NOT_ALLOWED',
              'Vínculo organizacional ativo não pôde ser confirmado.'
            );
          }
          if (proposal.status !== 'accepted' || proposal.decisionRecord?.decision !== 'accepted') {
            throw new ProposalDomainError(
              'HANDOFF_RECEIPT_NOT_ALLOWED',
              'Somente encaminhamento de proposta aceita pode ser recebido.'
            );
          }
          const receipts = ProposalApplicationService.getOrgHandoffReceiptsStore(ctx.organizationId);
          const existing = receipts.get(proposal.id);
          if (existing) return this.clone(existing);

          const { checksumSha256: storedChecksum, ...handoffPayload } = handoff;
          let recalculatedHandoffChecksum: string;
          try {
            recalculatedHandoffChecksum = await calculateSha256(canonicalJsonStringify(handoffPayload));
          } catch {
            throw new ProposalDomainError('HASH_UNAVAILABLE', 'Não foi possível verificar o SHA-256 do encaminhamento.');
          }
          if (recalculatedHandoffChecksum !== storedChecksum) {
            throw new ProposalDomainError('HANDOFF_INTEGRITY_FAILURE', 'A integridade do encaminhamento não foi comprovada.');
          }

          const correlationId = this.idGenerator.next('corr');
          const receiptWithoutChecksum = {
            id: this.idGenerator.next('handoff-receipt'),
            organizationId: ctx.organizationId,
            proposalId: proposal.id,
            handoffId: handoff.id,
            handoffChecksumSha256: handoff.checksumSha256,
            destination: handoff.destination,
            receivedByUserId: ctx.actor.userId,
            receivedAt: clock.now().toISOString(),
            correlationId,
            disclaimerText: 'Recebimento interno registrado. Não cria contrato, projeto, laudo, operação de crédito, cobrança, assinatura ou obrigação financeira.',
          } as const;
          let checksumSha256: string;
          try {
            checksumSha256 = await calculateSha256(canonicalJsonStringify(receiptWithoutChecksum));
          } catch {
            throw new ProposalDomainError('HASH_UNAVAILABLE', 'Não foi possível calcular o SHA-256 do recebimento.');
          }
          const receipt: ProposalHandoffReceipt = { ...receiptWithoutChecksum, checksumSha256 };
          receipts.set(proposal.id, this.clone(receipt));
          this.emitCommercialOperation(
            proposal,
            'proposal.handoff.acknowledged',
            ctx.actor.userId,
            { receiptId: receipt.id, handoffId: handoff.id, destination: handoff.destination },
            clock,
            [proposal.capturerUserId, handoff.preparedByUserId],
            correlationId
          );
          return this.clone(receipt);
        } finally {
          release();
        }
      }
    );
  }

  // --- 15. RENOVAÇÃO GOVERNADA (proposta terminal -> novo rascunho) ---
  public async renewProposal(
    command: RenewProposalCommand,
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<Proposal> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:renew');
    const reason = command.reason.trim();
    if (reason.length < 5 || reason.length > 500) {
      throw new ProposalDomainError(
        'REASON_REQUIRED',
        'Informe um motivo de renovação entre 5 e 500 caracteres.'
      );
    }
    const normalizedCommand: RenewProposalCommand = { ...command, reason };
    return this.runIdempotentMutation(
      'renew',
      command.proposalId,
      command.idempotencyKey,
      normalizedCommand,
      ctx,
      async () => {
        const release = await ProposalApplicationService.acquireLock(
          `${ctx.organizationId}:${command.proposalId}:renewal`
        );
        try {
          const proposals = ProposalApplicationService.getOrgStore(ctx.organizationId);
          const source = proposals.get(command.proposalId);
          if (!source || source.organizationId !== ctx.organizationId) {
            throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta de origem não encontrada.');
          }
          this.checkReadAccess(source, ctx);
          this.validateCommandMetadata(source, normalizedCommand);
          if (!this.isRenewableStatus(source.status)) {
            throw new ProposalDomainError(
              'RENEWAL_NOT_ALLOWED',
              'Somente propostas recusadas, rejeitadas, expiradas ou canceladas podem gerar um novo rascunho.'
            );
          }

          const assignment = await ctx.assignmentGateway.getActiveAssignment(
            ctx.organizationId,
            source.clientId
          );
          if (!assignment || assignment.status !== 'active') {
            throw new ProposalDomainError(
              'CAPTURER_NOT_ASSIGNED',
              'Não existe vínculo comercial ativo para criar a nova proposta.'
            );
          }
          const assignedCapturer = await ctx.memberResolver(assignment.capturerUserId);
          if (
            !assignedCapturer
            || !assignedCapturer.isActive
            || assignedCapturer.organizationRole !== 'capturer'
          ) {
            throw new ProposalDomainError(
              'CAPTURER_NOT_ASSIGNED',
              'O captador do vínculo comercial não possui associação organizacional ativa.'
            );
          }
          if (
            ctx.actor.role === 'capturer'
            && (
              source.capturerUserId !== ctx.actor.userId
              || assignment.capturerUserId !== ctx.actor.userId
            )
          ) {
            throw new ProposalDomainError(
              'CAPTURER_NOT_ASSIGNED',
              'O vínculo comercial ativo com o cliente não pôde ser confirmado.'
            );
          }

          const links = ProposalApplicationService.getOrgRenewalLinksStore(ctx.organizationId);
          const existingLink = links.get(source.id);
          if (existingLink) {
            await this.verifyRenewalLink(existingLink);
            if (existingLink.reason !== reason) {
              throw new ProposalDomainError(
                'RENEWAL_ALREADY_EXISTS',
                'A proposta já possui um novo rascunho vinculado.'
              );
            }
            const existingRenewal = proposals.get(existingLink.renewedProposalId);
            if (!existingRenewal) {
              throw new ProposalDomainError(
                'RENEWAL_INTEGRITY_FAILURE',
                'O novo rascunho vinculado não foi encontrado.'
              );
            }
            return this.clone(existingRenewal);
          }

          const incomingLink = Array.from(links.values()).find(
            (link) => link.renewedProposalId === source.id
          );
          if (incomingLink) await this.verifyRenewalLink(incomingLink);
          const rootProposalId = incomingLink?.rootProposalId ?? source.id;
          const sequenceNumber = (incomingLink?.sequenceNumber ?? 0) + 1;
          const createInput: CreateProposalInput = {
            clientId: source.clientId,
            propertyId: source.propertyId,
            title: `${source.title} — Renovação`,
            proposalType: source.proposalType,
            category: source.category,
            validityDays: source.validityDays,
            requestedAmountCents: source.estimatedValue.amountCents,
            financingTermMonths: source.calculationSummary.financingTermMonths,
            gracePeriodMonths: source.calculationSummary.gracePeriodMonths,
            interestRateAnnualPercentage: source.calculationSummary.interestRateAnnualPercentage,
            idempotencyKey: command.idempotencyKey,
          };
          const renewed = await this.executeCreateProposal(createInput, ctx, clock);
          const correlationId = this.idGenerator.next('corr');
          const linkWithoutChecksum = {
            id: this.idGenerator.next('renewal'),
            organizationId: ctx.organizationId,
            sourceProposalId: source.id,
            renewedProposalId: renewed.id,
            rootProposalId,
            sequenceNumber,
            sourceVersionNumber: source.version,
            sourceStatus: source.status,
            reason,
            createdByUserId: ctx.actor.userId,
            createdAt: clock.now().toISOString(),
            correlationId,
            disclaimerText: 'Novo rascunho comercial vinculado. A proposta de origem permanece encerrada e nenhum contrato, assinatura, crédito, cobrança ou obrigação é criado.',
          } as const;
          let checksumSha256: string;
          try {
            checksumSha256 = await calculateSha256(canonicalJsonStringify(linkWithoutChecksum));
          } catch {
            proposals.delete(renewed.id);
            throw new ProposalDomainError(
              'RENEWAL_INTEGRITY_FAILURE',
              'Não foi possível registrar o vínculo íntegro da renovação.'
            );
          }
          const link: ProposalRenewalLink = { ...linkWithoutChecksum, checksumSha256 };
          links.set(source.id, this.clone(link));
          this.emitCommercialOperation(
            renewed,
            'proposal.renewal.created',
            ctx.actor.userId,
            {
              sourceProposalId: source.id,
              rootProposalId,
              sequenceNumber,
            },
            clock,
            [source.capturerUserId, ctx.actor.userId],
            correlationId
          );
          return this.clone(renewed);
        } finally {
          release();
        }
      }
    );
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

  public async getProposalRenewalLineage(
    proposalId: ProposalId,
    ctx: ProposalAppContext
  ): Promise<ProposalRenewalLineage> {
    this.validateContext(ctx);
    await this.getProposalById(proposalId, ctx);
    const links = ProposalApplicationService.getOrgRenewalLinksStore(ctx.organizationId);
    const ancestors: ProposalRenewalLink[] = [];
    const visited = new Set<ProposalId>([proposalId]);
    let currentProposalId = proposalId;
    while (true) {
      const incoming = Array.from(links.values()).find(
        (link) => link.renewedProposalId === currentProposalId
      );
      if (!incoming) break;
      await this.verifyRenewalLink(incoming);
      if (visited.has(incoming.sourceProposalId)) {
        throw new ProposalDomainError(
          'RENEWAL_INTEGRITY_FAILURE',
          'Foi detectado um ciclo inválido na linhagem de renovação.'
        );
      }
      visited.add(incoming.sourceProposalId);
      ancestors.unshift(this.clone(incoming));
      currentProposalId = incoming.sourceProposalId;
    }
    const successor = links.get(proposalId);
    if (successor) await this.verifyRenewalLink(successor);
    return {
      proposalId,
      rootProposalId: ancestors[0]?.rootProposalId ?? proposalId,
      ancestors: this.clone(ancestors),
      successor: successor ? this.clone(successor) : undefined,
    };
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

  public async getProposalDocuments(
    proposalId: ProposalId,
    ctx: ProposalAppContext
  ): Promise<readonly ProposalCommercialDocument[]> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:view_document');
    await this.getProposalById(proposalId, ctx);
    const list = ProposalApplicationService.getOrgDocumentsStore(ctx.organizationId).get(proposalId) ?? [];
    return this.clone(list).sort(
      (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
    );
  }

  public async getProposalDocumentById(
    proposalId: ProposalId,
    documentId: string,
    ctx: ProposalAppContext
  ): Promise<ProposalCommercialDocument> {
    const documents = await this.getProposalDocuments(proposalId, ctx);
    const document = documents.find((candidate) => candidate.id === documentId);
    if (!document) {
      throw new ProposalDomainError('DOCUMENT_NOT_FOUND', 'Documento comercial não encontrado.');
    }
    return this.clone(document);
  }

  public async getProposalFollowUps(
    proposalId: ProposalId,
    ctx: ProposalAppContext
  ): Promise<readonly ProposalFollowUp[]> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:view_commercial_tracking');
    await this.getProposalById(proposalId, ctx);
    const list = ProposalApplicationService.getOrgFollowUpsStore(ctx.organizationId).get(proposalId) ?? [];
    return this.clone(list).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async getProposalHandoff(
    proposalId: ProposalId,
    ctx: ProposalAppContext
  ): Promise<ProposalOperationalHandoff | null> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:view_handoff');
    const handoff = ProposalApplicationService.getOrgHandoffsStore(ctx.organizationId).get(proposalId);
    if (!handoff) {
      await this.getProposalById(proposalId, ctx);
      return null;
    }
    const mayUseDestinationQueue = this.hasPermission(ctx, 'proposals:view_handoff_queue')
      && this.canOperateHandoffDestination(ctx.actor.role, handoff.destination);
    if (!mayUseDestinationQueue) await this.getProposalById(proposalId, ctx);
    return handoff ? this.clone(handoff) : null;
  }

  public async getProposalHandoffReceipt(
    proposalId: ProposalId,
    ctx: ProposalAppContext
  ): Promise<ProposalHandoffReceipt | null> {
    await this.getProposalHandoff(proposalId, ctx);
    const receipt = ProposalApplicationService.getOrgHandoffReceiptsStore(ctx.organizationId).get(proposalId);
    return receipt ? this.clone(receipt) : null;
  }

  public async getProposalHandoffQueue(
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<ProposalHandoffQueue> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:view_handoff_queue');
    if (!['owner', 'company_admin', 'manager', 'finance', 'project_designer'].includes(ctx.actor.role)) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Seu perfil não possui fila operacional de encaminhamentos.');
    }
    const proposals = ProposalApplicationService.getOrgStore(ctx.organizationId);
    const receipts = ProposalApplicationService.getOrgHandoffReceiptsStore(ctx.organizationId);
    const items = Array.from(ProposalApplicationService.getOrgHandoffsStore(ctx.organizationId).values())
      .filter((handoff) => this.canOperateHandoffDestination(ctx.actor.role, handoff.destination))
      .map((handoff) => {
        const proposal = proposals.get(handoff.proposalId);
        if (!proposal || proposal.organizationId !== ctx.organizationId) return null;
        return {
          proposalId: proposal.id,
          proposalNumber: proposal.proposalNumber,
          title: proposal.title,
          clientName: proposal.clientSnapshot.name,
          destination: handoff.destination,
          handoff: this.clone(handoff),
          receipt: receipts.get(proposal.id) ? this.clone(receipts.get(proposal.id)!) : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        if (Boolean(a.receipt) !== Boolean(b.receipt)) return a.receipt ? 1 : -1;
        return new Date(b.handoff.preparedAt).getTime() - new Date(a.handoff.preparedAt).getTime();
      });
    return {
      pendingCount: items.filter((item) => !item.receipt).length,
      receivedCount: items.filter((item) => Boolean(item.receipt)).length,
      items,
      generatedAt: clock.now().toISOString(),
    };
  }

  public async getCommercialDashboard(
    ctx: ProposalAppContext,
    clock: Clock = SystemClock
  ): Promise<ProposalCommercialDashboard> {
    this.validateContext(ctx);
    this.requirePermission(ctx, 'proposals:view_commercial_tracking');
    if (ctx.actor.role === 'project_designer') {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Acompanhamento comercial não pertence ao escopo técnico.');
    }
    let visible = Array.from(ProposalApplicationService.getOrgStore(ctx.organizationId).values())
      .filter((proposal) => proposal.organizationId === ctx.organizationId);
    if (ctx.actor.role === 'capturer') {
      this.requirePermission(ctx, 'proposals:view_related');
      visible = visible.filter((proposal) => proposal.capturerUserId === ctx.actor.userId);
    } else {
      this.requirePermission(ctx, 'proposals:view');
    }
    const statuses: readonly ProposalStatus[] = [
      'draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'presented',
      'accepted', 'declined', 'rejected', 'expired', 'cancelled',
    ];
    const statusCounts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<ProposalStatus, number>;
    for (const proposal of visible) statusCounts[proposal.status] += 1;
    const followUpsStore = ProposalApplicationService.getOrgFollowUpsStore(ctx.organizationId);
    const handoffsStore = ProposalApplicationService.getOrgHandoffsStore(ctx.organizationId);
    const nowTime = clock.now().getTime();
    const mayViewFinancials = this.hasPermission(ctx, 'proposals:view_financials');
    const trackedStatuses: readonly ProposalStatus[] = ['presented', 'accepted', 'declined', 'expired'];
    const trackedItems = visible
      .filter((proposal) => trackedStatuses.includes(proposal.status))
      .map((proposal) => ({
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        title: proposal.title,
        clientName: proposal.clientSnapshot.name,
        status: proposal.status,
        expiresAt: proposal.expiresAt,
        amountCents: mayViewFinancials ? proposal.estimatedValue.amountCents : undefined,
        activeFollowUp: (followUpsStore.get(proposal.id) ?? []).find((followUp) => followUp.status === 'scheduled'),
        handoffId: handoffsStore.get(proposal.id)?.id,
      }))
      .sort((a, b) => {
        const aTime = a.activeFollowUp ? new Date(a.activeFollowUp.scheduledFor).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.activeFollowUp ? new Date(b.activeFollowUp.scheduledFor).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime || a.proposalNumber.localeCompare(b.proposalNumber);
      });
    const decisionBase = statusCounts.accepted + statusCounts.declined + statusCounts.expired;
    const sumAsSafeNumber = (items: readonly Proposal[]): number | undefined => {
      const value = items.reduce((total, proposal) => total + BigInt(proposal.estimatedValue.amountCents), 0n);
      return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined;
    };
    return {
      totalVisible: visible.length,
      statusCounts,
      presentedOpenCount: statusCounts.presented,
      acceptedCount: statusCounts.accepted,
      declinedCount: statusCounts.declined,
      expiredCount: statusCounts.expired,
      overdueFollowUpCount: trackedItems.filter(
        (item) => item.activeFollowUp && nowTime >= new Date(item.activeFollowUp.scheduledFor).getTime()
      ).length,
      decisionConversionBasisPoints: decisionBase === 0
        ? 0
        : Math.round((statusCounts.accepted * 10_000) / decisionBase),
      totalVisibleAmountCents: mayViewFinancials ? sumAsSafeNumber(visible) : undefined,
      acceptedAmountCents: mayViewFinancials
        ? sumAsSafeNumber(visible.filter((proposal) => proposal.status === 'accepted'))
        : undefined,
      trackedItems: this.clone(trackedItems),
      generatedAt: clock.now().toISOString(),
    };
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
