import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import { PreviewScheduleGateway } from '../src/schedule/preview/previewScheduleGateway.ts';
import { ScheduleService } from '../src/schedule/scheduleService.ts';
import {
  ScheduleDomainError,
  type ScheduleApplicationContext,
  type ScheduleMemberOption,
  type ScheduleRecurrenceDefinition,
} from '../src/types/schedule.ts';
import type { OrganizationRole } from '../src/types/auth.ts';

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

function context(
  role: OrganizationRole,
  userId: string,
  organizationId = 'org-a'
): ScheduleApplicationContext {
  return {
    organizationId,
    actor: {
      userId,
      role,
      isActive: true,
      permissions: [...getRolePermissions(role)],
    },
  };
}

const noRecurrence: ScheduleRecurrenceDefinition = {
  frequency: 'none',
  interval: 1,
  weekdays: [],
  endsAt: null,
};

function taskInput(key: string, title = 'Tarefa de reconciliação') {
  return {
    title,
    description: null,
    priority: 'medium' as const,
    timeZone: 'America/Sao_Paulo',
    dueAt: '2026-09-15T15:00:00.000Z',
    recurrence: noRecurrence,
    idempotencyKey: key,
  };
}

const members: readonly ScheduleMemberOption[] = [
  {
    userId: 'owner-a',
    organizationRole: 'owner',
    displayName: 'Proprietário',
  },
  {
    userId: 'designer-a',
    organizationRole: 'project_designer',
    displayName: 'Projetista',
  },
  {
    userId: 'capturer-a',
    organizationRole: 'capturer',
    displayName: 'Captador',
  },
];

const reconciliation = fs.readFileSync(
  'supabase/migrations/20260903204000_oe_008_001_003_requirements_reconciliation.sql',
  'utf8'
);
const reconciliationBackfill = fs.readFileSync(
  'supabase/migrations/20260903205500_oe_008_001_003_reconciliation_backfill.sql',
  'utf8'
);
const typesSource = fs.readFileSync('src/types/schedule.ts', 'utf8');
const serviceSource = fs.readFileSync(
  'src/schedule/scheduleService.ts',
  'utf8'
);
const validationSource = fs.readFileSync(
  'src/schedule/validation.ts',
  'utf8'
);
const contextSource = fs.readFileSync(
  'src/schedule/ScheduleContext.tsx',
  'utf8'
);
const browseSource = fs.readFileSync(
  'src/schedule/ScheduleBrowsePanel.tsx',
  'utf8'
);
const visitIntegration = fs.readFileSync(
  'supabase/migrations/20260903121204_oe_007_006_visit_integrations.sql',
  'utf8'
);

console.log('====================================================');
console.log(' AGROCORE — RECONCILIAÇÃO OE-008.001 A OE-008.003');
console.log('====================================================\n');

await test('1. origem de agenda usa domínios canônicos tipados', () => {
  assert.match(typesSource, /export type ScheduleSourceDomain/);
  assert.match(typesSource, /'technical_visit'/);
  assert.match(typesSource, /'appraisal'/);
  assert.match(typesSource, /'proposal'/);
  assert.match(typesSource, /sourceDomain: ScheduleSourceDomain/);
});

await test('2. banco restringe source_domain aos domínios documentados', () => {
  assert.match(reconciliation, /schedule_items_source_domain_ck/);
  assert.match(
    reconciliation,
    /source_domain in \('technical_visit','appraisal','proposal'\)/
  );
});

await test('3. uma entidade canônica gera no máximo uma projeção na Agenda', () => {
  assert.match(
    reconciliation,
    /create unique index if not exists schedule_items_org_source_entity_uq/
  );
  assert.match(
    reconciliation,
    /\(organization_id, source_domain, source_id\)/
  );
});

await test('4. reconciliação não cria segunda tabela de agenda', () => {
  assert.doesNotMatch(reconciliation, /create table/i);
  assert.match(reconciliation, /public\.schedule_items/);
});

await test('5. reconciliação não antecipa ocorrências da OE-008.004', () => {
  assert.doesNotMatch(
    reconciliation + reconciliationBackfill,
    /create table(?: if not exists)? public\.schedule_occurrences/i
  );
});

await test('6. reconciliação não antecipa central de notificações', () => {
  assert.doesNotMatch(
    reconciliation + reconciliationBackfill,
    /create table(?: if not exists)? public\.schedule_notifications/i
  );
});

await test('7. RLS final avalia acesso por item e não apenas por organização', () => {
  assert.match(
    reconciliation,
    /agrocore_private\.can_view_schedule_item\(/
  );
  for (const table of [
    'schedule_items',
    'schedule_item_audit',
    'schedule_item_participants',
    'schedule_item_collaboration_revisions',
  ]) {
    assert.match(reconciliation, new RegExp('on public\\.' + table));
  }
});

await test('8. gestão mantém visão de equipe no autorizador por linha', () => {
  assert.match(
    reconciliation,
    /v_role in \('owner','company_admin','manager'\)/
  );
});

await test('9. projetista e captador exigem vínculo pessoal com o item', () => {
  assert.match(
    reconciliation,
    /v_role not in \('project_designer','capturer'\)/
  );
  assert.match(reconciliation, /s\.created_by_user_id = v_actor/);
  assert.match(reconciliation, /s\.responsible_user_id = v_actor/);
  assert.match(reconciliation, /p\.user_id = v_actor/);
});

await test('10. financeiro e superadmin não ganham leitura privada implícita', () => {
  const start = reconciliation.indexOf(
    'create or replace function agrocore_private.can_view_schedule_item'
  );
  const end = reconciliation.indexOf(
    'revoke all on function agrocore_private.can_view_schedule_item'
  );
  const block = reconciliation.slice(start, end);
  assert.doesNotMatch(block, /'finance'/);
  assert.doesNotMatch(block, /'platform_super_admin'/);
});

await test('11. diretório de integrantes exige permissão de gestão no backend', () => {
  const start = reconciliation.indexOf(
    'create or replace function public.agrocore_list_schedule_members'
  );
  const end = reconciliation.indexOf(
    'revoke all on function public.agrocore_list_schedule_members'
  );
  const block = reconciliation.slice(start, end);
  assert.match(block, /can_manage_schedule\(p_organization_id\)/);
  assert.doesNotMatch(block, /can_view_schedule\(p_organization_id\)/);
});

await test('12. serviço também exige schedule:manage para o diretório', () => {
  assert.match(
    serviceSource,
    /async listEligibleMembers[\s\S]*assertActiveContext\(context, 'schedule:manage'\)/
  );
});

await test('13. visão de equipe é recusada no serviço sem schedule:manage', () => {
  assert.match(
    serviceSource,
    /normalizedFilters\.viewScope === 'team'[\s\S]*schedule:manage/
  );
  assert.match(serviceSource, /A visão da equipe é restrita à gestão/);
});

await test('14. ausência de viewScope converge para personal', () => {
  assert.match(
    validationSource,
    /const viewScope = filters\.viewScope \?\? 'personal'/
  );
});

await test('15. consulta por ID aplica vínculo pessoal no serviço', () => {
  assert.match(serviceSource, /private canAccessItem/);
  assert.match(serviceSource, /item\.createdByUserId === context\.actor\.userId/);
  assert.match(serviceSource, /item\.responsibleUserId === context\.actor\.userId/);
  assert.match(
    serviceSource,
    /item\.participantUserIds\.includes\(context\.actor\.userId\)/
  );
  assert.match(
    serviceSource,
    /if \(!item \|\| !this\.canAccessItem\(context, item\)\) return null/
  );
});

await test('16. contexto não carrega o diretório completo para não gestores', () => {
  assert.match(
    contextSource,
    /canManage\s*\? service[\s\S]*listEligibleMembers/
  );
  assert.match(
    contextSource,
    /available: false as const[\s\S]*members: \[\] as readonly ScheduleMemberOption\[\]/
  );
});

await test('17. contexto corrige escopo team obsoleto para personal', () => {
  assert.match(
    contextSource,
    /current\.viewScope === 'team'[\s\S]*viewScope: 'personal'/
  );
  assert.match(
    contextSource,
    /!canManage && next\.viewScope === 'team'[\s\S]*'personal'/
  );
});

await test('18. interface oferece Equipe somente quando canManage', () => {
  assert.match(browseSource, /\{canManage && \(/);
  assert.match(browseSource, />Equipe</);
  assert.match(
    browseSource,
    /A visão da equipe[\s\S]*gestão autorizada/
  );
});

await test('19. interface identifica visita técnica sem expor seu ID', () => {
  assert.match(browseSource, /Origem: visita técnica/);
  assert.doesNotMatch(browseSource, /sourceId\}/);
});

await test('20. Módulo 007 continua sendo produtor da outbox de calendário', () => {
  assert.match(visitIntegration, /technical_visit_integration_events/);
  assert.match(visitIntegration, /calendar\.visit_sync_requested/);
  assert.match(visitIntegration, /calendar\.visit_release_requested/);
});

await test('21. Módulo 008 consome a outbox existente sem criar fila paralela', () => {
  assert.match(
    reconciliation,
    /from public\.technical_visit_integration_events e/
  );
  assert.doesNotMatch(reconciliation, /create table.*event/i);
});

await test('22. consumidor aceita somente eventos calendar.visit_* documentados', () => {
  assert.match(reconciliation, /target_domain = 'calendar'/);
  assert.match(reconciliation, /'calendar\.visit_sync_requested'/);
  assert.match(reconciliation, /'calendar\.visit_release_requested'/);
});

await test('23. projeção aponta para a TechnicalVisit canônica', () => {
  assert.match(reconciliation, /from public\.technical_visits v/);
  assert.match(reconciliation, /source_domain = 'technical_visit'/);
  assert.match(reconciliation, /source_id = v_event\.visit_id::text/);
});

await test('24. compromisso integrado usa horário canônico e duração da preparação', () => {
  assert.match(reconciliation, /v_starts_at := v_visit\.scheduled_for/);
  assert.match(reconciliation, /durationMinutes/);
  assert.match(reconciliation, /make_interval\(mins => v_duration\)/);
  assert.match(reconciliation, /v_duration not between 15 and 1440/);
});

await test('25. consumidor não inventa duração quando a preparação está incompleta', () => {
  assert.match(
    reconciliation,
    /if v_duration is null or v_duration not between 15 and 1440 then[\s\S]*return/
  );
});

await test('26. fuso integrado é IANA e fallback técnico é UTC', () => {
  assert.match(reconciliation, /pg_catalog\.pg_timezone_names/);
  assert.match(reconciliation, /v_time_zone := 'UTC'/);
});

await test('27. responsável integrado precisa ser elegível na mesma organização', () => {
  assert.match(
    reconciliation,
    /is_eligible_schedule_member\([\s\S]*v_event\.organization_id[\s\S]*v_responsible/
  );
});

await test('28. participantes são deduplicados, elegíveis e limitados', () => {
  assert.match(reconciliation, /select distinct \(x\.value\)::uuid/);
  assert.match(reconciliation, /is_eligible_schedule_member/);
  assert.match(reconciliation, /limit 50/);
  assert.match(reconciliation, /<> v_responsible/);
});

await test('29. eventos antigos nunca regridem a projeção', () => {
  assert.match(
    reconciliationBackfill,
    /coalesce\(v_existing\.source_version, 0\) >= v_event\.source_version/
  );
});

await test('30. backfill aceita visita mais nova quando a agenda não mudou', () => {
  assert.match(
    reconciliationBackfill,
    /v_event\.source_version > v_visit\.version/
  );
  assert.doesNotMatch(
    reconciliationBackfill,
    /v_event\.source_version < v_visit\.version then/
  );
});

await test('31. sincronização usa advisory lock por organização e visita', () => {
  assert.match(reconciliation, /pg_advisory_xact_lock/);
  assert.match(reconciliation, /':technical_visit:'/);
});

await test('32. ator da auditoria não é inventado', () => {
  assert.match(reconciliation, /v_actor := \(select auth\.uid\(\)\)/);
  assert.match(reconciliation, /from public\.technical_visit_audit a/);
  assert.match(reconciliation, /coalesce\(v_actor, v_responsible\)/);
});

await test('33. trigger consome evento após INSERT da outbox existente', () => {
  assert.match(
    reconciliation,
    /create trigger agrocore_schedule_consume_visit_calendar_event/
  );
  assert.match(
    reconciliation,
    /after insert on public\.technical_visit_integration_events/
  );
});

await test('34. backfill usa somente o último evento de calendário por visita', () => {
  assert.match(
    reconciliationBackfill,
    /select distinct on \(e\.organization_id, e\.visit_id\) e\.id/
  );
  assert.match(
    reconciliationBackfill,
    /e\.source_version desc/
  );
});

await test('35. manager mantém visão de equipe', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  await service.createTask(
    context('owner', 'owner-a'),
    taskInput('reconcile-team-001', 'Do proprietário')
  );
  await service.createTask(
    context('manager', 'manager-a'),
    taskInput('reconcile-team-002', 'Do gerente')
  );
  const items = await service.listItems(
    context('manager', 'manager-a'),
    { viewScope: 'team' }
  );
  assert.equal(items.length, 2);
});

await test('36. projetista não consegue abrir visão de equipe', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  await assert.rejects(
    () =>
      service.listItems(
        context('project_designer', 'designer-a'),
        { viewScope: 'team' }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
});

await test('37. consulta sem viewScope é pessoal por padrão', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  await service.createTask(
    context('owner', 'owner-a'),
    taskInput('reconcile-personal-001', 'Minha')
  );
  await service.createTask(
    context('owner', 'owner-b'),
    taskInput('reconcile-personal-002', 'Outra')
  );
  const items = await service.listItems(context('owner', 'owner-a'));
  assert.equal(items.length, 1);
  assert.equal(items[0]?.createdByUserId, 'owner-a');
});

await test('38. getItemById oculta registro alheio para projetista', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  const item = await service.createTask(
    context('owner', 'owner-a'),
    taskInput('reconcile-idor-001')
  );
  const hidden = await service.getItemById(
    context('project_designer', 'designer-a'),
    item.id
  );
  assert.equal(hidden, null);
});

await test('39. responsável continua vendo o item atribuído', async () => {
  const gateway = new PreviewScheduleGateway();
  gateway.setEligibleMembersForTesting('org-a', members);
  const service = new ScheduleService(gateway);
  const item = await service.createTask(
    context('owner', 'owner-a'),
    taskInput('reconcile-assigned-create-001')
  );
  await service.setCollaboration(
    context('owner', 'owner-a'),
    item.id,
    {
      responsibleUserId: 'designer-a',
      participantUserIds: [],
      expectedVersion: item.version,
      idempotencyKey: 'reconcile-assigned-command-001',
      reason: 'Atribuição técnica',
    }
  );
  const visible = await service.getItemById(
    context('project_designer', 'designer-a'),
    item.id
  );
  assert.equal(visible?.responsibleUserId, 'designer-a');
});

await test('40. participante continua vendo o item relacionado', async () => {
  const gateway = new PreviewScheduleGateway();
  gateway.setEligibleMembersForTesting('org-a', members);
  const service = new ScheduleService(gateway);
  const item = await service.createTask(
    context('owner', 'owner-a'),
    taskInput('reconcile-participant-create-001')
  );
  await service.setCollaboration(
    context('owner', 'owner-a'),
    item.id,
    {
      responsibleUserId: 'designer-a',
      participantUserIds: ['capturer-a'],
      expectedVersion: item.version,
      idempotencyKey: 'reconcile-participant-command-001',
      reason: 'Participação operacional',
    }
  );
  const visible = await service.getItemById(
    context('capturer', 'capturer-a'),
    item.id
  );
  assert.equal(visible?.participantUserIds.includes('capturer-a'), true);
});

await test('41. projetista não recebe diretório completo de integrantes', async () => {
  const gateway = new PreviewScheduleGateway();
  gateway.setEligibleMembersForTesting('org-a', members);
  const service = new ScheduleService(gateway);
  await assert.rejects(
    () =>
      service.listEligibleMembers(
        context('project_designer', 'designer-a')
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
});

console.log('\n====================================================');
console.log(
  'Resultado reconciliação 008.001–003: ' +
    passed +
    ' aprovadas, ' +
    failed +
    ' falhas.'
);
console.log('====================================================');

if (failed > 0) process.exit(1);
