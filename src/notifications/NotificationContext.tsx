import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/useAuth';
import { useAuthorization } from '../authorization/useAuthorization';
import { useOrganization } from '../organization/useOrganization';
import { getNotificationGateway } from './gatewayFactory';
import {
  NOTIFICATION_CATEGORIES,
  NotificationDomainError,
  type InternalNotification,
  type NotificationCategory,
  type NotificationCenterStatus,
  type NotificationPreference,
} from './types';

interface NotificationContextValue {
  readonly status: NotificationCenterStatus;
  readonly isEnabled: boolean;
  readonly notifications: readonly InternalNotification[];
  readonly unreadCount: number;
  readonly preferences: readonly NotificationPreference[];
  readonly errorMessage: string | null;
  readonly refresh: () => Promise<void>;
  readonly markRead: (notificationId: string) => Promise<void>;
  readonly markAllRead: () => Promise<void>;
  readonly setPreference: (
    category: NotificationCategory,
    enabled: boolean
  ) => Promise<void>;
}

export const NotificationContext =
  createContext<NotificationContextValue | null>(null);

function secureCommandId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) =>
      value.toString(16).padStart(2, '0')
    ).join('');
  }
  throw new NotificationDomainError(
    'SERVICE_UNAVAILABLE',
    'O navegador não oferece geração segura para registrar a preferência.'
  );
}

function emptyPreferences(): readonly NotificationPreference[] {
  return NOTIFICATION_CATEGORIES.map((category) => ({
    category,
    enabled: true,
    version: 0,
  }));
}

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Não foi possível atualizar a central de notificações.';
}

export function NotificationProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const { user, isAuthenticated } = useAuth();
  const { can } = useAuthorization();
  const { status: organizationStatus, activeOrganization } =
    useOrganization();

  const gateway = useMemo(() => getNotificationGateway(), []);
  const canViewSchedule = can('schedule:view');
  const organizationId = activeOrganization?.id ?? null;
  const userId = user?.id ?? null;
  const isEnabled =
    Boolean(isAuthenticated && userId && organizationId) &&
    organizationStatus === 'active' &&
    canViewSchedule;

  const [status, setStatus] =
    useState<NotificationCenterStatus>('disabled');
  const [notifications, setNotifications] = useState<
    readonly InternalNotification[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] =
    useState<readonly NotificationPreference[]>(emptyPreferences);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestSequence = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const load = useCallback(
    async (options?: { readonly sync?: boolean; readonly silent?: boolean }) => {
      if (!isEnabled || !organizationId) {
        abortRef.current?.abort();
        setStatus('disabled');
        setNotifications([]);
        setUnreadCount(0);
        setPreferences(emptyPreferences());
        setErrorMessage(null);
        return;
      }

      const sequence = ++requestSequence.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!options?.silent) setStatus('loading');
      setErrorMessage(null);

      try {
        if (options?.sync !== false) {
          const now = Date.now();
          const from = new Date(now - 30 * 24 * 60 * 60 * 1000);
          const to = new Date(now + 31 * 24 * 60 * 60 * 1000);
          await gateway.syncInternal(
            organizationId,
            from.toISOString(),
            to.toISOString()
          );
        }

        const [snapshot, nextPreferences] = await Promise.all([
          gateway.getSnapshot(organizationId, 50, controller.signal),
          gateway.getPreferences(organizationId, controller.signal),
        ]);

        if (
          controller.signal.aborted ||
          !mountedRef.current ||
          requestSequence.current !== sequence
        ) {
          return;
        }

        setNotifications(snapshot.notifications);
        setUnreadCount(snapshot.unreadCount);
        setPreferences(nextPreferences);
        setStatus('ready');
      } catch (error) {
        if (
          controller.signal.aborted ||
          !mountedRef.current ||
          requestSequence.current !== sequence
        ) {
          return;
        }

        const domainError =
          error instanceof NotificationDomainError ? error : null;
        setStatus(
          domainError?.code === 'SERVICE_UNAVAILABLE'
            ? 'unavailable'
            : 'error'
        );
        setErrorMessage(messageFromError(error));
      }
    },
    [gateway, isEnabled, organizationId]
  );

  useEffect(() => {
    if (!isEnabled || !organizationId || !userId) {
      void load({ sync: false });
      return;
    }

    void load();

    let refreshTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    const scheduleRealtimeRefresh = () => {
      if (refreshTimer !== null) {
        globalThis.clearTimeout(refreshTimer);
      }
      refreshTimer = globalThis.setTimeout(() => {
        refreshTimer = null;
        void load({ sync: false, silent: true });
      }, 120);
    };

    const unsubscribe = gateway.subscribe(
      organizationId,
      userId,
      scheduleRealtimeRefresh
    );

    const interval = globalThis.setInterval(() => {
      void load({ silent: true });
    }, 60_000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsubscribe();
      globalThis.clearInterval(interval);
      if (refreshTimer !== null) globalThis.clearTimeout(refreshTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [gateway, isEnabled, load, organizationId, userId]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!isEnabled || !organizationId) return;
      try {
        await gateway.markRead(organizationId, notificationId);
        await load({ sync: false, silent: true });
      } catch (error) {
        setErrorMessage(messageFromError(error));
        throw error;
      }
    },
    [gateway, isEnabled, load, organizationId]
  );

  const markAllRead = useCallback(async () => {
    if (!isEnabled || !organizationId) return;
    try {
      await gateway.markAllRead(organizationId);
      await load({ sync: false, silent: true });
    } catch (error) {
      setErrorMessage(messageFromError(error));
      throw error;
    }
  }, [gateway, isEnabled, load, organizationId]);

  const setPreference = useCallback(
    async (category: NotificationCategory, enabled: boolean) => {
      if (!isEnabled || !organizationId) return;
      const current =
        preferences.find((item) => item.category === category) ?? {
          category,
          enabled: true,
          version: 0,
        };

      if (current.enabled === enabled) return;

      try {
        await gateway.setPreference({
          organizationId,
          category,
          enabled,
          expectedVersion: current.version,
          idempotencyKey: secureCommandId(),
        });
        await load({ sync: false, silent: true });
      } catch (error) {
        setErrorMessage(messageFromError(error));
        await load({ sync: false, silent: true });
        throw error;
      }
    },
    [gateway, isEnabled, load, organizationId, preferences]
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      status,
      isEnabled,
      notifications,
      unreadCount,
      preferences,
      errorMessage,
      refresh,
      markRead,
      markAllRead,
      setPreference,
    }),
    [
      errorMessage,
      isEnabled,
      markAllRead,
      markRead,
      notifications,
      preferences,
      refresh,
      setPreference,
      status,
      unreadCount,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
