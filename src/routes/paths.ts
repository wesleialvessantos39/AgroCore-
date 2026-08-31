export const ROUTES = {
  HOME: '/',
  SIGN_IN: '/entrar',
  RECOVER_ACCESS: '/recuperar-acesso',
  RESET_PASSWORD: '/atualizar-senha',
  SYSTEM: '/sistema',
  CLIENTS: '/clientes',
  CLIENTS_NEW: '/clientes/novo',
  CLIENTS_EDIT: '/clientes/:clientId/editar',
  PROPERTIES: '/imoveis',
  PROPERTIES_NEW: '/imoveis/novo',
  PROPERTIES_EDIT: '/imoveis/:propertyId/editar',
  PROPERTIES_GEOMETRY: '/imoveis/:propertyId/georreferenciamento',
  APPRAISALS: '/laudos',
  APPRAISALS_DETAIL: '/laudos/:appraisalId',
  APPRAISAL_REQUESTS: '/solicitacoes-de-laudo',
  APPRAISAL_REQUESTS_NEW: '/solicitacoes-de-laudo/nova',
  APPRAISAL_REQUESTS_DETAIL: '/solicitacoes-de-laudo/:requestId',
  PROPOSALS: '/propostas',
  PROPOSALS_NEW: '/propostas/novo',
  PROPOSALS_QUEUE: '/propostas/fila',
  PROPOSALS_TRACKING: '/propostas/acompanhamento',
  PROPOSALS_HANDOFF_QUEUE: '/propostas/encaminhamentos',
  PROPOSALS_EDIT: '/propostas/:proposalId/editar',
  PROPOSALS_REVIEW: '/propostas/:proposalId/revisao',
  PROPOSALS_HISTORY: '/propostas/:proposalId/historico',
  PROPOSALS_DOCUMENT: '/propostas/:proposalId/documento',
  PROPOSALS_HANDOFF: '/propostas/:proposalId/encaminhamento',
  PROPOSALS_RENEW: '/propostas/:proposalId/renovar',
  PROPOSALS_DETAIL: '/propostas/:proposalId',
  MY_ACCOUNT: '/minha-conta',
  ACCESS_DENIED: '/acesso-negado',
  CONFIG_ORGANIZATION: '/configurar-empresa',
  SELECT_ORGANIZATION: '/selecionar-empresa',
  PENDING_ACCESS: '/acesso-pendente',
  PRESENTATION: '/apresentacao',
  NOT_FOUND: '*',
} as const;

export type AppRoute = typeof ROUTES[keyof typeof ROUTES];

export function getClientEditPath(clientId: string): string {
  return `/clientes/${encodeURIComponent(clientId)}/editar`;
}

export function getPropertyEditPath(propertyId: string): string {
  return `/imoveis/${encodeURIComponent(propertyId)}/editar`;
}

export function getPropertyGeometryPath(propertyId: string): string {
  return `/imoveis/${encodeURIComponent(propertyId)}/georreferenciamento`;
}

export function getProposalEditPath(proposalId: string): string {
  return `/propostas/${encodeURIComponent(proposalId)}/editar`;
}

export function getProposalDetailPath(proposalId: string): string {
  return `/propostas/${encodeURIComponent(proposalId)}`;
}

export function getProposalReviewPath(proposalId: string): string {
  return `/propostas/${encodeURIComponent(proposalId)}/revisao`;
}

export function getProposalHistoryPath(proposalId: string): string {
  return `/propostas/${encodeURIComponent(proposalId)}/historico`;
}

export function getProposalDocumentPath(proposalId: string): string {
  return `/propostas/${encodeURIComponent(proposalId)}/documento`;
}

export function getProposalHandoffPath(proposalId: string): string {
  return `/propostas/${encodeURIComponent(proposalId)}/encaminhamento`;
}

export function getProposalRenewalPath(proposalId: string): string {
  return `/propostas/${encodeURIComponent(proposalId)}/renovar`;
}

export function getAppraisalDetailPath(appraisalId: string): string {
  return `/laudos/${encodeURIComponent(appraisalId)}`;
}

export function getAppraisalRequestDetailPath(requestId: string): string {
  return `/solicitacoes-de-laudo/${encodeURIComponent(requestId)}`;
}
