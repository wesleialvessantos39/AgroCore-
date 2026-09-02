import type {
  DocumentAlertPolicy,
  DocumentExportAudit,
  DocumentShareGrant,
  RedeemedDocumentShare,
} from '../../types/documentCompliance';
import { DOCUMENT_STORAGE_BUCKET, DocumentDomainError } from '../../types/documents';
import type {
  CompleteDocumentExportRecord,
  ConfigureDocumentAlertPolicyRecord,
  CreateDocumentExportRecord,
  CreateDocumentShareRecord,
  DocumentComplianceGateway,
  FailDocumentExportRecord,
  RevokeDocumentShareRecord,
} from '../documentComplianceGateway';
import type { DocumentReferenceGateway } from '../documentGateway';
import type { DocumentStorageGateway } from '../documentStorageGateway';
import { calculateDocumentSha256 } from '../crypto';

interface Receipt {
  readonly payloadHash: string;
  readonly resultId: string;
}

function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
}

function clonePolicy(policy: DocumentAlertPolicy): DocumentAlertPolicy {
  return structuredClone(policy);
}

function cloneGrant(grant: DocumentShareGrant): DocumentShareGrant {
  return structuredClone(grant);
}

function cloneAudit(audit: DocumentExportAudit): DocumentExportAudit {
  return structuredClone(audit);
}

/** Persistência volátil, vazia e isolada, usada somente no modo de desenvolvimento. */
export class PreviewDocumentComplianceGateway implements DocumentComplianceGateway {
  private readonly policies = new Map<string, DocumentAlertPolicy>();
  private readonly shares = new Map<string, Map<string, DocumentShareGrant>>();
  private readonly shareTokens = new Map<string, { readonly organizationId: string; readonly shareId: string }>();
  private readonly exports = new Map<string, Map<string, DocumentExportAudit>>();
  private readonly receipts = new Map<string, Receipt>();

  constructor(
    private readonly documentGateway: DocumentReferenceGateway,
    private readonly storageGateway: DocumentStorageGateway,
    private readonly now: () => Date = () => new Date()
  ) {}

  private shareStore(organizationId: string): Map<string, DocumentShareGrant> {
    const existing = this.shares.get(organizationId);
    if (existing) return existing;
    const created = new Map<string, DocumentShareGrant>();
    this.shares.set(organizationId, created);
    return created;
  }

  private exportStore(organizationId: string): Map<string, DocumentExportAudit> {
    const existing = this.exports.get(organizationId);
    if (existing) return existing;
    const created = new Map<string, DocumentExportAudit>();
    this.exports.set(organizationId, created);
    return created;
  }

  private receiptKey(organizationId: string, operation: string, idempotencyKey: string): string {
    return `${organizationId}:${operation}:${idempotencyKey}`;
  }

  private replay(
    organizationId: string,
    operation: string,
    idempotencyKey: string,
    payloadHash: string
  ): string | null {
    const receipt = this.receipts.get(this.receiptKey(organizationId, operation, idempotencyKey));
    if (!receipt) return null;
    if (receipt.payloadHash !== payloadHash) {
      throw new DocumentDomainError(
        'IDEMPOTENCY_CONFLICT',
        'A operação já foi usada com informações diferentes.'
      );
    }
    return receipt.resultId;
  }

  private remember(
    organizationId: string,
    operation: string,
    idempotencyKey: string,
    payloadHash: string,
    resultId: string
  ): void {
    this.receipts.set(this.receiptKey(organizationId, operation, idempotencyKey), {
      payloadHash,
      resultId,
    });
  }

  async getAlertPolicy(organizationId: string, signal?: AbortSignal): Promise<DocumentAlertPolicy | null> {
    aborted(signal);
    const policy = this.policies.get(organizationId);
    return policy ? clonePolicy(policy) : null;
  }

  async configureAlertPolicy(input: ConfigureDocumentAlertPolicyRecord): Promise<DocumentAlertPolicy> {
    const replayId = this.replay(
      input.policy.organizationId,
      'configure-alert-policy',
      input.idempotencyKey,
      input.payloadHash
    );
    if (replayId) {
      const replay = this.policies.get(input.policy.organizationId);
      if (!replay || replay.organizationId !== replayId) {
        throw new DocumentDomainError('INVALID_STATE', 'A política anterior não está disponível.');
      }
      return clonePolicy(replay);
    }
    const current = this.policies.get(input.policy.organizationId);
    if ((current?.versionNumber ?? 0) !== input.expectedVersion) {
      throw new DocumentDomainError('VERSION_CONFLICT', 'A política de alertas foi alterada.');
    }
    if (input.policy.versionNumber !== input.expectedVersion + 1) {
      throw new DocumentDomainError('INVALID_STATE', 'A nova versão da política é inválida.');
    }
    this.policies.set(input.policy.organizationId, Object.freeze(clonePolicy(input.policy)));
    this.remember(
      input.policy.organizationId,
      'configure-alert-policy',
      input.idempotencyKey,
      input.payloadHash,
      input.policy.organizationId
    );
    return clonePolicy(input.policy);
  }

  async listShares(organizationId: string, signal?: AbortSignal): Promise<readonly DocumentShareGrant[]> {
    aborted(signal);
    return [...this.shareStore(organizationId).values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
      .map(cloneGrant);
  }

  async createShare(input: CreateDocumentShareRecord): Promise<DocumentShareGrant> {
    const replayId = this.replay(
      input.grant.organizationId,
      'create-share',
      input.idempotencyKey,
      input.payloadHash
    );
    const store = this.shareStore(input.grant.organizationId);
    if (replayId) {
      const replay = store.get(replayId);
      if (!replay) throw new DocumentDomainError('INVALID_STATE', 'O compartilhamento anterior não está disponível.');
      return cloneGrant(replay);
    }
    if (!/^[a-f0-9]{64}$/.test(input.tokenHash) || this.shareTokens.has(input.tokenHash)) {
      throw new DocumentDomainError('INVALID_INPUT', 'Identificador do compartilhamento inválido.');
    }
    const document = await this.documentGateway.getReferenceById(
      input.grant.organizationId,
      input.grant.documentId
    );
    if (
      !document ||
      !document.isCurrent ||
      document.status !== 'active' ||
      document.storageState !== 'stored' ||
      document.logicalDocumentId !== input.grant.logicalDocumentId
    ) {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Documento atual não encontrado.');
    }
    store.set(input.grant.id, Object.freeze(cloneGrant(input.grant)));
    this.shareTokens.set(input.tokenHash, {
      organizationId: input.grant.organizationId,
      shareId: input.grant.id,
    });
    this.remember(
      input.grant.organizationId,
      'create-share',
      input.idempotencyKey,
      input.payloadHash,
      input.grant.id
    );
    return cloneGrant(input.grant);
  }

  async revokeShare(input: RevokeDocumentShareRecord): Promise<DocumentShareGrant> {
    const replayId = this.replay(
      input.organizationId,
      'revoke-share',
      input.idempotencyKey,
      input.payloadHash
    );
    const store = this.shareStore(input.organizationId);
    if (replayId) {
      const replay = store.get(replayId);
      if (!replay) throw new DocumentDomainError('INVALID_STATE', 'A revogação anterior não está disponível.');
      return cloneGrant(replay);
    }
    const current = store.get(input.shareId);
    if (!current) throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Compartilhamento não encontrado.');
    if (current.status !== 'active') {
      throw new DocumentDomainError('INVALID_STATE', 'Somente um compartilhamento ativo pode ser revogado.');
    }
    if (current.accessCount !== input.expectedAccessCount) {
      throw new DocumentDomainError('VERSION_CONFLICT', 'O compartilhamento recebeu outro acesso.');
    }
    const revoked: DocumentShareGrant = {
      ...current,
      status: 'revoked',
      revokedAt: input.revokedAt,
      revokedByUserId: input.actorUserId,
      revocationReason: input.reason,
    };
    store.set(revoked.id, Object.freeze(cloneGrant(revoked)));
    this.remember(
      input.organizationId,
      'revoke-share',
      input.idempotencyKey,
      input.payloadHash,
      revoked.id
    );
    return cloneGrant(revoked);
  }

  async redeemShareToken(token: string, signal?: AbortSignal): Promise<RedeemedDocumentShare> {
    aborted(signal);
    const tokenHash = await calculateDocumentSha256(token);
    const pointer = this.shareTokens.get(tokenHash);
    if (!pointer) throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Este acesso não está disponível.');
    const store = this.shareStore(pointer.organizationId);
    const current = store.get(pointer.shareId);
    if (!current || current.status !== 'active') {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Este acesso não está disponível.');
    }
    const now = this.now();
    if (current.expiresAt <= now.toISOString()) {
      store.set(current.id, Object.freeze({ ...current, status: 'expired' }));
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Este acesso expirou.');
    }
    if (current.accessCount >= current.maxAccesses) {
      store.set(current.id, Object.freeze({ ...current, status: 'exhausted' }));
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Este acesso não está mais disponível.');
    }
    const document = await this.documentGateway.getReferenceById(pointer.organizationId, current.documentId);
    if (
      !document ||
      !document.isCurrent ||
      document.status !== 'active' ||
      document.storageState !== 'stored' ||
      document.storageBucket !== DOCUMENT_STORAGE_BUCKET ||
      !document.storageObjectPath ||
      (document.expiresOn && document.expiresOn < now.toISOString().slice(0, 10))
    ) {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'O documento compartilhado não está disponível.');
    }

    // A atualização ocorre antes do download, impedindo dois consumos além do limite.
    const accessCount = current.accessCount + 1;
    const consumed: DocumentShareGrant = {
      ...current,
      accessCount,
      lastAccessedAt: now.toISOString(),
      status: accessCount >= current.maxAccesses ? 'exhausted' : 'active',
    };
    store.set(consumed.id, Object.freeze(cloneGrant(consumed)));
    const blob = await this.storageGateway.download({
      bucket: DOCUMENT_STORAGE_BUCKET,
      objectPath: document.storageObjectPath,
      signal,
    });
    return {
      displayName: document.displayName,
      mimeType: document.mimeType,
      blob,
    };
  }

  async listExports(organizationId: string, signal?: AbortSignal): Promise<readonly DocumentExportAudit[]> {
    aborted(signal);
    return [...this.exportStore(organizationId).values()]
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt) || left.id.localeCompare(right.id))
      .map(cloneAudit);
  }

  async createExport(input: CreateDocumentExportRecord): Promise<DocumentExportAudit> {
    const replayId = this.replay(
      input.audit.organizationId,
      'create-export',
      input.idempotencyKey,
      input.payloadHash
    );
    const store = this.exportStore(input.audit.organizationId);
    if (replayId) {
      const replay = store.get(replayId);
      if (!replay) throw new DocumentDomainError('INVALID_STATE', 'A exportação anterior não está disponível.');
      return cloneAudit(replay);
    }
    for (const documentId of input.audit.documentIds) {
      const document = await this.documentGateway.getReferenceById(input.audit.organizationId, documentId);
      if (!document || !document.isCurrent || document.status !== 'active' || document.storageState !== 'stored') {
        throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Um documento da seleção não está disponível.');
      }
    }
    store.set(input.audit.id, Object.freeze(cloneAudit(input.audit)));
    this.remember(
      input.audit.organizationId,
      'create-export',
      input.idempotencyKey,
      input.payloadHash,
      input.audit.id
    );
    return cloneAudit(input.audit);
  }

  async completeExport(input: CompleteDocumentExportRecord): Promise<DocumentExportAudit> {
    const store = this.exportStore(input.organizationId);
    const current = store.get(input.exportId);
    if (!current) throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Exportação não encontrada.');
    if (current.requestedByUserId !== input.actorUserId || current.status !== 'preparing') {
      throw new DocumentDomainError('INVALID_STATE', 'A exportação não pode ser concluída.');
    }
    const completed: DocumentExportAudit = {
      ...current,
      status: 'completed',
      completedAt: input.completedAt,
      fileSizeBytes: input.fileSizeBytes,
      checksumSha256: input.checksumSha256,
    };
    store.set(completed.id, Object.freeze(cloneAudit(completed)));
    return cloneAudit(completed);
  }

  async failExport(input: FailDocumentExportRecord): Promise<DocumentExportAudit> {
    const store = this.exportStore(input.organizationId);
    const current = store.get(input.exportId);
    if (!current) throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Exportação não encontrada.');
    if (current.requestedByUserId !== input.actorUserId || current.status !== 'preparing') {
      throw new DocumentDomainError('INVALID_STATE', 'A exportação não pode ser encerrada.');
    }
    const failed: DocumentExportAudit = {
      ...current,
      status: 'failed',
      completedAt: input.failedAt,
      failureReason: input.failureReason,
    };
    store.set(failed.id, Object.freeze(cloneAudit(failed)));
    return cloneAudit(failed);
  }

  clearAllSessionData(): void {
    this.policies.clear();
    this.shares.clear();
    this.shareTokens.clear();
    this.exports.clear();
    this.receipts.clear();
  }
}
