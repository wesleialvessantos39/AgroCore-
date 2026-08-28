import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useOrganization } from './useOrganization';
import { useAuth } from '../auth/useAuth';
import { RouteLoadingScreen } from '../components/feedback/RouteLoadingScreen';
import { SuspendedOrganizationView } from '../components/organization/SuspendedOrganizationView';
import { UnavailableOrganizationView } from '../components/organization/UnavailableOrganizationView';
import { ROUTES } from '../routes/paths';

export interface OrganizationGateProps {
  children?: React.ReactNode;
}

/**
 * OrganizationGate
 * Guarda de navegação organizacional no frontend, sem valor de autorização de segurança.
 *
 * Responsável por direcionar a interface do usuário para a visão adequada conforme
 * o estado do contexto organizacional ativo.
 */
export function OrganizationGate({ children }: OrganizationGateProps) {
  const { platformRole } = useAuth();
  const { status } = useOrganization();

  // 1. Escopo Plataforma (Superadministrador): ignora contexto organizacional e mantém a visão global
  if (platformRole === 'platform_super_admin') {
    return children ? <>{children}</> : <Outlet />;
  }

  // 2. Carregamento inicial do contexto organizacional
  if (status === 'loading') {
    return <RouteLoadingScreen label="Verificando organização..." />;
  }

  // 3. Configuração inicial exigida
  if (status === 'setupRequired') {
    return <Navigate to={ROUTES.CONFIG_ORGANIZATION} replace />;
  }

  // 4. Seleção de organização exigida (múltiplos vínculos)
  if (status === 'selectionRequired') {
    return <Navigate to={ROUTES.SELECT_ORGANIZATION} replace />;
  }

  // 5. Acesso pendente de aprovação
  if (status === 'accessPending') {
    return <Navigate to={ROUTES.PENDING_ACCESS} replace />;
  }

  // 6. Organização suspensa
  if (status === 'suspended') {
    return <SuspendedOrganizationView />;
  }

  // 7. Indisponibilidade transitória ou erro de contexto
  if (status === 'unavailable') {
    return <UnavailableOrganizationView />;
  }

  // 8. Contexto ativo: permite navegação na área interna
  return children ? <>{children}</> : <Outlet />;
}
