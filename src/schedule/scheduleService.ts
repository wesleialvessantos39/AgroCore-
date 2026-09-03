import {
  ScheduleDomainError,
  type CreateCalendarAppointmentInput,
  type CreateCorporateTaskInput,
  type ScheduleApplicationContext,
  type ScheduleGateway,
  type ScheduleCollaborationRevision,
  type ScheduleItem,
  type ScheduleItemAuditEntry,
  type ScheduleItemListFilters,
  type ScheduleMemberOption,
  type ScheduleTransitionInput,
  type SetScheduleCollaborationInput,
  type UpdateScheduleItemInput,
} from '../types/schedule';
import {
  assertScheduleIdempotencyKey,
  normalizeCreateScheduleItem,
  normalizeScheduleCollaborationInput,
  normalizeScheduleListFilters,
  normalizeScheduleTransitionInput,
  normalizeUpdateScheduleItem,
} from './validation';

export class ScheduleService {
  constructor(private readonly gateway: ScheduleGateway) {}

  private assertActiveContext(
    context: ScheduleApplicationContext,
    permission: 'schedule:view' | 'schedule:manage'
  ): void {
    if (
      !context.organizationId ||
      !context.actor.userId ||
      !context.actor.isActive
    ) {
      throw new ScheduleDomainError(
        'ORGANIZATION_REQUIRED',
        'É necessário possuir vínculo ativo com uma organização.'
      );
    }
    if (!context.actor.permissions.includes(permission)) {
      throw new ScheduleDomainError(
        'PERMISSION_DENIED',
        'Você não possui permissão para esta operação de agenda.'
      );
    }
  }

  async listItems(
    context: ScheduleApplicationContext,
    filters: ScheduleItemListFilters = {},
    signal?: AbortSignal
  ): Promise<readonly ScheduleItem[]> {
    this.assertActiveContext(context, 'schedule:view');
    const normalizedFilters = normalizeScheduleListFilters(filters);
    return this.gateway.listItems(
      context.organizationId,
      context.actor.userId,
      normalizedFilters,
      signal
    );
  }

  async getItemById(
    context: ScheduleApplicationContext,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<ScheduleItem | null> {
    this.assertActiveContext(context, 'schedule:view');
    const normalizedId = scheduleItemId.trim();
    if (!normalizedId) {
      throw new ScheduleDomainError(
        'INVALID_INPUT',
        'Identificador de agenda inválido.'
      );
    }
    return this.gateway.getItemById(
      context.organizationId,
      normalizedId,
      signal
    );
  }

  async createTask(
    context: ScheduleApplicationContext,
    input: Omit<CreateCorporateTaskInput, 'kind'>
  ): Promise<ScheduleItem> {
    return this.createItem(context, { ...input, kind: 'task' });
  }

  async createAppointment(
    context: ScheduleApplicationContext,
    input: Omit<CreateCalendarAppointmentInput, 'kind'>
  ): Promise<ScheduleItem> {
    return this.createItem(context, {
      ...input,
      kind: 'appointment',
    });
  }

  private async createItem(
    context: ScheduleApplicationContext,
    input: CreateCorporateTaskInput | CreateCalendarAppointmentInput
  ): Promise<ScheduleItem> {
    this.assertActiveContext(context, 'schedule:manage');
    const payload = normalizeCreateScheduleItem(input);
    const idempotencyKey = assertScheduleIdempotencyKey(
      input.idempotencyKey
    );
    return this.gateway.createItem({
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      payload,
      idempotencyKey,
    });
  }

  async updateItem(
    context: ScheduleApplicationContext,
    scheduleItemId: string,
    input: UpdateScheduleItemInput
  ): Promise<ScheduleItem> {
    this.assertActiveContext(context, 'schedule:manage');
    const normalizedId = scheduleItemId.trim();
    if (!normalizedId) {
      throw new ScheduleDomainError(
        'INVALID_INPUT',
        'Identificador de agenda inválido.'
      );
    }

    const current = await this.gateway.getItemById(
      context.organizationId,
      normalizedId
    );
    if (!current) {
      throw new ScheduleDomainError(
        'ITEM_NOT_FOUND',
        'Registro de agenda não encontrado.'
      );
    }
    if (current.kind !== input.kind) {
      throw new ScheduleDomainError(
        'INVALID_INPUT',
        'O tipo do registro de agenda não pode ser alterado.'
      );
    }
    if (current.origin.type !== 'manual') {
      throw new ScheduleDomainError(
        'SOURCE_OWNED',
        'Este registro pertence ao domínio de origem e não pode ser alterado manualmente.'
      );
    }
    if (current.status !== 'pending') {
      throw new ScheduleDomainError(
        'STATUS_LOCKED',
        'Este registro não pode ser editado em sua situação atual.'
      );
    }

    const payload = normalizeUpdateScheduleItem(input);
    const idempotencyKey = assertScheduleIdempotencyKey(
      input.idempotencyKey
    );
    return this.gateway.updateItem({
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      scheduleItemId: normalizedId,
      expectedVersion: input.expectedVersion,
      idempotencyKey,
      payload,
      reason: input.reason.trim(),
    });
  }

  async listEligibleMembers(
    context: ScheduleApplicationContext,
    signal?: AbortSignal
  ): Promise<readonly ScheduleMemberOption[]> {
    this.assertActiveContext(context, 'schedule:view');
    return this.gateway.listEligibleMembers(
      context.organizationId,
      signal
    );
  }

  async setCollaboration(
    context: ScheduleApplicationContext,
    scheduleItemId: string,
    input: SetScheduleCollaborationInput
  ): Promise<ScheduleItem> {
    this.assertActiveContext(context, 'schedule:manage');
    const normalizedId = scheduleItemId.trim();
    if (!normalizedId) {
      throw new ScheduleDomainError(
        'INVALID_INPUT',
        'Identificador de agenda inválido.'
      );
    }

    const current = await this.gateway.getItemById(
      context.organizationId,
      normalizedId
    );
    if (!current) {
      throw new ScheduleDomainError(
        'ITEM_NOT_FOUND',
        'Registro de agenda não encontrado.'
      );
    }
    if (current.origin.type !== 'manual') {
      throw new ScheduleDomainError(
        'SOURCE_OWNED',
        'Este registro pertence ao domínio de origem e não pode ter colaboração alterada manualmente.'
      );
    }
    if (current.status === 'completed' || current.status === 'cancelled') {
      throw new ScheduleDomainError(
        'STATUS_LOCKED',
        'Reabra o registro antes de alterar responsável ou participantes.'
      );
    }

    const normalized = normalizeScheduleCollaborationInput(input);
    return this.gateway.setCollaboration({
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      scheduleItemId: normalizedId,
      expectedVersion: normalized.expectedVersion,
      idempotencyKey: normalized.idempotencyKey,
      responsibleUserId: normalized.responsibleUserId,
      participantUserIds: normalized.participantUserIds,
      reason: normalized.reason,
    });
  }

  async completeItem(
    context: ScheduleApplicationContext,
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ): Promise<ScheduleItem> {
    this.assertActiveContext(context, 'schedule:view');
    const current = await this.requireMutableItem(context, scheduleItemId);
    const canManage = context.actor.permissions.includes('schedule:manage');

    if (!canManage && current.responsibleUserId !== context.actor.userId) {
      throw new ScheduleDomainError(
        'RESPONSIBLE_MISMATCH',
        'Somente o responsável atual ou a gestão pode concluir este registro.'
      );
    }
    const normalized = normalizeScheduleTransitionInput(input);
    return this.gateway.completeItem({
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      actorCanManage: canManage,
      scheduleItemId: current.id,
      expectedVersion: normalized.expectedVersion,
      idempotencyKey: normalized.idempotencyKey,
      reason: normalized.reason,
    });
  }

  async reopenItem(
    context: ScheduleApplicationContext,
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ): Promise<ScheduleItem> {
    this.assertActiveContext(context, 'schedule:manage');
    const current = await this.requireMutableItem(context, scheduleItemId);
    const normalized = normalizeScheduleTransitionInput(input);
    return this.gateway.reopenItem({
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      actorCanManage: true,
      scheduleItemId: current.id,
      expectedVersion: normalized.expectedVersion,
      idempotencyKey: normalized.idempotencyKey,
      reason: normalized.reason,
    });
  }

  async cancelItem(
    context: ScheduleApplicationContext,
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ): Promise<ScheduleItem> {
    this.assertActiveContext(context, 'schedule:manage');
    const current = await this.requireMutableItem(context, scheduleItemId);
    const normalized = normalizeScheduleTransitionInput(input);
    return this.gateway.cancelItem({
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      actorCanManage: true,
      scheduleItemId: current.id,
      expectedVersion: normalized.expectedVersion,
      idempotencyKey: normalized.idempotencyKey,
      reason: normalized.reason,
    });
  }

  async listCollaborationRevisions(
    context: ScheduleApplicationContext,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleCollaborationRevision[]> {
    this.assertActiveContext(context, 'schedule:view');
    const item = await this.getItemById(
      context,
      scheduleItemId,
      signal
    );
    if (!item) return [];
    return this.gateway.listCollaborationRevisions(
      context.organizationId,
      item.id,
      signal
    );
  }

  private async requireMutableItem(
    context: ScheduleApplicationContext,
    scheduleItemId: string
  ): Promise<ScheduleItem> {
    const normalizedId = scheduleItemId.trim();
    if (!normalizedId) {
      throw new ScheduleDomainError(
        'INVALID_INPUT',
        'Identificador de agenda inválido.'
      );
    }

    const current = await this.gateway.getItemById(
      context.organizationId,
      normalizedId
    );
    if (!current) {
      throw new ScheduleDomainError(
        'ITEM_NOT_FOUND',
        'Registro de agenda não encontrado.'
      );
    }
    if (current.origin.type !== 'manual') {
      throw new ScheduleDomainError(
        'SOURCE_OWNED',
        'Este registro pertence ao domínio de origem e não pode ter seu ciclo alterado manualmente.'
      );
    }
    return current;
  }

  async listAudit(
    context: ScheduleApplicationContext,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleItemAuditEntry[]> {
    this.assertActiveContext(context, 'schedule:view');
    const item = await this.getItemById(
      context,
      scheduleItemId,
      signal
    );
    if (!item) return [];
    return this.gateway.listAudit(
      context.organizationId,
      item.id,
      signal
    );
  }
}
