import {
  NotificationDomainError,
  type NotificationGateway,
  type NotificationPreference,
  type NotificationSnapshot,
  type SetNotificationPreferenceInput,
} from './types';

function unavailable(): NotificationDomainError {
  return new NotificationDomainError(
    'SERVICE_UNAVAILABLE',
    'A central de notificações exige a conexão segura com o Supabase.'
  );
}

export class UnavailableNotificationGateway implements NotificationGateway {
  async syncInternal(): Promise<void> {
    throw unavailable();
  }

  async getSnapshot(): Promise<NotificationSnapshot> {
    throw unavailable();
  }

  async getPreferences(): Promise<readonly NotificationPreference[]> {
    throw unavailable();
  }

  async setPreference(
    _input: SetNotificationPreferenceInput
  ): Promise<NotificationPreference> {
    throw unavailable();
  }

  async markRead(): Promise<void> {
    throw unavailable();
  }

  async markAllRead(): Promise<number> {
    throw unavailable();
  }

  subscribe(): () => void {
    return () => undefined;
  }

  clearAllSessionData(): void {
    // Não há dados de sessão.
  }
}
