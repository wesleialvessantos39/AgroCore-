import React from 'react';
import {
  ShieldCheck,
  Building2,
  Users,
  ClipboardList,
  Compass,
  CircleDollarSign,
  UserPlus,
  LucideIcon,
} from 'lucide-react';
import { AuthSession, OrganizationRole, PlatformRole } from '../types/auth';

export type UserRoleIdentifier = PlatformRole | OrganizationRole;

export interface RoleProfileConfig {
  role: UserRoleIdentifier;
  name: string;
  scope: 'platform' | 'organization';
  scopeLabel: 'Plataforma' | 'Organização';
  viewTitle: string;
  description: string;
  responsibilities: readonly string[];
  icon: LucideIcon;
  emptyState: {
    title: string;
    description: string;
  };
}

export const ROLE_PROFILE_CONFIGS: Record<
  'platform_super_admin' | 'owner' | 'company_admin' | 'manager' | 'project_designer' | 'finance' | 'capturer',
  RoleProfileConfig
> = {
  platform_super_admin: {
    role: 'platform_super_admin',
    name: 'Superadministrador da plataforma',
    scope: 'platform',
    scopeLabel: 'Plataforma',
    viewTitle: 'Administração da plataforma',
    description: 'Visão institucional destinada à governança global do AgroCore.',
    responsibilities: [
      'governança geral da plataforma;',
      'administração das organizações;',
      'administração dos acessos globais;',
      'acompanhamento de conformidade e auditoria.',
    ],
    icon: ShieldCheck,
    emptyState: {
      title: 'Nenhuma informação global disponível',
      description: 'As informações reais da plataforma serão apresentadas aqui quando a infraestrutura oficial estiver conectada.',
    },
  },
  owner: {
    role: 'owner',
    name: 'Proprietário da organização',
    scope: 'organization',
    scopeLabel: 'Organização',
    viewTitle: 'Visão do proprietário',
    description: 'Área de acompanhamento geral da organização e de suas operações.',
    responsibilities: [
      'governança da organização;',
      'acompanhamento completo das áreas;',
      'administração dos responsáveis internos;',
      'supervisão dos fluxos operacionais.',
    ],
    icon: Building2,
    emptyState: {
      title: 'Nenhuma informação da organização disponível.',
      description: 'As informações reais da organização serão apresentadas aqui quando as atividades operacionais forem iniciadas.',
    },
  },
  company_admin: {
    role: 'company_admin',
    name: 'Administrador da organização',
    scope: 'organization',
    scopeLabel: 'Organização',
    viewTitle: 'Administração da organização',
    description: 'Área destinada à organização dos acessos, equipes e rotinas internas.',
    responsibilities: [
      'administração de usuários;',
      'organização das permissões internas;',
      'apoio à configuração do escritório;',
      'acompanhamento administrativo.',
    ],
    icon: Users,
    emptyState: {
      title: 'Nenhuma informação administrativa disponível.',
      description: 'As informações reais de administração serão apresentadas aqui quando houver rotinas cadastradas.',
    },
  },
  manager: {
    role: 'manager',
    name: 'Gerente',
    scope: 'organization',
    scopeLabel: 'Organização',
    viewTitle: 'Gestão operacional',
    description: 'Área destinada ao acompanhamento das rotinas e responsabilidades da equipe.',
    responsibilities: [
      'acompanhamento das demandas;',
      'supervisão da equipe;',
      'controle de prazos;',
      'acompanhamento do fluxo de trabalho.',
    ],
    icon: ClipboardList,
    emptyState: {
      title: 'Nenhuma atividade operacional registrada.',
      description: 'As atividades operacionais da equipe aparecerão aqui quando forem iniciadas.',
    },
  },
  project_designer: {
    role: 'project_designer',
    name: 'Projetista',
    scope: 'organization',
    scopeLabel: 'Organização',
    viewTitle: 'Projetos e acompanhamento técnico',
    description: 'Área destinada à elaboração e organização técnica de projetos, análises agronômicas e documentações sob responsabilidade do profissional.',
    responsibilities: [
      'elaboração técnica e acompanhamento de projetos agropecuários;',
      'realização e organização de análises técnicas e diagnósticos;',
      'gestão e guarda das documentações e peças técnicas sob sua responsabilidade;',
      'preparação para futura elaboração de laudos de avaliação de imóveis rurais e urbanos (módulo planejado);',
      'acompanhamento de vistorias de campo e exigências técnicas.',
    ],
    icon: Compass,
    emptyState: {
      title: 'Nenhuma atividade técnica registrada.',
      description: 'Os projetos e documentações técnicas aparecerão aqui quando forem elaborados.',
    },
  },
  finance: {
    role: 'finance',
    name: 'Financeiro',
    scope: 'organization',
    scopeLabel: 'Organização',
    viewTitle: 'Acompanhamento financeiro',
    description: 'Área destinada às responsabilidades financeiras autorizadas para este perfil.',
    responsibilities: [
      'acompanhamento de recebimentos;',
      'acompanhamento de despesas;',
      'controle de honorários;',
      'organização das informações financeiras.',
    ],
    icon: CircleDollarSign,
    emptyState: {
      title: 'Nenhuma informação financeira registrada.',
      description: 'Os registros e controles financeiros aparecerão aqui quando forem lançados.',
    },
  },
  capturer: {
    role: 'capturer',
    name: 'Captador',
    scope: 'organization',
    scopeLabel: 'Organização',
    viewTitle: 'Captação e atendimento',
    description: 'Área destinada ao acompanhamento inicial de produtores e documentos.',
    responsibilities: [
      'atendimento inicial;',
      'captação de produtores;',
      'recebimento inicial de documentos;',
      'acompanhamento de pendências cadastrais.',
    ],
    icon: UserPlus,
    emptyState: {
      title: 'Nenhuma atividade de captação registrada.',
      description: 'Os atendimentos e recebimentos de documentos aparecerão aqui quando forem cadastrados.',
    },
  },
} as const;

export const ALL_ROLE_IDENTIFIERS = Object.keys(ROLE_PROFILE_CONFIGS) as Array<
  keyof typeof ROLE_PROFILE_CONFIGS
>;

/**
 * Obtém a configuração de perfil para uma sessão de autenticação.
 * Retorna null de forma neutra e segura se a sessão ou o papel for desconhecido.
 */
export function getRoleProfileConfig(session: AuthSession | null): RoleProfileConfig | null {
  if (!session) return null;

  if (session.platformRole === 'platform_super_admin') {
    return ROLE_PROFILE_CONFIGS.platform_super_admin;
  }

  const orgRole = session.organizationRole;
  if (orgRole && orgRole !== 'none' && orgRole in ROLE_PROFILE_CONFIGS) {
    return ROLE_PROFILE_CONFIGS[orgRole as keyof typeof ROLE_PROFILE_CONFIGS];
  }

  return null;
}
