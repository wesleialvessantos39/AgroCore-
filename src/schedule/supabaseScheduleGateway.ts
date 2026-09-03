import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ScheduleDomainError,
  type CreateScheduleItemGatewayInput,
  type ScheduleCollaborationRevision,
  type ScheduleGateway,
  type ScheduleItem,
  type ScheduleItemAuditEntry,
  type ScheduleItemListFilters,
  type ScheduleMemberOption,
  type ScheduleRecurrenceDefinition,
  type ScheduleTransitionGatewayInput,
  type SetScheduleCollaborationGatewayInput,
  type UpdateScheduleItemGatewayInput,
} from '../types/schedule';
import type { OrganizationRole } from '../types/auth';

interface ScheduleRow {
  id: string;
  organization_id: string;
  item_kind: 'task' | 'appointment';
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  time_zone: string;
  due_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  recurrence: ScheduleRecurrenceDefinition;
  origin_type: 'manual' | 'domain_event';
  source_domain: string | null;
  source_id: string | null;
  source_version: number | null;
  source_event_key: string | null;
  responsible_user_id: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_by_user_id: string;
  updated_at: string;
  version: number;
}

interface ScheduleParticipantRow {
  schedule_item_id: string;
  user_id: string;
}

interface ScheduleAuditRow {
  id: string;
  organization_id: string;
  schedule_item_id: string;
  action: 'created' | 'updated';
  actor_user_id: string;
  occurred_at: string;
  item_version: number;
  changed_fields: string[];
  reason: string | null;
}

interface ScheduleMemberRow {
  user_id: string;
  organization_role: Exclude<OrganizationRole, 'none'>;
  display_name: string;
}

interface ScheduleCollaborationRevisionRow {
  id: string;
  organization_id: string;
  schedule_item_id: string;
  item_version: number;
  responsible_user_id: string | null;
  participant_user_ids: string[];
  actor_user_id: string;
  occurred_at: string;
  reason: string;
}

const ITEM_COLUMNS =
  'id,organization_id,item_kind,title,description,priority,status,time_zone,due_at,starts_at,ends_at,recurrence,origin_type,source_domain,source_id,source_version,source_event_key,responsible_user_id,completed_at,cancelled_at,created_by_user_id,created_at,updated_by_user_id,updated_at,version';

const AUDIT_COLUMNS =
  'id,organization_id,schedule_item_id,action,actor_user_id,occurred_at,item_version,changed_fields,reason';

const REVISION_COLUMNS =
  'id,organization_id,schedule_item_id,item_version,responsible_user_id,participant_user_ids,actor_user_id,occurred_at,reason';

function cloneRecurrence(
  recurrence: ScheduleRecurrenceDefinition
): ScheduleRecurrenceDefinition {
  return {
    frequency: recurrence.frequency,
    interval: recurrence.interval,
    weekdays: [...(recurrence.weekdays ?? [])],
    endsAt: recurrence.endsAt ?? null,
  };
}

function mapItem(
  row: ScheduleRow,
  participantUserIds: readonly string[] = []
): ScheduleItem {
  const common = {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    timeZone: row.time_zone,
    recurrence: cloneRecurrence(row.recurrence),
    origin:
      row.origin_type === 'manual'
        ? ({
            type: 'manual',
            sourceDomain: null,
            sourceId: null,
            sourceVersion: null,
            sourceEventKey: null,
          } as const)
        : ({
            type: 'domain_event',
            sourceDomain: row.source_domain ?? '',
            sourceId: row.source_id ?? '',
            sourceVersion: row.source_version ?? 1,
            sourceEventKey: row.source_event_key ?? '',
          } as const),
    responsibleUserId: row.responsible_user_id,
    participantUserIds: [...participantUserIds].sort(),
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedByUserId: row.updated_by_user_id,
    updatedAt: row.updated_at,
    version: row.version,
  };

  if (row.item_kind === 'task') {
    return {
      ...common,
      kind: 'task',
      dueAt: row.due_at,
      startsAt: null,
      endsAt: null,
    };
  }

  if (!row.starts_at || !row.ends_at) {
    throw new ScheduleDomainError(
      'INVALID_INPUT',
      'O compromisso persistido possui intervalo inválido.'
    );
  }

  return {
    ...common,
    kind: 'appointment',
    dueAt: null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

function mapAudit(row: ScheduleAuditRow): ScheduleItemAuditEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    scheduleItemId: row.schedule_item_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    occurredAt: row.occurred_at,
    itemVersion: row.item_version,
    changedFields: [...row.changed_fields],
    reason: row.reason,
  };
}

function mapRevision(
  row: ScheduleCollaborationRevisionRow
): ScheduleCollaborationRevision {
  return {
    id: row.id,
    organizationId: row.organization_id,
    scheduleItemId: row.schedule_item_id,
    itemVersion: row.item_version,
    responsibleUserId: row.responsible_user_id,
    participantUserIds: [...row.participant_user_ids],
    actorUserId: row.actor_user_id,
    occurredAt: row.occurred_at,
    reason: row.reason,
  };
}

function mapError(error: { readonly message?: string } | null): Error {
  const message = error?.message ?? '';
  if (message.includes('AGROCORE_SCHEDULE_FORBIDDEN')) {
    return new ScheduleDomainError(
      'PERMISSION_DENIED',
      'Você não possui permissão para esta operação de agenda.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_NOT_FOUND')) {
    return new ScheduleDomainError(
      'ITEM_NOT_FOUND',
      'Registro de agenda não encontrado.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_CONCURRENCY_CONFLICT')) {
    return new ScheduleDomainError(
      'CONCURRENCY_CONFLICT',
      'O registro foi alterado por outra operação. Recarregue antes de continuar.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_IDEMPOTENCY_CONFLICT')) {
    return new ScheduleDomainError(
      'IDEMPOTENCY_CONFLICT',
      'A operação já foi utilizada com conteúdo diferente.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_SOURCE_OWNED')) {
    return new ScheduleDomainError(
      'SOURCE_OWNED',
      'Este registro pertence ao domínio de origem e não pode ser alterado manualmente.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_STATUS_LOCKED')) {
    return new ScheduleDomainError(
      'STATUS_LOCKED',
      'Este registro não pode ser alterado em sua situação atual.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_COLLABORATOR_INELIGIBLE')) {
    return new ScheduleDomainError(
      'COLLABORATOR_INELIGIBLE',
      'O integrante selecionado não está ativo ou não possui acesso à Agenda.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_COLLABORATOR_DUPLICATE')) {
    return new ScheduleDomainError(
      'COLLABORATOR_DUPLICATE',
      'O responsável não pode ser repetido entre os participantes e não são permitidas duplicidades.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_RESPONSIBLE_MISMATCH')) {
    return new ScheduleDomainError(
      'RESPONSIBLE_MISMATCH',
      'Somente o responsável atual ou a gestão pode concluir este registro.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_INVALID_TRANSITION')) {
    return new ScheduleDomainError(
      'INVALID_TRANSITION',
      'A mudança de situação solicitada não é permitida.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_NO_CHANGES')) {
    return new ScheduleDomainError(
      'NO_CHANGES',
      'Nenhuma alteração foi identificada.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_INVALID_INPUT')) {
    return new ScheduleDomainError(
      'INVALID_INPUT',
      'As informações da operação de agenda são inválidas.'
    );
  }
  return new ScheduleDomainError(
    'SERVICE_UNAVAILABLE',
    'O serviço de agenda está indisponível neste momento.'
  );
}

interface SupabaseOperationError {
  readonly message?: string;
  readonly code?: string;
}

interface SupabaseOperationResult {
  readonly data: unknown;
  readonly error: SupabaseOperationError | null;
}

function isTransientOperationError(
  error: SupabaseOperationError | null
): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (
    code.startsWith('08') ||
    ['PGRST000', 'PGRST001', 'PGRST002', '53300', '57P01', '57P02', '57P03']
      .includes(code)
  ) {
    return true;
  }

  return /failed to fetch|network|timeout|timed out|connection reset|connection refused|502|503|504|bad gateway|service unavailable|gateway timeout/i
    .test(error.message ?? '');
}

async function executeMutationWithRetry(
  operation: () => PromiseLike<SupabaseOperationResult>
): Promise<SupabaseOperationResult> {
  const delays = [0, 200, 600] as const;
  let last: SupabaseOperationResult = {
    data: null,
    error: { message: 'Falha de comunicação com o serviço de agenda.' },
  };

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      await new Promise((resolve) =>
        globalThis.setTimeout(resolve, delays[attempt])
      );
    }

    last = await operation();
    if (!last.error || !isTransientOperationError(last.error)) {
      return last;
    }
  }

  return last;
}

function extractRow(data: unknown): ScheduleRow | null {
  if (Array.isArray(data)) {
    return (data[0] as ScheduleRow | undefined) ?? null;
  }
  return (data as ScheduleRow | null) ?? null;
}

function sortItems(items: readonly ScheduleItem[]): ScheduleItem[] {
  const key = (item: ScheduleItem) =>
    item.kind === 'task'
      ? item.dueAt ?? item.createdAt
      : item.startsAt;
  return [...items].sort(
    (a, b) => key(a).localeCompare(key(b)) || a.id.localeCompare(b.id)
  );
}

export class SupabaseScheduleGateway implements ScheduleGateway {
  constructor(private readonly client: SupabaseClient) {}

  private async participantsForItems(
    organizationId: string,
    itemIds: readonly string[],
    signal?: AbortSignal
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (itemIds.length === 0) return result;

    let request = this.client
      .from('schedule_item_participants')
      .select('schedule_item_id,user_id')
      .eq('organization_id', organizationId)
      .in('schedule_item_id', [...itemIds]);

    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw mapError(error);

    for (const row of (data ?? []) as unknown as ScheduleParticipantRow[]) {
      const current = result.get(row.schedule_item_id) ?? [];
      current.push(row.user_id);
      result.set(row.schedule_item_id, current);
    }
    return result;
  }

  private async hydrateRows(
    organizationId: string,
    rows: readonly ScheduleRow[],
    signal?: AbortSignal
  ): Promise<readonly ScheduleItem[]> {
    const participants = await this.participantsForItems(
      organizationId,
      rows.map((row) => row.id),
      signal
    );
    return rows.map((row) =>
      mapItem(row, participants.get(row.id) ?? [])
    );
  }

  private async hydrateMutationRow(row: ScheduleRow): Promise<ScheduleItem> {
    const items = await this.hydrateRows(row.organization_id, [row]);
    const item = items[0];
    if (!item) {
      throw new ScheduleDomainError(
        'SERVICE_UNAVAILABLE',
        'O banco não confirmou o registro de agenda.'
      );
    }
    return item;
  }

  async listItems(
    organizationId: string,
    actorUserId: string,
    filters: ScheduleItemListFilters = {},
    signal?: AbortSignal
  ): Promise<readonly ScheduleItem[]> {
    let participantItemIds: string[] = [];

    if (filters.viewScope === 'personal') {
      let participantRequest = this.client
        .from('schedule_item_participants')
        .select('schedule_item_id')
        .eq('organization_id', organizationId)
        .eq('user_id', actorUserId);
      if (signal) participantRequest = participantRequest.abortSignal(signal);
      const participantResult = await participantRequest;
      if (participantResult.error) throw mapError(participantResult.error);
      participantItemIds = [
        ...new Set(
          ((participantResult.data ?? []) as unknown as {
            schedule_item_id: string;
          }[]).map((row) => row.schedule_item_id)
        ),
      ];
    }

    let request = this.client
      .from('schedule_items')
      .select(ITEM_COLUMNS)
      .eq('organization_id', organizationId);

    if (filters.viewScope === 'personal') {
      const filtersForActor = [
        `created_by_user_id.eq.${actorUserId}`,
        `responsible_user_id.eq.${actorUserId}`,
      ];
      if (participantItemIds.length > 0) {
        filtersForActor.push(
          `id.in.(${participantItemIds.join(',')})`
        );
      }
      request = request.or(filtersForActor.join(','));
    }

    if (filters.kind && filters.kind !== 'all') {
      request = request.eq('item_kind', filters.kind);
    }
    if (filters.status && filters.status !== 'all') {
      request = request.eq('status', filters.status);
    }
    if (signal) request = request.abortSignal(signal);

    const { data, error } = await request;
    if (error) throw mapError(error);

    const hydrated = await this.hydrateRows(
      organizationId,
      (data ?? []) as unknown as ScheduleRow[],
      signal
    );
    return sortItems(hydrated);
  }

  async getItemById(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<ScheduleItem | null> {
    let request = this.client
      .from('schedule_items')
      .select(ITEM_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('id', scheduleItemId);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request.maybeSingle();
    if (error) throw mapError(error);
    if (!data) return null;
    const items = await this.hydrateRows(
      organizationId,
      [data as unknown as ScheduleRow],
      signal
    );
    return items[0] ?? null;
  }

  async createItem(
    input: CreateScheduleItemGatewayInput
  ): Promise<ScheduleItem> {
    const { data, error } = await executeMutationWithRetry(() =>
      this.client.rpc('agrocore_create_schedule_item', {
        p_organization_id: input.organizationId,
        p_payload: input.payload,
        p_idempotency_key: input.idempotencyKey,
      })
    );
    if (error) throw mapError(error);
    const row = extractRow(data);
    if (!row) {
      throw new ScheduleDomainError(
        'SERVICE_UNAVAILABLE',
        'O banco não confirmou a criação do registro de agenda.'
      );
    }
    return this.hydrateMutationRow(row);
  }

  async updateItem(
    input: UpdateScheduleItemGatewayInput
  ): Promise<ScheduleItem> {
    const { data, error } = await executeMutationWithRetry(() =>
      this.client.rpc('agrocore_update_schedule_item', {
        p_organization_id: input.organizationId,
        p_schedule_item_id: input.scheduleItemId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_payload: input.payload,
        p_reason: input.reason,
      })
    );
    if (error) throw mapError(error);
    const row = extractRow(data);
    if (!row) {
      throw new ScheduleDomainError(
        'SERVICE_UNAVAILABLE',
        'O banco não confirmou a atualização do registro de agenda.'
      );
    }
    return this.hydrateMutationRow(row);
  }

  async listEligibleMembers(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleMemberOption[]> {
    const request = this.client.rpc('agrocore_list_schedule_members', {
      p_organization_id: organizationId,
    });
    const { data, error } = signal
      ? await request.abortSignal(signal)
      : await request;
    if (error) throw mapError(error);
    return ((data ?? []) as unknown as ScheduleMemberRow[]).map((row) => ({
      userId: row.user_id,
      organizationRole: row.organization_role,
      displayName: row.display_name,
    }));
  }

  async setCollaboration(
    input: SetScheduleCollaborationGatewayInput
  ): Promise<ScheduleItem> {
    const { data, error } = await executeMutationWithRetry(() =>
      this.client.rpc('agrocore_set_schedule_collaboration', {
        p_organization_id: input.organizationId,
        p_schedule_item_id: input.scheduleItemId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_responsible_user_id: input.responsibleUserId,
        p_participant_user_ids: [...input.participantUserIds],
        p_reason: input.reason,
      })
    );
    if (error) throw mapError(error);
    const row = extractRow(data);
    if (!row) {
      throw new ScheduleDomainError(
        'SERVICE_UNAVAILABLE',
        'O banco não confirmou a atribuição dos colaboradores.'
      );
    }
    return this.hydrateMutationRow(row);
  }

  private async transitionItem(
    rpcName:
      | 'agrocore_complete_schedule_item'
      | 'agrocore_reopen_schedule_item'
      | 'agrocore_cancel_schedule_item',
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    const { data, error } = await executeMutationWithRetry(() =>
      this.client.rpc(rpcName, {
        p_organization_id: input.organizationId,
        p_schedule_item_id: input.scheduleItemId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_reason: input.reason,
      })
    );
    if (error) throw mapError(error);
    const row = extractRow(data);
    if (!row) {
      throw new ScheduleDomainError(
        'SERVICE_UNAVAILABLE',
        'O banco não confirmou a mudança de situação.'
      );
    }
    return this.hydrateMutationRow(row);
  }

  completeItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return this.transitionItem('agrocore_complete_schedule_item', input);
  }

  reopenItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return this.transitionItem('agrocore_reopen_schedule_item', input);
  }

  cancelItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return this.transitionItem('agrocore_cancel_schedule_item', input);
  }

  async listCollaborationRevisions(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleCollaborationRevision[]> {
    let request = this.client
      .from('schedule_item_collaboration_revisions')
      .select(REVISION_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('schedule_item_id', scheduleItemId)
      .order('item_version', { ascending: true });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw mapError(error);
    return (
      (data ?? []) as unknown as ScheduleCollaborationRevisionRow[]
    ).map(mapRevision);
  }

  async listAudit(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleItemAuditEntry[]> {
    let request = this.client
      .from('schedule_item_audit')
      .select(AUDIT_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('schedule_item_id', scheduleItemId)
      .order('item_version', { ascending: true });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw mapError(error);
    return ((data ?? []) as unknown as ScheduleAuditRow[]).map(mapAudit);
  }

  clearAllSessionData(): void {
    // O gateway remoto não mantém dados empresariais em memória persistente.
  }
}
