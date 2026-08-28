/**
 * UnavailableAppraisalRequestGateway
 *
 * Implementação fechada e segura para ambiente sem persistência real de solicitações de laudo.
 */

import {
  AppraisalRequest,
  AppraisalRequestId,
  AppraisalRequestListFilters,
  AppraisalRequestListResult,
} from '../types/appraisal';
import {
  AddDocumentReferenceInput,
  AppraisalRequestGateway,
  CreateAppraisalRequestInput,
  UpdateAppraisalRequestStatusInput,
} from './requestGateway';

export class UnavailableAppraisalRequestGateway implements AppraisalRequestGateway {
  async listRequests(
    _filters: AppraisalRequestListFilters,
    _pagination: { page?: number; pageSize?: number },
    _signal?: AbortSignal
  ): Promise<AppraisalRequestListResult> {
    throw new Error('O serviço de solicitações de laudo não está disponível neste ambiente.');
  }

  async getRequestById(
    _organizationId: string,
    _requestId: AppraisalRequestId,
    _signal?: AbortSignal
  ): Promise<AppraisalRequest | null> {
    throw new Error('O serviço de solicitações de laudo não está disponível neste ambiente.');
  }

  async createRequest(
    _input: CreateAppraisalRequestInput,
    _signal?: AbortSignal
  ): Promise<AppraisalRequest> {
    throw new Error('O serviço de solicitações de laudo não está disponível neste ambiente.');
  }

  async updateRequestStatus(
    _input: UpdateAppraisalRequestStatusInput,
    _signal?: AbortSignal
  ): Promise<AppraisalRequest> {
    throw new Error('O serviço de solicitações de laudo não está disponível neste ambiente.');
  }

  async addDocumentReference(
    _input: AddDocumentReferenceInput,
    _signal?: AbortSignal
  ): Promise<AppraisalRequest> {
    throw new Error('O serviço de solicitações de laudo não está disponível neste ambiente.');
  }

  clearAllSessionData(): void {
    // Sem operação em ambiente indisponível
  }
}
