import type { ScheduleItem } from '../types/schedule';
import { ScheduleDomainError } from '../types/schedule';

export interface ScheduleCalendarDay {
  readonly key: string;
  readonly dayNumber: number;
  readonly inCurrentMonth: boolean;
  readonly items: readonly ScheduleItem[];
}

export interface ScheduleCalendarMonth {
  readonly monthKey: string;
  readonly label: string;
  readonly days: readonly ScheduleCalendarDay[];
  readonly datedItems: readonly ScheduleItem[];
  readonly undatedItems: readonly ScheduleItem[];
}

function assertMonthKey(monthKey: string): { year: number; month: number } {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new ScheduleDomainError(
      'INVALID_DATE',
      'Mês da agenda inválido.'
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new ScheduleDomainError(
      'INVALID_DATE',
      'Mês da agenda inválido.'
    );
  }
  return { year, month };
}

function dateParts(
  isoDate: string,
  timeZone: string
): { year: number; month: number; day: number } {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    throw new ScheduleDomainError(
      'INVALID_DATE',
      'Data de agenda inválida.'
    );
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new ScheduleDomainError(
      'INVALID_TIME_ZONE',
      'Fuso horário da agenda inválido.'
    );
  }
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
  };
}

export function scheduleItemPrimaryInstant(
  item: ScheduleItem
): string | null {
  return item.kind === 'task' ? item.dueAt : item.startsAt;
}

export function scheduleDateKey(
  isoDate: string,
  timeZone: string
): string {
  const parts = dateParts(isoDate, timeZone);
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

export function currentScheduleMonthKey(
  timeZone: string,
  now: string = new Date().toISOString()
): string {
  return scheduleDateKey(now, timeZone).slice(0, 7);
}

export function shiftScheduleMonth(
  monthKey: string,
  delta: number
): string {
  const { year, month } = assertMonthKey(monthKey);
  if (!Number.isInteger(delta) || Math.abs(delta) > 1200) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      'Deslocamento de mês inválido.'
    );
  }
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
  ].join('-');
}

export function formatScheduleMonthLabel(monthKey: string): string {
  const { year, month } = assertMonthKey(monthKey);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 15)));
}

function itemSortKey(item: ScheduleItem): string {
  return scheduleItemPrimaryInstant(item) ?? item.createdAt;
}

function sortScheduleItems(
  items: readonly ScheduleItem[]
): ScheduleItem[] {
  return [...items].sort(
    (left, right) =>
      itemSortKey(left).localeCompare(itemSortKey(right)) ||
      left.id.localeCompare(right.id)
  );
}

export function buildScheduleCalendarMonth(
  items: readonly ScheduleItem[],
  monthKey: string,
  timeZone: string
): ScheduleCalendarMonth {
  const { year, month } = assertMonthKey(monthKey);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const leadingDays = firstDay.getUTCDay();
  const firstCell = new Date(
    Date.UTC(year, month - 1, 1 - leadingDays)
  );

  const byDay = new Map<string, ScheduleItem[]>();
  const undatedItems: ScheduleItem[] = [];
  const datedItems: ScheduleItem[] = [];

  for (const item of items) {
    const instant = scheduleItemPrimaryInstant(item);
    if (!instant) {
      undatedItems.push(item);
      continue;
    }
    const key = scheduleDateKey(instant, timeZone);
    if (key.slice(0, 7) === monthKey) {
      datedItems.push(item);
    }
    const bucket = byDay.get(key) ?? [];
    bucket.push(item);
    byDay.set(key, bucket);
  }

  const days: ScheduleCalendarDay[] = [];
  for (let offset = 0; offset < 42; offset += 1) {
    const cursor = new Date(firstCell.getTime());
    cursor.setUTCDate(firstCell.getUTCDate() + offset);
    const key = [
      cursor.getUTCFullYear(),
      String(cursor.getUTCMonth() + 1).padStart(2, '0'),
      String(cursor.getUTCDate()).padStart(2, '0'),
    ].join('-');

    days.push({
      key,
      dayNumber: cursor.getUTCDate(),
      inCurrentMonth: key.slice(0, 7) === monthKey,
      items: sortScheduleItems(byDay.get(key) ?? []),
    });
  }

  return {
    monthKey,
    label: formatScheduleMonthLabel(monthKey),
    days,
    datedItems: sortScheduleItems(datedItems),
    undatedItems: sortScheduleItems(undatedItems),
  };
}
