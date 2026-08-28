/**
 * Tipos e Estruturas do Dossiê Técnico de Laudos de Avaliação
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { AppraisalId, AppraisalDocumentReference } from './appraisal';

export type DossierSectionKey =
  | 'identification'
  | 'characterization'
  | 'improvements'
  | 'market_research'
  | 'homogenization'
  | 'statistics'
  | 'methods_and_calculations'
  | 'normative_and_degree'
  | 'conclusion'
  | 'review'
  | 'annexes';

export type DossierSectionStatus =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'not_applicable';

export interface DossierSectionMetadata {
  readonly status: DossierSectionStatus;
  readonly updatedAt: string;
  readonly updatedByUserId: string;
  readonly validationIssues: readonly string[];
  readonly notApplicableJustification?: string;
}

export type ValueType =
  | 'market_value'
  | 'liquidation_value'
  | 'rental_value'
  | 'replacement_value'
  | 'insurable_value';

export interface TechnicalRegistrationMetadata {
  readonly councilType: 'CREA' | 'CAU' | 'CFT' | 'CFTA';
  readonly registrationNumber: string;
  readonly artRrtTrtNumber: string;
  readonly issuingState: string;
  readonly issueDate: string;
  readonly isVerified: boolean;
  readonly notes?: string;
}

export interface AppraisalIdentificationSection extends DossierSectionMetadata {
  readonly purpose: string;
  readonly objective: string;
  readonly valueType: ValueType;
  readonly referenceDate: string;
  readonly requesterName: string;
  readonly interestedPartyName: string;
  readonly assumptions: readonly string[];
  readonly limitingConditions: readonly string[];
  readonly caveats: readonly string[];
  readonly technicalRegistration?: TechnicalRegistrationMetadata;
  readonly consultedDocumentsSummary?: string;
}

export type TechnicalProvenance =
  | 'canonical_registration'
  | 'referenced_document'
  | 'reported_survey'
  | 'client_declaration'
  | 'manual_research'
  | 'calculation_measurement'
  | 'professional_judgment';

export interface ProvenanceField<T> {
  readonly value: T;
  readonly provenance: TechnicalProvenance;
  readonly referenceNote?: string;
}

export interface RuralCharacterizationSection extends DossierSectionMetadata {
  readonly propertyType: 'rural';
  readonly accessDescription: ProvenanceField<string>;
  readonly mainLogisticalDistances: readonly {
    readonly destination: string;
    readonly distanceKm: number;
    readonly roadType: 'paved' | 'unpaved' | 'mixed';
  }[];
  readonly totalAreaHa: number;
  readonly legalReserveAreaHa?: number;
  readonly appAreaHa?: number;
  readonly consolidatedAreaHa?: number;
  readonly topographyRelief: ProvenanceField<'flat' | 'gently_undulating' | 'undulating' | 'strongly_undulating' | 'mountainous' | 'mixed'>;
  readonly soilTypesDescription: ProvenanceField<string>;
  readonly landUseCapabilityClasses: readonly ('I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII')[];
  readonly currentLandUseAndCover: ProvenanceField<string>;
  readonly waterResourcesDescription: ProvenanceField<string>;
  readonly powerAvailability: ProvenanceField<'grid_monophasic' | 'grid_triphasic' | 'generator' | 'solar' | 'none'>;
  readonly internalInfrastructureSummary: ProvenanceField<string>;
  readonly environmentalAspectsDeclared: ProvenanceField<string>;
  readonly economicExploitation: ProvenanceField<string>;
  readonly reportedProductivitySummary?: ProvenanceField<string>;
}

export interface UrbanCharacterizationSection extends DossierSectionMetadata {
  readonly propertyType: 'urban';
  readonly zoningClassification: ProvenanceField<string>;
  readonly masterPlanCompliance: ProvenanceField<string>;
  readonly urbanInfrastructure: readonly ('water_network' | 'sewage_network' | 'storm_drainage' | 'paved_street' | 'public_lighting' | 'fiber_optic' | 'natural_gas')[];
  readonly accessibilityAndTransit: ProvenanceField<string>;
  readonly terrainTopography: ProvenanceField<'flat' | 'declivity' | 'acclivity' | 'irregular'>;
  readonly terrainShape: ProvenanceField<'regular_rectangular' | 'irregular' | 'corner' | 'encased'>;
  readonly frontageMeters: number;
  readonly totalTerrainAreaM2: number;
  readonly builtPrivateAreaM2?: number;
  readonly buildingStandard?: ProvenanceField<'low' | 'normal' | 'high' | 'luxury'>;
  readonly apparentAgeYears?: number;
  readonly conservationState?: ProvenanceField<'new' | 'regular' | 'reparable' | 'bad' | 'scrap'>;
  readonly condominiumSpecifications?: string;
  readonly neighborhoodVocation: ProvenanceField<string>;
}

export type AppraisalCharacterizationSection =
  | RuralCharacterizationSection
  | UrbanCharacterizationSection;

export interface AppraisalImprovementItem {
  readonly id: string;
  readonly category:
    | 'construction'
    | 'installation'
    | 'fencing'
    | 'corral'
    | 'shed'
    | 'residence'
    | 'irrigation_system'
    | 'internal_road'
    | 'hydraulic_network'
    | 'electric_network'
    | 'permanent_crop'
    | 'urban_building'
    | 'other';
  readonly description: string;
  readonly unit: 'm2' | 'ha' | 'm' | 'un' | 'km' | 'conj';
  readonly quantity: number;
  readonly apparentAgeYears: number;
  readonly estimatedLifespanYears: number;
  readonly conservationState: 'new' | 'regular' | 'reparable' | 'bad' | 'scrap';
  readonly standard: 'low' | 'normal' | 'high' | 'luxury';
  readonly costSource: string;
  readonly unitCostNew: number;
  readonly totalCostNew: number;
  readonly depreciationPercentage: number;
  readonly depreciatedUnitValue: number;
  readonly depreciatedTotalValue: number;
  readonly technicalJustification: string;
  readonly photoReferences?: readonly string[];
}

export interface AppraisalImprovementsSection extends DossierSectionMetadata {
  readonly items: readonly AppraisalImprovementItem[];
  readonly totalImprovementsCostNew: number;
  readonly totalImprovementsDepreciatedValue: number;
}

export interface AppraisalConclusionSection extends DossierSectionMetadata {
  readonly objectDescription: string;
  readonly finalValuationAmount: number;
  readonly finalValuationCurrency: 'BRL';
  readonly valuationDate: string;
  readonly unitValueSummary: string;
  readonly valueRangeMin: number;
  readonly valueRangeMax: number;
  readonly assumptionsAndCaveatsSummary: string;
  readonly professionalStatement: string;
  readonly confirmedByUserId?: string;
  readonly confirmedAt?: string;
}

export interface AppraisalTechnicalDossier {
  readonly appraisalId: AppraisalId;
  readonly organizationId: string;
  readonly identification: AppraisalIdentificationSection;
  readonly characterization: AppraisalCharacterizationSection;
  readonly improvements: AppraisalImprovementsSection;
  readonly conclusion: AppraisalConclusionSection;
  readonly documentReferences: readonly AppraisalDocumentReference[];
  readonly updatedAt: string;
  readonly updatedByUserId: string;
}
