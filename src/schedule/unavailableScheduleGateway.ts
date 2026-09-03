import {
  ScheduleDomainError,
  type CreateScheduleItemGatewayInput,
  type ScheduleGateway,
  type ScheduleItem,
  type ScheduleItemAuditEntry,
  type ScheduleItemListFilters,
  type UpdateScheduleItemGatewayInput,
} from '../types/schedule';

export class UnavailableScheduleGateway implements ScheduleGateway {
  private fail(): never {
    throw new ScheduleDomainError(
      'SERVICE_UNAVAILABLE',
      'O serviço de agenda está indisponível neste ambiente.'
    );
  }

  async listItems(
    _organizationId: string,
    _actorUserId: string,
    _filters?: ScheduleItemListFilters,
    _signal?: AbortSignal
  ): Promise<readonly ScheduleItem[]> {
    return this.fail();
  }

  async getItemById(
    _organizationId: string,
    _scheduleItemId: string,
    _signal?: AbortSignal
  ): Promise<ScheduleItem | null> {
    return this.fail();
  }

  async createItem(
    _input: CreateScheduleItemGatewayInput
  ): Promise<ScheduleItem> {
    return this.fail();
  }

  async updateItem(
    _input: UpdateScheduleItemGatewayInput
  ): Promise<ScheduleItem> {
    return this.fail();
  }

  async listAudit(
    _organizationId: string,
    _scheduleItemId: string,
    _signal?: AbortSignal
  ): Promise<readonly ScheduleItemAuditEntry[]> {
    return this.fail();
  }

  clearAllSessionData(): void {}
}
