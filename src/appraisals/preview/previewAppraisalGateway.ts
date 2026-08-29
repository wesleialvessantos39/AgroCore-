/**
 * PreviewAppraisalGateway
 *
 * Implementação em memória para o ambiente de desenvolvimento / preview.
 * Garante isolamento estrito multitenant por organizationId, suporte a AbortSignal,
 * suporte a idempotência, ciclo de vida completo de solicitações, atribuição operacional,
 * conversão atômica, início direto e projeção segura para o captador.
 */

import {
  Appraisal,
  AppraisalCapturerProjection,
  AppraisalDocumentReference,
  AppraisalId,
  AppraisalListFilters,
  AppraisalListPagination,
  AppraisalListResult,
  AppraisalRequest,
  AppraisalRequestId,
  AppraisalRequestListFilters,
  AppraisalRequestListResult,
  AppraisalSummary,
  AssignAppraisalRequestCommand,
  ConvertRequestToAppraisalCommand,
  CreateAppraisalRequestInput,
  StartDirectAppraisalCommand,
} from '../../types/appraisal';
import { AppraisalTechnicalDossier } from '../../types/appraisalDossier';
import {
  AppraisalCalculationSection,
  AppraisalMarketSample,
  HomogenizedSampleResult,
  StatisticalAnalysisResult,
} from '../../types/appraisalCalculation';
import { AppraisalNormativeSection } from '../../types/appraisalNormative';
import { AppraisalIssuedVersion } from '../../types/appraisalVersioning';
import {
  AppraisalGateway,
  CommitIssuedVersionInput,
  CommitIssuedVersionResult,
  CreateAppraisalInput,
  UpdateAppraisalStatusInput,
} from '../gateway';
import { transitionAppraisal } from '../appraisalStateMachine';
import { createAppraisalDomainEvent } from '../domainEvents';
import { getAppraisalNotificationsGateway } from '../notificationsGatewayFactory';
import { getClientCapturerAssignmentGateway } from '../../clients/capturerAssignmentGatewayFactory';
import {
  getSharedRequestsByOrg,
  setSharedRequestsForOrg,
  clearAllSharedRequests,
} from './previewSharedRequestStore';

export class PreviewAppraisalGateway implements AppraisalGateway {
  // Mapas isolados por organizationId
  private readonly appraisalsStore = new Map<string, Appraisal[]>();
  private readonly idempotencyStore = new Map<string, unknown>();
  private readonly dossiersStore = new Map<string, Map<string, AppraisalTechnicalDossier>>();
  private readonly samplesStore = new Map<string, Map<string, AppraisalMarketSample[]>>();
  private readonly calculationsStore = new Map<string, Map<string, AppraisalCalculationSection>>();
  private readonly normativesStore = new Map<string, Map<string, AppraisalNormativeSection>>();
  private readonly issuedVersionsStore = new Map<string, Map<string, AppraisalIssuedVersion[]>>();

  private generateId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /* -------------------------------------------------------------------------- */
  /*                            OPERAÇÕES COM LAUDOS                            */
  /* -------------------------------------------------------------------------- */

  async listAppraisals(
    filters: AppraisalListFilters,
    pagination: Partial<AppraisalListPagination> = {},
    signal?: AbortSignal
  ): Promise<AppraisalListResult> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const orgItems = this.appraisalsStore.get(filters.organizationId) || [];

    const filtered = orgItems.filter((item) => {
      if (filters.status && filters.status !== 'all' && item.status !== filters.status) {
        return false;
      }
      if (filters.origin && filters.origin !== 'all' && item.origin !== filters.origin) {
        return false;
      }
      if (
        filters.propertyType &&
        filters.propertyType !== 'all' &&
        item.propertyType !== filters.propertyType
      ) {
        return false;
      }
      if (filters.clientId && item.clientId !== filters.clientId) {
        return false;
      }
      if (filters.propertyId && item.propertyId !== filters.propertyId) {
        return false;
      }
      if (filters.responsibleUserId && item.responsibleUserId !== filters.responsibleUserId) {
        return false;
      }
      if (filters.search && filters.search.trim()) {
        const query = filters.search.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesPurpose = item.purpose.toLowerCase().includes(query);
        if (!matchesTitle && !matchesPurpose) return false;
      }
      return true;
    });

    const safePagination = pagination || {};
    const page = safePagination.page && safePagination.page > 0 ? safePagination.page : 1;
    const pageSize =
      safePagination.pageSize && safePagination.pageSize > 0 ? safePagination.pageSize : 10;
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;

    const start = (page - 1) * pageSize;
    const paginatedItems = filtered.slice(start, start + pageSize);

    const summaries: AppraisalSummary[] = paginatedItems.map((item) => ({
      id: item.id,
      organizationId: item.organizationId,
      clientId: item.clientId,
      propertyId: item.propertyId,
      responsibleUserId: item.responsibleUserId,
      technicalProfessionalProfileId: item.technicalProfessionalProfileId,
      appraisalRequestId: item.appraisalRequestId,
      origin: item.origin,
      status: item.status,
      purpose: item.purpose,
      title: item.title,
      propertyType: item.propertyType,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      issuedAt: item.issuedAt,
      activeVersionNumber: item.currentVersionNumber,
    }));

    return {
      items: summaries,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  }

  async getAppraisalById(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<Appraisal | null> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const orgItems = this.appraisalsStore.get(organizationId) || [];
    const item = orgItems.find((app) => app.id === appraisalId);
    return item ? Object.freeze({ ...item }) : null;
  }

  async createAppraisal(
    input: CreateAppraisalInput,
    signal?: AbortSignal
  ): Promise<Appraisal> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const now = new Date().toISOString();
    const newId: AppraisalId = this.generateId('app');

    const newAppraisal: Appraisal = Object.freeze({
      id: newId,
      organizationId: input.organizationId,
      clientId: input.clientId,
      propertyId: input.propertyId,
      responsibleUserId: input.responsibleUserId,
      technicalProfessionalProfileId: input.technicalProfessionalProfileId,
      appraisalRequestId: input.appraisalRequestId,
      origin: input.origin,
      status: 'draft',
      purpose: input.purpose,
      title: input.title,
      propertyType: input.propertyType,
      currentVersionNumber: 1,
      observations: input.observations,
      createdAt: now,
      updatedAt: now,
    });

    const currentList = this.appraisalsStore.get(input.organizationId) || [];
    this.appraisalsStore.set(input.organizationId, [newAppraisal, ...currentList]);

    createAppraisalDomainEvent({
      organizationId: input.organizationId,
      eventType:
        input.origin === 'capturer_request'
          ? 'appraisal_created_from_request'
          : 'appraisal_created_by_technical_initiative',
      entityType: 'appraisal',
      entityId: newAppraisal.id,
      relatedEntityId: input.propertyId,
      actorUserId: input.responsibleUserId,
      payload: {
        origin: newAppraisal.origin,
        propertyType: newAppraisal.propertyType,
        purpose: newAppraisal.purpose,
        clientId: newAppraisal.clientId,
      },
    });

    return newAppraisal;
  }

  async startDirectAppraisal(
    organizationId: string,
    command: StartDirectAppraisalCommand,
    actorUserId: string,
    propertyType: 'rural' | 'urban' = 'rural',
    technicalProfessionalProfileId?: string,
    signal?: AbortSignal
  ): Promise<Appraisal> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    if (!organizationId || organizationId.trim() === '') {
      throw new Error('Organização é obrigatória para início de laudo direto.');
    }
    if (!command.clientId || !command.propertyId || !actorUserId) {
      throw new Error('Cliente, imóvel e responsável técnico são obrigatórios.');
    }
    if (!command.purpose || command.purpose.trim() === '') {
      throw new Error('Finalidade da avaliação é obrigatória.');
    }

    // Idempotência
    if (command.idempotencyKey) {
      const cacheKey = `${organizationId}:direct:${command.idempotencyKey}`;
      const cached = this.idempotencyStore.get(cacheKey) as Appraisal | undefined;
      if (cached) return Object.freeze({ ...cached });
    }

    const now = new Date().toISOString();
    const newId: AppraisalId = this.generateId('app');

    const newAppraisal: Appraisal = Object.freeze({
      id: newId,
      organizationId,
      clientId: command.clientId,
      propertyId: command.propertyId,
      responsibleUserId: actorUserId,
      technicalProfessionalProfileId,
      origin: 'technical_initiative',
      status: 'draft',
      purpose: command.purpose,
      title: command.title || `Laudo Direto — ${command.purpose}`,
      propertyType,
      currentVersionNumber: 1,
      observations: command.notes,
      createdAt: now,
      updatedAt: now,
    });

    const currentList = this.appraisalsStore.get(organizationId) || [];
    this.appraisalsStore.set(organizationId, [newAppraisal, ...currentList]);

    if (command.idempotencyKey) {
      this.idempotencyStore.set(`${organizationId}:direct:${command.idempotencyKey}`, newAppraisal);
    }

    createAppraisalDomainEvent({
      organizationId,
      eventType: 'appraisal_created_by_technical_initiative',
      entityType: 'appraisal',
      entityId: newAppraisal.id,
      relatedEntityId: command.propertyId,
      actorUserId,
      payload: {
        origin: 'technical_initiative',
        propertyType: newAppraisal.propertyType,
        purpose: newAppraisal.purpose,
        clientId: newAppraisal.clientId,
      },
    });

    // Se o cliente possuir captador ativo, notifica o captador
    try {
      const capturerGateway = getClientCapturerAssignmentGateway();
      const activeAssignment = await capturerGateway.getActiveAssignment(
        organizationId,
        command.clientId
      );
      if (activeAssignment) {
        const notifGateway = getAppraisalNotificationsGateway();
        await notifGateway.dispatchNotification(organizationId, {
          recipientUserId: activeAssignment.capturerUserId,
          type: 'direct_appraisal_started',
          clientId: command.clientId,
          propertyId: command.propertyId,
          appraisalId: newAppraisal.id,
          title: 'Novo Laudo Direto Iniciado',
          message: `O responsável técnico iniciou um laudo direto para o seu cliente vinculado.`,
          correlationId: `corr_${newAppraisal.id}`,
        });
      }
    } catch {
      // Notificação opcional em preview
    }

    return newAppraisal;
  }

  async updateAppraisalStatus(
    input: UpdateAppraisalStatusInput,
    signal?: AbortSignal
  ): Promise<Appraisal> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const current = await this.getAppraisalById(input.organizationId, input.appraisalId, signal);
    if (!current) {
      throw new Error('Laudo de avaliação não encontrado para a organização informada.');
    }

    const transition = transitionAppraisal(current.status, input.newStatus, {
      actorUserId: input.actorUserId,
      cancellationReason: input.cancellationReason,
      canIssueDirectly: false,
    });

    if (!transition.success) {
      throw new Error(transition.error || 'Transição de status inválida para o laudo.');
    }

    const now = new Date().toISOString();
    const updated: Appraisal = Object.freeze({
      ...current,
      status: input.newStatus,
      cancellationReason: input.cancellationReason || current.cancellationReason,
      updatedAt: now,
      issuedAt: input.newStatus === 'issued' ? now : current.issuedAt,
    });

    const orgItems = this.appraisalsStore.get(input.organizationId) || [];
    const index = orgItems.findIndex((app) => app.id === input.appraisalId);
    if (index >= 0) {
      orgItems[index] = updated;
      this.appraisalsStore.set(input.organizationId, [...orgItems]);
    }

    createAppraisalDomainEvent({
      organizationId: input.organizationId,
      eventType:
        input.newStatus === 'issued'
          ? 'appraisal_issued'
          : input.newStatus === 'cancelled'
          ? 'appraisal_cancelled'
          : input.newStatus === 'ready_to_issue'
          ? 'appraisal_ready_to_issue'
          : 'appraisal_status_changed',
      entityType: 'appraisal',
      entityId: updated.id,
      actorUserId: input.actorUserId,
      payload: {
        fromStatus: current.status,
        toStatus: input.newStatus,
        cancellationReason: input.cancellationReason,
      },
    });

    return updated;
  }

  async getAppraisalSummaryByPropertyId(
    organizationId: string,
    propertyId: string,
    signal?: AbortSignal
  ): Promise<readonly AppraisalSummary[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const orgItems = this.appraisalsStore.get(organizationId) || [];
    const matching = orgItems.filter((app) => app.propertyId === propertyId);

    return Object.freeze(
      matching.map((item) => ({
        id: item.id,
        organizationId: item.organizationId,
        clientId: item.clientId,
        propertyId: item.propertyId,
        responsibleUserId: item.responsibleUserId,
        technicalProfessionalProfileId: item.technicalProfessionalProfileId,
        appraisalRequestId: item.appraisalRequestId,
        origin: item.origin,
        status: item.status,
        purpose: item.purpose,
        title: item.title,
        propertyType: item.propertyType,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        issuedAt: item.issuedAt,
        activeVersionNumber: item.currentVersionNumber,
      }))
    );
  }

  async listAppraisalsByClient(
    organizationId: string,
    clientId: string,
    signal?: AbortSignal
  ): Promise<readonly AppraisalSummary[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const orgItems = this.appraisalsStore.get(organizationId) || [];
    const matching = orgItems.filter((app) => app.clientId === clientId);

    return Object.freeze(
      matching.map((item) => ({
        id: item.id,
        organizationId: item.organizationId,
        clientId: item.clientId,
        propertyId: item.propertyId,
        responsibleUserId: item.responsibleUserId,
        technicalProfessionalProfileId: item.technicalProfessionalProfileId,
        appraisalRequestId: item.appraisalRequestId,
        origin: item.origin,
        status: item.status,
        purpose: item.purpose,
        title: item.title,
        propertyType: item.propertyType,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        issuedAt: item.issuedAt,
        activeVersionNumber: item.currentVersionNumber,
      }))
    );
  }

  async getAppraisalCapturerProjection(
    organizationId: string,
    appraisalId: string,
    capturerUserId: string,
    signal?: AbortSignal
  ): Promise<AppraisalCapturerProjection | null> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const appraisal = await this.getAppraisalById(organizationId, appraisalId, signal);
    if (!appraisal) return null;

    // Verifica vínculo do captador (por solicitação ou por vínculo ativo de cliente)
    let isAuthorizedCapturer = false;

    if (appraisal.appraisalRequestId) {
      const req = await this.getAppraisalRequestById(
        organizationId,
        appraisal.appraisalRequestId,
        signal
      );
      if (req && req.requestedByUserId === capturerUserId) {
        isAuthorizedCapturer = true;
      }
    }

    if (!isAuthorizedCapturer) {
      try {
        const capturerGateway = getClientCapturerAssignmentGateway();
        const activeAssignment = await capturerGateway.getActiveAssignment(
          organizationId,
          appraisal.clientId
        );
        if (activeAssignment && activeAssignment.capturerUserId === capturerUserId) {
          isAuthorizedCapturer = true;
        }
      } catch {
        // Continua
      }
    }

    if (!isAuthorizedCapturer) {
      return null;
    }

    // Retorna projeção sanitizada para o captador (sem cálculos, sem PTAM, sem estatísticas)
    const inProgressStatuses = ['draft', 'data_collection', 'visit_to_schedule', 'visit_scheduled', 'fieldwork', 'analysis', 'awaiting_information', 'review', 'ready_to_issue'];
    const projection: AppraisalCapturerProjection = Object.freeze({
      appraisalId: appraisal.id,
      protocol: appraisal.id.toUpperCase(),
      clientId: appraisal.clientId,
      propertyId: appraisal.propertyId,
      businessStage: appraisal.status === 'issued' ? 'Concluído' : appraisal.status === 'cancelled' ? 'Cancelado' : 'Em Elaboração Técnica',
      responsibleName: appraisal.responsibleUserId,
      operationalDates: {
        createdAt: appraisal.createdAt,
        updatedAt: appraisal.updatedAt,
        startedAt: appraisal.createdAt,
      },
      status: appraisal.status,
      isInProgress: inProgressStatuses.includes(appraisal.status),
    });

    return projection;
  }

  /* -------------------------------------------------------------------------- */
  /*                      OPERAÇÕES COM SOLICITAÇÕES DE LAUDO                   */
  /* -------------------------------------------------------------------------- */

  async createAppraisalRequest(
    organizationId: string,
    input: CreateAppraisalRequestInput,
    requestedByUserId: string,
    propertyType: 'rural' | 'urban' = 'rural',
    title?: string,
    signal?: AbortSignal
  ): Promise<AppraisalRequest> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    if (!organizationId || organizationId.trim() === '') {
      throw new Error('Organização é obrigatória para criar solicitação.');
    }
    if (!input.clientId || !input.propertyId || !requestedByUserId) {
      throw new Error('Cliente, imóvel e captador são obrigatórios.');
    }
    if (!input.purpose || input.purpose.trim() === '') {
      throw new Error('Finalidade da avaliação é obrigatória.');
    }

    // Idempotência
    if (input.idempotencyKey) {
      const cacheKey = `${organizationId}:req:${input.idempotencyKey}`;
      const cached = this.idempotencyStore.get(cacheKey) as AppraisalRequest | undefined;
      if (cached) return Object.freeze({ ...cached });
    }

    // Valida vínculo comercial ativo do captador com o cliente informado
    const capturerGateway = getClientCapturerAssignmentGateway();
    const activeAssignment = await capturerGateway.getActiveAssignment(
      organizationId,
      input.clientId
    );
    if (!activeAssignment || activeAssignment.capturerUserId !== requestedByUserId) {
      throw new Error('Captador não possui vínculo comercial ativo com este cliente.');
    }

    const now = new Date().toISOString();
    const newRequestId: AppraisalRequestId = this.generateId('req');

    const documentReferences: readonly AppraisalDocumentReference[] = input.documentReferences
      ? input.documentReferences.map((doc, idx) => ({
          id: `doc_${newRequestId}_${idx}`,
          organizationId,
          sourceEntity: 'appraisal_request',
          sourceEntityId: newRequestId,
          category: doc.category,
          version: doc.version,
          displayName: doc.displayName,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          checksum: doc.checksum,
          authorUserId: requestedByUserId,
          createdAt: now,
          accessStatus: doc.accessStatus || 'available',
        }))
      : [];

    const newRequest: AppraisalRequest = Object.freeze({
      id: newRequestId,
      organizationId,
      clientId: input.clientId,
      propertyId: input.propertyId,
      requestedByUserId,
      capturerRelationship: 'primary_capturer',
      purpose: input.purpose,
      status: 'submitted',
      notes: input.notes,
      documentReferences,
      createdAt: now,
      updatedAt: now,
    });

    const orgRequests = getSharedRequestsByOrg(organizationId);
    setSharedRequestsForOrg(organizationId, [newRequest, ...orgRequests]);

    if (input.idempotencyKey) {
      this.idempotencyStore.set(`${organizationId}:req:${input.idempotencyKey}`, newRequest);
    }

    createAppraisalDomainEvent({
      organizationId,
      eventType: 'appraisal_request_submitted',
      entityType: 'appraisal_request',
      entityId: newRequest.id,
      relatedEntityId: input.propertyId,
      actorUserId: requestedByUserId,
      payload: {
        clientId: input.clientId,
        requestedByUserId,
        purpose: input.purpose,
        desiredDeadline: input.desiredDeadline,
        propertyType,
      },
    });

    // Notifica gerentes e administradores da nova solicitação na fila
    try {
      const notifGateway = getAppraisalNotificationsGateway();
      await notifGateway.dispatchNotification(organizationId, {
        recipientRole: 'manager',
        type: 'new_request_in_queue',
        clientId: input.clientId,
        propertyId: input.propertyId,
        appraisalRequestId: newRequest.id,
        title: `Nova Solicitação de Laudo: ${title || input.purpose}`,
        message: `O captador cadastrou uma nova solicitação para o imóvel aguardando triagem técnica.`,
        correlationId: `corr_${newRequest.id}`,
      });
    } catch {
      // Notificação
    }

    return newRequest;
  }

  async getAppraisalRequestById(
    organizationId: string,
    requestId: string,
    signal?: AbortSignal
  ): Promise<AppraisalRequest | null> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const orgRequests = getSharedRequestsByOrg(organizationId);
    const item = orgRequests.find((req) => req.id === requestId);
    return item ? Object.freeze({ ...item }) : null;
  }

  async listAppraisalRequests(
    filters: AppraisalRequestListFilters,
    pagination: Partial<AppraisalListPagination> = {},
    signal?: AbortSignal
  ): Promise<AppraisalRequestListResult> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }
    if (!filters.organizationId) {
      return {
        items: [],
        pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
      };
    }

    const orgRequests = getSharedRequestsByOrg(filters.organizationId);

    const filtered = orgRequests.filter((item) => {
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
        const q = filters.search.toLowerCase().trim();
        const matchesPurpose = item.purpose.toLowerCase().includes(q);
        const matchesNotes = item.notes ? item.notes.toLowerCase().includes(q) : false;
        if (!matchesPurpose && !matchesNotes) return false;
      }
      return true;
    });

    const safePagination = pagination || {};
    const page = safePagination.page && safePagination.page > 0 ? safePagination.page : 1;
    const pageSize =
      safePagination.pageSize && safePagination.pageSize > 0 ? safePagination.pageSize : 10;
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;

    const start = (page - 1) * pageSize;
    const paginatedItems = filtered.slice(start, start + pageSize);

    return {
      items: Object.freeze(
        [...paginatedItems].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      ),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  }

  async listAppraisalRequestsByCapturer(
    organizationId: string,
    capturerUserId: string,
    signal?: AbortSignal
  ): Promise<readonly AppraisalRequest[]> {
    const res = await this.listAppraisalRequests(
      { organizationId, requestedByUserId: capturerUserId },
      { page: 1, pageSize: 100 },
      signal
    );
    return res.items;
  }

  async assignAppraisalRequest(
    organizationId: string,
    command: AssignAppraisalRequestCommand,
    assignedByUserId: string,
    signal?: AbortSignal
  ): Promise<AppraisalRequest> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const targetDesignerId = command.designerUserId || command.assignedToUserId;
    if (!organizationId || !command.requestId || !targetDesignerId) {
      throw new Error('Parâmetros obrigatórios ausentes para atribuição de solicitação.');
    }

    const orgRequests = getSharedRequestsByOrg(organizationId);
    const index = orgRequests.findIndex((r) => r.id === command.requestId);

    if (index === -1) {
      throw new Error(`Solicitação ${command.requestId} não localizada na organização.`);
    }

    const current = orgRequests[index];
    if (
      current.status !== 'submitted' &&
      current.status !== 'received' &&
      current.status !== 'awaiting_assignment' &&
      current.status !== 'assigned'
    ) {
      throw new Error(
        `Solicitações no status "${current.status}" não podem receber atribuição técnica.`
      );
    }

    const now = new Date().toISOString();
    const isReassignment = !!current.assignedToUserId && current.assignedToUserId !== targetDesignerId;
    const updated: AppraisalRequest = Object.freeze({
      ...current,
      assignedToUserId: targetDesignerId,
      assignedAt: now,
      status: 'assigned',
      priority: command.priority || current.priority,
      notes: command.notes ? `${current.notes ? `${current.notes}\n` : ''}${command.notes}` : current.notes,
      updatedAt: now,
    });

    const updatedList = [...orgRequests];
    updatedList[index] = updated;
    setSharedRequestsForOrg(organizationId, updatedList);

    createAppraisalDomainEvent({
      organizationId,
      eventType: isReassignment ? 'appraisal_request_reassigned' : 'appraisal_request_assigned',
      entityType: 'appraisal_request',
      entityId: updated.id,
      relatedEntityId: current.propertyId,
      actorUserId: assignedByUserId,
      payload: {
        assignedToUserId: targetDesignerId,
        previousAssignedToUserId: current.assignedToUserId,
        transferReason: command.transferReason,
      },
    });

    // Notificações: para o Projetista/RT designado e para o Captador
    try {
      const notifGateway = getAppraisalNotificationsGateway();
      // Notifica o Projetista/RT
      await notifGateway.dispatchNotification(organizationId, {
        recipientUserId: targetDesignerId,
        type: isReassignment ? 'request_reassigned' : 'request_assigned',
        clientId: updated.clientId,
        propertyId: updated.propertyId,
        appraisalRequestId: updated.id,
        title: `Solicitação Atribuída`,
        message: `Você foi designado como responsável técnico para a solicitação de laudo.`,
        correlationId: `corr_${updated.id}`,
      });
      // Notifica o Captador
      await notifGateway.dispatchNotification(organizationId, {
        recipientUserId: updated.requestedByUserId,
        type: 'request_assigned',
        clientId: updated.clientId,
        propertyId: updated.propertyId,
        appraisalRequestId: updated.id,
        title: `Responsável Técnico Designado`,
        message: `A solicitação foi triada e atribuída para elaboração.`,
        correlationId: `corr_${updated.id}`,
      });
    } catch {
      // Notificação
    }

    return updated;
  }

  async convertRequestToAppraisal(
    organizationId: string,
    command: ConvertRequestToAppraisalCommand,
    responsibleUserId: string,
    propertyType: 'rural' | 'urban' = 'rural',
    signal?: AbortSignal
  ): Promise<Appraisal> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    if (!organizationId || !command.requestId) {
      throw new Error('Organização e identificador da solicitação são obrigatórios para conversão.');
    }

    // Idempotência
    if (command.idempotencyKey) {
      const cacheKey = `${organizationId}:conv:${command.idempotencyKey}`;
      const cached = this.idempotencyStore.get(cacheKey) as Appraisal | undefined;
      if (cached) return Object.freeze({ ...cached });
    }

    const orgRequests = getSharedRequestsByOrg(organizationId);
    const index = orgRequests.findIndex((r) => r.id === command.requestId);

    if (index === -1) {
      throw new Error(`Solicitação ${command.requestId} não localizada na organização.`);
    }

    const currentRequest = orgRequests[index];

    if (currentRequest.status === 'converted' && currentRequest.resultingAppraisalId) {
      const existingAppraisal = await this.getAppraisalById(
        organizationId,
        currentRequest.resultingAppraisalId,
        signal
      );
      if (existingAppraisal) return existingAppraisal;
    }

    if (
      currentRequest.status !== 'assigned' &&
      currentRequest.status !== 'accepted' &&
      currentRequest.status !== 'submitted'
    ) {
      throw new Error(
        `Solicitações com status "${currentRequest.status}" não podem ser convertidas em laudo.`
      );
    }

    const now = new Date().toISOString();
    const newAppraisalId: AppraisalId = this.generateId('app');
    const finalResponsibleUserId =
      responsibleUserId || currentRequest.assignedToUserId || currentRequest.requestedByUserId;

    // Cria o Laudo correspondente com rastreabilidade total
    const newAppraisal: Appraisal = Object.freeze({
      id: newAppraisalId,
      organizationId,
      clientId: currentRequest.clientId,
      propertyId: currentRequest.propertyId,
      responsibleUserId: finalResponsibleUserId,
      appraisalRequestId: currentRequest.id,
      origin: 'capturer_request',
      status: 'draft',
      purpose: currentRequest.purpose,
      title: `Laudo de Avaliação — ${currentRequest.purpose}`,
      propertyType,
      currentVersionNumber: 1,
      observations: currentRequest.notes,
      createdAt: now,
      updatedAt: now,
    });

    // Atualiza atomicamente o estado da solicitação para converted
    const updatedRequest: AppraisalRequest = Object.freeze({
      ...currentRequest,
      status: 'converted',
      resultingAppraisalId: newAppraisalId,
      completedAt: now,
      updatedAt: now,
    });

    const updatedRequestsList = [...orgRequests];
    updatedRequestsList[index] = updatedRequest;
    setSharedRequestsForOrg(organizationId, updatedRequestsList);

    const orgAppraisals = this.appraisalsStore.get(organizationId) || [];
    this.appraisalsStore.set(organizationId, [newAppraisal, ...orgAppraisals]);

    if (command.idempotencyKey) {
      this.idempotencyStore.set(`${organizationId}:conv:${command.idempotencyKey}`, newAppraisal);
    }

    // Registra eventos de domínio
    createAppraisalDomainEvent({
      organizationId,
      eventType: 'appraisal_request_converted',
      entityType: 'appraisal_request',
      entityId: currentRequest.id,
      relatedEntityId: newAppraisal.id,
      actorUserId: finalResponsibleUserId,
      payload: {
        appraisalId: newAppraisal.id,
        clientId: currentRequest.clientId,
        propertyId: currentRequest.propertyId,
      },
    });

    createAppraisalDomainEvent({
      organizationId,
      eventType: 'appraisal_created_from_request',
      entityType: 'appraisal',
      entityId: newAppraisal.id,
      relatedEntityId: currentRequest.id,
      actorUserId: finalResponsibleUserId,
      payload: {
        origin: 'capturer_request',
        appraisalRequestId: currentRequest.id,
        clientId: newAppraisal.clientId,
        propertyId: newAppraisal.propertyId,
      },
    });

    // Notifica o Captador de que a solicitação virou laudo em elaboração
    try {
      const notifGateway = getAppraisalNotificationsGateway();
      await notifGateway.dispatchNotification(organizationId, {
        recipientUserId: currentRequest.requestedByUserId,
        type: 'request_converted',
        clientId: currentRequest.clientId,
        propertyId: currentRequest.propertyId,
        appraisalId: newAppraisal.id,
        appraisalRequestId: currentRequest.id,
        title: `Laudo Iniciado a partir da Solicitação`,
        message: `A elaboração técnica do laudo foi oficialmente iniciada pelo responsável técnico.`,
        correlationId: `corr_${newAppraisal.id}`,
      });
    } catch {
      // Notificação
    }

    return newAppraisal;
  }

  /* -------------------------------------------------------------------------- */
  /*                  DOSSIÊ TÉCNICO, AMOSTRAS, CÁLCULOS E NORMAS               */
  /* -------------------------------------------------------------------------- */

  async getTechnicalDossier(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<AppraisalTechnicalDossier> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    let orgMap = this.dossiersStore.get(organizationId);
    if (!orgMap) {
      orgMap = new Map<string, AppraisalTechnicalDossier>();
      this.dossiersStore.set(organizationId, orgMap);
    }

    const existing = orgMap.get(appraisalId);
    if (existing) {
      return Object.freeze({ ...existing });
    }

    const appraisal = await this.getAppraisalById(organizationId, appraisalId, signal);
    const propertyType = appraisal?.propertyType || 'rural';
    const purpose = appraisal?.purpose || 'Determinação de Valor de Mercado';

    const now = new Date().toISOString();
    const defaultDossier: AppraisalTechnicalDossier = Object.freeze({
      appraisalId,
      organizationId,
      identification: {
        status: 'in_progress' as const,
        updatedAt: now,
        updatedByUserId: 'system',
        validationIssues: [],
        purpose,
        objective: '',
        valueType: 'market_value' as const,
        referenceDate: now.split('T')[0],
        requesterName: '',
        interestedPartyName: '',
        assumptions: [],
        limitingConditions: [],
        caveats: [],
        consultedDocumentsSummary: '',
      },
      characterization: propertyType === 'rural' ? {
        propertyType: 'rural' as const,
        status: 'in_progress' as const,
        updatedAt: now,
        updatedByUserId: 'system',
        validationIssues: [],
        accessDescription: {
          value: '',
          provenance: 'reported_survey' as const,
        },
        mainLogisticalDistances: [],
        totalAreaHa: 0,
        legalReserveAreaHa: 0,
        appAreaHa: 0,
        consolidatedAreaHa: 0,
        topographyRelief: { value: 'flat' as const, provenance: 'reported_survey' as const },
        soilTypesDescription: {
          value: '',
          provenance: 'reported_survey' as const,
        },
        landUseCapabilityClasses: [] as const,
        currentLandUseAndCover: {
          value: '',
          provenance: 'reported_survey' as const,
        },
        waterResourcesDescription: {
          value: '',
          provenance: 'reported_survey' as const,
        },
        powerAvailability: { value: 'none' as const, provenance: 'reported_survey' as const },
        internalInfrastructureSummary: {
          value: '',
          provenance: 'reported_survey' as const,
        },
        environmentalAspectsDeclared: {
          value: '',
          provenance: 'canonical_registration' as const,
        },
        economicExploitation: {
          value: '',
          provenance: 'reported_survey' as const,
        },
      } : {
        propertyType: 'urban' as const,
        status: 'in_progress' as const,
        updatedAt: now,
        updatedByUserId: 'system',
        validationIssues: [],
        zoningClassification: { value: '', provenance: 'canonical_registration' as const },
        masterPlanCompliance: { value: '', provenance: 'canonical_registration' as const },
        urbanInfrastructure: [] as const,
        accessibilityAndTransit: { value: '', provenance: 'reported_survey' as const },
        terrainTopography: { value: 'flat' as const, provenance: 'reported_survey' as const },
        terrainShape: { value: 'regular_rectangular' as const, provenance: 'canonical_registration' as const },
        frontageMeters: 0,
        totalTerrainAreaM2: 0,
        builtPrivateAreaM2: 0,
        buildingStandard: { value: 'normal' as const, provenance: 'reported_survey' as const },
        apparentAgeYears: 0,
        conservationState: { value: 'regular' as const, provenance: 'reported_survey' as const },
        neighborhoodVocation: { value: '', provenance: 'reported_survey' as const },
      },
      improvements: {
        status: 'in_progress' as const,
        updatedAt: now,
        updatedByUserId: 'system',
        validationIssues: [],
        items: [],
        totalImprovementsCostNew: 0,
        totalImprovementsDepreciatedValue: 0,
      },
      conclusion: {
        status: 'not_started' as const,
        updatedAt: now,
        updatedByUserId: 'system',
        validationIssues: [],
        objectDescription: '',
        finalValuationAmount: 0,
        finalValuationCurrency: 'BRL' as const,
        valuationDate: now.split('T')[0],
        unitValueSummary: 'R$ 0,00',
        valueRangeMin: 0,
        valueRangeMax: 0,
        assumptionsAndCaveatsSummary: '',
        professionalStatement: '',
      },
      documentReferences: [],
      updatedAt: now,
      updatedByUserId: 'system',
    });

    orgMap.set(appraisalId, defaultDossier);
    return defaultDossier;
  }

  async saveTechnicalDossier(
    organizationId: string,
    dossier: AppraisalTechnicalDossier,
    signal?: AbortSignal
  ): Promise<AppraisalTechnicalDossier> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    let orgMap = this.dossiersStore.get(organizationId);
    if (!orgMap) {
      orgMap = new Map<string, AppraisalTechnicalDossier>();
      this.dossiersStore.set(organizationId, orgMap);
    }

    const updated = Object.freeze({
      ...dossier,
      updatedAt: new Date().toISOString(),
    });
    orgMap.set(dossier.appraisalId, updated);
    return updated;
  }

  async listMarketSamples(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<readonly AppraisalMarketSample[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    let orgMap = this.samplesStore.get(organizationId);
    if (!orgMap) {
      orgMap = new Map<string, AppraisalMarketSample[]>();
      this.samplesStore.set(organizationId, orgMap);
    }

    const items = orgMap.get(appraisalId) || [];
    return Object.freeze([...items]);
  }

  async saveMarketSample(
    organizationId: string,
    sample: AppraisalMarketSample,
    signal?: AbortSignal
  ): Promise<AppraisalMarketSample> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    let orgMap = this.samplesStore.get(organizationId);
    if (!orgMap) {
      orgMap = new Map<string, AppraisalMarketSample[]>();
      this.samplesStore.set(organizationId, orgMap);
    }

    const currentList = orgMap.get(sample.appraisalId) || [];
    const index = currentList.findIndex((s) => s.id === sample.id);

    const now = new Date().toISOString();
    const frozenSample = Object.freeze({
      ...sample,
      id: sample.id || this.generateId('sample'),
      updatedAt: now,
      createdAt: sample.createdAt || now,
    });

    let updatedList: AppraisalMarketSample[];
    if (index >= 0) {
      updatedList = [...currentList];
      updatedList[index] = frozenSample;
    } else {
      updatedList = [frozenSample, ...currentList];
    }

    orgMap.set(sample.appraisalId, updatedList);
    return frozenSample;
  }

  async deleteMarketSample(
    organizationId: string,
    appraisalId: AppraisalId,
    sampleId: string,
    signal?: AbortSignal
  ): Promise<void> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const orgMap = this.samplesStore.get(organizationId);
    if (!orgMap) return;

    const currentList = orgMap.get(appraisalId) || [];
    const updatedList = currentList.filter((s) => s.id !== sampleId);
    orgMap.set(appraisalId, updatedList);
  }

  async getCalculationSection(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<AppraisalCalculationSection> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    let orgMap = this.calculationsStore.get(organizationId);
    if (!orgMap) {
      orgMap = new Map<string, AppraisalCalculationSection>();
      this.calculationsStore.set(organizationId, orgMap);
    }

    const existing = orgMap.get(appraisalId);
    if (existing) {
      return Object.freeze({ ...existing });
    }

    const now = new Date().toISOString();
    const defaultCalc: AppraisalCalculationSection = Object.freeze({
      status: 'in_progress',
      updatedAt: now,
      updatedByUserId: 'system',
      validationIssues: [],
      primaryMethod: 'direct_comparative',
      auxiliaryMethods: ['cost_quantification' as const],
      calculationRuns: [],
      breakdown: {
        landValue: 0,
        improvementsValue: 0,
        specialComponentsValue: 0,
        totalCalculatedValue: 0,
        roundingAppliedAmount: 0,
        finalAdoptedValue: 0,
        recommendedRangeMin: 0,
        recommendedRangeMax: 0,
      },
      technicalJustification: '',
    });

    orgMap.set(appraisalId, defaultCalc);
    return defaultCalc;
  }

  async saveCalculationSection(
    organizationId: string,
    appraisalId: AppraisalId,
    calculation: AppraisalCalculationSection,
    signal?: AbortSignal
  ): Promise<AppraisalCalculationSection> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    let orgMap = this.calculationsStore.get(organizationId);
    if (!orgMap) {
      orgMap = new Map<string, AppraisalCalculationSection>();
      this.calculationsStore.set(organizationId, orgMap);
    }

    const updated = Object.freeze({
      ...calculation,
      updatedAt: new Date().toISOString(),
    });
    orgMap.set(appraisalId, updated);
    return updated;
  }

  async getNormativeSection(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<AppraisalNormativeSection> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    let orgMap = this.normativesStore.get(organizationId);
    if (!orgMap) {
      orgMap = new Map<string, AppraisalNormativeSection>();
      this.normativesStore.set(organizationId, orgMap);
    }

    const existing = orgMap.get(appraisalId);
    if (existing) {
      return Object.freeze({ ...existing });
    }

    const now = new Date().toISOString();
    const defaultNormative: AppraisalNormativeSection = Object.freeze({
      status: 'in_progress',
      updatedAt: now,
      updatedByUserId: 'system',
      validationIssues: [],
      normativeRuleSetId: 'nbr14653_3_2019',
      normativeReferenceName: 'ABNT NBR 14653 — Avaliação de bens',
      degreeOfJustification: 'grau_I',
      degreeOfPrecision: 'grau_I',
      isUnconfiguredNotice: false,
      complianceChecklist: [
        { requirementDescription: 'Vistoria e caracterização completa do imóvel avaliando', isCompliant: false, evidenceSummary: '' },
        { requirementDescription: 'Amostragem com número mínimo de dados válidos', isCompliant: false, evidenceSummary: '' },
        { requirementDescription: 'Identificação e justificativa de fatores de homogeneização', isCompliant: false, evidenceSummary: '' },
        { requirementDescription: 'Identificação da Anotação de Responsabilidade Técnica (ART/RRT/TRT)', isCompliant: false, evidenceSummary: '' },
      ],
    });

    orgMap.set(appraisalId, defaultNormative);
    return defaultNormative;
  }

  async saveNormativeSection(
    organizationId: string,
    appraisalId: AppraisalId,
    normative: AppraisalNormativeSection,
    signal?: AbortSignal
  ): Promise<AppraisalNormativeSection> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    let orgMap = this.normativesStore.get(organizationId);
    if (!orgMap) {
      orgMap = new Map<string, AppraisalNormativeSection>();
      this.normativesStore.set(organizationId, orgMap);
    }

    const updated = Object.freeze({
      ...normative,
      updatedAt: new Date().toISOString(),
    });
    orgMap.set(appraisalId, updated);
    return updated;
  }

  async listIssuedVersions(
    organizationId: string,
    appraisalId: AppraisalId,
    signal?: AbortSignal
  ): Promise<readonly AppraisalIssuedVersion[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    let orgMap = this.issuedVersionsStore.get(organizationId);
    if (!orgMap) {
      orgMap = new Map<string, AppraisalIssuedVersion[]>();
      this.issuedVersionsStore.set(organizationId, orgMap);
    }

    const list = orgMap.get(appraisalId) || [];
    return Object.freeze([...list]);
  }

  async commitIssuedVersion(
    input: CommitIssuedVersionInput,
    signal?: AbortSignal
  ): Promise<CommitIssuedVersionResult> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const { organizationId, appraisalId, actorUserId, version } = input;
    const orgAppraisals = this.appraisalsStore.get(organizationId) || [];
    const appraisalIndex = orgAppraisals.findIndex((item) => item.id === appraisalId);
    if (appraisalIndex < 0) {
      throw new Error('Laudo de avaliação não encontrado para a organização informada.');
    }

    const currentAppraisal = orgAppraisals[appraisalIndex];
    if (currentAppraisal.status !== 'ready_to_issue') {
      throw new Error('A emissão formal exige que o laudo esteja no estado "ready_to_issue".');
    }
    if (
      version.organizationId !== organizationId ||
      version.appraisalId !== appraisalId ||
      version.issuedByUserId !== actorUserId
    ) {
      throw new Error('Metadados da versão emitida divergem do laudo, organização ou ator canônicos.');
    }

    let orgMap = this.issuedVersionsStore.get(organizationId);
    if (!orgMap) {
      orgMap = new Map<string, AppraisalIssuedVersion[]>();
    }

    const currentList = orgMap.get(appraisalId) || [];
    const nextVersionNumber = currentList.reduce(
      (highest, item) => Math.max(highest, item.versionNumber),
      0
    ) + 1;
    if (version.versionNumber !== nextVersionNumber) {
      throw new Error('CONCURRENCY_CONFLICT: número de versão emitida não é o próximo número canônico.');
    }
    if (
      currentList.some(
        (item) => item.id === version.id || item.versionNumber === version.versionNumber
      )
    ) {
      throw new Error('CONCURRENCY_CONFLICT: versão emitida duplicada.');
    }

    const now = new Date().toISOString();
    const updatedAppraisal: Appraisal = Object.freeze({
      ...currentAppraisal,
      status: 'issued',
      issuedAt: now,
      updatedAt: now,
    });

    // Commit síncrono em memória: nenhuma falha observável pode ocorrer entre as duas escritas.
    orgMap.set(appraisalId, [version, ...currentList]);
    this.issuedVersionsStore.set(organizationId, orgMap);
    const nextAppraisals = [...orgAppraisals];
    nextAppraisals[appraisalIndex] = updatedAppraisal;
    this.appraisalsStore.set(organizationId, nextAppraisals);

    return { issuedVersion: version, updatedAppraisal };
  }

  clearAllSessionData(): void {
    this.appraisalsStore.clear();
    clearAllSharedRequests();
    this.idempotencyStore.clear();
    this.dossiersStore.clear();
    this.samplesStore.clear();
    this.calculationsStore.clear();
    this.normativesStore.clear();
    this.issuedVersionsStore.clear();
  }
}
