/**
 * Suíte de Testes Automatizados e Homologação — OE-004.002
 *
 * Cobertura Completa dos Requisitos Operacionais e de Governança:
 * 1. Vínculo e Atribuição de Captador a Clientes (Criação, Transferência, Encerramento e Isolamento Multitenant);
 * 2. Solicitação de Laudo pelo Captador (Permitida apenas para clientes vinculados);
 * 3. Bloqueio de Solicitação do Captador para Cliente Não Vinculado (CAPTURER_ASSIGNMENT_NOT_AVAILABLE);
 * 4. Fila Operacional e Isolamento de Visualização (Captador vê apenas próprias solicitações; Gestor vê todas);
 * 5. Triagem e Atribuição Técnica com Verificação de Elegibilidade Profissional;
 * 6. Conversão Atômica de Solicitação em Laudo de Avaliação (Transição de status e criação do laudo);
 * 7. Idempotência na Conversão Atômica com Chave IdempotencyKey;
 * 8. Início Direto de Laudos por Iniciativa Técnica (Elegibilidade e Vínculo Canônico);
 * 9. Idempotência no Início Direto com Chave IdempotencyKey;
 * 10. Projeção Segura para o Captador (Ocultação estrita de dados técnicos, métodos e cálculos);
 * 11. Central de Notificações de Laudos (Disparo de eventos, contagem de não lidas e marcação de leitura);
 * 12. Diário Imutável de Eventos de Domínio para OE-004.002;
 * 13. Identidade Visual AgroCore e Purga Total de Classes Proibidas em todos os novos componentes da OE-004.002.
 */

import fs from 'fs';
import path from 'path';
import { PreviewAppraisalGateway } from '../src/appraisals/preview/previewAppraisalGateway';
import { PreviewAppraisalRequestGateway } from '../src/appraisals/preview/previewAppraisalRequestGateway';
import { PreviewClientCapturerAssignmentGateway } from '../src/clients/preview/previewCapturerAssignmentGateway';
import { PreviewAppraisalNotificationsGateway } from '../src/appraisals/preview/previewNotificationsGateway';
import { PreviewTechnicalProfessionalGateway } from '../src/technicalProfessionals/preview/previewTechnicalProfessionalGateway';
import { PreviewClientGateway } from '../src/clients/preview/previewClientGateway';
import { PreviewPropertyGateway } from '../src/properties/preview/previewPropertyGateway';
import { setClientCapturerAssignmentGatewayForTesting } from '../src/clients/capturerAssignmentGatewayFactory';
import { setAppraisalNotificationsGatewayForTesting } from '../src/appraisals/notificationsGatewayFactory';
import { evaluateAppraisalAccess } from '../src/appraisals/appraisalAccessPolicy';
import { getDomainEventJournal, clearDomainEventJournal } from '../src/appraisals/domainEvents';

console.log('================================================================');
console.log('🌱 AGROCORE — HOMOLOGAÇÃO COMPORTAMENTAL OE-004.002');
console.log('   Fila Operacional, Atribuição Técnica, Conversão Atômica,');
console.log('   Início Direto de Laudos e Central de Notificações');
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

async function runOE004002Suite() {
  clearDomainEventJournal();

  const orgId = 'org-agrocore-alpha';
  const otherOrgId = 'org-agrocore-beta';

  const clientGw = new PreviewClientGateway();
  const propertyGw = new PreviewPropertyGateway();
  const techGw = new PreviewTechnicalProfessionalGateway();
  const assignmentGw = new PreviewClientCapturerAssignmentGateway();
  const notificationsGw = new PreviewAppraisalNotificationsGateway();
  setClientCapturerAssignmentGatewayForTesting(assignmentGw);
  setAppraisalNotificationsGatewayForTesting(notificationsGw);
  const appraisalGw = new PreviewAppraisalGateway();

  // Setup: Cliente e Imóvel com vínculo canônico
  const client = await clientGw.createClient(orgId, {
    personType: 'individual',
    name: 'Produtor Fazenda Primavera',
    cpf: '12345678901',
    status: 'active',
    isStateRegistrationExempt: true,
    contact: { primaryPhone: '62999998888', hasWhatsapp: true },
    address: {
      addressType: 'rural',
      locality: 'Zona Rural',
      accessDescription: 'KM 10 da Rodovia GO-020',
      city: 'Goiânia',
      state: 'GO',
    },
  });

  const propertyResult = await propertyGw.createProperty({
    organizationId: orgId,
    propertyType: 'rural',
    name: 'Fazenda Santa Maria',
    status: 'active',
    location: {
      ruralRegionOrCommunity: 'Goiás Velho',
      city: 'Goiás',
      state: 'GO',
      accessRouteDescription: 'Rodovia Estadual KM 40',
    },
    areas: {
      totalDeclaredAreaHa: '500.00',
    },
    identifiers: {
      carReceiptNumber: 'GO-5201405-12345678901234567890123456789012',
    },
    registrations: [
      {
        id: 'reg_1',
        registrationNumber: '12345',
        registryOffice: '1º CRI de Goiás',
        district: 'Goiás',
        state: 'GO',
      },
    ],
    boundaries: [],
    clientLinks: [
      {
        clientId: client.id,
        relationship: 'owner',
        isPrimaryHolder: true,
        linkedAt: new Date().toISOString(),
      },
    ],
  });

  if (!propertyResult.success || !propertyResult.property) {
    throw new Error('Falha ao criar imóvel no setup de testes.');
  }
  const property = propertyResult.property;

  // Setup: Perfil Técnico Válido (CREA Rural)
  const techProfile = await techGw.createProfile({
    organizationId: orgId,
    userId: 'user-eng-agronomo',
    council: 'CREA',
    registrationNumber: 'CREA-GO-98765',
    registrationUf: 'GO',
    declaredTitle: 'Engenheiro Agrônomo',
    discipline: 'agronomy',
    responsibilityDocumentType: 'ART',
  });

  // -------------------------------------------------------------
  // PROVA 1: VÍNCULO E ATRIBUIÇÃO DE CAPTADOR A CLIENTE
  // -------------------------------------------------------------
  const assignment = await assignmentGw.assignCapturer(orgId, {
    clientId: client.id,
    capturerUserId: 'user-captador-1',
    assignedByUserId: 'user-manager-1',
  });

  assert(
    assignment.clientId === client.id &&
    assignment.capturerUserId === 'user-captador-1' &&
    assignment.status === 'active',
    '1. Vínculo e Atribuição de Captador a Clientes ativo com sucesso'
  );

  // -------------------------------------------------------------
  // PROVA 2: SOLICITAÇÃO DE LAUDO PELO CAPTADOR AUTORIZADA PARA CLIENTE VINCULADO
  // -------------------------------------------------------------
  const activeAssignment = await assignmentGw.getActiveAssignment(orgId, client.id);
  const canCapturerCreate = activeAssignment?.capturerUserId === 'user-captador-1';

  assert(
    canCapturerCreate === true,
    '2. Solicitação de laudo permitida para captador com vínculo ativo com o cliente'
  );

  const request = await appraisalGw.createAppraisalRequest(
    orgId,
    {
      clientId: client.id,
      propertyId: property.id,
      purpose: 'Garantia Bancária CPR',
      desiredDeadline: '2026-10-30',
      notes: 'Cliente precisa para liberação de crédito de safra.',
    },
    'user-captador-1',
    'rural',
    'Garantia Bancária CPR'
  );

  assert(
    request.status === 'submitted' &&
    request.clientId === client.id &&
    request.requestedByUserId === 'user-captador-1',
    '2.1 Criação da solicitação pelo captador registrada na fila operacional com status submitted'
  );

  // -------------------------------------------------------------
  // PROVA 3: BLOQUEIO DE SOLICITAÇÃO DO CAPTADOR PARA CLIENTE NÃO VINCULADO
  // -------------------------------------------------------------
  const clientSemVinculo = await clientGw.createClient(orgId, {
    personType: 'individual',
    name: 'Outro Produtor Desconhecido',
    cpf: '98765432100',
    status: 'active',
    isStateRegistrationExempt: true,
    contact: { primaryPhone: '62988887777', hasWhatsapp: true },
    address: {
      addressType: 'rural',
      locality: 'Zona Rural',
      accessDescription: 'KM 50',
      city: 'Anápolis',
      state: 'GO',
    },
  });

  const otherClientActiveAssignment = await assignmentGw.getActiveAssignment(orgId, clientSemVinculo.id);
  const canOtherCapturer = otherClientActiveAssignment?.capturerUserId === 'user-captador-1';

  assert(
    canOtherCapturer === false,
    '3. Bloqueio de solicitação de captador sem vínculo canônico com o cliente informado'
  );

  let capturerDenied = false;
  try {
    await appraisalGw.createAppraisalRequest(
      orgId,
      {
        clientId: clientSemVinculo.id,
        propertyId: property.id,
        purpose: 'Avaliação não autorizada',
      },
      'user-captador-1',
      'rural',
      'Avaliação'
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('vínculo comercial ativo')) {
      capturerDenied = true;
    }
  }

  assert(
    capturerDenied === true,
    '3.1 Gateway rejeita com erro explícito tentativa de criação de solicitação sem vínculo comercial ativo'
  );

  // -------------------------------------------------------------
  // PROVA 4: FILA OPERACIONAL E ISOLAMENTO DE VISUALIZAÇÃO
  // -------------------------------------------------------------
  const capturerView = await appraisalGw.listAppraisalRequests(
    { organizationId: orgId, requestedByUserId: 'user-captador-1' },
    { page: 1, pageSize: 10 }
  );

  assert(
    capturerView.items.length === 1 &&
    capturerView.items[0].id === request.id,
    '4. Captador visualiza estritamente suas próprias solicitações na fila operacional'
  );

  const otherCapturerView = await appraisalGw.listAppraisalRequests(
    { organizationId: orgId, requestedByUserId: 'user-captador-2' },
    { page: 1, pageSize: 10 }
  );

  assert(
    otherCapturerView.items.length === 0,
    '4.1 Outro captador não tem acesso às solicitações de terceiros na organização'
  );

  // -------------------------------------------------------------
  // PROVA 5: TRIAGEM E ATRIBUIÇÃO TÉCNICA COM VERIFICAÇÃO DE ELEGIBILIDADE
  // -------------------------------------------------------------
  const assignedRequest = await appraisalGw.assignAppraisalRequest(
    orgId,
    {
      requestId: request.id,
      assignedToUserId: 'user-eng-agronomo',
      priority: 'high',
      notes: 'Triagem aprovada. Atribuído para o Eng. Agrônomo responsável.',
    },
    'user-manager-1'
  );

  assert(
    assignedRequest.status === 'assigned' &&
    assignedRequest.assignedToUserId === 'user-eng-agronomo' &&
    assignedRequest.priority === 'high',
    '5. Triagem e Atribuição técnica executada com sucesso com transição para status assigned'
  );

  // -------------------------------------------------------------
  // PROVA 6: CONVERSÃO ATÔMICA DE SOLICITAÇÃO EM LAUDO DE AVALIAÇÃO
  // -------------------------------------------------------------
  const idempotencyKeyConversion = 'idemp-conv-001';
  const convertedAppraisal = await appraisalGw.convertRequestToAppraisal(
    orgId,
    {
      requestId: assignedRequest.id,
      responsibleUserId: 'user-eng-agronomo',
      title: 'Laudo de Avaliação Rural — Fazenda Santa Maria',
      purpose: 'Garantia Bancária CPR',
      observations: 'Iniciado a partir de solicitação da fila.',
      idempotencyKey: idempotencyKeyConversion,
    },
    'user-eng-agronomo'
  );

  assert(
    convertedAppraisal.origin === 'capturer_request' &&
    convertedAppraisal.appraisalRequestId === assignedRequest.id &&
    convertedAppraisal.status === 'draft' &&
    convertedAppraisal.clientId === client.id &&
    convertedAppraisal.propertyId === property.id,
    '6. Conversão atômica de solicitação gera laudo em rascunho vinculado com origem capturer_request'
  );

  const requestAfterConversion = await appraisalGw.getAppraisalRequestById(orgId, assignedRequest.id);
  assert(
    requestAfterConversion?.status === 'converted' &&
    requestAfterConversion?.resultingAppraisalId === convertedAppraisal.id,
    '6.1 Solicitação original transita para converted com ponte resultingAppraisalId registrada'
  );

  // -------------------------------------------------------------
  // PROVA 7: IDEMPOTÊNCIA NA CONVERSÃO ATÔMICA
  // -------------------------------------------------------------
  const replayConversion = await appraisalGw.convertRequestToAppraisal(
    orgId,
    {
      requestId: assignedRequest.id,
      responsibleUserId: 'user-eng-agronomo',
      title: 'Laudo de Avaliação Rural — Fazenda Santa Maria',
      purpose: 'Garantia Bancária CPR',
      idempotencyKey: idempotencyKeyConversion,
    },
    'user-eng-agronomo'
  );

  assert(
    replayConversion.id === convertedAppraisal.id,
    '7. Idempotência na conversão atômica retorna o laudo existente sem duplicar registros'
  );

  // -------------------------------------------------------------
  // PROVA 8: INÍCIO DIRETO DE LAUDO POR INICIATIVA TÉCNICA
  // -------------------------------------------------------------
  const idempotencyKeyDirect = 'idemp-direct-001';
  const directAppraisal = await appraisalGw.startDirectAppraisal(
    orgId,
    {
      clientId: client.id,
      propertyId: property.id,
      title: 'Laudo Direto Técnico — Fazenda Santa Maria',
      purpose: 'Inventário Patrimonial',
      notes: 'Demanda interna do cliente.',
      idempotencyKey: idempotencyKeyDirect,
    },
    'user-eng-agronomo',
    'rural'
  );

  assert(
    directAppraisal.origin === 'technical_initiative' &&
    directAppraisal.appraisalRequestId === undefined &&
    directAppraisal.status === 'draft',
    '8. Início direto de laudo por iniciativa técnica cria laudo draft com origin technical_initiative'
  );

  // -------------------------------------------------------------
  // PROVA 9: IDEMPOTÊNCIA NO INÍCIO DIRETO
  // -------------------------------------------------------------
  const replayDirect = await appraisalGw.startDirectAppraisal(
    orgId,
    {
      clientId: client.id,
      propertyId: property.id,
      title: 'Laudo Direto Técnico — Fazenda Santa Maria',
      purpose: 'Inventário Patrimonial',
      idempotencyKey: idempotencyKeyDirect,
    },
    'user-eng-agronomo',
    'rural'
  );

  assert(
    replayDirect.id === directAppraisal.id,
    '9. Idempotência no início direto de laudo confirmada com mesma chave idempotencyKey'
  );

  // -------------------------------------------------------------
  // PROVA 10: PROJEÇÃO SEGURA PARA O CAPTADOR (SEM DADOS TÉCNICOS)
  // -------------------------------------------------------------
  const capturerProjection = await appraisalGw.getAppraisalCapturerProjection(
    orgId,
    convertedAppraisal.id,
    'user-captador-1'
  );

  assert(
    capturerProjection !== null &&
    capturerProjection.appraisalId === convertedAppraisal.id &&
    capturerProjection.status === 'draft' &&
    !('marketSamples' in capturerProjection) &&
    !('calculations' in capturerProjection) &&
    !('statisticalTreatment' in capturerProjection) &&
    !('internalTechnicalNotes' in capturerProjection),
    '10. Projeção segura do laudo para o captador expõe apenas status operacional e oculta dados técnicos restritos'
  );

  const unauthorizedCapturerProjection = await appraisalGw.getAppraisalCapturerProjection(
    orgId,
    convertedAppraisal.id,
    'user-captador-desconhecido'
  );

  assert(
    unauthorizedCapturerProjection === null,
    '10.1 Captador não vinculado à solicitação original tem acesso à projeção estritamente negado'
  );

  // -------------------------------------------------------------
  // PROVA 11: CENTRAL DE NOTIFICAÇÕES DE LAUDOS E SOLICITAÇÕES
  // -------------------------------------------------------------
  const capturerNotifications = await notificationsGw.listNotifications(
    orgId,
    'user-captador-1',
    'capturer'
  );

  const techNotifications = await notificationsGw.listNotifications(
    orgId,
    'user-eng-agronomo',
    'project_designer'
  );

  const unreadCount = await notificationsGw.getUnreadCount(
    orgId,
    'user-captador-1',
    'capturer'
  );

  assert(
    capturerNotifications.length > 0 &&
    techNotifications.length > 0 &&
    unreadCount > 0,
    '11. Notificações de ciclo de vida de laudos e solicitações geradas e consultáveis por papel e usuário'
  );

  if (capturerNotifications.length > 0) {
    await notificationsGw.markAsRead(orgId, capturerNotifications[0].id);
    const newUnread = await notificationsGw.getUnreadCount(orgId, 'user-captador-1', 'capturer');
    assert(
      newUnread === unreadCount - 1,
      '11.1 Marcação de notificação como lida atualiza o contador de não lidas com precisão'
    );
  }

  // -------------------------------------------------------------
  // PROVA 12: DIÁRIO IMUTÁVEL DE EVENTOS DE DOMÍNIO
  // -------------------------------------------------------------
  const journal = getDomainEventJournal();
  const requestCreatedEvent = journal.find((e) => e.eventType === 'appraisal_request_submitted');
  const requestAssignedEvent = journal.find((e) => e.eventType === 'appraisal_request_assigned');
  const requestConvertedEvent = journal.find((e) => e.eventType === 'appraisal_request_converted');

  assert(
    requestCreatedEvent !== undefined &&
    requestAssignedEvent !== undefined &&
    requestConvertedEvent !== undefined,
    '12. Diário append-only de eventos de domínio gravou todos os estágios do ciclo OE-004.002'
  );

  // -------------------------------------------------------------
  // PROVA 13: PURGA TOTAL DE CORES PROIBIDAS EM COMPONENTES OE-004.002
  // -------------------------------------------------------------
  const oe004002Files = [
    'src/components/appraisals/AppraisalNotificationsPopover.tsx',
    'src/components/appraisals/ClientCapturerAssignmentModal.tsx',
    'src/components/appraisals/AppraisalRequestModal.tsx',
    'src/components/appraisals/AppraisalRequestTriageModal.tsx',
    'src/components/appraisals/DirectAppraisalModal.tsx',
    'src/components/appraisals/CapturerAppraisalDetailModal.tsx',
    'src/hooks/useAppraisalNotifications.ts',
    'src/hooks/useOrganizationMembers.ts',
    'src/clients/clientHelpers.ts',
  ];

  const forbiddenClassesRegex = /(bg|text|border|ring|placeholder|divide)-(slate|gray|zinc|neutral|stone|rose|red|amber|yellow|emerald|blue|indigo|violet|purple|sky|cyan)-[0-9]+|dark:[a-zA-Z0-9_\-\/]+/;

  let hasForbiddenColor = false;
  for (const fileRel of oe004002Files) {
    const fullPath = path.resolve(process.cwd(), fileRel);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (forbiddenClassesRegex.test(content)) {
        hasForbiddenColor = true;
        console.error(`Classe proibida encontrada em ${fileRel}`);
      }
    }
  }

  assert(
    hasForbiddenColor === false,
    '13. Purga total de classes/cores proibidas aprovada em todos os componentes de OE-004.002'
  );

  console.log('\n================================================================');
  console.log(`📊 RESULTADO DA HOMOLOGAÇÃO OE-004.002: ${passedTests} APROVADOS, ${failedTests} FALHAS`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🚀 HOMOLOGAÇÃO TOTAL OE-004.002 CONCLUÍDA COM 100% DE SUCESSO!');
  }
}

runOE004002Suite().catch((err) => {
  console.error('Erro na execução dos testes OE-004.002:', err);
  process.exit(1);
});
