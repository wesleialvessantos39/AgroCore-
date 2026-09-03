import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  CalendarClock,
  CheckSquare2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useAuthorization } from '../authorization/useAuthorization';
import { useSchedule } from '../schedule/useSchedule';
import {
  formatScheduleInstant,
  scheduleLocalDateTimeToUtc,
} from '../schedule/time';
import { SCHEDULE_THEME } from '../schedule/theme';
import type {
  ScheduleItem,
  ScheduleItemKind,
  SchedulePriority,
  ScheduleRecurrenceFrequency,
} from '../types/schedule';

const PRIORITY_LABEL: Record<SchedulePriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

const STATUS_LABEL: Record<ScheduleItem['status'], string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  blocked: 'Bloqueado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const RECURRENCE_LABEL: Record<
  ScheduleRecurrenceFrequency,
  string
> = {
  none: 'Sem recorrência',
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

function browserTimeZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    );
  } catch {
    return 'UTC';
  }
}

function secureCommandId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error(
      'O navegador não oferece um gerador seguro para registrar a operação.'
    );
  }
  return globalThis.crypto.randomUUID();
}

function itemDateLabel(item: ScheduleItem): string {
  if (item.kind === 'task') {
    return item.dueAt
      ? `Prazo: ${formatScheduleInstant(item.dueAt, item.timeZone)}`
      : 'Sem prazo definido';
  }
  return (
    `${formatScheduleInstant(item.startsAt, item.timeZone)} – ` +
    formatScheduleInstant(item.endsAt, item.timeZone)
  );
}

function recurrenceDescription(item: ScheduleItem): string {
  if (item.recurrence.frequency === 'none') {
    return 'Sem recorrência';
  }
  const base = RECURRENCE_LABEL[item.recurrence.frequency];
  const interval =
    item.recurrence.interval === 1
      ? base
      : `${base}, a cada ${item.recurrence.interval} intervalos`;
  return item.recurrence.endsAt
    ? `${interval} · até ${formatScheduleInstant(
        item.recurrence.endsAt,
        item.timeZone
      )}`
    : interval;
}

export function SchedulePage() {
  const {
    status,
    items,
    errorMessage,
    refresh,
    createTask,
    createAppointment,
  } = useSchedule();
  const { can } = useAuthorization();
  const canManage = can('schedule:manage');

  const [showCreate, setShowCreate] = useState(false);
  const [kind, setKind] = useState<ScheduleItemKind>('task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] =
    useState<SchedulePriority>('medium');
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const [dueAtLocal, setDueAtLocal] = useState('');
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [endsAtLocal, setEndsAtLocal] = useState('');
  const [recurrenceFrequency, setRecurrenceFrequency] =
    useState<ScheduleRecurrenceFrequency>('none');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceEndsLocal, setRecurrenceEndsLocal] =
    useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const commandRef = useRef<{
    fingerprint: string;
    id: string;
  } | null>(null);

  const formFingerprint = useMemo(
    () =>
      JSON.stringify({
        kind,
        title,
        description,
        priority,
        timeZone,
        dueAtLocal,
        startsAtLocal,
        endsAtLocal,
        recurrenceFrequency,
        recurrenceInterval,
        recurrenceEndsLocal,
      }),
    [
      description,
      dueAtLocal,
      endsAtLocal,
      kind,
      priority,
      recurrenceEndsLocal,
      recurrenceFrequency,
      recurrenceInterval,
      startsAtLocal,
      timeZone,
      title,
    ]
  );

  const dirty =
    showCreate &&
    Boolean(
      title ||
        description ||
        dueAtLocal ||
        startsAtLocal ||
        endsAtLocal ||
        recurrenceEndsLocal ||
        recurrenceFrequency !== 'none'
    );

  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);

  const resetForm = () => {
    setKind('task');
    setTitle('');
    setDescription('');
    setPriority('medium');
    setTimeZone(browserTimeZone());
    setDueAtLocal('');
    setStartsAtLocal('');
    setEndsAtLocal('');
    setRecurrenceFrequency('none');
    setRecurrenceInterval(1);
    setRecurrenceEndsLocal('');
    commandRef.current = null;
    setActionError(null);
  };

  const closeCreate = () => {
    resetForm();
    setShowCreate(false);
  };

  const commandId = () => {
    if (
      !commandRef.current ||
      commandRef.current.fingerprint !== formFingerprint
    ) {
      commandRef.current = {
        fingerprint: formFingerprint,
        id: secureCommandId(),
      };
    }
    return commandRef.current.id;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setActionError(null);

    try {
      const recurrenceEndsAt = recurrenceEndsLocal
        ? scheduleLocalDateTimeToUtc(
            recurrenceEndsLocal,
            timeZone
          )
        : null;
      const recurrence = {
        frequency: recurrenceFrequency,
        interval: recurrenceInterval,
        weekdays: [] as readonly number[],
        endsAt: recurrenceEndsAt,
      } as const;

      if (kind === 'task') {
        await createTask({
          title,
          description,
          priority,
          timeZone,
          dueAt: dueAtLocal
            ? scheduleLocalDateTimeToUtc(dueAtLocal, timeZone)
            : null,
          recurrence,
          idempotencyKey: commandId(),
        });
      } else {
        await createAppointment({
          title,
          description,
          priority,
          timeZone,
          startsAt: scheduleLocalDateTimeToUtc(
            startsAtLocal,
            timeZone
          ),
          endsAt: scheduleLocalDateTimeToUtc(
            endsAtLocal,
            timeZone
          ),
          recurrence,
          idempotencyKey: commandId(),
        });
      }

      closeCreate();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível registrar o item na agenda.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="page-schedule" className={SCHEDULE_THEME.page}>
      <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#0B3D2E]">
            Agenda corporativa
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[#0B3D2E]/70">
            Registre tarefas e compromissos da organização com prazo,
            fuso horário, prioridade e recorrência controlada.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button
            type="button"
            className={SCHEDULE_THEME.buttonSecondary + ' w-full sm:w-auto'}
            onClick={() => void refresh()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Atualizar
          </button>
          {canManage && (
            <button
              type="button"
              className={SCHEDULE_THEME.buttonPrimary + ' w-full sm:w-auto'}
              onClick={() => setShowCreate((current) => !current)}
              aria-expanded={showCreate}
              aria-controls="schedule-create-panel"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo registro
            </button>
          )}
        </div>
      </header>

      {actionError && (
        <div
          role="alert"
          className={SCHEDULE_THEME.surfaceSoft + ' p-4 text-sm font-medium'}
        >
          {actionError}
        </div>
      )}

      {showCreate && canManage && (
        <form
          id="schedule-create-panel"
          onSubmit={submit}
          className={SCHEDULE_THEME.surface + ' min-w-0 p-4 sm:p-6'}
        >
          <div>
            <h2 className="text-lg font-semibold">Novo registro</h2>
            <p className="mt-1 text-sm text-[#0B3D2E]/70">
              Datas são gravadas em UTC e preservam o fuso IANA informado.
            </p>
          </div>

          <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
            <label className="min-w-0 space-y-1.5 text-sm font-medium">
              <span>Tipo</span>
              <select
                className={SCHEDULE_THEME.input}
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as ScheduleItemKind)
                }
              >
                <option value="task">Tarefa</option>
                <option value="appointment">Compromisso</option>
              </select>
            </label>

            <label className="min-w-0 space-y-1.5 text-sm font-medium">
              <span>Prioridade</span>
              <select
                className={SCHEDULE_THEME.input}
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as SchedulePriority)
                }
              >
                {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 space-y-1.5 text-sm font-medium md:col-span-2">
              <span>Título</span>
              <input
                required
                minLength={3}
                maxLength={160}
                className={SCHEDULE_THEME.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoComplete="off"
              />
            </label>

            <label className="min-w-0 space-y-1.5 text-sm font-medium md:col-span-2">
              <span>Descrição</span>
              <textarea
                maxLength={2000}
                className={SCHEDULE_THEME.textarea}
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
              />
            </label>

            <label className="min-w-0 space-y-1.5 text-sm font-medium">
              <span>Fuso horário</span>
              <input
                required
                maxLength={120}
                className={SCHEDULE_THEME.input}
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                placeholder="America/Sao_Paulo"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>

            {kind === 'task' ? (
              <label className="min-w-0 space-y-1.5 text-sm font-medium">
                <span>Prazo</span>
                <input
                  type="datetime-local"
                  className={SCHEDULE_THEME.input}
                  value={dueAtLocal}
                  onChange={(event) =>
                    setDueAtLocal(event.target.value)
                  }
                />
              </label>
            ) : (
              <>
                <label className="min-w-0 space-y-1.5 text-sm font-medium">
                  <span>Início</span>
                  <input
                    required
                    type="datetime-local"
                    className={SCHEDULE_THEME.input}
                    value={startsAtLocal}
                    onChange={(event) =>
                      setStartsAtLocal(event.target.value)
                    }
                  />
                </label>
                <label className="min-w-0 space-y-1.5 text-sm font-medium">
                  <span>Fim</span>
                  <input
                    required
                    type="datetime-local"
                    className={SCHEDULE_THEME.input}
                    value={endsAtLocal}
                    onChange={(event) =>
                      setEndsAtLocal(event.target.value)
                    }
                  />
                </label>
              </>
            )}

            <label className="min-w-0 space-y-1.5 text-sm font-medium">
              <span>Recorrência</span>
              <select
                className={SCHEDULE_THEME.input}
                value={recurrenceFrequency}
                onChange={(event) =>
                  setRecurrenceFrequency(
                    event.target
                      .value as ScheduleRecurrenceFrequency
                  )
                }
              >
                {Object.entries(RECURRENCE_LABEL).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>

            {recurrenceFrequency !== 'none' && (
              <>
                <label className="min-w-0 space-y-1.5 text-sm font-medium">
                  <span>Intervalo da recorrência</span>
                  <input
                    required
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    className={SCHEDULE_THEME.input}
                    value={recurrenceInterval}
                    onChange={(event) =>
                      setRecurrenceInterval(
                        Number.parseInt(event.target.value, 10) || 1
                      )
                    }
                  />
                </label>
                <label className="min-w-0 space-y-1.5 text-sm font-medium md:col-span-2">
                  <span>Encerrar recorrência em</span>
                  <input
                    type="datetime-local"
                    className={SCHEDULE_THEME.input}
                    value={recurrenceEndsLocal}
                    onChange={(event) =>
                      setRecurrenceEndsLocal(event.target.value)
                    }
                  />
                </label>
              </>
            )}
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className={SCHEDULE_THEME.buttonSecondary}
              onClick={closeCreate}
              disabled={submitting}
            >
              Descartar
            </button>
            <button
              type="submit"
              className={SCHEDULE_THEME.buttonPrimary}
              disabled={submitting}
            >
              {submitting ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </form>
      )}

      {status === 'loading' && items.length === 0 && (
        <div
          className={SCHEDULE_THEME.surface + ' p-8 text-center'}
          aria-live="polite"
        >
          Carregando agenda...
        </div>
      )}

      {(status === 'error' || status === 'unavailable') && (
        <div
          role="alert"
          className={SCHEDULE_THEME.surfaceSoft + ' p-5'}
        >
          <p>{errorMessage}</p>
          {status === 'error' && (
            <button
              type="button"
              className={SCHEDULE_THEME.buttonSecondary + ' mt-4'}
              onClick={() => void refresh()}
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {status === 'empty' && (
        <div className={SCHEDULE_THEME.surface + ' p-8 text-center'}>
          <CalendarClock
            className="mx-auto h-8 w-8 text-[#0B3D2E]/55"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-lg font-semibold">
            Nenhum registro na agenda
          </h2>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            A agenda começa vazia e exibe somente registros reais da
            organização.
          </p>
        </div>
      )}

      {(status === 'ready' ||
        (status === 'loading' && items.length > 0)) && (
        <section aria-labelledby="schedule-records-title">
          <div className="mb-3 flex items-center gap-2">
            <CheckSquare2 className="h-5 w-5" aria-hidden="true" />
            <h2
              id="schedule-records-title"
              className="text-lg font-semibold"
            >
              Tarefas e compromissos
            </h2>
          </div>
          <div className="grid min-w-0 gap-4">
            {items.map((item) => (
              <article
                key={item.id}
                className={SCHEDULE_THEME.surface + ' min-w-0 p-4 sm:p-5'}
              >
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <span className={SCHEDULE_THEME.badge}>
                        {item.kind === 'task'
                          ? 'Tarefa'
                          : 'Compromisso'}
                      </span>
                      <span className={SCHEDULE_THEME.badge}>
                        {STATUS_LABEL[item.status]}
                      </span>
                      <span className={SCHEDULE_THEME.badge}>
                        Prioridade {PRIORITY_LABEL[item.priority]}
                      </span>
                    </div>
                    <h3 className="mt-3 break-words text-base font-semibold">
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="mt-1 break-words text-sm text-[#0B3D2E]/70">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-medium text-[#0B3D2E]/55">
                    {item.origin.type === 'manual'
                      ? 'Origem manual'
                      : 'Origem integrada'}
                  </span>
                </div>

                <dl className="mt-4 grid min-w-0 gap-3 text-sm md:grid-cols-3">
                  <div className="min-w-0">
                    <dt className="font-medium">Data</dt>
                    <dd className="mt-1 break-words text-[#0B3D2E]/70">
                      {itemDateLabel(item)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-medium">Fuso</dt>
                    <dd className="mt-1 break-words text-[#0B3D2E]/70">
                      {item.timeZone}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-medium">Recorrência</dt>
                    <dd className="mt-1 break-words text-[#0B3D2E]/70">
                      {recurrenceDescription(item)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
