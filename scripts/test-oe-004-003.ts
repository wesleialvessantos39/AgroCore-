/**
 * Suite de Testes Automatizados — OE-004.003
 * Dossiê Técnico, Amostragem, Homogeneização, Motor Estatístico,
 * Métodos Avaliatórios, Prontidão, Fotografia Canônica e Serviço Real de Emissão
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { DecimalMath } from '../src/appraisals/decimalMath';
import {
  homogenizeMarketSamples,
  calculateSampleHomogenization,
} from '../src/appraisals/homogenizationEngine';
import { computeStatisticalAnalysis } from '../src/appraisals/statisticalEngine';
import { ValuationMethodEngine } from '../src/appraisals/valuationMethods';
import { evaluateAppraisalReadiness } from '../src/appraisals/readinessEvaluator';
import {
  buildAppraisalCanonicalSnapshot,
  computeDeterministicChecksum,
  issueAppraisalVersion,
} from '../src/appraisals/snapshotEngine';
import {
  AppraisalIssuanceService,
  appraisalIssuanceService,
} from '../src/appraisals/appraisalIssuanceService';
import {
  PreviewAppraisalGateway,
} from '../src/appraisals/preview/previewAppraisalGateway';
import {
  PreviewClientGateway,
} from '../src/clients/preview/previewClientGateway';
import {
  PreviewPropertyGateway,
} from '../src/properties/preview/previewPropertyGateway';
import {
  PreviewTechnicalProfessionalGateway,
} from '../src/technicalProfessionals/preview/previewTechnicalProfessionalGateway';
import {
  PreviewOrganizationMembersGateway,
} from '../src/auth/preview/previewOrganizationMembersGateway';
import { setAppraisalGatewayForTesting } from '../src/appraisals/gatewayFactory';
import { setClientGatewayForTesting } from '../src/clients/gatewayFactory';
import { setPropertyGatewayForTesting } from '../src/properties/gatewayFactory';
import { setTechnicalProfessionalGatewayForTesting } from '../src/technicalProfessionals/gatewayFactory';
import { setOrganizationMembersGatewayForTesting } from '../src/auth/organizationMembersGatewayFactory';

import { Appraisal, TechnicalProfessionalProfile } from '../src/types/appraisal';
import { AppraisalTechnicalDossier } from '../src/types/appraisalDossier';
import { AppraisalCalculationSection, AppraisalMarketSample } from '../src/types/appraisalCalculation';
import { AppraisalNormativeSection } from '../src/types/appraisalNormative';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('INICIANDO TESTES OE-004.003 (DOSSIÊ, CÁLCULOS, EMISSÃO CANÔNICA)');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // 1. TESTES DE MATEMÁTICA DECIMAL DETERMINÍSTICA
  // ----------------------------------------------------
  console.log('1. Testes de Matemática Decimal e Arredondamento:');
  assert(DecimalMath.round(123.456, 2, 'half_even') === 123.46, 'Half-even arredonda 123.456 para 123.46');
  assert(DecimalMath.multiply(10.55, 3.2, 2) === 33.76, 'Multiplicação precisa (10.55 * 3.2 = 33.76)');
  assert(DecimalMath.divide(100, 3, 4) === 33.3333, 'Divisão com 4 decimais (100 / 3 = 33.3333)');
  assert(DecimalMath.sum([10.1, 20.2, 30.3], 2) === 60.6, 'Soma determinística precisa');
  assert(DecimalMath.formatCurrency(1500250.5).includes('1.500.250,50'), 'Formatação BRL correta');

  // ----------------------------------------------------
  // 2. TESTES DE HOMOGENEIZAÇÃO DE AMOSTRAS
  // ----------------------------------------------------
  console.log('\n2. Testes de Homogeneização de Amostras de Mercado:');
  const mockSamples: AppraisalMarketSample[] = [
    {
      id: 's1',
      appraisalId: 'app_001',
      organizationId: 'org_001',
      sampleCode: 'AMO-01',
      source: 'Jornal Regional',
      collectionDate: '2026-08-10',
      nature: 'offer',
      locationDescription: 'Rodovia BR-163 km 40',
      city: 'Sinop',
      state: 'MT',
      totalArea: 500,
      areaUnit: 'ha',
      totalPrice: 15000000,
      rawUnitPrice: 30000,
      currency: 'BRL',
      attributes: { accessScore: 4, topographyScore: 5 },
      status: 'included',
      collectedByUserId: 'usr_designer',
      createdAt: '2026-08-10T10:00:00Z',
      updatedAt: '2026-08-10T10:00:00Z',
    },
    {
      id: 's2',
      appraisalId: 'app_001',
      organizationId: 'org_001',
      sampleCode: 'AMO-02',
      source: 'Escritura Pública',
      collectionDate: '2026-08-12',
      nature: 'transaction',
      locationDescription: 'Estrada da Guia km 12',
      city: 'Sinop',
      state: 'MT',
      totalArea: 400,
      areaUnit: 'ha',
      totalPrice: 12800000,
      rawUnitPrice: 32000,
      currency: 'BRL',
      attributes: { accessScore: 5, topographyScore: 5 },
      status: 'included',
      collectedByUserId: 'usr_designer',
      createdAt: '2026-08-12T10:00:00Z',
      updatedAt: '2026-08-12T10:00:00Z',
    },
    {
      id: 's3',
      appraisalId: 'app_001',
      organizationId: 'org_001',
      sampleCode: 'AMO-03',
      source: 'Oferta Corretor',
      collectionDate: '2026-08-15',
      nature: 'offer',
      locationDescription: 'Gleba Mercedes',
      city: 'Sinop',
      state: 'MT',
      totalArea: 350,
      areaUnit: 'ha',
      totalPrice: 11200000,
      rawUnitPrice: 32000,
      currency: 'BRL',
      attributes: { accessScore: 3, topographyScore: 4 },
      status: 'included',
      collectedByUserId: 'usr_designer',
      createdAt: '2026-08-15T10:00:00Z',
      updatedAt: '2026-08-15T10:00:00Z',
    },
  ];

  const homogenized = homogenizeMarketSamples({ samples: mockSamples });
  assert(homogenized.length === 3, 'Homogeneizou 3 amostras');
  assert(homogenized[0].homogenizedUnitPrice === 28500, 'Amostra de oferta recebeu fator de negociação de 0.95 (30000 * 0.95 = 28500)');
  assert(homogenized[1].homogenizedUnitPrice === 32000, 'Amostra de transação manteve fator de oferta 1.00 (32000)');

  // ----------------------------------------------------
  // 3. TESTES DO MOTOR ESTATÍSTICO
  // ----------------------------------------------------
  console.log('\n3. Testes do Motor Estatístico Puro:');
  const stats = computeStatisticalAnalysis({ homogenizedSamples: homogenized });
  assert(stats.validSamplesCount === 3, 'Identificou 3 amostras válidas');
  assert(stats.mean > 0, `Média calculada: ${stats.mean}`);
  assert(stats.median > 0, `Mediana calculada: ${stats.median}`);
  assert(stats.standardDeviation >= 0, `Desvio padrão: ${stats.standardDeviation}`);
  assert(stats.coefficientOfVariationPercentage < 30, `CV % aceitável: ${stats.coefficientOfVariationPercentage}%`);
  assert(stats.confidenceInterval90.lower < stats.confidenceInterval90.upper, 'Intervalo de confiança 90% consistente');

  // ----------------------------------------------------
  // 4. TESTES DOS MÉTODOS AVALIATÓRIOS
  // ----------------------------------------------------
  console.log('\n4. Testes dos Motores Avaliatórios:');
  // 4.1 MCDDM
  const mcddmRun = ValuationMethodEngine.executeDirectComparative({
    appraisalId: 'app_001',
    organizationId: 'org_001',
    executedByUserId: 'usr_designer',
    targetArea: 450,
    areaUnit: 'ha',
    homogenizedUnitPrices: homogenized.map((h) => h.homogenizedUnitPrice),
  });
  assert(mcddmRun.method === 'direct_comparative', 'Executou MCDDM com sucesso');
  assert(mcddmRun.resultCalculatedValue > 0, `Valor calculado MCDDM: ${mcddmRun.resultCalculatedValue}`);

  // 4.2 MQC (Quantificação do Custo)
  const mqcRun = ValuationMethodEngine.executeCostQuantification({
    appraisalId: 'app_001',
    organizationId: 'org_001',
    executedByUserId: 'usr_designer',
    improvements: [
      { description: 'Galpão de Máquinas', totalCostNew: 500000, depreciationPercentage: 20, depreciatedTotalValue: 400000 },
      { description: 'Casa Sede', totalCostNew: 300000, depreciationPercentage: 15, depreciatedTotalValue: 255000 },
    ],
  });
  assert(mqcRun.method === 'cost_quantification', 'Executou MQC com sucesso');
  assert(mqcRun.resultCalculatedValue === 655000, 'Soma depreciada MQC correta (400k + 255k = 655k)');

  // 4.3 ME (Método Evolutivo)
  const meRun = ValuationMethodEngine.executeEvolutionary({
    appraisalId: 'app_001',
    organizationId: 'org_001',
    executedByUserId: 'usr_designer',
    landValue: 12000000,
    improvementsValue: 655000,
    commercializationFactor: 1.05,
  });
  assert(meRun.method === 'evolutionary', 'Executou Método Evolutivo');
  assert(meRun.resultCalculatedValue === 13287750, 'Resultado Método Evolutivo com FC 1.05');

  // 4.4 MCR (Capitalização da Renda)
  const mcrRun = ValuationMethodEngine.executeIncomeCapitalization({
    appraisalId: 'app_001',
    organizationId: 'org_001',
    executedByUserId: 'usr_designer',
    annualNetOperatingIncome: 600000,
    capitalizationRatePercentage: 6.0,
  });
  assert(mcrRun.method === 'income_capitalization', 'Executou Capitalização da Renda');
  assert(mcrRun.resultCalculatedValue === 10000000, 'Resultado Capitalização da Renda (600k / 0.06 = 10M)');

  // 4.5 MI (Método Involutivo)
  const miRun = ValuationMethodEngine.executeInvolutive({
    appraisalId: 'app_001',
    organizationId: 'org_001',
    executedByUserId: 'usr_designer',
    grossRevenuePotential: 20000000,
    directCosts: 8000000,
    indirectCostsAndTaxes: 2000000,
    developerProfitMarginPercentage: 20,
    discountingRatePercentage: 12,
    projectHorizonMonths: 24,
  });
  assert(miRun.method === 'involutive', 'Executou Método Involutivo');
  assert(miRun.resultCalculatedValue > 0, `Resultado Método Involutivo apurado: ${miRun.resultCalculatedValue}`);

  // ----------------------------------------------------
  // 5. TESTES DO AVALIADOR DE PRONTIDÃO (READINESS)
  // ----------------------------------------------------
  console.log('\n5. Testes do Verificador de Prontidão Técnica:');
  const mockAppraisal: Appraisal = {
    id: 'app_001',
    organizationId: 'org_001',
    clientId: 'cli_001',
    propertyId: 'prop_001',
    responsibleUserId: 'usr_designer',
    appraisalRequestId: 'req_001',
    origin: 'technical_initiative',
    title: 'Laudo de Avaliação - Fazenda Primavera',
    propertyType: 'rural',
    status: 'draft',
    purpose: 'Garantia Bancária',
    currentVersionNumber: 1,
    createdAt: '2026-08-01T08:00:00Z',
    updatedAt: '2026-08-15T12:00:00Z',
  };

  const mockDossierIncomplete: AppraisalTechnicalDossier = {
    appraisalId: 'app_001',
    organizationId: 'org_001',
    identification: {
      status: 'in_progress',
      updatedAt: '2026-08-15T12:00:00Z',
      updatedByUserId: 'usr_designer',
      validationIssues: ['Finalidade não formalizada'],
      purpose: 'Garantia',
      objective: 'Mercado',
      valueType: 'market_value',
      referenceDate: '2026-08-15',
      requesterName: 'Banco Agro',
      interestedPartyName: 'Agrícola Primavera',
      assumptions: [],
      limitingConditions: [],
      caveats: [],
    },
    characterization: {
      propertyType: 'rural',
      status: 'not_started',
      updatedAt: '2026-08-15T12:00:00Z',
      updatedByUserId: 'usr_designer',
      validationIssues: [],
      accessDescription: { value: '', provenance: 'reported_survey' },
      mainLogisticalDistances: [],
      totalAreaHa: 450,
      topographyRelief: { value: 'flat', provenance: 'reported_survey' },
      soilTypesDescription: { value: '', provenance: 'reported_survey' },
      landUseCapabilityClasses: ['II'],
      currentLandUseAndCover: { value: '', provenance: 'reported_survey' },
      waterResourcesDescription: { value: '', provenance: 'reported_survey' },
      powerAvailability: { value: 'grid_triphasic', provenance: 'reported_survey' },
      internalInfrastructureSummary: { value: '', provenance: 'reported_survey' },
      environmentalAspectsDeclared: { value: '', provenance: 'reported_survey' },
      economicExploitation: { value: '', provenance: 'reported_survey' },
    },
    improvements: {
      status: 'not_applicable',
      updatedAt: '2026-08-15T12:00:00Z',
      updatedByUserId: 'usr_designer',
      validationIssues: [],
      items: [],
      totalImprovementsCostNew: 0,
      totalImprovementsDepreciatedValue: 0,
    },
    conclusion: {
      status: 'not_started',
      updatedAt: '2026-08-15T12:00:00Z',
      updatedByUserId: 'usr_designer',
      validationIssues: [],
      objectDescription: '',
      finalValuationAmount: 0,
      finalValuationCurrency: 'BRL',
      valuationDate: '2026-08-15',
      unitValueSummary: '',
      valueRangeMin: 0,
      valueRangeMax: 0,
      assumptionsAndCaveatsSummary: '',
      professionalStatement: '',
    },
    documentReferences: [],
    updatedAt: '2026-08-15T12:00:00Z',
    updatedByUserId: 'usr_designer',
  };

  const readinessIncomplete = evaluateAppraisalReadiness({
    appraisal: mockAppraisal,
    dossier: mockDossierIncomplete,
  });
  assert(!readinessIncomplete.isReadyToIssue, 'Identificou laudo incompleto como não pronto para emissão');
  assert(readinessIncomplete.impeditiveCount > 0, `Impedimentos detectados: ${readinessIncomplete.impeditiveCount}`);

  // ----------------------------------------------------
  // 6. TESTES DE FOTOGRAFIA CANÔNICA PURA
  // ----------------------------------------------------
  console.log('\n6. Testes de Fotografia Canônica Pura:');
  const mockProfile: TechnicalProfessionalProfile = {
    id: 'prof_001',
    userId: 'usr_designer',
    organizationId: 'org_001',
    council: 'CREA',
    registrationNumber: '12345/D',
    registrationUf: 'MT',
    declaredTitle: 'Eng. Agrônomo Carlos Silva',
    discipline: 'agronomy',
    responsibilityDocumentType: 'ART',
    status: 'manually_verified',
    verifiedAt: '2026-01-10T10:00:00Z',
    verifiedByUserId: 'usr_admin_verifier',
    capabilities: [
      {
        id: 'cap_1',
        organizationId: 'org_001',
        profileId: 'prof_001',
        activityType: 'rural_property_appraisal',
        scope: 'rural',
        council: 'CREA',
        legalReference: 'Art. 7 Lei 5.194/66',
        status: 'active',
        verifiedAt: '2026-01-10T10:00:00Z',
        verifiedByUserId: 'usr_admin_verifier',
        evidenceOrigin: 'manual_administrative',
      },
    ],
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
  };

  const mockDossierComplete: AppraisalTechnicalDossier = {
    ...mockDossierIncomplete,
    identification: {
      ...mockDossierIncomplete.identification,
      status: 'complete',
      validationIssues: [],
    },
    characterization: {
      ...mockDossierIncomplete.characterization,
      status: 'complete',
      validationIssues: [],
    },
    conclusion: {
      ...mockDossierIncomplete.conclusion,
      status: 'complete',
      finalValuationAmount: 13500000,
      validationIssues: [],
    },
  };

  const mockCalculations: AppraisalCalculationSection = {
    status: 'complete',
    updatedAt: '2026-08-15T12:00:00Z',
    updatedByUserId: 'usr_designer',
    validationIssues: [],
    primaryMethod: 'direct_comparative',
    auxiliaryMethods: [],
    calculationRuns: [mcddmRun],
    breakdown: {
      landValue: 13500000,
      improvementsValue: 0,
      specialComponentsValue: 0,
      totalCalculatedValue: 13500000,
      roundingAppliedAmount: 0,
      finalAdoptedValue: 13500000,
      recommendedRangeMin: 12500000,
      recommendedRangeMax: 14500000,
    },
    technicalJustification: 'Valor alinhado à média das amostras homogeneizadas na região.',
  };

  const mockNormative: AppraisalNormativeSection = {
    status: 'complete',
    updatedAt: '2026-08-15T12:00:00Z',
    updatedByUserId: 'usr_designer',
    validationIssues: [],
    degreeOfJustification: 'grau_II',
    degreeOfPrecision: 'grau_II',
    isUnconfiguredNotice: false,
    complianceChecklist: [],
  };

  const mockClient = {
    id: 'cli_001',
    name: 'Agrícola Primavera Ltda',
    documentType: 'cnpj' as const,
    documentNumber: '12.345.678/0001-90',
    city: 'Sinop',
    state: 'MT',
  };

  const mockProperty = {
    id: 'prop_001',
    propertyType: 'rural' as const,
    name: 'Fazenda Primavera',
    city: 'Sinop',
    state: 'MT',
    totalArea: '450 ha',
    carReceiptNumber: 'MT-5107909-ABCD1234',
    registrations: [{ id: 'reg_1', registrationNumber: '12.345', registryOffice: '1º RI de Sinop', state: 'MT' }],
  };

  const directSnapshot = buildAppraisalCanonicalSnapshot({
    appraisal: mockAppraisal,
    client: mockClient,
    property: mockProperty,
    technicalProfile: mockProfile,
    dossier: mockDossierComplete,
    calculations: mockCalculations,
    marketSamples: mockSamples,
    homogenizedResults: homogenized,
    statisticalAnalysis: stats,
    normative: mockNormative,
    versionNumber: 1,
  });

  const checksum = computeDeterministicChecksum(directSnapshot);
  assert(checksum.length === 64 && /^[a-f0-9]{64}$/.test(checksum), 'Checksum SHA-256 canônico gerado com sucesso (64 chars hex)');

  // ----------------------------------------------------
  // 7. TESTES DO SERVIÇO REAL DE EMISSÃO (AppraisalIssuanceService)
  // ----------------------------------------------------
  console.log('\n7. Testes do Serviço Real de Emissão (AppraisalIssuanceService):');

  const orgId = 'org_001';
  const otherOrgId = 'org_002';
  const responsibleUserId = 'usr_designer';

  // Setup dos Gateways Preview Conectados
  const appraisalGw = new PreviewAppraisalGateway();
  const clientGw = new PreviewClientGateway();
  const propertyGw = new PreviewPropertyGateway();
  const techGw = new PreviewTechnicalProfessionalGateway();
  const membersGw = new PreviewOrganizationMembersGateway();

  setAppraisalGatewayForTesting(appraisalGw);
  setClientGatewayForTesting(clientGw);
  setPropertyGatewayForTesting(propertyGw);
  setTechnicalProfessionalGatewayForTesting(techGw);
  setOrganizationMembersGatewayForTesting(membersGw);

  // Setup: Membro Ativo na Org
  membersGw.addMemberForTesting(orgId, {
    id: 'mem_1',
    userId: responsibleUserId,
    name: 'Carlos Silva',
    email: 'carlos@agrocore.com',
    organizationRole: 'project_designer',
    isActive: true,
  });
  membersGw.addMemberForTesting(orgId, {
    id: 'mem_2',
    userId: 'usr_other_designer',
    name: 'Outro Designer',
    email: 'outro@agrocore.com',
    organizationRole: 'project_designer',
    isActive: true,
  });

  // Setup: Cliente Ativo
  const realClient = await clientGw.createClient(orgId, {
    personType: 'legal_entity',
    companyName: 'Agrícola Primavera Ltda',
    tradeName: 'Agrícola Primavera',
    cnpj: '12345678000190',
    status: 'active',
    isStateRegistrationExempt: true,
    contact: { primaryPhone: '66999998888', hasWhatsapp: true },
    address: {
      addressType: 'rural',
      locality: 'Zona Rural',
      accessDescription: 'BR 163 km 50',
      city: 'Sinop',
      state: 'MT',
    },
  });

  // Setup: Imóvel Ativo
  const propRes = await propertyGw.createProperty({
    organizationId: orgId,
    propertyType: 'rural',
    name: 'Fazenda Primavera',
    status: 'active',
    location: {
      ruralRegionOrCommunity: 'Gleba Sinop',
      city: 'Sinop',
      state: 'MT',
      accessRouteDescription: 'BR 163 km 50',
    },
    areas: {
      totalDeclaredAreaHa: '450.00',
    },
    identifiers: {
      carReceiptNumber: 'MT-5107909-ABCD1234',
    },
    registrations: [
      {
        id: 'reg_1',
        registrationNumber: '12.345',
        registryOffice: '1º RI de Sinop',
        district: 'Sinop',
        state: 'MT',
      },
    ],
    boundaries: [],
    clientLinks: [
      {
        clientId: realClient.id,
        relationship: 'owner',
        isPrimaryHolder: true,
        linkedAt: new Date().toISOString(),
      },
    ],
  });

  if (!propRes.success || !propRes.property) {
    throw new Error('Falha ao criar imóvel de teste.');
  }
  const realProperty = propRes.property;

  // Setup: Perfil Técnico Verificado (por admin_verifier, NÃO autoverificado)
  const realProfile = await techGw.createProfile({
    organizationId: orgId,
    userId: responsibleUserId,
    council: 'CREA',
    registrationNumber: '12345/D',
    registrationUf: 'MT',
    declaredTitle: 'Eng. Agrônomo Carlos Silva',
    discipline: 'agronomy',
    responsibilityDocumentType: 'ART',
    capabilities: [
      {
        id: 'cap_real_1',
        organizationId: orgId,
        profileId: 'prof_real',
        activityType: 'rural_property_appraisal',
        scope: 'rural',
        council: 'CREA',
        legalReference: 'Art. 7 Lei 5.194/66',
        status: 'active',
        verifiedAt: '2026-01-10T10:00:00Z',
        verifiedByUserId: 'usr_admin_verifier',
        evidenceOrigin: 'manual_administrative',
      },
    ],
  });

  // Verificação formal por terceiro (gestor/admin)
  await techGw.verifyProfile({
    organizationId: orgId,
    profileId: realProfile.id,
    status: 'manually_verified',
    verifiedByUserId: 'usr_admin_verifier',
    verificationSource: 'manual_administrative',
    capabilities: realProfile.capabilities,
  });

  // Setup: Criar Laudo
  const realAppraisal = await appraisalGw.createAppraisal({
    organizationId: orgId,
    clientId: realClient.id,
    propertyId: realProperty.id,
    responsibleUserId: responsibleUserId,
    title: 'Laudo Pericial — Fazenda Primavera',
    propertyType: 'rural',
    purpose: 'Garantia Bancária',
    origin: 'technical_initiative',
  });

  // Popular Dossiê, Amostras, Cálculos e Normativa no Gateway
  await appraisalGw.saveTechnicalDossier(orgId, {
    ...mockDossierComplete,
    appraisalId: realAppraisal.id,
    organizationId: orgId,
  });

  for (const sample of mockSamples) {
    await appraisalGw.saveMarketSample(orgId, {
      ...sample,
      appraisalId: realAppraisal.id,
      organizationId: orgId,
    });
  }

  await appraisalGw.saveCalculationSection(orgId, realAppraisal.id, {
    ...mockCalculations,
    calculationRuns: [
      ValuationMethodEngine.executeDirectComparative({
        appraisalId: realAppraisal.id,
        organizationId: orgId,
        executedByUserId: responsibleUserId,
        targetArea: 450,
        areaUnit: 'ha',
        homogenizedUnitPrices: homogenized.map((h) => h.homogenizedUnitPrice),
      }),
    ],
  });

  await appraisalGw.saveNormativeSection(orgId, realAppraisal.id, {
    ...mockNormative,
  });

  const appraisalReadyToIssue = await appraisalGw.updateAppraisalStatus({
    organizationId: orgId,
    appraisalId: realAppraisal.id,
    newStatus: 'ready_to_issue',
    actorUserId: responsibleUserId,
  });
  assert(
    appraisalReadyToIssue.status === 'ready_to_issue',
    '7.0 Laudo precisa alcançar ready_to_issue antes da emissão formal'
  );

  // 7.1 Rejeita emissão por ator sem a permissão "appraisals:issue"
  let missingPermCaught = false;
  try {
    await appraisalIssuanceService.issueVersion({
      appraisalId: realAppraisal.id,
      activeOrganizationId: orgId,
      actor: {
        userId: responsibleUserId,
        userName: 'Carlos Silva',
        organizationRole: 'project_designer',
        permissions: ['appraisals:view'], // Faltando 'appraisals:issue'
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('appraisals:issue')) {
      missingPermCaught = true;
    }
  }
  assert(missingPermCaught, '7.1 Bloqueia emissão quando ator não tem a permissão "appraisals:issue"');

  // 7.2 Rejeita emissão por outro usuário (não responsável técnico)
  let notResponsibleCaught = false;
  try {
    await appraisalIssuanceService.issueVersion({
      appraisalId: realAppraisal.id,
      activeOrganizationId: orgId,
      actor: {
        userId: 'usr_other_designer',
        userName: 'Outro Designer',
        organizationRole: 'project_designer',
        permissions: ['appraisals:view', 'appraisals:issue'],
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Responsável Técnico formalmente designado')) {
      notResponsibleCaught = true;
    }
  }
  assert(notResponsibleCaught, '7.2 Bloqueia emissão por projetista que não é o responsável técnico designado no laudo');

  // 7.3 Emissão com Sucesso pelo Responsável Técnico Designado
  const successfulIssuance = await appraisalIssuanceService.issueVersion({
    appraisalId: realAppraisal.id,
    activeOrganizationId: orgId,
    actor: {
      userId: responsibleUserId,
      userName: 'Carlos Silva',
      organizationRole: 'project_designer',
      permissions: ['appraisals:view', 'appraisals:create', 'appraisals:edit', 'appraisals:issue'],
    },
    idempotencyKey: 'idemp_issue_001',
  });

  assert(successfulIssuance.issuedVersion !== undefined, '7.3 Emissão formal do laudo concluída com sucesso');
  assert(successfulIssuance.issuedVersion.versionNumber === 1, '7.3 Versão 1 gerada');
  assert(successfulIssuance.issuedVersion.checksumSha256.length === 64, '7.3 Checksum SHA-256 de 64 caracteres gerado');
  assert(successfulIssuance.updatedAppraisal.status === 'issued', '7.3 Status do laudo atualizado para "issued"');

  // 7.4 Idempotência Replay: mesma chave retorna o mesmo resultado
  const replayIssuance = await appraisalIssuanceService.issueVersion({
    appraisalId: realAppraisal.id,
    activeOrganizationId: orgId,
    actor: {
      userId: responsibleUserId,
      userName: 'Carlos Silva',
      organizationRole: 'project_designer',
      permissions: ['appraisals:view', 'appraisals:create', 'appraisals:edit', 'appraisals:issue'],
    },
    idempotencyKey: 'idemp_issue_001',
  });

  assert(replayIssuance.issuedVersion.id === successfulIssuance.issuedVersion.id, '7.4 Replay com idempotencyKey retorna exatamente a versão existente sem duplicar');

  // 7.5 Concorrência de Emissão: chamadas concorrentes são tratadas com segurança via lock
  const concPromises = [
    appraisalIssuanceService.issueVersion({
      appraisalId: realAppraisal.id,
      activeOrganizationId: orgId,
      actor: {
        userId: responsibleUserId,
        userName: 'Carlos Silva',
        organizationRole: 'project_designer',
        permissions: ['appraisals:view', 'appraisals:create', 'appraisals:edit', 'appraisals:issue'],
      },
      idempotencyKey: 'idemp_issue_001',
    }),
    appraisalIssuanceService.issueVersion({
      appraisalId: realAppraisal.id,
      activeOrganizationId: orgId,
      actor: {
        userId: responsibleUserId,
        userName: 'Carlos Silva',
        organizationRole: 'project_designer',
        permissions: ['appraisals:view', 'appraisals:create', 'appraisals:edit', 'appraisals:issue'],
      },
      idempotencyKey: 'idemp_issue_001',
    }),
  ];
  const concResults = await Promise.all(concPromises);
  assert(
    concResults[0].issuedVersion.id === concResults[1].issuedVersion.id,
    '7.5 Emissões concorrentes resolvem de forma atômica e segura com serialização via lock'
  );

  // 7.6 O caminho genérico de status não pode contornar o commit canônico de emissão
  const genericBypassAppraisal = await appraisalGw.createAppraisal({
    organizationId: orgId,
    clientId: realClient.id,
    propertyId: realProperty.id,
    responsibleUserId,
    title: 'Laudo para Teste de Bloqueio do Atalho Genérico',
    propertyType: 'rural',
    purpose: 'Teste de segurança',
    origin: 'technical_initiative',
  });
  await appraisalGw.updateAppraisalStatus({
    organizationId: orgId,
    appraisalId: genericBypassAppraisal.id,
    newStatus: 'ready_to_issue',
    actorUserId: responsibleUserId,
  });
  let genericIssuanceRejected = false;
  try {
    await appraisalGw.updateAppraisalStatus({
      organizationId: orgId,
      appraisalId: genericBypassAppraisal.id,
      newStatus: 'issued',
      actorUserId: responsibleUserId,
    });
  } catch {
    genericIssuanceRejected = true;
  }
  const bypassAfterAttempt = await appraisalGw.getAppraisalById(
    orgId,
    genericBypassAppraisal.id
  );
  const bypassVersions = await appraisalGw.listIssuedVersions(
    orgId,
    genericBypassAppraisal.id
  );
  assert(
    genericIssuanceRejected &&
      bypassAfterAttempt?.status === 'ready_to_issue' &&
      bypassVersions.length === 0,
    '7.6 Atualização genérica não emite laudo nem cria versão órfã'
  );

  console.log('\n====================================================');
  console.log(`RESULTADO FINAL: ${passedTests}/${totalTests} TESTES PASSARAM COM SUCESSO`);
  console.log('====================================================\n');

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }
}

runTests().catch((err: unknown) => {
  console.error('Erro fatal na execução da suíte de testes OE-004.003:', err);
  process.exit(1);
});
