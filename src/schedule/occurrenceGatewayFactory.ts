import {
  type ScheduleOccurrence,
  type ScheduleOccurrenceAuditEntry,
  type ScheduleOccurrenceGateway,
  type ScheduleOccurrenceTransitionGatewayInput,
} from '../types/schedule';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { getScheduleGateway } from './gatewayFactory';
import { SupabaseScheduleOccurrenceGateway } from './supabaseScheduleOccurrenceGateway';
import { UnavailableScheduleOccurrenceGateway } from './unavailableScheduleOccurrenceGateway';

class LazyDevelopmentScheduleOccurrenceGateway
  implements ScheduleOccurrenceGateway
{
  private instancePromise: Promise<ScheduleOccurrenceGateway> | null = null;

  private load(): Promise<ScheduleOccurrenceGateway> {
    if (!this.instancePromise) {
      this.instancePromise = import(
        './preview/previewScheduleOccurrenceGateway'
      ).then(
        (module) =>
          new module.PreviewScheduleOccurrenceGateway(getScheduleGateway())
      );
    }
    return this.instancePromise;
  }

  async materializeOccurrences(
    organizationId: string,
    scheduleItemId: string,
    from: string,
    to: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleOccurrence[]> {
    return (await this.load()).materializeOccurrences(
      organizationId,
      scheduleItemId,
      from,
      to,
      signal
    );
  }

  async completeOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return (await this.load()).completeOccurrence(input);
  }

  async reopenOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return (await this.load()).reopenOccurrence(input);
  }

  async cancelOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return (await this.load()).cancelOccurrence(input);
  }

  async listOccurrenceAudit(
    organizationId: string,
    occurrenceId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleOccurrenceAuditEntry[]> {
    return (await this.load()).listOccurrenceAudit(
      organizationId,
      occurrenceId,
      signal
    );
  }

  clearAllSessionData(): void {
    if (this.instancePromise) {
      void this.instancePromise.then((gateway) =>
        gateway.clearAllSessionData()
      );
    }
    this.instancePromise = null;
  }
}

let activeGateway: ScheduleOccurrenceGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getScheduleOccurrenceGateway(): ScheduleOccurrenceGateway {
  if (activeGateway) return activeGateway;

  const supabase = getSupabaseClient();
  if (supabase) {
    activeGateway = new SupabaseScheduleOccurrenceGateway(supabase);
    return activeGateway;
  }

  if (import.meta.env.DEV) {
    const developmentGateway = new LazyDevelopmentScheduleOccurrenceGateway();
    unregisterCleanup?.();
    unregisterCleanup = registerDomainCleanup(() =>
      developmentGateway.clearAllSessionData()
    );
    activeGateway = developmentGateway;
    return activeGateway;
  }

  activeGateway = new UnavailableScheduleOccurrenceGateway();
  return activeGateway;
}

export function setScheduleOccurrenceGatewayForTesting(
  gateway: ScheduleOccurrenceGateway | null
): void {
  unregisterCleanup?.();
  unregisterCleanup = null;
  activeGateway = gateway;
}
