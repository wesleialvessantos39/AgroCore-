/**
 * Teste Automatizado de Rebranding — OE-GLOBAL.001
 * Verifica a ausência absoluta do nome legado 'AgroBook' em todo o projeto ativo.
 */

import fs from 'fs';
import path from 'path';

console.log('================================================================');
console.log('🧪 TESTE AUTOMATIZADO DE REBRANDING — AGROCORE');
console.log('   Verificação Global de Ausência do Nome Legado (AgroBook)');
console.log('================================================================\n');

const ROOT_DIR = process.cwd();

const INSPECTION_TARGETS = [
  'src',
  'public',
  'scripts',
  'index.html',
  'metadata.json',
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'LIVRO_RAIZ_AGROCORE.md',
];

const FORBIDDEN_PATTERNS = [
  /\bagrobook\b/i,
  /agrobook/i,
];

// Pastas a ignorar
const IGNORED_PATHS = [
  'node_modules',
  'dist',
  '.git',
  '.aistudio',
];

function scanDirectory(dirPath) {
  let fileList = [];
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    if (IGNORED_PATHS.includes(item)) continue;

    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      fileList = fileList.concat(scanDirectory(fullPath));
    } else {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

let allFiles = [];

for (const target of INSPECTION_TARGETS) {
  const fullPath = path.join(ROOT_DIR, target);
  if (!fs.existsSync(fullPath)) continue;

  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    allFiles = allFiles.concat(scanDirectory(fullPath));
  } else {
    allFiles.push(fullPath);
  }
}

console.log(`🔍 Inspecionando ${allFiles.length} arquivos do projeto...`);

let violations = 0;

for (const filePath of allFiles) {
  const relativePath = path.relative(ROOT_DIR, filePath);
  
  // Não checar o próprio script de teste de rebranding se ele tiver strings literais de busca
  if (relativePath === 'scripts/test-rebranding.js' || relativePath === 'scripts/verify-leak-free-build.js') {
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      console.error(`❌ REFERÊNCIA LEGADA ENCONTRADA no arquivo: ${relativePath}`);
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (pattern.test(line)) {
          console.error(`   Linha ${idx + 1}: ${line.trim()}`);
        }
      });
      violations++;
    }
  }
}

console.log('\n----------------------------------------------------------------');
if (violations > 0) {
  console.error(`🚨 FALHA NO REBRANDING: ${violations} arquivo(s) com referências legadas!`);
  process.exit(1);
} else {
  console.log(`✅ SUCESSO: Zero referências residuais a 'AgroBook' encontradas.`);
  console.log(`   Identidade AgroCore 100% íntegra em todo o projeto.`);
  console.log('----------------------------------------------------------------\n');
}
