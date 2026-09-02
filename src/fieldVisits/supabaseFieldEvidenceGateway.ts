import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FIELD_EVIDENCE_STORAGE_BUCKET,
  type FieldEvidenceGateway,
  type FieldEvidenceLocation,
  type FieldEvidencePhoto,
  type FieldEvidencePhotoMimeType,
  type FieldEvidenceSet,
  type InitializeFieldEvidenceInput,
  type SetFieldEvidenceLocationInput,
  type UploadFieldEvidencePhotoInput,
} from '../types/fieldEvidence';
import { validateFieldEvidenceLocation, validateFieldEvidencePhoto } from './fieldEvidencePolicy';

interface EvidenceRow {
  id: string;
  organization_id: string;
  visit_id: string | null;
  appraisal_id: string | null;
  property_id: string | null;
  client_id: string;
  location: FieldEvidenceLocation | null;
  version: number;
  created_by_user_id: string;
  created_at: string;
  updated_by_user_id: string;
  updated_at: string;
}

interface PhotoRow {
  id: string;
  organization_id: string;
  evidence_id: string;
  source: FieldEvidencePhoto['source'];
  document_version_id: string | null;
  legacy_reference: string | null;
  storage_bucket: string | null;
  storage_object_path: string | null;
  mime_type: FieldEvidencePhotoMimeType | null;
  file_size_bytes: number | null;
  caption: string | null;
  captured_at: string;
  captured_by_user_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

const EVIDENCE_COLUMNS =
  'id,organization_id,visit_id,appraisal_id,property_id,client_id,location,version,created_by_user_id,created_at,updated_by_user_id,updated_at';
const PHOTO_COLUMNS =
  'id,organization_id,evidence_id,source,document_version_id,legacy_reference,storage_bucket,storage_object_path,mime_type,file_size_bytes,caption,captured_at,captured_by_user_id,latitude,longitude';

function mapPhoto(row: PhotoRow): FieldEvidencePhoto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    evidenceId: row.evidence_id,
    source: row.source,
    documentVersionId: row.document_version_id ?? undefined,
    legacyReference: row.legacy_reference ?? undefined,
    storageBucket: row.storage_bucket ?? undefined,
    storageObjectPath: row.storage_object_path ?? undefined,
    mimeType: row.mime_type ?? undefined,
    fileSizeBytes: row.file_size_bytes ?? undefined,
    caption: row.caption ?? undefined,
    capturedAt: row.captured_at,
    capturedByUserId: row.captured_by_user_id ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
  };
}

function mapError(error: { readonly message?: string } | null): Error {
  const message = error?.message ?? '';
  if (message.includes('AGROCORE_EVIDENCE_CONFLICT')) {
    return new Error('As evidências já estão ligadas a outro atendimento.');
  }
  if (message.includes('AGROCORE_CONCURRENCY_CONFLICT')) {
    return new Error('A evidência foi alterada por outra operação. Recarregue os dados.');
  }
  if (message.includes('AGROCORE_RESPONSIBLE_MISMATCH')) {
    return new Error('Somente o responsável atual pode registrar evidências desta visita.');
  }
  if (message.includes('AGROCORE_VISIT_NOT_READY')) {
    return new Error('As evidências podem ser alteradas somente após a confirmação e durante a execução.');
  }
  if (message.includes('AGROCORE_FORBIDDEN')) {
    return new Error('Você não possui permissão para acessar estas evidências.');
  }
  if (message.includes('AGROCORE_NOT_FOUND')) {
    return new Error('A evidência ou o atendimento não foi encontrado.');
  }
  if (message.includes('AGROCORE_INVALID_INPUT')) {
    return new Error('As informações de fotos ou localização são inválidas.');
  }
  return new Error('Serviço de fotos e geolocalização indisponível neste momento.');
}

function extensionFor(mime: FieldEvidencePhotoMimeType): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return 'tiff';
}

export class SupabaseFieldEvidenceGateway implements FieldEvidenceGateway {
  constructor(private readonly client: SupabaseClient) {}

  private async load(row: EvidenceRow): Promise<FieldEvidenceSet> {
    const { data, error } = await this.client
      .from('field_evidence_photos')
      .select(PHOTO_COLUMNS)
      .eq('organization_id', row.organization_id)
      .eq('evidence_id', row.id)
      .order('captured_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw mapError(error);
    return {
      id: row.id,
      organizationId: row.organization_id,
      visitId: row.visit_id ?? undefined,
      appraisalId: row.appraisal_id ?? undefined,
      propertyId: row.property_id ?? undefined,
      clientId: row.client_id,
      location: row.location ?? undefined,
      photos: ((data ?? []) as unknown as PhotoRow[]).map(mapPhoto),
      version: row.version,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedByUserId: row.updated_by_user_id,
      updatedAt: row.updated_at,
    };
  }

  private async getOne(
    organizationId: string,
    field: 'visit_id' | 'appraisal_id',
    value: string,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet | null> {
    let request = this.client
      .from('field_evidence_sets')
      .select(EVIDENCE_COLUMNS)
      .eq('organization_id', organizationId)
      .eq(field, value)
      .maybeSingle();
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw mapError(error);
    return data ? this.load(data as unknown as EvidenceRow) : null;
  }

  async getByVisit(
    organizationId: string,
    visitId: string,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet | null> {
    return this.getOne(organizationId, 'visit_id', visitId, signal);
  }

  async getByAppraisal(
    organizationId: string,
    appraisalId: string,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet | null> {
    return this.getOne(organizationId, 'appraisal_id', appraisalId, signal);
  }

  async initialize(
    input: InitializeFieldEvidenceInput,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    const { data, error } = await this.client.rpc('agrocore_initialize_field_evidence', {
      p_organization_id: input.organizationId,
      p_visit_id: input.visitId ?? null,
      p_appraisal_id: input.appraisalId ?? null,
      p_property_id: input.propertyId ?? null,
      p_client_id: input.clientId,
      p_registry_location: input.registryLocation ?? null,
      p_legacy_photo_references: input.legacyAppraisalPhotoReferences ?? [],
    });
    if (error) throw mapError(error);
    const row = (Array.isArray(data) ? data[0] : data) as EvidenceRow | null;
    if (!row) throw new Error('O banco não confirmou a inicialização das evidências.');
    return this.load(row);
  }

  async setLocation(
    input: SetFieldEvidenceLocationInput,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    validateFieldEvidenceLocation(input.location);
    const { data, error } = await this.client.rpc('agrocore_set_field_evidence_location', {
      p_organization_id: input.organizationId,
      p_evidence_id: input.evidenceId,
      p_expected_version: input.expectedVersion,
      p_location: input.location,
    });
    if (error) throw mapError(error);
    const row = (Array.isArray(data) ? data[0] : data) as EvidenceRow | null;
    if (!row) throw new Error('O banco não confirmou a localização.');
    return this.load(row);
  }

  async uploadPhoto(
    input: UploadFieldEvidencePhotoInput,
    file: File,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    const mimeType = await validateFieldEvidencePhoto(file);
    if (!globalThis.crypto?.randomUUID) {
      throw new Error('Gerador seguro de identificadores indisponível.');
    }
    const photoId = globalThis.crypto.randomUUID();
    const objectPath =
      input.organizationId +
      '/' +
      input.evidenceId +
      '/' +
      photoId +
      '.' +
      extensionFor(mimeType);

    const upload = await this.client.storage
      .from(FIELD_EVIDENCE_STORAGE_BUCKET)
      .upload(objectPath, file, {
        cacheControl: '3600',
        contentType: mimeType,
        upsert: false,
      });
    if (upload.error) throw mapError(upload.error);

    try {
      const { data, error } = await this.client.rpc('agrocore_register_field_evidence_photo', {
        p_organization_id: input.organizationId,
        p_evidence_id: input.evidenceId,
        p_expected_version: input.expectedVersion,
        p_photo_id: photoId,
        p_source: input.source,
        p_storage_object_path: objectPath,
        p_mime_type: mimeType,
        p_file_size_bytes: file.size,
        p_caption: input.caption?.trim() || null,
        p_latitude: input.latitude ?? null,
        p_longitude: input.longitude ?? null,
      });
      if (error) throw mapError(error);
      const row = (Array.isArray(data) ? data[0] : data) as EvidenceRow | null;
      if (!row) throw new Error('O banco não confirmou a foto.');
      return await this.load(row);
    } catch (error) {
      await this.client.storage.from(FIELD_EVIDENCE_STORAGE_BUCKET).remove([objectPath]);
      throw error;
    }
  }

  async createPhotoUrl(
    photo: FieldEvidencePhoto,
    expiresInSeconds = 300
  ): Promise<string | null> {
    if (!photo.storageBucket || !photo.storageObjectPath) return null;
    const seconds = Math.max(60, Math.min(3600, Math.floor(expiresInSeconds)));
    const { data, error } = await this.client.storage
      .from(photo.storageBucket)
      .createSignedUrl(photo.storageObjectPath, seconds);
    if (error) return null;
    return data.signedUrl;
  }

  clearAllSessionData(): void {}
}
