import type { Permission } from './authorization';
import type { OrganizationRole } from './auth';

export type TechnicalVisitId = string;

export type TechnicalVisitStatus =
  | 'planned'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type TechnicalVisitActivityType =
  | 'technical_visit'
  | 'inspection'
  | 'appraisal_inspection'
  | 'credit_visit'
  | 'document_collection'
  | 'other';

export type TechnicalVisitScheduleConflictReason =
  | 'responsible'
  | 'participant';

export interface TechnicalVisitAddress {
  readonly addressLine: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string | null;
  readonly notes: string | null;
}

export interface TechnicalVisitPreparationChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly required: boolean;
  readonly completed: boolean;
  readonly completedByUserId: string | null;
  readonly completedAt: string | null;
}

export interface TechnicalVisitScheduleConflict {
  readonly visitId: TechnicalVisitId;
  readonly scheduledFor: string;
  readonly endsAt: string;
  readonly reasons: readonly TechnicalVisitScheduleConflictReason[];
  readonly sharedUserIds: readonly string[];
}

export interface TechnicalVisitConflictOverride {
  readonly reason: string;
  readonly authorizedByUserId: string;
  readonly authorizedAt: string;
  readonly conflictVisitIds: readonly TechnicalVisitId[];
}

export interface TechnicalVisitPreparation {
  readonly timeZone: string;
  readonly durationMinutes: number;
  readonly address: TechnicalVisitAddress;
  readonly participantUserIds: readonly string[];
  readonly checklist: readonly TechnicalVisitPreparationChecklistItem[];
  readonly routeNotes: string | null;
  readonly conflictOverride: TechnicalVisitConflictOverride | null;
  readonly preparedByUserId: string;
  readonly preparedAt: string;
}

export interface TechnicalVisit {
  readonly id: TechnicalVisitId;
  readonly organizationId: string;
  readonly activityType: TechnicalVisitActivityType;
  readonly status: TechnicalVisitStatus;
  readonly clientId: string;
  readonly propertyId: string | null;
  readonly proposalId: string | null;
  readonly appraisalId: string | null;
  readonly responsibleUserId: string;
  readonly scheduledFor: string;
  readonly preparation: TechnicalVisitPreparation | null;
  readonly purpose: string;
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly updatedByUserId: string;
  readonly updatedAt: string;
  readonly confirmedAt: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
  readonly version: number;
}

export type TechnicalVisitAuditAction =
  | 'created'
  | 'updated'
  | 'status_changed';

export interface TechnicalVisitAuditEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly visitId: TechnicalVisitId;
  readonly action: TechnicalVisitAuditAction;
  readonly actorUserId: string;
  readonly at: string;
  readonly version: number;
  readonly fromStatus: TechnicalVisitStatus | null;
  readonly toStatus: TechnicalVisitStatus | null;
  readonly reason: string | null;
  readonly changedFields: readonly string[];
}

export interface TechnicalVisitListFilters {
  readonly status?: TechnicalVisitStatus | 'all';
  readonly clientId?: string;
  readonly propertyId?: string;
  readonly responsibleUserId?: string;
}

export interface CreateTechnicalVisitInput {
  readonly activityType: TechnicalVisitActivityType;
  readonly clientId: string;
  readonly propertyId?: string | null;
  readonly proposalId?: string | null;
  readonly appraisalId?: string | null;
  readonly responsibleUserId: string;
  readonly scheduledFor: string;
  readonly purpose: string;
}

export interface TechnicalVisitPreparationChecklistInput {
  readonly id?: string;
  readonly label: string;
  readonly required: boolean;
}

export interface UpdateTechnicalVisitPreparationInput {
  readonly localStart: string;
  readonly timeZone: string;
  readonly durationMinutes: number;
  readonly address: TechnicalVisitAddress;
  readonly participantUserIds: readonly string[];
  readonly checklist: readonly TechnicalVisitPreparationChecklistInput[];
  readonly routeNotes?: string | null;
  readonly expectedVersion: number;
  readonly changeReason: string;
  readonly conflictOverrideReason?: string;
}

export interface SetTechnicalVisitChecklistItemCompletionInput {
  readonly itemId: string;
  readonly completed: boolean;
  readonly expectedVersion: number;
}

export interface UpdateTechnicalVisitInput {
  readonly activityType?: TechnicalVisitActivityType;
  readonly clientId?: string;
  readonly propertyId?: string | null;
  readonly proposalId?: string | null;
  readonly appraisalId?: string | null;
  readonly responsibleUserId?: string;
  readonly purpose?: string;
  readonly expectedVersion: number;
  readonly changeReason: string;
}

export interface TransitionTechnicalVisitInput {
  readonly targetStatus: TechnicalVisitStatus;
  readonly expectedVersion: number;
  readonly reason?: string;
}

export interface TechnicalVisitActor {
  readonly userId: string;
  readonly role: OrganizationRole;
  readonly isActive: boolean;
  readonly permissions: readonly Permission[];
}

export interface TechnicalVisitMemberResolution {
  readonly exists: boolean;
  readonly organizationId: string | null;
  readonly userId: string;
  readonly isActive: boolean;
  readonly canExecute: boolean;
  readonly name?: string;
}

export interface TechnicalVisitClientResolution {
  readonly exists: boolean;
  readonly organizationId: string | null;
  readonly status: 'active' | 'inactive' | null;
}

export interface TechnicalVisitPropertyResolution {
  readonly exists: boolean;
  readonly organizationId: string | null;
  readonly status: 'active' | 'inactive' | null;
  readonly clientIds: readonly string[];
}

export interface TechnicalVisitProposalResolution {
  readonly exists: boolean;
  readonly organizationId: string | null;
  readonly clientId: string | null;
  readonly propertyId: string | null;
}

export interface TechnicalVisitAppraisalResolution {
  readonly exists: boolean;
  readonly organizationId: string | null;
  readonly clientId: string | null;
  readonly propertyId: string | null;
}

export interface TechnicalVisitApplicationContext {
  readonly organizationId: string;
  readonly actor: TechnicalVisitActor;
  readonly resolveMember: (userId: string) => Promise<TechnicalVisitMemberResolution>;
  readonly resolveClient: (clientId: string) => Promise<TechnicalVisitClientResolution>;
  readonly resolveProperty: (propertyId: string) => Promise<TechnicalVisitPropertyResolution>;
  readonly resolveProposal: (proposalId: string) => Promise<TechnicalVisitProposalResolution>;
  readonly resolveAppraisal: (appraisalId: string) => Promise<TechnicalVisitAppraisalResolution>;
}

export interface TechnicalVisitWrite {
  readonly visit: TechnicalVisit;
  readonly audit: TechnicalVisitAuditEntry;
  readonly expectedVersion: number | null;
}

export interface TechnicalVisitGateway {
  listVisits(
    organizationId: string,
    filters?: TechnicalVisitListFilters,
    signal?: AbortSignal
  ): Promise<readonly TechnicalVisit[]>;

  getVisitById(
    organizationId: string,
    visitId: TechnicalVisitId
  ): Promise<TechnicalVisit | null>;

  createVisit(write: TechnicalVisitWrite): Promise<TechnicalVisit>;

  updateVisit(write: TechnicalVisitWrite): Promise<TechnicalVisit>;

  listAudit(
    organizationId: string,
    visitId: TechnicalVisitId
  ): Promise<readonly TechnicalVisitAuditEntry[]>;

  clearAllSessionData(): void;
}

export type TechnicalVisitErrorCode =
  | 'SERVICE_UNAVAILABLE'
  | 'ORGANIZATION_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'VISIT_NOT_FOUND'
  | 'RESPONSIBLE_NOT_FOUND'
  | 'RESPONSIBLE_INACTIVE'
  | 'RESPONSIBLE_INELIGIBLE'
  | 'RESPONSIBLE_MISMATCH'
  | 'CLIENT_NOT_FOUND'
  | 'CLIENT_INACTIVE'
  | 'PROPERTY_NOT_FOUND'
  | 'PROPERTY_INACTIVE'
  | 'PROPERTY_CLIENT_MISMATCH'
  | 'PROPOSAL_NOT_FOUND'
  | 'PROPOSAL_MISMATCH'
  | 'APPRAISAL_NOT_FOUND'
  | 'APPRAISAL_MISMATCH'
  | 'INVALID_ACTIVITY_TYPE'
  | 'INVALID_DATE'
  | 'INVALID_TIME_ZONE'
  | 'INVALID_DURATION'
  | 'INVALID_ADDRESS'
  | 'INVALID_PARTICIPANT'
  | 'INVALID_CHECKLIST'
  | 'INVALID_ROUTE'
  | 'SCHEDULE_CONFLICT'
  | 'PREPARATION_REQUIRED'
  | 'PREPARATION_INCOMPLETE'
  | 'PREPARATION_LOCKED'
  | 'CHECKLIST_ITEM_NOT_FOUND'
  | 'INVALID_PURPOSE'
  | 'INVALID_TRANSITION'
  | 'REASON_REQUIRED'
  | 'VISIT_LOCKED'
  | 'CONCURRENCY_CONFLICT';

export class TechnicalVisitDomainError extends Error {
  readonly code: TechnicalVisitErrorCode;

  constructor(code: TechnicalVisitErrorCode, message: string) {
    super(message);
    this.name = 'TechnicalVisitDomainError';
    this.code = code;
    Object.setPrototypeOf(this, TechnicalVisitDomainError.prototype);
  }
}


export class TechnicalVisitScheduleConflictError extends TechnicalVisitDomainError {
  readonly conflicts: readonly TechnicalVisitScheduleConflict[];

  constructor(conflicts: readonly TechnicalVisitScheduleConflict[]) {
    super(
      'SCHEDULE_CONFLICT',
      'Foram encontrados conflitos de agenda. Revise os horários ou informe um motivo autorizado para manter a exceção.'
    );
    this.name = 'TechnicalVisitScheduleConflictError';
    this.conflicts = conflicts.map((conflict) => ({
      ...conflict,
      reasons: [...conflict.reasons],
      sharedUserIds: [...conflict.sharedUserIds],
    }));
    Object.setPrototypeOf(this, TechnicalVisitScheduleConflictError.prototype);
  }
}
