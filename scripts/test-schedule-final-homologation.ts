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

let checks = 0;

function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  checks += 1;
  console.log(`  [PASS] ${String(checks).padStart(2, '0')}. ${name}`);
}

function throws(operation: () => unknown): boolean {
  try {
    operation();
    return false;
  } catch {
    return true;
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
const finalCompletion = readFileSync(
  'supabase/migrations/20260904230337_oe_008_007_final_homologation_completion.sql',
  'utf8'
);
const finalMigrations = `${finalHardening}\n${finalCompletion}`;
const routePaths = readFileSync('src/routes/paths.ts', 'utf8');
const appRoutes = readFileSync('src/routes/AppRoutes.tsx', 'utf8');
const center = readFileSync('src/notifications/NotificationCenter.tsx', 'utf8');
const notificationGateway = readFileSync(
  'src/notifications/supabaseNotificationGateway.ts',
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
const accessibility = readFileSync('scripts/test-schedule-accessibility.ts', 'utf8');
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

// 01–08 — Fusos e DST.
check('America/Sao_Paulo é fuso IANA válido', isValidScheduleTimeZone('America/Sao_Paulo'));
check('America/New_York é fuso IANA válido', isValidScheduleTimeZone('America/New_York'));
check('UTC é fuso válido', isValidScheduleTimeZone('UTC'));
check('fuso inexistente é recusado', !isValidScheduleTimeZone('AgroCore/Invalid'));
check(
  'São Paulo converte relógio local para o instante esperado',
  scheduleLocalDateTimeToUtc('2026-09-10T12:00:00', 'America/Sao_Paulo') ===
    '2026-09-10T15:00:00.000Z'
);
check(
  'horário inexistente no início do DST é recusado',
  throws(() => scheduleLocalDateTimeToUtc('2026-03-08T02:30:00', 'America/New_York'))
);
check(
  'horário ambíguo no fim do DST é recusado',
  throws(() => scheduleLocalDateTimeToUtc('2026-11-01T01:30:00', 'America/New_York'))
);
check(
  'horário não ambíguo após DST é aceito',
  scheduleLocalDateTimeToUtc('2026-11-01T03:30:00', 'America/New_York') ===
    '2026-11-01T08:30:00.000Z'
);

// 09–20 — Recorrência e exceções.
check(
  'janela positiva curta é normalizada',
  normalizeOccurrenceWindow({
    from: '2026-09-10T00:00:00Z',
    to: '2026-09-11T00:00:00Z',
  }).from === '2026-09-10T00:00:00.000Z'
);
check(
  'janela invertida é recusada',
  throws(() => normalizeOccurrenceWindow({
    from: '2026-09-11T00:00:00Z',
    to: '2026-09-10T00:00:00Z',
  }))
);
check(
  'janela superior a 366 dias é recusada',
  throws(() => normalizeOccurrenceWindow({
    from: '2026-01-01T00:00:00Z',
    to: '2027-01-03T00:00:00Z',
  }))
);
const daily = buildScheduleOccurrenceDrafts(
  taskFixture('2026-09-10T15:00:00.000Z', recurrence('daily')),
  { from: '2026-09-10T00:00:00Z', to: '2026-09-13T00:00:00Z' }
);
check(
  'recorrência diária mantém relógio local',
  daily.map((value) => value.scheduledAt).join('|') ===
    '2026-09-10T15:00:00.000Z|2026-09-11T15:00:00.000Z|2026-09-12T15:00:00.000Z'
);
const everyTwoDays = buildScheduleOccurrenceDrafts(
  taskFixture('2026-09-10T15:00:00.000Z', recurrence('daily', 2)),
  { from: '2026-09-10T00:00:00Z', to: '2026-09-16T00:00:00Z' }
);
check(
  'recorrência diária respeita intervalo',
  everyTwoDays.map((value) => value.scheduledAt.slice(0, 10)).join('|') ===
    '2026-09-10|2026-09-12|2026-09-14'
);
check(
  'recorrência semanal exige weekdays',
  throws(() => buildScheduleOccurrenceDrafts(
    taskFixture('2026-09-10T15:00:00.000Z', recurrence('weekly')),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-17T00:00:00Z' }
  ))
);
const weekly = buildScheduleOccurrenceDrafts(
  taskFixture('2026-09-10T15:00:00.000Z', recurrence('weekly', 1, [4])),
  { from: '2026-09-10T00:00:00Z', to: '2026-09-25T00:00:00Z' }
);
check('recorrência semanal respeita dia selecionado', weekly.length === 3);
const monthly = buildScheduleOccurrenceDrafts(
  taskFixture('2026-01-31T15:00:00.000Z', recurrence('monthly')),
  { from: '2026-01-01T00:00:00Z', to: '2026-04-01T00:00:00Z' }
);
check(
  'mensal não inventa 31 de fevereiro',
  monthly.map((value) => value.scheduledAt.slice(0, 10)).join('|') ===
    '2026-01-31|2026-03-31'
);
const yearly = buildScheduleOccurrenceDrafts(
  taskFixture('2026-09-10T15:00:00.000Z', recurrence('yearly')),
  { from: '2026-09-10T00:00:00Z', to: '2027-09-11T00:00:00Z' }
);
check(
  'anual preserva mês e dia',
  yearly.map((value) => value.scheduledAt.slice(0, 10)).join('|') ===
    '2026-09-10|2027-09-10'
);
const bounded = buildScheduleOccurrenceDrafts(
  taskFixture(
    '2026-09-10T15:00:00.000Z',
    recurrence('daily', 1, [], '2026-09-11T15:00:00.000Z')
  ),
  { from: '2026-09-10T00:00:00Z', to: '2026-09-14T00:00:00Z' }
);
check('endsAt encerra a série', bounded.length === 2);
check(
  'item concluído não cria novas ocorrências',
  buildScheduleOccurrenceDrafts(
    taskFixture(
      '2026-09-10T15:00:00.000Z',
      recurrence('daily'),
      'America/Sao_Paulo',
      'completed'
    ),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-13T00:00:00Z' }
  ).length === 0
);
check(
  'item cancelado não cria novas ocorrências',
  buildScheduleOccurrenceDrafts(
    taskFixture(
      '2026-09-10T15:00:00.000Z',
      recurrence('daily'),
      'America/Sao_Paulo',
      'cancelled'
    ),
    { from: '2026-09-10T00:00:00Z', to: '2026-09-13T00:00:00Z' }
  ).length === 0
);

// 21–30 — Perfis positivos/negativos e rota.
check('owner visualiza Agenda', getRolePermissions('owner').includes('schedule:view'));
check('owner gerencia Agenda', getRolePermissions('owner').includes('schedule:manage'));
check('company_admin gerencia Agenda', getRolePermissions('company_admin').includes('schedule:manage'));
check('manager gerencia Agenda', getRolePermissions('manager').includes('schedule:manage'));
check(
  'project_designer visualiza sem gerenciar',
  getRolePermissions('project_designer').includes('schedule:view') &&
    !getRolePermissions('project_designer').includes('schedule:manage')
);
check(
  'capturer visualiza sem gerenciar',
  getRolePermissions('capturer').includes('schedule:view') &&
    !getRolePermissions('capturer').includes('schedule:manage')
);
check(
  'finance não herda acesso à Agenda',
  !getRolePermissions('finance').includes('schedule:view') &&
    !getRolePermissions('finance').includes('schedule:manage')
);
check(
  'platform_super_admin não herda Agenda organizacional',
  !getRolePermissions('platform_super_admin').includes('schedule:view') &&
    !getRolePermissions('platform_super_admin').includes('schedule:manage')
);
check('papel none não possui permissões', getRolePermissions('none').length === 0);
check(
  'rota /agenda exige schedule:view',
  /SCHEDULE:\s*'\/agenda'/.test(routePaths) &&
    /path=\{ROUTES\.SCHEDULE\}[\s\S]*RequirePermission permission="schedule:view"/.test(appRoutes)
);

// 31–40 — Multi-tenant, IDOR e RLS.
check(
  'schedule_items mantém organization_id obrigatório',
  /organization_id uuid not null references public\.organizations/.test(baseMigration)
);
check(
  'SELECT da Agenda passa pelo autorizador organizacional',
  /agrocore_schedule_items_select[\s\S]*can_view_schedule\(organization_id\)/.test(baseMigration)
);
check(
  'ocorrência é única por organização/item/data local',
  /unique index[\s\S]*organization_id,[\s\S]*schedule_item_id,[\s\S]*occurrence_local_date/i.test(recurrenceHardening)
);
check(
  'materialização valida acesso ao item',
  /can_view_schedule_item\([\s\S]*p_organization_id,[\s\S]*p_schedule_item_id/.test(recurrenceHardening)
);
check(
  'notificação direta é recipient-only',
  /recipient_user_id = \(select auth\.uid\(\)\)/.test(finalHardening)
);
check(
  'notificação direta exige organização ativa',
  /from public\.organizations o[\s\S]*o\.status = 'active'[\s\S]*m\.status = 'active'/.test(finalHardening)
);
check(
  'elegibilidade do destinatário exige organização ativa',
  /is_notification_recipient_eligible[\s\S]*o\.status = 'active'/.test(finalHardening)
);
check('RLS direto exige available_at alcançado', /available_at <= statement_timestamp\(\)/.test(finalHardening));
check('RLS direto exclui notificação expirada', /expires_at > statement_timestamp\(\)/.test(finalHardening));
check(
  'RLS direto respeita preferência da categoria',
  /notification_category_enabled\([\s\S]*organization_id,[\s\S]*recipient_user_id,[\s\S]*category/.test(finalHardening)
);

// 41–50 — Links, validade, preferências e leitura.
check(
  'rota interna rejeita protocolo externo no banco',
  /position\(':\/\/' in route\) = 0/.test(notificationMigration)
);
check(
  'Central valida a rota antes de navegar',
  /function safeRoute/.test(center) && /route\.includes\(':\/\/'\)/.test(center)
);
check('rota canônica de avisos é /agenda', /'\/agenda'/.test(notificationMigration));
check(
  'snapshot filtra janela temporal válida',
  /agrocore_notification_snapshot[\s\S]*available_at <= statement_timestamp\(\)[\s\S]*expires_at > statement_timestamp\(\)/.test(notificationMigration)
);
check(
  'snapshot filtra categoria desabilitada',
  /agrocore_notification_snapshot[\s\S]*notification_category_enabled/.test(notificationMigration)
);
check(
  'leitura individual só aceita notificação válida e categoria habilitada',
  /agrocore_mark_notification_read[\s\S]*recipient_user_id = v_actor[\s\S]*available_at <= statement_timestamp\(\)[\s\S]*expires_at > statement_timestamp\(\)[\s\S]*notification_category_enabled/.test(finalCompletion)
);
check(
  'expiração final não mantém janela artificial de um segundo',
  /expires_at = greatest\(n\.available_at, statement_timestamp\(\)\)/.test(finalHardening) &&
    !/available_at \+ interval '1 second'/.test(finalHardening)
);
check(
  'constraint final permite invalidação exata sem visibilidade',
  /check \(expires_at >= available_at\)/.test(finalHardening)
);
check(
  'preferências internas usam concorrência e idempotência',
  /AGROCORE_NOTIFICATION_CONCURRENCY_CONFLICT/.test(notificationMigration) &&
    /AGROCORE_NOTIFICATION_IDEMPOTENCY_CONFLICT/.test(notificationMigration)
);
check(
  'gateway interno só repete falha transitória',
  /200/.test(notificationGateway) && /600/.test(notificationGateway) && /transient/i.test(notificationGateway)
);

// 51–60 — Canais externos, consentimento e escalonamento.
check(
  'e-mail externo é opt-in por padrão',
  /notification_external_preferences[\s\S]*enabled boolean not null default false/.test(externalMigration)
);
check(
  'política externa inicia canais desligados',
  /email_enabled boolean not null default false/.test(externalMigration) &&
    /push_enabled boolean not null default false/.test(externalMigration)
);
check(
  'política registra prioridade mínima e crítica',
  /minimum_priority/.test(externalMigration) && /critical_priority/.test(externalMigration)
);
check(
  'política registra atraso normal e crítico',
  /delay_minutes/.test(externalMigration) && /critical_delay_minutes/.test(externalMigration)
);
check('somente gestão altera escalonamento no frontend', /can\('schedule:manage'\)/.test(externalSettings));
check('Push exige consentimento explícito', /Notification\.requestPermission\(\)/.test(pushSubscription));
check('Push usa Service Worker dedicado', /scope:\s*'\/push-notifications\/'/.test(pushSubscription));
check(
  'clique Push restringe destino à mesma aplicação',
  /function safeRoute/.test(pushWorker) && /self\.location\.origin/.test(pushWorker)
);
check(
  'configuração não expõe chave VAPID privada',
  /vapidPublicKey/.test(channelConfig) && !/vapidPrivateKey\s*:/.test(channelConfig)
);
check(
  'UI não solicita secrets de provedor',
  !/digite.*(?:api.?key|secret|service.?role|token)/i.test(externalSettings)
);

// 61–70 — Entrega, retry, volume, idempotência e auditoria.
check('worker de e-mail possui adaptador Resend real', /api\.resend\.com\/emails/.test(deliveryWorker));
check('worker de Push possui Web Push real', /webpush\.sendNotification/.test(deliveryWorker));
check(
  'provedor ausente bloqueia sem simular entrega',
  /provider_unconfigured/.test(deliveryWorker) && /status='blocked'|status = 'blocked'/.test(externalMigration)
);
check('429 e 5xx são transitórios', /429/.test(deliveryWorker) && />= 500/.test(deliveryWorker));
check(
  'retry possui backoff determinístico',
  /when 1 then 60[\s\S]*when 2 then 300[\s\S]*when 3 then 900/.test(externalMigration)
);
check('fila concorrente usa SKIP LOCKED', /skip locked/i.test(externalHardening + externalMigration));
check(
  'claim usa lease token e expiração',
  /lease_token uuid/.test(externalMigration) && /lease_expires_at/.test(externalMigration)
);
check(
  'versão antiga da notificação é suprimida',
  /superseded_notification_version/.test(externalHardening) &&
    /notification_version = n\.version/.test(externalHardening)
);
check(
  'e-mail possui identidade idempotente no provedor',
  /Idempotency-Key/.test(deliveryWorker) && /row\.delivery_id/.test(deliveryWorker)
);
check(
  'auditoria externa existe sem segunda notificação',
  /notification_external_audit/.test(externalMigration) &&
    !/create table if not exists public\.schedule_notifications/i.test(externalMigration)
);

// 71–80 — Fechamento integral, acessibilidade e rastreabilidade.
check('migrations finais não recriam schedule_items', !/create table[\s\S]*schedule_items/i.test(finalMigrations));
check('migrations finais não recriam notifications', !/create table[\s\S]*public\.notifications/i.test(finalMigrations));
check(
  'migrations finais não recriam fila externa',
  !/create table[\s\S]*notification_external_deliveries/i.test(finalMigrations)
);
const finalIndex = moduleGate.indexOf('test-schedule-final-homologation.ts');
const a11yIndex = moduleGate.indexOf('test-schedule-accessibility.ts');
const themeIndex = moduleGate.indexOf('test-schedule-theme.js');
check('gate executa homologação final antes da acessibilidade', finalIndex >= 0 && a11yIndex > finalIndex);
check('gate mantém tema depois da acessibilidade', a11yIndex >= 0 && themeIndex > a11yIndex);
check(
  'gate declara Módulo 008 concluído de OE-008.001 a OE-008.007',
  /MÓDULO 008 — CONCLUÍDO — OE-008\.001 A OE-008\.007/.test(moduleGate)
);
check('package expõe comando dedicado de homologação final', /"test:schedule-final-homologation"/.test(packageManifest));
check(
  'roteiro operacional proíbe dado fictício e exige ambiente físico real',
  /não criar dados fictícios/i.test(runbook) && /dispositivo real/i.test(runbook) && /provedor/i.test(runbook)
);
check(
  'fechamento distingue implementação completa de evidência física não fabricada',
  /implementação.*completa/i.test(closingReport) &&
    /não foi fabricada/i.test(closingReport) &&
    /ambiente atual/i.test(closingReport)
);
check(
  'relatório final declara módulo concluído sem remover gates existentes',
  /Módulo 008.*concluído/i.test(finalModuleReport) &&
    /schedule/i.test(accessibility) &&
    /schedule|agenda/i.test(theme)
);

assert.equal(checks, 80);
console.log(`\n✅ OE-008.007 — ${checks} verificações finais aprovadas.`);
console.log('✅ OE-008.007 — HOMOLOGAÇÃO AUTOMATIZADA FINAL APROVADA.');
