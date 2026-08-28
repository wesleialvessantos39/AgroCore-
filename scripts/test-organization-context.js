/**
 * Testes automatizados do Contexto Organizacional Temporário (OE-001.004)
 */

import assert from 'assert';
import { PREVIEW_STORAGE_KEYS } from '../src/auth/preview/previewKeys.js';
import { UnavailableOrganizationGateway } from '../src/organization/unavailableGateway.js';
import { PreviewOrganizationGateway } from '../src/organization/preview/previewGateway.js';
import { ROUTES } from '../src/routes/paths.js';
import { PREVIEW_ACCOUNTS } from '../src/auth/preview/previewAccounts.js';

console.log('--- TESTES AUTOMATIZADOS: CONTEXTO ORGANIZACIONAL (OE-001.004) ---');

// Mock do ambiente de browser / sessionStorage
class MockSessionStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

globalThis.window = { sessionStorage: new MockSessionStorage() };
globalThis.sessionStorage = globalThis.window.sessionStorage;

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(err);
      process.exit(1);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(err);
      process.exit(1);
    }
  }

  // 1. Verificação das chaves centralizadas de sessionStorage
  test('1. Chaves de storage centralizadas no previewKeys.ts', () => {
    assert.strictEqual(PREVIEW_STORAGE_KEYS.SESSION, 'agrocore:preview:session');
    assert.strictEqual(PREVIEW_STORAGE_KEYS.ACTIVITY, 'agrocore:preview:session_activity');
    assert.strictEqual(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW, 'agrocore:preview:recovery_flow');
    assert.strictEqual(PREVIEW_STORAGE_KEYS.ORG_CONTEXT, 'agrocore:preview:org_context');
    assert.strictEqual(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE, 'agrocore:preview:org_preference');
  });

  // 2. Gateway de Produção (UnavailableOrganizationGateway)
  await asyncTest('2. UnavailableOrganizationGateway falha de forma segura e neutra', async () => {
    const gateway = new UnavailableOrganizationGateway();
    const result = await gateway.loadContext('any-user-id');
    assert.strictEqual(result.status, 'unavailable');
    assert.strictEqual(result.activeOrganization, null);
    assert.strictEqual(result.activeMembership, null);
    assert.deepStrictEqual(result.availableMemberships, []);

    const selectResult = await gateway.selectOrganization('org-123');
    assert.strictEqual(selectResult, false);

    const configResult = await gateway.configureInitialOrganization('Empresa Teste', 'usr-1');
    assert.strictEqual(configResult, false);

    const memberships = await gateway.listMemberships('usr-1');
    assert.deepStrictEqual(memberships, []);
  });

  // 3. Superadministrador da plataforma no PreviewOrganizationGateway
  await asyncTest('3. Superadministrador opera no escopo global sem organização vinculada', async () => {
    const gateway = new PreviewOrganizationGateway();
    const superadmin = PREVIEW_ACCOUNTS.find(a => a.roleCode === 'platform_super_admin');
    assert.ok(superadmin);

    const result = await gateway.loadContext(superadmin.id);
    assert.strictEqual(result.status, 'active');
    assert.strictEqual(result.activeOrganization, null);
    assert.strictEqual(result.activeMembership, null);
    assert.deepStrictEqual(result.availableMemberships, []);
  });

  // 4. Carregamento de perfis organizacionais de demonstração
  await asyncTest('4. Perfis organizacionais carregam a Organização de acompanhamento padrão', async () => {
    const gateway = new PreviewOrganizationGateway();
    sessionStorage.clear();

    const owner = PREVIEW_ACCOUNTS.find(a => a.roleCode === 'owner');
    assert.ok(owner);

    const result = await gateway.loadContext(owner.id);
    assert.strictEqual(result.status, 'active');
    assert.ok(result.activeOrganization);
    assert.strictEqual(result.activeOrganization.id, 'preview-org-default');
    assert.strictEqual(result.activeOrganization.name, 'Organização de acompanhamento');
    assert.strictEqual(result.activeOrganization.status, 'active');

    assert.ok(result.activeMembership);
    assert.strictEqual(result.activeMembership.organizationRole, 'owner');
    assert.strictEqual(result.activeMembership.status, 'active');
    assert.strictEqual(result.availableMemberships.length, 1);
  });

  // 5. Configuração inicial de organização temporária
  await asyncTest('5. configureInitialOrganization valida regras e persiste contexto local', async () => {
    const gateway = new PreviewOrganizationGateway();
    sessionStorage.clear();

    const owner = PREVIEW_ACCOUNTS.find(a => a.roleCode === 'owner');
    assert.ok(owner);

    // Validação: rejeita nomes vazios ou com apenas espaços
    const invalidEmpty = await gateway.configureInitialOrganization('   ', owner.id);
    assert.strictEqual(invalidEmpty, false);

    // Validação: rejeita nomes menores que 2 caracteres
    const invalidShort = await gateway.configureInitialOrganization('A', owner.id);
    assert.strictEqual(invalidShort, false);

    // Validação: rejeita nomes com mais de 100 caracteres
    const invalidLong = await gateway.configureInitialOrganization('A'.repeat(101), owner.id);
    assert.strictEqual(invalidLong, false);

    // Sucesso: nome válido
    const validConfig = await gateway.configureInitialOrganization('Fazenda Vale Verde', owner.id);
    assert.strictEqual(validConfig, true);

    const updatedContext = await gateway.loadContext(owner.id);
    assert.strictEqual(updatedContext.status, 'active');
    assert.strictEqual(updatedContext.activeOrganization.name, 'Fazenda Vale Verde');
    assert.strictEqual(updatedContext.activeOrganization.id, 'preview-org-custom');
  });

  // 6. Seleção de organização
  await asyncTest('6. selectOrganization valida ID e ignora referências inválidas', async () => {
    const gateway = new PreviewOrganizationGateway();

    // Rejeita IDs arbitrários não permitidos
    const invalidSelect = await gateway.selectOrganization('unknown-random-org');
    assert.strictEqual(invalidSelect, false);

    // Aceita IDs válidos de demonstração
    const validSelect = await gateway.selectOrganization('preview-org-default');
    assert.strictEqual(validSelect, true);
    assert.strictEqual(sessionStorage.getItem(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE), 'preview-org-default');
  });

  // 7. Limpeza atômica de preferências e dados temporários
  await asyncTest('7. clearPreference e clearAllPreviewState limpam exclusivamente as chaves certas', async () => {
    const { clearAllPreviewState } = await import('../src/auth/preview/clearAllPreviewState.js');

    sessionStorage.setItem('other_app_key', 'preservado');
    sessionStorage.setItem(PREVIEW_STORAGE_KEYS.SESSION, 'test-session');
    sessionStorage.setItem(PREVIEW_STORAGE_KEYS.ACTIVITY, '12345');
    sessionStorage.setItem(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW, 'true');
    sessionStorage.setItem(PREVIEW_STORAGE_KEYS.ORG_CONTEXT, '{"name":"Teste"}');
    sessionStorage.setItem(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE, 'preview-org-custom');

    clearAllPreviewState();

    assert.strictEqual(sessionStorage.getItem(PREVIEW_STORAGE_KEYS.SESSION), null);
    assert.strictEqual(sessionStorage.getItem(PREVIEW_STORAGE_KEYS.ACTIVITY), null);
    assert.strictEqual(sessionStorage.getItem(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW), null);
    assert.strictEqual(sessionStorage.getItem(PREVIEW_STORAGE_KEYS.ORG_CONTEXT), null);
    assert.strictEqual(sessionStorage.getItem(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE), null);

    // Chave de outra parte da aplicação não foi apagada
    assert.strictEqual(sessionStorage.getItem('other_app_key'), 'preservado');
  });

  // 8. Declaração de rotas obrigatórias
  test('8. Rotas declaradas e consistentes com o roteador', () => {
    assert.strictEqual(ROUTES.CONFIG_ORGANIZATION, '/configurar-empresa');
    assert.strictEqual(ROUTES.SELECT_ORGANIZATION, '/selecionar-empresa');
    assert.strictEqual(ROUTES.PENDING_ACCESS, '/acesso-pendente');
    assert.strictEqual(ROUTES.MY_ACCOUNT, '/minha-conta');
  });

  console.log(`\n🎉 Todos os ${passed}/${total} testes de contexto organizacional passaram com sucesso!`);
}

runTests().catch((err) => {
  console.error('Falha geral na execução dos testes:', err);
  process.exit(1);
});
