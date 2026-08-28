/**
 * Contrato de Gateway para Perfis Profissionais Técnicos
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import {
  ProfessionalCouncil,
  ProfessionalDiscipline,
  TechnicalEligibilityStatus,
  TechnicalProfessionalFilterParams,
  TechnicalProfessionalProfile,
  TechnicalProfessionalProfileId,
  TechnicalResponsibilityDocumentType,
  VerifiedTechnicalCapability,
} from '../types/technicalProfessional';

export interface CreateTechnicalProfileInput {
  readonly organizationId: string;
  readonly userId: string;
  readonly council: ProfessionalCouncil;
  readonly registrationNumber: string;
  readonly registrationUf: string;
  readonly declaredTitle: string;
  readonly registeredSpecialty?: string;
  readonly discipline: ProfessionalDiscipline;
  readonly responsibilityDocumentType?: TechnicalResponsibilityDocumentType;
  readonly validUntil?: string;
  readonly capabilities?: readonly VerifiedTechnicalCapability[];
}

export interface UpdateTechnicalProfileInput {
  readonly organizationId: string;
  readonly profileId: TechnicalProfessionalProfileId;
  readonly council?: ProfessionalCouncil;
  readonly registrationNumber?: string;
  readonly registrationUf?: string;
  readonly declaredTitle?: string;
  readonly registeredSpecialty?: string;
  readonly discipline?: ProfessionalDiscipline;
  readonly responsibilityDocumentType?: TechnicalResponsibilityDocumentType;
  readonly validUntil?: string;
  readonly capabilities?: readonly VerifiedTechnicalCapability[];
}

export interface VerifyTechnicalProfileInput {
  readonly organizationId: string;
  readonly profileId: TechnicalProfessionalProfileId;
  readonly verifiedByUserId: string;
  readonly status: TechnicalEligibilityStatus;
  readonly verificationSource: 'manual_administrative' | 'document_declared';
  readonly impediments?: readonly string[];
  readonly capabilities?: readonly VerifiedTechnicalCapability[];
}

export interface TechnicalProfessionalGateway {
  getProfileByUserId(
    organizationId: string,
    userId: string,
    signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile | null>;

  getProfileById(
    organizationId: string,
    profileId: TechnicalProfessionalProfileId,
    signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile | null>;

  listProfiles(
    params: TechnicalProfessionalFilterParams,
    signal?: AbortSignal
  ): Promise<readonly TechnicalProfessionalProfile[]>;

  createProfile(
    input: CreateTechnicalProfileInput,
    signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile>;

  updateProfile(
    input: UpdateTechnicalProfileInput,
    signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile>;

  verifyProfile(
    input: VerifyTechnicalProfileInput,
    signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile>;

  clearAllSessionData?(): void;
}
