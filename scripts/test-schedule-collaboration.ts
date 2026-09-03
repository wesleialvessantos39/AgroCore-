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

function taskInput(key: string, title = 'Tarefa colaborativa') {
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

const eligibleMembers: readonly ScheduleMemberOption[] = [
  {
    userId: 'owner-a',
    organizationRole: 'owner',
    displayName: 'Proprietário',
  },
  {
    userId: 'manager-a',
    organizationRole: 'manager',
    displayName: 'Gerente',
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
  {
    userId: 'finance-a',
    organizationRole: 'finance',
    displayName: 'Financeiro',
  },
];

function setupGateway() {
  const gateway = new PreviewScheduleGateway();
  gateway.setEligibleMembersForTesting('org-a', eligibleMembers);
  return gateway;
}

async function createBase(
  gateway: PreviewScheduleGateway,
  key = 'collab-create-001'
) {
  const service = new ScheduleService(gateway);
  const item = await service.createTask(
    context('owner', 'owner-a'),
    taskInput(key)
  );
  return { service, item };
}

const migration = fs.readFileSync(
  'supabase/migrations/20260903193026_oe_008_003_assignment_collaboration.sql',
  'utf8'
);
const typesSource = fs.readFileSync('src/types/schedule.ts', 'utf8');
const serviceSource = fs.readFileSync(
  'src/schedule/scheduleService.ts',
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
const contextSource = fs.readFileSync(
  'src/schedule/ScheduleContext.tsx',
  'utf8'
);
const panelSource = fs.readFileSync(
  'src/schedule/ScheduleItemCollaborationPanel.tsx',
  'utf8'
);
const browseSource = fs.readFileSync(
  'src/schedule/ScheduleBrowsePanel.tsx',
  'utf8'
);

console.log('====================================================');
console.log(' AGROCORE — ATRIBUIÇÃO E COLABORAÇÃO');
console.log('====================================================\n');

await test('1. contrato adiciona responsável e participantes ao item', () => {
  assert.match(typesSource, /responsibleUserId: string \| null/);
  assert.match(typesSource, /participantUserIds: readonly string\[\]/);
});

await test('2. contrato registra timestamps terminais', () => {
  assert.match(typesSource, /completedAt: string \| null/);
  assert.match(typesSource, /cancelledAt: string \| null/);
});

await test('3. migration adiciona responsável canônico em schedule_items', () => {
  assert.match(
    migration,
    /add column if not exists responsible_user_id uuid null[\s\S]*references auth\.users/
  );
});

await test('4. migration mantém coerência de timestamps terminais', () => {
  assert.match(migration, /schedule_items_terminal_timestamps_ck/);
  assert.match(migration, /status = 'completed'[\s\S]*completed_at is not null/);
  assert.match(migration, /status = 'cancelled'[\s\S]*cancelled_at is not null/);
});

await test('5. participantes usam relação própria sem copiar perfis', () => {
  assert.match(
    migration,
    /create table if not exists public\.schedule_item_participants/
  );
  assert.match(migration, /user_id uuid not null references auth\.users/);
  assert.doesNotMatch(migration, /email|phone|cpf|display_name text/i);
});

await test('6. responsável e participante não podem duplicar o mesmo usuário', () => {
  assert.match(migration, /AGROCORE_SCHEDULE_COLLABORATOR_DUPLICATE/);
  assert.match(
    migration,
    /v_item\.responsible_user_id = new\.user_id/
  );
});

await test('7. participantes são únicos por item e usuário', () => {
  assert.match(
    migration,
    /unique \(schedule_item_id, user_id\)/
  );
});

await test('8. revisão de colaboração é append-only e versionada', () => {
  assert.match(
    migration,
    /create table if not exists public\.schedule_item_collaboration_revisions/
  );
  assert.match(migration, /unique \(schedule_item_id, item_version\)/);
});

await test('9. revisão guarda IDs e motivo sem copiar conteúdo sensível', () => {
  assert.match(migration, /participant_user_ids uuid\[\]/);
  assert.match(migration, /actor_user_id uuid not null references auth\.users/);
  assert.doesNotMatch(migration, /email text|phone text|content jsonb/i);
});

await test('10. RLS está ativa para participantes e revisões', () => {
  assert.match(
    migration,
    /alter table public\.schedule_item_participants enable row level security/
  );
  assert.match(
    migration,
    /alter table public\.schedule_item_collaboration_revisions enable row level security/
  );
});

await test('11. leitura RLS depende da autorização organizacional', () => {
  assert.ok(
    (migration.match(/agrocore_private\.can_view_schedule\(organization_id\)/g) ?? [])
      .length >= 2
  );
});

await test('12. escrita direta autenticada permanece revogada', () => {
  assert.match(
    migration,
    /revoke insert, update, delete, truncate, references, trigger[\s\S]*schedule_item_participants from authenticated/
  );
  assert.match(
    migration,
    /revoke insert, update, delete, truncate, references, trigger[\s\S]*schedule_item_collaboration_revisions from authenticated/
  );
});

await test('13. elegibilidade exige membership ativa da mesma organização', () => {
  assert.match(
    migration,
    /m\.organization_id = p_organization_id[\s\S]*m\.user_id = p_user_id[\s\S]*m\.status = 'active'/
  );
});

await test('14. elegibilidade exclui financeiro e superadmin', () => {
  const eligibilityStart = migration.indexOf(
    'create or replace function agrocore_private.is_eligible_schedule_member'
  );
  const eligibilityEnd = migration.indexOf(
    'revoke all on function agrocore_private.is_eligible_schedule_member'
  );
  const block = migration.slice(eligibilityStart, eligibilityEnd);
  assert.match(block, /'project_designer'/);
  assert.match(block, /'capturer'/);
  assert.doesNotMatch(block, /'finance'/);
  assert.doesNotMatch(block, /'platform_super_admin'/);
});

await test('15. diretório de integrantes não expõe email', () => {
  const start = migration.indexOf(
    'create or replace function public.agrocore_list_schedule_members'
  );
  const end = migration.indexOf(
    'revoke all on function public.agrocore_list_schedule_members'
  );
  const block = migration.slice(start, end);
  assert.doesNotMatch(block, /u\.email|email text/i);
  assert.match(block, /display_name text/);
});

await test('16. diretório exige schedule:view da organização', () => {
  assert.match(
    migration,
    /agrocore_list_schedule_members[\s\S]*can_view_schedule\(p_organization_id\)/
  );
});

await test('17. atribuição exige schedule:manage no backend', () => {
  assert.match(
    migration,
    /agrocore_set_schedule_collaboration[\s\S]*can_manage_schedule\(p_organization_id\)/
  );
});

await test('18. atribuição usa expectedVersion e idempotency key', () => {
  assert.match(
    migration,
    /agrocore_set_schedule_collaboration[\s\S]*p_expected_version integer[\s\S]*p_idempotency_key text/
  );
});

await test('19. atribuição usa SHA-256 para fingerprint do comando', () => {
  const start = migration.indexOf(
    'create or replace function public.agrocore_set_schedule_collaboration'
  );
  const end = migration.indexOf(
    'revoke all on function public.agrocore_set_schedule_collaboration'
  );
  const block = migration.slice(start, end);
  assert.match(block, /extensions\.digest/);
  assert.match(block, /'sha256'/);
});

await test('20. atribuição usa advisory lock e row lock', () => {
  const start = migration.indexOf(
    'create or replace function public.agrocore_set_schedule_collaboration'
  );
  const end = migration.indexOf(
    'revoke all on function public.agrocore_set_schedule_collaboration'
  );
  const block = migration.slice(start, end);
  assert.ok((block.match(/pg_advisory_xact_lock/g) ?? []).length >= 2);
  assert.match(block, /for update/);
});

await test('21. colaboração de item integrado permanece bloqueada', () => {
  assert.match(
    migration,
    /v_current\.origin_type <> 'manual'[\s\S]*AGROCORE_SCHEDULE_SOURCE_OWNED/
  );
});

await test('22. colaboração encerrada exige reabertura antes de nova mudança', () => {
  assert.match(
    migration,
    /v_current\.status in \('completed', 'cancelled'\)[\s\S]*AGROCORE_SCHEDULE_STATUS_LOCKED/
  );
});

await test('23. recibos privados aceitam os novos tipos de comando', () => {
  for (const command of ['collaboration', 'complete', 'reopen', 'cancel']) {
    assert.match(migration, new RegExp("'" + command + "'"));
  }
});

await test('24. conclusão possui RPC pública explícita', () => {
  assert.match(
    migration,
    /create or replace function public\.agrocore_complete_schedule_item/
  );
});

await test('25. reabertura possui RPC pública explícita', () => {
  assert.match(
    migration,
    /create or replace function public\.agrocore_reopen_schedule_item/
  );
});

await test('26. cancelamento possui RPC pública explícita', () => {
  assert.match(
    migration,
    /create or replace function public\.agrocore_cancel_schedule_item/
  );
});

await test('27. conclusão permite gestão ou responsável atual', () => {
  assert.match(
    migration,
    /p_command_type = 'complete'[\s\S]*can_manage_schedule[\s\S]*responsible_user_id is distinct from v_actor/
  );
});

await test('28. reabrir e cancelar permanecem restritos à gestão', () => {
  assert.match(
    migration,
    /elsif not agrocore_private\.can_manage_schedule\(p_organization_id\)/
  );
});

await test('29. conclusão só parte de estado ativo', () => {
  assert.match(
    migration,
    /p_command_type = 'complete'[\s\S]*v_current\.status not in \('pending','in_progress','blocked'\)/
  );
});

await test('30. cancelamento só parte de estado ativo', () => {
  assert.match(
    migration,
    /p_command_type = 'cancel'[\s\S]*v_current\.status not in \('pending','in_progress','blocked'\)/
  );
});

await test('31. reabertura aceita concluído ou cancelado e volta a pending', () => {
  assert.match(
    migration,
    /v_current\.status not in \('completed','cancelled'\)[\s\S]*p_target_status <> 'pending'/
  );
});

await test('32. transições atualizam timestamps terminais atomicamente', () => {
  assert.match(migration, /completed_at = case/);
  assert.match(migration, /cancelled_at = case/);
});

await test('33. auditoria de colaboração registra apenas campos alterados', () => {
  assert.match(migration, /'responsible_user_id'/);
  assert.match(migration, /'participant_user_ids'/);
  assert.match(migration, /schedule_item_audit/);
});

await test('34. transições registram status e timestamps na auditoria', () => {
  assert.match(migration, /array\['status','completed_at'\]/);
  assert.match(migration, /array\['status','cancelled_at'\]/);
});

await test('35. RPCs públicas usam search_path fechado', () => {
  assert.ok(
    (migration.match(/security definer[\s\S]*?set search_path = ''/gi) ?? [])
      .length >= 9
  );
});

await test('36. preview filtra diretório para os papéis elegíveis', async () => {
  const gateway = setupGateway();
  const service = new ScheduleService(gateway);
  const members = await service.listEligibleMembers(
    context('owner', 'owner-a')
  );
  assert.equal(members.some((member) => member.organizationRole === 'finance'), false);
  assert.equal(members.some((member) => member.userId === 'designer-a'), true);
});

await test('37. manager atribui responsável e participante elegíveis', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'assign-create-001');
  const updated = await service.setCollaboration(
    context('manager', 'manager-a'),
    item.id,
    {
      responsibleUserId: 'designer-a',
      participantUserIds: ['capturer-a'],
      expectedVersion: item.version,
      idempotencyKey: 'assign-command-001',
      reason: 'Distribuição da atividade',
    }
  );
  assert.equal(updated.responsibleUserId, 'designer-a');
  assert.deepEqual(updated.participantUserIds, ['capturer-a']);
  assert.equal(updated.version, 2);
});

await test('38. atribuição cria revisão append-only', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'revision-create-001');
  const updated = await service.setCollaboration(
    context('manager', 'manager-a'),
    item.id,
    {
      responsibleUserId: 'designer-a',
      participantUserIds: ['capturer-a'],
      expectedVersion: item.version,
      idempotencyKey: 'revision-command-001',
      reason: 'Primeira atribuição',
    }
  );
  const revisions = await service.listCollaborationRevisions(
    context('manager', 'manager-a'),
    item.id
  );
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0]?.itemVersion, updated.version);
  assert.equal(revisions[0]?.responsibleUserId, 'designer-a');
});

await test('39. mesma atribuição com mesma chave converge sem nova revisão', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'assign-idem-create-001');
  const input = {
    responsibleUserId: 'designer-a',
    participantUserIds: ['capturer-a'],
    expectedVersion: item.version,
    idempotencyKey: 'assign-idem-command-001',
    reason: 'Atribuição idempotente',
  };
  const first = await service.setCollaboration(
    context('manager', 'manager-a'),
    item.id,
    input
  );
  const replay = await service.setCollaboration(
    context('manager', 'manager-a'),
    item.id,
    input
  );
  assert.equal(first.version, replay.version);
  assert.equal(
    (
      await service.listCollaborationRevisions(
        context('manager', 'manager-a'),
        item.id
      )
    ).length,
    1
  );
});

await test('40. mesma chave de atribuição rejeita conteúdo divergente', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'assign-div-create-001');
  await service.setCollaboration(
    context('manager', 'manager-a'),
    item.id,
    {
      responsibleUserId: 'designer-a',
      participantUserIds: [],
      expectedVersion: item.version,
      idempotencyKey: 'assign-div-command-001',
      reason: 'Primeira atribuição',
    }
  );
  await assert.rejects(
    () =>
      service.setCollaboration(
        context('manager', 'manager-a'),
        item.id,
        {
          responsibleUserId: 'capturer-a',
          participantUserIds: [],
          expectedVersion: item.version,
          idempotencyKey: 'assign-div-command-001',
          reason: 'Primeira atribuição',
        }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'IDEMPOTENCY_CONFLICT'
  );
});

await test('41. participante duplicado é recusado', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'dup-create-001');
  await assert.rejects(
    () =>
      service.setCollaboration(
        context('manager', 'manager-a'),
        item.id,
        {
          responsibleUserId: null,
          participantUserIds: ['capturer-a', 'capturer-a'],
          expectedVersion: item.version,
          idempotencyKey: 'dup-command-001',
          reason: 'Teste de duplicidade',
        }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'COLLABORATOR_DUPLICATE'
  );
});

await test('42. responsável repetido nos participantes é recusado', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'resp-dup-create-001');
  await assert.rejects(
    () =>
      service.setCollaboration(
        context('manager', 'manager-a'),
        item.id,
        {
          responsibleUserId: 'designer-a',
          participantUserIds: ['designer-a'],
          expectedVersion: item.version,
          idempotencyKey: 'resp-dup-command-001',
          reason: 'Teste de duplicidade',
        }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'COLLABORATOR_DUPLICATE'
  );
});

await test('43. integrante desconhecido é recusado no preview', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'unknown-create-001');
  await assert.rejects(
    () =>
      service.setCollaboration(
        context('manager', 'manager-a'),
        item.id,
        {
          responsibleUserId: 'unknown-user',
          participantUserIds: [],
          expectedVersion: item.version,
          idempotencyKey: 'unknown-command-001',
          reason: 'Teste de elegibilidade',
        }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'COLLABORATOR_INELIGIBLE'
  );
});

await test('44. project_designer não altera colaboração', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'deny-assign-create-001');
  await assert.rejects(
    () =>
      service.setCollaboration(
        context('project_designer', 'designer-a'),
        item.id,
        {
          responsibleUserId: 'designer-a',
          participantUserIds: [],
          expectedVersion: item.version,
          idempotencyKey: 'deny-assign-command-001',
          reason: 'Tentativa sem gestão',
        }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
});

await test('45. Minha agenda inclui o responsável atual após atribuição', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'personal-resp-create-001');
  await service.setCollaboration(
    context('manager', 'manager-a'),
    item.id,
    {
      responsibleUserId: 'designer-a',
      participantUserIds: [],
      expectedVersion: item.version,
      idempotencyKey: 'personal-resp-command-001',
      reason: 'Atribuição ao projetista',
    }
  );
  const items = await service.listItems(
    context('project_designer', 'designer-a'),
    { viewScope: 'personal' }
  );
  assert.equal(items.length, 1);
});

await test('46. Minha agenda inclui o participante atual após atribuição', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'personal-part-create-001');
  await service.setCollaboration(
    context('manager', 'manager-a'),
    item.id,
    {
      responsibleUserId: 'designer-a',
      participantUserIds: ['capturer-a'],
      expectedVersion: item.version,
      idempotencyKey: 'personal-part-command-001',
      reason: 'Participação operacional',
    }
  );
  const items = await service.listItems(
    context('capturer', 'capturer-a'),
    { viewScope: 'personal' }
  );
  assert.equal(items.length, 1);
});

await test('47. Minha agenda continua incluindo o criador', async () => {
  const gateway = setupGateway();
  const { service } = await createBase(gateway, 'personal-owner-create-001');
  const items = await service.listItems(
    context('owner', 'owner-a'),
    { viewScope: 'personal' }
  );
  assert.equal(items.length, 1);
});

await test('48. responsável project_designer pode concluir seu registro', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'complete-resp-create-001');
  const assigned = await service.setCollaboration(
    context('manager', 'manager-a'),
    item.id,
    {
      responsibleUserId: 'designer-a',
      participantUserIds: ['capturer-a'],
      expectedVersion: item.version,
      idempotencyKey: 'complete-resp-assign-001',
      reason: 'Responsável técnico',
    }
  );
  const completed = await service.completeItem(
    context('project_designer', 'designer-a'),
    item.id,
    {
      expectedVersion: assigned.version,
      idempotencyKey: 'complete-resp-command-001',
      reason: 'Atividade concluída',
    }
  );
  assert.equal(completed.status, 'completed');
  assert.ok(completed.completedAt);
  assert.equal(completed.cancelledAt, null);
});

await test('49. participante não conclui registro alheio', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'complete-part-create-001');
  const assigned = await service.setCollaboration(
    context('manager', 'manager-a'),
    item.id,
    {
      responsibleUserId: 'designer-a',
      participantUserIds: ['capturer-a'],
      expectedVersion: item.version,
      idempotencyKey: 'complete-part-assign-001',
      reason: 'Responsável e participante',
    }
  );
  await assert.rejects(
    () =>
      service.completeItem(
        context('capturer', 'capturer-a'),
        item.id,
        {
          expectedVersion: assigned.version,
          idempotencyKey: 'complete-part-command-001',
          reason: 'Tentativa do participante',
        }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'RESPONSIBLE_MISMATCH'
  );
});

await test('50. gestão pode concluir mesmo sem ser o responsável', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'complete-manager-create-001');
  const completed = await service.completeItem(
    context('manager', 'manager-a'),
    item.id,
    {
      expectedVersion: item.version,
      idempotencyKey: 'complete-manager-command-001',
      reason: 'Encerramento pela gestão',
    }
  );
  assert.equal(completed.status, 'completed');
});

await test('51. replay da conclusão converge sem nova versão', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'complete-idem-create-001');
  const input = {
    expectedVersion: item.version,
    idempotencyKey: 'complete-idem-command-001',
    reason: 'Conclusão idempotente',
  };
  const first = await service.completeItem(
    context('manager', 'manager-a'),
    item.id,
    input
  );
  const replay = await service.completeItem(
    context('manager', 'manager-a'),
    item.id,
    input
  );
  assert.equal(first.version, replay.version);
  const audit = await service.listAudit(
    context('manager', 'manager-a'),
    item.id
  );
  assert.equal(
    audit.filter((entry) => entry.changedFields.includes('completed_at')).length,
    1
  );
});

await test('52. mesma chave de conclusão rejeita motivo divergente', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'complete-div-create-001');
  await service.completeItem(
    context('manager', 'manager-a'),
    item.id,
    {
      expectedVersion: item.version,
      idempotencyKey: 'complete-div-command-001',
      reason: 'Primeiro motivo',
    }
  );
  await assert.rejects(
    () =>
      service.completeItem(
        context('manager', 'manager-a'),
        item.id,
        {
          expectedVersion: item.version,
          idempotencyKey: 'complete-div-command-001',
          reason: 'Motivo divergente',
        }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'IDEMPOTENCY_CONFLICT'
  );
});

await test('53. nova conclusão com versão obsoleta é conflito de concorrência', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'complete-stale-create-001');
  await service.completeItem(
    context('manager', 'manager-a'),
    item.id,
    {
      expectedVersion: item.version,
      idempotencyKey: 'complete-stale-command-001',
      reason: 'Conclusão válida',
    }
  );
  await assert.rejects(
    () =>
      service.completeItem(
        context('manager', 'manager-a'),
        item.id,
        {
          expectedVersion: item.version,
          idempotencyKey: 'complete-stale-command-002',
          reason: 'Nova tentativa obsoleta',
        }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      (error.code === 'CONCURRENCY_CONFLICT' ||
        error.code === 'INVALID_TRANSITION')
  );
});

await test('54. gestão pode cancelar registro ativo', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'cancel-create-001');
  const cancelled = await service.cancelItem(
    context('manager', 'manager-a'),
    item.id,
    {
      expectedVersion: item.version,
      idempotencyKey: 'cancel-command-001',
      reason: 'Atividade não será executada',
    }
  );
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(cancelled.cancelledAt);
  assert.equal(cancelled.completedAt, null);
});

await test('55. responsável sem gestão não pode cancelar', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'cancel-deny-create-001');
  const assigned = await service.setCollaboration(
    context('manager', 'manager-a'),
    item.id,
    {
      responsibleUserId: 'designer-a',
      participantUserIds: [],
      expectedVersion: item.version,
      idempotencyKey: 'cancel-deny-assign-001',
      reason: 'Atribuição técnica',
    }
  );
  await assert.rejects(
    () =>
      service.cancelItem(
        context('project_designer', 'designer-a'),
        item.id,
        {
          expectedVersion: assigned.version,
          idempotencyKey: 'cancel-deny-command-001',
          reason: 'Tentativa sem gestão',
        }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
});

await test('56. gestão reabre registro concluído e limpa timestamp terminal', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'reopen-complete-create-001');
  const completed = await service.completeItem(
    context('manager', 'manager-a'),
    item.id,
    {
      expectedVersion: item.version,
      idempotencyKey: 'reopen-complete-first-001',
      reason: 'Conclusão inicial',
    }
  );
  const reopened = await service.reopenItem(
    context('manager', 'manager-a'),
    item.id,
    {
      expectedVersion: completed.version,
      idempotencyKey: 'reopen-complete-command-001',
      reason: 'Necessário retomar a atividade',
    }
  );
  assert.equal(reopened.status, 'pending');
  assert.equal(reopened.completedAt, null);
  assert.equal(reopened.cancelledAt, null);
});

await test('57. gestão reabre registro cancelado', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'reopen-cancel-create-001');
  const cancelled = await service.cancelItem(
    context('manager', 'manager-a'),
    item.id,
    {
      expectedVersion: item.version,
      idempotencyKey: 'reopen-cancel-first-001',
      reason: 'Cancelamento inicial',
    }
  );
  const reopened = await service.reopenItem(
    context('manager', 'manager-a'),
    item.id,
    {
      expectedVersion: cancelled.version,
      idempotencyKey: 'reopen-cancel-command-001',
      reason: 'Atividade retomada',
    }
  );
  assert.equal(reopened.status, 'pending');
});

await test('58. project_designer não pode reabrir', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'reopen-deny-create-001');
  const completed = await service.completeItem(
    context('manager', 'manager-a'),
    item.id,
    {
      expectedVersion: item.version,
      idempotencyKey: 'reopen-deny-first-001',
      reason: 'Conclusão inicial',
    }
  );
  await assert.rejects(
    () =>
      service.reopenItem(
        context('project_designer', 'designer-a'),
        item.id,
        {
          expectedVersion: completed.version,
          idempotencyKey: 'reopen-deny-command-001',
          reason: 'Tentativa sem gestão',
        }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
});

await test('59. colaboração não pode ser alterada em item terminal com novo comando', async () => {
  const gateway = setupGateway();
  const { service, item } = await createBase(gateway, 'terminal-collab-create-001');
  const completed = await service.completeItem(
    context('manager', 'manager-a'),
    item.id,
    {
      expectedVersion: item.version,
      idempotencyKey: 'terminal-collab-complete-001',
      reason: 'Conclusão do item',
    }
  );
  await assert.rejects(
    () =>
      service.setCollaboration(
        context('manager', 'manager-a'),
        item.id,
        {
          responsibleUserId: 'designer-a',
          participantUserIds: [],
          expectedVersion: completed.version,
          idempotencyKey: 'terminal-collab-command-001',
          reason: 'Alteração após conclusão',
        }
      ),
    (error: unknown) =>
      error instanceof ScheduleDomainError &&
      error.code === 'STATUS_LOCKED'
  );
});

await test('60. interface exige confirmação contextual e motivo', () => {
  assert.match(panelSource, /Confirmar conclusão/);
  assert.match(panelSource, /Confirmar cancelamento/);
  assert.match(panelSource, /Confirmar reabertura/);
  assert.match(panelSource, /<span>Motivo<\/span>/);
  assert.match(panelSource, /minLength=\{3\}/);
});

await test('61. interface não expõe códigos internos nem secrets', () => {
  const source = panelSource + '\n' + browseSource;
  assert.doesNotMatch(source, /OE-008|008\.003/i);
  assert.doesNotMatch(
    source,
    /SUPABASE|API_KEY|SECRET_KEY|Bearer /i
  );
});

await test('62. escopo futuro continua sem ocorrências/notificações/canais externos', () => {
  assert.doesNotMatch(
    migration,
    /create table(?: if not exists)? public\.schedule_occurrences/i
  );
  assert.doesNotMatch(
    migration,
    /create table(?: if not exists)? public\.schedule_notifications/i
  );
  assert.doesNotMatch(
    migration,
    /whatsapp|smtp|sms|webhook/i
  );
});

console.log('\n====================================================');
console.log(
  'Resultado Atribuição e Colaboração: ' +
    passed +
    ' aprovadas, ' +
    failed +
    ' falhas.'
);
console.log('====================================================');

if (failed > 0) process.exit(1);
