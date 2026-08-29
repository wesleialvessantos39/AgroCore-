/**
 * MÓDULO 005 — PROPOSTAS DE CRÉDITO E PRESTAÇÃO DE SERVIÇOS TÉCNICOS
 * Fundação canônica de entidades, contratos de domínio e tipos estritos.
 * 
 * Regras:
 * 1. Contrato exclusivo de fundação: id, organizationId, proposalNumber, title,
 *    clientId, clientSnapshot, propertyId, propertySnapshot, capturerUserId,
 *    capturerSnapshot, proposalType, status, validityDays, expiresAt,
 *    estimatedValue, calculationSummary, notes, createdAt, updatedAt, version.
 * 2. Status permitidos na fundação: 'draft' | 'submitted' | 'expired' | 'cancelled'.
 * 3. Operações de pipeline comercial pertencem à OE-005.003.
 * 4. Aritmética determinística com formatação padronizada.
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

export type ProposalPresentationChannel = 'email' | 'phone' | 'in_person' | 'messaging' | 'other';
export type ProposalClientDecision = 'accepted' | 'declined';

export interface ProposalPresentationRecord {
  readonly presentedAt: string; // ISO
  readonly presentedByUserId: string;
  readonly channel: ProposalPresentationChannel;
  readonly presentedVersionNumber: number;
  readonly notes?: string;
  readonly documentReference?: string;
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
  readonly presentationRecord?: ProposalPresentationRecord | null;
  readonly decisionRecord?: ProposalDecisionRecord | null;
  readonly submittedAt?: string | null; // ISO
  readonly approvedAt?: string | null; // ISO
  readonly approvedByUserId?: string | null;
  readonly rejectedAt?: string | null; // ISO
  readonly rejectedByUserId?: string | null;
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
  readonly idempotencyKey?: string;
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
  readonly idempotencyKey?: string;
}

export interface PresentProposalInput {
  readonly channel: ProposalPresentationChannel;
  readonly notes?: string;
  readonly documentReference?: string;
  readonly expectedVersion?: number;
  readonly idempotencyKey?: string;
}

export interface RecordProposalDecisionInput {
  readonly decision: ProposalClientDecision;
  readonly channel: ProposalPresentationChannel;
  readonly operationalReference?: string;
  readonly notes?: string;
  readonly expectedVersion?: number;
  readonly idempotencyKey?: string;
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
