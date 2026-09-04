import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Smartphone, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuthorization } from '../authorization/useAuthorization';
import { useOrganization } from '../organization/useOrganization';
import { NOTIFICATION_CATEGORY_LABELS, type NotificationCategory } from './types';
import {
  EXTERNAL_CHANNEL_LABELS,
  EXTERNAL_DELIVERY_STATUS_LABELS,
  EXTERNAL_PRIORITIES,
  EXTERNAL_PRIORITY_LABELS,
  type ExternalChannelCapabilities,
  type ExternalDeliverySummary,
  type ExternalNotificationChannel,
  type ExternalNotificationPreference,
  type NotificationEscalationPolicy,
} from './externalTypes';
import { getExternalNotificationGateway } from './externalNotificationGateway';
import {
  activateBrowserPush,
  deactivateBrowserPush,
  getBrowserPushState,
  type BrowserPushState,
} from './pushSubscription';

function secureCommandId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error('O navegador não oferece geração segura para registrar esta configuração.');
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

function messageFromError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Não foi possível atualizar os canais externos.';
}

function preferenceFor(
  preferences: readonly ExternalNotificationPreference[],
  channel: ExternalNotificationChannel
): ExternalNotificationPreference {
  return preferences.find((item) => item.channel === channel) ?? {
    channel,
    enabled: false,
    version: 0,
  };
}

function priorityRank(value: NotificationEscalationPolicy['minimumPriority']): number {
  return EXTERNAL_PRIORITIES.indexOf(value) + 1;
}

function clampInteger(value: string, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function ExternalNotificationSettings() {
  const { activeOrganization } = useOrganization();
  const { can } = useAuthorization();
  const gateway = useMemo(() => getExternalNotificationGateway(), []);
  const organizationId = activeOrganization?.id ?? null;
  const canManagePolicies = can('schedule:manage');

  const [capabilities, setCapabilities] = useState<ExternalChannelCapabilities | null>(null);
  const [preferences, setPreferences] = useState<readonly ExternalNotificationPreference[]>([]);
  const [policies, setPolicies] = useState<readonly NotificationEscalationPolicy[]>([]);
  const [deliveries, setDeliveries] = useState<readonly ExternalDeliverySummary[]>([]);
  const [pushState, setPushState] = useState<BrowserPushState>({
    supported: false,
    permission: 'unsupported',
    activeEndpoint: null,
  });
  const [loading, setLoading] = useState(true);
  const [busyChannel, setBusyChannel] = useState<ExternalNotificationChannel | null>(null);
  const [busyPolicy, setBusyPolicy] = useState<NotificationCategory | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!gateway || !organizationId) {
      setLoading(false);
      setCapabilities(null);
      setPreferences([]);
      setPolicies([]);
      setDeliveries([]);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const [nextCapabilities, nextPreferences, nextDeliveries, nextPushState] =
        await Promise.all([
          gateway.getCapabilities(),
          gateway.getPreferences(organizationId),
          gateway.getDeliveryStatus(organizationId, 8),
          getBrowserPushState(),
        ]);
      const nextPolicies = canManagePolicies
        ? await gateway.getPolicies(organizationId)
        : [];
      setCapabilities(nextCapabilities);
      setPreferences(nextPreferences);
      setDeliveries(nextDeliveries);
      setPushState(nextPushState);
      setPolicies(nextPolicies);
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setLoading(false);
    }
  }, [canManagePolicies, gateway, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePreference = useCallback(
    async (channel: ExternalNotificationChannel, enabled: boolean) => {
      if (!gateway || !organizationId) return;
      const current = preferenceFor(preferences, channel);
      const saved = await gateway.setPreference(
        organizationId,
        current,
        enabled,
        secureCommandId()
      );
      setPreferences((items) => [
        ...items.filter((item) => item.channel !== channel),
        saved,
      ]);
    },
    [gateway, organizationId, preferences]
  );

  const handleEmailToggle = async (enabled: boolean) => {
    setBusyChannel('email');
    setErrorMessage(null);
    try {
      if (enabled && !capabilities?.emailConfigured) {
        throw new Error('O envio por e-mail ainda não está configurado no ambiente seguro.');
      }
      await savePreference('email', enabled);
      setDeliveries(await gateway?.getDeliveryStatus(organizationId ?? '', 8) ?? []);
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setBusyChannel(null);
    }
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (!gateway || !organizationId) return;
    setBusyChannel('push');
    setErrorMessage(null);
    try {
      if (enabled) {
        if (!capabilities?.pushConfigured || !capabilities.vapidPublicKey) {
          throw new Error('O Push ainda não está configurado no ambiente seguro.');
        }
        if (!pushState.supported) {
          throw new Error('Este navegador não oferece Web Push na versão publicada do AgroCore.');
        }
        const subscription = await activateBrowserPush(capabilities.vapidPublicKey);
        await gateway.registerPush(organizationId, subscription);
        await savePreference('push', true);
      } else {
        await savePreference('push', false);
        const endpoint = await deactivateBrowserPush();
        if (endpoint) await gateway.revokePush(organizationId, endpoint);
      }
      setPushState(await getBrowserPushState());
      setDeliveries(await gateway.getDeliveryStatus(organizationId, 8));
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setBusyChannel(null);
    }
  };

  const updatePolicy = (
    category: NotificationCategory,
    patch: Partial<NotificationEscalationPolicy>
  ) => {
    setPolicies((items) =>
      items.map((item) =>
        item.category === category ? { ...item, ...patch } : item
      )
    );
  };

  const savePolicy = async (policy: NotificationEscalationPolicy) => {
    if (!gateway || !organizationId) return;
    setBusyPolicy(policy.category);
    setErrorMessage(null);
    try {
      if (priorityRank(policy.criticalPriority) < priorityRank(policy.minimumPriority)) {
        throw new Error('A prioridade crítica não pode ser inferior à prioridade mínima.');
      }
      if (policy.emailEnabled && !capabilities?.emailConfigured) {
        throw new Error('O escalonamento por e-mail exige um provedor configurado no ambiente seguro.');
      }
      if (policy.pushEnabled && !capabilities?.pushConfigured) {
        throw new Error('O escalonamento por Push exige VAPID configurado no ambiente seguro.');
      }
      const saved = await gateway.setPolicy({
        organizationId,
        policy,
        idempotencyKey: secureCommandId(),
      });
      setPolicies((items) =>
        items.map((item) => item.category === saved.category ? saved : item)
      );
    } catch (error) {
      setErrorMessage(messageFromError(error));
      try {
        setPolicies(await gateway.getPolicies(organizationId));
      } catch {
        // Mantém a mensagem original sem substituir por erro secundário.
      }
    } finally {
      setBusyPolicy(null);
    }
  };

  if (!organizationId) return null;

  const emailPreference = preferenceFor(preferences, 'email');
  const pushPreference = preferenceFor(preferences, 'push');

  return (
    <section aria-label="Canais externos de notificações" className="border-t border-[#0B3D2E]/10 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[#0B3D2E]">Canais externos</h4>
          <p className="mt-1 text-xs leading-5 text-[#0B3D2E]/65">
            E-mail e Push são opcionais. Falhas externas não bloqueiam a Agenda nem a Central interna.
          </p>
        </div>
        <button
          type="button"
          aria-label="Atualizar canais externos"
          disabled={loading || busyChannel !== null || busyPolicy !== null}
          onClick={() => void load()}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#0B3D2E]/15 bg-white text-[#0B3D2E] focus:outline-none focus:ring-2 focus:ring-[#78C89A] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {errorMessage && (
        <div role="alert" className="mt-3 rounded-xl border border-[#0B3D2E]/20 bg-[#78C89A]/10 p-3 text-xs font-medium text-[#0B3D2E]">
          {errorMessage}
        </div>
      )}

      {!gateway ? (
        <p className="mt-3 rounded-xl border border-[#0B3D2E]/15 p-3 text-xs text-[#0B3D2E]/70">
          Os canais externos exigem conexão segura com o Supabase da organização.
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          <label className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-[#0B3D2E]/15 bg-white px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{EXTERNAL_CHANNEL_LABELS.email}</span>
                <span className="block text-[11px] text-[#0B3D2E]/60">
                  {capabilities?.emailConfigured ? 'Provedor disponível' : 'Provedor não configurado'}
                </span>
              </span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-[#0B3D2E]"
              checked={emailPreference.enabled}
              disabled={
                loading ||
                busyChannel === 'email' ||
                (!capabilities?.emailConfigured && !emailPreference.enabled)
              }
              onChange={(event) => void handleEmailToggle(event.target.checked)}
            />
          </label>

          <label className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-[#0B3D2E]/15 bg-white px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{EXTERNAL_CHANNEL_LABELS.push}</span>
                <span className="block text-[11px] text-[#0B3D2E]/60">
                  {!capabilities?.pushConfigured
                    ? 'Canal não configurado'
                    : !pushState.supported
                      ? 'Navegador sem suporte nesta versão'
                      : pushState.permission === 'denied'
                        ? 'Permissão bloqueada no navegador'
                        : pushState.activeEndpoint
                          ? 'Este dispositivo está inscrito'
                          : 'Ativação exige consentimento neste dispositivo'}
                </span>
              </span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-[#0B3D2E]"
              checked={pushPreference.enabled}
              disabled={
                loading ||
                busyChannel === 'push' ||
                ((!capabilities?.pushConfigured || !pushState.supported) && !pushPreference.enabled)
              }
              onChange={(event) => void handlePushToggle(event.target.checked)}
            />
          </label>
        </div>
      )}

      {canManagePolicies && policies.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-[#0B3D2E]">Escalonamento da organização</h4>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#0B3D2E]/65">
            Gestão define criticidade, atraso e canais. O aviso interno continua sendo a origem canônica.
          </p>

          <div className="mt-3 grid gap-2">
            {policies.map((policy) => (
              <details key={policy.category} className="rounded-xl border border-[#0B3D2E]/15 bg-white p-3">
                <summary className="min-h-[44px] cursor-pointer text-sm font-semibold leading-[44px] text-[#0B3D2E]">
                  {NOTIFICATION_CATEGORY_LABELS[policy.category]}
                </summary>
                <div className="grid gap-3 pb-1 pt-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-[#0B3D2E]/10 px-2">
                      E-mail
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[#0B3D2E]"
                        checked={policy.emailEnabled}
                        disabled={!capabilities?.emailConfigured && !policy.emailEnabled}
                        onChange={(event) => updatePolicy(policy.category, { emailEnabled: event.target.checked })}
                      />
                    </label>
                    <label className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-[#0B3D2E]/10 px-2">
                      Push
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[#0B3D2E]"
                        checked={policy.pushEnabled}
                        disabled={!capabilities?.pushConfigured && !policy.pushEnabled}
                        onChange={(event) => updatePolicy(policy.category, { pushEnabled: event.target.checked })}
                      />
                    </label>
                  </div>

                  <label className="grid gap-1">
                    Prioridade mínima
                    <select
                      className="min-h-[44px] rounded-lg border border-[#0B3D2E]/20 bg-white px-2 text-sm text-[#0B3D2E]"
                      value={policy.minimumPriority}
                      onChange={(event) => updatePolicy(policy.category, {
                        minimumPriority: event.target.value as NotificationEscalationPolicy['minimumPriority'],
                      })}
                    >
                      {EXTERNAL_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>{EXTERNAL_PRIORITY_LABELS[priority]}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1">
                    Atraso antes do envio (minutos)
                    <input
                      type="number"
                      min={0}
                      max={10080}
                      className="min-h-[44px] rounded-lg border border-[#0B3D2E]/20 bg-white px-2 text-sm text-[#0B3D2E]"
                      value={policy.delayMinutes}
                      onChange={(event) => updatePolicy(policy.category, {
                        delayMinutes: clampInteger(event.target.value, 0, 10080),
                      })}
                    />
                  </label>

                  <label className="grid gap-1">
                    Prioridade crítica
                    <select
                      className="min-h-[44px] rounded-lg border border-[#0B3D2E]/20 bg-white px-2 text-sm text-[#0B3D2E]"
                      value={policy.criticalPriority}
                      onChange={(event) => updatePolicy(policy.category, {
                        criticalPriority: event.target.value as NotificationEscalationPolicy['criticalPriority'],
                      })}
                    >
                      {EXTERNAL_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>{EXTERNAL_PRIORITY_LABELS[priority]}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1">
                    Atraso para crítico (minutos)
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      className="min-h-[44px] rounded-lg border border-[#0B3D2E]/20 bg-white px-2 text-sm text-[#0B3D2E]"
                      value={policy.criticalDelayMinutes}
                      onChange={(event) => updatePolicy(policy.category, {
                        criticalDelayMinutes: clampInteger(event.target.value, 0, 1440),
                      })}
                    />
                  </label>

                  <label className="grid gap-1">
                    Máximo de tentativas
                    <input
                      type="number"
                      min={1}
                      max={10}
                      className="min-h-[44px] rounded-lg border border-[#0B3D2E]/20 bg-white px-2 text-sm text-[#0B3D2E]"
                      value={policy.maxAttempts}
                      onChange={(event) => updatePolicy(policy.category, {
                        maxAttempts: clampInteger(event.target.value, 1, 10),
                      })}
                    />
                  </label>

                  <button
                    type="button"
                    className="min-h-[44px] rounded-xl bg-[#0B3D2E] px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#78C89A] disabled:opacity-50"
                    disabled={busyPolicy === policy.category}
                    onClick={() => void savePolicy(policy)}
                  >
                    {busyPolicy === policy.category ? 'Salvando…' : 'Salvar regra'}
                  </button>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <h4 className="text-sm font-semibold text-[#0B3D2E]">Entregas recentes</h4>
        {deliveries.length === 0 ? (
          <p className="mt-2 text-xs text-[#0B3D2E]/60">Nenhuma tentativa externa registrada para este usuário.</p>
        ) : (
          <div className="mt-2 grid gap-2">
            {deliveries.map((delivery) => (
              <div key={delivery.id} className="rounded-xl border border-[#0B3D2E]/10 bg-white p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{EXTERNAL_CHANNEL_LABELS[delivery.channel]}</span>
                  <span>{EXTERNAL_DELIVERY_STATUS_LABELS[delivery.status]}</span>
                </div>
                <p className="mt-1 text-[#0B3D2E]/60">
                  {EXTERNAL_PRIORITY_LABELS[delivery.priority]} · {delivery.attemptCount}/{delivery.maxAttempts} tentativa(s) · {formatInstant(delivery.deliveredAt ?? delivery.nextAttemptAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
