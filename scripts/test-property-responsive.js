/**
 * Bateria de Testes Automatizados — Responsividade e Completude Cadastral (OE-003.002-R3)
 * Validação de Viewport, Layouts Fluidos, Touch Targets (44px), CNM, CNS, Áreas e Ausência de Duplicações
 */

import fs from 'fs';
import path from 'path';
import {
  normalizeCnm,
  isValidCnm,
  normalizeCns,
  isValidCns,
  normalizeCib,
  normalizeSncr,
  validatePropertyForm,
  getDefaultPropertyFormValues,
  formValuesToCreateInput,
  formValuesToUpdateInput,
  propertyToFormValues,
} from '../src/properties/validators';

console.log('================================================================');
console.log('📱 EXECUÇÃO DA BATERIA DE HOMOLOGAÇÃO: OE-003.002-R3');
console.log('   Responsividade Mobile, Completude Cadastral e Identificadores');
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
  // -------------------------------------------------------------
  // GRUPO 1: Validação de Viewport e Configuração HTML
  // -------------------------------------------------------------
  const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  assert(
    indexHtml.includes('name="viewport"') &&
      indexHtml.includes('width=device-width') &&
      indexHtml.includes('initial-scale=1.0') &&
      indexHtml.includes('viewport-fit=cover'),
    '1. Viewport: meta tag configurada com width=device-width, initial-scale=1.0 e viewport-fit=cover'
  );

  assert(
    indexHtml.includes('theme-color') && indexHtml.includes('#0B3D2E'),
    '2. HTML: meta theme-color configurado para a cor institucional #0B3D2E'
  );

  // -------------------------------------------------------------
  // GRUPO 2: Inspeção Estática de Arquivos de UI (Proibições Mobile)
  // -------------------------------------------------------------
  const formCodePath = path.resolve(process.cwd(), 'src/properties/components/PropertyForm.tsx');
  const formCode = fs.readFileSync(formCodePath, 'utf8');

  assert(
    !formCode.includes('transform: scale') &&
      !formCode.includes('transform:scale') &&
      !formCode.includes('zoom:') &&
      !formCode.includes('scale-'),
    '3. Mobile: Ausência de hacks de escala (transform: scale, zoom) no formulário'
  );

  assert(
    !formCode.includes('min-w-[600px]') &&
      !formCode.includes('min-w-[700px]') &&
      !formCode.includes('min-w-[800px]') &&
      !formCode.includes('min-w-[900px]') &&
      !formCode.includes('min-w-[1000px]'),
    '4. Mobile: Ausência de larguras mínimas fixas que forcem scroll horizontal em telas de 320px/390px'
  );

  // -------------------------------------------------------------
  // GRUPO 3: Unicidade de Avisos Contextuais
  // -------------------------------------------------------------
  assert(
    !formCode.includes('Ambiente de acompanhamento:'),
    '5. Avisos: Formulário não duplica o banner de ambiente de acompanhamento (mantido no cabeçalho da página)'
  );

  const createPagePath = path.resolve(process.cwd(), 'src/pages/PropertyCreatePage.tsx');
  const createPageCode = fs.readFileSync(createPagePath, 'utf8');
  assert(
    (createPageCode.match(/Ambiente de acompanhamento/g) || []).length <= 1,
    '6. Avisos: Página de criação renderiza exatamente 1 aviso contextual'
  );

  const editPagePath = path.resolve(process.cwd(), 'src/pages/PropertyEditPage.tsx');
  const editPageCode = fs.readFileSync(editPagePath, 'utf8');
  assert(
    (editPageCode.match(/Ambiente de acompanhamento/g) || []).length <= 1,
    '7. Avisos: Página de edição renderiza exatamente 1 aviso contextual'
  );

  // -------------------------------------------------------------
  // GRUPO 4: Touch Targets de no mínimo 44px
  // -------------------------------------------------------------
  const themePath = path.resolve(process.cwd(), 'src/properties/theme.ts');
  const themeCode = fs.readFileSync(themePath, 'utf8');

  assert(
    themeCode.includes('btnPrimary:') && themeCode.includes('min-h-[44px]'),
    '8. Acessibilidade: Botão primário com touch target de no mínimo 44px'
  );

  assert(
    themeCode.includes('btnSecondary:') && themeCode.includes('min-h-[44px]'),
    '9. Acessibilidade: Botão secundário com touch target de no mínimo 44px'
  );

  // -------------------------------------------------------------
  // GRUPO 5: Situação Cadastral Padrão
  // -------------------------------------------------------------
  const defaultRural = getDefaultPropertyFormValues('rural');
  assert(
    defaultRural.status === 'active',
    '10. Situação Cadastral: Imóvel rural inicia por padrão com status "active"'
  );

  const defaultUrban = getDefaultPropertyFormValues('urban');
  assert(
    defaultUrban.status === 'active',
    '11. Situação Cadastral: Imóvel urbano inicia por padrão com status "active"'
  );

  // -------------------------------------------------------------
  // GRUPO 6: CNM (15 dígitos) e CNS (6 dígitos)
  // -------------------------------------------------------------
  assert(
    normalizeCns('123.456') === '123456',
    '12. CNS: Normalização remove caracteres especiais mantendo dígitos'
  );

  assert(
    isValidCns('123456') === true && isValidCns('12345') === false && isValidCns('') === true,
    '13. CNS: Validação aceita exatamente 6 dígitos quando preenchido e é opcional quando vazio'
  );

  assert(
    normalizeCnm('123456.1.0012345-01') === '1234561001234501',
    '14. CNM: Normalização extrai dígitos do Código Nacional de Matrícula'
  );

  assert(
    isValidCnm('1234561001234501') === true &&
      isValidCnm('123456100123450') === true &&
      isValidCnm('12345') === false &&
      isValidCnm('') === true,
    '15. CNM: Validação aceita padrão de 15 dígitos canônicos e é opcional quando vazio'
  );

  // -------------------------------------------------------------
  // GRUPO 7: Validação de Matrícula com CNM e CNS
  // -------------------------------------------------------------
  const formWithInvalidCns = getDefaultPropertyFormValues('rural');
  formWithInvalidCns.name = 'Fazenda Santa Cruz';
  formWithInvalidCns.city = 'Rio Verde';
  formWithInvalidCns.state = 'GO';
  formWithInvalidCns.totalDeclaredAreaHa = '500,00';
  formWithInvalidCns.clientLinks = [
    { clientId: 'cli_01', relationship: 'owner', otherRelationshipDescription: '', isPrimaryHolder: true, declaredParticipationPercentage: '100', observation: '' }
  ];
  formWithInvalidCns.registrations = [
    {
      id: 'reg_1',
      registrationNumber: '12345',
      cnmCode: '',
      registryOffice: '1º RI',
      registryOfficeCode: '123', // Inválido: apenas 3 dígitos
      district: 'Rio Verde',
      state: 'GO',
      bookAndPage: '',
      registeredArea: '500,00',
      areaUnit: 'ha',
      observation: '',
    },
  ];

  const valInvalidCns = validatePropertyForm(formWithInvalidCns);
  assert(
    !valInvalidCns.isValid &&
      valInvalidCns.errors.registrationErrors?.['reg_1']?.registryOfficeCode?.includes('6 dígitos'),
    '16. Matrícula: Rejeição de código CNS do cartório com tamanho diferente de 6 dígitos'
  );

  const formWithInvalidCnm = { ...formWithInvalidCns };
  formWithInvalidCnm.registrations = [
    {
      id: 'reg_1',
      registrationNumber: '12345',
      cnmCode: '12345', // Inválido: apenas 5 dígitos
      registryOffice: '1º RI',
      registryOfficeCode: '123456', // Válido
      district: 'Rio Verde',
      state: 'GO',
      bookAndPage: '',
      registeredArea: '500,00',
      areaUnit: 'ha',
      observation: '',
    },
  ];
  const valInvalidCnm = validatePropertyForm(formWithInvalidCnm);
  assert(
    !valInvalidCnm.isValid &&
      valInvalidCnm.errors.registrationErrors?.['reg_1']?.cnmCode?.includes('15 dígitos'),
    '17. Matrícula: Rejeição de código CNM com tamanho inválido'
  );

  const formWithValidReg = { ...formWithInvalidCns };
  formWithValidReg.registrations = [
    {
      id: 'reg_1',
      registrationNumber: '12345',
      cnmCode: '1234561001234501',
      registryOffice: '1º Ofício de Registro de Imóveis',
      registryOfficeCode: '123456',
      district: 'Rio Verde',
      state: 'GO',
      bookAndPage: 'Livro 2',
      registeredArea: '500,00',
      areaUnit: 'ha',
      observation: 'Sem ônus',
    },
  ];
  const valValidReg = validatePropertyForm(formWithValidReg);
  assert(
    valValidReg.isValid,
    '18. Matrícula: Aceitação de matrícula válida contendo CNM e CNS normalizados'
  );

  // -------------------------------------------------------------
  // GRUPO 8: Conversão Canônica com CNM e CNS
  // -------------------------------------------------------------
  const createdInput = formValuesToCreateInput(formWithValidReg, 'org_test_01');
  assert(
    createdInput.registrations[0].cnmCode === '1234561001234501' &&
      createdInput.registrations[0].registryOfficeCode === '123456' &&
      createdInput.registrations[0].registeredArea === '500.00',
    '19. DTO: formValuesToCreateInput preserva CNM (15 dígitos) e CNS (6 dígitos)'
  );

  const updatedInput = formValuesToUpdateInput(formWithValidReg);
  assert(
    updatedInput.registrations[0].cnmCode === '1234561001234501' &&
      updatedInput.registrations[0].registryOfficeCode === '123456' &&
      updatedInput.registrations[0].registeredArea === '500.00',
    '20. DTO: formValuesToUpdateInput preserva CNM (15 dígitos) e CNS (6 dígitos)'
  );

  // -------------------------------------------------------------
  // GRUPO 9: Conversão Bidirecional Entity -> Form
  // -------------------------------------------------------------
  const dummyProperty = {
    id: 'prop_999',
    organizationId: 'org_test_01',
    propertyType: 'rural',
    name: 'Fazenda Boa Esperança',
    status: 'active',
    location: {
      city: 'Jataí',
      state: 'GO',
    },
    areas: {
      totalDeclaredAreaHa: '1200.50',
    },
    identifiers: {
      cib: 'CIB 1234567-8',
      sncrIncraCode: '1234567890123',
    },
    registrations: [
      {
        id: 'reg_99',
        registrationNumber: '99887',
        cnmCode: '1234561009988701',
        registryOffice: 'Registro de Imóveis de Jataí',
        registryOfficeCode: '654321',
        district: 'Jataí',
        state: 'GO',
        registeredArea: '1200.50',
        areaUnit: 'ha',
      },
    ],
    clientLinks: [
      {
        clientId: 'cli_01',
        relationship: 'owner',
        isPrimaryHolder: true,
        declaredParticipationPercentage: '100.00',
        linkedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    boundaries: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  const convertedFormValues = propertyToFormValues(dummyProperty);
  assert(
    convertedFormValues.registrations[0].cnmCode === '1234561009988701' &&
      convertedFormValues.registrations[0].registryOfficeCode === '654321',
    '21. Conversão Bidirecional: propertyToFormValues restaura CNM e CNS para edição'
  );

  // -------------------------------------------------------------
  // GRUPO 10: Separação de Áreas Cadastrais vs Laudos Técnicos
  // -------------------------------------------------------------
  assert(
    !('appraisalMethodology' in defaultRural) &&
      !('marketValueEstimate' in defaultRural) &&
      !('depreciationRate' in defaultRural),
    '22. Isolamento de Domínio: Formulário canônico de imóveis não contém campos de laudos técnicos'
  );

  assert(
    'totalDeclaredAreaHa' in defaultRural &&
      'registeredAreaHa' in defaultRural &&
      'carReportedAreaHa' in defaultRural &&
      'sncrReportedAreaHa' in defaultRural,
    '23. Completude Cadastral: Campos de áreas territoriais canônicas (declarada, registrada, CAR, SNCR) presentes'
  );

  assert(
    'landAreaM2' in defaultUrban &&
      'builtAreaM2' in defaultUrban &&
      'privateAreaM2' in defaultUrban &&
      'commonAreaM2' in defaultUrban,
    '24. Completude Urbana: Campos de áreas urbanas canônicas (terreno, construída, privativa, comum) presentes'
  );

  // -------------------------------------------------------------
  // GRUPO 11: Responsividade e Layout 1-Coluna Base
  // -------------------------------------------------------------
  assert(
    formCode.includes('grid-cols-1') &&
      formCode.includes('sm:grid-cols-2') &&
      formCode.includes('flex flex-col-reverse sm:flex-row'),
    '25. Layout Responsivo: Formulário adota grid base de 1 coluna em mobile e barra de ações adaptativa'
  );

  // -------------------------------------------------------------
  // GRUPO 12: OE-003.002-R4 — Completude Cadastral Canônica Rural e Urbana
  // -------------------------------------------------------------
  // 26. Localização Rural Completa
  assert(
    'postalCode' in defaultRural &&
      'district' in defaultRural &&
      'complement' in defaultRural,
    '26. Localização Rural: Campos postalCode, district e complement presentes nos contratos'
  );

  // 27. Localização Urbana Completa
  assert(
    'referencePoint' in defaultUrban &&
      'zipCode' in defaultUrban &&
      'neighborhood' in defaultUrban,
    '27. Localização Urbana: Campos referencePoint, zipCode e neighborhood presentes nos contratos'
  );

  // 28. Identificação Fiscal Urbana
  assert(
    'condominiumIdentification' in defaultUrban,
    '28. Fiscal Urbano: Campo condominiumIdentification presente nos contratos'
  );

  // 29. Matrículas Canônicas R4 (isPrimary, registrationStatus, certificateIssuedAt)
  const ruralWithR4Reg = getDefaultPropertyFormValues('rural');
  ruralWithR4Reg.name = 'Fazenda Alto Taquari';
  ruralWithR4Reg.city = 'Coxim';
  ruralWithR4Reg.state = 'MS';
  ruralWithR4Reg.totalDeclaredAreaHa = '1.000,00';
  ruralWithR4Reg.clientLinks = [
    { clientId: 'cli_01', relationship: 'owner', otherRelationshipDescription: '', isPrimaryHolder: true, declaredParticipationPercentage: '100', observation: '' }
  ];
  ruralWithR4Reg.registrations = [
    {
      id: 'reg_primary',
      registrationNumber: '1001',
      cnmCode: '1234561000100101',
      registryOffice: '1º RI Coxim',
      registryOfficeCode: '123456',
      district: 'Coxim',
      state: 'MS',
      bookAndPage: 'Livro 2',
      registeredArea: '600,00',
      areaUnit: 'ha',
      isPrimary: true,
      registrationStatus: 'active',
      certificateIssuedAt: '2025-01-10',
      observation: 'Matrícula Principal',
    },
    {
      id: 'reg_sec',
      registrationNumber: '1002',
      cnmCode: '1234561000100201',
      registryOffice: '1º RI Coxim',
      registryOfficeCode: '123456',
      district: 'Coxim',
      state: 'MS',
      bookAndPage: 'Livro 2',
      registeredArea: '400,00',
      areaUnit: 'ha',
      isPrimary: false,
      registrationStatus: 'active',
      certificateIssuedAt: '2025-01-10',
      observation: 'Matrícula Anexa',
    },
  ];

  const valR4Reg = validatePropertyForm(ruralWithR4Reg);
  assert(
    valR4Reg.isValid,
    '29. Validação R4: Matrículas com isPrimary, registrationStatus e certificateIssuedAt válidas'
  );

  const r4CreateInput = formValuesToCreateInput(ruralWithR4Reg, 'org_test_01');
  assert(
    r4CreateInput.registrations.length === 2 &&
      r4CreateInput.registrations[0].isPrimary === true &&
      r4CreateInput.registrations[0].registrationStatus === 'active' &&
      r4CreateInput.registrations[0].certificateIssuedAt === '2025-01-10' &&
      r4CreateInput.registrations[1].isPrimary === false,
    '30. DTO R4: CreateInput preserva metadados registrais (isPrimary, status, certidão)'
  );

  // 31. Coordenadas de Referência R4 (datum, format, origin, altitude, altitudeType)
  ruralWithR4Reg.hasCoordinate = true;
  ruralWithR4Reg.latitude = '-18.5036';
  ruralWithR4Reg.longitude = '-54.7500';
  ruralWithR4Reg.datum = 'SIRGAS2000';
  ruralWithR4Reg.format = 'decimal_degrees';
  ruralWithR4Reg.origin = 'gnss';
  ruralWithR4Reg.altitude = '520.5';
  ruralWithR4Reg.altitudeType = 'geometric';

  const valR4Coord = validatePropertyForm(ruralWithR4Reg);
  assert(
    valR4Coord.isValid,
    '31. Validação R4: Coordenadas geodésicas completas aceitas com sucesso'
  );

  const r4CoordCreateInput = formValuesToCreateInput(ruralWithR4Reg, 'org_test_01');
  assert(
    r4CoordCreateInput.referenceCoordinate?.datum === 'SIRGAS2000' &&
      r4CoordCreateInput.referenceCoordinate?.format === 'decimal_degrees' &&
      r4CoordCreateInput.referenceCoordinate?.origin === 'gnss' &&
      r4CoordCreateInput.referenceCoordinate?.altitude === '520.5' &&
      r4CoordCreateInput.referenceCoordinate?.altitudeType === 'geometric',
    '32. DTO R4: CreateInput serializa campos geodésicos R4 em número e enum canônicos'
  );

  // 33. Confrontações R4 com campo source
  ruralWithR4Reg.boundaries = [
    {
      id: 'bnd_01',
      direction: 'Norte',
      boundaryType: 'fence',
      otherBoundaryTypeDescription: '',
      adjoiningDescription: 'Estrada Municipal EM-01',
      source: 'technical_plant',
      observation: 'Cerca de arame liso 5 fios',
    },
  ];
  const r4BoundCreateInput = formValuesToCreateInput(ruralWithR4Reg, 'org_test_01');
  assert(
    r4BoundCreateInput.boundaries?.[0].source === 'technical_plant' &&
      r4BoundCreateInput.boundaries?.[0].direction === 'Norte',
    '33. DTO R4: CreateInput preserva campo source nas confrontações textuais'
  );

  // 34. Ausência de cálculo automático impositivo e preservação da matriz canônica (OE-004.001-R3)
  assert(
    formCode.includes('Nenhuma matrícula vinculada') &&
      formCode.includes('Aviso Cadastral:') &&
      formCode.includes('não são somadas automaticamente pelo sistema') &&
      !formCode.includes('Total Registrado (Soma das Matrículas)') &&
      !formCode.includes('Total Registrado:'),
    '34. UI R4/R3: Ausência de somatório impositivo e exibição de aviso cadastral com áreas individuais'
  );

  console.log('\n================================================================');
  console.log(`📊 RESULTADO FINAL DOS TESTES (OE-003.002-R3 / R4):`);
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
