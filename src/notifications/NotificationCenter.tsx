import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bell,
  Check,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from './useNotifications';
import {
  NOTIFICATION_CATEGORY_LABELS,
  type InternalNotification,
  type NotificationCategory,
} from './types';

interface NotificationCenterProps {
  readonly variant?: 'light' | 'dark';
}

function formatInstant(value: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return 'Horário indisponível';
  }
}

function safeRoute(route: string | null): string | null {
  if (
    !route ||
    !route.startsWith('/') ||
    route.startsWith('//') ||
    route.includes('://')
  ) {
    return null;
  }
  return route;
}

function NotificationRow({
  notification,
  onRead,
  onOpen,
}: {
  readonly notification: InternalNotification;
  readonly onRead: (id: string) => Promise<void>;
  readonly onOpen: (notification: InternalNotification) => Promise<void>;
}) {
  const isUnread = notification.readAt === null;

  return (
    <article
      className={
        'rounded-xl border p-3 ' +
        (isUnread
          ? 'border-[#78C89A]/60 bg-[#78C89A]/10'
          : 'border-[#0B3D2E]/15 bg-white')
      }
      data-notification-unread={isUnread ? 'true' : 'false'}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={
            'mt-1 h-2.5 w-2.5 shrink-0 rounded-full ' +
            (isUnread ? 'bg-[#0B3D2E]' : 'bg-[#0B3D2E]/20')
          }
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h4 className="break-words text-sm font-semibold text-[#0B3D2E]">
            {notification.title}
          </h4>
          <p className="mt-1 break-words text-xs leading-5 text-[#0B3D2E]/75">
            {notification.message}
          </p>
          <p className="mt-2 text-[11px] font-medium text-[#0B3D2E]/55">
            {formatInstant(notification.availableAt)}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {safeRoute(notification.route) && (
              <button
                type="button"
                className="min-h-[40px] rounded-lg bg-[#0B3D2E] px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#78C89A]"
                onClick={() => void onOpen(notification)}
              >
                Abrir
              </button>
            )}

            {isUnread && (
              <button
                type="button"
                className="min-h-[40px] rounded-lg border border-[#0B3D2E]/25 bg-white px-3 py-2 text-xs font-semibold text-[#0B3D2E] focus:outline-none focus:ring-2 focus:ring-[#78C89A]"
                onClick={() => void onRead(notification.id)}
              >
                Marcar como lida
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function NotificationCenter({
  variant = 'light',
}: NotificationCenterProps) {
  const navigate = useNavigate();
  const {
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
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [busyPreference, setBusyPreference] =
    useState<NotificationCategory | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const displayedCount = unreadCount > 99 ? '99+' : String(unreadCount);
  const liveLabel = useMemo(
    () =>
      unreadCount === 0
        ? 'Nenhuma notificação não lida'
        : unreadCount === 1
          ? '1 notificação não lida'
          : `${unreadCount} notificações não lidas`,
    [unreadCount]
  );

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        rootRef.current &&
        !rootRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!isEnabled) return null;

  const handleRead = async (notificationId: string) => {
    setBusyAction(true);
    try {
      await markRead(notificationId);
    } catch {
      // O contexto já expõe a mensagem sanitizada no painel.
    } finally {
      setBusyAction(false);
    }
  };

  const handleOpen = async (notification: InternalNotification) => {
    setBusyAction(true);
    try {
      if (!notification.readAt) await markRead(notification.id);
      const route = safeRoute(notification.route);
      if (route) {
        setOpen(false);
        navigate(route);
      }
    } catch {
      // Não navega se a confirmação de leitura falhar.
    } finally {
      setBusyAction(false);
    }
  };

  const handleMarkAll = async () => {
    setBusyAction(true);
    try {
      await markAllRead();
    } catch {
      // O erro permanece visível no painel por meio do contexto.
    } finally {
      setBusyAction(false);
    }
  };

  const handlePreference = async (
    category: NotificationCategory,
    enabled: boolean
  ) => {
    setBusyPreference(category);
    try {
      await setPreference(category, enabled);
    } catch {
      // O contexto recarrega a versão remota e desfaz estado otimista incorreto.
    } finally {
      setBusyPreference(null);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Central de notificações. ${liveLabel}`}
        aria-expanded={open}
        aria-controls="agrocore-notification-center-panel"
        className={
          'relative inline-flex h-11 w-11 items-center justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-[#78C89A] ' +
          (variant === 'dark'
            ? 'text-white hover:bg-white/10'
            : 'border border-[#0B3D2E]/15 bg-white text-[#0B3D2E] hover:bg-[#78C89A]/10')
        }
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#78C89A] px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-[#0B3D2E] ring-2 ring-white"
            aria-hidden="true"
          >
            {displayedCount}
          </span>
        )}
      </button>

      <span className="sr-only" aria-live="polite">
        {liveLabel}
      </span>

      {open && (
        <section
          id="agrocore-notification-center-panel"
          role="dialog"
          aria-label="Central de notificações"
          className="absolute right-0 top-[calc(100%+0.65rem)] z-50 flex max-h-[min(76vh,680px)] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[#0B3D2E]/15 bg-white text-[#0B3D2E] shadow-2xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-[#0B3D2E]/10 p-4">
            <div className="min-w-0">
              <h3 className="text-base font-bold">Notificações</h3>
              <p className="mt-1 text-xs text-[#0B3D2E]/65">
                {liveLabel}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#0B3D2E] hover:bg-[#78C89A]/15 focus:outline-none focus:ring-2 focus:ring-[#78C89A]"
                aria-label="Atualizar notificações"
                disabled={status === 'loading' || busyAction}
                onClick={() => void refresh().catch(() => undefined)}
              >
                <RefreshCw
                  className={
                    'h-4 w-4 ' +
                    (status === 'loading' ? 'animate-spin' : '')
                  }
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                className={
                  'inline-flex h-10 w-10 items-center justify-center rounded-lg focus:outline-none focus:ring-2 focus:ring-[#78C89A] ' +
                  (showPreferences
                    ? 'bg-[#0B3D2E] text-white'
                    : 'text-[#0B3D2E] hover:bg-[#78C89A]/15')
                }
                aria-label="Preferências de notificações"
                aria-pressed={showPreferences}
                onClick={() =>
                  setShowPreferences((current) => !current)
                }
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          {errorMessage && (
            <div
              role="alert"
              className="mx-4 mt-3 rounded-xl border border-[#0B3D2E]/20 bg-[#78C89A]/10 p-3 text-xs font-medium"
            >
              {errorMessage}
            </div>
          )}

          {showPreferences && (
            <fieldset className="border-b border-[#0B3D2E]/10 p-4">
              <legend className="text-sm font-semibold">
                Preferências internas
              </legend>
              <p className="mt-1 text-xs text-[#0B3D2E]/65">
                Estas opções afetam somente avisos dentro do AgroCore.
              </p>
              <div className="mt-3 grid gap-2">
                {preferences.map((preference) => (
                  <label
                    key={preference.category}
                    className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#0B3D2E]/15 bg-white px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      {NOTIFICATION_CATEGORY_LABELS[preference.category]}
                    </span>
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[#0B3D2E]"
                      checked={preference.enabled}
                      disabled={busyPreference === preference.category}
                      onChange={(event) =>
                        void handlePreference(
                          preference.category,
                          event.target.checked
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="flex items-center justify-between gap-3 border-b border-[#0B3D2E]/10 px-4 py-3">
            <span className="text-xs font-semibold">
              Avisos válidos e disponíveis
            </span>
            <button
              type="button"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#0B3D2E] hover:bg-[#78C89A]/15 focus:outline-none focus:ring-2 focus:ring-[#78C89A] disabled:opacity-50"
              disabled={unreadCount === 0 || busyAction}
              onClick={() => void handleMarkAll()}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Marcar todas
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {status === 'unavailable' ? (
              <p className="rounded-xl border border-[#0B3D2E]/15 p-4 text-sm text-[#0B3D2E]/70">
                A central exige conexão segura com o serviço da organização.
              </p>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell
                  className="mx-auto h-7 w-7 text-[#0B3D2E]/35"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-semibold">
                  Nenhuma notificação disponível
                </p>
                <p className="mt-1 text-xs text-[#0B3D2E]/65">
                  Novos avisos aparecerão aqui quando forem válidos.
                </p>
              </div>
            ) : (
              <div className="grid gap-2.5">
                {notifications.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    onRead={handleRead}
                    onOpen={handleOpen}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
