/**
 * Suíte de Testes Integrada — Módulo 004 (Laudos de Avaliação)
 * Executa todas as baterias de teste do Módulo 004 e valida o isolamento com os módulos anteriores.
 */

import { spawnSync } from 'child_process';
import path from 'path';

console.log('================================================================');
console.log('🌱 AGROCORE — SUÍTE DE TESTES INTEGRADA DO MÓDULO 004');
console.log('   Laudos de Avaliação de Imóveis Rurais e Urbanos');
console.log('================================================================\n');

const tests = [
  { name: 'Fundação Arquitetural de Laudos (OE-004.001)', script: 'scripts/test-appraisals-foundation.ts' },
  { name: 'Perfil Técnico e Governança de Laudos (OE-004.002)', script: 'scripts/test-oe-004-002.ts' },
  { name: 'Dossiê, Métodos e Emissão Canônica (OE-004.003)', script: 'scripts/test-oe-004-003.ts' },
  { name: 'Identidade Visual e Purga de Cores (OE-004)', script: 'scripts/test-appraisal-theme.js' },
  { name: 'Compatibilidade com Módulo 001 (Auth/Org)', script: 'scripts/test-module-001.js' },
  { name: 'Compatibilidade com Módulo 002 (Clientes)', script: 'scripts/test-module-002.js' },
  { name: 'Compatibilidade com Módulo 003 (Imóveis/Geo)', script: 'scripts/test-module-003.js' },
];

let totalPassed = 0;
let totalFailed = 0;

for (const test of tests) {
  console.log(`\n▶️ Executando: ${test.name}...`);
  const args = ['--import', 'tsx', test.script];
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status === 0) {
    totalPassed++;
  } else {
    totalFailed++;
    console.error(`❌ Falha no teste: ${test.name}`);
  }
}

console.log('\n================================================================');
console.log(`📊 TOTAL CONSOLIDADO: ${totalPassed}/${tests.length} SUÍTES APROVADAS`);
console.log('================================================================');

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log('🚀 MÓDULO 004 INTEGRADO E HOMOLOGADO COM SUCESSO!');
}
