import {
  ScheduleDomainError,
  type ScheduleApplicationContext,
  type ScheduleGateway,
  type ScheduleItem,
  type ScheduleOccurrence,
  type ScheduleOccurrenceGateway,
  type ScheduleOccurrenceTransitionInput,
  type ScheduleOccurrenceWindowInput,
} from '../types/schedule';
import {
  assertScheduleIdempotencyKey,
  normalizeScheduleCommandReason,
  normalizeScheduleExpectedVersion,
} from './validation';
import { normalizeOccurrenceWindow } from './recurrence';

export class ScheduleOccurrenceService {
  constructor(
    private readonly scheduleGateway: ScheduleGateway,
    private readonly occurrenceGateway: ScheduleOccurrenceGateway
  ) {}

  private assertView(context: ScheduleApplicationContext): void {
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
    if (!context.actor.permissions.includes('schedule:view')) {
      throw new ScheduleDomainError(
        'PERMISSION_DENIED',
        'Você não possui permissão para consultar recorrências da agenda.'
      );
    }
  }

  private canAccessItem(
    context: ScheduleApplicationContext,
    item: ScheduleItem
  ): boolean {
    if (context.actor.permissions.includes('schedule:manage')) return true;
    return (
      item.createdByUserId === context.actor.userId ||
      item.responsibleUserId === context.actor.userId ||
      item.participantUserIds.includes(context.actor.userId)
    );
  }

  async materializeOccurrences(
    context: ScheduleApplicationContext,
    scheduleItemId: string,
    input: ScheduleOccurrenceWindowInput,
    signal?: AbortSignal
  ): Promise<readonly ScheduleOccurrence[]> {
    this.assertView(context);
    const normalizedId = scheduleItemId.trim();
    if (!normalizedId) {
      throw new ScheduleDomainError(
        'INVALID_INPUT',
        'Identificador de agenda inválido.'
      );
    }
    const item = await this.scheduleGateway.getItemById(
      context.organizationId,
      normalizedId,
      signal
    );
    if (!item || !this.canAccessItem(context, item)) {
      throw new ScheduleDomainError(
        'ITEM_NOT_FOUND',
        'Registro de agenda não encontrado.'
      );
    }
    const window = normalizeOccurrenceWindow(input);
    return this.occurrenceGateway.materializeOccurrences(
      context.organizationId,
      normalizedId,
      window.from,
      window.to,
      signal
    );
  }

  private transition(
    context: ScheduleApplicationContext,
    occurrenceId: string,
    input: ScheduleOccurrenceTransitionInput,
    operation: (
      gatewayInput: {
        organizationId: string;
        actorUserId: string;
        actorCanManage: boolean;
        occurrenceId: string;
        expectedVersion: number;
        idempotencyKey: string;
        reason: string;
      }
    ) => Promise<ScheduleOccurrence>
  ): Promise<ScheduleOccurrence> {
    this.assertView(context);
    const normalizedId = occurrenceId.trim();
    if (!normalizedId) {
      throw new ScheduleDomainError(
        'INVALID_INPUT',
        'Identificador da ocorrência inválido.'
      );
    }
    const expectedVersion = normalizeScheduleExpectedVersion(
      input.expectedVersion
    );
    const idempotencyKey = assertScheduleIdempotencyKey(
      input.idempotencyKey
    );
    const reason = normalizeScheduleCommandReason(input.reason);
    return operation({
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      actorCanManage: context.actor.permissions.includes('schedule:manage'),
      occurrenceId: normalizedId,
      expectedVersion,
      idempotencyKey,
      reason,
    });
  }

  completeOccurrence(
    context: ScheduleApplicationContext,
    occurrenceId: string,
    input: ScheduleOccurrenceTransitionInput
  ): Promise<ScheduleOccurrence> {
    return this.transition(context, occurrenceId, input, (gatewayInput) =>
      this.occurrenceGateway.completeOccurrence(gatewayInput)
    );
  }

  reopenOccurrence(
    context: ScheduleApplicationContext,
    occurrenceId: string,
    input: ScheduleOccurrenceTransitionInput
  ): Promise<ScheduleOccurrence> {
    if (!context.actor.permissions.includes('schedule:manage')) {
      throw new ScheduleDomainError(
        'PERMISSION_DENIED',
        'Somente a gestão pode reabrir uma ocorrência.'
      );
    }
    return this.transition(context, occurrenceId, input, (gatewayInput) =>
      this.occurrenceGateway.reopenOccurrence(gatewayInput)
    );
  }

  cancelOccurrence(
    context: ScheduleApplicationContext,
    occurrenceId: string,
    input: ScheduleOccurrenceTransitionInput
  ): Promise<ScheduleOccurrence> {
    if (!context.actor.permissions.includes('schedule:manage')) {
      throw new ScheduleDomainError(
        'PERMISSION_DENIED',
        'Somente a gestão pode cancelar uma ocorrência.'
      );
    }
    return this.transition(context, occurrenceId, input, (gatewayInput) =>
      this.occurrenceGateway.cancelOccurrence(gatewayInput)
    );
  }

  clearSessionData(): void {
    this.occurrenceGateway.clearAllSessionData();
  }
}
