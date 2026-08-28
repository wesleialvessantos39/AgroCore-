import { PREVIEW_ACCOUNTS, buildSessionFromAccount } from '../src/auth/preview/previewAccounts.ts';
import { PreviewAuthGateway } from '../src/auth/preview/previewGateway.ts';
import { UnavailableAuthGateway } from '../src/auth/unavailableGateway.ts';
import { ROUTES } from '../src/routes/paths.ts';
import {
  evaluatePasswordPolicy,
  PASSWORD_RULES,
} from '../src/auth/passwordPolicy.ts';
import {
  createPreviewRecoverySession,
  isPreviewRecoverySessionValid,
  clearPreviewRecoverySession,
  PREVIEW_RECOVERY_STORAGE_KEY,
  PREVIEW_RECOVERY_SCHEMA_VERSION,
  PREVIEW_RECOVERY_PURPOSE,
  PREVIEW_RECOVERY_MAX_DURATION_MS,
} from '../src/auth/preview/previewRecoveryControl.ts';
import {
  requestAccessRecovery,
  isValidEmailFormat,
} from '../src/auth/recoveryService.ts';

// Mock de ambiente de navegador para testes
const memoryStorage = new Map();
globalThis.sessionStorage = {
  getItem: (key) => memoryStorage.get(key) || null,
  setItem: (key, val) => memoryStorage.set(key, String(val)),
  removeItem: (key) => memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
};
globalThis.window = globalThis;

console.log('================================================================');
console.log('BATERIA DE TESTES AUTOMATIZADOS — OE-001.001 & OE-001.002');
console.log('CONTROLE VISUAL TEMPORÁRIO, RECUPERAÇÃO DE ACESSO E ATUALIZAÇÃO VISUAL');
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
// TESTE 1: Validação regressiva dos 7 perfis e acesso efetivo
// -------------------------------------------------------------
console.log('TESTE 1: Acesso efetivo dos 7 perfis e validação de papéis, escopo e organização');

assert(PREVIEW_ACCOUNTS.length === 7, 'Devem existir exatamente 7 perfis configurados');

const expectedProfiles = [
  {
    code: 'platform_super_admin',
    email: 'superadmin@agrocore.test',
    password: 'AgroCore@Teste1',
    scope: 'platform',
    orgName: null,
    platformRole: 'platform_super_admin',
    orgRole: 'none',
  },
  {
    code: 'owner',
    email: 'proprietario@agrocore.test',
    password: 'AgroCore@Teste1',
    scope: 'organization',
    orgName: 'Organização de acompanhamento',
    platformRole: 'none',
    orgRole: 'owner',
  },
  {
    code: 'company_admin',
    email: 'administrador@agrocore.test',
    password: 'AgroCore@Teste1',
    scope: 'organization',
    orgName: 'Organização de acompanhamento',
    platformRole: 'none',
    orgRole: 'company_admin',
  },
  {
    code: 'manager',
    email: 'gerente@agrocore.test',
    password: 'AgroCore@Teste1',
    scope: 'organization',
    orgName: 'Organização de acompanhamento',
    platformRole: 'none',
    orgRole: 'manager',
  },
  {
    code: 'project_designer',
    email: 'projetista@agrocore.test',
    password: 'AgroCore@Teste1',
    scope: 'organization',
    orgName: 'Organização de acompanhamento',
    platformRole: 'none',
    orgRole: 'project_designer',
  },
  {
    code: 'finance',
    email: 'financeiro@agrocore.test',
    password: 'AgroCore@Teste1',
    scope: 'organization',
    orgName: 'Organização de acompanhamento',
    platformRole: 'none',
    orgRole: 'finance',
  },
  {
    code: 'capturer',
    email: 'captador@agrocore.test',
    password: 'AgroCore@Teste1',
    scope: 'organization',
    orgName: 'Organização de acompanhamento',
    platformRole: 'none',
    orgRole: 'capturer',
  },
];

const gateway = new PreviewAuthGateway();

for (const exp of expectedProfiles) {
  memoryStorage.clear();
  const session = await gateway.signIn({ email: exp.email, password: exp.password });

  assert(session !== null, `Acesso para ${exp.email} deve retornar sessão de acompanhamento`);
  assert(session.user.email === exp.email, `E-mail na sessão deve ser ${exp.email}`);
  assert(session.platformRole === exp.platformRole, `platformRole de ${exp.code} deve ser ${exp.platformRole}`);
  assert(session.organizationRole === exp.orgRole, `organizationRole de ${exp.code} deve ser ${exp.orgRole}`);
  assert(session.organizationName === exp.orgName, `organizationName de ${exp.code} deve ser ${exp.orgName}`);
  assert(session.isPreview === true, `Flag isPreview deve ser true`);
  assert(session.mode === 'preview', `Modo deve ser preview`);

  if (exp.scope === 'platform') {
    assert(session.activeOrganizationId === null, `Superadmin não deve ter activeOrganizationId`);
  } else {
    assert(session.activeOrganizationId === 'preview-org-001', `Organização deve ter activeOrganizationId preenchido`);
  }

  console.log(`  ✓ Acesso bem-sucedido: [${exp.code}] ${exp.email} -> Escopo: ${exp.scope}`);
}

// -------------------------------------------------------------
// TESTE 2: Rejeição neutra de credenciais inválidas
// -------------------------------------------------------------
console.log('\nTESTE 2: Rejeição neutra de credenciais inválidas');
let wrongPasswordThrew = false;
try {
  await gateway.signIn({ email: 'superadmin@agrocore.test', password: 'SenhaIncorreta123!' });
} catch (err) {
  wrongPasswordThrew = true;
  assert(err.message === 'E-mail ou senha inválidos', 'Mensagem de erro deve ser amigável e neutra');
}
assert(wrongPasswordThrew, 'Tentativa de acesso com senha incorreta DEVE lançar exceção');

let nonExistentEmailThrew = false;
try {
  await gateway.signIn({ email: 'usuario_inexistente@agrocore.test', password: 'AgroCore@Teste1' });
} catch (err) {
  nonExistentEmailThrew = true;
  assert(err.message === 'E-mail ou senha inválidos', 'Mensagem de erro deve ser amigável e neutra');
}
assert(nonExistentEmailThrew, 'Tentativa de acesso com e-mail inexistente DEVE lançar exceção');
console.log('  ✓ Credenciais incorretas rejeitadas com neutralidade');

// -------------------------------------------------------------
// TESTE 3: Restauração de sessão de desenvolvimento e verificação estrutural
// -------------------------------------------------------------
console.log('\nTESTE 3: Restauração de sessão de desenvolvimento');
memoryStorage.clear();
await gateway.signIn({ email: 'proprietario@agrocore.test', password: 'AgroCore@Teste1' });
const restoredSession = await gateway.getInitialSession();
assert(restoredSession !== null, 'Sessão válida de desenvolvimento restaurada');
assert(restoredSession.organizationRole === 'owner', 'Papel consistente');

// Rejeição de payload com dados inconsistentes
memoryStorage.set('agrocore:preview:session', JSON.stringify({
  user: { id: 'preview-usr-capturer', email: 'captador@agrocore.test' },
  mode: 'preview',
  platformRole: 'platform_super_admin', // Inconsistência de privilégio
  organizationRole: 'owner',
}));
const tampered = await gateway.getInitialSession();
assert(tampered === null, 'Sessão inconsistente deve ser rejeitada e descartada');
assert(!memoryStorage.has('agrocore:preview:session'), 'Storage limpo após descarte');
console.log('  ✓ Consistência de sessão de desenvolvimento validada');

// -------------------------------------------------------------
// TESTE 4: Validação de Formato de E-mail (Recuperação de Acesso)
// -------------------------------------------------------------
console.log('\nTESTE 4: Validação de e-mail na recuperação de acesso');

assert(!isValidEmailFormat(''), 'E-mail vazio deve ser inválido');
assert(!isValidEmailFormat('   '), 'E-mail em branco deve ser inválido');
assert(!isValidEmailFormat('email_sem_arroba.com'), 'E-mail sem @ deve ser inválido');
assert(!isValidEmailFormat('@sem_usuario.com'), 'E-mail sem usuário deve ser inválido');
assert(!isValidEmailFormat('usuario@sem_dominio'), 'E-mail sem domínio deve ser inválido');
assert(isValidEmailFormat('usuario@agrocore.com.br'), 'E-mail válido comum deve ser aceito');
assert(isValidEmailFormat('superadmin@agrocore.test'), 'E-mail de desenvolvimento deve ser aceito');
assert(isValidEmailFormat('contato+teste@fazenda.com.br'), 'E-mail com alias + deve ser aceito');
console.log('  ✓ Validação sintática de e-mail aprovada');

// -------------------------------------------------------------
// TESTE 5: Solicitação de Recuperação e Resposta Honesta
// -------------------------------------------------------------
console.log('\nTESTE 5: Solicitação de recuperação com comunicação honesta');

// 5.1 E-mail vazio
const emptyRes = await requestAccessRecovery('');
assert(emptyRes.outcome === 'validation_error', 'E-mail vazio deve retornar validation_error');
assert(!emptyRes.canProceedToResetVisual, 'Não deve permitir avançar com e-mail vazio');

// 5.2 E-mail inválido
const invalidRes = await requestAccessRecovery('email-invalido');
assert(invalidRes.outcome === 'validation_error', 'E-mail inválido deve retornar validation_error');
assert(!invalidRes.canProceedToResetVisual, 'Não deve permitir avançar com e-mail inválido');

// 5.3 E-mail sintaticamente válido em DEV
memoryStorage.clear();
const validRes = await requestAccessRecovery('usuario.qualquer@empresa.com.br');
assert(validRes.outcome === 'dev_preview_authorized', 'E-mail válido deve autorizar visualização no dev');
assert(
  validRes.message === 'Este é um fluxo de acompanhamento. Nenhum e-mail foi enviado e nenhuma alteração de acesso foi realizada.',
  'Mensagem honesta mandatória deve ser retornada'
);
assert(validRes.canProceedToResetVisual === true, 'Deve permitir navegar para visualização de reset');
console.log('  ✓ Comunicação honesta e resposta neutra validadas');

// -------------------------------------------------------------
// TESTE 6: Controle Visual Temporário (Sem Identificadores Aleatórios nem Dados Pessoais)
// -------------------------------------------------------------
console.log('\nTESTE 6: Validação estrutural do controle visual temporário');

memoryStorage.clear();
assert(!isPreviewRecoverySessionValid(), 'Sem chave, isPreviewRecoverySessionValid deve ser false');

const created = createPreviewRecoverySession();
assert(created === true, 'createPreviewRecoverySession deve retornar true');
assert(memoryStorage.has(PREVIEW_RECOVERY_STORAGE_KEY), 'Chave do controle visual deve existir');

const storedRaw = memoryStorage.get(PREVIEW_RECOVERY_STORAGE_KEY);
const storedObj = JSON.parse(storedRaw);

// 6.1 Comprovação de ausência de identificadores aleatórios, UUIDs, tokens, hashes ou segredos
assert(!('flowId' in storedObj), 'NÃO DEVE conter flowId');
assert(!('id' in storedObj), 'NÃO DEVE conter id');
assert(!('uuid' in storedObj), 'NÃO DEVE conter uuid');
assert(!('token' in storedObj), 'NÃO DEVE conter token');
assert(!('nonce' in storedObj), 'NÃO DEVE conter nonce');
assert(!('hash' in storedObj), 'NÃO DEVE conter hash');
assert(!('signature' in storedObj), 'NÃO DEVE conter signature');
assert(!('secret' in storedObj), 'NÃO DEVE conter secret');

// 6.2 Comprovação de ausência de dados pessoais ou credenciais
assert(!('email' in storedObj), 'NÃO DEVE conter email');
assert(!('password' in storedObj), 'NÃO DEVE conter password');
assert(!('user' in storedObj), 'NÃO DEVE conter user');
assert(!('role' in storedObj), 'NÃO DEVE conter role');
assert(!('organization' in storedObj), 'NÃO DEVE conter organization');
assert(!('accountId' in storedObj), 'NÃO DEVE conter accountId');
assert(!('credentials' in storedObj), 'NÃO DEVE conter credentials');

// 6.3 Comprovação dos campos estritos permitidos (versão, finalidade, booleano, expiração)
assert(storedObj.version === PREVIEW_RECOVERY_SCHEMA_VERSION, `Versão deve ser ${PREVIEW_RECOVERY_SCHEMA_VERSION}`);
assert(storedObj.purpose === PREVIEW_RECOVERY_PURPOSE, `Finalidade deve ser ${PREVIEW_RECOVERY_PURPOSE}`);
assert(storedObj.isVisualAuthorized === true, 'isVisualAuthorized deve ser booleano true');
assert(typeof storedObj.expiresAt === 'number', 'expiresAt deve ser timestamp numérico');
assert(Object.keys(storedObj).length === 4, 'Deve conter EXATAMENTE 4 propriedades estruturais');

assert(isPreviewRecoverySessionValid() === true, 'Controle visual recém-criado deve ser válido');

// 6.4 Rejeição de JSON inválido
memoryStorage.set(PREVIEW_RECOVERY_STORAGE_KEY, '{ invalid json');
assert(isPreviewRecoverySessionValid() === false, 'JSON inválido deve ser rejeitado');
assert(!memoryStorage.has(PREVIEW_RECOVERY_STORAGE_KEY), 'Chave com JSON inválido deve ser removida');

// 6.5 Rejeição de estrutura incompatível (não-objeto ou array)
memoryStorage.set(PREVIEW_RECOVERY_STORAGE_KEY, JSON.stringify([1, 2, 3]));
assert(isPreviewRecoverySessionValid() === false, 'Array deve ser rejeitado');
assert(!memoryStorage.has(PREVIEW_RECOVERY_STORAGE_KEY), 'Chave com array deve ser removida');

// 6.6 Rejeição de campos ausentes
memoryStorage.set(
  PREVIEW_RECOVERY_STORAGE_KEY,
  JSON.stringify({
    version: PREVIEW_RECOVERY_SCHEMA_VERSION,
    purpose: PREVIEW_RECOVERY_PURPOSE,
    isVisualAuthorized: true,
    // expiresAt ausente
  })
);
assert(isPreviewRecoverySessionValid() === false, 'Campos ausentes devem ser rejeitados');
assert(!memoryStorage.has(PREVIEW_RECOVERY_STORAGE_KEY), 'Chave incompleta deve ser removida');

// 6.7 Rejeição de versão desconhecida
memoryStorage.set(
  PREVIEW_RECOVERY_STORAGE_KEY,
  JSON.stringify({
    version: '2.0-invalida',
    purpose: PREVIEW_RECOVERY_PURPOSE,
    isVisualAuthorized: true,
    expiresAt: Date.now() + 10 * 60 * 1000,
  })
);
assert(isPreviewRecoverySessionValid() === false, 'Versão desconhecida deve ser rejeitada');

// 6.8 Rejeição de finalidade incorreta
memoryStorage.set(
  PREVIEW_RECOVERY_STORAGE_KEY,
  JSON.stringify({
    version: PREVIEW_RECOVERY_SCHEMA_VERSION,
    purpose: 'finalidade_incorreta',
    isVisualAuthorized: true,
    expiresAt: Date.now() + 10 * 60 * 1000,
  })
);
assert(isPreviewRecoverySessionValid() === false, 'Finalidade incorreta deve ser rejeitada');

// 6.9 Rejeição de autorização visual diferente de true
memoryStorage.set(
  PREVIEW_RECOVERY_STORAGE_KEY,
  JSON.stringify({
    version: PREVIEW_RECOVERY_SCHEMA_VERSION,
    purpose: PREVIEW_RECOVERY_PURPOSE,
    isVisualAuthorized: false,
    expiresAt: Date.now() + 10 * 60 * 1000,
  })
);
assert(isPreviewRecoverySessionValid() === false, 'isVisualAuthorized=false deve ser rejeitado');

// 6.10 Rejeição de data inválida ou NaN
memoryStorage.set(
  PREVIEW_RECOVERY_STORAGE_KEY,
  JSON.stringify({
    version: PREVIEW_RECOVERY_SCHEMA_VERSION,
    purpose: PREVIEW_RECOVERY_PURPOSE,
    isVisualAuthorized: true,
    expiresAt: NaN,
  })
);
assert(isPreviewRecoverySessionValid() === false, 'Data NaN deve ser rejeitada');

// 6.11 Rejeição de autorização expirada (mais de 15 minutos)
memoryStorage.set(
  PREVIEW_RECOVERY_STORAGE_KEY,
  JSON.stringify({
    version: PREVIEW_RECOVERY_SCHEMA_VERSION,
    purpose: PREVIEW_RECOVERY_PURPOSE,
    isVisualAuthorized: true,
    expiresAt: Date.now() - 1000, // Expirado há 1 segundo
  })
);
assert(isPreviewRecoverySessionValid() === false, 'Controle expirado DEVE ser rejeitado');
assert(!memoryStorage.has(PREVIEW_RECOVERY_STORAGE_KEY), 'Chave expirada deve ser removida');

// 6.12 Rejeição de campos adicionais não permitidos
memoryStorage.set(
  PREVIEW_RECOVERY_STORAGE_KEY,
  JSON.stringify({
    version: PREVIEW_RECOVERY_SCHEMA_VERSION,
    purpose: PREVIEW_RECOVERY_PURPOSE,
    isVisualAuthorized: true,
    expiresAt: Date.now() + 10 * 60 * 1000,
    campoExtraProibido: 'qualquer_dado',
  })
);
assert(isPreviewRecoverySessionValid() === false, 'Campos extras não permitidos DEVEM ser rejeitados');
assert(!memoryStorage.has(PREVIEW_RECOVERY_STORAGE_KEY), 'Chave com campos extras deve ser removida');

// 6.13 Remoção após cancelamento ou conclusão
createPreviewRecoverySession();
assert(isPreviewRecoverySessionValid() === true, 'Criado novamente para teste de remoção');
clearPreviewRecoverySession();
assert(!memoryStorage.has(PREVIEW_RECOVERY_STORAGE_KEY), 'clearPreviewRecoverySession deve remover a chave');
assert(isPreviewRecoverySessionValid() === false, 'Após remoção deve ser inválido');
console.log('  ✓ Validação estrutural do controle visual temporário aprovada');

// -------------------------------------------------------------
// TESTE 7: Avaliação Centralizada da Política de Senha
// -------------------------------------------------------------
console.log('\nTESTE 7: Avaliação centralizada da política de senha');

// 7.1 Senha com menos de 8 caracteres
const shortRes = evaluatePasswordPolicy('Ab1@', 'Ab1@');
assert(!shortRes.isValid, 'Senha curta deve ser inválida');
assert(shortRes.criteria.find((c) => c.id === 'length')?.met === false, 'Critério comprimento deve ser false');

// 7.2 Sem letra maiúscula
const noUpperRes = evaluatePasswordPolicy('agrocore@teste1', 'agrocore@teste1');
assert(!noUpperRes.isValid, 'Senha sem maiúscula deve ser inválida');
assert(noUpperRes.criteria.find((c) => c.id === 'uppercase')?.met === false, 'Critério uppercase deve ser false');

// 7.3 Sem letra minúscula
const noLowerRes = evaluatePasswordPolicy('AGROCORE@TESTE1', 'AGROCORE@TESTE1');
assert(!noLowerRes.isValid, 'Senha sem minúscula deve ser inválida');
assert(noLowerRes.criteria.find((c) => c.id === 'lowercase')?.met === false, 'Critério lowercase deve ser false');

// 7.4 Sem número
const noNumRes = evaluatePasswordPolicy('AgroCore@Teste', 'AgroCore@Teste');
assert(!noNumRes.isValid, 'Senha sem número deve ser inválida');
assert(noNumRes.criteria.find((c) => c.id === 'number')?.met === false, 'Critério number deve ser false');

// 7.5 Sem caractere especial
const noSpecRes = evaluatePasswordPolicy('AgroCore12345', 'AgroCore12345');
assert(!noSpecRes.isValid, 'Senha sem caractere especial deve ser inválida');
assert(noSpecRes.criteria.find((c) => c.id === 'special')?.met === false, 'Critério special deve ser false');

// 7.6 Confirmação divergente
const mismatchRes = evaluatePasswordPolicy('AgroCore@Teste1', 'AgroCore@OutraSenha2');
assert(!mismatchRes.isValid, 'Senhas divergentes devem invalidar');
assert(!mismatchRes.passwordsMatch, 'passwordsMatch deve ser false');

// 7.7 Senha em total conformidade
const validPassRes = evaluatePasswordPolicy('AgroCore@NovaSenha2026', 'AgroCore@NovaSenha2026');
assert(validPassRes.isValid === true, 'Senha em total conformidade DEVE ser válida');
assert(validPassRes.passwordsMatch === true, 'passwordsMatch deve ser true');
assert(validPassRes.criteria.every((c) => c.met), 'Todos os critérios devem ser satisfeitos');
assert(validPassRes.errorMessages.length === 0, 'Não deve haver mensagens de erro');
console.log('  ✓ Política de senhas rigorosamente verificada');

// -------------------------------------------------------------
// TESTE 8: Preservação Inalterada da Senha dos 7 Perfis e Ausência de Alteração Real
// -------------------------------------------------------------
console.log('\nTESTE 8: Preservação inalterada das credenciais de demonstração e ausência de alteração real');
for (const acc of PREVIEW_ACCOUNTS) {
  assert(acc.password === 'AgroCore@Teste1', `Senha do perfil ${acc.id} deve permanecer inalterada`);
}
console.log('  ✓ As 7 contas de acompanhamento permanecem com a senha compartilhada inalterada (nenhuma alteração real)');

// -------------------------------------------------------------
// TESTE 9: Rotas Centralizadas de Recuperação e Atualização Visual
// -------------------------------------------------------------
console.log('\nTESTE 9: Rotas centralizadas');
assert(ROUTES.SIGN_IN === '/entrar', 'Rota /entrar');
assert(ROUTES.RECOVER_ACCESS === '/recuperar-acesso', 'Rota /recuperar-acesso');
assert(ROUTES.RESET_PASSWORD === '/atualizar-senha', 'Rota /atualizar-senha');
assert(ROUTES.SYSTEM === '/sistema', 'Rota /sistema');
console.log('  ✓ Rotas centralizadas validadas');

console.log('\n================================================================');
console.log(`✅ TOTAL DE TESTES: ${totalTests} | APROVADOS: ${passedTests} (100% de sucesso)`);
console.log('================================================================');
