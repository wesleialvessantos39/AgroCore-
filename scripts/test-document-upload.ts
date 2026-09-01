import assert from 'node:assert/strict';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import { DocumentApplicationService } from '../src/documents/documentApplicationService.ts';
import type { DocumentIdGenerator } from '../src/documents/crypto.ts';
import type { CreateDocumentRecord } from '../src/documents/documentGateway.ts';
import { PreviewDocumentReferenceGateway } from '../src/documents/preview/previewDocumentReferenceGateway.ts';
import { DocumentUploadService } from '../src/documents/documentUploadService.ts';
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
  uploads = 0;
  removals = 0;
  override async upload(input: Parameters<VolatileDocumentStorageGateway['upload']>[0]) {
    this.uploads += 1;
    return super.upload(input);
  }
  override async remove(bucket: Parameters<VolatileDocumentStorageGateway['remove']>[0], objectPath: string) {
    this.removals += 1;
    return super.remove(bucket, objectPath);
  }
}

class FailingReferenceGateway extends PreviewDocumentReferenceGateway {
  override async createReference(_input: CreateDocumentRecord): Promise<never> {
    throw new DocumentDomainError('SERVICE_UNAVAILABLE', 'Falha controlada após o armazenamento.');
  }
}

const owners = new Map<string, DocumentOwnerResolution>([
  ['client:client-a', { exists: true, organizationId: 'organization-a', authorizedUserIds: ['capturer-a'] }],
  ['client:client-b', { exists: true, organizationId: 'organization-b', authorizedUserIds: ['capturer-b'] }],
]);

function context(role: OrganizationRole, userId: string, organizationId = 'organization-a'): DocumentApplicationContext {
  return {
    organizationId,
    actor: {
      userId,
      role,
      isActive: true,
      permissions: getRolePermissions(role),
    },
    resolveOwner: async (type: DocumentLogicalOwnerType, id: string) =>
      owners.get(`${type}:${id}`) ?? { exists: false, organizationId: null, authorizedUserIds: [] },
  };
}

function pdfFile(): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a])], 'João CPF 000.pdf', {
    type: 'application/pdf',
  });
}

const metadata = {
  logicalOwnerType: 'client' as const,
  logicalOwnerId: 'client-a',
  category: 'registration_certificate' as const,
  displayName: 'Certidão registral',
  accessScope: 'participants' as const,
};

function harness(referenceGateway = new PreviewDocumentReferenceGateway(), storage = new CountingStorageGateway()) {
  const application = new DocumentApplicationService(referenceGateway, undefined, new SequentialIds('event'));
  const uploads = new DocumentUploadService(application, storage, new SequentialIds('document'));
  return { application, referenceGateway, storage, uploads };
}

console.log('=============================================================');
console.log('Suíte comportamental OE-006.003 — Upload e Processamento');
console.log('=============================================================');

await test('Confirma arquivo antes de criar a referência e registra estado armazenado', async () => {
  const { referenceGateway, uploads } = harness();
  const progress: number[] = [];
  const result = await uploads.uploadDocument(context('capturer', 'capturer-a'), {
    file: pdfFile(),
    metadata,
    idempotencyKey: 'upload-success-0001',
    signal: new AbortController().signal,
    onProgress: (item) => progress.push(item.percentage),
  });
  assert.equal(result.storageState, 'stored');
  assert.equal(result.storageBucket, 'organization-documents');
  assert.match(result.storageObjectPath ?? '', /^organization-a\/client\/client-a\/document-0001\/document-0001\.pdf$/);
  assert.equal(result.storageObjectPath?.includes('João'), false);
  assert.equal(progress.at(-1), 100);
  assert.equal((await referenceGateway.listReferences({ organizationId: 'organization-a' })).length, 1);
});

await test('Abertura retorna Blob somente após autorização documental', async () => {
  const { uploads } = harness();
  const result = await uploads.uploadDocument(context('manager', 'manager-a'), {
    file: pdfFile(), metadata, idempotencyKey: 'upload-download-0001',
    signal: new AbortController().signal, onProgress: () => undefined,
  });
  const content = await uploads.getDocumentContent(context('manager', 'manager-a'), result.id);
  assert.equal(content.blob.type, 'application/pdf');
  assert.equal(content.displayName, 'Certidão registral');
});

await test('Financeiro não envia mesmo com gateway disponível', async () => {
  const { storage, uploads } = harness();
  await assert.rejects(
    () => uploads.uploadDocument(context('finance', 'finance-a'), {
      file: pdfFile(), metadata, idempotencyKey: 'upload-finance-0001',
      signal: new AbortController().signal, onProgress: () => undefined,
    }),
    (error: unknown) => error instanceof DocumentDomainError && error.code === 'FORBIDDEN'
  );
  assert.equal(storage.uploads, 0);
});

await test('Arquivo com assinatura incompatível é rejeitado antes do armazenamento', async () => {
  const { storage, uploads } = harness();
  await assert.rejects(
    () => uploads.uploadDocument(context('manager', 'manager-a'), {
      file: new File(['conteúdo falso'], 'falso.pdf', { type: 'application/pdf' }),
      metadata, idempotencyKey: 'upload-fake-0001',
      signal: new AbortController().signal, onProgress: () => undefined,
    }),
    (error: unknown) => error instanceof DocumentDomainError && error.code === 'INVALID_FILE'
  );
  assert.equal(storage.uploads, 0);
});

await test('Falha no registro posterior remove o arquivo armazenado', async () => {
  const storage = new CountingStorageGateway();
  const { uploads } = harness(new FailingReferenceGateway(), storage);
  await assert.rejects(() => uploads.uploadDocument(context('manager', 'manager-a'), {
    file: pdfFile(), metadata, idempotencyKey: 'upload-compensation-0001',
    signal: new AbortController().signal, onProgress: () => undefined,
  }));
  assert.equal(storage.uploads, 1);
  assert.equal(storage.removals, 1);
});

await test('Cancelamento prévio não cria referência nem deixa arquivo', async () => {
  const { referenceGateway, storage, uploads } = harness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => uploads.uploadDocument(context('manager', 'manager-a'), {
      file: pdfFile(), metadata, idempotencyKey: 'upload-cancel-0001',
      signal: controller.signal, onProgress: () => undefined,
    }),
    (error: unknown) => error instanceof DocumentDomainError && error.code === 'UPLOAD_CANCELLED'
  );
  assert.equal(storage.uploads, 0);
  assert.equal((await referenceGateway.listReferences({ organizationId: 'organization-a' })).length, 0);
});

await test('Troca de organização não revela conteúdo por identificador', async () => {
  const { uploads } = harness();
  const result = await uploads.uploadDocument(context('manager', 'manager-a'), {
    file: pdfFile(), metadata, idempotencyKey: 'upload-isolation-0001',
    signal: new AbortController().signal, onProgress: () => undefined,
  });
  await assert.rejects(
    () => uploads.getDocumentContent(context('manager', 'manager-b', 'organization-b'), result.id),
    (error: unknown) => error instanceof DocumentDomainError && error.code === 'STORAGE_DOWNLOAD_FAILED'
  );
});

console.log('\n=============================================================');
console.log(`Resultado OE-006.003: ${passed} passaram, ${failed} falharam`);
console.log('=============================================================');
if (failed > 0) process.exit(1);
