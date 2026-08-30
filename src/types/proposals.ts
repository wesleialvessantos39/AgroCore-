/**
 * MÓDULO 005 — PROPOSTAS DE CRÉDITO E PRESTAÇÃO DE SERVIÇOS TÉCNICOS
 * Contratos canônicos de domínio, pipeline, documento comercial e acompanhamento.
 * 
 * Regras:
 * A proposta é a fonte autoritativa; snapshots, histórico e documentos comerciais
 * são projeções imutáveis e isoladas por organização.
 */

export type ProposalId = string;

export type ProposalStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'approved'
  | 'presented'
  | 'accepted'
  | 'declined'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export type ProposalType =
  | 'credit'
  | 'appraisal'
  | 'technical_project'
  | 'environmental_regularization';

export type ProposalCategory =
  | 'custeio'
  | 'investimento'
  | 'comercializacao'
  | 'industrializacao'
  | 'servico_tecnico'
  | 'outros';

export interface ProposalClientSnapshot {
  readonly id: string;
  readonly name: string;
  readonly documentNumber: string;
  readonly documentType: 'cpf' | 'cnpj';
  readonly email?: string;
  readonly phone?: string;
}

export interface ProposalPropertySnapshot {
  readonly id: string;
  readonly name: string;
  readonly registrationNumber?: string;
  readonly totalAreaHectares?: number;
  readonly city?: string;
  readonly state?: string;
}

export interface ProposalCapturerSnapshot {
  readonly userId: string;
  readonly name: string;
  readonly email?: string;
  readonly role?: string;
}

export interface ProposalEstimatedValue {
  readonly amountCents: number;
  readonly currency: 'BRL';
  readonly formattedBRL: string;
}

export interface ProposalCalculationSummary {
  readonly principalCents: number;
  readonly interestRateAnnualPercentage?: number;
  readonly financingTermMonths?: number;
  readonly gracePeriodMonths?: number;
  readonly estimatedInterestCents?: number;
  readonly totalEstimatedCents: number;
  readonly installmentsCount?: number;
  readonly installmentEstimatedCents?: number;
  readonly formattedValueBRL: string;
}

export interface ProposalReviewAssignment {
  readonly id: string;
  readonly organizationId: string;
  readonly proposalId: ProposalId;
  readonly reviewerUserId: string;
  readonly reviewerName?: string;
  readonly reviewerEmail?: string;
  readonly status: 'active' | 'completed' | 'reassigned';
  readonly assignedByUserId: string;
  readonly assignedAt: string; // ISO
  readonly completedAt?: string; // ISO
  readonly reassignmentReason?: string;
  readonly createdAt: string; // ISO
  readonly updatedAt: string; // ISO
}

export interface ProposalReviewNote {
  readonly id: string;
  readonly authorUserId: string;
  readonly createdAt: string;
  readonly reasons: string;
}

export type ProposalPresentationChannel = 'email' | 'phone' | 'in_person' | 'messaging' | 'other';
export type ProposalClientDecision = 'accepted' | 'declined';

export interface ProposalPresentationRecord {
  readonly presentedAt: string; // ISO
  readonly presentedByUserId: string;
  readonly channel: ProposalPresentationChannel;
  readonly presentedVersionNumber: number;
  readonly notes?: string;
  readonly documentReference?: string; // ID canônico de ProposalCommercialDocument
}

export interface ProposalDecisionRecord {
  readonly decision: ProposalClientDecision;
  readonly decidedAt: string; // ISO
  readonly recordedByUserId: string;
  readonly channel: ProposalPresentationChannel;
  readonly versionNumber: number;
  readonly operationalReference?: string;
  readonly notes?: string;
  readonly disclaimerText: string;
}

export interface ProposalStatusHistoryEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly proposalId: ProposalId;
  readonly versionNumber: number;
  readonly fromStatus: ProposalStatus;
  readonly toStatus: ProposalStatus;
  readonly actorUserId: string;
  readonly actorName?: string;
  readonly reason?: string;
  readonly notes?: string;
  readonly correlationId: string;
  readonly timestamp: string; // ISO
}

export interface ProposalVersionSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly proposalId: ProposalId;
  readonly versionNumber: number;
  readonly snapshot: Proposal;
  readonly status: ProposalStatus;
  readonly createdByUserId: string;
  readonly createdAt: string; // ISO
  readonly correlationId: string;
  readonly checksumSha256: string;
}

export interface ProposalCommercialDocumentContent {
  readonly proposalNumber: string;
  readonly title: string;
  readonly proposalType: ProposalType;
  readonly category: ProposalCategory;
  readonly client: {
    readonly id: string;
    readonly name: string;
  };
  readonly property: {
    readonly id: string;
    readonly name: string;
    readonly city?: string;
    readonly state?: string;
  } | null;
  readonly estimatedValue: ProposalEstimatedValue;
  readonly calculationSummary: ProposalCalculationSummary;
  readonly validityDays: number;
  readonly disclaimerText: string;
}

/**
 * Projeção comercial imutável emitida a partir do snapshot aprovado.
 * Não representa contrato, assinatura digital ou consentimento autenticado.
 */
export interface ProposalCommercialDocument {
  readonly id: string;
  readonly organizationId: string;
  readonly proposalId: ProposalId;
  readonly documentNumber: string;
  readonly sourceSnapshotId: string;
  readonly sourceVersionNumber: number;
  readonly sourceChecksumSha256: string;
  readonly content: ProposalCommercialDocumentContent;
  readonly issuedByUserId: string;
  readonly issuedAt: string;
  readonly checksumSha256: string;
}

export type ProposalFollowUpPurpose =
  | 'decision_reminder'
  | 'document_clarification'
  | 'commercial_alignment'
  | 'other';

export type ProposalFollowUpStatus = 'scheduled' | 'completed' | 'cancelled';

export type ProposalFollowUpOutcome =
  | 'contacted'
  | 'no_response'
  | 'decision_recorded'
  | 'not_applicable';

/**
 * Compromisso comercial interno. Não representa mensagem enviada, agenda externa
 * ou contato efetivamente realizado com o cliente.
 */
export interface ProposalFollowUp {
  readonly id: string;
  readonly organizationId: string;
  readonly proposalId: ProposalId;
  readonly proposalVersionNumber: number;
  readonly assignedUserId: string;
  readonly scheduledFor: string;
  readonly channel: ProposalPresentationChannel;
  readonly purpose: ProposalFollowUpPurpose;
  readonly status: ProposalFollowUpStatus;
  readonly outcome?: ProposalFollowUpOutcome;
  readonly notes?: string;
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly cancelledAt?: string;
  readonly cancellationReasonCode?:
    | 'MANUAL'
    | 'PROPOSAL_ACCEPTED'
    | 'PROPOSAL_DECLINED'
    | 'PROPOSAL_EXPIRED'
    | 'PROPOSAL_CANCELLED';
  readonly version: number;
}

export type ProposalOperationalHandoffDestination =
  | 'credit_operations'
  | 'appraisal_operations'
  | 'technical_operations';

/**
 * Encaminhamento interno imutável de uma proposta aceita. É apenas uma referência
 * operacional e não cria contrato, projeto, laudo, crédito ou obrigação financeira.
 */
export interface ProposalOperationalHandoff {
  readonly id: string;
  readonly organizationId: string;
  readonly proposalId: ProposalId;
  readonly proposalNumber: string;
  readonly acceptedVersionNumber: number;
  readonly acceptedSnapshotId: string;
  readonly acceptedSnapshotChecksumSha256: string;
  readonly commercialDocumentId: string;
  readonly clientId: string;
  readonly propertyId: string | null;
  readonly destination: ProposalOperationalHandoffDestination;
  readonly preparedByUserId: string;
  readonly preparedAt: string;
  readonly checksumSha256: string;
  readonly disclaimerText: string;
}

export interface ProposalCommercialTrackingItem {
  readonly proposalId: ProposalId;
  readonly proposalNumber: string;
  readonly title: string;
  readonly clientName: string;
  readonly status: ProposalStatus;
  readonly expiresAt: string;
  readonly amountCents?: number;
  readonly activeFollowUp?: ProposalFollowUp;
  readonly handoffId?: string;
}

export interface ProposalCommercialDashboard {
  readonly totalVisible: number;
  readonly statusCounts: Readonly<Record<ProposalStatus, number>>;
  readonly presentedOpenCount: number;
  readonly acceptedCount: number;
  readonly declinedCount: number;
  readonly expiredCount: number;
  readonly overdueFollowUpCount: number;
  readonly decisionConversionBasisPoints: number;
  readonly totalVisibleAmountCents?: number;
  readonly acceptedAmountCents?: number;
  readonly trackedItems: readonly ProposalCommercialTrackingItem[];
  readonly generatedAt: string;
}

export interface Proposal {
  readonly id: ProposalId;
  readonly organizationId: string;
  readonly proposalNumber: string;
  readonly title: string;
  readonly clientId: string;
  readonly clientSnapshot: ProposalClientSnapshot;
  readonly propertyId: string | null;
  readonly propertySnapshot: ProposalPropertySnapshot | null;
  readonly capturerUserId: string;
  readonly capturerSnapshot: ProposalCapturerSnapshot;
  readonly createdByUserId: string;
  readonly submittedByUserId?: string | null;
  readonly proposalType: ProposalType;
  readonly category: ProposalCategory;
  readonly status: ProposalStatus;
  readonly validityDays: number;
  readonly validFrom?: string | null; // ISO (definido na apresentação)
  readonly expiresAt: string; // ISO
  readonly estimatedValue: ProposalEstimatedValue;
  readonly calculationSummary: ProposalCalculationSummary;
  readonly notes?: string;
  readonly activeReviewAssignment?: ProposalReviewAssignment | null;
  readonly reviewNotes?: readonly ProposalReviewNote[];
  readonly presentationRecord?: ProposalPresentationRecord | null;
  readonly decisionRecord?: ProposalDecisionRecord | null;
  readonly submittedAt?: string | null; // ISO
  readonly approvedAt?: string | null; // ISO
  readonly approvedByUserId?: string | null;
  readonly approvalNotes?: string;
  readonly rejectedAt?: string | null; // ISO
  readonly rejectedByUserId?: string | null;
  readonly cancellationReason?: string;
  readonly createdAt: string; // ISO
  readonly updatedAt: string; // ISO
  readonly version: number;
}

export interface CreateProposalInput {
  readonly clientId: string;
  readonly propertyId?: string | null;
  readonly title: string;
  readonly proposalType: ProposalType;
  readonly category?: ProposalCategory;
  readonly validityDays?: number;
  readonly requestedAmountCents: number;
  readonly financingTermMonths?: number;
  readonly gracePeriodMonths?: number;
  readonly interestRateAnnualPercentage?: number;
  readonly notes?: string;
  readonly idempotencyKey: string;
}

export interface UpdateProposalInput {
  readonly title?: string;
  readonly proposalType?: ProposalType;
  readonly category?: ProposalCategory;
  readonly propertyId?: string | null;
  readonly validityDays?: number;
  readonly requestedAmountCents?: number;
  readonly financingTermMonths?: number;
  readonly gracePeriodMonths?: number;
  readonly interestRateAnnualPercentage?: number;
  readonly notes?: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface PresentProposalInput {
  readonly channel: ProposalPresentationChannel;
  readonly notes?: string;
  readonly documentId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface RecordProposalDecisionInput {
  readonly decision: ProposalClientDecision;
  readonly channel: ProposalPresentationChannel;
  readonly operationalReference?: string;
  readonly notes?: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface ProposalCommandMetadata {
  readonly proposalId: ProposalId;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export type SubmitProposalCommand = ProposalCommandMetadata;

export interface AssignProposalReviewerCommand extends ProposalCommandMetadata {
  readonly reviewerUserId: string;
  readonly reassignmentReason?: string;
}

export type StartProposalReviewCommand = ProposalCommandMetadata;

export interface RequestProposalChangesCommand extends ProposalCommandMetadata {
  readonly reasons: string;
}

export interface ApproveProposalCommand extends ProposalCommandMetadata {
  readonly notes?: string;
}

export interface RejectProposalCommand extends ProposalCommandMetadata {
  readonly reason: string;
}

export interface PresentProposalCommand extends ProposalCommandMetadata {
  readonly channel: ProposalPresentationChannel;
  readonly notes?: string;
  readonly documentId: string;
}

export type IssueProposalDocumentCommand = ProposalCommandMetadata;

export interface ScheduleProposalFollowUpCommand extends ProposalCommandMetadata {
  readonly assignedUserId: string;
  readonly scheduledFor: string;
  readonly channel: ProposalPresentationChannel;
  readonly purpose: ProposalFollowUpPurpose;
  readonly notes?: string;
}

export interface CompleteProposalFollowUpCommand {
  readonly proposalId: ProposalId;
  readonly followUpId: string;
  readonly expectedFollowUpVersion: number;
  readonly outcome: ProposalFollowUpOutcome;
  readonly notes?: string;
  readonly idempotencyKey: string;
}

export interface CancelProposalFollowUpCommand {
  readonly proposalId: ProposalId;
  readonly followUpId: string;
  readonly expectedFollowUpVersion: number;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export type PrepareProposalHandoffCommand = ProposalCommandMetadata;

export interface RecordProposalDecisionCommand extends ProposalCommandMetadata {
  readonly decision: ProposalClientDecision;
  readonly channel: ProposalPresentationChannel;
  readonly operationalReference?: string;
  readonly notes?: string;
}

export interface CancelProposalCommand extends ProposalCommandMetadata {
  readonly reason?: string;
}

export interface ProposalFilterOptions {
  readonly search?: string;
  readonly status?: ProposalStatus;
  readonly type?: ProposalType;
  readonly category?: ProposalCategory;
  readonly clientId?: string;
  readonly propertyId?: string;
  readonly capturerUserId?: string;
  readonly reviewerUserId?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'amount';
  readonly sortDirection?: 'asc' | 'desc';
}

export interface PaginatedProposalsResult {
  readonly items: readonly Proposal[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export type ProposalErrorCode =
  | 'OPERATION_NOT_IMPLEMENTED'
  | 'ORGANIZATION_REQUIRED'
  | 'CLIENT_NOT_FOUND'
  | 'CLIENT_INACTIVE'
  | 'CAPTURER_NOT_ASSIGNED'
  | 'PROPERTY_NOT_FOUND'
  | 'PROPERTY_INACTIVE'
  | 'PROPERTY_NOT_BELONGS_TO_CLIENT'
  | 'INVALID_FINANCIAL_VALUE'
  | 'INVALID_VALIDITY_DAYS'
  | 'PROPOSAL_NOT_FOUND'
  | 'PROPOSAL_LOCKED'
  | 'CONCURRENCY_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PERMISSION_DENIED'
  | 'NOT_IN_REVIEW'
  | 'REVIEWER_MISMATCH'
  | 'SELF_APPROVAL_FORBIDDEN'
  | 'NOT_APPROVED'
  | 'NOT_PRESENTED'
  | 'ALREADY_DECIDED'
  | 'PROPOSAL_EXPIRED'
  | 'REASON_REQUIRED'
  | 'CANNOT_CANCEL_TERMINAL'
  | 'CANNOT_EDIT_NON_DRAFT'
  | 'INVALID_CHANNEL'
  | 'INVALID_DECISION'
  | 'HASH_UNAVAILABLE'
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_NOT_ISSUABLE'
  | 'DOCUMENT_VERSION_MISMATCH'
  | 'FOLLOW_UP_NOT_ALLOWED'
  | 'FOLLOW_UP_NOT_FOUND'
  | 'FOLLOW_UP_CONFLICT'
  | 'FOLLOW_UP_DATE_INVALID'
  | 'HANDOFF_NOT_AVAILABLE'
  | 'HANDOFF_INTEGRITY_FAILURE'
  | 'SYSTEM_CONTEXT_REQUIRED'
  | 'OPERATION_NOT_ALLOWED';

export class ProposalDomainError extends Error {
  readonly code: ProposalErrorCode;

  constructor(code: ProposalErrorCode, message: string) {
    super(message);
    this.name = 'ProposalDomainError';
    this.code = code;
    Object.setPrototypeOf(this, ProposalDomainError.prototype);
  }
}
