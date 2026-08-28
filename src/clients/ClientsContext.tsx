import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  Client,
  ClientContextStatus,
  ClientListFilters,
  ClientListPage,
  ClientListPagination,
  ClientListQuery,
  ClientMutationResult,
  ClientPersonTypeFilter,
  ClientSearchTerm,
  ClientSortOption,
  ClientStatusFilter,
  CreateClientInput,
  DEFAULT_CLIENT_LIST_QUERY_STATE,
  UpdateClientInput,
} from '../types/client';
import { getClientGateway } from './gatewayFactory';
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import { useAuthorization } from '../authorization/useAuthorization';

export interface ClientsContextValue {
  readonly status: ClientContextStatus;
  readonly clients: readonly Client[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly searchTerm: ClientSearchTerm;
  readonly personType: ClientPersonTypeFilter;
  readonly statusFilter: ClientStatusFilter;
  readonly sort: ClientSortOption;
  readonly isFiltered: boolean;
  readonly filters: ClientListFilters;
  readonly pagination: ClientListPagination;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly setSearchTerm: (term: string) => void;
  readonly setPersonTypeFilter: (type: ClientPersonTypeFilter) => void;
  readonly setStatusFilter: (status: ClientStatusFilter) => void;
  readonly setSort: (sort: ClientSortOption) => void;
  readonly setPage: (page: number) => void;
  readonly setPageSize: (pageSize: number) => void;
  readonly clearFilters: () => void;
  readonly refresh: () => Promise<void>;
  readonly reload: () => Promise<void>;
  readonly setFilters: (filters: Partial<ClientListFilters>) => void;
  readonly getClientById: (clientId: string) => Promise<Client | null>;
  readonly createClient: (input: CreateClientInput) => Promise<ClientMutationResult>;
  readonly updateClient: (clientId: string, input: UpdateClientInput) => Promise<ClientMutationResult>;
}

const ClientsContext = createContext<ClientsContextValue | null>(null);

export interface ClientsProviderProps {
  children: React.ReactNode;
}

export function ClientsProvider({ children }: ClientsProviderProps) {
  const { status: authStatus, session } = useAuth();
  const { status: orgStatus, activeOrganization } = useOrganization();
  const { can } = useAuthorization();

  const [status, setStatus] = useState<ClientContextStatus>('idle');
  const [clients, setClients] = useState<readonly Client[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [page, setPageState] = useState<number>(DEFAULT_CLIENT_LIST_QUERY_STATE.page);
  const [pageSize, setPageSizeState] = useState<number>(DEFAULT_CLIENT_LIST_QUERY_STATE.pageSize);
  const [searchTerm, setSearchTermState] = useState<ClientSearchTerm>(DEFAULT_CLIENT_LIST_QUERY_STATE.searchTerm);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<ClientSearchTerm>(DEFAULT_CLIENT_LIST_QUERY_STATE.searchTerm);
  const [personType, setPersonTypeState] = useState<ClientPersonTypeFilter>(DEFAULT_CLIENT_LIST_QUERY_STATE.personType);
  const [statusFilter, setStatusFilterState] = useState<ClientStatusFilter>(DEFAULT_CLIENT_LIST_QUERY_STATE.status);
  const [sort, setSortState] = useState<ClientSortOption>(DEFAULT_CLIENT_LIST_QUERY_STATE.sort);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Rastreamento para descarte de respostas obsoletas ou concorrência
  const requestSequenceRef = useRef<number>(0);
  const activeOrgIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeOrgId = activeOrganization?.id ?? null;
  const isSuperAdmin = session?.platformRole === 'platform_super_admin';
  const hasViewPermission = can('clients:view');
  const hasCreatePermission = can('clients:create');
  const hasEditPermission = can('clients:edit');

  const isFiltered = useMemo(() => {
    return (
      searchTerm.trim().length > 0 ||
      personType !== 'all' ||
      statusFilter !== 'all'
    );
  }, [searchTerm, personType, statusFilter]);

  // Debounce de 300ms para o termo de busca (intervalo 250ms - 350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const executeFetch = useCallback(
    async (
      targetOrgId: string,
      currentQuery: ClientListQuery
    ) => {
      // Cancela requisição anterior em andamento
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const currentRequestId = ++requestSequenceRef.current;
      setStatus('loading');
      setErrorMessage(null);

      try {
        const gateway = getClientGateway();
        const result: ClientListPage = await gateway.listClients(
          currentQuery,
          abortController.signal
        );

        // Se a organização mudou ou outra requisição mais nova foi emitida, descarta
        if (
          currentRequestId !== requestSequenceRef.current ||
          activeOrgIdRef.current !== targetOrgId
        ) {
          return;
        }

        setClients(result.items);
        setTotalCount(result.total);
        setTotalPages(result.totalPages);
        setPageState(result.page);

        if (result.total === 0) {
          setStatus(isFiltered ? 'ready' : 'empty');
        } else {
          setStatus('ready');
        }
      } catch (error) {
        // Ignora cancelamentos deliberados via AbortController
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        if (
          currentRequestId !== requestSequenceRef.current ||
          activeOrgIdRef.current !== targetOrgId
        ) {
          return;
        }

        setClients([]);
        setTotalCount(0);
        setTotalPages(1);

        const isUnavailable = error instanceof Error && error.message.includes('indisponível');
        const errorMsg = isUnavailable
          ? 'Serviço de clientes indisponível neste ambiente.'
          : 'Não foi possível carregar os clientes da organização no momento.';

        setErrorMessage(errorMsg);
        setStatus(isUnavailable ? 'unavailable' : 'error');
      }
    },
    [isFiltered]
  );

  // Efeito de isolamento organizacional, sincronização e limpeza atômica
  useEffect(() => {
    // 1. Não autenticado ou sem sessão -> limpa imediatamente
    if (authStatus !== 'authenticated' || !session) {
      activeOrgIdRef.current = null;
      requestSequenceRef.current++;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setStatus('idle');
      setClients([]);
      setTotalCount(0);
      setTotalPages(1);
      setPageState(1);
      setErrorMessage(null);
      return;
    }

    // 2. Superadministrador da plataforma não possui clientes organizacionais
    if (isSuperAdmin) {
      activeOrgIdRef.current = null;
      requestSequenceRef.current++;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setStatus('idle');
      setClients([]);
      setTotalCount(0);
      setTotalPages(1);
      setPageState(1);
      setErrorMessage(null);
      return;
    }

    // 3. Organização não ativa ou nula -> limpa e pausa consulta
    if (orgStatus !== 'active' || !activeOrgId) {
      activeOrgIdRef.current = null;
      requestSequenceRef.current++;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setStatus('idle');
      setClients([]);
      setTotalCount(0);
      setTotalPages(1);
      setPageState(1);
      setErrorMessage(null);
      return;
    }

    // 4. Sem permissão de visualização de clientes -> limpa e não consulta
    if (!hasViewPermission) {
      activeOrgIdRef.current = null;
      requestSequenceRef.current++;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setStatus('idle');
      setClients([]);
      setTotalCount(0);
      setTotalPages(1);
      setPageState(1);
      setErrorMessage(null);
      return;
    }

    // 5. Troca de organização detectada -> reseta dados para evitar exibição de dados anteriores
    if (activeOrgIdRef.current !== activeOrgId) {
      activeOrgIdRef.current = activeOrgId;
      setClients([]);
      setTotalCount(0);
      setTotalPages(1);
      setPageState(1);
      setSearchTermState('');
      setDebouncedSearchTerm('');
      setPersonTypeState('all');
      setStatusFilterState('all');
      setSortState('name_asc');
    }

    // 6. Dispara consulta segura para a organização ativa
    const query: ClientListQuery = {
      organizationId: activeOrgId,
      searchTerm: debouncedSearchTerm,
      personType,
      status: statusFilter,
      sort,
      page,
      pageSize,
    };

    executeFetch(activeOrgId, query);
  }, [
    authStatus,
    session,
    orgStatus,
    activeOrgId,
    isSuperAdmin,
    hasViewPermission,
    debouncedSearchTerm,
    personType,
    statusFilter,
    sort,
    page,
    pageSize,
    executeFetch,
  ]);

  const refresh = useCallback(async () => {
    if (!activeOrgId || !hasViewPermission || isSuperAdmin || orgStatus !== 'active') {
      return;
    }
    const query: ClientListQuery = {
      organizationId: activeOrgId,
      searchTerm: debouncedSearchTerm,
      personType,
      status: statusFilter,
      sort,
      page,
      pageSize,
    };
    await executeFetch(activeOrgId, query);
  }, [
    activeOrgId,
    hasViewPermission,
    isSuperAdmin,
    orgStatus,
    debouncedSearchTerm,
    personType,
    statusFilter,
    sort,
    page,
    pageSize,
    executeFetch,
  ]);

  const setSearchTerm = useCallback((term: string) => {
    setSearchTermState(term);
    setPageState(1);
  }, []);

  const setPersonTypeFilter = useCallback((type: ClientPersonTypeFilter) => {
    setPersonTypeState(type);
    setPageState(1);
  }, []);

  const setStatusFilter = useCallback((newStatus: ClientStatusFilter) => {
    setStatusFilterState(newStatus);
    setPageState(1);
  }, []);

  const setSort = useCallback((newSort: ClientSortOption) => {
    setSortState(newSort);
    setPageState(1);
  }, []);

  const setPage = useCallback((newPage: number) => {
    setPageState(Math.max(1, newPage));
  }, []);

  const setPageSize = useCallback((newPageSize: number) => {
    if ([10, 25, 50].includes(newPageSize)) {
      setPageSizeState(newPageSize);
      setPageState(1);
    }
  }, []);

  const clearFilters = useCallback(() => {
    setSearchTermState('');
    setDebouncedSearchTerm('');
    setPersonTypeState('all');
    setStatusFilterState('all');
    setPageState(1);
  }, []);

  const setFilters = useCallback((newFilters: Partial<ClientListFilters>) => {
    if (newFilters.search !== undefined) setSearchTermState(newFilters.search);
    if (newFilters.personType !== undefined) setPersonTypeState(newFilters.personType);
    if (newFilters.status !== undefined) setStatusFilterState(newFilters.status);
    setPageState(1);
  }, []);

  const getClientById = useCallback(
    async (clientId: string): Promise<Client | null> => {
      if (!activeOrgId || !hasViewPermission || isSuperAdmin || orgStatus !== 'active') {
        return null;
      }
      try {
        const gateway = getClientGateway();
        return await gateway.getClientById(activeOrgId, clientId);
      } catch {
        return null;
      }
    },
    [activeOrgId, hasViewPermission, isSuperAdmin, orgStatus]
  );

  const createClient = useCallback(
    async (input: CreateClientInput): Promise<ClientMutationResult> => {
      if (!activeOrgId || !hasCreatePermission || isSuperAdmin || orgStatus !== 'active') {
        return {
          success: false,
          error: 'Acesso não autorizado para cadastrar clientes.',
          code: 'forbidden',
        };
      }
      try {
        const gateway = getClientGateway();
        const client = await gateway.createClient(activeOrgId, input);
        await refresh();
        return { success: true, client };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao cadastrar cliente.';
        const isDuplicate = message.toLowerCase().includes('já existe');
        const isUnavailable = message.toLowerCase().includes('indisponível');
        return {
          success: false,
          error: message,
          code: isDuplicate
            ? 'duplicate_document'
            : isUnavailable
            ? 'unavailable'
            : 'validation_error',
        };
      }
    },
    [activeOrgId, hasCreatePermission, isSuperAdmin, orgStatus, refresh]
  );

  const updateClient = useCallback(
    async (clientId: string, input: UpdateClientInput): Promise<ClientMutationResult> => {
      if (!activeOrgId || !hasEditPermission || isSuperAdmin || orgStatus !== 'active') {
        return {
          success: false,
          error: 'Acesso não autorizado para editar clientes.',
          code: 'forbidden',
        };
      }
      try {
        const gateway = getClientGateway();
        const client = await gateway.updateClient(activeOrgId, clientId, input);
        await refresh();
        return { success: true, client };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao atualizar cliente.';
        const isDuplicate = message.toLowerCase().includes('já existe');
        const isNotFound = message.toLowerCase().includes('não encontrado');
        const isUnavailable = message.toLowerCase().includes('indisponível');
        return {
          success: false,
          error: message,
          code: isDuplicate
            ? 'duplicate_document'
            : isNotFound
            ? 'not_found'
            : isUnavailable
            ? 'unavailable'
            : 'validation_error',
        };
      }
    },
    [activeOrgId, hasEditPermission, isSuperAdmin, orgStatus, refresh]
  );

  const filtersValue: ClientListFilters = useMemo(
    () => ({
      search: searchTerm,
      personType,
      status: statusFilter,
    }),
    [searchTerm, personType, statusFilter]
  );

  const paginationValue: ClientListPagination = useMemo(
    () => ({
      page,
      pageSize,
      totalPages,
      totalItems: totalCount,
    }),
    [page, pageSize, totalPages, totalCount]
  );

  const contextValue: ClientsContextValue = useMemo(
    () => ({
      status,
      clients,
      totalCount,
      page,
      pageSize,
      totalPages,
      searchTerm,
      personType,
      statusFilter,
      sort,
      isFiltered,
      filters: filtersValue,
      pagination: paginationValue,
      isLoading: status === 'loading',
      errorMessage,
      setSearchTerm,
      setPersonTypeFilter,
      setStatusFilter,
      setSort,
      setPage,
      setPageSize,
      clearFilters,
      refresh,
      reload: refresh,
      setFilters,
      getClientById,
      createClient,
      updateClient,
    }),
    [
      status,
      clients,
      totalCount,
      page,
      pageSize,
      totalPages,
      searchTerm,
      personType,
      statusFilter,
      sort,
      isFiltered,
      filtersValue,
      paginationValue,
      errorMessage,
      setSearchTerm,
      setPersonTypeFilter,
      setStatusFilter,
      setSort,
      setPage,
      setPageSize,
      clearFilters,
      refresh,
      setFilters,
      getClientById,
      createClient,
      updateClient,
    ]
  );

  return (
    <ClientsContext.Provider value={contextValue}>
      {children}
    </ClientsContext.Provider>
  );
}

export function useClients(): ClientsContextValue {
  const context = useContext(ClientsContext);
  if (!context) {
    throw new Error('useClients deve ser utilizado dentro de um ClientsProvider.');
  }
  return context;
}
