/**
 * Suíte de Testes e Homologação Consolidada — MÓDULO 001 COMPLETO
 * Executa todas as baterias de testes automatizados do Módulo 001 (OE-001.001 a OE-001.006)
 */

import { execSync } from 'child_process';

console.log('================================================================');
console.log('HOMOLOGAÇÃO INTEGRADA E FECHAMENTO GERAL DO MÓDULO 001');
console.log('AGROCORE — AUTENTICAÇÃO, SESSÃO, ORGANIZAÇÃO, AUTORIZAÇÃO E ROTAS');
console.log('================================================================\n');

const testSuites = [
  { name: '1. Autenticação e Recuperação de Acesso (OE-001.001/002)', script: 'test:auth' },
  { name: '2. Gerenciamento de Sessão e Inatividade (OE-001.003)', script: 'test:session' },
  { name: '3. Visões Contextuais dos 7 Perfis (OE-001.003)', script: 'test:roles' },
  { name: '4. Contexto Organizacional e Filiais (OE-001.004)', script: 'test:organization' },
  { name: '5. Matriz de Autorização e Permissões (OE-001.005)', script: 'test:authorization' },
  { name: '6. Fluxo Integrado de Decisão e Rotas Seguras (OE-001.006)', script: 'test:access-flow' },
];

let totalPassed = 0;

for (const suite of testSuites) {
  console.log(`\n▶ Executando: ${suite.name}...`);
  try {
    const output = execSync(`npm run ${suite.script}`, { encoding: 'utf-8' });
    console.log(output.trim());
    totalPassed++;
  } catch (error) {
    console.error(`\n❌ FALHA NA SUÍTE: ${suite.name}`);
    console.error(error.stdout || error.message);
    process.exit(1);
  }
}

console.log('\n================================================================');
console.log(`✅ HOMOLOGAÇÃO DO MÓDULO 001 CONCLUÍDA COM SUCESSO!`);
console.log(`   ${totalPassed}/${testSuites.length} suítes executadas e 100% aprovadas.`);
console.log('================================================================');
