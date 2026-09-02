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
} from '../types/technicalVisit';
import { getTechnicalVisitGateway } from './gatewayFactory';
import { TechnicalVisitService } from './technicalVisitService';

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
  const [filters, setFiltersState] = useState<TechnicalVisitListFilters>(EMPTY_FILTERS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const organizationRef = useRef<string | null>(null);

  const organizationId = activeOrganization?.id ?? null;
  const userId = session?.user?.id ?? null;
  const canView = can('surveys_and_visits:view');

  const service = useMemo(
    () => new TechnicalVisitService(getTechnicalVisitGateway()),
    []
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
      setMembers(
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
    }),
    [
      clearFilters,
      createVisit,
      errorMessage,
      filters,
      getAudit,
      getVisitById,
      members,
      refresh,
      setFilters,
      status,
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
