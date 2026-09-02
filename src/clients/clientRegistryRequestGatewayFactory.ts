import type { ClientRegistryRequestGateway } from '../types/clientRegistryRequest';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { SupabaseClientRegistryRequestGateway } from './supabaseClientRegistryRequestGateway';
import { UnavailableClientRegistryRequestGateway } from './unavailableClientRegistryRequestGateway';

class LazyPreviewClientRegistryRequestGateway
  implements ClientRegistryRequestGateway
{
  private instancePromise: Promise<ClientRegistryRequestGateway> | null = null;

  private load(): Promise<ClientRegistryRequestGateway> {
    if (!this.instancePromise) {
      this.instancePromise = import('./preview/previewClientRegistryRequestGateway').then(
        (module) => new module.PreviewClientRegistryRequestGateway()
      );
    }
    return this.instancePromise;
  }

  async listAssigned(...args: Parameters<ClientRegistryRequestGateway['listAssigned']>) {
    return (await this.load()).listAssigned(...args);
  }

  async listRequestedBy(...args: Parameters<ClientRegistryRequestGateway['listRequestedBy']>) {
    return (await this.load()).listRequestedBy(...args);
  }

  async create(...args: Parameters<ClientRegistryRequestGateway['create']>) {
    return (await this.load()).create(...args);
  }

  async start(...args: Parameters<ClientRegistryRequestGateway['start']>) {
    return (await this.load()).start(...args);
  }

  async attachProperty(...args: Parameters<ClientRegistryRequestGateway['attachProperty']>) {
    return (await this.load()).attachProperty(...args);
  }

  async fulfill(...args: Parameters<ClientRegistryRequestGateway['fulfill']>) {
    return (await this.load()).fulfill(...args);
  }

  clearAllSessionData(): void {
    if (this.instancePromise) {
      void this.instancePromise.then((gateway) => gateway.clearAllSessionData());
    }
    this.instancePromise = null;
  }
}

let activeGateway: ClientRegistryRequestGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getClientRegistryRequestGateway(): ClientRegistryRequestGateway {
  if (activeGateway) return activeGateway;

  const supabase = getSupabaseClient();
  if (supabase) {
    activeGateway = new SupabaseClientRegistryRequestGateway(supabase);
    return activeGateway;
  }

  if (import.meta.env.DEV) {
    const preview = new LazyPreviewClientRegistryRequestGateway();
    if (unregisterCleanup) unregisterCleanup();
    unregisterCleanup = registerDomainCleanup(() => preview.clearAllSessionData());
    activeGateway = preview;
    return activeGateway;
  }

  activeGateway = new UnavailableClientRegistryRequestGateway();
  return activeGateway;
}

export function setClientRegistryRequestGatewayForTesting(
  gateway: ClientRegistryRequestGateway | null
): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGateway = gateway;
}
