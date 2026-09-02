import { ROLE_PERMISSIONS_SET_MAP } from '../authorization/permissionsMatrix';
import type { Permission } from '../types/authorization';
import type {
  ConfigureDocumentAlertPolicyInput,
  CreateDocumentBatchExportInput,
  CreateDocumentShareInput,
  CreateDocumentShareResult,
  DocumentAlertPolicy,
  DocumentBatchExportResult,
  DocumentComplianceApplicationContext,
  DocumentComplianceDashboard,
  DocumentExportAudit,
  DocumentShareGrant,
  DocumentValidityAlert,
  RedeemedDocumentShare,
  RevokeDocumentShareInput,
} from '../types/documentCompliance';
import {
  DOCUMENT_STORAGE_BUCKET,
  DocumentDomainError,
  type DocumentReference,
} from '../types/documents';
import {
  calculateDocumentSha256,
  canonicalDocumentJson,
  type DocumentClock,
  type DocumentIdGenerator,
  SecureDocumentIdGenerator,
  SystemDocumentClock,
} from './crypto';
import type { DocumentComplianceGateway } from './documentComplianceGateway';
import { getDocumentComplianceGateway } from './documentComplianceGatewayFactory';
import { DocumentApplicationService, evaluateDocumentValidity } from './documentApplicationService';
import type { DocumentStorageGateway } from './documentStorageGateway';
import { getDocumentStorageGateway } from './documentStorageGatewayFactory';

const MANAGEMENT_ROLES = new Set(['owner', 'company_admin', 'manager']);
const MAX_EXPORT_BYTES = 100 * 1024 * 1024;
const MIN_SHARE_MINUTES = 5;
const MAX_SHARE_MINUTES = 7 * 24 * 60;
const TOKEN_EXPRESSION = /^[A-Za-z0-9_-]{43}$/;

function compactText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') {
    throw new DocumentDomainError('INVALID_INPUT', `${field} deve ser informado.`);
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (
    normalized.length < min ||
    normalized.length > max ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    throw new DocumentDomainError('INVALID_INPUT', `${field} possui formato inválido.`);
  }
  return normalized;
}

function positiveInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new DocumentDomainError('INVALID_INPUT', `${field} deve ficar entre ${min} e ${max}.`);
  }
  return value;
}

function operationKey(value: unknown): string {
  const key = compactText(value, 'Chave da operação', 8, 200);
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Chave da operação possui formato inválido.');
  }
  return key;
}

function actorDisplayName(context: DocumentComplianceApplicationContext): string {
  const value = context.actor.displayName?.replace(/\s+/g, ' ').trim();
  return value && value.length >= 3 && value.length <= 120 ? value : 'Integrante da equipe';
}

function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateDifference(expiresOn: string, now: Date): number {
  const today = Date.parse(`${utcDate(now)}T00:00:00.000Z`);
  const expiry = Date.parse(`${expiresOn}T00:00:00.000Z`);
  return Math.floor((expiry - today) / 86_400_000);
}

function randomShareToken(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new DocumentDomainError('INVALID_STATE', 'Gerador seguro indisponível para o compartilhamento.');
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Bytes(blob: Blob, signal?: AbortSignal): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new DocumentDomainError('INVALID_STATE', 'Verificação de integridade indisponível.');
  }
  if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
  const bytes = await blob.arrayBuffer();
  if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function cloneGrant(grant: DocumentShareGrant): DocumentShareGrant {
  return structuredClone(grant);
}

function cloneAudit(audit: DocumentExportAudit): DocumentExportAudit {
  return structuredClone(audit);
}

function projectedShare(grant: DocumentShareGrant, now: Date): DocumentShareGrant {
  if (grant.status !== 'active') return cloneGrant(grant);
  if (grant.accessCount >= grant.maxAccesses) return { ...cloneGrant(grant), status: 'exhausted' };
  if (grant.expiresAt <= now.toISOString()) return { ...cloneGrant(grant), status: 'expired' };
  return cloneGrant(grant);
}

export class DocumentComplianceApplicationService {
  constructor(
    private readonly gateway: DocumentComplianceGateway = getDocumentComplianceGateway(),
    private readonly documentService: DocumentApplicationService = new DocumentApplicationService(),
    private readonly storageGateway: DocumentStorageGateway = getDocumentStorageGateway(),
    private readonly clock: DocumentClock = SystemDocumentClock,
    private readonly idGenerator: DocumentIdGenerator = SecureDocumentIdGenerator
  ) {}

  private assertPermission(
    context: DocumentComplianceApplicationContext,
    permission: Permission
  ): void {
    if (!context.organizationId || !context.actor.userId) {
      throw new DocumentDomainError('UNAUTHENTICATED', 'Sessão organizacional inválida.');
    }
    if (!context.actor.isActive || context.actor.role === 'none') {
      throw new DocumentDomainError('INACTIVE_MEMBERSHIP', 'Vínculo organizacional inativo.');
    }
    const canonical = ROLE_PERMISSIONS_SET_MAP.get(context.actor.role);
    if (!canonical?.has(permission) || !context.actor.permissions.includes(permission)) {
      throw new DocumentDomainError('FORBIDDEN', 'Operação documental não autorizada.');
    }
  }

  private defaultPolicy(context: DocumentComplianceApplicationContext): DocumentAlertPolicy {
    return {
      organizationId: context.organizationId,
      warningDays: 30,
      criticalDays: 7,
      versionNumber: 0,
      updatedByUserId: 'system',
      updatedByDisplayName: 'Política padrão',
      updatedAt: this.clock.now().toISOString(),
    };
  }

  async getAlertPolicy(
    context: DocumentComplianceApplicationContext,
    signal?: AbortSignal
  ): Promise<DocumentAlertPolicy> {
    this.assertPermission(context, 'documents:view');
    return (
      (await this.gateway.getAlertPolicy(context.organizationId, signal)) ??
      this.defaultPolicy(context)
    );
  }

  private async storedCurrentDocument(
    context: DocumentComplianceApplicationContext,
    documentId: string
  ): Promise<DocumentReference> {
    const reference = await this.documentService.getReferenceById(
      context,
      compactText(documentId, 'Documento', 1, 160)
    );
    if (!reference || !reference.isCurrent || reference.status !== 'active') {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Documento atual não encontrado.');
    }
    if (
      reference.storageState !== 'stored' ||
      reference.storageBucket !== DOCUMENT_STORAGE_BUCKET ||
      !reference.storageObjectPath
    ) {
      throw new DocumentDomainError('INVALID_STATE', 'O arquivo deste documento ainda não está disponível.');
    }
    if (evaluateDocumentValidity(reference, this.clock.now()) === 'expired') {
      throw new DocumentDomainError('DOCUMENT_EXPIRED', 'Documento vencido não pode sair do AgroCore.');
    }
    return reference;
  }

  async getDashboard(
    context: DocumentComplianceApplicationContext,
    signal?: AbortSignal
  ): Promise<DocumentComplianceDashboard> {
    this.assertPermission(context, 'documents:view');
    const [policy, documents, shares, exports] = await Promise.all([
      this.getAlertPolicy(context, signal),
      this.documentService.listReferences(context, { status: 'active' }, signal),
      this.gateway.listShares(context.organizationId, signal),
      this.gateway.listExports(context.organizationId, signal),
    ]);
    const now = this.clock.now();
    const alerts: DocumentValidityAlert[] = [];
    for (const document of documents) {
      if (!document.expiresOn) continue;
      const daysRemaining = dateDifference(document.expiresOn, now);
      if (daysRemaining > policy.warningDays) continue;
      alerts.push({
        document: structuredClone(document),
        daysRemaining,
        severity:
          daysRemaining < 0 ? 'expired' : daysRemaining <= policy.criticalDays ? 'critical' : 'warning',
      });
    }
    alerts.sort(
      (left, right) =>
        left.daysRemaining - right.daysRemaining ||
        left.document.displayName.localeCompare(right.document.displayName, 'pt-BR')
    );
    const isManagement = MANAGEMENT_ROLES.has(context.actor.role);
    const accessibleLogicalDocumentIds = new Set(
      documents.map((document) => document.logicalDocumentId)
    );
    const visibleShares = isManagement
      ? shares
      : context.actor.role === 'project_designer' || context.actor.role === 'capturer'
        ? shares.filter(
            (grant) =>
              grant.createdByUserId === context.actor.userId &&
              accessibleLogicalDocumentIds.has(grant.logicalDocumentId)
          )
        : [];
    const visibleExports = isManagement
      ? exports
      : exports.filter((audit) => audit.requestedByUserId === context.actor.userId);
    const projectedShares = visibleShares.map((grant) => projectedShare(grant, now));
    return {
      generatedAt: now.toISOString(),
      policy: structuredClone(policy),
      availableDocuments: documents.map((document) => structuredClone(document)),
      alerts,
      shares: projectedShares,
      exports: visibleExports.map(cloneAudit),
      totals: {
        warnings: alerts.filter((alert) => alert.severity === 'warning').length,
        critical: alerts.filter((alert) => alert.severity === 'critical').length,
        expired: alerts.filter((alert) => alert.severity === 'expired').length,
        activeShares: projectedShares.filter((grant) => grant.status === 'active').length,
      },
    };
  }

  async configureAlertPolicy(
    context: DocumentComplianceApplicationContext,
    command: ConfigureDocumentAlertPolicyInput
  ): Promise<DocumentAlertPolicy> {
    this.assertPermission(context, 'documents:manage_validity');
    const warningDays = positiveInteger(command.warningDays, 'Aviso antecipado', 1, 3650);
    const criticalDays = positiveInteger(command.criticalDays, 'Aviso crítico', 0, 365);
    const expectedVersion = positiveInteger(command.expectedVersion, 'Versão esperada', 0, 2_147_483_647);
    if (criticalDays > warningDays) {
      throw new DocumentDomainError('INVALID_INPUT', 'O aviso crítico não pode anteceder o aviso geral.');
    }
    const now = this.clock.now().toISOString();
    const policy: DocumentAlertPolicy = {
      organizationId: context.organizationId,
      warningDays,
      criticalDays,
      versionNumber: expectedVersion + 1,
      updatedByUserId: context.actor.userId,
      updatedByDisplayName: actorDisplayName(context),
      updatedAt: now,
    };
    const idempotencyKey = operationKey(command.idempotencyKey);
    const payloadHash = await calculateDocumentSha256(canonicalDocumentJson(policy));
    return this.gateway.configureAlertPolicy({
      policy,
      expectedVersion,
      idempotencyKey,
      payloadHash,
    });
  }

  async createShare(
    context: DocumentComplianceApplicationContext,
    command: CreateDocumentShareInput
  ): Promise<CreateDocumentShareResult> {
    this.assertPermission(context, 'documents:share');
    const reference = await this.storedCurrentDocument(context, command.documentId);
    const expiresInMinutes = positiveInteger(
      command.expiresInMinutes,
      'Duração do acesso',
      MIN_SHARE_MINUTES,
      MAX_SHARE_MINUTES
    );
    const maxAccesses = positiveInteger(command.maxAccesses, 'Quantidade de acessos', 1, 20);
    const purpose = compactText(command.purpose, 'Finalidade', 3, 240);
    const idempotencyKey = operationKey(command.idempotencyKey);
    const now = this.clock.now();
    let expiresAtMs = now.getTime() + expiresInMinutes * 60_000;
    if (reference.expiresOn) {
      const documentLimit = Date.parse(`${reference.expiresOn}T23:59:59.999Z`);
      expiresAtMs = Math.min(expiresAtMs, documentLimit);
    }
    if (expiresAtMs - now.getTime() < MIN_SHARE_MINUTES * 60_000) {
      throw new DocumentDomainError(
        'DOCUMENT_EXPIRED',
        'A validade restante não comporta um compartilhamento seguro.'
      );
    }
    const shareToken = randomShareToken();
    const tokenHash = await calculateDocumentSha256(shareToken);
    const grant: DocumentShareGrant = {
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      documentId: reference.id,
      logicalDocumentId: reference.logicalDocumentId,
      documentDisplayName: reference.displayName,
      purpose,
      status: 'active',
      expiresAt: new Date(expiresAtMs).toISOString(),
      maxAccesses,
      accessCount: 0,
      createdByUserId: context.actor.userId,
      createdByDisplayName: actorDisplayName(context),
      createdAt: now.toISOString(),
    };
    const payloadHash = await calculateDocumentSha256(
      canonicalDocumentJson({ grant, tokenHash })
    );
    const created = await this.gateway.createShare({
      grant,
      tokenHash,
      idempotencyKey,
      payloadHash,
    });
    if (created.documentId !== reference.id || created.organizationId !== context.organizationId) {
      throw new DocumentDomainError('INVALID_STATE', 'O compartilhamento retornado é inconsistente.');
    }
    return {
      grant: cloneGrant(created),
      shareToken,
      sharePath: `/compartilhar/documento#${shareToken}`,
    };
  }

  async revokeShare(
    context: DocumentComplianceApplicationContext,
    command: RevokeDocumentShareInput
  ): Promise<DocumentShareGrant> {
    this.assertPermission(context, 'documents:share');
    const shareId = compactText(command.shareId, 'Compartilhamento', 1, 160);
    const reason = compactText(command.reason, 'Motivo da revogação', 3, 240);
    const expectedAccessCount = positiveInteger(
      command.expectedAccessCount,
      'Quantidade esperada de acessos',
      0,
      20
    );
    const current = (await this.gateway.listShares(context.organizationId)).find(
      (grant) => grant.id === shareId
    );
    if (!current) {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Compartilhamento não encontrado.');
    }
    if (!MANAGEMENT_ROLES.has(context.actor.role) && current.createdByUserId !== context.actor.userId) {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Compartilhamento não encontrado.');
    }
    if (current.status !== 'active') {
      throw new DocumentDomainError('INVALID_STATE', 'Somente um acesso ativo pode ser revogado.');
    }
    const idempotencyKey = operationKey(command.idempotencyKey);
    const revokedAt = this.clock.now().toISOString();
    const payloadHash = await calculateDocumentSha256(
      canonicalDocumentJson({
        organizationId: context.organizationId,
        shareId,
        actorUserId: context.actor.userId,
        reason,
        expectedAccessCount,
      })
    );
    return this.gateway.revokeShare({
      organizationId: context.organizationId,
      shareId,
      actorUserId: context.actor.userId,
      reason,
      expectedAccessCount,
      revokedAt,
      idempotencyKey,
      payloadHash,
    });
  }

  async redeemShareToken(token: string, signal?: AbortSignal): Promise<RedeemedDocumentShare> {
    const normalized = typeof token === 'string' ? token.trim() : '';
    if (!TOKEN_EXPRESSION.test(normalized)) {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Este acesso não está disponível.');
    }
    const redeemed = await this.gateway.redeemShareToken(normalized, signal);
    if (redeemed.downloadUrl) {
      let url: URL;
      try {
        url = new URL(redeemed.downloadUrl);
      } catch {
        throw new DocumentDomainError('INVALID_STATE', 'O endereço temporário retornado é inválido.');
      }
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
        throw new DocumentDomainError('INVALID_STATE', 'O endereço temporário retornado não é confiável.');
      }
    }
    return redeemed;
  }

  async createBatchExport(
    context: DocumentComplianceApplicationContext,
    command: CreateDocumentBatchExportInput,
    signal?: AbortSignal
  ): Promise<DocumentBatchExportResult> {
    this.assertPermission(context, 'documents:export');
    if (!Array.isArray(command.documentIds)) {
      throw new DocumentDomainError('INVALID_INPUT', 'Selecione os documentos da exportação.');
    }
    const documentIds = command.documentIds.map((documentId) =>
      compactText(documentId, 'Documento selecionado', 1, 160)
    );
    if (documentIds.length < 1 || documentIds.length > 20 || new Set(documentIds).size !== documentIds.length) {
      throw new DocumentDomainError('INVALID_INPUT', 'Selecione entre 1 e 20 documentos sem repetições.');
    }
    const purpose = compactText(command.purpose, 'Finalidade', 3, 240);
    const idempotencyKey = operationKey(command.idempotencyKey);
    const documents = await Promise.all(
      documentIds.map((documentId) => this.storedCurrentDocument(context, documentId))
    );
    const declaredBytes = documents.reduce((total, document) => total + (document.fileSizeBytes ?? 0), 0);
    if (declaredBytes > MAX_EXPORT_BYTES) {
      throw new DocumentDomainError('INVALID_INPUT', 'A seleção ultrapassa o limite de 100 MiB.');
    }
    const requestedAt = this.clock.now().toISOString();
    const audit: DocumentExportAudit = {
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      documentIds,
      documentCount: documentIds.length,
      purpose,
      status: 'preparing',
      requestedByUserId: context.actor.userId,
      requestedByDisplayName: actorDisplayName(context),
      requestedAt,
    };
    const payloadHash = await calculateDocumentSha256(canonicalDocumentJson(audit));
    const created = await this.gateway.createExport({ audit, idempotencyKey, payloadHash });

    try {
      const entries = [];
      let actualBytes = 0;
      for (const document of documents) {
        if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
        const blob = await this.storageGateway.download({
          bucket: DOCUMENT_STORAGE_BUCKET,
          objectPath: document.storageObjectPath!,
          signal,
        });
        actualBytes += blob.size;
        if (actualBytes > MAX_EXPORT_BYTES) {
          throw new DocumentDomainError('INVALID_INPUT', 'Os arquivos ultrapassam o limite de 100 MiB.');
        }
        entries.push({
          documentId: document.id,
          displayName: document.displayName,
          mimeType: document.mimeType,
          blob,
        });
      }
      const { createDocumentZip } = await import('./documentZip');
      const blob = await createDocumentZip(entries, signal);
      const checksumSha256 = await sha256Bytes(blob, signal);
      const completedAt = this.clock.now().toISOString();
      const completed = await this.gateway.completeExport({
        organizationId: context.organizationId,
        exportId: created.id,
        actorUserId: context.actor.userId,
        fileSizeBytes: blob.size,
        checksumSha256,
        completedAt,
      });
      return {
        audit: cloneAudit(completed),
        blob,
        fileName: `documentos_agrocore_${utcDate(this.clock.now())}_${created.id.slice(0, 8)}.zip`,
      };
    } catch (error) {
      try {
        await this.gateway.failExport({
          organizationId: context.organizationId,
          exportId: created.id,
          actorUserId: context.actor.userId,
          failureReason: error instanceof DOMException && error.name === 'AbortError'
            ? 'Exportação cancelada antes da conclusão.'
            : 'Não foi possível montar todos os arquivos selecionados.',
          failedAt: this.clock.now().toISOString(),
        });
      } catch {
        // O erro original continua sendo a informação mais útil para o usuário.
      }
      throw error;
    }
  }

  mayRevokeAnyShare(context: DocumentComplianceApplicationContext): boolean {
    return MANAGEMENT_ROLES.has(context.actor.role);
  }
}
