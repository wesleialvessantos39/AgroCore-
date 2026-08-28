/**
 * Contrato de Gateway para Solicitações de Laudo
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import {
  AppraisalDocumentReference,
  AppraisalRequest,
  AppraisalRequestId,
  AppraisalRequestListFilters,
  AppraisalRequestListResult,
  AppraisalRequestStatus,
} from '../types/appraisal';

export interface CreateAppraisalRequestInput {
  readonly organizationId: string;
  readonly clientId: string;
  readonly propertyId: string;
  readonly requestedByUserId: string;
  readonly capturerRelationship?: string;
  readonly purpose: string;
  readonly notes?: string;
  readonly documentReferences?: readonly AppraisalDocumentReference[];
}

export interface UpdateAppraisalRequestStatusInput {
  readonly organizationId: string;
  readonly requestId: AppraisalRequestId;
  readonly newStatus: AppraisalRequestStatus;
  readonly actorUserId: string;
  readonly assignedToUserId?: string;
  readonly resultingAppraisalId?: string;
  readonly declineReason?: string;
  readonly cancelReason?: string;
}

export interface AddDocumentReferenceInput {
  readonly organizationId: string;
  readonly requestId: AppraisalRequestId;
  readonly document: AppraisalDocumentReference;
}

export interface AppraisalRequestGateway {
  listRequests(
    filters: AppraisalRequestListFilters,
    pagination: { page?: number; pageSize?: number },
    signal?: AbortSignal
  ): Promise<AppraisalRequestListResult>;

  getRequestById(
    organizationId: string,
    requestId: AppraisalRequestId,
    signal?: AbortSignal
  ): Promise<AppraisalRequest | null>;

  createRequest(
    input: CreateAppraisalRequestInput,
    signal?: AbortSignal
  ): Promise<AppraisalRequest>;

  updateRequestStatus(
    input: UpdateAppraisalRequestStatusInput,
    signal?: AbortSignal
  ): Promise<AppraisalRequest>;

  addDocumentReference(
    input: AddDocumentReferenceInput,
    signal?: AbortSignal
  ): Promise<AppraisalRequest>;

  clearAllSessionData?(): void;
}
