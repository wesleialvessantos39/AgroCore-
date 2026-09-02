import {
  TechnicalVisitDomainError,
  type TechnicalVisit,
  type TechnicalVisitAuditEntry,
  type TechnicalVisitGateway,
  type TechnicalVisitListFilters,
  type TechnicalVisitWrite,
} from '../types/technicalVisit';

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

  clearAllSessionData(): void {
    // Produção indisponível não mantém estado de sessão.
  }
}
