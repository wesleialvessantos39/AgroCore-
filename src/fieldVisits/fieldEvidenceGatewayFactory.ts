import type { FieldEvidenceGateway } from '../types/fieldEvidence';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { SupabaseFieldEvidenceGateway } from './supabaseFieldEvidenceGateway';
import { UnavailableFieldEvidenceGateway } from './unavailableFieldEvidenceGateway';

class LazyDevelopmentFieldEvidenceGateway implements FieldEvidenceGateway {
  private instancePromise: Promise<FieldEvidenceGateway> | null = null;

  private load(): Promise<FieldEvidenceGateway> {
    if (!this.instancePromise) {
      this.instancePromise = import('./preview/previewFieldEvidenceGateway').then(
        (module) => new module.PreviewFieldEvidenceGateway()
      );
    }
    return this.instancePromise;
  }

  async getByProperty(...args: Parameters<FieldEvidenceGateway['getByProperty']>) {
    return (await this.load()).getByProperty(...args);
  }

  async getByVisit(...args: Parameters<FieldEvidenceGateway['getByVisit']>) {
    return (await this.load()).getByVisit(...args);
  }

  async getByAppraisal(...args: Parameters<FieldEvidenceGateway['getByAppraisal']>) {
    return (await this.load()).getByAppraisal(...args);
  }

  async initialize(...args: Parameters<FieldEvidenceGateway['initialize']>) {
    return (await this.load()).initialize(...args);
  }

  async setLocation(...args: Parameters<FieldEvidenceGateway['setLocation']>) {
    return (await this.load()).setLocation(...args);
  }

  async uploadPhoto(...args: Parameters<FieldEvidenceGateway['uploadPhoto']>) {
    return (await this.load()).uploadPhoto(...args);
  }

  async createPhotoUrl(...args: Parameters<FieldEvidenceGateway['createPhotoUrl']>) {
    return (await this.load()).createPhotoUrl(...args);
  }

  clearAllSessionData(): void {
    if (this.instancePromise) {
      void this.instancePromise.then((gateway) => gateway.clearAllSessionData());
    }
    this.instancePromise = null;
  }
}

let activeGateway: FieldEvidenceGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getFieldEvidenceGateway(): FieldEvidenceGateway {
  if (activeGateway) return activeGateway;

  const supabase = getSupabaseClient();
  if (supabase) {
    activeGateway = new SupabaseFieldEvidenceGateway(supabase);
    return activeGateway;
  }

  if (import.meta.env.DEV) {
    const preview = new LazyDevelopmentFieldEvidenceGateway();
    if (unregisterCleanup) unregisterCleanup();
    unregisterCleanup = registerDomainCleanup(() => preview.clearAllSessionData());
    activeGateway = preview;
    return activeGateway;
  }

  activeGateway = new UnavailableFieldEvidenceGateway();
  return activeGateway;
}

export function setFieldEvidenceGatewayForTesting(
  gateway: FieldEvidenceGateway | null
): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGateway = gateway;
}
