import type { Permission } from './authorization';
import type { OrganizationRole } from './auth';

export type ScheduleItemKind = 'task' | 'appointment';
export type ScheduleViewScope = 'personal' | 'team';
export type ScheduleSourceDomain =
  | 'technical_visit'
  | 'appraisal'
  | 'proposal';
export type SchedulePriority = 'low' | 'medium' | 'high' | 'urgent';
export type ScheduleItemStatus =
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'cancelled';

export type ScheduleRecurrenceFrequency =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly';

export interface ScheduleRecurrenceDefinition {
  readonly frequency: ScheduleRecurrenceFrequency;
  readonly interval: number;
  readonly weekdays: readonly number[];
  readonly endsAt: string | null;
}

export interface ScheduleManualOrigin {
  readonly type: 'manual';
  readonly sourceDomain: null;
  readonly sourceId: null;
  readonly sourceVersion: null;
  readonly sourceEventKey: null;
}

export interface ScheduleDomainEventOrigin {
  readonly type: 'domain_event';
  readonly sourceDomain: ScheduleSourceDomain;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly sourceEventKey: string;
}

export type ScheduleOrigin = ScheduleManualOrigin | ScheduleDomainEventOrigin;

interface ScheduleItemBase {
  readonly id: string;
  readonly organizationId: string;
  readonly title: string;
  readonly description: string | null;
  readonly priority: SchedulePriority;
  readonly status: ScheduleItemStatus;
  readonly timeZone: string;
  readonly recurrence: ScheduleRecurrenceDefinition;
  readonly origin: ScheduleOrigin;
  readonly responsibleUserId: string | null;
  readonly participantUserIds: readonly string[];
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly updatedByUserId: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface CorporateTask extends ScheduleItemBase {
  readonly kind: 'task';
  readonly dueAt: string | null;
  readonly startsAt: null;
  readonly endsAt: null;
}

export interface CalendarAppointment extends ScheduleItemBase {
  readonly kind: 'appointment';
  readonly dueAt: null;
  readonly startsAt: string;
  readonly endsAt: string;
}

export type ScheduleItem = CorporateTask | CalendarAppointment;

export type ScheduleOccurrenceStatus =
  | 'pending'
  | 'completed'
  | 'cancelled';

export interface ScheduleOccurrence {
  readonly id: string;
  readonly organizationId: string;
  readonly scheduleItemId: string;
  readonly sourceItemVersion: number;
  readonly scheduledAt: string;
  readonly endsAt: string | null;
  readonly status: ScheduleOccurrenceStatus;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface ScheduleOccurrenceDraft {
  readonly scheduledAt: string;
  readonly endsAt: string | null;
}

export interface ScheduleOccurrenceWindowInput {
  readonly from: string;
  readonly to: string;
}

export interface ScheduleOccurrenceTransitionInput {
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly reason: string;
}

export interface ScheduleOccurrenceTransitionGatewayInput {
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly actorCanManage: boolean;
  readonly occurrenceId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly reason: string;
}

export interface ScheduleOccurrenceAuditEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly occurrenceId: string;
  readonly action: 'completed' | 'cancelled' | 'reopened';
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly occurrenceVersion: number;
  readonly reason: string;
}

export interface ScheduleItemAuditEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly scheduleItemId: string;
  readonly action: 'created' | 'updated';
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly itemVersion: number;
  readonly changedFields: readonly string[];
  readonly reason: string | null;
}

export interface ScheduleMemberOption {
  readonly userId: string;
  readonly organizationRole: Exclude<OrganizationRole, 'none'>;
  readonly displayName: string;
}

export interface ScheduleCollaborationRevision {
  readonly id: string;
  readonly organizationId: string;
  readonly scheduleItemId: string;
  readonly itemVersion: number;
  readonly responsibleUserId: string | null;
  readonly participantUserIds: readonly string[];
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly reason: string;
}

export interface SetScheduleCollaborationInput {
  readonly responsibleUserId: string | null;
  readonly participantUserIds: readonly string[];
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly reason: string;
}

export interface ScheduleTransitionInput {
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly reason: string;
}

export interface ScheduleItemListFilters {
  readonly kind?: ScheduleItemKind | 'all';
  readonly status?: ScheduleItemStatus | 'all';
  /**
   * "personal" inclui registros criados pelo usuário, sob sua
   * responsabilidade atual ou dos quais ele participa. "team" mantém
   * todos os registros da organização autorizados pelo RBAC.
   */
  readonly viewScope?: ScheduleViewScope;
}

interface ScheduleCreateBase {
  readonly title: string;
  readonly description?: string | null;
  readonly priority: SchedulePriority;
  readonly timeZone: string;
  readonly recurrence?: ScheduleRecurrenceDefinition;
  readonly idempotencyKey: string;
}

export interface CreateCorporateTaskInput extends ScheduleCreateBase {
  readonly kind: 'task';
  readonly dueAt?: string | null;
}

export interface CreateCalendarAppointmentInput extends ScheduleCreateBase {
  readonly kind: 'appointment';
  readonly startsAt: string;
  readonly endsAt: string;
}

export type CreateScheduleItemInput =
  | CreateCorporateTaskInput
  | CreateCalendarAppointmentInput;

interface ScheduleUpdateBase {
  readonly title: string;
  readonly description?: string | null;
  readonly priority: SchedulePriority;
  readonly timeZone: string;
  readonly recurrence: ScheduleRecurrenceDefinition;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly reason: string;
}

export interface UpdateCorporateTaskInput extends ScheduleUpdateBase {
  readonly kind: 'task';
  readonly dueAt?: string | null;
}

export interface UpdateCalendarAppointmentInput extends ScheduleUpdateBase {
  readonly kind: 'appointment';
  readonly startsAt: string;
  readonly endsAt: string;
}

export type UpdateScheduleItemInput =
  | UpdateCorporateTaskInput
  | UpdateCalendarAppointmentInput;

export interface ScheduleItemCreatePayload {
  readonly kind: ScheduleItemKind;
  readonly title: string;
  readonly description: string | null;
  readonly priority: SchedulePriority;
  readonly timeZone: string;
  readonly dueAt: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly recurrence: ScheduleRecurrenceDefinition;
}

export interface ScheduleItemUpdatePayload {
  readonly title: string;
  readonly description: string | null;
  readonly priority: SchedulePriority;
  readonly timeZone: string;
  readonly dueAt: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly recurrence: ScheduleRecurrenceDefinition;
}

export interface CreateScheduleItemGatewayInput {
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly payload: ScheduleItemCreatePayload;
  readonly idempotencyKey: string;
}

export interface UpdateScheduleItemGatewayInput {
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly scheduleItemId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly payload: ScheduleItemUpdatePayload;
  readonly reason: string;
}

export interface SetScheduleCollaborationGatewayInput {
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly scheduleItemId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly responsibleUserId: string | null;
  readonly participantUserIds: readonly string[];
  readonly reason: string;
}

export interface ScheduleTransitionGatewayInput {
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly actorCanManage: boolean;
  readonly scheduleItemId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly reason: string;
}

export interface ScheduleGateway {
  listItems(
    organizationId: string,
    actorUserId: string,
    filters?: ScheduleItemListFilters,
    signal?: AbortSignal
  ): Promise<readonly ScheduleItem[]>;
  getItemById(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<ScheduleItem | null>;
  createItem(input: CreateScheduleItemGatewayInput): Promise<ScheduleItem>;
  updateItem(input: UpdateScheduleItemGatewayInput): Promise<ScheduleItem>;
  listEligibleMembers(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleMemberOption[]>;
  setCollaboration(
    input: SetScheduleCollaborationGatewayInput
  ): Promise<ScheduleItem>;
  completeItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem>;
  reopenItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem>;
  cancelItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem>;
  listCollaborationRevisions(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleCollaborationRevision[]>;
  listAudit(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleItemAuditEntry[]>;
  clearAllSessionData(): void;
}

export interface ScheduleOccurrenceGateway {
  materializeOccurrences(
    organizationId: string,
    scheduleItemId: string,
    from: string,
    to: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleOccurrence[]>;
  completeOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence>;
  reopenOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence>;
  cancelOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence>;
  listOccurrenceAudit(
    organizationId: string,
    occurrenceId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleOccurrenceAuditEntry[]>;
  clearAllSessionData(): void;
}

export interface ScheduleApplicationContext {
  readonly organizationId: string;
  readonly actor: {
    readonly userId: string;
    readonly role: OrganizationRole;
    readonly isActive: boolean;
    readonly permissions: readonly Permission[];
  };
}

export type ScheduleDomainErrorCode =
  | 'ORGANIZATION_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'ITEM_NOT_FOUND'
  | 'OCCURRENCE_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'INVALID_DATE'
  | 'INVALID_TIME_ZONE'
  | 'INVALID_RECURRENCE'
  | 'CONCURRENCY_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'SOURCE_OWNED'
  | 'STATUS_LOCKED'
  | 'COLLABORATOR_INELIGIBLE'
  | 'COLLABORATOR_DUPLICATE'
  | 'RESPONSIBLE_MISMATCH'
  | 'INVALID_TRANSITION'
  | 'NO_CHANGES'
  | 'SERVICE_UNAVAILABLE';

export class ScheduleDomainError extends Error {
  constructor(
    public readonly code: ScheduleDomainErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ScheduleDomainError';
  }
}

export const DEFAULT_SCHEDULE_RECURRENCE: ScheduleRecurrenceDefinition =
  Object.freeze({
    frequency: 'none',
    interval: 1,
    weekdays: Object.freeze([]) as readonly number[],
    endsAt: null,
  });
