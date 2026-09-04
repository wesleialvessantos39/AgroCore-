import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ScheduleDomainError,
  type ScheduleOccurrence,
  type ScheduleOccurrenceAuditEntry,
  type ScheduleOccurrenceGateway,
  type ScheduleOccurrenceTransitionGatewayInput,
} from '../types/schedule';

interface ScheduleOccurrenceRow {
  id: string;
  organization_id: string;
  schedule_item_id: string;
  source_item_version: number;
  scheduled_at: string;
  ends_at: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

interface ScheduleOccurrenceAuditRow {
  id: string;
  organization_id: string;
  occurrence_id: string;
  action: 'completed' | 'cancelled' | 'reopened';
  actor_user_id: string;
  occurred_at: string;
  occurrence_version: number;
  reason: string;
}

interface SupabaseOperationError {
  readonly message?: string;
  readonly code?: string;
}

interface SupabaseOperationResult {
  readonly data: unknown;
  readonly error: SupabaseOperationError | null;
}

function mapOccurrence(row: ScheduleOccurrenceRow): ScheduleOccurrence {
  return {
    id: row.id,
    organizationId: row.organization_id,
    scheduleItemId: row.schedule_item_id,
    sourceItemVersion: row.source_item_version,
    scheduledAt: row.scheduled_at,
    endsAt: row.ends_at,
    status: row.status,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function mapAudit(row: ScheduleOccurrenceAuditRow): ScheduleOccurrenceAuditEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    occurrenceId: row.occurrence_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    occurredAt: row.occurred_at,
    occurrenceVersion: row.occurrence_version,
    reason: row.reason,
  };
}

function mapError(error: SupabaseOperationError | null): Error {
  const message = error?.message ?? '';
  if (
    message.includes('AGROCORE_SCHEDULE_OCCURRENCE_FORBIDDEN_OR_INVALID') ||
    message.includes('AGROCORE_SCHEDULE_FORBIDDEN')
  ) {
    return new ScheduleDomainError(
      'PERMISSION_DENIED',
      'Você não possui permissão para esta operação de recorrência.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_NOT_FOUND')) {
    return new ScheduleDomainError(
      'OCCURRENCE_NOT_FOUND',
      'Ocorrência de agenda não encontrada.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_CONCURRENCY_CONFLICT')) {
    return new ScheduleDomainError(
      'CONCURRENCY_CONFLICT',
      'A ocorrência foi alterada por outra operação. Atualize antes de continuar.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_IDEMPOTENCY_CONFLICT')) {
    return new ScheduleDomainError(
      'IDEMPOTENCY_CONFLICT',
      'A operação já foi utilizada com conteúdo diferente.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_RESPONSIBLE_MISMATCH')) {
    return new ScheduleDomainError(
      'RESPONSIBLE_MISMATCH',
      'Somente o responsável atual ou a gestão pode concluir esta ocorrência.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_INVALID_TRANSITION')) {
    return new ScheduleDomainError(
      'INVALID_TRANSITION',
      'A mudança de situação solicitada para a ocorrência não é permitida.'
    );
  }
  if (
    message.includes('AGROCORE_SCHEDULE_INVALID_RECURRENCE') ||
    message.includes('AGROCORE_SCHEDULE_RECURRENCE_DST_INVALID') ||
    message.includes('AGROCORE_SCHEDULE_RECURRENCE_DST_AMBIGUOUS')
  ) {
    return new ScheduleDomainError(
      'INVALID_RECURRENCE',
      'A recorrência possui uma regra de data ou fuso que não pode ser materializada com segurança.'
    );
  }
  return new ScheduleDomainError(
    'SERVICE_UNAVAILABLE',
    'O serviço de recorrência da agenda está indisponível neste momento.'
  );
}

function isTransient(error: SupabaseOperationError | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  return (
    code.startsWith('08') ||
    ['PGRST000', 'PGRST001', 'PGRST002', '53300', '57P01', '57P02', '57P03']
      .includes(code) ||
    /failed to fetch|network|timeout|timed out|connection reset|connection refused|502|503|504|bad gateway|service unavailable|gateway timeout/i
      .test(error.message ?? '')
  );
}

async function executeWithRetry(
  operation: () => PromiseLike<SupabaseOperationResult>
): Promise<SupabaseOperationResult> {
  const delays = [0, 200, 600] as const;
  let last: SupabaseOperationResult = {
    data: null,
    error: { message: 'Falha de comunicação com o serviço de recorrência.' },
  };
  for (const delay of delays) {
    if (delay > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
    }
    last = await operation();
    if (!last.error || !isTransient(last.error)) return last;
  }
  return last;
}

function firstOccurrence(data: unknown): ScheduleOccurrenceRow | null {
  if (Array.isArray(data)) {
    return (data[0] as ScheduleOccurrenceRow | undefined) ?? null;
  }
  return (data as ScheduleOccurrenceRow | null) ?? null;
}

export class SupabaseScheduleOccurrenceGateway
  implements ScheduleOccurrenceGateway
{
  constructor(private readonly client: SupabaseClient) {}

  async materializeOccurrences(
    organizationId: string,
    scheduleItemId: string,
    from: string,
    to: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleOccurrence[]> {
    const request = this.client.rpc('agrocore_materialize_schedule_occurrences', {
      p_organization_id: organizationId,
      p_schedule_item_id: scheduleItemId,
      p_from: from,
      p_to: to,
    });
    const { data, error } = signal
      ? await request.abortSignal(signal)
      : await request;
    if (error) throw mapError(error);
    return ((data ?? []) as unknown as ScheduleOccurrenceRow[])
      .map(mapOccurrence)
      .sort(
        (left, right) =>
          left.scheduledAt.localeCompare(right.scheduledAt) ||
          left.id.localeCompare(right.id)
      );
  }

  private async transition(
    rpcName:
      | 'agrocore_complete_schedule_occurrence'
      | 'agrocore_reopen_schedule_occurrence'
      | 'agrocore_cancel_schedule_occurrence',
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    const { data, error } = await executeWithRetry(() =>
      this.client.rpc(rpcName, {
        p_organization_id: input.organizationId,
        p_occurrence_id: input.occurrenceId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_reason: input.reason,
      })
    );
    if (error) throw mapError(error);
    const row = firstOccurrence(data);
    if (!row) {
      throw new ScheduleDomainError(
        'SERVICE_UNAVAILABLE',
        'O banco não confirmou a alteração da ocorrência.'
      );
    }
    return mapOccurrence(row);
  }

  completeOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return this.transition('agrocore_complete_schedule_occurrence', input);
  }

  reopenOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return this.transition('agrocore_reopen_schedule_occurrence', input);
  }

  cancelOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return this.transition('agrocore_cancel_schedule_occurrence', input);
  }

  async listOccurrenceAudit(
    organizationId: string,
    occurrenceId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleOccurrenceAuditEntry[]> {
    let request = this.client
      .from('schedule_item_occurrence_audit')
      .select(
        'id,organization_id,occurrence_id,action,actor_user_id,occurred_at,occurrence_version,reason'
      )
      .eq('organization_id', organizationId)
      .eq('occurrence_id', occurrenceId)
      .order('occurrence_version', { ascending: true });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw mapError(error);
    return ((data ?? []) as unknown as ScheduleOccurrenceAuditRow[]).map(mapAudit);
  }

  clearAllSessionData(): void {
    // O gateway remoto não mantém ocorrências empresariais em memória local.
  }
}
