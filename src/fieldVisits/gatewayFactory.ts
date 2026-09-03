import type {
  CompleteTechnicalVisitGatewayInput,
  ReviseTechnicalVisitReportGatewayInput,
  TechnicalVisit,
  TechnicalVisitAuditEntry,
  TechnicalVisitCompletionResult,
  TechnicalVisitGateway,
  TechnicalVisitListFilters,
  TechnicalVisitWrite,
} from '../types/technicalVisit';
import type { TechnicalVisitReport } from '../types/technicalVisitReport';
import type { TechnicalVisitIntegrationSnapshot } from '../types/technicalVisitIntegration';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { UnavailableTechnicalVisitGateway } from './unavailableGateway';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { SupabaseTechnicalVisitGateway } from './supabaseTechnicalVisitGateway';

class LazyDevelopmentTechnicalVisitGateway implements TechnicalVisitGateway {
  private instancePromise: Promise<TechnicalVisitGateway> | null = null;

  private load(): Promise<TechnicalVisitGateway> {
    if (!this.instancePromise) {
      this.instancePromise = import('./preview/previewTechnicalVisitGateway').then(
        (module) => new module.PreviewTechnicalVisitGateway()
      );
    }
    return this.instancePromise;
  }

  async listVisits(
    organizationId: string,
    filters?: TechnicalVisitListFilters,
    signal?: AbortSignal
  ): Promise<readonly TechnicalVisit[]> {
    return (await this.load()).listVisits(organizationId, filters, signal);
  }

  async getVisitById(
    organizationId: string,
    visitId: string
  ): Promise<TechnicalVisit | null> {
    return (await this.load()).getVisitById(organizationId, visitId);
  }

  async createVisit(write: TechnicalVisitWrite): Promise<TechnicalVisit> {
    return (await this.load()).createVisit(write);
  }

  async updateVisit(write: TechnicalVisitWrite): Promise<TechnicalVisit> {
    return (await this.load()).updateVisit(write);
  }

  async listAudit(
    organizationId: string,
    visitId: string
  ): Promise<readonly TechnicalVisitAuditEntry[]> {
    return (await this.load()).listAudit(organizationId, visitId);
  }

  async completeVisit(
    input: CompleteTechnicalVisitGatewayInput
  ): Promise<TechnicalVisitCompletionResult> {
    return (await this.load()).completeVisit(input);
  }

  async getLatestReport(
    organizationId: string,
    visitId: string
  ): Promise<TechnicalVisitReport | null> {
    return (await this.load()).getLatestReport(organizationId, visitId);
  }

  async listReportVersions(
    organizationId: string,
    visitId: string
  ): Promise<readonly TechnicalVisitReport[]> {
    return (await this.load()).listReportVersions(organizationId, visitId);
  }

  async reviseReport(
    input: ReviseTechnicalVisitReportGatewayInput
  ): Promise<TechnicalVisitReport> {
    return (await this.load()).reviseReport(input);
  }

  async getIntegrationSnapshot(
    organizationId: string,
    visitId: string
  ): Promise<TechnicalVisitIntegrationSnapshot> {
    return (await this.load()).getIntegrationSnapshot(organizationId, visitId);
  }

  clearAllSessionData(): void {
    if (this.instancePromise) {
      void this.instancePromise.then((gateway) => gateway.clearAllSessionData());
    }
    this.instancePromise = null;
  }
}

let activeGatewayInstance: TechnicalVisitGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getTechnicalVisitGateway(): TechnicalVisitGateway {
  if (activeGatewayInstance) return activeGatewayInstance;

  const supabase = getSupabaseClient();
  if (supabase) {
    activeGatewayInstance = new SupabaseTechnicalVisitGateway(supabase);
    return activeGatewayInstance;
  }

  if (import.meta.env.DEV) {
    const developmentGateway = new LazyDevelopmentTechnicalVisitGateway();
    if (unregisterCleanup) unregisterCleanup();
    unregisterCleanup = registerDomainCleanup(() => {
      developmentGateway.clearAllSessionData();
    });
    activeGatewayInstance = developmentGateway;
    return activeGatewayInstance;
  }

  activeGatewayInstance = new UnavailableTechnicalVisitGateway();
  return activeGatewayInstance;
}

export function setTechnicalVisitGatewayForTesting(
  gateway: TechnicalVisitGateway | null
): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGatewayInstance = gateway;
}
