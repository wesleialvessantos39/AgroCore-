import {
  Permission,
  AuthorizationDecision,
  UserRoleResolution,
  PermissionGroupSummary,
} from '../types/authorization';
import { AuthSession } from '../types/auth';
import { OrganizationContextData } from '../types/organization';
import {
  PERMISSION_BY_ID_MAP,
  PERMISSION_SCOPE_GROUPS,
  isValidPermission,
} from './permissionsCatalog';
import { ROLE_PERMISSIONS_SET_MAP, AppRoleCode } from './permissionsMatrix';

export interface EvaluatorContext {
  session: AuthSession | null;
  orgContext: OrganizationContextData | null;
}

export function resolveUserRole(session: AuthSession | null): UserRoleResolution {
  if (!session) {
    return {
      effectiveRole: 'none',
      scope: 'none',
      isPlatformSuperAdmin: false,
    };
  }

  if (session.platformRole === 'platform_super_admin') {
    return {
      effectiveRole: 'platform_super_admin',
      scope: 'platform',
      isPlatformSuperAdmin: true,
    };
  }

  return {
    effectiveRole: session.organizationRole,
    scope: 'organization',
    isPlatformSuperAdmin: false,
  };
}

/**
 * Avaliador central e imutável de autorização
 */
export function evaluatePermission(
  permission: unknown,
  context: EvaluatorContext
): AuthorizationDecision {
  // 1. Validação estrita da permissão
  if (!isValidPermission(permission)) {
    return {
      granted: false,
      reason: 'Permissão não reconhecida pelo sistema.',
    };
  }

  const permissionDef = PERMISSION_BY_ID_MAP.get(permission);
  if (!permissionDef) {
    return {
      granted: false,
      reason: 'Definição de permissão não encontrada.',
    };
  }

  // 2. Validação de sessão ativa
  const { session, orgContext } = context;
  if (!session) {
    return {
      granted: false,
      reason: 'Sessão de usuário não autenticada.',
    };
  }

  const roleResolution = resolveUserRole(session);
  const { effectiveRole, isPlatformSuperAdmin } = roleResolution;

  // 3. Validação do papel
  const rolePermissions = ROLE_PERMISSIONS_SET_MAP.get(effectiveRole as AppRoleCode);
  if (!rolePermissions) {
    return {
      granted: false,
      reason: 'Perfil de acesso não reconhecido.',
    };
  }

  const targetScope = permissionDef.targetScope;

  // 4. Regras de Isolamento: Superadministrador Global
  if (isPlatformSuperAdmin) {
    if (targetScope === 'organization') {
      return {
        granted: false,
        reason:
          'Superadministrador atua exclusivamente no escopo global e não possui acesso a operações internas de organizações.',
      };
    }

    if (rolePermissions.has(permission)) {
      return { granted: true };
    }

    return {
      granted: false,
      reason: 'Permissão global não concedida ao perfil de Superadministrador.',
    };
  }

  // 5. Regras de Isolamento: Perfis Organizacionais
  if (targetScope === 'platform') {
    return {
      granted: false,
      reason: 'Perfis organizacionais não possuem acesso a recursos globais da plataforma.',
    };
  }

  // Se a permissão for de conta pessoal, permite mesmo com vínculo pendente se o papel possuir
  if (targetScope === 'personal') {
    if (rolePermissions.has(permission)) {
      return { granted: true };
    }
    return {
      granted: false,
      reason: 'Permissão de conta pessoal não concedida ao perfil atual.',
    };
  }

  // 6. Verificação do Estado da Organização e Vínculo para Permissões Organizacionais/Operacionais
  if (orgContext) {
    if (orgContext.status === 'accessPending') {
      return {
        granted: false,
        reason: 'Acesso organizacional pendente de aprovação por um administrador.',
      };
    }

    if (orgContext.status === 'suspended') {
      return {
        granted: false,
        reason: 'A organização vinculada encontra-se suspensa.',
      };
    }

    if (orgContext.status === 'unavailable') {
      return {
        granted: false,
        reason: 'Serviço de organização indisponível.',
      };
    }

    if (orgContext.status === 'setupRequired') {
      return {
        granted: false,
        reason: 'Configuração inicial da organização pendente.',
      };
    }

    if (orgContext.activeMembership && orgContext.activeMembership.status !== 'active') {
      return {
        granted: false,
        reason: 'O vínculo com a organização não está ativo.',
      };
    }

    if (orgContext.activeOrganization && orgContext.activeOrganization.status !== 'active') {
      return {
        granted: false,
        reason: 'A organização ativa não está em situação regular.',
      };
    }
  }

  // 7. Avaliação final pela matriz de perfil
  if (rolePermissions.has(permission)) {
    return { granted: true };
  }

  return {
    granted: false,
    reason: 'O perfil de acesso atual não possui esta permissão.',
  };
}

/**
 * Extrai todos os grupos de capacidades concedidas ao perfil para apresentação em linguagem amigável
 */
export function getGrantedPermissionSummaries(
  context: EvaluatorContext
): PermissionGroupSummary[] {
  const summaries: PermissionGroupSummary[] = [];

  for (const group of PERMISSION_SCOPE_GROUPS) {
    const groupPermissions = Array.from(PERMISSION_BY_ID_MAP.values()).filter(
      (p) => p.scope === group.id
    );

    const grantedInGroup = groupPermissions.filter(
      (p) => evaluatePermission(p.id, context).granted
    );

    if (grantedInGroup.length > 0) {
      summaries.push({
        scope: group.id,
        groupName: group.name,
        groupDescription: group.description,
        capabilities: grantedInGroup.map((p) => p.description),
      });
    }
  }

  return summaries;
}
