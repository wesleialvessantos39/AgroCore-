import {
  ScheduleDomainError,
  type CreateCalendarAppointmentInput,
  type CreateCorporateTaskInput,
  type ScheduleApplicationContext,
  type ScheduleGateway,
  type ScheduleItem,
  type ScheduleItemAuditEntry,
  type ScheduleItemListFilters,
  type UpdateScheduleItemInput,
} from '../types/schedule';
import {
  assertScheduleIdempotencyKey,
  normalizeCreateScheduleItem,
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
    return this.gateway.listItems(
      context.organizationId,
      context.actor.userId,
      filters,
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
