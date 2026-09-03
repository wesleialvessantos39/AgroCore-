export type TechnicalVisitPendingCategory =
  | 'documentation'
  | 'property_registry'
  | 'evidence'
  | 'technical'
  | 'other';

export interface TechnicalVisitPendingItem {
  readonly id: string;
  readonly category: TechnicalVisitPendingCategory;
  readonly description: string;
}

export interface TechnicalVisitReportFieldFormSnapshot {
  readonly id: string;
  readonly version: number;
  readonly submittedAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TechnicalVisitReportEvidenceSnapshot {
  readonly evidenceId: string;
  readonly version: number;
  readonly propertyId: string;
  readonly location: unknown;
  readonly photoCount: number;
  readonly linkedToVisit?: boolean;
}

export interface TechnicalVisitReportSnapshot {
  readonly visit: Readonly<Record<string, unknown>>;
  readonly fieldForm: TechnicalVisitReportFieldFormSnapshot | null;
  readonly fieldEvidence: TechnicalVisitReportEvidenceSnapshot | null;
}

export interface TechnicalVisitReport {
  readonly id: string;
  readonly organizationId: string;
  readonly visitId: string;
  readonly version: number;
  readonly summary: string;
  readonly pendingItems: readonly TechnicalVisitPendingItem[];
  readonly snapshot: TechnicalVisitReportSnapshot;
  readonly issuedByUserId: string;
  readonly issuedAt: string;
  readonly revisionReason: string | null;
}

export interface CompleteTechnicalVisitInput {
  readonly expectedVersion: number;
  readonly summary: string;
  readonly pendingItems: readonly TechnicalVisitPendingItem[];
}

export interface ReviseTechnicalVisitReportInput {
  readonly expectedReportVersion: number;
  readonly summary: string;
  readonly pendingItems: readonly TechnicalVisitPendingItem[];
  readonly reason: string;
}
