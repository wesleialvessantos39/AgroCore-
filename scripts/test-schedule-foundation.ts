import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import { PreviewScheduleGateway } from '../src/schedule/preview/previewScheduleGateway.ts';
import { SupabaseScheduleGateway } from '../src/schedule/supabaseScheduleGateway.ts';
import { ScheduleService } from '../src/schedule/scheduleService.ts';
import {
  isValidScheduleTimeZone,
  scheduleLocalDateTimeToUtc,
} from '../src/schedule/time.ts';
import {
  normalizeCreateScheduleItem,
  normalizeScheduleRecurrence,
} from '../src/schedule/validation.ts';
import {
  ScheduleDomainError,
  type ScheduleApplicationContext,
  type ScheduleRecurrenceDefinition,
} from '../src/types/schedule.ts';
import type { OrganizationRole } from '../src/types/auth.ts';

let passed = 0;
let failed = 0;

async function test(
  name: string,
  operation: () => void | Promise<void>
) {
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
  role: OrganizationRole = 'owner',
  organizationId = 'org-a'
): ScheduleApplicationContext {
  return {
    organizationId,
    actor: {
      userId: 'user-' + role,
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

const dailyRecurrence: ScheduleRecurrenceDefinition = {
  frequency: 'daily',
  interval: 1,
  weekdays: [],
  endsAt: '2026-10-10T12:00:00.000Z',
};

function taskInput(key = 'task-command-0001') {
  return {
    title: 'Revisar documentação do atendimento',
    description: 'Conferir pendências antes do prazo interno.',
    priority: 'medium' as const,
    timeZone: 'America/Sao_Paulo',
    dueAt: '2026-09-10T15:00:00.000Z',
    recurrence: noRecurrence,
    idempotencyKey: key,
  };
}

function appointmentInput(key = 'appointment-command-0001') {
  return {
    title: 'Reunião operacional',
    description: 'Alinhamento interno da equipe.',
    priority: 'high' as const,
    timeZone: 'America/Sao_Paulo',
    startsAt: '2026-09-12T13:00:00.000Z',
    endsAt: '2026-09-12T14:00:00.000Z',
    recurrence: noRecurrence,
    idempotencyKey: key,
  };
}

const migration = fs.readFileSync(
  'supabase/migrations/20260903153944_oe_008_001_schedule_model.sql',
  'utf8'
);
const fkHardening = fs.readFileSync(
  'supabase/migrations/20260903155402_oe_008_001_schedule_fk_hardening.sql',
  'utf8'
);
const commandHardening = fs.readFileSync(
  'supabase/migrations/20260903175453_oe_008_001_command_idempotency_hardening.sql',
  'utf8'
);
const supabaseGateway = fs.readFileSync(
  'src/schedule/supabaseScheduleGateway.ts',
  'utf8'
);
const scheduleContextSource = fs.readFileSync(
  'src/schedule/ScheduleContext.tsx',
  'utf8'
);
const scheduleGatewayFactory = fs.readFileSync(
  'src/schedule/gatewayFactory.ts',
  'utf8'
);
const schedulePreviewSource = fs.readFileSync(
  'src/schedule/preview/previewScheduleGateway.ts',
  'utf8'
);
const scheduleServiceSource = fs.readFileSync(
  'src/schedule/scheduleService.ts',
  'utf8'
);
const page = fs.readFileSync('src/pages/SchedulePage.tsx', 'utf8');
const paths = fs.readFileSync('src/routes/paths.ts', 'utf8');
const routeMatrix = fs.readFileSync(
  'src/routes/routeMatrix.ts',
  'utf8'
);
const navigation = fs.readFileSync(
  'src/config/navigation.ts',
  'utf8'
);
const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
const visitIntegrationMigration = fs.readFileSync(
  'supabase/migrations/20260903121204_oe_007_006_visit_integrations.sql',
  'utf8'
);

console.log('====================================================');
console.log(' AGROCORE — MODELO DE TAREFAS E COMPROMISSOS');
console.log('====================================================\n');

await test('1. owner possui consulta e gestão da agenda', () => {
  const permissions = getRolePermissions('owner');
  assert.ok(permissions.includes('schedule:view'));
  assert.ok(permissions.includes('schedule:manage'));
});

await test('2. company_admin possui consulta e gestão da agenda', () => {
  const permissions = getRolePermissions('company_admin');
  assert.ok(permissions.includes('schedule:view'));
  assert.ok(permissions.includes('schedule:manage'));
});

await test('3. manager possui consulta e gestão da agenda', () => {
  const permissions = getRolePermissions('manager');
  assert.ok(permissions.includes('schedule:view'));
  assert.ok(permissions.includes('schedule:manage'));
});

await test('4. project_designer consulta sem administrar agenda', () => {
  const permissions = getRolePermissions('project_designer');
  assert.ok(permissions.includes('schedule:view'));
  assert.equal(permissions.includes('schedule:manage'), false);
});

await test('5. capturer consulta sem administrar agenda', () => {
  const permissions = getRolePermissions('capturer');
  assert.ok(permissions.includes('schedule:view'));
  assert.equal(permissions.includes('schedule:manage'), false);
});

await test('6. finance não recebe agenda por padrão', () => {
  const permissions = getRolePermissions('finance');
  assert.equal(permissions.includes('schedule:view'), false);
  assert.equal(permissions.includes('schedule:manage'), false);
});

await test('7. platform_super_admin não herda agenda privada', () => {
  const permissions = getRolePermissions('platform_super_admin');
  assert.equal(permissions.includes('schedule:view'), false);
  assert.equal(permissions.includes('schedule:manage'), false);
});

await test('8. tarefa manual válida é criada como pending', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const item = await service.createTask(context('owner'), taskInput());
  assert.equal(item.kind, 'task');
  assert.equal(item.status, 'pending');
  assert.equal(item.origin.type, 'manual');
  assert.equal(item.version, 1);
});

await test('9. compromisso válido preserva intervalo UTC', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const item = await service.createAppointment(
    context('manager'),
    appointmentInput()
  );
  assert.equal(item.kind, 'appointment');
  if (item.kind !== 'appointment') throw new Error('Tipo inesperado');
  assert.equal(item.startsAt, '2026-09-12T13:00:00.000Z');
  assert.equal(item.endsAt, '2026-09-12T14:00:00.000Z');
});

await test('10. criação com mesma chave e mesmo payload é idempotente', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const first = await service.createTask(
    context('owner'),
    taskInput('same-command-001')
  );
  const second = await service.createTask(
    context('owner'),
    taskInput('same-command-001')
  );
  assert.equal(second.id, first.id);
  assert.equal(second.version, first.version);
});

await test('11. chave idempotente não aceita conteúdo divergente', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  await service.createTask(
    context('owner'),
    taskInput('same-command-002')
  );
  await assert.rejects(
    () =>
      service.createTask(context('owner'), {
        ...taskInput('same-command-002'),
        title: 'Outro conteúdo para a mesma operação',
      }),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'IDEMPOTENCY_CONFLICT'
  );
});

await test('12. versão obsoleta perde a corrida de atualização', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const created = await service.createTask(
    context('owner'),
    taskInput('update-command-001')
  );
  await service.updateItem(context('owner'), created.id, {
    kind: 'task',
    title: 'Revisar documentação atualizada',
    description: created.description,
    priority: created.priority,
    timeZone: created.timeZone,
    dueAt: created.kind === 'task' ? created.dueAt : null,
    recurrence: created.recurrence,
    expectedVersion: created.version,
    idempotencyKey: 'update-write-001',
    reason: 'Ajuste do título',
  });
  await assert.rejects(
    () =>
      service.updateItem(context('owner'), created.id, {
        kind: 'task',
        title: 'Segunda alteração concorrente',
        description: created.description,
        priority: created.priority,
        timeZone: created.timeZone,
        dueAt: created.kind === 'task' ? created.dueAt : null,
        recurrence: created.recurrence,
        expectedVersion: created.version,
        idempotencyKey: 'update-write-002',
        reason: 'Tentativa concorrente',
      }),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'CONCURRENCY_CONFLICT'
  );
});

await test('13. atualização gera auditoria append-only', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const ctx = context('manager');
  const created = await service.createTask(
    ctx,
    taskInput('audit-command-001')
  );
  const updated = await service.updateItem(ctx, created.id, {
    kind: 'task',
    title: created.title,
    description: 'Descrição revisada',
    priority: 'high',
    timeZone: created.timeZone,
    dueAt: created.kind === 'task' ? created.dueAt : null,
    recurrence: created.recurrence,
    expectedVersion: created.version,
    idempotencyKey: 'audit-update-001',
    reason: 'Repriorização operacional',
  });
  const audit = await service.listAudit(ctx, created.id);
  assert.equal(updated.version, 2);
  assert.deepEqual(
    audit.map((entry) => entry.action),
    ['created', 'updated']
  );
  assert.equal(audit[1]?.itemVersion, 2);
});

await test('14. project_designer não cria tarefa', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  await assert.rejects(
    () => service.createTask(context('project_designer'), taskInput()),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
});

await test('15. capturer não cria compromisso', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  await assert.rejects(
    () =>
      service.createAppointment(
        context('capturer'),
        appointmentInput()
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
});

await test('16. finance não consulta agenda', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  await assert.rejects(
    () => service.listItems(context('finance')),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
});

await test('17. capturer pode consultar agenda autorizada', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  await service.createTask(
    context('owner'),
    taskInput('view-command-001')
  );
  const items = await service.listItems(context('capturer'));
  assert.equal(items.length, 1);
});

await test('18. preview isola itens entre organizações', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  await service.createTask(
    context('owner', 'org-a'),
    taskInput('tenant-command-001')
  );
  const otherTenant = await service.listItems(
    context('owner', 'org-b')
  );
  assert.deepEqual(otherTenant, []);
});

await test('19. tarefa sem prazo aceita ausência de recorrência', () => {
  const payload = normalizeCreateScheduleItem({
    kind: 'task',
    title: 'Tarefa sem prazo definido',
    priority: 'low',
    timeZone: 'America/Sao_Paulo',
    dueAt: null,
    recurrence: noRecurrence,
    idempotencyKey: 'validation-key-001',
  });
  assert.equal(payload.dueAt, null);
});

await test('20. tarefa recorrente exige data base', () => {
  assert.throws(
    () =>
      normalizeCreateScheduleItem({
        kind: 'task',
        title: 'Tarefa recorrente sem data',
        priority: 'medium',
        timeZone: 'America/Sao_Paulo',
        dueAt: null,
        recurrence: dailyRecurrence,
        idempotencyKey: 'validation-key-002',
      }),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'INVALID_INPUT'
  );
});

await test('21. compromisso exige fim posterior ao início', () => {
  assert.throws(
    () =>
      normalizeCreateScheduleItem({
        kind: 'appointment',
        title: 'Compromisso inválido',
        priority: 'medium',
        timeZone: 'America/Sao_Paulo',
        startsAt: '2026-09-12T14:00:00.000Z',
        endsAt: '2026-09-12T13:00:00.000Z',
        recurrence: noRecurrence,
        idempotencyKey: 'validation-key-003',
      }),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'INVALID_DATE'
  );
});

await test('22. fuso IANA válido é aceito', () => {
  assert.equal(isValidScheduleTimeZone('America/Sao_Paulo'), true);
  assert.equal(isValidScheduleTimeZone('UTC'), true);
});

await test('23. fuso inventado é recusado', () => {
  assert.equal(isValidScheduleTimeZone('AgroCore/Local'), false);
});

await test('24. horário local converte deterministamente para UTC', () => {
  assert.equal(
    scheduleLocalDateTimeToUtc(
      '2026-09-10T12:00',
      'America/Sao_Paulo'
    ),
    '2026-09-10T15:00:00.000Z'
  );
});

await test('25. horário inexistente em DST é recusado', () => {
  assert.throws(
    () =>
      scheduleLocalDateTimeToUtc(
        '2026-03-08T02:30',
        'America/New_York'
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'INVALID_DATE'
  );
});

await test('26. horário ambíguo em DST é recusado', () => {
  assert.throws(
    () =>
      scheduleLocalDateTimeToUtc(
        '2026-11-01T01:30',
        'America/New_York'
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'INVALID_DATE'
  );
});

await test('27. recorrência rejeita intervalo zero', () => {
  assert.throws(() =>
    normalizeScheduleRecurrence(
      {
        frequency: 'daily',
        interval: 0,
        weekdays: [],
        endsAt: null,
      },
      '2026-09-10T15:00:00.000Z'
    )
  );
});

await test('28. recorrência rejeita dias semanais duplicados', () => {
  assert.throws(() =>
    normalizeScheduleRecurrence(
      {
        frequency: 'weekly',
        interval: 1,
        weekdays: [1, 1],
        endsAt: null,
      },
      '2026-09-10T15:00:00.000Z'
    )
  );
});

await test('29. recorrência semanal exige pelo menos um dia explícito', () => {
  assert.throws(() =>
    normalizeScheduleRecurrence(
      {
        frequency: 'weekly',
        interval: 1,
        weekdays: [],
        endsAt: null,
      },
      '2026-09-10T15:00:00.000Z'
    )
  );
});

await test('30. recorrência semanal aceita dias únicos válidos', () => {
  const recurrence = normalizeScheduleRecurrence(
    {
      frequency: 'weekly',
      interval: 1,
      weekdays: [1, 3, 5],
      endsAt: null,
    },
    '2026-09-10T15:00:00.000Z'
  );
  assert.deepEqual(recurrence.weekdays, [1, 3, 5]);
});

await test('31. recorrência não semanal não aceita weekdays', () => {
  assert.throws(() =>
    normalizeScheduleRecurrence(
      {
        frequency: 'monthly',
        interval: 1,
        weekdays: [1],
        endsAt: null,
      },
      '2026-09-10T15:00:00.000Z'
    )
  );
});

await test('32. migration cria fonte única schedule_items e auditoria', () => {
  assert.match(migration, /create table if not exists public\.schedule_items/);
  assert.match(
    migration,
    /create table if not exists public\.schedule_item_audit/
  );
});

await test('33. migration exige organization_id e FKs canônicas', () => {
  assert.match(
    migration,
    /organization_id uuid not null references public\.organizations/
  );
  assert.match(
    migration,
    /created_by_user_id uuid not null references auth\.users/
  );
});

await test('34. RLS está ativa nas tabelas do módulo', () => {
  assert.match(
    migration,
    /alter table public\.schedule_items enable row level security/
  );
  assert.match(
    migration,
    /alter table public\.schedule_item_audit enable row level security/
  );
});

await test('35. leitura RLS depende de autorização organizacional', () => {
  assert.match(
    migration,
    /agrocore_private\.can_view_schedule\(organization_id\)/
  );
  assert.match(
    migration,
    /in \('owner','company_admin','manager','project_designer','capturer'\)/
  );
});

await test('36. gestão backend fica restrita a owner/admin/manager', () => {
  assert.match(
    migration,
    /in \('owner','company_admin','manager'\)/
  );
  assert.match(
    migration,
    /not agrocore_private\.can_manage_schedule\(p_organization_id\)/
  );
});

await test('37. RPCs usam SECURITY DEFINER e search_path fechado', () => {
  const defs = migration.match(/security definer[\s\S]*?set search_path = ''/gi);
  assert.ok((defs?.length ?? 0) >= 4);
});

await test('38. escrita direta autenticada permanece revogada', () => {
  assert.match(
    migration,
    /revoke insert, update, delete, truncate, references, trigger[\s\S]*schedule_items from authenticated/
  );
});

await test('39. atualização não aceita mudança de status', () => {
  const start = migration.indexOf(
    'create or replace function public.agrocore_update_schedule_item'
  );
  const block = migration.slice(start);
  assert.doesNotMatch(
    block.slice(0, block.indexOf('revoke all on function')),
    /p_payload\s*->>\s*'status'/
  );
  assert.match(block, /v_current\.status <> 'pending'/);
});

await test('40. item de domínio não é editável manualmente', () => {
  assert.match(
    migration,
    /v_current\.origin_type <> 'manual'/
  );
  assert.match(
    migration,
    /AGROCORE_SCHEDULE_SOURCE_OWNED/
  );
});

await test('41. criação pública sempre grava origem manual', () => {
  const createStart = migration.indexOf(
    'create or replace function public.agrocore_create_schedule_item'
  );
  const updateStart = migration.indexOf(
    'create or replace function public.agrocore_update_schedule_item'
  );
  const createBlock = migration.slice(createStart, updateStart);
  assert.match(createBlock, /'manual'/);
  assert.doesNotMatch(createBlock, /p_payload\s*->>\s*'sourceDomain'/);
});

await test('42. não há tabela prematura de ocorrências', () => {
  assert.doesNotMatch(
    migration,
    /create table(?: if not exists)? public\.schedule_occurrences/i
  );
});

await test('43. não há central de notificações antecipada', () => {
  assert.doesNotMatch(
    migration,
    /create table(?: if not exists)? public\.schedule_notifications/i
  );
});

await test('44. Módulo 007 já fornece eventos estáveis de calendário', () => {
  assert.match(
    visitIntegrationMigration,
    /calendar\.visit_sync_requested/
  );
  assert.match(
    visitIntegrationMigration,
    /calendar\.visit_release_requested/
  );
});

await test('45. rota /agenda está registrada e protegida', () => {
  assert.match(paths, /SCHEDULE: '\/agenda'/);
  assert.match(routeMatrix, /path: ROUTES\.SCHEDULE/);
  assert.match(
    routeMatrix,
    /requiredPermissions: 'schedule:view'/
  );
});

await test('46. navegação mostra Agenda apenas com schedule:view', () => {
  assert.match(navigation, /label: 'Agenda'/);
  assert.match(
    navigation,
    /requiredPermission: 'schedule:view'/
  );
});

await test('47. interface não exibe códigos internos de ordem', () => {
  assert.doesNotMatch(page, /OE-008|008\.001/i);
});

await test('48. tela começa com dados reais e estado vazio explícito', () => {
  assert.match(page, /Nenhum registro na agenda/);
  assert.match(page, /somente registros reais da/);
  assert.doesNotMatch(page, /mock|fake|demo data|dados simulados/i);
});

await test('49. formulário não oferece participantes ou atribuição prematuramente', () => {
  assert.doesNotMatch(page, /participantUserIds|responsibleUserId/);
});

await test('50. formulário não oferece transição de conclusão/cancelamento', () => {
  assert.doesNotMatch(page, /completeItem|cancelItem|reopenItem/);
});

await test('51. produção possui factory dedicado sem preview estático', () => {
  assert.match(viteConfig, /production-schedule-gateway-factory/);
  assert.match(viteConfig, /SupabaseScheduleGateway/);
  assert.match(viteConfig, /UnavailableScheduleGateway/);
});

await test('52. contratos de origem preservam referência sem copiar domínio', () => {
  assert.match(
    migration,
    /source_domain text null/
  );
  assert.match(
    migration,
    /source_event_key text null/
  );
  assert.doesNotMatch(
    migration,
    /client_name|property_name|proposal_title/i
  );
});

await test('53. hardening cobre diretamente a FK da auditoria', () => {
  assert.match(
    fkHardening,
    /schedule_item_audit_schedule_item_fk_idx/
  );
  assert.match(
    fkHardening,
    /on public\.schedule_item_audit \(schedule_item_id\)/
  );
});

await test('54. atualização idempotente converge no mesmo efeito', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const ctx = context('owner');
  const created = await service.createTask(
    ctx,
    taskInput('update-idem-create-001')
  );
  const input = {
    kind: 'task' as const,
    title: 'Título após retry seguro',
    description: created.description,
    priority: created.priority,
    timeZone: created.timeZone,
    dueAt: created.kind === 'task' ? created.dueAt : null,
    recurrence: created.recurrence,
    expectedVersion: created.version,
    idempotencyKey: 'update-idem-command-001',
    reason: 'Ajuste idempotente',
  };
  const first = await service.updateItem(ctx, created.id, input);
  const replay = await service.updateItem(ctx, created.id, input);
  assert.equal(first.id, replay.id);
  assert.equal(first.version, replay.version);
  const audit = await service.listAudit(ctx, created.id);
  assert.equal(audit.filter((entry) => entry.action === 'updated').length, 1);
});

await test('55. mesma chave de update rejeita conteúdo divergente', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const ctx = context('owner');
  const created = await service.createTask(
    ctx,
    taskInput('update-idem-create-002')
  );
  const base = {
    kind: 'task' as const,
    description: created.description,
    priority: created.priority,
    timeZone: created.timeZone,
    dueAt: created.kind === 'task' ? created.dueAt : null,
    recurrence: created.recurrence,
    expectedVersion: created.version,
    idempotencyKey: 'update-idem-command-002',
    reason: 'Ajuste idempotente',
  };
  await service.updateItem(ctx, created.id, {
    ...base,
    title: 'Primeiro conteúdo',
  });
  await assert.rejects(
    () =>
      service.updateItem(ctx, created.id, {
        ...base,
        title: 'Conteúdo divergente',
      }),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'IDEMPOTENCY_CONFLICT'
  );
});

await test('56. recibos idempotentes ficam no schema privado', () => {
  assert.match(
    commandHardening,
    /agrocore_private\.schedule_item_command_receipts/
  );
  assert.match(
    commandHardening,
    /revoke all on agrocore_private\.schedule_item_command_receipts[\s\S]*from public, anon, authenticated/
  );
});

await test('57. fingerprints de comandos usam SHA-256', () => {
  assert.match(commandHardening, /extensions\.digest/);
  assert.match(commandHardening, /'sha256'/);
  assert.doesNotMatch(commandHardening, /md5\(/i);
});

await test('58. update remoto exige command key idempotente', () => {
  assert.match(
    commandHardening,
    /p_idempotency_key text/
  );
  assert.match(
    commandHardening,
    /command_type <> 'update'/
  );
});

await test('59. gateway remoto limita retries a falhas transitórias', () => {
  assert.match(supabaseGateway, /executeMutationWithRetry/);
  assert.match(supabaseGateway, /isTransientOperationError/);
  assert.match(supabaseGateway, /\[0, 200, 600\]/);
  assert.match(supabaseGateway, /p_idempotency_key: input\.idempotencyKey/);
});

await test('60. interface permite dias explícitos em recorrência semanal', () => {
  assert.match(page, /Dias da semana/);
  assert.match(page, /recurrenceWeekdays/);
  assert.match(page, /Selecione pelo menos um dia/);
});

await test('61. retry remoto recupera falhas transitórias sem trocar a chave', async () => {
  let attempts = 0;
  const row = {
    id: 'schedule-retry-1',
    organization_id: 'org-a',
    item_kind: 'task',
    title: 'Tarefa com retry',
    description: null,
    priority: 'medium',
    status: 'pending',
    time_zone: 'America/Sao_Paulo',
    due_at: '2026-09-10T15:00:00.000Z',
    starts_at: null,
    ends_at: null,
    recurrence: noRecurrence,
    origin_type: 'manual',
    source_domain: null,
    source_id: null,
    source_version: null,
    source_event_key: null,
    created_by_user_id: 'user-owner',
    created_at: '2026-09-03T12:00:00.000Z',
    updated_by_user_id: 'user-owner',
    updated_at: '2026-09-03T12:00:00.000Z',
    version: 1,
  };
  const fakeClient = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      attempts += 1;
      assert.equal(args.p_idempotency_key, 'retry-command-001');
      if (attempts < 3) {
        return {
          data: null,
          error: { code: 'PGRST000', message: 'Failed to fetch' },
        };
      }
      return { data: row, error: null };
    },
  };
  const gateway = new SupabaseScheduleGateway(fakeClient as never);
  const item = await gateway.createItem({
    organizationId: 'org-a',
    actorUserId: 'user-owner',
    payload: {
      kind: 'task',
      title: row.title,
      description: null,
      priority: 'medium',
      timeZone: row.time_zone,
      dueAt: row.due_at,
      startsAt: null,
      endsAt: null,
      recurrence: noRecurrence,
    },
    idempotencyKey: 'retry-command-001',
  });
  assert.equal(attempts, 3);
  assert.equal(item.id, row.id);
});

await test('62. erro de domínio remoto não é repetido automaticamente', async () => {
  let attempts = 0;
  const fakeClient = {
    rpc: async () => {
      attempts += 1;
      return {
        data: null,
        error: {
          code: 'P0001',
          message: 'AGROCORE_SCHEDULE_FORBIDDEN',
        },
      };
    },
  };
  const gateway = new SupabaseScheduleGateway(fakeClient as never);
  await assert.rejects(
    () =>
      gateway.createItem({
        organizationId: 'org-a',
        actorUserId: 'user-owner',
        payload: {
          kind: 'task',
          title: 'Tarefa bloqueada',
          description: null,
          priority: 'medium',
          timeZone: 'America/Sao_Paulo',
          dueAt: null,
          startsAt: null,
          endsAt: null,
          recurrence: noRecurrence,
        },
        idempotencyKey: 'retry-command-002',
      }),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
  assert.equal(attempts, 1);
});

await test('63. limpeza de sessão remove dados voláteis do preview', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  const ctx = context('owner');
  await service.createTask(ctx, taskInput('cleanup-command-001'));
  assert.equal((await service.listItems(ctx)).length, 1);
  gateway.clearAllSessionData();
  assert.equal((await service.listItems(ctx)).length, 0);
});

await test('64. consulta por ID não enumera item de outro tenant', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  const created = await service.createTask(
    context('owner', 'org-a'),
    taskInput('idor-command-001')
  );
  const result = await service.getItemById(
    context('owner', 'org-b'),
    created.id
  );
  assert.equal(result, null);
});

await test('65. troca de contexto invalida respostas em voo', () => {
  assert.match(scheduleContextSource, /abortRef\.current\?\.abort\(\)/);
  assert.match(scheduleContextSource, /organizationRef\.current/);
  assert.match(scheduleContextSource, /requestId !== sequenceRef\.current/);
});

await test('66. módulo não persiste dados de negócio em storage local', () => {
  const source = [
    page,
    scheduleContextSource,
    scheduleGatewayFactory,
    schedulePreviewSource,
    scheduleServiceSource,
  ].join('\n');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i);
  assert.match(scheduleGatewayFactory, /registerDomainCleanup/);
});

console.log('\n====================================================');
console.log(
  'Resultado fundação Agenda: ' +
    passed +
    ' aprovadas, ' +
    failed +
    ' falhas.'
);
console.log('====================================================');

if (failed > 0) process.exit(1);
