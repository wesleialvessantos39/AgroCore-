export type TechnicalVisitIntegrationDomain =
  | 'calendar'
  | 'proposal'
  | 'fleet';

export type TechnicalVisitIntegrationLinkStatus =
  | 'active'
  | 'released';

export type TechnicalVisitIntegrationEventType =
  | 'calendar.visit_sync_requested'
  | 'calendar.visit_release_requested'
  | 'proposal.visit_linked'
  | 'proposal.visit_relinked'
  | 'proposal.visit_unlinked'
  | 'proposal.visit_status_changed'
  | 'fleet.visit_sync_requested'
  | 'fleet.visit_release_requested';

export interface TechnicalVisitIntegrationLink {
  readonly id: string;
  readonly organizationId: string;
  readonly visitId: string;
  readonly targetDomain: TechnicalVisitIntegrationDomain;
  readonly stableReference: string;
  readonly status: TechnicalVisitIntegrationLinkStatus;
  readonly sourceVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TechnicalVisitIntegrationEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly visitId: string;
  readonly eventKey: string;
  readonly targetDomain: TechnicalVisitIntegrationDomain;
  readonly eventType: TechnicalVisitIntegrationEventType;
  readonly sourceVersion: number;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TechnicalVisitIntegrationSnapshot {
  readonly visitId: string;
  readonly links: readonly TechnicalVisitIntegrationLink[];
  readonly events: readonly TechnicalVisitIntegrationEvent[];
}
