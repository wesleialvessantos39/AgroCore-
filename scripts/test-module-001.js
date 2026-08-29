/**
 * Suíte de Testes e Homologação Consolidada — MÓDULO 001 COMPLETO
 * Executa todas as baterias de testes automatizados do Módulo 001 (OE-001.001 a OE-001.006)
 */

import { spawnSync } from 'child_process';

console.log('================================================================');
console.log('HOMOLOGAÇÃO INTEGRADA E FECHAMENTO GERAL DO MÓDULO 001');
console.log('AGROCORE — AUTENTICAÇÃO, SESSÃO, ORGANIZAÇÃO, AUTORIZAÇÃO E ROTAS');
console.log('================================================================\n');

const testSuites = [
  { name: '1. Autenticação e Recuperação de Acesso (OE-001.001/002)', script: 'scripts/test-auth-preview.js' },
  { name: '2. Gerenciamento de Sessão e Inatividade (OE-001.003)', script: 'scripts/test-session-lifecycle.js' },
  { name: '3. Visões Contextuais dos 7 Perfis (OE-001.003)', script: 'scripts/test-role-views.js' },
  { name: '4. Contexto Organizacional e Filiais (OE-001.004)', script: 'scripts/test-organization-context.js' },
  { name: '5. Matriz de Autorização e Permissões (OE-001.005)', script: 'scripts/test-authorization.js' },
  { name: '6. Fluxo Integrado de Decisão e Rotas Seguras (OE-001.006)', script: 'scripts/test-access-flow.js' },
];

let totalPassed = 0;

for (const suite of testSuites) {
  console.log(`\n▶ Executando: ${suite.name}...`);
  try {
    const result = spawnSync(process.execPath, ['--import', 'tsx', suite.script], {
      encoding: 'utf-8',
    });
    if (result.stdout) console.log(result.stdout.trim());
    if (result.status !== 0) {
      throw new Error(result.stderr || `Processo encerrado com código ${result.status}`);
    }
    totalPassed++;
  } catch (error) {
    console.error(`\n❌ FALHA NA SUÍTE: ${suite.name}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

console.log('\n================================================================');
console.log(`✅ HOMOLOGAÇÃO DO MÓDULO 001 CONCLUÍDA COM SUCESSO!`);
console.log(`   ${totalPassed}/${testSuites.length} suítes executadas e 100% aprovadas.`);
console.log('================================================================');
