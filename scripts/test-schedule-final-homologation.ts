import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import {
  isValidScheduleTimeZone,
  scheduleLocalDateTimeToUtc,
} from '../src/schedule/time.ts';
import {
  buildScheduleOccurrenceDrafts,
  normalizeOccurrenceWindow,
} from '../src/schedule/recurrence.ts';
import type {
  CorporateTask,
  ScheduleRecurrenceDefinition,
} from '../src/types/schedule.ts';

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

function recurrence(
  frequency: ScheduleRecurrenceDefinition['frequency'],
  interval = 1,
  weekdays: readonly number[] = [],
  endsAt: string | null = null
): ScheduleRecurrenceDefinition {
  return { frequency, interval, weekdays, endsAt };
}

function taskFixture(
  dueAt = '2026-09-10T15:00:00.000Z',
  rule: ScheduleRecurrenceDefinition = recurrence('none'),
  timeZone = 'America/Sao_Paulo',
  status: CorporateTask['status'] = 'pending'
): CorporateTask {
  return {
    id: 'homologation-task',
    organizationId: 'org-a',
    kind: 'task',
    title: 'Homologação da agenda',
    description: null,
    priority: 'high',
    status,
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
    responsibleUserId: 'user-project-designer',
    participantUserIds: ['user-capturer'],
    completedAt: status === 'completed' ? dueAt : null,
    cancelledAt: status === 'cancelled' ? dueAt : null,
    createdByUserId: 'user-owner',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedByUserId: 'user-owner',
    updatedAt: '2026-09-01T12:00:00.000Z',
    version: 1,
  };
}

const baseMigration = readFileSync(
  'supabase/migrations/20260903153944_oe_008_001_schedule_model.sql',
  'utf8'
);
const recurrenceMigration = readFileSync(
  'supabase/migrations/20260904100000_oe_008_004_deadlines_recurrence.sql',
  'utf8'
);
const recurrenceHardening = readFileSync(
  'supabase/migrations/20260904123000_oe_008_004_idempotency_identity_hardening.sql',
  'utf8'
);
const notificationMigration = readFileSync(
  'supabase/migrations/20260904151711_oe_008_005_internal_notification_center.sql',
  'utf8'
);
const externalMigration = readFileSync(
  'supabase/migrations/20260904172154_oe_008_006_external_channels_escalation.sql',
  'utf8'
);
const externalHardening = readFileSync(
  'supabase/migrations/20260904172859_oe_008_006_delivery_version_hardening.sql',
  'utf8'
);
const finalHardening = readFileSync(
  'supabase/migrations/20260904224802_oe_008_007_final_homologation_hardening.sql',
  'utf8'
);
const routePaths = readFileSync('src/routes/paths.ts', 'utf8');
const appRoutes = readFileSync('src/routes/AppRoutes.tsx', 'utf8');
const center = readFileSync('src/notifications/NotificationCenter.tsx', 'utf8');
const notificationGateway = readFileSync(
  'src/notifications/supabaseNotificationGateway.ts',
  'utf8'
);
const externalGateway = readFileSync(
  'src/notifications/externalNotificationGateway.ts',
  'utf8'
);
const externalSettings = readFileSync(
  'src/notifications/ExternalNotificationSettings.tsx',
  'utf8'
);
const pushSubscription = readFileSync(
  'src/notifications/pushSubscription.ts',
  'utf8'
);
const pushWorker = readFileSync('public/push-sw.js', 'utf8');
const deliveryWorker = readFileSync(
  'supabase/functions/notification-delivery-worker/index.ts',
  'utf8'
);
const channelConfig = readFileSync(
  'supabase/functions/notification-channel-config/index.ts',
  'utf8'
);
const accessibility = readFileSync(
  'scripts/test-schedule-accessibility.ts',
  'utf8'
);
const theme = readFileSync('scripts/test-schedule-theme.js', 'utf8');
const moduleGate = readFileSync('scripts/test-module-008.js', 'utf8');
const packageManifest = readFileSync('package.json', 'utf8');
const runbook = readFileSync(
  'docs/OE-008-007-ROTEIRO-HOMOLOGACAO-OPERACIONAL.md',
  'utf8'
);
const closingReport = readFileSync(
  'docs/OE-008-007-RELATORIO-FECHAMENTO.md',
  'utf8'
);
const finalModuleReport = readFileSync(
  'docs/MODULO-008-RELATORIO-FINAL.md',
  'utf8'
);

console.log('====================================================');
console.log(' AGROCORE — OE-008.007 — HOMOLOGAÇÃO FINAL');
console.log('====================================================\n');

// Fusos e mudanças de horário.
await test('01. America/Sao_Paulo é fuso IANA válido', () => {
  assert.equal(isValidScheduleTimeZone('America/Sao_Paulo'), true);
});
await test('02. America/New_York é fuso IANA válido', () => {
  assert.equal(isValidScheduleTimeZone('America/New_York'), true);
});
await test('03. UTC é fuso válido', () => {
  assert.equal(isValidScheduleTimeZone('UTC'), true);
});
await test('04. fuso inexistente é recusado', () => {
  assert.equal(isValidScheduleTimeZone('AgroCore/Invalid'), false);
});
await test('05. conversão de São Paulo preserva instante esperado', () => {
  assert.equal(
    scheduleLocalDateTimeToUtc('2026-09-10T12:00:00', 'America/Sao_Paulo'),
    '2026-09-10T15:00:00.000Z'
  );
});
await test('06. horário inexistente no início do DST é recusado', () => {
  assert.throws(() =>
    scheduleLocalDateTimeToUtc('2026-03-08T02:30:00', 'America/New_York')
  );
});
await test('07. horário ambíguo no fim do DST é recusado', () => {
  assert.throws(() =>
    scheduleLocalDateTimeToUtc('2026-11-01T01:30:00', 'America/New_York')
  );
});
await test('08. horário não ambíguo após mudança de DST é aceito', () => {
  assert.match(
    scheduleLocalDateTimeToUtc('2026-11-01T03:30:00', 'America/New_York'),
    /^2026-11-01T08:30:00\.000Z$/
  );
});

// Recorrência e exceções.
await test('09. janela positiva curta é normalizada', () => {
  assert.equal(
    normalizeOccurrenceWindow({
      from: '2026-09-10T00:00:00Z',
      to: '2026-09-11T00:00:00Z',
    }).from,
    '2026-09-10T00:00:00.000Z'
  );
});
await test('10. janela invertida é recusada', () => {
  assert.throws(() =>
    normalizeOccurrenceWindow({
      from: '2026-09-11T00:00:00Z',
      to: '2026-09-10T00:00:00Z',
    })
  );
});
await test('11. janela superior a 366 dias é recusada', () => {
  assert.throws(() =>
    normalizeOccurrenceWindow({
      from: '2026-01-01T00:00:00Z',
      to: '2027-01-03T00:00:00Z',
    })
  );
});
await test('12. recorrência diária mantém relógio local', () => {
  const values = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-10T15:00:00.000Z', recurrence('daily')),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-13T00:00:00Z' }
  );
  assert.deepEqual(
    values.map((value) => value.scheduledAt),
    [
      '2026-09-10T15:00:00.000Z',
      '2026-09-11T15:00:00.000Z',
      '2026-09-12T15:00:00.000Z',
    ]
  );
});
await test('13. recorrência diária respeita intervalo', () => {
  const values = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-10T15:00:00.000Z', recurrence('daily', 2)),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-16T00:00:00Z' }
  );
  assert.deepEqual(
    values.map((value) => value.scheduledAt.slice(0, 10)),
    ['2026-09-10', '2026-09-12', '2026-09-14']
  );
});
await test('14. recorrência semanal exige weekdays', () => {
  assert.throws(() =>
    buildScheduleOccurrenceDrafts(
      taskFixture('2026-09-10T15:00:00.000Z', recurrence('weekly')),
      { from: '2026-09-10T00:00:00Z', to: '2026-09-17T00:00:00Z' }
    )
  );
});
await test('15. recorrência semanal respeita dia selecionado', () => {
  const values = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-10T15:00:00.000Z', recurrence('weekly', 1, [4])),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-25T00:00:00Z' }
  );
  assert.equal(values.length, 3);
});
await test('16. mensal não inventa 31 de fevereiro', () => {
  const values = buildScheduleOccurrenceDrafts(
    taskFixture('2026-01-31T15:00:00.000Z', recurrence('monthly')),
    { from: '2026-01-01T00:00:00Z', to: '2026-04-01T00:00:00Z' }
  );
  assert.deepEqual(
    values.map((value) => value.scheduledAt.slice(0, 10)),
    ['2026-01-31', '2026-03-31']
  );
});
await test('17. anual preserva mês e dia', () => {
  const values = buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-10T15:00:00.000Z', recurrence('yearly')),
    { from: '2026-09-10T00:00:00Z', to: '2027-09-11T00:00:00Z' }
  );
  assert.deepEqual(
    values.map((value) => value.scheduledAt.slice(0, 10)),
    ['2026-09-10', '2027-09-10']
  );
});
await test('18. endsAt encerra a série', () => {
  const values = buildScheduleOccurrenceDrafts(
    taskFixture(
      '2026-09-10T15:00:00.000Z',
      recurrence('daily', 1, [], '2026-09-11T15:00:00.000Z')
    ),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-14T00:00:00Z' }
  );
  assert.equal(values.length, 2);
});
await test('19. item concluído não cria novas ocorrências', () => {
  assert.deepEqual(
    buildScheduleOccurrenceDrafts(
      taskFixture(
        '2026-09-10T15:00:00.000Z',
        recurrence('daily'),
        'America/Sao_Paulo',
        'completed'
      ),
      { from: '2026-09-10T00:00:00Z', to: '2026-09-13T00:00:00Z' }
    ),
    []
  );
});
await test('20. item cancelado não cria novas ocorrências', () => {
  assert.deepEqual(
    buildScheduleOccurrenceDrafts(
      taskFixture(
        '2026-09-10T15:00:00.000Z',
        recurrence('daily'),
        'America/Sao_Paulo',
        'cancelled'
      ),
      { from: '2026-09-10T00:00:00Z', to: '2026-09-13T00:00:00Z' }
    ),
    []
  );
});

// Perfis positivos/negativos e rota.
await test('21. owner visualiza Agenda', () => {
  assert.ok(getRolePermissions('owner').includes('schedule:view'));
});
await test('22. owner gerencia Agenda', () => {
  assert.ok(getRolePermissions('owner').includes('schedule:manage'));
});
await test('23. company_admin gerencia Agenda', () => {
  assert.ok(getRolePermissions('company_admin').includes('schedule:manage'));
});
await test('24. manager gerencia Agenda', () => {
  assert.ok(getRolePermissions('manager').includes('schedule:manage'));
});
await test('25. project_designer visualiza sem gerenciar', () => {
  const permissions = getRolePermissions('project_designer');
  assert.ok(permissions.includes('schedule:view'));
  assert.ok(!permissions.includes('schedule:manage'));
});
await test('26. capturer visualiza sem gerenciar', () => {
  const permissions = getRolePermissions('capturer');
  assert.ok(permissions.includes('schedule:view'));
  assert.ok(!permissions.includes('schedule:manage'));
});
await test('27. finance não herda acesso à Agenda', () => {
  const permissions = getRolePermissions('finance');
  assert.ok(!permissions.includes('schedule:view'));
  assert.ok(!permissions.includes('schedule:manage'));
});
await test('28. platform_super_admin não herda Agenda organizacional', () => {
  const permissions = getRolePermissions('platform_super_admin');
  assert.ok(!permissions.includes('schedule:view'));
  assert.ok(!permissions.includes('schedule:manage'));
});
await test('29. papel none não possui permissões de Agenda', () => {
  assert.deepEqual(getRolePermissions('none'), []);
});
await test('30. rota /agenda exige schedule:view', () => {
  assert.match(routePaths, /SCHEDULE:\s*'\/agenda'/);
  assert.match(
    appRoutes,
    /path=\{ROUTES\.SCHEDULE\}[\s\S]*RequirePermission permission="schedule:view"/
  );
});

// Multi-tenant, IDOR e RLS.
await test('31. schedule_items mantém organization_id obrigatório', () => {
  assert.match(baseMigration, /organization_id uuid not null references public\.organizations/);
});
await test('32. select da Agenda passa pelo autorizador organizacional', () => {
  assert.match(baseMigration, /agrocore_schedule_items_select[\s\S]*can_view_schedule\(organization_id\)/);
});
await test('33. ocorrência lógica é única por organização/item/data local', () => {
  assert.match(
    recurrenceHardening,
    /unique index[\s\S]*organization_id,[\s\S]*schedule_item_id,[\s\S]*occurrence_local_date/i
  );
});
await test('34. materialização valida acesso ao item', () => {
  assert.match(
    recurrenceHardening,
    /can_view_schedule_item\([\s\S]*p_organization_id,[\s\S]*p_schedule_item_id/
  );
});
await test('35. notificação direta é recipient-only', () => {
  assert.match(
    finalHardening,
    /recipient_user_id = \(select auth\.uid\(\)\)/
  );
});
await test('36. notificação direta exige organização ativa', () => {
  assert.match(
    finalHardening,
    /from public\.organizations o[\s\S]*o\.status = 'active'[\s\S]*m\.status = 'active'/
  );
});
await test('37. elegibilidade de destinatário exige organização ativa', () => {
  assert.match(
    finalHardening,
    /is_notification_recipient_eligible[\s\S]*o\.status = 'active'/
  );
});
await test('38. RLS direto exige available_at já alcançado', () => {
  assert.match(finalHardening, /available_at <= statement_timestamp\(\)/);
});
await test('39. RLS direto exclui notificação expirada', () => {
  assert.match(finalHardening, /expires_at > statement_timestamp\(\)/);
});
await test('40. RLS direto respeita preferência da categoria', () => {
  assert.match(
    finalHardening,
    /notification_category_enabled\([\s\S]*organization_id,[\s\S]*recipient_user_id,[\s\S]*category/
  );
});

// Links, validade, preferências e leitura.
await test('41. rota interna de notificação rejeita protocolo externo no banco', () => {
  assert.match(notificationMigration, /position\(':\/\/' in route\) = 0/);
});
await test('42. Central valida novamente a rota antes de navegar', () => {
  assert.match(center, /function safeRoute/);
  assert.match(center, /route\.includes\(':\/\/'\)/);
});
await test('43. rota canônica de avisos da Agenda é /agenda', () => {
  assert.match(notificationMigration, /'\/agenda'/);
});
await test('44. snapshot filtra janela temporal válida', () => {
  assert.match(
    notificationMigration,
    /agrocore_notification_snapshot[\s\S]*available_at <= statement_timestamp\(\)[\s\S]*expires_at > statement_timestamp\(\)/
  );
});
await test('45. snapshot filtra categoria desabilitada', () => {
  assert.match(
    notificationMigration,
    /agrocore_notification_snapshot[\s\S]*notification_category_enabled/
  );
});
await test('46. leitura individual final só aceita notificação válida', () => {
  assert.match(
    finalHardening,
    /agrocore_mark_notification_read[\s\S]*available_at <= statement_timestamp\(\)[\s\S]*expires_at > statement_timestamp\(\)/
  );
});
await test('47. expiração final não mantém janela artificial de um segundo', () => {
  assert.match(
    finalHardening,
    /expires_at = greatest\(n\.available_at, statement_timestamp\(\)\)/
  );
  assert.ok(!/available_at \+ interval '1 second'/.test(finalHardening));
});
await test('48. constraint final permite invalidação exata sem visibilidade', () => {
  assert.match(finalHardening, /check \(expires_at >= available_at\)/);
});
await test('49. preferências internas usam expectedVersion e idempotência', () => {
  assert.match(notificationMigration, /AGROCORE_NOTIFICATION_CONCURRENCY_CONFLICT/);
  assert.match(notificationMigration, /AGROCORE_NOTIFICATION_IDEMPOTENCY_CONFLICT/);
});
await test('50. gateway interno só repete falha transitória', () => {
  assert.match(notificationGateway, /200/);
  assert.match(notificationGateway, /600/);
  assert.match(notificationGateway, /transient/i);
});

// Canais externos, consentimento e escalonamento.
await test('51. e-mail externo é opt-in por padrão', () => {
  assert.match(
    externalMigration,
    /notification_external_preferences[\s\S]*enabled boolean not null default false/
  );
});
await test('52. política externa inicia canais desligados', () => {
  assert.match(externalMigration, /email_enabled boolean not null default false/);
  assert.match(externalMigration, /push_enabled boolean not null default false/);
});
await test('53. política registra prioridade mínima e crítica', () => {
  assert.match(externalMigration, /minimum_priority/);
  assert.match(externalMigration, /critical_priority/);
});
await test('54. política registra atraso normal e crítico', () => {
  assert.match(externalMigration, /delay_minutes/);
  assert.match(externalMigration, /critical_delay_minutes/);
});
await test('55. somente gestão pode alterar escalonamento no frontend', () => {
  assert.match(externalSettings, /can\('schedule:manage'\)/);
});
await test('56. Push exige consentimento explícito do navegador', () => {
  assert.match(pushSubscription, /Notification\.requestPermission\(\)/);
});
await test('57. Push utiliza Service Worker dedicado', () => {
  assert.match(pushSubscription, /scope:\s*'\/push-notifications\/'/);
});
await test('58. clique Push restringe destino à mesma aplicação', () => {
  assert.match(pushWorker, /function safeRoute/);
  assert.match(pushWorker, /self\.location\.origin/);
});
await test('59. configuração de canal não expõe chave VAPID privada', () => {
  assert.match(channelConfig, /vapidPublicKey/);
  assert.ok(!/vapidPrivateKey\s*:/.test(channelConfig));
});
await test('60. UI não solicita secrets de provedor', () => {
  assert.ok(!/digite.*(?:api.?key|secret|service.?role|token)/i.test(externalSettings));
});

// Falha de entrega, retry, volume, idempotência e auditoria.
await test('61. worker de e-mail possui adaptador Resend real', () => {
  assert.match(deliveryWorker, /api\.resend\.com\/emails/);
});
await test('62. worker de Push possui envio Web Push real', () => {
  assert.match(deliveryWorker, /webpush\.sendNotification/);
});
await test('63. provedor ausente bloqueia sem simular entrega', () => {
  assert.match(deliveryWorker, /provider_unconfigured/);
  assert.match(externalMigration, /status='blocked'|status = 'blocked'/);
});
await test('64. 429 e 5xx são classificados como transitórios', () => {
  assert.match(deliveryWorker, /429/);
  assert.match(deliveryWorker, />= 500/);
});
await test('65. retry possui backoff determinístico', () => {
  assert.match(
    externalMigration,
    /when 1 then 60[\s\S]*when 2 then 300[\s\S]*when 3 then 900/
  );
});
await test('66. fila concorrente usa SKIP LOCKED', () => {
  assert.match(externalHardening + externalMigration, /skip locked/i);
});
await test('67. claim usa lease token e expiração', () => {
  assert.match(externalMigration, /lease_token uuid/);
  assert.match(externalMigration, /lease_expires_at/);
});
await test('68. versão antiga da mesma notificação é suprimida', () => {
  assert.match(externalHardening, /superseded_notification_version/);
  assert.match(externalHardening, /notification_version = n\.version/);
});
await test('69. entrega por e-mail possui identidade idempotente no provedor', () => {
  assert.match(deliveryWorker, /Idempotency-Key/);
  assert.match(deliveryWorker, /row\.delivery_id/);
});
await test('70. auditoria externa persiste resultados sem criar segunda notificação', () => {
  assert.match(externalMigration, /notification_external_audit/);
  assert.ok(!/create table if not exists public\.schedule_notifications/i.test(externalMigration));
});

// Fechamento integral, acessibilidade e rastreabilidade.
await test('71. migration final não recria schedule_items', () => {
  assert.ok(!/create table[\s\S]*schedule_items/i.test(finalHardening));
});
await test('72. migration final não recria notifications', () => {
  assert.ok(!/create table[\s\S]*public\.notifications/i.test(finalHardening));
});
await test('73. migration final não recria fila externa', () => {
  assert.ok(!/create table[\s\S]*notification_external_deliveries/i.test(finalHardening));
});
await test('74. gate final executa esta homologação antes da acessibilidade', () => {
  const finalIndex = moduleGate.indexOf('test-schedule-final-homologation.ts');
  const a11yIndex = moduleGate.indexOf('test-schedule-accessibility.ts');
  assert.ok(finalIndex >= 0 && a11yIndex > finalIndex);
});
await test('75. gate final mantém auditoria de tema depois da acessibilidade', () => {
  const a11yIndex = moduleGate.indexOf('test-schedule-accessibility.ts');
  const themeIndex = moduleGate.indexOf('test-schedule-theme.js');
  assert.ok(a11yIndex >= 0 && themeIndex > a11yIndex);
});
await test('76. gate declara Módulo 008 concluído de OE-008.001 a OE-008.007', () => {
  assert.match(
    moduleGate,
    /MÓDULO 008 — CONCLUÍDO — OE-008\.001 A OE-008\.007/
  );
});
await test('77. package expõe comando dedicado de homologação final', () => {
  assert.match(packageManifest, /"test:schedule-final-homologation"/);
});
await test('78. roteiro operacional proíbe dado fictício e exige ambiente físico real', () => {
  assert.match(runbook, /não criar dados fictícios/i);
  assert.match(runbook, /dispositivo real/i);
  assert.match(runbook, /provedor/i);
});
await test('79. fechamento distingue implementação completa de evidência física não fabricada', () => {
  assert.match(closingReport, /implementação.*completa/i);
  assert.match(closingReport, /não foi fabricada/i);
  assert.match(closingReport, /ambiente atual/i);
});
await test('80. relatório final declara o Módulo 008 concluído sem remover gates existentes', () => {
  assert.match(finalModuleReport, /Módulo 008.*concluído/i);
  assert.match(accessibility, /schedule/i);
  assert.match(theme, /schedule|agenda/i);
});

console.log(`\nOE-008.007: ${passed} aprovadas; ${failed} falharam.`);
if (failed > 0) {
  process.exit(1);
}

assert.equal(passed, 80);
console.log('✅ OE-008.007 — HOMOLOGAÇÃO AUTOMATIZADA FINAL APROVADA.');
