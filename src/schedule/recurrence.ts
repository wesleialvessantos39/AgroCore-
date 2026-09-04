import {
  ScheduleDomainError,
  type ScheduleItem,
  type ScheduleOccurrenceDraft,
  type ScheduleOccurrenceWindowInput,
} from '../types/schedule';
import { scheduleLocalDateTimeToUtc } from './time';

interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WINDOW_MS = 366 * DAY_MS;

function assertInstant(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ScheduleDomainError(
      'INVALID_DATE',
      `${label} possui data ou horário inválido.`
    );
  }
  return parsed;
}

function localParts(iso: string, timeZone: string): LocalParts {
  const date = assertInstant(iso, 'Data de recorrência');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function localDateKey(parts: Pick<LocalParts, 'year' | 'month' | 'day'>): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function partsFromDateKey(key: number): Pick<LocalParts, 'year' | 'month' | 'day'> {
  const date = new Date(key);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function localDateTimeString(
  date: Pick<LocalParts, 'year' | 'month' | 'day'>,
  time: Pick<LocalParts, 'hour' | 'minute' | 'second'>
): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.year}-${pad(date.month)}-${pad(date.day)}T` +
    `${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`
  );
}

function monthDelta(
  anchor: Pick<LocalParts, 'year' | 'month'>,
  candidate: Pick<LocalParts, 'year' | 'month'>
): number {
  return candidate.year * 12 + candidate.month - (anchor.year * 12 + anchor.month);
}

function weekStartDateKey(dateKey: number): number {
  const day = new Date(dateKey).getUTCDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  return dateKey - mondayOffset * DAY_MS;
}

export function normalizeOccurrenceWindow(
  input: ScheduleOccurrenceWindowInput
): ScheduleOccurrenceWindowInput {
  const from = assertInstant(input.from, 'Início da janela');
  const to = assertInstant(input.to, 'Fim da janela');
  const span = to.getTime() - from.getTime();
  if (span <= 0 || span > MAX_WINDOW_MS) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      'A janela de recorrência deve ser positiva e ter no máximo 366 dias.'
    );
  }
  return Object.freeze({ from: from.toISOString(), to: to.toISOString() });
}

export function buildScheduleOccurrenceDrafts(
  item: ScheduleItem,
  input: ScheduleOccurrenceWindowInput
): readonly ScheduleOccurrenceDraft[] {
  const window = normalizeOccurrenceWindow(input);
  if (
    item.recurrence.frequency === 'none' ||
    item.status === 'completed' ||
    item.status === 'cancelled'
  ) {
    return Object.freeze([]);
  }

  const anchorIso = item.kind === 'task' ? item.dueAt : item.startsAt;
  if (!anchorIso) {
    throw new ScheduleDomainError(
      'INVALID_RECURRENCE',
      'A recorrência precisa de uma data base.'
    );
  }

  const anchor = assertInstant(anchorIso, 'Data base da recorrência');
  const from = assertInstant(window.from, 'Início da janela');
  const to = assertInstant(window.to, 'Fim da janela');
  const recurrenceEnd = item.recurrence.endsAt
    ? assertInstant(item.recurrence.endsAt, 'Fim da recorrência')
    : null;
  const interval = item.recurrence.interval;
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    throw new ScheduleDomainError(
      'INVALID_RECURRENCE',
      'O intervalo da recorrência é inválido.'
    );
  }

  const anchorLocal = localParts(anchorIso, item.timeZone);
  const anchorDateKey = localDateKey(anchorLocal);
  const fromLocal = localParts(window.from, item.timeZone);
  const toLocal = localParts(window.to, item.timeZone);
  const startDateKey = Math.max(anchorDateKey, localDateKey(fromLocal));
  const endDateKey = localDateKey(toLocal);
  const anchorWeekStart = weekStartDateKey(anchorDateKey);
  const weekdays = new Set(item.recurrence.weekdays);

  if (item.recurrence.frequency === 'weekly' && weekdays.size === 0) {
    throw new ScheduleDomainError(
      'INVALID_RECURRENCE',
      'A recorrência semanal precisa de ao menos um dia da semana.'
    );
  }

  const durationMs =
    item.kind === 'appointment'
      ? new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()
      : 0;
  const result: ScheduleOccurrenceDraft[] = [];

  for (let dateKey = startDateKey; dateKey <= endDateKey; dateKey += DAY_MS) {
    const candidateDate = partsFromDateKey(dateKey);
    const dayDelta = Math.round((dateKey - anchorDateKey) / DAY_MS);
    let matches = false;

    switch (item.recurrence.frequency) {
      case 'daily':
        matches = dayDelta >= 0 && dayDelta % interval === 0;
        break;
      case 'weekly': {
        const weekDelta = Math.floor((dateKey - anchorWeekStart) / (7 * DAY_MS));
        const dayOfWeek = new Date(dateKey).getUTCDay();
        matches =
          dateKey >= anchorDateKey &&
          weekDelta >= 0 &&
          weekDelta % interval === 0 &&
          weekdays.has(dayOfWeek);
        break;
      }
      case 'monthly': {
        const delta = monthDelta(anchorLocal, candidateDate);
        matches =
          delta >= 0 &&
          delta % interval === 0 &&
          candidateDate.day === anchorLocal.day;
        break;
      }
      case 'yearly':
        matches =
          candidateDate.year >= anchorLocal.year &&
          (candidateDate.year - anchorLocal.year) % interval === 0 &&
          candidateDate.month === anchorLocal.month &&
          candidateDate.day === anchorLocal.day;
        break;
      default:
        matches = false;
    }

    if (!matches) continue;

    const localValue = localDateTimeString(candidateDate, anchorLocal);
    let scheduledAt: string;
    try {
      scheduledAt = scheduleLocalDateTimeToUtc(localValue, item.timeZone);
    } catch (error) {
      if (
        error instanceof ScheduleDomainError &&
        error.code === 'INVALID_DATE'
      ) {
        throw new ScheduleDomainError(
          'INVALID_RECURRENCE',
          'Uma ocorrência cai em horário inexistente ou ambíguo no fuso configurado.'
        );
      }
      throw error;
    }

    const instant = new Date(scheduledAt);
    if (
      instant.getTime() < anchor.getTime() ||
      instant.getTime() < from.getTime() ||
      instant.getTime() >= to.getTime() ||
      (recurrenceEnd && instant.getTime() > recurrenceEnd.getTime())
    ) {
      continue;
    }

    result.push({
      scheduledAt,
      endsAt:
        item.kind === 'appointment'
          ? new Date(instant.getTime() + durationMs).toISOString()
          : null,
    });
  }

  return Object.freeze(result);
}
