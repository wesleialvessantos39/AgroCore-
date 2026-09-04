import type { SupabaseClient } from '@supabase/supabase-js';
import {
  NotificationDomainError,
  type InternalNotification,
  type NotificationCategory,
  type NotificationGateway,
  type NotificationPreference,
  type NotificationSnapshot,
  type SetNotificationPreferenceInput,
} from './types';

interface RpcError {
  readonly code?: string;
  readonly message?: string;
}

interface RpcResult {
  readonly data: unknown;
  readonly error: RpcError | null;
}

interface PreferenceRow {
  readonly category: NotificationCategory;
  readonly enabled: boolean;
  readonly version: number;
}

function mapError(error: RpcError | null): Error {
  const message = error?.message ?? '';

  if (
    message.includes('AGROCORE_NOTIFICATION_FORBIDDEN') ||
    message.includes('AGROCORE_NOTIFICATION_INVALID_INPUT_OR_FORBIDDEN')
  ) {
    return new NotificationDomainError(
      'PERMISSION_DENIED',
      'Você não possui permissão para acessar as notificações desta organização.'
    );
  }

  if (message.includes('AGROCORE_NOTIFICATION_NOT_FOUND')) {
    return new NotificationDomainError(
      'NOT_FOUND',
      'A notificação não foi encontrada ou não pertence ao usuário atual.'
    );
  }

  if (message.includes('AGROCORE_NOTIFICATION_CONCURRENCY_CONFLICT')) {
    return new NotificationDomainError(
      'CONCURRENCY_CONFLICT',
      'A preferência foi alterada em outra sessão. Atualize e tente novamente.'
    );
  }

  if (message.includes('AGROCORE_NOTIFICATION_IDEMPOTENCY_CONFLICT')) {
    return new NotificationDomainError(
      'IDEMPOTENCY_CONFLICT',
      'A chave desta operação já foi utilizada com outro conteúdo.'
    );
  }

  if (
    message.includes('AGROCORE_NOTIFICATION_INVALID_INPUT') ||
    message.includes('AGROCORE_NOTIFICATION_FORBIDDEN_OR_INVALID_WINDOW')
  ) {
    return new NotificationDomainError(
      'INVALID_INPUT',
      'Os dados informados para a central de notificações são inválidos.'
    );
  }

  return new NotificationDomainError(
    'SERVICE_UNAVAILABLE',
    'A central de notificações está indisponível neste momento.'
  );
}

function isTransient(error: RpcError | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  return (
    code.startsWith('08') ||
    ['PGRST000', 'PGRST001', 'PGRST002', '53300', '57P01', '57P02', '57P03']
      .includes(code) ||
    /failed to fetch|network|timeout|timed out|connection reset|connection refused|502|503|504|bad gateway|service unavailable|gateway timeout/i
      .test(error.message ?? '')
  );
}

async function executeWithRetry(
  operation: () => PromiseLike<RpcResult>
): Promise<RpcResult> {
  const delays = [0, 200, 600] as const;
  let last: RpcResult = {
    data: null,
    error: { message: 'Falha de comunicação com a central de notificações.' },
  };

  for (const delay of delays) {
    if (delay > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
    }
    last = await operation();
    if (!last.error || !isTransient(last.error)) return last;
  }

  return last;
}

function safeInternalRoute(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('://') ||
    value.length > 500
  ) {
    return null;
  }
  return value;
}

function mapNotification(value: unknown): InternalNotification | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const category = row.category;

  if (
    category !== 'schedule_assignment' &&
    category !== 'schedule_deadline' &&
    category !== 'schedule_status'
  ) {
    return null;
  }

  if (
    typeof row.id !== 'string' ||
    typeof row.organizationId !== 'string' ||
    typeof row.recipientUserId !== 'string' ||
    typeof row.type !== 'string' ||
    typeof row.title !== 'string' ||
    typeof row.message !== 'string' ||
    typeof row.sourceDomain !== 'string' ||
    typeof row.sourceId !== 'string' ||
    typeof row.sourceEventKey !== 'string' ||
    typeof row.availableAt !== 'string' ||
    typeof row.expiresAt !== 'string' ||
    typeof row.createdAt !== 'string' ||
    typeof row.version !== 'number'
  ) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organizationId,
    recipientUserId: row.recipientUserId,
    category,
    type: row.type,
    title: row.title,
    message: row.message,
    sourceDomain: row.sourceDomain,
    sourceId: row.sourceId,
    sourceEventKey: row.sourceEventKey,
    route: safeInternalRoute(row.route),
    availableAt: row.availableAt,
    expiresAt: row.expiresAt,
    readAt: typeof row.readAt === 'string' ? row.readAt : null,
    createdAt: row.createdAt,
    version: row.version,
  };
}

function mapPreference(value: unknown): NotificationPreference | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<PreferenceRow>;

  if (
    row.category !== 'schedule_assignment' &&
    row.category !== 'schedule_deadline' &&
    row.category !== 'schedule_status'
  ) {
    return null;
  }
  if (typeof row.enabled !== 'boolean' || typeof row.version !== 'number') {
    return null;
  }

  return {
    category: row.category,
    enabled: row.enabled,
    version: row.version,
  };
}

function firstValue(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

function payloadOrganizationId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as {
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
  };
  const row = candidate.new ?? candidate.old;
  return typeof row?.organization_id === 'string'
    ? row.organization_id
    : null;
}

export class SupabaseNotificationGateway implements NotificationGateway {
  constructor(private readonly client: SupabaseClient) {}

  async syncInternal(
    organizationId: string,
    from: string,
    to: string
  ): Promise<void> {
    const { error } = await executeWithRetry(() =>
      this.client.rpc('agrocore_sync_internal_notifications', {
        p_organization_id: organizationId,
        p_from: from,
        p_to: to,
      })
    );
    if (error) throw mapError(error);
  }

  async getSnapshot(
    organizationId: string,
    limit = 50,
    signal?: AbortSignal
  ): Promise<NotificationSnapshot> {
    const { data, error } = await executeWithRetry(() => {
      const request = this.client.rpc('agrocore_notification_snapshot', {
        p_organization_id: organizationId,
        p_limit: limit,
      });
      return signal ? request.abortSignal(signal) : request;
    });
    if (error) throw mapError(error);

    const raw =
      data && typeof data === 'object'
        ? (data as Record<string, unknown>)
        : {};
    const notifications = Array.isArray(raw.notifications)
      ? raw.notifications
          .map(mapNotification)
          .filter(
            (item): item is InternalNotification => item !== null
          )
      : [];
    const unreadValue = raw.unreadCount;
    const unreadCount =
      typeof unreadValue === 'number'
        ? unreadValue
        : typeof unreadValue === 'string'
          ? Number.parseInt(unreadValue, 10) || 0
          : 0;

    return {
      notifications,
      unreadCount: Math.max(0, unreadCount),
    };
  }

  async getPreferences(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly NotificationPreference[]> {
    const { data, error } = await executeWithRetry(() => {
      const request = this.client.rpc(
        'agrocore_get_notification_preferences',
        { p_organization_id: organizationId }
      );
      return signal ? request.abortSignal(signal) : request;
    });
    if (error) throw mapError(error);

    return (Array.isArray(data) ? data : [])
      .map(mapPreference)
      .filter(
        (item): item is NotificationPreference => item !== null
      );
  }

  async setPreference(
    input: SetNotificationPreferenceInput
  ): Promise<NotificationPreference> {
    const { data, error } = await executeWithRetry(() =>
      this.client.rpc('agrocore_set_notification_preference', {
        p_organization_id: input.organizationId,
        p_category: input.category,
        p_enabled: input.enabled,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
      })
    );
    if (error) throw mapError(error);

    const preference = mapPreference(firstValue(data));
    if (!preference) {
      throw new NotificationDomainError(
        'SERVICE_UNAVAILABLE',
        'O banco não confirmou a preferência de notificação.'
      );
    }
    return preference;
  }

  async markRead(
    organizationId: string,
    notificationId: string
  ): Promise<void> {
    const { error } = await executeWithRetry(() =>
      this.client.rpc('agrocore_mark_notification_read', {
        p_organization_id: organizationId,
        p_notification_id: notificationId,
      })
    );
    if (error) throw mapError(error);
  }

  async markAllRead(organizationId: string): Promise<number> {
    const { data, error } = await executeWithRetry(() =>
      this.client.rpc('agrocore_mark_all_notifications_read', {
        p_organization_id: organizationId,
      })
    );
    if (error) throw mapError(error);
    return typeof data === 'number' ? data : Number(data) || 0;
  }

  subscribe(
    organizationId: string,
    userId: string,
    onChange: () => void
  ): () => void {
    const channel = this.client
      .channel(`agrocore-notifications:${organizationId}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const payloadOrg = payloadOrganizationId(payload);
          if (!payloadOrg || payloadOrg === organizationId) onChange();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_preferences',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const payloadOrg = payloadOrganizationId(payload);
          if (!payloadOrg || payloadOrg === organizationId) onChange();
        }
      )
      .subscribe();

    return () => {
      void this.client.removeChannel(channel);
    };
  }

  clearAllSessionData(): void {
    // Persistência empresarial fica no Supabase; o gateway não mantém cache local.
  }
}
