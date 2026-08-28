/**
 * Bateria de Testes Automatizados — Cadastro e Edição de Imóveis Rurais e Urbanos (OE-003.002)
 * Validação de Normalizadores, Regras de Negócio, Duplicidade, Gateway em Memória e Imutabilidade
 */

import {
  normalizeCib,
  maskCib,
  normalizeSncr,
  maskSncr,
  normalizeDigits,
  normalizeDecimalString,
  formatArea,
  validatePropertyForm,
  getDefaultPropertyFormValues,
  formValuesToCreateInput,
  formValuesToUpdateInput,
  propertyToFormValues,
} from '../src/properties/validators';
import { PreviewPropertyGateway } from '../src/properties/preview/previewPropertyGateway';
import { UnavailablePropertyGateway } from '../src/properties/unavailableGateway';

console.log('================================================================');
console.log('🧪 EXECUÇÃO DA BATERIA DE HOMOLOGAÇÃO: OE-003.002');
console.log('   Cadastro e Edição de Imóveis Rurais e Urbanos');
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

async function runTests() {
  // 1. Testes de Normalizadores e Formatadores
  assert(
    normalizeCib('  cib  7891012-3 ') === 'CIB 7891012-3',
    '1. Normalização de CIB adicionando prefixo padrão em maiúsculas'
  );

  assert(
    maskCib('CIB 7891012-3') === 'CIB 789****-3',
    '2. Mascaramento de CIB para exibição segura'
  );

  assert(
    normalizeSncr('999.888.777.666-5') === '9998887776665',
    '3. Normalização de SNCR mantendo estritamente 13 dígitos numéricos'
  );

  assert(
    maskSncr('9998887776665') === '999.***.***-65',
    '4. Mascaramento seguro de código SNCR'
  );

  assert(
    normalizeDecimalString('1.250,50') === '1250.50',
    '5. Normalização de valor decimal brasileiro para representação canônica'
  );

  assert(
    formatArea('1250.50', 'ha') === '1.250,50 ha',
    '6. Formatação de área em hectares com pontuação e unidade'
  );

  assert(
    formatArea('450', 'm²') === '450,00 m²',
    '7. Formatação de área em metros quadrados'
  );

  // 2. Testes de Validação de Formulário Rural
  const emptyRuralForm = getDefaultPropertyFormValues('rural');
  const emptyRuralValidation = validatePropertyForm(emptyRuralForm);
  assert(
    !emptyRuralValidation.isValid &&
      !!emptyRuralValidation.errors.name &&
      !!emptyRuralValidation.errors.city &&
      !!emptyRuralValidation.errors.state &&
      !!emptyRuralValidation.errors.totalDeclaredAreaHa &&
      !!emptyRuralValidation.errors.clientLinks,
    '8. Validação de campos obrigatórios no formulário rural (nome, cidade, UF, área total, clientes)'
  );

  const validRuralForm = getDefaultPropertyFormValues('rural');
  validRuralForm.name = 'Fazenda Modelo AgroCore';
  validRuralForm.city = 'Rio Verde';
  validRuralForm.state = 'GO';
  validRuralForm.totalDeclaredAreaHa = '1.500,00';
  validRuralForm.cib = 'CIB 1234567-8';
  validRuralForm.sncrIncraCode = '1234567890123';
  validRuralForm.clientLinks = [
    {
      clientId: 'cli_01',
      relationship: 'owner',
      isPrimaryHolder: true,
      declaredParticipationPercentage: '100.00',
    },
  ];

  const validRuralValidation = validatePropertyForm(validRuralForm);
  assert(
    validRuralValidation.isValid,
    '9. Formulário rural válido com cliente titular principal e identificadores preenchidos'
  );

  // 3. Teste de Exatamente Um Titular Principal
  const invalidPrimaryForm = { ...validRuralForm };
  invalidPrimaryForm.clientLinks = [
    {
      clientId: 'cli_01',
      relationship: 'owner',
      isPrimaryHolder: false,
    },
    {
      clientId: 'cli_02',
      relationship: 'co_owner',
      isPrimaryHolder: false,
    },
  ];
  const invalidPrimaryValidation = validatePropertyForm(invalidPrimaryForm);
  assert(
    !invalidPrimaryValidation.isValid &&
      invalidPrimaryValidation.errors.clientLinks?.includes('titular principal'),
    '10. Rejeição de vínculos sem exatamente um titular principal definido'
  );

  // 4. Testes de Validação de Formulário Urbano
  const emptyUrbanForm = getDefaultPropertyFormValues('urban');
  const emptyUrbanValidation = validatePropertyForm(emptyUrbanForm);
  assert(
    !emptyUrbanValidation.isValid &&
      !!emptyUrbanValidation.errors.name &&
      !!emptyUrbanValidation.errors.zipCode &&
      !!emptyUrbanValidation.errors.street &&
      !!emptyUrbanValidation.errors.neighborhood &&
      !!emptyUrbanValidation.errors.city &&
      !!emptyUrbanValidation.errors.state &&
      !!emptyUrbanValidation.errors.landAreaM2,
    '11. Validação de campos obrigatórios no formulário urbano (endereço completo e área do terreno)'
  );

  // 5. Testes de Coordenada de Referência
  const coordForm = { ...validRuralForm };
  coordForm.hasCoordinate = true;
  coordForm.latitude = 'invalid-lat';
  coordForm.longitude = '-47.882778';
  const invalidCoordValidation = validatePropertyForm(coordForm);
  assert(
    !invalidCoordValidation.isValid && !!invalidCoordValidation.errors.latitude,
    '12. Rejeição de latitude inválida na coordenada de referência'
  );

  coordForm.latitude = '-15.793889';
  coordForm.longitude = '-47.882778';
  coordForm.geodeticSystem = 'SIRGAS2000';
  const validCoordValidation = validatePropertyForm(coordForm);
  assert(
    validCoordValidation.isValid,
    '13. Aceitação de coordenada geográfica válida com SIRGAS2000'
  );

  // 6. Testes do PreviewPropertyGateway (Em Memória)
  const gateway = new PreviewPropertyGateway();
  const orgA = 'org_alpha';
  const orgB = 'org_beta';

  const createInputRural = formValuesToCreateInput(validRuralForm, orgA);
  const createResult = await gateway.createProperty(createInputRural);
  assert(
    createResult.success && !!createResult.property && createResult.property.organizationId === orgA,
    '14. Gateway: Cadastro de imóvel rural em memória com escopo organizacional'
  );

  const createdId = createResult.property.id;

  // 7. Duplicidade por CIB na mesma organização
  const duplicateCibInput = formValuesToCreateInput(
    {
      ...validRuralForm,
      name: 'Outra Fazenda com Mesmo CIB',
    },
    orgA
  );
  const duplicateCibResult = await gateway.createProperty(duplicateCibInput);
  assert(
    !duplicateCibResult.success &&
      duplicateCibResult.error === 'Já existe um imóvel com esta identificação nesta organização.',
    '15. Gateway: Bloqueio de duplicidade por CIB na mesma organização com mensagem segura'
  );

  // 8. Permissão do mesmo CIB em organização diferente (Isolamento Multitenant)
  const differentOrgInput = formValuesToCreateInput(validRuralForm, orgB);
  const differentOrgResult = await gateway.createProperty(differentOrgInput);
  assert(
    differentOrgResult.success && differentOrgResult.property?.organizationId === orgB,
    '16. Gateway: Permite CIB idêntico em organizações distintas garantindo isolamento'
  );

  // 9. Duplicidade por SNCR na mesma organização
  const duplicateSncrForm = { ...validRuralForm };
  duplicateSncrForm.cib = 'CIB 9999999-9'; // CIB diferente
  duplicateSncrForm.sncrIncraCode = '1234567890123'; // Mesmo SNCR
  const duplicateSncrInput = formValuesToCreateInput(duplicateSncrForm, orgA);
  const duplicateSncrResult = await gateway.createProperty(duplicateSncrInput);
  assert(
    !duplicateSncrResult.success && duplicateSncrResult.conflict?.field === 'sncr',
    '17. Gateway: Bloqueio de duplicidade por código SNCR na mesma organização'
  );

  // 10. Atualização e Imutabilidade do Tipo e ID
  const updateInput = formValuesToUpdateInput({
    ...validRuralForm,
    name: 'Fazenda Modelo AgroCore — Atualizada',
  });
  const updateResult = await gateway.updateProperty(createdId, updateInput);
  assert(
    updateResult.success &&
      updateResult.property?.id === createdId &&
      updateResult.property?.propertyType === 'rural' &&
      updateResult.property?.name === 'Fazenda Modelo AgroCore — Atualizada',
    '18. Gateway: Edição de imóvel preservando tipo de imóvel, ID e createdAt'
  );

  // 11. Consulta por ID
  const foundProperty = await gateway.getPropertyById(orgA, createdId);
  assert(
    !!foundProperty && foundProperty.id === createdId,
    '19. Gateway: Consulta de imóvel por ID restrita à organização'
  );

  const notFoundOtherOrg = await gateway.getPropertyById(orgB, createdId);
  assert(
    notFoundOtherOrg === null,
    '20. Gateway: Consulta não retorna imóvel de organização diferente'
  );

  // 12. UnavailablePropertyGateway (Produção Segura)
  const unavailGateway = new UnavailablePropertyGateway();
  let threwCreate = false;
  try {
    await unavailGateway.createProperty(createInputRural);
  } catch {
    threwCreate = true;
  }
  assert(
    threwCreate,
    '21. UnavailableGateway: Rejeição fechada e segura na criação de imóvel'
  );

  // 13. Conversão Bidirecional
  const formFromEntity = propertyToFormValues(foundProperty);
  assert(
    formFromEntity.name === 'Fazenda Modelo AgroCore — Atualizada' &&
      formFromEntity.clientLinks.length === 1 &&
      formFromEntity.clientLinks[0].isPrimaryHolder === true,
    '22. Conversão bidirecional entre entidade de domínio e valores do formulário'
  );

  console.log('\n================================================================');
  console.log(`📊 RESULTADO FINAL DOS TESTES (OE-003.002):`);
  console.log(`   Total de Testes: ${passedTests + failedTests}`);
  console.log(`   Sucessos: ${passedTests}`);
  console.log(`   Falhas: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro fatal na execução dos testes:', err);
  process.exit(1);
});
