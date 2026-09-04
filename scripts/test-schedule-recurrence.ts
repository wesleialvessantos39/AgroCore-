import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import { PreviewScheduleGateway } from '../src/schedule/preview/previewScheduleGateway.ts';
import { PreviewScheduleOccurrenceGateway } from '../src/schedule/preview/previewScheduleOccurrenceGateway.ts';
import {
  buildScheduleOccurrenceDrafts,
  normalizeOccurrenceWindow,
} from '../src/schedule/recurrence.ts';
import { ScheduleOccurrenceService } from '../src/schedule/scheduleOccurrenceService.ts';
import { ScheduleService } from '../src/schedule/scheduleService.ts';
import {
  ScheduleDomainError,
  type CalendarAppointment,
  type CorporateTask,
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
  role: OrganizationRole = 'owner',
  userId = `user-${role}`,
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

function rule(
  frequency: ScheduleRecurrenceDefinition['frequency'],
  interval = 1,
  weekdays: readonly number[] = [],
  endsAt: string | null = null
): ScheduleRecurrenceDefinition {
  return { frequency, interval, weekdays, endsAt };
}

function taskFixture(
  dueAt: string,
  recurrence: ScheduleRecurrenceDefinition,
  timeZone = 'America/Sao_Paulo'
): CorporateTask {
  return {
    id: 'fixture-task',
    organizationId: 'org-a',
    kind: 'task',
    title: 'Tarefa recorrente',
    description: null,
    priority: 'medium',
    status: 'pending',
    timeZone,
    dueAt,
    startsAt: null,
    endsAt: null,
    recurrence,
    origin: {
      type: 'manual',
      sourceDomain: null,
      sourceId: null,
      sourceVersion: null,
      sourceEventKey: null,
    },
    responsibleUserId: null,
    participantUserIds: [],
    completedAt: null,
    cancelledAt: null,
    createdByUserId: 'user-owner',
    createdAt: dueAt,
    updatedByUserId: 'user-owner',
    updatedAt: dueAt,
    version: 1,
  };
}

function appointmentFixture(
  startsAt: string,
  endsAt: string,
  recurrence: ScheduleRecurrenceDefinition,
  timeZone = 'America/Sao_Paulo'
): CalendarAppointment {
  const base = taskFixture(startsAt, recurrence, timeZone);
  return {
    ...base,
    id: 'fixture-appointment',
    kind: 'appointment',
    dueAt: null,
    startsAt,
    endsAt,
  };
}

function recurringTaskInput(key: string, interval = 1) {
  return {
    title: 'Revisão recorrente de prazo',
    description: null,
    priority: 'medium' as const,
    timeZone: 'America/Sao_Paulo',
    dueAt: '2026-09-10T15:00:00.000Z',
    recurrence: rule('daily', interval),
    idempotencyKey: key,
  };
}

function occurrenceStack() {
  const scheduleGateway = new PreviewScheduleGateway();
  const scheduleService = new ScheduleService(scheduleGateway);
  const occurrenceGateway = new PreviewScheduleOccurrenceGateway(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(
    scheduleGateway,
    occurrenceGateway
  );
  return { scheduleGateway, scheduleService, occurrenceGateway, occurrenceService };
}

const migration = fs.readFileSync(
  'supabase/migrations/20260904100000_oe_008_004_deadlines_recurrence.sql',
  'utf8'
);
const recurrenceSource = fs.readFileSync('src/schedule/recurrence.ts', 'utf8');
const occurrenceGatewaySource = fs.readFileSync(
  'src/schedule/supabaseScheduleOccurrenceGateway.ts',
  'utf8'
);
const occurrenceServiceSource = fs.readFileSync(
  'src/schedule/scheduleOccurrenceService.ts',
  'utf8'
);
const occurrenceFactorySource = fs.readFileSync(
  'src/schedule/occurrenceGatewayFactory.ts',
  'utf8'
);
const occurrencePanelSource = fs.readFileSync(
  'src/schedule/ScheduleOccurrencePanel.tsx',
  'utf8'
);
const collaborationSource = fs.readFileSync(
  'src/schedule/ScheduleItemCollaborationPanel.tsx',
  'utf8'
);
const contextSource = fs.readFileSync(
  'src/schedule/ScheduleContext.tsx',
  'utf8'
);

console.log('====================================================');
console.log(' AGROCORE — PRAZOS E RECORRÊNCIA');
console.log('====================================================\n');

await test('1. janela máxima de 366 dias é aceita', () => {
  const value = normalizeOccurrenceWindow({
    from: '2026-01-01T00:00:00.000Z',
    to: '2027-01-02T00:00:00.000Z',
  });
  assert.equal(value.to, '2027-01-02T00:00:00.000Z');
});

await test('2. janela maior que 366 dias é recusada', () => {
  assert.throws(
    () => normalizeOccurrenceWindow({
      from: '2026-01-01T00:00:00.000Z',
      to: '2027-01-03T00:00:00.000Z',
    }),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'INVALID_INPUT'
  );
});

await test('3. janela invertida é recusada', () => {
  assert.throws(() => normalizeOccurrenceWindow({
    from: '2026-09-12T00:00:00.000Z',
    to: '2026-09-10T00:00:00.000Z',
  }));
});

await test('4. diária gera um instante por dia no mesmo horário local', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-10T15:00:00.000Z', rule('daily')),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-14T00:00:00Z' }
  );
  assert.deepEqual(
    drafts.map((value) => value.scheduledAt),
    [
      '2026-09-10T15:00:00.000Z',
      '2026-09-11T15:00:00.000Z',
      '2026-09-12T15:00:00.000Z',
      '2026-09-13T15:00:00.000Z',
    ]
  );
});

await test('5. intervalo diário de dois dias é respeitado', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-10T15:00:00.000Z', rule('daily', 2)),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-16T00:00:00Z' }
  );
  assert.equal(drafts.length, 3);
  assert.equal(drafts[1]?.scheduledAt, '2026-09-12T15:00:00.000Z');
});

await test('6. semanal usa os dias explicitamente selecionados', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-07T15:00:00.000Z', rule('weekly', 1, [1, 3])),
    { from: '2026-09-07T00:00:00Z', to: '2026-09-14T00:00:00Z' }
  );
  assert.equal(drafts.length, 2);
  assert.equal(new Date(drafts[0]!.scheduledAt).getUTCDay(), 1);
  assert.equal(new Date(drafts[1]!.scheduledAt).getUTCDay(), 3);
});

await test('7. semanal sem weekdays falha fechada', () => {
  assert.throws(
    () => buildScheduleOccurrenceDrafts(
      taskFixture('2026-09-07T15:00:00.000Z', rule('weekly')),
      { from: '2026-09-07T00:00:00Z', to: '2026-09-14T00:00:00Z' }
    ),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'INVALID_RECURRENCE'
  );
});

await test('8. mensal não inventa dia inexistente', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture('2026-01-31T15:00:00.000Z', rule('monthly')),
    { from: '2026-01-01T00:00:00Z', to: '2026-04-01T00:00:00Z' }
  );
  assert.deepEqual(
    drafts.map((value) => value.scheduledAt.slice(0, 10)),
    ['2026-01-31', '2026-03-31']
  );
});

await test('9. anual preserva mês e dia dentro de janela limitada', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-10T15:00:00.000Z', rule('yearly')),
    { from: '2026-09-10T00:00:00Z', to: '2027-09-11T00:00:00Z' }
  );
  assert.deepEqual(
    drafts.map((value) => value.scheduledAt.slice(0, 10)),
    ['2026-09-10', '2027-09-10']
  );
});

await test('10. endsAt limita a série', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture(
      '2026-09-10T15:00:00.000Z',
      rule('daily', 1, [], '2026-09-12T15:00:00.000Z')
    ),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-15T00:00:00Z' }
  );
  assert.equal(drafts.length, 3);
});

await test('11. compromisso preserva a duração original', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    appointmentFixture(
      '2026-09-10T15:00:00.000Z',
      '2026-09-10T16:30:00.000Z',
      rule('daily')
    ),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-12T00:00:00Z' }
  );
  assert.ok(drafts.every((draft) =>
    draft.endsAt !== null &&
    new Date(draft.endsAt).getTime() - new Date(draft.scheduledAt).getTime()
      === 90 * 60 * 1000
  ));
});

await test('12. regra none não cria ocorrência derivada', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-10T15:00:00Z', rule('none')),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-12T00:00:00Z' }
  );
  assert.deepEqual(drafts, []);
});

await test('13. série concluída não gera novas pendências', () => {
  const base = taskFixture('2026-09-10T15:00:00Z', rule('daily'));
  const item: CorporateTask = {
    ...base,
    status: 'completed',
    completedAt: '2026-09-10T16:00:00Z',
  };
  assert.deepEqual(buildScheduleOccurrenceDrafts(item, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-12T00:00:00Z'
  }), []);
});

await test('14. horário inexistente por DST é recusado', () => {
  assert.throws(
    () => buildScheduleOccurrenceDrafts(
      taskFixture(
        '2026-03-07T07:30:00.000Z',
        rule('daily'),
        'America/New_York'
      ),
      { from: '2026-03-07T00:00:00Z', to: '2026-03-10T00:00:00Z' }
    ),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'INVALID_RECURRENCE'
  );
});

await test('15. horário ambíguo por DST é recusado', () => {
  assert.throws(
    () => buildScheduleOccurrenceDrafts(
      taskFixture(
        '2026-10-31T05:30:00.000Z',
        rule('daily'),
        'America/New_York'
      ),
      { from: '2026-10-31T00:00:00Z', to: '2026-11-03T00:00:00Z' }
    ),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'INVALID_RECURRENCE'
  );
});

await test('16. preview materializa de forma idempotente', async () => {
  const { scheduleService, occurrenceService } = occurrenceStack();
  const ctx = context('owner');
  const item = await scheduleService.createTask(ctx, recurringTaskInput('rec-create-001'));
  const window = { from: '2026-09-10T00:00:00Z', to: '2026-09-13T00:00:00Z' };
  const first = await occurrenceService.materializeOccurrences(ctx, item.id, window);
  const replay = await occurrenceService.materializeOccurrences(ctx, item.id, window);
  assert.equal(first.length, 3);
  assert.deepEqual(replay.map((value) => value.id), first.map((value) => value.id));
});

await test('17. occurrence guarda a versão da regra canônica', async () => {
  const { scheduleService, occurrenceService } = occurrenceStack();
  const ctx = context('owner');
  const item = await scheduleService.createTask(ctx, recurringTaskInput('rec-create-002'));
  const values = await occurrenceService.materializeOccurrences(ctx, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-12T00:00:00Z'
  });
  assert.ok(values.every((value) => value.sourceItemVersion === item.version));
});

await test('18. mudança da regra reconcilia pendências obsoletas', async () => {
  const { scheduleService, occurrenceService } = occurrenceStack();
  const ctx = context('owner');
  const item = await scheduleService.createTask(ctx, recurringTaskInput('rec-create-003'));
  const window = { from: '2026-09-10T00:00:00Z', to: '2026-09-15T00:00:00Z' };
  assert.equal((await occurrenceService.materializeOccurrences(ctx, item.id, window)).length, 5);
  const updated = await scheduleService.updateItem(ctx, item.id, {
    kind: 'task',
    title: item.title,
    description: item.description,
    priority: item.priority,
    timeZone: item.timeZone,
    dueAt: item.dueAt,
    recurrence: rule('daily', 2),
    expectedVersion: item.version,
    idempotencyKey: 'rec-update-003',
    reason: 'Alterar intervalo recorrente',
  });
  const after = await occurrenceService.materializeOccurrences(ctx, updated.id, window);
  assert.equal(after.length, 3);
  assert.ok(after.every((value) => value.sourceItemVersion === updated.version));
});

await test('19. conclusão da ocorrência não conclui a série pai', async () => {
  const { scheduleService, occurrenceService } = occurrenceStack();
  const ctx = context('owner');
  const item = await scheduleService.createTask(ctx, recurringTaskInput('rec-create-004'));
  const [occurrence] = await occurrenceService.materializeOccurrences(ctx, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  const completed = await occurrenceService.completeOccurrence(ctx, occurrence!.id, {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-complete-004',
    reason: 'Prazo atendido',
  });
  assert.equal(completed.status, 'completed');
  assert.equal((await scheduleService.getItemById(ctx, item.id))?.status, 'pending');
});

await test('20. responsável sem gestão pode concluir sua ocorrência', async () => {
  const { scheduleGateway, scheduleService, occurrenceService } = occurrenceStack();
  const members: readonly ScheduleMemberOption[] = [
    { userId: 'designer-a', organizationRole: 'project_designer', displayName: 'Projetista' },
  ];
  scheduleGateway.setEligibleMembersForTesting('org-a', members);
  const owner = context('owner', 'owner-a');
  const designer = context('project_designer', 'designer-a');
  const created = await scheduleService.createTask(owner, recurringTaskInput('rec-create-005'));
  const assigned = await scheduleService.setCollaboration(owner, created.id, {
    responsibleUserId: 'designer-a',
    participantUserIds: [],
    expectedVersion: created.version,
    idempotencyKey: 'rec-assign-005',
    reason: 'Definir responsável',
  });
  const [occurrence] = await occurrenceService.materializeOccurrences(designer, assigned.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  const completed = await occurrenceService.completeOccurrence(designer, occurrence!.id, {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-complete-005',
    reason: 'Atividade realizada',
  });
  assert.equal(completed.status, 'completed');
});

await test('21. participante não responsável não conclui ocorrência', async () => {
  const { scheduleGateway, scheduleService, occurrenceService } = occurrenceStack();
  scheduleGateway.setEligibleMembersForTesting('org-a', [
    { userId: 'designer-a', organizationRole: 'project_designer', displayName: 'Projetista' },
    { userId: 'capturer-a', organizationRole: 'capturer', displayName: 'Captador' },
  ]);
  const owner = context('owner', 'owner-a');
  const participant = context('capturer', 'capturer-a');
  const created = await scheduleService.createTask(owner, recurringTaskInput('rec-create-006'));
  const assigned = await scheduleService.setCollaboration(owner, created.id, {
    responsibleUserId: 'designer-a',
    participantUserIds: ['capturer-a'],
    expectedVersion: created.version,
    idempotencyKey: 'rec-assign-006',
    reason: 'Definir equipe',
  });
  const [occurrence] = await occurrenceService.materializeOccurrences(participant, assigned.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  await assert.rejects(
    () => occurrenceService.completeOccurrence(participant, occurrence!.id, {
      expectedVersion: occurrence!.version,
      idempotencyKey: 'rec-complete-006',
      reason: 'Tentativa sem responsabilidade',
    }),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'RESPONSIBLE_MISMATCH'
  );
});

await test('22. gestão cancela e reabre ocorrência', async () => {
  const { scheduleService, occurrenceService } = occurrenceStack();
  const owner = context('owner', 'owner-a');
  const item = await scheduleService.createTask(owner, recurringTaskInput('rec-create-007'));
  const [occurrence] = await occurrenceService.materializeOccurrences(owner, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  const cancelled = await occurrenceService.cancelOccurrence(owner, occurrence!.id, {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-cancel-007',
    reason: 'Cancelar prazo',
  });
  const reopened = await occurrenceService.reopenOccurrence(owner, cancelled.id, {
    expectedVersion: cancelled.version,
    idempotencyKey: 'rec-reopen-007',
    reason: 'Reabrir prazo',
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(reopened.status, 'pending');
});

await test('23. replay da mesma transição converge na mesma versão', async () => {
  const { scheduleService, occurrenceService } = occurrenceStack();
  const owner = context('owner');
  const item = await scheduleService.createTask(owner, recurringTaskInput('rec-create-008'));
  const [occurrence] = await occurrenceService.materializeOccurrences(owner, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  const input = {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-complete-008',
    reason: 'Concluir uma vez',
  };
  const first = await occurrenceService.completeOccurrence(owner, occurrence!.id, input);
  const replay = await occurrenceService.completeOccurrence(owner, occurrence!.id, input);
  assert.equal(first.version, replay.version);
});

await test('24. mesma chave com payload divergente gera conflito', async () => {
  const { scheduleService, occurrenceService } = occurrenceStack();
  const owner = context('owner');
  const item = await scheduleService.createTask(owner, recurringTaskInput('rec-create-009'));
  const [occurrence] = await occurrenceService.materializeOccurrences(owner, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  await occurrenceService.completeOccurrence(owner, occurrence!.id, {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-complete-009',
    reason: 'Motivo original',
  });
  await assert.rejects(
    () => occurrenceService.completeOccurrence(owner, occurrence!.id, {
      expectedVersion: occurrence!.version,
      idempotencyKey: 'rec-complete-009',
      reason: 'Motivo divergente',
    }),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'IDEMPOTENCY_CONFLICT'
  );
});

await test('25. concorrência por expectedVersion é aplicada', async () => {
  const { scheduleService, occurrenceService } = occurrenceStack();
  const owner = context('owner');
  const item = await scheduleService.createTask(owner, recurringTaskInput('rec-create-010'));
  const [occurrence] = await occurrenceService.materializeOccurrences(owner, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  await occurrenceService.completeOccurrence(owner, occurrence!.id, {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-complete-010',
    reason: 'Primeira mudança',
  });
  await assert.rejects(
    () => occurrenceService.cancelOccurrence(owner, occurrence!.id, {
      expectedVersion: occurrence!.version,
      idempotencyKey: 'rec-cancel-010',
      reason: 'Versão obsoleta',
    }),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'CONCURRENCY_CONFLICT'
  );
});

await test('26. auditoria preview registra ação, versão e motivo', async () => {
  const { scheduleService, occurrenceGateway, occurrenceService } = occurrenceStack();
  const owner = context('owner');
  const item = await scheduleService.createTask(owner, recurringTaskInput('rec-create-011'));
  const [occurrence] = await occurrenceService.materializeOccurrences(owner, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  const completed = await occurrenceService.completeOccurrence(owner, occurrence!.id, {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-complete-011',
    reason: 'Prazo atendido',
  });
  const audit = await occurrenceGateway.listOccurrenceAudit('org-a', completed.id);
  assert.deepEqual(
    audit.map((entry) => [entry.action, entry.occurrenceVersion, entry.reason]),
    [['completed', completed.version, 'Prazo atendido']]
  );
});

await test('27. tenant diferente não materializa série alheia', async () => {
  const { scheduleService, occurrenceService } = occurrenceStack();
  const item = await scheduleService.createTask(
    context('owner', 'owner-a', 'org-a'),
    recurringTaskInput('rec-create-012')
  );
  await assert.rejects(
    () => occurrenceService.materializeOccurrences(
      context('owner', 'owner-b', 'org-b'),
      item.id,
      { from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z' }
    ),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'ITEM_NOT_FOUND'
  );
});

await test('28. migration cria ocorrência derivada com FK tenant-safe', () => {
  assert.match(migration, /create table if not exists public\.schedule_item_occurrences/);
  assert.match(migration, /foreign key \(organization_id, schedule_item_id\)/);
  assert.match(migration, /references public\.schedule_items\(organization_id, id\)/);
});

await test('29. unicidade materializada usa organização, item e instante', () => {
  assert.match(migration, /unique \(organization_id, schedule_item_id, scheduled_at\)/);
});

await test('30. source_item_version governa reconciliação da derivação', () => {
  assert.match(migration, /source_item_version integer not null/);
  assert.match(migration, /source_item_version < excluded\.source_item_version/);
});

await test('31. RLS está ativa nas duas novas tabelas públicas', () => {
  assert.match(migration, /schedule_item_occurrences enable row level security/);
  assert.match(migration, /schedule_item_occurrence_audit enable row level security/);
});

await test('32. autorização de ocorrência deriva do item pai', () => {
  assert.match(migration, /can_view_schedule_item\(/);
  assert.match(migration, /can_view_schedule_occurrence\(/);
});

await test('33. authenticated não recebe escrita direta nas ocorrências', () => {
  assert.match(
    migration,
    /revoke insert, update, delete, truncate, references, trigger[\s\S]*schedule_item_occurrences from authenticated/
  );
});

await test('34. materialização é limitada a 366 dias e ordenada', () => {
  assert.match(migration, /interval '366 days'/);
  assert.match(migration, /order by o\.scheduled_at, o\.id/);
});

await test('35. SQL trata daily weekly monthly yearly', () => {
  for (const frequency of ['daily', 'weekly', 'monthly', 'yearly']) {
    assert.match(migration, new RegExp(`v_frequency = '${frequency}'`));
  }
});

await test('36. SQL preserva fuso IANA e falha em DST inválido/ambíguo', () => {
  assert.match(migration, /at time zone v_item\.time_zone/);
  assert.match(migration, /AGROCORE_SCHEDULE_RECURRENCE_DST_INVALID/);
  assert.match(migration, /AGROCORE_SCHEDULE_RECURRENCE_DST_AMBIGUOUS/);
});

await test('37. duração do compromisso é preservada na ocorrência', () => {
  assert.match(migration, /v_item\.ends_at - v_item\.starts_at/);
});

await test('38. somente pendências obsoletas são podadas na reconciliação', () => {
  assert.match(migration, /o\.status = 'pending'/);
  assert.match(migration, /o\.source_item_version < v_item\.version/);
});

await test('39. comandos críticos usam expectedVersion e advisory lock', () => {
  assert.match(migration, /p_expected_version integer/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_occurrence\.version <> p_expected_version/);
});

await test('40. recibos idempotentes são privados e SHA-256', () => {
  assert.match(migration, /agrocore_private\.schedule_occurrence_command_receipts/);
  assert.match(migration, /revoke all on agrocore_private\.schedule_occurrence_command_receipts/);
  assert.match(migration, /extensions\.digest/);
  assert.match(migration, /'sha256'/);
});

await test('41. transições possuem RPCs específicos', () => {
  assert.match(migration, /agrocore_complete_schedule_occurrence/);
  assert.match(migration, /agrocore_cancel_schedule_occurrence/);
  assert.match(migration, /agrocore_reopen_schedule_occurrence/);
});

await test('42. conclusão respeita responsável; cancelamento e reabertura exigem gestão', () => {
  assert.match(migration, /v_item\.responsible_user_id is distinct from v_actor/);
  assert.match(migration, /elsif p_command_type = 'cancel'/);
  assert.match(migration, /if not v_can_manage then/);
});

await test('43. gateway remoto usa RPC canônica e retry transitório', () => {
  assert.match(occurrenceGatewaySource, /agrocore_materialize_schedule_occurrences/);
  assert.match(occurrenceGatewaySource, /executeWithRetry/);
  assert.match(occurrenceGatewaySource, /\[0, 200, 600\]/);
  assert.match(occurrenceGatewaySource, /isTransient/);
});

await test('44. factory de produção escolhe Supabase ou fail-closed', () => {
  assert.match(occurrenceFactorySource, /SupabaseScheduleOccurrenceGateway/);
  assert.match(occurrenceFactorySource, /UnavailableScheduleOccurrenceGateway/);
  assert.match(occurrenceFactorySource, /LazyDevelopmentScheduleOccurrenceGateway/);
});

await test('45. serviço exige schedule:view e vínculo pessoal do item', () => {
  assert.match(occurrenceServiceSource, /schedule:view/);
  assert.match(occurrenceServiceSource, /private canAccessItem/);
  assert.match(occurrenceServiceSource, /participantUserIds\.includes/);
});

await test('46. contexto expõe materialização e três transições', () => {
  assert.match(contextSource, /materializeOccurrences/);
  assert.match(contextSource, /completeOccurrence/);
  assert.match(contextSource, /cancelOccurrence/);
  assert.match(contextSource, /reopenOccurrence/);
});

await test('47. painel de recorrência está ligado aos cartões da agenda', () => {
  assert.match(collaborationSource, /ScheduleOccurrencePanel/);
  assert.match(collaborationSource, /<ScheduleOccurrencePanel item=\{item\}/);
});

await test('48. UI materializa somente após expansão explícita', () => {
  assert.match(occurrencePanelSource, /const \[expanded, setExpanded\]/);
  assert.match(occurrencePanelSource, /if \(!expanded\) return/);
  assert.match(occurrencePanelSource, /aria-expanded=\{expanded\}/);
});

await test('49. UI usa janela finita em vez de gerar série infinita', () => {
  assert.match(occurrencePanelSource, /30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(occurrencePanelSource, /180 \* 24 \* 60 \* 60 \* 1000/);
});

await test('50. UI não expõe códigos internos nem IDs de origem', () => {
  assert.doesNotMatch(occurrencePanelSource, /OE-008|008\.004/);
  assert.doesNotMatch(occurrencePanelSource, /sourceItemVersion|sourceId/);
});

await test('51. OE-008.004 não cria notificações nem canais externos', () => {
  const source = migration + '\n' + recurrenceSource + '\n' + occurrencePanelSource;
  assert.doesNotMatch(source, /create table(?: if not exists)? public\.schedule_notifications/i);
  assert.doesNotMatch(source, /notification_channels|push_subscription|sms_provider/i);
});

console.log('\n====================================================');
console.log(
  'Resultado Prazos e Recorrência: ' + passed + ' aprovadas, ' + failed + ' falhas.'
);
console.log('====================================================');

if (failed > 0) process.exit(1);
