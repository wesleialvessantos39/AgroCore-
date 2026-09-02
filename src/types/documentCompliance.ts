import type { DocumentApplicationContext, DocumentMimeType, DocumentReference } from './documents';

export interface DocumentAlertPolicy {
  readonly organizationId: string;
  readonly warningDays: number;
  readonly criticalDays: number;
  readonly versionNumber: number;
  readonly updatedByUserId: string;
  readonly updatedByDisplayName: string;
  readonly updatedAt: string;
}

export type DocumentAlertSeverity = 'warning' | 'critical' | 'expired';

export interface DocumentValidityAlert {
  readonly document: DocumentReference;
  readonly severity: DocumentAlertSeverity;
  /** Negativo quando a validade já terminou. */
  readonly daysRemaining: number;
}

export type DocumentShareStatus = 'active' | 'revoked' | 'expired' | 'exhausted';

export interface DocumentShareGrant {
  readonly id: string;
  readonly organizationId: string;
  readonly documentId: string;
  readonly logicalDocumentId: string;
  readonly documentDisplayName: string;
  readonly purpose: string;
  readonly status: DocumentShareStatus;
  readonly expiresAt: string;
  readonly maxAccesses: number;
  readonly accessCount: number;
  readonly createdByUserId: string;
  readonly createdByDisplayName: string;
  readonly createdAt: string;
  readonly lastAccessedAt?: string;
  readonly revokedAt?: string;
  readonly revokedByUserId?: string;
  readonly revocationReason?: string;
}

export interface CreateDocumentShareInput {
  readonly documentId: string;
  readonly expiresInMinutes: number;
  readonly maxAccesses: number;
  readonly purpose: string;
  readonly idempotencyKey: string;
}

export interface CreateDocumentShareResult {
  readonly grant: DocumentShareGrant;
  /** O token existe apenas nesta resposta e nunca é persistido em texto puro. */
  readonly shareToken: string;
  readonly sharePath: string;
}

export interface RevokeDocumentShareInput {
  readonly shareId: string;
  readonly reason: string;
  readonly expectedAccessCount: number;
  readonly idempotencyKey: string;
}

export interface RedeemedDocumentShare {
  readonly displayName: string;
  readonly mimeType: DocumentMimeType;
  readonly urlExpiresAt?: string;
  readonly downloadUrl?: string;
  readonly blob?: Blob;
}

export type DocumentExportStatus = 'preparing' | 'completed' | 'failed';

export interface DocumentExportAudit {
  readonly id: string;
  readonly organizationId: string;
  readonly documentIds: readonly string[];
  readonly documentCount: number;
  readonly purpose: string;
  readonly status: DocumentExportStatus;
  readonly requestedByUserId: string;
  readonly requestedByDisplayName: string;
  readonly requestedAt: string;
  readonly completedAt?: string;
  readonly fileSizeBytes?: number;
  readonly checksumSha256?: string;
  readonly failureReason?: string;
}

export interface CreateDocumentBatchExportInput {
  readonly documentIds: readonly string[];
  readonly purpose: string;
  readonly idempotencyKey: string;
}

export interface DocumentBatchExportResult {
  readonly audit: DocumentExportAudit;
  readonly blob: Blob;
  readonly fileName: string;
}

export interface DocumentComplianceDashboard {
  readonly generatedAt: string;
  readonly policy: DocumentAlertPolicy;
  readonly availableDocuments: readonly DocumentReference[];
  readonly alerts: readonly DocumentValidityAlert[];
  readonly shares: readonly DocumentShareGrant[];
  readonly exports: readonly DocumentExportAudit[];
  readonly totals: {
    readonly warnings: number;
    readonly critical: number;
    readonly expired: number;
    readonly activeShares: number;
  };
}

export interface ConfigureDocumentAlertPolicyInput {
  readonly warningDays: number;
  readonly criticalDays: number;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export type DocumentComplianceApplicationContext = DocumentApplicationContext;
