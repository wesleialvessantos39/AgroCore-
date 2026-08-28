import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { RouteLoadingScreen } from '../feedback/RouteLoadingScreen';
import { ROUTES } from '../../routes/paths';
import { getSafeRedirectUrl } from '../../routes/safeNavigation';

export interface ProtectedRouteProps {
  children?: React.ReactNode;
}

/**
 * ProtectedRoute
 * Guarda de navegação no frontend para proteção de rotas restritas a usuários autenticados.
 * Garante estado de carregamento neutro sem exposição de conteúdo, sanitização contra Open Redirect
 * e redirecionamento seguro para a tela de autenticação caso a sessão não exista.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { status, isAuthenticated } = useAuth();
  const location = useLocation();

  // Enquanto a sessão está sendo inicializada, exibe tela de carregamento neutra (evita flashes de conteúdo)
  if (status === 'initializing') {
    return <RouteLoadingScreen label="Verificando acesso..." />;
  }

  // Redireciona usuário não autenticado para a tela de entrada com rota de retorno sanitizada
  if (!isAuthenticated) {
    const safeFrom = getSafeRedirectUrl(location.pathname, ROUTES.SYSTEM);
    return <Navigate to={ROUTES.SIGN_IN} state={{ from: { pathname: safeFrom } }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

