import type {
  DocumentReference,
  DocumentReferenceListQuery,
} from '../types/documents';

export interface CreateDocumentRecord {
  readonly reference: DocumentReference;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export interface ReplaceDocumentRecord extends CreateDocumentRecord {
  readonly previousDocumentId: string;
  readonly expectedVersion: number;
}

export interface ArchiveDocumentRecord {
  readonly organizationId: string;
  readonly documentId: string;
  readonly expectedVersion: number;
  readonly archivedAt: string;
  readonly archivedByUserId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export interface DocumentReferenceGateway {
  listReferences(
    query: DocumentReferenceListQuery,
    signal?: AbortSignal
  ): Promise<readonly DocumentReference[]>;
  getReferenceById(
    organizationId: string,
    documentId: string
  ): Promise<DocumentReference | null>;
  createReference(input: CreateDocumentRecord): Promise<DocumentReference>;
  replaceReference(input: ReplaceDocumentRecord): Promise<DocumentReference>;
  archiveReference(input: ArchiveDocumentRecord): Promise<DocumentReference>;
  clearAllSessionData?(): void;
}

