import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DocumentRequirement,
  DocumentRequirementListQuery,
  DocumentReference,
  DocumentReferenceListQuery,
} from '../types/documents';
import { DOCUMENT_STORAGE_BUCKET, DocumentDomainError } from '../types/documents';
import type {
  ArchiveDocumentRecord,
  CreateDocumentRecord,
  CreateDocumentRequirementRecord,
  DocumentReferenceGateway,
  ReplaceDocumentRecord,
  ResolveDocumentRequirementRecord,
} from './documentGateway';

interface DocumentVersionRow {
  readonly id: string;
  readonly logical_document_id: string;
  readonly organization_id: string;
  readonly logical_owner_type: DocumentReference['logicalOwnerType'];
  readonly logical_owner_id: string;
  readonly category: DocumentReference['category'];
  readonly display_name: string;
  readonly mime_type: DocumentReference['mimeType'];
  readonly file_size_bytes: number | null;
  readonly access_scope: DocumentReference['accessScope'];
  readonly status: DocumentReference['status'];
  readonly is_current: boolean;
  readonly version_number: number;
  readonly predecessor_version_id: string | null;
  readonly version_note: string;
  readonly issued_on: string | null;
  readonly expires_on: string | null;
  readonly notes: string | null;
  readonly storage_state: DocumentReference['storageState'];
  readonly storage_bucket: string | null;
  readonly storage_object_path: string | null;
  readonly storage_uploaded_at: string | null;
  readonly metadata_checksum_sha256: string;
  readonly created_by_user_id: string;
  readonly created_by_display_name: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly archived_at: string | null;
  readonly archived_by_user_id: string | null;
}

const SELECT_COLUMNS = [
  'id',
  'logical_document_id',
  'organization_id',
  'logical_owner_type',
  'logical_owner_id',
  'category',
  'display_name',
  'mime_type',
  'file_size_bytes',
  'access_scope',
  'status',
  'is_current',
  'version_number',
  'predecessor_version_id',
  'version_note',
  'issued_on',
  'expires_on',
  'notes',
  'storage_state',
  'storage_bucket',
  'storage_object_path',
  'storage_uploaded_at',
  'metadata_checksum_sha256',
  'created_by_user_id',
  'created_by_display_name',
  'created_at',
  'updated_at',
  'archived_at',
  'archived_by_user_id',
].join(',');

function toReference(row: DocumentVersionRow): DocumentReference {
  return {
    id: row.id,
    logicalDocumentId: row.logical_document_id,
    organizationId: row.organization_id,
    logicalOwnerType: row.logical_owner_type,
    logicalOwnerId: row.logical_owner_id,
    category: row.category,
    displayName: row.display_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes ?? undefined,
    accessScope: row.access_scope,
    status: row.status,
    isCurrent: row.is_current,
    versionNumber: row.version_number,
    predecessorDocumentId: row.predecessor_version_id ?? undefined,
    versionNote: row.version_note,
    issuedOn: row.issued_on ?? undefined,
    expiresOn: row.expires_on ?? undefined,
    notes: row.notes ?? undefined,
    storageState: row.storage_state,
    storageBucket: row.storage_bucket === DOCUMENT_STORAGE_BUCKET
      ? DOCUMENT_STORAGE_BUCKET
      : undefined,
    storageObjectPath: row.storage_object_path ?? undefined,
    storageUploadedAt: row.storage_uploaded_at ?? undefined,
    metadataChecksumSha256: row.metadata_checksum_sha256,
    createdByUserId: row.created_by_user_id,
    createdByDisplayName: row.created_by_display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? undefined,
    archivedByUserId: row.archived_by_user_id ?? undefined,
  };
}

function toRpcReference(reference: DocumentReference): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(reference).filter(([, value]) => value !== undefined)
  );
}

function databaseError(error: { readonly message?: string } | null): DocumentDomainError {
  const message = error?.message ?? '';
  if (message.includes('AGROCORE_VERSION_CONFLICT')) {
    return new DocumentDomainError('VERSION_CONFLICT', 'O documento recebeu outra atualização.');
  }
  if (message.includes('AGROCORE_IDEMPOTENCY_CONFLICT')) {
    return new DocumentDomainError('IDEMPOTENCY_CONFLICT', 'A operação já foi utilizada com informações diferentes.');
  }
  if (message.includes('AGROCORE_REFERENCE_NOT_FOUND')) {
    return new DocumentDomainError('REFERENCE_NOT_FOUND', 'Referência documental não encontrada.');
  }
  if (message.includes('AGROCORE_INVALID_INPUT')) {
    return new DocumentDomainError('INVALID_INPUT', 'Os dados documentais informados são inválidos.');
  }
  if (message.includes('AGROCORE_INVALID_STATE')) {
    return new DocumentDomainError('INVALID_STATE', 'O documento não permite esta operação.');
  }
  if (message.includes('AGROCORE_FORBIDDEN')) {
    return new DocumentDomainError('FORBIDDEN', 'Operação documental não autorizada.');
  }
  return new DocumentDomainError('SERVICE_UNAVAILABLE', 'Não foi possível acessar o histórico documental.');
}

function rpcRow(data: unknown): DocumentReference {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new DocumentDomainError('SERVICE_UNAVAILABLE', 'O banco não confirmou a operação documental.');
  }
  return toReference(row as DocumentVersionRow);
}

function requirementsUnavailable(): never {
  throw new DocumentDomainError(
    'SERVICE_UNAVAILABLE',
    'Pendências documentais aguardam a etapa própria de persistência.'
  );
}

/** Persistência real das versões; nenhuma escrita direta na tabela é concedida ao cliente. */
export class SupabaseDocumentReferenceGateway implements DocumentReferenceGateway {
  constructor(private readonly client: SupabaseClient) {}

  async listReferences(
    query: DocumentReferenceListQuery,
    signal?: AbortSignal
  ): Promise<readonly DocumentReference[]> {
    let request = this.client
      .from('document_versions')
      .select(SELECT_COLUMNS)
      .eq('organization_id', query.organizationId)
      .eq('is_current', true)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true });
    if (query.ownerType && query.ownerType !== 'all') request = request.eq('logical_owner_type', query.ownerType);
    if (query.category && query.category !== 'all') request = request.eq('category', query.category);
    if (query.status && query.status !== 'all') request = request.eq('status', query.status);
    if (query.search?.trim()) request = request.ilike('display_name', `%${query.search.trim()}%`);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw databaseError(error);
    return ((data ?? []) as unknown as DocumentVersionRow[]).map(toReference);
  }

  async getReferenceById(
    organizationId: string,
    documentId: string
  ): Promise<DocumentReference | null> {
    const { data, error } = await this.client
      .from('document_versions')
      .select(SELECT_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('id', documentId)
      .maybeSingle();
    if (error) throw databaseError(error);
    return data ? toReference(data as unknown as DocumentVersionRow) : null;
  }

  async listVersionHistory(
    organizationId: string,
    logicalDocumentId: string,
    signal?: AbortSignal
  ): Promise<readonly DocumentReference[]> {
    let request = this.client
      .from('document_versions')
      .select(SELECT_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('logical_document_id', logicalDocumentId)
      .order('version_number', { ascending: false });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw databaseError(error);
    return ((data ?? []) as unknown as DocumentVersionRow[]).map(toReference);
  }

  async createReference(input: CreateDocumentRecord): Promise<DocumentReference> {
    const { data, error } = await this.client.rpc('agrocore_create_document_version', {
      p_reference: toRpcReference(input.reference),
      p_authorized_user_ids: [...input.authorizedUserIds],
      p_idempotency_key: input.idempotencyKey,
      p_payload_hash: input.payloadHash,
    });
    if (error) throw databaseError(error);
    return rpcRow(data);
  }

  async replaceReference(input: ReplaceDocumentRecord): Promise<DocumentReference> {
    const { data, error } = await this.client.rpc('agrocore_replace_document_version', {
      p_reference: toRpcReference(input.reference),
      p_previous_version_id: input.previousDocumentId,
      p_expected_version: input.expectedVersion,
      p_authorized_user_ids: [...input.authorizedUserIds],
      p_idempotency_key: input.idempotencyKey,
      p_payload_hash: input.payloadHash,
    });
    if (error) throw databaseError(error);
    return rpcRow(data);
  }

  async archiveReference(input: ArchiveDocumentRecord): Promise<DocumentReference> {
    const { data, error } = await this.client.rpc('agrocore_archive_document_version', {
      p_organization_id: input.organizationId,
      p_document_id: input.documentId,
      p_expected_version: input.expectedVersion,
      p_archived_at: input.archivedAt,
      p_archived_by_user_id: input.archivedByUserId,
      p_idempotency_key: input.idempotencyKey,
      p_payload_hash: input.payloadHash,
    });
    if (error) throw databaseError(error);
    return rpcRow(data);
  }

  async listRequirements(
    _query: DocumentRequirementListQuery,
    _signal?: AbortSignal
  ): Promise<readonly DocumentRequirement[]> {
    return requirementsUnavailable();
  }

  async getRequirementById(
    _organizationId: string,
    _requirementId: string
  ): Promise<DocumentRequirement | null> {
    return requirementsUnavailable();
  }

  async createRequirement(_input: CreateDocumentRequirementRecord): Promise<DocumentRequirement> {
    return requirementsUnavailable();
  }

  async resolveRequirement(_input: ResolveDocumentRequirementRecord): Promise<DocumentRequirement> {
    return requirementsUnavailable();
  }
}
