import type {
  DocumentAlertPolicy,
  DocumentExportAudit,
  DocumentShareGrant,
  RedeemedDocumentShare,
} from '../types/documentCompliance';

export interface ConfigureDocumentAlertPolicyRecord {
  readonly policy: DocumentAlertPolicy;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export interface CreateDocumentShareRecord {
  readonly grant: DocumentShareGrant;
  readonly tokenHash: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export interface RevokeDocumentShareRecord {
  readonly organizationId: string;
  readonly shareId: string;
  readonly actorUserId: string;
  readonly reason: string;
  readonly expectedAccessCount: number;
  readonly revokedAt: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export interface CreateDocumentExportRecord {
  readonly audit: DocumentExportAudit;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export interface CompleteDocumentExportRecord {
  readonly organizationId: string;
  readonly exportId: string;
  readonly actorUserId: string;
  readonly fileSizeBytes: number;
  readonly checksumSha256: string;
  readonly completedAt: string;
}

export interface FailDocumentExportRecord {
  readonly organizationId: string;
  readonly exportId: string;
  readonly actorUserId: string;
  readonly failureReason: string;
  readonly failedAt: string;
}

export interface DocumentComplianceGateway {
  getAlertPolicy(organizationId: string, signal?: AbortSignal): Promise<DocumentAlertPolicy | null>;
  configureAlertPolicy(input: ConfigureDocumentAlertPolicyRecord): Promise<DocumentAlertPolicy>;
  listShares(organizationId: string, signal?: AbortSignal): Promise<readonly DocumentShareGrant[]>;
  createShare(input: CreateDocumentShareRecord): Promise<DocumentShareGrant>;
  revokeShare(input: RevokeDocumentShareRecord): Promise<DocumentShareGrant>;
  redeemShareToken(token: string, signal?: AbortSignal): Promise<RedeemedDocumentShare>;
  listExports(organizationId: string, signal?: AbortSignal): Promise<readonly DocumentExportAudit[]>;
  createExport(input: CreateDocumentExportRecord): Promise<DocumentExportAudit>;
  completeExport(input: CompleteDocumentExportRecord): Promise<DocumentExportAudit>;
  failExport(input: FailDocumentExportRecord): Promise<DocumentExportAudit>;
  clearAllSessionData?(): void;
}
