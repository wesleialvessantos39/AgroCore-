import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { OrganizationMember } from '../auth/organizationMembersGateway';
import { getOrganizationMembersGateway } from '../auth/organizationMembersGatewayFactory';
import { useAuth } from '../auth/useAuth';
import { useAuthorization } from '../authorization/useAuthorization';
import { getRolePermissions } from '../authorization/permissionsMatrix';
import { useClients } from '../clients/useClients';
import { useOrganization } from '../organization/useOrganization';
import { useProperties } from '../properties/useProperties';
import { useProposals } from '../proposals/useProposals';
import { useAppraisals } from '../appraisals/useAppraisals';
import {
  TechnicalVisitDomainError,
  type CreateTechnicalVisitInput,
  type TechnicalVisit,
  type TechnicalVisitApplicationContext,
  type TechnicalVisitAuditEntry,
  type TechnicalVisitListFilters,
  type TransitionTechnicalVisitInput,
  type UpdateTechnicalVisitInput,
  type UpdateTechnicalVisitPreparationInput,
  type SetTechnicalVisitChecklistItemCompletionInput,
} from '../types/technicalVisit';
import type {
  TechnicalVisitFieldForm,
  TechnicalVisitFieldFormRevision,
  TechnicalVisitFieldSection,
} from '../types/technicalVisitFieldForm';
import type {
  CompleteTechnicalVisitInput,
  ReviseTechnicalVisitReportInput,
  TechnicalVisitReport,
} from '../types/technicalVisitReport';
import type { TechnicalVisitIntegrationSnapshot } from '../types/technicalVisitIntegration';
import { getTechnicalVisitGateway } from './gatewayFactory';
import { TechnicalVisitService } from './technicalVisitService';
import { TechnicalVisitPreparationService } from './preparationService';
import { getTechnicalVisitFieldFormGateway } from './fieldFormGatewayFactory';
import { TechnicalVisitFieldFormService } from './fieldFormService';

export type FieldVisitsContextStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'unavailable'
  | 'error';

export interface FieldVisitsContextValue {
  readonly status: FieldVisitsContextStatus;
  readonly visits: readonly TechnicalVisit[];
  readonly members: readonly OrganizationMember[];
  readonly responsibleMembers: readonly OrganizationMember[];
  readonly filters: TechnicalVisitListFilters;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly setFilters: (filters: Partial<TechnicalVisitListFilters>) => void;
  readonly clearFilters: () => void;
  readonly refresh: () => Promise<void>;
  readonly getVisitById: (visitId: string) => Promise<TechnicalVisit | null>;
  readonly getAudit: (visitId: string) => Promise<readonly TechnicalVisitAuditEntry[]>;
  readonly createVisit: (input: CreateTechnicalVisitInput) => Promise<TechnicalVisit>;
  readonly updateVisit: (
    visitId: string,
    input: UpdateTechnicalVisitInput
  ) => Promise<TechnicalVisit>;
  readonly transitionVisit: (
    visitId: string,
    input: TransitionTechnicalVisitInput
  ) => Promise<TechnicalVisit>;
  readonly prepareVisit: (
    visitId: string,
    input: UpdateTechnicalVisitPreparationInput
  ) => Promise<TechnicalVisit>;
  readonly setChecklistItemCompletion: (
    visitId: string,
    input: SetTechnicalVisitChecklistItemCompletionInput
  ) => Promise<TechnicalVisit>;
  readonly getFieldForm: (
    visitId: string
  ) => Promise<TechnicalVisitFieldForm | null>;
  readonly saveFieldFormDraft: (
    visitId: string,
    sections: readonly TechnicalVisitFieldSection[],
    expectedVersion: number
  ) => Promise<TechnicalVisitFieldForm>;
  readonly submitFieldForm: (
    visitId: string,
    sections: readonly TechnicalVisitFieldSection[],
    expectedVersion: number
  ) => Promise<TechnicalVisitFieldForm>;
  readonly getFieldFormRevisions: (
    visitId: string
  ) => Promise<readonly TechnicalVisitFieldFormRevision[]>;
  readonly completeVisit: (
    visitId: string,
    input: CompleteTechnicalVisitInput
  ) => Promise<import('../types/technicalVisit').TechnicalVisitCompletionResult>;
  readonly getLatestReport: (
    visitId: string
  ) => Promise<TechnicalVisitReport | null>;
  readonly getReportVersions: (
    visitId: string
  ) => Promise<readonly TechnicalVisitReport[]>;
  readonly reviseReport: (
    visitId: string,
    input: ReviseTechnicalVisitReportInput
  ) => Promise<TechnicalVisitReport>;
  readonly getIntegrationSnapshot: (
    visitId: string
  ) => Promise<TechnicalVisitIntegrationSnapshot>;
}

export const FieldVisitsContext = createContext<FieldVisitsContextValue | null>(null);

const EMPTY_FILTERS: TechnicalVisitListFilters = {
  status: 'all',
};

export function FieldVisitsProvider({ children }: { readonly children: ReactNode }) {
  const { status: authStatus, session } = useAuth();
  const { status: organizationStatus, activeOrganization, activeMembership } = useOrganization();
  const { can, activePermissions } = useAuthorization();
  const clients = useClients();
  const properties = useProperties();
  const proposals = useProposals();
  const appraisals = useAppraisals();

  const [status, setStatus] = useState<FieldVisitsContextStatus>('idle');
  const [visits, setVisits] = useState<readonly TechnicalVisit[]>([]);
  const [members, setMembers] = useState<readonly OrganizationMember[]>([]);
  const [responsibleMembers, setResponsibleMembers] = useState<readonly OrganizationMember[]>([]);
  const [filters, setFiltersState] = useState<TechnicalVisitListFilters>(EMPTY_FILTERS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const organizationRef = useRef<string | null>(null);

  const organizationId = activeOrganization?.id ?? null;
  const userId = session?.user?.id ?? null;
  const canView = can('surveys_and_visits:view');

  const visitGateway = useMemo(() => getTechnicalVisitGateway(), []);
  const fieldFormGateway = useMemo(
    () => getTechnicalVisitFieldFormGateway(),
    []
  );
  const service = useMemo(
    () =>
      new TechnicalVisitService(
        visitGateway,
        undefined,
        undefined,
        fieldFormGateway
      ),
    [fieldFormGateway, visitGateway]
  );
  const preparationService = useMemo(
    () => new TechnicalVisitPreparationService(visitGateway),
    [visitGateway]
  );
  const fieldFormService = useMemo(
    () => new TechnicalVisitFieldFormService(fieldFormGateway, visitGateway),
    [fieldFormGateway, visitGateway]
  );

  const applicationContext = useMemo<TechnicalVisitApplicationContext | null>(() => {
    if (
      !organizationId ||
      !userId ||
      !activeMembership ||
      activeMembership.status !== 'active' ||
      !activeMembership.organizationRole
    ) {
      return null;
    }

    return {
      organizationId,
      actor: {
        userId,
        role: activeMembership.organizationRole,
        isActive: true,
        permissions: Array.from(activePermissions),
      },
      resolveMember: async (memberUserId) => {
        const member = await getOrganizationMembersGateway().getMemberByUserId(
          organizationId,
          memberUserId
        );
        return {
          exists: Boolean(member),
          organizationId: member ? organizationId : null,
          userId: memberUserId,
          isActive: member?.isActive ?? false,
          canExecute: member
            ? getRolePermissions(member.organizationRole).includes('surveys_and_visits:execute')
            : false,
          name: member?.name,
        };
      },
      resolveClient: async (clientId) => {
        const client = await clients.getClientById(clientId);
        return {
          exists: Boolean(client),
          organizationId: client?.organizationId ?? null,
          status: client?.status ?? null,
        };
      },
      resolveProperty: async (propertyId) => {
        const property = await properties.getPropertyById(propertyId);
        return {
          exists: Boolean(property),
          organizationId: property?.organizationId ?? null,
          status: property?.status ?? null,
          clientIds: property?.clientLinks.map((link) => link.clientId) ?? [],
        };
      },
      resolveProposal: async (proposalId) => {
        const proposal = await proposals.getProposalById(proposalId);
        return {
          exists: Boolean(proposal),
          organizationId: proposal?.organizationId ?? null,
          clientId: proposal?.clientId ?? null,
          propertyId: proposal?.propertyId ?? null,
        };
      },
      resolveAppraisal: async (appraisalId) => {
        const appraisal = await appraisals.getAppraisalById(appraisalId);
        return {
          exists: Boolean(appraisal),
          organizationId: appraisal?.organizationId ?? null,
          clientId: appraisal?.clientId ?? null,
          propertyId: appraisal?.propertyId ?? null,
        };
      },
    };
  }, [
    activeMembership,
    activePermissions,
    appraisals,
    clients,
    organizationId,
    properties,
    proposals,
    userId,
  ]);

  const reset = useCallback(() => {
    sequenceRef.current += 1;
    organizationRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setVisits([]);
    setMembers([]);
    setResponsibleMembers([]);
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  const refresh = useCallback(async () => {
    if (!applicationContext || !canView || !organizationId) {
      reset();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++sequenceRef.current;
    organizationRef.current = organizationId;
    setStatus('loading');
    setErrorMessage(null);

    try {
      const [nextVisits, nextMembers] = await Promise.all([
        service.listVisits(applicationContext, filters, controller.signal),
        getOrganizationMembersGateway().listMembers(organizationId, controller.signal),
      ]);

      if (
        controller.signal.aborted ||
        requestId !== sequenceRef.current ||
        organizationRef.current !== organizationId
      ) {
        return;
      }

      setVisits(nextVisits);
      setMembers(nextMembers.filter((member) => member.isActive));
      setResponsibleMembers(
        nextMembers.filter(
          (member) =>
            member.isActive &&
            getRolePermissions(member.organizationRole).includes('surveys_and_visits:execute')
        )
      );
      setStatus(nextVisits.length === 0 ? 'empty' : 'ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (
        requestId !== sequenceRef.current ||
        organizationRef.current !== organizationId
      ) {
        return;
      }

      setVisits([]);
      setMembers([]);
      setResponsibleMembers([]);
      const unavailable =
        error instanceof TechnicalVisitDomainError &&
        error.code === 'SERVICE_UNAVAILABLE';
      setErrorMessage(
        unavailable
          ? 'O serviço de visitas e vistorias está indisponível neste ambiente.'
          : 'Não foi possível carregar as visitas e vistorias no momento.'
      );
      setStatus(unavailable ? 'unavailable' : 'error');
    }
  }, [applicationContext, canView, filters, organizationId, reset, service]);

  useEffect(() => {
    if (
      authStatus !== 'authenticated' ||
      organizationStatus !== 'active' ||
      !applicationContext ||
      !canView
    ) {
      reset();
      return;
    }

    void refresh();

    return () => {
      abortRef.current?.abort();
    };
  }, [
    applicationContext,
    authStatus,
    canView,
    organizationStatus,
    refresh,
    reset,
  ]);

  const ensureContext = useCallback((): TechnicalVisitApplicationContext => {
    if (!applicationContext) {
      throw new TechnicalVisitDomainError(
        'ORGANIZATION_REQUIRED',
        'É necessário possuir vínculo ativo com uma organização.'
      );
    }
    return applicationContext;
  }, [applicationContext]);

  const createVisit = useCallback(
    async (input: CreateTechnicalVisitInput) => {
      const created = await service.createVisit(ensureContext(), input);
      await refresh();
      return created;
    },
    [ensureContext, refresh, service]
  );

  const updateVisit = useCallback(
    async (visitId: string, input: UpdateTechnicalVisitInput) => {
      const updated = await service.updateVisit(ensureContext(), visitId, input);
      await refresh();
      return updated;
    },
    [ensureContext, refresh, service]
  );

  const transitionVisit = useCallback(
    async (visitId: string, input: TransitionTechnicalVisitInput) => {
      const updated = await service.transitionVisit(ensureContext(), visitId, input);
      await refresh();
      return updated;
    },
    [ensureContext, refresh, service]
  );

  const prepareVisit = useCallback(
    async (visitId: string, input: UpdateTechnicalVisitPreparationInput) => {
      const updated = await preparationService.prepareVisit(ensureContext(), visitId, input);
      await refresh();
      return updated;
    },
    [ensureContext, preparationService, refresh]
  );

  const setChecklistItemCompletion = useCallback(
    async (
      visitId: string,
      input: SetTechnicalVisitChecklistItemCompletionInput
    ) => {
      const updated = await preparationService.setChecklistItemCompletion(
        ensureContext(),
        visitId,
        input
      );
      await refresh();
      return updated;
    },
    [ensureContext, preparationService, refresh]
  );

  const getFieldForm = useCallback(
    (visitId: string) =>
      fieldFormService.getFieldForm(ensureContext(), visitId),
    [ensureContext, fieldFormService]
  );

  const saveFieldFormDraft = useCallback(
    (
      visitId: string,
      sections: readonly TechnicalVisitFieldSection[],
      expectedVersion: number
    ) =>
      fieldFormService.saveDraft(
        ensureContext(),
        visitId,
        sections,
        expectedVersion
      ),
    [ensureContext, fieldFormService]
  );

  const submitFieldForm = useCallback(
    (
      visitId: string,
      sections: readonly TechnicalVisitFieldSection[],
      expectedVersion: number
    ) =>
      fieldFormService.submit(
        ensureContext(),
        visitId,
        sections,
        expectedVersion
      ),
    [ensureContext, fieldFormService]
  );

  const getFieldFormRevisions = useCallback(
    (visitId: string) =>
      fieldFormService.listRevisions(ensureContext(), visitId),
    [ensureContext, fieldFormService]
  );

  const completeVisit = useCallback(
    async (visitId: string, input: CompleteTechnicalVisitInput) => {
      const result = await service.completeVisit(ensureContext(), visitId, input);
      await refresh();
      return result;
    },
    [ensureContext, refresh, service]
  );

  const getLatestReport = useCallback(
    (visitId: string) => service.getLatestReport(ensureContext(), visitId),
    [ensureContext, service]
  );

  const getReportVersions = useCallback(
    (visitId: string) => service.listReportVersions(ensureContext(), visitId),
    [ensureContext, service]
  );

  const reviseReport = useCallback(
    (visitId: string, input: ReviseTechnicalVisitReportInput) =>
      service.reviseReport(ensureContext(), visitId, input),
    [ensureContext, service]
  );

  const getIntegrationSnapshot = useCallback(
    (visitId: string) =>
      service.getIntegrationSnapshot(ensureContext(), visitId),
    [ensureContext, service]
  );

  const getVisitById = useCallback(
    (visitId: string) => service.getVisitById(ensureContext(), visitId),
    [ensureContext, service]
  );

  const getAudit = useCallback(
    (visitId: string) => service.listAudit(ensureContext(), visitId),
    [ensureContext, service]
  );

  const setFilters = useCallback((next: Partial<TechnicalVisitListFilters>) => {
    setFiltersState((current) => ({ ...current, ...next }));
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState(EMPTY_FILTERS);
  }, []);

  const value = useMemo<FieldVisitsContextValue>(
    () => ({
      status,
      visits,
      members,
      responsibleMembers,
      filters,
      isLoading: status === 'loading',
      errorMessage,
      setFilters,
      clearFilters,
      refresh,
      getVisitById,
      getAudit,
      createVisit,
      updateVisit,
      transitionVisit,
      prepareVisit,
      setChecklistItemCompletion,
      getFieldForm,
      saveFieldFormDraft,
      submitFieldForm,
      getFieldFormRevisions,
      completeVisit,
      getLatestReport,
      getReportVersions,
      reviseReport,
      getIntegrationSnapshot,
    }),
    [
      clearFilters,
      completeVisit,
      createVisit,
      errorMessage,
      filters,
      getAudit,
      getFieldForm,
      getIntegrationSnapshot,
      getLatestReport,
      getReportVersions,
      getFieldFormRevisions,
      getVisitById,
      members,
      prepareVisit,
      refresh,
      responsibleMembers,
      reviseReport,
      setFilters,
      saveFieldFormDraft,
      setChecklistItemCompletion,
      status,
      submitFieldForm,
      transitionVisit,
      updateVisit,
      visits,
    ]
  );

  return (
    <FieldVisitsContext.Provider value={value}>
      {children}
    </FieldVisitsContext.Provider>
  );
}
