import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('src/pages/SchedulePage.tsx', 'utf8');
const theme = fs.readFileSync('src/schedule/theme.ts', 'utf8');

let passed = 0;
let failed = 0;

function test(name: string, operation: () => void) {
  try {
    operation();
    passed += 1;
    console.log('  [PASS] ' + name);
  } catch (error) {
    failed += 1;
    console.error('  [FAIL] ' + name);
    console.error(error);
  }
}

console.log('====================================================');
console.log(' AGROCORE — AGENDA • ACESSIBILIDADE/RESPONSIVIDADE');
console.log('====================================================\n');

test('1. página utiliza min-w-0 contra overflow em grids flexíveis', () => {
  assert.match(page, /min-w-0/);
});

test('2. ações de cabeçalho ocupam largura móvel', () => {
  assert.match(page, /w-full sm:w-auto/);
});

test('3. controles possuem alvo mínimo de 44 px', () => {
  assert.match(theme, /min-h-\[44px\]/);
});

test('4. foco visível usa a paleta oficial', () => {
  assert.match(theme, /focus:ring-2 focus:ring-\[#78C89A\]/);
});

test('5. alertas operacionais usam role alert', () => {
  assert.match(page, /role="alert"/);
});

test('6. carregamento é anunciado sem bloquear leitor de tela', () => {
  assert.match(page, /aria-live="polite"/);
});

test('7. expansão do formulário informa aria-expanded', () => {
  assert.match(page, /aria-expanded=\{showCreate\}/);
  assert.match(page, /aria-controls="schedule-create-panel"/);
});

test('8. campos de data usam controles semânticos nativos', () => {
  assert.ok((page.match(/type="datetime-local"/g) ?? []).length >= 3);
});

test('9. intervalo usa teclado numérico móvel', () => {
  assert.match(page, /inputMode="numeric"/);
});

test('10. alterações não salvas ativam proteção beforeunload', () => {
  assert.match(page, /addEventListener\('beforeunload'/);
  assert.match(page, /removeEventListener\('beforeunload'/);
});

test('11. título e descrição possuem limites de entrada', () => {
  assert.match(page, /maxLength=\{160\}/);
  assert.match(page, /maxLength=\{2000\}/);
});

test('12. cartões quebram conteúdo longo em vez de forçar largura', () => {
  assert.match(page, /break-words/);
});

test('13. interface não usa tabela larga para fundação móvel', () => {
  assert.doesNotMatch(page, /<table|overflow-x-auto/i);
});

test('14. formulário se reorganiza em duas colunas apenas em viewport maior', () => {
  assert.match(page, /md:grid-cols-2/);
});

test('15. informações do registro usam lista descritiva semântica', () => {
  assert.match(page, /<dl/);
  assert.match(page, /<dt/);
  assert.match(page, /<dd/);
});

console.log('\n====================================================');
console.log(
  'Resultado acessibilidade Agenda: ' +
    passed +
    ' aprovadas, ' +
    failed +
    ' falhas.'
);
console.log('====================================================');

if (failed > 0) process.exit(1);
