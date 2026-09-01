import type { OrganizationRole } from './auth';
import type { Permission } from './authorization';

/** Contratos canônicos do Módulo 006 — Gestão Documental. */
export type DocumentReferenceId = string;

export type DocumentLogicalOwnerType =
  | 'client'
  | 'property'
  | 'appraisal_request'
  | 'appraisal'
  | 'proposal';

export type DocumentCategory =
  | 'registration_certificate'
  | 'car_receipt'
  | 'topography_map'
  | 'descriptive_memorial'
  | 'technical_report'
  | 'photo_report'
  | 'professional_record'
  | 'commercial_support'
  | 'other';

export type DocumentAccessScope = 'organization' | 'participants' | 'management';
export type DocumentReferenceStatus = 'active' | 'superseded' | 'archived';
export type DocumentStorageState = 'metadata_only' | 'stored';

export const DOCUMENT_STORAGE_BUCKET = 'organization-documents' as const;

export interface StoredDocumentDescriptor {
  readonly bucket: typeof DOCUMENT_STORAGE_BUCKET;
  readonly objectPath: string;
  readonly uploadedAt: string;
}

export interface DocumentReference {
  readonly id: DocumentReferenceId;
  /** Identidade estável compartilhada por todas as versões do mesmo documento. */
  readonly logicalDocumentId: DocumentReferenceId;
  readonly organizationId: string;
  readonly logicalOwnerType: DocumentLogicalOwnerType;
  readonly logicalOwnerId: string;
  readonly category: DocumentCategory;
  readonly displayName: string;
  readonly mimeType: DocumentMimeType;
  readonly fileSizeBytes?: number;
  readonly accessScope: DocumentAccessScope;
  readonly status: DocumentReferenceStatus;
  readonly isCurrent: boolean;
  readonly versionNumber: number;
  readonly predecessorDocumentId?: DocumentReferenceId;
  readonly versionNote: string;
  readonly issuedOn?: string;
  readonly expiresOn?: string;
  readonly notes?: string;
  readonly storageState: DocumentStorageState;
  readonly storageBucket?: typeof DOCUMENT_STORAGE_BUCKET;
  readonly storageObjectPath?: string;
  readonly storageUploadedAt?: string;
  readonly metadataChecksumSha256: string;
  readonly createdByUserId: string;
  readonly createdByDisplayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt?: string;
  readonly archivedByUserId?: string;
}

export type DocumentMimeType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/tiff';

export interface RegisterDocumentReferenceInput {
  readonly logicalOwnerType: DocumentLogicalOwnerType;
  readonly logicalOwnerId: string;
  readonly category: DocumentCategory;
  readonly displayName: string;
  readonly mimeType: DocumentMimeType;
  readonly fileSizeBytes?: number;
  readonly accessScope: DocumentAccessScope;
  readonly issuedOn?: string;
  readonly expiresOn?: string;
  readonly notes?: string;
  readonly idempotencyKey: string;
}

export interface RegisterStoredDocumentInput extends RegisterDocumentReferenceInput {
  readonly documentId: DocumentReferenceId;
  readonly storedObject: StoredDocumentDescriptor;
}

export type DocumentUploadMetadataInput = Omit<
  RegisterDocumentReferenceInput,
  'mimeType' | 'fileSizeBytes' | 'idempotencyKey'
>;

export type DocumentUploadState =
  | 'queued'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DocumentUploadProgress {
  readonly bytesUploaded: number;
  readonly bytesTotal: number;
  readonly percentage: number;
}

export interface DocumentUploadQueueItem extends DocumentUploadProgress {
  readonly id: string;
  readonly fileName: string;
  readonly state: DocumentUploadState;
  readonly error?: string;
  readonly documentId?: DocumentReferenceId;
}

export interface DocumentFileContent {
  readonly blob: Blob;
  readonly displayName: string;
  readonly mimeType: DocumentMimeType;
}

export interface ReplaceDocumentReferenceInput {
  readonly previousDocumentId: DocumentReferenceId;
  readonly expectedVersion: number;
  readonly displayName: string;
  readonly mimeType: DocumentMimeType;
  readonly fileSizeBytes?: number;
  readonly issuedOn?: string;
  readonly expiresOn?: string;
  readonly notes?: string;
  readonly versionNote: string;
  readonly idempotencyKey: string;
}

export interface RegisterStoredDocumentVersionInput extends ReplaceDocumentReferenceInput {
  readonly documentId: DocumentReferenceId;
  readonly storedObject: StoredDocumentDescriptor;
}

export interface ReplaceStoredDocumentCommandInput {
  readonly previousDocumentId: DocumentReferenceId;
  readonly expectedVersion: number;
  readonly displayName: string;
  readonly issuedOn?: string;
  readonly expiresOn?: string;
  readonly notes?: string;
  readonly versionNote: string;
}

export type DocumentVersionComparableField =
  | 'displayName'
  | 'mimeType'
  | 'fileSizeBytes'
  | 'issuedOn'
  | 'expiresOn'
  | 'notes';

export interface DocumentVersionMetadataChange {
  readonly field: DocumentVersionComparableField;
  readonly label: string;
  readonly previousValue: string;
  readonly currentValue: string;
}

export interface ArchiveDocumentReferenceInput {
  readonly documentId: DocumentReferenceId;
  readonly expectedVersion: number;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface DocumentReferenceFilters {
  readonly search?: string;
  readonly ownerType?: DocumentLogicalOwnerType | 'all';
  readonly category?: DocumentCategory | 'all';
  readonly status?: DocumentReferenceStatus | 'all';
}

export interface DocumentReferenceListQuery extends DocumentReferenceFilters {
  readonly organizationId: string;
}

export type DocumentValidityState =
  | 'no_expiration'
  | 'current'
  | 'expiring_soon'
  | 'expired';

export type DocumentRequirementStatus = 'open' | 'fulfilled' | 'waived' | 'cancelled';

export type DocumentRequirementEffectiveState =
  | 'pending'
  | 'overdue'
  | 'fulfilled'
  | 'document_expiring'
  | 'document_expired'
  | 'document_unavailable'
  | 'waived'
  | 'cancelled';

export interface DocumentRequirement {
  readonly id: string;
  readonly organizationId: string;
  readonly logicalOwnerType: DocumentLogicalOwnerType;
  readonly logicalOwnerId: string;
  readonly category: DocumentCategory;
  readonly title: string;
  readonly accessScope: DocumentAccessScope;
  readonly status: DocumentRequirementStatus;
  readonly dueOn?: string;
  readonly notes?: string;
  readonly linkedDocumentId?: DocumentReferenceId;
  readonly versionNumber: number;
  readonly integrityCodeSha256: string;
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt?: string;
  readonly resolvedByUserId?: string;
  readonly resolutionReason?: string;
}

export interface CreateDocumentRequirementInput {
  readonly logicalOwnerType: DocumentLogicalOwnerType;
  readonly logicalOwnerId: string;
  readonly category: DocumentCategory;
  readonly title: string;
  readonly accessScope: DocumentAccessScope;
  readonly dueOn?: string;
  readonly notes?: string;
  readonly idempotencyKey: string;
}

export interface FulfillDocumentRequirementInput {
  readonly requirementId: string;
  readonly documentId: DocumentReferenceId;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface ResolveDocumentRequirementInput {
  readonly requirementId: string;
  readonly expectedVersion: number;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface DocumentRequirementListQuery {
  readonly organizationId: string;
  readonly status?: DocumentRequirementStatus | 'all';
}

export interface DocumentRequirementProjection {
  readonly requirement: DocumentRequirement;
  readonly effectiveState: DocumentRequirementEffectiveState;
  readonly linkedDocument?: DocumentReference;
  readonly documentValidity?: DocumentValidityState;
}

export interface DocumentGovernanceDashboard {
  readonly generatedAt: string;
  readonly warningDays: number;
  readonly requirements: readonly DocumentRequirementProjection[];
  readonly availableDocuments: readonly DocumentReference[];
  readonly expiringDocuments: readonly DocumentReference[];
  readonly expiredDocuments: readonly DocumentReference[];
  readonly totals: {
    readonly pending: number;
    readonly overdue: number;
    readonly fulfilled: number;
    readonly attentionRequired: number;
    readonly waived: number;
  };
}

export interface DocumentOwnerResolution {
  readonly exists: boolean;
  readonly organizationId: string | null;
  readonly authorizedUserIds: readonly string[];
}

export interface DocumentApplicationContext {
  readonly organizationId: string;
  readonly actor: {
    readonly userId: string;
    readonly displayName?: string;
    readonly role: OrganizationRole;
    readonly isActive: boolean;
    readonly permissions: readonly Permission[];
  };
  readonly resolveOwner: (
    ownerType: DocumentLogicalOwnerType,
    ownerId: string
  ) => Promise<DocumentOwnerResolution>;
}

export type DocumentDomainEventType =
  | 'document.reference.registered'
  | 'document.file.stored'
  | 'document.file.removed'
  | 'document.reference.replaced'
  | 'document.reference.archived'
  | 'document.requirement.created'
  | 'document.requirement.fulfilled'
  | 'document.requirement.waived'
  | 'document.requirement.cancelled';

export interface DocumentDomainEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly eventType: DocumentDomainEventType;
  readonly documentId?: DocumentReferenceId;
  readonly requirementId?: string;
  readonly logicalOwnerType: DocumentLogicalOwnerType;
  readonly logicalOwnerId: string;
  readonly category: DocumentCategory;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export type DocumentDomainErrorCode =
  | 'INVALID_INPUT'
  | 'FORBIDDEN_PAYLOAD'
  | 'UNAUTHENTICATED'
  | 'INACTIVE_MEMBERSHIP'
  | 'FORBIDDEN'
  | 'OWNER_NOT_FOUND'
  | 'OWNER_ORGANIZATION_MISMATCH'
  | 'REFERENCE_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'DUPLICATE_ACTIVE_REFERENCE'
  | 'REQUIREMENT_NOT_FOUND'
  | 'DUPLICATE_OPEN_REQUIREMENT'
  | 'REQUIREMENT_MISMATCH'
  | 'REQUIREMENT_ALREADY_RESOLVED'
  | 'DOCUMENT_EXPIRED'
  | 'INVALID_FILE'
  | 'STORAGE_NOT_CONFIGURED'
  | 'STORAGE_UPLOAD_FAILED'
  | 'STORAGE_DOWNLOAD_FAILED'
  | 'STORAGE_COMPENSATION_FAILED'
  | 'UPLOAD_CANCELLED'
  | 'INVALID_STATE'
  | 'SERVICE_UNAVAILABLE';

export class DocumentDomainError extends Error {
  readonly code: DocumentDomainErrorCode;

  constructor(code: DocumentDomainErrorCode, message: string) {
    super(message);
    this.name = 'DocumentDomainError';
    this.code = code;
    Object.setPrototypeOf(this, DocumentDomainError.prototype);
  }
}

export const DOCUMENT_CATEGORY_LABELS: Readonly<Record<DocumentCategory, string>> = Object.freeze({
  registration_certificate: 'Certidão de matrícula',
  car_receipt: 'Recibo do CAR',
  topography_map: 'Planta topográfica',
  descriptive_memorial: 'Memorial descritivo',
  technical_report: 'Relatório técnico',
  photo_report: 'Relatório fotográfico',
  professional_record: 'Registro profissional',
  commercial_support: 'Comprovação comercial',
  other: 'Outro documento',
});

export const DOCUMENT_OWNER_LABELS: Readonly<Record<DocumentLogicalOwnerType, string>> = Object.freeze({
  client: 'Cliente',
  property: 'Imóvel',
  appraisal_request: 'Solicitação de laudo',
  appraisal: 'Laudo de avaliação',
  proposal: 'Proposta',
});
