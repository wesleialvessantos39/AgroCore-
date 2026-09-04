import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('====================================================');
console.log(' AGROCORE — INVARIANTES DE FECHAMENTO DO MÓDULO 008');
console.log('====================================================\n');

const packageJson = JSON.parse(read('package.json'));
const moduleGate = read('scripts/test-module-008.js');
const finalHomologation = read('scripts/test-schedule-final-homologation.ts');
const internalNotifications = read('supabase/migrations/20260904151711_oe_008_005_internal_notification_center.sql');
const externalChannels = read('supabase/migrations/20260904172154_oe_008_006_external_channels_escalation.sql');
const externalHardening = read('supabase/migrations/20260904172859_oe_008_006_delivery_version_hardening.sql');
const finalHardening = read('supabase/migrations/20260904224802_oe_008_007_final_homologation_hardening.sql');
const finalCompletion = read('supabase/migrations/20260904230337_oe_008_007_final_homologation_completion.sql');
const livroRaiz = read('LIVRO_RAIZ_AGROCORE.md');
const finalReport = read('docs/MODULO-008-RELATORIO-FINAL.md');
const closingReport = read('docs/OE-008-007-RELATORIO-FECHAMENTO.md');
const operationalRunbook = read('docs/OE-008-007-ROTEIRO-HOMOLOGACAO-OPERACIONAL.md');

const finalMigrations = `${finalHardening}\n${finalCompletion}`;

assert(
  packageJson.scripts?.['test:schedule-final-homologation'] ===
    'node --import tsx scripts/test-schedule-final-homologation.ts',
  'A homologação final da OE-008.007 deve permanecer exposta no package.json.'
);
assert(
  moduleGate.includes("run('scripts/test-schedule-final-homologation.ts')") &&
    moduleGate.includes("run('scripts/test-schedule-accessibility.ts')") &&
    moduleGate.includes("run('scripts/test-schedule-theme.js')"),
  'O gate final deve executar homologação, acessibilidade e tema.'
);
assert(
  moduleGate.indexOf('test-schedule-final-homologation.ts') <
    moduleGate.indexOf('test-schedule-accessibility.ts') &&
    moduleGate.indexOf('test-schedule-accessibility.ts') <
    moduleGate.indexOf('test-schedule-theme.js'),
  'A ordem final do gate do Módulo 008 deve ser determinística.'
);
assert(
  moduleGate.includes('MÓDULO 008 — CONCLUÍDO — OE-008.001 A OE-008.007'),
  'O gate precisa declarar explicitamente o fechamento de OE-008.001 a OE-008.007.'
);
assert(
  finalHomologation.includes('assert.equal(checks, 80)') &&
    finalHomologation.includes('HOMOLOGAÇÃO AUTOMATIZADA FINAL APROVADA'),
  'A OE-008.007 deve manter 80 verificações finais com fechamento explícito.'
);
assert(
  internalNotifications.includes('create table if not exists public.notifications') &&
    !internalNotifications.includes('create table if not exists public.schedule_notifications'),
  'A Central interna deve manter public.notifications como fonte canônica única.'
);
assert(
  externalChannels.includes('notification_external_deliveries') &&
    externalChannels.includes('notification_external_attempts') &&
    externalHardening.includes('superseded_notification_version'),
  'Canais externos precisam manter fila, tentativas e supressão de versão obsoleta.'
);
assert(
  finalHardening.includes('check (expires_at >= available_at)') &&
    finalHardening.includes('expires_at = greatest(n.available_at, statement_timestamp())'),
  'O hardening final deve eliminar a janela residual de expiração.'
);
assert(
  finalHardening.includes('available_at <= statement_timestamp()') &&
    finalHardening.includes('expires_at > statement_timestamp()') &&
    finalHardening.includes('notification_category_enabled('),
  'A RLS final de notificações deve aplicar disponibilidade, expiração e preferência.'
);
assert(
  finalCompletion.includes('create or replace function public.agrocore_mark_notification_read') &&
    finalCompletion.includes('n.recipient_user_id = v_actor') &&
    finalCompletion.includes('n.available_at <= statement_timestamp()') &&
    finalCompletion.includes('n.expires_at > statement_timestamp()') &&
    finalCompletion.includes('notification_category_enabled('),
  'A leitura individual final deve respeitar recipient, validade e preferência.'
);
assert(
  !/create table[\s\S]*public\.schedule_items/i.test(finalMigrations) &&
    !/create table[\s\S]*public\.notifications/i.test(finalMigrations) &&
    !/create table[\s\S]*notification_external_deliveries/i.test(finalMigrations),
  'OE-008.007 não pode recriar fontes canônicas nem a fila externa.'
);
assert(
  livroRaiz.includes('OE-008.007 — Homologação final e encerramento do Módulo 008') &&
    livroRaiz.includes('Módulo 008 | **CONCLUÍDO — OE-008.001 a OE-008.007**') &&
    livroRaiz.includes('OE-009.001 — Cadastro de veículos'),
  'Livro-Raiz deve refletir o fechamento do Módulo 008 e a próxima fronteira correta.'
);
assert(
  finalReport.includes('**Módulo 008 — CONCLUÍDO de OE-008.001 a OE-008.007.**') &&
    finalReport.includes('**Total específico** | **432**'),
  'Relatório final deve consolidar conclusão e cobertura específica.'
);
assert(
  closingReport.includes('20260904224802 — oe_008_007_final_homologation_hardening') &&
    closingReport.includes('20260904230337 — oe_008_007_final_homologation_completion'),
  'Relatório de fechamento deve registrar os dois hardenings remotos finais.'
);
assert(
  closingReport.includes('0 organizações') &&
    closingReport.includes('não foi fabricada') &&
    operationalRunbook.includes('não criar dados fictícios') &&
    operationalRunbook.includes('dispositivo real'),
  'Fechamento deve preservar a regra de não fabricar evidência física.'
);
assert(
  !/sb_secret_[A-Za-z0-9_-]{12,}/.test(finalHomologation + finalReport + closingReport + operationalRunbook) &&
    !/sk-[A-Za-z0-9_-]{16,}/.test(finalHomologation + finalReport + closingReport + operationalRunbook),
  'Artefatos de fechamento não podem conter secrets literais.'
);

console.log('✅ Invariantes de fechamento do Módulo 008 aprovadas.');
console.log('✅ OE-008.001 a OE-008.007 permanecem fechadas sem fonte paralela ou evidência fabricada.');
