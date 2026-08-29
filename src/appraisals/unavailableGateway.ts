/**
 * UnavailableAppraisalGateway
 *
 * Implementação segura para produção sem persistência real de laudos configurada.
 */

import {
  Appraisal,
  AppraisalCapturerProjection,
  AppraisalId,
  AppraisalListFilters,
  AppraisalListPagination,
  AppraisalListResult,
  AppraisalRequest,
  AppraisalRequestListFilters,
  AppraisalRequestListResult,
  AppraisalSummary,
  AssignAppraisalRequestCommand,
  ConvertRequestToAppraisalCommand,
  CreateAppraisalRequestInput,
  StartDirectAppraisalCommand,
} from '../types/appraisal';
import { AppraisalTechnicalDossier } from '../types/appraisalDossier';
import {
  AppraisalMarketSample,
  AppraisalCalculationSection,
} from '../types/appraisalCalculation';
import { AppraisalNormativeSection } from '../types/appraisalNormative';
import { AppraisalIssuedVersion } from '../types/appraisalVersioning';
import {
  AppraisalGateway,
  CommitIssuedVersionInput,
  CommitIssuedVersionResult,
  CreateAppraisalInput,
  UpdateAppraisalStatusInput,
} from './gateway';

export class UnavailableAppraisalGateway implements AppraisalGateway {
  async listAppraisals(
    _filters: AppraisalListFilters,
    _pagination?: Partial<AppraisalListPagination>,
    _signal?: AbortSignal
  ): Promise<AppraisalListResult> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async getAppraisalById(
    _organizationId: string,
    _appraisalId: AppraisalId,
    _signal?: AbortSignal
  ): Promise<Appraisal | null> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async createAppraisal(
    _input: CreateAppraisalInput,
    _signal?: AbortSignal
  ): Promise<Appraisal> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async startDirectAppraisal(
    _organizationId: string,
    _command: StartDirectAppraisalCommand,
    _actorUserId: string,
    _propertyType?: 'rural' | 'urban',
    _technicalProfessionalProfileId?: string,
    _signal?: AbortSignal
  ): Promise<Appraisal> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async updateAppraisalStatus(
    _input: UpdateAppraisalStatusInput,
    _signal?: AbortSignal
  ): Promise<Appraisal> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async getAppraisalSummaryByPropertyId(
    _organizationId: string,
    _propertyId: string,
    _signal?: AbortSignal
  ): Promise<readonly AppraisalSummary[]> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async listAppraisalsByClient(
    _organizationId: string,
    _clientId: string,
    _signal?: AbortSignal
  ): Promise<readonly AppraisalSummary[]> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async getAppraisalCapturerProjection(
    _organizationId: string,
    _appraisalId: string,
    _capturerUserId: string,
    _signal?: AbortSignal
  ): Promise<AppraisalCapturerProjection | null> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async getTechnicalDossier(
    _organizationId: string,
    _appraisalId: AppraisalId,
    _signal?: AbortSignal
  ): Promise<AppraisalTechnicalDossier> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async saveTechnicalDossier(
    _organizationId: string,
    _dossier: AppraisalTechnicalDossier,
    _signal?: AbortSignal
  ): Promise<AppraisalTechnicalDossier> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async listMarketSamples(
    _organizationId: string,
    _appraisalId: AppraisalId,
    _signal?: AbortSignal
  ): Promise<readonly AppraisalMarketSample[]> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async saveMarketSample(
    _organizationId: string,
    _sample: AppraisalMarketSample,
    _signal?: AbortSignal
  ): Promise<AppraisalMarketSample> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async deleteMarketSample(
    _organizationId: string,
    _appraisalId: AppraisalId,
    _sampleId: string,
    _signal?: AbortSignal
  ): Promise<void> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async getCalculationSection(
    _organizationId: string,
    _appraisalId: AppraisalId,
    _signal?: AbortSignal
  ): Promise<AppraisalCalculationSection> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async saveCalculationSection(
    _organizationId: string,
    _appraisalId: AppraisalId,
    _calculation: AppraisalCalculationSection,
    _signal?: AbortSignal
  ): Promise<AppraisalCalculationSection> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async getNormativeSection(
    _organizationId: string,
    _appraisalId: AppraisalId,
    _signal?: AbortSignal
  ): Promise<AppraisalNormativeSection> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async saveNormativeSection(
    _organizationId: string,
    _appraisalId: AppraisalId,
    _normative: AppraisalNormativeSection,
    _signal?: AbortSignal
  ): Promise<AppraisalNormativeSection> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async listIssuedVersions(
    _organizationId: string,
    _appraisalId: AppraisalId,
    _signal?: AbortSignal
  ): Promise<readonly AppraisalIssuedVersion[]> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async commitIssuedVersion(
    _input: CommitIssuedVersionInput,
    _signal?: AbortSignal
  ): Promise<CommitIssuedVersionResult> {
    throw new Error('O serviço de laudos de avaliação não está disponível neste ambiente.');
  }

  async createAppraisalRequest(
    _organizationId: string,
    _input: CreateAppraisalRequestInput,
    _requestedByUserId: string,
    _propertyType?: 'rural' | 'urban',
    _title?: string,
    _signal?: AbortSignal
  ): Promise<AppraisalRequest> {
    throw new Error('O serviço de solicitações de laudo não está disponível neste ambiente.');
  }

  async getAppraisalRequestById(
    _organizationId: string,
    _requestId: string,
    _signal?: AbortSignal
  ): Promise<AppraisalRequest | null> {
    throw new Error('O serviço de solicitações de laudo não está disponível neste ambiente.');
  }

  async listAppraisalRequests(
    _filters: AppraisalRequestListFilters,
    _pagination?: Partial<AppraisalListPagination>,
    _signal?: AbortSignal
  ): Promise<AppraisalRequestListResult> {
    throw new Error('O serviço de solicitações de laudo não está disponível neste ambiente.');
  }

  async listAppraisalRequestsByCapturer(
    _organizationId: string,
    _capturerUserId: string,
    _signal?: AbortSignal
  ): Promise<readonly AppraisalRequest[]> {
    throw new Error('O serviço de solicitações de laudo não está disponível neste ambiente.');
  }

  async assignAppraisalRequest(
    _organizationId: string,
    _command: AssignAppraisalRequestCommand,
    _assignedByUserId: string,
    _signal?: AbortSignal
  ): Promise<AppraisalRequest> {
    throw new Error('O serviço de atribuição de solicitações não está disponível neste ambiente.');
  }

  async convertRequestToAppraisal(
    _organizationId: string,
    _command: ConvertRequestToAppraisalCommand,
    _responsibleUserId: string,
    _propertyType?: 'rural' | 'urban',
    _signal?: AbortSignal
  ): Promise<Appraisal> {
    throw new Error('O serviço de conversão de solicitações não está disponível neste ambiente.');
  }

  clearAllSessionData(): void {
    // Sem operação em ambiente indisponível
  }
}
