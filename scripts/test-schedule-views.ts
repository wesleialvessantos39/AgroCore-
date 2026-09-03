import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import {
  buildScheduleCalendarMonth,
  currentScheduleMonthKey,
  formatScheduleMonthLabel,
  scheduleDateKey,
  scheduleItemPrimaryInstant,
  shiftScheduleMonth,
} from '../src/schedule/calendar.ts';
import { PreviewScheduleGateway } from '../src/schedule/preview/previewScheduleGateway.ts';
import { ScheduleService } from '../src/schedule/scheduleService.ts';
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

const weeklyRecurrence: ScheduleRecurrenceDefinition = {
  frequency: 'weekly',
  interval: 1,
  weekdays: [1],
  endsAt: null,
};

function taskInput(
  key: string,
  title: string,
  dueAt: string | null = '2026-09-10T15:00:00.000Z',
  recurrence: ScheduleRecurrenceDefinition = noRecurrence
) {
  return {
    title,
    description: null,
    priority: 'medium' as const,
    timeZone: 'America/Sao_Paulo',
    dueAt,
    recurrence,
    idempotencyKey: key,
  };
}

function appointmentInput(
  key: string,
  title: string,
  startsAt = '2026-09-12T13:00:00.000Z',
  endsAt = '2026-09-12T14:00:00.000Z'
) {
  return {
    title,
    description: null,
    priority: 'high' as const,
    timeZone: 'America/Sao_Paulo',
    startsAt,
    endsAt,
    recurrence: noRecurrence,
    idempotencyKey: key,
  };
}

const browseSource = fs.readFileSync(
  'src/schedule/ScheduleBrowsePanel.tsx',
  'utf8'
);
const calendarSource = fs.readFileSync(
  'src/schedule/calendar.ts',
  'utf8'
);
const contextSource = fs.readFileSync(
  'src/schedule/ScheduleContext.tsx',
  'utf8'
);
const gatewaySource = fs.readFileSync(
  'src/schedule/supabaseScheduleGateway.ts',
  'utf8'
);
const previewSource = fs.readFileSync(
  'src/schedule/preview/previewScheduleGateway.ts',
  'utf8'
);
const migration = fs.readFileSync(
  'supabase/migrations/20260903190345_oe_008_002_schedule_view_indexes.sql',
  'utf8'
);

console.log('====================================================');
console.log(' AGROCORE — LISTAS E AGENDA');
console.log('====================================================\n');

await test('1. visão pessoal retorna somente registros criados pelo usuário', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  await service.createTask(
    context('owner', 'user-a'),
    taskInput('view-personal-001', 'Tarefa A')
  );
  await service.createTask(
    context('owner', 'user-b'),
    taskInput('view-personal-002', 'Tarefa B')
  );

  const items = await service.listItems(
    context('owner', 'user-a'),
    { viewScope: 'personal' }
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]?.createdByUserId, 'user-a');
});

await test('2. visão de equipe preserva todos os registros permitidos da organização', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  await service.createTask(
    context('owner', 'user-a'),
    taskInput('view-team-001', 'Tarefa A')
  );
  await service.createTask(
    context('manager', 'user-b'),
    taskInput('view-team-002', 'Tarefa B')
  );
  const items = await service.listItems(
    context('owner', 'user-a'),
    { viewScope: 'team' }
  );
  assert.equal(items.length, 2);
});

await test('3. escopo pessoal continua incluindo registros criados pelo usuário', () => {
  assert.match(
    browseSource,
    /Minha agenda reúne registros criados por você/
  );
});

await test('4. equipe continua isolada por organization_id', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  await service.createTask(
    context('owner', 'user-a', 'org-a'),
    taskInput('tenant-view-001', 'Org A')
  );
  await service.createTask(
    context('owner', 'user-b', 'org-b'),
    taskInput('tenant-view-002', 'Org B')
  );
  const items = await service.listItems(
    context('owner', 'user-a', 'org-a'),
    { viewScope: 'team' }
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]?.organizationId, 'org-a');
});

await test('5. projetista autorizado pode consultar listas sem receber gestão', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  await service.createTask(
    context('owner', 'owner-a'),
    taskInput('designer-view-001', 'Visível')
  );
  const permissions = getRolePermissions('project_designer');
  assert.equal(permissions.includes('schedule:view'), true);
  assert.equal(permissions.includes('schedule:manage'), false);
  const items = await service.listItems(
    context('project_designer', 'designer-a'),
    { viewScope: 'team' }
  );
  assert.equal(items.length, 1);
});

await test('6. captador autorizado pode consultar listas sem receber gestão', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  await service.createTask(
    context('owner', 'owner-a'),
    taskInput('capturer-view-001', 'Visível')
  );
  const permissions = getRolePermissions('capturer');
  assert.equal(permissions.includes('schedule:view'), true);
  assert.equal(permissions.includes('schedule:manage'), false);
  const items = await service.listItems(
    context('capturer', 'capturer-a'),
    { viewScope: 'team' }
  );
  assert.equal(items.length, 1);
});

await test('7. financeiro continua negado na agenda', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  await assert.rejects(
    () =>
      service.listItems(
        context('finance', 'finance-a'),
        { viewScope: 'team' }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
});

await test('8. superadmin continua sem herdar agenda privada', () => {
  const permissions = getRolePermissions('platform_super_admin');
  assert.equal(permissions.includes('schedule:view'), false);
  assert.equal(permissions.includes('schedule:manage'), false);
});

await test('9. filtro de tipo funciona junto do escopo pessoal', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  const ctx = context('owner', 'user-a');
  await service.createTask(
    ctx,
    taskInput('type-filter-001', 'Tarefa')
  );
  await service.createAppointment(
    ctx,
    appointmentInput('type-filter-002', 'Compromisso')
  );
  const items = await service.listItems(ctx, {
    viewScope: 'personal',
    kind: 'appointment',
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.kind, 'appointment');
});

await test('10. filtro de situação continua combinável com escopo', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  const ctx = context('owner', 'user-a');
  await service.createTask(
    ctx,
    taskInput('status-filter-001', 'Pendente')
  );
  const items = await service.listItems(ctx, {
    viewScope: 'personal',
    status: 'pending',
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.status, 'pending');
});

await test('11. Supabase aplica escopo pessoal no servidor', () => {
  assert.match(
    gatewaySource,
    /filters\.viewScope === 'personal'[\s\S]*created_by_user_id\.eq\.\$\{actorUserId\}/
  );
  assert.match(
    gatewaySource,
    /responsible_user_id\.eq\.\$\{actorUserId\}/
  );
  assert.match(
    gatewaySource,
    /schedule_item_participants[\s\S]*\.eq\('user_id', actorUserId\)/
  );
});

await test('12. preview espelha autoria, responsabilidade e participação', () => {
  assert.match(
    previewSource,
    /filters\.viewScope !== 'personal'[\s\S]*item\.createdByUserId === actorUserId/
  );
  assert.match(previewSource, /item\.responsibleUserId === actorUserId/);
  assert.match(
    previewSource,
    /item\.participantUserIds\.includes\(actorUserId\)/
  );
});

await test('13. contexto abre a interface no escopo pessoal', () => {
  assert.match(contextSource, /viewScope: 'personal'/);
});

await test('14. chave de data respeita o fuso da visualização', () => {
  assert.equal(
    scheduleDateKey(
      '2026-09-01T01:00:00.000Z',
      'America/Sao_Paulo'
    ),
    '2026-08-31'
  );
});

await test('15. mês corrente é calculado no fuso da visualização', () => {
  assert.equal(
    currentScheduleMonthKey(
      'America/Sao_Paulo',
      '2026-09-01T01:00:00.000Z'
    ),
    '2026-08'
  );
});

await test('16. navegação mensal atravessa virada de ano', () => {
  assert.equal(shiftScheduleMonth('2026-12', 1), '2027-01');
  assert.equal(shiftScheduleMonth('2026-01', -1), '2025-12');
});

await test('17. rótulo mensal é derivado de mês válido', () => {
  assert.match(formatScheduleMonthLabel('2026-09'), /setembro/i);
  assert.match(formatScheduleMonthLabel('2026-09'), /2026/);
});

await test('18. grade mensal possui 42 células determinísticas', () => {
  const month = buildScheduleCalendarMonth(
    [],
    '2026-09',
    'America/Sao_Paulo'
  );
  assert.equal(month.days.length, 42);
  assert.equal(month.days.filter((day) => day.inCurrentMonth).length, 30);
});

await test('19. tarefa datada entra no dia correto do calendário', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const ctx = context('owner', 'user-a');
  const created = await service.createTask(
    ctx,
    taskInput('calendar-task-001', 'Prazo', '2026-09-10T15:00:00.000Z')
  );
  const month = buildScheduleCalendarMonth(
    [created],
    '2026-09',
    'America/Sao_Paulo'
  );
  const day = month.days.find((entry) => entry.key === '2026-09-10');
  assert.equal(day?.items.length, 1);
  assert.equal(day?.items[0]?.id, created.id);
});

await test('20. compromisso usa início como referência do calendário', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const ctx = context('owner', 'user-a');
  const created = await service.createAppointment(
    ctx,
    appointmentInput(
      'calendar-appointment-001',
      'Reunião',
      '2026-09-12T13:00:00.000Z',
      '2026-09-12T14:00:00.000Z'
    )
  );
  assert.equal(
    scheduleItemPrimaryInstant(created),
    '2026-09-12T13:00:00.000Z'
  );
});

await test('21. tarefa sem prazo fica fora dos dias e em seção própria', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const ctx = context('owner', 'user-a');
  const created = await service.createTask(
    ctx,
    taskInput('calendar-undated-001', 'Sem prazo', null)
  );
  const month = buildScheduleCalendarMonth(
    [created],
    '2026-09',
    'America/Sao_Paulo'
  );
  assert.equal(month.datedItems.length, 0);
  assert.equal(month.undatedItems.length, 1);
});

await test('22. calendário não materializa ocorrências recorrentes futuras', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const ctx = context('owner', 'user-a');
  const created = await service.createTask(
    ctx,
    taskInput(
      'calendar-recurrence-001',
      'Sem expansão',
      '2026-09-07T15:00:00.000Z',
      weeklyRecurrence
    )
  );
  const month = buildScheduleCalendarMonth(
    [created],
    '2026-09',
    'America/Sao_Paulo'
  );
  assert.equal(month.datedItems.length, 1);
  assert.equal(
    month.days.reduce((total, day) => total + day.items.length, 0),
    1
  );
});

await test('23. registros de outro mês não entram na coleção mensal datada', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  const ctx = context('owner', 'user-a');
  const created = await service.createTask(
    ctx,
    taskInput(
      'calendar-other-month-001',
      'Outubro',
      '2026-10-05T15:00:00.000Z'
    )
  );
  const month = buildScheduleCalendarMonth(
    [created],
    '2026-09',
    'America/Sao_Paulo'
  );
  assert.equal(month.datedItems.length, 0);
});

await test('24. interface oferece alternância Minha agenda e Equipe', () => {
  assert.match(browseSource, /Minha agenda/);
  assert.match(browseSource, />Equipe</);
  assert.match(browseSource, /aria-label="Escopo da agenda"/);
});

await test('25. alternância de escopo comunica estado com aria-pressed', () => {
  assert.ok((browseSource.match(/aria-pressed=/g) ?? []).length >= 4);
});

await test('26. interface oferece modos Lista e Calendário', () => {
  assert.match(browseSource, />Lista</);
  assert.match(browseSource, />Calendário</);
  assert.match(browseSource, /aria-label="Modo de exibição"/);
});

await test('27. calendário desktop usa grade semântica e cabeçalhos', () => {
  assert.match(browseSource, /role="grid"/);
  assert.match(browseSource, /role="columnheader"/);
  assert.match(browseSource, /role="gridcell"/);
});

await test('28. celular recebe lista mensal própria sem grade comprimida', () => {
  assert.match(
    browseSource,
    /Agenda mensal em lista para celular/
  );
  assert.match(browseSource, /md:hidden/);
  assert.match(browseSource, /hidden[\s\S]*md:grid/);
});

await test('29. navegação de mês possui ações acessíveis', () => {
  assert.match(browseSource, /aria-label="Mês anterior"/);
  assert.match(browseSource, /aria-label="Próximo mês"/);
  assert.match(browseSource, />Hoje</);
});

await test('30. filtros de tipo e situação continuam explícitos e independentes', () => {
  assert.match(browseSource, /<span>Tipo<\/span>/);
  assert.match(browseSource, /<span>Situação<\/span>/);
  assert.match(browseSource, /Limpar filtros/);
  assert.match(browseSource, /onFiltersChange/);
});

await test('31. controles principais mantêm alvo de toque de 44 px', () => {
  assert.match(browseSource, /min-h-\[44px\]/);
});

await test('32. telas novas preservam apenas a paleta oficial', () => {
  const source = browseSource + '\n' + calendarSource;
  assert.match(source, /#0B3D2E/);
  assert.match(source, /#78C89A/);
  assert.doesNotMatch(
    source,
    /(?:bg|text|border|ring)-(?:slate|gray|zinc|neutral|stone|blue|red|amber|yellow|emerald|purple|orange)-/
  );
});

await test('33. UI não exibe código interno de ordem', () => {
  assert.doesNotMatch(
    browseSource + '\n' + calendarSource,
    /OE-008|008\.00[23]/i
  );
});

await test('34. nova visualização não persiste dados em storage local', () => {
  assert.doesNotMatch(
    browseSource + '\n' + calendarSource,
    /localStorage|sessionStorage|indexedDB/i
  );
});

await test('35. migration adiciona índices sem criar fonte paralela', () => {
  assert.match(migration, /schedule_items_org_creator_kind_status_idx/);
  assert.match(migration, /schedule_items_org_creator_due_idx/);
  assert.match(migration, /schedule_items_org_creator_start_idx/);
  assert.doesNotMatch(migration, /create table/i);
});

await test('36. índices continuam ancorados em organization_id', () => {
  assert.match(
    migration,
    /organization_id,[\s\n]+created_by_user_id/
  );
});

await test('37. ausência de viewScope preserva visão de equipe no contrato de serviço', async () => {
  const gateway = new PreviewScheduleGateway();
  const service = new ScheduleService(gateway);
  await service.createTask(
    context('owner', 'user-a'),
    taskInput('default-team-001', 'Tarefa A')
  );
  await service.createTask(
    context('owner', 'user-b'),
    taskInput('default-team-002', 'Tarefa B')
  );
  const items = await service.listItems(
    context('owner', 'user-a'),
    {}
  );
  assert.equal(items.length, 2);
});

await test('38. escopo de visualização inválido é recusado no domínio', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  await assert.rejects(
    () =>
      service.listItems(
        context('owner', 'user-a'),
        { viewScope: 'other' } as never
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'INVALID_INPUT'
  );
});

await test('39. tipo de filtro inválido é recusado no domínio', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  await assert.rejects(
    () =>
      service.listItems(
        context('owner', 'user-a'),
        { kind: 'event' } as never
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'INVALID_INPUT'
  );
});

await test('40. situação de filtro inválida é recusada no domínio', async () => {
  const service = new ScheduleService(new PreviewScheduleGateway());
  await assert.rejects(
    () =>
      service.listItems(
        context('owner', 'user-a'),
        { status: 'archived' } as never
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'INVALID_INPUT'
  );
});

await test('41. calendário permanece disponível quando o mês está vazio', () => {
  assert.match(
    browseSource,
    /status === 'empty'[\s\S]*mode === 'calendar'/
  );
  assert.match(
    browseSource,
    /Nenhum registro com data neste mês/
  );
});

console.log('\n====================================================');
console.log(
  'Resultado Listas e Agenda: ' +
    passed +
    ' aprovadas, ' +
    failed +
    ' falhas.'
);
console.log('====================================================');

if (failed > 0) process.exit(1);
