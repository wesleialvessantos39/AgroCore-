import type { OrganizationRole } from './auth';
import type { Permission } from './authorization';

/**
 * Contratos canônicos do Módulo 006 — Gestão Documental.
 *
 * Nesta fundação o AgroCore registra somente metadados e referências. Nenhum
 * byte, Blob, Base64, arquivo bruto ou URL de download integra o agregado.
 */
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

export interface DocumentReference {
  readonly id: DocumentReferenceId;
  readonly organizationId: string;
  readonly logicalOwnerType: DocumentLogicalOwnerType;
  readonly logicalOwnerId: string;
  readonly category: DocumentCategory;
  readonly displayName: string;
  readonly mimeType: DocumentMimeType;
  readonly fileSizeBytes: number;
  readonly accessScope: DocumentAccessScope;
  readonly status: DocumentReferenceStatus;
  readonly versionNumber: number;
  readonly predecessorDocumentId?: DocumentReferenceId;
  readonly issuedOn?: string;
  readonly expiresOn?: string;
  readonly notes?: string;
  readonly storageState: 'metadata_only';
  readonly metadataChecksumSha256: string;
  readonly createdByUserId: string;
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
  readonly fileSizeBytes: number;
  readonly accessScope: DocumentAccessScope;
  readonly issuedOn?: string;
  readonly expiresOn?: string;
  readonly notes?: string;
  readonly idempotencyKey: string;
}

export interface ReplaceDocumentReferenceInput {
  readonly previousDocumentId: DocumentReferenceId;
  readonly expectedVersion: number;
  readonly displayName: string;
  readonly mimeType: DocumentMimeType;
  readonly fileSizeBytes: number;
  readonly issuedOn?: string;
  readonly expiresOn?: string;
  readonly notes?: string;
  readonly idempotencyKey: string;
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

export interface DocumentOwnerResolution {
  readonly exists: boolean;
  readonly organizationId: string | null;
  readonly authorizedUserIds: readonly string[];
}

export interface DocumentApplicationContext {
  readonly organizationId: string;
  readonly actor: {
    readonly userId: string;
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
  | 'document.reference.replaced'
  | 'document.reference.archived';

export interface DocumentDomainEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly eventType: DocumentDomainEventType;
  readonly documentId: DocumentReferenceId;
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

