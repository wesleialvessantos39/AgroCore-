import {
  DEFAULT_SCHEDULE_RECURRENCE,
  ScheduleDomainError,
  type CreateScheduleItemInput,
  type ScheduleItemCreatePayload,
  type ScheduleItemUpdatePayload,
  type ScheduleRecurrenceDefinition,
  type UpdateScheduleItemInput,
} from '../types/schedule';
import { isValidScheduleTimeZone } from './time';

function normalizeText(
  value: string,
  fieldName: string,
  min: number,
  max: number
): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      `${fieldName} deve possuir entre ${min} e ${max} caracteres.`
    );
  }
  return normalized;
}

function normalizeOptionalText(
  value: string | null | undefined,
  max: number
): string | null {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  if (normalized.length > max) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      `A descrição deve possuir no máximo ${max} caracteres.`
    );
  }
  return normalized;
}

function assertIsoInstant(
  value: string | null | undefined,
  label: string
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ScheduleDomainError(
      'INVALID_DATE',
      `${label} possui data ou horário inválido.`
    );
  }
  return date.toISOString();
}

export function normalizeScheduleRecurrence(
  recurrence: ScheduleRecurrenceDefinition | undefined,
  anchorAt: string | null
): ScheduleRecurrenceDefinition {
  const input = recurrence ?? DEFAULT_SCHEDULE_RECURRENCE;
  const allowed = new Set(['none', 'daily', 'weekly', 'monthly', 'yearly']);
  if (!allowed.has(input.frequency)) {
    throw new ScheduleDomainError('INVALID_INPUT', 'Recorrência inválida.');
  }
  if (
    !Number.isInteger(input.interval) ||
    input.interval < 1 ||
    input.interval > 365
  ) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      'O intervalo da recorrência deve estar entre 1 e 365.'
    );
  }

  const weekdays = [...input.weekdays];
  const uniqueWeekdays = new Set(weekdays);
  if (
    weekdays.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6
    ) ||
    uniqueWeekdays.size !== weekdays.length
  ) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      'Os dias semanais da recorrência são inválidos ou duplicados.'
    );
  }
  if (input.frequency === 'weekly' && weekdays.length === 0) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      'Selecione pelo menos um dia para a recorrência semanal.'
    );
  }
  if (input.frequency !== 'weekly' && weekdays.length > 0) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      'Dias da semana só podem ser informados em recorrência semanal.'
    );
  }

  const endsAt = assertIsoInstant(input.endsAt, 'Fim da recorrência');
  if (input.frequency !== 'none' && !anchorAt) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      'Uma recorrência precisa de data base.'
    );
  }
  if (
    input.frequency !== 'none' &&
    endsAt &&
    anchorAt &&
    new Date(endsAt).getTime() <= new Date(anchorAt).getTime()
  ) {
    throw new ScheduleDomainError(
      'INVALID_DATE',
      'O fim da recorrência deve ser posterior à data inicial.'
    );
  }

  return Object.freeze({
    frequency: input.frequency,
    interval: input.interval,
    weekdays: Object.freeze(weekdays),
    endsAt,
  });
}

function assertCommon(input: {
  readonly title: string;
  readonly description?: string | null;
  readonly priority: string;
  readonly timeZone: string;
}): {
  readonly title: string;
  readonly description: string | null;
  readonly priority: 'low' | 'medium' | 'high' | 'urgent';
  readonly timeZone: string;
} {
  const title = normalizeText(input.title, 'O título', 3, 160);
  const description = normalizeOptionalText(input.description, 2000);
  if (!['low', 'medium', 'high', 'urgent'].includes(input.priority)) {
    throw new ScheduleDomainError('INVALID_INPUT', 'Prioridade inválida.');
  }
  const timeZone = input.timeZone.trim();
  if (!isValidScheduleTimeZone(timeZone)) {
    throw new ScheduleDomainError(
      'INVALID_TIME_ZONE',
      'Informe um fuso horário IANA válido.'
    );
  }
  return {
    title,
    description,
    priority: input.priority as 'low' | 'medium' | 'high' | 'urgent',
    timeZone,
  };
}

export function normalizeCreateScheduleItem(
  input: CreateScheduleItemInput
): ScheduleItemCreatePayload {
  const common = assertCommon(input);

  if (input.kind === 'task') {
    const dueAt = assertIsoInstant(input.dueAt, 'Prazo da tarefa');
    return Object.freeze({
      ...common,
      kind: 'task',
      dueAt,
      startsAt: null,
      endsAt: null,
      recurrence: normalizeScheduleRecurrence(input.recurrence, dueAt),
    });
  }

  const startsAt = assertIsoInstant(input.startsAt, 'Início do compromisso');
  const endsAt = assertIsoInstant(input.endsAt, 'Fim do compromisso');
  if (!startsAt || !endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new ScheduleDomainError(
      'INVALID_DATE',
      'O fim do compromisso deve ser posterior ao início.'
    );
  }

  return Object.freeze({
    ...common,
    kind: 'appointment',
    dueAt: null,
    startsAt,
    endsAt,
    recurrence: normalizeScheduleRecurrence(input.recurrence, startsAt),
  });
}

export function normalizeUpdateScheduleItem(
  input: UpdateScheduleItemInput
): ScheduleItemUpdatePayload {
  if (
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 1
  ) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      'A versão esperada do registro é obrigatória.'
    );
  }
  normalizeText(input.reason, 'O motivo da alteração', 3, 500);

  const common = assertCommon(input);
  if (input.kind === 'task') {
    const dueAt = assertIsoInstant(input.dueAt, 'Prazo da tarefa');
    return Object.freeze({
      ...common,
      dueAt,
      startsAt: null,
      endsAt: null,
      recurrence: normalizeScheduleRecurrence(input.recurrence, dueAt),
    });
  }

  const startsAt = assertIsoInstant(input.startsAt, 'Início do compromisso');
  const endsAt = assertIsoInstant(input.endsAt, 'Fim do compromisso');
  if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
    throw new ScheduleDomainError(
      'INVALID_DATE',
      'O fim do compromisso deve ser posterior ao início.'
    );
  }
  return Object.freeze({
    ...common,
    dueAt: null,
    startsAt,
    endsAt,
    recurrence: normalizeScheduleRecurrence(input.recurrence, startsAt),
  });
}

export function assertScheduleIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 200) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      'Não foi possível identificar a operação de forma segura.'
    );
  }
  return normalized;
}
