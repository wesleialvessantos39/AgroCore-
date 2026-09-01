import type {
  DocumentRequirement,
  DocumentRequirementListQuery,
  DocumentReference,
  DocumentReferenceListQuery,
} from '../types/documents';

export interface CreateDocumentRecord {
  readonly reference: DocumentReference;
  /** Participantes resolvidos pela camada de domínio; não integra o DTO público da versão. */
  readonly authorizedUserIds: readonly string[];
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

export interface CreateDocumentRequirementRecord {
  readonly requirement: DocumentRequirement;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export interface ResolveDocumentRequirementRecord {
  readonly requirement: DocumentRequirement;
  readonly expectedVersion: number;
  readonly operation: 'fulfill' | 'waive' | 'cancel';
  readonly linkedDocumentId?: string;
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
  listVersionHistory(
    organizationId: string,
    logicalDocumentId: string,
    signal?: AbortSignal
  ): Promise<readonly DocumentReference[]>;
  createReference(input: CreateDocumentRecord): Promise<DocumentReference>;
  replaceReference(input: ReplaceDocumentRecord): Promise<DocumentReference>;
  archiveReference(input: ArchiveDocumentRecord): Promise<DocumentReference>;
  listRequirements(
    query: DocumentRequirementListQuery,
    signal?: AbortSignal
  ): Promise<readonly DocumentRequirement[]>;
  getRequirementById(
    organizationId: string,
    requirementId: string
  ): Promise<DocumentRequirement | null>;
  createRequirement(input: CreateDocumentRequirementRecord): Promise<DocumentRequirement>;
  resolveRequirement(input: ResolveDocumentRequirementRecord): Promise<DocumentRequirement>;
  clearAllSessionData?(): void;
}
