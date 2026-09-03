import {
  ScheduleDomainError,
  type CreateScheduleItemGatewayInput,
  type ScheduleGateway,
  type ScheduleItem,
  type ScheduleItemAuditEntry,
  type ScheduleItemListFilters,
  type UpdateScheduleItemGatewayInput,
} from '../../types/schedule';

function cloneItem(item: ScheduleItem): ScheduleItem {
  return {
    ...item,
    recurrence: {
      ...item.recurrence,
      weekdays: [...item.recurrence.weekdays],
    },
    origin: { ...item.origin },
  } as ScheduleItem;
}

function cloneAudit(entry: ScheduleItemAuditEntry): ScheduleItemAuditEntry {
  return { ...entry, changedFields: [...entry.changedFields] };
}

function payloadFingerprint(input: object): string {
  return JSON.stringify(input);
}

function sortKey(item: ScheduleItem): string {
  return item.kind === 'task'
    ? item.dueAt ?? item.createdAt
    : item.startsAt;
}

export class PreviewScheduleGateway implements ScheduleGateway {
  private readonly items = new Map<string, ScheduleItem>();
  private readonly audits = new Map<string, ScheduleItemAuditEntry[]>();
  private readonly idempotency = new Map<
    string,
    {
      readonly commandType: 'create' | 'update';
      readonly fingerprint: string;
      readonly itemId: string;
    }
  >();

  async listItems(
    organizationId: string,
    actorUserId: string,
    filters: ScheduleItemListFilters = {},
    signal?: AbortSignal
  ): Promise<readonly ScheduleItem[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada.', 'AbortError');
    }
    return Array.from(this.items.values())
      .filter((item) => item.organizationId === organizationId)
      .filter(
        (item) =>
          filters.viewScope !== 'personal' ||
          item.createdByUserId === actorUserId
      )
      .filter(
        (item) =>
          !filters.kind ||
          filters.kind === 'all' ||
          item.kind === filters.kind
      )
      .filter(
        (item) =>
          !filters.status ||
          filters.status === 'all' ||
          item.status === filters.status
      )
      .sort(
        (a, b) =>
          sortKey(a).localeCompare(sortKey(b)) || a.id.localeCompare(b.id)
      )
      .map(cloneItem);
  }

  async getItemById(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<ScheduleItem | null> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada.', 'AbortError');
    }
    const item = this.items.get(scheduleItemId);
    if (!item || item.organizationId !== organizationId) return null;
    return cloneItem(item);
  }

  async createItem(
    input: CreateScheduleItemGatewayInput
  ): Promise<ScheduleItem> {
    const idempotencyKey =
      input.organizationId + ':' + input.idempotencyKey;
    const fingerprint = payloadFingerprint(input.payload);
    const previous = this.idempotency.get(idempotencyKey);
    if (previous) {
      if (
        previous.commandType !== 'create' ||
        previous.fingerprint !== fingerprint
      ) {
        throw new ScheduleDomainError(
          'IDEMPOTENCY_CONFLICT',
          'A operação já foi utilizada com conteúdo diferente.'
        );
      }
      const existing = this.items.get(previous.itemId);
      if (!existing) {
        throw new ScheduleDomainError(
          'CONCURRENCY_CONFLICT',
          'O registro idempotente não está mais disponível.'
        );
      }
      return cloneItem(existing);
    }

    const now = new Date().toISOString();
    const id =
      globalThis.crypto?.randomUUID?.() ??
      `schedule-${input.organizationId}-${this.items.size + 1}`;
    const common = {
      id,
      organizationId: input.organizationId,
      title: input.payload.title,
      description: input.payload.description,
      priority: input.payload.priority,
      status: 'pending' as const,
      timeZone: input.payload.timeZone,
      recurrence: {
        ...input.payload.recurrence,
        weekdays: [...input.payload.recurrence.weekdays],
      },
      origin: {
        type: 'manual' as const,
        sourceDomain: null,
        sourceId: null,
        sourceVersion: null,
        sourceEventKey: null,
      },
      createdByUserId: input.actorUserId,
      createdAt: now,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
      version: 1,
    };

    const item: ScheduleItem =
      input.payload.kind === 'task'
        ? {
            ...common,
            kind: 'task',
            dueAt: input.payload.dueAt,
            startsAt: null,
            endsAt: null,
          }
        : {
            ...common,
            kind: 'appointment',
            dueAt: null,
            startsAt: input.payload.startsAt!,
            endsAt: input.payload.endsAt!,
          };

    this.items.set(id, cloneItem(item));
    this.idempotency.set(idempotencyKey, {
      commandType: 'create',
      fingerprint,
      itemId: id,
    });

    const audit: ScheduleItemAuditEntry = {
      id: `audit-${id}-1`,
      organizationId: input.organizationId,
      scheduleItemId: id,
      action: 'created',
      actorUserId: input.actorUserId,
      occurredAt: now,
      itemVersion: 1,
      changedFields: [
        'item_kind',
        'title',
        'priority',
        'time_zone',
        'recurrence',
        'origin_type',
      ],
      reason: null,
    };
    this.audits.set(id, [cloneAudit(audit)]);
    return cloneItem(item);
  }

  async updateItem(
    input: UpdateScheduleItemGatewayInput
  ): Promise<ScheduleItem> {
    const idempotencyKey =
      input.organizationId + ':' + input.idempotencyKey;
    const fingerprint = payloadFingerprint({
      scheduleItemId: input.scheduleItemId,
      expectedVersion: input.expectedVersion,
      payload: input.payload,
      reason: input.reason.trim(),
    });
    const previous = this.idempotency.get(idempotencyKey);

    if (previous) {
      if (
        previous.commandType !== 'update' ||
        previous.itemId !== input.scheduleItemId ||
        previous.fingerprint !== fingerprint
      ) {
        throw new ScheduleDomainError(
          'IDEMPOTENCY_CONFLICT',
          'A operação já foi utilizada com conteúdo diferente.'
        );
      }

      const replayed = this.items.get(previous.itemId);
      if (!replayed || replayed.organizationId !== input.organizationId) {
        throw new ScheduleDomainError(
          'ITEM_NOT_FOUND',
          'Registro de agenda não encontrado.'
        );
      }
      return cloneItem(replayed);
    }

    const current = this.items.get(input.scheduleItemId);
    if (
      !current ||
      current.organizationId !== input.organizationId
    ) {
      throw new ScheduleDomainError(
        'ITEM_NOT_FOUND',
        'Registro de agenda não encontrado.'
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new ScheduleDomainError(
        'CONCURRENCY_CONFLICT',
        'O registro foi alterado por outra operação.'
      );
    }
    if (current.origin.type !== 'manual') {
      throw new ScheduleDomainError(
        'SOURCE_OWNED',
        'Este registro pertence ao domínio de origem.'
      );
    }
    if (current.status !== 'pending') {
      throw new ScheduleDomainError(
        'STATUS_LOCKED',
        'Este registro não pode ser editado em sua situação atual.'
      );
    }

    const nextCommon = {
      ...current,
      title: input.payload.title,
      description: input.payload.description,
      priority: input.payload.priority,
      timeZone: input.payload.timeZone,
      recurrence: {
        ...input.payload.recurrence,
        weekdays: [...input.payload.recurrence.weekdays],
      },
      updatedByUserId: input.actorUserId,
      updatedAt: new Date().toISOString(),
      version: current.version + 1,
    };

    const next: ScheduleItem =
      current.kind === 'task'
        ? {
            ...nextCommon,
            kind: 'task',
            dueAt: input.payload.dueAt,
            startsAt: null,
            endsAt: null,
          }
        : {
            ...nextCommon,
            kind: 'appointment',
            dueAt: null,
            startsAt: input.payload.startsAt!,
            endsAt: input.payload.endsAt!,
          };

    const changedFields = [
      current.title !== next.title ? 'title' : null,
      current.description !== next.description ? 'description' : null,
      current.priority !== next.priority ? 'priority' : null,
      current.timeZone !== next.timeZone ? 'time_zone' : null,
      current.kind === 'task' &&
      next.kind === 'task' &&
      current.dueAt !== next.dueAt
        ? 'due_at'
        : null,
      current.kind === 'appointment' &&
      next.kind === 'appointment' &&
      current.startsAt !== next.startsAt
        ? 'starts_at'
        : null,
      current.kind === 'appointment' &&
      next.kind === 'appointment' &&
      current.endsAt !== next.endsAt
        ? 'ends_at'
        : null,
      JSON.stringify(current.recurrence) !== JSON.stringify(next.recurrence)
        ? 'recurrence'
        : null,
    ].filter((value): value is string => Boolean(value));

    if (changedFields.length === 0) {
      throw new ScheduleDomainError(
        'NO_CHANGES',
        'Nenhuma alteração foi identificada.'
      );
    }

    this.items.set(next.id, cloneItem(next));
    this.idempotency.set(idempotencyKey, {
      commandType: 'update',
      fingerprint,
      itemId: next.id,
    });
    const audit: ScheduleItemAuditEntry = {
      id: `audit-${next.id}-${next.version}`,
      organizationId: next.organizationId,
      scheduleItemId: next.id,
      action: 'updated',
      actorUserId: input.actorUserId,
      occurredAt: next.updatedAt,
      itemVersion: next.version,
      changedFields,
      reason: input.reason.trim(),
    };
    this.audits.set(next.id, [
      ...(this.audits.get(next.id) ?? []),
      cloneAudit(audit),
    ]);
    return cloneItem(next);
  }

  async listAudit(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleItemAuditEntry[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada.', 'AbortError');
    }
    const item = this.items.get(scheduleItemId);
    if (!item || item.organizationId !== organizationId) return [];
    return (this.audits.get(scheduleItemId) ?? []).map(cloneAudit);
  }

  clearAllSessionData(): void {
    this.items.clear();
    this.audits.clear();
    this.idempotency.clear();
  }
}
