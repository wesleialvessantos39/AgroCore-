import {
  Permission,
  PermissionDefinition,
  PermissionScope,
  PermissionScopeGroup,
} from '../types/authorization';

/**
 * Metadados em português dos grupos/escopos de permissões
 */
export const PERMISSION_SCOPE_GROUPS: readonly PermissionScopeGroup[] = [
  {
    id: 'platform',
    name: 'Plataforma AgroCore',
    description: 'Governança institucional, auditoria e acompanhamento global da plataforma.',
    targetScope: 'platform',
  },
  {
    id: 'organization',
    name: 'Organização e Estrutura',
    description: 'Visão institucional, diretrizes de governança e configurações gerais da empresa.',
    targetScope: 'organization',
  },
  {
    id: 'personal_account',
    name: 'Conta Pessoal',
    description: 'Visualização de perfil individual e preferências de uso.',
    targetScope: 'personal',
  },
  {
    id: 'clients',
    name: 'Clientes e Produtores',
    description: 'Consulta, cadastro e atualização cadastral de produtores e propriedades rurais.',
    targetScope: 'organization',
  },
  {
    id: 'properties',
    name: 'Imóveis',
    description: 'Consulta, cadastro e atualização de imóveis rurais e urbanos vinculados aos clientes.',
    targetScope: 'organization',
  },
  {
    id: 'appraisals',
    name: 'Laudos de Avaliação',
    description: 'Elaboração, análise técnica e emissão de laudos de avaliação de imóveis rurais e urbanos.',
    targetScope: 'organization',
  },
  {
    id: 'appraisal_requests',
    name: 'Solicitações de Laudo',
    description: 'Abertura, triagem, acompanhamento e documentação preliminar de pedidos de laudo.',
    targetScope: 'organization',
  },
  {
    id: 'technical_professionals',
    name: 'Habilitação Profissional Técnica',
    description: 'Gestão e conferência de registros técnicos em conselhos de classe (CREA/CAU/CFT).',
    targetScope: 'organization',
  },
  {
    id: 'proposals',
    name: 'Propostas de Crédito',
    description: 'Elaboração, consulta e acompanhamento do fluxo de propostas de crédito rural.',
    targetScope: 'organization',
  },
  {
    id: 'documents',
    name: 'Documentação Rural',
    description: 'Envio, conferência e gestão de certidões, matrículas e laudos técnicos.',
    targetScope: 'organization',
  },
  {
    id: 'surveys_and_visits',
    name: 'Vistorias e Visitas Técnicas',
    description: 'Agendamento, acompanhamento e registro de visitas a campo e laudos agronômicos.',
    targetScope: 'organization',
  },
  {
    id: 'schedule',
    name: 'Agenda Operacional',
    description: 'Planejamento e coordenação de compromissos operacionais e prazos bancários.',
    targetScope: 'organization',
  },
  {
    id: 'fleet',
    name: 'Frota e Deslocamentos',
    description: 'Controle de veículos e deslocamentos para atendimentos e vistorias.',
    targetScope: 'organization',
  },
  {
    id: 'finance',
    name: 'Gestão Financeira',
    description: 'Acompanhamento de receitas, honorários, repasses e operações financeiras.',
    targetScope: 'organization',
  },
  {
    id: 'users_and_access',
    name: 'Usuários e Permissões',
    description: 'Visualização da equipe e administração de acessos da organização.',
    targetScope: 'organization',
  },
  {
    id: 'audit',
    name: 'Auditoria e Rastreabilidade',
    description: 'Acompanhamento de registros de integridade, eventos e conformidade regulatória.',
    targetScope: 'organization',
  },
] as const;

/**
 * Catálogo central e imutável de todas as permissões do sistema
 */
export const PERMISSIONS_CATALOG: readonly PermissionDefinition[] = [
  // Plataforma (Superadministrador)
  {
    id: 'platform:view_overview',
    scope: 'platform',
    targetScope: 'platform',
    name: 'Visão Geral Global',
    description: 'Acessar o painel consolidado com métricas globais e status da plataforma.',
  },
  {
    id: 'platform:view_organizations',
    scope: 'platform',
    targetScope: 'platform',
    name: 'Acompanhamento de Organizações',
    description: 'Visualizar a relação institucional de organizações cadastradas na plataforma.',
  },
  {
    id: 'platform:view_audit',
    scope: 'platform',
    targetScope: 'platform',
    name: 'Auditoria da Plataforma',
    description: 'Consultar trilhas de eventos de governança e integridade global do sistema.',
  },
  {
    id: 'platform:manage_governance',
    scope: 'platform',
    targetScope: 'platform',
    name: 'Governança da Plataforma',
    description: 'Gerenciar políticas globais e diretrizes operacionais do ecossistema.',
  },

  // Organização
  {
    id: 'organization:view_overview',
    scope: 'organization',
    targetScope: 'organization',
    name: 'Visão Geral da Organização',
    description: 'Acessar o painel de indicadores e acompanhamento da própria empresa.',
  },
  {
    id: 'organization:view_settings',
    scope: 'organization',
    targetScope: 'organization',
    name: 'Consultar Configurações',
    description: 'Visualizar dados cadastrais e parâmetros operacionais da organização.',
  },
  {
    id: 'organization:manage_settings',
    scope: 'organization',
    targetScope: 'organization',
    name: 'Gerenciar Configurações',
    description: 'Alterar parâmetros cadastrais e operacionais da organização.',
  },
  {
    id: 'organization:manage_governance',
    scope: 'organization',
    targetScope: 'organization',
    name: 'Governança Organizacional',
    description: 'Administrar diretrizes estruturais e atos societários da empresa.',
  },

  // Conta Pessoal
  {
    id: 'personal_account:view_profile',
    scope: 'personal_account',
    targetScope: 'personal',
    name: 'Visualizar Perfil',
    description: 'Consultar dados do próprio usuário, atribuições e organização vinculada.',
  },
  {
    id: 'personal_account:manage_preferences',
    scope: 'personal_account',
    targetScope: 'personal',
    name: 'Preferências Pessoais',
    description: 'Ajustar opções individuais de visualização e navegação.',
  },

  // Clientes e Produtores
  {
    id: 'clients:view',
    scope: 'clients',
    targetScope: 'organization',
    name: 'Consultar Clientes',
    description: 'Visualizar produtores rurais, propriedades e históricos cadastrais.',
  },
  {
    id: 'clients:create',
    scope: 'clients',
    targetScope: 'organization',
    name: 'Cadastrar Clientes',
    description: 'Registrar novos produtores rurais e dados preliminares de propriedades.',
  },
  {
    id: 'clients:edit',
    scope: 'clients',
    targetScope: 'organization',
    name: 'Atualizar Clientes',
    description: 'Atualizar informações de contato, dados cadastrais e certidões de clientes.',
  },
  {
    id: 'client_capturer_assignments:view',
    scope: 'clients',
    targetScope: 'organization',
    name: 'Consultar Vínculos de Captador',
    description: 'Visualizar o captador responsável e o histórico de transferências do cliente.',
  },
  {
    id: 'client_capturer_assignments:manage',
    scope: 'clients',
    targetScope: 'organization',
    name: 'Gerenciar Vínculos de Captador',
    description: 'Atribuir, transferir responsabilidade e encerrar vínculos de captador para clientes.',
  },

  // Imóveis Rurais e Urbanos
  {
    id: 'properties:view',
    scope: 'properties',
    targetScope: 'organization',
    name: 'Consultar Imóveis',
    description: 'Visualizar imóveis rurais e urbanos vinculados aos clientes da organização.',
  },
  {
    id: 'properties:create',
    scope: 'properties',
    targetScope: 'organization',
    name: 'Cadastrar Imóveis',
    description: 'Cadastrar novos imóveis rurais e urbanos e vincular produtores.',
  },
  {
    id: 'properties:edit',
    scope: 'properties',
    targetScope: 'organization',
    name: 'Atualizar Imóveis',
    description: 'Atualizar dados cadastrais, documentais e vínculos de imóveis rurais e urbanos.',
  },
  {
    id: 'properties:geospatial:view',
    scope: 'properties',
    targetScope: 'organization',
    name: 'Consultar Geometria e Polígonos',
    description: 'Visualizar glebas, parcelas, vértices, limites e métricas espaciais do imóvel.',
  },
  {
    id: 'properties:geospatial:edit',
    scope: 'properties',
    targetScope: 'organization',
    name: 'Editar Geometria e Polígonos',
    description: 'Cadastrar, atualizar e organizar glebas, parcelas, vértices e limites do imóvel.',
  },

  // Laudos de Avaliação (Módulo 004)
  {
    id: 'appraisals:view',
    scope: 'appraisals',
    targetScope: 'organization',
    name: 'Consultar Laudos de Avaliação',
    description: 'Visualizar laudos de avaliação, versões técnicas e histórico de elaboração.',
  },
  {
    id: 'appraisals:view_assigned',
    scope: 'appraisals',
    targetScope: 'organization',
    name: 'Consultar Laudos Atribuídos',
    description: 'Visualizar laudos de avaliação sob responsabilidade técnica própria.',
  },
  {
    id: 'appraisals:create',
    scope: 'appraisals',
    targetScope: 'organization',
    name: 'Elaborar Laudos de Avaliação',
    description: 'Iniciar a elaboração de novos laudos de avaliação técnica de imóveis.',
  },
  {
    id: 'appraisals:edit',
    scope: 'appraisals',
    targetScope: 'organization',
    name: 'Editar Laudos de Avaliação',
    description: 'Atualizar coletas, vistorias, metodologias e análises do laudo em elaboração.',
  },
  {
    id: 'appraisals:edit_assigned',
    scope: 'appraisals',
    targetScope: 'organization',
    name: 'Editar Laudos Próprios',
    description: 'Atualizar dossiê técnico e cálculos de laudos sob responsabilidade técnica própria.',
  },
  {
    id: 'appraisals:review',
    scope: 'appraisals',
    targetScope: 'organization',
    name: 'Revisar Laudos Técnicos',
    description: 'Realizar revisão técnica paritária, emitir pareceres e apontar pendências.',
  },
  {
    id: 'appraisals:issue',
    scope: 'appraisals',
    targetScope: 'organization',
    name: 'Emitir Laudos de Avaliação',
    description: 'Finalizar formalmente e emitir a versão oficial do laudo pericial.',
  },
  {
    id: 'appraisals:view_status_related',
    scope: 'appraisals',
    targetScope: 'organization',
    name: 'Acompanhar Andamento do Laudo',
    description: 'Visualizar situação e marcos de laudos originados de solicitações próprias.',
  },

  // Solicitações de Laudo (Módulo 004)
  {
    id: 'appraisal_requests:create',
    scope: 'appraisal_requests',
    targetScope: 'organization',
    name: 'Solicitar Laudo de Avaliação',
    description: 'Abrir pedido de laudo com indicação de cliente, imóvel e finalidade.',
  },
  {
    id: 'appraisal_requests:view_related',
    scope: 'appraisal_requests',
    targetScope: 'organization',
    name: 'Consultar Próprias Solicitações',
    description: 'Visualizar as solicitações de laudo criadas pelo próprio usuário.',
  },
  {
    id: 'appraisal_requests:view_queue',
    scope: 'appraisal_requests',
    targetScope: 'organization',
    name: 'Consultar Fila de Solicitações',
    description: 'Acessar a fila geral de solicitações de laudo da organização.',
  },
  {
    id: 'appraisal_requests:view_assigned',
    scope: 'appraisal_requests',
    targetScope: 'organization',
    name: 'Consultar Solicitações Atribuídas',
    description: 'Visualizar as solicitações de laudo atribuídas ao usuário logado.',
  },
  {
    id: 'appraisal_requests:assign',
    scope: 'appraisal_requests',
    targetScope: 'organization',
    name: 'Atribuir Responsável Técnico',
    description: 'Definir o projetista responsável pelo atendimento da solicitação de laudo.',
  },
  {
    id: 'appraisal_requests:upload_documents',
    scope: 'appraisal_requests',
    targetScope: 'organization',
    name: 'Enviar Documentos da Solicitação',
    description: 'Anexar certidões, fotos preliminares e documentos ao pedido de laudo.',
  },

  // Perfis Profissionais Técnicos (Módulo 004)
  {
    id: 'technical_professionals:view_self',
    scope: 'technical_professionals',
    targetScope: 'organization',
    name: 'Consultar Próprio Perfil Técnico',
    description: 'Visualizar dados de registro profissional, conselho de classe e situação cadastral do próprio usuário.',
  },
  {
    id: 'technical_professionals:update_self',
    scope: 'technical_professionals',
    targetScope: 'organization',
    name: 'Declarar ou Atualizar Próprio Cadastro Técnico',
    description: 'Preencher ou retificar dados declaratórios de conselho, número de registro e títulos profissionais.',
  },
  {
    id: 'technical_professionals:verify',
    scope: 'technical_professionals',
    targetScope: 'organization',
    name: 'Verificar Administrativamente Perfil Técnico',
    description: 'Homologar administrativamente a conformidade dos registros profissionais com trilha de auditoria.',
  },
  {
    id: 'technical_professionals:manage_capabilities',
    scope: 'technical_professionals',
    targetScope: 'organization',
    name: 'Administrar Capacidades Técnicas Verificadas',
    description: 'Atribuir, suspender ou revogar capacidades técnicas verificadas (rural/urbano) da equipe técnica.',
  },

  // Propostas de Crédito e Serviços Técnicos (Módulo 005)
  {
    id: 'proposals:view',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Consultar Propostas',
    description: 'Acompanhar a esteira, histórico de status e pareceres de propostas.',
  },
  {
    id: 'proposals:view_related',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Consultar Propostas Vinculadas',
    description: 'Visualizar propostas vinculadas a clientes sob responsabilidade do usuário.',
  },
  {
    id: 'proposals:view_assigned',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Consultar Propostas Atribuídas',
    description: 'Visualizar somente propostas atribuídas ao usuário para revisão técnica.',
  },
  {
    id: 'proposals:view_financials',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Consultar Condições Financeiras',
    description: 'Acessar taxas, amortizações, projeções de juros e resumos de cálculo.',
  },
  {
    id: 'proposals:create',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Cadastrar Propostas',
    description: 'Iniciar elaboração de nova proposta com dados cadastrais e financeiros.',
  },
  {
    id: 'proposals:edit_draft',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Editar Rascunhos e Ajustes',
    description: 'Editar dados técnicos e financeiros em rascunhos e propostas em ajuste.',
  },
  {
    id: 'proposals:submit',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Submeter Propostas',
    description: 'Submeter propostas para análise comercial e revisão técnica.',
  },
  {
    id: 'proposals:assign_review',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Atribuir Revisor Técnico',
    description: 'Designar ou redistribuir responsável técnico para revisão da proposta.',
  },
  {
    id: 'proposals:review',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Revisar Proposta Técnica',
    description: 'Iniciar revisão técnica, apontar correções e emitir parecer.',
  },
  {
    id: 'proposals:approve',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Aprovar Propostas',
    description: 'Aprovar formalmente a proposta comercial e técnica para apresentação.',
  },
  {
    id: 'proposals:present',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Registrar Apresentação ao Cliente',
    description: 'Registrar canal e data de apresentação da proposta aprovada ao cliente.',
  },
  {
    id: 'proposals:record_decision',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Registrar Decisão do Cliente',
    description: 'Registrar formalmente o aceite ou declínio da proposta pelo cliente.',
  },
  {
    id: 'proposals:cancel',
    scope: 'proposals',
    targetScope: 'organization',
    name: 'Cancelar Propostas',
    description: 'Cancelar propostas em andamento registrando justificativa operacional.',
  },

  // Documentos
  {
    id: 'documents:view',
    scope: 'documents',
    targetScope: 'organization',
    name: 'Consultar Documentos',
    description: 'Visualizar e conferir certidões, laudos e documentos técnicos anexados.',
  },
  {
    id: 'documents:upload',
    scope: 'documents',
    targetScope: 'organization',
    name: 'Enviar Documentos',
    description: 'Realizar upload de documentos comprobatórios e arquivos de suporte.',
  },
  {
    id: 'documents:manage',
    scope: 'documents',
    targetScope: 'organization',
    name: 'Gerenciar Documentos',
    description: 'Organizar, validar e gerenciar a validade do repositório documental.',
  },

  // Vistorias e Visitas
  {
    id: 'surveys_and_visits:view',
    scope: 'surveys_and_visits',
    targetScope: 'organization',
    name: 'Consultar Vistorias',
    description: 'Acompanhar relatórios e cronogramas de visitas e laudos periciais.',
  },
  {
    id: 'surveys_and_visits:schedule',
    scope: 'surveys_and_visits',
    targetScope: 'organization',
    name: 'Agendar Vistorias',
    description: 'Agendar vistorias agronômicas e visitas técnicas a campo.',
  },
  {
    id: 'surveys_and_visits:execute',
    scope: 'surveys_and_visits',
    targetScope: 'organization',
    name: 'Registrar Laudos de Vistoria',
    description: 'Preencher laudos técnicos, coordenadas e registros fotográficos da área.',
  },

  // Agenda
  {
    id: 'schedule:view',
    scope: 'schedule',
    targetScope: 'organization',
    name: 'Consultar Agenda',
    description: 'Visualizar compromissos operacionais, prazos bancários e visitas.',
  },
  {
    id: 'schedule:manage',
    scope: 'schedule',
    targetScope: 'organization',
    name: 'Gerenciar Agenda',
    description: 'Criar, reagendar e gerenciar eventos operacionais da equipe.',
  },

  // Frota
  {
    id: 'fleet:view',
    scope: 'fleet',
    targetScope: 'organization',
    name: 'Consultar Frota',
    description: 'Verificar disponibilidade de veículos para deslocamentos técnicos.',
  },
  {
    id: 'fleet:manage',
    scope: 'fleet',
    targetScope: 'organization',
    name: 'Gerenciar Frota',
    description: 'Administrar agendamentos de uso e controle de veículos.',
  },

  // Financeiro
  {
    id: 'finance:view_overview',
    scope: 'finance',
    targetScope: 'organization',
    name: 'Visão Financeira',
    description: 'Consultar indicadores financeiros e faturamento de projetos.',
  },
  {
    id: 'finance:view_records',
    scope: 'finance',
    targetScope: 'organization',
    name: 'Consultar Registros Financeiros',
    description: 'Acessar extratos detalhados, honorários e contas a receber.',
  },
  {
    id: 'finance:manage_operations',
    scope: 'finance',
    targetScope: 'organization',
    name: 'Gerenciar Finanças',
    description: 'Aprovar baixas, faturamentos e conciliações financeiras.',
  },

  // Usuários e Acessos
  {
    id: 'users_and_access:view',
    scope: 'users_and_access',
    targetScope: 'organization',
    name: 'Consultar Equipe',
    description: 'Visualizar os membros da equipe e seus papéis na organização.',
  },
  {
    id: 'users_and_access:manage',
    scope: 'users_and_access',
    targetScope: 'organization',
    name: 'Gerenciar Acessos',
    description: 'Administrar vínculos de membros e convites na organização.',
  },
  {
    id: 'users_and_access:manage_roles',
    scope: 'users_and_access',
    targetScope: 'organization',
    name: 'Administrar Perfis de Acesso',
    description: 'Atribuir e alterar papéis de membros na empresa.',
  },

  // Auditoria
  {
    id: 'audit:view_organization',
    scope: 'audit',
    targetScope: 'organization',
    name: 'Auditoria da Organização',
    description: 'Consultar trilhas de eventos e histórico de ações na empresa.',
  },
  {
    id: 'audit:view_platform',
    scope: 'audit',
    targetScope: 'platform',
    name: 'Auditoria da Plataforma',
    description: 'Consultar logs globais de segurança e governança sistêmica.',
  },
] as const;

export const PERMISSION_BY_ID_MAP: ReadonlyMap<Permission, PermissionDefinition> = new Map(
  PERMISSIONS_CATALOG.map((def) => [def.id, def])
);

export const SCOPE_GROUP_BY_ID_MAP: ReadonlyMap<PermissionScope, PermissionScopeGroup> = new Map(
  PERMISSION_SCOPE_GROUPS.map((group) => [group.id, group])
);

export function isValidPermission(permission: unknown): permission is Permission {
  return typeof permission === 'string' && PERMISSION_BY_ID_MAP.has(permission as Permission);
}
