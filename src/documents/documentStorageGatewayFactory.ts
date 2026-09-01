import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import type { DocumentStorageGateway } from './documentStorageGateway';
import { SupabaseDocumentStorageGateway } from './supabaseDocumentStorageGateway';
import { UnavailableDocumentStorageGateway } from './unavailableDocumentStorageGateway';
import { VolatileDocumentStorageGateway } from './volatileDocumentStorageGateway';

let activeGateway: DocumentStorageGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

function activate(gateway: DocumentStorageGateway): DocumentStorageGateway {
  activeGateway = gateway;
  if (gateway.clearAllSessionData) {
    unregisterCleanup = registerDomainCleanup(() => gateway.clearAllSessionData?.());
  }
  return gateway;
}

export function getDocumentStorageGateway(): DocumentStorageGateway {
  if (activeGateway) return activeGateway;
  const supabase = getSupabaseClient();
  if (supabase) return activate(new SupabaseDocumentStorageGateway(supabase));
  if (import.meta.env.DEV) return activate(new VolatileDocumentStorageGateway());
  return activate(new UnavailableDocumentStorageGateway());
}

export function setDocumentStorageGatewayForTesting(gateway: DocumentStorageGateway | null): void {
  unregisterCleanup?.();
  unregisterCleanup = null;
  activeGateway = null;
  if (gateway) activate(gateway);
}
