import { AuthSession, OrganizationRole, PlatformRole } from '../types/auth';

export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: 'Proprietário',
  company_admin: 'Administrador',
  manager: 'Gerente',
  project_designer: 'Projetista',
  finance: 'Financeiro',
  capturer: 'Captador',
  none: 'Sem função',
};

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  platform_super_admin: 'Superadministrador',
  none: 'Padrão',
};

export function getRoleDisplayLabel(session: AuthSession | null): string {
  if (!session) return 'Visitante';
  if (session.platformRole === 'platform_super_admin') {
    return PLATFORM_ROLE_LABELS.platform_super_admin;
  }
  return ORGANIZATION_ROLE_LABELS[session.organizationRole] || 'Usuário';
}

export function getScopeDisplayLabel(session: AuthSession | null): string {
  if (!session) return 'Indefinido';
  if (session.platformRole === 'platform_super_admin') {
    return 'Plataforma';
  }
  return session.organizationName || 'Organização';
}
