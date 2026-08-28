import { ROUTES } from './paths';
import { getRouteDefinition, RouteDefinition } from './routeMatrix';
import { AuthSession, AuthStatus } from '../types/auth';
import { OrganizationContextStatus } from '../types/organization';
import { Permission } from '../types/authorization';

export type NavigationDecisionType =
  | 'allow'
  | 'redirect'
  | 'loading'
  | 'view_suspended'
  | 'view_unavailable'
  | 'access_denied';

export interface NavigationDecision {
  type: NavigationDecisionType;
  destination?: string;
  reason?: string;
  routeDef?: RouteDefinition;
}

export interface NavigationContext {
  pathname: string;
  authStatus: AuthStatus;
  session: AuthSession | null;
  orgStatus: OrganizationContextStatus;
  hasPermission?: (permission: Permission | readonly Permission[], requireAll?: boolean) => boolean;
}

/**
 * resolveDefaultAuthenticatedDestination
 *
 * Determina o destino padrão ideal para um usuário autenticado com base no seu papel
 * e no estado do seu contexto organizacional.
 */
export function resolveDefaultAuthenticatedDestination(
  session: AuthSession | null,
  orgStatus: OrganizationContextStatus
): string {
  if (!session) {
    return ROUTES.SIGN_IN;
  }

  // 1. Superadministrador da plataforma tem escopo global
  if (session.platformRole === 'platform_super_admin') {
    return ROUTES.SYSTEM;
  }

  // 2. Estados de ciclo de vida organizacional
  switch (orgStatus) {
    case 'setupRequired':
      return ROUTES.CONFIG_ORGANIZATION;
    case 'selectionRequired':
      return ROUTES.SELECT_ORGANIZATION;
    case 'accessPending':
      return ROUTES.PENDING_ACCESS;
    case 'suspended':
    case 'unavailable':
    case 'active':
    default:
      return ROUTES.SYSTEM;
  }
}

/**
 * evaluateNavigationDecision
 *
 * Função pura, determinística e centralizada que avalia o acesso a qualquer rota do sistema,
 * garantindo a aplicação consistente da ordem oficial de decisão:
 *
 * 1. Inicialização de sessão -> Mantém carregamento neutro
 * 2. Usuário não autenticado -> Bloqueia rotas protegidas e libera rotas públicas/visitante
 * 3. Usuário autenticado em rota de visitante -> Redireciona para área interna apropriada
 * 4. Superadministrador -> Escopo global direto (bloqueia rotas transitórias organizacionais)
 * 5. Usuário organizacional -> Avalia status da organização (configuração, pendente, suspensa, ativa)
 * 6. Verificação de permissões da rota -> Libera ou redireciona para acesso negado
 */
export function evaluateNavigationDecision(context: NavigationContext): NavigationDecision {
  const { pathname, authStatus, session, orgStatus, hasPermission } = context;
  const routeDef = getRouteDefinition(pathname);

  // 1. Carregamento inicial da autenticação: estado neutro sem flash
  if (authStatus === 'initializing') {
    return { type: 'loading', routeDef };
  }

  const isAuthenticated = authStatus === 'authenticated' && session !== null;

  // 2. Usuário NÃO autenticado
  if (!isAuthenticated) {
    // Se a rota for pública neutra, pública para visitante ou de feedback, permite
    if (
      !routeDef ||
      routeDef.category === 'public_neutral' ||
      routeDef.category === 'public_guest_only' ||
      routeDef.category === 'access_feedback'
    ) {
      return { type: 'allow', routeDef };
    }

    // Rotas protegidas ou de transição exigem entrada
    return {
      type: 'redirect',
      destination: ROUTES.SIGN_IN,
      reason: 'unauthenticated',
      routeDef,
    };
  }

  // 3. Usuário AUTENTICADO tentando acessar rota exclusiva de visitante (ex: /entrar, /recuperar-acesso)
  if (routeDef?.category === 'public_guest_only') {
    const destination = resolveDefaultAuthenticatedDestination(session, orgStatus);
    return {
      type: 'redirect',
      destination,
      reason: 'already_authenticated',
      routeDef,
    };
  }

  // 4. Rotas públicas neutras (ex: /apresentacao, 404) ou de feedback (/acesso-negado)
  if (routeDef?.category === 'public_neutral' || routeDef?.category === 'access_feedback') {
    return { type: 'allow', routeDef };
  }

  // 5. Escopo Superadministrador da Plataforma (Global)
  if (session.platformRole === 'platform_super_admin') {
    // Superadministrador não deve permanecer em rotas transitórias de organização
    if (routeDef?.category === 'authenticated_transition') {
      return {
        type: 'redirect',
        destination: ROUTES.SYSTEM,
        reason: 'super_admin_bypasses_org_setup',
        routeDef,
      };
    }

    // Validação de permissões da rota
    if (routeDef?.requiredPermissions && hasPermission) {
      const allowed = hasPermission(routeDef.requiredPermissions, routeDef.requireAllPermissions);
      if (!allowed) {
        return {
          type: 'redirect',
          destination: ROUTES.ACCESS_DENIED,
          reason: 'insufficient_permissions',
          routeDef,
        };
      }
    }

    return { type: 'allow', routeDef };
  }

  // 6. Usuário de Organização: Avaliação de Contexto Organizacional
  if (orgStatus === 'loading') {
    return { type: 'loading', routeDef };
  }

  // Se a organização exige configuração inicial
  if (orgStatus === 'setupRequired') {
    if (pathname === ROUTES.CONFIG_ORGANIZATION) {
      return { type: 'allow', routeDef };
    }
    return {
      type: 'redirect',
      destination: ROUTES.CONFIG_ORGANIZATION,
      reason: 'org_setup_required',
      routeDef,
    };
  }

  // Se há múltiplas organizações exigindo seleção
  if (orgStatus === 'selectionRequired') {
    if (pathname === ROUTES.SELECT_ORGANIZATION) {
      return { type: 'allow', routeDef };
    }
    return {
      type: 'redirect',
      destination: ROUTES.SELECT_ORGANIZATION,
      reason: 'org_selection_required',
      routeDef,
    };
  }

  // Se o acesso está pendente de aprovação
  if (orgStatus === 'accessPending') {
    if (pathname === ROUTES.PENDING_ACCESS) {
      return { type: 'allow', routeDef };
    }
    return {
      type: 'redirect',
      destination: ROUTES.PENDING_ACCESS,
      reason: 'org_access_pending',
      routeDef,
    };
  }

  // Se a organização está suspensa
  if (orgStatus === 'suspended') {
    return { type: 'view_suspended', routeDef };
  }

  // Se o contexto está indisponível
  if (orgStatus === 'unavailable') {
    return { type: 'view_unavailable', routeDef };
  }

  // 7. Contexto Organizacional Ativo ('active')
  // Se o usuário tentar acessar rotas transitórias que não se aplicam mais, redireciona para o sistema
  if (
    pathname === ROUTES.CONFIG_ORGANIZATION ||
    pathname === ROUTES.PENDING_ACCESS
  ) {
    return {
      type: 'redirect',
      destination: ROUTES.SYSTEM,
      reason: 'org_context_already_active',
      routeDef,
    };
  }

  // 8. Verificação de Permissões
  if (routeDef?.requiredPermissions && hasPermission) {
    const allowed = hasPermission(routeDef.requiredPermissions, routeDef.requireAllPermissions);
    if (!allowed) {
      return {
        type: 'redirect',
        destination: ROUTES.ACCESS_DENIED,
        reason: 'insufficient_permissions',
        routeDef,
      };
    }
  }

  return { type: 'allow', routeDef };
}
