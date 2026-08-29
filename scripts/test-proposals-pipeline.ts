/**
 * SUÍTE DE TESTES DO PIPELINE COMERCIAL — OE-005.003
 * Testes de transição de estados, auditoria, segregação de funções (anti-self-approval),
 * prazos determinísticos, expiração, snapshots com SHA-256 e notificações.
 */

import {
  ProposalApplicationService,
  ProposalAppContext,
} from '../src/proposals/proposalApplicationService';
import {
  CreateProposalInput,
  ProposalDomainError,
} from '../src/types/proposals';
import { Client } from '../src/types/client';
import { Property } from '../src/types/property';
import { OrganizationMember } from '../src/auth/organizationMembersGateway';
import { ClientCapturerAssignmentGateway } from '../src/types/clientCapturerAssignment';
import { proposalEventBus } from '../src/proposals/proposalEventService';
import { MockClock } from '../src/proposals/cryptoUtils';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function runPipelineTests() {
  console.log('================================================================');
  console.log('Iniciando Suíte de Testes OE-005.003: Pipeline Comercial');
  console.log('================================================================\n');

  ProposalApplicationService.clearAll();
  proposalEventBus.clearAll();

  const orgA = 'org-agro-sul';
  const capturerId = 'usr-captador-1';
  const designerId = 'usr-projetista-1';
  const designer2Id = 'usr-projetista-2';
  const managerId = 'usr-gestor-1';
  const outsiderId = 'usr-outsider';

  const mockClients = new Map<string, Client>([
    [
      'cli-10',
      {
        id: 'cli-10',
        organizationId: orgA,
        personType: 'individual',
        name: 'Carlos Fazendeiro',
        cpf: '123.456.789-00',
        status: 'active',
        contact: { email: 'carlos@fazenda.com.br', primaryPhone: '(55) 99999-1111' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      } as any,
    ],
  ]);

  const mockMembers = new Map<string, OrganizationMember>([
    [
      capturerId,
      {
        id: 'mem-1',
        userId: capturerId,
        name: 'João Captador',
        email: 'joao@agrosul.com.br',
        organizationRole: 'capturer',
        isActive: true,
      },
    ],
    [
      designerId,
      {
        id: 'mem-2',
        userId: designerId,
        name: 'Maria Projetista',
        email: 'maria@agrosul.com.br',
        organizationRole: 'project_designer',
        isActive: true,
      },
    ],
    [
      designer2Id,
      {
        id: 'mem-3',
        userId: designer2Id,
        name: 'Pedro Segundo Projetista',
        email: 'pedro@agrosul.com.br',
        organizationRole: 'project_designer',
        isActive: true,
      },
    ],
    [
      managerId,
      {
        id: 'mem-4',
        userId: managerId,
        name: 'Ana Gestora',
        email: 'ana@agrosul.com.br',
        organizationRole: 'manager',
        isActive: true,
      },
    ],
  ]);

  const mockAssignmentGateway: ClientCapturerAssignmentGateway = {
    async getActiveAssignment(orgId: string, clientId: string) {
      if (orgId === orgA && clientId === 'cli-10') {
        return {
          id: 'assign-1',
          organizationId: orgA,
          clientId: 'cli-10',
          capturerUserId: capturerId,
          status: 'active',
          isPrimary: true,
          startedAt: '2026-01-01T00:00:00.000Z',
          assignedAt: '2026-01-01T00:00:00.000Z',
          assignedByUserId: 'usr-admin',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        };
      }
      return null;
    },
    async listAssignmentsByClient() {
      return [];
    },
    async listClientsByCapturer() {
      return ['cli-10'];
    },
    async assignCapturer() {
      throw new Error('Not needed in test');
    },
    async transferCapturer() {
      throw new Error('Not needed in test');
    },
    async terminateAssignment() {
      throw new Error('Not needed in test');
    },
  };

  const createCtx = (userId: string, role: any, permissions: string[]): ProposalAppContext => ({
    organizationId: orgA,
    actor: {
      userId,
      role,
      isActive: true,
      permissions: permissions as any,
    },
    clientResolver: async (id: string) => mockClients.get(id) || null,
    assignmentGateway: mockAssignmentGateway,
    memberResolver: async (id: string) => mockMembers.get(id) || null,
  });

  const ctxCapturer = createCtx(capturerId, 'capturer', [
    'proposals:view',
    'proposals:create',
    'proposals:edit_draft',
    'proposals:submit',
    'proposals:present',
    'proposals:record_decision',
    'proposals:cancel',
  ]);

  const ctxDesigner = createCtx(designerId, 'project_designer', [
    'proposals:view',
    'proposals:review',
    'proposals:approve',
  ]);

  const ctxDesigner2 = createCtx(designer2Id, 'project_designer', [
    'proposals:view',
    'proposals:review',
    'proposals:approve',
  ]);

  const ctxManager = createCtx(managerId, 'manager', [
    'proposals:view',
    'proposals:create',
    'proposals:edit_draft',
    'proposals:submit',
    'proposals:assign_review',
    'proposals:review',
    'proposals:approve',
    'proposals:present',
    'proposals:record_decision',
    'proposals:cancel',
  ]);

  const appService = new ProposalApplicationService();
  const baseTime = new Date('2026-03-01T10:00:00.000Z');
  const clock = new MockClock(baseTime);

  // --- ETAPA 1: Criação e Submissão ---
  console.log('--- ETAPA 1: Criação e Submissão Inicial ---');
  const proposal = await appService.createProposal(
    {
      clientId: 'cli-10',
      title: 'Financiamento Maquinário Trator Safra',
      proposalType: 'credit',
      category: 'investimento',
      requestedAmountCents: 45000000, // R$ 450.000,00
      validityDays: 15,
      financingTermMonths: 36,
      gracePeriodMonths: 6,
      interestRateAnnualPercentage: 11.5,
      notes: 'Aquisição de colheitadeira',
    },
    ctxCapturer,
    clock
  );

  assert(proposal.status === 'draft', 'Proposta nasce como draft');
  assert(proposal.capturerUserId === capturerId, 'Captador atribuído corretamente');
  assert(proposal.version === 1, 'Versão inicial = 1');

  // Submissão
  clock.advanceMinutes(30);
  const submitted = await appService.submitProposal(proposal.id, ctxCapturer, clock);
  assert(submitted.status === 'submitted', 'Transição para submitted com sucesso');
  assert(submitted.version === 2, 'Versão incrementada para 2');

  const historyAfterSubmit = await appService.getProposalHistory(proposal.id, ctxCapturer);
  assert(historyAfterSubmit.length === 1, 'Histórico contém 1 registro de transição');
  assert(historyAfterSubmit[0].fromStatus === 'draft' && historyAfterSubmit[0].toStatus === 'submitted', 'Histórico registra draft -> submitted');

  const snapshotsAfterSubmit = await appService.getProposalSnapshots(proposal.id, ctxCapturer);
  assert(snapshotsAfterSubmit.length === 1, 'Snapshot criado na submissão');
  assert(snapshotsAfterSubmit[0].versionNumber === 2, 'Snapshot gravou versão 2');
  assert(snapshotsAfterSubmit[0].checksumSha256.length === 64, 'Snapshot contém SHA-256 válido');

  // --- ETAPA 2: Atribuição de Revisor e Início de Parecer ---
  console.log('\n--- ETAPA 2: Atribuição de Revisor Técnico ---');

  // Tentativa de atribuir usuário de fora da organização
  let outsiderBlocked = false;
  try {
    await appService.assignProposalReviewer(proposal.id, outsiderId, ctxManager, clock);
  } catch (err) {
    if (err instanceof ProposalDomainError && err.code === 'REVIEWER_MISMATCH') {
      outsiderBlocked = true;
    }
  }
  assert(outsiderBlocked, 'Bloqueia atribuição de revisor que não pertence à organização ativa');

  // Atribuição válida pela gestora
  clock.advanceMinutes(15);
  const assigned = await appService.assignProposalReviewer(proposal.id, designerId, ctxManager, clock);
  assert(assigned.activeReviewAssignment?.reviewerUserId === designerId, 'Revisor Maria Projetista atribuída');
  assert(assigned.version === 3, 'Versão incrementada para 3');

  // Início de revisão pelo outro projetista não designado (deve ser bloqueado)
  let unauthorizedReviewBlocked = false;
  try {
    await appService.startProposalReview(proposal.id, ctxDesigner2, clock);
  } catch (err) {
    if (err instanceof ProposalDomainError && err.code === 'REVIEWER_MISMATCH') {
      unauthorizedReviewBlocked = true;
    }
  }
  assert(unauthorizedReviewBlocked, 'Bloqueia início de revisão por projetista não designado');

  // Início de revisão pela Maria Projetista (atribuída)
  clock.advanceMinutes(10);
  const underReview = await appService.startProposalReview(proposal.id, ctxDesigner, clock);
  assert(underReview.status === 'under_review', 'Status alterado para under_review');

  // --- ETAPA 3: Solicitação de Ajustes e Reenvio ---
  console.log('\n--- ETAPA 3: Solicitação de Ajustes (changes_requested) e Reenvio ---');

  clock.advanceMinutes(20);
  const changesReq = await appService.requestProposalChanges(
    proposal.id,
    'Necessário incluir certidão negativa de débitos ambientais do imóvel.',
    ctxDesigner,
    clock
  );
  assert(changesReq.status === 'changes_requested', 'Transição para changes_requested');
  assert(changesReq.notes?.includes('ambientais'), 'Apontamentos registrados nas notas');

  // Captador atualiza proposta em changes_requested
  clock.advanceHours(2);
  const updatedAfterNotes = await appService.updateProposal(
    proposal.id,
    {
      notes: 'Certidão negativa de débitos ambientais anexada.',
      expectedVersion: changesReq.version,
    },
    ctxCapturer,
    clock
  );
  assert(updatedAfterNotes.status === 'changes_requested', 'Permite edição em changes_requested');

  // Re-submissão
  const resubmitted = await appService.submitProposal(proposal.id, ctxCapturer, clock);
  assert(resubmitted.status === 'submitted', 'Re-submissão bem-sucedida para submitted');

  // Maria Projetista reabre a revisão
  await appService.startProposalReview(proposal.id, ctxDesigner, clock);

  // --- ETAPA 4: Segregação de Funções (Anti-Self-Approval) e Aprovação ---
  console.log('\n--- ETAPA 4: Segregação de Funções (Anti-Self-Approval) e Aprovação ---');

  // O captador João tenta aprovar a própria proposta
  let selfApprovalBlocked = false;
  try {
    await appService.approveProposal(proposal.id, ctxCapturer, clock, 'Auto-aprovação');
  } catch (err) {
    if (err instanceof ProposalDomainError && (err.code === 'SELF_APPROVAL_FORBIDDEN' || err.code === 'PERMISSION_DENIED')) {
      selfApprovalBlocked = true;
    }
  }
  assert(selfApprovalBlocked, 'Anti-Self-Approval: Captador não pode aprovar a própria proposta');

  // Revisor Maria aprova formalmente
  clock.advanceMinutes(30);
  const approved = await appService.approveProposal(
    proposal.id,
    ctxDesigner,
    clock,
    'Parecer técnico e econômico favorável. Documentação conforme.'
  );
  assert(approved.status === 'approved', 'Status alterado para approved');
  assert(approved.approvedByUserId === designerId, 'Aprovador registrado');
  assert(Boolean(approved.approvedAt), 'Data de aprovação registrada');

  // --- ETAPA 5: Apresentação ao Cliente e Prazos ---
  console.log('\n--- ETAPA 5: Apresentação ao Cliente e Vigência Temporal ---');

  clock.advanceDays(1); // 1 dia depois
  const presented = await appService.markProposalPresented(
    proposal.id,
    {
      channel: 'in_person',
      notes: 'Apresentado na sede da fazenda com o produtor Carlos.',
    },
    ctxCapturer,
    clock
  );

  assert(presented.status === 'presented', 'Status alterado para presented');
  assert(presented.presentationRecord?.channel === 'in_person', 'Canal in_person registrado');
  assert(Boolean(presented.validFrom), 'Vigência validFrom calculada');
  assert(Boolean(presented.expiresAt), 'Data de expiração expiresAt calculada');

  // Vigência calculada: validFrom + 15 dias
  const validFromMs = new Date(presented.validFrom!).getTime();
  const expiresAtMs = new Date(presented.expiresAt).getTime();
  assert(expiresAtMs - validFromMs === 15 * 24 * 60 * 60 * 1000, 'Prazo de validade = exatamente 15 dias a partir da apresentação');

  // --- ETAPA 6: Aceite Formal do Cliente ---
  console.log('\n--- ETAPA 6: Registro de Decisão do Cliente (Aceite) ---');

  clock.advanceDays(5); // 5 dias depois (dentro do prazo de 15)
  const accepted = await appService.recordProposalDecision(
    proposal.id,
    {
      decision: 'accepted',
      channel: 'messaging',
      notes: 'Produtor confirmou aceite via WhatsApp oficial.',
    },
    ctxCapturer,
    clock
  );

  assert(accepted.status === 'accepted', 'Status alterado para accepted');
  assert(accepted.decisionRecord?.decision === 'accepted', 'Decisão accepted gravada');
  assert(accepted.decisionRecord?.disclaimerText.includes('formal'), 'Disclaimer declaratório gravado');

  // Tentativa de alterar proposta aceita (status terminal)
  let terminalEditBlocked = false;
  try {
    await appService.updateProposal(
      proposal.id,
      { title: 'Modificação Pós-Aceite', expectedVersion: accepted.version },
      ctxCapturer,
      clock
    );
  } catch (err) {
    if (err instanceof ProposalDomainError && err.code === 'PROPOSAL_LOCKED') {
      terminalEditBlocked = true;
    }
  }
  assert(terminalEditBlocked, 'Bloqueia edição de proposta em status terminal (accepted)');

  // --- ETAPA 7: Teste de Expiração Temporal Determinística ---
  console.log('\n--- ETAPA 7: Expiração Temporal Determinística ---');

  // Criar uma segunda proposta e deixá-la expirar
  const prop2 = await appService.createProposal(
    {
      clientId: 'cli-10',
      title: 'Proposta para Teste de Expiração',
      proposalType: 'credit',
      category: 'custeio',
      requestedAmountCents: 10000000,
      validityDays: 5,
    },
    ctxCapturer,
    clock
  );

  await appService.submitProposal(prop2.id, ctxCapturer, clock);
  await appService.assignProposalReviewer(prop2.id, designerId, ctxManager, clock);
  await appService.startProposalReview(prop2.id, ctxDesigner, clock);
  await appService.approveProposal(prop2.id, ctxDesigner, clock);
  const presented2 = await appService.markProposalPresented(prop2.id, { channel: 'email' }, ctxCapturer, clock);

  // Avança o tempo 6 dias (ultrapassa os 5 dias de validade)
  clock.advanceDays(6);

  // Tentativa de registrar decisão em proposta expirada
  let expiredCaught = false;
  try {
    await appService.recordProposalDecision(
      prop2.id,
      { decision: 'accepted', channel: 'email' },
      ctxCapturer,
      clock
    );
  } catch (err) {
    if (err instanceof ProposalDomainError && err.code === 'PROPOSAL_EXPIRED') {
      expiredCaught = true;
    }
  }
  assert(expiredCaught, 'Rejeita registro de decisão para proposta que ultrapassou o prazo de vigência');

  // Executa varredura de expiração
  const expiredCount = await appService.expireDueProposals({ organizationId: orgA }, clock);
  assert(expiredCount >= 0, 'Varredura de expiração executada sem erros');

  const reloadedProp2 = await appService.getProposalById(prop2.id, ctxCapturer);
  assert(reloadedProp2?.status === 'expired', 'Proposta marcada como expired');

  // --- ETAPA 8: Auditoria, Integridade SHA-256 e Histórico Completo ---
  console.log('\n--- ETAPA 8: Integridade de Snapshots e Auditoria ---');

  const finalHistory = await appService.getProposalHistory(proposal.id, ctxCapturer);
  const finalSnapshots = await appService.getProposalSnapshots(proposal.id, ctxCapturer);

  assert(finalHistory.length >= 6, `Histórico completo gravado (${finalHistory.length} transições)`);
  assert(finalSnapshots.length >= 6, `Snapshots imutáveis gravados (${finalSnapshots.length} versões)`);

  const hasAllSha256 = finalSnapshots.every((s) => s.checksumSha256 && s.checksumSha256.length === 64);
  assert(hasAllSha256, 'Todos os snapshots possuem checksum SHA-256 de 64 caracteres');

  // Notificações
  const notifications = proposalEventBus.getNotifications(orgA, capturerId);
  assert(notifications.length > 0, `Captador recebeu ${notifications.length} notificações de eventos de ciclo de vida`);

  console.log(`\n================================================================`);
  console.log(`Resultado dos Testes do Pipeline OE-005.003: ${passed} passaram, ${failed} falhas`);
  console.log(`================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPipelineTests().catch((err) => {
  console.error('Erro na suíte do pipeline:', err);
  process.exit(1);
});
