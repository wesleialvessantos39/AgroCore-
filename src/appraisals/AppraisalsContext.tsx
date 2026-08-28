/**
 * Contexto de Laudos e Solicitações de Avaliação
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Princípios Arquiteturais:
 * 1. Isolamento estrito multitenant por organização ativa
 * 2. Validação prévia de fontes canônicas (clientes e imóveis vinculados)
 * 3. Aplicação incondicional da política de governança pura (appraisalAccessPolicy)
 * 4. Tipagem estrita sem qualquer uso de "any"
 * 5. Tratamento de cancelamento com AbortController
 * 6. Suporte completo ao fluxo de OE-004.002: Fila, Atribuição, Conversão Atômica, Início Direto
 */

import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Appraisal,
  AppraisalCapturerProjection,
  AppraisalContextStatus,
  AppraisalDocumentReference,
  AppraisalId,
  AppraisalListFilters,
  AppraisalListPagination,
  AppraisalOrigin,
  AppraisalRequest,
  AppraisalRequestId,
  AppraisalRequestListFilters,
  AppraisalRequestStatus,
  AppraisalStatus,
  AppraisalSummary,
  AssignAppraisalRequestCommand,
  ConvertRequestToAppraisalCommand,
  StartDirectAppraisalCommand,
} from '../types/appraisal';
import { AppraisalTechnicalDossier } from '../types/appraisalDossier';
import {
  AppraisalCalculationSection,
  AppraisalMarketSample,
} from '../types/appraisalCalculation';
import { AppraisalNormativeSection } from '../types/appraisalNormative';
import { AppraisalIssuedVersion } from '../types/appraisalVersioning';
import { getAppraisalGateway } from './gatewayFactory';
import { getAppraisalRequestGateway } from './requestGatewayFactory';
import { getClientGateway } from '../clients/gatewayFactory';
import { getPropertyGateway } from '../properties/gatewayFactory';
import { getTechnicalProfessionalGateway } from '../technicalProfessionals/gatewayFactory';
import { evaluateTechnicalEligibility } from './technicalEligibilityEvaluator';
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import { useAuthorization } from '../authorization/useAuthorization';
import { createAppraisalDomainEvent } from './domainEvents';
import { evaluateAppraisalAccess } from './appraisalAccessPolicy';
import { appraisalIssuanceService } from './appraisalIssuanceService';

export interface AppraisalsContextValue {
  readonly appraisals: readonly AppraisalSummary[];
  readonly requests: readonly AppraisalRequest[];
  readonly appraisalsPagination: AppraisalListPagination;
  readonly requestsPagination: AppraisalListPagination;
  readonly appraisalsFilters: AppraisalListFilters;
  readonly requestsFilters: AppraisalRequestListFilters;
  readonly status: AppraisalContextStatus;
  readonly error: string | null;

  readonly setAppraisalsFilters: (filters: Partial<AppraisalListFilters>) => void;
  readonly setRequestsFilters: (filters: Partial<AppraisalRequestListFilters>) => void;
  readonly setAppraisalsPage: (page: number) => void;
  readonly setRequestsPage: (page: number) => void;

  readonly refreshAppraisals: () => Promise<void>;
  readonly refreshRequests: () => Promise<void>;

  readonly getAppraisalById: (id: AppraisalId) => Promise<Appraisal | null>;
  readonly getRequestById: (id: AppraisalRequestId) => Promise<AppraisalRequest | null>;

  readonly createAppraisal: (input: {
    clientId: string;
    propertyId: string;
    origin?: AppraisalOrigin;
    purpose: string;
    title: string;
    propertyType?: 'rural' | 'urban';
    observations?: string;
    appraisalRequestId?: string;
  }) => Promise<Appraisal>;

  readonly startDirectAppraisal: (command: StartDirectAppraisalCommand) => Promise<Appraisal>;

  readonly updateAppraisalStatus: (input: {
    appraisalId: AppraisalId;
    newStatus: AppraisalStatus;
    cancellationReason?: string;
  }) => Promise<Appraisal>;

  readonly createRequest: (input: {
    clientId: string;
    propertyId: string;
    purpose: string;
    capturerRelationship?: string;
    notes?: string;
    desiredDeadline?: string;
    documentReferences?: readonly AppraisalDocumentReference[];
  }) => Promise<AppraisalRequest>;

  readonly assignAppraisalRequest: (command: AssignAppraisalRequestCommand) => Promise<AppraisalRequest>;

  readonly convertRequestToAppraisal: (command: ConvertRequestToAppraisalCommand) => Promise<Appraisal>;

  readonly getAppraisalCapturerProjection: (appraisalId: string) => Promise<AppraisalCapturerProjection | null>;

  readonly updateRequestStatus: (input: {
    requestId: AppraisalRequestId;
    newStatus: AppraisalRequestStatus;
    assignedToUserId?: string;
    resultingAppraisalId?: string;
    declineReason?: string;
    cancelReason?: string;
  }) => Promise<AppraisalRequest>;

  readonly addRequestDocument: (
    requestId: AppraisalRequestId,
    document: AppraisalDocumentReference
  ) => Promise<AppraisalRequest>;

  // Dossiê Técnico e Seções (OE-004.003)
  readonly getTechnicalDossier: (appraisalId: AppraisalId) => Promise<AppraisalTechnicalDossier>;
  readonly saveTechnicalDossier: (dossier: AppraisalTechnicalDossier) => Promise<AppraisalTechnicalDossier>;
  readonly listMarketSamples: (appraisalId: AppraisalId) => Promise<readonly AppraisalMarketSample[]>;
  readonly saveMarketSample: (sample: AppraisalMarketSample) => Promise<AppraisalMarketSample>;
  readonly deleteMarketSample: (appraisalId: AppraisalId, sampleId: string) => Promise<void>;
  readonly getCalculationSection: (appraisalId: AppraisalId) => Promise<AppraisalCalculationSection>;
  readonly saveCalculationSection: (appraisalId: AppraisalId, calculation: AppraisalCalculationSection) => Promise<AppraisalCalculationSection>;
  readonly getNormativeSection: (appraisalId: AppraisalId) => Promise<AppraisalNormativeSection>;
  readonly saveNormativeSection: (appraisalId: AppraisalId, normative: AppraisalNormativeSection) => Promise<AppraisalNormativeSection>;
  readonly listIssuedVersions: (appraisalId: AppraisalId) => Promise<readonly AppraisalIssuedVersion[]>;
  readonly saveIssuedVersion: (version: AppraisalIssuedVersion) => Promise<AppraisalIssuedVersion>;
  readonly issueAppraisalVersion: (appraisalId: AppraisalId) => Promise<AppraisalIssuedVersion>;
}

export const AppraisalsContext = createContext<AppraisalsContextValue | null>(null);

const DEFAULT_PAGINATION: AppraisalListPagination = {
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 1,
};

export function AppraisalsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = useAuth();
  const { activeOrganization } = useOrganization();
  const { can, canAny, activePermissions } = useAuthorization();

  const [appraisals, setAppraisals] = useState<readonly AppraisalSummary[]>([]);
  const [requests, setRequests] = useState<readonly AppraisalRequest[]>([]);
  const [appraisalsPagination, setAppraisalsPagination] = useState<AppraisalListPagination>(DEFAULT_PAGINATION);
  const [requestsPagination, setRequestsPagination] = useState<AppraisalListPagination>(DEFAULT_PAGINATION);

  const [appraisalsFilters, setAppraisalsFiltersState] = useState<AppraisalListFilters>({
    organizationId: activeOrganization?.id || '',
    status: 'all',
  });

  const [requestsFilters, setRequestsFiltersState] = useState<AppraisalRequestListFilters>({
    organizationId: activeOrganization?.id || '',
    status: 'all',
  });

  const [status, setStatus] = useState<AppraisalContextStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sincronizar organizationId nos filtros ao mudar organização ativa e limpar dados imediatamente
  useEffect(() => {
    if (activeOrganization?.id) {
      setAppraisalsFiltersState((prev) => ({ ...prev, organizationId: activeOrganization.id }));
      setRequestsFiltersState((prev) => ({ ...prev, organizationId: activeOrganization.id }));
    } else {
      setAppraisals([]);
      setRequests([]);
      setAppraisalsPagination(DEFAULT_PAGINATION);
      setRequestsPagination(DEFAULT_PAGINATION);
      setStatus('idle');
      setError(null);
    }
  }, [activeOrganization?.id]);

  const canViewAppraisals = can('appraisals:view');
  const canViewRequests = canAny([
    'appraisal_requests:view_queue',
    'appraisal_requests:view_related',
    'appraisal_requests:view_assigned',
  ]);

  const loadData = useCallback(async () => {
    if (!session || !activeOrganization?.id) {
      setAppraisals([]);
      setRequests([]);
      setStatus('idle');
      return;
    }

    if (!canViewAppraisals && !canViewRequests) {
      setStatus('forbidden');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setStatus('loading');
    setError(null);

    try {
      let loadedAppraisalsCount = 0;
      let loadedRequestsCount = 0;

      // 1. Carregar Laudos se possuir permissão
      if (canViewAppraisals) {
        const accessCheck = evaluateAppraisalAccess({
          operation: 'list_appraisals',
          actorUserId: session.user.id,
          actorRole: session.organizationRole,
          actorPermissions: Array.from(activePermissions),
          activeOrganizationId: activeOrganization.id,
          targetOrganizationId: activeOrganization.id,
          isMembershipActive: session.organizationRole !== 'none',
        });

        if (accessCheck.granted) {
          const appraisalGateway = getAppraisalGateway();
          const effectiveAppraisalFilters: AppraisalListFilters = {
            ...appraisalsFilters,
            organizationId: activeOrganization.id,
            responsibleUserId:
              session.organizationRole === 'project_designer' && !can('appraisals:create')
                ? session.user.id
                : appraisalsFilters.responsibleUserId,
          };

          const result = await appraisalGateway.listAppraisals(
            effectiveAppraisalFilters,
            appraisalsPagination,
            signal
          );
          setAppraisals(result.items);
          setAppraisalsPagination(result.pagination);
          loadedAppraisalsCount = result.items.length;
        }
      }

      // 2. Carregar Solicitações se possuir permissão
      if (canViewRequests) {
        const reqAccessCheck = evaluateAppraisalAccess({
          operation: 'list_requests',
          actorUserId: session.user.id,
          actorRole: session.organizationRole,
          actorPermissions: Array.from(activePermissions),
          activeOrganizationId: activeOrganization.id,
          targetOrganizationId: activeOrganization.id,
          isMembershipActive: session.organizationRole !== 'none',
        });

        if (reqAccessCheck.granted) {
          const requestGateway = getAppraisalGateway();
          const effectiveRequestFilters: AppraisalRequestListFilters = {
            ...requestsFilters,
            organizationId: activeOrganization.id,
            requestedByUserId:
              session.organizationRole === 'capturer'
                ? session.user.id
                : requestsFilters.requestedByUserId,
            assignedToUserId:
              session.organizationRole === 'project_designer' && !can('appraisal_requests:view_queue')
                ? session.user.id
                : requestsFilters.assignedToUserId,
          };

          const result = await requestGateway.listAppraisalRequests(
            effectiveRequestFilters,
            requestsPagination,
            signal
          );
          setRequests(result.items);
          setRequestsPagination(result.pagination);
          loadedRequestsCount = result.items.length;
        }
      }

      if (loadedAppraisalsCount === 0 && loadedRequestsCount === 0) {
        setStatus('empty');
      } else {
        setStatus('ready');
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Falha ao carregar dados de laudos e solicitações.';
      setError(message);
      setStatus('error');
    }
  }, [
    session,
    activeOrganization?.id,
    canViewAppraisals,
    canViewRequests,
    activePermissions,
    appraisalsFilters,
    appraisalsPagination.page,
    appraisalsPagination.pageSize,
    requestsFilters,
    requestsPagination.page,
    requestsPagination.pageSize,
    can,
  ]);

  useEffect(() => {
    loadData();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadData]);

  const setAppraisalsFilters = useCallback((filters: Partial<AppraisalListFilters>) => {
    setAppraisalsFiltersState((prev) => ({ ...prev, ...filters }));
    setAppraisalsPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const setRequestsFilters = useCallback((filters: Partial<AppraisalRequestListFilters>) => {
    setRequestsFiltersState((prev) => ({ ...prev, ...filters }));
    setRequestsPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const setAppraisalsPage = useCallback((page: number) => {
    setAppraisalsPagination((prev) => ({ ...prev, page }));
  }, []);

  const setRequestsPage = useCallback((page: number) => {
    setRequestsPagination((prev) => ({ ...prev, page }));
  }, []);

  const refreshAppraisals = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const refreshRequests = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const getAppraisalById = useCallback(
    async (id: AppraisalId): Promise<Appraisal | null> => {
      if (!session?.user?.id || !activeOrganization?.id) return null;
      const gateway = getAppraisalGateway();
      return gateway.getAppraisalById(activeOrganization.id, id);
    },
    [session, activeOrganization?.id]
  );

  const getRequestById = useCallback(
    async (id: AppraisalRequestId): Promise<AppraisalRequest | null> => {
      if (!session?.user?.id || !activeOrganization?.id) return null;
      const gateway = getAppraisalGateway();
      return gateway.getAppraisalRequestById(activeOrganization.id, id);
    },
    [session, activeOrganization?.id]
  );

  const createAppraisal = useCallback(
    async (input: {
      clientId: string;
      propertyId: string;
      origin?: AppraisalOrigin;
      purpose: string;
      title: string;
      propertyType?: 'rural' | 'urban';
      observations?: string;
      appraisalRequestId?: string;
    }): Promise<Appraisal> => {
      if (!session?.user?.id || !activeOrganization?.id) {
        throw new Error('Sessão ou organização ativa não disponível.');
      }

      // 1. Avaliação de Acesso R1 & R2
      const accessCheck = evaluateAppraisalAccess({
        operation: 'create_appraisal',
        actorUserId: session.user.id,
        actorRole: session.organizationRole,
        actorPermissions: Array.from(activePermissions),
        activeOrganizationId: activeOrganization.id,
        targetOrganizationId: activeOrganization.id,
        isMembershipActive: session.organizationRole !== 'none',
      });

      if (!accessCheck.granted) {
        throw new Error(accessCheck.reason);
      }

      // 2. Validação das Fontes Canônicas: Cliente e Imóvel
      const clientGateway = getClientGateway();
      const propertyGateway = getPropertyGateway();

      const client = await clientGateway.getClientById(activeOrganization.id, input.clientId);
      if (!client) {
        throw new Error('Cliente selecionado não foi encontrado no cadastro canônico da organização.');
      }

      const property = await propertyGateway.getPropertyById(activeOrganization.id, input.propertyId);
      if (!property) {
        throw new Error('Imóvel selecionado não foi encontrado no cadastro territorial da organização.');
      }

      // Validar vínculo canônico entre imóvel e cliente
      const isLinkedToClient =
        property.clientLinks && property.clientLinks.some((link) => link.clientId === input.clientId);

      if (!isLinkedToClient) {
        throw new Error('O imóvel selecionado não possui vínculo canônico registrado com o cliente informado.');
      }

      const canonicalPropertyType = property.propertyType;

      // 3. Avaliação Obrigatória de Elegibilidade Técnica Profissional
      const technicalGateway = getTechnicalProfessionalGateway();
      const technicalProfile = await technicalGateway.getProfileByUserId(
        activeOrganization.id,
        session.user.id
      );

      const eligibility = evaluateTechnicalEligibility({
        userId: session.user.id,
        userPermissions: Array.from(activePermissions),
        activeOrganizationId: activeOrganization.id,
        targetOrganizationId: activeOrganization.id,
        isMembershipActive: session.organizationRole !== 'none',
        profile: technicalProfile,
        propertyType: canonicalPropertyType,
        intent: 'draft_and_edit',
      });

      if (!eligibility.allowed || !eligibility.eligible || !technicalProfile) {
        const primaryReason =
          eligibility.reasons[0] || 'Profissional não elegível tecnicamente para elaboração do laudo.';
        throw new Error(`Elegibilidade técnica negada: ${primaryReason}`);
      }

      const originVal = (input as { origin?: string }).origin;
      if (originVal === 'request_conversion') {
        throw new Error('Conversão de solicitações requer o serviço transacional da OE-004.002.');
      }

      const gateway = getAppraisalGateway();
      const created = await gateway.createAppraisal({
        organizationId: activeOrganization.id,
        clientId: input.clientId,
        propertyId: input.propertyId,
        responsibleUserId: session.user.id,
        technicalProfessionalProfileId: technicalProfile.id,
        appraisalRequestId: input.appraisalRequestId,
        origin: 'technical_initiative',
        purpose: input.purpose,
        title: input.title,
        propertyType: canonicalPropertyType,
        observations: input.observations,
      });

      await loadData();
      return created;
    },
    [session, activeOrganization?.id, activePermissions, loadData]
  );

  const startDirectAppraisal = useCallback(
    async (command: StartDirectAppraisalCommand): Promise<Appraisal> => {
      if (!session?.user?.id || !activeOrganization?.id) {
        throw new Error('Sessão ou organização ativa não disponível.');
      }

      const propertyGateway = getPropertyGateway();
      const property = await propertyGateway.getPropertyById(activeOrganization.id, command.propertyId);
      const propertyType = property?.propertyType || 'rural';

      const gateway = getAppraisalGateway();
      const created = await gateway.startDirectAppraisal(
        activeOrganization.id,
        command,
        session.user.id,
        propertyType
      );

      await loadData();
      return created;
    },
    [session, activeOrganization?.id, loadData]
  );

  const updateAppraisalStatus = useCallback(
    async (input: {
      appraisalId: AppraisalId;
      newStatus: AppraisalStatus;
      cancellationReason?: string;
    }): Promise<Appraisal> => {
      if (!session?.user?.id || !activeOrganization?.id) {
        throw new Error('Sessão ou organização ativa não disponível.');
      }

      const gateway = getAppraisalGateway();
      const current = await gateway.getAppraisalById(activeOrganization.id, input.appraisalId);
      if (!current) {
        throw new Error('Laudo de avaliação não encontrado.');
      }

      const accessCheck = evaluateAppraisalAccess({
        operation: 'update_appraisal_status',
        actorUserId: session.user.id,
        actorRole: session.organizationRole,
        actorPermissions: Array.from(activePermissions),
        activeOrganizationId: activeOrganization.id,
        targetOrganizationId: current.organizationId,
        isMembershipActive: session.organizationRole !== 'none',
        appraisalEntity: current,
      });

      if (!accessCheck.granted) {
        throw new Error(accessCheck.reason);
      }

      const updated = await gateway.updateAppraisalStatus({
        organizationId: activeOrganization.id,
        appraisalId: input.appraisalId,
        newStatus: input.newStatus,
        actorUserId: session.user.id,
        cancellationReason: input.cancellationReason,
      });

      await loadData();
      return updated;
    },
    [session, activeOrganization?.id, activePermissions, loadData]
  );

  const createRequest = useCallback(
    async (input: {
      clientId: string;
      propertyId: string;
      purpose: string;
      capturerRelationship?: string;
      notes?: string;
      desiredDeadline?: string;
      documentReferences?: readonly AppraisalDocumentReference[];
    }): Promise<AppraisalRequest> => {
      if (!session?.user?.id || !activeOrganization?.id) {
        throw new Error('Sessão ou organização ativa não disponível.');
      }

      const accessCheck = evaluateAppraisalAccess({
        operation: 'create_request',
        actorUserId: session.user.id,
        actorRole: session.organizationRole,
        actorPermissions: Array.from(activePermissions),
        activeOrganizationId: activeOrganization.id,
        targetOrganizationId: activeOrganization.id,
        isMembershipActive: session.organizationRole !== 'none',
      });

      if (!accessCheck.granted) {
        throw new Error(accessCheck.reason);
      }

      const clientGateway = getClientGateway();
      const propertyGateway = getPropertyGateway();

      const client = await clientGateway.getClientById(activeOrganization.id, input.clientId);
      if (!client) {
        throw new Error('Cliente selecionado não encontrado no cadastro da organização.');
      }

      const property = await propertyGateway.getPropertyById(activeOrganization.id, input.propertyId);
      if (!property) {
        throw new Error('Imóvel selecionado não encontrado no cadastro da organização.');
      }

      const isLinkedToClient =
        property.clientLinks && property.clientLinks.some((link) => link.clientId === input.clientId);

      if (!isLinkedToClient) {
        throw new Error('O imóvel selecionado não possui vínculo canônico com o cliente informado.');
      }

      const gateway = getAppraisalGateway();
      const created = await gateway.createAppraisalRequest(
        activeOrganization.id,
        {
          clientId: input.clientId,
          propertyId: input.propertyId,
          purpose: input.purpose,
          desiredDeadline: input.desiredDeadline,
          notes: input.notes,
          documentReferences: input.documentReferences,
        },
        session.user.id,
        property.propertyType,
        input.purpose
      );

      await loadData();
      return created;
    },
    [session, activeOrganization?.id, activePermissions, loadData]
  );

  const assignAppraisalRequest = useCallback(
    async (command: AssignAppraisalRequestCommand): Promise<AppraisalRequest> => {
      if (!session?.user?.id || !activeOrganization?.id) {
        throw new Error('Sessão ou organização ativa não disponível.');
      }

      const gateway = getAppraisalGateway();
      const updated = await gateway.assignAppraisalRequest(
        activeOrganization.id,
        command,
        session.user.id
      );

      await loadData();
      return updated;
    },
    [session, activeOrganization?.id, loadData]
  );

  const convertRequestToAppraisal = useCallback(
    async (command: ConvertRequestToAppraisalCommand): Promise<Appraisal> => {
      if (!session?.user?.id || !activeOrganization?.id) {
        throw new Error('Sessão ou organização ativa não disponível.');
      }

      const gateway = getAppraisalGateway();
      const appraisal = await gateway.convertRequestToAppraisal(
        activeOrganization.id,
        command,
        session.user.id
      );

      await loadData();
      return appraisal;
    },
    [session, activeOrganization?.id, loadData]
  );

  const getAppraisalCapturerProjection = useCallback(
    async (appraisalId: string): Promise<AppraisalCapturerProjection | null> => {
      if (!session?.user?.id || !activeOrganization?.id) return null;
      const gateway = getAppraisalGateway();
      return gateway.getAppraisalCapturerProjection(
        activeOrganization.id,
        appraisalId,
        session.user.id
      );
    },
    [session, activeOrganization?.id]
  );

  const updateRequestStatus = useCallback(
    async (input: {
      requestId: AppraisalRequestId;
      newStatus: AppraisalRequestStatus;
      assignedToUserId?: string;
      resultingAppraisalId?: string;
      declineReason?: string;
      cancelReason?: string;
    }): Promise<AppraisalRequest> => {
      if (!session?.user?.id || !activeOrganization?.id) {
        throw new Error('Sessão ou organização ativa não disponível.');
      }

      const reqGateway = getAppraisalRequestGateway();
      const current = await reqGateway.getRequestById(activeOrganization.id, input.requestId);
      if (!current) {
        throw new Error('Solicitação de laudo não encontrada.');
      }

      const accessCheck = evaluateAppraisalAccess({
        operation: 'update_request_status',
        actorUserId: session.user.id,
        actorRole: session.organizationRole,
        actorPermissions: Array.from(activePermissions),
        activeOrganizationId: activeOrganization.id,
        targetOrganizationId: current.organizationId,
        isMembershipActive: session.organizationRole !== 'none',
        requestEntity: current,
      });

      if (!accessCheck.granted) {
        throw new Error(accessCheck.reason);
      }

      const updated = await reqGateway.updateRequestStatus({
        organizationId: activeOrganization.id,
        requestId: input.requestId,
        newStatus: input.newStatus,
        actorUserId: session.user.id,
        assignedToUserId: input.assignedToUserId,
        resultingAppraisalId: input.resultingAppraisalId,
        declineReason: input.declineReason,
        cancelReason: input.cancelReason,
      });

      await loadData();
      return updated;
    },
    [session, activeOrganization?.id, activePermissions, loadData]
  );

  const addRequestDocument = useCallback(
    async (
      requestId: AppraisalRequestId,
      document: AppraisalDocumentReference
    ): Promise<AppraisalRequest> => {
      if (!session?.user?.id || !activeOrganization?.id) {
        throw new Error('Sessão ou organização ativa não disponível.');
      }

      const gateway = getAppraisalRequestGateway();
      const current = await gateway.getRequestById(activeOrganization.id, requestId);
      if (!current) {
        throw new Error('Solicitação de laudo não encontrada.');
      }

      const accessCheck = evaluateAppraisalAccess({
        operation: 'add_request_document',
        actorUserId: session.user.id,
        actorRole: session.organizationRole,
        actorPermissions: Array.from(activePermissions),
        activeOrganizationId: activeOrganization.id,
        targetOrganizationId: current.organizationId,
        isMembershipActive: session.organizationRole !== 'none',
        requestEntity: current,
      });

      if (!accessCheck.granted) {
        throw new Error(accessCheck.reason);
      }

      const sensitivePattern = /(password|token|secret|bearer|authorization)/i;
      const docName = document.displayName || '';
      const docChecksum = document.checksum || '';
      if (sensitivePattern.test(docName) || sensitivePattern.test(docChecksum)) {
        throw new Error('Referência documental rejeitada: dados sensíveis detectados.');
      }

      const updated = await gateway.addDocumentReference({
        organizationId: activeOrganization.id,
        requestId,
        document,
      });

      await loadData();
      return updated;
    },
    [session, activeOrganization?.id, activePermissions, loadData]
  );

  /* -------------------------------------------------------------------------- */
  /*                  DOSSIÊ TÉCNICO, AMOSTRAS, CÁLCULOS E NORMAS               */
  /* -------------------------------------------------------------------------- */

  const getTechnicalDossier = useCallback(
    async (appraisalId: AppraisalId): Promise<AppraisalTechnicalDossier> => {
      if (!activeOrganization) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      const gateway = getAppraisalGateway();
      return gateway.getTechnicalDossier(activeOrganization.id, appraisalId);
    },
    [activeOrganization]
  );

  const saveTechnicalDossier = useCallback(
    async (dossier: AppraisalTechnicalDossier): Promise<AppraisalTechnicalDossier> => {
      if (!activeOrganization) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      const gateway = getAppraisalGateway();
      return gateway.saveTechnicalDossier(activeOrganization.id, dossier);
    },
    [activeOrganization]
  );

  const listMarketSamples = useCallback(
    async (appraisalId: AppraisalId): Promise<readonly AppraisalMarketSample[]> => {
      if (!activeOrganization) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      const gateway = getAppraisalGateway();
      return gateway.listMarketSamples(activeOrganization.id, appraisalId);
    },
    [activeOrganization]
  );

  const saveMarketSample = useCallback(
    async (sample: AppraisalMarketSample): Promise<AppraisalMarketSample> => {
      if (!activeOrganization) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      const gateway = getAppraisalGateway();
      return gateway.saveMarketSample(activeOrganization.id, sample);
    },
    [activeOrganization]
  );

  const deleteMarketSample = useCallback(
    async (appraisalId: AppraisalId, sampleId: string): Promise<void> => {
      if (!activeOrganization) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      const gateway = getAppraisalGateway();
      return gateway.deleteMarketSample(activeOrganization.id, appraisalId, sampleId);
    },
    [activeOrganization]
  );

  const getCalculationSection = useCallback(
    async (appraisalId: AppraisalId): Promise<AppraisalCalculationSection> => {
      if (!activeOrganization) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      const gateway = getAppraisalGateway();
      return gateway.getCalculationSection(activeOrganization.id, appraisalId);
    },
    [activeOrganization]
  );

  const saveCalculationSection = useCallback(
    async (
      appraisalId: AppraisalId,
      calculation: AppraisalCalculationSection
    ): Promise<AppraisalCalculationSection> => {
      if (!activeOrganization) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      const gateway = getAppraisalGateway();
      return gateway.saveCalculationSection(activeOrganization.id, appraisalId, calculation);
    },
    [activeOrganization]
  );

  const getNormativeSection = useCallback(
    async (appraisalId: AppraisalId): Promise<AppraisalNormativeSection> => {
      if (!activeOrganization) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      const gateway = getAppraisalGateway();
      return gateway.getNormativeSection(activeOrganization.id, appraisalId);
    },
    [activeOrganization]
  );

  const saveNormativeSection = useCallback(
    async (
      appraisalId: AppraisalId,
      normative: AppraisalNormativeSection
    ): Promise<AppraisalNormativeSection> => {
      if (!activeOrganization) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      const gateway = getAppraisalGateway();
      return gateway.saveNormativeSection(activeOrganization.id, appraisalId, normative);
    },
    [activeOrganization]
  );

  const listIssuedVersions = useCallback(
    async (appraisalId: AppraisalId): Promise<readonly AppraisalIssuedVersion[]> => {
      if (!activeOrganization) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      const gateway = getAppraisalGateway();
      return gateway.listIssuedVersions(activeOrganization.id, appraisalId);
    },
    [activeOrganization]
  );

  const saveIssuedVersion = useCallback(
    async (version: AppraisalIssuedVersion): Promise<AppraisalIssuedVersion> => {
      if (!activeOrganization) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      const gateway = getAppraisalGateway();
      return gateway.saveIssuedVersion(activeOrganization.id, version);
    },
    [activeOrganization]
  );

  const issueAppraisalVersion = useCallback(
    async (appraisalId: AppraisalId): Promise<AppraisalIssuedVersion> => {
      if (!activeOrganization?.id) {
        throw new Error('Nenhuma organização ativa selecionada.');
      }
      if (!session?.user?.id) {
        throw new Error('Usuário não autenticado.');
      }

      const result = await appraisalIssuanceService.issueVersion({
        appraisalId,
        activeOrganizationId: activeOrganization.id,
        actor: {
          userId: session.user.id,
          userName: session.user.name || 'Usuário Responsável',
          organizationRole: session.organizationRole,
          permissions: Array.from(activePermissions),
        },
      });

      // Atualiza listagem de laudos em memória
      setAppraisals((prev) =>
        prev.map((a) =>
          a.id === appraisalId ? { ...a, status: 'issued' as const } : a
        )
      );

      return result.issuedVersion;
    },
    [activeOrganization?.id, session?.user?.id, session?.user?.name, session?.organizationRole, activePermissions]
  );

  const value: AppraisalsContextValue = {
    appraisals,
    requests,
    appraisalsPagination,
    requestsPagination,
    appraisalsFilters,
    requestsFilters,
    status,
    error,
    setAppraisalsFilters,
    setRequestsFilters,
    setAppraisalsPage,
    setRequestsPage,
    refreshAppraisals,
    refreshRequests,
    getAppraisalById,
    getRequestById,
    createAppraisal,
    startDirectAppraisal,
    updateAppraisalStatus,
    createRequest,
    assignAppraisalRequest,
    convertRequestToAppraisal,
    getAppraisalCapturerProjection,
    updateRequestStatus,
    addRequestDocument,
    getTechnicalDossier,
    saveTechnicalDossier,
    listMarketSamples,
    saveMarketSample,
    deleteMarketSample,
    getCalculationSection,
    saveCalculationSection,
    getNormativeSection,
    saveNormativeSection,
    listIssuedVersions,
    saveIssuedVersion,
    issueAppraisalVersion,
  };

  return (
    <AppraisalsContext.Provider value={value}>
      {children}
    </AppraisalsContext.Provider>
  );
}
