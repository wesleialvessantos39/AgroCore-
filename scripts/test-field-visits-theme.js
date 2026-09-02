import fs from 'node:fs';

const FILES = [
  'src/fieldVisits/theme.ts',
  'src/pages/FieldVisitsPage.tsx',
  'src/fieldVisits/VisitPreparationPanel.tsx',
];

const forbidden = [
  /(?:bg|text|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|black|blue|red|amber|yellow|emerald|rose)-/g,
  /\bdark:/g,
];

let failed = 0;

for (const file of FILES) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    const matches = content.match(pattern) ?? [];
    if (matches.length > 0) {
      console.error(`[FAIL] ${file}: classe visual proibida (${matches.join(', ')})`);
      failed += 1;
    }
  }
}

const theme = fs.readFileSync('src/fieldVisits/theme.ts', 'utf8');
for (const official of ['#0B3D2E', '#78C89A']) {
  if (!theme.includes(official)) {
    console.error(`[FAIL] Token oficial ausente: ${official}`);
    failed += 1;
  }
}

if (failed > 0) process.exit(1);
console.log('✅ Módulo 007 usa exclusivamente a identidade visual oficial AgroCore.');
