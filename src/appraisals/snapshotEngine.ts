/**
 * Motor Canônico de Fotografia (Snapshot), Hash Criptográfico e Emissão Oficial
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Imutabilidade e Integridade:
 * - O snapshot canônico congela todas as entidades envolvidas no instante exato da emissão.
 * - Calcula hash SHA-256 determinístico dos dados do laudo.
 * - Versões emitidas tornam-se somente leitura de forma permanente.
 */

import { Appraisal, AppraisalId, TechnicalProfessionalProfile } from '../types/appraisal';
import { AppraisalTechnicalDossier } from '../types/appraisalDossier';
import { AppraisalCalculationSection, AppraisalMarketSample, HomogenizedSampleResult, StatisticalAnalysisResult } from '../types/appraisalCalculation';
import { AppraisalNormativeSection } from '../types/appraisalNormative';
import {
  AppraisalCanonicalSnapshot,
  AppraisalIssuedVersion,
  CanonicalClientSnapshot,
  CanonicalPropertySnapshot,
  CanonicalTechnicalProfileSnapshot,
} from '../types/appraisalVersioning';
import { evaluateAppraisalReadiness } from './readinessEvaluator';
import { evaluateAppraisalAccess } from './appraisalAccessPolicy';
import { PermissionCode } from '../types/authorization';
import { OrganizationRole, PlatformRole } from '../types/auth';

import { computeCanonicalSha256 } from './cryptoHash';

/**
 * Função utilitária de hash determinístico com SHA-256 canônico real
 */
export function computeDeterministicChecksum(data: unknown): string {
  return computeCanonicalSha256(data);
}

export interface BuildSnapshotInput {
  readonly appraisal: Appraisal;
  readonly client: {
    readonly id: string;
    readonly name: string;
    readonly documentType: 'cpf' | 'cnpj';
    readonly documentNumber: string;
    readonly stateRegistration?: string;
    readonly city: string;
    readonly state: string;
  };
  readonly property: {
    readonly id: string;
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
  };
  readonly technicalProfile: TechnicalProfessionalProfile;
  readonly dossier: AppraisalTechnicalDossier;
  readonly calculations: AppraisalCalculationSection;
  readonly marketSamples: readonly AppraisalMarketSample[];
  readonly homogenizedResults: readonly HomogenizedSampleResult[];
  readonly statisticalAnalysis: StatisticalAnalysisResult;
  readonly normative: AppraisalNormativeSection;
  readonly versionNumber: number;
}

export function buildAppraisalCanonicalSnapshot(input: BuildSnapshotInput): AppraisalCanonicalSnapshot {
  const {
    appraisal,
    client,
    property,
    technicalProfile,
    dossier,
    calculations,
    marketSamples,
    homogenizedResults,
    statisticalAnalysis,
    normative,
    versionNumber,
  } = input;

  const clientSnapshot: CanonicalClientSnapshot = {
    clientId: client.id,
    name: client.name,
    documentType: client.documentType,
    documentNumber: client.documentNumber,
    stateRegistration: client.stateRegistration,
    city: client.city,
    state: client.state,
  };

  const propertySnapshot: CanonicalPropertySnapshot = {
    propertyId: property.id,
    propertyType: property.propertyType,
    name: property.name,
    city: property.city,
    state: property.state,
    totalArea: property.totalArea,
    carReceiptNumber: property.carReceiptNumber,
    registrations: property.registrations,
  };

  const technicalSnapshot: CanonicalTechnicalProfileSnapshot = {
    profileId: technicalProfile.id,
    userId: technicalProfile.userId,
    declaredTitle: technicalProfile.declaredTitle,
    council: technicalProfile.council,
    registrationNumber: technicalProfile.registrationNumber,
    registrationUf: technicalProfile.registrationUf,
    discipline: technicalProfile.discipline,
    responsibilityDocumentType: technicalProfile.responsibilityDocumentType,
    verifiedAt: technicalProfile.verifiedAt,
  };

  return {
    appraisalId: appraisal.id,
    organizationId: appraisal.organizationId,
    versionNumber,
    snapshotTimestamp: new Date().toISOString(),
    client: clientSnapshot,
    property: propertySnapshot,
    technicalProfessional: technicalSnapshot,
    dossier,
    calculations,
    marketSamples,
    homogenizedResults,
    statisticalAnalysis,
    normative,
  };
}

export interface IssueAppraisalInput extends BuildSnapshotInput {
  readonly actorUserId: string;
  readonly actorUserName: string;
  readonly actorRole: PlatformRole | OrganizationRole;
  readonly actorPermissions: readonly (PermissionCode | string)[];
  readonly activeOrganizationId: string;
  readonly previousIssuedVersions?: readonly AppraisalIssuedVersion[];
}

export interface IssueAppraisalResult {
  readonly success: boolean;
  readonly issuedVersion?: AppraisalIssuedVersion;
  readonly updatedAppraisal?: Appraisal;
  readonly updatedPreviousVersions?: readonly AppraisalIssuedVersion[];
  readonly failureReason?: string;
  readonly validationIssues?: readonly string[];
}

export function issueAppraisalVersion(input: IssueAppraisalInput): IssueAppraisalResult {
  const {
    appraisal,
    actorUserId,
    actorUserName,
    actorRole,
    actorPermissions,
    activeOrganizationId,
    technicalProfile,
    dossier,
    calculations,
    statisticalAnalysis,
    normative,
    previousIssuedVersions = [],
  } = input;

  // 1. Autorização
  const accessDecision = evaluateAppraisalAccess({
    operation: 'issue_appraisal',
    actorUserId,
    actorRole,
    actorPermissions,
    activeOrganizationId,
    targetOrganizationId: appraisal.organizationId,
    appraisalEntity: appraisal,
  });

  if (!accessDecision.granted) {
    return {
      success: false,
      failureReason: accessDecision.reason,
    };
  }

  // 2. Prontidão
  const readiness = evaluateAppraisalReadiness({
    appraisal,
    dossier,
    calculations,
    statistics: statisticalAnalysis,
    normative,
    technicalProfile,
  });

  if (!readiness.isReadyToIssue) {
    const issues = readiness.items
      .filter((i) => i.severity === 'impeditive' && !i.isResolved)
      .map((i) => `${i.title}: ${i.description}`);

    return {
      success: false,
      failureReason: 'O laudo técnico possui impedimentos obrigatórios de emissibilidade.',
      validationIssues: issues,
    };
  }

  // 3. Incremento de Versão
  const nextVersionNumber = previousIssuedVersions.length + 1;
  const snapshot = buildAppraisalCanonicalSnapshot({
    ...input,
    versionNumber: nextVersionNumber,
  });

  const checksumSha256 = computeDeterministicChecksum(snapshot);
  const issuedAt = new Date().toISOString();
  const versionId = `ver_${appraisal.id}_v${nextVersionNumber}`;

  const newIssuedVersion: AppraisalIssuedVersion = {
    id: versionId,
    appraisalId: appraisal.id,
    organizationId: appraisal.organizationId,
    versionNumber: nextVersionNumber,
    issuedAt,
    issuedByUserId: actorUserId,
    issuedByUserName: actorUserName,
    checksumSha256,
    isSuperseded: false,
    snapshot,
  };

  // Marca versões anteriores como superadas
  const updatedPreviousVersions = previousIssuedVersions.map((prev) => ({
    ...prev,
    isSuperseded: true,
    supersededAt: issuedAt,
    supersededByVersionNumber: nextVersionNumber,
  }));

  const updatedAppraisal: Appraisal = {
    ...appraisal,
    status: 'issued',
    currentVersionNumber: nextVersionNumber,
    updatedAt: issuedAt,
  };

  return {
    success: true,
    issuedVersion: newIssuedVersion,
    updatedAppraisal,
    updatedPreviousVersions: [...updatedPreviousVersions, newIssuedVersion],
  };
}

export const buildCanonicalSnapshot = buildAppraisalCanonicalSnapshot;
export const computeCanonicalChecksum = computeDeterministicChecksum;

