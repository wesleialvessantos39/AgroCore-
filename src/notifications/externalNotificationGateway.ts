import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import type { NotificationCategory } from './types';
import type {
  ExternalChannelCapabilities,
  ExternalDeliveryStatus,
  ExternalDeliverySummary,
  ExternalNotificationChannel,
  ExternalNotificationPreference,
  ExternalNotificationPriority,
  NotificationEscalationPolicy,
  UpdateEscalationPolicyInput,
} from './externalTypes';

interface RpcError {
  readonly code?: string;
  readonly message?: string;
}

interface RpcResult {
  readonly data: unknown;
  readonly error: RpcError | null;
}

const TRANSIENT_CODES = new Set([
  'PGRST000',
  'PGRST001',
  'PGRST002',
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

function isTransient(error: RpcError | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  return (
    code.startsWith('08') ||
    TRANSIENT_CODES.has(code) ||
    /failed to fetch|network|timeout|timed out|connection reset|connection refused|502|503|504|bad gateway|service unavailable|gateway timeout/i.test(
      error.message ?? ''
    )
  );
}

async function executeWithRetry(
  operation: () => PromiseLike<RpcResult>
): Promise<RpcResult> {
  const delays = [0, 200, 600] as const;
  let last: RpcResult = {
    data: null,
    error: { message: 'Falha de comunicação com os canais externos.' },
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

function externalError(error: RpcError | null): Error {
  const message = error?.message ?? '';
  if (message.includes('CONCURRENCY_CONFLICT')) {
    return new Error('A configuração foi alterada em outra sessão. Atualize e tente novamente.');
  }
  if (message.includes('IDEMPOTENCY_CONFLICT')) {
    return new Error('A mesma operação já foi registrada com outro conteúdo.');
  }
  if (message.includes('FORBIDDEN')) {
    return new Error('Você não possui permissão para alterar esta configuração.');
  }
  if (message.includes('INVALID_INPUT')) {
    return new Error('A configuração informada não é válida.');
  }
  return new Error('Os canais externos estão temporariamente indisponíveis.');
}

function firstValue(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

function isCategory(value: unknown): value is NotificationCategory {
  return (
    value === 'schedule_assignment' ||
    value === 'schedule_deadline' ||
    value === 'schedule_status'
  );
}

function isPriority(value: unknown): value is ExternalNotificationPriority {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'urgent';
}

function isChannel(value: unknown): value is ExternalNotificationChannel {
  return value === 'email' || value === 'push';
}

function isStatus(value: unknown): value is ExternalDeliveryStatus {
  return (
    value === 'queued' ||
    value === 'processing' ||
    value === 'retry' ||
    value === 'blocked' ||
    value === 'delivered' ||
    value === 'failed' ||
    value === 'suppressed' ||
    value === 'expired'
  );
}

function mapPreference(value: unknown): ExternalNotificationPreference | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!isChannel(row.channel) || typeof row.enabled !== 'boolean' || typeof row.version !== 'number') {
    return null;
  }
  return { channel: row.channel, enabled: row.enabled, version: row.version };
}

function mapPolicy(value: unknown): NotificationEscalationPolicy | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const minimumPriority = row.minimum_priority ?? row.minimumPriority;
  const criticalPriority = row.critical_priority ?? row.criticalPriority;
  const delayMinutes = row.delay_minutes ?? row.delayMinutes;
  const criticalDelayMinutes = row.critical_delay_minutes ?? row.criticalDelayMinutes;
  const maxAttempts = row.max_attempts ?? row.maxAttempts;
  const emailEnabled = row.email_enabled ?? row.emailEnabled;
  const pushEnabled = row.push_enabled ?? row.pushEnabled;

  if (
    !isCategory(row.category) ||
    typeof emailEnabled !== 'boolean' ||
    typeof pushEnabled !== 'boolean' ||
    !isPriority(minimumPriority) ||
    !isPriority(criticalPriority) ||
    typeof delayMinutes !== 'number' ||
    typeof criticalDelayMinutes !== 'number' ||
    typeof maxAttempts !== 'number' ||
    typeof row.version !== 'number'
  ) {
    return null;
  }

  return {
    category: row.category,
    emailEnabled,
    pushEnabled,
    minimumPriority,
    delayMinutes,
    criticalPriority,
    criticalDelayMinutes,
    maxAttempts,
    version: row.version,
  };
}

function mapDelivery(value: unknown): ExternalDeliverySummary | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const notificationId = row.notification_id ?? row.notificationId;
  const scheduledAt = row.scheduled_at ?? row.scheduledAt;
  const nextAttemptAt = row.next_attempt_at ?? row.nextAttemptAt;
  const attemptCount = row.attempt_count ?? row.attemptCount;
  const maxAttempts = row.max_attempts ?? row.maxAttempts;
  const deliveredAt = row.delivered_at ?? row.deliveredAt;
  const lastErrorCode = row.last_error_code ?? row.lastErrorCode;

  if (
    typeof row.id !== 'string' ||
    typeof notificationId !== 'string' ||
    !isChannel(row.channel) ||
    !isStatus(row.status) ||
    !isPriority(row.priority) ||
    typeof scheduledAt !== 'string' ||
    typeof nextAttemptAt !== 'string' ||
    typeof attemptCount !== 'number' ||
    typeof maxAttempts !== 'number'
  ) {
    return null;
  }

  return {
    id: row.id,
    notificationId,
    channel: row.channel,
    status: row.status,
    priority: row.priority,
    scheduledAt,
    nextAttemptAt,
    attemptCount,
    maxAttempts,
    deliveredAt: typeof deliveredAt === 'string' ? deliveredAt : null,
    lastErrorCode: typeof lastErrorCode === 'string' ? lastErrorCode : null,
  };
}

export class ExternalNotificationGateway {
  constructor(private readonly client: SupabaseClient) {}

  async getCapabilities(): Promise<ExternalChannelCapabilities> {
    let result: RpcResult = { data: null, error: null };
    for (const delay of [0, 200, 600] as const) {
      if (delay > 0) await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
      const response = await this.client.functions.invoke('notification-channel-config', { body: {} });
      result = { data: response.data, error: response.error };
      if (!result.error || !isTransient(result.error)) break;
    }
    if (result.error) throw externalError(result.error);
    const value = result.data && typeof result.data === 'object'
      ? result.data as Record<string, unknown>
      : {};
    return {
      emailConfigured: value.emailConfigured === true,
      pushConfigured: value.pushConfigured === true,
      vapidPublicKey: typeof value.vapidPublicKey === 'string' ? value.vapidPublicKey : null,
    };
  }

  async getPreferences(organizationId: string): Promise<readonly ExternalNotificationPreference[]> {
    const { data, error } = await executeWithRetry(() =>
      this.client.rpc('agrocore_get_external_notification_preferences', {
        p_organization_id: organizationId,
      })
    );
    if (error) throw externalError(error);
    return (Array.isArray(data) ? data : []).map(mapPreference).filter(
      (item): item is ExternalNotificationPreference => item !== null
    );
  }

  async setPreference(
    organizationId: string,
    preference: ExternalNotificationPreference,
    enabled: boolean,
    idempotencyKey: string
  ): Promise<ExternalNotificationPreference> {
    const { data, error } = await executeWithRetry(() =>
      this.client.rpc('agrocore_set_external_notification_preference', {
        p_organization_id: organizationId,
        p_channel: preference.channel,
        p_enabled: enabled,
        p_expected_version: preference.version,
        p_idempotency_key: idempotencyKey,
      })
    );
    if (error) throw externalError(error);
    const mapped = mapPreference(firstValue(data));
    if (!mapped) throw new Error('O banco não confirmou a preferência externa.');
    return mapped;
  }

  async getPolicies(organizationId: string): Promise<readonly NotificationEscalationPolicy[]> {
    const { data, error } = await executeWithRetry(() =>
      this.client.rpc('agrocore_get_notification_escalation_policies', {
        p_organization_id: organizationId,
      })
    );
    if (error) throw externalError(error);
    return (Array.isArray(data) ? data : []).map(mapPolicy).filter(
      (item): item is NotificationEscalationPolicy => item !== null
    );
  }

  async setPolicy(input: UpdateEscalationPolicyInput): Promise<NotificationEscalationPolicy> {
    const { policy } = input;
    const { data, error } = await executeWithRetry(() =>
      this.client.rpc('agrocore_set_notification_escalation_policy', {
        p_organization_id: input.organizationId,
        p_category: policy.category,
        p_email_enabled: policy.emailEnabled,
        p_push_enabled: policy.pushEnabled,
        p_minimum_priority: policy.minimumPriority,
        p_delay_minutes: policy.delayMinutes,
        p_critical_priority: policy.criticalPriority,
        p_critical_delay_minutes: policy.criticalDelayMinutes,
        p_max_attempts: policy.maxAttempts,
        p_expected_version: policy.version,
        p_idempotency_key: input.idempotencyKey,
      })
    );
    if (error) throw externalError(error);
    const mapped = mapPolicy(firstValue(data));
    if (!mapped) throw new Error('O banco não confirmou a política de escalonamento.');
    return mapped;
  }

  async registerPush(
    organizationId: string,
    subscription: { endpoint: string; p256dh: string; auth: string }
  ): Promise<void> {
    const { error } = await executeWithRetry(() =>
      this.client.rpc('agrocore_register_push_subscription', {
        p_organization_id: organizationId,
        p_endpoint: subscription.endpoint,
        p_p256dh: subscription.p256dh,
        p_auth_secret: subscription.auth,
      })
    );
    if (error) throw externalError(error);
  }

  async revokePush(organizationId: string, endpoint: string): Promise<void> {
    const { error } = await executeWithRetry(() =>
      this.client.rpc('agrocore_revoke_push_subscription', {
        p_organization_id: organizationId,
        p_endpoint: endpoint,
      })
    );
    if (error) throw externalError(error);
  }

  async getDeliveryStatus(
    organizationId: string,
    limit = 10
  ): Promise<readonly ExternalDeliverySummary[]> {
    const { data, error } = await executeWithRetry(() =>
      this.client.rpc('agrocore_external_delivery_status', {
        p_organization_id: organizationId,
        p_limit: limit,
      })
    );
    if (error) throw externalError(error);
    return (Array.isArray(data) ? data : []).map(mapDelivery).filter(
      (item): item is ExternalDeliverySummary => item !== null
    );
  }
}

export function getExternalNotificationGateway(): ExternalNotificationGateway | null {
  const client = getSupabaseClient();
  return client ? new ExternalNotificationGateway(client) : null;
}
