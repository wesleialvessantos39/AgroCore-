import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarRange, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import type {
  ScheduleItem,
  ScheduleOccurrence,
} from '../types/schedule';
import { formatScheduleInstant } from './time';
import { SCHEDULE_THEME } from './theme';
import { useSchedule } from './useSchedule';

type OccurrenceAction = 'complete' | 'cancel' | 'reopen';

const STATUS_LABEL: Readonly<Record<ScheduleOccurrence['status'], string>> = {
  pending: 'Pendente',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

function secureCommandId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error(
      'O navegador não oferece um gerador seguro para registrar a operação.'
    );
  }
  return globalThis.crypto.randomUUID();
}

function defaultWindow(): { readonly from: string; readonly to: string } {
  const now = Date.now();
  return {
    from: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function occurrenceDateLabel(
  occurrence: ScheduleOccurrence,
  item: ScheduleItem
): string {
  const start = formatScheduleInstant(occurrence.scheduledAt, item.timeZone);
  if (!occurrence.endsAt) return start;
  return `${start} – ${formatScheduleInstant(occurrence.endsAt, item.timeZone)}`;
}

export function ScheduleOccurrencePanel({
  item,
}: {
  readonly item: ScheduleItem;
}) {
  const {
    currentUserId,
    canManage,
    materializeOccurrences,
    completeOccurrence,
    reopenOccurrence,
    cancelOccurrence,
  } = useSchedule();
  const [expanded, setExpanded] = useState(false);
  const [occurrences, setOccurrences] = useState<readonly ScheduleOccurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<{
    readonly occurrenceId: string;
    readonly action: OccurrenceAction;
    readonly idempotencyKey: string;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const window = useMemo(defaultWindow, [item.id, item.version]);

  const load = useCallback(async () => {
    if (!expanded) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const next = await materializeOccurrences(item.id, window);
      setOccurrences(next);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar as ocorrências recorrentes.'
      );
    } finally {
      setLoading(false);
    }
  }, [expanded, item.id, materializeOccurrences, window]);

  useEffect(() => {
    void load();
  }, [load, item.version, item.status]);

  if (item.recurrence.frequency === 'none') return null;

  const canCompleteOccurrence =
    canManage ||
    (currentUserId !== null && item.responsibleUserId === currentUserId);

  const openAction = (occurrenceId: string, action: OccurrenceAction) => {
    try {
      setActiveAction({
        occurrenceId,
        action,
        idempotencyKey: secureCommandId(),
      });
      setReason('');
      setErrorMessage(null);
    } catch (error) {
      setActiveAction(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar a operação com segurança.'
      );
    }
  };

  const closeAction = () => {
    setActiveAction(null);
    setReason('');
  };

  const submitAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeAction) return;
    const occurrence = occurrences.find(
      (candidate) => candidate.id === activeAction.occurrenceId
    );
    if (!occurrence) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const input = {
        expectedVersion: occurrence.version,
        idempotencyKey: activeAction.idempotencyKey,
        reason,
      };
      const updated =
        activeAction.action === 'complete'
          ? await completeOccurrence(occurrence.id, input)
          : activeAction.action === 'cancel'
            ? await cancelOccurrence(occurrence.id, input)
            : await reopenOccurrence(occurrence.id, input);
      setOccurrences((current) =>
        current.map((candidate) =>
          candidate.id === updated.id ? updated : candidate
        )
      );
      closeAction();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível alterar a ocorrência.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="mt-4 border-t border-[#0B3D2E]/10 pt-4"
      aria-label="Ocorrências da recorrência"
    >
      <button
        type="button"
        className={SCHEDULE_THEME.buttonSecondary + ' w-full justify-between sm:w-auto'}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="inline-flex items-center gap-2">
          <CalendarRange className="h-4 w-4" aria-hidden="true" />
          Ocorrências recorrentes
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 min-w-0 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#0B3D2E]/70">
              Janela limitada de prazos derivados da regra de recorrência. O cadastro principal continua sendo o registro da agenda.
            </p>
            <button
              type="button"
              className={SCHEDULE_THEME.buttonSecondary}
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Atualizar ocorrências
            </button>
          </div>

          {loading && (
            <p role="status" aria-live="polite" className="text-sm text-[#0B3D2E]/70">
              Calculando ocorrências...
            </p>
          )}

          {errorMessage && (
            <p role="alert" className={SCHEDULE_THEME.surfaceSoft + ' p-3 text-sm font-medium'}>
              {errorMessage}
            </p>
          )}

          {!loading && occurrences.length === 0 && !errorMessage && (
            <p className="text-sm text-[#0B3D2E]/70">
              Nenhuma ocorrência dentro da janela consultada.
            </p>
          )}

          <div className="grid min-w-0 gap-2">
            {occurrences.map((occurrence) => (
              <article
                key={occurrence.id}
                className="min-w-0 rounded-xl border border-[#0B3D2E]/15 bg-white p-3"
              >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-[#0B3D2E]">
                      {occurrenceDateLabel(occurrence, item)}
                    </p>
                    <p className="mt-1 text-xs text-[#0B3D2E]/70">
                      {STATUS_LABEL[occurrence.status]}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {occurrence.status === 'pending' && canCompleteOccurrence && (
                      <button
                        type="button"
                        className={SCHEDULE_THEME.buttonSecondary}
                        onClick={() => openAction(occurrence.id, 'complete')}
                      >
                        Concluir
                      </button>
                    )}
                    {occurrence.status === 'pending' && canManage && (
                      <button
                        type="button"
                        className={SCHEDULE_THEME.buttonSecondary}
                        onClick={() => openAction(occurrence.id, 'cancel')}
                      >
                        Cancelar
                      </button>
                    )}
                    {occurrence.status !== 'pending' && canManage && (
                      <button
                        type="button"
                        className={SCHEDULE_THEME.buttonSecondary}
                        onClick={() => openAction(occurrence.id, 'reopen')}
                      >
                        Reabrir
                      </button>
                    )}
                  </div>
                </div>

                {activeAction?.occurrenceId === occurrence.id && (
                  <form onSubmit={submitAction} className="mt-3 border-t border-[#0B3D2E]/10 pt-3">
                    <label className="block space-y-1.5 text-sm font-medium">
                      <span>Motivo da alteração</span>
                      <input
                        required
                        minLength={3}
                        maxLength={500}
                        className={SCHEDULE_THEME.input}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </label>
                    <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        className={SCHEDULE_THEME.buttonSecondary}
                        onClick={closeAction}
                        disabled={submitting}
                      >
                        Voltar
                      </button>
                      <button
                        type="submit"
                        className={SCHEDULE_THEME.buttonPrimary}
                        disabled={submitting}
                      >
                        {submitting ? 'Registrando...' : 'Confirmar'}
                      </button>
                    </div>
                  </form>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
