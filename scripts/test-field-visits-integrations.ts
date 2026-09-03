import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {
  TechnicalVisit,
  TechnicalVisitAuditEntry,
} from '../src/types/technicalVisit.ts';
import { PreviewTechnicalVisitGateway } from '../src/fieldVisits/preview/previewTechnicalVisitGateway.ts';

const migration = fs.readFileSync(
  'supabase/migrations/20260903121204_oe_007_006_visit_integrations.sql',
  'utf8'
);
const rlsFix = fs.readFileSync(
  'supabase/migrations/20260903121647_oe_007_006_rls_authorizer_access.sql',
  'utf8'
);
const fkIndexes = fs.readFileSync(
  'supabase/migrations/20260903122147_oe_007_006_visit_fk_indexes.sql',
  'utf8'
);
const types = fs.readFileSync(
  'src/types/technicalVisitIntegration.ts',
  'utf8'
);
const visitTypes = fs.readFileSync('src/types/technicalVisit.ts', 'utf8');
const service = fs.readFileSync('src/fieldVisits/technicalVisitService.ts', 'utf8');
const supabaseGateway = fs.readFileSync(
  'src/fieldVisits/supabaseTechnicalVisitGateway.ts',
  'utf8'
);
const previewGatewaySource = fs.readFileSync(
  'src/fieldVisits/preview/previewTechnicalVisitGateway.ts',
  'utf8'
);
const unavailableGateway = fs.readFileSync(
  'src/fieldVisits/unavailableGateway.ts',
  'utf8'
);
const factory = fs.readFileSync('src/fieldVisits/gatewayFactory.ts', 'utf8');
const contextSource = fs.readFileSync(
  'src/fieldVisits/FieldVisitsContext.tsx',
  'utf8'
);
const panel = fs.readFileSync(
  'src/fieldVisits/VisitIntegrationPanel.tsx',
  'utf8'
);
const page = fs.readFileSync('src/pages/FieldVisitsPage.tsx', 'utf8');
const vite = fs.readFileSync('vite.config.ts', 'utf8');

let passed = 0;
let failed = 0;

async function test(name: string, operation: () => void | Promise<void>) {
  try {
    await operation();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  [FAIL] ${name}`);
    console.error(error);
  }
}

function visit(overrides: Partial<TechnicalVisit> = {}): TechnicalVisit {
  return {
    id: 'visit-integration-1',
    organizationId: 'org-a',
    activityType: 'technical_visit',
    status: 'planned',
    clientId: 'client-a',
    propertyId: 'property-a',
    proposalId: 'proposal-a',
    appraisalId: null,
    responsibleUserId: 'user-tech',
    scheduledFor: '2026-09-10T12:00:00.000Z',
    preparation: null,
    purpose: 'Visita integrada para acompanhamento técnico.',
    createdByUserId: 'user-owner',
    createdAt: '2026-09-03T12:00:00.000Z',
    updatedByUserId: 'user-owner',
    updatedAt: '2026-09-03T12:00:00.000Z',
    confirmedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    version: 1,
    ...overrides,
  };
}

function audit(entity: TechnicalVisit): TechnicalVisitAuditEntry {
  return {
    id: `audit-${entity.id}-${entity.version}`,
    organizationId: entity.organizationId,
    visitId: entity.id,
    action: entity.version === 1 ? 'created' : 'updated',
    actorUserId: entity.updatedByUserId,
    at: entity.updatedAt,
    version: entity.version,
    fromStatus: null,
    toStatus: entity.status,
    reason: entity.version === 1 ? null : 'Atualização de teste',
    changedFields: ['purpose'],
  };
}

console.log('====================================================');
console.log(' AGROCORE — OE-007.006 — INTEGRAÇÕES OPERACIONAIS');
console.log('====================================================\n');

await test('1. Cria tabela de links estáveis', () => {
  assert.match(migration, /create table if not exists public\.technical_visit_integration_links/i);
});

await test('2. Cria outbox append-only de eventos', () => {
  assert.match(migration, /create table if not exists public\.technical_visit_integration_events/i);
});

await test('3. Links são únicos por visita e domínio', () => {
  assert.match(migration, /unique \(organization_id, visit_id, target_domain\)/i);
});

await test('4. Eventos possuem chave idempotente única por organização', () => {
  assert.match(migration, /unique \(organization_id, event_key\)/i);
});

await test('5. Os três domínios permitidos são agenda, proposta e frota', () => {
  assert.match(migration, /target_domain in \('calendar','proposal','fleet'\)/);
  assert.match(types, /'calendar'[\s\S]*'proposal'[\s\S]*'fleet'/);
});

await test('6. Eventos repetidos com conteúdo divergente são recusados', () => {
  assert.match(migration, /AGROCORE_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /v_existing\.payload is distinct from p_payload/);
});

await test('7. authenticated não recebe escrita direta nas tabelas de integração', () => {
  assert.match(
    migration,
    /revoke insert, update, delete, truncate, references, trigger[\s\S]*technical_visit_integration_links from authenticated/
  );
  assert.match(
    migration,
    /revoke insert, update, delete, truncate, references, trigger[\s\S]*technical_visit_integration_events from authenticated/
  );
});

await test('8. RLS está habilitado nas duas tabelas', () => {
  assert.match(migration, /technical_visit_integration_links enable row level security/);
  assert.match(migration, /technical_visit_integration_events enable row level security/);
});

await test('9. RLS permite gestão e projetista responsável, sem liberar financeiro/captador', () => {
  const start = migration.indexOf(
    'create or replace function agrocore_private.can_view_technical_visit_integrations'
  );
  const end = migration.indexOf(
    'revoke all on function agrocore_private.can_view_technical_visit_integrations',
    start
  );
  const policyFunction = migration.slice(start, end);
  assert.match(policyFunction, /owner','company_admin','manager/);
  assert.match(policyFunction, /project_designer/);
  assert.match(policyFunction, /responsible_user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(policyFunction, /finance/);
  assert.doesNotMatch(policyFunction, /capturer/);
});

await test('10. R1 concede somente execução do avaliador necessário às policies', () => {
  assert.match(
    rlsFix,
    /grant execute on function agrocore_private\.can_view_technical_visit_integrations\(uuid,uuid\)[\s\S]*to authenticated/
  );
  assert.doesNotMatch(rlsFix, /upsert_technical_visit_integration_link/);
  assert.doesNotMatch(rlsFix, /emit_technical_visit_integration_event/);
});

await test('11. Trigger sincroniza qualquer INSERT/UPDATE da visita', () => {
  assert.match(migration, /after insert or update on public\.technical_visits/i);
  assert.match(migration, /technical_visit_integration_trigger/);
});

await test('12. Backfill não altera visita nem incrementa versão', () => {
  const backfill = migration.slice(migration.indexOf('-- Backfill seguro'));
  assert.match(backfill, /sync_technical_visit_integrations\(v_visit, null, true\)/);
  assert.doesNotMatch(backfill, /update public\.technical_visits/i);
});

await test('13. Agenda usa o ID da visita como referência estável', () => {
  assert.match(
    migration,
    /'targetDomain', 'calendar'[\s\S]*'stableReference', p_new\.id::text/
  );
});

await test('14. Frota usa o ID da visita como correlação estável sem inventar veículo', () => {
  const fleet = migration.slice(migration.indexOf("'targetDomain', 'fleet'"));
  assert.match(fleet, /'stableReference', p_new\.id::text/);
  assert.doesNotMatch(fleet, /vehicleId|reservationId/);
});

await test('15. Proposta usa o proposalId já vinculado à visita', () => {
  assert.match(migration, /v_new_proposal text := nullif\(btrim\(coalesce\(p_new\.payload ->> 'proposalId'/);
  assert.match(migration, /'stableReference', v_new_proposal/);
});

await test('16. Troca de proposta produz unlink e relink rastreáveis', () => {
  assert.match(migration, /proposal\.visit_unlinked/);
  assert.match(migration, /proposal\.visit_relinked/);
});

await test('17. Mudança de estado é propagada à proposta vinculada', () => {
  assert.match(migration, /proposal\.visit_status_changed/);
});

await test('18. Agenda recebe sync e release distintos', () => {
  assert.match(migration, /calendar\.visit_sync_requested/);
  assert.match(migration, /calendar\.visit_release_requested/);
});

await test('19. Frota recebe sync e release distintos', () => {
  assert.match(migration, /fleet\.visit_sync_requested/);
  assert.match(migration, /fleet\.visit_release_requested/);
});

await test('20. Visita terminal libera agenda e frota', () => {
  assert.match(migration, /v_terminal boolean := p_new\.status in \('completed','cancelled'\)/);
  assert.match(migration, /case when v_terminal then 'released' else 'active' end/);
});

await test('21. Migração não antecipa tabelas completas de agenda, tarefas, veículos ou reservas', () => {
  assert.doesNotMatch(migration, /create table[^;]*(calendar_events|tasks|vehicles|fleet_reservations)/i);
});

await test('22. Contrato do gateway expõe snapshot de integração', () => {
  assert.match(visitTypes, /getIntegrationSnapshot/);
  assert.match(types, /TechnicalVisitIntegrationSnapshot/);
});

await test('23. Gateway Supabase lê links e eventos persistidos', () => {
  assert.match(supabaseGateway, /technical_visit_integration_links/);
  assert.match(supabaseGateway, /technical_visit_integration_events/);
  assert.match(supabaseGateway, /async getIntegrationSnapshot/);
});

await test('24. Gateway indisponível falha fechado também para integrações', () => {
  assert.match(unavailableGateway, /async getIntegrationSnapshot/);
  assert.match(unavailableGateway, /return this\.fail\(\)/);
});

await test('25. Factory de desenvolvimento delega snapshots ao gateway ativo', () => {
  assert.match(factory, /async getIntegrationSnapshot/);
  assert.match(factory, /\.getIntegrationSnapshot\(organizationId, visitId\)/);
});

await test('26. Build de produção continua usando SupabaseTechnicalVisitGateway', () => {
  assert.match(vite, /virtual:production-field-visits-gateway-factory/);
  assert.match(vite, /new SupabaseTechnicalVisitGateway\(supabase\)/);
});

await test('27. Serviço exige permissão de visualização antes da integração', () => {
  assert.match(service, /async getIntegrationSnapshot/);
  assert.match(service, /assertPermission\(context, 'surveys_and_visits:view'\)/);
  assert.match(service, /assertIntegrationAccess/);
});

await test('28. Contexto disponibiliza integração sem criar uma segunda fonte de visita', () => {
  assert.match(contextSource, /readonly getIntegrationSnapshot/);
  assert.match(contextSource, /service\.getIntegrationSnapshot/);
  assert.doesNotMatch(contextSource, /integrationVisitStore|integrationVisitsStore/);
});

await test('29. Painel mostra os três vínculos sem expor códigos internos', () => {
  assert.match(panel, /Agenda/);
  assert.match(panel, /Proposta/);
  assert.match(panel, /Frota/);
  assert.doesNotMatch(panel, /OE-007|Módulo 008|Módulo 009/);
});

await test('30. Tela principal incorpora o painel de integrações', () => {
  assert.match(page, /VisitIntegrationPanel/);
  assert.match(page, /canAccess=\{canAccessFinalReport\}/);
});

await test('31. Preview cria três integrações ao registrar visita com proposta', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const entity = visit();
  await gateway.createVisit({ visit: entity, audit: audit(entity), expectedVersion: null });
  const snapshot = await gateway.getIntegrationSnapshot(entity.organizationId, entity.id);
  assert.deepEqual(
    snapshot.links.map((item) => item.targetDomain).sort(),
    ['calendar', 'fleet', 'proposal']
  );
  assert.equal(snapshot.events.length, 3);
});

await test('32. Preview preserva referências estáveis corretas', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const entity = visit();
  await gateway.createVisit({ visit: entity, audit: audit(entity), expectedVersion: null });
  const snapshot = await gateway.getIntegrationSnapshot(entity.organizationId, entity.id);
  const calendar = snapshot.links.find((item) => item.targetDomain === 'calendar');
  const proposal = snapshot.links.find((item) => item.targetDomain === 'proposal');
  const fleet = snapshot.links.find((item) => item.targetDomain === 'fleet');
  assert.equal(calendar?.stableReference, entity.id);
  assert.equal(proposal?.stableReference, entity.proposalId);
  assert.equal(fleet?.stableReference, entity.id);
});

await test('33. Alteração sem impacto logístico não cria eventos extras', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const first = visit();
  await gateway.createVisit({ visit: first, audit: audit(first), expectedVersion: null });
  const second = visit({
    version: 2,
    purpose: 'Finalidade textual atualizada sem alterar logística.',
    updatedAt: '2026-09-03T12:05:00.000Z',
  });
  await gateway.updateVisit({ visit: second, audit: audit(second), expectedVersion: 1 });
  const snapshot = await gateway.getIntegrationSnapshot(first.organizationId, first.id);
  assert.equal(snapshot.events.length, 3);
  assert.equal(
    snapshot.links.find((item) => item.targetDomain === 'calendar')?.sourceVersion,
    2
  );
});

await test('34. Troca de proposta gera eventos de desligamento e religação', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const first = visit();
  await gateway.createVisit({ visit: first, audit: audit(first), expectedVersion: null });
  const second = visit({
    version: 2,
    proposalId: 'proposal-b',
    updatedAt: '2026-09-03T12:06:00.000Z',
  });
  await gateway.updateVisit({ visit: second, audit: audit(second), expectedVersion: 1 });
  const snapshot = await gateway.getIntegrationSnapshot(first.organizationId, first.id);
  assert.equal(
    snapshot.links.find((item) => item.targetDomain === 'proposal')?.stableReference,
    'proposal-b'
  );
  assert(snapshot.events.some((item) => item.eventType === 'proposal.visit_unlinked'));
  assert(snapshot.events.some((item) => item.eventType === 'proposal.visit_relinked'));
});

await test('35. Encerramento libera agenda e frota no preview', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const first = visit({ status: 'in_progress' });
  await gateway.createVisit({ visit: first, audit: audit(first), expectedVersion: null });
  await gateway.completeVisit({
    organizationId: first.organizationId,
    visitId: first.id,
    expectedVersion: 1,
    actorUserId: first.responsibleUserId,
    completedAt: '2026-09-03T13:00:00.000Z',
    summary: 'Visita concluída com registros técnicos suficientes.',
    pendingItems: [],
  });
  const snapshot = await gateway.getIntegrationSnapshot(first.organizationId, first.id);
  assert.equal(
    snapshot.links.find((item) => item.targetDomain === 'calendar')?.status,
    'released'
  );
  assert.equal(
    snapshot.links.find((item) => item.targetDomain === 'fleet')?.status,
    'released'
  );
  assert(snapshot.events.some((item) => item.eventType === 'calendar.visit_release_requested'));
  assert(snapshot.events.some((item) => item.eventType === 'fleet.visit_release_requested'));
});

await test('36. Consulta preview respeita isolamento por organização', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const entity = visit();
  await gateway.createVisit({ visit: entity, audit: audit(entity), expectedVersion: null });
  await assert.rejects(
    () => gateway.getIntegrationSnapshot('org-b', entity.id),
    (error: unknown) => error instanceof Error
  );
});

await test('37. Limpeza de sessão remove integrações do preview', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const entity = visit();
  await gateway.createVisit({ visit: entity, audit: audit(entity), expectedVersion: null });
  gateway.clearAllSessionData();
  await assert.rejects(
    () => gateway.getIntegrationSnapshot(entity.organizationId, entity.id),
    (error: unknown) => error instanceof Error
  );
});

await test('38. FKs de visita possuem índices dedicados após o advisor', () => {
  assert.match(
    fkIndexes,
    /technical_visit_integration_links_visit_fk_idx[\s\S]*\(visit_id\)/
  );
  assert.match(
    fkIndexes,
    /technical_visit_integration_events_visit_fk_idx[\s\S]*\(visit_id\)/
  );
});

console.log(`\nResultado OE-007.006: ${passed} aprovadas, ${failed} falhas.`);
if (failed > 0) process.exit(1);
