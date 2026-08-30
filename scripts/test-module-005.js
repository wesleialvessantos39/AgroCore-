/**
 * Script consolidador de testes do Módulo 005 — Propostas de Crédito e Serviços
 */

import { spawnSync } from 'child_process';
import path from 'path';

console.log('====================================================');
console.log(' AGROCORE — HOMOLOGAÇÃO INTEGRAL DO MÓDULO 005');
console.log('====================================================\n');

function runScript(scriptPath) {
  const args = ['--import', 'tsx', scriptPath];
  const res = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`Falha na execução de ${scriptPath}`);
  }
}

try {
  console.log('1. Executando testes de domínio e isolamento multitenant...');
  runScript('scripts/test-proposals-foundation.ts');

  console.log('\n2. Executando testes do Pipeline Comercial, pareceres e ciclo de vida (OE-005.003)...');
  runScript('scripts/test-proposals-pipeline.ts');

  console.log('\n3. Executando testes do Documento Comercial Versionado (OE-005.004)...');
  runScript('scripts/test-proposal-documents.ts');

  console.log('\n4. Executando acompanhamento comercial e encaminhamento pós-aceite (OE-005.005)...');
  runScript('scripts/test-proposal-commercial-tracking.ts');

  console.log('\n5. Executando auditoria de tema e conformidade visual...');
  runScript('scripts/test-proposals-theme.js');

  console.log('\n====================================================');
  console.log('✅ MÓDULO 005 APROVADO COM SUCESSO EM TODAS AS ETAPAS');
  console.log('====================================================');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Falha na homologação do Módulo 005.');
  process.exit(1);
}
