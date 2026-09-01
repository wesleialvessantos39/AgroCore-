import { ROLE_PERMISSIONS_SET_MAP } from '../authorization/permissionsMatrix';
import type { Permission } from '../types/authorization';
import {
  DocumentDomainError,
  type ArchiveDocumentReferenceInput,
  type CreateDocumentRequirementInput,
  type DocumentAccessScope,
  type DocumentApplicationContext,
  type DocumentCategory,
  type DocumentGovernanceDashboard,
  type DocumentLogicalOwnerType,
  type DocumentMimeType,
  type DocumentOwnerResolution,
  type DocumentReference,
  type DocumentReferenceFilters,
  type DocumentRequirement,
  type DocumentRequirementEffectiveState,
  type DocumentRequirementProjection,
  type DocumentValidityState,
  type FulfillDocumentRequirementInput,
  type RegisterDocumentReferenceInput,
  type RegisterStoredDocumentInput,
  type ReplaceDocumentReferenceInput,
  type ResolveDocumentRequirementInput,
} from '../types/documents';
import { assertStoredObjectMatches } from './documentStoragePolicy';
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

function parseFileSize(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1 || value > MAX_FILE_SIZE_BYTES) {
    throw new DocumentDomainError(
      'INVALID_INPUT',
      'O tamanho referencial deve ser um inteiro entre 1 byte e 50 MiB.'
    );
  }
  return value;
}

function parseExpectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1) {
    throw new DocumentDomainError('INVALID_INPUT', 'Versão esperada inválida.');
  }
  return value;
}

function parseCreateRequirementInput(value: unknown): CreateDocumentRequirementInput {
  ensureNoForbiddenPayload(value);
  if (!isRecord(value)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Dados da pendência documental inválidos.');
  }
  if (!OWNER_TYPES.includes(value.logicalOwnerType as DocumentLogicalOwnerType)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Tipo de vínculo não reconhecido.');
  }
  if (!CATEGORIES.includes(value.category as DocumentCategory)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Categoria documental não reconhecida.');
  }
  if (!ACCESS_SCOPES.includes(value.accessScope as DocumentAccessScope)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Regra de acesso não reconhecida.');
  }
  return {
    logicalOwnerType: value.logicalOwnerType as DocumentLogicalOwnerType,
    logicalOwnerId: compactText(value.logicalOwnerId, 'Registro relacionado', 1, 160),
    category: value.category as DocumentCategory,
    title: compactText(value.title, 'Título da pendência', 3, 120),
    accessScope: value.accessScope as DocumentAccessScope,
    dueOn: parseIsoDate(value.dueOn, 'Prazo'),
    notes: optionalText(value.notes, 'Orientação', 500),
    idempotencyKey: parseIdempotencyKey(value.idempotencyKey),
  };
}

function parseFulfillRequirementInput(value: unknown): FulfillDocumentRequirementInput {
  ensureNoForbiddenPayload(value);
  if (!isRecord(value)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Dados de atendimento da pendência inválidos.');
  }
  return {
    requirementId: compactText(value.requirementId, 'Pendência documental', 1, 160),
    documentId: compactText(value.documentId, 'Documento', 1, 160),
    expectedVersion: parseExpectedVersion(value.expectedVersion),
    idempotencyKey: parseIdempotencyKey(value.idempotencyKey),
  };
}

function parseResolveRequirementInput(value: unknown): ResolveDocumentRequirementInput {
  ensureNoForbiddenPayload(value);
  if (!isRecord(value)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Dados de encerramento da pendência inválidos.');
  }
  return {
    requirementId: compactText(value.requirementId, 'Pendência documental', 1, 160),
    expectedVersion: parseExpectedVersion(value.expectedVersion),
    reason: compactText(value.reason, 'Motivo', 3, 240),
    idempotencyKey: parseIdempotencyKey(value.idempotencyKey),
  };
}

function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function evaluateDocumentValidity(
  reference: Pick<DocumentReference, 'expiresOn'>,
  now: Date,
  warningDays = 30
): DocumentValidityState {
  if (!Number.isSafeInteger(warningDays) || warningDays < 0 || warningDays > 3650) {
    throw new DocumentDomainError('INVALID_INPUT', 'Janela de aviso de validade inválida.');
  }
  if (!reference.expiresOn) return 'no_expiration';
  const today = utcDate(now);
  if (reference.expiresOn < today) return 'expired';
  const remainingDays = Math.floor(
    (new Date(`${reference.expiresOn}T00:00:00.000Z`).getTime() -
      new Date(`${today}T00:00:00.000Z`).getTime()) /
      86_400_000
  );
  return remainingDays <= warningDays ? 'expiring_soon' : 'current';
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

function parseRegisterStoredInput(value: unknown): RegisterStoredDocumentInput {
  const reference = parseRegisterInput(value);
  if (!isRecord(value) || !isRecord(value.storedObject)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Confirmação de armazenamento inválida.');
  }
  const uploadedAt = compactText(value.storedObject.uploadedAt, 'Data do envio', 20, 40);
  if (Number.isNaN(new Date(uploadedAt).getTime())) {
    throw new DocumentDomainError('INVALID_INPUT', 'Data do envio inválida.');
  }
  return {
    ...reference,
    documentId: compactText(value.documentId, 'Documento', 1, 160),
    storedObject: {
      bucket: compactText(value.storedObject.bucket, 'Área privada', 1, 80) as RegisterStoredDocumentInput['storedObject']['bucket'],
      objectPath: compactText(value.storedObject.objectPath, 'Localização privada', 1, 600),
      uploadedAt,
    },
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

  private canAccessRequirement(
    context: DocumentApplicationContext,
    requirement: DocumentRequirement,
    owner: DocumentOwnerResolution
  ): boolean {
    if (this.isManagement(context)) return true;
    if (requirement.accessScope === 'management') return false;
    return owner.authorizedUserIds.includes(context.actor.userId);
  }

  private async getRequirement(
    context: DocumentApplicationContext,
    requirementId: string
  ): Promise<{ readonly requirement: DocumentRequirement; readonly owner: DocumentOwnerResolution }> {
    const requirement = await this.gateway.getRequirementById(context.organizationId, requirementId);
    if (!requirement) {
      throw new DocumentDomainError('REQUIREMENT_NOT_FOUND', 'Pendência documental não encontrada.');
    }
    const owner = await this.resolveAndValidateOwner(
      context,
      requirement.logicalOwnerType,
      requirement.logicalOwnerId
    );
    if (!this.canAccessRequirement(context, requirement, owner)) {
      throw new DocumentDomainError('FORBIDDEN', 'Pendência documental fora do escopo autorizado.');
    }
    return { requirement, owner };
  }

  private projectRequirement(
    requirement: DocumentRequirement,
    linkedDocument: DocumentReference | undefined,
    warningDays: number,
    now: Date
  ): DocumentRequirementProjection {
    if (requirement.status === 'waived' || requirement.status === 'cancelled') {
      return { requirement: structuredClone(requirement), effectiveState: requirement.status };
    }
    if (requirement.status === 'open') {
      const effectiveState: DocumentRequirementEffectiveState =
        requirement.dueOn && requirement.dueOn < utcDate(now) ? 'overdue' : 'pending';
      return { requirement: structuredClone(requirement), effectiveState };
    }
    if (!linkedDocument || linkedDocument.status !== 'active') {
      return {
        requirement: structuredClone(requirement),
        effectiveState: 'document_unavailable',
      };
    }
    const documentValidity = evaluateDocumentValidity(linkedDocument, now, warningDays);
    const effectiveState: DocumentRequirementEffectiveState =
      documentValidity === 'expired'
        ? 'document_expired'
        : documentValidity === 'expiring_soon'
          ? 'document_expiring'
          : 'fulfilled';
    return {
      requirement: structuredClone(requirement),
      effectiveState,
      linkedDocument: cloneReference(linkedDocument),
      documentValidity,
    };
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
    const visibility = await Promise.all(
      references.map(async (reference) => ({
        reference,
        owner: await context.resolveOwner(reference.logicalOwnerType, reference.logicalOwnerId),
      }))
    );
    return visibility.flatMap(({ reference, owner }) =>
      owner.exists &&
      owner.organizationId === context.organizationId &&
      this.canAccess(context, reference, owner)
        ? [cloneReference(reference)]
        : []
    );
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

  async authorizeStoredUpload(
    context: DocumentApplicationContext,
    command: unknown
  ): Promise<void> {
    this.assertPermission(context, 'documents:upload');
    this.assertPermission(context, 'documents:register_reference');
    const input = parseRegisterInput(command);
    const owner = await this.resolveAndValidateOwner(
      context,
      input.logicalOwnerType,
      input.logicalOwnerId
    );
    this.assertCanMutateOwner(context, owner, input.accessScope);
  }

  async registerStoredDocument(
    context: DocumentApplicationContext,
    command: unknown
  ): Promise<DocumentReference> {
    this.assertPermission(context, 'documents:upload');
    this.assertPermission(context, 'documents:register_reference');
    const input = parseRegisterStoredInput(command);
    const owner = await this.resolveAndValidateOwner(
      context,
      input.logicalOwnerType,
      input.logicalOwnerId
    );
    this.assertCanMutateOwner(context, owner, input.accessScope);
    assertStoredObjectMatches({
      organizationId: context.organizationId,
      logicalOwnerType: input.logicalOwnerType,
      logicalOwnerId: input.logicalOwnerId,
      documentId: input.documentId,
      mimeType: input.mimeType,
      bucket: input.storedObject.bucket,
      objectPath: input.storedObject.objectPath,
    });

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
      storageBucket: input.storedObject.bucket,
      storageObjectPath: input.storedObject.objectPath,
      versionNumber: 1,
    };
    const payloadHash = await calculateDocumentSha256(canonicalDocumentJson(checksumPayload));
    const reference: DocumentReference = {
      id: input.documentId,
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
      storageState: 'stored',
      storageBucket: input.storedObject.bucket,
      storageObjectPath: input.storedObject.objectPath,
      storageUploadedAt: input.storedObject.uploadedAt,
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
      eventType: 'document.file.stored',
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

  async listRequirements(
    context: DocumentApplicationContext,
    warningDays = 30,
    signal?: AbortSignal
  ): Promise<readonly DocumentRequirementProjection[]> {
    this.assertPermission(context, 'documents:view_requirements');
    if (!Number.isSafeInteger(warningDays) || warningDays < 0 || warningDays > 3650) {
      throw new DocumentDomainError('INVALID_INPUT', 'Janela de aviso de validade inválida.');
    }
    const requirements = await this.gateway.listRequirements(
      { organizationId: context.organizationId, status: 'all' },
      signal
    );
    const visibility = await Promise.all(
      requirements.map(async (requirement) => ({
        requirement,
        owner: await context.resolveOwner(requirement.logicalOwnerType, requirement.logicalOwnerId),
      }))
    );
    const visible = visibility.flatMap(({ requirement, owner }) =>
      owner.exists &&
      owner.organizationId === context.organizationId &&
      this.canAccessRequirement(context, requirement, owner)
        ? [requirement]
        : []
    );
    const documents = await Promise.all(
      visible.map((requirement) =>
        requirement.linkedDocumentId
          ? this.gateway.getReferenceById(context.organizationId, requirement.linkedDocumentId)
          : Promise.resolve(null)
      )
    );
    const now = this.clock.now();
    return visible.map((requirement, index) =>
      this.projectRequirement(requirement, documents[index] ?? undefined, warningDays, now)
    );
  }

  async getGovernanceDashboard(
    context: DocumentApplicationContext,
    warningDays = 30,
    signal?: AbortSignal
  ): Promise<DocumentGovernanceDashboard> {
    const [requirements, references] = await Promise.all([
      this.listRequirements(context, warningDays, signal),
      this.listReferences(context, { status: 'active' }, signal),
    ]);
    const now = this.clock.now();
    const expiringDocuments = references.filter(
      (reference) => evaluateDocumentValidity(reference, now, warningDays) === 'expiring_soon'
    );
    const expiredDocuments = references.filter(
      (reference) => evaluateDocumentValidity(reference, now, warningDays) === 'expired'
    );
    const count = (states: readonly DocumentRequirementEffectiveState[]) =>
      requirements.filter((item) => states.includes(item.effectiveState)).length;
    return {
      generatedAt: now.toISOString(),
      warningDays,
      requirements,
      availableDocuments: references.map(cloneReference),
      expiringDocuments: expiringDocuments.map(cloneReference),
      expiredDocuments: expiredDocuments.map(cloneReference),
      totals: {
        pending: count(['pending']),
        overdue: count(['overdue']),
        fulfilled: count(['fulfilled']),
        attentionRequired: count([
          'overdue',
          'document_expiring',
          'document_expired',
          'document_unavailable',
        ]),
        waived: count(['waived']),
      },
    };
  }

  async createRequirement(
    context: DocumentApplicationContext,
    command: unknown
  ): Promise<DocumentRequirement> {
    this.assertPermission(context, 'documents:manage_requirements');
    const input = parseCreateRequirementInput(command);
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
      title: input.title,
      accessScope: input.accessScope,
      dueOn: input.dueOn,
      notes: input.notes,
      status: 'open',
      versionNumber: 1,
    };
    const payloadHash = await calculateDocumentSha256(canonicalDocumentJson(checksumPayload));
    const requirement: DocumentRequirement = {
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      logicalOwnerType: input.logicalOwnerType,
      logicalOwnerId: input.logicalOwnerId,
      category: input.category,
      title: input.title,
      accessScope: input.accessScope,
      status: 'open',
      dueOn: input.dueOn,
      notes: input.notes,
      versionNumber: 1,
      integrityCodeSha256: payloadHash,
      createdByUserId: context.actor.userId,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.gateway.createRequirement({
      requirement,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    });
    documentEventJournal.record({
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      eventType: 'document.requirement.created',
      requirementId: result.id,
      logicalOwnerType: result.logicalOwnerType,
      logicalOwnerId: result.logicalOwnerId,
      category: result.category,
      correlationId: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      occurredAt: result.createdAt,
      metadata: Object.freeze({ versionNumber: result.versionNumber, status: result.status }),
    });
    return structuredClone(result);
  }

  async fulfillRequirement(
    context: DocumentApplicationContext,
    command: unknown
  ): Promise<DocumentRequirement> {
    this.assertPermission(context, 'documents:fulfill_requirements');
    const input = parseFulfillRequirementInput(command);
    const { requirement } = await this.getRequirement(context, input.requirementId);
    const payloadHash = await calculateDocumentSha256(
      canonicalDocumentJson({
        organizationId: context.organizationId,
        requirementId: input.requirementId,
        documentId: input.documentId,
        expectedVersion: input.expectedVersion,
        operation: 'fulfill',
      })
    );
    const isPotentialReplay =
      requirement.status === 'fulfilled' &&
      requirement.linkedDocumentId === input.documentId &&
      requirement.versionNumber === input.expectedVersion + 1;
    if (isPotentialReplay) {
      const replay = await this.gateway.resolveRequirement({
        requirement,
        expectedVersion: input.expectedVersion,
        operation: 'fulfill',
        linkedDocumentId: input.documentId,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
      });
      documentEventJournal.record({
        id: this.idGenerator.generate(),
        organizationId: context.organizationId,
        actorUserId: context.actor.userId,
        eventType: 'document.requirement.fulfilled',
        documentId: input.documentId,
        requirementId: replay.id,
        logicalOwnerType: replay.logicalOwnerType,
        logicalOwnerId: replay.logicalOwnerId,
        category: replay.category,
        correlationId: input.idempotencyKey,
        idempotencyKey: input.idempotencyKey,
        occurredAt: replay.updatedAt,
        metadata: Object.freeze({ versionNumber: replay.versionNumber, status: replay.status }),
      });
      return structuredClone(replay);
    }
    const document = await this.gateway.getReferenceById(context.organizationId, input.documentId);
    if (!document || document.status !== 'active') {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Documento ativo não encontrado.');
    }
    const documentOwner = await this.resolveAndValidateOwner(
      context,
      document.logicalOwnerType,
      document.logicalOwnerId
    );
    if (!this.canAccess(context, document, documentOwner)) {
      throw new DocumentDomainError('FORBIDDEN', 'Documento fora do escopo autorizado.');
    }
    if (
      document.logicalOwnerType !== requirement.logicalOwnerType ||
      document.logicalOwnerId !== requirement.logicalOwnerId ||
      document.category !== requirement.category
    ) {
      throw new DocumentDomainError('REQUIREMENT_MISMATCH', 'O documento escolhido não atende esta pendência.');
    }
    const operationNow = this.clock.now();
    if (evaluateDocumentValidity(document, operationNow) === 'expired') {
      throw new DocumentDomainError('DOCUMENT_EXPIRED', 'Um documento vencido não pode atender a pendência.');
    }
    const now = operationNow.toISOString();
    const updatedPayload = {
      ...requirement,
      status: 'fulfilled' as const,
      linkedDocumentId: document.id,
      versionNumber: input.expectedVersion + 1,
      updatedAt: now,
      resolvedAt: now,
      resolvedByUserId: context.actor.userId,
      resolutionReason: undefined,
      integrityCodeSha256: '',
    };
    const integrityCodeSha256 = await calculateDocumentSha256(
      canonicalDocumentJson({ ...updatedPayload, integrityCodeSha256: undefined })
    );
    const result = await this.gateway.resolveRequirement({
      requirement: { ...updatedPayload, integrityCodeSha256 },
      expectedVersion: input.expectedVersion,
      operation: 'fulfill',
      linkedDocumentId: document.id,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    });
    documentEventJournal.record({
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      eventType: 'document.requirement.fulfilled',
      documentId: document.id,
      requirementId: result.id,
      logicalOwnerType: result.logicalOwnerType,
      logicalOwnerId: result.logicalOwnerId,
      category: result.category,
      correlationId: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      occurredAt: result.updatedAt,
      metadata: Object.freeze({ versionNumber: result.versionNumber, status: result.status }),
    });
    return structuredClone(result);
  }

  private async closeRequirement(
    context: DocumentApplicationContext,
    command: unknown,
    operation: 'waive' | 'cancel'
  ): Promise<DocumentRequirement> {
    this.assertPermission(context, 'documents:manage_requirements');
    const input = parseResolveRequirementInput(command);
    const { requirement } = await this.getRequirement(context, input.requirementId);
    const payloadHash = await calculateDocumentSha256(
      canonicalDocumentJson({
        organizationId: context.organizationId,
        requirementId: input.requirementId,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
        operation,
      })
    );
    const targetStatus: DocumentRequirement['status'] =
      operation === 'waive' ? 'waived' : 'cancelled';
    const isPotentialReplay =
      requirement.status === targetStatus && requirement.versionNumber === input.expectedVersion + 1;
    if (isPotentialReplay) {
      const replay = await this.gateway.resolveRequirement({
        requirement,
        expectedVersion: input.expectedVersion,
        operation,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
      });
      documentEventJournal.record({
        id: this.idGenerator.generate(),
        organizationId: context.organizationId,
        actorUserId: context.actor.userId,
        eventType:
          operation === 'waive'
            ? 'document.requirement.waived'
            : 'document.requirement.cancelled',
        requirementId: replay.id,
        logicalOwnerType: replay.logicalOwnerType,
        logicalOwnerId: replay.logicalOwnerId,
        category: replay.category,
        correlationId: input.idempotencyKey,
        idempotencyKey: input.idempotencyKey,
        occurredAt: replay.updatedAt,
        metadata: Object.freeze({ versionNumber: replay.versionNumber, status: replay.status }),
      });
      return structuredClone(replay);
    }
    const now = this.clock.now().toISOString();
    const updatedPayload = {
      ...requirement,
      status: targetStatus,
      linkedDocumentId: undefined,
      versionNumber: input.expectedVersion + 1,
      updatedAt: now,
      resolvedAt: now,
      resolvedByUserId: context.actor.userId,
      resolutionReason: input.reason,
      integrityCodeSha256: '',
    };
    const integrityCodeSha256 = await calculateDocumentSha256(
      canonicalDocumentJson({ ...updatedPayload, integrityCodeSha256: undefined })
    );
    const result = await this.gateway.resolveRequirement({
      requirement: { ...updatedPayload, integrityCodeSha256 },
      expectedVersion: input.expectedVersion,
      operation,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    });
    documentEventJournal.record({
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      actorUserId: context.actor.userId,
      eventType:
        operation === 'waive'
          ? 'document.requirement.waived'
          : 'document.requirement.cancelled',
      requirementId: result.id,
      logicalOwnerType: result.logicalOwnerType,
      logicalOwnerId: result.logicalOwnerId,
      category: result.category,
      correlationId: input.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      occurredAt: result.updatedAt,
      metadata: Object.freeze({ versionNumber: result.versionNumber, status: result.status }),
    });
    return structuredClone(result);
  }

  async waiveRequirement(
    context: DocumentApplicationContext,
    command: unknown
  ): Promise<DocumentRequirement> {
    return this.closeRequirement(context, command, 'waive');
  }

  async cancelRequirement(
    context: DocumentApplicationContext,
    command: unknown
  ): Promise<DocumentRequirement> {
    return this.closeRequirement(context, command, 'cancel');
  }
}
