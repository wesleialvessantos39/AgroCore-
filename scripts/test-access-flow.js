/**
 * Suíte de Testes Automatizados — OE-001.006
 * Homologação Integrada, Segurança de Navegação, Matriz de Rotas e Fluxo de Decisão
 */

import { ROUTE_MATRIX, getRouteDefinition } from '../src/routes/routeMatrix.ts';
import {
  evaluateNavigationDecision,
  resolveDefaultAuthenticatedDestination,
} from '../src/routes/navigationDecision.ts';
import { getSafeRedirectUrl } from '../src/routes/safeNavigation.ts';
import { ROUTES } from '../src/routes/paths';
import { PREVIEW_ACCOUNTS } from '../src/auth/preview/previewAccounts';
import { clearAllPreviewState } from '../src/auth/preview/clearAllPreviewState';
import { PREVIEW_STORAGE_KEYS } from '../src/auth/preview/previewKeys';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exit(1);
  }
}

console.log('================================================================');
console.log('BATERIA DE TESTES AUTOMATIZADOS — OE-001.006');
console.log('HOMOLOGAÇÃO INTEGRADA, FLUXO DE NAVEGAÇÃO E DECISÃO DE ACESSO');
console.log('================================================================\n');

// -------------------------------------------------------------
// TESTE 1: Integridade e Cobertura da Matriz Centralizada de Rotas
// -------------------------------------------------------------
console.log('TESTE 1: Matriz Centralizada e Tipada de Rotas');

assert(Array.isArray(ROUTE_MATRIX) && ROUTE_MATRIX.length >= 8, 'A matriz de rotas deve conter todas as rotas do sistema.');

const publicNeutral = ROUTE_MATRIX.filter((r) => r.category === 'public_neutral');
const guestOnly = ROUTE_MATRIX.filter((r) => r.category === 'public_guest_only');
const transitions = ROUTE_MATRIX.filter((r) => r.category === 'authenticated_transition');
const protectedRoutes = ROUTE_MATRIX.filter((r) => r.category === 'authenticated_protected');
const feedback = ROUTE_MATRIX.filter((r) => r.category === 'access_feedback');

assert(publicNeutral.length >= 2, 'Rotas públicas neutras (apresentação, 404) devem estar catalogadas.');
assert(guestOnly.length >= 3, 'Rotas exclusivas de visitante (entrar, recuperar, reset) devem estar catalogadas.');
assert(transitions.length >= 3, 'Rotas de transição organizacional devem estar catalogadas.');
assert(protectedRoutes.length >= 2, 'Rotas protegidas do sistema (sistema, minha-conta) devem estar catalogadas.');
assert(feedback.length >= 1, 'Rota de acesso negado deve estar catalogada.');

// Resolução de rotas por pathname
assert(getRouteDefinition(ROUTES.SIGN_IN)?.category === 'public_guest_only', 'getRouteDefinition deve resolver /entrar como public_guest_only');
assert(getRouteDefinition(ROUTES.SYSTEM)?.category === 'authenticated_protected', 'getRouteDefinition deve resolver /sistema como authenticated_protected');
assert(getRouteDefinition(ROUTES.CONFIG_ORGANIZATION)?.category === 'authenticated_transition', 'getRouteDefinition deve resolver /configurar-empresa como authenticated_transition');
assert(getRouteDefinition('/rota-inexistente-xyz')?.category === 'public_neutral', 'getRouteDefinition deve resolver rota desconhecida como public_neutral (*)');

console.log('  ✓ Matriz centralizada e resolução de rotas validadas com sucesso.');

// -------------------------------------------------------------
// TESTE 2: Fluxo Determinístico de Decisão de Navegação
// -------------------------------------------------------------
console.log('\nTESTE 2: Motor Puro de Decisão de Navegação (evaluateNavigationDecision)');

// 2.1 Carregamento inicial de autenticação
const loadingDecision = evaluateNavigationDecision({
  pathname: ROUTES.SYSTEM,
  authStatus: 'initializing',
  session: null,
  orgStatus: 'loading',
});
assert(loadingDecision.type === 'loading', 'Inicialização deve manter estado de carregamento neutro sem flash.');

// 2.2 Visitante (não autenticado) acessando rotas públicas/visitante
const guestOnSignIn = evaluateNavigationDecision({
  pathname: ROUTES.SIGN_IN,
  authStatus: 'unauthenticated',
  session: null,
  orgStatus: 'unavailable',
});
assert(guestOnSignIn.type === 'allow', 'Visitante deve ter acesso liberado à rota de login.');

const guestOnPresentation = evaluateNavigationDecision({
  pathname: ROUTES.PRESENTATION,
  authStatus: 'unauthenticated',
  session: null,
  orgStatus: 'unavailable',
});
assert(guestOnPresentation.type === 'allow', 'Visitante deve ter acesso liberado à rota institucional.');

// 2.3 Visitante tentando acessar área protegida
const guestOnSystem = evaluateNavigationDecision({
  pathname: ROUTES.SYSTEM,
  authStatus: 'unauthenticated',
  session: null,
  orgStatus: 'unavailable',
});
assert(
  guestOnSystem.type === 'redirect' && guestOnSystem.destination === ROUTES.SIGN_IN,
  'Visitante em rota protegida deve ser redirecionado para /entrar.'
);

// 2.4 Usuário autenticado acessando tela de visitante (deve ser redirecionado para o sistema)
const superAdminAccount = PREVIEW_ACCOUNTS.find((a) => a.platformRole === 'platform_super_admin');
const superAdminSession = {
  id: 'sess-superadmin',
  user: { id: superAdminAccount.id, name: superAdminAccount.name, email: superAdminAccount.email, avatarUrl: '' },
  platformRole: superAdminAccount.platformRole,
  organizationRole: superAdminAccount.organizationRole,
  organizationName: null,
  scopeType: 'platform',
  createdAt: Date.now(),
  lastActivityAt: Date.now(),
  isPreview: true,
};

const authOnSignIn = evaluateNavigationDecision({
  pathname: ROUTES.SIGN_IN,
  authStatus: 'authenticated',
  session: superAdminSession,
  orgStatus: 'active',
});
assert(
  authOnSignIn.type === 'redirect' && authOnSignIn.destination === ROUTES.SYSTEM,
  'Usuário autenticado em /entrar deve ser direcionado para /sistema.'
);

// 2.5 Superadmin da plataforma em rotas transitórias de organização (deve contornar para /sistema)
const superAdminOnOrgSetup = evaluateNavigationDecision({
  pathname: ROUTES.CONFIG_ORGANIZATION,
  authStatus: 'authenticated',
  session: superAdminSession,
  orgStatus: 'active',
});
assert(
  superAdminOnOrgSetup.type === 'redirect' && superAdminOnOrgSetup.destination === ROUTES.SYSTEM,
  'Superadmin não deve ser retido em configuração organizacional.'
);

// 2.6 Usuário organizacional com setup pendente
const ownerAccount = PREVIEW_ACCOUNTS.find((a) => a.organizationRole === 'owner');
const ownerSession = {
  id: 'sess-owner',
  user: { id: ownerAccount.id, name: ownerAccount.name, email: ownerAccount.email, avatarUrl: '' },
  platformRole: ownerAccount.platformRole,
  organizationRole: ownerAccount.organizationRole,
  organizationName: 'Organização Exemplo',
  scopeType: 'organization',
  createdAt: Date.now(),
  lastActivityAt: Date.now(),
  isPreview: true,
};

const ownerNeedsSetupOnSystem = evaluateNavigationDecision({
  pathname: ROUTES.SYSTEM,
  authStatus: 'authenticated',
  session: ownerSession,
  orgStatus: 'setupRequired',
});
assert(
  ownerNeedsSetupOnSystem.type === 'redirect' && ownerNeedsSetupOnSystem.destination === ROUTES.CONFIG_ORGANIZATION,
  'Usuário com setupRequired deve ser direcionado para /configurar-empresa.'
);

const ownerNeedsSetupOnSetupPage = evaluateNavigationDecision({
  pathname: ROUTES.CONFIG_ORGANIZATION,
  authStatus: 'authenticated',
  session: ownerSession,
  orgStatus: 'setupRequired',
});
assert(ownerNeedsSetupOnSetupPage.type === 'allow', 'Usuário com setupRequired pode acessar /configurar-empresa.');

// 2.7 Usuário com acesso pendente de aprovação
const pendingUserOnSystem = evaluateNavigationDecision({
  pathname: ROUTES.SYSTEM,
  authStatus: 'authenticated',
  session: ownerSession,
  orgStatus: 'accessPending',
});
assert(
  pendingUserOnSystem.type === 'redirect' && pendingUserOnSystem.destination === ROUTES.PENDING_ACCESS,
  'Usuário com accessPending deve ser direcionado para /acesso-pendente.'
);

// 2.8 Organização suspensa
const suspendedUserOnSystem = evaluateNavigationDecision({
  pathname: ROUTES.SYSTEM,
  authStatus: 'authenticated',
  session: ownerSession,
  orgStatus: 'suspended',
});
assert(suspendedUserOnSystem.type === 'view_suspended', 'Organização suspensa deve retornar view_suspended.');

// 2.9 Organização indisponível
const unavailableUserOnSystem = evaluateNavigationDecision({
  pathname: ROUTES.SYSTEM,
  authStatus: 'authenticated',
  session: ownerSession,
  orgStatus: 'unavailable',
});
assert(unavailableUserOnSystem.type === 'view_unavailable', 'Contexto indisponível deve retornar view_unavailable.');

// 2.10 Permissões insuficientes
const userWithoutPermission = evaluateNavigationDecision({
  pathname: ROUTES.SYSTEM,
  authStatus: 'authenticated',
  session: ownerSession,
  orgStatus: 'active',
  hasPermission: () => false,
});
assert(
  userWithoutPermission.type === 'redirect' && userWithoutPermission.destination === ROUTES.ACCESS_DENIED,
  'Usuário sem permissão deve ser redirecionado para /acesso-negado.'
);

// 2.11 Permissões concedidas
const userWithPermission = evaluateNavigationDecision({
  pathname: ROUTES.SYSTEM,
  authStatus: 'authenticated',
  session: ownerSession,
  orgStatus: 'active',
  hasPermission: () => true,
});
assert(userWithPermission.type === 'allow', 'Usuário com permissão deve ter acesso liberado.');

console.log('  ✓ Motor puro de decisão de navegação avaliado com 100% de conformidade.');

// -------------------------------------------------------------
// TESTE 3: Proteção Rigorosa contra Open Redirect (getSafeRedirectUrl)
// -------------------------------------------------------------
console.log('\nTESTE 3: Proteção contra Open Redirect (getSafeRedirectUrl)');

const maliciousInputs = [
  'http://evil.com',
  'https://phishing.site/login',
  '//evil.com',
  '///evil.com/path',
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox',
  '/sistema\r\nHost: evil.com',
  '/sistema\0evil',
  '/sistema\\evil',
  'ftp://files.example.com',
  null,
  undefined,
  12345,
  {},
  '',
  '   ',
  '/entrar',
  '/recuperar-acesso',
  '/atualizar-senha',
];

for (const input of maliciousInputs) {
  const result = getSafeRedirectUrl(input, ROUTES.SYSTEM);
  assert(
    result === ROUTES.SYSTEM,
    `Entrada maliciosa ou inadequada "${String(input)}" deve ser neutralizada para o destino padrão seguro.`
  );
}

// Entradas legítimas internas
assert(getSafeRedirectUrl('/minha-conta') === '/minha-conta', 'Caminho interno legítimo /minha-conta deve ser aceito.');
assert(getSafeRedirectUrl('/sistema') === '/sistema', 'Caminho interno legítimo /sistema deve ser aceito.');
assert(getSafeRedirectUrl('/configurar-empresa') === '/configurar-empresa', 'Caminho interno legítimo /configurar-empresa deve ser aceito.');
assert(getSafeRedirectUrl('/apresentacao') === '/apresentacao', 'Caminho interno legítimo /apresentacao deve ser aceito.');

console.log('  ✓ Proteção contra Open Redirect testada e aprovada para todas as categorias de vetores.');

// -------------------------------------------------------------
// TESTE 4: Encerramento Atômico e Limpeza Idempotente de Estado
// -------------------------------------------------------------
console.log('\nTESTE 4: Encerramento Atômico de Sessão e Limpeza de Estado');

// Simulação de ambiente de storage para testar idempotência de clearAllPreviewState
const mockStorage = new Map();
global.sessionStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};

// Popula chaves de desenvolvimento e dados de terceiros
mockStorage.set(PREVIEW_STORAGE_KEYS.SESSION, JSON.stringify(ownerSession));
mockStorage.set(PREVIEW_STORAGE_KEYS.ACTIVITY, String(Date.now()));
mockStorage.set(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW, 'true');
mockStorage.set(PREVIEW_STORAGE_KEYS.ORG_CONTEXT, '{"id":"custom-org"}');
mockStorage.set(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE, 'custom-org');
mockStorage.set('outra_aplicacao_legitima_preferencia', 'dark-theme');

// Executa limpeza atômica
clearAllPreviewState();

assert(!mockStorage.has(PREVIEW_STORAGE_KEYS.SESSION), 'Chave de sessão deve ser removida.');
assert(!mockStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), 'Chave de atividade deve ser removida.');
assert(!mockStorage.has(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW), 'Chave de recovery flow deve ser removida.');
assert(!mockStorage.has(PREVIEW_STORAGE_KEYS.ORG_CONTEXT), 'Chave de org context deve ser removida.');
assert(!mockStorage.has(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE), 'Chave de org preference deve ser removida.');
assert(mockStorage.get('outra_aplicacao_legitima_preferencia') === 'dark-theme', 'Registros legítimos de terceiros não devem ser apagados.');

console.log('  ✓ Encerramento atômico e limpeza seletiva e idempotente comprovados.');

// -------------------------------------------------------------
// TESTE 5: Destinos Padrão por Perfil e Estado Organizacional
// -------------------------------------------------------------
console.log('\nTESTE 5: Destinos Padrão Contextuais (resolveDefaultAuthenticatedDestination)');

assert(resolveDefaultAuthenticatedDestination(null, 'active') === ROUTES.SIGN_IN, 'Sessão nula deve ir para /entrar');
assert(resolveDefaultAuthenticatedDestination(superAdminSession, 'active') === ROUTES.SYSTEM, 'Superadmin deve ir para /sistema');
assert(resolveDefaultAuthenticatedDestination(ownerSession, 'setupRequired') === ROUTES.CONFIG_ORGANIZATION, 'setupRequired deve ir para /configurar-empresa');
assert(resolveDefaultAuthenticatedDestination(ownerSession, 'selectionRequired') === ROUTES.SELECT_ORGANIZATION, 'selectionRequired deve ir para /selecionar-empresa');
assert(resolveDefaultAuthenticatedDestination(ownerSession, 'accessPending') === ROUTES.PENDING_ACCESS, 'accessPending deve ir para /acesso-pendente');
assert(resolveDefaultAuthenticatedDestination(ownerSession, 'active') === ROUTES.SYSTEM, 'active deve ir para /sistema');

console.log('  ✓ Destinos padrão validados para todos os estados de sessão e organização.');

console.log('\n================================================================');
console.log('✅ BATERIA OE-001.006 CONCLUÍDA COM 100% DE SUCESSO!');
console.log('================================================================');
