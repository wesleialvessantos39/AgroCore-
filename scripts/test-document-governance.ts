import assert from 'node:assert/strict';
import { executeDomainSessionCleanup } from '../src/auth/domainCleanupRegistry.ts';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import {
  DocumentApplicationService,
  evaluateDocumentValidity,
} from '../src/documents/documentApplicationService.ts';
import type { DocumentClock, DocumentIdGenerator } from '../src/documents/crypto.ts';
import { documentEventJournal } from '../src/documents/documentEventService.ts';
import { setDocumentReferenceGatewayForTesting } from '../src/documents/documentGatewayFactory.ts';
import { PreviewDocumentReferenceGateway } from '../src/documents/preview/previewDocumentReferenceGateway.ts';
import { UnavailableDocumentReferenceGateway } from '../src/documents/unavailableDocumentReferenceGateway.ts';
import { ROUTES } from '../src/routes/paths.ts';
import { findRouteDefinition } from '../src/routes/routeMatrix.ts';
import { getSafeRedirectUrl } from '../src/routes/safeNavigation.ts';
import type { OrganizationRole } from '../src/types/auth.ts';
import {
  DocumentDomainError,
  type CreateDocumentRequirementInput,
  type DocumentApplicationContext,
  type DocumentCategory,
  type DocumentLogicalOwnerType,
  type DocumentOwnerResolution,
  type RegisterDocumentReferenceInput,
} from '../src/types/documents.ts';

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

class FixedClock implements DocumentClock {
  constructor(private current = new Date('2026-09-15T12:00:00.000Z')) {}
  now(): Date { return new Date(this.current); }
  set(value: string): void { this.current = new Date(value); }
}

class SequentialIds implements DocumentIdGenerator {
  private sequence = 0;
  generate(): string {
    this.sequence += 1;
    return `governance-test-${String(this.sequence).padStart(4, '0')}`;
  }
}

const organizationA = 'organization-a';
const organizationB = 'organization-b';
const ownerDirectory = new Map<string, DocumentOwnerResolution>([
  ['client:client-a', { exists: true, organizationId: organizationA, authorizedUserIds: ['capturer-a'] }],
  ['client:client-b', { exists: true, organizationId: organizationB, authorizedUserIds: ['capturer-b'] }],
  ['property:property-a', { exists: true, organizationId: organizationA, authorizedUserIds: ['capturer-a', 'designer-a'] }],
  ['proposal:proposal-a', { exists: true, organizationId: organizationA, authorizedUserIds: ['capturer-a', 'designer-a'] }],
]);

function context(
  role: OrganizationRole,
  userId: string,
  organizationId = organizationA,
  overridePermissions?: readonly DocumentApplicationContext['actor']['permissions'][number][]
): DocumentApplicationContext {
  return {
    organizationId,
    actor: {
      userId,
      role,
      isActive: true,
      permissions: overridePermissions ?? getRolePermissions(role),
    },
    resolveOwner: async (type: DocumentLogicalOwnerType, id: string) =>
      ownerDirectory.get(`${type}:${id}`) ?? {
        exists: false,
        organizationId: null,
        authorizedUserIds: [],
      },
  };
}

function requirementInput(
  overrides: Partial<CreateDocumentRequirementInput> = {}
): CreateDocumentRequirementInput {
  return {
    logicalOwnerType: 'client',
    logicalOwnerId: 'client-a',
    category: 'registration_certificate',
    title: 'Certidão atualizada',
    accessScope: 'participants',
    dueOn: '2026-09-20',
    notes: 'Apresentar documento vigente.',
    idempotencyKey: 'requirement-create-0001',
    ...overrides,
  };
}

function documentInput(
  category: DocumentCategory,
  overrides: Partial<RegisterDocumentReferenceInput> = {}
): RegisterDocumentReferenceInput {
  return {
    logicalOwnerType: 'client',
    logicalOwnerId: 'client-a',
    category,
    displayName: `Documento ${category}`,
    mimeType: 'application/pdf',
    accessScope: 'participants',
    issuedOn: '2026-09-01',
    expiresOn: '2026-12-31',
    idempotencyKey: `document-${category}-0001`,
    ...overrides,
  };
}

function harness() {
  const gateway = new PreviewDocumentReferenceGateway();
  const clock = new FixedClock();
  const service = new DocumentApplicationService(gateway, clock, new SequentialIds());
  return { gateway, clock, service };
}

console.log('=============================================================');
console.log('Suíte comportamental OE-006.002 — Pendências e Validade');
console.log('=============================================================');

console.log('\n--- Contratos, permissões e validade determinística ---');

await test('Permissões de governança respeitam a matriz de papéis', () => {
  assert.equal(getRolePermissions('manager').includes('documents:manage_requirements'), true);
  assert.equal(getRolePermissions('capturer').includes('documents:fulfill_requirements'), true);
  assert.equal(getRolePermissions('project_designer').includes('documents:view_requirements'), true);
  assert.equal(getRolePermissions('finance').includes('documents:view_requirements'), false);
  assert.equal(getRolePermissions('platform_super_admin').includes('documents:view_requirements'), false);
});

await test('Documento pode ser registrado sem tamanho informado', async () => {
  const { service } = harness();
  const result = await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('registration_certificate')
  );
  assert.equal(result.fileSizeBytes, undefined);
});

await test('Validade sem vencimento permanece sem expiração', () => {
  assert.equal(evaluateDocumentValidity({}, new Date('2026-09-15T12:00:00Z')), 'no_expiration');
});

await test('Validade distingue vigente, próxima e vencida', () => {
  const now = new Date('2026-09-15T12:00:00Z');
  assert.equal(evaluateDocumentValidity({ expiresOn: '2027-01-01' }, now), 'current');
  assert.equal(evaluateDocumentValidity({ expiresOn: '2026-10-15' }, now), 'expiring_soon');
  assert.equal(evaluateDocumentValidity({ expiresOn: '2026-09-14' }, now), 'expired');
});

await test('Data final ainda é considerada válida durante o próprio dia', () => {
  assert.equal(
    evaluateDocumentValidity({ expiresOn: '2026-09-15' }, new Date('2026-09-15T23:59:59Z')),
    'expiring_soon'
  );
});

console.log('\n--- Criação, isolamento e idempotência de pendências ---');

await test('Gestor cria pendência com integridade e organização derivada', async () => {
  const { service } = harness();
  const result = await service.createRequirement(
    context('manager', 'manager-a'),
    requirementInput()
  );
  assert.equal(result.organizationId, organizationA);
  assert.equal(result.status, 'open');
  assert.equal(result.versionNumber, 1);
  assert.match(result.integrityCodeSha256, /^[a-f0-9]{64}$/);
});

await test('Captador não cria pendência', async () => {
  const { service } = harness();
  await expectCode('FORBIDDEN', () =>
    service.createRequirement(context('capturer', 'capturer-a'), requirementInput())
  );
});

await test('Permissão injetada não autoriza financeiro', async () => {
  const { service } = harness();
  await expectCode('FORBIDDEN', () =>
    service.createRequirement(
      context('finance', 'finance-a', organizationA, ['documents:manage_requirements']),
      requirementInput()
    )
  );
});

await test('Registro de outra organização é recusado', async () => {
  const { service } = harness();
  await expectCode('OWNER_ORGANIZATION_MISMATCH', () =>
    service.createRequirement(
      context('manager', 'manager-a'),
      requirementInput({ logicalOwnerId: 'client-b' })
    )
  );
});

await test('Prazo inválido é recusado', async () => {
  const { service } = harness();
  await expectCode('INVALID_INPUT', () =>
    service.createRequirement(context('manager', 'manager-a'), requirementInput({ dueOn: '2026-02-30' }))
  );
});

await test('Pendência aberta equivalente não é duplicada', async () => {
  const { service } = harness();
  await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  await expectCode('DUPLICATE_OPEN_REQUIREMENT', () =>
    service.createRequirement(
      context('manager', 'manager-a'),
      requirementInput({ idempotencyKey: 'requirement-duplicate-0002' })
    )
  );
});

await test('Replay idempotente retorna a mesma pendência', async () => {
  const { service } = harness();
  const first = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  const replay = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  assert.equal(replay.id, first.id);
  assert.equal(replay.createdAt, first.createdAt);
});

await test('Mesma chave com conteúdo divergente é recusada', async () => {
  const { service } = harness();
  await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  await expectCode('IDEMPOTENCY_CONFLICT', () =>
    service.createRequirement(
      context('manager', 'manager-a'),
      requirementInput({ title: 'Outro documento necessário' })
    )
  );
});

await test('Criação concorrente com a mesma chave converge para um registro', async () => {
  const { service } = harness();
  const results = await Promise.all([
    service.createRequirement(context('manager', 'manager-a'), requirementInput()),
    service.createRequirement(context('manager', 'manager-a'), requirementInput()),
  ]);
  assert.equal(results[0].id, results[1].id);
});

await test('Captador vê somente pendências dos próprios atendimentos', async () => {
  const { service } = harness();
  await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  await service.createRequirement(
    context('manager', 'manager-a'),
    requirementInput({
      logicalOwnerType: 'proposal',
      logicalOwnerId: 'proposal-a',
      category: 'commercial_support',
      title: 'Comprovação comercial',
      idempotencyKey: 'requirement-proposal-0002',
    })
  );
  assert.equal((await service.listRequirements(context('capturer', 'capturer-a'))).length, 2);
  assert.equal((await service.listRequirements(context('capturer', 'capturer-x'))).length, 0);
});

await test('Outra organização não descobre pendências por listagem', async () => {
  const { service } = harness();
  await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  assert.deepEqual(await service.listRequirements(context('manager', 'manager-b', organizationB)), []);
});

await test('Pendência restrita aos gestores não aparece ao captador', async () => {
  const { service } = harness();
  await service.createRequirement(
    context('manager', 'manager-a'),
    requirementInput({ accessScope: 'management' })
  );
  assert.deepEqual(await service.listRequirements(context('capturer', 'capturer-a')), []);
});

console.log('\n--- Atendimento, encerramento e concorrência ---');

await test('Documento compatível atende a pendência', async () => {
  const { service } = harness();
  const requirement = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  const document = await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('registration_certificate')
  );
  const result = await service.fulfillRequirement(context('capturer', 'capturer-a'), {
    requirementId: requirement.id,
    documentId: document.id,
    expectedVersion: 1,
    idempotencyKey: 'requirement-fulfill-0001',
  });
  assert.equal(result.status, 'fulfilled');
  assert.equal(result.linkedDocumentId, document.id);
  assert.equal(result.versionNumber, 2);
});

await test('Documento de categoria divergente não atende', async () => {
  const { service } = harness();
  const requirement = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  const document = await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('car_receipt')
  );
  await expectCode('REQUIREMENT_MISMATCH', () =>
    service.fulfillRequirement(context('capturer', 'capturer-a'), {
      requirementId: requirement.id,
      documentId: document.id,
      expectedVersion: 1,
      idempotencyKey: 'requirement-mismatch-0001',
    })
  );
});

await test('Documento de outro atendimento não atende', async () => {
  const { service } = harness();
  const requirement = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  const document = await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('registration_certificate', {
      logicalOwnerType: 'property',
      logicalOwnerId: 'property-a',
    })
  );
  await expectCode('REQUIREMENT_MISMATCH', () =>
    service.fulfillRequirement(context('manager', 'manager-a'), {
      requirementId: requirement.id,
      documentId: document.id,
      expectedVersion: 1,
      idempotencyKey: 'requirement-owner-mismatch',
    })
  );
});

await test('Documento vencido não atende', async () => {
  const { service } = harness();
  const requirement = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  const document = await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('registration_certificate', { expiresOn: '2026-09-14' })
  );
  await expectCode('DOCUMENT_EXPIRED', () =>
    service.fulfillRequirement(context('manager', 'manager-a'), {
      requirementId: requirement.id,
      documentId: document.id,
      expectedVersion: 1,
      idempotencyKey: 'requirement-expired-document',
    })
  );
});

await test('Usuário não relacionado não atende por ID arbitrário', async () => {
  const { service } = harness();
  const requirement = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  const document = await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('registration_certificate')
  );
  await expectCode('FORBIDDEN', () =>
    service.fulfillRequirement(context('capturer', 'capturer-x'), {
      requirementId: requirement.id,
      documentId: document.id,
      expectedVersion: 1,
      idempotencyKey: 'requirement-idor-user',
    })
  );
});

await test('Versão obsoleta é recusada', async () => {
  const { service } = harness();
  const requirement = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  const document = await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('registration_certificate')
  );
  await expectCode('VERSION_CONFLICT', () =>
    service.fulfillRequirement(context('manager', 'manager-a'), {
      requirementId: requirement.id,
      documentId: document.id,
      expectedVersion: 9,
      idempotencyKey: 'requirement-stale-version',
    })
  );
});

await test('Replay do atendimento não cria nova versão', async () => {
  const { service, clock } = harness();
  const requirement = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  const document = await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('registration_certificate')
  );
  const command = {
    requirementId: requirement.id,
    documentId: document.id,
    expectedVersion: 1,
    idempotencyKey: 'requirement-fulfill-replay',
  };
  const first = await service.fulfillRequirement(context('manager', 'manager-a'), command);
  clock.set('2027-01-02T12:00:00.000Z');
  const replay = await service.fulfillRequirement(context('manager', 'manager-a'), command);
  assert.equal(replay.id, first.id);
  assert.equal(replay.versionNumber, 2);
});

await test('Atendimentos concorrentes incompatíveis têm um único vencedor', async () => {
  const { service } = harness();
  const requirement = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  const firstDocument = await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('registration_certificate', { displayName: 'Certidão primeira' })
  );
  const secondDocument = await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('registration_certificate', {
      displayName: 'Certidão segunda',
      idempotencyKey: 'document-registration-second',
    })
  );
  const results = await Promise.allSettled([
    service.fulfillRequirement(context('manager', 'manager-a'), {
      requirementId: requirement.id,
      documentId: firstDocument.id,
      expectedVersion: 1,
      idempotencyKey: 'fulfill-concurrent-first',
    }),
    service.fulfillRequirement(context('manager', 'manager-a'), {
      requirementId: requirement.id,
      documentId: secondDocument.id,
      expectedVersion: 1,
      idempotencyKey: 'fulfill-concurrent-second',
    }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
});

await test('Dispensa exige motivo e preserva encerramento', async () => {
  const { service } = harness();
  const requirement = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  await expectCode('INVALID_INPUT', () =>
    service.waiveRequirement(context('manager', 'manager-a'), {
      requirementId: requirement.id,
      expectedVersion: 1,
      reason: ' ',
      idempotencyKey: 'requirement-waive-invalid',
    })
  );
  const result = await service.waiveRequirement(context('manager', 'manager-a'), {
    requirementId: requirement.id,
    expectedVersion: 1,
    reason: 'Dispensada por decisão administrativa',
    idempotencyKey: 'requirement-waive-valid',
  });
  assert.equal(result.status, 'waived');
  assert.equal(result.resolutionReason, 'Dispensada por decisão administrativa');
});

await test('Cancelamento encerra pendência e impede segunda decisão', async () => {
  const { service } = harness();
  const requirement = await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  const cancelled = await service.cancelRequirement(context('manager', 'manager-a'), {
    requirementId: requirement.id,
    expectedVersion: 1,
    reason: 'Atendimento encerrado antes da entrega',
    idempotencyKey: 'requirement-cancel-valid',
  });
  assert.equal(cancelled.status, 'cancelled');
  await expectCode('REQUIREMENT_ALREADY_RESOLVED', () =>
    service.waiveRequirement(context('manager', 'manager-a'), {
      requirementId: requirement.id,
      expectedVersion: 2,
      reason: 'Nova decisão indevida',
      idempotencyKey: 'requirement-second-resolution',
    })
  );
});

console.log('\n--- Painel, eventos, rotas e limpeza ---');

await test('Painel calcula prazo vencido e documento próximo do vencimento', async () => {
  const { service } = harness();
  await service.createRequirement(
    context('manager', 'manager-a'),
    requirementInput({ dueOn: '2026-09-14' })
  );
  const secondRequirement = await service.createRequirement(
    context('manager', 'manager-a'),
    requirementInput({
      logicalOwnerType: 'property',
      logicalOwnerId: 'property-a',
      category: 'topography_map',
      title: 'Planta atualizada',
      idempotencyKey: 'requirement-dashboard-second',
    })
  );
  const document = await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('topography_map', {
      logicalOwnerType: 'property',
      logicalOwnerId: 'property-a',
      expiresOn: '2026-10-01',
    })
  );
  await service.fulfillRequirement(context('manager', 'manager-a'), {
    requirementId: secondRequirement.id,
    documentId: document.id,
    expectedVersion: 1,
    idempotencyKey: 'requirement-dashboard-fulfill',
  });
  const dashboard = await service.getGovernanceDashboard(context('manager', 'manager-a'));
  assert.equal(dashboard.totals.overdue, 1);
  assert.equal(dashboard.totals.attentionRequired, 2);
  assert.equal(dashboard.expiringDocuments.some((item) => item.id === document.id), true);
  assert.equal(dashboard.requirements.some((item) => item.effectiveState === 'document_expiring'), true);
});

await test('Eventos não expõem título, orientação ou motivo', async () => {
  documentEventJournal.clearAllSessionData();
  const { service } = harness();
  const requirement = await service.createRequirement(
    context('manager', 'manager-a'),
    requirementInput({ notes: 'Orientação comercial reservada' })
  );
  await service.waiveRequirement(context('manager', 'manager-a'), {
    requirementId: requirement.id,
    expectedVersion: 1,
    reason: 'Motivo administrativo reservado',
    idempotencyKey: 'requirement-event-waive',
  });
  const serialized = JSON.stringify(documentEventJournal.list(organizationA)).toLowerCase();
  for (const forbidden of [
    'certidão atualizada',
    'orientação comercial reservada',
    'motivo administrativo reservado',
    'cpf',
    'cnpj',
    'telefone',
    'https://',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

await test('Rotas de pendências exigem permissões específicas', () => {
  assert.equal(
    findRouteDefinition(ROUTES.DOCUMENT_REQUIREMENTS)?.requiredPermissions,
    'documents:view_requirements'
  );
  assert.equal(
    findRouteDefinition(ROUTES.DOCUMENT_REQUIREMENTS_NEW)?.requiredPermissions,
    'documents:manage_requirements'
  );
  assert.equal(getSafeRedirectUrl('/documentos/pendencias'), '/documentos/pendencias');
  assert.equal(getSafeRedirectUrl('//evil.test/documentos/pendencias'), ROUTES.SYSTEM);
});

await test('Gateway indisponível nega governança por padrão', async () => {
  const gateway = new UnavailableDocumentReferenceGateway();
  await expectCode('SERVICE_UNAVAILABLE', () =>
    gateway.listRequirements({ organizationId: organizationA })
  );
  await expectCode('SERVICE_UNAVAILABLE', () =>
    gateway.getRequirementById(organizationA, 'requirement-id')
  );
});

await test('Logout limpa documentos, pendências, operações e eventos', async () => {
  documentEventJournal.clearAllSessionData();
  const { gateway, service } = harness();
  setDocumentReferenceGatewayForTesting(gateway);
  await service.createRequirement(context('manager', 'manager-a'), requirementInput());
  await service.registerReference(
    context('manager', 'manager-a'),
    documentInput('registration_certificate')
  );
  assert.equal((await gateway.listRequirements({ organizationId: organizationA })).length, 1);
  assert.equal((await gateway.listReferences({ organizationId: organizationA })).length, 1);
  assert.ok(documentEventJournal.list(organizationA).length > 0);
  await executeDomainSessionCleanup();
  assert.equal((await gateway.listRequirements({ organizationId: organizationA })).length, 0);
  assert.equal((await gateway.listReferences({ organizationId: organizationA })).length, 0);
  assert.equal(documentEventJournal.list(organizationA).length, 0);
  setDocumentReferenceGatewayForTesting(null);
});

console.log('\n=============================================================');
console.log(`Resultado OE-006.002: ${passed} passaram, ${failed} falharam`);
console.log('=============================================================');

if (failed > 0) process.exit(1);
