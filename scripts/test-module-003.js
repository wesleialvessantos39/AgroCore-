/**
 * Bateria de Testes Consolidados — Módulo 003: Gestão de Imóveis Rurais e Urbanos
 */

import { spawnSync } from 'child_process';

console.log('================================================================');
console.log('🌾 CONSOLIDAÇÃO DE HOMOLOGAÇÃO: MÓDULO 003');
console.log('   Gestão de Imóveis Rurais e Urbanos (AgroCore)');
console.log('================================================================\n');

function run(scriptPath) {
  const args = ['--import', 'tsx', scriptPath];
  const res = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`Falha na execução de ${scriptPath}`);
  }
}

try {
  console.log('▶️ Executando Testes de Fundação do Módulo de Imóveis (OE-003.001)...');
  run('scripts/test-properties-foundation.js');

  console.log('\n▶️ Executando Testes de Cadastro e Edição de Imóveis (OE-003.002)...');
  run('scripts/test-property-form.js');

  console.log('\n▶️ Executando Testes de Georreferenciamento e Topologia (OE-003.003-R1)...');
  run('scripts/test-property-geometry.js');

  console.log('\n▶️ Executando Testes de Identidade Visual e Purga de Cores (OE-003.002-R2)...');
  run('scripts/test-property-theme.js');

  console.log('\n▶️ Executando Testes de Responsividade e Completude Cadastral (OE-003.002-R3)...');
  run('scripts/test-property-responsive.js');

  console.log('\n================================================================');
  console.log('🎉 MÓDULO 003 VALIDADO COM 100% DE CONFORMIDADE!');
  console.log('================================================================\n');
} catch (error) {
  console.error('\n❌ Falha na bateria consolidada do Módulo 003.');
  process.exit(1);
}
