import {
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
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { SupabaseScheduleGateway } from './supabaseScheduleGateway';
import { UnavailableScheduleGateway } from './unavailableScheduleGateway';

class LazyDevelopmentScheduleGateway implements ScheduleGateway {
  private instancePromise: Promise<ScheduleGateway> | null = null;

  private load(): Promise<ScheduleGateway> {
    if (!this.instancePromise) {
      this.instancePromise = import('./preview/previewScheduleGateway').then(
        (module) => new module.PreviewScheduleGateway()
      );
    }
    return this.instancePromise;
  }

  async listItems(
    organizationId: string,
    actorUserId: string,
    filters?: ScheduleItemListFilters,
    signal?: AbortSignal
  ): Promise<readonly ScheduleItem[]> {
    return (await this.load()).listItems(
      organizationId,
      actorUserId,
      filters,
      signal
    );
  }

  async getItemById(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<ScheduleItem | null> {
    return (await this.load()).getItemById(
      organizationId,
      scheduleItemId,
      signal
    );
  }

  async createItem(
    input: CreateScheduleItemGatewayInput
  ): Promise<ScheduleItem> {
    return (await this.load()).createItem(input);
  }

  async updateItem(
    input: UpdateScheduleItemGatewayInput
  ): Promise<ScheduleItem> {
    return (await this.load()).updateItem(input);
  }

  async listEligibleMembers(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleMemberOption[]> {
    return (await this.load()).listEligibleMembers(
      organizationId,
      signal
    );
  }

  async setCollaboration(
    input: SetScheduleCollaborationGatewayInput
  ): Promise<ScheduleItem> {
    return (await this.load()).setCollaboration(input);
  }

  async completeItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return (await this.load()).completeItem(input);
  }

  async reopenItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return (await this.load()).reopenItem(input);
  }

  async cancelItem(
    input: ScheduleTransitionGatewayInput
  ): Promise<ScheduleItem> {
    return (await this.load()).cancelItem(input);
  }

  async listCollaborationRevisions(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleCollaborationRevision[]> {
    return (await this.load()).listCollaborationRevisions(
      organizationId,
      scheduleItemId,
      signal
    );
  }

  async listAudit(
    organizationId: string,
    scheduleItemId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleItemAuditEntry[]> {
    return (await this.load()).listAudit(
      organizationId,
      scheduleItemId,
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

let activeGateway: ScheduleGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getScheduleGateway(): ScheduleGateway {
  if (activeGateway) return activeGateway;

  const supabase = getSupabaseClient();
  if (supabase) {
    activeGateway = new SupabaseScheduleGateway(supabase);
    return activeGateway;
  }

  if (import.meta.env.DEV) {
    const developmentGateway = new LazyDevelopmentScheduleGateway();
    unregisterCleanup?.();
    unregisterCleanup = registerDomainCleanup(() =>
      developmentGateway.clearAllSessionData()
    );
    activeGateway = developmentGateway;
    return activeGateway;
  }

  activeGateway = new UnavailableScheduleGateway();
  return activeGateway;
}

export function setScheduleGatewayForTesting(
  gateway: ScheduleGateway | null
): void {
  unregisterCleanup?.();
  unregisterCleanup = null;
  activeGateway = gateway;
}
