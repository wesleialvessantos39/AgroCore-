import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import type { DocumentIdGenerator } from '../src/documents/crypto.ts';
import { DocumentApplicationService } from '../src/documents/documentApplicationService.ts';
import { PreviewDocumentReferenceGateway } from '../src/documents/preview/previewDocumentReferenceGateway.ts';
import { DocumentUploadService } from '../src/documents/documentUploadService.ts';
import { compareDocumentVersionMetadata } from '../src/documents/documentVersioning.ts';
import { VolatileDocumentStorageGateway } from '../src/documents/volatileDocumentStorageGateway.ts';
import {
  DocumentDomainError,
  type DocumentApplicationContext,
  type DocumentLogicalOwnerType,
  type DocumentOwnerResolution,
} from '../src/types/documents.ts';
import type { OrganizationRole } from '../src/types/auth.ts';

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

class SequentialIds implements DocumentIdGenerator {
  private sequence = 0;
  constructor(private readonly prefix: string) {}
  generate(): string {
    this.sequence += 1;
    return `${this.prefix}-${String(this.sequence).padStart(4, '0')}`;
  }
}

class CountingStorageGateway extends VolatileDocumentStorageGateway {
  removals = 0;
  override async remove(
    bucket: Parameters<VolatileDocumentStorageGateway['remove']>[0],
    objectPath: string
  ) {
    this.removals += 1;
    return super.remove(bucket, objectPath);
  }
}

const owners = new Map<string, DocumentOwnerResolution>([
  ['client:client-a', { exists: true, organizationId: 'organization-a', authorizedUserIds: ['capturer-a'] }],
  ['client:client-b', { exists: true, organizationId: 'organization-b', authorizedUserIds: ['capturer-b'] }],
]);

function context(
  role: OrganizationRole,
  userId: string,
  organizationId = 'organization-a'
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
    resolveOwner: async (type: DocumentLogicalOwnerType, id: string) =>
      owners.get(`${type}:${id}`) ?? { exists: false, organizationId: null, authorizedUserIds: [] },
  };
}

function pdfFile(name: string, suffix = ''): File {
  return new File([
    new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]),
    suffix,
  ], name, { type: 'application/pdf' });
}

function harness() {
  const gateway = new PreviewDocumentReferenceGateway();
  const storage = new CountingStorageGateway();
  const application = new DocumentApplicationService(
    gateway,
    undefined,
    new SequentialIds('event')
  );
  const uploads = new DocumentUploadService(
    application,
    storage,
    new SequentialIds('document')
  );
  return { application, gateway, storage, uploads };
}

const initialMetadata = {
  logicalOwnerType: 'client' as const,
  logicalOwnerId: 'client-a',
  category: 'registration_certificate' as const,
  displayName: 'Certidão registral',
  accessScope: 'participants' as const,
  issuedOn: '2026-01-01',
};

async function uploadInitial(uploads: DocumentUploadService) {
  return uploads.uploadDocument(context('manager', 'manager-a'), {
    file: pdfFile('certidao-v1.pdf'),
    metadata: initialMetadata,
    idempotencyKey: 'version-initial-0001',
    signal: new AbortController().signal,
    onProgress: () => undefined,
  });
}

console.log('=============================================================');
console.log('Suíte comportamental OE-006.004 — Versões e Histórico');
console.log('=============================================================');

await test('Nova versão mantém identidade lógica, arquivo anterior e autoria', async () => {
  const { application, uploads } = harness();
  const first = await uploadInitial(uploads);
  const second = await uploads.replaceStoredDocument(context('manager', 'manager-a'), {
    file: pdfFile('certidao-v2.pdf', 'atualizada'),
    previousDocumentId: first.id,
    expectedVersion: first.versionNumber,
    displayName: 'Certidão registral atualizada',
    issuedOn: '2026-02-01',
    expiresOn: '2027-02-01',
    notes: 'Documento conferido pela equipe.',
    versionNote: 'Atualização recebida do cartório.',
    idempotencyKey: 'version-replace-0001',
    signal: new AbortController().signal,
    onProgress: () => undefined,
  });

  assert.equal(second.logicalDocumentId, first.logicalDocumentId);
  assert.equal(second.predecessorDocumentId, first.id);
  assert.equal(second.versionNumber, 2);
  assert.equal(second.isCurrent, true);
  assert.equal(second.createdByDisplayName, 'Gerência documental');
  assert.equal(second.versionNote, 'Atualização recebida do cartório.');
  assert.match(
    second.storageObjectPath ?? '',
    /^organization-a\/client\/client-a\/document-0001\/document-0002\.pdf$/
  );

  const previous = await application.getReferenceById(context('manager', 'manager-a'), first.id);
  assert.equal(previous?.status, 'superseded');
  assert.equal(previous?.isCurrent, false);
  const oldContent = await uploads.getDocumentContent(context('manager', 'manager-a'), first.id);
  assert.equal(oldContent.blob.type, 'application/pdf');
});

await test('Lista principal contém somente a versão atual e histórico contém toda a linhagem', async () => {
  const { application, uploads } = harness();
  const first = await uploadInitial(uploads);
  const second = await uploads.replaceStoredDocument(context('manager', 'manager-a'), {
    file: pdfFile('certidao-v2.pdf', 'dois'),
    previousDocumentId: first.id,
    expectedVersion: 1,
    displayName: 'Certidão registral v2',
    versionNote: 'Segunda via válida.',
    idempotencyKey: 'version-history-0001',
    signal: new AbortController().signal,
    onProgress: () => undefined,
  });
  const current = await application.listReferences(context('manager', 'manager-a'));
  const history = await application.listVersionHistory(context('manager', 'manager-a'), second.id);
  assert.deepEqual(current.map((item) => item.id), [second.id]);
  assert.deepEqual(history.map((item) => item.versionNumber), [2, 1]);
  assert.equal(history.filter((item) => item.isCurrent).length, 1);
});

await test('Atualizações simultâneas produzem uma única versão atual e compensam a perdedora', async () => {
  const { application, storage, uploads } = harness();
  const first = await uploadInitial(uploads);
  const baseCommand = {
    previousDocumentId: first.id,
    expectedVersion: 1,
    displayName: 'Certidão concorrente',
    versionNote: 'Substituição concorrente controlada.',
    signal: new AbortController().signal,
    onProgress: () => undefined,
  };
  const results = await Promise.allSettled([
    uploads.replaceStoredDocument(context('manager', 'manager-a'), {
      ...baseCommand,
      file: pdfFile('concorrente-a.pdf', 'a'),
      idempotencyKey: 'version-race-a-0001',
    }),
    uploads.replaceStoredDocument(context('manager', 'manager-a'), {
      ...baseCommand,
      file: pdfFile('concorrente-b.pdf', 'b'),
      idempotencyKey: 'version-race-b-0001',
    }),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  const rejected = results.find((item): item is PromiseRejectedResult => item.status === 'rejected');
  assert(rejected?.reason instanceof DocumentDomainError);
  assert.equal(rejected.reason.code, 'VERSION_CONFLICT');
  assert.equal(storage.removals, 1);

  const history = await application.listVersionHistory(context('manager', 'manager-a'), first.id);
  assert.equal(history.length, 2);
  assert.equal(history.filter((item) => item.isCurrent).length, 1);
  assert.equal(history.filter((item) => item.status === 'active').length, 1);
});

await test('Comparação retorna apenas metadados e nunca localização privada ou checksum', async () => {
  const { application, uploads } = harness();
  const first = await uploadInitial(uploads);
  const second = await uploads.replaceStoredDocument(context('manager', 'manager-a'), {
    file: pdfFile('certidao-v2.pdf', 'conteudo maior'),
    previousDocumentId: first.id,
    expectedVersion: 1,
    displayName: 'Certidão atualizada',
    expiresOn: '2027-01-01',
    versionNote: 'Nova validade registrada.',
    idempotencyKey: 'version-compare-0001',
    signal: new AbortController().signal,
    onProgress: () => undefined,
  });
  const previous = await application.getReferenceById(context('manager', 'manager-a'), first.id);
  assert(previous);
  const changes = compareDocumentVersionMetadata(previous, second);
  assert(changes.some((item) => item.field === 'displayName'));
  assert(changes.some((item) => item.field === 'expiresOn'));
  const serialized = JSON.stringify(changes);
  assert.equal(serialized.includes('storageObjectPath'), false);
  assert.equal(serialized.includes('metadataChecksumSha256'), false);
  assert.equal(serialized.includes('organization-documents'), false);
});

await test('Perfil sem gestão não substitui versão e outra organização não consulta histórico', async () => {
  const { application, uploads } = harness();
  const first = await uploadInitial(uploads);
  await assert.rejects(
    () => uploads.replaceStoredDocument(context('capturer', 'capturer-a'), {
      file: pdfFile('negada.pdf'),
      previousDocumentId: first.id,
      expectedVersion: 1,
      displayName: 'Versão negada',
      versionNote: 'Tentativa sem gestão.',
      idempotencyKey: 'version-forbidden-0001',
      signal: new AbortController().signal,
      onProgress: () => undefined,
    }),
    (error: unknown) => error instanceof DocumentDomainError && error.code === 'FORBIDDEN'
  );
  await assert.rejects(
    () => application.listVersionHistory(
      context('manager', 'manager-b', 'organization-b'),
      first.id
    ),
    (error: unknown) => error instanceof DocumentDomainError && error.code === 'REFERENCE_NOT_FOUND'
  );
});

await test('Migração fecha escrita direta e garante uma versão atual por índice e lock', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260901115546_oe_006_004_document_versions.sql', import.meta.url),
    'utf8'
  );
  assert.match(migration, /create unique index if not exists document_versions_one_current_idx[\s\S]*where is_current;/i);
  assert.match(migration, /for update;/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /alter table public\.document_versions enable row level security;/i);
  assert.match(migration, /revoke insert, update, delete[\s\S]*from authenticated;/i);
  assert.match(migration, /constraint document_versions_storage_path_bound[\s\S]*logical_document_id::text/i);
  assert.match(migration, /create table if not exists agrocore_private\.document_access/i);
  assert.match(migration, /authorized_user_ids uuid\[\]/i);
  assert.match(migration, /can_read_document\(\s*organization_id,\s*logical_document_id,/i);
  assert.match(migration, /document_storage_object_is_registered/i);
  assert.match(migration, /actor_user_id uuid not null/i);
  assert.match(migration, /v_now timestamptz := clock_timestamp\(\)/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.doesNotMatch(migration, /service_role/i);
});

console.log('\n=============================================================');
console.log(`Resultado OE-006.004: ${passed} passaram, ${failed} falharam`);
console.log('=============================================================');
if (failed > 0) process.exit(1);
