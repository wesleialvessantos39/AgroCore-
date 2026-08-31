import { ROUTES, AppRoute } from './paths';
import { PermissionCode } from '../types/authorization';

export type RouteCategory =
  | 'public_neutral'
  | 'public_universal'
  | 'public_guest_only'
  | 'authenticated_transition'
  | 'authenticated_protected'
  | 'access_feedback'
  | 'wildcard_fallback';

export type RouteScope = 'universal' | 'organization';

export interface RouteDefinition {
  readonly path: AppRoute;
  readonly category: RouteCategory;
  readonly name: string;
  readonly requiresAuth: boolean;
  readonly requiredPermissions?: PermissionCode | PermissionCode[];
  readonly requireAllPermissions?: boolean;
  readonly scope: RouteScope;
  readonly description: string;
}

export const CENTRAL_ROUTE_MATRIX: readonly RouteDefinition[] = Object.freeze([
  // 1. Rotas Públicas Universais
  {
    path: ROUTES.HOME,
    category: 'public_neutral',
    name: 'Início',
    requiresAuth: false,
    scope: 'universal',
    description: 'Página inicial com redirecionamento contextual seguro.',
  },
  {
    path: ROUTES.PRESENTATION,
    category: 'public_neutral',
    name: 'Apresentação Institucional',
    requiresAuth: false,
    scope: 'universal',
    description: 'Apresentação institucional pública da plataforma AgroCore.',
  },

  // 2. Rotas Públicas Exclusivas para Não-Autenticados (Guest Only)
  {
    path: ROUTES.SIGN_IN,
    category: 'public_guest_only',
    name: 'Acessar o AgroCore',
    requiresAuth: false,
    scope: 'universal',
    description: 'Página de autenticação com validação estrita e bloqueio de força bruta.',
  },
  {
    path: ROUTES.RECOVER_ACCESS,
    category: 'public_guest_only',
    name: 'Recuperar Acesso',
    requiresAuth: false,
    scope: 'universal',
    description: 'Solicitação neutra de recuperação de acesso ao sistema.',
  },
  {
    path: ROUTES.RESET_PASSWORD,
    category: 'public_guest_only',
    name: 'Atualizar Senha',
    requiresAuth: false,
    scope: 'universal',
    description: 'Definição de nova senha conforme política de segurança.',
  },

  // 3. Rotas Autenticadas de Transição Organizacional
  {
    path: ROUTES.CONFIG_ORGANIZATION,
    category: 'authenticated_transition',
    name: 'Configurar Organização',
    requiresAuth: true,
    scope: 'organization',
    description: 'Configuração da primeira organização pelo proprietário.',
  },
  {
    path: ROUTES.SELECT_ORGANIZATION,
    category: 'authenticated_transition',
    name: 'Selecionar Organização',
    requiresAuth: true,
    scope: 'organization',
    description: 'Seleção do ambiente organizacional ativo entre múltiplas filiais.',
  },
  {
    path: ROUTES.PENDING_ACCESS,
    category: 'authenticated_transition',
    name: 'Acesso Pendente',
    requiresAuth: true,
    scope: 'organization',
    description: 'Aviso amigável de vínculo aguardando aprovação do administrador.',
  },

  // 4. Rotas Autenticadas Protegidas do Sistema
  {
    path: ROUTES.SYSTEM,
    category: 'authenticated_protected',
    name: 'Visão Geral do Sistema',
    requiresAuth: true,
    requiredPermissions: ['platform:view_overview', 'organization:view_overview'],
    scope: 'universal',
    description: 'Painel principal de visão geral e indicadores da plataforma ou organização.',
  },
  {
    path: ROUTES.CLIENTS,
    category: 'authenticated_protected',
    name: 'Clientes e Produtores Rurais',
    requiresAuth: true,
    requiredPermissions: 'clients:view',
    scope: 'organization',
    description: 'Gestão e acompanhamento cadastral de produtores rurais, pessoas físicas e jurídicas.',
  },
  {
    path: ROUTES.CLIENTS_NEW,
    category: 'authenticated_protected',
    name: 'Cadastrar Cliente',
    requiresAuth: true,
    requiredPermissions: 'clients:create',
    scope: 'organization',
    description: 'Formulário de cadastro de cliente ou produtor rural (PF/PJ).',
  },
  {
    path: ROUTES.CLIENTS_EDIT,
    category: 'authenticated_protected',
    name: 'Editar Cliente',
    requiresAuth: true,
    requiredPermissions: 'clients:edit',
    scope: 'organization',
    description: 'Formulário de edição e atualização cadastral de cliente ou produtor rural.',
  },
  {
    path: ROUTES.PROPERTIES,
    category: 'authenticated_protected',
    name: 'Imóveis Rurais e Urbanos',
    requiresAuth: true,
    requiredPermissions: 'properties:view',
    scope: 'organization',
    description: 'Gestão e organização territorial de imóveis rurais e urbanos vinculados aos clientes.',
  },
  {
    path: ROUTES.PROPERTIES_NEW,
    category: 'authenticated_protected',
    name: 'Cadastrar Imóvel',
    requiresAuth: true,
    requiredPermissions: 'properties:create',
    scope: 'organization',
    description: 'Formulário de cadastro de imóvel rural ou urbano com vínculos de clientes e matrículas.',
  },
  {
    path: ROUTES.PROPERTIES_EDIT,
    category: 'authenticated_protected',
    name: 'Editar Imóvel',
    requiresAuth: true,
    requiredPermissions: 'properties:edit',
    scope: 'organization',
    description: 'Formulário de edição e atualização cadastral e territorial de imóvel rural ou urbano.',
  },
  {
    path: ROUTES.PROPERTIES_GEOMETRY,
    category: 'authenticated_protected',
    name: 'Georreferenciamento e Geometria',
    requiresAuth: true,
    requiredPermissions: 'properties:geospatial:view',
    scope: 'organization',
    description: 'Gestão geoespacial, delimitação de glebas, polígonos e visualização perimetral do imóvel.',
  },
  {
    path: ROUTES.APPRAISALS,
    category: 'authenticated_protected',
    name: 'Laudos de Avaliação',
    requiresAuth: true,
    requiredPermissions: 'appraisals:view',
    scope: 'organization',
    description: 'Gestão, acompanhamento e elaboração de laudos de avaliação técnica de imóveis rurais e urbanos.',
  },
  {
    path: ROUTES.APPRAISAL_REQUESTS,
    category: 'authenticated_protected',
    name: 'Solicitações de Laudo',
    requiresAuth: true,
    requiredPermissions: ['appraisal_requests:view_related', 'appraisal_requests:view_queue'],
    scope: 'organization',
    description: 'Acompanhamento e gestão da fila e de pedidos de laudo de avaliação.',
  },
  {
    path: ROUTES.PROPOSALS,
    category: 'authenticated_protected',
    name: 'Propostas de Crédito e Serviços',
    requiresAuth: true,
    requiredPermissions: 'proposals:view',
    scope: 'organization',
    description: 'Gestão, elaboração e acompanhamento de propostas de crédito rural e prestação de serviços.',
  },
  {
    path: ROUTES.PROPOSALS_NEW,
    category: 'authenticated_protected',
    name: 'Cadastrar Proposta',
    requiresAuth: true,
    requiredPermissions: 'proposals:create',
    scope: 'organization',
    description: 'Formulário de elaboração e cadastro de nova proposta de crédito ou serviços técnicos.',
  },
  {
    path: ROUTES.PROPOSALS_QUEUE,
    category: 'authenticated_protected',
    name: 'Fila Comercial',
    requiresAuth: true,
    requiredPermissions: 'proposals:assign_review',
    scope: 'organization',
    description: 'Fila organizacional para atribuição e acompanhamento do pipeline comercial.',
  },
  {
    path: ROUTES.PROPOSALS_TRACKING,
    category: 'authenticated_protected',
    name: 'Acompanhamento Comercial',
    requiresAuth: true,
    requiredPermissions: 'proposals:view_commercial_tracking',
    scope: 'organization',
    description: 'Funil, prazos e acompanhamentos internos das propostas visíveis ao usuário.',
  },
  {
    path: ROUTES.PROPOSALS_HANDOFF_QUEUE,
    category: 'authenticated_protected',
    name: 'Fila de Encaminhamentos',
    requiresAuth: true,
    requiredPermissions: 'proposals:view_handoff_queue',
    scope: 'organization',
    description: 'Recebimento interno de encaminhamentos conforme a área operacional do usuário.',
  },
  {
    path: ROUTES.PROPOSALS_EDIT,
    category: 'authenticated_protected',
    name: 'Editar Proposta',
    requiresAuth: true,
    requiredPermissions: 'proposals:edit_draft',
    scope: 'organization',
    description: 'Formulário de edição e atualização de proposta existente.',
  },
  {
    path: ROUTES.PROPOSALS_REVIEW,
    category: 'authenticated_protected',
    name: 'Revisão Técnica da Proposta',
    requiresAuth: true,
    requiredPermissions: ['proposals:view_assigned', 'proposals:review'],
    scope: 'organization',
    description: 'Revisão acessível somente ao projetista atualmente atribuído.',
  },
  {
    path: ROUTES.PROPOSALS_HISTORY,
    category: 'authenticated_protected',
    name: 'Histórico da Proposta',
    requiresAuth: true,
    requiredPermissions: ['proposals:view', 'proposals:view_related', 'proposals:view_assigned'],
    scope: 'organization',
    description: 'Histórico cronológico e snapshots imutáveis da proposta.',
  },
  {
    path: ROUTES.PROPOSALS_DOCUMENT,
    category: 'authenticated_protected',
    name: 'Documento Comercial da Proposta',
    requiresAuth: true,
    requiredPermissions: 'proposals:view_document',
    scope: 'organization',
    description: 'Prévia A4 e impressão da projeção comercial imutável da proposta aprovada.',
  },
  {
    path: ROUTES.PROPOSALS_HANDOFF,
    category: 'authenticated_protected',
    name: 'Encaminhamento Operacional',
    requiresAuth: true,
    requiredPermissions: 'proposals:view_handoff',
    scope: 'organization',
    description: 'Referência imutável pós-aceite sem criação de contrato ou operação externa.',
  },
  {
    path: ROUTES.PROPOSALS_RENEW,
    category: 'authenticated_protected',
    name: 'Renovar Proposta Encerrada',
    requiresAuth: true,
    requiredPermissions: 'proposals:renew',
    scope: 'organization',
    description: 'Criação governada de novo rascunho sem reabrir a proposta encerrada.',
  },
  {
    path: ROUTES.PROPOSALS_DETAIL,
    category: 'authenticated_protected',
    name: 'Detalhes da Proposta',
    requiresAuth: true,
    requiredPermissions: ['proposals:view', 'proposals:view_related', 'proposals:view_assigned'],
    scope: 'organization',
    description: 'Visualização completa e detalhamento financeiro da proposta.',
  },
  {
    path: ROUTES.DOCUMENTS,
    category: 'authenticated_protected',
    name: 'Gestão Documental',
    requiresAuth: true,
    requiredPermissions: 'documents:view',
    scope: 'organization',
    description: 'Consulta de referências documentais canônicas e versionadas da organização.',
  },
  {
    path: ROUTES.DOCUMENTS_NEW,
    category: 'authenticated_protected',
    name: 'Registrar Referência Documental',
    requiresAuth: true,
    requiredPermissions: 'documents:register_reference',
    scope: 'organization',
    description: 'Registro exclusivo de metadados documentais vinculados a uma entidade canônica.',
  },
  {
    path: ROUTES.DOCUMENTS_DETAIL,
    category: 'authenticated_protected',
    name: 'Detalhes da Referência Documental',
    requiresAuth: true,
    requiredPermissions: 'documents:view',
    scope: 'organization',
    description: 'Metadados, versão e governança de uma referência documental autorizada.',
  },
  {
    path: ROUTES.MY_ACCOUNT,
    category: 'authenticated_protected',
    name: 'Minha Conta',
    requiresAuth: true,
    requiredPermissions: 'personal_account:view_profile',
    scope: 'universal',
    description: 'Gestão de perfil pessoal, dados de contato e segurança da conta.',
  },

  // 5. Rota de Feedback de Acesso
  {
    path: ROUTES.ACCESS_DENIED,
    category: 'access_feedback',
    name: 'Acesso Negado',
    requiresAuth: false,
    scope: 'universal',
    description: 'Feedback visual e amigável quando o usuário não possui credenciais suficientes.',
  },

  // 6. Rota Curinga de Não Encontrado
  {
    path: ROUTES.NOT_FOUND,
    category: 'public_neutral',
    name: 'Página Não Encontrada',
    requiresAuth: false,
    scope: 'universal',
    description: 'Tratamento de rotas inexistentes com navegação segura para a origem.',
  },
]);

export function findRouteDefinition(path: string): RouteDefinition | undefined {
  if (path === ROUTES.HOME) return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.HOME);

  const exactMatch = CENTRAL_ROUTE_MATRIX.find((r) => r.path === path);
  if (exactMatch) return exactMatch;

  if (/^\/clientes\/[^/]+\/editar$/.test(path)) {
    return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.CLIENTS_EDIT);
  }

  if (/^\/imoveis\/[^/]+\/editar$/.test(path)) {
    return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.PROPERTIES_EDIT);
  }

  if (/^\/imoveis\/[^/]+\/georreferenciamento$/.test(path)) {
    return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.PROPERTIES_GEOMETRY);
  }

  if (/^\/propostas\/[^/]+\/editar$/.test(path)) {
    return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.PROPOSALS_EDIT);
  }

  if (/^\/propostas\/[^/]+\/revisao$/.test(path)) {
    return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.PROPOSALS_REVIEW);
  }

  if (/^\/propostas\/[^/]+\/historico$/.test(path)) {
    return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.PROPOSALS_HISTORY);
  }

  if (/^\/propostas\/[^/]+\/documento$/.test(path)) {
    return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.PROPOSALS_DOCUMENT);
  }

  if (/^\/propostas\/[^/]+\/encaminhamento$/.test(path)) {
    return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.PROPOSALS_HANDOFF);
  }

  if (/^\/propostas\/[^/]+\/renovar$/.test(path)) {
    return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.PROPOSALS_RENEW);
  }

  if (/^\/propostas\/[^/]+$/.test(path)) {
    return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.PROPOSALS_DETAIL);
  }

  if (/^\/documentos\/[^/]+$/.test(path)) {
    return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.DOCUMENTS_DETAIL);
  }

  return CENTRAL_ROUTE_MATRIX.find((r) => r.path === ROUTES.NOT_FOUND);
}

export const getRouteDefinition = findRouteDefinition;
export const ROUTE_MATRIX = CENTRAL_ROUTE_MATRIX;

export function isProtectedRoute(path: string): boolean {
  const route = findRouteDefinition(path);
  return route ? route.requiresAuth : false;
}

export function getRequiredPermissionsForRoute(path: string): PermissionCode | PermissionCode[] | undefined {
  const route = findRouteDefinition(path);
  return route?.requiredPermissions;
}
