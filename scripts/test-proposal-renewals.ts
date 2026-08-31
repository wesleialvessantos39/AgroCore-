/**
 * SUÍTE COMPORTAMENTAL OE-005.007
 * Renovação governada e linhagem imutável de propostas encerradas.
 */
import { executeDomainSessionCleanup } from '../src/auth/domainCleanupRegistry';
import { OrganizationMember } from '../src/auth/organizationMembersGateway';
import { getRolePermissions } from '../src/authorization/permissionsMatrix';
import { IdGenerator, MockClock } from '../src/proposals/cryptoUtils';
import { ProposalAppContext, ProposalApplicationService } from '../src/proposals/proposalApplicationService';
import { proposalEventBus } from '../src/proposals/proposalEventService';
import { getProposalRenewalPath, ROUTES } from '../src/routes/paths';
import { findRouteDefinition } from '../src/routes/routeMatrix';
import { OrganizationRole } from '../src/types/auth';
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
  } else {
    failed += 1;
    console.error(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  }
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
    return `${prefix}_renewal_test_${this.sequence.toString().padStart(4, '0')}`;
  }
}

const organizationId = 'org-renewal-test';
const otherOrganizationId = 'org-renewal-isolated';
const capturerId = 'user-renewal-capturer';
const otherCapturerId = 'user-renewal-other-capturer';
const designerId = 'user-renewal-designer';
const managerId = 'user-renewal-manager';
const financeId = 'user-renewal-finance';
let assignmentActive = true;
let canonicalClientName = 'Cliente Canônico Inicial';

const clientBase: Client = {
  id: 'client-renewal-001',
  organizationId,
  personType: 'individual',
  name: canonicalClientName,
  cpf: 'SENSITIVE-RENEWAL-DOCUMENT',
  isStateRegistrationExempt: true,
  contact: {
    primaryPhone: 'SENSITIVE-RENEWAL-PHONE',
    hasWhatsapp: false,
    email: 'renewal-sensitive@example.invalid',
  },
  address: {
    addressType: 'rural',
    locality: 'Localidade',
    accessDescription: 'Acesso',
    city: 'Município',
    state: 'TT',
  },
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const members = new Map<string, OrganizationMember>([
  [capturerId, { id: 'member-renewal-cap', userId: capturerId, name: 'Captador', email: 'capturer@example.invalid', organizationRole: 'capturer', isActive: true }],
  [otherCapturerId, { id: 'member-renewal-other', userId: otherCapturerId, name: 'Outro Captador', email: 'other@example.invalid', organizationRole: 'capturer', isActive: true }],
  [designerId, { id: 'member-renewal-designer', userId: designerId, name: 'Projetista', email: 'designer@example.invalid', organizationRole: 'project_designer', isActive: true }],
  [managerId, { id: 'member-renewal-manager', userId: managerId, name: 'Gestor', email: 'manager@example.invalid', organizationRole: 'manager', isActive: true }],
  [financeId, { id: 'member-renewal-finance', userId: financeId, name: 'Financeiro', email: 'finance@example.invalid', organizationRole: 'finance', isActive: true }],
]);

const assignmentGateway: ClientCapturerAssignmentGateway = {
  async getActiveAssignment(requestOrganizationId, clientId) {
    if (!assignmentActive || requestOrganizationId !== organizationId || clientId !== clientBase.id) return null;
    return {
      id: 'assignment-renewal-001',
      organizationId,
      clientId: clientBase.id,
      capturerUserId: capturerId,
      status: 'active',
      isPrimary: true,
      startedAt: '2026-01-01T00:00:00.000Z',
      assignedByUserId: managerId,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  },
  async listAssignmentsByClient() { return []; },
  async listClientsByCapturer(requestOrganizationId, userId) {
    return assignmentActive && requestOrganizationId === organizationId && userId === capturerId
      ? [clientBase.id]
      : [];
  },
  async assignCapturer() { throw new Error('Fora do escopo.'); },
  async transferCapturer() { throw new Error('Fora do escopo.'); },
  async terminateAssignment() { throw new Error('Fora do escopo.'); },
};

function createContext(
  userId: string,
  role: OrganizationRole,
  organization = organizationId
): ProposalAppContext {
  return {
    organizationId: organization,
    actor: { userId, role, isActive: true, permissions: getRolePermissions(role) },
    clientResolver: async (clientId) => clientId === clientBase.id
      ? { ...clientBase, name: canonicalClientName }
      : null,
    assignmentGateway,
    memberResolver: async (memberId) => members.get(memberId) ?? null,
  };
}

const capturerContext = createContext(capturerId, 'capturer');
const otherCapturerContext = createContext(otherCapturerId, 'capturer');
const designerContext = createContext(designerId, 'project_designer');
const managerContext = createContext(managerId, 'manager');
const financeContext = createContext(financeId, 'finance');
const isolatedContext = createContext(managerId, 'manager', otherOrganizationId);

function createInput(suffix: string): CreateProposalInput {
  return {
    clientId: clientBase.id,
    title: `Proposta de renovação ${suffix}`,
    proposalType: 'credit',
    category: 'investimento',
    requestedAmountCents: 12_345_678,
    financingTermMonths: 24,
    gracePeriodMonths: 2,
    interestRateAnnualPercentage: 7.25,
    validityDays: 15,
    notes: 'SENSITIVE-RENEWAL-NOTES',
    idempotencyKey: `renewal-create-${suffix}`,
  };
}

async function createDraft(
  service: ProposalApplicationService,
  clock: MockClock,
  suffix: string
): Promise<Proposal> {
  return service.createProposal(createInput(suffix), capturerContext, clock);
}

async function startReview(
  service: ProposalApplicationService,
  clock: MockClock,
  suffix: string
): Promise<Proposal> {
  let proposal = await createDraft(service, clock, suffix);
  proposal = await service.submitProposal({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: `renewal-submit-${suffix}`,
  }, capturerContext, clock);
  proposal = await service.assignProposalReviewer({
    proposalId: proposal.id,
    reviewerUserId: designerId,
    expectedVersion: proposal.version,
    idempotencyKey: `renewal-assign-${suffix}`,
  }, managerContext, clock);
  return service.startProposalReview({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: `renewal-review-${suffix}`,
  }, designerContext, clock);
}

async function presentProposal(
  service: ProposalApplicationService,
  clock: MockClock,
  suffix: string
): Promise<Proposal> {
  let proposal = await startReview(service, clock, suffix);
  proposal = await service.approveProposal({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: `renewal-approve-${suffix}`,
  }, managerContext, clock);
  const document = await service.issueProposalDocument({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: `renewal-document-${suffix}`,
  }, managerContext, clock);
  return service.markProposalPresented({
    proposalId: proposal.id,
    expectedVersion: proposal.version,
    idempotencyKey: `renewal-present-${suffix}`,
    channel: 'in_person',
    documentId: document.id,
  }, capturerContext, clock);
}

async function run(): Promise<void> {
  console.log('===========================================================');
  console.log('Suíte comportamental OE-005.007 — Renovação de Propostas');
  console.log('===========================================================\n');

  await executeDomainSessionCleanup();
  const service = new ProposalApplicationService(new DeterministicIdGenerator());
  const clock = new MockClock(new Date('2026-07-01T10:00:00.000Z'));

  console.log('--- Estados elegíveis, cópia segura e linhagem ---');
  let declined = await presentProposal(service, clock, 'declined');
  declined = await service.recordProposalDecision({
    proposalId: declined.id,
    expectedVersion: declined.version,
    idempotencyKey: 'renewal-decline-source',
    decision: 'declined',
    channel: 'phone',
    notes: 'SENSITIVE-DECISION-NOTES',
  }, capturerContext, clock);
  const sourceBefore = JSON.stringify(declined);
  canonicalClientName = 'Cliente Canônico Atualizado';
  const renewalCommand = {
    proposalId: declined.id,
    expectedVersion: declined.version,
    reason: 'Cliente solicitou uma nova negociação comercial.',
    idempotencyKey: 'renewal-primary-command',
  } as const;
  const renewed = await service.renewProposal(renewalCommand, capturerContext, clock);
  const sourceAfter = await service.getProposalById(declined.id, capturerContext);
  assert(renewed.status === 'draft' && renewed.id !== declined.id, 'Renovação cria um novo rascunho');
  assert(JSON.stringify(sourceAfter) === sourceBefore, 'Proposta de origem permanece integralmente imutável');
  assert(renewed.clientSnapshot.name === canonicalClientName, 'Novo rascunho atualiza o snapshot do cliente canônico');
  assert(
    renewed.estimatedValue.amountCents === declined.estimatedValue.amountCents
      && renewed.calculationSummary.financingTermMonths === declined.calculationSummary.financingTermMonths,
    'Condições comerciais permitidas são preservadas'
  );
  assert(
    !renewed.notes
      && !renewed.presentationRecord
      && !renewed.decisionRecord
      && !renewed.reviewNotes
      && !renewed.activeReviewAssignment,
    'Artefatos operacionais e observações anteriores não são copiados'
  );
  const lineage = await service.getProposalRenewalLineage(declined.id, capturerContext);
  assert(lineage.successor?.renewedProposalId === renewed.id, 'Origem aponta para um único sucessor canônico');
  assert(
    lineage.successor?.sourceStatus === 'declined'
      && lineage.successor.sourceVersionNumber === declined.version
      && /^[0-9a-f]{64}$/.test(lineage.successor.checksumSha256),
    'Vínculo registra estado, versão e SHA-256 da origem'
  );

  console.log('\n--- Idempotência, conflitos e concorrência ---');
  const replay = await service.renewProposal(renewalCommand, capturerContext, clock);
  assert(replay.id === renewed.id, 'Replay idempotente retorna o mesmo rascunho');
  const alternate = await service.renewProposal({
    ...renewalCommand,
    idempotencyKey: 'renewal-alternate-command',
  }, capturerContext, clock);
  assert(alternate.id === renewed.id, 'Outra chave com o mesmo motivo converge para o sucessor canônico');
  await expectDomainError(
    () => service.renewProposal({ ...renewalCommand, reason: 'Motivo divergente com a mesma chave.' }, capturerContext, clock),
    'IDEMPOTENCY_CONFLICT',
    'Mesma chave com conteúdo divergente é recusada'
  );
  await expectDomainError(
    () => service.renewProposal({
      ...renewalCommand,
      reason: 'Uma justificativa comercial incompatível.',
      idempotencyKey: 'renewal-divergent-command',
    }, capturerContext, clock),
    'RENEWAL_ALREADY_EXISTS',
    'Origem não aceita um segundo sucessor com motivo divergente'
  );

  let concurrentSource = await createDraft(service, clock, 'concurrent');
  concurrentSource = await service.cancelProposal({
    proposalId: concurrentSource.id,
    expectedVersion: concurrentSource.version,
    idempotencyKey: 'renewal-cancel-concurrent',
  }, capturerContext, clock);
  const concurrent = await Promise.allSettled([
    service.renewProposal({
      proposalId: concurrentSource.id,
      expectedVersion: concurrentSource.version,
      reason: 'Retomar tratativa após atualização cadastral.',
      idempotencyKey: 'renewal-concurrent-a',
    }, capturerContext, clock),
    service.renewProposal({
      proposalId: concurrentSource.id,
      expectedVersion: concurrentSource.version,
      reason: 'Retomar tratativa após atualização cadastral.',
      idempotencyKey: 'renewal-concurrent-b',
    }, capturerContext, clock),
  ]);
  const concurrentResults = concurrent.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  assert(
    concurrentResults.length === 2 && concurrentResults[0]?.id === concurrentResults[1]?.id,
    'Chamadas concorrentes convergem para exatamente um novo rascunho'
  );

  console.log('\n--- RBAC, vínculo comercial e isolamento ---');
  let active = await createDraft(service, clock, 'active');
  await expectDomainError(
    () => service.renewProposal({
      proposalId: active.id,
      expectedVersion: active.version,
      reason: 'Tentativa em estado ainda ativo.',
      idempotencyKey: 'renewal-active-denied',
    }, capturerContext, clock),
    'RENEWAL_NOT_ALLOWED',
    'Estado ativo nunca pode ser reaberto por renovação'
  );
  active = await service.cancelProposal({
    proposalId: active.id,
    expectedVersion: active.version,
    idempotencyKey: 'renewal-cancel-rbac',
  }, capturerContext, clock);
  await expectDomainError(
    () => service.renewProposal({
      proposalId: active.id,
      expectedVersion: active.version,
      reason: 'Financeiro tentando criar rascunho.',
      idempotencyKey: 'renewal-finance-denied',
    }, financeContext, clock),
    'PERMISSION_DENIED',
    'Financeiro não renova propostas'
  );
  await expectDomainError(
    () => service.renewProposal({
      proposalId: active.id,
      expectedVersion: active.version,
      reason: 'Projetista tentando criar rascunho.',
      idempotencyKey: 'renewal-designer-denied',
    }, designerContext, clock),
    'PERMISSION_DENIED',
    'Projetista não renova propostas'
  );
  await expectDomainError(
    () => service.renewProposal({
      proposalId: active.id,
      expectedVersion: active.version,
      reason: 'Outro captador tentando renovar.',
      idempotencyKey: 'renewal-other-capturer-denied',
    }, otherCapturerContext, clock),
    'PERMISSION_DENIED',
    'Captador não relacionado não acessa nem renova a proposta'
  );
  assignmentActive = false;
  await expectDomainError(
    () => service.renewProposal({
      proposalId: active.id,
      expectedVersion: active.version,
      reason: 'Tentativa sem vínculo comercial ativo.',
      idempotencyKey: 'renewal-inactive-assignment',
    }, capturerContext, clock),
    'CAPTURER_NOT_ASSIGNED',
    'Captador sem vínculo comercial ativo é bloqueado'
  );
  assignmentActive = true;
  await expectDomainError(
    () => service.renewProposal({
      proposalId: active.id,
      expectedVersion: active.version,
      reason: 'Tentativa entre organizações diferentes.',
      idempotencyKey: 'renewal-isolated-denied',
    }, isolatedContext, clock),
    'PROPOSAL_NOT_FOUND',
    'IDOR entre organizações é bloqueado'
  );

  console.log('\n--- Outros estados terminais e gerações sucessivas ---');
  let accepted = await presentProposal(service, clock, 'accepted');
  accepted = await service.recordProposalDecision({
    proposalId: accepted.id,
    expectedVersion: accepted.version,
    idempotencyKey: 'renewal-accept-source',
    decision: 'accepted',
    channel: 'phone',
  }, capturerContext, clock);
  await expectDomainError(
    () => service.renewProposal({
      proposalId: accepted.id,
      expectedVersion: accepted.version,
      reason: 'Aceite não pode gerar renovação.',
      idempotencyKey: 'renewal-accepted-denied',
    }, managerContext, clock),
    'RENEWAL_NOT_ALLOWED',
    'Proposta aceita nunca pode ser renovada'
  );

  let rejected = await startReview(service, clock, 'rejected');
  rejected = await service.rejectProposal({
    proposalId: rejected.id,
    expectedVersion: rejected.version,
    reason: 'Condições técnicas insuficientes.',
    idempotencyKey: 'renewal-reject-source',
  }, designerContext, clock);
  const renewedRejected = await service.renewProposal({
    proposalId: rejected.id,
    expectedVersion: rejected.version,
    reason: 'Condições técnicas serão reapresentadas.',
    idempotencyKey: 'renewal-rejected-source',
  }, managerContext, clock);
  assert(renewedRejected.status === 'draft', 'Proposta rejeitada pode originar novo rascunho');

  let expired = await presentProposal(service, clock, 'expired');
  clock.setTime(new Date(expired.expiresAt));
  await service.expireDueProposals({ organizationId, systemActor: 'proposal-expiration-scheduler' }, clock);
  expired = (await service.getProposalById(expired.id, capturerContext))!;
  const renewedExpired = await service.renewProposal({
    proposalId: expired.id,
    expectedVersion: expired.version,
    reason: 'Prazo comercial será negociado novamente.',
    idempotencyKey: 'renewal-expired-source',
  }, capturerContext, clock);
  assert(renewedExpired.status === 'draft', 'Proposta expirada pode originar novo rascunho');

  let firstGeneration = concurrentResults[0]!;
  firstGeneration = await service.cancelProposal({
    proposalId: firstGeneration.id,
    expectedVersion: firstGeneration.version,
    idempotencyKey: 'renewal-cancel-first-generation',
  }, capturerContext, clock);
  const secondGeneration = await service.renewProposal({
    proposalId: firstGeneration.id,
    expectedVersion: firstGeneration.version,
    reason: 'Nova rodada comercial após encerramento do rascunho anterior.',
    idempotencyKey: 'renewal-second-generation',
  }, capturerContext, clock);
  const secondLineage = await service.getProposalRenewalLineage(secondGeneration.id, capturerContext);
  assert(
    secondLineage.ancestors.length === 2
      && secondLineage.ancestors[0]?.rootProposalId === concurrentSource.id
      && secondLineage.ancestors[1]?.sequenceNumber === 2,
    'Gerações sucessivas preservam raiz e sequência imutáveis'
  );

  console.log('\n--- Eventos, rotas e limpeza de sessão ---');
  const renewalEvents = proposalEventBus.getEventsForProposal(organizationId, renewed.id)
    .filter((event) => event.type === 'proposal.renewal.created');
  assert(renewalEvents.length === 1, 'Renovação idempotente gera exatamente um evento');
  const serializedEvents = JSON.stringify(renewalEvents);
  assert(
    !serializedEvents.includes('SENSITIVE-RENEWAL-DOCUMENT')
      && !serializedEvents.includes('SENSITIVE-RENEWAL-PHONE')
      && !serializedEvents.includes('renewal-sensitive@example.invalid')
      && !serializedEvents.includes('SENSITIVE-RENEWAL-NOTES')
      && !serializedEvents.includes('SENSITIVE-DECISION-NOTES')
      && !serializedEvents.includes(renewalCommand.reason),
    'Evento de renovação não expõe dados pessoais, observações ou motivo'
  );
  assert(
    findRouteDefinition(ROUTES.PROPOSALS_RENEW)?.requiredPermissions === 'proposals:renew',
    'Rota de renovação exige permissão granular'
  );
  assert(
    getProposalRenewalPath('proposal/with unsafe value') === '/propostas/proposal%2Fwith%20unsafe%20value/renovar',
    'Builder da rota codifica identificadores não confiáveis'
  );

  await executeDomainSessionCleanup();
  await expectDomainError(
    () => service.getProposalById(renewed.id, capturerContext),
    'PROPOSAL_NOT_FOUND',
    'Logout limpa propostas e vínculos de renovação'
  );
  assert(
    proposalEventBus.getEventsForProposal(organizationId, renewed.id).length === 0,
    'Logout limpa eventos e notificações de renovação'
  );

  console.log('\n===========================================================');
  console.log(`Resultado OE-005.007: ${passed} passaram, ${failed} falharam`);
  console.log('===========================================================');
  if (failed > 0) process.exit(1);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
