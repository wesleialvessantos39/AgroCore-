import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import type { NotificationGateway } from './types';
import { SupabaseNotificationGateway } from './supabaseNotificationGateway';
import { UnavailableNotificationGateway } from './unavailableNotificationGateway';

let activeGateway: NotificationGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getNotificationGateway(): NotificationGateway {
  if (activeGateway) return activeGateway;

  const supabase = getSupabaseClient();
  activeGateway = supabase
    ? new SupabaseNotificationGateway(supabase)
    : new UnavailableNotificationGateway();

  unregisterCleanup?.();
  unregisterCleanup = registerDomainCleanup(() => {
    activeGateway?.clearAllSessionData();
    activeGateway = null;
  });

  return activeGateway;
}

export function setNotificationGatewayForTesting(
  gateway: NotificationGateway | null
): void {
  unregisterCleanup?.();
  unregisterCleanup = null;
  activeGateway = gateway;
}
