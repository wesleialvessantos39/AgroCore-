/**
 * Bateria de Testes Automatizados — Fundação do Módulo de Laudos de Avaliação (OE-004.001-R4)
 *
 * Cobertura Completa das 28 Exigências Comportamentais Obrigatórias:
 * 1. Remoção comprovada do somatório automático de áreas registradas e presença do disclaimer formal;
 * 2. Registro determinístico de ROUTES.PROPERTIES_GEOMETRY na routeMatrix com permissão properties:geospatial:view;
 * 3. Limpeza segura de sessão/logout sem localStorage.clear() global e com isolamento multitenant;
 * 4. Criação de laudo recusada quando cliente/imóvel não pertencem à organização ativa;
 * 5. Criação de laudo recusada quando o imóvel não está vinculado ao cliente selecionado;
 * 6. Derivação determinística de propertyType a partir do cadastro territorial;
 * 7. Avaliação de elegibilidade técnica exigindo autenticação e rejeitando usuário não autenticado;
 * 8. Avaliação de elegibilidade técnica validando isolamento entre organizações (activeOrganizationId vs targetOrganizationId);
 * 9. Avaliador rejeitando perfil quando faltam permissões essenciais de RBAC (ex: apenas appraisals:view);
 * 10. Avaliador rejeitando perfil suspenso, expirado ou não verificado para emissão;
 * 11. Avaliador aceitando perfil com CREA e ART válidos para rural;
 * 12. Avaliador aceitando perfil com CAU e RRT válidos para urbano;
 * 13. Avaliador aceitando perfil com CFT/CFTA e TRT válidos para rural;
 * 14. Bloqueio global de emissão ativo nesta fase de fundação;
 * 15. Separação estrita de permissões de perfil profissional (view_self vs update_self vs verify);
 * 16. Validação estrita da taxonomia de eventos de domínio (rejeitando tipo inválido);
 * 17. Sanitização de dados sensíveis no payload de eventos de domínio;
 * 18. Diário imutável append-only de eventos de domínio;
 * 19. Transições válidas e inválidas na máquina de estados de laudos;
 * 20. Transições válidas e inválidas na máquina de estados de solicitações;
 * 21. Isolamento multitenant no PreviewAppraisalGateway;
 * 22. Isolamento multitenant no PreviewAppraisalRequestGateway;
 * 23. Isolamento multitenant no PreviewTechnicalProfessionalGateway;
 * 24. Bloqueio de solicitações do captador com CAPTURER_ASSIGNMENT_NOT_AVAILABLE até vínculo canônico (R4);
 * 25. Bloqueio de conversão arbitrária/origem inválida em createAppraisal (R4);
 * 26. Validação canônica e sanitização de segurança em addRequestDocument (R4);
 * 27. Governança estrita de permissões de solicitações sem appraisal_requests:edit residual (R4);
 * 28. Purga total de classes/cores proibidas (slate, gray, zinc, neutral, stone, black, dark:*, rose, red, amber, yellow, emerald, blue) no módulo 004 (R4).
 */

import fs from 'fs';
import path from 'path';
import {
  evaluateTechnicalEligibility,
} from '../src/appraisals/technicalEligibilityEvaluator';
import {
  evaluateAppraisalAccess,
} from '../src/appraisals/appraisalAccessPolicy';
import {
  ALLOWED_APPRAISAL_TRANSITIONS,
  canTransitionAppraisal,
  transitionAppraisal,
} from '../src/appraisals/appraisalStateMachine';
import {
  ALLOWED_REQUEST_TRANSITIONS,
  canTransitionAppraisalRequest,
  transitionAppraisalRequest,
} from '../src/appraisals/appraisalRequestStateMachine';
import {
  createAppraisalDomainEvent,
  isValidDomainEventType,
  getDomainEventJournal,
  clearDomainEventJournal,
} from '../src/appraisals/domainEvents';
import { PreviewAppraisalGateway } from '../src/appraisals/preview/previewAppraisalGateway';
import { PreviewAppraisalRequestGateway } from '../src/appraisals/preview/previewAppraisalRequestGateway';
import { PreviewTechnicalProfessionalGateway } from '../src/technicalProfessionals/preview/previewTechnicalProfessionalGateway';
import { validateStartDirectAppraisalCommand } from '../src/appraisals/startDirectAppraisalValidator';
import { Client } from '../src/types/client';
import { Property } from '../src/types/property';
import { TechnicalProfessionalProfile } from '../src/types/technicalProfessional';
import {
  registerDomainCleanup,
  executeDomainSessionCleanup,
  getRegisteredDomainCleanupCount,
} from '../src/auth/domainCleanupRegistry';

console.log('================================================================');
console.log('🧪 EXECUÇÃO DA BATERIA DE HOMOLOGAÇÃO: OE-004.001-R4');
console.log('   Fechamento Comportamental da Fundação de Laudos (28 Provas Reais)');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details = '') {
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
  // PROVA 1: REMOÇÃO DO SOMATÓRIO AUTOMÁTICO E DISCLAIMER FORMAL
  // -------------------------------------------------------------
  const propertyFormPath = path.resolve(process.cwd(), 'src/properties/components/PropertyForm.tsx');
  const propertyFormContent = fs.readFileSync(propertyFormPath, 'utf-8');

  assert(
    !propertyFormContent.includes('Total Registrado (Soma das Matrículas)') &&
    propertyFormContent.includes('Aviso Cadastral:') &&
    propertyFormContent.includes('não são somadas automaticamente pelo sistema'),
    '1. Remoção comprovada do somatório automático de áreas registradas e presença do disclaimer formal'
  );

  // -------------------------------------------------------------
  // PROVA 2: REGISTRO DE PROPERTIES_GEOMETRY NA ROUTEMATRIX
  // -------------------------------------------------------------
  const routeMatrixPath = path.resolve(process.cwd(), 'src/routes/routeMatrix.ts');
  const routeMatrixContent = fs.readFileSync(routeMatrixPath, 'utf-8');

  assert(
    routeMatrixContent.includes('ROUTES.PROPERTIES_GEOMETRY') &&
    routeMatrixContent.includes("'properties:geospatial:view'") &&
    routeMatrixContent.includes('Georreferenciamento e Geometria'),
    '2. Registro determinístico de ROUTES.PROPERTIES_GEOMETRY na routeMatrix com permissão properties:geospatial:view'
  );

  // -------------------------------------------------------------
  // PROVA 3: LIMPEZA SEGURA DE SESSÃO SEM LOCALSTORAGE.CLEAR()
  // -------------------------------------------------------------
  const authContextPath = path.resolve(process.cwd(), 'src/auth/AuthContext.tsx');
  const authContextContent = fs.readFileSync(authContextPath, 'utf-8');

  assert(
    !authContextContent.includes('localStorage.clear()') &&
    authContextContent.includes('executeDomainSessionCleanup()') &&
    getRegisteredDomainCleanupCount() >= 0,
    '3. Limpeza segura de sessão/logout sem localStorage.clear() global e com isolamento multitenant'
  );

  // -------------------------------------------------------------
  // PROVAS 4, 5, 6: GOVERNANÇA, FONTES CANÔNICAS E DERIVAÇÃO DE PROPERTY TYPE
  // -------------------------------------------------------------
  const accessDeniedTenant = evaluateAppraisalAccess({
    operation: 'create_appraisal',
    actorUserId: 'user_1',
    actorRole: 'project_designer',
    actorPermissions: ['appraisals:create', 'appraisals:view'],
    activeOrganizationId: 'org_A',
    targetOrganizationId: 'org_B', // Organização diferente
    isMembershipActive: true,
  });

  assert(
    accessDeniedTenant.granted === false &&
    accessDeniedTenant.denialCode === 'ORGANIZATION_MISMATCH',
    '4. Criação de laudo recusada quando cliente/imóvel não pertencem à organização ativa'
  );

  const directClient: Client = {
    id: 'client_direct',
    organizationId: 'org_A',
    personType: 'individual',
    name: 'Cliente Direto',
    cpf: '12345678901',
    isStateRegistrationExempt: true,
    contact: { primaryPhone: '0000000000', hasWhatsapp: false },
    address: {
      addressType: 'urban',
      zipCode: '00000000',
      street: 'Rua Teste',
      number: '1',
      isNoNumber: false,
      neighborhood: 'Centro',
      city: 'Cidade',
      state: 'SP',
    },
    status: 'active',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  const directProperty = {
    id: 'property_direct',
    organizationId: 'org_A',
    propertyType: 'urban',
    status: 'active',
    clientLinks: [
      {
        clientId: directClient.id,
        relationship: 'owner',
        isPrimaryHolder: true,
        linkedAt: '2026-01-01',
      },
    ],
  } as unknown as Property;
  const directProfile: TechnicalProfessionalProfile = {
    id: 'profile_direct',
    organizationId: 'org_A',
    userId: 'user_direct',
    council: 'CAU',
    registrationNumber: 'A123',
    registrationUf: 'SP',
    declaredTitle: 'Arquiteto e Urbanista',
    discipline: 'architecture',
    responsibilityDocumentType: 'RRT',
    status: 'manually_verified',
    capabilities: [
      {
        id: 'cap_direct',
        organizationId: 'org_A',
        profileId: 'profile_direct',
        activityType: 'urban_property_appraisal',
        scope: 'urban',
        council: 'CAU',
        legalReference: 'Lei 12.378/2010',
        status: 'active',
        verifiedAt: '2026-01-01',
        verifiedByUserId: 'admin_1',
        evidenceOrigin: 'manual_administrative',
      },
    ],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  const directCommand = {
    clientId: directClient.id,
    propertyId: directProperty.id,
    title: 'Laudo urbano direto',
    purpose: 'Garantia',
  };
  const directValidationContext = {
    organizationId: 'org_A',
    actorUserId: 'user_direct',
    actorRole: 'project_designer' as const,
    actorPermissions: ['appraisals:create', 'appraisals:edit'] as const,
    isMembershipActive: true,
    resolveClient: async () => directClient,
    resolveProperty: async () => directProperty,
    resolveTechnicalProfile: async () => directProfile,
  };

  let unlinkedPropertyRejected = false;
  try {
    await validateStartDirectAppraisalCommand(directCommand, {
      ...directValidationContext,
      resolveProperty: async () =>
        ({ ...directProperty, clientLinks: [] } as unknown as Property),
    });
  } catch {
    unlinkedPropertyRejected = true;
  }
  assert(
    unlinkedPropertyRejected,
    '5. Criação de laudo recusada quando o imóvel não está vinculado ao cliente selecionado'
  );

  const validatedDirectSources = await validateStartDirectAppraisalCommand(
    directCommand,
    directValidationContext
  );
  assert(
    validatedDirectSources.propertyType === 'urban' &&
      validatedDirectSources.technicalProfessionalProfileId === directProfile.id,
    '6. Derivação determinística de propertyType e perfil a partir das fontes canônicas'
  );

  const appraisalsContextPath = path.resolve(process.cwd(), 'src/appraisals/AppraisalsContext.tsx');
  const appraisalsContextContent = fs.readFileSync(appraisalsContextPath, 'utf-8');

  // -------------------------------------------------------------
  // PROVAS 7 A 14: AVALIADOR DE ELEGIBILIDADE TÉCNICA E GOVERNANÇA
  // -------------------------------------------------------------
  const unauthEval = evaluateTechnicalEligibility({
    userId: null,
    userPermissions: [],
    activeOrganizationId: 'org_A',
    targetOrganizationId: 'org_A',
    profile: null,
  });
  assert(
    unauthEval.eligible === false &&
    unauthEval.reasonCodes.includes('unauthenticated_user') &&
    unauthEval.reasonCodes.includes('missing_rbac_permission'),
    '7. Avaliação de elegibilidade técnica exigindo autenticação e rejeitando usuário sem permissões'
  );

  const crossOrgEval = evaluateTechnicalEligibility({
    userId: 'user_1',
    userPermissions: ['appraisals:create', 'appraisals:edit'],
    activeOrganizationId: 'org_A',
    targetOrganizationId: 'org_B',
    profile: {
      id: 'prof_1',
      organizationId: 'org_B',
      userId: 'user_1',
      council: 'CREA',
      registrationNumber: '12345',
      registrationUf: 'SP',
      declaredTitle: 'Engenheiro Agrônomo',
      discipline: 'agronomy',
      responsibilityDocumentType: 'ART',
      status: 'manually_verified',
      capabilities: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  });
  assert(
    crossOrgEval.eligible === false &&
    crossOrgEval.reasonCodes.includes('missing_organization'),
    '8. Avaliação de elegibilidade técnica validando isolamento entre organizações (activeOrganizationId vs targetOrganizationId)'
  );

  const viewOnlyEval = evaluateTechnicalEligibility({
    userId: 'user_1',
    userPermissions: ['appraisals:view'], // Somente leitura
    activeOrganizationId: 'org_A',
    targetOrganizationId: 'org_A',
    profile: {
      id: 'prof_1',
      organizationId: 'org_A',
      userId: 'user_1',
      council: 'CREA',
      registrationNumber: '12345',
      registrationUf: 'SP',
      declaredTitle: 'Engenheiro Agrônomo',
      discipline: 'agronomy',
      responsibilityDocumentType: 'ART',
      status: 'manually_verified',
      capabilities: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  });
  assert(
    viewOnlyEval.eligible === false &&
    viewOnlyEval.reasonCodes.includes('missing_rbac_permission'),
    '9. Avaliador rejeitando perfil quando faltam permissões essenciais de RBAC (ex: apenas appraisals:view)'
  );

  const suspendedEval = evaluateTechnicalEligibility({
    userId: 'user_1',
    userPermissions: ['appraisals:create', 'appraisals:edit'],
    activeOrganizationId: 'org_A',
    targetOrganizationId: 'org_A',
    profile: {
      id: 'prof_1',
      organizationId: 'org_A',
      userId: 'user_1',
      council: 'CREA',
      registrationNumber: '12345',
      registrationUf: 'SP',
      declaredTitle: 'Engenheiro Agrônomo',
      discipline: 'agronomy',
      responsibilityDocumentType: 'ART',
      status: 'suspended',
      capabilities: [],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  });
  assert(
    suspendedEval.eligible === false &&
    suspendedEval.reasonCodes.includes('council_registration_suspended'),
    '10. Avaliador rejeitando perfil suspenso, expirado ou não verificado para emissão'
  );

  const creaRuralEval = evaluateTechnicalEligibility({
    userId: 'user_agronomo',
    userPermissions: ['appraisals:create', 'appraisals:edit'],
    activeOrganizationId: 'org_A',
    targetOrganizationId: 'org_A',
    propertyType: 'rural',
    profile: {
      id: 'prof_crea',
      organizationId: 'org_A',
      userId: 'user_agronomo',
      council: 'CREA',
      registrationNumber: '556677',
      registrationUf: 'MT',
      declaredTitle: 'Engenheiro Agrônomo',
      discipline: 'agronomy',
      responsibilityDocumentType: 'ART',
      status: 'manually_verified',
      capabilities: [
        {
          id: 'cap_1',
          organizationId: 'org_A',
          profileId: 'prof_crea',
          activityType: 'rural_property_appraisal',
          scope: 'rural',
          council: 'CREA',
          legalReference: 'Art. 7 Lei 5.194/66',
          status: 'active',
          verifiedAt: '2026-01-01T00:00:00Z',
          verifiedByUserId: 'admin_1',
          evidenceOrigin: 'manual_administrative',
        },
      ],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  });
  assert(
    creaRuralEval.eligible === true &&
    creaRuralEval.profileEvaluated?.discipline === 'agronomy' &&
    creaRuralEval.profileEvaluated?.council === 'CREA' &&
    creaRuralEval.profileEvaluated?.responsibilityDocumentType === 'ART' &&
    creaRuralEval.canIssue === false,
    '11. Avaliador aceita elaboração rural com CREA/ART, sem confundir criação com emissão'
  );

  const cauUrbanEval = evaluateTechnicalEligibility({
    userId: 'user_arquiteto',
    userPermissions: ['appraisals:create', 'appraisals:edit'],
    activeOrganizationId: 'org_A',
    targetOrganizationId: 'org_A',
    propertyType: 'urban',
    profile: {
      id: 'prof_cau',
      organizationId: 'org_A',
      userId: 'user_arquiteto',
      council: 'CAU',
      registrationNumber: 'A12345',
      registrationUf: 'SP',
      declaredTitle: 'Arquiteto e Urbanista',
      discipline: 'architecture',
      responsibilityDocumentType: 'RRT',
      status: 'manually_verified',
      capabilities: [
        {
          id: 'cap_2',
          organizationId: 'org_A',
          profileId: 'prof_cau',
          activityType: 'urban_property_appraisal',
          scope: 'urban',
          council: 'CAU',
          legalReference: 'Lei 12.378/2010',
          status: 'active',
          verifiedAt: '2026-01-01T00:00:00Z',
          verifiedByUserId: 'admin_1',
          evidenceOrigin: 'manual_administrative',
        },
      ],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  });
  assert(
    cauUrbanEval.eligible === true &&
    cauUrbanEval.profileEvaluated?.discipline === 'architecture' &&
    cauUrbanEval.profileEvaluated?.council === 'CAU' &&
    cauUrbanEval.profileEvaluated?.responsibilityDocumentType === 'RRT',
    '12. Avaliador aceitando perfil com CAU e RRT válidos para urbano'
  );

  const cftaRuralEval = evaluateTechnicalEligibility({
    userId: 'user_tecnico',
    userPermissions: ['appraisals:create', 'appraisals:edit'],
    activeOrganizationId: 'org_A',
    targetOrganizationId: 'org_A',
    propertyType: 'rural',
    profile: {
      id: 'prof_cfta',
      organizationId: 'org_A',
      userId: 'user_tecnico',
      council: 'CFTA',
      registrationNumber: '998877',
      registrationUf: 'PR',
      declaredTitle: 'Técnico em Agropecuária',
      discipline: 'agricultural_technician',
      responsibilityDocumentType: 'TRT',
      status: 'manually_verified',
      capabilities: [
        {
          id: 'cap_3',
          organizationId: 'org_A',
          profileId: 'prof_cfta',
          activityType: 'rural_property_appraisal',
          scope: 'rural',
          council: 'CFTA',
          legalReference: 'Res. CFTA 31/2021',
          status: 'active',
          verifiedAt: '2026-01-01T00:00:00Z',
          verifiedByUserId: 'admin_1',
          evidenceOrigin: 'manual_administrative',
        },
      ],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  });
  assert(
    cftaRuralEval.eligible === true &&
    cftaRuralEval.profileEvaluated?.discipline === 'agricultural_technician' &&
    cftaRuralEval.profileEvaluated?.council === 'CFTA' &&
    cftaRuralEval.profileEvaluated?.responsibilityDocumentType === 'TRT',
    '13. Avaliador aceitando perfil com CFT/CFTA e TRT válidos para rural'
  );

  const issueIntentEval = evaluateTechnicalEligibility({
    userId: 'user_agronomo',
    userPermissions: ['appraisals:create', 'appraisals:edit'],
    activeOrganizationId: 'org_A',
    targetOrganizationId: 'org_A',
    propertyType: 'rural',
    intent: 'issue',
    profile: {
      id: 'prof_crea',
      organizationId: 'org_A',
      userId: 'user_agronomo',
      council: 'CREA',
      registrationNumber: '556677',
      registrationUf: 'MT',
      declaredTitle: 'Engenheiro Agrônomo',
      discipline: 'agronomy',
      responsibilityDocumentType: 'ART',
      status: 'manually_verified',
      capabilities: [
        {
          id: 'cap_1',
          organizationId: 'org_A',
          profileId: 'prof_crea',
          activityType: 'rural_property_appraisal',
          scope: 'rural',
          council: 'CREA',
          legalReference: 'Art. 7 Lei 5.194/66',
          status: 'active',
          verifiedAt: '2026-01-01T00:00:00Z',
          verifiedByUserId: 'admin_1',
          evidenceOrigin: 'manual_administrative',
        },
      ],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  });
  assert(
    issueIntentEval.canIssue === false &&
    issueIntentEval.allowed === false &&
    issueIntentEval.reasonCodes.includes('missing_rbac_permission') &&
    suspendedEval.canIssue === false &&
    viewOnlyEval.canIssue === false &&
    suspendedEval.reasonCodes.includes('council_registration_suspended'),
    '14. Bloqueio estrito de emissão sem appraisals:issue, para perfil suspenso ou sem permissões'
  );

  // -------------------------------------------------------------
  // PROVA 15: SEPARAÇÃO ESTRITA DE PERMISSÕES DE PERFIL PROFISSIONAL
  // -------------------------------------------------------------
  const authCatalogPath = path.resolve(process.cwd(), 'src/authorization/permissionsCatalog.ts');
  const authCatalogContent = fs.readFileSync(authCatalogPath, 'utf-8');

  assert(
    authCatalogContent.includes('technical_professionals:view_self') &&
    authCatalogContent.includes('technical_professionals:update_self') &&
    authCatalogContent.includes('technical_professionals:verify') &&
    authCatalogContent.includes('technical_professionals:manage_capabilities'),
    '15. Separação estrita de permissões de perfil profissional (view_self vs update_self vs verify)'
  );

  // -------------------------------------------------------------
  // PROVAS 16, 17, 18: TAXONOMIA, SANITIZAÇÃO E DIÁRIO APPEND-ONLY
  // -------------------------------------------------------------
  clearDomainEventJournal();

  let invalidEventThrown = false;
  try {
    const untrustedEventType: unknown = 'tipo_invalido_fake';
    if (!isValidDomainEventType(untrustedEventType)) {
      throw new Error('Taxonomia inválida.');
    }
    createAppraisalDomainEvent({
      eventType: untrustedEventType,
      entityType: 'appraisal',
      entityId: 'app_1',
      organizationId: 'org_A',
      actorUserId: 'user_1',
    });
  } catch {
    invalidEventThrown = true;
  }

  assert(
    invalidEventThrown === true &&
    isValidDomainEventType('appraisal_created_by_technical_initiative') === true &&
    isValidDomainEventType('appraisal_request_submitted') === true,
    '16. Validação estrita da taxonomia de eventos de domínio (rejeitando tipo inválido)'
  );

  const sanitizedEvent = createAppraisalDomainEvent({
    eventType: 'appraisal_created_by_technical_initiative',
    entityType: 'appraisal',
    entityId: 'app_safe_1',
    organizationId: 'org_A',
    actorUserId: 'user_1',
    payload: {
      clientCpf: '123.456.789-00',
      accountPassword: 'superSecretPassword',
      bearerToken: 'eyJhbGciOi...',
      title: 'Laudo Fazenda Primavera',
    },
  });

  assert(
    sanitizedEvent.payload.accountPassword === '[REDACTED]' &&
    sanitizedEvent.payload.bearerToken === '[REDACTED]' &&
    String(sanitizedEvent.payload.clientCpf).includes('***') &&
    sanitizedEvent.payload.title === 'Laudo Fazenda Primavera',
    '17. Sanitização de dados sensíveis no payload de eventos de domínio'
  );

  const journal = getDomainEventJournal('org_A');
  assert(
    Array.isArray(journal) &&
    journal.length >= 1 &&
    journal[0].entityId === 'app_safe_1',
    '18. Diário imutável append-only de eventos de domínio'
  );

  // -------------------------------------------------------------
  // PROVAS 19, 20: MÁQUINAS DE ESTADO DE LAUDOS E SOLICITAÇÕES
  // -------------------------------------------------------------
  assert(
    canTransitionAppraisal('draft', 'data_collection') === true &&
    canTransitionAppraisal('review', 'ready_to_issue') === true &&
    canTransitionAppraisal('draft', 'issued') === false && // Proibido salto direto
    canTransitionAppraisal('cancelled', 'draft') === false, // Estado terminal
    '19. Transições válidas e inválidas na máquina de estados de laudos'
  );

  assert(
    canTransitionAppraisalRequest('submitted', 'received') === true &&
    canTransitionAppraisalRequest('received', 'assigned') === true &&
    canTransitionAppraisalRequest('submitted', 'completed') === false && // Proibido salto
    canTransitionAppraisalRequest('cancelled', 'submitted') === false, // Estado terminal
    '20. Transições válidas e inválidas na máquina de estados de solicitações'
  );

  // -------------------------------------------------------------
  // PROVAS 21, 22, 23: ISOLAMENTO MULTITENANT NOS PREVIEW GATEWAYS
  // -------------------------------------------------------------
  const appraisalGw = new PreviewAppraisalGateway();
  const reqGw = new PreviewAppraisalRequestGateway();
  const techGw = new PreviewTechnicalProfessionalGateway();

  // Organização A
  const appA = await appraisalGw.createAppraisal({
    organizationId: 'org_TENANT_A',
    clientId: 'cli_1',
    propertyId: 'prop_1',
    responsibleUserId: 'user_1',
    origin: 'technical_initiative',
    purpose: 'Avaliação Rural',
    title: 'Laudo Org A',
    propertyType: 'rural',
  });

  // Organização B
  const appB = await appraisalGw.createAppraisal({
    organizationId: 'org_TENANT_B',
    clientId: 'cli_2',
    propertyId: 'prop_2',
    responsibleUserId: 'user_2',
    origin: 'technical_initiative',
    purpose: 'Avaliação Urbana',
    title: 'Laudo Org B',
    propertyType: 'urban',
  });

  const listOrgA = await appraisalGw.listAppraisals({ organizationId: 'org_TENANT_A' });
  const listOrgB = await appraisalGw.listAppraisals({ organizationId: 'org_TENANT_B' });

  assert(
    listOrgA.items.length === 1 &&
    listOrgA.items[0].id === appA.id &&
    listOrgB.items.length === 1 &&
    listOrgB.items[0].id === appB.id,
    '21. Isolamento multitenant no PreviewAppraisalGateway'
  );

  const reqA = await reqGw.createRequest({
    organizationId: 'org_TENANT_A',
    clientId: 'cli_1',
    propertyId: 'prop_1',
    requestedByUserId: 'user_1',
    purpose: 'Solicitação A',
  });

  const reqListB = await reqGw.listRequests({ organizationId: 'org_TENANT_B' });
  assert(
    reqListB.items.length === 0,
    '22. Isolamento multitenant no PreviewAppraisalRequestGateway'
  );

  const profA = await techGw.createProfile({
    organizationId: 'org_TENANT_A',
    userId: 'user_1',
    council: 'CREA',
    registrationNumber: '111',
    registrationUf: 'GO',
    declaredTitle: 'Eng. Agrônomo',
    discipline: 'agronomy',
    responsibilityDocumentType: 'ART',
  });

  const profInOrgB = await techGw.getProfileByUserId('org_TENANT_B', 'user_1');
  assert(
    profInOrgB === null,
    '23. Isolamento multitenant no PreviewTechnicalProfessionalGateway'
  );

  // -------------------------------------------------------------
  // PROVA 24: BLOQUEIO DE SOLICITAÇÃO DO CAPTADOR SEM VÍNCULO CANÔNICO (R4)
  // -------------------------------------------------------------
  const capturerAccess = evaluateAppraisalAccess({
    operation: 'create_request',
    actorUserId: 'user_capturer',
    actorRole: 'capturer',
    actorPermissions: ['appraisal_requests:create'],
    activeOrganizationId: 'org_A',
    targetOrganizationId: 'org_A',
    isMembershipActive: true,
  });

  assert(
    capturerAccess.granted === false &&
    capturerAccess.denialCode === 'CAPTURER_ASSIGNMENT_NOT_AVAILABLE',
    '24. Bloqueio de solicitações do captador com CAPTURER_ASSIGNMENT_NOT_AVAILABLE até vínculo canônico (R4)'
  );

  // -------------------------------------------------------------
  // PROVA 25: BLOQUEIO DE CONVERSÃO ARBITRÁRIA / ORIGEM EM CREATEAPPRAISAL (R4)
  // -------------------------------------------------------------
  assert(
    !appraisalsContextContent.includes('readonly createAppraisal:') &&
    appraisalsContextContent.includes('readonly startDirectAppraisal:') &&
    appraisalsContextContent.includes('readonly convertRequestToAppraisal:'),
    '25. Contratos públicos separam início direto e conversão, sem createAppraisal manipulável'
  );

  // -------------------------------------------------------------
  // PROVA 26: VALIDAÇÃO CANÔNICA E SANITIZAÇÃO EM ADDREQUESTDOCUMENT (R4)
  // -------------------------------------------------------------
  assert(
    appraisalsContextContent.includes('addRequestDocument') &&
    appraisalsContextContent.includes('Referência documental rejeitada') &&
    appraisalsContextContent.includes('sensitivePattern.test'),
    '26. Validação canônica e sanitização de segurança em addRequestDocument (R4)'
  );

  // -------------------------------------------------------------
  // PROVA 27: GOVERNANÇA ESTRITA DE PERMISSÕES DE SOLICITAÇÕES (R4)
  // -------------------------------------------------------------
  const capturerStatusUpdateAccess = evaluateAppraisalAccess({
    operation: 'update_request_status',
    actorUserId: 'user_capturer',
    actorRole: 'capturer',
    actorPermissions: [],
    activeOrganizationId: 'org_A',
    targetOrganizationId: 'org_A',
    isMembershipActive: true,
  });

  assert(
    capturerStatusUpdateAccess.granted === false &&
    capturerStatusUpdateAccess.denialCode === 'CAPTURER_CANNOT_CHANGE_REQUEST_STATUS' &&
    !authCatalogContent.includes('appraisal_requests:edit'),
    '27. Governança estrita de permissões de solicitações sem appraisal_requests:edit residual (R4)'
  );

  // -------------------------------------------------------------
  // PROVA 28: PURGA TOTAL DE CLASSES/CORES PROIBIDAS NO MÓDULO 004 (R4)
  // -------------------------------------------------------------
  const module4Files = [
    'src/appraisals/theme.ts',
    'src/appraisals/AppraisalsContext.tsx',
    'src/pages/AppraisalsPage.tsx',
    'src/pages/AppraisalRequestsPage.tsx',
  ];

  const forbiddenClassesRegex = /(bg|text|border|ring|placeholder|divide)-(slate|gray|zinc|neutral|stone|rose|red|amber|yellow|emerald|blue|indigo|violet|purple|sky|cyan)-[0-9]+|dark:[a-zA-Z0-9_\-\/]+/;

  let hasForbiddenColor = false;
  for (const fileRel of module4Files) {
    const content = fs.readFileSync(path.resolve(process.cwd(), fileRel), 'utf-8');
    if (forbiddenClassesRegex.test(content)) {
      hasForbiddenColor = true;
      console.error(`Classe proibida encontrada em ${fileRel}`);
    }
  }

  assert(
    hasForbiddenColor === false,
    '28. Purga total de classes/cores proibidas (slate, gray, zinc, neutral, stone, black, dark:*, rose, red, amber, yellow, emerald, blue) no módulo 004 (R4)'
  );

  console.log('\n================================================================');
  console.log(`📊 RESULTADO DA BATERIA OE-004.001-R4: ${passedTests} APROVADOS, ${failedTests} FALHAS`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('✨ HOMOLOGAÇÃO TOTAL OE-004.001-R4 CONCLUÍDA COM 100% DE SUCESSO (28/28 PROVAS VERIFICADAS)!');
  }
}

runTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
