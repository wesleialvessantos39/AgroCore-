import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useOrganization } from '../../organization/useOrganization';
import { RouteLoadingScreen } from '../feedback/RouteLoadingScreen';
import { resolveDefaultAuthenticatedDestination } from '../../routes/navigationDecision';

export interface GuestRouteProps {
  children?: React.ReactNode;
}

/**
 * GuestRoute
 * Guarda de navegação exclusiva para visitantes e usuários não autenticados.
 * Redireciona usuários já autenticados diretamente para a área autorizada do sistema,
 * prevenindo que usuários logados permaneçam em telas de login ou recuperação de senha.
 */
export function GuestRoute({ children }: GuestRouteProps) {
  const { status, isAuthenticated, session } = useAuth();
  const org = useOrganization();

  // Enquanto a sessão inicializa, exibe tela de carregamento neutra (previne flashes)
  if (status === 'initializing') {
    return <RouteLoadingScreen label="Verificando acesso..." />;
  }

  // Se o usuário estiver autenticado, redireciona para a área adequada do sistema
  if (isAuthenticated && session) {
    const destination = resolveDefaultAuthenticatedDestination(session, org.status);
    return <Navigate to={destination} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
