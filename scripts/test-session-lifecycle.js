/**
 * BATERIA DE TESTES AUTOMATIZADOS — OE-001.003
 * GERENCIAMENTO TEMPORÁRIO DE SESSÃO, INATIVIDADE E ENCERRAMENTO
 */

import {
  SESSION_INACTIVITY_LIMIT_MS,
  SESSION_WARNING_THRESHOLD_MS,
  SESSION_WARNING_DURATION_MS,
  SESSION_COUNTDOWN_INTERVAL_MS,
  SESSION_ACTIVITY_WRITE_THROTTLE_MS,
  HUMAN_ACTIVITY_EVENTS,
} from '../src/auth/sessionConfig.ts';
import {
  calculateSessionLifecycle,
  formatCountdown,
} from '../src/auth/sessionLifecycle.ts';
import {
  savePreviewActivity,
  getPreviewActivity,
  clearPreviewActivity,
  validateActivityRecord,
  PREVIEW_ACTIVITY_STORAGE_KEY,
  PREVIEW_ACTIVITY_SCHEMA_VERSION,
  PREVIEW_ACTIVITY_PURPOSE,
} from '../src/auth/preview/previewActivityStorage.ts';
import {
  clearAllPreviewState,
  PREVIEW_SESSION_STORAGE_KEY,
} from '../src/auth/preview/clearAllPreviewState.ts';
import {
  PREVIEW_RECOVERY_STORAGE_KEY,
  createPreviewRecoverySession,
} from '../src/auth/preview/previewRecoveryControl.ts';
import { PREVIEW_STORAGE_KEYS } from '../src/auth/preview/previewKeys.ts';
import { PREVIEW_ACCOUNTS } from '../src/auth/preview/previewAccounts.ts';
import { PreviewAuthGateway } from '../src/auth/preview/previewGateway.ts';

// Mock de sessionStorage em memória
const memoryStorage = new Map();
globalThis.sessionStorage = {
  getItem: (key) => memoryStorage.get(key) || null,
  setItem: (key, val) => memoryStorage.set(key, String(val)),
  removeItem: (key) => memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
};
globalThis.window = globalThis;

console.log('================================================================');
console.log('BATERIA DE TESTES AUTOMATIZADOS — OE-001.003');
console.log('GERENCIAMENTO TEMPORÁRIO DE SESSÃO, INATIVIDADE E ENCERRAMENTO');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
}

// -------------------------------------------------------------
// TESTE 1: Configurações Centralizadas e Ausência de mousemove
// -------------------------------------------------------------
console.log('TESTE 1: Configurações centralizadas e validação de constantes');

assert(SESSION_INACTIVITY_LIMIT_MS === 30 * 60 * 1000, 'Limite de inatividade deve ser de 30 minutos (1.800.000 ms)');
assert(SESSION_WARNING_THRESHOLD_MS === 28 * 60 * 1000, 'Início do aviso deve ser aos 28 minutos (1.680.000 ms)');
assert(SESSION_WARNING_DURATION_MS === 2 * 60 * 1000, 'Duração máxima do aviso deve ser de 2 minutos (120.000 ms)');
assert(SESSION_COUNTDOWN_INTERVAL_MS === 1000, 'Intervalo visual da contagem regressiva deve ser de 1 segundo (1.000 ms)');
assert(SESSION_ACTIVITY_WRITE_THROTTLE_MS === 5000, 'Throttle de gravação deve ser de 5.000 ms');

assert(!HUMAN_ACTIVITY_EVENTS.includes('mousemove'), 'PROIBIDO conter mousemove nos eventos de atividade humana');
assert(HUMAN_ACTIVITY_EVENTS.includes('pointerdown'), 'Deve incluir pointerdown');
assert(HUMAN_ACTIVITY_EVENTS.includes('keydown'), 'Deve incluir keydown');
assert(HUMAN_ACTIVITY_EVENTS.includes('touchstart'), 'Deve incluir touchstart');
assert(HUMAN_ACTIVITY_EVENTS.includes('wheel'), 'Deve incluir wheel');
console.log('  ✓ Configurações e eventos validados');

// -------------------------------------------------------------
// TESTE 2: Formatação Pura de Contagem Regressiva (MM:SS)
// -------------------------------------------------------------
console.log('\nTESTE 2: Formatação pura da contagem regressiva em MM:SS');

assert(formatCountdown(120000) === '02:00', '120.000 ms -> 02:00');
assert(formatCountdown(119000) === '01:59', '119.000 ms -> 01:59');
assert(formatCountdown(90000) === '01:30', '90.000 ms -> 01:30');
assert(formatCountdown(60000) === '01:00', '60.000 ms -> 01:00');
assert(formatCountdown(59000) === '00:59', '59.000 ms -> 00:59');
assert(formatCountdown(5000) === '00:05', '5.000 ms -> 00:05');
assert(formatCountdown(1000) === '00:01', '1.000 ms -> 00:01');
assert(formatCountdown(0) === '00:00', '0 ms -> 00:00');
assert(formatCountdown(-500) === '00:00', 'Valores negativos -> 00:00');
assert(formatCountdown(NaN) === '00:00', 'NaN -> 00:00');
console.log('  ✓ Formatação pura de contagem testada com sucesso');

// -------------------------------------------------------------
// TESTE 3: Cálculo Puro do Ciclo de Vida da Sessão por Timestamps
// -------------------------------------------------------------
console.log('\nTESTE 3: Cálculo puro do ciclo de vida por timestamps');

const T0 = 1700000000000; // Momento base

// 3.1 Atividade recente (0 minutos) -> active
const res0 = calculateSessionLifecycle(T0, T0);
assert(res0.state === 'active', '0 min decorridos -> active');
assert(res0.isWarningActive === false, 'Aviso fechado');
assert(res0.isExpired === false, 'Não expirado');
assert(res0.remainingMs === 30 * 60 * 1000, '30 min restantes');

// 3.2 15 minutos decorridos -> active
const res15 = calculateSessionLifecycle(T0 + 15 * 60 * 1000, T0);
assert(res15.state === 'active', '15 min decorridos -> active');
assert(res15.isWarningActive === false, 'Aviso fechado');
assert(res15.isExpired === false, 'Não expirado');
assert(res15.remainingMs === 15 * 60 * 1000, '15 min restantes');

// 3.3 27 minutos e 59 segundos -> active
const res27m59s = calculateSessionLifecycle(T0 + (27 * 60 + 59) * 1000, T0);
assert(res27m59s.state === 'active', '27m59s decorridos -> active');
assert(res27m59s.isWarningActive === false, 'Aviso ainda fechado');
assert(res27m59s.isExpired === false, 'Não expirado');

// 3.4 Exatamente 28 minutos -> warning
const res28 = calculateSessionLifecycle(T0 + 28 * 60 * 1000, T0);
assert(res28.state === 'warning', 'Exatamente 28 min decorridos -> warning');
assert(res28.isWarningActive === true, 'Aviso DEVE estar ativo');
assert(res28.isExpired === false, 'Ainda não expirou');
assert(res28.warningRemainingMs === 2 * 60 * 1000, '2 minutos restantes no aviso');
assert(res28.formattedCountdown === '02:00', 'Contador inicial do aviso: 02:00');

// 3.5 29 minutos decorridos -> warning (1 minuto restante)
const res29 = calculateSessionLifecycle(T0 + 29 * 60 * 1000, T0);
assert(res29.state === 'warning', '29 min decorridos -> warning');
assert(res29.isWarningActive === true, 'Aviso ativo');
assert(res29.warningRemainingMs === 1 * 60 * 1000, '1 minuto restante');
assert(res29.formattedCountdown === '01:00', 'Contador: 01:00');

// 3.6 29 minutos e 55 segundos -> warning (5 segundos restantes)
const res29m55s = calculateSessionLifecycle(T0 + (29 * 60 + 55) * 1000, T0);
assert(res29m55s.state === 'warning', '29m55s -> warning');
assert(res29m55s.isWarningActive === true, 'Aviso ativo');
assert(res29m55s.formattedCountdown === '00:05', 'Contador: 00:05');

// 3.7 Exatamente 30 minutos -> expired
const res30 = calculateSessionLifecycle(T0 + 30 * 60 * 1000, T0);
assert(res30.state === 'expired', 'Exatamente 30 min decorridos -> expired');
assert(res30.isWarningActive === false, 'Aviso desativado após expiração');
assert(res30.isExpired === true, 'isExpired deve ser true');
assert(res30.remainingMs === 0, '0 ms restantes');
assert(res30.formattedCountdown === '00:00', '00:00');

// 3.8 45 minutos decorridos (ex: retorno após longa suspensão de aba) -> expired
const res45 = calculateSessionLifecycle(T0 + 45 * 60 * 1000, T0);
assert(res45.state === 'expired', '45 min decorridos -> expired');
assert(res45.isExpired === true, 'isExpired deve ser true');
assert(res45.remainingMs === 0, '0 ms restantes');

// 3.9 Timestamps inválidos ou ausentes -> inactive/expired
const resInvalid = calculateSessionLifecycle(T0, NaN);
assert(resInvalid.state === 'inactive', 'Timestamp NaN -> inactive');
assert(resInvalid.isExpired === true, 'isExpired = true');

console.log('  ✓ Todos os estados de ciclo de vida calculados com precisão matemática');

// -------------------------------------------------------------
// TESTE 4: Armazenamento e Validação Estrutural da Atividade Local
// -------------------------------------------------------------
console.log('\nTESTE 4: Armazenamento e validação estrita do registro de atividade');

memoryStorage.clear();
assert(getPreviewActivity() === null, 'Sem atividade salva, deve retornar null');

const nowTest = 1700000000000;
const saved = savePreviewActivity(nowTest);
assert(saved === true, 'savePreviewActivity deve retornar true');
assert(memoryStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), 'Chave no sessionStorage deve existir');

const storedRaw = memoryStorage.get(PREVIEW_STORAGE_KEYS.ACTIVITY);
const parsedObj = JSON.parse(storedRaw);

// 4.1 Ausência de dados pessoais, credenciais, tokens, ids
assert(!('email' in parsedObj), 'NÃO DEVE conter email');
assert(!('user' in parsedObj), 'NÃO DEVE conter user');
assert(!('role' in parsedObj), 'NÃO DEVE conter role');
assert(!('organization' in parsedObj), 'NÃO DEVE conter organization');
assert(!('password' in parsedObj), 'NÃO DEVE conter password');
assert(!('token' in parsedObj), 'NÃO DEVE conter token');
assert(!('id' in parsedObj), 'NÃO DEVE conter id');

// 4.2 Campos obrigatórios
assert(parsedObj.version === PREVIEW_ACTIVITY_SCHEMA_VERSION, 'Versão 1.0');
assert(parsedObj.purpose === PREVIEW_ACTIVITY_PURPOSE, 'Finalidade session_activity_tracking');
assert(parsedObj.lastActivityAt === nowTest, 'lastActivityAt correto');
assert(parsedObj.expiresAt === nowTest + SESSION_INACTIVITY_LIMIT_MS, 'expiresAt correto (+30m)');
assert(Object.keys(parsedObj).length === 4, 'EXATAMENTE 4 campos estruturais');

// 4.3 Validação de recuperação bem-sucedida
const retrieved = getPreviewActivity(nowTest + 1000);
assert(retrieved !== null, 'Registro válido deve ser recuperado');
assert(retrieved.lastActivityAt === nowTest, 'Timestamp íntegro');

// 4.4 Rejeição de JSON inválido
memoryStorage.set(PREVIEW_STORAGE_KEYS.ACTIVITY, '{ json_invalido');
assert(getPreviewActivity(nowTest) === null, 'JSON inválido rejeitado');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), 'Storage limpo após falha');

// 4.5 Rejeição de estrutura com campos extras
memoryStorage.set(
  PREVIEW_STORAGE_KEYS.ACTIVITY,
  JSON.stringify({
    version: PREVIEW_ACTIVITY_SCHEMA_VERSION,
    purpose: PREVIEW_ACTIVITY_PURPOSE,
    lastActivityAt: nowTest,
    expiresAt: nowTest + SESSION_INACTIVITY_LIMIT_MS,
    campoNaoAutorizado: 'hack',
  })
);
assert(getPreviewActivity(nowTest) === null, 'Campos extras rejeitados');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), 'Storage limpo após descarte');

// 4.6 Rejeição de registro já expirado
memoryStorage.set(
  PREVIEW_STORAGE_KEYS.ACTIVITY,
  JSON.stringify({
    version: PREVIEW_ACTIVITY_SCHEMA_VERSION,
    purpose: PREVIEW_ACTIVITY_PURPOSE,
    lastActivityAt: nowTest - (35 * 60 * 1000),
    expiresAt: nowTest - (5 * 60 * 1000), // Expirou há 5 minutos
  })
);
assert(getPreviewActivity(nowTest) === null, 'Registro expirado rejeitado');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), 'Chave expirada removida');

// 4.7 Rejeição de data futura impossível (clock skew exagerado)
memoryStorage.set(
  PREVIEW_STORAGE_KEYS.ACTIVITY,
  JSON.stringify({
    version: PREVIEW_ACTIVITY_SCHEMA_VERSION,
    purpose: PREVIEW_ACTIVITY_PURPOSE,
    lastActivityAt: nowTest + 60000, // 1 minuto no futuro
    expiresAt: nowTest + 60000 + SESSION_INACTIVITY_LIMIT_MS,
  })
);
assert(getPreviewActivity(nowTest) === null, 'Data futura incompatível rejeitada');

console.log('  ✓ Validação estrita de persistência local de atividade aprovada');

// -------------------------------------------------------------
// TESTE 5: Limpeza Integral e Atômica com Preservação de Registros Alheios
// -------------------------------------------------------------
console.log('\nTESTE 5: Limpeza atômica, idempotente e preservação de registros de terceiros');

const UNRELATED_KEY = 'agrocore:preferencia:visual';
const UNRELATED_VALUE = JSON.stringify({ theme: 'dark', compactMode: true });

function seedAllPreviewState() {
  memoryStorage.set(PREVIEW_STORAGE_KEYS.SESSION, JSON.stringify({ mode: 'preview', email: 'gerente@agrocore.test' }));
  memoryStorage.set(PREVIEW_STORAGE_KEYS.ACTIVITY, JSON.stringify({
    version: PREVIEW_ACTIVITY_SCHEMA_VERSION,
    purpose: PREVIEW_ACTIVITY_PURPOSE,
    lastActivityAt: Date.now(),
    expiresAt: Date.now() + SESSION_INACTIVITY_LIMIT_MS,
  }));
  memoryStorage.set(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW, JSON.stringify({
    version: '1.0',
    purpose: 'visual_navigation_flow',
    isVisualAuthorized: true,
    expiresAt: Date.now() + 15 * 60 * 1000,
  }));
  memoryStorage.set(UNRELATED_KEY, UNRELATED_VALUE);
}

// 5.1 Limpeza via clearAllPreviewState()
seedAllPreviewState();
assert(memoryStorage.has(PREVIEW_STORAGE_KEYS.SESSION), 'Sessão temporária presente antes da limpeza');
assert(memoryStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), 'Atividade presente antes da limpeza');
assert(memoryStorage.has(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW), 'Controle visual presente antes da limpeza');
assert(memoryStorage.has(UNRELATED_KEY), 'Registro alheio presente antes da limpeza');

clearAllPreviewState();

assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.SESSION), 'Sessão temporária DEVE ser removida');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), 'Atividade DEVE ser removida');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW), 'Controle visual DEVE ser removido');
assert(memoryStorage.has(UNRELATED_KEY), 'Registro não relacionado (agrocore:preferencia:visual) DEVE PERMANECER INTACTO');
assert(memoryStorage.get(UNRELATED_KEY) === UNRELATED_VALUE, 'Valor do registro não relacionado deve ser idêntico');

// 5.2 Idempotência: chamadas sucessivas não lançam exceção e preservam registros alheios
clearAllPreviewState();
clearAllPreviewState();
assert(memoryStorage.has(UNRELATED_KEY), 'Registro alheio permanece intacto após múltiplas limpezas');
console.log('  ✓ Limpeza atômica, seletiva e idempotente comprovada');

// -------------------------------------------------------------
// TESTE 6: Limpeza em todas as Formas de Encerramento (Idempotência e Neutralidade)
// -------------------------------------------------------------
console.log('\nTESTE 6: Comprovação de limpeza atômica em todas as formas de encerramento');

const previewGateway = new PreviewAuthGateway();

// Cenário A: Logout manual padrão (usado por Sidebar, Topbar, MobileDrawer e botão "Sair agora")
seedAllPreviewState();
await previewGateway.signOut();

assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.SESSION), '[Logout Manual] Sessão removida');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), '[Logout Manual] Atividade removida');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW), '[Logout Manual] Recuperação removida');
assert(memoryStorage.has(UNRELATED_KEY), '[Logout Manual] Registro alheio preservado');

// Cenário B: Encerramento por inatividade (disparado pelo ciclo de vida / hook)
seedAllPreviewState();
clearAllPreviewState();

assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.SESSION), '[Inatividade] Sessão removida');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), '[Inatividade] Atividade removida');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW), '[Inatividade] Recuperação removida');
assert(memoryStorage.has(UNRELATED_KEY), '[Inatividade] Registro alheio preservado');

// Cenário C: Sessão estruturalmente inválida detectada na restauração inicial
seedAllPreviewState();
memoryStorage.set(PREVIEW_STORAGE_KEYS.SESSION, '{ json_invalido_corrompido');
const restoredSession = await previewGateway.getInitialSession();

assert(restoredSession === null, '[Sessão Inválida] Retorno deve ser null');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.SESSION), '[Sessão Inválida] Sessão removida');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), '[Sessão Inválida] Atividade removida');
assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW), '[Sessão Inválida] Recuperação removida');
assert(memoryStorage.has(UNRELATED_KEY), '[Sessão Inválida] Registro alheio preservado');

console.log('  ✓ Limpeza comprovada em todas as formas de encerramento');

// -------------------------------------------------------------
// TESTE 7: Regressão dos 7 Perfis de Desenvolvimento
// -------------------------------------------------------------
console.log('\nTESTE 7: Regressão dos 7 perfis de desenvolvimento');

for (const acc of PREVIEW_ACCOUNTS) {
  memoryStorage.clear();
  memoryStorage.set(UNRELATED_KEY, UNRELATED_VALUE);

  const session = await previewGateway.signIn({ email: acc.email, password: acc.password });
  assert(session !== null, `Perfil ${acc.email} deve autenticar`);
  assert(memoryStorage.has(PREVIEW_STORAGE_KEYS.SESSION), `Sessão criada para ${acc.email}`);
  assert(memoryStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), `Atividade criada para ${acc.email}`);
  assert(memoryStorage.has(UNRELATED_KEY), `Registro alheio mantido para ${acc.email}`);

  await previewGateway.signOut();
  assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.SESSION), `Sessão limpa para ${acc.email}`);
  assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.ACTIVITY), `Atividade limpa para ${acc.email}`);
  assert(!memoryStorage.has(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW), `Recuperação limpa para ${acc.email}`);
  assert(memoryStorage.has(UNRELATED_KEY), `Registro alheio intacto após logout de ${acc.email}`);
}
console.log('  ✓ 7 perfis testados com criação, atividade e encerramento limpo');

console.log('\n================================================================');
console.log(`✅ TOTAL DE TESTES: ${totalTests} | APROVADOS: ${passedTests} (100% de sucesso)`);
console.log('================================================================');
