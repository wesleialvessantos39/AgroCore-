import assert from 'node:assert/strict';
import { executeDomainSessionCleanup } from '../src/auth/domainCleanupRegistry.ts';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import { DocumentApplicationService } from '../src/documents/documentApplicationService.ts';
import { documentEventJournal } from '../src/documents/documentEventService.ts';
import { PreviewDocumentReferenceGateway } from '../src/documents/preview/previewDocumentReferenceGateway.ts';
import { UnavailableDocumentReferenceGateway } from '../src/documents/unavailableDocumentReferenceGateway.ts';
import { setDocumentReferenceGatewayForTesting } from '../src/documents/documentGatewayFactory.ts';
import type { DocumentClock, DocumentIdGenerator } from '../src/documents/crypto.ts';
import {
  DocumentDomainError,
  type DocumentApplicationContext,
  type DocumentLogicalOwnerType,
  type DocumentOwnerResolution,
  type RegisterDocumentReferenceInput,
} from '../src/types/documents.ts';
import type { OrganizationRole } from '../src/types/auth.ts';
import { ROUTES, getDocumentReferencePath } from '../src/routes/paths.ts';
import { findRouteDefinition } from '../src/routes/routeMatrix.ts';
import { getSafeRedirectUrl } from '../src/routes/safeNavigation.ts';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  [FAIL] ${name}`);
    console.error(error);
  }
}

async function expectCode(
  code: string,
  operation: () => Promise<unknown>
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    return error instanceof DocumentDomainError && error.code === code;
  });
}

class FixedClock implements DocumentClock {
  constructor(private current = new Date('2026-09-01T12:00:00.000Z')) {}
  now(): Date { return new Date(this.current); }
  advance(minutes: number): void { this.current = new Date(this.current.getTime() + minutes * 60_000); }
}

class SequentialIds implements DocumentIdGenerator {
  private sequence = 0;
  generate(): string {
    this.sequence += 1;
    return `doc-test-${String(this.sequence).padStart(4, '0')}`;
  }
}

const organizationA = 'organization-a';
const organizationB = 'organization-b';
const ownerDirectory = new Map<string, DocumentOwnerResolution>([
  ['client:client-a', { exists: true, organizationId: organizationA, authorizedUserIds: ['capturer-a'] }],
  ['client:client-b', { exists: true, organizationId: organizationB, authorizedUserIds: ['capturer-b'] }],
  ['property:property-a', { exists: true, organizationId: organizationA, authorizedUserIds: ['capturer-a', 'designer-a'] }],
  ['property:property-unassigned', { exists: true, organizationId: organizationA, authorizedUserIds: ['capturer-a'] }],
  ['appraisal:appraisal-a', { exists: true, organizationId: organizationA, authorizedUserIds: ['designer-a'] }],
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
      ownerDirectory.get(`${type}:${id}`) ?? { exists: false, organizationId: null, authorizedUserIds: [] },
  };
}

function input(overrides: Partial<RegisterDocumentReferenceInput> = {}): RegisterDocumentReferenceInput {
  return {
    logicalOwnerType: 'client',
    logicalOwnerId: 'client-a',
    category: 'registration_certificate',
    displayName: 'Certidão registral declarada',
    mimeType: 'application/pdf',
    fileSizeBytes: 120_000,
    accessScope: 'participants',
    issuedOn: '2026-08-01',
    expiresOn: '2026-12-01',
    notes: 'Metadado operacional sem conteúdo pessoal.',
    idempotencyKey: 'register-base-0001',
    ...overrides,
  };
}

console.log('=============================================================');
console.log('Suíte comportamental OE-006.001 — Fundação Documental');
console.log('=============================================================');

const gateway = new PreviewDocumentReferenceGateway();
setDocumentReferenceGatewayForTesting(gateway);
const clock = new FixedClock();
const ids = new SequentialIds();
const service = new DocumentApplicationService(gateway, clock, ids);

console.log('\n--- Metadados seguros e vínculo canônico ---');

let baseReferenceId = '';
await test('Registra referência canônica somente com metadados', async () => {
  const result = await service.registerReference(context('manager', 'manager-a'), input());
  baseReferenceId = result.id;
  assert.equal(result.organizationId, organizationA);
  assert.equal(result.storageState, 'metadata_only');
  assert.equal(result.status, 'active');
  assert.equal(result.versionNumber, 1);
  assert.match(result.metadataChecksumSha256, /^[a-f0-9]{64}$/);
});

await test('Agregado não contém bytes, arquivo, Blob, Base64 ou URL', async () => {
  const result = await service.getReferenceById(context('manager', 'manager-a'), baseReferenceId);
  const serialized = JSON.stringify(result).toLowerCase();
  for (const forbidden of ['base64', 'downloadurl', 'temporaryurl', 'filecontent', 'rawfile']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

await test('Payload com Base64 é rejeitado em tempo de execução', async () => {
  await expectCode('FORBIDDEN_PAYLOAD', () => service.registerReference(context('manager', 'manager-a'), {
    ...input({ idempotencyKey: 'forbidden-base64-1', displayName: 'Outro metadado' }),
    base64: 'data:application/pdf;base64,AAAA',
  }));
});

await test('Base64 bruto disfarçado em metadado textual é rejeitado', async () => {
  await expectCode('FORBIDDEN_PAYLOAD', () => service.registerReference(
    context('manager', 'manager-a'),
    input({
      idempotencyKey: 'forbidden-raw-base64',
      displayName: 'Metadado serializado',
      notes: `JVBERi0${'A'.repeat(120)}`,
    })
  ));
});

await test('Payload com URL temporária é rejeitado em tempo de execução', async () => {
  await expectCode('FORBIDDEN_PAYLOAD', () => service.registerReference(context('manager', 'manager-a'), {
    ...input({ idempotencyKey: 'forbidden-url-001', displayName: 'Outro metadado URL' }),
    temporaryUrl: 'https://example.test/signed',
  }));
});

await test('Payload com Blob é rejeitado em tempo de execução', async () => {
  await expectCode('FORBIDDEN_PAYLOAD', () => service.registerReference(context('manager', 'manager-a'), {
    ...input({ idempotencyKey: 'forbidden-blob-01', displayName: 'Outro metadado Blob' }),
    blob: new Blob(['conteudo']),
  }));
});

await test('Entidade inexistente é recusada', async () => {
  await expectCode('OWNER_NOT_FOUND', () => service.registerReference(
    context('manager', 'manager-a'),
    input({ logicalOwnerId: 'missing', idempotencyKey: 'owner-missing-001' })
  ));
});

await test('Entidade de outra organização é recusada', async () => {
  await expectCode('OWNER_ORGANIZATION_MISMATCH', () => service.registerReference(
    context('manager', 'manager-a'),
    input({ logicalOwnerId: 'client-b', idempotencyKey: 'owner-cross-org-1' })
  ));
});

await test('Data de validade anterior à emissão é recusada', async () => {
  await expectCode('INVALID_INPUT', () => service.registerReference(
    context('manager', 'manager-a'),
    input({ issuedOn: '2026-08-10', expiresOn: '2026-08-09', idempotencyKey: 'invalid-dates-001' })
  ));
});

console.log('\n--- RBAC, participantes e isolamento multitenant ---');

await test('Ausência de permissão canônica bloqueia o registro', async () => {
  await expectCode('FORBIDDEN', () => service.registerReference(
    context('manager', 'manager-a', organizationA, ['documents:view']),
    input({ idempotencyKey: 'permission-missing-1', displayName: 'Sem permissão' })
  ));
});

await test('Permissão injetada não permite mutação ao financeiro', async () => {
  await expectCode('FORBIDDEN', () => service.registerReference(
    context('finance', 'finance-a', organizationA, ['documents:view', 'documents:register_reference']),
    input({ idempotencyKey: 'permission-injected', displayName: 'Injeção bloqueada' })
  ));
});

let capturerReferenceId = '';
await test('Captador relacionado registra referência de participantes', async () => {
  const result = await service.registerReference(
    context('capturer', 'capturer-a'),
    input({
      category: 'car_receipt',
      displayName: 'Recibo ambiental declarado',
      idempotencyKey: 'capturer-related-1',
    })
  );
  capturerReferenceId = result.id;
  assert.equal(result.accessScope, 'participants');
});

await test('Captador não relacionado é bloqueado', async () => {
  await expectCode('FORBIDDEN', () => service.registerReference(
    context('capturer', 'capturer-x'),
    input({ displayName: 'Tentativa sem vínculo', idempotencyKey: 'capturer-unrelated' })
  ));
});

await test('Captador não cria referência restrita à gestão', async () => {
  await expectCode('FORBIDDEN', () => service.registerReference(
    context('capturer', 'capturer-a'),
    input({ accessScope: 'management', displayName: 'Tentativa gerencial', idempotencyKey: 'capturer-management' })
  ));
});

await test('Projetista participante registra referência do laudo atribuído', async () => {
  const result = await service.registerReference(
    context('project_designer', 'designer-a'),
    input({
      logicalOwnerType: 'appraisal',
      logicalOwnerId: 'appraisal-a',
      category: 'technical_report',
      displayName: 'Relatório técnico declarado',
      idempotencyKey: 'designer-appraisal-1',
    })
  );
  assert.equal(result.logicalOwnerType, 'appraisal');
});

await test('Projetista não participa automaticamente de todo imóvel da organização', async () => {
  await expectCode('FORBIDDEN', () => service.registerReference(
    context('project_designer', 'designer-a'),
    input({
      logicalOwnerType: 'property',
      logicalOwnerId: 'property-unassigned',
      displayName: 'Tentativa fora da atribuição',
      idempotencyKey: 'designer-unassigned-property',
    })
  ));
});

let organizationScopeId = '';
await test('Gestor registra metadado com consulta organizacional', async () => {
  const result = await service.registerReference(
    context('manager', 'manager-a'),
    input({
      logicalOwnerType: 'property',
      logicalOwnerId: 'property-a',
      category: 'topography_map',
      displayName: 'Planta topográfica declarada',
      accessScope: 'organization',
      idempotencyKey: 'organization-scope-1',
    })
  );
  organizationScopeId = result.id;
  assert.equal(result.accessScope, 'organization');
});

await test('Financeiro consulta somente referência de escopo organizacional', async () => {
  const visible = await service.listReferences(context('finance', 'finance-a'));
  assert.deepEqual(visible.map((item) => item.id), [organizationScopeId]);
});

await test('Captador consulta somente referências das próprias entidades', async () => {
  const visible = await service.listReferences(context('capturer', 'capturer-a'));
  assert.equal(visible.some((item) => item.id === capturerReferenceId), true);
  assert.equal(visible.every((item) => item.logicalOwnerId === 'client-a' || item.logicalOwnerId === 'property-a'), true);
});

await test('Consulta de outra organização retorna coleção vazia', async () => {
  const visible = await service.listReferences(context('manager', 'manager-b', organizationB));
  assert.deepEqual(visible, []);
});

await test('IDOR entre organizações não revela existência da referência', async () => {
  const result = await service.getReferenceById(context('manager', 'manager-b', organizationB), baseReferenceId);
  assert.equal(result, null);
});

console.log('\n--- Idempotência, versão, concorrência e imutabilidade ---');

await test('Replay com mesma chave e payload retorna a mesma referência', async () => {
  const first = await service.registerReference(
    context('manager', 'manager-a'),
    input({ category: 'other', displayName: 'Referência idempotente', idempotencyKey: 'idempotent-register' })
  );
  clock.advance(10);
  const replay = await service.registerReference(
    context('manager', 'manager-a'),
    input({ category: 'other', displayName: 'Referência idempotente', idempotencyKey: 'idempotent-register' })
  );
  assert.equal(replay.id, first.id);
  assert.equal(replay.createdAt, first.createdAt);
});

await test('Mesma chave com payload divergente é recusada', async () => {
  await expectCode('IDEMPOTENCY_CONFLICT', () => service.registerReference(
    context('manager', 'manager-a'),
    input({ category: 'other', displayName: 'Conteúdo divergente', idempotencyKey: 'idempotent-register' })
  ));
});

await test('Referência ativa equivalente não é duplicada', async () => {
  await expectCode('DUPLICATE_ACTIVE_REFERENCE', () => service.registerReference(
    context('manager', 'manager-a'),
    input({ idempotencyKey: 'duplicate-active-01' })
  ));
});

let replacementId = '';
await test('Substituição cria versão nova e preserva a anterior', async () => {
  const replacement = await service.replaceReference(context('manager', 'manager-a'), {
    previousDocumentId: baseReferenceId,
    expectedVersion: 1,
    displayName: 'Certidão registral atualizada',
    mimeType: 'application/pdf',
    fileSizeBytes: 130_000,
    issuedOn: '2026-09-01',
    expiresOn: '2027-01-01',
    notes: 'Nova referência de metadados.',
    idempotencyKey: 'replace-base-0001',
  });
  replacementId = replacement.id;
  assert.equal(replacement.versionNumber, 2);
  assert.equal(replacement.predecessorDocumentId, baseReferenceId);
  const previous = await service.getReferenceById(context('manager', 'manager-a'), baseReferenceId);
  assert.equal(previous?.status, 'superseded');
});

await test('Replay da substituição não cria outra versão', async () => {
  const replay = await service.replaceReference(context('manager', 'manager-a'), {
    previousDocumentId: baseReferenceId,
    expectedVersion: 1,
    displayName: 'Certidão registral atualizada',
    mimeType: 'application/pdf',
    fileSizeBytes: 130_000,
    issuedOn: '2026-09-01',
    expiresOn: '2027-01-01',
    notes: 'Nova referência de metadados.',
    idempotencyKey: 'replace-base-0001',
  });
  assert.equal(replay.id, replacementId);
});

await test('Versão obsoleta é recusada na substituição', async () => {
  await expectCode('VERSION_CONFLICT', () => service.replaceReference(context('manager', 'manager-a'), {
    previousDocumentId: replacementId,
    expectedVersion: 1,
    displayName: 'Versão obsoleta',
    mimeType: 'application/pdf',
    fileSizeBytes: 140_000,
    idempotencyKey: 'replace-stale-0001',
  }));
});

await test('Chamadas concorrentes com mesma chave convergem para um registro', async () => {
  const command = input({
    logicalOwnerType: 'proposal',
    logicalOwnerId: 'proposal-a',
    category: 'commercial_support',
    displayName: 'Comprovação comercial declarada',
    idempotencyKey: 'concurrent-register',
  });
  const results = await Promise.all([
    service.registerReference(context('manager', 'manager-a'), command),
    service.registerReference(context('manager', 'manager-a'), command),
  ]);
  assert.equal(results[0].id, results[1].id);
});

await test('Objetos retornados não permitem adulterar o armazenamento', async () => {
  const result = await service.getReferenceById(context('manager', 'manager-a'), replacementId);
  assert.ok(result);
  const mutable = result as unknown as Record<string, unknown>;
  mutable.displayName = 'Nome adulterado';
  const stored = await service.getReferenceById(context('manager', 'manager-a'), replacementId);
  assert.equal(stored?.displayName, 'Certidão registral atualizada');
});

await test('Filtros são aplicados pela fonte autoritativa', async () => {
  const result = await service.listReferences(context('manager', 'manager-a'), {
    ownerType: 'appraisal',
    category: 'technical_report',
    status: 'active',
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].logicalOwnerId, 'appraisal-a');
});

await test('Consulta cancelada respeita AbortSignal', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => service.listReferences(context('manager', 'manager-a'), {}, controller.signal), {
    name: 'AbortError',
  });
});

console.log('\n--- Arquivamento, eventos, rotas e limpeza ---');

await test('Perfil sem gestão não arquiva referência', async () => {
  const current = await service.getReferenceById(context('capturer', 'capturer-a'), capturerReferenceId);
  assert.ok(current);
  await expectCode('FORBIDDEN', () => service.archiveReference(context('capturer', 'capturer-a'), {
    documentId: current.id,
    expectedVersion: current.versionNumber,
    reason: 'Tentativa não autorizada',
    idempotencyKey: 'archive-forbidden',
  }));
});

await test('Arquivamento exige motivo válido', async () => {
  await expectCode('INVALID_INPUT', () => service.archiveReference(context('manager', 'manager-a'), {
    documentId: replacementId,
    expectedVersion: 2,
    reason: ' ',
    idempotencyKey: 'archive-no-reason',
  }));
});

await test('Gestor arquiva referência com controle de versão', async () => {
  const archived = await service.archiveReference(context('manager', 'manager-a'), {
    documentId: replacementId,
    expectedVersion: 2,
    reason: 'Referência substituída por política interna',
    idempotencyKey: 'archive-replacement',
  });
  assert.equal(archived.status, 'archived');
  assert.equal(archived.versionNumber, 3);
  assert.equal(archived.archivedByUserId, 'manager-a');
});

await test('Eventos são idempotentes e não expõem conteúdo protegido', async () => {
  const events = documentEventJournal.list(organizationA);
  const correlations = events.map((event) => event.correlationId);
  assert.equal(new Set(correlations).size, correlations.length);
  const serialized = JSON.stringify(events).toLowerCase();
  for (const forbidden of ['cpf', 'cnpj', 'telefone', 'email', 'metadado operacional', 'certidão registral atualizada', 'base64', 'https://']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

await test('Builder de rota codifica identificador não confiável', () => {
  assert.equal(getDocumentReferencePath('doc /?#'), '/documentos/doc%20%2F%3F%23');
});

await test('Matriz reconhece rotas documentais e bloqueia open redirect', () => {
  assert.equal(findRouteDefinition(ROUTES.DOCUMENTS_NEW)?.requiredPermissions, 'documents:upload');
  assert.equal(findRouteDefinition('/documentos/doc%20seguro')?.path, ROUTES.DOCUMENTS_DETAIL);
  assert.equal(getSafeRedirectUrl('/documentos/doc-seguro'), '/documentos/doc-seguro');
  assert.equal(getSafeRedirectUrl('//evil.test/documentos'), ROUTES.SYSTEM);
});

await test('Gateway de produção permanece fechado por padrão', async () => {
  const unavailable = new UnavailableDocumentReferenceGateway();
  await expectCode('SERVICE_UNAVAILABLE', () => unavailable.listReferences({ organizationId: organizationA }));
  const current = await gateway.getReferenceById(organizationA, capturerReferenceId);
  assert.ok(current);
  await expectCode('SERVICE_UNAVAILABLE', () => unavailable.archiveReference({
    organizationId: organizationA,
    documentId: current.id,
    expectedVersion: current.versionNumber,
    archivedAt: clock.now().toISOString(),
    archivedByUserId: 'manager-a',
    idempotencyKey: 'unavailable-archive',
    payloadHash: '0'.repeat(64),
  }));
});

await test('Logout limpa referências, idempotência e diário de eventos', async () => {
  assert.ok((await gateway.listReferences({ organizationId: organizationA })).length > 0);
  assert.ok(documentEventJournal.list(organizationA).length > 0);
  await executeDomainSessionCleanup();
  assert.equal((await gateway.listReferences({ organizationId: organizationA })).length, 0);
  assert.equal(documentEventJournal.list(organizationA).length, 0);
});

setDocumentReferenceGatewayForTesting(null);

console.log('\n=============================================================');
console.log(`Resultado OE-006.001: ${passed} passaram, ${failed} falharam`);
console.log('=============================================================');

if (failed > 0) process.exit(1);
