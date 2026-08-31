import { ROLE_PERMISSIONS_SET_MAP } from '../authorization/permissionsMatrix';
import type { Permission } from '../types/authorization';
import {
  DocumentDomainError,
  type ArchiveDocumentReferenceInput,
  type DocumentAccessScope,
  type DocumentApplicationContext,
  type DocumentCategory,
  type DocumentLogicalOwnerType,
  type DocumentMimeType,
  type DocumentOwnerResolution,
  type DocumentReference,
  type DocumentReferenceFilters,
  type RegisterDocumentReferenceInput,
  type ReplaceDocumentReferenceInput,
} from '../types/documents';
import {
  calculateDocumentSha256,
  canonicalDocumentJson,
  type DocumentClock,
  type DocumentIdGenerator,
  SecureDocumentIdGenerator,
  SystemDocumentClock,
} from './crypto';
import { documentEventJournal } from './documentEventService';
import type { DocumentReferenceGateway } from './documentGateway';
import { getDocumentReferenceGateway } from './documentGatewayFactory';

const OWNER_TYPES: readonly DocumentLogicalOwnerType[] = [
  'client',
  'property',
  'appraisal_request',
  'appraisal',
  'proposal',
];

const CATEGORIES: readonly DocumentCategory[] = [
  'registration_certificate',
  'car_receipt',
  'topography_map',
  'descriptive_memorial',
  'technical_report',
  'photo_report',
  'professional_record',
  'commercial_support',
  'other',
];

const MIME_TYPES: readonly DocumentMimeType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
];

const ACCESS_SCOPES: readonly DocumentAccessScope[] = [
  'organization',
  'participants',
  'management',
];

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MANAGEMENT_ROLES = new Set(['owner', 'company_admin', 'manager']);
const FORBIDDEN_FIELD_NAMES = new Set([
  'file',
  'rawfile',
  'blob',
  'base64',
  'content',
  'binary',
  'buffer',
  'arraybuffer',
  'dataurl',
  'url',
  'downloadurl',
  'temporaryurl',
  'signedurl',
  'token',
  'credential',
  'password',
  'secret',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneReference(reference: DocumentReference): DocumentReference {
  return structuredClone(reference);
}

function compactText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') {
    throw new DocumentDomainError('INVALID_INPUT', `${field} deve ser informado.`);
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < min || normalized.length > max || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new DocumentDomainError('INVALID_INPUT', `${field} possui formato inválido.`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return compactText(value, field, 1, max);
}

function parseIsoDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DocumentDomainError('INVALID_INPUT', `${field} deve usar o formato AAAA-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DocumentDomainError('INVALID_INPUT', `${field} contém uma data inválida.`);
  }
  return value;
}

function parseIdempotencyKey(value: unknown): string {
  const key = compactText(value, 'Chave de idempotência', 8, 200);
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Chave de idempotência possui caracteres inválidos.');
  }
  return key;
}

function ensureNoForbiddenPayload(value: unknown, path = 'entrada'): void {
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    throw new DocumentDomainError('FORBIDDEN_PAYLOAD', 'Arquivos e Blobs não são aceitos nesta fundação.');
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    throw new DocumentDomainError('FORBIDDEN_PAYLOAD', 'Bytes e buffers não são aceitos nesta fundação.');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const compact = trimmed.replace(/\s+/g, '');
    const hasEncodedFileSignature = /^(?:JVBERi0|\/9j\/|iVBORw0KGgo|SUkq|TU0A)/.test(compact);
    const looksLikeRawBase64 =
      compact.length >= 80 &&
      !/\s/.test(trimmed) &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
    if (
      /^(?:data|blob):/i.test(trimmed) ||
      /\bhttps?:\/\//i.test(trimmed) ||
      hasEncodedFileSignature ||
      looksLikeRawBase64
    ) {
      throw new DocumentDomainError(
        'FORBIDDEN_PAYLOAD',
        'URLs, Base64 e conteúdo serializado não são aceitos.'
      );
    }
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => ensureNoForbiddenPayload(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.replace(/[_-]/g, '').toLowerCase();
    if (FORBIDDEN_FIELD_NAMES.has(normalizedKey)) {
      throw new DocumentDomainError(
        'FORBIDDEN_PAYLOAD',
        `O campo ${path}.${key} não pode integrar uma referência documental.`
      );
    }
    ensureNoForbiddenPayload(nested, `${path}.${key}`);
  }
}

function parseFileSize(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1 || value > MAX_FILE_SIZE_BYTES) {
    throw new DocumentDomainError(
      'INVALID_INPUT',
      'O tamanho referencial deve ser um inteiro entre 1 byte e 50 MiB.'
    );
  }
  return value;
}

function parseRegisterInput(value: unknown): RegisterDocumentReferenceInput {
  ensureNoForbiddenPayload(value);
  if (!isRecord(value)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Comando de registro documental inválido.');
  }
  if (!OWNER_TYPES.includes(value.logicalOwnerType as DocumentLogicalOwnerType)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Tipo de entidade documental não reconhecido.');
  }
  if (!CATEGORIES.includes(value.category as DocumentCategory)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Categoria documental não reconhecida.');
  }
  if (!MIME_TYPES.includes(value.mimeType as DocumentMimeType)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Formato documental não permitido.');
  }
  if (!ACCESS_SCOPES.includes(value.accessScope as DocumentAccessScope)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Escopo de acesso documental não reconhecido.');
  }

  const issuedOn = parseIsoDate(value.issuedOn, 'Data de emissão');
  const expiresOn = parseIsoDate(value.expiresOn, 'Data de validade');
  if (issuedOn && expiresOn && expiresOn < issuedOn) {
    throw new DocumentDomainError('INVALID_INPUT', 'A validade não pode anteceder a emissão.');
  }

  return {
    logicalOwnerType: value.logicalOwnerType as DocumentLogicalOwnerType,
    logicalOwnerId: compactText(value.logicalOwnerId, 'Entidade de origem', 1, 160),
    category: value.category as DocumentCategory,
    displayName: compactText(value.displayName, 'Nome de exibição', 3, 120),
    mimeType: value.mimeType as DocumentMimeType,
    fileSizeBytes: parseFileSize(value.fileSizeBytes),
    accessScope: value.accessScope as DocumentAccessScope,
    issuedOn,
    expiresOn,
    notes: optionalText(value.notes, 'Observação', 500),
    idempotencyKey: parseIdempotencyKey(value.idempotencyKey),
  };
}

function parseReplaceInput(value: unknown): ReplaceDocumentReferenceInput {
  ensureNoForbiddenPayload(value);
  if (!isRecord(value)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Comando de substituição documental inválido.');
  }
  if (!MIME_TYPES.includes(value.mimeType as DocumentMimeType)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Formato documental não permitido.');
  }
  if (!Number.isSafeInteger(value.expectedVersion) || typeof value.expectedVersion !== 'number' || value.expectedVersion < 1) {
    throw new DocumentDomainError('INVALID_INPUT', 'Versão esperada inválida.');
  }
  const issuedOn = parseIsoDate(value.issuedOn, 'Data de emissão');
  const expiresOn = parseIsoDate(value.expiresOn, 'Data de validade');
  if (issuedOn && expiresOn && expiresOn < issuedOn) {
    throw new DocumentDomainError('INVALID_INPUT', 'A validade não pode anteceder a emissão.');
  }
  return {
    previousDocumentId: compactText(value.previousDocumentId, 'Referência anterior', 1, 160),
    expectedVersion: value.expectedVersion,
    displayName: compactText(value.displayName, 'Nome de exibição', 3, 120),
    mimeType: value.mimeType as DocumentMimeType,
    fileSizeBytes: parseFileSize(value.fileSizeBytes),
    issuedOn,
    expiresOn,
    notes: optionalText(value.notes, 'Observação', 500),
    idempotencyKey: parseIdempotencyKey(value.idempotencyKey),
  };
}

function parseArchiveInput(value: unknown): ArchiveDocumentReferenceInput {
  ensureNoForbiddenPayload(value);
  if (!isRecord(value)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Comando de arquivamento documental inválido.');
  }
  if (!Number.isSafeInteger(value.expectedVersion) || typeof value.expectedVersion !== 'number' || value.expectedVersion < 1) {
    throw new DocumentDomainError('INVALID_INPUT', 'Versão esperada inválida.');
  }
  return {
    documentId: compactText(value.documentId, 'Referência documental', 1, 160),
    expectedVersion: value.expectedVersion,
    reason: compactText(value.reason, 'Motivo do arquivamento', 3, 240),
    idempotencyKey: parseIdempotencyKey(value.idempotencyKey),
  };
}

export class DocumentApplicationService {
  constructor(
    private readonly gateway: DocumentReferenceGateway = getDocumentReferenceGateway(),
    private readonly clock: DocumentClock = SystemDocumentClock,
    private readonly idGenerator: DocumentIdGenerator = SecureDocumentIdGenerator
  ) {}

  private assertPermission(context: DocumentApplicationContext, permission: Permission): void {
    if (!context.organizationId || !context.actor.userId) {
      throw new DocumentDomainError('UNAUTHENTICATED', 'Sessão organizacional inválida.');
    }
    if (!context.actor.isActive || context.actor.role === 'none') {
      throw new DocumentDomainError('INACTIVE_MEMBERSHIP', 'Vínculo organizacional inativo.');
    }
    const canonicalPermissions = ROLE_PERMISSIONS_SET_MAP.get(context.actor.role);
    if (!canonicalPermissions?.has(permission) || !context.actor.permissions.includes(permission)) {
      throw new DocumentDomainError('FORBIDDEN', 'Operação documental não autorizada para o perfil atual.');
    }
  }

  private async resolveAndValidateOwner(
    context: DocumentApplicationContext,
    ownerType: DocumentLogicalOwnerType,
    ownerId: string
  ): Promise<DocumentOwnerResolution> {
    const owner = await context.resolveOwner(ownerType, ownerId);
    if (!owner.exists) {
      throw new DocumentDomainError('OWNER_NOT_FOUND', 'Entidade vinculada não encontrada.');
    }
    if (owner.organizationId !== context.organizationId) {
      throw new DocumentDomainError(
        'OWNER_ORGANIZATION_MISMATCH',
        'A entidade vinculada não pertence à organização ativa.'
      );
    }
    return owner;
  }

  private isManagement(context: DocumentApplicationContext): boolean {
    return MANAGEMENT_ROLES.has(context.actor.role);
  }

  private canAccess(
    context: DocumentApplicationContext,
    reference: DocumentReference,
    owner: DocumentOwnerResolution
  ): boolean {
    if (this.isManagement(context)) return true;
    if (context.actor.role === 'finance') return reference.accessScope === 'organization';
    if (reference.accessScope === 'management') return false;
    return owner.authorizedUserIds.includes(context.actor.userId);
  }

  private assertCanMutateOwner(
    context: DocumentApplicationContext,
    owner: DocumentOwnerResolution,
    accessScope: DocumentAccessScope
  ): void {
    if (this.isManagement(context)) return;
    if (accessScope === 'management' || !owner.authorizedUserIds.includes(context.actor.userId)) {
      throw new DocumentDomainError('FORBIDDEN', 'O usuário não participa da entidade documental informada.');
    }
  }

  async listReferences(
    context: DocumentApplicationContext,
    filters: DocumentReferenceFilters = {},
    signal?: AbortSignal
  ): Promise<readonly DocumentReference[]> {
    this.assertPermission(context, 'documents:view');
    const references = await this.gateway.listReferences(
      { ...filters, organizationId: context.organizationId },
      signal
    );
    const visible: DocumentReference[] = [];
    for (const reference of references) {
      const owner = await context.resolveOwner(reference.logicalOwnerType, reference.logicalOwnerId);
      if (
        owner.exists &&
        owner.organizationId === context.organizationId &&
        this.canAccess(context, reference, owner)
      ) {
        visible.push(cloneReference(reference));
      }
    }
    return visible;
  }

  async getReferenceById(
    context: DocumentApplicationContext,
    documentId: string
  ): Promise<DocumentReference | null> {
    this.assertPermission(context, 'documents:view');
    const safeId = compactText(documentId, 'Referência documental', 1, 160);
    const reference = await this.gateway.getReferenceById(context.organizationId, safeId);
    if (!reference) return null;
    const owner = await this.resolveAndValidateOwner(
      context,
      reference.logicalOwnerType,
      reference.logicalOwnerId
    );
    if (!this.canAccess(context, reference, owner)) {
      throw new DocumentDomainError('FORBIDDEN', 'Referência documental fora do escopo autorizado.');
    }
    return cloneReference(reference);
  }

  async registerReference(
    context: DocumentApplicationContext,
    command: unknown
  ): Promise<DocumentReference> {
    this.assertPermission(context, 'documents:register_reference');
    const input = parseRegisterInput(command);
    const owner = await this.resolveAndValidateOwner(
      context,
      input.logicalOwnerType,
      input.logicalOwnerId
    );
    this.assertCanMutateOwner(context, owner, input.accessScope);

    const now = this.clock.now().toISOString();
    const checksumPayload = {
      organizationId: context.organizationId,
      logicalOwnerType: input.logicalOwnerType,
      logicalOwnerId: input.logicalOwnerId,
      category: input.category,
      displayName: input.displayName,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      accessScope: input.accessScope,
      issuedOn: input.issuedOn,
      expiresOn: input.expiresOn,
      notes: input.notes,
      versionNumber: 1,
    };
    const payloadHash = await calculateDocumentSha256(canonicalDocumentJson(checksumPayload));
    const reference: DocumentReference = {
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      logicalOwnerType: input.logicalOwnerType,
      logicalOwnerId: input.logicalOwnerId,
      category: input.category,
      displayName: input.displayName,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      accessScope: input.accessScope,
      status: 'active',
      versionNumber: 1,
      issuedOn: input.issuedOn,
      expiresOn: input.expiresOn,
      notes: input.notes,
      storageState: 'metadata_only',
      metadataChecksumSha256: payloadHash,
      createdByUserId: context.actor.userId,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.gateway.createReference({
      reference,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    });
    documentEventJournal.record({
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      eventType: 'document.reference.registered',
      documentId: result.id,
      logicalOwnerType: result.logicalOwnerType,
      logicalOwnerId: result.logicalOwnerId,
      category: result.category,
      correlationId: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      occurredAt: result.createdAt,
      metadata: Object.freeze({ versionNumber: result.versionNumber, storageState: result.storageState }),
    });
    return cloneReference(result);
  }

  async replaceReference(
    context: DocumentApplicationContext,
    command: unknown
  ): Promise<DocumentReference> {
    this.assertPermission(context, 'documents:register_reference');
    const input = parseReplaceInput(command);
    const previous = await this.gateway.getReferenceById(context.organizationId, input.previousDocumentId);
    if (!previous) {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Referência documental não encontrada.');
    }
    const owner = await this.resolveAndValidateOwner(
      context,
      previous.logicalOwnerType,
      previous.logicalOwnerId
    );
    this.assertCanMutateOwner(context, owner, previous.accessScope);
    const now = this.clock.now().toISOString();
    const checksumPayload = {
      organizationId: context.organizationId,
      logicalOwnerType: previous.logicalOwnerType,
      logicalOwnerId: previous.logicalOwnerId,
      category: previous.category,
      displayName: input.displayName,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      accessScope: previous.accessScope,
      issuedOn: input.issuedOn,
      expiresOn: input.expiresOn,
      notes: input.notes,
      versionNumber: previous.versionNumber + 1,
      predecessorDocumentId: previous.id,
    };
    const payloadHash = await calculateDocumentSha256(canonicalDocumentJson(checksumPayload));
    const replacement: DocumentReference = {
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      logicalOwnerType: previous.logicalOwnerType,
      logicalOwnerId: previous.logicalOwnerId,
      category: previous.category,
      displayName: input.displayName,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      accessScope: previous.accessScope,
      status: 'active',
      versionNumber: previous.versionNumber + 1,
      predecessorDocumentId: previous.id,
      issuedOn: input.issuedOn,
      expiresOn: input.expiresOn,
      notes: input.notes,
      storageState: 'metadata_only',
      metadataChecksumSha256: payloadHash,
      createdByUserId: context.actor.userId,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.gateway.replaceReference({
      reference: replacement,
      previousDocumentId: previous.id,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    });
    documentEventJournal.record({
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      eventType: 'document.reference.replaced',
      documentId: result.id,
      logicalOwnerType: result.logicalOwnerType,
      logicalOwnerId: result.logicalOwnerId,
      category: result.category,
      correlationId: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      occurredAt: result.createdAt,
      metadata: Object.freeze({ versionNumber: result.versionNumber, predecessorDocumentId: previous.id }),
    });
    return cloneReference(result);
  }

  async archiveReference(
    context: DocumentApplicationContext,
    command: unknown
  ): Promise<DocumentReference> {
    this.assertPermission(context, 'documents:manage');
    const input = parseArchiveInput(command);
    const current = await this.gateway.getReferenceById(context.organizationId, input.documentId);
    if (!current) {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Referência documental não encontrada.');
    }
    await this.resolveAndValidateOwner(context, current.logicalOwnerType, current.logicalOwnerId);
    const payloadHash = await calculateDocumentSha256(
      canonicalDocumentJson({
        documentId: input.documentId,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
      })
    );
    const now = this.clock.now().toISOString();
    const result = await this.gateway.archiveReference({
      organizationId: context.organizationId,
      documentId: input.documentId,
      expectedVersion: input.expectedVersion,
      archivedAt: now,
      archivedByUserId: context.actor.userId,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    });
    documentEventJournal.record({
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      eventType: 'document.reference.archived',
      documentId: result.id,
      logicalOwnerType: result.logicalOwnerType,
      logicalOwnerId: result.logicalOwnerId,
      category: result.category,
      correlationId: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      occurredAt: result.updatedAt,
      metadata: Object.freeze({ versionNumber: result.versionNumber, archived: true }),
    });
    return cloneReference(result);
  }
}
