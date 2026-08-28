import React from 'react';
import { useAuth } from '../../auth/useAuth';
import { PlatformRole, OrganizationRole } from '../../types/auth';

export interface RoleGateProps {
  allowedPlatformRoles?: PlatformRole[];
  allowedOrganizationRoles?: OrganizationRole[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * RoleGate: Controle visual de escopo no frontend para exibição condicional de componentes.
 * Nota técnica: Funciona exclusivamente como controle visual de escopo na interface do usuário, sem valor de autorização de segurança.
 */
export function RoleGate({
  allowedPlatformRoles,
  allowedOrganizationRoles,
  fallback = null,
  children,
}: RoleGateProps) {
  const { platformRole, organizationRole } = useAuth();

  // 1. Verificação por papel de plataforma
  if (allowedPlatformRoles && allowedPlatformRoles.length > 0) {
    if (allowedPlatformRoles.includes(platformRole)) {
      return <>{children}</>;
    }
  }

  // 2. Verificação por papel organizacional
  if (allowedOrganizationRoles && allowedOrganizationRoles.length > 0) {
    if (allowedOrganizationRoles.includes(organizationRole)) {
      return <>{children}</>;
    }
  }

  // Se nenhuma permissão foi concedida ou nenhuma lista coincidiu
  if (
    (!allowedPlatformRoles || allowedPlatformRoles.length === 0) &&
    (!allowedOrganizationRoles || allowedOrganizationRoles.length === 0)
  ) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
