import fs from 'node:fs';
import path from 'node:path';

const TARGETS = [
  'src/documents',
  'src/pages/DocumentsPage.tsx',
  'src/pages/DocumentReferenceCreatePage.tsx',
  'src/pages/DocumentReferenceDetailPage.tsx',
  'src/pages/DocumentGovernancePage.tsx',
  'src/pages/DocumentRequirementCreatePage.tsx',
  'src/pages/ProposalChecklistsPage.tsx',
];

const FORBIDDEN = [
  'slate-', 'gray-', 'zinc-', 'neutral-', 'stone-', 'red-', 'orange-', 'amber-',
  'yellow-', 'lime-', 'green-', 'emerald-', 'teal-', 'cyan-', 'sky-', 'blue-',
  'indigo-', 'violet-', 'purple-', 'fuchsia-', 'pink-', 'rose-', 'black',
];

let violations = 0;

function scan(file) {
  const source = fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/.*$/gm, '$1');
  source.split('\n').forEach((line, index) => {
    for (const token of FORBIDDEN) {
      const expression = new RegExp(`\\b(bg|text|border|ring|fill|stroke)-${token}`);
      if (expression.test(line)) {
        console.error(`[TEMA] ${file}:${index + 1} usa ${token}`);
        violations += 1;
      }
    }
    if (/\bdark:/.test(line) || /transform:\s*scale|\bzoom\s*:/.test(line)) {
      console.error(`[TEMA] ${file}:${index + 1} usa variante ou escala proibida`);
      violations += 1;
    }
  });
}

function walk(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) walk(path.join(target, entry));
  } else if (/\.(?:ts|tsx|js)$/.test(target)) {
    scan(target);
  }
}

console.log('Auditando tema e interface do Módulo 006...');
TARGETS.forEach(walk);

if (violations > 0) {
  console.error(`❌ Módulo 006 contém ${violations} violação(ões).`);
  process.exit(1);
}

const uploadPage = fs.readFileSync('src/pages/DocumentReferenceCreatePage.tsx', 'utf8');
if (!/type=["']file["']/.test(uploadPage) || !/multiple/.test(uploadPage) || !/accept=/.test(uploadPage)) {
  console.error('[SEGURANÇA] A seleção controlada de arquivos não está configurada.');
  process.exit(1);
}

console.log('✅ Módulo 006 usa exclusivamente a identidade AgroCore e seleção controlada de arquivos.');
