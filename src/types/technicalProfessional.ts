/**
 * Tipos e Contratos do Perfil Profissional Técnico e Habilitação Pericial
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Em conformidade com:
 * - Resolução CONFEA nº 345/1990 (Engenharia e Agronomia)
 * - Lei nº 12.378/2010 (Arquitetura e Urbanismo / CAU)
 * - Regulamentações do CFT (Técnicos Industriais / TRT)
 * - Resolução CFTA nº 31/2021 (Técnicos Agrícolas / TRT)
 */

export type TechnicalProfessionalProfileId = string;

export type ProfessionalCouncil = 'CREA' | 'CAU' | 'CFT' | 'CFTA' | 'OTHER';

export type TechnicalResponsibilityDocumentType = 'ART' | 'RRT' | 'TRT';

export type ProfessionalDiscipline =
  | 'agronomy'
  | 'civil_engineering'
  | 'architecture'
  | 'forestry_engineering'
  | 'surveying_engineering'
  | 'agricultural_engineering'
  | 'agricultural_technician'
  | 'building_technician'
  | 'other';

export type TechnicalEligibilityStatus =
  | 'not_informed'
  | 'pending_review'
  | 'manually_verified'
  | 'ineligible'
  | 'suspended'
  | 'expired';

export type VerifiedTechnicalCapabilityType =
  | 'rural_property_appraisal'
  | 'urban_property_appraisal'
  | 'rural_georeferencing'
  | 'urban_technical_inspection'
  | 'technical_report_issue';

export type VerifiedTechnicalCapabilityStatus =
  | 'active'
  | 'revoked'
  | 'expired'
  | 'suspended';

export interface VerifiedTechnicalCapability {
  readonly id: string;
  readonly organizationId: string;
  readonly profileId: TechnicalProfessionalProfileId;
  readonly activityType: VerifiedTechnicalCapabilityType;
  readonly scope: 'rural' | 'urban' | 'both';
  readonly council: ProfessionalCouncil;
  readonly legalReference: string;
  readonly status: VerifiedTechnicalCapabilityStatus;
  readonly verifiedAt: string;
  readonly verifiedByUserId: string;
  readonly validUntil?: string;
  readonly notes?: string;
  readonly evidenceOrigin: 'manual_administrative' | 'council_certificate' | 'official_registry';
}

export interface TechnicalProfessionalProfile {
  readonly id: TechnicalProfessionalProfileId;
  readonly organizationId: string;
  readonly userId: string;
  readonly council: ProfessionalCouncil;
  readonly registrationNumber: string;
  readonly registrationUf: string;
  readonly declaredTitle: string;
  readonly registeredSpecialty?: string;
  readonly discipline: ProfessionalDiscipline;
  readonly responsibilityDocumentType?: TechnicalResponsibilityDocumentType;
  readonly status: TechnicalEligibilityStatus;
  readonly verificationSource?: 'manual_administrative' | 'document_declared';
  readonly verifiedAt?: string;
  readonly verifiedByUserId?: string;
  readonly impediments?: readonly string[];
  readonly capabilities?: readonly VerifiedTechnicalCapability[];
  readonly validUntil?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TechnicalIneligibilityReasonCode =
  | 'unauthenticated_user'
  | 'missing_organization'
  | 'inactive_membership'
  | 'missing_rbac_permission'
  | 'profile_not_informed'
  | 'profile_user_mismatch'
  | 'profile_organization_mismatch'
  | 'profile_pending_verification'
  | 'council_registration_suspended'
  | 'council_registration_expired'
  | 'profile_has_impediments'
  | 'missing_rural_capability'
  | 'missing_urban_capability'
  | 'missing_responsibility_document'
  | 'incompatible_appraisal_status'
  | 'issuance_globally_disabled_in_foundation_phase';

export interface TechnicalEligibilityEvaluation {
  readonly eligible: boolean;
  readonly allowed: boolean;
  readonly decision: 'allowed' | 'denied';
  readonly status: TechnicalEligibilityStatus;
  readonly reasons: readonly string[];
  readonly reasonCodes: readonly TechnicalIneligibilityReasonCode[];
  readonly missingRequirements: readonly string[];
  readonly requiredCapability?: VerifiedTechnicalCapabilityType;
  readonly profileEvaluated?: TechnicalProfessionalProfile | null;
  readonly evaluatedAt: string;
  readonly canIssue: boolean;
  readonly checkedAt: string;
}

export interface TechnicalProfessionalFilterParams {
  readonly organizationId: string;
  readonly status?: TechnicalEligibilityStatus;
  readonly discipline?: ProfessionalDiscipline;
  readonly council?: ProfessionalCouncil;
  readonly search?: string;
}
