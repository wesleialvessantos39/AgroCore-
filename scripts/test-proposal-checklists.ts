import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import type { DocumentClock, DocumentIdGenerator } from '../src/documents/crypto.ts';
import { DocumentApplicationService } from '../src/documents/documentApplicationService.ts';
import { PreviewDocumentReferenceGateway } from '../src/documents/preview/previewDocumentReferenceGateway.ts';
import { PreviewProposalChecklistGateway } from '../src/documents/preview/previewProposalChecklistGateway.ts';
import { ProposalChecklistApplicationService } from '../src/documents/proposalChecklistApplicationService.ts';
import type { OrganizationRole } from '../src/types/auth.ts';
import {
  DocumentDomainError,
  type DocumentApplicationContext,
  type DocumentLogicalOwnerType,
  type DocumentOwnerResolution,
} from '../src/types/documents.ts';
import type {
  ProposalChecklistApplicationContext,
  ProposalChecklistSourceResolution,
} from '../src/types/proposalChecklists.ts';

let passed = 0;
let failed = 0;

async function test(name: string, operation: () => void | Promise<void>) {
  try {
    await operation();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  [FAIL] ${name}`);
    console.error(error);
  }
}

async function expectCode(code: string, operation: () => Promise<unknown>): Promise<void> {
  await assert.rejects(operation, (error: unknown) =>
    error instanceof DocumentDomainError && error.code === code
  );
}

class MutableClock implements DocumentClock {
  constructor(private current = new Date('2026-09-15T12:00:00.000Z')) {}
  now(): Date { return new Date(this.current); }
  set(value: string): void { this.current = new Date(value); }
}

class SequentialIds implements DocumentIdGenerator {
  private sequence = 0;
  generate(): string {
    this.sequence += 1;
    return `checklist-test-${String(this.sequence).padStart(4, '0')}`;
  }
}

const organizationA = 'organization-a';
const organizationB = 'organization-b';

const proposals = new Map<string, ProposalChecklistSourceResolution>([
  ['proposal-a', {
    exists: true,
    organizationId: organizationA,
    proposalId: 'proposal-a',
    proposalNumber: 'PROP-2026-001',
    title: 'Custeio de safra',
    proposalType: 'credit',
    proposalCategory: 'custeio',
    authorizedUserIds: ['capturer-a', 'designer-a'],
  }],
  ['proposal-technical', {
    exists: true,
    organizationId: organizationA,
    proposalId: 'proposal-technical',
    proposalNumber: 'PROP-2026-002',
    title: 'Projeto técnico rural',
    proposalType: 'technical_project',
    proposalCategory: 'servico_tecnico',
    authorizedUserIds: ['designer-a'],
  }],
  ['proposal-b', {
    exists: true,
    organizationId: organizationB,
    proposalId: 'proposal-b',
    proposalNumber: 'PROP-2026-101',
    title: 'Proposta de outra organização',
    proposalType: 'credit',
    proposalCategory: 'custeio',
    authorizedUserIds: ['capturer-b'],
  }],
]);

function checklistContext(
  role: OrganizationRole,
  userId: string,
  organizationId = organizationA
): ProposalChecklistApplicationContext {
  return {
    organizationId,
    actor: {
      userId,
      displayName: role === 'manager' ? 'Gerência documental' : 'Integrante responsável',
      role,
      isActive: true,
      permissions: getRolePermissions(role),
    },
    resolveProposalChecklistSource: async (proposalId: string) =>
      proposals.get(proposalId) ?? {
        exists: false,
        organizationId: null,
        proposalId,
        authorizedUserIds: [],
      },
  };
}

function documentContext(
  role: OrganizationRole,
  userId: string,
  organizationId = organizationA
): DocumentApplicationContext {
  return {
    organizationId,
    actor: {
      userId,
      displayName: role === 'manager' ? 'Gerência documental' : 'Integrante responsável',
      role,
      isActive: true,
      permissions: getRolePermissions(role),
    },
    resolveOwner: async (type: DocumentLogicalOwnerType, id: string): Promise<DocumentOwnerResolution> => {
      if (type !== 'proposal') return { exists: false, organizationId: null, authorizedUserIds: [] };
      const proposal = proposals.get(id);
      return proposal
        ? {
            exists: true,
            organizationId: proposal.organizationId,
            authorizedUserIds: proposal.authorizedUserIds,
          }
        : { exists: false, organizationId: null, authorizedUserIds: [] };
    },
  };
}

function harness() {
  const checklistGateway = new PreviewProposalChecklistGateway();
  const documentGateway = new PreviewDocumentReferenceGateway();
  const clock = new MutableClock();
  const ids = new SequentialIds();
  return {
    checklistGateway,
    documentGateway,
    clock,
    documents: new DocumentApplicationService(documentGateway, clock, ids),
    checklists: new ProposalChecklistApplicationService(
      checklistGateway,
      documentGateway,
      clock,
      ids
    ),
  };
}

function templateInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Crédito de custeio',
    proposalType: 'credit',
    proposalCategory: 'custeio',
    changeReason: 'Configuração inicial da linha de crédito.',
    items: [{
      title: 'Certidão registral vigente',
      category: 'registration_certificate',
      accessScope: 'participants',
      required: true,
      dueInDays: 5,
    }],
    idempotencyKey: 'template-create-0001',
    ...overrides,
  };
}

async function configuredHarness() {
  const result = harness();
  const template = await result.checklists.configureTemplate(
    checklistContext('manager', 'manager-a'),
    templateInput()
  );
  const checklist = await result.checklists.applyChecklist(
    checklistContext('manager', 'manager-a'),
    {
      proposalId: 'proposal-a',
      templateVersionId: template.id,
      idempotencyKey: 'checklist-apply-0001',
    }
  );
  return { ...result, template, checklist };
}

async function registerProposalDocument(
  documents: DocumentApplicationService,
  overrides: Record<string, unknown> = {}
) {
  return documents.registerReference(documentContext('manager', 'manager-a'), {
    logicalOwnerType: 'proposal',
    logicalOwnerId: 'proposal-a',
    category: 'registration_certificate',
    displayName: 'Certidão registral da proposta',
    mimeType: 'application/pdf',
    accessScope: 'participants',
    issuedOn: '2026-09-01',
    expiresOn: '2026-12-31',
    idempotencyKey: `document-register-${String(overrides.idempotencySuffix ?? '0001')}`,
    ...overrides,
  });
}

console.log('=============================================================');
console.log('Suíte comportamental OE-006.005 — Checklists de Propostas');
console.log('=============================================================');

await test('Matriz separa configuração, atendimento e decisão documental', () => {
  assert.equal(getRolePermissions('manager').includes('documents:manage_requirements'), true);
  assert.equal(getRolePermissions('capturer').includes('documents:fulfill_requirements'), true);
  assert.equal(getRolePermissions('capturer').includes('documents:review_requirements'), false);
  assert.equal(getRolePermissions('project_designer').includes('documents:review_requirements'), true);
  assert.equal(getRolePermissions('finance').includes('documents:view_requirements'), false);
});

await test('Gestão cria nova versão do modelo sem apagar a anterior', async () => {
  const { checklists } = harness();
  const first = await checklists.configureTemplate(
    checklistContext('manager', 'manager-a'),
    templateInput()
  );
  const second = await checklists.configureTemplate(
    checklistContext('manager', 'manager-a'),
    templateInput({
      changeReason: 'Inclusão do comprovante técnico.',
      items: [
        ...first.items.map(({ id: _id, position: _position, ...item }) => item),
        {
          title: 'Laudo técnico da operação',
          category: 'technical_report',
          accessScope: 'participants',
          required: false,
          dueInDays: 10,
        },
      ],
      previousTemplateVersionId: first.id,
      expectedVersion: 1,
      idempotencyKey: 'template-update-0001',
    })
  );
  const history = await checklists.listTemplateHistory(
    checklistContext('manager', 'manager-a'),
    first.logicalTemplateId
  );
  assert.equal(second.versionNumber, 2);
  assert.equal(second.predecessorTemplateVersionId, first.id);
  assert.deepEqual(history.map((version) => version.versionNumber), [2, 1]);
  assert.equal(history.filter((version) => version.isCurrent).length, 1);
  assert.equal(history[1].items.length, 1);
});

await test('Integrante operacional não configura nem aplica modelos', async () => {
  const { checklists } = harness();
  await expectCode('FORBIDDEN', () =>
    checklists.configureTemplate(checklistContext('capturer', 'capturer-a'), templateInput())
  );
});

await test('Modelo incompatível com tipo ou linha da proposta é recusado', async () => {
  const { checklists } = harness();
  const template = await checklists.configureTemplate(
    checklistContext('manager', 'manager-a'),
    templateInput()
  );
  await expectCode('CHECKLIST_TEMPLATE_MISMATCH', () =>
    checklists.applyChecklist(checklistContext('manager', 'manager-a'), {
      proposalId: 'proposal-technical',
      templateVersionId: template.id,
      idempotencyKey: 'checklist-mismatch-0001',
    })
  );
});

await test('Aplicação cria snapshot rastreável e replay idempotente', async () => {
  const { checklists, template, checklist } = await configuredHarness();
  const replay = await checklists.applyChecklist(
    checklistContext('manager', 'manager-a'),
    {
      proposalId: 'proposal-a',
      templateVersionId: template.id,
      idempotencyKey: 'checklist-apply-0001',
    }
  );
  assert.equal(replay.id, checklist.id);
  assert.equal(checklist.templateVersionNumber, 1);
  assert.equal(checklist.items[0].state, 'pending');
  assert.equal(checklist.history[0].toState, 'pending');
  assert.equal(checklist.proposalNumber, 'PROP-2026-001');
});

await test('Uma proposta não recebe dois checklists por comandos distintos', async () => {
  const { checklists, template } = await configuredHarness();
  await expectCode('CHECKLIST_ALREADY_EXISTS', () =>
    checklists.applyChecklist(checklistContext('manager', 'manager-a'), {
      proposalId: 'proposal-a',
      templateVersionId: template.id,
      idempotencyKey: 'checklist-apply-0002',
    })
  );
});

await test('Recebimento exige documento atual da proposta e categoria corretas', async () => {
  const { checklists, documents, checklist } = await configuredHarness();
  const wrong = await registerProposalDocument(documents, {
    category: 'technical_report',
    displayName: 'Laudo de categoria divergente',
    idempotencySuffix: 'wrong-category',
  });
  await expectCode('CHECKLIST_DOCUMENT_MISMATCH', () =>
    checklists.transitionItem(checklistContext('capturer', 'capturer-a'), {
      checklistId: checklist.id,
      itemId: checklist.items[0].id,
      expectedVersion: 1,
      targetState: 'received',
      documentId: wrong.id,
      idempotencyKey: 'transition-wrong-doc-0001',
    })
  );
});

await test('Documento vencido não pode ser recebido como atendimento', async () => {
  const { checklists, documents, checklist } = await configuredHarness();
  const expired = await registerProposalDocument(documents, {
    expiresOn: '2026-09-14',
    idempotencySuffix: 'expired',
  });
  await expectCode('DOCUMENT_EXPIRED', () =>
    checklists.transitionItem(checklistContext('capturer', 'capturer-a'), {
      checklistId: checklist.id,
      itemId: checklist.items[0].id,
      expectedVersion: 1,
      targetState: 'received',
      documentId: expired.id,
      idempotencyKey: 'transition-expired-doc-0001',
    })
  );
});

await test('Participante recebe documento, mas captador não profere decisão', async () => {
  const { checklists, documents, checklist } = await configuredHarness();
  const document = await registerProposalDocument(documents);
  const received = await checklists.transitionItem(checklistContext('capturer', 'capturer-a'), {
    checklistId: checklist.id,
    itemId: checklist.items[0].id,
    expectedVersion: 1,
    targetState: 'received',
    documentId: document.id,
    idempotencyKey: 'transition-received-0001',
  });
  assert.equal(received.items[0].state, 'received');
  await expectCode('FORBIDDEN', () =>
    checklists.transitionItem(checklistContext('capturer', 'capturer-a'), {
      checklistId: checklist.id,
      itemId: checklist.items[0].id,
      expectedVersion: 2,
      targetState: 'in_review',
      idempotencyKey: 'transition-review-forbidden-0001',
    })
  );
});

await test('Requisito de gestão e seu histórico não vazam para participantes', async () => {
  const { checklists, documents } = harness();
  const template = await checklists.configureTemplate(
    checklistContext('manager', 'manager-a'),
    templateInput({
      items: [
        {
          title: 'Certidão para participantes',
          category: 'registration_certificate',
          accessScope: 'participants',
          required: true,
        },
        {
          title: 'Parecer reservado da gestão',
          category: 'technical_report',
          accessScope: 'management',
          required: false,
        },
      ],
      idempotencyKey: 'template-scoped-0001',
    })
  );
  const checklist = await checklists.applyChecklist(
    checklistContext('manager', 'manager-a'),
    {
      proposalId: 'proposal-a',
      templateVersionId: template.id,
      idempotencyKey: 'checklist-scoped-0001',
    }
  );
  const participantDashboard = await checklists.getDashboard(
    checklistContext('project_designer', 'designer-a')
  );
  assert.deepEqual(
    participantDashboard.checklists[0].items.map((item) => item.title),
    ['Certidão para participantes']
  );
  assert.equal(participantDashboard.checklists[0].history.length, 1);
  const managementItem = checklist.items.find((item) => item.accessScope === 'management')!;
  const document = await registerProposalDocument(documents, {
    category: 'technical_report',
    displayName: 'Parecer técnico reservado',
    idempotencySuffix: 'management-scope',
  });
  await expectCode('FORBIDDEN', () =>
    checklists.transitionItem(checklistContext('project_designer', 'designer-a'), {
      checklistId: checklist.id,
      itemId: managementItem.id,
      expectedVersion: 1,
      targetState: 'received',
      documentId: document.id,
      idempotencyKey: 'transition-management-scope',
    })
  );
});

await test('Fluxo completo registra análise, aprovação, ator e horário do servidor', async () => {
  const { checklists, documents, checklist } = await configuredHarness();
  const document = await registerProposalDocument(documents);
  const received = await checklists.transitionItem(checklistContext('capturer', 'capturer-a'), {
    checklistId: checklist.id,
    itemId: checklist.items[0].id,
    expectedVersion: 1,
    targetState: 'received',
    documentId: document.id,
    idempotencyKey: 'transition-full-received',
  });
  const review = await checklists.transitionItem(checklistContext('project_designer', 'designer-a'), {
    checklistId: checklist.id,
    itemId: received.items[0].id,
    expectedVersion: 2,
    targetState: 'in_review',
    idempotencyKey: 'transition-full-review',
  });
  const approved = await checklists.transitionItem(checklistContext('project_designer', 'designer-a'), {
    checklistId: checklist.id,
    itemId: review.items[0].id,
    expectedVersion: 3,
    targetState: 'approved',
    reason: 'Documento conferido e válido.',
    idempotencyKey: 'transition-full-approved',
  });
  assert.equal(approved.status, 'completed');
  assert.equal(approved.items[0].decidedByUserId, 'designer-a');
  assert.equal(approved.items[0].decidedAt, '2026-09-15T12:00:00.000Z');
  assert.deepEqual(approved.history.map((entry) => entry.toState), [
    'pending', 'received', 'in_review', 'approved',
  ]);
  assert.equal(approved.history.at(-1)?.actorUserId, 'designer-a');
});

await test('Recusa exige motivo e reenvio reinicia os dados de análise', async () => {
  const { checklists, documents, checklist } = await configuredHarness();
  const document = await registerProposalDocument(documents);
  const received = await checklists.transitionItem(checklistContext('capturer', 'capturer-a'), {
    checklistId: checklist.id,
    itemId: checklist.items[0].id,
    expectedVersion: 1,
    targetState: 'received',
    documentId: document.id,
    idempotencyKey: 'transition-reject-received',
  });
  const review = await checklists.transitionItem(checklistContext('manager', 'manager-a'), {
    checklistId: checklist.id,
    itemId: received.items[0].id,
    expectedVersion: 2,
    targetState: 'in_review',
    idempotencyKey: 'transition-reject-review',
  });
  await expectCode('INVALID_INPUT', () =>
    checklists.transitionItem(checklistContext('manager', 'manager-a'), {
      checklistId: checklist.id,
      itemId: review.items[0].id,
      expectedVersion: 3,
      targetState: 'rejected',
      idempotencyKey: 'transition-reject-no-reason',
    })
  );
  const rejected = await checklists.transitionItem(checklistContext('manager', 'manager-a'), {
    checklistId: checklist.id,
    itemId: review.items[0].id,
    expectedVersion: 3,
    targetState: 'rejected',
    reason: 'Certidão sem todas as páginas.',
    idempotencyKey: 'transition-reject-decision',
  });
  const resubmitted = await checklists.transitionItem(checklistContext('capturer', 'capturer-a'), {
    checklistId: checklist.id,
    itemId: rejected.items[0].id,
    expectedVersion: 4,
    targetState: 'received',
    documentId: document.id,
    idempotencyKey: 'transition-reject-resubmit',
  });
  assert.equal(resubmitted.items[0].reviewedAt, undefined);
  assert.equal(resubmitted.items[0].decidedAt, undefined);
  assert.equal(resubmitted.items[0].decisionReason, undefined);
});

await test('Expiração só é aceita depois da validade real do documento', async () => {
  const { checklists, documents, checklist, clock } = await configuredHarness();
  const document = await registerProposalDocument(documents, {
    expiresOn: '2026-09-20',
    idempotencySuffix: 'validity',
  });
  const received = await checklists.transitionItem(checklistContext('capturer', 'capturer-a'), {
    checklistId: checklist.id,
    itemId: checklist.items[0].id,
    expectedVersion: 1,
    targetState: 'received',
    documentId: document.id,
    idempotencyKey: 'transition-validity-received',
  });
  await expectCode('CHECKLIST_TRANSITION_INVALID', () =>
    checklists.transitionItem(checklistContext('manager', 'manager-a'), {
      checklistId: checklist.id,
      itemId: received.items[0].id,
      expectedVersion: 2,
      targetState: 'expired',
      idempotencyKey: 'transition-validity-too-early',
    })
  );
  clock.set('2026-09-21T00:00:00.000Z');
  const expired = await checklists.transitionItem(checklistContext('manager', 'manager-a'), {
    checklistId: checklist.id,
    itemId: received.items[0].id,
    expectedVersion: 2,
    targetState: 'expired',
    idempotencyKey: 'transition-validity-expired',
  });
  assert.equal(expired.items[0].state, 'expired');
  assert.equal(expired.items[0].decisionReason, 'Validade documental encerrada.');
});

await test('Decisões concorrentes preservam uma única versão vencedora', async () => {
  const { checklists, documents, checklist } = await configuredHarness();
  const document = await registerProposalDocument(documents);
  const received = await checklists.transitionItem(checklistContext('capturer', 'capturer-a'), {
    checklistId: checklist.id,
    itemId: checklist.items[0].id,
    expectedVersion: 1,
    targetState: 'received',
    documentId: document.id,
    idempotencyKey: 'transition-race-received',
  });
  const review = await checklists.transitionItem(checklistContext('manager', 'manager-a'), {
    checklistId: checklist.id,
    itemId: received.items[0].id,
    expectedVersion: 2,
    targetState: 'in_review',
    idempotencyKey: 'transition-race-review',
  });
  const results = await Promise.allSettled([
    checklists.transitionItem(checklistContext('manager', 'manager-a'), {
      checklistId: checklist.id,
      itemId: review.items[0].id,
      expectedVersion: 3,
      targetState: 'approved',
      reason: 'Aprovado na primeira decisão.',
      idempotencyKey: 'transition-race-approved',
    }),
    checklists.transitionItem(checklistContext('manager', 'manager-a'), {
      checklistId: checklist.id,
      itemId: review.items[0].id,
      expectedVersion: 3,
      targetState: 'rejected',
      reason: 'Recusado na decisão concorrente.',
      idempotencyKey: 'transition-race-rejected',
    }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  const current = (await checklists.getDashboard(
    checklistContext('manager', 'manager-a')
  )).checklists[0].items[0];
  assert.equal(current.versionNumber, 4);
  assert.equal(['approved', 'rejected'].includes(current.state), true);
});

await test('Visão geral e agenda são projeções de checklists reais e isolados', async () => {
  const { checklists, clock } = await configuredHarness();
  clock.set('2026-09-21T12:00:00.000Z');
  const dashboard = await checklists.getDashboard(checklistContext('manager', 'manager-a'));
  assert.equal(dashboard.totals.proposalsWithChecklist, 1);
  assert.equal(dashboard.totals.pending, 1);
  assert.equal(dashboard.totals.overdue, 1);
  assert.equal(dashboard.agendaEntries.length, 1);
  assert.equal(dashboard.agendaEntries[0].proposalId, 'proposal-a');
  const participantDashboard = await checklists.getDashboard(
    checklistContext('capturer', 'capturer-a')
  );
  assert.equal(participantDashboard.checklists.length, 1);
  assert.equal(participantDashboard.templates.length, 0);
  const otherOrganization = await checklists.getDashboard(
    checklistContext('manager', 'manager-b', organizationB)
  );
  assert.equal(otherOrganization.totals.proposalsWithChecklist, 0);
});

await test('Rotas estáticas de pendências e checklists precedem o detalhe dinâmico', () => {
  const routes = readFileSync('src/routes/AppRoutes.tsx', 'utf8');
  const documentsSection = routes.slice(
    routes.indexOf("path={ROUTES.DOCUMENTS}"),
    routes.indexOf("path={ROUTES.SURVEYS_AND_VISITS}")
  );
  const clientsSection = routes.slice(
    routes.indexOf("path={ROUTES.CLIENTS}"),
    routes.indexOf("path={ROUTES.PROPERTIES}")
  );
  assert.equal(clientsSection.includes('DocumentGovernancePage'), false);
  assert.ok(documentsSection.indexOf('path="pendencias"') >= 0);
  assert.ok(documentsSection.indexOf('path="checklists"') >= 0);
  assert.ok(documentsSection.indexOf('path="pendencias"') < documentsSection.indexOf('path=":documentId"'));
  assert.ok(documentsSection.indexOf('path="checklists"') < documentsSection.indexOf('path=":documentId"'));
});

await test('Migração aplica RLS, menor privilégio, histórico imutável e locks curtos', () => {
  const sql = readFileSync(
    'supabase/migrations/20260901170544_oe_006_005_proposal_checklists.sql',
    'utf8'
  );
  for (const table of [
    'proposal_checklist_template_versions',
    'proposal_checklist_template_items',
    'proposal_document_checklists',
    'proposal_document_checklist_items',
    'proposal_document_checklist_history',
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(
      sql,
      new RegExp(
        `revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public,\\s*anon,\\s*authenticated`,
        'i'
      )
    );
  }
  assert.match(sql, /unique \(organization_id, proposal_id\)/i);
  assert.match(sql, /proposal_document_checklist_items_attention_idx[\s\S]+where state in/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /security definer[\s\S]+set search_path = ''/i);
  assert.match(sql, /access_scope <> 'management'/i);
  assert.match(sql, /at time zone 'UTC'/i);
  assert.match(sql, /revoke all on table public\.proposal_document_checklist_history/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete)[\s\S]+proposal_document_checklist_history/i);
  assert.doesNotMatch(sql, /service_role/i);
  const viteConfig = readFileSync('vite.config.ts', 'utf8');
  assert.match(viteConfig, /production-proposal-checklists-gateway-factory/);
  assert.match(viteConfig, /UnavailableProposalChecklistGateway/);
});

await test('Hardening da OE-006.004 oculta caminhos de organizações sem vínculo', () => {
  const sql = readFileSync(
    'supabase/migrations/20260901115546_oe_006_004_document_versions.sql',
    'utf8'
  );
  const helper = sql.slice(
    sql.indexOf('create or replace function agrocore_private.document_storage_object_is_registered'),
    sql.indexOf('-- A leitura exige uma versão autorizada')
  );
  assert.match(helper, /auth\.uid\(\)/i);
  assert.match(helper, /document_member_role\(v_organization_id\) is null/i);
  assert.match(helper, /version\.organization_id = v_organization_id/i);
});

console.log('\n-------------------------------------------------------------');
console.log(`Resultado OE-006.005: ${passed} prova(s) aprovada(s), ${failed} falha(s).`);
if (failed > 0) process.exit(1);
