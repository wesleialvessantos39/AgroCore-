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
  PropertyContextStatus,
  PropertyListFilters,
  PropertyListPage,
  PropertyListPagination,
  PropertyListQuery,
  PropertySummary,
  Property,
  CreatePropertyInput,
  UpdatePropertyInput,
  PropertyMutationResult,
} from '../types/property';
import { getPropertyGateway } from './gatewayFactory';
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import { useAuthorization } from '../authorization/useAuthorization';

export interface PropertiesContextValue {
  readonly status: PropertyContextStatus;
  readonly properties: readonly PropertySummary[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly filters: PropertyListFilters;
  readonly pagination: PropertyListPagination;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly refresh: () => Promise<void>;
  readonly reload: () => Promise<void>;
  readonly getPropertyById: (propertyId: string) => Promise<Property | null>;
  readonly createProperty: (input: CreatePropertyInput) => Promise<PropertyMutationResult>;
  readonly updateProperty: (propertyId: string, input: UpdatePropertyInput) => Promise<PropertyMutationResult>;
  readonly setFilters: (filters: Partial<PropertyListFilters>) => void;
  readonly setPage: (page: number) => void;
  readonly setPageSize: (pageSize: number) => void;
}

const PropertiesContext = createContext<PropertiesContextValue | null>(null);

export interface PropertiesProviderProps {
  children: React.ReactNode;
}

export function PropertiesProvider({ children }: PropertiesProviderProps) {
  const { status: authStatus, session } = useAuth();
  const { status: orgStatus, activeOrganization } = useOrganization();
  const { can } = useAuthorization();

  const [status, setStatus] = useState<PropertyContextStatus>('idle');
  const [properties, setProperties] = useState<readonly PropertySummary[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [page, setPageState] = useState<number>(1);
  const [pageSize, setPageSizeState] = useState<number>(10);
  const [filters, setFiltersState] = useState<PropertyListFilters>({
    search: '',
    propertyType: 'all',
    status: 'all',
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestSequenceRef = useRef<number>(0);
  const activeOrgIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeOrgId = activeOrganization?.id ?? null;
  const isSuperAdmin = session?.platformRole === 'platform_super_admin';
  const hasViewPermission = can('properties:view');

  const executeFetch = useCallback(
    async (
      targetOrgId: string,
      currentQuery: PropertyListQuery
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const currentRequestId = ++requestSequenceRef.current;
      setStatus('loading');
      setErrorMessage(null);

      try {
        const gateway = getPropertyGateway();
        const result: PropertyListPage = await gateway.listProperties(
          currentQuery,
          abortController.signal
        );

        if (
          currentRequestId !== requestSequenceRef.current ||
          activeOrgIdRef.current !== targetOrgId
        ) {
          return;
        }

        setProperties(result.items);
        setTotalCount(result.total);
        setTotalPages(result.totalPages);
        setPageState(result.page);

        if (result.total === 0) {
          setStatus('empty');
        } else {
          setStatus('ready');
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        if (
          currentRequestId !== requestSequenceRef.current ||
          activeOrgIdRef.current !== targetOrgId
        ) {
          return;
        }

        setProperties([]);
        setTotalCount(0);
        setTotalPages(1);

        const isUnavailable = error instanceof Error && error.message.includes('indisponível');
        const errorMsg = isUnavailable
          ? 'Serviço de imóveis indisponível neste ambiente.'
          : 'Não foi possível carregar os imóveis da organização no momento.';

        setErrorMessage(errorMsg);
        setStatus(isUnavailable ? 'unavailable' : 'error');
      }
    },
    []
  );

  useEffect(() => {
    // 1. Não autenticado ou sem sessão -> limpa
    if (authStatus !== 'authenticated' || !session) {
      activeOrgIdRef.current = null;
      requestSequenceRef.current++;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setStatus('idle');
      setProperties([]);
      setTotalCount(0);
      setTotalPages(1);
      setPageState(1);
      setErrorMessage(null);
      return;
    }

    // 2. Superadministrador da plataforma não tem acesso a imóveis organizacionais
    if (isSuperAdmin) {
      activeOrgIdRef.current = null;
      requestSequenceRef.current++;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setStatus('idle');
      setProperties([]);
      setTotalCount(0);
      setTotalPages(1);
      setPageState(1);
      setErrorMessage(null);
      return;
    }

    // 3. Organização não ativa ou nula
    if (orgStatus !== 'active' || !activeOrgId) {
      activeOrgIdRef.current = null;
      requestSequenceRef.current++;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setStatus('idle');
      setProperties([]);
      setTotalCount(0);
      setTotalPages(1);
      setPageState(1);
      setErrorMessage(null);
      return;
    }

    // 4. Sem permissão de visualização de imóveis
    if (!hasViewPermission) {
      activeOrgIdRef.current = null;
      requestSequenceRef.current++;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setStatus('idle');
      setProperties([]);
      setTotalCount(0);
      setTotalPages(1);
      setPageState(1);
      setErrorMessage(null);
      return;
    }

    // 5. Troca de organização
    if (activeOrgIdRef.current !== activeOrgId) {
      activeOrgIdRef.current = activeOrgId;
      setProperties([]);
      setTotalCount(0);
      setTotalPages(1);
      setPageState(1);
      setFiltersState({
        search: '',
        propertyType: 'all',
        status: 'all',
      });
    }

    // 6. Consulta
    const query: PropertyListQuery = {
      organizationId: activeOrgId,
      searchTerm: filters.search,
      propertyType: filters.propertyType,
      status: filters.status,
      clientId: filters.clientId,
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
    filters,
    page,
    pageSize,
    executeFetch,
  ]);

  const refresh = useCallback(async () => {
    if (!activeOrgId || !hasViewPermission || isSuperAdmin || orgStatus !== 'active') {
      return;
    }
    const query: PropertyListQuery = {
      organizationId: activeOrgId,
      searchTerm: filters.search,
      propertyType: filters.propertyType,
      status: filters.status,
      clientId: filters.clientId,
      page,
      pageSize,
    };
    await executeFetch(activeOrgId, query);
  }, [activeOrgId, hasViewPermission, isSuperAdmin, orgStatus, filters, page, pageSize, executeFetch]);

  const reload = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const getPropertyById = useCallback(
    async (propertyId: string): Promise<Property | null> => {
      if (!activeOrgId || !hasViewPermission || isSuperAdmin || orgStatus !== 'active') {
        return null;
      }
      try {
        const gateway = getPropertyGateway();
        return await gateway.getPropertyById(activeOrgId, propertyId);
      } catch {
        return null;
      }
    },
    [activeOrgId, hasViewPermission, isSuperAdmin, orgStatus]
  );

  const createProperty = useCallback(
    async (input: CreatePropertyInput): Promise<PropertyMutationResult> => {
      if (!activeOrgId || isSuperAdmin || orgStatus !== 'active') {
        return {
          success: false,
          error: 'Organização não selecionada ou sem permissão.',
        };
      }
      try {
        const gateway = getPropertyGateway();
        const result = await gateway.createProperty(input);
        if (result.success) {
          await refresh();
        }
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Falha inesperada ao cadastrar o imóvel.';
        return {
          success: false,
          error: message,
        };
      }
    },
    [activeOrgId, isSuperAdmin, orgStatus, refresh]
  );

  const updateProperty = useCallback(
    async (propertyId: string, input: UpdatePropertyInput): Promise<PropertyMutationResult> => {
      if (!activeOrgId || isSuperAdmin || orgStatus !== 'active') {
        return {
          success: false,
          error: 'Organização não selecionada ou sem permissão.',
        };
      }
      try {
        const gateway = getPropertyGateway();
        const result = await gateway.updateProperty(propertyId, input);
        if (result.success) {
          await refresh();
        }
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Falha inesperada ao atualizar o imóvel.';
        return {
          success: false,
          error: message,
        };
      }
    },
    [activeOrgId, isSuperAdmin, orgStatus, refresh]
  );

  const setFilters = useCallback((newFilters: Partial<PropertyListFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }));
    setPageState(1);
  }, []);

  const setPage = useCallback((newPage: number) => {
    setPageState(newPage);
  }, []);

  const setPageSize = useCallback((newPageSize: number) => {
    setPageSizeState(newPageSize);
    setPageState(1);
  }, []);

  const pagination: PropertyListPagination = useMemo(
    () => ({
      page,
      pageSize,
      totalPages,
      totalItems: totalCount,
    }),
    [page, pageSize, totalPages, totalCount]
  );

  const contextValue: PropertiesContextValue = useMemo(
    () => ({
      status,
      properties,
      totalCount,
      page,
      pageSize,
      totalPages,
      filters,
      pagination,
      isLoading: status === 'loading',
      errorMessage,
      refresh,
      reload,
      getPropertyById,
      createProperty,
      updateProperty,
      setFilters,
      setPage,
      setPageSize,
    }),
    [
      status,
      properties,
      totalCount,
      page,
      pageSize,
      totalPages,
      filters,
      pagination,
      errorMessage,
      refresh,
      reload,
      getPropertyById,
      createProperty,
      updateProperty,
      setFilters,
      setPage,
      setPageSize,
    ]
  );

  return (
    <PropertiesContext.Provider value={contextValue}>
      {children}
    </PropertiesContext.Provider>
  );
}

export function usePropertiesContext(): PropertiesContextValue {
  const context = useContext(PropertiesContext);
  if (!context) {
    throw new Error('usePropertiesContext deve ser utilizado dentro de um PropertiesProvider');
  }
  return context;
}

export const useProperties = usePropertiesContext;
