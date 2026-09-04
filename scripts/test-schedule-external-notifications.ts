import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260904172154_oe_008_006_external_channels_escalation.sql',
  'utf8'
);
const hardening = readFileSync(
  'supabase/migrations/20260904172859_oe_008_006_delivery_version_hardening.sql',
  'utf8'
);
const worker = readFileSync(
  'supabase/functions/notification-delivery-worker/index.ts',
  'utf8'
);
const configFunction = readFileSync(
  'supabase/functions/notification-channel-config/index.ts',
  'utf8'
);
const gateway = readFileSync(
  'src/notifications/externalNotificationGateway.ts',
  'utf8'
);
const push = readFileSync('src/notifications/pushSubscription.ts', 'utf8');
const pushWorker = readFileSync('public/push-sw.js', 'utf8');
const settings = readFileSync(
  'src/notifications/ExternalNotificationSettings.tsx',
  'utf8'
);
const center = readFileSync(
  'src/notifications/NotificationCenter.tsx',
  'utf8'
);
const moduleGate = readFileSync('scripts/test-module-008.js', 'utf8');

let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

check(
  !/create table if not exists public\.notifications\b/i.test(migration),
  'OE-008.006 não pode recriar a fonte canônica notifications.'
);
check(
  !/create table if not exists public\.schedule_items\b/i.test(migration),
  'OE-008.006 não pode recriar a fonte canônica da Agenda.'
);
check(
  /notification_id uuid not null references public\.notifications\(id\)/i.test(migration),
  'A fila externa deve derivar da notificação interna canônica.'
);
check(
  /notification_external_preferences/i.test(migration) &&
    /enabled boolean not null default false/i.test(migration),
  'Canais externos devem ser opt-in e falhar fechados por padrão.'
);
check(
  /notification_escalation_policies/i.test(migration) &&
    /email_enabled boolean not null default false/i.test(migration) &&
    /push_enabled boolean not null default false/i.test(migration),
  'Políticas empresariais não podem ativar canais implicitamente.'
);
check(
  /notification_push_subscriptions/.test(migration) &&
    /revoke all on agrocore_private\.notification_push_subscriptions/i.test(migration),
  'Assinaturas Push precisam ficar em schema privado.'
);
check(
  /notification_external_deliveries/.test(migration) &&
    /notification_external_attempts/.test(migration),
  'Fila e tentativas externas devem possuir persistência transacional.'
);
check(
  /notification_external_audit/.test(migration),
  'A entrega externa precisa de auditoria sanitizada.'
);
check(
  /notification_external_command_receipts/.test(migration) &&
    /result_snapshot jsonb not null/i.test(migration),
  'Configurações concorrentes devem ter replay idempotente imutável.'
);
check(
  /AGROCORE_EXTERNAL_NOTIFICATION_CONCURRENCY_CONFLICT/.test(migration) &&
    /AGROCORE_EXTERNAL_NOTIFICATION_IDEMPOTENCY_CONFLICT/.test(migration),
  'Conflitos de versão e idempotência devem ser explícitos.'
);
check(
  /notification_external_delivery_email_uq/.test(migration) &&
    /notification_external_delivery_push_uq/.test(migration),
  'Uma notificação/versão não pode duplicar a mesma entrega por canal/alvo.'
);
check(
  /minimum_priority/.test(migration) &&
    /critical_priority/.test(migration) &&
    /delay_minutes/.test(migration) &&
    /critical_delay_minutes/.test(migration),
  'Escalonamento deve considerar atraso e criticidade.'
);
check(
  /max_attempts integer not null/i.test(migration),
  'A fila precisa limitar tentativas.'
);
check(
  /for update of d skip locked/i.test(migration),
  'Workers concorrentes devem usar SKIP LOCKED.'
);
check(
  /lease_token uuid/i.test(migration) && /lease_expires_at/i.test(migration),
  'Claim de entrega precisa de lease explícita.'
);
check(
  /when 1 then 60[\s\S]*when 2 then 300[\s\S]*when 3 then 900/i.test(migration),
  'Retries devem usar backoff determinístico.'
);
check(
  /provider_unconfigured/.test(migration) && /status='blocked'|status = 'blocked'/.test(migration),
  'Provedor ausente deve bloquear a entrega, nunca simular sucesso.'
);
check(
  /recipient_unavailable/.test(migration) && /status='suppressed'|status = 'suppressed'/.test(migration),
  'Destinatário indisponível deve suprimir sem inventar entrega.'
);
check(
  /channel_disabled/.test(migration) && /policy_disabled/.test(migration),
  'Fila pendente deve respeitar preferências e políticas atuais.'
);
check(
  /create extension if not exists pg_cron/i.test(migration) &&
    /create extension if not exists pg_net/i.test(migration),
  'Despacho assíncrono deve usar scheduler/HTTP fora do núcleo da tarefa.'
);
check(
  /cron\.schedule\([\s\S]*agrocore-notification-delivery-worker/i.test(migration),
  'Worker deve ser acionado em fila independente.'
);
check(
  /gen_random_bytes\(32\)/.test(migration) &&
    /token_hash/.test(migration) &&
    !/x-agrocore-worker-token'\s*,\s*'[0-9a-f]{64}'/i.test(migration),
  'Token do worker deve ser gerado em runtime e não versionado literalmente.'
);
check(
  /grant execute on function public\.agrocore_claim_notification_deliveries[\s\S]*to service_role/i.test(migration) &&
    /revoke all on function public\.agrocore_claim_notification_deliveries[\s\S]*from public, anon, authenticated/i.test(migration),
  'Claim da fila deve ser service-role only.'
);
check(
  /grant execute on function public\.agrocore_complete_notification_delivery[\s\S]*to service_role/i.test(migration),
  'Conclusão da entrega deve ser service-role only.'
);
check(
  /alter table public\.notification_external_preferences enable row level security/i.test(migration) &&
    /alter table public\.notification_escalation_policies enable row level security/i.test(migration),
  'Preferências e políticas públicas precisam de RLS.'
);
check(
  /user_id = \(select auth\.uid\(\)\)/i.test(migration),
  'Usuário só pode ler as próprias preferências externas.'
);
check(
  /can_manage_schedule\(organization_id\)/i.test(migration),
  'Políticas de escalonamento devem ser visíveis apenas à gestão autorizada.'
);
check(
  /superseded_notification_version/.test(hardening) &&
    /d\.notification_version = n\.version/.test(hardening),
  'Versões antigas da mesma notificação devem ser suprimidas antes do claim.'
);
check(
  /notification_version <> v_notification\.version/.test(hardening),
  'Reativação deve invalidar fila pendente da versão anterior.'
);
check(
  /RESEND_API_KEY/.test(worker) && /api\.resend\.com\/emails/.test(worker),
  'E-mail deve possuir adaptador real de provedor no backend.'
);
check(
  /Idempotency-Key/.test(worker) && /agrocore-notification-\$\{row\.delivery_id\}/.test(worker),
  'Envio de e-mail deve reutilizar identidade estável no provedor.'
);
check(
  /auth\/v1\/admin\/users/.test(worker) && !/recipient_email/.test(migration),
  'E-mail canônico deve ser resolvido somente no worker, sem duplicá-lo na fila.'
);
check(
  /webpush\.sendNotification/.test(worker) && /setVapidDetails/.test(worker),
  'Push deve usar Web Push/VAPID real no backend.'
);
check(
  /push_subscription_gone/.test(worker) && /revokePush: true/.test(worker),
  'Assinatura Push expirada deve ser revogada.'
);
check(
  /response\.status === 429 \|\| response\.status >= 500/.test(worker),
  'Falhas transitórias de e-mail precisam ser diferenciadas.'
);
check(
  /status === 429 \|\| status >= 500/.test(worker),
  'Falhas transitórias de Push precisam ser diferenciadas.'
);
check(
  /notification-channel-config/.test(gateway) &&
    /vapidPublicKey/.test(configFunction) &&
    /AGROCORE_WEB_PUSH_VAPID_PRIVATE_KEY/.test(configFunction),
  'Cliente deve receber somente capacidade e chave VAPID pública via backend.'
);
check(
  !/vapidPrivateKey|privateKey:/.test(configFunction),
  'Edge de configuração não pode retornar chave VAPID privada.'
);
check(
  /Notification\.requestPermission\(\)/.test(push),
  'Permissão Push deve ser solicitada apenas no fluxo explícito de ativação.'
);
check(
  /scope: '\/push-notifications\/'/.test(push),
  'Push deve usar Service Worker dedicado sem substituir o SW principal.'
);
check(
  /tag: `agrocore-notification-\$\{notificationId\}`/.test(pushWorker) &&
    /renotify: false/.test(pushWorker),
  'Push deve convergir visualmente por notificationId.'
);
check(
  /function safeRoute/.test(pushWorker) && /value\.includes\('\:\/\/'\)/.test(pushWorker),
  'Clique Push deve aceitar somente rota interna segura.'
);
check(
  !/localStorage|sessionStorage|indexedDB/i.test(gateway + push + settings),
  'Canais externos não podem criar persistência empresarial no navegador.'
);
check(
  /can\('schedule:manage'\)/.test(settings),
  'Configuração de escalonamento deve respeitar schedule:manage no frontend.'
);
check(
  /EXTERNAL_DELIVERY_STATUS_LABELS/.test(settings) && /Entregas recentes/.test(settings),
  'Usuário deve visualizar status real das próprias entregas.'
);
check(
  /Provedor não configurado/.test(settings) && /Canal não configurado/.test(settings),
  'UI deve informar indisponibilidade sem pedir secrets.'
);
check(
  !/API key|secret key|chave secreta|token do provedor/i.test(settings),
  'UI não pode solicitar credenciais de provedor.'
);
check(
  /useId\(\)/.test(center) && /aria-controls=\{panelId\}/.test(center) && /id=\{panelId\}/.test(center),
  'Desktop e mobile não podem gerar IDs ARIA duplicados na Central.'
);
check(
  /ExternalNotificationSettings/.test(center),
  'Canais externos devem integrar a Central existente, sem segunda Central.'
);
check(
  /test-schedule-external-notifications\.ts/.test(moduleGate) && /OE-008\.006/.test(moduleGate),
  'Gate do Módulo 008 deve incluir OE-008.006.'
);
check(
  !/twilio|sms:|smtp:\/\//i.test(worker + migration + settings),
  'OE-008.006 implementa somente e-mail e Push previstos, sem canal fictício adicional.'
);

console.log(`✅ OE-008.006 — ${checks} verificações estruturais e de contrato aprovadas.`);
