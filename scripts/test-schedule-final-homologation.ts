import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import { buildScheduleOccurrenceDrafts } from '../src/schedule/recurrence.ts';
import { scheduleLocalDateTimeToUtc } from '../src/schedule/time.ts';
import {
  ScheduleDomainError,
  type CorporateTask,
  type ScheduleRecurrenceDefinition,
} from '../src/types/schedule.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

function expectScheduleError(operation: () => unknown, code: string) {
  assert.throws(
    operation,
    (error: unknown) =>
      error instanceof ScheduleDomainError && error.code === code
  );
}

function rule(
  frequency: ScheduleRecurrenceDefinition['frequency'],
  interval = 1
): ScheduleRecurrenceDefinition {
  return { frequency, interval, weekdays: [], endsAt: null };
}

function recurringTask(
  dueAt: string,
  recurrence: ScheduleRecurrenceDefinition,
  timeZone = 'America/Sao_Paulo'
): CorporateTask {
  return {
    id: 'homologation-task',
    organizationId: 'org-homologation',
    kind: 'task',
    title: 'Homologação de recorrência',
    description: null,
    priority: 'high',
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

const migration = fs.readFileSync(
  'supabase/migrations/20260904224802_oe_008_007_final_homologation_hardening.sql',
  'utf8'
);
const notificationMigration = fs.readFileSync(
  'supabase/migrations/20260904151711_oe_008_005_internal_notification_center.sql',
  'utf8'
);
const externalMigration = fs.readFileSync(
  'supabase/migrations/20260904172154_oe_008_006_external_channels_escalation.sql',
  'utf8'
);
const deliveryHardening = fs.readFileSync(
  'supabase/migrations/20260904172859_oe_008_006_delivery_version_hardening.sql',
  'utf8'
);
const routes = fs.readFileSync('src/routes/paths.ts', 'utf8');
const appRoutes = fs.readFileSync('src/routes/AppRoutes.tsx', 'utf8');
const center = fs.readFileSync('src/notifications/NotificationCenter.tsx', 'utf8');
const settings = fs.readFileSync(
  'src/notifications/ExternalNotificationSettings.tsx',
  'utf8'
);
const externalGateway = fs.readFileSync(
  'src/notifications/externalNotificationGateway.ts',
  'utf8'
);
const pushWorker = fs.readFileSync('public/push-sw.js', 'utf8');
const moduleGate = fs.readFileSync('scripts/test-module-008.js', 'utf8');
const rootBook = fs.readFileSync('LIVRO_RAIZ_AGROCORE.md', 'utf8');
const orderReport = fs.readFileSync(
  'docs/OE-008-007-RELATORIO-FECHAMENTO.md',
  'utf8'
);
const moduleReport = fs.readFileSync(
  'docs/MODULO-008-RELATORIO-FECHAMENTO.md',
  'utf8'
);

console.log('====================================================');
console.log(' AGROCORE — OE-008.007 — HOMOLOGAÇÃO FINAL');
console.log('====================================================\n');

check(
  scheduleLocalDateTimeToUtc(
    '2026-09-10T12:00:00',
    'America/Sao_Paulo'
  ) === '2026-09-10T15:00:00.000Z',
  'America/Sao_Paulo deve preservar conversão determinística.'
);

check(
  scheduleLocalDateTimeToUtc(
    '2026-03-08T03:30:00',
    'America/New_York'
  ) === '2026-03-08T07:30:00.000Z',
  'Horário válido após mudança de DST deve ser convertido corretamente.'
);

expectScheduleError(
  () =>
    scheduleLocalDateTimeToUtc(
      '2026-03-08T02:30:00',
      'America/New_York'
    ),
  'INVALID_DATE'
);
checks += 1;

expectScheduleError(
  () =>
    scheduleLocalDateTimeToUtc(
      '2026-11-01T01:30:00',
      'America/New_York'
    ),
  'INVALID_DATE'
);
checks += 1;

expectScheduleError(
  () => scheduleLocalDateTimeToUtc('2026-09-10T12:00:00', 'Invalid/Zone'),
  'INVALID_TIME_ZONE'
);
checks += 1;

const monthly = buildScheduleOccurrenceDrafts(
  recurringTask('2026-01-31T15:00:00.000Z', rule('monthly')),
  {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-04-01T00:00:00.000Z',
  }
);
check(
  monthly.map((item) => item.scheduledAt.slice(0, 10)).join(',') ===
    '2026-01-31,2026-03-31',
  'Recorrência mensal não pode inventar dia inexistente.'
);

check(
  getRolePermissions('owner').includes('schedule:manage'),
  'Owner deve gerenciar Agenda.'
);
check(
  getRolePermissions('company_admin').includes('schedule:manage'),
  'Company admin deve gerenciar Agenda.'
);
check(
  getRolePermissions('manager').includes('schedule:manage'),
  'Manager deve gerenciar Agenda.'
);
check(
  getRolePermissions('project_designer').includes('schedule:view') &&
    !getRolePermissions('project_designer').includes('schedule:manage'),
  'Projetista deve visualizar Agenda sem herdar gestão.'
);
check(
  getRolePermissions('capturer').includes('schedule:view') &&
    !getRolePermissions('capturer').includes('schedule:manage'),
  'Captador deve visualizar Agenda sem herdar gestão.'
);
check(
  !getRolePermissions('finance').includes('schedule:view') &&
    !getRolePermissions('finance').includes('schedule:manage'),
  'Financeiro não deve herdar Agenda por padrão.'
);
check(
  !getRolePermissions('platform_super_admin').includes('schedule:view'),
  'Superadmin de plataforma não deve herdar dados privados da Agenda.'
);

check(
  !/create table if not exists public\.schedule_items\b/i.test(migration) &&
    !/create table if not exists public\.notifications\b/i.test(migration),
  'OE-008.007 não pode recriar fontes canônicas.'
);
check(
  /CHECK\s*\(\(expires_at >= available_at\)\)/i.test(migration) ||
    /expires_at >= available_at/i.test(migration),
  'A validade deve permitir expiração instantânea sem janela fantasma.'
);
check(
  /expires_at\s*=\s*greatest\(n\.available_at,\s*statement_timestamp\(\)\)/i.test(
    migration
  ),
  'Expiração deve ser efetiva imediatamente.'
);
check(
  !/available_at \+ interval '1 second'/i.test(migration),
  'Hardening final deve remover a janela residual de um segundo.'
);
check(
  /join public\.organization_memberships m/i.test(migration) &&
    /o\.status = 'active'/i.test(migration),
  'Acesso a notificações deve exigir organização ativa.'
);
check(
  /create policy "agrocore_notifications_select"[\s\S]*available_at <= statement_timestamp\(\)[\s\S]*expires_at > statement_timestamp\(\)/i.test(
    migration
  ),
  'RLS direta deve respeitar disponibilidade e expiração.'
);
check(
  /notification_category_enabled\(\s*organization_id,\s*recipient_user_id,\s*category\s*\)/i.test(
    migration
  ),
  'RLS direta deve respeitar preferência interna vigente.'
);
check(
  /recipient_user_id = \(select auth\.uid\(\)\)/i.test(migration),
  'RLS direta deve continuar recipient-only.'
);
check(
  /recipient_user_id = v_actor/i.test(notificationMigration) &&
    /n\.organization_id = p_organization_id/i.test(notificationMigration),
  'RPCs de notificação devem manter vínculo simultâneo usuário/organização.'
);
check(
  /n\.available_at <= statement_timestamp\(\)/i.test(notificationMigration) &&
    /n\.expires_at > statement_timestamp\(\)/i.test(notificationMigration),
  'Snapshot canônico deve manter a mesma regra temporal.'
);
check(
  /enabled boolean not null default false/i.test(externalMigration),
  'Canais externos devem permanecer opt-in.'
);
check(
  /notification_id uuid not null references public\.notifications\(id\)/i.test(
    externalMigration
  ),
  'Entrega externa deve continuar derivada de public.notifications.'
);
check(
  /d\.notification_version = n\.version/i.test(deliveryHardening) &&
    /superseded_notification_version/i.test(deliveryHardening),
  'Fila deve rejeitar versão obsoleta da notificação.'
);
check(
  /grant execute on function public\.agrocore_claim_notification_deliveries[\s\S]*to service_role/i.test(
    externalMigration
  ),
  'Claim do worker deve permanecer service-role only.'
);
check(
  /SCHEDULE:\s*'\/agenda'/i.test(routes),
  'Rota canônica da Agenda deve permanecer /agenda.'
);
check(
  /path=\{ROUTES\.SCHEDULE\}[\s\S]*RequirePermission permission="schedule:view"/i.test(
    appRoutes
  ),
  'Rota da Agenda deve permanecer protegida por schedule:view.'
);
check(
  /function safeRoute/.test(center) &&
    /route\.includes\('\:\/\/'\)/.test(center),
  'Central deve rejeitar rota externa.'
);
check(
  /function safeRoute/.test(pushWorker) &&
    /value\.includes\('\:\/\/'\)/.test(pushWorker),
  'Clique de Push deve rejeitar rota externa.'
);
check(
  !/localStorage|sessionStorage|indexedDB/i.test(
    center + settings + externalGateway
  ),
  'Notificações não podem criar persistência empresarial local.'
);
check(
  !/API key|secret key|chave secreta|token do provedor/i.test(settings),
  'UI não pode solicitar segredos de provedor.'
);
check(
  /useId\(\)/.test(center) &&
    /aria-controls=\{panelId\}/.test(center) &&
    /id=\{panelId\}/.test(center),
  'Central deve manter IDs ARIA únicos.'
);
check(
  /can\('schedule:manage'\)/.test(settings),
  'Políticas de escalonamento devem respeitar gestão da Agenda.'
);
check(
  /test-schedule-final-homologation\.ts/.test(moduleGate),
  'Gate do módulo deve executar a homologação final.'
);
check(
  /MÓDULO 008 — CONCLUÍDO/i.test(moduleGate),
  'Gate final deve declarar o módulo concluído somente após todas as suítes.'
);
check(
  [
    'test-schedule-foundation.ts',
    'test-schedule-views.ts',
    'test-schedule-collaboration.ts',
    'test-schedule-reconciliation.ts',
    'test-schedule-recurrence.ts',
    'test-schedule-recurrence-hardening.ts',
    'test-schedule-notifications.ts',
    'test-schedule-external-notifications.ts',
    'test-schedule-accessibility.ts',
    'test-schedule-theme.js',
  ].every((name) => moduleGate.includes(name)),
  'Gate final não pode remover nenhuma suíte anterior do Módulo 008.'
);
check(
  /OE-008\.007 — Homologação final/i.test(orderReport) &&
    /20260904224802/i.test(orderReport),
  'Relatório da ordem deve registrar a migration remota final.'
);
check(
  /Módulo 008 — Agenda Corporativa, Tarefas, Prazos e Notificações/i.test(
    moduleReport
  ) &&
    /CONCLUÍDO/i.test(moduleReport),
  'Relatório do módulo deve registrar fechamento integral.'
);
check(
  /Estado técnico consolidado até:\*\* OE-008\.007/i.test(rootBook) &&
    /MÓDULO 008[\s\S]*CONCLUÍDO/i.test(rootBook),
  'Livro-Raiz deve avançar para OE-008.007 e fechar o módulo.'
);
check(
  /Nenhum dado fictício/i.test(orderReport) &&
    /organizations=0|organizações.*0/i.test(orderReport),
  'Homologação não pode fabricar dados empresariais.'
);
check(
  /não foi simulada|não foi inventada|não inventada/i.test(orderReport) &&
    /e-mail|Push/i.test(orderReport),
  'Prova física externa ausente deve ser declarada, nunca simulada.'
);

console.log(
  `✅ OE-008.007 — ${checks} verificações finais de contrato, segurança, RBAC, fuso, recorrência e governança aprovadas.`
);
