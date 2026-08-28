import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  CreateProposalInput,
  Proposal,
  ProposalCategory,
  ProposalFilterOptions,
  ProposalId,
  ProposalStatus,
  ProposalType,
  UpdateProposalInput,
} from '../types/proposals';
import {
  ProposalApplicationService,
  ProposalAppContext,
} from './proposalApplicationService';
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import { useAuthorization } from '../authorization/useAuthorization';
import { getClientGateway } from '../clients/gatewayFactory';
import { getPropertyGateway } from '../properties/gatewayFactory';
import { getClientCapturerAssignmentGateway } from '../clients/capturerAssignmentGatewayFactory';
import { getOrganizationMembersGateway } from '../auth/organizationMembersGatewayFactory';

export interface MutationResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

export interface ProposalsContextValue {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly proposals: readonly Proposal[];
  readonly totalCount: number;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly filters: ProposalFilterOptions;
  readonly setSearch: (term: string) => void;
  readonly setStatusFilter: (status?: ProposalStatus) => void;
  readonly setTypeFilter: (type?: ProposalType) => void;
  readonly setCategoryFilter: (category?: ProposalCategory) => void;
  readonly setPage: (page: number) => void;
  readonly clearFilters: () => void;
  readonly refresh: () => Promise<void>;
  readonly getProposalById: (proposalId: ProposalId) => Promise<Proposal | null>;
  readonly createProposal: (input: CreateProposalInput) => Promise<MutationResult<Proposal>>;
  readonly updateProposal: (
    proposalId: ProposalId,
    input: UpdateProposalInput
  ) => Promise<MutationResult<Proposal>>;
  readonly submitProposal: (proposalId: ProposalId) => Promise<MutationResult<Proposal>>;
  readonly cancelProposal: (proposalId: ProposalId, reason?: string) => Promise<MutationResult<Proposal>>;
}

const ProposalsContext = createContext<ProposalsContextValue | null>(null);

export interface ProposalsProviderProps {
  readonly children: ReactNode;
}

export const ProposalsProvider: React.FC<ProposalsProviderProps> = ({ children }) => {
  const { session } = useAuth();
  const { activeOrganization, activeMembership } = useOrganization();
  const { can, activePermissions } = useAuthorization();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProposalFilterOptions>({});

  const canView = can('proposals:view');
  const canCreate = can('proposals:create');
  const canEdit = can('proposals:edit');

  const orgId = activeOrganization?.id;
  const userId = session?.user?.id;

  const proposalAppService = useMemo(() => new ProposalApplicationService(), []);

  const appContext = useMemo<ProposalAppContext | null>(() => {
    // Negação estrita se não houver organização, usuário ou vínculo ativo canônico
    if (
      !orgId ||
      !userId ||
      !session?.user ||
      !activeMembership ||
      activeMembership.status !== 'active' ||
      !activeMembership.organizationRole
    ) {
      return null;
    }

    return {
      organizationId: orgId,
      actor: {
        userId,
        role: activeMembership.organizationRole,
        isActive: activeMembership.status === 'active',
        permissions: Array.from(activePermissions),
      },
      clientResolver: (clientId: string) =>
        getClientGateway().getClientById(orgId, clientId),
      propertyResolver: (propertyId: string) =>
        getPropertyGateway().getPropertyById(orgId, propertyId),
      assignmentGateway: getClientCapturerAssignmentGateway(),
      memberResolver: (memberUserId: string) =>
        getOrganizationMembersGateway().getMemberByUserId(orgId, memberUserId),
    };
  }, [orgId, userId, session, activeMembership, activePermissions]);

  const loadProposals = useCallback(async () => {
    if (!appContext || !canView) {
      setProposals([]);
      setTotalCount(0);
      setStatus('idle');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    const controller = new AbortController();

    try {
      const result = await proposalAppService.listProposals(filters, appContext, controller.signal);
      setProposals(Array.from(result.items));
      setTotalCount(result.total);
      setStatus('ready');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Falha ao carregar propostas.';
      setErrorMessage(msg);
      setStatus('error');
    }
  }, [appContext, canView, filters, proposalAppService]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  const setSearch = useCallback((term: string) => {
    setFilters((prev) => ({ ...prev, search: term, page: 1 }));
  }, []);

  const setStatusFilter = useCallback((st?: ProposalStatus) => {
    setFilters((prev) => ({ ...prev, status: st, page: 1 }));
  }, []);

  const setTypeFilter = useCallback((t?: ProposalType) => {
    setFilters((prev) => ({ ...prev, type: t, page: 1 }));
  }, []);

  const setCategoryFilter = useCallback((cat?: ProposalCategory) => {
    setFilters((prev) => ({ ...prev, category: cat, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  const getProposalById = useCallback(
    async (proposalId: ProposalId): Promise<Proposal | null> => {
      if (!appContext || !canView) return null;
      try {
        return await proposalAppService.getProposalById(proposalId, appContext);
      } catch {
        return null;
      }
    },
    [appContext, canView, proposalAppService]
  );

  const createProposal = useCallback(
    async (input: CreateProposalInput): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }
      if (!canCreate) {
        return { success: false, error: 'Acesso negado: sem permissão para cadastrar propostas.' };
      }

      try {
        const created = await proposalAppService.createProposal(input, appContext);
        await loadProposals();
        return { success: true, data: created };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao cadastrar proposta.';
        return { success: false, error: msg };
      }
    },
    [appContext, canCreate, loadProposals, proposalAppService]
  );

  const updateProposal = useCallback(
    async (
      proposalId: ProposalId,
      input: UpdateProposalInput
    ): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }
      if (!canEdit) {
        return { success: false, error: 'Acesso negado: sem permissão para editar propostas.' };
      }

      try {
        const updated = await proposalAppService.updateProposal(proposalId, input, appContext);
        await loadProposals();
        return { success: true, data: updated };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao atualizar proposta.';
        return { success: false, error: msg };
      }
    },
    [appContext, canEdit, loadProposals, proposalAppService]
  );

  const submitProposal = useCallback(
    async (proposalId: ProposalId): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }
      if (!canEdit) {
        return { success: false, error: 'Acesso negado: sem permissão para submeter propostas.' };
      }

      try {
        const submitted = await proposalAppService.submitProposal(proposalId, appContext);
        await loadProposals();
        return { success: true, data: submitted };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao submeter proposta.';
        return { success: false, error: msg };
      }
    },
    [appContext, canEdit, loadProposals, proposalAppService]
  );

  const cancelProposal = useCallback(
    async (proposalId: ProposalId, reason?: string): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }
      if (!canEdit) {
        return { success: false, error: 'Acesso negado: sem permissão para cancelar propostas.' };
      }

      try {
        const cancelled = await proposalAppService.cancelProposal(proposalId, appContext, reason);
        await loadProposals();
        return { success: true, data: cancelled };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao cancelar proposta.';
        return { success: false, error: msg };
      }
    },
    [appContext, canEdit, loadProposals, proposalAppService]
  );

  const contextValue = useMemo<ProposalsContextValue>(
    () => ({
      status,
      proposals,
      totalCount,
      isLoading: status === 'loading',
      errorMessage,
      filters,
      setSearch,
      setStatusFilter,
      setTypeFilter,
      setCategoryFilter,
      setPage,
      clearFilters,
      refresh: loadProposals,
      getProposalById,
      createProposal,
      updateProposal,
      submitProposal,
      cancelProposal,
    }),
    [
      status,
      proposals,
      totalCount,
      errorMessage,
      filters,
      setSearch,
      setStatusFilter,
      setTypeFilter,
      setCategoryFilter,
      setPage,
      clearFilters,
      loadProposals,
      getProposalById,
      createProposal,
      updateProposal,
      submitProposal,
      cancelProposal,
    ]
  );

  return (
    <ProposalsContext.Provider value={contextValue}>{children}</ProposalsContext.Provider>
  );
};

export function useProposals(): ProposalsContextValue {
  const ctx = useContext(ProposalsContext);
  if (!ctx) {
    throw new Error('useProposals deve ser utilizado dentro de um ProposalsProvider.');
  }
  return ctx;
}
