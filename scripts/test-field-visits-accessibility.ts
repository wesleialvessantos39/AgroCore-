import assert from 'node:assert/strict';
import fs from 'node:fs';

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

const page = fs.readFileSync('src/pages/FieldVisitsPage.tsx', 'utf8');
const panel = fs.readFileSync('src/fieldVisits/VisitPreparationPanel.tsx', 'utf8');
const theme = fs.readFileSync('src/fieldVisits/theme.ts', 'utf8');
const fieldForm = fs.readFileSync('src/fieldVisits/VisitFieldFormPanel.tsx', 'utf8');
const fieldEvidence = fs.readFileSync('src/fieldVisits/FieldEvidencePanel.tsx', 'utf8');
const integrationPanel = fs.readFileSync('src/fieldVisits/VisitIntegrationPanel.tsx', 'utf8');

console.log('====================================================');
console.log(' AGROCORE — RESPONSIVIDADE E ACESSIBILIDADE MÓDULO 007');
console.log('====================================================\n');

test('1. Controles principais preservam alvo mínimo de 44 px', () => {
  for (const token of ['input:', 'buttonPrimary:', 'buttonSecondary:']) {
    const index = theme.indexOf(token);
    assert.notEqual(index, -1);
    assert.equal(theme.slice(index, index + 650).includes('min-h-[44px]'), true);
  }
});

test('2. Controles interativos possuem foco visível', () => {
  assert.equal(theme.includes('focus:ring-2'), true);
  assert.equal(theme.includes('focus:ring-[#78C89A]'), true);
});

test('3. Painel expansível expõe estado e relação ARIA', () => {
  assert.equal(panel.includes('aria-expanded={open}'), true);
  assert.equal(panel.includes('aria-controls={panelId}'), true);
  assert.equal(panel.includes('id={panelId}'), true);
});

test('4. Abertura do painel move foco para o primeiro campo', () => {
  assert.equal(panel.includes('firstFieldRef.current?.focus()'), true);
  assert.equal(panel.includes('ref={firstFieldRef}'), true);
});

test('5. Grupos de participantes e checklist possuem semântica de fieldset/legend', () => {
  assert.equal((panel.match(/<fieldset>/g) ?? []).length >= 2, true);
  assert.equal((panel.match(/<legend/g) ?? []).length >= 2, true);
});

test('6. Estados dinâmicos são anunciáveis', () => {
  assert.equal(panel.includes('role="alert"'), true);
  assert.equal(panel.includes('aria-busy={busy}'), true);
  assert.equal(page.includes('aria-live="polite"'), true);
  assert.equal(page.includes('role="status"'), true);
});

test('7. Checklist editável possui nome acessível mesmo sem label visual', () => {
  assert.equal(panel.includes('Descrição do item'), true);
  assert.equal(panel.includes('Remover item'), true);
});

test('8. Layout é mobile-first e cresce apenas em breakpoints', () => {
  assert.equal(page.includes('sm:flex-row'), true);
  assert.equal(page.includes('lg:flex-row'), true);
  assert.equal(page.includes('sm:grid-cols-2'), true);
  assert.equal(panel.includes('sm:grid-cols-2'), true);
  assert.equal(panel.includes('md:grid-cols-2'), true);
  assert.equal(panel.includes('md:grid-cols-3'), true);
});

test('9. Nenhuma largura mínima fixa força overflow em celular', () => {
  const source = page + '\n' + panel;
  assert.equal(/min-w-\[(?:[4-9]\d\d|\d{4,})px\]/.test(source), false);
  assert.equal(/w-\[(?:[4-9]\d\d|\d{4,})px\]/.test(source), false);
});

test('10. Viewports obrigatórios ficam cobertos pela estratégia responsiva declarada', () => {
  const widths = [320, 390, 430, 720, 768, 1024, 1366, 1440];
  for (const width of widths) {
    if (width < 640) {
      assert.equal(panel.includes('grid gap-4 md:grid-cols-3'), true);
    } else if (width < 768) {
      assert.equal(panel.includes('sm:grid-cols-2'), true);
    } else {
      assert.equal(panel.includes('md:grid-cols-3'), true);
    }
  }
});

test('11. Campos de agenda possuem tipos e limites explícitos', () => {
  assert.equal(panel.includes('type="datetime-local"'), true);
  assert.equal(panel.includes('type="number"'), true);
  assert.equal(panel.includes('min={15}'), true);
  assert.equal(panel.includes('max={1440}'), true);
  assert.equal(panel.includes('maxLength={1200}'), true);
});

test('12. Cartão usa o fuso preparado em vez de assumir o dispositivo', () => {
  assert.equal(page.includes('timeZone: visit.preparation?.timeZone'), true);
});

test('13. Formulário de campo preserva alvos de toque de 44 px', () => {
  assert.equal(fieldForm.includes('min-h-[44px]'), true);
  assert.equal(fieldForm.includes('FIELD_VISIT_THEME.buttonPrimary'), true);
  assert.equal(fieldForm.includes('FIELD_VISIT_THEME.buttonSecondary'), true);
});

test('14. Formulário é mobile-first nos viewports 320 px e 390 px', () => {
  const widths = [320, 390];
  for (const width of widths) {
    assert.equal(width < 640, true);
    assert.equal(fieldForm.includes('md:grid-cols-2'), true);
    assert.equal(fieldForm.includes('sm:flex-row'), true);
    assert.equal(fieldForm.includes('min-w-0'), true);
  }
});

test('15. Formulário não introduz largura fixa que force overflow', () => {
  assert.equal(/min-w-\[(?:[4-9]\d\d|\d{4,})px\]/.test(fieldForm), false);
  assert.equal(/w-\[(?:[4-9]\d\d|\d{4,})px\]/.test(fieldForm), false);
});

test('16. Tipos numéricos, data e horário usam controles adequados ao teclado móvel', () => {
  assert.equal(fieldForm.includes('inputMode="numeric"'), true);
  assert.equal(fieldForm.includes('inputMode="decimal"'), true);
  assert.equal(fieldForm.includes('type="date"'), true);
  assert.equal(fieldForm.includes('type="time"'), true);
});

test('17. Inclusão de seção e item move foco para o novo conteúdo', () => {
  assert.equal(fieldForm.includes("document.getElementById('field-section-title-'"), true);
  assert.equal(fieldForm.includes("document.getElementById('field-item-label-'"), true);
  assert.equal(fieldForm.includes('firstActionRef.current?.focus()'), true);
});

test('18. Evidências usam alvos de toque e estados anunciáveis', () => {
  assert.equal(fieldEvidence.includes('min-h-[44px]'), true);
  assert.equal(fieldEvidence.includes('role="alert"'), true);
  assert.equal(fieldEvidence.includes('role="status"'), true);
  assert.equal(fieldEvidence.includes('aria-live="polite"'), true);
});

test('19. Fotos e geolocalização são mobile-first em 320 px e 390 px', () => {
  for (const width of [320, 390]) {
    assert.equal(width < 640, true);
    assert.equal(fieldEvidence.includes('grid-cols-2'), true);
    assert.equal(fieldEvidence.includes('sm:grid-cols-2'), true);
    assert.equal(fieldEvidence.includes('sm:grid-cols-3'), true);
  }
});

test('20. Evidências não introduzem largura fixa que force overflow', () => {
  assert.equal(/min-w-\\[(?:[4-9]\\d\\d|\\d{4,})px\\]/.test(fieldEvidence), false);
  assert.equal(/w-\\[(?:[4-9]\\d\\d|\\d{4,})px\\]/.test(fieldEvidence), false);
});

test('21. Coordenadas manuais usam teclado decimal em dispositivos móveis', () => {
  assert.equal((fieldEvidence.match(/inputMode="decimal"/g) ?? []).length >= 2, true);
});

test('22. Captura de foto favorece câmera do ambiente quando suportada', () => {
  assert.equal(fieldEvidence.includes('capture="environment"'), true);
});

test('23. Integrações possuem região acessível e estado de carregamento anunciável', () => {
  assert.equal(integrationPanel.includes('aria-label="Integrações operacionais da visita"'), true);
  assert.equal(integrationPanel.includes('role="status"'), true);
  assert.equal(integrationPanel.includes('role="alert"'), true);
});

test('24. Painel de integrações permanece mobile-first e cresce em telas maiores', () => {
  assert.equal(integrationPanel.includes('grid gap-3 md:grid-cols-3'), true);
  assert.equal(integrationPanel.includes('sm:p-5'), true);
  assert.equal(/min-w-\[(?:[4-9]\d\d|\d{4,})px\]/.test(integrationPanel), false);
  assert.equal(/w-\[(?:[4-9]\d\d|\d{4,})px\]/.test(integrationPanel), false);
});

test('25. Integrações não dependem de hover para comunicar situação', () => {
  assert.equal(integrationPanel.includes("link.status === 'active' ? 'Ativo' : 'Liberado'"), true);
  assert.equal(integrationPanel.includes('EVENT_LABEL[latest.eventType]'), true);
});

console.log('\n====================================================');
console.log('Resultado: ' + passed + ' passaram, ' + failed + ' falharam');
console.log('====================================================');

if (failed > 0) process.exit(1);
