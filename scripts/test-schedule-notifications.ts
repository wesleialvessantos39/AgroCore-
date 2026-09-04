import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260904151711_oe_008_005_internal_notification_center.sql',
  'utf8'
);
const gateway = readFileSync(
  'src/notifications/supabaseNotificationGateway.ts',
  'utf8'
);
const context = readFileSync(
  'src/notifications/NotificationContext.tsx',
  'utf8'
);
const center = readFileSync(
  'src/notifications/NotificationCenter.tsx',
  'utf8'
);
const app = readFileSync('src/App.tsx', 'utf8');
const topbar = readFileSync(
  'src/components/layout/Topbar.tsx',
  'utf8'
);
const mobileTopbar = readFileSync(
  'src/components/layout/MobileTopbar.tsx',
  'utf8'
);

let checks = 0;

function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

check(
  /create table if not exists public\.notifications\b/i.test(migration),
  'OE-008.005 deve possuir uma única tabela canônica genérica de notificações.'
);
check(
  /create table if not exists public\.notification_preferences\b/i.test(
    migration
  ),
  'Preferências reais devem ser persistidas.'
);
check(
  /create table if not exists public\.notification_audit\b/i.test(migration),
  'A central deve manter auditoria sanitizada.'
);
check(
  !/create table if not exists public\.schedule_notifications\b/i.test(
    migration
  ),
  'Não deve existir fonte paralela schedule_notifications.'
);
check(
  !/create table if not exists public\.schedule_items\b/i.test(migration),
  'OE-008.005 não pode recriar a fonte canônica schedule_items.'
);
check(
  /recipient_user_id = \(select auth\.uid\(\)\)/i.test(migration),
  'RLS deve restringir notificações ao destinatário autenticado.'
);
check(
  /alter table public\.notifications enable row level security/i.test(
    migration
  ),
  'RLS deve estar ativa em notifications.'
);
check(
  /alter table public\.notification_preferences enable row level security/i.test(
    migration
  ),
  'RLS deve estar ativa nas preferências.'
);
check(
  /notifications_event_uq unique/i.test(migration),
  'Eventos internos precisam de identidade idempotente.'
);
check(
  /notification_command_receipts/i.test(migration) &&
    /result_snapshot jsonb/i.test(migration) &&
    /jsonb_populate_record/i.test(migration),
  'Preferências concorrentes devem possuir replay idempotente imutável.'
);
check(
  /AGROCORE_NOTIFICATION_CONCURRENCY_CONFLICT/.test(migration),
  'Conflitos de versão de preferências devem ser explícitos.'
);
check(
  /available_at <= statement_timestamp\(\)/i.test(migration) &&
    /expires_at > statement_timestamp\(\)/i.test(migration),
  'Validade deve ser aplicada na leitura e no contador.'
);
check(
  /select count\(\*\)[\s\S]*read_at is null/i.test(migration),
  'O contador não lido deve ser calculado no banco real.'
);
check(
  /agrocore_sync_internal_notifications/i.test(migration),
  'A central deve reconciliar avisos com a agenda canônica.'
);
check(
  /agrocore_materialize_schedule_occurrences/i.test(migration),
  'Recorrências devem reutilizar as ocorrências da OE-008.004.'
);
check(
  /technical_visit_integration_events/.test(migration) === false,
  'OE-008.005 não deve duplicar a fonte de eventos do Módulo 007.'
);
check(
  /alter publication supabase_realtime add table public\.notifications/i.test(
    migration
  ),
  'Contadores precisam receber mudanças por Supabase Realtime/WebSocket.'
);
check(
  /postgres_changes/.test(gateway) &&
    /\.channel\(`agrocore-notifications:/.test(gateway),
  'Gateway deve assinar mudanças reais via WebSocket.'
);
check(
  /agrocore_notification_snapshot/.test(gateway) &&
    /agrocore_get_notification_preferences/.test(gateway),
  'Gateway deve usar RPCs reais para contadores e preferências.'
);
check(
  /executeWithRetry/.test(gateway) && /\[0, 200, 600\]/.test(gateway),
  'Operações de rede devem possuir retry apenas para falhas transitórias.'
);
check(
  !/localStorage|indexedDB|sessionStorage/.test(gateway + context),
  'Notificações empresariais não podem ser persistidas em storage local.'
);
check(
  /setInterval\([\s\S]*60_000/.test(context),
  'O relógio de validade deve atualizar avisos que se tornam disponíveis sem novo evento.'
);
check(
  /visibilitychange/.test(context),
  'Retorno à aba deve reconciliar o contador real.'
);
check(
  /can\('schedule:view'\)/.test(context),
  'A central deve respeitar RBAC da Agenda no frontend.'
);
check(
  /NotificationProvider/.test(app),
  'Provider global deve ser montado dentro do contexto autenticado/organizacional.'
);
check(
  /aria-live="polite"/.test(center) &&
    /aria-expanded=\{open\}/.test(center) &&
    /role="dialog"/.test(center),
  'Central deve expor estado acessível para leitores de tela e teclado.'
);
check(
  /min-h-\[44px\]/.test(center) || /h-11 w-11/.test(center),
  'Controles principais devem respeitar alvo de toque móvel.'
);
check(
  /NOTIFICATION_CATEGORY_LABELS/.test(center) &&
    /type="checkbox"/.test(center),
  'Preferências internas devem ser editáveis na própria central.'
);
check(
  /Marcar todas/.test(center) &&
    /Marcar como lida/.test(center),
  'Leitura individual e em lote devem estar disponíveis.'
);
check(
  /NotificationCenter variant="light"/.test(topbar),
  'Central deve aparecer no cabeçalho desktop.'
);
check(
  /NotificationCenter variant="dark"/.test(mobileTopbar),
  'Central deve aparecer no cabeçalho móvel.'
);
check(
  !/\bfetch\(|axios|sendgrid|twilio|mailto:|sms:/i.test(
    migration + gateway + context + center
  ),
  'OE-008.005 não pode antecipar canais externos da OE-008.006.'
);

console.log(
  `✅ OE-008.005 — ${checks} verificações estruturais e de contrato aprovadas.`
);
