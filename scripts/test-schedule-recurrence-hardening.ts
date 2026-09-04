import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import { PreviewScheduleGateway } from '../src/schedule/preview/previewScheduleGateway.ts';
import { PreviewScheduleOccurrenceGateway } from '../src/schedule/preview/previewScheduleOccurrenceGateway.ts';
import { ScheduleOccurrenceService } from '../src/schedule/scheduleOccurrenceService.ts';
import { ScheduleService } from '../src/schedule/scheduleService.ts';
import type {
  ScheduleApplicationContext,
  ScheduleRecurrenceDefinition,
} from '../src/types/schedule.ts';

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

function ownerContext(): ScheduleApplicationContext {
  return {
    organizationId: 'org-hardening',
    actor: {
      userId: 'owner-hardening',
      role: 'owner',
      isActive: true,
      permissions: [...getRolePermissions('owner')],
    },
  };
}

function dailyRule(): ScheduleRecurrenceDefinition {
  return {
    frequency: 'daily',
    interval: 1,
    weekdays: [],
    endsAt: null,
  };
}

function stack() {
  const scheduleGateway = new PreviewScheduleGateway();
  const scheduleService = new ScheduleService(scheduleGateway);
  const occurrenceGateway = new PreviewScheduleOccurrenceGateway(scheduleGateway);
  const occurrenceService = new ScheduleOccurrenceService(
    scheduleGateway,
    occurrenceGateway
  );
  return { scheduleService, occurrenceService };
}

const hardeningMigration = fs.readFileSync(
  'supabase/migrations/20260904123000_oe_008_004_idempotency_identity_hardening.sql',
  'utf8'
);
const remoteGatewaySource = fs.readFileSync(
  'src/schedule/supabaseScheduleOccurrenceGateway.ts',
  'utf8'
);
const occurrencePanelSource = fs.readFileSync(
  'src/schedule/ScheduleOccurrencePanel.tsx',
  'utf8'
);

console.log('====================================================');
console.log(' AGROCORE — HARDENING DE PRAZOS E RECORRÊNCIA');
console.log('====================================================\n');

await test('1. alteração somente de horário não duplica ocorrência terminal do mesmo dia local', async () => {
  const { scheduleService, occurrenceService } = stack();
  const ctx = ownerContext();
  const item = await scheduleService.createTask(ctx, {
    title: 'Prazo recorrente',
    description: null,
    priority: 'medium',
    timeZone: 'America/Sao_Paulo',
    dueAt: '2026-09-10T15:00:00.000Z',
    recurrence: dailyRule(),
    idempotencyKey: 'hard-create-001',
  });
  const window = {
    from: '2026-09-10T00:00:00.000Z',
    to: '2026-09-11T23:59:59.999Z',
  };
  const [first] = await occurrenceService.materializeOccurrences(ctx, item.id, window);
  assert.ok(first);
  const completed = await occurrenceService.completeOccurrence(ctx, first.id, {
    expectedVersion: first.version,
    idempotencyKey: 'hard-complete-001',
    reason: 'Prazo cumprido',
  });
  assert.equal(completed.status, 'completed');

  const updated = await scheduleService.updateItem(ctx, item.id, {
    kind: 'task',
    title: item.title,
    description: item.description,
    priority: item.priority,
    timeZone: item.timeZone,
    dueAt: '2026-09-10T16:00:00.000Z',
    recurrence: dailyRule(),
    expectedVersion: item.version,
    idempotencyKey: 'hard-update-001',
    reason: 'Ajustar apenas o horário',
  });

  const after = await occurrenceService.materializeOccurrences(ctx, updated.id, window);
  const sameDay = after.filter((value) => value.scheduledAt.slice(0, 10) === '2026-09-10');
  assert.equal(sameDay.length, 1);
  assert.equal(sameDay[0]?.id, completed.id);
  assert.equal(sameDay[0]?.status, 'completed');
});

await test('2. replay antigo devolve o snapshot original mesmo após reabertura posterior', async () => {
  const { scheduleService, occurrenceService } = stack();
  const ctx = ownerContext();
  const item = await scheduleService.createTask(ctx, {
    title: 'Replay recorrente',
    description: null,
    priority: 'medium',
    timeZone: 'America/Sao_Paulo',
    dueAt: '2026-09-10T15:00:00.000Z',
    recurrence: dailyRule(),
    idempotencyKey: 'hard-create-002',
  });
  const [occurrence] = await occurrenceService.materializeOccurrences(ctx, item.id, {
    from: '2026-09-10T00:00:00.000Z',
    to: '2026-09-11T00:00:00.000Z',
  });
  assert.ok(occurrence);
  const completeInput = {
    expectedVersion: occurrence.version,
    idempotencyKey: 'hard-complete-002',
    reason: 'Concluir uma única vez',
  };
  const completed = await occurrenceService.completeOccurrence(
    ctx,
    occurrence.id,
    completeInput
  );
  const reopened = await occurrenceService.reopenOccurrence(ctx, occurrence.id, {
    expectedVersion: completed.version,
    idempotencyKey: 'hard-reopen-002',
    reason: 'Reabrir depois',
  });
  assert.equal(reopened.status, 'pending');
  assert.ok(reopened.version > completed.version);

  const replay = await occurrenceService.completeOccurrence(
    ctx,
    occurrence.id,
    completeInput
  );
  assert.equal(replay.status, 'completed');
  assert.equal(replay.version, completed.version);
  assert.equal(replay.completedAt, completed.completedAt);
});

await test('3. migration endurece identidade local e snapshot do recibo sem nova fonte mestre', () => {
  assert.match(hardeningMigration, /occurrence_local_date date/i);
  assert.match(hardeningMigration, /schedule_item_occurrences_org_item_local_date_uq/);
  assert.match(
    hardeningMigration,
    /on conflict \(organization_id, schedule_item_id, occurrence_local_date\)/
  );
  assert.match(hardeningMigration, /result_snapshot jsonb/);
  assert.match(hardeningMigration, /jsonb_populate_record/);
  assert.match(hardeningMigration, /to_jsonb\(v_updated\)/);
  assert.match(hardeningMigration, /for share;/i);
  assert.doesNotMatch(hardeningMigration, /create table(?: if not exists)? public\.schedule_items/i);
});

await test('4. materialização remota usa o mesmo retry transitório das mutações', () => {
  const start = remoteGatewaySource.indexOf('async materializeOccurrences(');
  const end = remoteGatewaySource.indexOf('private async transition(', start);
  const block = remoteGatewaySource.slice(start, end);
  assert.match(block, /executeWithRetry\(\(\) =>/);
  assert.match(block, /agrocore_materialize_schedule_occurrences/);
  assert.match(remoteGatewaySource, /const delays = \[0, 200, 600\] as const/);
});

await test('5. interface conserva a chave idempotente durante tentativas do mesmo comando', () => {
  assert.match(occurrencePanelSource, /readonly idempotencyKey: string/);
  assert.match(occurrencePanelSource, /idempotencyKey: secureCommandId\(\)/);
  assert.match(occurrencePanelSource, /idempotencyKey: activeAction\.idempotencyKey/);
  const start = occurrencePanelSource.indexOf('const submitAction');
  const end = occurrencePanelSource.indexOf('return (', start);
  const submitBlock = occurrencePanelSource.slice(start, end);
  assert.doesNotMatch(submitBlock, /secureCommandId\(\)/);
});

await test('6. hardening não antecipa central de notificações nem canais externos', () => {
  assert.doesNotMatch(
    hardeningMigration,
    /schedule_notifications|notification_channels|push_subscription|sms_provider/i
  );
});

console.log('\n====================================================');
console.log(
  'Resultado Hardening de Recorrência: ' + passed + ' aprovadas, ' + failed + ' falhas.'
);
console.log('====================================================');

if (failed > 0) process.exit(1);
