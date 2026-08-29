/**
 * Auditoria Estrita de Tokens de Tema — Módulo 005
 * Garante que nenhuma classe de cor proibida do Tailwind seja introduzida.
 */

import fs from 'fs';
import path from 'path';

const FORBIDDEN_TOKENS = [
  'slate-',
  'gray-',
  'zinc-',
  'neutral-',
  'stone-',
  'red-',
  'orange-',
  'amber-',
  'yellow-',
  'lime-',
  'green-',
  'emerald-',
  'teal-',
  'cyan-',
  'sky-',
  'blue-',
  'indigo-',
  'violet-',
  'purple-',
  'fuchsia-',
  'pink-',
  'rose-',
  'black',
];

const TARGET_DIRECTORIES = [
  'src/proposals',
  'src/pages/ProposalCreatePage.tsx',
  'src/pages/ProposalEditPage.tsx',
  'src/pages/ProposalDetailPage.tsx',
  'src/pages/ProposalsPage.tsx',
];

let errorsFound = 0;

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceWithoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/.*$/gm, '$1');
  const lines = sourceWithoutComments.split('\n');

  lines.forEach((line, idx) => {
    FORBIDDEN_TOKENS.forEach((token) => {
      // Procura ocorrências de classes Tailwind com os tokens proibidos
      const regex = new RegExp(`\\b(bg|text|border|ring|fill|stroke)-${token}`, 'g');
      if (regex.test(line)) {
        console.error(`[VIOLAÇÃO DE TEMA] ${filePath}:${idx + 1} -> Contém token proibido: ${token}`);
        console.error(`  Linha: ${line.trim()}`);
        errorsFound++;
      }
    });

    if (/\bdark:/.test(line)) {
      console.error(`[VIOLAÇÃO DE TEMA] ${filePath}:${idx + 1} -> Contém variante proibida: dark:`);
      console.error(`  Linha: ${line.trim()}`);
      errorsFound++;
    }
  });
}

function walkDir(dirOrFile) {
  if (!fs.existsSync(dirOrFile)) return;
  const stat = fs.statSync(dirOrFile);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(dirOrFile);
    entries.forEach((entry) => {
      walkDir(path.join(dirOrFile, entry));
    });
  } else if (dirOrFile.endsWith('.ts') || dirOrFile.endsWith('.tsx') || dirOrFile.endsWith('.js')) {
    scanFile(dirOrFile);
  }
}

console.log('Iniciando auditoria de conformidade de cores e tema do Módulo 005...');

TARGET_DIRECTORIES.forEach((target) => {
  walkDir(target);
});

if (errorsFound === 0) {
  console.log('✅ Auditoria de Tema: 100% em conformidade com as regras AgroCore (#0B3D2E, #78C89A).');
  process.exit(0);
} else {
  console.error(`❌ Auditoria de Tema: ${errorsFound} violações encontradas.`);
  process.exit(1);
}
