/**
 * PreviewAppraisalRequestGateway
 *
 * Implementação em memória para o ambiente de desenvolvimento / preview.
 * Isolado por organizationId, suporte a AbortSignal, validação estrita pela máquina de estados.
 */

import {
  AppraisalDocumentReference,
  AppraisalRequest,
  AppraisalRequestId,
  AppraisalRequestListFilters,
  AppraisalRequestListResult,
} from '../../types/appraisal';
import {
  AddDocumentReferenceInput,
  AppraisalRequestGateway,
  CreateAppraisalRequestInput,
  UpdateAppraisalRequestStatusInput,
} from '../requestGateway';
import { transitionAppraisalRequest } from '../appraisalRequestStateMachine';
import {
  getSharedRequestsByOrg,
  setSharedRequestsForOrg,
  clearAllSharedRequests,
} from './previewSharedRequestStore';

export class PreviewAppraisalRequestGateway implements AppraisalRequestGateway {
  /**
   * Limpa integralmente a memória volátil (utilizado no logout ou reinício de sessão).
   * Implementa o contrato canônico clearAllSessionData().
   */
  clearAllSessionData(): void {
    clearAllSharedRequests();
  }

  /**
   * Alias de compatibilidade para clearAllSessionData.
   */
  clearTemporaryData(): void {
    this.clearAllSessionData();
  }

  async listRequests(
    filters: AppraisalRequestListFilters,
    pagination: { page?: number; pageSize?: number } = {},
    signal?: AbortSignal
  ): Promise<AppraisalRequestListResult> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const orgItems = getSharedRequestsByOrg(filters.organizationId);

    let filtered = orgItems.filter((item) => {
      if (filters.status && filters.status !== 'all' && item.status !== filters.status) {
        return false;
      }
      if (filters.requestedByUserId && item.requestedByUserId !== filters.requestedByUserId) {
        return false;
      }
      if (filters.assignedToUserId && item.assignedToUserId !== filters.assignedToUserId) {
        return false;
      }
      if (filters.clientId && item.clientId !== filters.clientId) {
        return false;
      }
      if (filters.propertyId && item.propertyId !== filters.propertyId) {
        return false;
      }
      if (filters.search && filters.search.trim()) {
        const query = filters.search.toLowerCase().trim();
        const matchesPurpose = item.purpose.toLowerCase().includes(query);
        const matchesNotes = item.notes?.toLowerCase().includes(query) || false;
        if (!matchesPurpose && !matchesNotes) return false;
      }
      return true;
    });

    const safePagination = pagination || {};
    const page = safePagination.page && safePagination.page > 0 ? safePagination.page : 1;
    const pageSize = safePagination.pageSize && safePagination.pageSize > 0 ? safePagination.pageSize : 10;
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;

    const start = (page - 1) * pageSize;
    const paginatedItems = filtered.slice(start, start + pageSize);

    return {
      items: paginatedItems.map((r) => ({ ...r })),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  }

  async getRequestById(
    organizationId: string,
    requestId: AppraisalRequestId,
    signal?: AbortSignal
  ): Promise<AppraisalRequest | null> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const orgItems = getSharedRequestsByOrg(organizationId);
    const item = orgItems.find((r) => r.id === requestId);
    return item ? { ...item } : null;
  }

  async createRequest(
    input: CreateAppraisalRequestInput,
    signal?: AbortSignal
  ): Promise<AppraisalRequest> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const now = new Date().toISOString();
    const newId: AppraisalRequestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newRequest: AppraisalRequest = {
      id: newId,
      organizationId: input.organizationId,
      clientId: input.clientId,
      propertyId: input.propertyId,
      requestedByUserId: input.requestedByUserId,
      capturerRelationship: input.capturerRelationship,
      purpose: input.purpose,
      status: 'submitted',
      notes: input.notes,
      documentReferences: input.documentReferences ? [...input.documentReferences] : [],
      createdAt: now,
      updatedAt: now,
    };

    const currentList = getSharedRequestsByOrg(input.organizationId);
    setSharedRequestsForOrg(input.organizationId, [newRequest, ...currentList]);

    return { ...newRequest };
  }

  async updateRequestStatus(
    input: UpdateAppraisalRequestStatusInput,
    signal?: AbortSignal
  ): Promise<AppraisalRequest> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const current = await this.getRequestById(input.organizationId, input.requestId, signal);
    if (!current) {
      throw new Error('Solicitação de laudo não encontrada para a organização informada.');
    }

    const transition = transitionAppraisalRequest(current.status, input.newStatus, {
      actorUserId: input.actorUserId,
      assignedToUserId: input.assignedToUserId,
      resultingAppraisalId: input.resultingAppraisalId,
      declineReason: input.declineReason,
      cancelReason: input.cancelReason,
    });

    if (!transition.success) {
      throw new Error(transition.error || 'Transição de status inválida para a solicitação.');
    }

    const now = new Date().toISOString();
    const updated: AppraisalRequest = {
      ...current,
      status: input.newStatus,
      assignedToUserId: input.assignedToUserId !== undefined ? input.assignedToUserId : current.assignedToUserId,
      assignedAt: input.newStatus === 'assigned' ? now : current.assignedAt,
      resultingAppraisalId: input.resultingAppraisalId || current.resultingAppraisalId,
      declineReason: input.declineReason || current.declineReason,
      cancelReason: input.cancelReason || current.cancelReason,
      completedAt: input.newStatus === 'completed' ? now : current.completedAt,
      updatedAt: now,
    };

    const orgItems = getSharedRequestsByOrg(input.organizationId);
    const index = orgItems.findIndex((r) => r.id === input.requestId);
    if (index >= 0) {
      orgItems[index] = updated;
      setSharedRequestsForOrg(input.organizationId, [...orgItems]);
    }

    return { ...updated };
  }

  async addDocumentReference(
    input: AddDocumentReferenceInput,
    signal?: AbortSignal
  ): Promise<AppraisalRequest> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const current = await this.getRequestById(input.organizationId, input.requestId, signal);
    if (!current) {
      throw new Error('Solicitação de laudo não encontrada.');
    }

    const now = new Date().toISOString();
    const updatedDocs = [...current.documentReferences, input.document];

    const updated: AppraisalRequest = {
      ...current,
      documentReferences: updatedDocs,
      updatedAt: now,
    };

    const orgItems = getSharedRequestsByOrg(input.organizationId);
    const index = orgItems.findIndex((r) => r.id === input.requestId);
    if (index >= 0) {
      orgItems[index] = updated;
      setSharedRequestsForOrg(input.organizationId, [...orgItems]);
    }

    return { ...updated };
  }
}
