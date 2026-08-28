/**
 * BATERIA DE TESTES AUTOMATIZADOS — OE-001.003
 * CONFIGURAÇÃO E VISUALIZAÇÃO CONTEXTUAL DOS 7 PERFIS
 */

import {
  ROLE_PROFILE_CONFIGS,
  ALL_ROLE_IDENTIFIERS,
  getRoleProfileConfig,
} from '../src/auth/roleConfig.ts';
import { PREVIEW_ACCOUNTS } from '../src/auth/preview/previewAccounts.ts';
import { PreviewAuthGateway } from '../src/auth/preview/previewGateway.ts';

// Mock de sessionStorage em memória
const memoryStorage = new Map();
globalThis.sessionStorage = {
  getItem: (key) => memoryStorage.get(key) || null,
  setItem: (key, val) => memoryStorage.set(key, String(val)),
  removeItem: (key) => memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
};
globalThis.window = globalThis;

console.log('================================================================');
console.log('BATERIA DE TESTES AUTOMATIZADOS — OE-001.003');
console.log('CONFIGURAÇÃO E VISUALIZAÇÃO CONTEXTUAL DOS 7 PERFIS');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
}

// -------------------------------------------------------------
// TESTE 1: Quantidade e Unicidade dos Perfis
// -------------------------------------------------------------
console.log('TESTE 1: Quantidade e unicidade dos perfis');

const roleKeys = Object.keys(ROLE_PROFILE_CONFIGS);
assert(roleKeys.length === 7, `Devem existir exatamente 7 configurações de perfil. Encontrado: ${roleKeys.length}`);
assert(ALL_ROLE_IDENTIFIERS.length === 7, 'ALL_ROLE_IDENTIFIERS deve conter 7 elementos');

const uniqueRoles = new Set(roleKeys);
assert(uniqueRoles.size === 7, 'Nenhum papel pode estar duplicado');
console.log('  ✓ 7 configurações únicas validadas');

// -------------------------------------------------------------
// TESTE 2: Validação Estrutural e Textos em Português
// -------------------------------------------------------------
console.log('\nTESTE 2: Validação estrutural de cada perfil');

const titlesSet = new Set();

for (const roleKey of roleKeys) {
  const config = ROLE_PROFILE_CONFIGS[roleKey];

  assert(config.role === roleKey, `Propriedade role deve bater com a chave: ${roleKey}`);
  assert(typeof config.name === 'string' && config.name.trim().length > 0, `Nome em português presente para ${roleKey}`);
  assert(config.scope === 'platform' || config.scope === 'organization', `Escopo válido para ${roleKey}`);
  assert(config.scopeLabel === 'Plataforma' || config.scopeLabel === 'Organização', `scopeLabel válido para ${roleKey}`);
  assert(typeof config.viewTitle === 'string' && config.viewTitle.trim().length > 0, `Título presente para ${roleKey}`);
  assert(typeof config.description === 'string' && config.description.trim().length > 0, `Descrição presente para ${roleKey}`);
  assert(Array.isArray(config.responsibilities) && config.responsibilities.length >= 4, `Mínimo de 4 responsabilidades para ${roleKey}`);
  assert(Boolean(config.icon), `Ícone vetorial presente para ${roleKey}`);
  assert(Boolean(config.emptyState && config.emptyState.title && config.emptyState.description), `Estado vazio completo para ${roleKey}`);

  // Cada perfil deve possuir título único
  assert(!titlesSet.has(config.viewTitle), `Título deve ser exclusivo: "${config.viewTitle}"`);
  titlesSet.add(config.viewTitle);
}
console.log('  ✓ Todos os 7 perfis possuem estrutura completa e títulos distintos');

// -------------------------------------------------------------
// TESTE 3: Verificação de Escopo e Atribuições Específicas
// -------------------------------------------------------------
console.log('\nTESTE 3: Escopos e atribuições específicas');

// 3.1 Superadministrador
const superConfig = ROLE_PROFILE_CONFIGS.platform_super_admin;
assert(superConfig.scope === 'platform', 'Superadmin deve possuir escopo platform');
assert(superConfig.scopeLabel === 'Plataforma', 'Superadmin deve possuir scopeLabel Plataforma');
assert(superConfig.viewTitle === 'Administração da plataforma', 'Título correto do superadmin');
assert(superConfig.description === 'Visão institucional destinada à governança global do AgroCore.', 'Descrição correta');
assert(superConfig.emptyState.title === 'Nenhuma informação global disponível', 'Estado vazio correto');

// 3.2 Proprietário
const ownerConfig = ROLE_PROFILE_CONFIGS.owner;
assert(ownerConfig.scope === 'organization', 'Proprietário deve possuir escopo organization');
assert(ownerConfig.viewTitle === 'Visão do proprietário', 'Título correto do proprietário');
assert(ownerConfig.emptyState.title.includes('Nenhuma informação da organização disponível'), 'Estado vazio do proprietário correto');

// 3.3 Administrador
const adminConfig = ROLE_PROFILE_CONFIGS.company_admin;
assert(adminConfig.scope === 'organization', 'Administrador deve possuir escopo organization');
assert(adminConfig.viewTitle === 'Administração da organização', 'Título correto do administrador');
assert(adminConfig.emptyState.title.includes('Nenhuma informação administrativa disponível'), 'Estado vazio do administrador correto');

// 3.4 Gerente
const managerConfig = ROLE_PROFILE_CONFIGS.manager;
assert(managerConfig.scope === 'organization', 'Gerente deve possuir escopo organization');
assert(managerConfig.viewTitle === 'Gestão operacional', 'Título correto do gerente');
assert(managerConfig.emptyState.title.includes('Nenhuma atividade operacional registrada'), 'Estado vazio do gerente correto');

// 3.5 Projetista
const designerConfig = ROLE_PROFILE_CONFIGS.project_designer;
assert(designerConfig.scope === 'organization', 'Projetista deve possuir escopo organization');
assert(designerConfig.viewTitle === 'Projetos e acompanhamento técnico', 'Título correto do projetista');
assert(designerConfig.emptyState.title.includes('Nenhuma atividade técnica registrada'), 'Estado vazio do projetista correto');

// 3.6 Financeiro
const financeConfig = ROLE_PROFILE_CONFIGS.finance;
assert(financeConfig.scope === 'organization', 'Financeiro deve possuir escopo organization');
assert(financeConfig.viewTitle === 'Acompanhamento financeiro', 'Título correto do financeiro');
assert(financeConfig.emptyState.title.includes('Nenhuma informação financeira registrada'), 'Estado vazio do financeiro correto');

// 3.7 Captador
const capturerConfig = ROLE_PROFILE_CONFIGS.capturer;
assert(capturerConfig.scope === 'organization', 'Captador deve possuir escopo organization');
assert(capturerConfig.viewTitle === 'Captação e atendimento', 'Título correto do captador');
assert(capturerConfig.emptyState.title.includes('Nenhuma atividade de captação registrada'), 'Estado vazio do captador correto');

console.log('  ✓ Escopos e regras textuais específicas de cada perfil validados');

// -------------------------------------------------------------
// TESTE 4: Resolução de Perfil via Sessão e Tratamento de Papel Desconhecido
// -------------------------------------------------------------
console.log('\nTESTE 4: Resolução via sessão e neutralidade diante de papel desconhecido');

// 4.1 Sessão nula
assert(getRoleProfileConfig(null) === null, 'Sessão nula retorna null');

// 4.2 Sessão de Superadmin
const superSession = {
  user: { id: 'u1', email: 'superadmin@agrocore.test' },
  organizationId: null,
  organizationName: null,
  organizationRole: 'none',
  platformRole: 'platform_super_admin',
};
const resSuper = getRoleProfileConfig(superSession);
assert(resSuper !== null && resSuper.role === 'platform_super_admin', 'Sessão superadmin resolve para platform_super_admin');

// 4.3 Sessões de Organização para os 6 papéis
const orgRoles = ['owner', 'company_admin', 'manager', 'project_designer', 'finance', 'capturer'];
for (const orgRole of orgRoles) {
  const orgSession = {
    user: { id: `u-${orgRole}`, email: `${orgRole}@agrocore.test` },
    organizationId: 'org-1',
    organizationName: 'Fazenda Modelo',
    organizationRole: orgRole,
    platformRole: 'none',
  };
  const resOrg = getRoleProfileConfig(orgSession);
  assert(resOrg !== null && resOrg.role === orgRole, `Sessão ${orgRole} resolve para sua configuração`);
}

// 4.4 Papel desconhecido / inválido
const unknownSession = {
  user: { id: 'u-unknown', email: 'invasor@teste.test' },
  organizationId: 'org-x',
  organizationName: 'Org Invalida',
  organizationRole: 'papel_inexistente',
  platformRole: 'none',
};
assert(getRoleProfileConfig(unknownSession) === null, 'Papel desconhecido deve retornar null');

console.log('  ✓ Resolução de papéis e segurança contra papéis desconhecidos comprovadas');

// -------------------------------------------------------------
// TESTE 5: Integração com os 7 Logins de Demonstração
// -------------------------------------------------------------
console.log('\nTESTE 5: Integração com os 7 logins de acompanhamento');

const gateway = new PreviewAuthGateway();

for (const account of PREVIEW_ACCOUNTS) {
  memoryStorage.clear();
  const session = await gateway.signIn({ email: account.email, password: account.password });
  assert(session !== null, `Login bem-sucedido para ${account.email}`);

  const profileConfig = getRoleProfileConfig(session);
  assert(profileConfig !== null, `Configuração de perfil localizada para ${account.email}`);
  assert(profileConfig.name === account.roleLabel, `Nome do perfil coincide com a conta: ${account.roleLabel}`);
  assert(profileConfig.scope === account.scopeType, `Escopo coincide com a conta: ${account.scopeType}`);

  await gateway.signOut();
  assert(memoryStorage.size === 0, `Sessão limpa após logout de ${account.email}`);
}

console.log('  ✓ Todos os 7 logins integrados com sucesso às suas respectivas visões contextuais');

console.log('\n================================================================');
console.log(`✅ TOTAL DE TESTES: ${totalTests} | APROVADOS: ${passedTests} (100% de sucesso)`);
console.log('================================================================');
