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
  PresentProposalCommand,
  Proposal,
  ProposalCategory,
  ProposalCommercialDocument,
  ProposalFilterOptions,
  ProposalId,
  ProposalReviewAssignment,
  ProposalStatusHistoryEntry,
  ProposalStatus,
  ProposalType,
  ProposalVersionSnapshot,
  RecordProposalDecisionCommand,
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
  readonly assignProposalReviewer: (
    proposalId: ProposalId,
    reviewerUserId: string,
    reasonIfReassignment?: string
  ) => Promise<MutationResult<Proposal>>;
  readonly startProposalReview: (proposalId: ProposalId) => Promise<MutationResult<Proposal>>;
  readonly requestProposalChanges: (
    proposalId: ProposalId,
    reasons: string
  ) => Promise<MutationResult<Proposal>>;
  readonly approveProposal: (
    proposalId: ProposalId,
    notes?: string
  ) => Promise<MutationResult<Proposal>>;
  readonly rejectProposal: (
    proposalId: ProposalId,
    reason: string
  ) => Promise<MutationResult<Proposal>>;
  readonly markProposalPresented: (
    proposalId: ProposalId,
    input: Pick<PresentProposalCommand, 'channel' | 'notes' | 'documentId'>
  ) => Promise<MutationResult<Proposal>>;
  readonly issueProposalDocument: (
    proposalId: ProposalId
  ) => Promise<MutationResult<ProposalCommercialDocument>>;
  readonly recordProposalDecision: (
    proposalId: ProposalId,
    input: Pick<RecordProposalDecisionCommand, 'decision' | 'channel' | 'operationalReference' | 'notes'>
  ) => Promise<MutationResult<Proposal>>;
  readonly cancelProposal: (proposalId: ProposalId, reason?: string) => Promise<MutationResult<Proposal>>;
  readonly getProposalHistory: (proposalId: ProposalId) => Promise<readonly ProposalStatusHistoryEntry[]>;
  readonly getProposalSnapshots: (proposalId: ProposalId) => Promise<readonly ProposalVersionSnapshot[]>;
  readonly getProposalReviewAssignments: (proposalId: ProposalId) => Promise<readonly ProposalReviewAssignment[]>;
  readonly getProposalDocuments: (proposalId: ProposalId) => Promise<readonly ProposalCommercialDocument[]>;
  readonly getProposalDocumentById: (
    proposalId: ProposalId,
    documentId: string
  ) => Promise<ProposalCommercialDocument | null>;
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

  const canView = can('proposals:view') || can('proposals:view_related') || can('proposals:view_assigned');
  const canCreate = can('proposals:create');
  const canEditDraft = can('proposals:edit_draft');

  const orgId = activeOrganization?.id;
  const userId = session?.user?.id;

  const proposalAppService = useMemo(() => new ProposalApplicationService(), []);

  const mutationKey = useCallback((operation: string, proposalId: string, version: number): string => {
    if (!globalThis.crypto?.randomUUID) {
      throw new Error('Gerador seguro de operação indisponível.');
    }
    return `${operation}:${proposalId}:${version}:${globalThis.crypto.randomUUID()}`;
  }, []);

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
      if (!canEditDraft) {
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
    [appContext, canEditDraft, loadProposals, proposalAppService]
  );

  const submitProposal = useCallback(
    async (proposalId: ProposalId): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }
      if (!can('proposals:submit')) {
        return { success: false, error: 'Acesso negado: sem permissão para submeter propostas.' };
      }

      try {
        const current = await proposalAppService.getProposalById(proposalId, appContext);
        if (!current) return { success: false, error: 'Proposta não encontrada.' };
        const submitted = await proposalAppService.submitProposal({
          proposalId,
          expectedVersion: current.version,
          idempotencyKey: mutationKey('submit', proposalId, current.version),
        }, appContext);
        await loadProposals();
        return { success: true, data: submitted };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao submeter proposta.';
        return { success: false, error: msg };
      }
    },
    [appContext, can, loadProposals, mutationKey, proposalAppService]
  );

  const assignProposalReviewer = useCallback(
    async (
      proposalId: ProposalId,
      reviewerUserId: string,
      reasonIfReassignment?: string
    ): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }

      try {
        const current = await proposalAppService.getProposalById(proposalId, appContext);
        if (!current) return { success: false, error: 'Proposta não encontrada.' };
        const assigned = await proposalAppService.assignProposalReviewer({
          proposalId,
          reviewerUserId,
          reassignmentReason: reasonIfReassignment,
          expectedVersion: current.version,
          idempotencyKey: mutationKey('assign-review', proposalId, current.version),
        }, appContext);
        await loadProposals();
        return { success: true, data: assigned };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao atribuir revisor.';
        return { success: false, error: msg };
      }
    },
    [appContext, loadProposals, mutationKey, proposalAppService]
  );

  const startProposalReview = useCallback(
    async (proposalId: ProposalId): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }

      try {
        const current = await proposalAppService.getProposalById(proposalId, appContext);
        if (!current) return { success: false, error: 'Proposta não encontrada.' };
        const started = await proposalAppService.startProposalReview({
          proposalId,
          expectedVersion: current.version,
          idempotencyKey: mutationKey('start-review', proposalId, current.version),
        }, appContext);
        await loadProposals();
        return { success: true, data: started };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao iniciar revisão.';
        return { success: false, error: msg };
      }
    },
    [appContext, loadProposals, mutationKey, proposalAppService]
  );

  const requestProposalChanges = useCallback(
    async (proposalId: ProposalId, reasons: string): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }

      try {
        const current = await proposalAppService.getProposalById(proposalId, appContext);
        if (!current) return { success: false, error: 'Proposta não encontrada.' };
        const req = await proposalAppService.requestProposalChanges({
          proposalId,
          reasons,
          expectedVersion: current.version,
          idempotencyKey: mutationKey('request-changes', proposalId, current.version),
        }, appContext);
        await loadProposals();
        return { success: true, data: req };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao solicitar ajustes.';
        return { success: false, error: msg };
      }
    },
    [appContext, loadProposals, mutationKey, proposalAppService]
  );

  const approveProposal = useCallback(
    async (proposalId: ProposalId, notes?: string): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }

      try {
        const current = await proposalAppService.getProposalById(proposalId, appContext);
        if (!current) return { success: false, error: 'Proposta não encontrada.' };
        const approved = await proposalAppService.approveProposal({
          proposalId,
          notes,
          expectedVersion: current.version,
          idempotencyKey: mutationKey('approve', proposalId, current.version),
        }, appContext);
        await loadProposals();
        return { success: true, data: approved };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao aprovar proposta.';
        return { success: false, error: msg };
      }
    },
    [appContext, loadProposals, mutationKey, proposalAppService]
  );

  const rejectProposal = useCallback(
    async (proposalId: ProposalId, reason: string): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }

      try {
        const current = await proposalAppService.getProposalById(proposalId, appContext);
        if (!current) return { success: false, error: 'Proposta não encontrada.' };
        const rejected = await proposalAppService.rejectProposal({
          proposalId,
          reason,
          expectedVersion: current.version,
          idempotencyKey: mutationKey('reject', proposalId, current.version),
        }, appContext);
        await loadProposals();
        return { success: true, data: rejected };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao rejeitar proposta.';
        return { success: false, error: msg };
      }
    },
    [appContext, loadProposals, mutationKey, proposalAppService]
  );

  const markProposalPresented = useCallback(
    async (
      proposalId: ProposalId,
      input: Pick<PresentProposalCommand, 'channel' | 'notes' | 'documentId'>
    ): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }

      try {
        const current = await proposalAppService.getProposalById(proposalId, appContext);
        if (!current) return { success: false, error: 'Proposta não encontrada.' };
        const presented = await proposalAppService.markProposalPresented({
          proposalId,
          ...input,
          expectedVersion: current.version,
          idempotencyKey: mutationKey('present', proposalId, current.version),
        }, appContext);
        await loadProposals();
        return { success: true, data: presented };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao registrar apresentação.';
        return { success: false, error: msg };
      }
    },
    [appContext, loadProposals, mutationKey, proposalAppService]
  );

  const issueProposalDocument = useCallback(
    async (proposalId: ProposalId): Promise<MutationResult<ProposalCommercialDocument>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }
      try {
        const current = await proposalAppService.getProposalById(proposalId, appContext);
        if (!current) return { success: false, error: 'Proposta não encontrada.' };
        const document = await proposalAppService.issueProposalDocument({
          proposalId,
          expectedVersion: current.version,
          idempotencyKey: mutationKey('issue-document', proposalId, current.version),
        }, appContext);
        return { success: true, data: document };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao emitir documento comercial.';
        return { success: false, error: msg };
      }
    },
    [appContext, mutationKey, proposalAppService]
  );

  const recordProposalDecision = useCallback(
    async (
      proposalId: ProposalId,
      input: Pick<RecordProposalDecisionCommand, 'decision' | 'channel' | 'operationalReference' | 'notes'>
    ): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }

      try {
        const current = await proposalAppService.getProposalById(proposalId, appContext);
        if (!current) return { success: false, error: 'Proposta não encontrada.' };
        const decided = await proposalAppService.recordProposalDecision({
          proposalId,
          ...input,
          expectedVersion: current.version,
          idempotencyKey: mutationKey('decision', proposalId, current.version),
        }, appContext);
        await loadProposals();
        return { success: true, data: decided };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao registrar decisão.';
        return { success: false, error: msg };
      }
    },
    [appContext, loadProposals, mutationKey, proposalAppService]
  );

  const cancelProposal = useCallback(
    async (proposalId: ProposalId, reason?: string): Promise<MutationResult<Proposal>> => {
      if (!appContext) {
        return { success: false, error: 'Vínculo inativo ou ausente na organização ativa.' };
      }

      try {
        const current = await proposalAppService.getProposalById(proposalId, appContext);
        if (!current) return { success: false, error: 'Proposta não encontrada.' };
        const cancelled = await proposalAppService.cancelProposal({
          proposalId,
          reason,
          expectedVersion: current.version,
          idempotencyKey: mutationKey('cancel', proposalId, current.version),
        }, appContext);
        await loadProposals();
        return { success: true, data: cancelled };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao cancelar proposta.';
        return { success: false, error: msg };
      }
    },
    [appContext, loadProposals, mutationKey, proposalAppService]
  );

  const getProposalHistory = useCallback(
    async (proposalId: ProposalId): Promise<readonly ProposalStatusHistoryEntry[]> => {
      if (!appContext) return [];
      try {
        return await proposalAppService.getProposalHistory(proposalId, appContext);
      } catch {
        return [];
      }
    },
    [appContext, proposalAppService]
  );

  const getProposalSnapshots = useCallback(
    async (proposalId: ProposalId): Promise<readonly ProposalVersionSnapshot[]> => {
      if (!appContext) return [];
      try {
        return await proposalAppService.getProposalSnapshots(proposalId, appContext);
      } catch {
        return [];
      }
    },
    [appContext, proposalAppService]
  );

  const getProposalReviewAssignments = useCallback(
    async (proposalId: ProposalId): Promise<readonly ProposalReviewAssignment[]> => {
      if (!appContext) return [];
      try {
        return await proposalAppService.getProposalReviewAssignments(proposalId, appContext);
      } catch {
        return [];
      }
    },
    [appContext, proposalAppService]
  );

  const getProposalDocuments = useCallback(
    async (proposalId: ProposalId): Promise<readonly ProposalCommercialDocument[]> => {
      if (!appContext) return [];
      try {
        return await proposalAppService.getProposalDocuments(proposalId, appContext);
      } catch {
        return [];
      }
    },
    [appContext, proposalAppService]
  );

  const getProposalDocumentById = useCallback(
    async (proposalId: ProposalId, documentId: string): Promise<ProposalCommercialDocument | null> => {
      if (!appContext) return null;
      try {
        return await proposalAppService.getProposalDocumentById(proposalId, documentId, appContext);
      } catch {
        return null;
      }
    },
    [appContext, proposalAppService]
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
      assignProposalReviewer,
      startProposalReview,
      requestProposalChanges,
      approveProposal,
      rejectProposal,
      markProposalPresented,
      issueProposalDocument,
      recordProposalDecision,
      cancelProposal,
      getProposalHistory,
      getProposalSnapshots,
      getProposalReviewAssignments,
      getProposalDocuments,
      getProposalDocumentById,
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
      assignProposalReviewer,
      startProposalReview,
      requestProposalChanges,
      approveProposal,
      rejectProposal,
      markProposalPresented,
      issueProposalDocument,
      recordProposalDecision,
      cancelProposal,
      getProposalHistory,
      getProposalSnapshots,
      getProposalReviewAssignments,
      getProposalDocuments,
      getProposalDocumentById,
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
