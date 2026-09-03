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
import type {
  TechnicalVisitIntegrationDomain,
  TechnicalVisitIntegrationEvent,
  TechnicalVisitIntegrationEventType,
  TechnicalVisitIntegrationLink,
  TechnicalVisitIntegrationLinkStatus,
  TechnicalVisitIntegrationSnapshot,
} from '../../types/technicalVisitIntegration';

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

function cloneIntegrationLink(
  link: TechnicalVisitIntegrationLink
): TechnicalVisitIntegrationLink {
  return { ...link, payload: { ...link.payload } };
}

function cloneIntegrationEvent(
  event: TechnicalVisitIntegrationEvent
): TechnicalVisitIntegrationEvent {
  return { ...event, payload: { ...event.payload } };
}

export class PreviewTechnicalVisitGateway implements TechnicalVisitGateway {
  private readonly visits = new Map<string, TechnicalVisit>();
  private readonly audits = new Map<string, TechnicalVisitAuditEntry[]>();
  private readonly reports = new Map<string, TechnicalVisitReport[]>();
  private readonly integrationLinks = new Map<string, TechnicalVisitIntegrationLink[]>();
  private readonly integrationEvents = new Map<string, TechnicalVisitIntegrationEvent[]>();

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
    this.syncIntegrations(write.visit, null);
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
    this.syncIntegrations(write.visit, current);
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
    this.syncIntegrations(completed, current);

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

  async getIntegrationSnapshot(
    organizationId: string,
    visitId: string
  ): Promise<TechnicalVisitIntegrationSnapshot> {
    const visit = this.visits.get(visitId);
    if (!visit || visit.organizationId !== organizationId) {
      throw new TechnicalVisitDomainError('VISIT_NOT_FOUND', 'Visita não encontrada.');
    }

    const links = (this.integrationLinks.get(visitId) ?? [])
      .slice()
      .sort((a, b) => a.targetDomain.localeCompare(b.targetDomain))
      .map(cloneIntegrationLink);

    const events = (this.integrationEvents.get(visitId) ?? [])
      .slice()
      .sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) ||
          b.id.localeCompare(a.id)
      )
      .map(cloneIntegrationEvent);

    return {
      visitId,
      links: Object.freeze(links),
      events: Object.freeze(events),
    };
  }

  clearAllSessionData(): void {
    this.visits.clear();
    this.audits.clear();
    this.reports.clear();
    this.integrationLinks.clear();
    this.integrationEvents.clear();
  }

  private upsertIntegrationLink(input: {
    readonly visit: TechnicalVisit;
    readonly domain: TechnicalVisitIntegrationDomain;
    readonly stableReference: string;
    readonly status: TechnicalVisitIntegrationLinkStatus;
    readonly payload: Readonly<Record<string, unknown>>;
  }): void {
    const current = this.integrationLinks.get(input.visit.id) ?? [];
    const previous = current.find((link) => link.targetDomain === input.domain);

    if (previous && previous.sourceVersion > input.visit.version) {
      return;
    }

    if (previous && previous.sourceVersion === input.visit.version) {
      const same =
        previous.stableReference === input.stableReference &&
        previous.status === input.status &&
        JSON.stringify(previous.payload) === JSON.stringify(input.payload);
      if (!same) {
        throw new TechnicalVisitDomainError(
          'CONCURRENCY_CONFLICT',
          'Projeção de integração já registrada com conteúdo divergente.'
        );
      }
      return;
    }

    const next: TechnicalVisitIntegrationLink = {
      id: previous?.id ?? `integration-link-${input.visit.id}-${input.domain}`,
      organizationId: input.visit.organizationId,
      visitId: input.visit.id,
      targetDomain: input.domain,
      stableReference: input.stableReference,
      status: input.status,
      sourceVersion: input.visit.version,
      payload: { ...input.payload },
      createdAt: previous?.createdAt ?? input.visit.updatedAt,
      updatedAt: input.visit.updatedAt,
    };
    const withoutDomain = current.filter(
      (link) => link.targetDomain !== input.domain
    );
    this.integrationLinks.set(input.visit.id, [
      ...withoutDomain,
      cloneIntegrationLink(next),
    ]);
  }

  private emitIntegrationEvent(input: {
    readonly visit: TechnicalVisit;
    readonly domain: TechnicalVisitIntegrationDomain;
    readonly type: TechnicalVisitIntegrationEventType;
    readonly payload: Readonly<Record<string, unknown>>;
  }): void {
    const eventKey =
      `${input.visit.id}:${input.visit.version}:${input.domain}:${input.type}`;
    const current = this.integrationEvents.get(input.visit.id) ?? [];
    const previous = current.find((event) => event.eventKey === eventKey);
    if (previous) {
      const same =
        previous.targetDomain === input.domain &&
        previous.eventType === input.type &&
        previous.sourceVersion === input.visit.version &&
        JSON.stringify(previous.payload) === JSON.stringify(input.payload);
      if (!same) {
        throw new TechnicalVisitDomainError(
          'CONCURRENCY_CONFLICT',
          'Evento de integração já registrado com conteúdo divergente.'
        );
      }
      return;
    }

    const event: TechnicalVisitIntegrationEvent = {
      id: `integration-event-${eventKey}`,
      organizationId: input.visit.organizationId,
      visitId: input.visit.id,
      eventKey,
      targetDomain: input.domain,
      eventType: input.type,
      sourceVersion: input.visit.version,
      occurredAt: input.visit.updatedAt,
      payload: { ...input.payload },
    };
    this.integrationEvents.set(input.visit.id, [
      ...current,
      cloneIntegrationEvent(event),
    ]);
  }

  private syncIntegrations(
    visit: TechnicalVisit,
    previous: TechnicalVisit | null
  ): void {
    const terminal = visit.status === 'completed' || visit.status === 'cancelled';
    const calendarStatus: TechnicalVisitIntegrationLinkStatus =
      terminal ? 'released' : 'active';
    const calendarPayload: Readonly<Record<string, unknown>> = {
      organizationId: visit.organizationId,
      visitId: visit.id,
      targetDomain: 'calendar',
      stableReference: visit.id,
      status: calendarStatus,
      sourceVersion: visit.version,
      scheduledFor: visit.scheduledFor,
      responsibleUserId: visit.responsibleUserId,
      participantUserIds: visit.preparation?.participantUserIds ?? [],
      durationMinutes: visit.preparation?.durationMinutes ?? null,
      timeZone: visit.preparation?.timeZone ?? null,
      address: visit.preparation?.address ?? null,
    };
    this.upsertIntegrationLink({
      visit,
      domain: 'calendar',
      stableReference: visit.id,
      status: calendarStatus,
      payload: calendarPayload,
    });

    const calendarChanged =
      !previous ||
      previous.scheduledFor !== visit.scheduledFor ||
      previous.responsibleUserId !== visit.responsibleUserId ||
      previous.status !== visit.status ||
      JSON.stringify(previous.preparation) !== JSON.stringify(visit.preparation);

    if (calendarChanged) {
      this.emitIntegrationEvent({
        visit,
        domain: 'calendar',
        type: terminal
          ? 'calendar.visit_release_requested'
          : 'calendar.visit_sync_requested',
        payload: calendarPayload,
      });
    }

    const oldProposalId = previous?.proposalId ?? null;
    const newProposalId = visit.proposalId;
    if (oldProposalId !== newProposalId) {
      if (oldProposalId) {
        const oldPayload: Readonly<Record<string, unknown>> = {
          organizationId: visit.organizationId,
          visitId: visit.id,
          targetDomain: 'proposal',
          stableReference: oldProposalId,
          status: 'released',
          sourceVersion: visit.version,
          clientId: visit.clientId,
          propertyId: visit.propertyId,
          visitStatus: visit.status,
        };
        this.emitIntegrationEvent({
          visit,
          domain: 'proposal',
          type: 'proposal.visit_unlinked',
          payload: oldPayload,
        });
      }

      if (newProposalId) {
        const proposalPayload: Readonly<Record<string, unknown>> = {
          organizationId: visit.organizationId,
          visitId: visit.id,
          targetDomain: 'proposal',
          stableReference: newProposalId,
          status: 'active',
          sourceVersion: visit.version,
          clientId: visit.clientId,
          propertyId: visit.propertyId,
          visitStatus: visit.status,
        };
        this.upsertIntegrationLink({
          visit,
          domain: 'proposal',
          stableReference: newProposalId,
          status: 'active',
          payload: proposalPayload,
        });
        this.emitIntegrationEvent({
          visit,
          domain: 'proposal',
          type: oldProposalId
            ? 'proposal.visit_relinked'
            : 'proposal.visit_linked',
          payload: proposalPayload,
        });
      } else if (oldProposalId) {
        const releasedPayload: Readonly<Record<string, unknown>> = {
          organizationId: visit.organizationId,
          visitId: visit.id,
          targetDomain: 'proposal',
          stableReference: oldProposalId,
          status: 'released',
          sourceVersion: visit.version,
          clientId: visit.clientId,
          propertyId: visit.propertyId,
          visitStatus: visit.status,
        };
        this.upsertIntegrationLink({
          visit,
          domain: 'proposal',
          stableReference: oldProposalId,
          status: 'released',
          payload: releasedPayload,
        });
      }
    } else if (newProposalId) {
      const proposalPayload: Readonly<Record<string, unknown>> = {
        organizationId: visit.organizationId,
        visitId: visit.id,
        targetDomain: 'proposal',
        stableReference: newProposalId,
        status: 'active',
        sourceVersion: visit.version,
        clientId: visit.clientId,
        propertyId: visit.propertyId,
        visitStatus: visit.status,
      };
      this.upsertIntegrationLink({
        visit,
        domain: 'proposal',
        stableReference: newProposalId,
        status: 'active',
        payload: proposalPayload,
      });
      if (previous?.status !== visit.status) {
        this.emitIntegrationEvent({
          visit,
          domain: 'proposal',
          type: 'proposal.visit_status_changed',
          payload: proposalPayload,
        });
      }
    }

    const fleetStatus: TechnicalVisitIntegrationLinkStatus =
      terminal ? 'released' : 'active';
    const fleetPayload: Readonly<Record<string, unknown>> = {
      organizationId: visit.organizationId,
      visitId: visit.id,
      targetDomain: 'fleet',
      stableReference: visit.id,
      status: fleetStatus,
      sourceVersion: visit.version,
      scheduledFor: visit.scheduledFor,
      responsibleUserId: visit.responsibleUserId,
      propertyId: visit.propertyId,
      durationMinutes: visit.preparation?.durationMinutes ?? null,
      address: visit.preparation?.address ?? null,
    };
    this.upsertIntegrationLink({
      visit,
      domain: 'fleet',
      stableReference: visit.id,
      status: fleetStatus,
      payload: fleetPayload,
    });

    const fleetChanged =
      !previous ||
      previous.scheduledFor !== visit.scheduledFor ||
      previous.responsibleUserId !== visit.responsibleUserId ||
      previous.propertyId !== visit.propertyId ||
      previous.status !== visit.status ||
      JSON.stringify(previous.preparation) !== JSON.stringify(visit.preparation);

    if (fleetChanged) {
      this.emitIntegrationEvent({
        visit,
        domain: 'fleet',
        type: terminal
          ? 'fleet.visit_release_requested'
          : 'fleet.visit_sync_requested',
        payload: fleetPayload,
      });
    }
  }

  private appendAudit(entry: TechnicalVisitAuditEntry): void {
    const current = this.audits.get(entry.visitId) ?? [];
    this.audits.set(entry.visitId, [...current, cloneAudit(entry)]);
  }
}
