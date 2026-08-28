/**
 * Tipos para Versionamento, Fotografia Histórica, Revisão Técnica e Imutabilidade
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { AppraisalId, AppraisalVersionId } from './appraisal';
import { AppraisalTechnicalDossier } from './appraisalDossier';
import { AppraisalCalculationSection, AppraisalMarketSample, HomogenizedSampleResult, StatisticalAnalysisResult } from './appraisalCalculation';
import { AppraisalNormativeSection } from './appraisalNormative';

export interface CanonicalClientSnapshot {
  readonly clientId: string;
  readonly name: string;
  readonly documentType: 'cpf' | 'cnpj';
  readonly documentNumber: string;
  readonly stateRegistration?: string;
  readonly city: string;
  readonly state: string;
}

export interface CanonicalPropertySnapshot {
  readonly propertyId: string;
  readonly propertyType: 'rural' | 'urban';
  readonly name: string;
  readonly city: string;
  readonly state: string;
  readonly totalArea: string;
  readonly carReceiptNumber?: string;
  readonly registrations: readonly {
    readonly id: string;
    readonly registrationNumber: string;
    readonly registryOffice: string;
    readonly state: string;
  }[];
}

export interface CanonicalTechnicalProfileSnapshot {
  readonly profileId: string;
  readonly userId: string;
  readonly declaredTitle: string;
  readonly council: string;
  readonly registrationNumber: string;
  readonly registrationUf: string;
  readonly discipline: string;
  readonly responsibilityDocumentType?: string;
  readonly verifiedAt?: string;
}

export interface AppraisalCanonicalSnapshot {
  readonly appraisalId: AppraisalId;
  readonly organizationId: string;
  readonly versionNumber: number;
  readonly snapshotTimestamp: string;
  readonly client: CanonicalClientSnapshot;
  readonly property: CanonicalPropertySnapshot;
  readonly technicalProfessional: CanonicalTechnicalProfileSnapshot;
  readonly dossier: AppraisalTechnicalDossier;
  readonly calculations: AppraisalCalculationSection;
  readonly marketSamples: readonly AppraisalMarketSample[];
  readonly homogenizedResults: readonly HomogenizedSampleResult[];
  readonly statisticalAnalysis: StatisticalAnalysisResult;
  readonly normative: AppraisalNormativeSection;
}

export interface AppraisalReviewComment {
  readonly id: string;
  readonly authorUserId: string;
  readonly authorName: string;
  readonly authorRole: string;
  readonly sectionKey: string;
  readonly text: string;
  readonly createdAt: string;
  readonly isResolved: boolean;
  readonly resolvedAt?: string;
  readonly resolvedByUserId?: string;
}

export type AppraisalReviewStatus =
  | 'not_requested'
  | 'requested'
  | 'in_review'
  | 'returned_with_comments'
  | 'approved';

export interface AppraisalReviewState {
  readonly status: AppraisalReviewStatus;
  readonly assignedReviewerUserId?: string;
  readonly assignedReviewerName?: string;
  readonly requestedAt?: string;
  readonly completedAt?: string;
  readonly comments: readonly AppraisalReviewComment[];
}

export interface AppraisalIssuedVersion {
  readonly id: AppraisalVersionId;
  readonly appraisalId: AppraisalId;
  readonly organizationId: string;
  readonly versionNumber: number;
  readonly issuedAt: string;
  readonly issuedByUserId: string;
  readonly issuedByUserName: string;
  readonly checksumSha256: string;
  readonly isSuperseded: boolean;
  readonly supersededAt?: string;
  readonly supersededByVersionNumber?: number;
  readonly snapshot: AppraisalCanonicalSnapshot;
}
