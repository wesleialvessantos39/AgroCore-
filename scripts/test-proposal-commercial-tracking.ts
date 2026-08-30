/**
 * SUÍTE COMPORTAMENTAL OE-005.005
 * Acompanhamento comercial, funil e encaminhamento pós-aceite.
 */

import { executeDomainSessionCleanup } from '../src/auth/domainCleanupRegistry';
import { OrganizationMember } from '../src/auth/organizationMembersGateway';
import { getRolePermissions } from '../src/authorization/permissionsMatrix';
import { IdGenerator, MockClock } from '../src/proposals/cryptoUtils';
import { ProposalAppContext, ProposalApplicationService } from '../src/proposals/proposalApplicationService';
import { proposalEventBus } from '../src/proposals/proposalEventService';
import { getProposalHandoffPath, ROUTES } from '../src/routes/paths';
import { findRouteDefinition } from '../src/routes/routeMatrix';
import { OrganizationRole } from '../src/types/auth';
import { Permission } from '../src/types/authorization';
import { Client } from '../src/types/client';
import { ClientCapturerAssignmentGateway } from '../src/types/clientCapturerAssignment';
import {
  CreateProposalInput,
  Proposal,
  ProposalCommercialDocument,
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
    return `${prefix}_tracking_test_${this.sequence.toString().padStart(4, '0')}`;
  }
}

const organizationId = 'org-tracking-test';
const otherOrganizationId = 'org-tracking-isolated';
const capturerId = 'user-tracking-capturer';
const otherCapturerId = 'user-tracking-other-capturer';
const designerId = 'user-tracking-designer';
const managerId = 'user-tracking-manager';
const financeId = 'user-tracking-finance';
const inactiveManagerId = 'user-tracking-inactive';

const client: Client = {
  id: 'client-tracking-001',
  organizationId,
  personType: 'individual',
  name: 'Cliente Canônico de Acompanhamento',
  cpf: 'SENSITIVE-TRACKING-DOCUMENT',
  isStateRegistrationExempt: true,
  contact: {
    primaryPhone: 'SENSITIVE-TRACKING-PHONE',
    hasWhatsapp: false,
    email: 'tracking-sensitive@example.invalid',
  },
  address: {
    addressType: 'rural',
    locality: 'Localidade de Teste',
    accessDescription: 'Acesso de teste',
    city: 'Município de Teste',
    state: 'TT',
  },
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const members = new Map<string, OrganizationMember>([
  [capturerId, { id: 'member-track-cap', userId: capturerId, name: 'Captador de Teste', email: 'cap@example.invalid', organizationRole: 'capturer', isActive: true }],
  [otherCapturerId, { id: 'member-track-other', userId: otherCapturerId, name: 'Outro Captador', email: 'other@example.invalid', organizationRole: 'capturer', isActive: true }],
  [designerId, { id: 'member-track-designer', userId: designerId, name: 'Projetista de Teste', email: 'designer@example.invalid', organizationRole: 'project_designer', isActive: true }],
  [managerId, { id: 'member-track-manager', userId: managerId, name: 'Gestor de Teste', email: 'manager@example.invalid', organizationRole: 'manager', isActive: true }],
  [financeId, { id: 'member-track-finance', userId: financeId, name: 'Financeiro de Teste', email: 'finance@example.invalid', organizationRole: 'finance', isActive: true }],
  [inactiveManagerId, { id: 'member-track-inactive', userId: inactiveManagerId, name: 'Gestor Inativo', email: 'inactive@example.invalid', organizationRole: 'manager', isActive: false }],
]);

const assignmentGateway: ClientCapturerAssignmentGateway = {
  async getActiveAssignment(requestOrganizationId, clientId) {
    if (requestOrganizationId !== organizationId || clientId !== client.id) return null;
    return {
      id: 'assignment-tracking-001', organizationId, clientId: client.id,
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
  const permissions = getRolePermissions(role);
  return {
    organizationId: options.organization ?? organizationId,
    actor: {
      userId,
      role,
      isActive: true,
      permissions: options.injectedPermission ? [...permissions, options.injectedPermission] : permissions,
    },
    clientResolver: async (clientId) => clientId === client.id ? client : null,
    assignmentGateway,
    memberResolver: async (memberId) => members.get(memberId) ?? null,
  };
}

const capturerContext = createContext(capturerId, 'capturer');
const otherCapturerContext = createContext(otherCapturerId, 'capturer');
const designerContext = createContext(designerId, 'project_designer');
const managerContext = createContext(managerId, 'manager');
const financeContext = createContext(financeId, 'finance');
const isolatedContext = createContext(managerId, 'manager', { organization: otherOrganizationId });
const designerWithInjectedFollowUp = createContext(designerId, 'project_designer', { injectedPermission: 'proposals:manage_follow_up' });

function createInput(key: string, suffix: string): CreateProposalInput {
  return {
    clientId: client.id,
    title: `Proposta de Acompanhamento ${suffix}`,
    proposalType: 'credit',
    category: 'investimento',
    requestedAmountCents: 20_000_000,
    validityDays: 10,
    financingTermMonths: 24,
    notes: 'SENSITIVE-COMMERCIAL-NOTES',
    idempotencyKey: key,
  };
}

async function approve(
  service: ProposalApplicationService,
  clock: MockClock,
  suffix: string
): Promise<Proposal> {
  let proposal = await service.createProposal(createInput(`tracking-create-${suffix}`, suffix), capturerContext, clock);
  proposal = await service.submitProposal({ proposalId: proposal.id, expectedVersion: proposal.version, idempotencyKey: `tracking-submit-${suffix}` }, capturerContext, clock);
  proposal = await service.assignProposalReviewer({ proposalId: proposal.id, reviewerUserId: designerId, expectedVersion: proposal.version, idempotencyKey: `tracking-assign-${suffix}` }, managerContext, clock);
  proposal = await service.startProposalReview({ proposalId: proposal.id, expectedVersion: proposal.version, idempotencyKey: `tracking-review-${suffix}` }, designerContext, clock);
  return service.approveProposal({ proposalId: proposal.id, expectedVersion: proposal.version, idempotencyKey: `tracking-approve-${suffix}` }, managerContext, clock);
}

async function present(
  service: ProposalApplicationService,
  clock: MockClock,
  suffix: string
): Promise<{ proposal: Proposal; document: ProposalCommercialDocument }> {
  const approved = await approve(service, clock, suffix);
  const document = await service.issueProposalDocument({ proposalId: approved.id, expectedVersion: approved.version, idempotencyKey: `tracking-doc-${suffix}` }, managerContext, clock);
  const proposal = await service.markProposalPresented({ proposalId: approved.id, expectedVersion: approved.version, idempotencyKey: `tracking-present-${suffix}`, channel: 'in_person', documentId: document.id }, capturerContext, clock);
  return { proposal, document };
}

async function accept(
  service: ProposalApplicationService,
  clock: MockClock,
  suffix: string
): Promise<Proposal> {
  const presented = await present(service, clock, suffix);
  return service.recordProposalDecision({
    proposalId: presented.proposal.id,
    expectedVersion: presented.proposal.version,
    idempotencyKey: `tracking-accept-${suffix}`,
    decision: 'accepted',
    channel: 'phone',
    operationalReference: `REF-${suffix}`,
  }, capturerContext, clock);
}

async function run(): Promise<void> {
  console.log('================================================================');
  console.log('Suíte comportamental OE-005.005 — Acompanhamento e Handoff');
  console.log('================================================================\n');

  await executeDomainSessionCleanup();
  const service = new ProposalApplicationService(new DeterministicIdGenerator());
  const clock = new MockClock(new Date('2026-05-10T10:00:00.000Z'));

  console.log('--- Follow-up, RBAC e concorrência ---');
  const draft = await service.createProposal(createInput('tracking-create-draft', 'Rascunho'), capturerContext, clock);
  await expectDomainError(
    () => service.scheduleProposalFollowUp({
      proposalId: draft.id, assignedUserId: capturerId, scheduledFor: '2026-05-11T10:00:00.000Z',
      channel: 'phone', purpose: 'decision_reminder', expectedVersion: draft.version,
      idempotencyKey: 'tracking-followup-draft',
    }, capturerContext, clock),
    'FOLLOW_UP_NOT_ALLOWED',
    'Rascunho não aceita follow-up comercial'
  );

  const primary = await present(service, clock, 'principal');
  await expectDomainError(
    () => service.scheduleProposalFollowUp({
      proposalId: primary.proposal.id, assignedUserId: capturerId, scheduledFor: '2026-05-10T09:00:00.000Z',
      channel: 'phone', purpose: 'decision_reminder', expectedVersion: primary.proposal.version,
      idempotencyKey: 'tracking-followup-past',
    }, capturerContext, clock),
    'FOLLOW_UP_DATE_INVALID',
    'Data passada é recusada'
  );
  await expectDomainError(
    () => service.scheduleProposalFollowUp({
      proposalId: primary.proposal.id, assignedUserId: capturerId, scheduledFor: primary.proposal.expiresAt,
      channel: 'phone', purpose: 'decision_reminder', expectedVersion: primary.proposal.version,
      idempotencyKey: 'tracking-followup-expiry',
    }, capturerContext, clock),
    'FOLLOW_UP_DATE_INVALID',
    'Follow-up no vencimento é recusado'
  );
  await expectDomainError(
    () => service.scheduleProposalFollowUp({
      proposalId: primary.proposal.id, assignedUserId: inactiveManagerId, scheduledFor: '2026-05-11T10:00:00.000Z',
      channel: 'phone', purpose: 'decision_reminder', expectedVersion: primary.proposal.version,
      idempotencyKey: 'tracking-followup-inactive',
    }, managerContext, clock),
    'FOLLOW_UP_NOT_ALLOWED',
    'Responsável inativo é recusado'
  );
  await expectDomainError(
    () => service.scheduleProposalFollowUp({
      proposalId: primary.proposal.id, assignedUserId: managerId, scheduledFor: '2026-05-11T10:00:00.000Z',
      channel: 'phone', purpose: 'decision_reminder', expectedVersion: primary.proposal.version,
      idempotencyKey: 'tracking-followup-capturer-manager',
    }, capturerContext, clock),
    'PERMISSION_DENIED',
    'Captador não atribui follow-up a outro usuário'
  );
  await expectDomainError(
    () => service.scheduleProposalFollowUp({
      proposalId: primary.proposal.id, assignedUserId: financeId, scheduledFor: '2026-05-11T10:00:00.000Z',
      channel: 'phone', purpose: 'decision_reminder', expectedVersion: primary.proposal.version,
      idempotencyKey: 'tracking-followup-finance',
    }, financeContext, clock),
    'PERMISSION_DENIED',
    'Financeiro não administra follow-ups'
  );
  await expectDomainError(
    () => service.scheduleProposalFollowUp({
      proposalId: primary.proposal.id, assignedUserId: designerId, scheduledFor: '2026-05-11T10:00:00.000Z',
      channel: 'phone', purpose: 'decision_reminder', expectedVersion: primary.proposal.version,
      idempotencyKey: 'tracking-followup-injected',
    }, designerWithInjectedFollowUp, clock),
    'PERMISSION_DENIED',
    'Permissão injetada não amplia o papel do projetista'
  );
  await expectDomainError(
    () => service.getProposalFollowUps(primary.proposal.id, otherCapturerContext),
    'PERMISSION_DENIED',
    'Captador não acessa acompanhamento de outro captador'
  );

  const scheduled = await service.scheduleProposalFollowUp({
    proposalId: primary.proposal.id, assignedUserId: capturerId, scheduledFor: '2026-05-11T10:00:00.000Z',
    channel: 'phone', purpose: 'decision_reminder', expectedVersion: primary.proposal.version,
    idempotencyKey: 'tracking-followup-primary',
  }, capturerContext, clock);
  assert(scheduled.status === 'scheduled' && scheduled.assignedUserId === capturerId, 'Follow-up usa responsável canônico e estado inicial correto');
  const replay = await service.scheduleProposalFollowUp({
    proposalId: primary.proposal.id, assignedUserId: capturerId, scheduledFor: '2026-05-11T10:00:00.000Z',
    channel: 'phone', purpose: 'decision_reminder', expectedVersion: primary.proposal.version,
    idempotencyKey: 'tracking-followup-primary',
  }, capturerContext, clock);
  assert(replay.id === scheduled.id, 'Replay idempotente retorna o mesmo follow-up');
  await expectDomainError(
    () => service.scheduleProposalFollowUp({
      proposalId: primary.proposal.id, assignedUserId: capturerId, scheduledFor: '2026-05-12T10:00:00.000Z',
      channel: 'phone', purpose: 'decision_reminder', expectedVersion: primary.proposal.version,
      idempotencyKey: 'tracking-followup-primary',
    }, capturerContext, clock),
    'IDEMPOTENCY_CONFLICT',
    'Mesma chave com payload divergente é recusada'
  );
  await expectDomainError(
    () => service.scheduleProposalFollowUp({
      proposalId: primary.proposal.id, assignedUserId: capturerId, scheduledFor: '2026-05-12T10:00:00.000Z',
      channel: 'phone', purpose: 'decision_reminder', expectedVersion: primary.proposal.version,
      idempotencyKey: 'tracking-followup-second-active',
    }, capturerContext, clock),
    'FOLLOW_UP_CONFLICT',
    'Somente um follow-up ativo é permitido por proposta'
  );

  const dashboard = await service.getCommercialDashboard(managerContext, clock);
  assert(dashboard.presentedOpenCount >= 1 && dashboard.trackedItems.some((item) => item.activeFollowUp?.id === scheduled.id), 'Painel deriva follow-up e estado da fonte canônica');
  const otherCapturerDashboard = await service.getCommercialDashboard(otherCapturerContext, clock);
  assert(otherCapturerDashboard.totalVisible === 0, 'Funil do captador permanece restrito às propostas relacionadas');
  const financeDashboard = await service.getCommercialDashboard(financeContext, clock);
  assert(financeDashboard.totalVisible === dashboard.totalVisible, 'Financeiro consulta funil organizacional somente leitura');

  const completed = await service.completeProposalFollowUp({
    proposalId: primary.proposal.id, followUpId: scheduled.id, expectedFollowUpVersion: scheduled.version,
    outcome: 'contacted', idempotencyKey: 'tracking-complete-primary',
  }, capturerContext, clock);
  assert(completed.status === 'completed' && completed.outcome === 'contacted', 'Conclusão registra resultado tipado');
  await expectDomainError(
    () => service.completeProposalFollowUp({
      proposalId: primary.proposal.id, followUpId: scheduled.id, expectedFollowUpVersion: scheduled.version,
      outcome: 'contacted', idempotencyKey: 'tracking-complete-stale',
    }, capturerContext, clock),
    'FOLLOW_UP_CONFLICT',
    'Versão obsoleta do follow-up é recusada'
  );

  const concurrentProposal = await present(service, clock, 'concorrente');
  const concurrentCommands = ['tracking-followup-concurrent-a', 'tracking-followup-concurrent-b'].map((idempotencyKey) =>
    service.scheduleProposalFollowUp({
      proposalId: concurrentProposal.proposal.id, assignedUserId: capturerId,
      scheduledFor: '2026-05-11T12:00:00.000Z', channel: 'messaging', purpose: 'commercial_alignment',
      expectedVersion: concurrentProposal.proposal.version, idempotencyKey,
    }, capturerContext, clock)
  );
  const concurrentResults = await Promise.allSettled(concurrentCommands);
  assert(
    concurrentResults.filter((result) => result.status === 'fulfilled').length === 1
      && concurrentResults.filter((result) => result.status === 'rejected').length === 1,
    'Concorrência cria exatamente um follow-up ativo'
  );

  const cancellationProposal = await present(service, clock, 'cancelamento');
  const cancellable = await service.scheduleProposalFollowUp({
    proposalId: cancellationProposal.proposal.id, assignedUserId: managerId,
    scheduledFor: '2026-05-12T12:00:00.000Z', channel: 'email', purpose: 'document_clarification',
    expectedVersion: cancellationProposal.proposal.version, idempotencyKey: 'tracking-schedule-cancel',
  }, managerContext, clock);
  const cancelled = await service.cancelProposalFollowUp({
    proposalId: cancellationProposal.proposal.id, followUpId: cancellable.id,
    expectedFollowUpVersion: cancellable.version, reason: 'Replanejamento comercial',
    idempotencyKey: 'tracking-cancel-manual',
  }, managerContext, clock);
  assert(cancelled.status === 'cancelled' && cancelled.cancellationReasonCode === 'MANUAL', 'Cancelamento manual exige motivo e preserva código tipado');

  const autoCloseProposal = await present(service, clock, 'autofechamento');
  await service.scheduleProposalFollowUp({
    proposalId: autoCloseProposal.proposal.id, assignedUserId: capturerId,
    scheduledFor: '2026-05-13T12:00:00.000Z', channel: 'phone', purpose: 'decision_reminder',
    expectedVersion: autoCloseProposal.proposal.version, idempotencyKey: 'tracking-auto-schedule',
  }, capturerContext, clock);
  const acceptedWithFollowUp = await service.recordProposalDecision({
    proposalId: autoCloseProposal.proposal.id, expectedVersion: autoCloseProposal.proposal.version,
    idempotencyKey: 'tracking-auto-accept', decision: 'accepted', channel: 'phone',
  }, capturerContext, clock);
  const autoClosed = await service.getProposalFollowUps(acceptedWithFollowUp.id, capturerContext);
  assert(autoClosed[0]?.status === 'cancelled' && autoClosed[0]?.cancellationReasonCode === 'PROPOSAL_ACCEPTED', 'Aceite fecha automaticamente follow-up pendente');

  const expiringFollowUpProposal = await present(service, clock, 'expiracao-followup');
  await service.scheduleProposalFollowUp({
    proposalId: expiringFollowUpProposal.proposal.id, assignedUserId: capturerId,
    scheduledFor: '2026-05-11T16:00:00.000Z', channel: 'phone', purpose: 'decision_reminder',
    expectedVersion: expiringFollowUpProposal.proposal.version, idempotencyKey: 'tracking-expiry-schedule',
  }, capturerContext, clock);
  clock.setTime(new Date(expiringFollowUpProposal.proposal.expiresAt));
  const expiredCount = await service.expireDueProposals({
    organizationId,
    systemActor: 'proposal-expiration-scheduler',
  }, clock);
  const expiredFollowUps = await service.getProposalFollowUps(expiringFollowUpProposal.proposal.id, capturerContext);
  assert(expiredCount >= 1 && expiredFollowUps[0]?.cancellationReasonCode === 'PROPOSAL_EXPIRED', 'Expiração fecha automaticamente follow-up pendente');
  clock.setTime(new Date('2026-05-10T10:00:00.000Z'));

  console.log('\n--- Encaminhamento, integridade e rotas ---');
  const notAcceptedForHandoff = await present(service, clock, 'sem-aceite-handoff');
  await expectDomainError(
    () => service.prepareProposalHandoff({
      proposalId: notAcceptedForHandoff.proposal.id, expectedVersion: notAcceptedForHandoff.proposal.version,
      idempotencyKey: 'tracking-handoff-presented',
    }, managerContext, clock),
    'HANDOFF_NOT_AVAILABLE',
    'Proposta sem aceite não produz encaminhamento'
  );
  const accepted = await accept(service, clock, 'handoff');
  await expectDomainError(
    () => service.prepareProposalHandoff({
      proposalId: accepted.id, expectedVersion: accepted.version,
      idempotencyKey: 'tracking-handoff-finance',
    }, financeContext, clock),
    'PERMISSION_DENIED',
    'Financeiro não prepara encaminhamento'
  );
  await expectDomainError(
    () => service.prepareProposalHandoff({
      proposalId: accepted.id, expectedVersion: accepted.version,
      idempotencyKey: 'tracking-handoff-capturer',
    }, capturerContext, clock),
    'PERMISSION_DENIED',
    'Captador não prepara encaminhamento administrativo'
  );
  const handoff = await service.prepareProposalHandoff({
    proposalId: accepted.id, expectedVersion: accepted.version,
    idempotencyKey: 'tracking-handoff-primary',
  }, managerContext, clock);
  assert(/^[0-9a-f]{64}$/.test(handoff.checksumSha256), 'Encaminhamento possui SHA-256 real');
  assert(handoff.destination === 'credit_operations', 'Destino é derivado do tipo canônico da proposta');
  const acceptedSnapshots = await service.getProposalSnapshots(accepted.id, managerContext);
  const acceptedSnapshot = acceptedSnapshots.find((snapshot) => snapshot.status === 'accepted');
  assert(
    handoff.acceptedSnapshotId === acceptedSnapshot?.id
      && handoff.acceptedSnapshotChecksumSha256 === acceptedSnapshot?.checksumSha256,
    'Encaminhamento referencia exatamente o snapshot aceito'
  );
  assert(handoff.disclaimerText.includes('Não cria contrato') && handoff.disclaimerText.includes('operação de crédito'), 'Encaminhamento declara limites jurídicos e operacionais');
  const handoffReplay = await service.prepareProposalHandoff({
    proposalId: accepted.id, expectedVersion: accepted.version,
    idempotencyKey: 'tracking-handoff-primary',
  }, managerContext, clock);
  assert(handoffReplay.id === handoff.id, 'Replay idempotente retorna o mesmo encaminhamento');
  const alternateHandoff = await service.prepareProposalHandoff({
    proposalId: accepted.id, expectedVersion: accepted.version,
    idempotencyKey: 'tracking-handoff-alternate',
  }, managerContext, clock);
  assert(alternateHandoff.id === handoff.id, 'Proposta aceita produz somente um encaminhamento canônico');
  const concurrentAccepted = await accept(service, clock, 'handoff-concorrente');
  const concurrentHandoffs = await Promise.all([
    service.prepareProposalHandoff({
      proposalId: concurrentAccepted.id, expectedVersion: concurrentAccepted.version,
      idempotencyKey: 'tracking-handoff-concurrent-a',
    }, managerContext, clock),
    service.prepareProposalHandoff({
      proposalId: concurrentAccepted.id, expectedVersion: concurrentAccepted.version,
      idempotencyKey: 'tracking-handoff-concurrent-b',
    }, managerContext, clock),
  ]);
  assert(concurrentHandoffs[0].id === concurrentHandoffs[1].id, 'Concorrência produz exatamente um encaminhamento canônico');
  const financeHandoff = await service.getProposalHandoff(accepted.id, financeContext);
  assert(financeHandoff?.id === handoff.id, 'Financeiro consulta encaminhamento em modo somente leitura');
  await expectDomainError(
    () => service.getProposalHandoff(accepted.id, isolatedContext),
    'PROPOSAL_NOT_FOUND',
    'IDOR de encaminhamento entre organizações é bloqueado'
  );

  const handoffEvents = proposalEventBus.getEventsForProposal(organizationId, accepted.id)
    .filter((event) => event.type === 'proposal.handoff.prepared');
  assert(handoffEvents.length === 1, 'Encaminhamento idempotente gera exatamente um evento');
  const serializedEvents = JSON.stringify(proposalEventBus.getEventsForProposal(organizationId, accepted.id));
  assert(
    !serializedEvents.includes('SENSITIVE-TRACKING-DOCUMENT')
      && !serializedEvents.includes('SENSITIVE-TRACKING-PHONE')
      && !serializedEvents.includes('tracking-sensitive@example.invalid')
      && !serializedEvents.includes('SENSITIVE-COMMERCIAL-NOTES'),
    'Eventos de acompanhamento e handoff não vazam dados sensíveis'
  );
  assert(
    getProposalHandoffPath('proposal / unsafe') === '/propostas/proposal%20%2F%20unsafe/encaminhamento',
    'Builder do encaminhamento codifica identificadores não confiáveis'
  );
  assert(
    findRouteDefinition('/propostas/proposal-test/encaminhamento')?.requiredPermissions === 'proposals:view_handoff'
      && findRouteDefinition(ROUTES.PROPOSALS_TRACKING)?.requiredPermissions === 'proposals:view_commercial_tracking',
    'Matriz protege acompanhamento e encaminhamento com permissões granulares'
  );

  await executeDomainSessionCleanup();
  assert(proposalEventBus.getEventsForProposal(organizationId, accepted.id).length === 0, 'Logout limpa eventos e notificações comerciais');
  await expectDomainError(
    () => service.getProposalById(accepted.id, managerContext),
    'PROPOSAL_NOT_FOUND',
    'Logout limpa propostas, follow-ups, handoffs, locks e idempotência'
  );

  console.log('\n================================================================');
  console.log(`Resultado OE-005.005: ${passed} passaram, ${failed} falharam`);
  console.log('================================================================');
  if (failed > 0) process.exit(1);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
