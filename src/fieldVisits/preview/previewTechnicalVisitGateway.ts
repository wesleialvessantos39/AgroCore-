import {
  TechnicalVisitDomainError,
  type TechnicalVisit,
  type TechnicalVisitAuditEntry,
  type TechnicalVisitGateway,
  type TechnicalVisitListFilters,
  type TechnicalVisitWrite,
} from '../../types/technicalVisit';

function cloneVisit(visit: TechnicalVisit): TechnicalVisit {
  return { ...visit };
}

function cloneAudit(entry: TechnicalVisitAuditEntry): TechnicalVisitAuditEntry {
  return { ...entry, changedFields: [...entry.changedFields] };
}

export class PreviewTechnicalVisitGateway implements TechnicalVisitGateway {
  private readonly visits = new Map<string, TechnicalVisit>();
  private readonly audits = new Map<string, TechnicalVisitAuditEntry[]>();

  async listVisits(
    organizationId: string,
    filters: TechnicalVisitListFilters = {},
    signal?: AbortSignal
  ): Promise<readonly TechnicalVisit[]> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');

    return Array.from(this.visits.values())
      .filter((visit) => visit.organizationId === organizationId)
      .filter((visit) => !filters.status || filters.status === 'all' || visit.status === filters.status)
      .filter((visit) => !filters.clientId || visit.clientId === filters.clientId)
      .filter((visit) => !filters.propertyId || visit.propertyId === filters.propertyId)
      .filter((visit) => !filters.responsibleUserId || visit.responsibleUserId === filters.responsibleUserId)
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || a.id.localeCompare(b.id))
      .map(cloneVisit);
  }

  async getVisitById(organizationId: string, visitId: string): Promise<TechnicalVisit | null> {
    const visit = this.visits.get(visitId);
    if (!visit || visit.organizationId !== organizationId) return null;
    return cloneVisit(visit);
  }

  async createVisit(write: TechnicalVisitWrite): Promise<TechnicalVisit> {
    if (this.visits.has(write.visit.id)) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'A visita já foi registrada por outra operação.'
      );
    }

    this.visits.set(write.visit.id, cloneVisit(write.visit));
    this.appendAudit(write.audit);
    return cloneVisit(write.visit);
  }

  async updateVisit(write: TechnicalVisitWrite): Promise<TechnicalVisit> {
    const current = this.visits.get(write.visit.id);
    if (!current || current.organizationId !== write.visit.organizationId) {
      throw new TechnicalVisitDomainError('VISIT_NOT_FOUND', 'Visita não encontrada.');
    }

    if (write.expectedVersion === null || current.version !== write.expectedVersion) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'A visita foi alterada por outra operação. Recarregue os dados antes de continuar.'
      );
    }

    this.visits.set(write.visit.id, cloneVisit(write.visit));
    this.appendAudit(write.audit);
    return cloneVisit(write.visit);
  }

  async listAudit(
    organizationId: string,
    visitId: string
  ): Promise<readonly TechnicalVisitAuditEntry[]> {
    const visit = this.visits.get(visitId);
    if (!visit || visit.organizationId !== organizationId) return [];
    return (this.audits.get(visitId) ?? []).map(cloneAudit);
  }

  clearAllSessionData(): void {
    this.visits.clear();
    this.audits.clear();
  }

  private appendAudit(entry: TechnicalVisitAuditEntry): void {
    const current = this.audits.get(entry.visitId) ?? [];
    this.audits.set(entry.visitId, [...current, cloneAudit(entry)]);
  }
}
