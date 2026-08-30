/**
 * SUÍTE COMPORTAMENTAL OE-005.004
 * Documento comercial versionado, prévia e exportação segura.
 */

import { executeDomainSessionCleanup } from '../src/auth/domainCleanupRegistry';
import { OrganizationMember } from '../src/auth/organizationMembersGateway';
import { getRolePermissions } from '../src/authorization/permissionsMatrix';
import { IdGenerator, MockClock } from '../src/proposals/cryptoUtils';
import { ProposalAppContext, ProposalApplicationService } from '../src/proposals/proposalApplicationService';
import { proposalEventBus } from '../src/proposals/proposalEventService';
import { getProposalDocumentPath } from '../src/routes/paths';
import { findRouteDefinition } from '../src/routes/routeMatrix';
import { OrganizationRole } from '../src/types/auth';
import { Permission } from '../src/types/authorization';
import { Client } from '../src/types/client';
import { ClientCapturerAssignmentGateway } from '../src/types/clientCapturerAssignment';
import { CreateProposalInput, Proposal, ProposalDomainError, ProposalErrorCode } from '../src/types/proposals';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  [PASS] ${name}`);
    return;
  }
  failed += 1;
  console.error(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function expectDomainError(
  operation: () => Promise<unknown>,
  code: ProposalErrorCode,
  name: string
): Promise<void> {
  try {
    await operation();
    assert(false, name, `esperado ${code}`);
  } catch (error: unknown) {
    assert(
      error instanceof ProposalDomainError && error.code === code,
      name,
      error instanceof Error ? error.message : 'erro não tipado'
    );
  }
}

class DeterministicIdGenerator implements IdGenerator {
  private sequence = 0;

  next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_document_test_${this.sequence.toString().padStart(4, '0')}`;
  }
}

const organizationId = 'org-document-test';
const isolatedOrganizationId = 'org-document-isolated';
const capturerId = 'user-document-capturer';
const designerId = 'user-document-designer';
const managerId = 'user-document-manager';
const financeId = 'user-document-finance';

const client: Client = {
  id: 'client-document-001',
  organizationId,
  personType: 'individual',
  name: 'Cliente Canônico de Teste',
  cpf: 'SENSITIVE-DOCUMENT-NUMBER',
  isStateRegistrationExempt: true,
  contact: {
    primaryPhone: 'SENSITIVE-PHONE',
    hasWhatsapp: false,
    email: 'sensitive@example.invalid',
  },
  address: {
    addressType: 'rural',
    locality: 'Localidade Fictícia',
    accessDescription: 'Acesso fictício',
    city: 'Município de Teste',
    state: 'TT',
  },
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const members = new Map<string, OrganizationMember>([
  [capturerId, {
    id: 'member-document-capturer', userId: capturerId, name: 'Captador de Teste',
    email: 'capturer@example.invalid', organizationRole: 'capturer', isActive: true,
  }],
  [designerId, {
    id: 'member-document-designer', userId: designerId, name: 'Projetista de Teste',
    email: 'designer@example.invalid', organizationRole: 'project_designer', isActive: true,
  }],
  [managerId, {
    id: 'member-document-manager', userId: managerId, name: 'Gestor de Teste',
    email: 'manager@example.invalid', organizationRole: 'manager', isActive: true,
  }],
  [financeId, {
    id: 'member-document-finance', userId: financeId, name: 'Financeiro de Teste',
    email: 'finance@example.invalid', organizationRole: 'finance', isActive: true,
  }],
]);

const assignmentGateway: ClientCapturerAssignmentGateway = {
  async getActiveAssignment(requestOrganizationId, clientId) {
    if (requestOrganizationId !== organizationId || clientId !== client.id) return null;
    return {
      id: 'assignment-document-001', organizationId, clientId: client.id,
      capturerUserId: capturerId, status: 'active', isPrimary: true,
      startedAt: '2026-01-01T00:00:00.000Z', assignedByUserId: managerId,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
  },
  async listAssignmentsByClient() { return []; },
  async listClientsByCapturer(requestOrganizationId, userId) {
    return requestOrganizationId === organizationId && userId === capturerId ? [client.id] : [];
  },
  async assignCapturer() { throw new Error('Fora do escopo.'); },
  async transferCapturer() { throw new Error('Fora do escopo.'); },
  async terminateAssignment() { throw new Error('Fora do escopo.'); },
};

function createContext(
  userId: string,
  role: OrganizationRole,
  options: { organization?: string; injectedPermission?: Permission } = {}
): ProposalAppContext {
  const canonicalPermissions = getRolePermissions(role);
  return {
    organizationId: options.organization ?? organizationId,
    actor: {
      userId,
      role,
      isActive: true,
      permissions: options.injectedPermission
        ? [...canonicalPermissions, options.injectedPermission]
        : canonicalPermissions,
    },
    clientResolver: async (clientId) => clientId === client.id ? client : null,
    assignmentGateway,
    memberResolver: async (userIdToResolve) => members.get(userIdToResolve) ?? null,
  };
}

const capturerContext = createContext(capturerId, 'capturer');
const designerContext = createContext(designerId, 'project_designer');
const managerContext = createContext(managerId, 'manager');
const financeContext = createContext(financeId, 'finance');
const isolatedContext = createContext(managerId, 'manager', { organization: isolatedOrganizationId });
const designerWithInjectedIssue = createContext(designerId, 'project_designer', {
  injectedPermission: 'proposals:issue_document',
});

function createInput(key: string, title: string): CreateProposalInput {
  return {
    clientId: client.id,
    title,
    proposalType: 'credit',
    category: 'investimento',
    requestedAmountCents: 12_500_000,
    validityDays: 20,
    financingTermMonths: 24,
    gracePeriodMonths: 3,
    interestRateAnnualPercentage: 9.75,
    notes: 'OBSERVACAO-SENSIVEL-NAO-PROJETAR',
    idempotencyKey: key,
  };
}

async function approveProposal(
  service: ProposalApplicationService,
  clock: MockClock,
  suffix: string
): Promise<Proposal> {
  let proposal = await service.createProposal(
    createInput(`document-create-${suffix}`, `Proposta Documental ${suffix}`),
    capturerContext,
    clock
  );
  proposal = await service.submitProposal({
    proposalId: proposal.id, expectedVersion: proposal.version,
    idempotencyKey: `document-submit-${suffix}`,
  }, capturerContext, clock);
  proposal = await service.assignProposalReviewer({
    proposalId: proposal.id, reviewerUserId: designerId, expectedVersion: proposal.version,
    idempotencyKey: `document-assign-${suffix}`,
  }, managerContext, clock);
  proposal = await service.startProposalReview({
    proposalId: proposal.id, expectedVersion: proposal.version,
    idempotencyKey: `document-review-${suffix}`,
  }, designerContext, clock);
  return service.approveProposal({
    proposalId: proposal.id, expectedVersion: proposal.version,
    idempotencyKey: `document-approve-${suffix}`,
  }, managerContext, clock);
}

async function run(): Promise<void> {
  console.log('=============================================================');
  console.log('Suíte comportamental OE-005.004 — Documento Comercial');
  console.log('=============================================================\n');

  await executeDomainSessionCleanup();
  const service = new ProposalApplicationService(new DeterministicIdGenerator());
  const clock = new MockClock(new Date('2026-04-10T14:30:00.000Z'));

  console.log('--- Emissão, versão e integridade ---');
  const draft = await service.createProposal(
    createInput('document-create-draft', 'Proposta Ainda em Rascunho'), capturerContext, clock
  );
  await expectDomainError(
    () => service.issueProposalDocument({
      proposalId: draft.id, expectedVersion: draft.version,
      idempotencyKey: 'document-issue-draft',
    }, managerContext, clock),
    'DOCUMENT_NOT_ISSUABLE',
    'Documento não pode ser emitido antes da aprovação'
  );

  let approved = await approveProposal(service, clock, 'principal');
  const document = await service.issueProposalDocument({
    proposalId: approved.id, expectedVersion: approved.version,
    idempotencyKey: 'document-issue-principal',
  }, managerContext, clock);
  assert(/^DOC-PROP-2026-\d{4}$/.test(document.documentNumber), 'Numeração documental é organizacional e previsível');
  assert(/^[0-9a-f]{64}$/.test(document.checksumSha256), 'Documento possui checksum SHA-256 real');
  const snapshots = await service.getProposalSnapshots(approved.id, managerContext);
  const approvedSnapshot = snapshots.find((snapshot) => snapshot.status === 'approved');
  assert(
    document.sourceSnapshotId === approvedSnapshot?.id
      && document.sourceVersionNumber === approved.version
      && document.sourceChecksumSha256 === approvedSnapshot?.checksumSha256,
    'Documento referencia exatamente o snapshot aprovado'
  );
  const serializedContent = JSON.stringify(document.content);
  assert(
    !serializedContent.includes('SENSITIVE-DOCUMENT-NUMBER')
      && !serializedContent.includes('SENSITIVE-PHONE')
      && !serializedContent.includes('sensitive@example.invalid')
      && !serializedContent.includes('OBSERVACAO-SENSIVEL'),
    'Projeção documental minimiza dados pessoais e observações protegidas'
  );
  assert(
    document.content.disclaimerText.includes('Não constitui contrato')
      && document.content.disclaimerText.includes('assinatura digital'),
    'Documento declara corretamente seus limites jurídicos e operacionais'
  );

  Reflect.set(document.content.client, 'name', 'Conteúdo adulterado');
  const immutable = await service.getProposalDocumentById(approved.id, document.id, managerContext);
  assert(immutable.content.client.name === 'Cliente Canônico de Teste', 'Consulta documental retorna cópia imutável');

  const replay = await service.issueProposalDocument({
    proposalId: approved.id, expectedVersion: approved.version,
    idempotencyKey: 'document-issue-principal',
  }, managerContext, clock);
  assert(replay.id === document.id, 'Replay idempotente retorna o mesmo documento');
  const alternativeKey = await service.issueProposalDocument({
    proposalId: approved.id, expectedVersion: approved.version,
    idempotencyKey: 'document-issue-alternative',
  }, managerContext, clock);
  assert(alternativeKey.id === document.id, 'Uma versão aprovada produz somente um documento canônico');
  await expectDomainError(
    () => service.issueProposalDocument({
      proposalId: approved.id, expectedVersion: approved.version + 1,
      idempotencyKey: 'document-issue-stale',
    }, managerContext, clock),
    'CONCURRENCY_CONFLICT',
    'Versão obsoleta ou futura é recusada'
  );
  await expectDomainError(
    () => service.issueProposalDocument({
      proposalId: approved.id, expectedVersion: approved.version + 1,
      idempotencyKey: 'document-issue-principal',
    }, managerContext, clock),
    'IDEMPOTENCY_CONFLICT',
    'Mesma chave com payload divergente é recusada'
  );

  const concurrent = await approveProposal(service, clock, 'concorrente');
  const concurrentResults = await Promise.all([
    service.issueProposalDocument({
      proposalId: concurrent.id, expectedVersion: concurrent.version,
      idempotencyKey: 'document-concurrent-a',
    }, managerContext, clock),
    service.issueProposalDocument({
      proposalId: concurrent.id, expectedVersion: concurrent.version,
      idempotencyKey: 'document-concurrent-b',
    }, managerContext, clock),
  ]);
  assert(concurrentResults[0].id === concurrentResults[1].id, 'Concorrência produz exatamente um documento por versão');

  console.log('\n--- RBAC, IDOR e apresentação vinculada ---');
  await expectDomainError(
    () => service.issueProposalDocument({
      proposalId: concurrent.id, expectedVersion: concurrent.version,
      idempotencyKey: 'document-designer-injected',
    }, designerWithInjectedIssue, clock),
    'PERMISSION_DENIED',
    'Permissão injetada não permite emissão ao projetista'
  );
  await expectDomainError(
    () => service.issueProposalDocument({
      proposalId: concurrent.id, expectedVersion: concurrent.version,
      idempotencyKey: 'document-finance-issue',
    }, financeContext, clock),
    'PERMISSION_DENIED',
    'Financeiro permanece somente leitura'
  );
  const financeDocuments = await service.getProposalDocuments(approved.id, financeContext);
  assert(financeDocuments.length === 1, 'Financeiro autorizado consulta documento em modo somente leitura');
  await expectDomainError(
    () => service.getProposalDocumentById(approved.id, document.id, isolatedContext),
    'PROPOSAL_NOT_FOUND',
    'IDOR documental entre organizações é bloqueado'
  );

  const withoutDocument = await approveProposal(service, clock, 'sem-documento');
  await expectDomainError(
    () => service.markProposalPresented({
      proposalId: withoutDocument.id, expectedVersion: withoutDocument.version,
      idempotencyKey: 'document-present-without', channel: 'in_person', documentId: 'missing-document',
    }, capturerContext, clock),
    'DOCUMENT_NOT_FOUND',
    'Apresentação exige documento comercial canônico'
  );
  const withoutDocumentIssued = await service.issueProposalDocument({
    proposalId: withoutDocument.id, expectedVersion: withoutDocument.version,
    idempotencyKey: 'document-issue-for-present',
  }, capturerContext, clock);
  await expectDomainError(
    () => service.markProposalPresented({
      proposalId: withoutDocument.id, expectedVersion: withoutDocument.version,
      idempotencyKey: 'document-present-wrong', channel: 'in_person', documentId: document.id,
    }, capturerContext, clock),
    'DOCUMENT_NOT_FOUND',
    'Documento de outra proposta não pode ser usado na apresentação'
  );
  approved = await service.markProposalPresented({
    proposalId: approved.id, expectedVersion: approved.version,
    idempotencyKey: 'document-present-principal', channel: 'in_person', documentId: document.id,
  }, capturerContext, clock);
  assert(approved.presentationRecord?.documentReference === document.id, 'Apresentação registra o documento exato utilizado');
  await expectDomainError(
    () => service.issueProposalDocument({
      proposalId: approved.id, expectedVersion: approved.version,
      idempotencyKey: 'document-issue-after-present',
    }, managerContext, clock),
    'DOCUMENT_NOT_ISSUABLE',
    'Documento não pode ser reemitido após a apresentação'
  );

  const events = proposalEventBus.getEventsForProposal(organizationId, document.proposalId);
  const documentEvents = events.filter((event) => event.type === 'proposal.document.issued');
  const documentEvent = documentEvents[0];
  assert(documentEvents.length === 1, 'Emissão idempotente gera exatamente um evento de domínio tipado');
  const serializedEvent = JSON.stringify(documentEvent);
  assert(
    !serializedEvent.includes('SENSITIVE-DOCUMENT-NUMBER')
      && !serializedEvent.includes('SENSITIVE-PHONE')
      && !serializedEvent.includes('sensitive@example.invalid'),
    'Evento de emissão não contém dados pessoais'
  );

  assert(
    getProposalDocumentPath('proposal / unsafe') === '/propostas/proposal%20%2F%20unsafe/documento',
    'Builder codifica identificadores documentais não confiáveis'
  );
  const route = findRouteDefinition('/propostas/proposal-test/documento');
  assert(
    route?.requiredPermissions === 'proposals:view_document',
    'Rota documental exige permissão granular própria'
  );

  await service.markProposalPresented({
    proposalId: withoutDocument.id, expectedVersion: withoutDocument.version,
    idempotencyKey: 'document-present-canonical', channel: 'email', documentId: withoutDocumentIssued.id,
  }, capturerContext, clock);
  await executeDomainSessionCleanup();
  assert(
    proposalEventBus.getEventsForProposal(organizationId, document.proposalId).length === 0,
    'Logout limpa eventos e notificações documentais'
  );
  await expectDomainError(
    () => service.getProposalById(document.proposalId, managerContext),
    'PROPOSAL_NOT_FOUND',
    'Logout elimina proposta e documentos voláteis associados'
  );

  console.log('\n=============================================================');
  console.log(`Resultado OE-005.004: ${passed} passaram, ${failed} falharam`);
  console.log('=============================================================');
  if (failed > 0) process.exit(1);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
