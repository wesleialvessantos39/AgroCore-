/**
 * SUÍTE COMPORTAMENTAL OE-005.006
 * Fila operacional e recebimento imutável de encaminhamentos.
 */
import { executeDomainSessionCleanup } from '../src/auth/domainCleanupRegistry';
import { OrganizationMember } from '../src/auth/organizationMembersGateway';
import { getRolePermissions } from '../src/authorization/permissionsMatrix';
import { IdGenerator, MockClock } from '../src/proposals/cryptoUtils';
import { ProposalAppContext, ProposalApplicationService } from '../src/proposals/proposalApplicationService';
import { proposalEventBus } from '../src/proposals/proposalEventService';
import { ROUTES } from '../src/routes/paths';
import { findRouteDefinition } from '../src/routes/routeMatrix';
import { OrganizationRole } from '../src/types/auth';
import { Client } from '../src/types/client';
import { ClientCapturerAssignmentGateway } from '../src/types/clientCapturerAssignment';
import { CreateProposalInput, Proposal, ProposalDomainError, ProposalErrorCode, ProposalType } from '../src/types/proposals';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function expectDomainError(operation: () => Promise<unknown>, code: ProposalErrorCode, name: string): Promise<void> {
  try {
    await operation();
    assert(false, name, `esperado ${code}`);
  } catch (error: unknown) {
    assert(error instanceof ProposalDomainError && error.code === code, name, error instanceof Error ? error.message : 'erro não tipado');
  }
}

class DeterministicIdGenerator implements IdGenerator {
  private sequence = 0;
  next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_receipt_test_${this.sequence.toString().padStart(4, '0')}`;
  }
}

const organizationId = 'org-receipt-test';
const otherOrganizationId = 'org-receipt-isolated';
const capturerId = 'user-receipt-capturer';
const designerId = 'user-receipt-designer';
const managerId = 'user-receipt-manager';
const financeId = 'user-receipt-finance';

const client: Client = {
  id: 'client-receipt-001', organizationId, personType: 'individual',
  name: 'Cliente Canônico de Recebimento', cpf: 'SENSITIVE-RECEIPT-DOCUMENT',
  isStateRegistrationExempt: true,
  contact: { primaryPhone: 'SENSITIVE-RECEIPT-PHONE', hasWhatsapp: false, email: 'receipt-sensitive@example.invalid' },
  address: { addressType: 'rural', locality: 'Localidade', accessDescription: 'Acesso', city: 'Município', state: 'TT' },
  status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const members = new Map<string, OrganizationMember>([
  [capturerId, { id: 'member-receipt-cap', userId: capturerId, name: 'Captador', email: 'cap@example.invalid', organizationRole: 'capturer', isActive: true }],
  [designerId, { id: 'member-receipt-designer', userId: designerId, name: 'Projetista', email: 'designer@example.invalid', organizationRole: 'project_designer', isActive: true }],
  [managerId, { id: 'member-receipt-manager', userId: managerId, name: 'Gestor', email: 'manager@example.invalid', organizationRole: 'manager', isActive: true }],
  [financeId, { id: 'member-receipt-finance', userId: financeId, name: 'Financeiro', email: 'finance@example.invalid', organizationRole: 'finance', isActive: true }],
]);

const assignmentGateway: ClientCapturerAssignmentGateway = {
  async getActiveAssignment(requestOrganizationId, clientId) {
    if (requestOrganizationId !== organizationId || clientId !== client.id) return null;
    return {
      id: 'assignment-receipt-001', organizationId, clientId: client.id, capturerUserId: capturerId,
      status: 'active', isPrimary: true, startedAt: '2026-01-01T00:00:00.000Z', assignedByUserId: managerId,
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

function createContext(userId: string, role: OrganizationRole, organization = organizationId): ProposalAppContext {
  return {
    organizationId: organization,
    actor: { userId, role, isActive: true, permissions: getRolePermissions(role) },
    clientResolver: async (clientId) => clientId === client.id ? client : null,
    assignmentGateway,
    memberResolver: async (memberId) => members.get(memberId) ?? null,
  };
}

const capturerContext = createContext(capturerId, 'capturer');
const designerContext = createContext(designerId, 'project_designer');
const managerContext = createContext(managerId, 'manager');
const financeContext = createContext(financeId, 'finance');
const isolatedContext = createContext(managerId, 'manager', otherOrganizationId);

function createInput(type: ProposalType, suffix: string): CreateProposalInput {
  return {
    clientId: client.id,
    title: `Proposta para recebimento ${suffix}`,
    proposalType: type,
    category: type === 'credit' ? 'investimento' : 'servico_tecnico',
    requestedAmountCents: 10_000_000,
    validityDays: 15,
    notes: 'SENSITIVE-RECEIPT-NOTES',
    idempotencyKey: `receipt-create-${suffix}`,
  };
}

async function acceptAndPrepare(
  service: ProposalApplicationService,
  clock: MockClock,
  type: ProposalType,
  suffix: string
) {
  let proposal = await service.createProposal(createInput(type, suffix), capturerContext, clock);
  proposal = await service.submitProposal({ proposalId: proposal.id, expectedVersion: proposal.version, idempotencyKey: `receipt-submit-${suffix}` }, capturerContext, clock);
  proposal = await service.assignProposalReviewer({ proposalId: proposal.id, reviewerUserId: designerId, expectedVersion: proposal.version, idempotencyKey: `receipt-assign-${suffix}` }, managerContext, clock);
  proposal = await service.startProposalReview({ proposalId: proposal.id, expectedVersion: proposal.version, idempotencyKey: `receipt-review-${suffix}` }, designerContext, clock);
  proposal = await service.approveProposal({ proposalId: proposal.id, expectedVersion: proposal.version, idempotencyKey: `receipt-approve-${suffix}` }, managerContext, clock);
  const document = await service.issueProposalDocument({ proposalId: proposal.id, expectedVersion: proposal.version, idempotencyKey: `receipt-document-${suffix}` }, managerContext, clock);
  proposal = await service.markProposalPresented({ proposalId: proposal.id, expectedVersion: proposal.version, idempotencyKey: `receipt-present-${suffix}`, channel: 'in_person', documentId: document.id }, capturerContext, clock);
  proposal = await service.recordProposalDecision({ proposalId: proposal.id, expectedVersion: proposal.version, idempotencyKey: `receipt-accept-${suffix}`, decision: 'accepted', channel: 'phone' }, capturerContext, clock);
  const handoff = await service.prepareProposalHandoff({ proposalId: proposal.id, expectedVersion: proposal.version, idempotencyKey: `receipt-handoff-${suffix}` }, managerContext, clock);
  return { proposal, handoff };
}

async function run(): Promise<void> {
  console.log('================================================================');
  console.log('Suíte comportamental OE-005.006 — Recebimento de Encaminhamentos');
  console.log('================================================================\n');

  await executeDomainSessionCleanup();
  const service = new ProposalApplicationService(new DeterministicIdGenerator());
  const clock = new MockClock(new Date('2026-06-01T10:00:00.000Z'));
  const credit = await acceptAndPrepare(service, clock, 'credit', 'credito');
  const appraisal = await acceptAndPrepare(service, clock, 'appraisal', 'avaliacao');
  const technical = await acceptAndPrepare(service, clock, 'technical_project', 'tecnico');

  console.log('--- Fila, escopo por destino e negação segura ---');
  const managerQueue = await service.getProposalHandoffQueue(managerContext, clock);
  assert(managerQueue.pendingCount === 3 && managerQueue.receivedCount === 0, 'Gestor consulta todos os encaminhamentos organizacionais');
  const financeQueue = await service.getProposalHandoffQueue(financeContext, clock);
  assert(financeQueue.items.length === 1 && financeQueue.items[0]?.destination === 'credit_operations', 'Financeiro recebe somente operações de crédito');
  const designerQueue = await service.getProposalHandoffQueue(designerContext, clock);
  assert(designerQueue.items.length === 2 && designerQueue.items.every((item) => item.destination !== 'credit_operations'), 'Projetista recebe somente operações técnicas e de avaliação');
  await expectDomainError(() => service.getProposalHandoffQueue(capturerContext, clock), 'PERMISSION_DENIED', 'Captador não acessa fila operacional');
  await expectDomainError(
    () => service.acknowledgeProposalHandoff({
      proposalId: appraisal.proposal.id, handoffId: appraisal.handoff.id,
      expectedHandoffChecksumSha256: appraisal.handoff.checksumSha256,
      idempotencyKey: 'receipt-finance-wrong-destination',
    }, financeContext, clock),
    'HANDOFF_DESTINATION_MISMATCH',
    'Financeiro não recebe encaminhamento de avaliação'
  );
  await expectDomainError(
    () => service.acknowledgeProposalHandoff({
      proposalId: credit.proposal.id, handoffId: credit.handoff.id,
      expectedHandoffChecksumSha256: credit.handoff.checksumSha256,
      idempotencyKey: 'receipt-capturer-denied',
    }, capturerContext, clock),
    'PERMISSION_DENIED',
    'Captador não confirma recebimento operacional'
  );
  await expectDomainError(
    () => service.acknowledgeProposalHandoff({
      proposalId: technical.proposal.id, handoffId: technical.handoff.id,
      expectedHandoffChecksumSha256: '0'.repeat(64),
      idempotencyKey: 'receipt-stale-checksum',
    }, managerContext, clock),
    'HANDOFF_RECEIPT_CONFLICT',
    'Checksum divergente impede recebimento'
  );

  console.log('\n--- Integridade, idempotência e concorrência ---');
  const creditCommand = {
    proposalId: credit.proposal.id,
    handoffId: credit.handoff.id,
    expectedHandoffChecksumSha256: credit.handoff.checksumSha256,
    idempotencyKey: 'receipt-credit-primary',
  } as const;
  const receipt = await service.acknowledgeProposalHandoff(creditCommand, financeContext, clock);
  assert(/^[0-9a-f]{64}$/.test(receipt.checksumSha256), 'Comprovante possui SHA-256 real');
  assert(receipt.handoffId === credit.handoff.id && receipt.handoffChecksumSha256 === credit.handoff.checksumSha256, 'Comprovante referencia o encaminhamento exato');
  assert(receipt.destination === 'credit_operations' && receipt.receivedByUserId === financeId, 'Recebimento preserva destino e membro canônico');
  assert(receipt.disclaimerText.includes('Não cria contrato') && receipt.disclaimerText.includes('operação de crédito'), 'Comprovante declara limites jurídicos e operacionais');
  const replay = await service.acknowledgeProposalHandoff(creditCommand, financeContext, clock);
  assert(replay.id === receipt.id, 'Replay idempotente retorna o mesmo comprovante');
  const alternate = await service.acknowledgeProposalHandoff({ ...creditCommand, idempotencyKey: 'receipt-credit-alternate' }, financeContext, clock);
  assert(alternate.id === receipt.id, 'Encaminhamento produz somente um comprovante canônico');

  const concurrentCommands = ['receipt-appraisal-a', 'receipt-appraisal-b'].map((idempotencyKey) =>
    service.acknowledgeProposalHandoff({
      proposalId: appraisal.proposal.id,
      handoffId: appraisal.handoff.id,
      expectedHandoffChecksumSha256: appraisal.handoff.checksumSha256,
      idempotencyKey,
    }, designerContext, clock)
  );
  const concurrent = await Promise.allSettled(concurrentCommands);
  const concurrentReceipts = concurrent.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  assert(
    concurrentReceipts.length === 2 && concurrentReceipts[0]?.id === concurrentReceipts[1]?.id,
    'Concorrência produz exatamente um comprovante imutável'
  );

  const storedReceipt = await service.getProposalHandoffReceipt(credit.proposal.id, financeContext);
  assert(storedReceipt?.id === receipt.id, 'Consulta retorna o comprovante canônico');
  const updatedManagerQueue = await service.getProposalHandoffQueue(managerContext, clock);
  assert(updatedManagerQueue.pendingCount === 1 && updatedManagerQueue.receivedCount === 2, 'Fila deriva contagens da fonte autoritativa');
  const isolatedQueue = await service.getProposalHandoffQueue(isolatedContext, clock);
  assert(isolatedQueue.items.length === 0, 'Outra organização recebe fila vazia');
  await expectDomainError(
    () => service.getProposalHandoff(credit.proposal.id, isolatedContext),
    'PROPOSAL_NOT_FOUND',
    'IDOR de encaminhamento entre organizações é bloqueado'
  );

  const events = proposalEventBus.getEventsForProposal(organizationId, credit.proposal.id)
    .filter((event) => event.type === 'proposal.handoff.acknowledged');
  assert(events.length === 1 && events[0]?.correlationId === receipt.correlationId, 'Recebimento idempotente gera um evento com a mesma correlação');
  const serialized = JSON.stringify(events);
  assert(
    !serialized.includes('SENSITIVE-RECEIPT-DOCUMENT')
      && !serialized.includes('SENSITIVE-RECEIPT-PHONE')
      && !serialized.includes('receipt-sensitive@example.invalid')
      && !serialized.includes('SENSITIVE-RECEIPT-NOTES'),
    'Evento de recebimento não vaza dados sensíveis'
  );
  assert(findRouteDefinition(ROUTES.PROPOSALS_HANDOFF_QUEUE)?.requiredPermissions === 'proposals:view_handoff_queue', 'Rota da fila exige permissão granular');

  await executeDomainSessionCleanup();
  const cleanQueue = await service.getProposalHandoffQueue(managerContext, clock);
  assert(cleanQueue.items.length === 0, 'Logout limpa encaminhamentos, comprovantes, locks e idempotência');
  assert(proposalEventBus.getEventsForProposal(organizationId, credit.proposal.id).length === 0, 'Logout limpa eventos e notificações do recebimento');

  console.log('\n================================================================');
  console.log(`Resultado OE-005.006: ${passed} passaram, ${failed} falharam`);
  console.log('================================================================');
  if (failed > 0) process.exit(1);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
