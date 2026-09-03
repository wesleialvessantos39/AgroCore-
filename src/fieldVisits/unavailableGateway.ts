import {
  TechnicalVisitDomainError,
  type CompleteTechnicalVisitGatewayInput,
  type ReviseTechnicalVisitReportGatewayInput,
  type TechnicalVisit,
  type TechnicalVisitAuditEntry,
  type TechnicalVisitCompletionResult,
  type TechnicalVisitGateway,
  type TechnicalVisitListFilters,
  type TechnicalVisitWrite,
} from '../types/technicalVisit';
import type { TechnicalVisitReport } from '../types/technicalVisitReport';

export class UnavailableTechnicalVisitGateway implements TechnicalVisitGateway {
  private fail(): never {
    throw new TechnicalVisitDomainError(
      'SERVICE_UNAVAILABLE',
      'O serviço de visitas e vistorias está indisponível neste ambiente.'
    );
  }

  async listVisits(
    _organizationId: string,
    _filters?: TechnicalVisitListFilters,
    _signal?: AbortSignal
  ): Promise<readonly TechnicalVisit[]> {
    return this.fail();
  }

  async getVisitById(
    _organizationId: string,
    _visitId: string
  ): Promise<TechnicalVisit | null> {
    return this.fail();
  }

  async createVisit(_write: TechnicalVisitWrite): Promise<TechnicalVisit> {
    return this.fail();
  }

  async updateVisit(_write: TechnicalVisitWrite): Promise<TechnicalVisit> {
    return this.fail();
  }

  async listAudit(
    _organizationId: string,
    _visitId: string
  ): Promise<readonly TechnicalVisitAuditEntry[]> {
    return this.fail();
  }

  async completeVisit(
    _input: CompleteTechnicalVisitGatewayInput
  ): Promise<TechnicalVisitCompletionResult> {
    return this.fail();
  }

  async getLatestReport(
    _organizationId: string,
    _visitId: string
  ): Promise<TechnicalVisitReport | null> {
    return this.fail();
  }

  async listReportVersions(
    _organizationId: string,
    _visitId: string
  ): Promise<readonly TechnicalVisitReport[]> {
    return this.fail();
  }

  async reviseReport(
    _input: ReviseTechnicalVisitReportGatewayInput
  ): Promise<TechnicalVisitReport> {
    return this.fail();
  }

  clearAllSessionData(): void {
    // Produção indisponível não mantém estado de sessão.
  }
}
