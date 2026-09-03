import {
  ScheduleDomainError,
  type CreateScheduleItemGatewayInput,
  type ScheduleCollaborationRevision,
  type ScheduleGateway,
  type ScheduleItem,
  type ScheduleItemAuditEntry,
  type ScheduleItemListFilters,
  type ScheduleMemberOption,
  type ScheduleTransitionGatewayInput,
  type SetScheduleCollaborationGatewayInput,
  type UpdateScheduleItemGatewayInput,
} from '../../types/schedule';

type PreviewCommandType =
  | 'create'
  | 'update'
  | 'collaboration'
  | 'complete'
  | 'reopen'
  | 'cancel';

function cloneItem(item: ScheduleItem): ScheduleItem {
  return {
    ...item,
    participantUserIds: [...item.participantUserIds],
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

function cloneRevision(
  revision: ScheduleCollaborationRevision
): ScheduleCollaborationRevision {
  return {
    ...revision,
    participantUserIds: [...revision.participantUserIds],
  };
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
  private readonly collaborationRevisions = new Map<
    string,
    ScheduleCollaborationRevision[]
  >();
  private readonly eligibleMembers = new Map<string, ScheduleMemberOption[]>();
  private readonly idempotency = new Map<
    string,
    {
      readonly commandType: PreviewCommandType;
      readonly fingerprint: string;
      readonly itemId: string;
    }
  >();

  setEligibleMembersForTesting(
    organizationId: string,
    members: readonly ScheduleMemberOption[]
  ): void {
    const allowedRoles = new Set([
      'owner',
      'company_admin',
      'manager',
      'project_designer',
      'capturer',
    ]);
    this.eligibleMembers.set(
      organizationId,
      members
        .filter((member) => allowedRoles.has(member.organizationRole))
        .map((member) => ({ ...member }))
    );
  }

  private isEligibleMember(
    organizationId: string,
    userId: string,
    actorUserId?: string
  ): boolean {
    if (actorUserId && userId === actorUserId) return true;
    return (this.eligibleMembers.get(organizationId) ?? []).some(
      (member) => member.userId === userId
    );
  }

  private appendAudit(entry: ScheduleItemAuditEntry): void {
    this.audits.set(entry.scheduleItemId, [
      ...(this.audits.get(entry.scheduleItemId) ?? []),
      cloneAudit(entry),
    ]);
  }

  private commandKey(
    organizationId: string,
    idempotencyKey: string
  ): string {
    return organizationId + ':' + idempotencyKey;
  }

  private replay(
    organizationId: string,
    idempotencyKey: string,
    commandType: PreviewCommandType,
    itemId: string,
    fingerprint: string
  ): ScheduleItem | null {
    const previous = this.idempotency.get(
      this.commandKey(organizationId, idempotencyKey)
    );
    if (!previous) return null;

    if (
      previous.commandType !== commandType ||
      previous.itemId !== itemId ||
      previous.fingerprint !== fingerprint
    ) {
      throw new ScheduleDomainError(
        'IDEMPOTENCY_CONFLICT',
        'A operação já foi utilizada com conteúdo diferente.'
      );
    }

    const item = this.items.get(previous.itemId);
    if (!item || item.organizationId !== organizationId) {
      throw new ScheduleDomainError(
        'ITEM_NOT_FOUND',
        'Registro de agenda não encontrado.'
      );
    }
    return cloneItem(item);
  }

  private rememberCommand(
    input: {
      readonly organizationId: string;
      readonly idempotencyKey: string;
      readonly commandType: PreviewCommandType;
      readonly fingerprint: string;
      readonly itemId: string;
    }
  ): void {
    this.idempotency.set(
      this.commandKey(input.organizationId, input.idempotencyKey),
      {
        commandType: input.commandType,
        fingerprint: input.fingerprint,
        itemId: input.itemId,
      }
    );
  }

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
          item.createdByUserId === actorUserId ||
          item.responsibleUserId === actorUserId ||
          item.participantUserIds.includes(actorUserId)
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
    const key = this.commandKey(
      input.organizationId,
      input.idempotencyKey
    );
    const fingerprint = payloadFingerprint(input.payload);
    const previous = this.idempotency.get(key);
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
      responsibleUserId: null,
      participantUserIds: [] as readonly string[],
      completedAt: null,
      cancelledAt: null,
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
    this.idempotency.set(key, {
      commandType: 'create',
      fingerprint,
      itemId: id,
    });

    this.appendAudit({
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
    });
    return cloneItem(item);
  }

  async updateItem(
    input: UpdateScheduleItemGatewayInput
  ): Promise<ScheduleItem> {
    const fingerprint = payloadFingerprint({
      scheduleItemId: input.scheduleItemId,
      expectedVersion: input.expectedVersion,
      payload: input.payload,
      reason: input.reason.trim(),
    });
    const replayed = this.replay(
      input.organizationId,
      input.idempotencyKey,
      'update',
      input.scheduleItemId,
      fingerprint
    );
    if (replayed) return replayed;

    const current = this.items.get(input.scheduleItemId);
    if (!current || current.organizationId !== input.organizationId) {
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
    this.rememberCommand({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      commandType: 'update',
      fingerprint,
      itemId: next.id,
    });
    this.appendAudit({
      id: `audit-${next.id}-${next.version}`,
      organizationId: next.organizationId,
      scheduleItemId: next.id,
      action: 'updated',
      actorUserId: input.actorUserId,
      occurredAt: next.updatedAt,
      itemVersion: next.version,
      changedFields,
      reason: input.reason.trim(),
    });
    return cloneItem(next);
  }

  async listEligibleMembers(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleMemberOption[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada.', 'AbortError');
    }
    return (this.eligibleMembers.get(organizationId) ?? []).map(
      (member) => ({ ...member })
    );
  }

  async setCollaboration(
    input: SetScheduleCollaborationGatewayInput
  ): Promise<ScheduleItem> {
    const participants = [...input.participantUserIds].sort();
    const fingerprint = payloadFingerprint({
      scheduleItemId: input.scheduleItemId,
      expectedVersion: input.expectedVersion,
      responsibleUserId: input.responsibleUserId,
      participantUserIds: participants,
      reason: input.reason.trim(),
    });
    const replayed = this.replay(
      input.organizationId,
      input.idempotencyKey,
      'collaboration',
      input.scheduleItemId,
      fingerprint
    );
    if (replayed) return replayed;

    const current = this.items.get(input.scheduleItemId);
    if (!current || current.organizationId !== input.organizationId) {
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
    if (current.status === 'completed' || current.status === 'cancelled') {
      throw new ScheduleDomainError(
        'STATUS_LOCKED',
        'A colaboração não pode ser alterada em registro encerrado.'
      );
    }

    if (
      new Set(participants).size !== participants.length ||
      (input.responsibleUserId !== null &&
        participants.includes(input.responsibleUserId))
    ) {
      throw new ScheduleDomainError(
        'COLLABORATOR_DUPLICATE',
        'Responsável e participantes não podem ser duplicados.'
      );
    }

    const allTargets = [
      ...(input.responsibleUserId ? [input.responsibleUserId] : []),
      ...participants,
    ];
    if (
      allTargets.some(
        (userId) =>
          !this.isEligibleMember(
            input.organizationId,
            userId,
            input.actorUserId
          )
      )
    ) {
      throw new ScheduleDomainError(
        'COLLABORATOR_INELIGIBLE',
        'Há integrante inativo ou sem acesso à Agenda.'
      );
    }

    const responsibleChanged =
      current.responsibleUserId !== input.responsibleUserId;
    const participantsChanged =
      JSON.stringify([...current.participantUserIds].sort()) !==
      JSON.stringify(participants);

    if (!responsibleChanged && !participantsChanged) {
      throw new ScheduleDomainError(
        'NO_CHANGES',
        'Nenhuma alteração foi identificada.'
      );
    }

    const now = new Date().toISOString();
    const next: ScheduleItem = {
      ...current,
      responsibleUserId: input.responsibleUserId,
      participantUserIds: participants,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
      version: current.version + 1,
    };

    this.items.set(next.id, cloneItem(next));
    this.rememberCommand({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      commandType: 'collaboration',
      fingerprint,
      itemId: next.id,
    });

    const changedFields = [
      responsibleChanged ? 'responsible_user_id' : null,
      participantsChanged ? 'participant_user_ids' : null,
    ].filter((value): value is string => Boolean(value));

    this.appendAudit({
      id: `audit-${next.id}-${next.version}`,
      organizationId: next.organizationId,
      scheduleItemId: next.id,
      action: 'updated',
      actorUserId: input.actorUserId,
      occurredAt: now,
      itemVersion: next.version,
      changedFields,
      reason: input.reason.trim(),
    });

    const revision: ScheduleCollaborationRevision = {
      id: `collaboration-${next.id}-${next.version}`,
      organizationId: next.organizationId,
      scheduleItemId: next.id,
      itemVersion: next.version,
      responsibleUserId: next.responsibleUserId,
      participantUserIds: [...next.participantUserIds],
      actorUserId: input.actorUserId,
      occurredAt: now,
      reason: input.reason.trim(),
    };
    this.collaborationRevisions.set(next.id, [
      ...(this.collaborationRevisions.get(next.id) ?? []),
      cloneRevision(revision),
    ]);

    return cloneItem(next);
  }

  private transition(
    commandType: 'complete' | 'reopen' | 'cancel',
    input: ScheduleTransitionGatewayInput
  ): ScheduleItem {
    const fingerprint = payloadFingerprint({
      scheduleItemId: input.scheduleItemId,
      expectedVersion: input.expectedVersion,
      commandType,
      reason: input.reason.trim(),
    });
    const replayed = this.replay(
      input.organizationId,
      input.idempotencyKey,
      commandType,
      input.scheduleItemId,
      fingerprint
    );
    if (replayed) return replayed;

    const current = this.items.get(input.scheduleItemId);
    if (!current || current.organizationId !== input.organizationId) {
      throw new ScheduleDomainError(
        'ITEM_NOT_FOUND',
        'Registro de agenda não encontrado.'
      );
    }
    if (current.origin.type !== 'manual') {
      throw new ScheduleDomainError(
        'SOURCE_OWNED',
        'Este registro pertence ao domínio de origem.'
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new ScheduleDomainError(
        'CONCURRENCY_CONFLICT',
        'O registro foi alterado por outra operação.'
      );
    }

    if (
      commandType === 'complete' &&
      !input.actorCanManage &&
      current.responsibleUserId !== input.actorUserId
    ) {
      throw new ScheduleDomainError(
        'RESPONSIBLE_MISMATCH',
        'Somente o responsável atual ou a gestão pode concluir.'
      );
    }
    if (
      (commandType === 'reopen' || commandType === 'cancel') &&
      !input.actorCanManage
    ) {
      throw new ScheduleDomainError(
        'PERMISSION_DENIED',
        'Somente a gestão pode realizar esta mudança.'
      );
    }

    const active = ['pending', 'in_progress', 'blocked'].includes(
      current.status
    );
    if (
      (commandType === 'complete' && !active) ||
      (commandType === 'cancel' && !active) ||
      (commandType === 'reopen' &&
        !['completed', 'cancelled'].includes(current.status))
    ) {
      throw new ScheduleDomainError(
        'INVALID_TRANSITION',
        'A mudança de situação solicitada não é permitida.'
      );
    }

    const now = new Date().toISOString();
    const nextStatus =
      commandType === 'complete'
        ? 'completed'
        : commandType === 'cancel'
          ? 'cancelled'
          : 'pending';

    const next: ScheduleItem = {
      ...current,
      status: nextStatus,
      completedAt: nextStatus === 'completed' ? now : null,
      cancelledAt: nextStatus === 'cancelled' ? now : null,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
      version: current.version + 1,
    };

    this.items.set(next.id, cloneItem(next));
    this.rememberCommand({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      commandType,
      fingerprint,
      itemId: next.id,
    });

    this.appendAudit({
      id: `audit-${next.id}-${next.version}`,
      organizationId: next.organizationId,
      scheduleItemId: next.id,
      action: 'updated',
      actorUserId: input.actorUserId,
      occurredAt: now,
      itemVersion: next.version,
      changedFields:
        commandType === 'complete'
          ? ['status', 'completed_at']
          : commandType === 'cancel'
            ? ['status', 'cancelled_at']
            : ['status', 'completed_at', 'cancelled_at'],
      reason: input.reason.trim(),
    });

    return cloneItem(next);
  }

  async completeItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return this.transition('complete', input);
  }

  async reopenItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return this.transition('reopen', input);
  }

  async cancelItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return this.transition('cancel', input);
  }

  async listCollaborationRevisions(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleCollaborationRevision[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada.', 'AbortError');
    }
    const item = this.items.get(scheduleItemId);
    if (!item || item.organizationId !== organizationId) return [];
    return (this.collaborationRevisions.get(scheduleItemId) ?? []).map(
      cloneRevision
    );
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
    this.collaborationRevisions.clear();
    this.eligibleMembers.clear();
    this.idempotency.clear();
  }
}
