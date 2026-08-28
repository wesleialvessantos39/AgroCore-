import { PlatformRole, OrganizationRole, AuthSession } from '../../types/auth';

export interface PreviewAccountConfig {
  id: string;
  email: string;
  password: string;
  roleCode: PlatformRole | OrganizationRole;
  roleLabel: string;
  scopeType: 'platform' | 'organization';
  organizationName: string | null;
  platformRole: PlatformRole;
  organizationRole: OrganizationRole;
}

export const PREVIEW_ACCOUNTS: PreviewAccountConfig[] = [
  {
    id: 'preview-usr-superadmin',
    email: 'superadmin@agrocore.test',
    password: 'AgroCore@Teste1',
    roleCode: 'platform_super_admin',
    roleLabel: 'Superadministrador da plataforma',
    scopeType: 'platform',
    organizationName: null,
    platformRole: 'platform_super_admin',
    organizationRole: 'none',
  },
  {
    id: 'preview-usr-owner',
    email: 'proprietario@agrocore.test',
    password: 'AgroCore@Teste1',
    roleCode: 'owner',
    roleLabel: 'Proprietário da organização',
    scopeType: 'organization',
    organizationName: 'Organização de acompanhamento',
    platformRole: 'none',
    organizationRole: 'owner',
  },
  {
    id: 'preview-usr-company-admin',
    email: 'administrador@agrocore.test',
    password: 'AgroCore@Teste1',
    roleCode: 'company_admin',
    roleLabel: 'Administrador da organização',
    scopeType: 'organization',
    organizationName: 'Organização de acompanhamento',
    platformRole: 'none',
    organizationRole: 'company_admin',
  },
  {
    id: 'preview-usr-manager',
    email: 'gerente@agrocore.test',
    password: 'AgroCore@Teste1',
    roleCode: 'manager',
    roleLabel: 'Gerente',
    scopeType: 'organization',
    organizationName: 'Organização de acompanhamento',
    platformRole: 'none',
    organizationRole: 'manager',
  },
  {
    id: 'preview-usr-designer',
    email: 'projetista@agrocore.test',
    password: 'AgroCore@Teste1',
    roleCode: 'project_designer',
    roleLabel: 'Projetista',
    scopeType: 'organization',
    organizationName: 'Organização de acompanhamento',
    platformRole: 'none',
    organizationRole: 'project_designer',
  },
  {
    id: 'preview-usr-finance',
    email: 'financeiro@agrocore.test',
    password: 'AgroCore@Teste1',
    roleCode: 'finance',
    roleLabel: 'Financeiro',
    scopeType: 'organization',
    organizationName: 'Organização de acompanhamento',
    platformRole: 'none',
    organizationRole: 'finance',
  },
  {
    id: 'preview-usr-capturer',
    email: 'captador@agrocore.test',
    password: 'AgroCore@Teste1',
    roleCode: 'capturer',
    roleLabel: 'Captador',
    scopeType: 'organization',
    organizationName: 'Organização de acompanhamento',
    platformRole: 'none',
    organizationRole: 'capturer',
  },
];

export function buildSessionFromAccount(account: PreviewAccountConfig): AuthSession {
  return {
    user: {
      id: account.id,
      email: account.email,
    },
    mode: 'preview',
    platformRole: account.platformRole,
    activeOrganizationId: account.organizationName ? 'preview-org-001' : null,
    organizationName: account.organizationName,
    organizationRole: account.organizationRole,
    isPreview: true,
  };
}
