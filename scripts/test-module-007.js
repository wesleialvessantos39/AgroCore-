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
  run('scripts/test-field-visits-theme.js');
  run('scripts/test-ui-copy.ts');
  console.log('\n✅ MÓDULO 007 — FUNDAÇÃO DE VISITAS E VISTORIAS APROVADA');
} catch (error) {
  console.error('\n❌ Falha na homologação do Módulo 007.');
  process.exit(1);
}
