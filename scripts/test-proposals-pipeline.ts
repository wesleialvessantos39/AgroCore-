/**
 * SUÍTE COMPORTAMENTAL DO PIPELINE COMERCIAL — OE-005.003
 * Exercita os serviços públicos, sem inspeção textual como prova principal.
 */

import { executeDomainSessionCleanup } from '../src/auth/domainCleanupRegistry';
import { OrganizationMember } from '../src/auth/organizationMembersGateway';
import { getRolePermissions } from '../src/authorization/permissionsMatrix';
import { Clock, IdGenerator, MockClock, calculateSha256 } from '../src/proposals/cryptoUtils';
import {
  ProposalAppContext,
  ProposalApplicationService,
} from '../src/proposals/proposalApplicationService';
import { proposalEventBus } from '../src/proposals/proposalEventService';
import { getProposalHistoryPath, getProposalReviewPath } from '../src/routes/paths';
import { findRouteDefinition } from '../src/routes/routeMatrix';
import { OrganizationRole } from '../src/types/auth';
import { Permission } from '../src/types/authorization';
import { Client } from '../src/types/client';
import { ClientCapturerAssignmentGateway } from '../src/types/clientCapturerAssignment';
import {
  CreateProposalInput,
  Proposal,
  ProposalDomainError,
  ProposalErrorCode,
} from '../src/types/proposals';

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
    assert(false, name, `esperado ${code}, mas a operação foi autorizada`);
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
    return `${prefix}_test_${this.sequence.toString().padStart(4, '0')}`;
  }
}

const organizationId = 'org-pipeline-test';
const otherOrganizationId = 'org-isolated-test';
const capturerId = 'user-capturer-test';
const designerId = 'user-designer-test';
const secondDesignerId = 'user-designer-2-test';
const managerId = 'user-manager-test';
const ownerId = 'user-owner-test';

const client: Client = {
  id: 'client-test-001',
  organizationId,
  personType: 'individual',
  name: 'Cliente Fictício de Teste',
  cpf: '00000000000',
  isStateRegistrationExempt: true,
  contact: {
    primaryPhone: '00000000000',
    hasWhatsapp: false,
    email: 'cliente@example.invalid',
  },
  address: {
    addressType: 'rural',
    locality: 'Localidade de Teste',
    accessDescription: 'Acesso exclusivamente fictício',
    city: 'Município de Teste',
    state: 'TT',
  },
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const members = new Map<string, OrganizationMember>([
  [capturerId, {
    id: 'member-capturer-test', userId: capturerId, name: 'Captador de Teste',
    email: 'capturer@example.invalid', organizationRole: 'capturer', isActive: true,
  }],
  [designerId, {
    id: 'member-designer-test', userId: designerId, name: 'Projetista de Teste',
    email: 'designer@example.invalid', organizationRole: 'project_designer', isActive: true,
  }],
  [secondDesignerId, {
    id: 'member-designer-2-test', userId: secondDesignerId, name: 'Segundo Projetista de Teste',
    email: 'designer2@example.invalid', organizationRole: 'project_designer', isActive: true,
  }],
  [managerId, {
    id: 'member-manager-test', userId: managerId, name: 'Gestor de Teste',
    email: 'manager@example.invalid', organizationRole: 'manager', isActive: true,
  }],
  [ownerId, {
    id: 'member-owner-test', userId: ownerId, name: 'Responsável de Teste',
    email: 'owner@example.invalid', organizationRole: 'owner', isActive: true,
  }],
]);

const assignmentGateway: ClientCapturerAssignmentGateway = {
  async getActiveAssignment(requestOrganizationId, clientId) {
    if (requestOrganizationId !== organizationId || clientId !== client.id) return null;
    return {
      id: 'assignment-test-001',
      organizationId,
      clientId: client.id,
      capturerUserId: capturerId,
      status: 'active',
      isPrimary: true,
      startedAt: '2026-01-01T00:00:00.000Z',
      assignedByUserId: ownerId,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  },
  async listAssignmentsByClient() {
    return [];
  },
  async listClientsByCapturer(requestOrganizationId, userId) {
    return requestOrganizationId === organizationId && userId === capturerId ? [client.id] : [];
  },
  async assignCapturer() {
    throw new Error('Operação fora do escopo desta suíte.');
  },
  async transferCapturer() {
    throw new Error('Operação fora do escopo desta suíte.');
  },
  async terminateAssignment() {
    throw new Error('Operação fora do escopo desta suíte.');
  },
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
    memberResolver: async (memberUserId) => members.get(memberUserId) ?? null,
  };
}

const capturerContext = createContext(capturerId, 'capturer');
const designerContext = createContext(designerId, 'project_designer');
const secondDesignerContext = createContext(secondDesignerId, 'project_designer');
const managerContext = createContext(managerId, 'manager');
const ownerContext = createContext(ownerId, 'owner');
const isolatedContext = createContext(managerId, 'manager', { organization: otherOrganizationId });
const designerWithInjectedApproval = createContext(designerId, 'project_designer', {
  injectedPermission: 'proposals:approve',
});

function createInput(idempotencyKey: string, title: string): CreateProposalInput {
  return {
    clientId: client.id,
    title,
    proposalType: 'credit',
    category: 'investimento',
    requestedAmountCents: 45_000_000,
    validityDays: 15,
    financingTermMonths: 36,
    gracePeriodMonths: 6,
    interestRateAnnualPercentage: 11.5,
    notes: 'Conteúdo operacional fictício.',
    idempotencyKey,
  };
}

async function submit(
  service: ProposalApplicationService,
  proposal: Proposal,
  context: ProposalAppContext,
  clock: Clock,
  key: string
): Promise<Proposal> {
  return service.submitProposal({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: key,
  }, context, clock);
}

async function runPipelineTests(): Promise<void> {
  console.log('================================================================');
  console.log('Suíte comportamental OE-005.003 — Pipeline Comercial');
  console.log('================================================================\n');

  await executeDomainSessionCleanup();
  const service = new ProposalApplicationService(new DeterministicIdGenerator());
  const clock = new MockClock(new Date('2026-03-01T10:00:00.000Z'));

  console.log('--- Idempotência, isolamento e concorrência ---');
  const idempotentInput = createInput('create-idempotent-001', 'Proposta Idempotente de Teste');
  const idempotentA = await service.createProposal(idempotentInput, capturerContext, clock);
  const idempotentB = await service.createProposal(idempotentInput, capturerContext, clock);
  assert(idempotentA.id === idempotentB.id, 'Criação repetida com mesma chave retorna a mesma proposta');
  Reflect.set(idempotentA, 'title', 'adulterado externamente');
  const immutableCreate = await service.getProposalById(idempotentB.id, capturerContext);
  assert(immutableCreate?.title === 'Proposta Idempotente de Teste',
    'Objeto retornado na criação não permite adulterar o armazenamento interno');

  await expectDomainError(
    () => service.createProposal({ ...idempotentInput, title: 'Payload Divergente' }, capturerContext, clock),
    'IDEMPOTENCY_CONFLICT',
    'Chave reutilizada com payload divergente é recusada'
  );
  await expectDomainError(
    () => service.getProposalById(idempotentA.id, isolatedContext),
    'PROPOSAL_NOT_FOUND',
    'Consulta IDOR entre organizações é bloqueada'
  );

  const concurrentDraft = await service.createProposal(
    createInput('create-concurrency-001', 'Proposta Concorrente de Teste'), capturerContext, clock
  );
  const concurrentResults = await Promise.allSettled([
    service.updateProposal(concurrentDraft.id, {
      title: 'Atualização Concorrente A', expectedVersion: concurrentDraft.version,
      idempotencyKey: 'update-concurrency-a',
    }, capturerContext, clock),
    service.updateProposal(concurrentDraft.id, {
      title: 'Atualização Concorrente B', expectedVersion: concurrentDraft.version,
      idempotencyKey: 'update-concurrency-b',
    }, capturerContext, clock),
  ]);
  const successfulUpdates = concurrentResults.filter((result) => result.status === 'fulfilled');
  const conflictUpdates = concurrentResults.filter(
    (result) => result.status === 'rejected'
      && result.reason instanceof ProposalDomainError
      && result.reason.code === 'CONCURRENCY_CONFLICT'
  );
  assert(successfulUpdates.length === 1 && conflictUpdates.length === 1,
    'Duas atualizações simultâneas produzem um sucesso e um conflito tipado');

  console.log('\n--- Fila, atribuição, revisão e segregação de funções ---');
  let proposal = await service.createProposal(
    createInput('create-main-flow-001', 'Fluxo Comercial Completo de Teste'), capturerContext, clock
  );
  proposal = await submit(service, proposal, capturerContext, clock, 'submit-main-flow-001');
  const repeatedSubmission = await service.submitProposal({
    proposalId: proposal.id,
    expectedVersion: proposal.version - 1,
    idempotencyKey: 'submit-main-flow-001',
  }, capturerContext, clock);
  assert(repeatedSubmission.version === proposal.version,
    'Repetição idempotente do comando retorna o resultado anterior');

  await expectDomainError(
    () => service.assignProposalReviewer({
      proposalId: proposal.id, reviewerUserId: 'user-outsider-test',
      expectedVersion: proposal.version, idempotencyKey: 'assign-outsider-001',
    }, managerContext, clock),
    'REVIEWER_MISMATCH',
    'Atribuição a usuário externo ou inexistente é bloqueada'
  );

  proposal = await service.assignProposalReviewer({
    proposalId: proposal.id,
    reviewerUserId: designerId,
    expectedVersion: proposal.version,
    idempotencyKey: 'assign-designer-001',
  }, managerContext, clock);

  await expectDomainError(
    () => service.startProposalReview({
      proposalId: proposal.id, expectedVersion: proposal.version,
      idempotencyKey: 'manager-review-001',
    }, managerContext, clock),
    'PERMISSION_DENIED',
    'Gestor não recebe permissão implícita de revisão técnica'
  );
  await expectDomainError(
    () => service.startProposalReview({
      proposalId: proposal.id, expectedVersion: proposal.version,
      idempotencyKey: 'wrong-reviewer-001',
    }, secondDesignerContext, clock),
    'REVIEWER_MISMATCH',
    'Projetista não atribuído não inicia a revisão'
  );

  proposal = await service.startProposalReview({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: 'start-review-001',
  }, designerContext, clock);

  const protectedReviewReason = 'MARCADOR-SENSIVEL-DE-REVISAO-NAO-LOGAR';
  proposal = await service.requestProposalChanges({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: 'request-changes-001',
    reasons: protectedReviewReason,
  }, designerContext, clock);
  assert(proposal.reviewNotes?.[0]?.reasons === protectedReviewReason,
    'Apontamento protegido permanece no agregado autorizado');

  proposal = await service.updateProposal(proposal.id, {
    notes: 'Ajuste fictício realizado.',
    expectedVersion: proposal.version,
    idempotencyKey: 'update-after-review-001',
  }, capturerContext, clock);
  proposal = await submit(service, proposal, capturerContext, clock, 'resubmit-main-flow-001');

  await expectDomainError(
    () => service.assignProposalReviewer({
      proposalId: proposal.id, reviewerUserId: secondDesignerId,
      expectedVersion: proposal.version, idempotencyKey: 'reassign-without-reason-001',
    }, managerContext, clock),
    'REASON_REQUIRED',
    'Reatribuição sem motivo é bloqueada'
  );
  proposal = await service.assignProposalReviewer({
    proposalId: proposal.id,
    reviewerUserId: secondDesignerId,
    reassignmentReason: 'Redistribuição operacional fictícia.',
    expectedVersion: proposal.version,
    idempotencyKey: 'reassign-designer-002',
  }, managerContext, clock);

  const assignments = await service.getProposalReviewAssignments(proposal.id, managerContext);
  assert(assignments.length === 2 && assignments.filter((item) => item.status === 'active').length === 1,
    'Histórico preserva reatribuição e mantém somente um revisor ativo');

  const firstDesignerQueue = await service.listProposals({}, designerContext);
  const secondDesignerQueue = await service.listProposals({}, secondDesignerContext);
  assert(firstDesignerQueue.total === 0 && secondDesignerQueue.items.some((item) => item.id === proposal.id),
    'Fila do projetista contém somente propostas atualmente atribuídas');

  proposal = await service.startProposalReview({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: 'start-review-002',
  }, secondDesignerContext, clock);

  await expectDomainError(
    () => service.approveProposal({
      proposalId: proposal.id, expectedVersion: proposal.version,
      idempotencyKey: 'designer-approve-001',
    }, designerWithInjectedApproval, clock),
    'PERMISSION_DENIED',
    'Permissão injetada não permite que projetista aprove proposta'
  );

  const protectedApprovalNote = 'MARCADOR-SENSIVEL-DE-APROVACAO-NAO-LOGAR';
  proposal = await service.approveProposal({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: 'manager-approve-001',
    notes: protectedApprovalNote,
  }, managerContext, clock);
  assert(proposal.status === 'approved' && proposal.approvedByUserId === managerId,
    'Gestor independente aprova proposta após revisão atribuída');

  console.log('\n--- Apresentação, decisão e prazo exato ---');
  proposal = await service.markProposalPresented({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: 'present-main-flow-001',
    channel: 'in_person',
    notes: 'Registro operacional fictício.',
  }, capturerContext, clock);
  const validFrom = proposal.validFrom ? new Date(proposal.validFrom).getTime() : Number.NaN;
  assert(new Date(proposal.expiresAt).getTime() - validFrom === 15 * 86_400_000,
    'Vigência começa na apresentação e possui duração determinística');

  proposal = await service.recordProposalDecision({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: 'decision-main-flow-001',
    decision: 'accepted',
    channel: 'messaging',
    notes: 'Manifestação declarada apenas para operação interna.',
  }, capturerContext, clock);
  assert(proposal.status === 'accepted'
      && proposal.decisionRecord?.disclaimerText.includes('Não constitui assinatura eletrônica'),
    'Decisão é registrada como declaração operacional, sem simular validade formal');

  await expectDomainError(
    () => service.updateProposal(proposal.id, {
      title: 'Alteração Terminal', expectedVersion: proposal.version,
      idempotencyKey: 'terminal-update-001',
    }, capturerContext, clock),
    'PROPOSAL_LOCKED',
    'Estado terminal não pode ser editado'
  );

  let expiring = await service.createProposal(
    { ...createInput('create-expiry-001', 'Proposta de Expiração Exata'), validityDays: 5 },
    capturerContext, clock
  );
  expiring = await submit(service, expiring, capturerContext, clock, 'submit-expiry-001');
  expiring = await service.assignProposalReviewer({
    proposalId: expiring.id, reviewerUserId: designerId,
    expectedVersion: expiring.version, idempotencyKey: 'assign-expiry-001',
  }, managerContext, clock);
  expiring = await service.startProposalReview({
    proposalId: expiring.id, expectedVersion: expiring.version,
    idempotencyKey: 'review-expiry-001',
  }, designerContext, clock);
  expiring = await service.approveProposal({
    proposalId: expiring.id, expectedVersion: expiring.version,
    idempotencyKey: 'approve-expiry-001',
  }, managerContext, clock);
  expiring = await service.markProposalPresented({
    proposalId: expiring.id, expectedVersion: expiring.version,
    idempotencyKey: 'present-expiry-001', channel: 'email',
  }, capturerContext, clock);
  clock.setTime(new Date(expiring.expiresAt));
  await expectDomainError(
    () => service.recordProposalDecision({
      proposalId: expiring.id, expectedVersion: expiring.version,
      idempotencyKey: 'decision-expiry-boundary-001', decision: 'accepted', channel: 'email',
    }, capturerContext, clock),
    'PROPOSAL_EXPIRED',
    'Decisão no instante exato do vencimento é recusada'
  );
  const expired = await service.getProposalById(expiring.id, managerContext);
  assert(expired?.status === 'expired', 'Estado expirado é persistido atomicamente no limite temporal');
  await expectDomainError(
    () => service.expireDueProposals({ organizationId: '', systemActor: 'proposal-expiration-scheduler' }, clock),
    'SYSTEM_CONTEXT_REQUIRED',
    'Varredura de expiração exige contexto interno autenticado'
  );

  console.log('\n--- Autoaprovação, auditoria, hash e limpeza ---');
  let selfApproval = await service.createProposal(
    createInput('create-self-approval-001', 'Proposta de Segregação de Funções'), managerContext, clock
  );
  selfApproval = await submit(service, selfApproval, managerContext, clock, 'submit-self-approval-001');
  selfApproval = await service.assignProposalReviewer({
    proposalId: selfApproval.id, reviewerUserId: designerId,
    expectedVersion: selfApproval.version, idempotencyKey: 'assign-self-approval-001',
  }, ownerContext, clock);
  selfApproval = await service.startProposalReview({
    proposalId: selfApproval.id, expectedVersion: selfApproval.version,
    idempotencyKey: 'review-self-approval-001',
  }, designerContext, clock);
  await expectDomainError(
    () => service.approveProposal({
      proposalId: selfApproval.id, expectedVersion: selfApproval.version,
      idempotencyKey: 'self-approval-manager-001',
    }, managerContext, clock),
    'SELF_APPROVAL_FORBIDDEN',
    'Criador ou remetente não pode aprovar a própria proposta'
  );

  const history = await service.getProposalHistory(proposal.id, managerContext);
  const snapshots = await service.getProposalSnapshots(proposal.id, managerContext);
  assert(history.length >= 8 && snapshots.length === history.length,
    'Cada transição possui histórico e snapshot correspondente');
  assert(snapshots.every((snapshot) => /^[a-f0-9]{64}$/.test(snapshot.checksumSha256)),
    'Todos os snapshots usam SHA-256 real de 64 caracteres hexadecimais');
  assert(await calculateSha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    'Implementação SHA-256 confere com vetor conhecido');

  const events = proposalEventBus.getEventsForProposal(organizationId, proposal.id);
  const notifications = proposalEventBus.getNotifications(organizationId, capturerId);
  const serializedEvents = JSON.stringify(events);
  const serializedNotifications = JSON.stringify(notifications);
  assert(!serializedEvents.includes(protectedReviewReason)
      && !serializedEvents.includes(protectedApprovalNote)
      && !serializedNotifications.includes(protectedReviewReason)
      && !serializedNotifications.includes(protectedApprovalNote),
    'Eventos e notificações não vazam justificativas ou pareceres protegidos');
  const capturerNotification = notifications[0];
  assert(Boolean(capturerNotification)
      && !proposalEventBus.markNotificationAsRead(
        organizationId, secondDesignerId, capturerNotification.id
      )
      && proposalEventBus.markNotificationAsRead(
        organizationId, capturerId, capturerNotification.id
      ),
    'Marcação de notificação como lida exige o destinatário correto');

  if (events[0]) Reflect.set(events[0].payload, 'tampered', true);
  if (snapshots[0]) Reflect.set(snapshots[0].snapshot, 'title', 'adulterado');
  const eventsAgain = proposalEventBus.getEventsForProposal(organizationId, proposal.id);
  const snapshotsAgain = await service.getProposalSnapshots(proposal.id, managerContext);
  assert(!eventsAgain.some((event) => event.payload.tampered === true)
      && !snapshotsAgain.some((snapshot) => snapshot.snapshot.title === 'adulterado'),
    'Consultas retornam cópias e preservam a imutabilidade dos registros');

  assert(getProposalReviewPath('proposal / id') === '/propostas/proposal%20%2F%20id/revisao'
      && getProposalHistoryPath('proposal / id') === '/propostas/proposal%20%2F%20id/historico',
    'Construtores das rotas dedicadas codificam identificadores com segurança');
  const queueRoute = findRouteDefinition('/propostas/fila');
  const reviewRoute = findRouteDefinition('/propostas/proposal-test/revisao');
  assert(queueRoute?.requiredPermissions === 'proposals:assign_review'
      && Array.isArray(reviewRoute?.requiredPermissions)
      && reviewRoute.requiredPermissions.includes('proposals:view_assigned')
      && reviewRoute.requiredPermissions.includes('proposals:review'),
    'Matriz protege fila administrativa e revisão atribuída com permissões granulares');

  await executeDomainSessionCleanup();
  const afterCleanup = await service.listProposals({}, managerContext);
  assert(afterCleanup.total === 0
      && proposalEventBus.getEventsForProposal(organizationId, proposal.id).length === 0
      && proposalEventBus.getNotifications(organizationId, capturerId).length === 0,
    'Logout limpa propostas, histórico, snapshots, eventos e notificações');

  console.log('\n================================================================');
  console.log(`Resultado OE-005.003: ${passed} passaram, ${failed} falharam`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runPipelineTests().catch((error: unknown) => {
  console.error('Falha não tratada na suíte comportamental:', error instanceof Error ? error.message : error);
  process.exit(1);
});
