import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  List,
  RotateCcw,
} from 'lucide-react';
import type { ScheduleContextStatus } from './ScheduleContext';
import {
  buildScheduleCalendarMonth,
  currentScheduleMonthKey,
  scheduleItemPrimaryInstant,
  shiftScheduleMonth,
} from './calendar';
import { formatScheduleInstant } from './time';
import { SCHEDULE_THEME } from './theme';
import { ScheduleItemCollaborationPanel } from './ScheduleItemCollaborationPanel';
import type {
  ScheduleItem,
  ScheduleItemListFilters,
  ScheduleMemberOption,
  SchedulePriority,
  ScheduleTransitionInput,
  SetScheduleCollaborationInput,
  ScheduleRecurrenceFrequency,
  ScheduleViewScope,
} from '../types/schedule';

type SchedulePresentationMode = 'list' | 'calendar';

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

const WEEKDAY_LABEL: readonly string[] = [
  'Dom',
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
];

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
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

function itemTimeLabel(item: ScheduleItem): string {
  const instant = scheduleItemPrimaryInstant(item);
  if (!instant) return 'Sem horário';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: item.timeZone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(instant));
  } catch {
    return 'Horário indisponível';
  }
}

function originLabel(item: ScheduleItem): string {
  if (item.origin.type === 'manual') return 'Origem manual';
  if (item.origin.sourceDomain === 'technical_visit') {
    return 'Origem: visita técnica';
  }
  if (item.origin.sourceDomain === 'appraisal') return 'Origem: laudo';
  return 'Origem: proposta';
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
  const weekdays =
    item.recurrence.frequency === 'weekly'
      ? ` · ${item.recurrence.weekdays
          .map((day) => WEEKDAY_LABEL[day] ?? String(day))
          .join(', ')}`
      : '';
  return item.recurrence.endsAt
    ? `${interval}${weekdays} · até ${formatScheduleInstant(
        item.recurrence.endsAt,
        item.timeZone
      )}`
    : interval + weekdays;
}

function ScheduleItemCard({
  item,
  members,
  isMemberDirectoryAvailable,
  currentUserId,
  canManage,
  onSetCollaboration,
  onComplete,
  onReopen,
  onCancel,
}: {
  readonly item: ScheduleItem;
  readonly members: readonly ScheduleMemberOption[];
  readonly isMemberDirectoryAvailable: boolean;
  readonly currentUserId: string | null;
  readonly canManage: boolean;
  readonly onSetCollaboration: (
    scheduleItemId: string,
    input: SetScheduleCollaborationInput
  ) => Promise<ScheduleItem>;
  readonly onComplete: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
  readonly onReopen: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
  readonly onCancel: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
}) {
  return (
    <article
      className={SCHEDULE_THEME.surface + ' min-w-0 p-4 sm:p-5'}
      data-schedule-item-kind={item.kind}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className={SCHEDULE_THEME.badge}>
              {item.kind === 'task' ? 'Tarefa' : 'Compromisso'}
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
          {originLabel(item)}
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

      <ScheduleItemCollaborationPanel
        item={item}
        members={members}
        isMemberDirectoryAvailable={isMemberDirectoryAvailable}
        currentUserId={currentUserId}
        canManage={canManage}
        onSetCollaboration={onSetCollaboration}
        onComplete={onComplete}
        onReopen={onReopen}
        onCancel={onCancel}
      />
    </article>
  );
}

function CalendarEntry({ item }: { readonly item: ScheduleItem }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#0B3D2E]/15 bg-white px-2.5 py-2">
      <p className="truncate text-xs font-semibold">{item.title}</p>
      <p className="mt-0.5 text-[11px] text-[#0B3D2E]/65">
        {item.kind === 'task' ? 'Tarefa' : 'Compromisso'} ·{' '}
        {itemTimeLabel(item)}
      </p>
    </div>
  );
}

export interface ScheduleBrowsePanelProps {
  readonly status: ScheduleContextStatus;
  readonly items: readonly ScheduleItem[];
  readonly filters: ScheduleItemListFilters;
  readonly isLoading: boolean;
  readonly members: readonly ScheduleMemberOption[];
  readonly isMemberDirectoryAvailable: boolean;
  readonly currentUserId: string | null;
  readonly canManage: boolean;
  readonly onFiltersChange: (
    filters: Partial<ScheduleItemListFilters>
  ) => void;
  readonly onSetCollaboration: (
    scheduleItemId: string,
    input: SetScheduleCollaborationInput
  ) => Promise<ScheduleItem>;
  readonly onComplete: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
  readonly onReopen: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
  readonly onCancel: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
}

export function ScheduleBrowsePanel({
  status,
  items,
  filters,
  isLoading,
  members,
  isMemberDirectoryAvailable,
  currentUserId,
  canManage,
  onFiltersChange,
  onSetCollaboration,
  onComplete,
  onReopen,
  onCancel,
}: ScheduleBrowsePanelProps) {
  const viewTimeZone = useMemo(browserTimeZone, []);
  const [mode, setMode] = useState<SchedulePresentationMode>('list');
  const [monthKey, setMonthKey] = useState(() =>
    currentScheduleMonthKey(viewTimeZone)
  );

  const calendar = useMemo(
    () => buildScheduleCalendarMonth(items, monthKey, viewTimeZone),
    [items, monthKey, viewTimeZone]
  );

  const scope: ScheduleViewScope = filters.viewScope ?? 'personal';
  const hasActiveFilters =
    (filters.kind ?? 'all') !== 'all' ||
    (filters.status ?? 'all') !== 'all';

  const currentMonthDays = calendar.days.filter(
    (day) => day.inCurrentMonth && day.items.length > 0
  );

  const setScope = (next: ScheduleViewScope) => {
    onFiltersChange({ viewScope: next });
  };

  return (
    <section
      aria-labelledby="schedule-records-title"
      className="min-w-0 space-y-4"
    >
      <div className={SCHEDULE_THEME.surface + ' min-w-0 p-4 sm:p-5'}>
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CheckSquare2 className="h-5 w-5" aria-hidden="true" />
              <h2
                id="schedule-records-title"
                className="text-lg font-semibold"
              >
                Tarefas e compromissos
              </h2>
            </div>
            <p className="mt-1 text-sm text-[#0B3D2E]/70">
              Minha agenda reúne registros criados por você, sob sua
              responsabilidade ou com sua participação. A visão da equipe
              fica disponível somente para a gestão autorizada da organização.
            </p>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:flex lg:items-end">
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-xs font-semibold">
                Escopo
              </legend>
              <div
                className={
                  (canManage ? 'grid-cols-2 ' : 'grid-cols-1 ') +
                  'grid rounded-xl border border-[#0B3D2E]/20 bg-white p-1'
                }
                role="group"
                aria-label="Escopo da agenda"
              >
                <button
                  type="button"
                  className={
                    'min-h-[44px] rounded-lg px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#78C89A] ' +
                    (scope === 'personal'
                      ? 'bg-[#0B3D2E] text-white'
                      : 'bg-white text-[#0B3D2E]')
                  }
                  aria-pressed={scope === 'personal'}
                  onClick={() => setScope('personal')}
                >
                  Minha agenda
                </button>
                {canManage && (
                  <button
                    type="button"
                    className={
                      'min-h-[44px] rounded-lg px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#78C89A] ' +
                      (scope === 'team'
                        ? 'bg-[#0B3D2E] text-white'
                        : 'bg-white text-[#0B3D2E]')
                    }
                    aria-pressed={scope === 'team'}
                    onClick={() => setScope('team')}
                  >Equipe</button>
                )}
              </div>
            </fieldset>

            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-xs font-semibold">
                Exibição
              </legend>
              <div
                className="grid grid-cols-2 rounded-xl border border-[#0B3D2E]/20 bg-white p-1"
                role="group"
                aria-label="Modo de exibição"
              >
                <button
                  type="button"
                  className={
                    'flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#78C89A] ' +
                    (mode === 'list'
                      ? 'bg-[#0B3D2E] text-white'
                      : 'bg-white text-[#0B3D2E]')
                  }
                  aria-pressed={mode === 'list'}
                  onClick={() => setMode('list')}
                >
                  <List className="h-4 w-4" aria-hidden="true" />
                  <span>Lista</span>
                </button>
                <button
                  type="button"
                  className={
                    'flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#78C89A] ' +
                    (mode === 'calendar'
                      ? 'bg-[#0B3D2E] text-white'
                      : 'bg-white text-[#0B3D2E]')
                  }
                  aria-pressed={mode === 'calendar'}
                  onClick={() => setMode('calendar')}
                >
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  <span>Calendário</span>
                </button>
              </div>
            </fieldset>
          </div>
        </div>

        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="min-w-0 space-y-1.5 text-sm font-medium">
            <span>Tipo</span>
            <select
              className={SCHEDULE_THEME.input}
              value={filters.kind ?? 'all'}
              onChange={(event) =>
                onFiltersChange({
                  kind: event.target.value as ScheduleItemListFilters['kind'],
                })
              }
            >
              <option value="all">Todos</option>
              <option value="task">Tarefas</option>
              <option value="appointment">Compromissos</option>
            </select>
          </label>

          <label className="min-w-0 space-y-1.5 text-sm font-medium">
            <span>Situação</span>
            <select
              className={SCHEDULE_THEME.input}
              value={filters.status ?? 'all'}
              onChange={(event) =>
                onFiltersChange({
                  status:
                    event.target.value as ScheduleItemListFilters['status'],
                })
              }
            >
              <option value="all">Todas</option>
              <option value="pending">Pendente</option>
              <option value="in_progress">Em andamento</option>
              <option value="blocked">Bloqueado</option>
              <option value="completed">Concluído</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>

          <button
            type="button"
            className={SCHEDULE_THEME.buttonSecondary + ' self-end'}
            disabled={!hasActiveFilters}
            onClick={() =>
              onFiltersChange({ kind: 'all', status: 'all' })
            }
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Limpar filtros
          </button>
        </div>

        {isLoading && (
          <p
            className="mt-3 text-sm text-[#0B3D2E]/65"
            aria-live="polite"
          >
            Atualizando resultados...
          </p>
        )}
      </div>

      {status === 'empty' && mode === 'list' && (
        <div className={SCHEDULE_THEME.surface + ' p-8 text-center'}>
          <CalendarDays
            className="mx-auto h-8 w-8 text-[#0B3D2E]/55"
            aria-hidden="true"
          />
          <h3 className="mt-3 text-lg font-semibold">
            Nenhum registro encontrado
          </h3>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            Ajuste o escopo ou os filtros para consultar outros registros
            permitidos.
          </p>
        </div>
      )}

      {(status === 'ready' ||
        (status === 'loading' && items.length > 0)) &&
        mode === 'list' && (
          <div
            className="grid min-w-0 gap-4"
            aria-label="Lista de tarefas e compromissos"
          >
            {items.map((item) => (
              <ScheduleItemCard
                key={item.id}
                item={item}
                members={members}
                isMemberDirectoryAvailable={isMemberDirectoryAvailable}
                currentUserId={currentUserId}
                canManage={canManage}
                onSetCollaboration={onSetCollaboration}
                onComplete={onComplete}
                onReopen={onReopen}
                onCancel={onCancel}
              />
            ))}
          </div>
        )}

      {(status === 'empty' ||
        status === 'ready' ||
        status === 'loading') &&
        mode === 'calendar' && (
          <div className="min-w-0 space-y-4">
            <div className={SCHEDULE_THEME.surface + ' min-w-0 p-4 sm:p-5'}>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#0B3D2E]/65">
                    Calendário no fuso {viewTimeZone}
                  </p>
                  <h3
                    className="mt-1 text-lg font-semibold capitalize"
                    aria-live="polite"
                  >
                    {calendar.label}
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex">
                  <button
                    type="button"
                    className={SCHEDULE_THEME.buttonSecondary}
                    aria-label="Mês anterior"
                    onClick={() =>
                      setMonthKey((current) =>
                        shiftScheduleMonth(current, -1)
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Anterior</span>
                  </button>
                  <button
                    type="button"
                    className={SCHEDULE_THEME.buttonSecondary}
                    onClick={() =>
                      setMonthKey(currentScheduleMonthKey(viewTimeZone))
                    }
                  >Hoje</button>
                  <button
                    type="button"
                    className={SCHEDULE_THEME.buttonSecondary}
                    aria-label="Próximo mês"
                    onClick={() =>
                      setMonthKey((current) =>
                        shiftScheduleMonth(current, 1)
                      )
                    }
                  >
                    <span className="sr-only sm:not-sr-only">Próximo</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div
                className="mt-5 hidden min-w-0 grid-cols-7 gap-px overflow-hidden rounded-xl border border-[#0B3D2E]/15 bg-[#0B3D2E]/10 md:grid"
                role="grid"
                aria-label={`Calendário de ${calendar.label}`}
              >
                {WEEKDAY_LABEL.map((day) => (
                  <div
                    key={day}
                    role="columnheader"
                    className="bg-white px-2 py-2 text-center text-xs font-semibold"
                  >
                    {day}
                  </div>
                ))}
                {calendar.days.map((day) => (
                  <div
                    key={day.key}
                    role="gridcell"
                    aria-label={day.key}
                    className={
                      'min-h-[132px] min-w-0 bg-white p-2 ' +
                      (day.inCurrentMonth
                        ? 'text-[#0B3D2E]'
                        : 'text-[#0B3D2E]/35')
                    }
                  >
                    <p className="text-xs font-semibold">{day.dayNumber}</p>
                    {day.inCurrentMonth && day.items.length > 0 && (
                      <div className="mt-2 grid min-w-0 gap-1.5">
                        {day.items.map((item) => (
                          <CalendarEntry key={item.id} item={item} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div
                className="mt-5 grid gap-3 md:hidden"
                aria-label="Agenda mensal em lista para celular"
              >
                {currentMonthDays.length === 0 ? (
                  <p className="rounded-xl border border-[#0B3D2E]/15 bg-white p-4 text-sm text-[#0B3D2E]/70">
                    Nenhum registro com data neste mês.
                  </p>
                ) : (
                  currentMonthDays.map((day) => (
                    <section
                      key={day.key}
                      aria-labelledby={`schedule-mobile-day-${day.key}`}
                      className="rounded-xl border border-[#0B3D2E]/15 bg-white p-3"
                    >
                      <h4
                        id={`schedule-mobile-day-${day.key}`}
                        className="text-sm font-semibold"
                      >
                        {new Intl.DateTimeFormat('pt-BR', {
                          weekday: 'long',
                          day: '2-digit',
                          month: 'long',
                          timeZone: 'UTC',
                        }).format(new Date(day.key + 'T12:00:00Z'))}
                      </h4>
                      <div className="mt-2 grid gap-2">
                        {day.items.map((item) => (
                          <CalendarEntry key={item.id} item={item} />
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>

            {calendar.undatedItems.length > 0 && (
              <section
                className={SCHEDULE_THEME.surface + ' min-w-0 p-4 sm:p-5'}
                aria-labelledby="schedule-undated-title"
              >
                <h3
                  id="schedule-undated-title"
                  className="text-base font-semibold"
                >
                  Sem data definida
                </h3>
                <p className="mt-1 text-sm text-[#0B3D2E]/70">
                  Tarefas sem prazo continuam disponíveis na agenda, mas não
                  ocupam um dia do calendário.
                </p>
                <div className="mt-3 grid min-w-0 gap-3">
                  {calendar.undatedItems.map((item) => (
                    <ScheduleItemCard
                      key={item.id}
                      item={item}
                      members={members}
                      isMemberDirectoryAvailable={isMemberDirectoryAvailable}
                      currentUserId={currentUserId}
                      canManage={canManage}
                      onSetCollaboration={onSetCollaboration}
                      onComplete={onComplete}
                      onReopen={onReopen}
                      onCancel={onCancel}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
    </section>
  );
}
