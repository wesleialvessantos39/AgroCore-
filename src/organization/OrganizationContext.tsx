import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  Organization,
  OrganizationMembership,
  OrganizationContextStatus,
  OrganizationGateway,
} from '../types/organization';
import { OrganizationRole } from '../types/auth';
import { useAuth } from '../auth/useAuth';
import { createOrganizationGateway } from './gatewayFactory';

export interface OrganizationContextValue {
  status: OrganizationContextStatus;
  activeOrganization: Organization | null;
  activeMembership: OrganizationMembership | null;
  availableMemberships: OrganizationMembership[];
  organizationRole: OrganizationRole;
  organizationRoleLabel: string;
  selectOrganization: (orgId: string) => Promise<boolean>;
  configureInitialOrganization: (name: string) => Promise<boolean>;
  refreshOrganization: () => Promise<void>;
  clearOrganizationContext: () => void;
  previewStateOverride?: OrganizationContextStatus | null;
  setPreviewStateOverride?: (override: OrganizationContextStatus | null) => void;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

function getOrgRoleLabel(role: OrganizationRole): string {
  switch (role) {
    case 'owner':
      return 'Proprietário da organização';
    case 'company_admin':
      return 'Administrador da organização';
    case 'manager':
      return 'Gerente';
    case 'project_designer':
      return 'Projetista';
    case 'finance':
      return 'Financeiro';
    case 'capturer':
      return 'Captador';
    default:
      return 'Sem atribuição';
  }
}

export interface OrganizationProviderProps {
  children: React.ReactNode;
}

export function OrganizationProvider({ children }: OrganizationProviderProps) {
  const { user, isAuthenticated, platformRole } = useAuth();

  const [realStatus, setRealStatus] = useState<OrganizationContextStatus>('loading');
  const [activeOrganization, setActiveOrganization] = useState<Organization | null>(null);
  const [activeMembership, setActiveMembership] = useState<OrganizationMembership | null>(null);
  const [availableMemberships, setAvailableMemberships] = useState<OrganizationMembership[]>([]);
  const [previewStateOverride, setPreviewStateOverride] = useState<OrganizationContextStatus | null>(null);

  const gatewayRef = useRef<OrganizationGateway | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  const clearOrganizationContext = useCallback(() => {
    setRealStatus('unavailable');
    setActiveOrganization(null);
    setActiveMembership(null);
    setAvailableMemberships([]);
    setPreviewStateOverride(null);
  }, []);

  const loadOrgContext = useCallback(async (userId: string, isMounted: () => boolean) => {
    try {
      if (!gatewayRef.current) {
        gatewayRef.current = await createOrganizationGateway();
      }

      const gateway = gatewayRef.current;
      const data = await gateway.loadContext(userId);

      if (!isMounted()) return;

      setRealStatus(data.status);
      setActiveOrganization(data.activeOrganization);
      setActiveMembership(data.activeMembership);
      setAvailableMemberships(data.availableMemberships);
    } catch {
      if (!isMounted()) return;
      setRealStatus('unavailable');
      setActiveOrganization(null);
      setActiveMembership(null);
      setAvailableMemberships([]);
    }
  }, []);

  // Efeito sincronizado com o ciclo de vida da autenticação
  useEffect(() => {
    let isMounted = true;
    const checkMounted = () => isMounted;

    if (!isAuthenticated || !user) {
      currentUserIdRef.current = null;
      clearOrganizationContext();
      return;
    }

    // Se trocou de usuário, limpa imediatamente antes de recarregar
    if (currentUserIdRef.current && currentUserIdRef.current !== user.id) {
      clearOrganizationContext();
    }
    currentUserIdRef.current = user.id;

    // Se for Superadmin da plataforma, o escopo é global (ignora organização)
    if (platformRole === 'platform_super_admin') {
      setRealStatus('active');
      setActiveOrganization(null);
      setActiveMembership(null);
      setAvailableMemberships([]);
      return;
    }

    setRealStatus('loading');
    loadOrgContext(user.id, checkMounted);

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user, platformRole, clearOrganizationContext, loadOrgContext]);

  const refreshOrganization = useCallback(async () => {
    if (!user) return;
    setRealStatus('loading');
    await loadOrgContext(user.id, () => true);
  }, [user, loadOrgContext]);

  const selectOrganization = useCallback(
    async (orgId: string): Promise<boolean> => {
      try {
        if (!gatewayRef.current) {
          gatewayRef.current = await createOrganizationGateway();
        }
        const gateway = gatewayRef.current;
        const success = await gateway.selectOrganization(orgId);
        if (success && user) {
          await loadOrgContext(user.id, () => true);
        }
        return success;
      } catch {
        return false;
      }
    },
    [user, loadOrgContext]
  );

  const configureInitialOrganization = useCallback(
    async (name: string): Promise<boolean> => {
      if (!user) return false;
      try {
        if (!gatewayRef.current) {
          gatewayRef.current = await createOrganizationGateway();
        }
        const gateway = gatewayRef.current;
        const success = await gateway.configureInitialOrganization(name, user.id);
        if (success) {
          await loadOrgContext(user.id, () => true);
        }
        return success;
      } catch {
        return false;
      }
    },
    [user, loadOrgContext]
  );

  // Status efetivo: considera override de preview temporário exclusivamente em DEV
  const effectiveStatus = (import.meta.env.DEV && previewStateOverride) ? previewStateOverride : realStatus;

  const organizationRole = activeMembership?.organizationRole || 'none';
  const organizationRoleLabel = getOrgRoleLabel(organizationRole);

  const value = useMemo<OrganizationContextValue>(() => {
    return {
      status: effectiveStatus,
      activeOrganization,
      activeMembership,
      availableMemberships,
      organizationRole,
      organizationRoleLabel,
      selectOrganization,
      configureInitialOrganization,
      refreshOrganization,
      clearOrganizationContext,
      previewStateOverride,
      setPreviewStateOverride,
    };
  }, [
    effectiveStatus,
    activeOrganization,
    activeMembership,
    availableMemberships,
    organizationRole,
    organizationRoleLabel,
    selectOrganization,
    configureInitialOrganization,
    refreshOrganization,
    clearOrganizationContext,
    previewStateOverride,
  ]);

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization deve ser utilizado dentro de um OrganizationProvider');
  }
  return context;
}
