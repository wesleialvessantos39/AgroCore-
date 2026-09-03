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

  async listEligibleMembers(
    _organizationId: string,
    _signal?: AbortSignal
  ): Promise<readonly ScheduleMemberOption[]> {
    return this.fail();
  }

  async setCollaboration(
    _input: SetScheduleCollaborationGatewayInput
  ): Promise<ScheduleItem> {
    return this.fail();
  }

  async completeItem(
    _input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return this.fail();
  }

  async reopenItem(
    _input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return this.fail();
  }

  async cancelItem(
    _input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return this.fail();
  }

  async listCollaborationRevisions(
    _organizationId: string,
    _scheduleItemId: string,
    _signal?: AbortSignal
  ): Promise<readonly ScheduleCollaborationRevision[]> {
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
