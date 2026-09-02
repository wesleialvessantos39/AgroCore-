import type {
  SaveTechnicalVisitFieldFormInput,
  TechnicalVisitFieldForm,
  TechnicalVisitFieldFormGateway,
  TechnicalVisitFieldFormRevision,
} from '../types/technicalVisitFieldForm';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { SupabaseTechnicalVisitFieldFormGateway } from './supabaseFieldFormGateway';
import { UnavailableTechnicalVisitFieldFormGateway } from './unavailableFieldFormGateway';

class LazyDevelopmentFieldFormGateway
  implements TechnicalVisitFieldFormGateway
{
  private instancePromise: Promise<TechnicalVisitFieldFormGateway> | null = null;

  private load(): Promise<TechnicalVisitFieldFormGateway> {
    if (!this.instancePromise) {
      this.instancePromise = import('./preview/previewFieldFormGateway').then(
        (module) => new module.PreviewTechnicalVisitFieldFormGateway()
      );
    }
    return this.instancePromise;
  }

  async getFieldForm(
    organizationId: string,
    visitId: string,
    signal?: AbortSignal
  ): Promise<TechnicalVisitFieldForm | null> {
    return (await this.load()).getFieldForm(organizationId, visitId, signal);
  }

  async saveFieldForm(
    input: SaveTechnicalVisitFieldFormInput,
    signal?: AbortSignal
  ): Promise<TechnicalVisitFieldForm> {
    return (await this.load()).saveFieldForm(input, signal);
  }

  async listFieldFormRevisions(
    organizationId: string,
    visitId: string,
    signal?: AbortSignal
  ): Promise<readonly TechnicalVisitFieldFormRevision[]> {
    return (await this.load()).listFieldFormRevisions(
      organizationId,
      visitId,
      signal
    );
  }

  clearAllSessionData(): void {
    if (this.instancePromise) {
      void this.instancePromise.then((gateway) => gateway.clearAllSessionData());
    }
    this.instancePromise = null;
  }
}

let activeGateway: TechnicalVisitFieldFormGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getTechnicalVisitFieldFormGateway(): TechnicalVisitFieldFormGateway {
  if (activeGateway) return activeGateway;

  const supabase = getSupabaseClient();
  if (supabase) {
    activeGateway = new SupabaseTechnicalVisitFieldFormGateway(supabase);
    return activeGateway;
  }

  if (import.meta.env.DEV) {
    const preview = new LazyDevelopmentFieldFormGateway();
    if (unregisterCleanup) unregisterCleanup();
    unregisterCleanup = registerDomainCleanup(() => preview.clearAllSessionData());
    activeGateway = preview;
    return activeGateway;
  }

  activeGateway = new UnavailableTechnicalVisitFieldFormGateway();
  return activeGateway;
}

export function setTechnicalVisitFieldFormGatewayForTesting(
  gateway: TechnicalVisitFieldFormGateway | null
): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGateway = gateway;
}
