import type {
  DocumentRequirement,
  DocumentRequirementListQuery,
  DocumentReference,
  DocumentReferenceListQuery,
} from '../../types/documents';
import { DocumentDomainError } from '../../types/documents';
import type {
  ArchiveDocumentRecord,
  CreateDocumentRecord,
  CreateDocumentRequirementRecord,
  DocumentReferenceGateway,
  ReplaceDocumentRecord,
  ResolveDocumentRequirementRecord,
} from '../documentGateway';

interface IdempotencyRecord {
  readonly payloadHash: string;
  readonly documentId: string;
}

interface RequirementIdempotencyRecord {
  readonly payloadHash: string;
  readonly requirementId: string;
}

function cloneReference(reference: DocumentReference): DocumentReference {
  return structuredClone(reference);
}

function cloneRequirement(requirement: DocumentRequirement): DocumentRequirement {
  return structuredClone(requirement);
}

/** Armazenamento estritamente volátil e vazio, exclusivo do ambiente DEV. */
export class PreviewDocumentReferenceGateway implements DocumentReferenceGateway {
  private readonly referencesByOrganization = new Map<string, Map<string, DocumentReference>>();
  private readonly idempotencyRecords = new Map<string, IdempotencyRecord>();
  private readonly requirementsByOrganization = new Map<string, Map<string, DocumentRequirement>>();
  private readonly requirementIdempotencyRecords = new Map<string, RequirementIdempotencyRecord>();

  private getOrganizationStore(organizationId: string): Map<string, DocumentReference> {
    const existing = this.referencesByOrganization.get(organizationId);
    if (existing) return existing;
    const created = new Map<string, DocumentReference>();
    this.referencesByOrganization.set(organizationId, created);
    return created;
  }

  private getRequirementStore(organizationId: string): Map<string, DocumentRequirement> {
    const existing = this.requirementsByOrganization.get(organizationId);
    if (existing) return existing;
    const created = new Map<string, DocumentRequirement>();
    this.requirementsByOrganization.set(organizationId, created);
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

  private replayRequirement(
    organizationId: string,
    operation: string,
    idempotencyKey: string,
    payloadHash: string
  ): DocumentRequirement | null {
    const key = `${organizationId}:${operation}:${idempotencyKey}`;
    const previous = this.requirementIdempotencyRecords.get(key);
    if (!previous) return null;
    if (previous.payloadHash !== payloadHash) {
      throw new DocumentDomainError(
        'IDEMPOTENCY_CONFLICT',
        'A chave da operação já foi utilizada com informações diferentes.'
      );
    }
    const requirement = this.getRequirementStore(organizationId).get(previous.requirementId);
    if (!requirement) {
      throw new DocumentDomainError('INVALID_STATE', 'O resultado anterior não está mais disponível.');
    }
    return cloneRequirement(requirement);
  }

  private rememberRequirement(
    organizationId: string,
    operation: string,
    idempotencyKey: string,
    payloadHash: string,
    requirementId: string
  ): void {
    this.requirementIdempotencyRecords.set(`${organizationId}:${operation}:${idempotencyKey}`, {
      payloadHash,
      requirementId,
    });
  }

  async listReferences(
    query: DocumentReferenceListQuery,
    signal?: AbortSignal
  ): Promise<readonly DocumentReference[]> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const references = [...this.getOrganizationStore(query.organizationId).values()]
      .filter((reference) => reference.isCurrent);
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

  async listVersionHistory(
    organizationId: string,
    logicalDocumentId: string,
    signal?: AbortSignal
  ): Promise<readonly DocumentReference[]> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const versions = [...this.getOrganizationStore(organizationId).values()]
      .filter((reference) => reference.logicalDocumentId === logicalDocumentId)
      .sort(
        (left, right) =>
          right.versionNumber - left.versionNumber || left.id.localeCompare(right.id)
      );
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return versions.map(cloneReference);
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

    if (
      reference.id !== reference.logicalDocumentId ||
      reference.versionNumber !== 1 ||
      !reference.isCurrent ||
      reference.predecessorDocumentId
    ) {
      throw new DocumentDomainError('INVALID_STATE', 'A versão inicial do documento é inválida.');
    }

    const store = this.getOrganizationStore(reference.organizationId);
    const duplicate = [...store.values()].find(
      (candidate) =>
        candidate.isCurrent &&
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
    if (previous.status !== 'active' || !previous.isCurrent) {
      throw new DocumentDomainError('VERSION_CONFLICT', 'Somente a versão atual pode ser substituída.');
    }
    if (
      reference.logicalDocumentId !== previous.logicalDocumentId ||
      reference.predecessorDocumentId !== previous.id ||
      reference.versionNumber !== previous.versionNumber + 1 ||
      !reference.isCurrent
    ) {
      throw new DocumentDomainError('INVALID_STATE', 'A sequência da nova versão é inválida.');
    }
    const competingCurrent = [...store.values()].find(
      (candidate) =>
        candidate.logicalDocumentId === previous.logicalDocumentId &&
        candidate.isCurrent &&
        candidate.id !== previous.id
    );
    if (competingCurrent) {
      throw new DocumentDomainError('VERSION_CONFLICT', 'Já existe outra versão atual do documento.');
    }

    const superseded: DocumentReference = {
      ...previous,
      status: 'superseded',
      isCurrent: false,
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
    if (current.versionNumber !== input.expectedVersion || !current.isCurrent) {
      throw new DocumentDomainError('VERSION_CONFLICT', 'A referência foi alterada por outra operação.');
    }
    if (current.status === 'archived') {
      throw new DocumentDomainError('INVALID_STATE', 'A referência documental já está arquivada.');
    }

    const archived: DocumentReference = {
      ...current,
      status: 'archived',
      updatedAt: input.archivedAt,
      archivedAt: input.archivedAt,
      archivedByUserId: input.archivedByUserId,
    };
    store.set(archived.id, Object.freeze(cloneReference(archived)));
    this.remember(input.organizationId, 'archive', input.idempotencyKey, input.payloadHash, archived.id);
    return cloneReference(archived);
  }

  async listRequirements(
    query: DocumentRequirementListQuery,
    signal?: AbortSignal
  ): Promise<readonly DocumentRequirement[]> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const requirements = [...this.getRequirementStore(query.organizationId).values()]
      .filter((item) => !query.status || query.status === 'all' || item.status === query.status)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return requirements.map(cloneRequirement);
  }

  async getRequirementById(
    organizationId: string,
    requirementId: string
  ): Promise<DocumentRequirement | null> {
    const requirement = this.getRequirementStore(organizationId).get(requirementId);
    return requirement ? cloneRequirement(requirement) : null;
  }

  async createRequirement(input: CreateDocumentRequirementRecord): Promise<DocumentRequirement> {
    const { requirement } = input;
    const replay = this.replayRequirement(
      requirement.organizationId,
      'create-requirement',
      input.idempotencyKey,
      input.payloadHash
    );
    if (replay) return replay;

    const store = this.getRequirementStore(requirement.organizationId);
    const duplicate = [...store.values()].find(
      (candidate) =>
        candidate.status === 'open' &&
        candidate.logicalOwnerType === requirement.logicalOwnerType &&
        candidate.logicalOwnerId === requirement.logicalOwnerId &&
        candidate.category === requirement.category
    );
    if (duplicate) {
      throw new DocumentDomainError(
        'DUPLICATE_OPEN_REQUIREMENT',
        'Já existe uma pendência aberta dessa categoria para o mesmo atendimento.'
      );
    }

    store.set(requirement.id, Object.freeze(cloneRequirement(requirement)));
    this.rememberRequirement(
      requirement.organizationId,
      'create-requirement',
      input.idempotencyKey,
      input.payloadHash,
      requirement.id
    );
    return cloneRequirement(requirement);
  }

  async resolveRequirement(input: ResolveDocumentRequirementRecord): Promise<DocumentRequirement> {
    const { requirement } = input;
    const replay = this.replayRequirement(
      requirement.organizationId,
      input.operation,
      input.idempotencyKey,
      input.payloadHash
    );
    if (replay) return replay;

    const store = this.getRequirementStore(requirement.organizationId);
    const current = store.get(requirement.id);
    if (!current) {
      throw new DocumentDomainError('REQUIREMENT_NOT_FOUND', 'Pendência documental não encontrada.');
    }
    if (current.versionNumber !== input.expectedVersion) {
      throw new DocumentDomainError('VERSION_CONFLICT', 'A pendência foi alterada por outra operação.');
    }
    if (current.status !== 'open') {
      throw new DocumentDomainError('REQUIREMENT_ALREADY_RESOLVED', 'A pendência já foi encerrada.');
    }
    if (requirement.versionNumber !== current.versionNumber + 1) {
      throw new DocumentDomainError('VERSION_CONFLICT', 'A nova versão da pendência é inválida.');
    }

    if (input.operation === 'fulfill') {
      const documentId = input.linkedDocumentId;
      const document = documentId
        ? this.getOrganizationStore(requirement.organizationId).get(documentId)
        : null;
      if (
        !document ||
        document.status !== 'active' ||
        document.logicalOwnerType !== current.logicalOwnerType ||
        document.logicalOwnerId !== current.logicalOwnerId ||
        document.category !== current.category
      ) {
        throw new DocumentDomainError(
          'REQUIREMENT_MISMATCH',
          'O documento escolhido não atende esta pendência.'
        );
      }
    }

    store.set(requirement.id, Object.freeze(cloneRequirement(requirement)));
    this.rememberRequirement(
      requirement.organizationId,
      input.operation,
      input.idempotencyKey,
      input.payloadHash,
      requirement.id
    );
    return cloneRequirement(requirement);
  }

  clearAllSessionData(): void {
    this.referencesByOrganization.clear();
    this.idempotencyRecords.clear();
    this.requirementsByOrganization.clear();
    this.requirementIdempotencyRecords.clear();
  }
}
