import type { NotificationCategory } from './types';

export type ExternalNotificationChannel = 'email' | 'push';
export type ExternalNotificationPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ExternalDeliveryStatus =
  | 'queued'
  | 'processing'
  | 'retry'
  | 'blocked'
  | 'delivered'
  | 'failed'
  | 'suppressed'
  | 'expired';

export interface ExternalNotificationPreference {
  readonly channel: ExternalNotificationChannel;
  readonly enabled: boolean;
  readonly version: number;
}

export interface ExternalChannelCapabilities {
  readonly emailConfigured: boolean;
  readonly pushConfigured: boolean;
  readonly vapidPublicKey: string | null;
}

export interface NotificationEscalationPolicy {
  readonly category: NotificationCategory;
  readonly emailEnabled: boolean;
  readonly pushEnabled: boolean;
  readonly minimumPriority: ExternalNotificationPriority;
  readonly delayMinutes: number;
  readonly criticalPriority: ExternalNotificationPriority;
  readonly criticalDelayMinutes: number;
  readonly maxAttempts: number;
  readonly version: number;
}

export interface ExternalDeliverySummary {
  readonly id: string;
  readonly notificationId: string;
  readonly channel: ExternalNotificationChannel;
  readonly status: ExternalDeliveryStatus;
  readonly priority: ExternalNotificationPriority;
  readonly scheduledAt: string;
  readonly nextAttemptAt: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly deliveredAt: string | null;
  readonly lastErrorCode: string | null;
}

export interface UpdateEscalationPolicyInput {
  readonly organizationId: string;
  readonly policy: NotificationEscalationPolicy;
  readonly idempotencyKey: string;
}

export const EXTERNAL_CHANNEL_LABELS: Readonly<Record<ExternalNotificationChannel, string>> =
  Object.freeze({
    email: 'E-mail',
    push: 'Notificação do dispositivo',
  });

export const EXTERNAL_DELIVERY_STATUS_LABELS: Readonly<Record<ExternalDeliveryStatus, string>> =
  Object.freeze({
    queued: 'Na fila',
    processing: 'Enviando',
    retry: 'Nova tentativa agendada',
    blocked: 'Canal indisponível',
    delivered: 'Entregue',
    failed: 'Falha definitiva',
    suppressed: 'Cancelada por preferência ou estado',
    expired: 'Expirada',
  });

export const EXTERNAL_PRIORITY_LABELS: Readonly<Record<ExternalNotificationPriority, string>> =
  Object.freeze({
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    urgent: 'Urgente',
  });

export const EXTERNAL_PRIORITIES: readonly ExternalNotificationPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
] as const;
