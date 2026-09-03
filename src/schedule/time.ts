import { ScheduleDomainError } from '../types/schedule';

interface LocalDateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function parseLocalDateTime(value: string): LocalDateTimeParts {
  const match = value.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) {
    throw new ScheduleDomainError(
      'INVALID_DATE',
      'Informe data e hora locais no formato esperado.'
    );
  }

  const parts: LocalDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? '0'),
  };

  const probe = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    )
  );
  if (
    probe.getUTCFullYear() !== parts.year ||
    probe.getUTCMonth() + 1 !== parts.month ||
    probe.getUTCDate() !== parts.day ||
    probe.getUTCHours() !== parts.hour ||
    probe.getUTCMinutes() !== parts.minute ||
    probe.getUTCSeconds() !== parts.second
  ) {
    throw new ScheduleDomainError('INVALID_DATE', 'Data ou horário inexistente.');
  }

  return parts;
}

export function isValidScheduleTimeZone(timeZone: string): boolean {
  const normalized = timeZone.trim();
  if (!normalized) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function assertTimeZone(timeZone: string): string {
  const normalized = timeZone.trim();
  if (!isValidScheduleTimeZone(normalized)) {
    throw new ScheduleDomainError(
      'INVALID_TIME_ZONE',
      'Informe um fuso horário IANA válido.'
    );
  }
  return normalized;
}

function partsAt(date: Date, timeZone: string): LocalDateTimeParts {
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

function offsetMilliseconds(date: Date, timeZone: string): number {
  const local = partsAt(date, timeZone);
  const representedAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second
  );
  return representedAsUtc - date.getTime();
}

function sameLocalParts(
  left: LocalDateTimeParts,
  right: LocalDateTimeParts
): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}

export function scheduleLocalDateTimeToUtc(
  localDateTime: string,
  timeZone: string
): string {
  const zone = assertTimeZone(timeZone);
  const local = parseLocalDateTime(localDateTime);
  const targetWallClock = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second
  );

  let instant = targetWallClock;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = offsetMilliseconds(new Date(instant), zone);
    const next = targetWallClock - offset;
    if (next === instant) break;
    instant = next;
  }

  const result = new Date(instant);
  if (!sameLocalParts(partsAt(result, zone), local)) {
    throw new ScheduleDomainError(
      'INVALID_DATE',
      'O horário informado não existe nesse fuso por causa de uma mudança de horário local.'
    );
  }

  const possibleOffsets = new Set<number>([
    offsetMilliseconds(result, zone),
    offsetMilliseconds(new Date(result.getTime() - 12 * 60 * 60 * 1000), zone),
    offsetMilliseconds(new Date(result.getTime() + 12 * 60 * 60 * 1000), zone),
  ]);

  const matchingInstants = Array.from(possibleOffsets)
    .map((offset) => new Date(targetWallClock - offset))
    .filter((candidate) => sameLocalParts(partsAt(candidate, zone), local))
    .map((candidate) => candidate.getTime());

  if (new Set(matchingInstants).size > 1) {
    throw new ScheduleDomainError(
      'INVALID_DATE',
      'O horário informado é ambíguo nesse fuso. Escolha outro horário.'
    );
  }

  return result.toISOString();
}

export function formatScheduleInstant(
  isoDate: string,
  timeZone: string
): string {
  assertTimeZone(timeZone);
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    throw new ScheduleDomainError('INVALID_DATE', 'Data de agenda inválida.');
  }
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
