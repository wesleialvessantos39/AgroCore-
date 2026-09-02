import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import type { DocumentClock, DocumentIdGenerator } from '../src/documents/crypto.ts';
import { DocumentApplicationService } from '../src/documents/documentApplicationService.ts';
import { DocumentComplianceApplicationService } from '../src/documents/documentComplianceApplicationService.ts';
import { PreviewDocumentComplianceGateway } from '../src/documents/preview/previewDocumentComplianceGateway.ts';
import { PreviewDocumentReferenceGateway } from '../src/documents/preview/previewDocumentReferenceGateway.ts';
import { DocumentUploadService } from '../src/documents/documentUploadService.ts';
import { VolatileDocumentStorageGateway } from '../src/documents/volatileDocumentStorageGateway.ts';
import type { OrganizationRole } from '../src/types/auth.ts';
import {
  DocumentDomainError,
  type DocumentApplicationContext,
  type DocumentCategory,
  type DocumentLogicalOwnerType,
  type DocumentOwnerResolution,
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

function assertSqlStructure(filePath: string): void {
  const source = readFileSync(filePath, 'utf8');
  const withoutQuotedText = source
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
  const dollarTags = withoutQuotedText.match(/\$[A-Za-z0-9_]*\$/g) ?? [];
  const tagCounts = new Map<string, number>();
  for (const tag of dollarTags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  for (const [tag, count] of tagCounts) {
    assert.equal(count % 2, 0, `${filePath}: delimitador ${tag} sem par`);
  }

  const structural = withoutQuotedText.replace(/\$[A-Za-z0-9_]*\$/g, '');
  let parentheses = 0;
  for (const character of structural) {
    if (character === '(') parentheses += 1;
    if (character === ')') parentheses -= 1;
    assert.ok(parentheses >= 0, `${filePath}: parêntese de fechamento excedente`);
  }
  assert.equal(parentheses, 0, `${filePath}: parênteses sem fechamento`);

  for (const block of structural.matchAll(/\bdeclare\b([\s\S]*?)\bbegin\b/gi)) {
    const declared = new Set<string>();
    for (const declaration of block[1]!.split(';')) {
      const name = declaration.match(/^\s*(v_[a-z0-9_]+)\b/i)?.[1]?.toLowerCase();
      if (!name) continue;
      assert.equal(declared.has(name), false, `${filePath}: variável ${name} duplicada`);
      declared.add(name);
    }
  }
  assert.match(source.trimEnd(), /;$/, `${filePath}: migração sem ponto e vírgula final`);
}

class MutableClock implements DocumentClock {
  constructor(private value = new Date('2026-09-02T12:00:00.000Z')) {}
  now(): Date { return new Date(this.value); }
  set(value: string): void { this.value = new Date(value); }
}

class UuidSequence implements DocumentIdGenerator {
  private value = 0;
  generate(): string {
    this.value += 1;
    return `00000000-0000-4000-8000-${String(this.value).padStart(12, '0')}`;
  }
}

const owners = new Map<string, DocumentOwnerResolution>([
  ['client:client-a', { exists: true, organizationId: 'organization-a', authorizedUserIds: ['capturer-a', 'designer-a'] }],
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

function pdfFile(label: string): File {
  return new File([
    new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]),
    label,
  ], `${label}.pdf`, { type: 'application/pdf' });
}

function harness() {
  const clock = new MutableClock();
  const references = new PreviewDocumentReferenceGateway();
  const storage = new VolatileDocumentStorageGateway();
  const documents = new DocumentApplicationService(references, clock, new UuidSequence());
  const uploads = new DocumentUploadService(documents, storage, new UuidSequence());
  const gateway = new PreviewDocumentComplianceGateway(references, storage, () => clock.now());
  const compliance = new DocumentComplianceApplicationService(
    gateway,
    documents,
    storage,
    clock,
    new UuidSequence()
  );
  return { clock, references, storage, documents, uploads, gateway, compliance };
}

async function upload(
  uploads: DocumentUploadService,
  suffix: string,
  options: { expiresOn?: string; category?: DocumentCategory; accessScope?: 'organization' | 'participants' } = {}
) {
  return uploads.uploadDocument(context('manager', 'manager-a'), {
    file: pdfFile(suffix),
    metadata: {
      logicalOwnerType: 'client',
      logicalOwnerId: 'client-a',
      category: options.category ?? 'registration_certificate',
      displayName: `Documento ${suffix}`,
      accessScope: options.accessScope ?? 'participants',
      issuedOn: '2026-01-01',
      expiresOn: options.expiresOn,
    },
    idempotencyKey: `upload-compliance-${suffix}`,
    signal: new AbortController().signal,
    onProgress: () => undefined,
  });
}

console.log('=============================================================');
console.log('Suíte comportamental OE-006.006 — Validades e Saídas');
console.log('=============================================================');

await test('Matriz separa configuração, compartilhamento e exportação', () => {
  assert.equal(getRolePermissions('manager').includes('documents:manage_validity'), true);
  assert.equal(getRolePermissions('manager').includes('documents:share'), true);
  assert.equal(getRolePermissions('capturer').includes('documents:share'), true);
  assert.equal(getRolePermissions('finance').includes('documents:share'), false);
  assert.equal(getRolePermissions('finance').includes('documents:export'), true);
});

await test('Política padrão é segura e somente a gestão altera janelas versionadas', async () => {
  const { compliance } = harness();
  const initial = await compliance.getDashboard(context('manager', 'manager-a'));
  assert.equal(initial.policy.warningDays, 30);
  assert.equal(initial.policy.criticalDays, 7);
  assert.equal(initial.policy.versionNumber, 0);
  const configured = await compliance.configureAlertPolicy(context('manager', 'manager-a'), {
    warningDays: 60,
    criticalDays: 10,
    expectedVersion: 0,
    idempotencyKey: 'alert-policy-create-0001',
  });
  assert.equal(configured.versionNumber, 1);
  await expectCode('FORBIDDEN', () => compliance.configureAlertPolicy(context('capturer', 'capturer-a'), {
    warningDays: 90,
    criticalDays: 15,
    expectedVersion: 1,
    idempotencyKey: 'alert-policy-forbidden-0001',
  }));
});

await test('Alertas usam datas reais e distinguem aviso, crítico e vencido', async () => {
  const { compliance, uploads } = harness();
  await upload(uploads, 'aviso', { expiresOn: '2026-09-22' });
  await upload(uploads, 'critico', { expiresOn: '2026-09-06', category: 'car_receipt' });
  await upload(uploads, 'vencido', { expiresOn: '2026-09-01', category: 'technical_report' });
  const dashboard = await compliance.getDashboard(context('manager', 'manager-a'));
  assert.deepEqual(dashboard.alerts.map((item) => item.severity), ['expired', 'critical', 'warning']);
  assert.deepEqual(dashboard.totals, { warnings: 1, critical: 1, expired: 1, activeShares: 0 });
});

await test('Token tem 256 bits, não é enumerável e nunca aparece no histórico', async () => {
  const { compliance, uploads, gateway } = harness();
  const document = await upload(uploads, 'token', { expiresOn: '2027-01-01' });
  const tokens = new Set<string>();
  for (let index = 0; index < 8; index += 1) {
    const result = await compliance.createShare(context('manager', 'manager-a'), {
      documentId: document.id,
      expiresInMinutes: 60,
      maxAccesses: 1,
      purpose: `Análise externa ${index}`,
      idempotencyKey: `share-random-${index}-0001`,
    });
    assert.match(result.shareToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(result.sharePath, `/compartilhar/documento#${result.shareToken}`);
    tokens.add(result.shareToken);
    assert.equal(JSON.stringify(result.grant).includes(result.shareToken), false);
  }
  assert.equal(tokens.size, 8);
  const history = await gateway.listShares('organization-a');
  assert.equal([...tokens].some((token) => JSON.stringify(history).includes(token)), false);
});

await test('Acesso concede somente o arquivo indicado e respeita o limite atômico', async () => {
  const { compliance, uploads } = harness();
  const first = await upload(uploads, 'arquivo-a', { expiresOn: '2027-01-01' });
  await upload(uploads, 'arquivo-b', { expiresOn: '2027-01-01', category: 'car_receipt' });
  const share = await compliance.createShare(context('manager', 'manager-a'), {
    documentId: first.id,
    expiresInMinutes: 60,
    maxAccesses: 1,
    purpose: 'Conferência do arquivo indicado',
    idempotencyKey: 'share-exact-file-0001',
  });
  const redeemed = await compliance.redeemShareToken(share.shareToken);
  assert.equal(redeemed.displayName, first.displayName);
  assert.match(await redeemed.blob!.text(), /arquivo-a/);
  assert.doesNotMatch(await redeemed.blob!.text(), /arquivo-b/);
  await expectCode('REFERENCE_NOT_FOUND', () => compliance.redeemShareToken(share.shareToken));
  await expectCode('REFERENCE_NOT_FOUND', () => compliance.redeemShareToken(`${share.shareToken.slice(0, -1)}A`));
});

await test('Revogação encerra imediatamente o token sem apagar sua trilha', async () => {
  const { compliance, uploads } = harness();
  const document = await upload(uploads, 'revogacao', { expiresOn: '2027-01-01' });
  const share = await compliance.createShare(context('capturer', 'capturer-a'), {
    documentId: document.id,
    expiresInMinutes: 120,
    maxAccesses: 2,
    purpose: 'Envio controlado ao atendimento',
    idempotencyKey: 'share-revoke-create-0001',
  });
  const revoked = await compliance.revokeShare(context('capturer', 'capturer-a'), {
    shareId: share.grant.id,
    reason: 'Destinatário concluiu a conferência',
    expectedAccessCount: 0,
    idempotencyKey: 'share-revoke-command-0001',
  });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revokedByUserId, 'capturer-a');
  await expectCode('REFERENCE_NOT_FOUND', () => compliance.redeemShareToken(share.shareToken));
});

await test('Integrante não revoga acesso criado por outra pessoa', async () => {
  const { compliance, uploads } = harness();
  const document = await upload(uploads, 'ownership', { expiresOn: '2027-01-01' });
  const share = await compliance.createShare(context('manager', 'manager-a'), {
    documentId: document.id,
    expiresInMinutes: 60,
    maxAccesses: 2,
    purpose: 'Compartilhamento da gestão',
    idempotencyKey: 'share-owner-create-0001',
  });
  await expectCode('REFERENCE_NOT_FOUND', () => compliance.revokeShare(context('capturer', 'capturer-a'), {
    shareId: share.grant.id,
    reason: 'Tentativa fora da responsabilidade',
    expectedAccessCount: 0,
    idempotencyKey: 'share-owner-revoke-0001',
  }));
});

await test('Integrante não vê saídas criadas por outra pessoa da mesma organização', async () => {
  const { compliance, uploads } = harness();
  const document = await upload(uploads, 'historico-privado', { expiresOn: '2027-01-01' });
  await compliance.createShare(context('manager', 'manager-a'), {
    documentId: document.id,
    expiresInMinutes: 60,
    maxAccesses: 1,
    purpose: 'Acesso criado pela gestão',
    idempotencyKey: 'share-private-manager-0001',
  });
  const ownShare = await compliance.createShare(context('capturer', 'capturer-a'), {
    documentId: document.id,
    expiresInMinutes: 60,
    maxAccesses: 1,
    purpose: 'Acesso criado pelo captador',
    idempotencyKey: 'share-private-capturer-0001',
  });
  await compliance.createBatchExport(context('manager', 'manager-a'), {
    documentIds: [document.id],
    purpose: 'Exportação reservada à gestão',
    idempotencyKey: 'export-private-manager-0001',
  });
  const ownExport = await compliance.createBatchExport(context('capturer', 'capturer-a'), {
    documentIds: [document.id],
    purpose: 'Exportação do captador',
    idempotencyKey: 'export-private-capturer-0001',
  });

  const participantDashboard = await compliance.getDashboard(context('capturer', 'capturer-a'));
  assert.deepEqual(participantDashboard.shares.map((item) => item.id), [ownShare.grant.id]);
  assert.deepEqual(participantDashboard.exports.map((item) => item.id), [ownExport.audit.id]);

  const managementDashboard = await compliance.getDashboard(context('manager', 'manager-a'));
  assert.equal(managementDashboard.shares.length, 2);
  assert.equal(managementDashboard.exports.length, 2);
});

await test('Prazo do acesso nunca ultrapassa a validade do documento', async () => {
  const { compliance, uploads } = harness();
  const document = await upload(uploads, 'limite-validade', { expiresOn: '2026-09-02' });
  const share = await compliance.createShare(context('manager', 'manager-a'), {
    documentId: document.id,
    expiresInMinutes: 7 * 24 * 60,
    maxAccesses: 1,
    purpose: 'Acesso limitado pela validade',
    idempotencyKey: 'share-validity-limit-0001',
  });
  assert.equal(share.grant.expiresAt, '2026-09-02T23:59:59.999Z');
});

await test('Documento vencido não pode ser compartilhado nem exportado', async () => {
  const { compliance, uploads } = harness();
  const document = await upload(uploads, 'saida-vencida', { expiresOn: '2026-09-01' });
  await expectCode('DOCUMENT_EXPIRED', () => compliance.createShare(context('manager', 'manager-a'), {
    documentId: document.id,
    expiresInMinutes: 60,
    maxAccesses: 1,
    purpose: 'Tentativa com documento vencido',
    idempotencyKey: 'share-expired-0001',
  }));
  await expectCode('DOCUMENT_EXPIRED', () => compliance.createBatchExport(context('manager', 'manager-a'), {
    documentIds: [document.id],
    purpose: 'Tentativa de exportação vencida',
    idempotencyKey: 'export-expired-0001',
  }));
});

await test('Exportação gera ZIP e audita exatamente a seleção autorizada', async () => {
  const { compliance, uploads } = harness();
  const first = await upload(uploads, 'exportado-a', { expiresOn: '2027-01-01' });
  const second = await upload(uploads, 'exportado-b', { expiresOn: '2027-01-01', category: 'car_receipt' });
  const unselected = await upload(uploads, 'fora-da-selecao', { expiresOn: '2027-01-01', category: 'technical_report' });
  const result = await compliance.createBatchExport(context('manager', 'manager-a'), {
    documentIds: [second.id, first.id],
    purpose: 'Dossiê solicitado pelo cliente',
    idempotencyKey: 'export-selected-0001',
  });
  const signature = new Uint8Array(await result.blob.slice(0, 4).arrayBuffer());
  assert.deepEqual([...signature], [0x50, 0x4b, 0x03, 0x04]);
  const endSignature = new Uint8Array(await result.blob.slice(-22, -18).arrayBuffer());
  assert.deepEqual([...endSignature], [0x50, 0x4b, 0x05, 0x06]);
  const zipText = new TextDecoder().decode(await result.blob.arrayBuffer());
  assert.match(zipText, /exportado-a/);
  assert.match(zipText, /exportado-b/);
  assert.doesNotMatch(zipText, /fora-da-selecao/);
  assert.equal(result.audit.status, 'completed');
  assert.deepEqual(result.audit.documentIds, [second.id, first.id]);
  assert.equal(result.audit.documentIds.includes(unselected.id), false);
  assert.match(result.audit.checksumSha256 ?? '', /^[a-f0-9]{64}$/);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    compliance.createBatchExport(context('manager', 'manager-a'), {
      documentIds: [first.id],
      purpose: 'Exportação cancelada pelo responsável',
      idempotencyKey: 'export-cancelled-0001',
    }, controller.signal),
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError'
  );
  const dashboard = await compliance.getDashboard(context('manager', 'manager-a'));
  assert.equal(dashboard.exports.some((item) => item.status === 'failed'), true);
});

await test('Outra organização não usa identificador conhecido em compartilhamento ou lote', async () => {
  const { compliance, uploads } = harness();
  const document = await upload(uploads, 'isolamento', { expiresOn: '2027-01-01' });
  await expectCode('REFERENCE_NOT_FOUND', () => compliance.createShare(context('manager', 'manager-b', 'organization-b'), {
    documentId: document.id,
    expiresInMinutes: 60,
    maxAccesses: 1,
    purpose: 'Tentativa entre organizações',
    idempotencyKey: 'share-cross-org-0001',
  }));
  await expectCode('REFERENCE_NOT_FOUND', () => compliance.createBatchExport(context('manager', 'manager-b', 'organization-b'), {
    documentIds: [document.id],
    purpose: 'Tentativa de lote entre organizações',
    idempotencyKey: 'export-cross-org-0001',
  }));
});

await test('Migração mantém tokens privados, RLS e consumo exclusivo do serviço', () => {
  const sql = readFileSync('supabase/migrations/20260902010000_oe_006_006_document_compliance.sql', 'utf8');
  assert.match(sql, /create table if not exists agrocore_private\.document_share_tokens/i);
  assert.match(sql, /revoke all on table agrocore_private\.document_share_tokens\s+from public, anon, authenticated/i);
  assert.match(sql, /alter table public\.document_share_grants enable row level security/i);
  assert.match(sql, /alter table public\.document_export_audits enable row level security/i);
  assert.match(sql, /document_export_items_organization_idx/i);
  assert.match(sql, /document_compliance_receipts_share_idx/i);
  assert.match(sql, /for update of grant_row/i);
  assert.match(sql, /grant execute on function public\.agrocore_redeem_document_share\(text\)\s+to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.agrocore_redeem_document_share\(text\)\s+to (?:anon|authenticated)/i);
});

await test('Migrações documentais mantêm delimitadores, declarações e parênteses íntegros', () => {
  const migrations = readdirSync('supabase/migrations')
    .filter((name) => /oe_006_\d{3}.*\.sql$/i.test(name))
    .sort();
  assert.ok(migrations.length >= 4);
  for (const migration of migrations) {
    assertSqlStructure(`supabase/migrations/${migration}`);
  }
});

await test('Função pública recebe token bruto, calcula o hash e assina por apenas 60 segundos', () => {
  const edge = readFileSync('supabase/functions/document-share/index.ts', 'utf8');
  const config = readFileSync('supabase/config.toml', 'utf8');
  assert.match(edge, /body\.token/);
  assert.match(edge, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(edge, /expiresIn: 60/);
  assert.match(edge, /request\.body\.getReader\(\)/);
  assert.match(edge, /totalBytes \+= value\.byteLength/);
  assert.match(edge, /reader\.cancel\('request_too_large'\)/);
  assert.doesNotMatch(edge, /request\.text\(\)/);
  assert.match(edge, /Cache-Control': 'no-store/);
  assert.match(config, /\[functions\.document-share\][\s\S]*verify_jwt = false/);
  assert.doesNotMatch(edge, /VITE_SUPABASE|sb_secret_[A-Za-z0-9_-]+/);
});

await test('Endpoint interrompe corpo em fluxo sem Content-Length acima do limite', async () => {
  type EdgeHandler = (request: Request) => Response | Promise<Response>;
  const runtime = globalThis as typeof globalThis & {
    Deno?: {
      readonly env: { get(name: string): string | undefined };
      serve(handler: EdgeHandler): void;
    };
  };
  const previousDeno = runtime.Deno;
  let handler: EdgeHandler | null = null;
  runtime.Deno = {
    env: {
      get: (name) => {
        if (name === 'SUPABASE_URL') return 'https://abcdefghijklmnopqrst.supabase.co';
        if (name === 'SUPABASE_SECRET_KEYS') return JSON.stringify({ default: 'sb_secret_test-only' });
        return undefined;
      },
    },
    serve: (registeredHandler) => { handler = registeredHandler; },
  };
  try {
    await import('../supabase/functions/document-share/index.ts');
    if (!handler) throw new Error('A Edge Function não registrou o manipulador.');
    const request = new Request('https://example.test/functions/v1/document-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(300),
    });
    assert.equal(request.headers.get('content-length'), null);
    const result = await handler(request);
    assert.equal(result.status, 413);
    assert.deepEqual(await result.json(), { error: 'invalid_request' });
  } finally {
    if (previousDeno) runtime.Deno = previousDeno;
    else delete runtime.Deno;
  }
});

await test('Telas invalidam respostas antigas e bloqueiam consumo ou exportação duplicados', () => {
  const compliancePage = readFileSync('src/pages/DocumentCompliancePage.tsx', 'utf8');
  const sharedPage = readFileSync('src/pages/SharedDocumentPage.tsx', 'utf8');
  const documentsContext = readFileSync('src/documents/DocumentsContext.tsx', 'utf8');
  assert.match(compliancePage, /operationSequence\.current \+= 1/);
  assert.match(compliancePage, /operationInFlight\.current/);
  assert.match(
    compliancePage,
    /sequence !== operationSequence\.current[\s\S]{0,120}contextKey !== activeOperationContextKey\.current/
  );
  assert.match(compliancePage, /exportAbort\.current\?\.abort\(\)/);
  assert.match(sharedPage, /requestSequence\.current \+= 1/);
  assert.match(sharedPage, /if \(redeeming\.current\) return/);
  assert.match(sharedPage, /token !== activeToken\.current/);
  assert.match(documentsContext, /activeDocumentContextKeyRef/);
  assert.match(
    documentsContext,
    /mutationContextKey === activeDocumentContextKeyRef\.current/g
  );
});

await test('Rotas estáticas de validades e checklists precedem o detalhe documental', () => {
  const routes = readFileSync('src/routes/AppRoutes.tsx', 'utf8');
  const start = routes.indexOf('path={ROUTES.DOCUMENTS}');
  const section = routes.slice(start, routes.indexOf('path={ROUTES.MY_ACCOUNT}', start));
  assert(section.indexOf('path="validades"') < section.indexOf('path=":documentId"'));
  assert(section.indexOf('path="checklists"') < section.indexOf('path=":documentId"'));
  assert(routes.indexOf('path={ROUTES.DOCUMENT_SHARE}') < start);
  const paths = readFileSync('src/routes/paths.ts', 'utf8');
  assert.match(paths, /DOCUMENT_SHARE: '\/compartilhar\/documento'/);
  assert.doesNotMatch(paths, /DOCUMENT_SHARE: '[^']*:token/);
});

await test('Bundle de produção remove a factory volátil e preserva o gateway real', () => {
  const vite = readFileSync('vite.config.ts', 'utf8');
  assert.match(vite, /production-document-compliance-gateway-factory/);
  assert.match(vite, /new SupabaseDocumentComplianceGateway\(supabase\)/);
  assert.match(vite, /new UnavailableDocumentComplianceGateway\(\)/);
  assert.doesNotMatch(
    vite.slice(vite.indexOf("if (id === '\\0virtual:production-document-compliance-gateway-factory')")),
    /PreviewDocumentComplianceGateway/
  );
});

console.log('\n=============================================================');
console.log(`Resultado OE-006.006: ${passed} passaram, ${failed} falharam`);
console.log('=============================================================');
if (failed > 0) process.exit(1);
