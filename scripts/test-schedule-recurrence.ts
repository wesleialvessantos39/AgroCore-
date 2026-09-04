import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import { PreviewScheduleGateway } from '../src/schedule/preview/previewScheduleGateway.ts';
import { PreviewScheduleOccurrenceGateway } from '../src/schedule/preview/previewScheduleOccurrenceGateway.ts';
import { buildScheduleOccurrenceDrafts, normalizeOccurrenceWindow } from '../src/schedule/recurrence.ts';
import { ScheduleOccurrenceService } from '../src/schedule/scheduleOccurrenceService.ts';
import { ScheduleService } from '../src/schedule/scheduleService.ts';
import {
  ScheduleDomainError,
  type ScheduleApplicationContext,
  type ScheduleItem,
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

function recurrence(
  frequency: ScheduleRecurrenceDefinition['frequency'],
  interval = 1,
  weekdays: readonly number[] = [],
  endsAt: string | null = null
): ScheduleRecurrenceDefinition {
  return { frequency, interval, weekdays, endsAt };
}

function taskFixture(
  dueAt: string,
  rule: ScheduleRecurrenceDefinition,
  timeZone = 'America/Sao_Paulo'
): ScheduleItem {
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
    recurrence: rule,
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
  rule: ScheduleRecurrenceDefinition,
  timeZone = 'America/Sao_Paulo'
): ScheduleItem {
  return {
    ...taskFixture(startsAt, rule, timeZone),
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
    recurrence: recurrence('daily', interval),
    idempotencyKey: key,
  };
}

const migration = fs.readFileSync(
  'supabase/migrations/20260904100000_oe_008_004_deadlines_recurrence.sql',
  'utf8'
);
const occurrenceGatewaySource = fs.readFileSync(
  'src/schedule/supabaseScheduleOccurrenceGateway.ts',
  'utf8'
);
const occurrenceServiceSource = fs.readFileSync(
  'src/schedule/scheduleOccurrenceService.ts',
  'utf8'
);
const occurrencePanelSource = fs.readFileSync(
  'src/schedule/ScheduleOccurrencePanel.tsx',
  'utf8'
);
const occurrenceFactorySource = fs.readFileSync(
  'src/schedule/occurrenceGatewayFactory.ts',
  'utf8'
);
const contextSource = fs.readFileSync(
  'src/schedule/ScheduleContext.tsx',
  'utf8'
);

console.log('====================================================');
console.log(' AGROCORE — PRAZOS E RECORRÊNCIA');
console.log('====================================================\n');

await test('1. janela de recorrência aceita até 366 dias', () => {
  const value = normalizeOccurrenceWindow({
    from: '2026-01-01T00:00:00.000Z',
    to: '2027-01-02T00:00:00.000Z',
  });
  assert.equal(value.from, '2026-01-01T00:00:00.000Z');
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
    from: '2026-09-02T00:00:00.000Z',
    to: '2026-09-01T00:00:00.000Z',
  }));
});

await test('4. tarefa diária gera ocorrências determinísticas', () => {
  const item = taskFixture(
    '2026-09-10T15:00:00.000Z',
    recurrence('daily')
  );
  const drafts = buildScheduleOccurrenceDrafts(item, {
    from: '2026-09-10T00:00:00.000Z',
    to: '2026-09-14T00:00:00.000Z',
  });
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

await test('5. intervalo diário é respeitado', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-10T15:00:00.000Z', recurrence('daily', 2)),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-16T00:00:00Z' }
  );
  assert.deepEqual(
    drafts.map((value) => value.scheduledAt),
    [
      '2026-09-10T15:00:00.000Z',
      '2026-09-12T15:00:00.000Z',
      '2026-09-14T15:00:00.000Z',
    ]
  );
});

await test('6. recorrência semanal usa somente weekdays explícitos', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-07T15:00:00.000Z', recurrence('weekly', 1, [1, 3])),
    { from: '2026-09-07T00:00:00Z', to: '2026-09-14T00:00:00Z' }
  );
  assert.equal(drafts.length, 2);
  assert.equal(new Date(drafts[0]!.scheduledAt).getUTCDay(), 1);
  assert.equal(new Date(drafts[1]!.scheduledAt).getUTCDay(), 3);
});

await test('7. recorrência semanal vazia falha fechada', () => {
  assert.throws(
    () => buildScheduleOccurrenceDrafts(
      taskFixture('2026-09-07T15:00:00.000Z', recurrence('weekly', 1, [])),
      { from: '2026-09-07T00:00:00Z', to: '2026-09-14T00:00:00Z' }
    ),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'INVALID_RECURRENCE'
  );
});

await test('8. recorrência mensal preserva o dia e não inventa 31 de fevereiro', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture('2026-01-31T15:00:00.000Z', recurrence('monthly')),
    { from: '2026-01-01T00:00:00Z', to: '2026-04-01T00:00:00Z' }
  );
  assert.deepEqual(
    drafts.map((value) => value.scheduledAt.slice(0, 10)),
    ['2026-01-31', '2026-03-31']
  );
});

await test('9. recorrência anual preserva mês e dia', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture('2024-02-29T15:00:00.000Z', recurrence('yearly')),
    { from: '2024-01-01T00:00:00Z', to: '2029-01-01T00:00:00Z' }
  );
  assert.deepEqual(
    drafts.map((value) => value.scheduledAt.slice(0, 10)),
    ['2024-02-29', '2028-02-29']
  );
});

await test('10. endsAt limita a série recorrente', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture(
      '2026-09-10T15:00:00.000Z',
      recurrence('daily', 1, [], '2026-09-12T15:00:00.000Z')
    ),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-15T00:00:00Z' }
  );
  assert.equal(drafts.length, 3);
});

await test('11. compromisso recorrente preserva duração', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    appointmentFixture(
      '2026-09-10T15:00:00.000Z',
      '2026-09-10T16:30:00.000Z',
      recurrence('daily')
    ),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-12T00:00:00Z' }
  );
  assert.ok(drafts.every((draft) =>
    draft.endsAt &&
    new Date(draft.endsAt).getTime() - new Date(draft.scheduledAt).getTime()
      === 90 * 60 * 1000
  ));
});

await test('12. recorrência none não materializa ocorrência', () => {
  const drafts = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-10T15:00:00Z', recurrence('none')),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-12T00:00:00Z' }
  );
  assert.deepEqual(drafts, []);
});

await test('13. série pai concluída não gera novas ocorrências', () => {
  const item = {
    ...taskFixture('2026-09-10T15:00:00Z', recurrence('daily')),
    status: 'completed' as const,
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
        recurrence('daily'),
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
        recurrence('daily'),
        'America/New_York'
      ),
      { from: '2026-10-31T00:00:00Z', to: '2026-11-03T00:00:00Z' }
    ),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'INVALID_RECURRENCE'
  );
});

await test('16. preview materializa sem duplicar a mesma ocorrência', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const service = new ScheduleService(scheduleGateway);
  const occurrenceGateway = new PreviewScheduleOccurrenceGateway(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(scheduleGateway, occurrenceGateway);
  const ctx = context('owner');
  const item = await service.createTask(ctx, recurringTaskInput('rec-create-001'));
  const window = { from: '2026-09-10T00:00:00Z', to: '2026-09-13T00:00:00Z' };
  const first = await occurrenceService.materializeOccurrences(ctx, item.id, window);
  const replay = await occurrenceService.materializeOccurrences(ctx, item.id, window);
  assert.equal(first.length, 3);
  assert.deepEqual(replay.map((value) => value.id), first.map((value) => value.id));
});

await test('17. preview grava sourceItemVersion da regra canônica', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const service = new ScheduleService(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(
    scheduleGateway,
    new PreviewScheduleOccurrenceGateway(scheduleGateway)
  );
  const ctx = context('owner');
  const item = await service.createTask(ctx, recurringTaskInput('rec-create-002'));
  const values = await occurrenceService.materializeOccurrences(ctx, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-12T00:00:00Z'
  });
  assert.ok(values.every((value) => value.sourceItemVersion === item.version));
});

await test('18. alteração da regra remove somente ocorrências pendentes obsoletas', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const service = new ScheduleService(scheduleGateway);
  const occurrenceGateway = new PreviewScheduleOccurrenceGateway(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(scheduleGateway, occurrenceGateway);
  const ctx = context('owner');
  const item = await service.createTask(ctx, recurringTaskInput('rec-create-003'));
  const window = { from: '2026-09-10T00:00:00Z', to: '2026-09-15T00:00:00Z' };
  const before = await occurrenceService.materializeOccurrences(ctx, item.id, window);
  assert.equal(before.length, 5);
  const updated = await service.updateItem(ctx, item.id, {
    kind: 'task',
    title: item.title,
    description: item.description,
    priority: item.priority,
    timeZone: item.timeZone,
    dueAt: item.dueAt,
    recurrence: recurrence('daily', 2),
    expectedVersion: item.version,
    idempotencyKey: 'rec-update-003',
    reason: 'Alterar intervalo recorrente',
  });
  const after = await occurrenceService.materializeOccurrences(ctx, updated.id, window);
  assert.equal(after.length, 3);
  assert.ok(after.every((value) => value.sourceItemVersion === updated.version));
});

await test('19. conclusão de ocorrência é independente da série pai', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const service = new ScheduleService(scheduleGateway);
  const occurrenceGateway = new PreviewScheduleOccurrenceGateway(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(scheduleGateway, occurrenceGateway);
  const ctx = context('owner');
  const item = await service.createTask(ctx, recurringTaskInput('rec-create-004'));
  const [first] = await occurrenceService.materializeOccurrences(ctx, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-12T00:00:00Z'
  });
  const completed = await occurrenceService.completeOccurrence(ctx, first!.id, {
    expectedVersion: first!.version,
    idempotencyKey: 'occ-complete-004',
    reason: 'Prazo atendido',
  });
  assert.equal(completed.status, 'completed');
  assert.equal((await service.getItemById(ctx, item.id))?.status, 'pending');
});

await test('20. responsável sem gestão pode concluir sua ocorrência', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const members: readonly ScheduleMemberOption[] = [{
    userId: 'designer-a', organizationRole: 'project_designer', displayName: 'Projetista'
  }];
  scheduleGateway.setEligibleMembersForTesting('org-a', members);
  const service = new ScheduleService(scheduleGateway);
  const occurrenceGateway = new PreviewScheduleOccurrenceGateway(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(scheduleGateway, occurrenceGateway);
  const owner = context('owner', 'owner-a');
  const designer = context('project_designer', 'designer-a');
  const created = await service.createTask(owner, recurringTaskInput('rec-create-005'));
  const assigned = await service.setCollaboration(owner, created.id, {
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

await test('21. participante que não é responsável não conclui ocorrência', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  scheduleGateway.setEligibleMembersForTesting('org-a', [
    { userId: 'designer-a', organizationRole: 'project_designer', displayName: 'Projetista' },
    { userId: 'capturer-a', organizationRole: 'capturer', displayName: 'Captador' },
  ]);
  const service = new ScheduleService(scheduleGateway);
  const occurrenceGateway = new PreviewScheduleOccurrenceGateway(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(scheduleGateway, occurrenceGateway);
  const owner = context('owner', 'owner-a');
  const participant = context('capturer', 'capturer-a');
  const created = await service.createTask(owner, recurringTaskInput('rec-create-006'));
  const assigned = await service.setCollaboration(owner, created.id, {
    responsibleUserId: 'designer-a',
    participantUserIds: ['capturer-a'],
    expectedVersion: created.version,
    idempotencyKey: 'rec-assign-006',
    reason: 'Equipe do prazo',
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

await test('22. somente gestão cancela ocorrência', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const service = new ScheduleService(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(
    scheduleGateway,
    new PreviewScheduleOccurrenceGateway(scheduleGateway)
  );
  const owner = context('owner', 'owner-a');
  const item = await service.createTask(owner, recurringTaskInput('rec-create-007'));
  const [occurrence] = await occurrenceService.materializeOccurrences(owner, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  const cancelled = await occurrenceService.cancelOccurrence(owner, occurrence!.id, {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-cancel-007',
    reason: 'Prazo cancelado pela gestão',
  });
  assert.equal(cancelled.status, 'cancelled');
});

await test('23. gestão reabre ocorrência terminal', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const service = new ScheduleService(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(
    scheduleGateway,
    new PreviewScheduleOccurrenceGateway(scheduleGateway)
  );
  const owner = context('owner', 'owner-a');
  const item = await service.createTask(owner, recurringTaskInput('rec-create-008'));
  const [occurrence] = await occurrenceService.materializeOccurrences(owner, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  const completed = await occurrenceService.completeOccurrence(owner, occurrence!.id, {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-complete-008',
    reason: 'Concluir para teste',
  });
  const reopened = await occurrenceService.reopenOccurrence(owner, completed.id, {
    expectedVersion: completed.version,
    idempotencyKey: 'rec-reopen-008',
    reason: 'Reabrir prazo',
  });
  assert.equal(reopened.status, 'pending');
});

await test('24. replay de transição converge sem nova versão', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const service = new ScheduleService(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(
    scheduleGateway,
    new PreviewScheduleOccurrenceGateway(scheduleGateway)
  );
  const owner = context('owner');
  const item = await service.createTask(owner, recurringTaskInput('rec-create-009'));
  const [occurrence] = await occurrenceService.materializeOccurrences(owner, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  const input = {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-complete-009',
    reason: 'Concluir uma vez',
  };
  const first = await occurrenceService.completeOccurrence(owner, occurrence!.id, input);
  const replay = await occurrenceService.completeOccurrence(owner, occurrence!.id, input);
  assert.equal(replay.version, first.version);
});

await test('25. mesma chave com conteúdo divergente gera conflito', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const service = new ScheduleService(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(
    scheduleGateway,
    new PreviewScheduleOccurrenceGateway(scheduleGateway)
  );
  const owner = context('owner');
  const item = await service.createTask(owner, recurringTaskInput('rec-create-010'));
  const [occurrence] = await occurrenceService.materializeOccurrences(owner, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  await occurrenceService.completeOccurrence(owner, occurrence!.id, {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-complete-010',
    reason: 'Primeiro motivo',
  });
  await assert.rejects(
    () => occurrenceService.completeOccurrence(owner, occurrence!.id, {
      expectedVersion: occurrence!.version,
      idempotencyKey: 'rec-complete-010',
      reason: 'Outro motivo divergente',
    }),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'IDEMPOTENCY_CONFLICT'
  );
});

await test('26. versão obsoleta da ocorrência perde concorrência', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const service = new ScheduleService(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(
    scheduleGateway,
    new PreviewScheduleOccurrenceGateway(scheduleGateway)
  );
  const owner = context('owner');
  const item = await service.createTask(owner, recurringTaskInput('rec-create-011'));
  const [occurrence] = await occurrenceService.materializeOccurrences(owner, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  await occurrenceService.completeOccurrence(owner, occurrence!.id, {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-complete-011',
    reason: 'Primeira transição',
  });
  await assert.rejects(
    () => occurrenceService.cancelOccurrence(owner, occurrence!.id, {
      expectedVersion: occurrence!.version,
      idempotencyKey: 'rec-cancel-011',
      reason: 'Versão antiga',
    }),
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === 'CONCURRENCY_CONFLICT'
  );
});

await test('27. auditoria de ocorrência registra ator, versão e motivo', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const service = new ScheduleService(scheduleGateway);
  const occurrenceGateway = new PreviewScheduleOccurrenceGateway(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(scheduleGateway, occurrenceGateway);
  const owner = context('owner');
  const item = await service.createTask(owner, recurringTaskInput('rec-create-012'));
  const [occurrence] = await occurrenceService.materializeOccurrences(owner, item.id, {
    from: '2026-09-10T00:00:00Z', to: '2026-09-11T00:00:00Z'
  });
  const completed = await occurrenceService.completeOccurrence(owner, occurrence!.id, {
    expectedVersion: occurrence!.version,
    idempotencyKey: 'rec-complete-012',
    reason: 'Prazo atendido',
  });
  const audit = await occurrenceGateway.listOccurrenceAudit('org-a', completed.id);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.action, 'completed');
  assert.equal(audit[0]?.occurrenceVersion, completed.version);
  assert.equal(audit[0]?.reason, 'Prazo atendido');
});

await test('28. outro tenant não materializa série alheia no serviço', async () => {
  const scheduleGateway = new PreviewScheduleGateway();
  const service = new ScheduleService(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(
    scheduleGateway,
    new PreviewScheduleOccurrenceGateway(scheduleGateway)
  );
  const item = await service.createTask(
    context('owner', 'owner-a', 'org-a'),
    recurringTaskInput('rec-create-013')
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

await test('29. migration cria ocorrência derivada com FK tenant-safe', () => {
  assert.match(migration, /create table if not exists public\.schedule_item_occurrences/);
  assert.match(migration, /foreign key \(organization_id, schedule_item_id\)/);
  assert.match(migration, /references public\.schedule_items\(organization_id, id\)/);
});

await test('30. unicidade idempotente é organização + item + instante', () => {
  assert.match(
    migration,
    /unique \(organization_id, schedule_item_id, scheduled_at\)/
  );
});

await test('31. occurrence armazena source_item_version para reconciliação', () => {
  assert.match(migration, /source_item_version integer not null/);
  assert.match(migration, /source_item_version < excluded\.source_item_version/);
});

await test('32. RLS é habilitada nas duas tabelas públicas novas', () => {
  assert.match(migration, /alter table public\.schedule_item_occurrences enable row level security/);
  assert.match(migration, /alter table public\.schedule_item_occurrence_audit enable row level security/);
});

await test('33. RLS herda autorização do item pai', () => {
  assert.match(migration, /can_view_schedule_item\(/);
  assert.match(migration, /can_view_schedule_occurrence\(/);
});

await test('34. escrita direta autenticada permanece revogada', () => {
  assert.match(
    migration,
    /revoke insert, update, delete, truncate, references, trigger[\s\S]*schedule_item_occurrences from authenticated/
  );
});

await test('35. materialização possui janela máxima e ordenação determinística', () => {
  assert.match(migration, /interval '366 days'/);
  assert.match(migration, /order by o\.scheduled_at, o\.id/);
});

await test('36. banco suporta daily weekly monthly yearly explicitamente', () => {
  for (const value of ['daily', 'weekly', 'monthly', 'yearly']) {
    assert.match(migration, new RegExp(`v_frequency = '${value}'`));
  }
});

await test('37. banco preserva fuso IANA e trata DST', () => {
  assert.match(migration, /at time zone v_item\.time_zone/);
  assert.match(migration, /AGROCORE_SCHEDULE_RECURRENCE_DST_INVALID/);
  assert.match(migration, /AGROCORE_SCHEDULE_RECURRENCE_DST_AMBIGUOUS/);
});

await test('38. compromisso derivado preserva duração original', () => {
  assert.match(migration, /v_item\.ends_at - v_item\.starts_at/);
});

await test('39. stale pending é reconciliada sem apagar histórico terminal', () => {
  assert.match(migration, /o\.status = 'pending'/);
  assert.match(migration, /o\.source_item_version < v_item\.version/);
  assert.doesNotMatch(migration, /delete from public\.schedule_item_occurrences[\s\S]{0,300}status in \('completed','cancelled'\)/);
});

await test('40. comandos de ocorrência usam expectedVersion e advisory lock', () => {
  assert.match(migration, /p_expected_version integer/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_occurrence\.version <> p_expected_version/);
});

await test('41. recibos idempotentes ficam privados e usam SHA-256', () => {
  assert.match(migration, /agrocore_private\.schedule_occurrence_command_receipts/);
  assert.match(migration, /revoke all on agrocore_private\.schedule_occurrence_command_receipts/);
  assert.match(migration, /extensions\.digest/);
  assert.match(migration, /'sha256'/);
});

await test('42. transições críticas possuem RPCs específicos', () => {
  assert.match(migration, /agrocore_complete_schedule_occurrence/);
  assert.match(migration, /agrocore_cancel_schedule_occurrence/);
  assert.match(migration, /agrocore_reopen_schedule_occurrence/);
});

await test('43. conclusão permite gestão ou responsável e cancelamento/reabertura só gestão', () => {
  assert.match(migration, /v_item\.responsible_user_id is distinct from v_actor/);
  assert.match(migration, /elsif p_command_type = 'cancel'/);
  assert.match(migration, /if not v_can_manage then/);
});

await test('44. gateway Supabase usa RPC canônica de materialização', () => {
  assert.match(occurrenceGatewaySource, /agrocore_materialize_schedule_occurrences/);
  assert.match(occurrenceGatewaySource, /p_schedule_item_id: scheduleItemId/);
});

await test('45. gateway Supabase limita retry a falhas transitórias', () => {
  assert.match(occurrenceGatewaySource, /executeWithRetry/);
  assert.match(occurrenceGatewaySource, /\[0, 200, 600\]/);
  assert.match(occurrenceGatewaySource, /isTransient/);
});

await test('46. produção possui gateway Supabase e indisponível fail-closed', () => {
  assert.match(occurrenceFactorySource, /SupabaseScheduleOccurrenceGateway/);
  assert.match(occurrenceFactorySource, /UnavailableScheduleOccurrenceGateway/);
  assert.match(occurrenceFactorySource, /LazyDevelopmentScheduleOccurrenceGateway/);
});

await test('47. serviço exige schedule:view e vínculo pessoal do item', () => {
  assert.match(occurrenceServiceSource, /schedule:view/);
  assert.match(occurrenceServiceSource, /private canAccessItem/);
  assert.match(occurrenceServiceSource, /participantUserIds\.includes/);
});

await test('48. contexto expõe materialização e três transições de ocorrência', () => {
  assert.match(contextSource, /materializeOccurrences/);
  assert.match(contextSource, /completeOccurrence/);
  assert.match(contextSource, /cancelOccurrence/);
  assert.match(contextSource, /reopenOccurrence/);
});

await test('49. interface materializa somente após expansão explícita', () => {
  assert.match(occurrencePanelSource, /const \[expanded, setExpanded\]/);
  assert.match(occurrencePanelSource, /if \(!expanded\) return/);
  assert.match(occurrencePanelSource, /aria-expanded=\{expanded\}/);
});

await test('50. interface usa janela limitada e não gera recorrência infinita', () => {
  assert.match(occurrencePanelSource, /30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(occurrencePanelSource, /180 \* 24 \* 60 \* 60 \* 1000/);
});

await test('51. interface não expõe códigos internos nem IDs técnicos', () => {
  assert.doesNotMatch(occurrencePanelSource, /OE-008|008\.004/);
  assert.doesNotMatch(occurrencePanelSource, /sourceItemVersion|sourceId/);
});

await test('52. OE-008.004 não antecipa central de notificações', () => {
  const sources = migration + '\n' + occurrencePanelSource + '\n' + occurrenceServiceSource;
  assert.doesNotMatch(sources, /create table(?: if not exists)? public\.schedule_notifications/i);
  assert.doesNotMatch(sources, /push notification|email notification|sms notification/i);
});

console.log('\n====================================================');
console.log(
  'Resultado Prazos e Recorrência: ' + passed + ' aprovadas, ' + failed + ' falhas.'
);
console.log('====================================================');

if (failed > 0) process.exit(1);
