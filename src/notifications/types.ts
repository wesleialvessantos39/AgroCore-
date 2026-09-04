export type NotificationCategory =
  | 'schedule_assignment'
  | 'schedule_deadline'
  | 'schedule_status';

export type NotificationCenterStatus =
  | 'disabled'
  | 'loading'
  | 'ready'
  | 'error'
  | 'unavailable';

export interface InternalNotification {
  readonly id: string;
  readonly organizationId: string;
  readonly recipientUserId: string;
  readonly category: NotificationCategory;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly sourceDomain: string;
  readonly sourceId: string;
  readonly sourceEventKey: string;
  readonly route: string | null;
  readonly availableAt: string;
  readonly expiresAt: string;
  readonly readAt: string | null;
  readonly createdAt: string;
  readonly version: number;
}

export interface NotificationPreference {
  readonly category: NotificationCategory;
  readonly enabled: boolean;
  readonly version: number;
}

export interface NotificationSnapshot {
  readonly notifications: readonly InternalNotification[];
  readonly unreadCount: number;
}

export interface SetNotificationPreferenceInput {
  readonly organizationId: string;
  readonly category: NotificationCategory;
  readonly enabled: boolean;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export type NotificationDomainErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'CONCURRENCY_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_INPUT'
  | 'SERVICE_UNAVAILABLE';

export class NotificationDomainError extends Error {
  readonly code: NotificationDomainErrorCode;

  constructor(code: NotificationDomainErrorCode, message: string) {
    super(message);
    this.name = 'NotificationDomainError';
    this.code = code;
  }
}

export interface NotificationGateway {
  syncInternal(
    organizationId: string,
    from: string,
    to: string
  ): Promise<void>;

  getSnapshot(
    organizationId: string,
    limit?: number,
    signal?: AbortSignal
  ): Promise<NotificationSnapshot>;

  getPreferences(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly NotificationPreference[]>;

  setPreference(
    input: SetNotificationPreferenceInput
  ): Promise<NotificationPreference>;

  markRead(
    organizationId: string,
    notificationId: string
  ): Promise<void>;

  markAllRead(organizationId: string): Promise<number>;

  subscribe(
    organizationId: string,
    userId: string,
    onChange: () => void
  ): () => void;

  clearAllSessionData(): void;
}

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'schedule_assignment',
  'schedule_deadline',
  'schedule_status',
] as const;

export const NOTIFICATION_CATEGORY_LABELS: Readonly<
  Record<NotificationCategory, string>
> = Object.freeze({
  schedule_assignment: 'Atribuições e participações',
  schedule_deadline: 'Prazos e recorrências',
  schedule_status: 'Mudanças de situação',
});
