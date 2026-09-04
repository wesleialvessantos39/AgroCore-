import {
  ScheduleDomainError,
  type ScheduleOccurrence,
  type ScheduleOccurrenceAuditEntry,
  type ScheduleOccurrenceGateway,
  type ScheduleOccurrenceTransitionGatewayInput,
} from '../types/schedule';

export class UnavailableScheduleOccurrenceGateway
  implements ScheduleOccurrenceGateway
{
  private fail(): never {
    throw new ScheduleDomainError(
      'SERVICE_UNAVAILABLE',
      'O serviço de recorrência da agenda está indisponível neste ambiente.'
    );
  }

  async materializeOccurrences(
    _organizationId: string,
    _scheduleItemId: string,
    _from: string,
    _to: string,
    _signal?: AbortSignal
  ): Promise<readonly ScheduleOccurrence[]> {
    return this.fail();
  }

  async completeOccurrence(
    _input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return this.fail();
  }

  async reopenOccurrence(
    _input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return this.fail();
  }

  async cancelOccurrence(
    _input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return this.fail();
  }

  async listOccurrenceAudit(
    _organizationId: string,
    _occurrenceId: string,
    _signal?: AbortSignal
  ): Promise<readonly ScheduleOccurrenceAuditEntry[]> {
    return this.fail();
  }

  clearAllSessionData(): void {}
}
