/**
 * Contrato de Gateway para Laudos de Avaliação e Solicitações de Laudo
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import {
  Appraisal,
  AppraisalCapturerProjection,
  AppraisalId,
  AppraisalListFilters,
  AppraisalListPagination,
  AppraisalListResult,
  AppraisalOrigin,
  AppraisalRequest,
  AppraisalRequestId,
  AppraisalRequestListFilters,
  AppraisalRequestListResult,
  AppraisalStatus,
  AppraisalSummary,
  AssignAppraisalRequestCommand,
  ConvertRequestToAppraisalCommand,
  CreateAppraisalRequestInput,
  StartDirectAppraisalCommand,
} from '../types/appraisal';
import { TechnicalProfessionalProfileId } from '../types/technicalProfessional';
import { AppraisalTechnicalDossier } from '../types/appraisalDossier';
import {
  AppraisalCalculationSection,
  AppraisalMarketSample,
  HomogenizedSampleResult,
  StatisticalAnalysisResult,
} from '../types/appraisalCalculation';
import { AppraisalNormativeSection } from '../types/appraisalNormative';
import { AppraisalIssuedVersion } from '../types/appraisalVersioning';

export interface CreateAppraisalInput {
  readonly organizationId: string;
  readonly clientId: string;
  readonly propertyId: string;
  readonly responsibleUserId: string;
  readonly technicalProfessionalProfileId?: TechnicalProfessionalProfileId;
  readonly appraisalRequestId?: AppraisalRequestId;
  readonly origin: AppraisalOrigin;
  readonly purpose: string;
  readonly title: string;
  readonly propertyType: 'rural' | 'urban';
  readonly observations?: string;
}

export interface UpdateAppraisalStatusInput {
  readonly organizationId: string;
  readonly appraisalId: AppraisalId;
  readonly newStatus: AppraisalStatus;
  readonly actorUserId: string;
  readonly cancellationReason?: string;
}

export interface CommitIssuedVersionInput {
  readonly organizationId: string;
  readonly appraisalId: AppraisalId;
  readonly actorUserId: string;
  readonly version: AppraisalIssuedVersion;
}

export interface CommitIssuedVersionResult {
  readonly issuedVersion: AppraisalIssuedVersion;
  readonly updatedAppraisal: Appraisal;
}

export interface AppraisalGateway {
  // Operações com Laudos
  listAppraisals(
    filters: AppraisalListFilters,
    pagination?: Partial<AppraisalListPagination>,
    signal?: AbortSignal
  ): Promise<AppraisalListResult>;

  getAppraisalById(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<Appraisal | null>;

  createAppraisal(
    input: CreateAppraisalInput,
    signal?: AbortSignal
  ): Promise<Appraisal>;

  startDirectAppraisal(
    organizationId: string,
    command: StartDirectAppraisalCommand,
    actorUserId: string,
    propertyType?: 'rural' | 'urban',
    technicalProfessionalProfileId?: TechnicalProfessionalProfileId,
    signal?: AbortSignal
  ): Promise<Appraisal>;

  updateAppraisalStatus(
    input: UpdateAppraisalStatusInput,
    signal?: AbortSignal
  ): Promise<Appraisal>;

  getAppraisalSummaryByPropertyId(
    organizationId: string,
    propertyId: string,
    signal?: AbortSignal
  ): Promise<readonly AppraisalSummary[]>;

  listAppraisalsByClient(
    organizationId: string,
    clientId: string,
    signal?: AbortSignal
  ): Promise<readonly AppraisalSummary[]>;

  getAppraisalCapturerProjection(
    organizationId: string,
    appraisalId: string,
    capturerUserId: string,
    signal?: AbortSignal
  ): Promise<AppraisalCapturerProjection | null>;

  // Dossiê Técnico & Seções (OE-004.003)
  getTechnicalDossier(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<AppraisalTechnicalDossier>;

  saveTechnicalDossier(
    organizationId: string,
    dossier: AppraisalTechnicalDossier,
    signal?: AbortSignal
  ): Promise<AppraisalTechnicalDossier>;

  // Amostras de Mercado & Homogeneização
  listMarketSamples(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<readonly AppraisalMarketSample[]>;

  saveMarketSample(
    organizationId: string,
    sample: AppraisalMarketSample,
    signal?: AbortSignal
  ): Promise<AppraisalMarketSample>;

  deleteMarketSample(
    organizationId: string,
    appraisalId: AppraisalId,
    sampleId: string,
    signal?: AbortSignal
  ): Promise<void>;

  // Métodos e Cálculos
  getCalculationSection(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<AppraisalCalculationSection>;

  saveCalculationSection(
    organizationId: string,
    appraisalId: AppraisalId,
    calculation: AppraisalCalculationSection,
    signal?: AbortSignal
  ): Promise<AppraisalCalculationSection>;

  // Enquadramento Normativo NBR 14653
  getNormativeSection(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<AppraisalNormativeSection>;

  saveNormativeSection(
    organizationId: string,
    appraisalId: AppraisalId,
    normative: AppraisalNormativeSection,
    signal?: AbortSignal
  ): Promise<AppraisalNormativeSection>;

  // Versões Emitidas & Histórico Canônico
  listIssuedVersions(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<readonly AppraisalIssuedVersion[]>;

  commitIssuedVersion(
    input: CommitIssuedVersionInput,
    signal?: AbortSignal
  ): Promise<CommitIssuedVersionResult>;

  // Operações com Solicitações de Laudo (Captador & Fila)
  createAppraisalRequest(
    organizationId: string,
    input: CreateAppraisalRequestInput,
    requestedByUserId: string,
    propertyType?: 'rural' | 'urban',
    title?: string,
    signal?: AbortSignal
  ): Promise<AppraisalRequest>;

  getAppraisalRequestById(
    organizationId: string,
    requestId: string,
    signal?: AbortSignal
  ): Promise<AppraisalRequest | null>;

  listAppraisalRequests(
    filters: AppraisalRequestListFilters,
    pagination?: Partial<AppraisalListPagination>,
    signal?: AbortSignal
  ): Promise<AppraisalRequestListResult>;

  listAppraisalRequestsByCapturer(
    organizationId: string,
    capturerUserId: string,
    signal?: AbortSignal
  ): Promise<readonly AppraisalRequest[]>;

  assignAppraisalRequest(
    organizationId: string,
    command: AssignAppraisalRequestCommand,
    assignedByUserId: string,
    signal?: AbortSignal
  ): Promise<AppraisalRequest>;

  convertRequestToAppraisal(
    organizationId: string,
    command: ConvertRequestToAppraisalCommand,
    responsibleUserId: string,
    propertyType?: 'rural' | 'urban',
    signal?: AbortSignal
  ): Promise<Appraisal>;

  clearAllSessionData?(): void;
}
