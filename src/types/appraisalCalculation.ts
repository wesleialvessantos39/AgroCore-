/**
 * Tipos e Estruturas para Cálculos, Estatística, Amostragem e Métodos Avaliatórios
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { AppraisalId } from './appraisal';
import { DossierSectionMetadata } from './appraisalDossier';

export type MarketSampleNature = 'offer' | 'transaction';
export type MarketSampleStatus = 'included' | 'excluded';

export interface AppraisalMarketSample {
  readonly id: string;
  readonly appraisalId: AppraisalId;
  readonly organizationId: string;
  readonly sampleCode: string;
  readonly source: string;
  readonly collectionDate: string;
  readonly nature: MarketSampleNature;
  readonly locationDescription: string;
  readonly city: string;
  readonly state: string;
  readonly totalArea: number;
  readonly areaUnit: 'ha' | 'm2';
  readonly totalPrice: number;
  readonly rawUnitPrice: number;
  readonly currency: 'BRL';
  readonly coordinates?: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly attributes: {
    readonly accessScore?: number; // 1 a 5
    readonly topographyScore?: number; // 1 a 5
    readonly soilScore?: number; // 1 a 5
    readonly waterScore?: number; // 1 a 5
    readonly constructionStandardScore?: number; // 1 a 5
    readonly conservationScore?: number; // 1 a 5
    readonly customAttributeName?: string;
    readonly customAttributeValue?: number;
  };
  readonly status: MarketSampleStatus;
  readonly exclusionJustification?: string;
  readonly notes?: string;
  readonly collectedByUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type HomogenizationFactorType =
  | 'offer'
  | 'time'
  | 'location'
  | 'access'
  | 'area'
  | 'topography'
  | 'soil'
  | 'water'
  | 'construction_standard'
  | 'conservation'
  | 'custom';

export interface HomogenizationFactorDefinition {
  readonly id: string;
  readonly factorType: HomogenizationFactorType;
  readonly name: string;
  readonly formulaDescription: string;
  readonly source: string;
  readonly version: string;
  readonly justification: string;
  readonly defaultMultiplier: number;
}

export interface HomogenizedSampleResult {
  readonly sampleId: string;
  readonly sampleCode: string;
  readonly rawUnitPrice: number;
  readonly factorMultipliers: Record<string, number>;
  readonly totalFactorMultiplier: number;
  readonly homogenizedUnitPrice: number;
  readonly status: MarketSampleStatus;
  readonly exclusionJustification?: string;
}

export interface StatisticalAnalysisResult {
  readonly totalSamples: number;
  readonly validSamplesCount: number;
  readonly excludedSamplesCount: number;
  readonly mean: number;
  readonly median: number;
  readonly weightedMean?: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly amplitude: number;
  readonly variance: number;
  readonly standardDeviation: number;
  readonly coefficientOfVariationPercentage: number;
  readonly lowerQuartile: number;
  readonly upperQuartile: number;
  readonly interquartileRange: number;
  readonly confidenceInterval80: { readonly lower: number; readonly upper: number };
  readonly confidenceInterval90: { readonly lower: number; readonly upper: number };
  readonly confidenceInterval95: { readonly lower: number; readonly upper: number };
  readonly outliersDetected: readonly {
    readonly sampleId: string;
    readonly sampleCode: string;
    readonly value: number;
    readonly zScore: number;
    readonly isOutlier: boolean;
    readonly professionalJustification?: string;
  }[];
  readonly regressionDiagnostics?: {
    readonly isModelValid: boolean;
    readonly r2: number;
    readonly adjustedR2: number;
    readonly fStatistic: number;
    readonly significanceF: number;
    readonly tStatistics: Record<string, number>;
    readonly residuals: readonly number[];
    readonly warnings: readonly string[];
  };
}

export type ValuationMethod =
  | 'direct_comparative'
  | 'cost_quantification'
  | 'evolutionary'
  | 'income_capitalization'
  | 'involutive';

export interface AppraisalCalculationRun {
  readonly id: string;
  readonly appraisalId: AppraisalId;
  readonly organizationId: string;
  readonly method: ValuationMethod;
  readonly algorithmVersion: string;
  readonly inputParameters: Readonly<Record<string, unknown>>;
  readonly decimalPrecisionSettings: {
    readonly currencyDecimals: number;
    readonly areaDecimals: number;
    readonly factorDecimals: number;
    readonly roundingMode: 'half_even' | 'half_up';
  };
  readonly resultCalculatedValue: number;
  readonly resultUnitValue: number;
  readonly resultRange: { readonly min: number; readonly max: number };
  readonly checksumSha256: string;
  readonly executedByUserId: string;
  readonly executedAt: string;
  readonly warnings: readonly string[];
  readonly limitations: readonly string[];
}

export interface AppraisalCalculationSection extends DossierSectionMetadata {
  readonly primaryMethod: ValuationMethod;
  readonly auxiliaryMethods: readonly ValuationMethod[];
  readonly calculationRuns: readonly AppraisalCalculationRun[];
  readonly breakdown: {
    readonly landValue: number; // Terra Nua / Terreno
    readonly improvementsValue: number; // Benfeitorias
    readonly specialComponentsValue: number; // Culturas / Instalações especiais
    readonly totalCalculatedValue: number;
    readonly roundingAppliedAmount: number;
    readonly finalAdoptedValue: number;
    readonly recommendedRangeMin: number;
    readonly recommendedRangeMax: number;
  };
  readonly technicalJustification: string;
}
