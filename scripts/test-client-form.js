/**
 * Bateria de Testes Automatizados — Modelagem Cadastral e Formulário de Clientes (OE-002.002)
 *
 * 30 Casos de Teste cobrindo:
 * - Validações de PF e PJ
 * - Validação algorítmica de CPF e CNPJ
 * - Validação de Inscrição Estadual (com e sem isenção)
 * - Validação de Contatos (Telefone principal, secundário, WhatsApp e E-mail)
 * - Validação de Endereço Urbano e Rural
 * - Mapeamento e Sanitização de Entradas
 * - Isolamento Organizacional, CRUD em memória e Proteção contra Duplicidade no PreviewGateway
 */

import {
  isValidCpf,
  isValidCnpj,
  isValidPhone,
  isValidEmail,
  isValidCep,
  isValidBirthDate,
  isValidStateRegistration,
  formatCpf,
  formatCnpj,
  formatPhone,
  formatCep,
  normalizeDigits,
  normalizeText,
  validateClientForm,
  formValuesToCreateInput,
  formValuesToUpdateInput,
} from '../src/clients/validators.ts';
import { PreviewClientGateway } from '../src/clients/preview/previewClientGateway.ts';

console.log('================================================================');
console.log('🧪 EXECUÇÃO DA BATERIA DE HOMOLOGAÇÃO: OE-002.002');
console.log('   Modelagem Cadastral e Formulário de Clientes PF e PJ');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (details) console.error(`   Detalhes: ${details}`);
    failedTests++;
  }
}

// -------------------------------------------------------------
// BLOCO 1: Validação de CPF e CNPJ
// -------------------------------------------------------------

// Gerador/Validador de CPF de teste conhecido válido: 52998224725 -> 529.982.247-25
const VALID_CPF = '52998224725';
const INVALID_CPF_DIGIT = '52998224724';
const REPEATED_CPF = '11111111111';

assert(isValidCpf(VALID_CPF) === true, '1. Validação de CPF algorítmico válido');
assert(isValidCpf(INVALID_CPF_DIGIT) === false, '2. Rejeição de CPF com dígito verificador incorreto');
assert(isValidCpf(REPEATED_CPF) === false, '3. Rejeição de CPF com dígitos repetidos');
assert(isValidCpf('123') === false, '4. Rejeição de CPF com tamanho insuficiente');

// CNPJ válido: 00.000.000/0001-91
const VALID_CNPJ = '00000000000191';
const INVALID_CNPJ = '00000000000192';
const REPEATED_CNPJ = '11111111111111';

assert(isValidCnpj(VALID_CNPJ) === true, '5. Validação de CNPJ algorítmico válido');
assert(isValidCnpj(INVALID_CNPJ) === false, '6. Rejeição de CNPJ com dígito verificador incorreto');
assert(isValidCnpj(REPEATED_CNPJ) === false, '7. Rejeição de CNPJ com dígitos repetidos');

// -------------------------------------------------------------
// BLOCO 2: Validação de Contatos (Telefones e E-mail)
// -------------------------------------------------------------

assert(isValidPhone('62999998888') === true, '8. Validação de telefone celular com 11 dígitos e 9 inicial');
assert(isValidPhone('6233334444') === true, '9. Validação de telefone fixo com 10 dígitos');
assert(isValidPhone('62888888888') === false, '10. Rejeição de celular com 11 dígitos sem 9 após DDD');
assert(isValidPhone('05999998888') === false, '11. Rejeição de telefone com DDD inválido (< 11)');

assert(isValidEmail('produtor@agrocore.com.br') === true, '12. Validação de e-mail sintaticamente correto');
assert(isValidEmail('') === true, '13. E-mail opcional aceita vazio');
assert(isValidEmail('invalido@') === false, '14. Rejeição de e-mail com formato inválido');

// -------------------------------------------------------------
// BLOCO 3: Inscrição Estadual e Data de Nascimento
// -------------------------------------------------------------

assert(isValidStateRegistration('', true) === true, '15. Inscrição estadual opcional quando isento');
assert(isValidStateRegistration('', false) === false, '16. Rejeição de IE vazia quando não isento');
assert(isValidStateRegistration('10.987.654-3', false) === true, '17. Aceitação de formato alfanumérico para IE');

assert(isValidBirthDate('1985-05-20') === true, '18. Validação de data de nascimento no passado');
assert(isValidBirthDate('2099-01-01') === false, '19. Rejeição de data de nascimento futura');

// -------------------------------------------------------------
// BLOCO 4: Validação do Formulário Completo (Pessoa Física)
// -------------------------------------------------------------

const validPfForm = {
  personType: 'individual',
  name: 'Carlos Eduardo Mendes',
  cpf: '529.982.247-25',
  rg: '1234567',
  rgIssuer: 'SSP',
  rgState: 'GO',
  birthDate: '1980-10-15',
  stateRegistration: '109876543',
  isStateRegistrationExempt: false,
  status: 'active',
  primaryPhone: '(62) 99999-1111',
  hasWhatsapp: true,
  secondaryPhone: '(62) 3333-2222',
  email: 'carlos.mendes@agro.com.br',
  addressType: 'urban',
  zipCode: '74000-000',
  street: 'Av. Goiás',
  number: '500',
  isNoNumber: false,
  neighborhood: 'Setor Central',
  city: 'Goiânia',
  state: 'GO',
  complement: 'Apto 101',
  referencePoint: 'Próximo à Praça Cívica',
  locality: '',
  accessDescription: '',
  ruralZipCode: '',
  ruralComplement: '',
};

const errorsPf = validateClientForm(validPfForm);
assert(Object.keys(errorsPf).length === 0, '20. Formulário PF válido sem nenhum erro');

const invalidPfForm = {
  ...validPfForm,
  name: 'Jo', // curto
  cpf: '123456', // inválido
  primaryPhone: '', // obrigatório
  secondaryPhone: '12345', // telefone secundário inválido
  city: '', // obrigatório
  street: '', // obrigatório no urbano
  number: '', // obrigatório quando not isNoNumber
};

const errorsInvalidPf = validateClientForm(invalidPfForm);
assert(
  !!errorsInvalidPf.name &&
  !!errorsInvalidPf.cpf &&
  !!errorsInvalidPf.primaryPhone &&
  !!errorsInvalidPf.secondaryPhone &&
  !!errorsInvalidPf.city &&
  !!errorsInvalidPf.street &&
  !!errorsInvalidPf.number,
  '21. Identificação precisa de múltiplos erros simultâneos no formulário PF'
);

// -------------------------------------------------------------
// BLOCO 5: Validação do Formulário Completo (Pessoa Jurídica & Endereço Rural)
// -------------------------------------------------------------

const validPjRuralForm = {
  personType: 'legal_entity',
  companyName: 'Agropecuária Rio Doce Ltda',
  tradeName: 'Fazenda Rio Doce',
  cnpj: '00.000.000/0001-91',
  stateRegistration: '',
  isStateRegistrationExempt: true,
  status: 'active',
  primaryPhone: '(62) 98888-2222',
  hasWhatsapp: true,
  secondaryPhone: '',
  email: 'contato@riodoce.agr.br',
  addressType: 'rural',
  zipCode: '',
  street: '',
  number: '',
  isNoNumber: false,
  neighborhood: '',
  city: 'Rio Verde',
  state: 'GO',
  complement: '',
  referencePoint: '',
  locality: 'Linha das Palmeiras, Gleba 03',
  accessDescription: 'Acesso pela Rodovia GO-174, km 15, entrar à esquerda na placa da fazenda',
  ruralZipCode: '75900-000',
  ruralComplement: 'Sede Principal',
};

const errorsPjRural = validateClientForm(validPjRuralForm);
assert(Object.keys(errorsPjRural).length === 0, '22. Formulário PJ com Endereço Rural válido sem erros');

const invalidRuralForm = {
  ...validPjRuralForm,
  locality: '', // obrigatório no rural
  accessDescription: '', // obrigatório no rural
};

const errorsInvalidRural = validateClientForm(invalidRuralForm);
assert(
  !!errorsInvalidRural.locality && !!errorsInvalidRural.accessDescription,
  '23. Validação de campos obrigatórios de endereço rural'
);

// -------------------------------------------------------------
// BLOCO 6: Mapeamento e Normalização de Entradas
// -------------------------------------------------------------

const createInput = formValuesToCreateInput(validPfForm);
assert(
  createInput.cpf === '52998224725' &&
  createInput.contact.primaryPhone === '62999991111' &&
  createInput.address.addressType === 'urban' &&
  createInput.address.zipCode === '74000000',
  '24. Sanitização e desmascaramento correto de dados via formValuesToCreateInput'
);

const updateInput = formValuesToUpdateInput(validPjRuralForm);
assert(
  updateInput.cnpj === '00000000000191' &&
  updateInput.isStateRegistrationExempt === true &&
  updateInput.address.addressType === 'rural' &&
  updateInput.address.locality === 'Linha das Palmeiras, Gleba 03',
  '25. Conversão correta de formulário PJ rural para UpdateClientInput'
);

// -------------------------------------------------------------
// BLOCO 7: PreviewClientGateway (Isolamento, CRUD e Unicidade)
// -------------------------------------------------------------

async function runGatewayTests() {
  const gateway = new PreviewClientGateway();
  const ORG_A = 'org-alphaville-01';
  const ORG_B = 'org-betaview-02';

  // 26. Criação bem-sucedida de cliente em ORG_A
  const createdClientA = await gateway.createClient(ORG_A, createInput);
  assert(
    createdClientA.id && createdClientA.organizationId === ORG_A && createdClientA.name === 'Carlos Eduardo Mendes',
    '26. Gateway cria cliente PF na organização ORG_A com sucesso'
  );

  // 27. Proteção contra duplicidade de documento na mesma organização
  let duplicateError = false;
  try {
    await gateway.createClient(ORG_A, createInput);
  } catch (err) {
    duplicateError = true;
  }
  assert(duplicateError === true, '27. Gateway impede cadastro de CPF duplicado na mesma organização');

  // 28. Isolamento: mesmo CPF pode ser cadastrado em organização diferente (ORG_B)
  const createdClientB = await gateway.createClient(ORG_B, createInput);
  assert(
    createdClientB.organizationId === ORG_B,
    '28. Isolamento organizacional permite cadastro do mesmo cliente em outra organização'
  );

  // 29. Consulta por ID e atualização de dados
  const loaded = await gateway.getClientById(ORG_A, createdClientA.id);
  assert(loaded !== null && loaded.id === createdClientA.id, '29. Consulta getClientById retorna o cliente correto');

  const updatePfInput = {
    ...createInput,
    name: 'Carlos Eduardo Mendes Silva',
  };
  const updated = await gateway.updateClient(ORG_A, createdClientA.id, updatePfInput);
  assert(
    updated.name === 'Carlos Eduardo Mendes Silva' && updated.id === createdClientA.id,
    '30. Atualização de cliente preserva integridade, id e organizationId'
  );

  console.log('\n----------------------------------------------------------------');
  console.log(`RESULTADO FINAL: ${passedTests} testes passaram | ${failedTests} falhas`);
  console.log('----------------------------------------------------------------\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runGatewayTests().catch((err) => {
  console.error('Erro inesperado na execução dos testes:', err);
  process.exit(1);
});
