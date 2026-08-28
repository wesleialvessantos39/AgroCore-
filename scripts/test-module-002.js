/**
 * Suíte Agregada de Homologação — Módulo 002: Gestão de Clientes e Produtores Rurais
 *
 * Executa todas as ordens de execução do módulo:
 * - OE-002.001: Fundação do Módulo de Clientes (Contratos, Tipos, Gateways, Telas Iniciais)
 * - OE-002.002: Cadastro e Edição de Clientes PF e PJ (Validações, Documentos, Contatos, Endereços)
 * - OE-002.003: Busca, Filtros, Ordenação e Paginação Real de Clientes
 */

import { spawnSync } from 'child_process';

console.log('================================================================');
console.log('🌾 BATERIA AGREGADA DE HOMOLOGAÇÃO: MÓDULO 002');
console.log('   Gestão de Clientes e Produtores Rurais');
console.log('================================================================\n');

const testSuites = [
  { name: 'OE-002.001 (Fundação de Clientes)', script: 'scripts/test-clients-foundation.js' },
  { name: 'OE-002.002 (Formulário PF/PJ e Edição)', script: 'scripts/test-client-form.js' },
  { name: 'OE-002.003 (Busca, Filtros, Ordenação e Paginação)', script: 'scripts/test-client-list.js' },
];

let totalPassed = 0;
let totalFailed = 0;

for (const suite of testSuites) {
  console.log(`\n▶️ Executando: ${suite.name}...`);
  const isTs = suite.script.endsWith('.ts');
  const args = isTs ? ['--import', 'tsx', suite.script] : ['--import', 'tsx', suite.script];
  const res = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (res.status === 0) {
    console.log(`✔️ ${suite.name} concluído com sucesso.`);
    totalPassed++;
  } else {
    console.error(`❌ ${suite.name} falhou.`);
    totalFailed++;
  }
}

console.log('\n================================================================');
console.log(`🏁 RESULTADO GERAL DO MÓDULO 002: ${totalPassed} suites passaram | ${totalFailed} suites falharam`);
console.log('================================================================\n');

if (totalFailed > 0) {
  process.exit(1);
}
