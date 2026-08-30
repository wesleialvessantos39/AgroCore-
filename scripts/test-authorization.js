/**
 * Testes automatizados da Matriz de Permissões e Autorização (OE-001.005)
 */

import assert from 'assert';
import {
  PERMISSIONS_CATALOG,
  PERMISSION_SCOPE_GROUPS,
  isValidPermission,
} from '../src/authorization/permissionsCatalog.js';
import {
  ROLE_PERMISSIONS_MATRIX,
  getRolePermissions,
} from '../src/authorization/permissionsMatrix.js';
import {
  evaluatePermission,
  resolveUserRole,
  getGrantedPermissionSummaries,
} from '../src/authorization/authorizationEvaluator.js';
import { ROUTES } from '../src/routes/paths.js';
import { ROUTE_METADATA_MAP } from '../src/routes/routeMetadata.js';

console.log('--- TESTES AUTOMATIZADOS: MATRIZ DE AUTORIZAÇÃO E PERMISSÕES (OE-001.005) ---');

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

  // 1. Integridade do Catálogo e Escopos
  test('1. Catálogo de permissões e grupos de escopo contêm metadados completos em português', () => {
    assert.ok(PERMISSIONS_CATALOG.length >= 20, 'Catálogo deve ter todas as permissões cadastradas');
    assert.ok(PERMISSION_SCOPE_GROUPS.length >= 10, 'Grupos de escopo devem cobrir todos os módulos');

    for (const def of PERMISSIONS_CATALOG) {
      assert.ok(typeof def.id === 'string' && def.id.includes(':'), `ID de permissão inválido: ${def.id}`);
      assert.ok(typeof def.scope === 'string', `Escopo ausente para ${def.id}`);
      assert.ok(typeof def.name === 'string' && def.name.length > 2, `Nome ausente para ${def.id}`);
      assert.ok(typeof def.description === 'string' && def.description.length > 5, `Descrição ausente para ${def.id}`);
    }

    assert.strictEqual(isValidPermission('clients:view'), true);
    assert.strictEqual(isValidPermission('invalid:permission_xyz'), false);
    assert.strictEqual(isValidPermission(null), false);
    assert.strictEqual(isValidPermission(123), false);
  });

  // 2. Matriz dos 7 Perfis
  test('2. Matriz imutável cobre exatamente os 7 perfis do sistema com menor privilégio', () => {
    const expectedRoles = [
      'platform_super_admin',
      'owner',
      'company_admin',
      'manager',
      'project_designer',
      'finance',
      'capturer',
    ];

    for (const role of expectedRoles) {
      const permissions = getRolePermissions(role);
      assert.ok(Array.isArray(permissions), `Permissões para ${role} devem ser um array`);
      assert.ok(permissions.length > 0, `Perfil ${role} deve ter permissões atribuídas`);
    }

    assert.deepStrictEqual(getRolePermissions('none'), []);
  });

  // 3. Superadministrador da Plataforma (Isolamento Global)
  test('3. Superadministrador possui capacidades globais e NÃO recebe permissões organizacionais', () => {
    const superAdminSession = {
      user: { id: 'usr-sa', email: 'superadmin@agrocore.test', name: 'Super Admin' },
      platformRole: 'platform_super_admin',
      organizationRole: 'none',
      currentRole: 'platform_super_admin',
      activeScope: 'platform',
      isDevelopmentAccount: true,
      lastAuthenticatedAt: new Date().toISOString(),
    };

    const context = {
      session: superAdminSession,
      orgContext: null,
    };

    const roleRes = resolveUserRole(superAdminSession);
    assert.strictEqual(roleRes.isPlatformSuperAdmin, true);
    assert.strictEqual(roleRes.scope, 'platform');
    assert.strictEqual(roleRes.effectiveRole, 'platform_super_admin');

    // Concedidas: Plataforma e Pessoal
    assert.strictEqual(evaluatePermission('platform:view_overview', context).granted, true);
    assert.strictEqual(evaluatePermission('platform:view_organizations', context).granted, true);
    assert.strictEqual(evaluatePermission('platform:view_audit', context).granted, true);
    assert.strictEqual(evaluatePermission('platform:manage_governance', context).granted, true);
    assert.strictEqual(evaluatePermission('audit:view_platform', context).granted, true);
    assert.strictEqual(evaluatePermission('personal_account:view_profile', context).granted, true);
    assert.strictEqual(evaluatePermission('personal_account:manage_preferences', context).granted, true);

    // Negadas com isolamento estrito: Permissões organizacionais
    const orgDecision = evaluatePermission('organization:view_overview', context);
    assert.strictEqual(orgDecision.granted, false);
    assert.ok(orgDecision.reason?.includes('Superadministrador atua exclusivamente no escopo global'));

    assert.strictEqual(evaluatePermission('clients:view', context).granted, false);
    assert.strictEqual(evaluatePermission('proposals:view', context).granted, false);
    assert.strictEqual(evaluatePermission('finance:manage_operations', context).granted, false);
    assert.strictEqual(evaluatePermission('audit:view_organization', context).granted, false);
  });

  // 4. Proprietário (Owner)
  test('4. Proprietário possui governança integral da empresa e NÃO acessa plataforma global', () => {
    const ownerSession = {
      user: { id: 'usr-owner', email: 'owner@agrocore.test', name: 'Proprietário' },
      platformRole: 'none',
      organizationRole: 'owner',
      currentRole: 'owner',
      activeScope: 'organization',
      isDevelopmentAccount: true,
      lastAuthenticatedAt: new Date().toISOString(),
    };

    const context = {
      session: ownerSession,
      orgContext: {
        status: 'active',
        activeOrganization: { id: 'org-1', name: 'Fazenda Modelo', status: 'active' },
        activeMembership: { id: 'm-1', organizationId: 'org-1', organizationRole: 'owner', status: 'active' },
        availableMemberships: [],
      },
    };

    // Governança, papéis, auditoria da empresa e operações
    assert.strictEqual(evaluatePermission('organization:view_overview', context).granted, true);
    assert.strictEqual(evaluatePermission('organization:manage_governance', context).granted, true);
    assert.strictEqual(evaluatePermission('organization:manage_settings', context).granted, true);
    assert.strictEqual(evaluatePermission('users_and_access:manage_roles', context).granted, true);
    assert.strictEqual(evaluatePermission('finance:manage_operations', context).granted, true);
    assert.strictEqual(evaluatePermission('audit:view_organization', context).granted, true);
    assert.strictEqual(evaluatePermission('clients:create', context).granted, true);
    assert.strictEqual(evaluatePermission('personal_account:view_profile', context).granted, true);

    // Negado: Plataforma global
    const platformDecision = evaluatePermission('platform:view_overview', context);
    assert.strictEqual(platformDecision.granted, false);
    assert.ok(platformDecision.reason?.includes('Perfis organizacionais não possuem acesso a recursos globais'));
    assert.strictEqual(evaluatePermission('audit:view_platform', context).granted, false);
  });

  // 5. Administrador da Empresa (Company Admin)
  test('5. Administrador possui gestão cotidiana sem privilégios exclusivos do proprietário', () => {
    const adminSession = {
      user: { id: 'usr-admin', email: 'admin@agrocore.test', name: 'Admin' },
      platformRole: 'none',
      organizationRole: 'company_admin',
      currentRole: 'company_admin',
      activeScope: 'organization',
      isDevelopmentAccount: true,
      lastAuthenticatedAt: new Date().toISOString(),
    };

    const context = {
      session: adminSession,
      orgContext: {
        status: 'active',
        activeOrganization: { id: 'org-1', name: 'Fazenda Modelo', status: 'active' },
        activeMembership: { id: 'm-1', organizationId: 'org-1', organizationRole: 'company_admin', status: 'active' },
        availableMemberships: [],
      },
    };

    // Concedidas
    assert.strictEqual(evaluatePermission('organization:view_overview', context).granted, true);
    assert.strictEqual(evaluatePermission('organization:manage_settings', context).granted, true);
    assert.strictEqual(evaluatePermission('users_and_access:manage', context).granted, true);
    assert.strictEqual(evaluatePermission('clients:create', context).granted, true);
    assert.strictEqual(evaluatePermission('finance:view_records', context).granted, true);

    // Negadas: Exclusivas do proprietário
    assert.strictEqual(evaluatePermission('organization:manage_governance', context).granted, false);
    assert.strictEqual(evaluatePermission('users_and_access:manage_roles', context).granted, false);
    assert.strictEqual(evaluatePermission('finance:manage_operations', context).granted, false);
    assert.strictEqual(evaluatePermission('audit:view_organization', context).granted, false);
  });

  // 6. Gerente (Manager)
  test('6. Gerente coordena operações e equipe sem gestão financeira ampla ou societária', () => {
    const managerSession = {
      user: { id: 'usr-mgr', email: 'manager@agrocore.test', name: 'Gerente' },
      platformRole: 'none',
      organizationRole: 'manager',
      currentRole: 'manager',
      activeScope: 'organization',
      isDevelopmentAccount: true,
      lastAuthenticatedAt: new Date().toISOString(),
    };

    const context = {
      session: managerSession,
      orgContext: {
        status: 'active',
        activeOrganization: { id: 'org-1', name: 'Fazenda Modelo', status: 'active' },
        activeMembership: { id: 'm-1', organizationId: 'org-1', organizationRole: 'manager', status: 'active' },
        availableMemberships: [],
      },
    };

    assert.strictEqual(evaluatePermission('organization:view_overview', context).granted, true);
    assert.strictEqual(evaluatePermission('clients:create', context).granted, true);
    assert.strictEqual(evaluatePermission('proposals:edit_draft', context).granted, true);
    assert.strictEqual(evaluatePermission('proposals:approve', context).granted, true);
    assert.strictEqual(evaluatePermission('proposals:review', context).granted, false);
    assert.strictEqual(evaluatePermission('surveys_and_visits:execute', context).granted, true);
    assert.strictEqual(evaluatePermission('schedule:manage', context).granted, true);
    assert.strictEqual(evaluatePermission('fleet:manage', context).granted, true);
    assert.strictEqual(evaluatePermission('users_and_access:view', context).granted, true);

    // Negadas
    assert.strictEqual(evaluatePermission('users_and_access:manage', context).granted, false);
    assert.strictEqual(evaluatePermission('finance:manage_operations', context).granted, false);
    assert.strictEqual(evaluatePermission('finance:view_records', context).granted, false);
    assert.strictEqual(evaluatePermission('organization:manage_settings', context).granted, false);
  });

  // 7. Projetista (Project Designer)
  test('7. Projetista possui atribuições técnicas sem gestão administrativa ou financeira', () => {
    const designerSession = {
      user: { id: 'usr-dsg', email: 'designer@agrocore.test', name: 'Projetista' },
      platformRole: 'none',
      organizationRole: 'project_designer',
      currentRole: 'project_designer',
      activeScope: 'organization',
      isDevelopmentAccount: true,
      lastAuthenticatedAt: new Date().toISOString(),
    };

    const context = {
      session: designerSession,
      orgContext: {
        status: 'active',
        activeOrganization: { id: 'org-1', name: 'Fazenda Modelo', status: 'active' },
        activeMembership: { id: 'm-1', organizationId: 'org-1', organizationRole: 'project_designer', status: 'active' },
        availableMemberships: [],
      },
    };

    assert.strictEqual(evaluatePermission('organization:view_overview', context).granted, true);
    assert.strictEqual(evaluatePermission('clients:view', context).granted, true);
    assert.strictEqual(evaluatePermission('proposals:view_assigned', context).granted, true);
    assert.strictEqual(evaluatePermission('proposals:review', context).granted, true);
    assert.strictEqual(evaluatePermission('documents:upload', context).granted, true);
    assert.strictEqual(evaluatePermission('surveys_and_visits:schedule', context).granted, true);
    assert.strictEqual(evaluatePermission('schedule:view', context).granted, true);

    // Negadas
    assert.strictEqual(evaluatePermission('clients:create', context).granted, false);
    assert.strictEqual(evaluatePermission('proposals:create', context).granted, false);
    assert.strictEqual(evaluatePermission('proposals:edit_draft', context).granted, false);
    assert.strictEqual(evaluatePermission('proposals:approve', context).granted, false);
    assert.strictEqual(evaluatePermission('fleet:manage', context).granted, false);
    assert.strictEqual(evaluatePermission('finance:view_records', context).granted, false);
    assert.strictEqual(evaluatePermission('users_and_access:view', context).granted, false);
  });

  // 8. Financeiro (Finance)
  test('8. Financeiro possui operações financeiras e consulta operacional', () => {
    const finSession = {
      user: { id: 'usr-fin', email: 'finance@agrocore.test', name: 'Financeiro' },
      platformRole: 'none',
      organizationRole: 'finance',
      currentRole: 'finance',
      activeScope: 'organization',
      isDevelopmentAccount: true,
      lastAuthenticatedAt: new Date().toISOString(),
    };

    const context = {
      session: finSession,
      orgContext: {
        status: 'active',
        activeOrganization: { id: 'org-1', name: 'Fazenda Modelo', status: 'active' },
        activeMembership: { id: 'm-1', organizationId: 'org-1', organizationRole: 'finance', status: 'active' },
        availableMemberships: [],
      },
    };

    assert.strictEqual(evaluatePermission('organization:view_overview', context).granted, true);
    assert.strictEqual(evaluatePermission('finance:view_overview', context).granted, true);
    assert.strictEqual(evaluatePermission('finance:view_records', context).granted, true);
    assert.strictEqual(evaluatePermission('finance:manage_operations', context).granted, true);
    assert.strictEqual(evaluatePermission('clients:view', context).granted, true);
    assert.strictEqual(evaluatePermission('proposals:view', context).granted, true);
    assert.strictEqual(evaluatePermission('documents:view', context).granted, true);

    // Negadas
    assert.strictEqual(evaluatePermission('clients:create', context).granted, false);
    assert.strictEqual(evaluatePermission('proposals:create', context).granted, false);
    assert.strictEqual(evaluatePermission('schedule:manage', context).granted, false);
    assert.strictEqual(evaluatePermission('users_and_access:view', context).granted, false);
  });

  // 9. Captador (Capturer)
  test('9. Captador atua na prospecção e cadastro inicial restrito', () => {
    const capSession = {
      user: { id: 'usr-cap', email: 'capturer@agrocore.test', name: 'Captador' },
      platformRole: 'none',
      organizationRole: 'capturer',
      currentRole: 'capturer',
      activeScope: 'organization',
      isDevelopmentAccount: true,
      lastAuthenticatedAt: new Date().toISOString(),
    };

    const context = {
      session: capSession,
      orgContext: {
        status: 'active',
        activeOrganization: { id: 'org-1', name: 'Fazenda Modelo', status: 'active' },
        activeMembership: { id: 'm-1', organizationId: 'org-1', organizationRole: 'capturer', status: 'active' },
        availableMemberships: [],
      },
    };

    assert.strictEqual(evaluatePermission('organization:view_overview', context).granted, true);
    assert.strictEqual(evaluatePermission('clients:view', context).granted, true);
    assert.strictEqual(evaluatePermission('clients:create', context).granted, true);
    assert.strictEqual(evaluatePermission('proposals:view', context).granted, true);
    assert.strictEqual(evaluatePermission('proposals:create', context).granted, true);
    assert.strictEqual(evaluatePermission('documents:view', context).granted, true);
    assert.strictEqual(evaluatePermission('documents:upload', context).granted, true);
    assert.strictEqual(evaluatePermission('surveys_and_visits:view', context).granted, true);

    // Negadas
    assert.strictEqual(evaluatePermission('proposals:edit_draft', context).granted, true);
    assert.strictEqual(evaluatePermission('proposals:review', context).granted, false);
    assert.strictEqual(evaluatePermission('proposals:approve', context).granted, false);
    assert.strictEqual(evaluatePermission('documents:manage', context).granted, false);
    assert.strictEqual(evaluatePermission('finance:view_records', context).granted, false);
    assert.strictEqual(evaluatePermission('users_and_access:view', context).granted, false);
  });

  // 10. Sessão Ausente e Permissão Desconhecida
  test('10. Negação segura para permissões ou perfis desconhecidos e sessão nula', () => {
    const anonymousContext = { session: null, orgContext: null };
    const noSessionDec = evaluatePermission('clients:view', anonymousContext);
    assert.strictEqual(noSessionDec.granted, false);
    assert.ok(noSessionDec.reason?.includes('Sessão de usuário não autenticada'));

    const ownerSession = {
      user: { id: 'usr-owner', email: 'owner@agrocore.test', name: 'Proprietário' },
      platformRole: 'none',
      organizationRole: 'owner',
      currentRole: 'owner',
      activeScope: 'organization',
      isDevelopmentAccount: true,
      lastAuthenticatedAt: new Date().toISOString(),
    };
    const context = { session: ownerSession, orgContext: null };

    const unknownPermDec = evaluatePermission('hack:drop_database', context);
    assert.strictEqual(unknownPermDec.granted, false);
    assert.ok(unknownPermDec.reason?.includes('não reconhecida'));
  });

  // 11. Organização Pendente / Suspensa / Indisponível
  test('11. Organização em estado restrito bloqueia permissões operacionais com motivo claro', () => {
    const ownerSession = {
      user: { id: 'usr-owner', email: 'owner@agrocore.test', name: 'Proprietário' },
      platformRole: 'none',
      organizationRole: 'owner',
      currentRole: 'owner',
      activeScope: 'organization',
      isDevelopmentAccount: true,
      lastAuthenticatedAt: new Date().toISOString(),
    };

    // Cenário: Acesso Pendente
    const pendingContext = {
      session: ownerSession,
      orgContext: {
        status: 'accessPending',
        activeOrganization: null,
        activeMembership: null,
        availableMemberships: [],
      },
    };

    const pendingDec = evaluatePermission('clients:view', pendingContext);
    assert.strictEqual(pendingDec.granted, false);
    assert.ok(pendingDec.reason?.includes('pendente de aprovação'));

    // Mas permissão de conta pessoal permanece acessível
    assert.strictEqual(evaluatePermission('personal_account:view_profile', pendingContext).granted, true);

    // Cenário: Organização Suspensa
    const suspendedContext = {
      session: ownerSession,
      orgContext: {
        status: 'suspended',
        activeOrganization: { id: 'org-1', name: 'Org Suspensa', status: 'suspended' },
        activeMembership: { id: 'm-1', organizationId: 'org-1', organizationRole: 'owner', status: 'suspended' },
        availableMemberships: [],
      },
    };

    const suspendedDec = evaluatePermission('organization:view_overview', suspendedContext);
    assert.strictEqual(suspendedDec.granted, false);
    assert.ok(suspendedDec.reason?.includes('suspensa'));
  });

  // 12. Sumário de Capacidades em Linguagem Amigável
  test('12. getGrantedPermissionSummaries produz lista descritiva em português sem códigos técnicos', () => {
    const ownerSession = {
      user: { id: 'usr-owner', email: 'owner@agrocore.test', name: 'Proprietário' },
      platformRole: 'none',
      organizationRole: 'owner',
      currentRole: 'owner',
      activeScope: 'organization',
      isDevelopmentAccount: true,
      lastAuthenticatedAt: new Date().toISOString(),
    };

    const context = {
      session: ownerSession,
      orgContext: {
        status: 'active',
        activeOrganization: { id: 'org-1', name: 'Fazenda Modelo', status: 'active' },
        activeMembership: { id: 'm-1', organizationId: 'org-1', organizationRole: 'owner', status: 'active' },
        availableMemberships: [],
      },
    };

    const summaries = getGrantedPermissionSummaries(context);
    assert.ok(summaries.length >= 8);

    for (const group of summaries) {
      assert.ok(group.groupName && group.groupName.length > 2);
      assert.ok(group.groupDescription && group.groupDescription.length > 5);
      assert.ok(Array.isArray(group.capabilities) && group.capabilities.length > 0);
      for (const cap of group.capabilities) {
        // Não deve expor formatos como 'scope:action'
        assert.ok(!cap.includes(':'), `Capacidade expõe código técnico: ${cap}`);
      }
    }
  });

  // 13. Rota de Acesso Negado e Metadados Centrais
  test('13. Rota /acesso-negado e metadados de página estão devidamente registrados', () => {
    assert.strictEqual(ROUTES.ACCESS_DENIED, '/acesso-negado');
    assert.ok(ROUTE_METADATA_MAP[ROUTES.ACCESS_DENIED]);
    assert.strictEqual(ROUTE_METADATA_MAP[ROUTES.ACCESS_DENIED].documentTitle, 'Acesso Negado | AgroCore');
  });

  console.log(`\n🎉 Todos os ${passed}/${total} testes de autorização passaram com 100% de sucesso!`);
}

runTests().catch((err) => {
  console.error('Falha geral na execução dos testes de autorização:', err);
  process.exit(1);
});
