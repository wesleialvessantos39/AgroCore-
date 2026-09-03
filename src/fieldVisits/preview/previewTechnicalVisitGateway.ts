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
} from '../../types/technicalVisit';
import type { TechnicalVisitReport } from '../../types/technicalVisitReport';

function cloneVisit(visit: TechnicalVisit): TechnicalVisit {
  return {
    ...visit,
    preparation: visit.preparation
      ? {
          ...visit.preparation,
          address: { ...visit.preparation.address },
          participantUserIds: [...visit.preparation.participantUserIds],
          checklist: visit.preparation.checklist.map((item) => ({ ...item })),
          conflictOverride: visit.preparation.conflictOverride
            ? {
                ...visit.preparation.conflictOverride,
                conflictVisitIds: [...visit.preparation.conflictOverride.conflictVisitIds],
              }
            : null,
        }
      : null,
  };
}

function cloneAudit(entry: TechnicalVisitAuditEntry): TechnicalVisitAuditEntry {
  return { ...entry, changedFields: [...entry.changedFields] };
}

function cloneReport(report: TechnicalVisitReport): TechnicalVisitReport {
  return {
    ...report,
    pendingItems: report.pendingItems.map((item) => ({ ...item })),
    snapshot: {
      ...report.snapshot,
      visit: { ...report.snapshot.visit },
      fieldForm: report.snapshot.fieldForm
        ? {
            ...report.snapshot.fieldForm,
            payload: { ...report.snapshot.fieldForm.payload },
          }
        : null,
      fieldEvidence: report.snapshot.fieldEvidence
        ? { ...report.snapshot.fieldEvidence }
        : null,
    },
  };
}

export class PreviewTechnicalVisitGateway implements TechnicalVisitGateway {
  private readonly visits = new Map<string, TechnicalVisit>();
  private readonly audits = new Map<string, TechnicalVisitAuditEntry[]>();
  private readonly reports = new Map<string, TechnicalVisitReport[]>();

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

  async completeVisit(
    input: CompleteTechnicalVisitGatewayInput
  ): Promise<TechnicalVisitCompletionResult> {
    const current = this.visits.get(input.visitId);
    if (!current || current.organizationId !== input.organizationId) {
      throw new TechnicalVisitDomainError('VISIT_NOT_FOUND', 'Visita não encontrada.');
    }
    if (current.version !== input.expectedVersion) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'A visita foi alterada por outra operação.'
      );
    }
    if (current.status !== 'in_progress') {
      throw new TechnicalVisitDomainError(
        'INVALID_TRANSITION',
        'Somente uma visita em execução pode ser concluída.'
      );
    }
    if (this.reports.has(input.visitId)) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'A visita já possui relatório final.'
      );
    }

    const completed: TechnicalVisit = {
      ...current,
      status: 'completed',
      completedAt: input.completedAt,
      updatedByUserId: input.actorUserId,
      updatedAt: input.completedAt,
      version: current.version + 1,
    };
    this.visits.set(input.visitId, cloneVisit(completed));

    const audit: TechnicalVisitAuditEntry = {
      id: globalThis.crypto?.randomUUID?.() ?? `audit-${input.visitId}-${completed.version}`,
      organizationId: input.organizationId,
      visitId: input.visitId,
      action: 'status_changed',
      actorUserId: input.actorUserId,
      at: input.completedAt,
      version: completed.version,
      fromStatus: 'in_progress',
      toStatus: 'completed',
      reason: 'Conclusão com relatório final',
      changedFields: ['status', 'completedAt'],
    };
    this.appendAudit(audit);

    const report: TechnicalVisitReport = {
      id: globalThis.crypto?.randomUUID?.() ?? `report-${input.visitId}-1`,
      organizationId: input.organizationId,
      visitId: input.visitId,
      version: 1,
      summary: input.summary,
      pendingItems: input.pendingItems.map((item) => ({ ...item })),
      snapshot: {
        visit: { ...completed } as unknown as Readonly<Record<string, unknown>>,
        fieldForm: null,
        fieldEvidence: null,
      },
      issuedByUserId: input.actorUserId,
      issuedAt: input.completedAt,
      revisionReason: null,
    };
    this.reports.set(input.visitId, [cloneReport(report)]);
    return { visit: cloneVisit(completed), report: cloneReport(report) };
  }

  async getLatestReport(
    organizationId: string,
    visitId: string
  ): Promise<TechnicalVisitReport | null> {
    const visit = this.visits.get(visitId);
    if (!visit || visit.organizationId !== organizationId) return null;
    const versions = this.reports.get(visitId) ?? [];
    return versions.length ? cloneReport(versions[versions.length - 1]) : null;
  }

  async listReportVersions(
    organizationId: string,
    visitId: string
  ): Promise<readonly TechnicalVisitReport[]> {
    const visit = this.visits.get(visitId);
    if (!visit || visit.organizationId !== organizationId) return [];
    return (this.reports.get(visitId) ?? [])
      .slice()
      .sort((a, b) => b.version - a.version)
      .map(cloneReport);
  }

  async reviseReport(
    input: ReviseTechnicalVisitReportGatewayInput
  ): Promise<TechnicalVisitReport> {
    const visit = this.visits.get(input.visitId);
    if (!visit || visit.organizationId !== input.organizationId) {
      throw new TechnicalVisitDomainError('VISIT_NOT_FOUND', 'Visita não encontrada.');
    }
    if (visit.status !== 'completed') {
      throw new TechnicalVisitDomainError(
        'REPORT_LOCKED',
        'O relatório só pode ser revisado após a conclusão.'
      );
    }
    const versions = this.reports.get(input.visitId) ?? [];
    const current = versions[versions.length - 1];
    if (!current) {
      throw new TechnicalVisitDomainError('REPORT_NOT_FOUND', 'Relatório final não encontrado.');
    }
    if (current.version !== input.expectedReportVersion) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'O relatório foi atualizado por outra operação.'
      );
    }
    const next: TechnicalVisitReport = {
      ...current,
      id: globalThis.crypto?.randomUUID?.() ?? `report-${input.visitId}-${current.version + 1}`,
      version: current.version + 1,
      summary: input.summary,
      pendingItems: input.pendingItems.map((item) => ({ ...item })),
      issuedByUserId: input.actorUserId,
      issuedAt: input.issuedAt,
      revisionReason: input.reason,
    };
    this.reports.set(input.visitId, [...versions, cloneReport(next)]);
    return cloneReport(next);
  }

  clearAllSessionData(): void {
    this.visits.clear();
    this.audits.clear();
    this.reports.clear();
  }

  private appendAudit(entry: TechnicalVisitAuditEntry): void {
    const current = this.audits.get(entry.visitId) ?? [];
    this.audits.set(entry.visitId, [...current, cloneAudit(entry)]);
  }
}
