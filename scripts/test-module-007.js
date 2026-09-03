import { spawnSync } from 'node:child_process';

function run(script) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`Falha em ${script}`);
}

console.log('====================================================');
console.log(' AGROCORE — HOMOLOGAÇÃO DO MÓDULO 007');
console.log('====================================================\n');

try {
  run('scripts/test-field-visits-foundation.ts');
  run('scripts/test-field-visits-preparation.ts');
  run('scripts/test-field-visits-field-form.ts');
  run('scripts/test-field-visits-evidence.ts');
  run('scripts/test-field-visits-completion.ts');
  run('scripts/test-field-visits-accessibility.ts');
  run('scripts/test-field-visits-theme.js');
  run('scripts/test-ui-copy.ts');
  console.log('\n✅ MÓDULO 007 — OE-007.001 A OE-007.005 APROVADAS');
} catch (error) {
  console.error('\n❌ Falha na homologação do Módulo 007.');
  process.exit(1);
}
