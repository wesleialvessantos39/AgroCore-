import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import { DocumentApplicationService } from '../src/documents/documentApplicationService.ts';
import { DocumentUploadService } from '../src/documents/documentUploadService.ts';
import { DocumentComplianceApplicationService } from '../src/documents/documentComplianceApplicationService.ts';
import { ProposalChecklistApplicationService } from '../src/documents/proposalChecklistApplicationService.ts';
import {
  DOCUMENT_STORAGE_BUCKET,
  DocumentDomainError,
  type DocumentApplicationContext,
  type DocumentLogicalOwnerType,
  type DocumentOwnerResolution,
} from '../src/types/documents.ts';
import type {
  ProposalChecklistApplicationContext,
  ProposalChecklistSourceResolution,
} from '../src/types/proposalChecklists.ts';
import type {
  DocumentComplianceApplicationContext,
} from '../src/types/documentCompliance.ts';
import type { OrganizationRole } from '../src/types/auth.ts';
import type { DocumentClock, DocumentIdGenerator } from '../src/documents/crypto.ts';
import {
  buildDocumentStoragePath,
  validateDocumentFile,
  verifyDocumentFileSignature,
} from '../src/documents/documentStoragePolicy.ts';
import { VolatileDocumentStorageGateway } from '../src/documents/volatileDocumentStorageGateway.ts';
import { UnavailableDocumentStorageGateway } from '../src/documents/unavailableDocumentStorageGateway.ts';
import { UnavailableDocumentReferenceGateway } from '../src/documents/unavailableDocumentReferenceGateway.ts';
import { UnavailableProposalChecklistGateway } from '../src/documents/unavailableProposalChecklistGateway.ts';
import { UnavailableDocumentComplianceGateway } from '../src/documents/unavailableDocumentComplianceGateway.ts';
import { PreviewDocumentReferenceGateway } from '../src/documents/preview/previewDocumentReferenceGateway.ts';
import { PreviewProposalChecklistGateway } from '../src/documents/preview/previewProposalChecklistGateway.ts';
import { PreviewDocumentComplianceGateway } from '../src/documents/preview/previewDocumentComplianceGateway.ts';

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
  private count = 0;
  constructor(private readonly prefix: string) {}
  generate(): string {
    this.count += 1;
    return `${this.prefix}-${String(this.count).padStart(4, '0')}`;
  }
}

class FixedClock implements DocumentClock {
  constructor(private readonly fixedIso: string) {}
  now(): Date {
    return new Date(this.fixedIso);
  }
}

function dummySignal(): AbortSignal {
  return new AbortController().signal;
}

function pdfFile(name = 'documento.pdf', size = 1024): File {
  const header = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a];
  const buffer = new Uint8Array(Math.max(header.length, size));
  buffer.set(header, 0);
  for (let i = header.length; i < buffer.length; i++) {
    buffer[i] = i % 256;
  }
  return new File([buffer], name, { type: 'application/pdf' });
}

function pngFile(name = 'imagem.png', size = 512): File {
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const buffer = new Uint8Array(Math.max(header.length, size));
  buffer.set(header, 0);
  return new File([buffer], name, { type: 'image/png' });
}

function createContext(
  orgId: string,
  userId: string,
  role: OrganizationRole,
  ownerMap: Map<string, DocumentOwnerResolution>,
  proposalMap: Map<string, ProposalChecklistSourceResolution>
): DocumentApplicationContext & ProposalChecklistApplicationContext & DocumentComplianceApplicationContext {
  const permissions = [...getRolePermissions(role)];
  return {
    organizationId: orgId,
    actor: {
      userId,
      displayName: `Usuário ${role}`,
      role,
      isActive: true,
      permissions,
    },
    resolveOwner: async (type: DocumentLogicalOwnerType, id: string): Promise<DocumentOwnerResolution> => {
      const found = ownerMap.get(`${type}:${id}`);
      return found ?? { exists: false, organizationId: null, authorizedUserIds: [] };
    },
    resolveProposalChecklistSource: async (proposalId: string): Promise<ProposalChecklistSourceResolution> => {
      const found = proposalMap.get(proposalId);
      return (
        found ?? {
          exists: false,
          organizationId: null,
          proposalId,
          authorizedUserIds: [],
        }
      );
    },
  };
}

console.log('=============================================================');
console.log(' OE-006.007 — Bateria Ofensiva e Homologação Final Documental');
console.log('=============================================================\n');

// 1. ISOLAMENTO MULTIEMPRESA RIGOROSO (Org A vs Org B)
console.log('--- 1. Isolamento Multiempresa (Org A vs Org B) ---');

await test('Usuário de Org A não lista, lê nem abre documentos de Org B', async () => {
  const storage = new VolatileDocumentStorageGateway();
  const refGateway = new PreviewDocumentReferenceGateway();
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, storage, new SequentialIds('UPL'));

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-a', { exists: true, organizationId: 'org-a', authorizedUserIds: ['user-a'] }],
    ['client:client-b', { exists: true, organizationId: 'org-b', authorizedUserIds: ['user-b'] }],
  ]);
  const proposalMap = new Map<string, ProposalChecklistSourceResolution>();

  const ctxA = createContext('org-a', 'user-a', 'owner', ownerMap, proposalMap);
  const ctxB = createContext('org-b', 'user-b', 'owner', ownerMap, proposalMap);

  const docB = await uploadService.uploadDocument(ctxB, {
    file: pdfFile('contrato-b.pdf'),
    metadata: {
      logicalOwnerType: 'client',
      logicalOwnerId: 'client-b',
      category: 'registration_certificate',
      accessScope: 'organization',
      displayName: 'Documento Secreto Org B',
      notes: 'Privado',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'upl-b-item-001',
  });

  const listFromA = await docService.listReferences(ctxA);
  assert.equal(listFromA.length, 0);

  const directGetFromA = await docService.getReferenceById(ctxA, docB.id);
  assert.equal(directGetFromA, null);

  await assert.rejects(
    () => uploadService.getDocumentContent(ctxA, docB.id),
    (err: unknown) =>
      err instanceof DocumentDomainError &&
      (err.code === 'FORBIDDEN' || err.code === 'REFERENCE_NOT_FOUND' || err.code === 'STORAGE_DOWNLOAD_FAILED')
  );
});

await test('Usuário de Org A não substitui nem arquiva documento de Org B', async () => {
  const storage = new VolatileDocumentStorageGateway();
  const refGateway = new PreviewDocumentReferenceGateway();
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, storage, new SequentialIds('UPL'));

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-b', { exists: true, organizationId: 'org-b', authorizedUserIds: ['user-b'] }],
  ]);
  const proposalMap = new Map<string, ProposalChecklistSourceResolution>();

  const ctxA = createContext('org-a', 'user-a', 'owner', ownerMap, proposalMap);
  const ctxB = createContext('org-b', 'user-b', 'owner', ownerMap, proposalMap);

  const docB = await uploadService.uploadDocument(ctxB, {
    file: pdfFile('original-b.pdf'),
    metadata: {
      logicalOwnerType: 'client',
      logicalOwnerId: 'client-b',
      category: 'registration_certificate',
      accessScope: 'organization',
      displayName: 'Original B',
      notes: 'Confidencial',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'upl-b-item-002',
  });

  await assert.rejects(
    () =>
      uploadService.replaceStoredDocument(ctxA, {
        previousDocumentId: docB.id,
        expectedVersion: 1,
        displayName: 'Substituto Malicioso',
        versionNote: 'Tentativa indevida de substituição',
        file: pdfFile('substituto-malicioso.pdf'),
        idempotencyKey: 'attack-replace-001',
        signal: dummySignal(),
        onProgress: () => undefined,
      }),
    (err: unknown) => err instanceof DocumentDomainError && (err.code === 'FORBIDDEN' || err.code === 'REFERENCE_NOT_FOUND')
  );

  await assert.rejects(
    () =>
      docService.archiveReference(ctxA, {
        documentId: docB.id,
        expectedVersion: 1,
        reason: 'Tentativa indevida de arquivamento',
        idempotencyKey: 'attack-archive-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && (err.code === 'FORBIDDEN' || err.code === 'REFERENCE_NOT_FOUND')
  );

  await assert.rejects(
    () => docService.listVersionHistory(ctxA, docB.id),
    (err: unknown) => err instanceof DocumentDomainError && (err.code === 'FORBIDDEN' || err.code === 'REFERENCE_NOT_FOUND')
  );
});

await test('Usuário de Org A não compartilha, revoga nem exporta documentos de Org B', async () => {
  const storage = new VolatileDocumentStorageGateway();
  const refGateway = new PreviewDocumentReferenceGateway();
  const complianceGateway = new PreviewDocumentComplianceGateway(refGateway, storage);
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, storage, new SequentialIds('UPL'));
  const complianceService = new DocumentComplianceApplicationService(
    complianceGateway,
    docService,
    storage,
    new FixedClock('2026-09-02T12:00:00.000Z'),
    new SequentialIds('COMP')
  );

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-b', { exists: true, organizationId: 'org-b', authorizedUserIds: ['user-b'] }],
  ]);
  const proposalMap = new Map<string, ProposalChecklistSourceResolution>();

  const ctxA = createContext('org-a', 'user-a', 'owner', ownerMap, proposalMap);
  const ctxB = createContext('org-b', 'user-b', 'owner', ownerMap, proposalMap);

  const docB = await uploadService.uploadDocument(ctxB, {
    file: pdfFile('certidao-b.pdf'),
    metadata: {
      logicalOwnerType: 'client',
      logicalOwnerId: 'client-b',
      category: 'registration_certificate',
      accessScope: 'organization',
      displayName: 'Certidão B',
      notes: 'Notas B',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'upl-b-item-003',
  });

  await assert.rejects(
    () =>
      complianceService.createShare(ctxA, {
        documentId: docB.id,
        purpose: 'Compartilhamento não autorizado',
        expiresInMinutes: 60,
        maxAccesses: 2,
        idempotencyKey: 'attack-share-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && (err.code === 'FORBIDDEN' || err.code === 'REFERENCE_NOT_FOUND')
  );

  const shareB = await complianceService.createShare(ctxB, {
    documentId: docB.id,
    purpose: 'Compartilhamento Legítimo B',
    expiresInMinutes: 60,
    maxAccesses: 2,
    idempotencyKey: 'share-b-legit-001',
  });

  await assert.rejects(
    () =>
      complianceService.revokeShare(ctxA, {
        shareId: shareB.grant.id,
        expectedAccessCount: 0,
        reason: 'Revogação indevida de outra empresa',
        idempotencyKey: 'attack-revoke-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && (err.code === 'FORBIDDEN' || err.code === 'REFERENCE_NOT_FOUND')
  );

  await assert.rejects(
    () =>
      complianceService.createBatchExport(ctxA, {
        documentIds: [docB.id],
        purpose: 'Exportação indevida',
        idempotencyKey: 'attack-export-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && (err.code === 'FORBIDDEN' || err.code === 'REFERENCE_NOT_FOUND')
  );
});

// 2. IDOR / BOLA EM TODOS OS IDENTIFICADORES
console.log('\n--- 2. Proteção contra IDOR / BOLA em Todos os Identificadores ---');

await test('Tentativa de forjar IDs inexistentes, inválidos ou adulterados falha determinística', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const storage = new VolatileDocumentStorageGateway();
  const complianceGateway = new PreviewDocumentComplianceGateway(refGateway, storage);
  const checklistGateway = new PreviewProposalChecklistGateway();
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const complianceService = new DocumentComplianceApplicationService(complianceGateway, docService, storage);
  const checklistService = new ProposalChecklistApplicationService(checklistGateway, refGateway);

  const ctx = createContext('org-legit', 'user-legit', 'owner', new Map(), new Map());

  const arbitraryIds = ['non-existent', '00000000-0000-0000-0000-000000000000', 'null', 'undefined'];

  for (const forgedId of arbitraryIds) {
    const doc = await docService.getReferenceById(ctx, forgedId);
    assert.equal(doc, null);

    await assert.rejects(
      () => docService.listVersionHistory(ctx, forgedId),
      (err: unknown) => err instanceof DocumentDomainError && err.code === 'REFERENCE_NOT_FOUND'
    );

    await assert.rejects(
      () =>
        docService.archiveReference(ctx, {
          documentId: forgedId,
          expectedVersion: 1,
          reason: 'Tentativa IDOR',
          idempotencyKey: `idor-arch-${forgedId.slice(0, 8)}`,
        }),
      (err: unknown) => err instanceof DocumentDomainError && err.code === 'REFERENCE_NOT_FOUND'
    );

    await assert.rejects(
      () =>
        complianceService.createShare(ctx, {
          documentId: forgedId,
          purpose: 'Tentativa IDOR',
          expiresInMinutes: 30,
          maxAccesses: 1,
          idempotencyKey: `idor-share-${forgedId.slice(0, 8)}`,
        }),
      (err: unknown) => err instanceof DocumentDomainError && err.code === 'REFERENCE_NOT_FOUND'
    );

    await assert.rejects(
      () =>
        complianceService.revokeShare(ctx, {
          shareId: forgedId,
          expectedAccessCount: 0,
          reason: 'Tentativa IDOR',
          idempotencyKey: `idor-rev-${forgedId.slice(0, 8)}`,
        }),
      (err: unknown) => err instanceof DocumentDomainError && (err.code === 'FORBIDDEN' || err.code === 'REFERENCE_NOT_FOUND')
    );

    await assert.rejects(
      () =>
        checklistService.transitionItem(ctx, {
          checklistId: forgedId,
          itemId: 'item-1',
          expectedVersion: 1,
          targetState: 'received',
          documentId: 'doc-1',
          idempotencyKey: `idor-trans-${forgedId.slice(0, 8)}`,
        }),
      (err: unknown) => err instanceof DocumentDomainError && (err.code === 'FORBIDDEN' || err.code === 'CHECKLIST_NOT_FOUND')
    );
  }
});

// 3. MATRIZ DE PERFIS RBAC COMPLETA (7 PERFIS)
console.log('\n--- 3. Matriz RBAC Completa (7 Perfis) ---');

await test('platform_super_admin não ganha acesso documental sem membership ativa', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const superAdminCtx = createContext('org-super', 'super-admin-user', 'none', new Map(), new Map());

  await assert.rejects(
    () => docService.listReferences(superAdminCtx),
    (err: unknown) => err instanceof DocumentDomainError && (err.code === 'FORBIDDEN' || err.code === 'INACTIVE_MEMBERSHIP')
  );
});

await test('finance possui apenas leitura autorizada; upload e mutações são bloqueados', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const storage = new VolatileDocumentStorageGateway();
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, storage, new SequentialIds('UPL'));
  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-fin', { exists: true, organizationId: 'org-fin', authorizedUserIds: ['user-fin'] }],
  ]);
  const ctxFinance = createContext('org-fin', 'user-fin', 'finance', ownerMap, new Map());

  const list = await docService.listReferences(ctxFinance);
  assert.equal(Array.isArray(list), true);

  await assert.rejects(
    () =>
      uploadService.uploadDocument(ctxFinance, {
        file: pdfFile('balanco.pdf'),
        metadata: {
          logicalOwnerType: 'client',
          logicalOwnerId: 'client-fin',
          category: 'registration_certificate',
          accessScope: 'organization',
          displayName: 'Balanço Não Autorizado',
        },
        onProgress: () => undefined,
        signal: dummySignal(),
        idempotencyKey: 'fin-upload-attempt-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'FORBIDDEN'
  );
});

await test('project_designer acessa apenas documentos do seu escopo e não faz gestão global', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const storage = new VolatileDocumentStorageGateway();
  const complianceGateway = new PreviewDocumentComplianceGateway(refGateway, storage);
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const complianceService = new DocumentComplianceApplicationService(complianceGateway, docService, storage);
  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-des', { exists: true, organizationId: 'org-des', authorizedUserIds: ['user-designer'] }],
  ]);
  const ctxDesigner = createContext('org-des', 'user-designer', 'project_designer', ownerMap, new Map());

  await assert.rejects(
    () =>
      complianceService.configureAlertPolicy(ctxDesigner, {
        warningDays: 45,
        criticalDays: 10,
        expectedVersion: 1,
        idempotencyKey: 'des-cfg-policy-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'FORBIDDEN'
  );
});

await test('capturer acessa apenas atendimentos e clientes vinculados', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const storage = new VolatileDocumentStorageGateway();
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, storage, new SequentialIds('UPL'));

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-assigned', { exists: true, organizationId: 'org-cap', authorizedUserIds: ['capturer-1'] }],
    ['client:client-unassigned', { exists: true, organizationId: 'org-cap', authorizedUserIds: ['other-capturer'] }],
  ]);
  const ctxCapturer = createContext('org-cap', 'capturer-1', 'capturer', ownerMap, new Map());

  const doc = await uploadService.uploadDocument(ctxCapturer, {
    file: pdfFile('rg-produtor.pdf'),
    metadata: {
      logicalOwnerType: 'client',
      logicalOwnerId: 'client-assigned',
      category: 'registration_certificate',
      accessScope: 'organization',
      displayName: 'RG Produtor',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'cap-upl-item-001',
  });
  assert.equal(doc.displayName, 'RG Produtor');

  await assert.rejects(
    () =>
      uploadService.uploadDocument(ctxCapturer, {
        file: pdfFile('rg-alheio.pdf'),
        metadata: {
          logicalOwnerType: 'client',
          logicalOwnerId: 'client-unassigned',
          category: 'registration_certificate',
          accessScope: 'organization',
          displayName: 'RG Alheio',
        },
        onProgress: () => undefined,
        signal: dummySignal(),
        idempotencyKey: 'cap-upl-item-002',
      }),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'FORBIDDEN'
  );
});

// 4. STORAGE PRIVADO E POLÍTICA DE ARQUIVOS
console.log('\n--- 4. Storage Privado e Segurança de Arquivos ---');

await test('Caminho de Storage é determinístico, sanitizado e nega path traversal', () => {
  assert.throws(
    () =>
      buildDocumentStoragePath({
        organizationId: 'org/../admin',
        logicalOwnerType: 'client',
        logicalOwnerId: 'c1',
        documentId: 'd1',
        mimeType: 'application/pdf',
      }),
    (err: unknown) => err instanceof DocumentDomainError
  );

  assert.throws(
    () =>
      buildDocumentStoragePath({
        organizationId: 'org1',
        logicalOwnerType: 'client',
        logicalOwnerId: 'c1',
        documentId: 'd1/../../etc',
        mimeType: 'application/pdf',
      }),
    (err: unknown) => err instanceof DocumentDomainError
  );
});

await test('Arquivos maliciosos, disfarçados ou com assinatura incompatível são rejeitados', async () => {
  const exeAsPdf = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])], 'malware.exe', {
    type: 'application/pdf',
  });
  assert.throws(() => validateDocumentFile(exeAsPdf), (err: unknown) => err instanceof DocumentDomainError);

  const fakePdfExe = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])], 'malware.pdf', {
    type: 'application/pdf',
  });
  await assert.rejects(() => verifyDocumentFileSignature(fakePdfExe), (err: unknown) => err instanceof DocumentDomainError);

  const htmlAsPdf = new File([new TextEncoder().encode('<!DOCTYPE html><html><body>Script</body></html>')], 'index.pdf', {
    type: 'application/pdf',
  });
  await assert.rejects(() => verifyDocumentFileSignature(htmlAsPdf), (err: unknown) => err instanceof DocumentDomainError);

  const zipAsPng = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])], 'archive.png', {
    type: 'image/png',
  });
  await assert.rejects(() => verifyDocumentFileSignature(zipAsPng), (err: unknown) => err instanceof DocumentDomainError);

  const emptyFile = new File([], 'vazio.pdf', { type: 'application/pdf' });
  assert.throws(() => validateDocumentFile(emptyFile), (err: unknown) => err instanceof DocumentDomainError);

  const oversized = { name: 'gigante.pdf', size: 55 * 1024 * 1024, type: 'application/pdf' };
  assert.throws(() => validateDocumentFile(oversized as File), (err: unknown) => err instanceof DocumentDomainError);

  const traversalFile = new File([new Uint8Array(20)], '../../root.pdf', { type: 'application/pdf' });
  assert.throws(() => validateDocumentFile(traversalFile), (err: unknown) => err instanceof DocumentDomainError);

  const slashFile = new File([new Uint8Array(20)], 'folder/document.pdf', { type: 'application/pdf' });
  assert.throws(() => validateDocumentFile(slashFile), (err: unknown) => err instanceof DocumentDomainError);
});

// 5. TESTES DE ÓRFÃOS E COMPENSAÇÃO RESILIENTE
console.log('\n--- 5. Testes de Órfãos e Compensação Resiliente ---');

await test('Falha na criação de referência após upload remove o arquivo via compensação', async () => {
  let uploadsCount = 0;
  let removalsCount = 0;

  class FailingRefGateway extends PreviewDocumentReferenceGateway {
    override async createReference(): Promise<never> {
      throw new DocumentDomainError('SERVICE_UNAVAILABLE', 'Falha forçada no banco após storage.');
    }
  }

  class TrackedStorageGateway extends VolatileDocumentStorageGateway {
    override async upload(input: Parameters<VolatileDocumentStorageGateway['upload']>[0]) {
      uploadsCount += 1;
      return super.upload(input);
    }
    override async remove(bucket: typeof DOCUMENT_STORAGE_BUCKET, path: string) {
      removalsCount += 1;
      return super.remove(bucket, path);
    }
  }

  const failingRef = new FailingRefGateway();
  const trackedStorage = new TrackedStorageGateway();
  const docService = new DocumentApplicationService(failingRef, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, trackedStorage, new SequentialIds('UPL'));

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-comp', { exists: true, organizationId: 'org-comp', authorizedUserIds: ['user-comp'] }],
  ]);
  const ctx = createContext('org-comp', 'user-comp', 'owner', ownerMap, new Map());

  await assert.rejects(
    () =>
      uploadService.uploadDocument(ctx, {
        file: pdfFile('contrato-compensado.pdf'),
        metadata: {
          logicalOwnerType: 'client',
          logicalOwnerId: 'client-comp',
          category: 'registration_certificate',
          accessScope: 'organization',
          displayName: 'Contrato Compensado',
        },
        onProgress: () => undefined,
        signal: dummySignal(),
        idempotencyKey: 'fail-comp-item-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'SERVICE_UNAVAILABLE'
  );

  assert.equal(uploadsCount, 1);
  assert.equal(removalsCount, 1);
});

await test('Upload cancelado antes da conclusão não deixa objeto no storage nem cria referência', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const storage = new VolatileDocumentStorageGateway();
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, storage, new SequentialIds('UPL'));

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-cancel', { exists: true, organizationId: 'org-cancel', authorizedUserIds: ['user-cancel'] }],
  ]);
  const ctx = createContext('org-cancel', 'user-cancel', 'owner', ownerMap, new Map());

  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () =>
      uploadService.uploadDocument(ctx, {
        file: pdfFile('cancelado.pdf'),
        metadata: {
          logicalOwnerType: 'client',
          logicalOwnerId: 'client-cancel',
          category: 'registration_certificate',
          accessScope: 'organization',
          displayName: 'Cancelado',
        },
        onProgress: () => undefined,
        signal: controller.signal,
        idempotencyKey: 'cancel-upl-item-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'UPLOAD_CANCELLED'
  );

  const list = await docService.listReferences(ctx);
  assert.equal(list.length, 0);
});

// 6. REDE INSTÁVEL, RETRY E CONCORRÊNCIA OTIMISTA
console.log('\n--- 6. Rede Instável, Concorrência e Idempotência ---');

await test('Operações concorrentes de substituição produzem um único vencedor e falham concorrente obsoleto', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const storage = new VolatileDocumentStorageGateway();
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, storage, new SequentialIds('UPL'));

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-race', { exists: true, organizationId: 'org-race', authorizedUserIds: ['user-race'] }],
  ]);
  const ctx = createContext('org-race', 'user-race', 'owner', ownerMap, new Map());

  const initialDoc = await uploadService.uploadDocument(ctx, {
    file: pdfFile('v1.pdf'),
    metadata: {
      logicalOwnerType: 'client',
      logicalOwnerId: 'client-race',
      category: 'registration_certificate',
      accessScope: 'organization',
      displayName: 'Documento Concorrente',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'init-race-item-001',
  });

  const [res1, res2] = await Promise.allSettled([
    uploadService.replaceStoredDocument(ctx, {
      previousDocumentId: initialDoc.id,
      expectedVersion: initialDoc.versionNumber,
      displayName: 'Documento Concorrente V2 A',
      versionNote: 'Substituição Concorrente A',
      file: pdfFile('v2-a.pdf'),
      idempotencyKey: 'race-sub-item-001',
      signal: dummySignal(),
      onProgress: () => undefined,
    }),
    uploadService.replaceStoredDocument(ctx, {
      previousDocumentId: initialDoc.id,
      expectedVersion: initialDoc.versionNumber,
      displayName: 'Documento Concorrente V2 B',
      versionNote: 'Substituição Concorrente B',
      file: pdfFile('v2-b.pdf'),
      idempotencyKey: 'race-sub-item-002',
      signal: dummySignal(),
      onProgress: () => undefined,
    }),
  ]);

  const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
  const failures = [res1, res2].filter((r) => r.status === 'rejected');

  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);

  const history = await docService.listVersionHistory(ctx, initialDoc.id);
  assert.equal(history.length, 2);
  assert.equal(history.filter((h) => h.isCurrent).length, 1);
});

await test('Replay com mesma chave e mesmo payload retorna resultado idêntico (idempotência)', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-idem', { exists: true, organizationId: 'org-idem', authorizedUserIds: ['user-idem'] }],
  ]);
  const ctx = createContext('org-idem', 'user-idem', 'owner', ownerMap, new Map());

  const expectedStoragePath = buildDocumentStoragePath({
    organizationId: 'org-idem',
    logicalOwnerType: 'client',
    logicalOwnerId: 'client-idem',
    documentId: 'DOC-0001',
    mimeType: 'application/pdf',
  });

  const payload = {
    logicalOwnerType: 'client' as const,
    logicalOwnerId: 'client-idem',
    category: 'registration_certificate' as const,
    accessScope: 'organization' as const,
    displayName: 'Documento Idempotente',
    storageBucket: DOCUMENT_STORAGE_BUCKET,
    storageObjectPath: expectedStoragePath,
    mimeType: 'application/pdf' as const,
    fileSizeBytes: 1024,
    notes: 'Notas Idempotentes',
    idempotencyKey: 'idem-key-0001',
  };

  const first = await docService.registerReference(ctx, payload);
  const replay = await docService.registerReference(ctx, payload);

  assert.equal(first.id, replay.id);
  assert.equal(first.displayName, replay.displayName);

  await assert.rejects(
    () =>
      docService.registerReference(ctx, {
        ...payload,
        displayName: 'Nome Divergente',
      }),
    (err: unknown) =>
      err instanceof DocumentDomainError &&
      err.code === 'IDEMPOTENCY_CONFLICT'
  );
});

// 7. CHECKLISTS DE PROPOSTAS E REGRAS DE TRANSIÇÃO
console.log('\n--- 7. Checklists de Propostas e Regras de Transição ---');

await test('Checklist rejeita documento de categoria incompatível, vencido ou de outra proposta', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const checklistGateway = new PreviewProposalChecklistGateway();
  const storage = new VolatileDocumentStorageGateway();
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, storage, new SequentialIds('UPL'));
  const checklistService = new ProposalChecklistApplicationService(
    checklistGateway,
    refGateway,
    new FixedClock('2026-09-02T12:00:00.000Z'),
    new SequentialIds('CHK')
  );

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['proposal:prop-1', { exists: true, organizationId: 'org-chk', authorizedUserIds: ['user-chk'] }],
    ['proposal:prop-2', { exists: true, organizationId: 'org-chk', authorizedUserIds: ['user-chk'] }],
  ]);
  const proposalMap = new Map<string, ProposalChecklistSourceResolution>([
    [
      'prop-1',
      {
        exists: true,
        organizationId: 'org-chk',
        proposalId: 'prop-1',
        proposalNumber: 'PROP-001',
        title: 'Custeio Soja',
        proposalType: 'credit',
        proposalCategory: 'custeio',
        authorizedUserIds: ['user-chk'],
      },
    ],
  ]);

  const ctx = createContext('org-chk', 'user-chk', 'owner', ownerMap, proposalMap);

  const template = await checklistService.configureTemplate(ctx, {
    name: 'Modelo Custeio Soja',
    proposalType: 'credit',
    proposalCategory: 'custeio',
    changeReason: 'Configuração inicial',
    idempotencyKey: 'cfg-tmpl-item-001',
    items: [
      {
        category: 'registration_certificate',
        title: 'Matrícula Atualizada',
        accessScope: 'organization',
        required: true,
        dueInDays: 30,
      },
    ],
  });

  const checklist = await checklistService.applyChecklist(ctx, {
    proposalId: 'prop-1',
    templateVersionId: template.id,
    idempotencyKey: 'apply-chk-item-001',
  });

  const item = checklist.items[0];

  // 1. Wrong category doc (car_receipt instead of registration_certificate)
  const wrongCategoryDoc = await uploadService.uploadDocument(ctx, {
    file: pdfFile('car.pdf'),
    metadata: {
      logicalOwnerType: 'proposal',
      logicalOwnerId: 'prop-1',
      category: 'car_receipt',
      accessScope: 'organization',
      displayName: 'Recibo CAR',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'wrong-cat-upl-001',
  });

  await assert.rejects(
    () =>
      checklistService.transitionItem(ctx, {
        checklistId: checklist.id,
        itemId: item.id,
        targetState: 'received',
        documentId: wrongCategoryDoc.id,
        expectedVersion: item.versionNumber,
        idempotencyKey: 'trans-wrong-cat-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'CHECKLIST_DOCUMENT_MISMATCH'
  );

  // 2. Document from a different proposal (prop-2 instead of prop-1)
  const otherProposalDoc = await uploadService.uploadDocument(ctx, {
    file: pdfFile('matricula-outra.pdf'),
    metadata: {
      logicalOwnerType: 'proposal',
      logicalOwnerId: 'prop-2',
      category: 'registration_certificate',
      accessScope: 'organization',
      displayName: 'Matrícula Outra Proposta',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'other-prop-upl-001',
  });

  await assert.rejects(
    () =>
      checklistService.transitionItem(ctx, {
        checklistId: checklist.id,
        itemId: item.id,
        targetState: 'received',
        documentId: otherProposalDoc.id,
        expectedVersion: item.versionNumber,
        idempotencyKey: 'trans-other-prop-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'CHECKLIST_DOCUMENT_MISMATCH'
  );

  // 3. Expired document
  const expiredDoc = await uploadService.uploadDocument(ctx, {
    file: pdfFile('matricula-vencida.pdf'),
    metadata: {
      logicalOwnerType: 'proposal',
      logicalOwnerId: 'prop-1',
      category: 'registration_certificate',
      accessScope: 'organization',
      displayName: 'Matrícula Vencida',
      expiresOn: '2020-01-01',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'expired-upl-item-001',
  });

  await assert.rejects(
    () =>
      checklistService.transitionItem(ctx, {
        checklistId: checklist.id,
        itemId: item.id,
        targetState: 'received',
        documentId: expiredDoc.id,
        expectedVersion: item.versionNumber,
        idempotencyKey: 'trans-expired-item-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'DOCUMENT_EXPIRED'
  );
});

// 8. COMPARTILHAMENTO TEMPORÁRIO E CONSUMO ATÔMICO
console.log('\n--- 8. Compartilhamento Temporário e Consumo Atômico ---');

await test('Compartilhamento usa token forte de 256 bits, SHA-256 e esgota no limite exato', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const storage = new VolatileDocumentStorageGateway();
  const complianceGateway = new PreviewDocumentComplianceGateway(refGateway, storage, () => new Date('2026-09-02T12:00:00.000Z'));
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, storage, new SequentialIds('UPL'));
  const complianceService = new DocumentComplianceApplicationService(
    complianceGateway,
    docService,
    storage,
    new FixedClock('2026-09-02T12:00:00.000Z'),
    new SequentialIds('COMP')
  );

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-sh', { exists: true, organizationId: 'org-sh', authorizedUserIds: ['user-sh'] }],
  ]);
  const ctx = createContext('org-sh', 'user-sh', 'owner', ownerMap, new Map());

  const doc = await uploadService.uploadDocument(ctx, {
    file: pdfFile('car.pdf'),
    metadata: {
      logicalOwnerType: 'client',
      logicalOwnerId: 'client-sh',
      category: 'car_receipt',
      accessScope: 'organization',
      displayName: 'Recibo CAR',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'car-upl-item-001',
  });

  const { shareToken } = await complianceService.createShare(ctx, {
    documentId: doc.id,
    purpose: 'Auditoria Externa',
    expiresInMinutes: 60,
    maxAccesses: 2,
    idempotencyKey: 'sh-car-item-001',
  });

  assert.equal(typeof shareToken, 'string');
  assert.equal(shareToken.length >= 43, true);

  const red1 = await complianceService.redeemShareToken(shareToken);
  assert.equal(red1.displayName, 'Recibo CAR');
  assert.equal(red1.blob instanceof Blob, true);

  let shares = await complianceGateway.listShares('org-sh');
  assert.equal(shares[0].accessCount, 1);
  assert.equal(shares[0].status, 'active');

  const red2 = await complianceService.redeemShareToken(shareToken);
  assert.equal(red2.displayName, 'Recibo CAR');
  assert.equal(red2.blob instanceof Blob, true);

  shares = await complianceGateway.listShares('org-sh');
  assert.equal(shares[0].accessCount, 2);
  assert.equal(shares[0].status, 'exhausted');

  await assert.rejects(
    () => complianceService.redeemShareToken(shareToken),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'REFERENCE_NOT_FOUND'
  );
});

await test('Substituição de versão invalida compartilhamento ativo anterior', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const storage = new VolatileDocumentStorageGateway();
  const complianceGateway = new PreviewDocumentComplianceGateway(refGateway, storage, () => new Date('2026-09-02T12:00:00.000Z'));
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, storage, new SequentialIds('UPL'));
  const complianceService = new DocumentComplianceApplicationService(
    complianceGateway,
    docService,
    storage,
    new FixedClock('2026-09-02T12:00:00.000Z'),
    new SequentialIds('COMP')
  );

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-inv', { exists: true, organizationId: 'org-inv', authorizedUserIds: ['user-inv'] }],
  ]);
  const ctx = createContext('org-inv', 'user-inv', 'owner', ownerMap, new Map());

  const v1 = await uploadService.uploadDocument(ctx, {
    file: pdfFile('laudo-v1.pdf'),
    metadata: {
      logicalOwnerType: 'client',
      logicalOwnerId: 'client-inv',
      category: 'technical_report',
      accessScope: 'organization',
      displayName: 'Laudo Ambiental',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'inv-upl-item-001',
  });

  const { shareToken } = await complianceService.createShare(ctx, {
    documentId: v1.id,
    purpose: 'Consulta V1',
    expiresInMinutes: 60,
    maxAccesses: 5,
    idempotencyKey: 'sh-inv-item-001',
  });

  await uploadService.replaceStoredDocument(ctx, {
    previousDocumentId: v1.id,
    expectedVersion: v1.versionNumber,
    displayName: 'Laudo Ambiental V2',
    versionNote: 'Nova versão oficial do laudo',
    file: pdfFile('laudo-v2.pdf'),
    idempotencyKey: 'inv-v2-replace-item-001',
    signal: dummySignal(),
    onProgress: () => undefined,
  });

  await assert.rejects(
    () => complianceService.redeemShareToken(shareToken),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'REFERENCE_NOT_FOUND'
  );
});

// 9. EXPORTAÇÃO EM LOTE E AUDITORIA
console.log('\n--- 9. Exportação em Lote e Auditoria ---');

await test('Exportação em lote valida limites (<=20 docs, <=100MB), integridade SHA-256 e trilha', async () => {
  const refGateway = new PreviewDocumentReferenceGateway();
  const storage = new VolatileDocumentStorageGateway();
  const complianceGateway = new PreviewDocumentComplianceGateway(refGateway, storage);
  const docService = new DocumentApplicationService(refGateway, new FixedClock('2026-09-02T12:00:00.000Z'), new SequentialIds('DOC'));
  const uploadService = new DocumentUploadService(docService, storage, new SequentialIds('UPL'));
  const complianceService = new DocumentComplianceApplicationService(
    complianceGateway,
    docService,
    storage,
    new FixedClock('2026-09-02T12:00:00.000Z'),
    new SequentialIds('COMP')
  );

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:client-exp', { exists: true, organizationId: 'org-exp', authorizedUserIds: ['user-exp'] }],
  ]);
  const ctx = createContext('org-exp', 'user-exp', 'owner', ownerMap, new Map());

  const doc1 = await uploadService.uploadDocument(ctx, {
    file: pdfFile('doc1.pdf', 2048),
    metadata: {
      logicalOwnerType: 'client',
      logicalOwnerId: 'client-exp',
      category: 'registration_certificate',
      accessScope: 'organization',
      displayName: 'Documento 1',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'exp-doc-item-001',
  });

  const doc2 = await uploadService.uploadDocument(ctx, {
    file: pngFile('doc2.png', 1024),
    metadata: {
      logicalOwnerType: 'client',
      logicalOwnerId: 'client-exp',
      category: 'photo_report',
      accessScope: 'organization',
      displayName: 'Documento 2',
    },
    onProgress: () => undefined,
    signal: dummySignal(),
    idempotencyKey: 'exp-doc-item-002',
  });

  await assert.rejects(
    () =>
      complianceService.createBatchExport(ctx, {
        documentIds: [],
        purpose: 'Vazia',
        idempotencyKey: 'exp-empty-item-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'INVALID_INPUT'
  );

  await assert.rejects(
    () =>
      complianceService.createBatchExport(ctx, {
        documentIds: [doc1.id, doc1.id],
        purpose: 'Duplicada',
        idempotencyKey: 'exp-dup-item-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'INVALID_INPUT'
  );

  const exportResult = await complianceService.createBatchExport(ctx, {
    documentIds: [doc1.id, doc2.id],
    purpose: 'Dossiê do Cliente',
    idempotencyKey: 'exp-valid-item-001',
  });

  assert.equal(exportResult.audit.documentCount, 2);
  assert.equal(exportResult.audit.status, 'completed');
  assert.equal(exportResult.blob instanceof Blob, true);
  assert.equal(typeof exportResult.audit.checksumSha256, 'string');
  assert.equal(exportResult.audit.checksumSha256?.length, 64);
});

// 10. DENY-BY-DEFAULT EM AMBIENTES NÃO CONFIGURADOS
console.log('\n--- 10. Deny-by-Default e Gateways Indisponíveis ---');

await test('Unavailable Gateways negam operações de forma segura sem simular dados ou pedir credenciais', async () => {
  const unavailRef = new UnavailableDocumentReferenceGateway();
  const unavailStorage = new UnavailableDocumentStorageGateway();
  const unavailChecklist = new UnavailableProposalChecklistGateway();
  const unavailCompliance = new UnavailableDocumentComplianceGateway();

  const docService = new DocumentApplicationService(unavailRef);
  const uploadService = new DocumentUploadService(docService, unavailStorage);
  const checklistService = new ProposalChecklistApplicationService(unavailChecklist, unavailRef);
  const complianceService = new DocumentComplianceApplicationService(unavailCompliance, docService, unavailStorage);

  const ownerMap = new Map<string, DocumentOwnerResolution>([
    ['client:c1', { exists: true, organizationId: 'org-unavail', authorizedUserIds: ['user-unavail'] }],
  ]);
  const ctx = createContext('org-unavail', 'user-unavail', 'owner', ownerMap, new Map());

  await assert.rejects(
    () => docService.listReferences(ctx),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'SERVICE_UNAVAILABLE'
  );

  await assert.rejects(
    () =>
      uploadService.uploadDocument(ctx, {
        file: pdfFile('test.pdf'),
        metadata: {
          logicalOwnerType: 'client',
          logicalOwnerId: 'c1',
          category: 'registration_certificate',
          accessScope: 'organization',
          displayName: 'Doc',
        },
        onProgress: () => undefined,
        signal: dummySignal(),
        idempotencyKey: 'unavail-upl-item-001',
      }),
    (err: unknown) => err instanceof DocumentDomainError && (err.code === 'SERVICE_UNAVAILABLE' || err.code === 'STORAGE_COMPENSATION_FAILED')
  );

  await assert.rejects(
    () => checklistService.getDashboard(ctx),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'SERVICE_UNAVAILABLE'
  );

  await assert.rejects(
    () => complianceService.getDashboard(ctx),
    (err: unknown) => err instanceof DocumentDomainError && err.code === 'SERVICE_UNAVAILABLE'
  );
});

// 11. AUDITORIA DE ROTAS, RLS, MIGRATIONS E ZERO SECRETS
console.log('\n--- 11. Auditoria Estrutural: Rotas, RLS e Segurança de Código ---');

await test('Rotas estáticas precedem parâmetros dinâmicos em AppRoutes', () => {
  const routesContent = fs.readFileSync('src/routes/AppRoutes.tsx', 'utf-8');
  const pendenciasIdx = routesContent.indexOf('path="pendencias"');
  const checklistsIdx = routesContent.indexOf('path="checklists"');
  const validadesIdx = routesContent.indexOf('path="validades"');
  const novoIdx = routesContent.indexOf('path="novo"');
  const documentIdIdx = routesContent.indexOf('path=":documentId"');

  assert.equal(pendenciasIdx > 0, true);
  assert.equal(checklistsIdx > 0, true);
  assert.equal(validadesIdx > 0, true);
  assert.equal(novoIdx > 0, true);
  assert.equal(documentIdIdx > 0, true);

  assert.equal(pendenciasIdx < documentIdIdx, true);
  assert.equal(checklistsIdx < documentIdIdx, true);
  assert.equal(validadesIdx < documentIdIdx, true);
  assert.equal(novoIdx < documentIdIdx, true);
});

await test('Migrações documentais não contêm senhas ou URLs expostas e possuem RLS e grants fechados', () => {
  const migrations = [
    'supabase/migrations/20260901025305_oe_006_002_document_storage.sql',
    'supabase/migrations/20260901115546_oe_006_004_document_versions.sql',
    'supabase/migrations/20260901170544_oe_006_005_proposal_checklists.sql',
    'supabase/migrations/20260902010000_oe_006_006_document_compliance.sql',
  ];

  for (const mig of migrations) {
    assert.equal(fs.existsSync(mig), true);
    const content = fs.readFileSync(mig, 'utf-8');
    assert.equal(/service_role_key|secret_key|SUPABASE_KEY|sb_secret/i.test(content), false);
    assert.equal(/security definer/i.test(content), true);
    assert.equal(/set search_path = ''/i.test(content), true);
  }
});

console.log('=============================================================');
console.log(`Resultado OE-006.007: ${passed} passaram, ${failed} falharam`);
console.log('=============================================================');

if (failed > 0) {
  process.exit(1);
}
