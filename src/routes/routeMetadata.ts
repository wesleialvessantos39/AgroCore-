import { ROUTES } from './paths';

export interface RouteMetadata {
  documentTitle: string;
  announcementTitle: string;
}

export const ROUTE_METADATA_MAP: Record<string, RouteMetadata> = {
  [ROUTES.SIGN_IN]: {
    documentTitle: 'Acessar o AgroCore | AgroCore',
    announcementTitle: 'Acessar o AgroCore',
  },
  [ROUTES.RECOVER_ACCESS]: {
    documentTitle: 'Recuperar Acesso | AgroCore',
    announcementTitle: 'Recuperar acesso ao sistema',
  },
  [ROUTES.RESET_PASSWORD]: {
    documentTitle: 'Atualizar Senha | AgroCore',
    announcementTitle: 'Atualização de senha',
  },
  [ROUTES.SYSTEM]: {
    documentTitle: 'Visão geral | AgroCore',
    announcementTitle: 'Visão geral',
  },
  [ROUTES.CLIENTS]: {
    documentTitle: 'Clientes e Produtores | AgroCore',
    announcementTitle: 'Clientes e produtores rurais',
  },
  [ROUTES.CLIENTS_NEW]: {
    documentTitle: 'Cadastrar Cliente | AgroCore',
    announcementTitle: 'Cadastrar cliente ou produtor rural',
  },
  [ROUTES.CLIENTS_EDIT]: {
    documentTitle: 'Editar Cliente | AgroCore',
    announcementTitle: 'Editar cliente ou produtor rural',
  },
  [ROUTES.PROPERTIES]: {
    documentTitle: 'Imóveis Rurais e Urbanos | AgroCore',
    announcementTitle: 'Imóveis rurais e urbanos',
  },
  [ROUTES.PROPERTIES_NEW]: {
    documentTitle: 'Cadastrar Imóvel | AgroCore',
    announcementTitle: 'Cadastrar imóvel rural ou urbano',
  },
  [ROUTES.PROPERTIES_EDIT]: {
    documentTitle: 'Editar Imóvel | AgroCore',
    announcementTitle: 'Editar imóvel rural ou urbano',
  },
  [ROUTES.PROPERTIES_GEOMETRY]: {
    documentTitle: 'Georreferenciamento do Imóvel | AgroCore',
    announcementTitle: 'Georreferenciamento e polígonos do imóvel',
  },
  [ROUTES.APPRAISALS]: {
    documentTitle: 'Laudos de Avaliação | AgroCore',
    announcementTitle: 'Laudos de avaliação',
  },
  [ROUTES.APPRAISAL_REQUESTS]: {
    documentTitle: 'Solicitações de Laudo | AgroCore',
    announcementTitle: 'Solicitações de laudo',
  },
  [ROUTES.PROPOSALS]: {
    documentTitle: 'Propostas de Crédito e Serviços | AgroCore',
    announcementTitle: 'Propostas de crédito e serviços',
  },
  [ROUTES.PROPOSALS_NEW]: {
    documentTitle: 'Cadastrar Proposta | AgroCore',
    announcementTitle: 'Cadastrar proposta',
  },
  [ROUTES.PROPOSALS_QUEUE]: {
    documentTitle: 'Fila Comercial | AgroCore',
    announcementTitle: 'Fila comercial de propostas',
  },
  [ROUTES.PROPOSALS_TRACKING]: {
    documentTitle: 'Acompanhamento Comercial | AgroCore',
    announcementTitle: 'Acompanhamento comercial de propostas',
  },
  [ROUTES.PROPOSALS_HANDOFF_QUEUE]: {
    documentTitle: 'Fila de Encaminhamentos | AgroCore',
    announcementTitle: 'Fila de encaminhamentos operacionais',
  },
  [ROUTES.PROPOSALS_EDIT]: {
    documentTitle: 'Editar Proposta | AgroCore',
    announcementTitle: 'Editar proposta',
  },
  [ROUTES.PROPOSALS_DETAIL]: {
    documentTitle: 'Detalhes da Proposta | AgroCore',
    announcementTitle: 'Detalhes da proposta',
  },
  [ROUTES.PROPOSALS_REVIEW]: {
    documentTitle: 'Revisão da Proposta | AgroCore',
    announcementTitle: 'Revisão técnica da proposta',
  },
  [ROUTES.PROPOSALS_HISTORY]: {
    documentTitle: 'Histórico da Proposta | AgroCore',
    announcementTitle: 'Histórico da proposta',
  },
  [ROUTES.PROPOSALS_DOCUMENT]: {
    documentTitle: 'Documento Comercial da Proposta | AgroCore',
    announcementTitle: 'Documento comercial da proposta',
  },
  [ROUTES.PROPOSALS_HANDOFF]: {
    documentTitle: 'Encaminhamento Operacional | AgroCore',
    announcementTitle: 'Encaminhamento operacional da proposta',
  },
  [ROUTES.PROPOSALS_RENEW]: {
    documentTitle: 'Renovar Proposta | AgroCore',
    announcementTitle: 'Criar nova proposta vinculada',
  },
  [ROUTES.DOCUMENTS]: {
    documentTitle: 'Documentos | AgroCore',
    announcementTitle: 'Documentos',
  },
  [ROUTES.DOCUMENTS_NEW]: {
    documentTitle: 'Enviar Documentos | AgroCore',
    announcementTitle: 'Enviar documentos',
  },
  [ROUTES.DOCUMENT_REQUIREMENTS]: {
    documentTitle: 'Pendências e Prazos | AgroCore',
    announcementTitle: 'Pendências e prazos de documentos',
  },
  [ROUTES.DOCUMENT_REQUIREMENTS_NEW]: {
    documentTitle: 'Nova Pendência de Documento | AgroCore',
    announcementTitle: 'Criar pendência de documento',
  },
  [ROUTES.DOCUMENTS_DETAIL]: {
    documentTitle: 'Documento | AgroCore',
    announcementTitle: 'Detalhes do documento',
  },
  [ROUTES.MY_ACCOUNT]: {
    documentTitle: 'Minha Conta | AgroCore',
    announcementTitle: 'Minha conta',
  },
  [ROUTES.ACCESS_DENIED]: {
    documentTitle: 'Acesso Negado | AgroCore',
    announcementTitle: 'Acesso não autorizado',
  },
  [ROUTES.CONFIG_ORGANIZATION]: {
    documentTitle: 'Configurar Organização | AgroCore',
    announcementTitle: 'Configuração inicial da organização',
  },
  [ROUTES.SELECT_ORGANIZATION]: {
    documentTitle: 'Selecionar Organização | AgroCore',
    announcementTitle: 'Selecionar organização',
  },
  [ROUTES.PENDING_ACCESS]: {
    documentTitle: 'Acesso Pendente | AgroCore',
    announcementTitle: 'Acesso aguardando aprovação',
  },
  [ROUTES.PRESENTATION]: {
    documentTitle: 'Apresentação Institucional | AgroCore',
    announcementTitle: 'Apresentação institucional',
  },
};

export const DEFAULT_ROUTE_METADATA: RouteMetadata = {
  documentTitle: 'AgroCore — Plataforma de Gestão Cadastral e Territorial',
  announcementTitle: 'AgroCore',
};

export function getRouteMetadata(pathname: string): RouteMetadata {
  // 1. Correspondência direta exata
  if (ROUTE_METADATA_MAP[pathname]) {
    return ROUTE_METADATA_MAP[pathname];
  }

  // 2. Correspondência para rotas parametrizadas
  if (/^\/clientes\/[^/]+\/editar$/.test(pathname)) {
    return ROUTE_METADATA_MAP[ROUTES.CLIENTS_EDIT];
  }

  if (/^\/imoveis\/[^/]+\/editar$/.test(pathname)) {
    return ROUTE_METADATA_MAP[ROUTES.PROPERTIES_EDIT];
  }

  if (/^\/imoveis\/[^/]+\/georreferenciamento$/.test(pathname)) {
    return ROUTE_METADATA_MAP[ROUTES.PROPERTIES_GEOMETRY];
  }

  if (/^\/propostas\/[^/]+\/editar$/.test(pathname)) {
    return ROUTE_METADATA_MAP[ROUTES.PROPOSALS_EDIT];
  }

  if (/^\/propostas\/[^/]+\/revisao$/.test(pathname)) {
    return ROUTE_METADATA_MAP[ROUTES.PROPOSALS_REVIEW];
  }

  if (/^\/propostas\/[^/]+\/historico$/.test(pathname)) {
    return ROUTE_METADATA_MAP[ROUTES.PROPOSALS_HISTORY];
  }

  if (/^\/propostas\/[^/]+\/documento$/.test(pathname)) {
    return ROUTE_METADATA_MAP[ROUTES.PROPOSALS_DOCUMENT];
  }

  if (/^\/propostas\/[^/]+\/encaminhamento$/.test(pathname)) {
    return ROUTE_METADATA_MAP[ROUTES.PROPOSALS_HANDOFF];
  }

  if (/^\/propostas\/[^/]+\/renovar$/.test(pathname)) {
    return ROUTE_METADATA_MAP[ROUTES.PROPOSALS_RENEW];
  }

  if (/^\/propostas\/[^/]+$/.test(pathname)) {
    return ROUTE_METADATA_MAP[ROUTES.PROPOSALS_DETAIL];
  }

  if (/^\/documentos\/[^/]+$/.test(pathname)) {
    return ROUTE_METADATA_MAP[ROUTES.DOCUMENTS_DETAIL];
  }

  // 3. Fallback seguro
  return DEFAULT_ROUTE_METADATA;
}
