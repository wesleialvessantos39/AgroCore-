import type { ScheduleOccurrenceGateway } from '../types/schedule';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { getScheduleGateway } from './gatewayFactory';
import { SupabaseScheduleOccurrenceGateway } from './supabaseScheduleOccurrenceGateway';
import { UnavailableScheduleOccurrenceGateway } from './unavailableScheduleOccurrenceGateway';

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
    activeGateway = new UnavailableScheduleOccurrenceGateway();
    void import('./preview/previewScheduleOccurrenceGateway').then((module) => {
      if (activeGateway instanceof UnavailableScheduleOccurrenceGateway) {
        const preview = new module.PreviewScheduleOccurrenceGateway(
          getScheduleGateway()
        );
        unregisterCleanup?.();
        unregisterCleanup = registerDomainCleanup(() =>
          preview.clearAllSessionData()
        );
        activeGateway = preview;
      }
    });
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
