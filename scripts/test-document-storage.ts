import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DOCUMENT_STORAGE_BUCKET,
  DocumentDomainError,
} from '../src/types/documents.ts';
import {
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  assertStoredObjectMatches,
  buildDocumentStoragePath,
  sanitizeDownloadFileName,
  validateDocumentFile,
  verifyDocumentFileSignature,
} from '../src/documents/documentStoragePolicy.ts';
import { VolatileDocumentStorageGateway } from '../src/documents/volatileDocumentStorageGateway.ts';
import { UnavailableDocumentStorageGateway } from '../src/documents/unavailableDocumentStorageGateway.ts';

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

function pdfFile(name = 'documento pessoal.pdf'): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a])], name, {
    type: 'application/pdf',
  });
}

const path = buildDocumentStoragePath({
  organizationId: 'organization-a',
  logicalOwnerType: 'client',
  logicalOwnerId: 'client-a',
  documentId: 'document-a',
  mimeType: 'application/pdf',
});

console.log('=============================================================');
console.log('Suíte comportamental OE-006.002 — Storage Privado');
console.log('=============================================================');

await test('Caminho é opaco, segmentado e não preserva o nome original', () => {
  assert.equal(path, 'organization-a/client/client-a/document-a/document-a.pdf');
  assert.equal(path.includes('pessoal'), false);
  assert.equal(path.includes('..'), false);
});

await test('Manipulação de organização, entidade ou caminho é recusada', () => {
  assert.throws(() => buildDocumentStoragePath({
    organizationId: '../organization-b',
    logicalOwnerType: 'client',
    logicalOwnerId: 'client-a',
    documentId: 'document-a',
    mimeType: 'application/pdf',
  }), DocumentDomainError);
  assert.throws(() => assertStoredObjectMatches({
    organizationId: 'organization-a',
    logicalOwnerType: 'client',
    logicalOwnerId: 'client-a',
    documentId: 'document-a',
    mimeType: 'application/pdf',
    bucket: DOCUMENT_STORAGE_BUCKET,
    objectPath: 'organization-b/client/client-a/document-a/document-a.pdf',
  }), DocumentDomainError);
});

await test('Tamanho, tipo declarado e assinatura real são validados', async () => {
  assert.equal(validateDocumentFile(pdfFile()), 'application/pdf');
  await verifyDocumentFileSignature(pdfFile());
  await assert.rejects(
    () => verifyDocumentFileSignature(new File(['conteudo'], 'falso.pdf', { type: 'application/pdf' })),
    (error: unknown) => error instanceof DocumentDomainError && error.code === 'INVALID_FILE'
  );
  assert.throws(
    () => validateDocumentFile({ name: 'grande.pdf', type: 'application/pdf', size: MAX_DOCUMENT_FILE_SIZE_BYTES + 1 }),
    DocumentDomainError
  );
});

await test('Gateway volátil mede progresso real e exige o caminho exato para leitura', async () => {
  const gateway = new VolatileDocumentStorageGateway();
  const progress: number[] = [];
  await gateway.upload({
    bucket: DOCUMENT_STORAGE_BUCKET,
    objectPath: path,
    file: pdfFile(),
    mimeType: 'application/pdf',
    signal: new AbortController().signal,
    onProgress: (item) => progress.push(item.percentage),
  });
  assert.equal(progress.at(-1), 100);
  assert.equal((await gateway.download({ bucket: DOCUMENT_STORAGE_BUCKET, objectPath: path })).type, 'application/pdf');
  await assert.rejects(
    () => gateway.download({ bucket: DOCUMENT_STORAGE_BUCKET, objectPath: path.replace('organization-a', 'organization-b') }),
    (error: unknown) => error instanceof DocumentDomainError && error.code === 'STORAGE_DOWNLOAD_FAILED'
  );
});

await test('Cancelamento interrompe o envio antes da confirmação', async () => {
  const gateway = new VolatileDocumentStorageGateway();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => gateway.upload({
    bucket: DOCUMENT_STORAGE_BUCKET,
    objectPath: path,
    file: pdfFile(),
    mimeType: 'application/pdf',
    signal: controller.signal,
    onProgress: () => undefined,
  }), { name: 'AbortError' });
});

await test('Nome de download é sanitizado sem alterar a área privada', () => {
  assert.equal(sanitizeDownloadFileName('Certidão / matrícula nº 01', 'application/pdf'), 'Certidao-matricula-no-01.pdf');
});

await test('Migração cria bucket privado e quatro políticas independentes', () => {
  const migration = fs.readFileSync('supabase/migrations/20260901025305_oe_006_002_document_storage.sql', 'utf8');
  assert.match(migration, /'organization-documents'[\s\S]*false[\s\S]*52428800/);
  for (const operation of ['select', 'insert', 'update', 'delete']) {
    assert.match(migration, new RegExp(`create policy "agrocore_documents_${operation}"`, 'i'));
  }
  assert.match(migration, /organization_memberships/);
  assert.match(migration, /membership\.organization_id::text = target_organization_id/);
  assert.match(migration, /membership\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /document_storage_path_is_valid/);
  assert.doesNotMatch(migration, /public\s*=\s*true/i);
});

await test('Gateway sem configuração permanece fechado', async () => {
  const unavailable = new UnavailableDocumentStorageGateway();
  await assert.rejects(
    () => unavailable.download({ bucket: DOCUMENT_STORAGE_BUCKET, objectPath: path }),
    (error: unknown) => error instanceof DocumentDomainError && error.code === 'STORAGE_NOT_CONFIGURED'
  );
});

console.log('\n=============================================================');
console.log(`Resultado OE-006.002: ${passed} passaram, ${failed} falharam`);
console.log('=============================================================');
if (failed > 0) process.exit(1);
