import type {
  DocumentReference,
  DocumentReferenceListQuery,
} from '../../types/documents';
import { DocumentDomainError } from '../../types/documents';
import type {
  ArchiveDocumentRecord,
  CreateDocumentRecord,
  DocumentReferenceGateway,
  ReplaceDocumentRecord,
} from '../documentGateway';

interface IdempotencyRecord {
  readonly payloadHash: string;
  readonly documentId: string;
}

function cloneReference(reference: DocumentReference): DocumentReference {
  return structuredClone(reference);
}

/** Armazenamento estritamente volátil e vazio, exclusivo do ambiente DEV. */
export class PreviewDocumentReferenceGateway implements DocumentReferenceGateway {
  private readonly referencesByOrganization = new Map<string, Map<string, DocumentReference>>();
  private readonly idempotencyRecords = new Map<string, IdempotencyRecord>();

  private getOrganizationStore(organizationId: string): Map<string, DocumentReference> {
    const existing = this.referencesByOrganization.get(organizationId);
    if (existing) return existing;
    const created = new Map<string, DocumentReference>();
    this.referencesByOrganization.set(organizationId, created);
    return created;
  }

  private replay(
    organizationId: string,
    operation: string,
    idempotencyKey: string,
    payloadHash: string
  ): DocumentReference | null {
    const key = `${organizationId}:${operation}:${idempotencyKey}`;
    const previous = this.idempotencyRecords.get(key);
    if (!previous) return null;
    if (previous.payloadHash !== payloadHash) {
      throw new DocumentDomainError(
        'IDEMPOTENCY_CONFLICT',
        'A chave de idempotência já foi utilizada com dados divergentes.'
      );
    }
    const reference = this.getOrganizationStore(organizationId).get(previous.documentId);
    if (!reference) {
      throw new DocumentDomainError('INVALID_STATE', 'Resultado idempotente não está mais disponível.');
    }
    return cloneReference(reference);
  }

  private remember(
    organizationId: string,
    operation: string,
    idempotencyKey: string,
    payloadHash: string,
    documentId: string
  ): void {
    this.idempotencyRecords.set(`${organizationId}:${operation}:${idempotencyKey}`, {
      payloadHash,
      documentId,
    });
  }

  async listReferences(
    query: DocumentReferenceListQuery,
    signal?: AbortSignal
  ): Promise<readonly DocumentReference[]> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const references = [...this.getOrganizationStore(query.organizationId).values()];
    const search = query.search?.trim().toLocaleLowerCase('pt-BR') ?? '';
    const filtered = references.filter((reference) => {
      if (query.ownerType && query.ownerType !== 'all' && reference.logicalOwnerType !== query.ownerType) return false;
      if (query.category && query.category !== 'all' && reference.category !== query.category) return false;
      if (query.status && query.status !== 'all' && reference.status !== query.status) return false;
      if (search && !reference.displayName.toLocaleLowerCase('pt-BR').includes(search)) return false;
      return true;
    });
    filtered.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return filtered.map(cloneReference);
  }

  async getReferenceById(
    organizationId: string,
    documentId: string
  ): Promise<DocumentReference | null> {
    const reference = this.getOrganizationStore(organizationId).get(documentId);
    return reference ? cloneReference(reference) : null;
  }

  async createReference(input: CreateDocumentRecord): Promise<DocumentReference> {
    const { reference } = input;
    const replay = this.replay(
      reference.organizationId,
      'register',
      input.idempotencyKey,
      input.payloadHash
    );
    if (replay) return replay;

    const store = this.getOrganizationStore(reference.organizationId);
    const duplicate = [...store.values()].find(
      (candidate) =>
        candidate.status === 'active' &&
        candidate.logicalOwnerType === reference.logicalOwnerType &&
        candidate.logicalOwnerId === reference.logicalOwnerId &&
        candidate.category === reference.category &&
        candidate.displayName.toLocaleLowerCase('pt-BR') === reference.displayName.toLocaleLowerCase('pt-BR')
    );
    if (duplicate) {
      throw new DocumentDomainError(
        'DUPLICATE_ACTIVE_REFERENCE',
        'Já existe uma referência documental ativa equivalente para esta entidade.'
      );
    }

    store.set(reference.id, Object.freeze(cloneReference(reference)));
    this.remember(reference.organizationId, 'register', input.idempotencyKey, input.payloadHash, reference.id);
    return cloneReference(reference);
  }

  async replaceReference(input: ReplaceDocumentRecord): Promise<DocumentReference> {
    const { reference } = input;
    const replay = this.replay(
      reference.organizationId,
      'replace',
      input.idempotencyKey,
      input.payloadHash
    );
    if (replay) return replay;

    const store = this.getOrganizationStore(reference.organizationId);
    const previous = store.get(input.previousDocumentId);
    if (!previous) {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Referência documental não encontrada.');
    }
    if (previous.versionNumber !== input.expectedVersion) {
      throw new DocumentDomainError('VERSION_CONFLICT', 'A referência foi alterada por outra operação.');
    }
    if (previous.status !== 'active') {
      throw new DocumentDomainError('INVALID_STATE', 'Somente referência ativa pode ser substituída.');
    }

    const superseded: DocumentReference = {
      ...previous,
      status: 'superseded',
      updatedAt: reference.createdAt,
    };
    store.set(previous.id, Object.freeze(cloneReference(superseded)));
    store.set(reference.id, Object.freeze(cloneReference(reference)));
    this.remember(reference.organizationId, 'replace', input.idempotencyKey, input.payloadHash, reference.id);
    return cloneReference(reference);
  }

  async archiveReference(input: ArchiveDocumentRecord): Promise<DocumentReference> {
    const replay = this.replay(
      input.organizationId,
      'archive',
      input.idempotencyKey,
      input.payloadHash
    );
    if (replay) return replay;

    const store = this.getOrganizationStore(input.organizationId);
    const current = store.get(input.documentId);
    if (!current) {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Referência documental não encontrada.');
    }
    if (current.versionNumber !== input.expectedVersion) {
      throw new DocumentDomainError('VERSION_CONFLICT', 'A referência foi alterada por outra operação.');
    }
    if (current.status === 'archived') {
      throw new DocumentDomainError('INVALID_STATE', 'A referência documental já está arquivada.');
    }

    const archived: DocumentReference = {
      ...current,
      status: 'archived',
      versionNumber: current.versionNumber + 1,
      updatedAt: input.archivedAt,
      archivedAt: input.archivedAt,
      archivedByUserId: input.archivedByUserId,
    };
    store.set(archived.id, Object.freeze(cloneReference(archived)));
    this.remember(input.organizationId, 'archive', input.idempotencyKey, input.payloadHash, archived.id);
    return cloneReference(archived);
  }

  clearAllSessionData(): void {
    this.referencesByOrganization.clear();
    this.idempotencyRecords.clear();
  }
}

