import { spawnSync } from 'node:child_process';

function run(script) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Falha em ${script}`);
}

console.log('====================================================');
console.log(' AGROCORE — HOMOLOGAÇÃO DO MÓDULO 006');
console.log('====================================================\n');

try {
  run('scripts/test-documents-foundation.ts');
  run('scripts/test-documents-theme.js');
  console.log('\n✅ MÓDULO 006 — OE-006.001 APROVADA');
} catch (error) {
  console.error('\n❌ Falha na homologação do Módulo 006.');
  process.exit(1);
}

