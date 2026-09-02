import React, { createContext, useMemo } from 'react';
import {
  Permission,
  AuthorizationDecision,
  PermissionGroupSummary,
} from '../types/authorization';
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import {
  evaluatePermission,
  resolveUserRole,
  getGrantedPermissionSummaries,
} from './authorizationEvaluator';
import { PERMISSIONS_CATALOG } from './permissionsCatalog';

export interface AuthorizationContextValue {
  can: (permission: Permission) => boolean;
  cannot: (permission: Permission) => boolean;
  canAny: (permissions: readonly Permission[]) => boolean;
  canAll: (permissions: readonly Permission[]) => boolean;
  evaluate: (permission: Permission) => AuthorizationDecision;
  effectiveRole: string;
  scope: 'platform' | 'organization' | 'none';
  isPlatformSuperAdmin: boolean;
  isLoading: boolean;
  activePermissions: ReadonlySet<Permission>;
  grantedSummaries: readonly PermissionGroupSummary[];
}

export const AuthorizationContext = createContext<AuthorizationContextValue | null>(null);

export interface AuthorizationProviderProps {
  children: React.ReactNode;
}

export function AuthorizationProvider({ children }: AuthorizationProviderProps) {
  const { session, status: authStatus } = useAuth();
  const org = useOrganization();

  const isAuthLoading = authStatus === 'initializing';
  const isOrgLoading = org.status === 'loading';
  const isLoading = isAuthLoading || isOrgLoading;

  const roleResolution = useMemo(
    () =>
      resolveUserRole(session, {
        status: org.status,
        activeOrganization: org.activeOrganization,
        activeMembership: org.activeMembership,
        availableMemberships: org.availableMemberships,
      }),
    [
      session,
      org.status,
      org.activeOrganization,
      org.activeMembership,
      org.availableMemberships,
    ]
  );

  const evaluatorContext = useMemo(
    () => ({
      session,
      orgContext: {
        status: org.status,
        activeOrganization: org.activeOrganization,
        activeMembership: org.activeMembership,
        availableMemberships: org.availableMemberships,
      },
    }),
    [session, org.status, org.activeOrganization, org.activeMembership, org.availableMemberships]
  );

  const activePermissions = useMemo(() => {
    const set = new Set<Permission>();
    if (!session || isLoading) return set;

    for (const def of PERMISSIONS_CATALOG) {
      if (evaluatePermission(def.id, evaluatorContext).granted) {
        set.add(def.id);
      }
    }
    return set;
  }, [session, isLoading, evaluatorContext]);

  const grantedSummaries = useMemo(() => {
    if (!session || isLoading) return [];
    return getGrantedPermissionSummaries(evaluatorContext);
  }, [session, isLoading, evaluatorContext]);

  const evaluate = useMemo(
    () => (permission: Permission): AuthorizationDecision => {
      return evaluatePermission(permission, evaluatorContext);
    },
    [evaluatorContext]
  );

  const can = useMemo(
    () => (permission: Permission): boolean => {
      return activePermissions.has(permission);
    },
    [activePermissions]
  );

  const cannot = useMemo(
    () => (permission: Permission): boolean => {
      return !can(permission);
    },
    [can]
  );

  const canAny = useMemo(
    () => (permissions: readonly Permission[]): boolean => {
      return permissions.some((p) => can(p));
    },
    [can]
  );

  const canAll = useMemo(
    () => (permissions: readonly Permission[]): boolean => {
      return permissions.length > 0 && permissions.every((p) => can(p));
    },
    [can]
  );

  const value: AuthorizationContextValue = useMemo(
    () => ({
      can,
      cannot,
      canAny,
      canAll,
      evaluate,
      effectiveRole: roleResolution.effectiveRole,
      scope: roleResolution.scope,
      isPlatformSuperAdmin: roleResolution.isPlatformSuperAdmin,
      isLoading,
      activePermissions,
      grantedSummaries,
    }),
    [
      can,
      cannot,
      canAny,
      canAll,
      evaluate,
      roleResolution,
      isLoading,
      activePermissions,
      grantedSummaries,
    ]
  );

  return (
    <AuthorizationContext.Provider value={value}>
      {children}
    </AuthorizationContext.Provider>
  );
}
