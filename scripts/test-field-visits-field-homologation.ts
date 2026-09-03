import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FIELD_OFFLINE_DRAFT_MESSAGE,
  FIELD_OFFLINE_EVIDENCE_MESSAGE,
  getGeolocationErrorMessage,
  readFieldConnectivity,
} from '../src/fieldVisits/fieldDevice.ts';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import { PreviewTechnicalVisitGateway } from '../src/fieldVisits/preview/previewTechnicalVisitGateway.ts';
import { TechnicalVisitService } from '../src/fieldVisits/technicalVisitService.ts';
import type {
  TechnicalVisit,
  TechnicalVisitApplicationContext,
  TechnicalVisitAuditEntry,
} from '../src/types/technicalVisit.ts';
import type { OrganizationRole } from '../src/types/auth.ts';

const page = fs.readFileSync('src/pages/FieldVisitsPage.tsx', 'utf8');
const formPanel = fs.readFileSync('src/fieldVisits/VisitFieldFormPanel.tsx', 'utf8');
const evidencePanel = fs.readFileSync('src/fieldVisits/FieldEvidencePanel.tsx', 'utf8');
const integrationPanel = fs.readFileSync('src/fieldVisits/VisitIntegrationPanel.tsx', 'utf8');
const completionPanel = fs.readFileSync('src/fieldVisits/VisitCompletionReportPanel.tsx', 'utf8');
const preparationPanel = fs.readFileSync('src/fieldVisits/VisitPreparationPanel.tsx', 'utf8');
const connectivityHook = fs.readFileSync('src/fieldVisits/useFieldConnectivity.ts', 'utf8');
const devicePolicy = fs.readFileSync('src/fieldVisits/fieldDevice.ts', 'utf8');
const evidencePolicy = fs.readFileSync('src/fieldVisits/fieldEvidencePolicy.ts', 'utf8');
const evidenceMigration = fs.readFileSync(
  'supabase/migrations/20260902230000_oe_007_004_property_canonical_sync.sql',
  'utf8'
);
const integrationMigration = fs.readFileSync(
  'supabase/migrations/20260903121204_oe_007_006_visit_integrations.sql',
  'utf8'
);
const homologationIndexes = fs.readFileSync(
  'supabase/migrations/20260903125730_oe_007_007_field_homologation_indexes.sql',
  'utf8'
);
const packageJson = fs.readFileSync('package.json', 'utf8');
const moduleGate = fs.readFileSync('scripts/test-module-007.js', 'utf8');
const accessibilitySuite = fs.readFileSync(
  'scripts/test-field-visits-accessibility.ts',
  'utf8'
);
const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

let passed = 0;
let failed = 0;

async function test(name: string, operation: () => void | Promise<void>) {
  try {
    await operation();
    passed += 1;
    console.log('  [PASS] ' + name);
  } catch (error) {
    failed += 1;
    console.error('  [FAIL] ' + name);
    console.error(error);
  }
}

function visit(): TechnicalVisit {
  return {
    id: 'visit-field-homologation',
    organizationId: 'org-field',
    activityType: 'technical_visit',
    status: 'planned',
    clientId: 'client-field',
    propertyId: 'property-field',
    proposalId: 'proposal-field',
    appraisalId: null,
    responsibleUserId: 'designer-field',
    scheduledFor: '2026-09-10T12:00:00.000Z',
    preparation: null,
    purpose: 'Homologação de campo do Módulo 007.',
    createdByUserId: 'owner-field',
    createdAt: '2026-09-03T12:00:00.000Z',
    updatedByUserId: 'owner-field',
    updatedAt: '2026-09-03T12:00:00.000Z',
    confirmedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    version: 1,
  };
}

function audit(entity: TechnicalVisit): TechnicalVisitAuditEntry {
  return {
    id: 'audit-field-homologation',
    organizationId: entity.organizationId,
    visitId: entity.id,
    action: 'created',
    actorUserId: entity.createdByUserId,
    at: entity.createdAt,
    version: entity.version,
    fromStatus: null,
    toStatus: entity.status,
    reason: null,
    changedFields: ['purpose'],
  };
}

function context(
  role: OrganizationRole,
  userId: string
): TechnicalVisitApplicationContext {
  return {
    organizationId: 'org-field',
    actor: {
      userId,
      role,
      isActive: true,
      permissions: [...getRolePermissions(role)],
    },
    resolveMember: async (memberUserId) => ({
      exists: true,
      organizationId: 'org-field',
      userId: memberUserId,
      isActive: true,
      canExecute: true,
    }),
    resolveClient: async () => ({
      exists: true,
      organizationId: 'org-field',
      status: 'active',
    }),
    resolveProperty: async () => ({
      exists: true,
      organizationId: 'org-field',
      status: 'active',
      clientIds: ['client-field'],
    }),
    resolveProposal: async () => ({
      exists: true,
      organizationId: 'org-field',
      clientId: 'client-field',
      propertyId: 'property-field',
    }),
    resolveAppraisal: async () => ({
      exists: true,
      organizationId: 'org-field',
      clientId: 'client-field',
      propertyId: 'property-field',
    }),
  };
}

console.log('====================================================');
console.log(' AGROCORE — OE-007.007 — HOMOLOGAÇÃO DE CAMPO');
console.log('====================================================\n');

// A. Celular, responsividade e acessibilidade
await test('1. Viewports obrigatórios do Plano Mestre estão cobertos', () => {
  for (const width of [320, 390, 430, 720, 768, 1024, 1366, 1440]) {
    assert.match(accessibilitySuite, new RegExp(String(width)));
  }
});

await test('2. Filtro principal não força largura mínima em celular', () => {
  assert.match(page, /block w-full flex-1 min-w-0/);
  assert.match(page, /block w-full min-w-0 max-w-full cursor-pointer/);
});

await test('3. Formulário de campo é protegido contra overflow horizontal', () => {
  assert.match(formPanel, /min-w-0 overflow-hidden/);
  assert.match(formPanel, /grid min-w-0 gap-3 md:grid-cols-2/);
});

await test('4. Evidências são mobile-first e sem largura fixa grande', () => {
  assert.match(evidencePanel, /min-w-0 p-4 sm:p-5/);
  assert.doesNotMatch(evidencePanel, /min-w-\[(?:[4-9]\d\d|\d{4,})px\]/);
});

await test('5. Integrações crescem somente a partir do breakpoint md', () => {
  assert.match(integrationPanel, /grid gap-3 md:grid-cols-3/);
});

await test('6. Painel de conclusão possui estratégia responsiva', () => {
  assert.match(completionPanel, /sm:/);
  assert.match(completionPanel, /md:/);
});

await test('7. Preparação preserva layout responsivo', () => {
  assert.match(preparationPanel, /sm:grid-cols-2/);
  assert.match(preparationPanel, /md:grid-cols-3/);
});

await test('8. Controles de campo preservam alvo mínimo de toque', () => {
  assert.match(formPanel, /min-h-\[44px\]/);
  assert.match(evidencePanel, /min-h-\[44px\]/);
});

await test('9. Câmera traseira é sugerida quando suportada', () => {
  assert.match(evidencePanel, /capture="environment"/);
});

await test('10. Coordenadas manuais usam teclado decimal', () => {
  assert.ok((evidencePanel.match(/inputMode="decimal"/g) ?? []).length >= 2);
});

// B. Permissões e menor privilégio
await test('11. Owner possui view/schedule/execute de visitas', () => {
  const p = getRolePermissions('owner');
  assert.ok(p.includes('surveys_and_visits:view'));
  assert.ok(p.includes('surveys_and_visits:schedule'));
  assert.ok(p.includes('surveys_and_visits:execute'));
});

await test('12. Company admin possui view/schedule/execute de visitas', () => {
  const p = getRolePermissions('company_admin');
  assert.ok(p.includes('surveys_and_visits:view'));
  assert.ok(p.includes('surveys_and_visits:schedule'));
  assert.ok(p.includes('surveys_and_visits:execute'));
});

await test('13. Manager possui view/schedule/execute de visitas', () => {
  const p = getRolePermissions('manager');
  assert.ok(p.includes('surveys_and_visits:view'));
  assert.ok(p.includes('surveys_and_visits:schedule'));
  assert.ok(p.includes('surveys_and_visits:execute'));
});

await test('14. Projetista possui execução de campo', () => {
  const p = getRolePermissions('project_designer');
  assert.ok(p.includes('surveys_and_visits:view'));
  assert.ok(p.includes('surveys_and_visits:schedule'));
  assert.ok(p.includes('surveys_and_visits:execute'));
});

await test('15. Captador permanece somente em consulta de visitas', () => {
  const p = getRolePermissions('capturer');
  assert.ok(p.includes('surveys_and_visits:view'));
  assert.equal(p.includes('surveys_and_visits:schedule'), false);
  assert.equal(p.includes('surveys_and_visits:execute'), false);
});

await test('16. Financeiro não recebe permissão de campo', () => {
  const p = getRolePermissions('finance');
  assert.equal(p.includes('surveys_and_visits:view'), false);
  assert.equal(p.includes('surveys_and_visits:schedule'), false);
  assert.equal(p.includes('surveys_and_visits:execute'), false);
});

await test('17. Superadmin da plataforma não herda operação organizacional', () => {
  const p = getRolePermissions('platform_super_admin');
  assert.equal(p.includes('surveys_and_visits:view'), false);
  assert.equal(p.includes('surveys_and_visits:schedule'), false);
  assert.equal(p.includes('surveys_and_visits:execute'), false);
});

await test('18. Captador não acessa integrações técnicas mesmo possuindo view', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const entity = visit();
  await gateway.createVisit({ visit: entity, audit: audit(entity), expectedVersion: null });
  const service = new TechnicalVisitService(gateway);
  await assert.rejects(
    () => service.getIntegrationSnapshot(context('capturer', 'capturer-field'), entity.id),
    (error: unknown) => error instanceof Error
  );
});

await test('19. Projetista responsável acessa integrações da própria visita', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const entity = visit();
  await gateway.createVisit({ visit: entity, audit: audit(entity), expectedVersion: null });
  const service = new TechnicalVisitService(gateway);
  const snapshot = await service.getIntegrationSnapshot(
    context('project_designer', 'designer-field'),
    entity.id
  );
  assert.equal(snapshot.visitId, entity.id);
});

await test('20. Projetista não responsável não acessa integração técnica alheia', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const entity = visit();
  await gateway.createVisit({ visit: entity, audit: audit(entity), expectedVersion: null });
  const service = new TechnicalVisitService(gateway);
  await assert.rejects(
    () =>
      service.getIntegrationSnapshot(
        context('project_designer', 'designer-other'),
        entity.id
      ),
    (error: unknown) => error instanceof Error
  );
});

// C. Conectividade e retomada
await test('21. Estado online é detectado sem depender de API externa', () => {
  assert.equal(readFieldConnectivity({ onLine: true }), 'online');
});

await test('22. Estado offline é detectado sem depender de API externa', () => {
  assert.equal(readFieldConnectivity({ onLine: false }), 'offline');
});

await test('23. Ambiente sem navigator é tratado como estado desconhecido', () => {
  assert.equal(readFieldConnectivity(null), 'unknown');
});

await test('24. Hook reage aos eventos online e offline do navegador', () => {
  assert.match(connectivityHook, /addEventListener\('online'/);
  assert.match(connectivityHook, /addEventListener\('offline'/);
  assert.match(connectivityHook, /removeEventListener\('online'/);
  assert.match(connectivityHook, /removeEventListener\('offline'/);
});

await test('25. Rascunho não tenta persistir enquanto offline', () => {
  const start = formPanel.indexOf('const persistDraft');
  const end = formPanel.indexOf('const addSection', start);
  const block = formPanel.slice(start, end);
  assert.match(block, /if \(isOffline\)/);
  assert.match(block, /FIELD_OFFLINE_DRAFT_MESSAGE/);
});

await test('26. Alterações pendentes continuam protegidas contra fechamento', () => {
  assert.match(formPanel, /beforeunload/);
  assert.match(formPanel, /if \(!dirty && !saving\) return/);
});

await test('27. Autosave é retomado quando a conectividade deixa de estar offline', () => {
  assert.match(formPanel, /if \(!editable \|\| !dirty \|\| saving \|\| isOffline\) return/);
  assert.match(formPanel, /connectivity === 'online' \? 500 : 800/);
});

await test('28. Salvamento manual fica indisponível offline', () => {
  assert.match(formPanel, /disabled=\{saving \|\| !dirty \|\| isOffline\}/);
});

await test('29. Envio final do formulário é bloqueado sem conexão', () => {
  const start = formPanel.indexOf('const submit = async');
  const end = formPanel.indexOf('const toggleOpen', start);
  assert.match(formPanel.slice(start, end), /if \(isOffline\)/);
});

await test('30. Mensagem offline não promete persistência local inexistente', () => {
  assert.match(FIELD_OFFLINE_DRAFT_MESSAGE, /Mantenha a página aberta/);
  assert.doesNotMatch(FIELD_OFFLINE_DRAFT_MESSAGE, /offline salvo|armazenado localmente|sincronizado depois/i);
  assert.doesNotMatch(devicePolicy, /indexedDB|localStorage/i);
});

// D. GPS, fotos e evidências
await test('31. GPS negado possui mensagem específica e fallback manual', () => {
  const message = getGeolocationErrorMessage(1);
  assert.match(message, /bloqueada/);
  assert.match(message, /coordenadas manualmente/);
});

await test('32. GPS indisponível possui orientação específica', () => {
  assert.match(getGeolocationErrorMessage(2), /não conseguiu determinar/);
});

await test('33. Timeout de GPS possui orientação específica', () => {
  assert.match(getGeolocationErrorMessage(3), /demorou mais/);
});

await test('34. Captura GPS usa alta precisão e timeout finito', () => {
  assert.match(evidencePanel, /enableHighAccuracy: true/);
  assert.match(evidencePanel, /timeout: 15000/);
  assert.match(evidencePanel, /maximumAge: 0/);
});

await test('35. GPS obtido offline é preservado nos campos manuais da tela', () => {
  assert.match(evidencePanel, /setManualLatitude\(String\(position\.coords\.latitude\)\)/);
  assert.match(evidencePanel, /setManualLongitude\(String\(position\.coords\.longitude\)\)/);
  assert.match(evidencePanel, /ainda não foi gravada/);
});

await test('36. Upload de fotografia é recusado explicitamente sem rede', () => {
  const start = evidencePanel.indexOf('const uploadFiles');
  const end = evidencePanel.indexOf('if (loading)', start);
  assert.match(evidencePanel.slice(start, end), /if \(isOffline\)/);
  assert.match(FIELD_OFFLINE_EVIDENCE_MESSAGE, /Fotos e coordenadas precisam de conexão/);
});

await test('37. Fotos permanecem limitadas a JPEG, PNG e TIFF', () => {
  assert.match(evidencePolicy, /image\/jpeg/);
  assert.match(evidencePolicy, /image\/png/);
  assert.match(evidencePolicy, /image\/tiff/);
});

await test('38. Fotografia de campo permanece limitada a 15 MB', () => {
  assert.match(evidencePolicy, /15 \* 1024 \* 1024/);
});

await test('39. Assinatura real do arquivo continua verificada', () => {
  assert.match(evidencePolicy, /verifyDocumentFileSignature\(file\)/);
});

await test('40. Evidência continua canônica por organização e imóvel', () => {
  assert.match(evidenceMigration, /field_evidence_sets_org_property_uq/);
  assert.match(evidenceMigration, /\(organization_id, property_id\)/);
});

// E. Integrações, banco remoto e gates
await test('41. Integrações continuam restritas a Agenda, Proposta e Frota', () => {
  assert.match(integrationMigration, /target_domain in \('calendar','proposal','fleet'\)/);
});

await test('42. Trigger autoritativo continua ativo no modelo de integração', () => {
  assert.match(integrationMigration, /after insert or update on public\.technical_visits/);
});

await test('43. Painel de integrações evita consulta enquanto offline e retoma ao reconectar', () => {
  assert.match(integrationPanel, /if \(isOffline\)/);
  assert.match(integrationPanel, /isOffline, visit\.id, visit\.version/);
});

await test('44. OE-007.007 cobre todas as FKs pendentes de technical_visits', () => {
  for (const index of [
    'technical_visits_client_fk_idx',
    'technical_visits_property_fk_idx',
    'technical_visits_responsible_fk_idx',
  ]) {
    assert.match(homologationIndexes, new RegExp(index));
  }
});

await test('45. OE-007.007 cobre FKs de auditoria e formulário de campo', () => {
  for (const index of [
    'technical_visit_audit_actor_fk_idx',
    'technical_visit_field_forms_visit_fk_idx',
    'technical_visit_field_forms_created_by_fk_idx',
    'technical_visit_field_forms_updated_by_fk_idx',
    'technical_visit_field_forms_submitted_by_fk_idx',
    'technical_visit_field_form_revisions_visit_fk_idx',
    'technical_visit_field_form_revisions_actor_fk_idx',
  ]) {
    assert.match(homologationIndexes, new RegExp(index));
  }
});

await test('46. Migração de homologação não altera dados de negócio', () => {
  assert.doesNotMatch(homologationIndexes, /insert into|update public\.|delete from/i);
});

await test('47. Build de produção contém TypeScript e gate do Módulo 007', () => {
  assert.match(packageJson, /tsc --noEmit/);
  assert.match(packageJson, /test:module-007/);
});

await test('48. CI não depende de chaves para iniciar validação de ambiente', () => {
  const envIndex = workflow.indexOf('Validar Contrato de Ambiente sem Chaves');
  const installIndex = workflow.indexOf('Instalar Dependências');
  assert.ok(envIndex >= 0);
  assert.ok(installIndex > envIndex);
});

await test('49. Homologação de campo não antecipa IndexedDB/fila offline do Módulo 013', () => {
  const sources = [formPanel, evidencePanel, integrationPanel, connectivityHook, devicePolicy].join('\n');
  assert.doesNotMatch(sources, /indexedDB|offlineQueue|syncQueue|mutationQueue/i);
});

await test('50. Gate do módulo executa explicitamente a OE-007.007', () => {
  assert.match(moduleGate, /test-field-visits-field-homologation\.ts/);
  assert.match(packageJson, /test:field-visits-field-homologation/);
  assert.match(moduleGate, /OE-007\.001 A OE-007\.007/);
});

console.log('\n====================================================');
console.log('Resultado OE-007.007: ' + passed + ' aprovadas, ' + failed + ' falhas.');
console.log('====================================================');

if (failed > 0) process.exit(1);
