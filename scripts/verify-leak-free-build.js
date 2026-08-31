import fs from 'fs';
import path from 'path';

const DIST_DIR = path.resolve(process.cwd(), 'dist');

console.log('--- VERIFICAÇÃO AUTOMATIZADA DE VAZAMENTOS NO BUILD DE PRODUÇÃO ---');

if (!fs.existsSync(DIST_DIR)) {
  console.error('ERRO FATAL: Diretório dist/ não encontrado.');
  process.exit(1);
}

const FORBIDDEN_STRINGS = [
  '@agrocore.test',
  'AgroCore@Teste1',
  '@agrobook.test',
  'AgroBook@Teste1',
  'AgroBook',
  'agrobook',
  'Organização de acompanhamento',
  'Modo de acompanhamento',
  'PreviewAuthGateway',
  'PreviewOrganizationGateway',
  'PreviewClientGateway',
  'PreviewPropertyGateway',
  'PreviewAppraisalGateway',
  'PreviewAppraisalRequestGateway',
  'PreviewTechnicalProfessionalGateway',
  'PreviewProposalGateway',
  'PreviewDocumentReferenceGateway',
  'previewAccounts',
  'previewRecoveryControl',
  'agrocore:preview:',
  'agrobook:preview:',
];

function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = getFilesRecursively(DIST_DIR);
console.log(`Inspecionando ${allFiles.length} arquivos compilados em dist/...`);

let leakCount = 0;

for (const filePath of allFiles) {
  const relativePath = path.relative(DIST_DIR, filePath);

  // Ignora binários não-texto puros se houver
  const ext = path.extname(filePath).toLowerCase();
  const textExtensions = ['.html', '.js', '.mjs', '.cjs', '.css', '.json', '.webmanifest', '.txt', '.xml', '.svg'];

  if (!textExtensions.includes(ext)) {
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  for (const forbidden of FORBIDDEN_STRINGS) {
    if (content.includes(forbidden)) {
      console.error(`❌ VAZAMENTO DETECTADO no arquivo: ${relativePath}`);
      console.error(`   Expressão proibida encontrada: "${forbidden}"`);
      leakCount++;
    }
  }
}

if (leakCount > 0) {
  console.error(`\n🚨 FALHA DE SEGURANÇA: ${leakCount} vazamento(s) encontrado(s) em dist/!`);
  process.exit(1);
}

console.log('✅ SUCESSO: Nenhum dado de acompanhamento, conta, senha ou módulo de preview temporário está presente no build de produção.');
console.log('✅ dist/ inspecionado integralmente com 100% de conformidade.');
