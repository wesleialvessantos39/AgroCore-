import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = [
  'src/pages/SchedulePage.tsx',
  'src/schedule/theme.ts',
];

const source = files
  .map((path) => fs.readFileSync(path, 'utf8'))
  .join('\n');

const forbiddenFamilies =
  /(?:bg|text|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|blue|cyan|teal|emerald|lime|yellow|amber|orange|red|rose|pink|fuchsia|purple|violet|indigo)-/;

assert.match(source, /#0B3D2E/);
assert.match(source, /#78C89A/);
assert.match(source, /bg-white/);
assert.doesNotMatch(source, forbiddenFamilies);
assert.doesNotMatch(source, /dark:/);
assert.doesNotMatch(source, /bg-black|text-black|border-black/);
assert.doesNotMatch(source, /OE-008|008\.001/i);

console.log('✅ Identidade visual da Agenda restrita à paleta oficial AgroCore.');
