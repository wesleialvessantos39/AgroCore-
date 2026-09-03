import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('src/pages/SchedulePage.tsx', 'utf8');
const browse = fs.readFileSync(
  'src/schedule/ScheduleBrowsePanel.tsx',
  'utf8'
);
const collaboration = fs.readFileSync(
  'src/schedule/ScheduleItemCollaborationPanel.tsx',
  'utf8'
);
const theme = fs.readFileSync('src/schedule/theme.ts', 'utf8');
const rendered = page + '\n' + browse + '\n' + collaboration;

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
  assert.match(rendered, /break-words/);
});

test('13. interface não usa tabela larga para fundação móvel', () => {
  assert.doesNotMatch(rendered, /<table|overflow-x-auto/i);
});

test('14. formulário se reorganiza em duas colunas apenas em viewport maior', () => {
  assert.match(page, /md:grid-cols-2/);
});

test('15. informações do registro usam lista descritiva semântica', () => {
  assert.match(rendered, /<dl/);
  assert.match(rendered, /<dt/);
  assert.match(rendered, /<dd/);
});

test('16. recorrência semanal usa fieldset e legend semânticos', () => {
  assert.match(page, /<fieldset/);
  assert.match(page, /<legend/);
  assert.match(page, /Dias da semana/);
});

test('17. dias semanais usam checkboxes acessíveis e alvo mínimo', () => {
  assert.match(page, /type="checkbox"/);
  assert.match(page, /min-h-\[44px\]/);
  assert.match(page, /focus-within:ring-2/);
});

test('18. envio semanal é bloqueado até existir dia selecionado', () => {
  assert.match(
    page,
    /recurrenceFrequency === 'weekly'[\s\S]*recurrenceWeekdays\.length === 0/
  );
});

test('19. escopo pessoal/equipe usa botões pressionáveis', () => {
  assert.match(browse, /aria-label="Escopo da agenda"/);
  assert.match(browse, /aria-pressed=/);
});

test('20. modo lista/calendário usa grupo acessível', () => {
  assert.match(browse, /aria-label="Modo de exibição"/);
  assert.match(browse, />Lista</);
  assert.match(browse, />Calendário</);
});

test('21. calendário desktop possui papéis semânticos', () => {
  assert.match(browse, /role="grid"/);
  assert.match(browse, /role="columnheader"/);
  assert.match(browse, /role="gridcell"/);
});

test('22. lista móvel substitui a grade em telas pequenas', () => {
  assert.match(browse, /Agenda mensal em lista para celular/);
  assert.match(browse, /md:hidden/);
  assert.match(browse, /hidden[\s\S]*md:grid/);
});

test('23. navegação mensal possui rótulos para leitor de tela', () => {
  assert.match(browse, /aria-label="Mês anterior"/);
  assert.match(browse, /aria-label="Próximo mês"/);
});

test('24. controles novos mantêm alvo mínimo de toque', () => {
  assert.match(browse, /min-h-\[44px\]/);
});

test('25. atualização de filtros é anunciada sem apagar conteúdo anterior', () => {
  assert.match(browse, /Atualizando resultados/);
  assert.match(browse, /aria-live="polite"/);
});

test('26. colaboração usa expansão anunciada por aria-expanded', () => {
  assert.match(collaboration, /aria-expanded=\{editing\}/);
});

test('27. participantes usam fieldset e legend semânticos', () => {
  assert.match(collaboration, /<fieldset/);
  assert.match(collaboration, /Participantes/);
});

test('28. participantes usam checkboxes com alvo mínimo de toque', () => {
  assert.match(collaboration, /type="checkbox"/);
  assert.match(collaboration, /min-h-\[44px\]/);
  assert.match(collaboration, /focus-within:ring-2/);
});

test('29. erros de colaboração são anunciados como alertas', () => {
  assert.match(collaboration, /role="alert"/);
});

test('30. confirmação de ciclo usa aria-labelledby', () => {
  assert.match(collaboration, /aria-labelledby=/);
  assert.match(collaboration, /schedule-action-/);
});

test('31. ações destrutivas exigem confirmação explícita', () => {
  assert.match(collaboration, /Confirmar cancelamento/);
  assert.match(collaboration, /Confirmar reabertura/);
  assert.match(collaboration, />Confirmar</);
});

test('32. formulários de colaboração e ciclo possuem motivo obrigatório', () => {
  assert.ok((collaboration.match(/required/g) ?? []).length >= 2);
  assert.ok((collaboration.match(/minLength=\{3\}/g) ?? []).length >= 2);
});

test('33. botões de colaboração preservam ícones decorativos ocultos', () => {
  assert.ok((collaboration.match(/aria-hidden="true"/g) ?? []).length >= 4);
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
