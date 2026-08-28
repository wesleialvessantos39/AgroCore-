/**
 * Tipos para Normativas, Fundamentação, Precisão e Verificador de Prontidão
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { DossierSectionMetadata } from './appraisalDossier';

export type NormativeDegree = 'grau_I' | 'grau_II' | 'grau_III' | 'unconfigured';

export interface NormativeRuleSet {
  readonly id: string;
  readonly standardCode: string; // Ex: "NBR 14653-2" ou "NBR 14653-3"
  readonly edition: string; // Ex: "2019" ou "2004"
  readonly source: string;
  readonly verifiedAt: string;
  readonly verifiedByUserId: string;
  readonly checksum: string;
  readonly status: 'active' | 'deprecated' | 'unconfigured';
  readonly authorizedParameters: {
    readonly minimumSamplesGrauI: number;
    readonly minimumSamplesGrauII: number;
    readonly minimumSamplesGrauIII: number;
    readonly maxSignificanceFLevelGrauI: number;
    readonly maxSignificanceFLevelGrauII: number;
    readonly maxSignificanceFLevelGrauIII: number;
    readonly maxCoefficientOfVariationGrauI: number;
    readonly maxCoefficientOfVariationGrauII: number;
    readonly maxCoefficientOfVariationGrauIII: number;
  };
}

export interface AppraisalNormativeSection extends DossierSectionMetadata {
  readonly normativeRuleSetId?: string;
  readonly normativeReferenceName?: string;
  readonly degreeOfJustification: NormativeDegree;
  readonly degreeOfPrecision: NormativeDegree;
  readonly isUnconfiguredNotice: boolean;
  readonly unconfiguredExplanation?: string;
  readonly complianceChecklist: readonly {
    readonly requirementDescription: string;
    readonly isCompliant: boolean;
    readonly evidenceSummary: string;
  }[];
}

export type ReadinessSeverity = 'impeditive' | 'critical' | 'recommendation' | 'informative';

export interface AppraisalReadinessItem {
  readonly id: string;
  readonly sectionKey: string;
  readonly severity: ReadinessSeverity;
  readonly title: string;
  readonly description: string;
  readonly isResolved: boolean;
  readonly resolutionAction?: string;
}

export interface AppraisalReadinessReport {
  readonly isReadyToIssue: boolean;
  readonly impeditiveCount: number;
  readonly criticalCount: number;
  readonly recommendationCount: number;
  readonly informativeCount: number;
  readonly items: readonly AppraisalReadinessItem[];
  readonly generatedAt: string;
}
