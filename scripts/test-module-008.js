import { spawnSync } from 'node:child_process';

function run(script) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', script],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error('Falha em ' + script);
  }
}

console.log('====================================================');
console.log(' AGROCORE — HOMOLOGAÇÃO DO MÓDULO 008');
console.log('====================================================\n');

try {
  run('scripts/test-schedule-foundation.ts');
  run('scripts/test-schedule-views.ts');
  run('scripts/test-schedule-collaboration.ts');
  run('scripts/test-schedule-reconciliation.ts');
  run('scripts/test-schedule-recurrence.ts');
  run('scripts/test-schedule-recurrence-hardening.ts');
  run('scripts/test-schedule-notifications.ts');
  run('scripts/test-schedule-accessibility.ts');
  run('scripts/test-schedule-theme.js');
  console.log(
    '\n✅ MÓDULO 008 — GATE RECONCILIADO ATÉ OE-008.005 APROVADO'
  );
} catch (error) {
  console.error('\n❌ Falha na homologação do Módulo 008.');
  process.exit(1);
}
