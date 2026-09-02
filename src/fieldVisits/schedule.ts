import { TechnicalVisitDomainError } from '../types/technicalVisit';

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
    throw new TechnicalVisitDomainError(
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
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  );
  if (
    probe.getUTCFullYear() !== parts.year ||
    probe.getUTCMonth() + 1 !== parts.month ||
    probe.getUTCDate() !== parts.day ||
    probe.getUTCHours() !== parts.hour ||
    probe.getUTCMinutes() !== parts.minute ||
    probe.getUTCSeconds() !== parts.second
  ) {
    throw new TechnicalVisitDomainError('INVALID_DATE', 'Data ou horário inexistente.');
  }

  return parts;
}

export function isValidIanaTimeZone(timeZone: string): boolean {
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
  if (!isValidIanaTimeZone(normalized)) {
    throw new TechnicalVisitDomainError(
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

function sameLocalParts(left: LocalDateTimeParts, right: LocalDateTimeParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}

export function zonedLocalDateTimeToUtc(localDateTime: string, timeZone: string): string {
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
    throw new TechnicalVisitDomainError(
      'INVALID_DATE',
      'O horário informado não existe nesse fuso por causa de uma mudança de horário local.'
    );
  }

  return result.toISOString();
}

export function utcToZonedLocalInput(isoDate: string, timeZone: string): string {
  const zone = assertTimeZone(timeZone);
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    throw new TechnicalVisitDomainError('INVALID_DATE', 'Data de visita inválida.');
  }
  const local = partsAt(date, zone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${local.year}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}:${pad(local.minute)}`;
}

export function addMinutesToIso(isoDate: string, minutes: number): string {
  const start = new Date(isoDate);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(minutes)) {
    throw new TechnicalVisitDomainError('INVALID_DATE', 'Intervalo de agenda inválido.');
  }
  return new Date(start.getTime() + minutes * 60_000).toISOString();
}

export function intervalsOverlap(
  leftStartIso: string,
  leftEndIso: string,
  rightStartIso: string,
  rightEndIso: string
): boolean {
  const leftStart = new Date(leftStartIso).getTime();
  const leftEnd = new Date(leftEndIso).getTime();
  const rightStart = new Date(rightStartIso).getTime();
  const rightEnd = new Date(rightEndIso).getTime();
  if ([leftStart, leftEnd, rightStart, rightEnd].some(Number.isNaN)) {
    throw new TechnicalVisitDomainError('INVALID_DATE', 'Intervalo de agenda inválido.');
  }
  return leftStart < rightEnd && rightStart < leftEnd;
}
