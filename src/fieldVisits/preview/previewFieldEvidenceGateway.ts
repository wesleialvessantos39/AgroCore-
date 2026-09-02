import type {
  FieldEvidenceGateway,
  FieldEvidencePhoto,
  FieldEvidenceSet,
  InitializeFieldEvidenceInput,
  SetFieldEvidenceLocationInput,
  UploadFieldEvidencePhotoInput,
} from '../../types/fieldEvidence';
import {
  validateFieldEvidenceLocation,
  validateFieldEvidencePhoto,
} from '../fieldEvidencePolicy';

function cloneEvidence(value: FieldEvidenceSet): FieldEvidenceSet {
  return {
    ...value,
    location: value.location ? { ...value.location } : undefined,
    photos: value.photos.map((photo) => ({ ...photo })),
  };
}

function secureId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Gerador seguro de identificadores indisponível.');
  }
  return globalThis.crypto.randomUUID();
}

export class PreviewFieldEvidenceGateway implements FieldEvidenceGateway {
  private readonly sets = new Map<string, FieldEvidenceSet>();
  private readonly visitIndex = new Map<string, string>();
  private readonly appraisalIndex = new Map<string, string>();
  private readonly photoUrls = new Map<string, string>();

  private orgKey(organizationId: string, id: string): string {
    return organizationId + ':' + id;
  }

  private byId(id: string): FieldEvidenceSet | null {
    const value = this.sets.get(id);
    return value ? cloneEvidence(value) : null;
  }

  async getByVisit(
    organizationId: string,
    visitId: string,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet | null> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    const id = this.visitIndex.get(this.orgKey(organizationId, visitId));
    return id ? this.byId(id) : null;
  }

  async getByAppraisal(
    organizationId: string,
    appraisalId: string,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet | null> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    const id = this.appraisalIndex.get(this.orgKey(organizationId, appraisalId));
    return id ? this.byId(id) : null;
  }

  async initialize(
    input: InitializeFieldEvidenceInput,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');

    const appraisalExisting = input.appraisalId
      ? this.appraisalIndex.get(this.orgKey(input.organizationId, input.appraisalId))
      : undefined;
    const visitExisting = input.visitId
      ? this.visitIndex.get(this.orgKey(input.organizationId, input.visitId))
      : undefined;

    if (appraisalExisting && visitExisting && appraisalExisting !== visitExisting) {
      throw new Error('As evidências existentes não correspondem ao mesmo atendimento.');
    }

    const existingId = appraisalExisting ?? visitExisting;
    const now = new Date().toISOString();

    if (existingId) {
      const current = this.sets.get(existingId);
      if (!current) throw new Error('Evidência não encontrada.');

      if (
        (current.propertyId && input.propertyId && current.propertyId !== input.propertyId) ||
        current.clientId !== input.clientId
      ) {
        throw new Error('A evidência não corresponde ao cliente ou imóvel informado.');
      }

      const existingLegacy = new Set(
        current.photos.map((photo) => photo.legacyReference).filter(Boolean)
      );
      const imported: FieldEvidencePhoto[] = (input.legacyAppraisalPhotoReferences ?? [])
        .filter((reference) => reference.trim() && !existingLegacy.has(reference.trim()))
        .map((reference) => ({
          id: secureId(),
          organizationId: input.organizationId,
          evidenceId: current.id,
          source: 'appraisal_legacy' as const,
          legacyReference: reference.trim(),
          capturedAt: now,
        }));

      const next: FieldEvidenceSet = {
        ...current,
        visitId: current.visitId ?? input.visitId,
        appraisalId: current.appraisalId ?? input.appraisalId,
        propertyId: current.propertyId ?? input.propertyId,
        location: current.location ?? input.registryLocation,
        photos: [...current.photos, ...imported],
        updatedByUserId: input.actorUserId,
        updatedAt: now,
        version: imported.length > 0 || (!current.location && input.registryLocation)
          ? current.version + 1
          : current.version,
      };
      this.sets.set(next.id, cloneEvidence(next));
      if (next.visitId) {
        this.visitIndex.set(this.orgKey(next.organizationId, next.visitId), next.id);
      }
      if (next.appraisalId) {
        this.appraisalIndex.set(
          this.orgKey(next.organizationId, next.appraisalId),
          next.id
        );
      }
      return cloneEvidence(next);
    }

    const id = secureId();
    const photos: FieldEvidencePhoto[] = (input.legacyAppraisalPhotoReferences ?? [])
      .filter((reference) => reference.trim())
      .map((reference) => ({
        id: secureId(),
        organizationId: input.organizationId,
        evidenceId: id,
        source: 'appraisal_legacy',
        legacyReference: reference.trim(),
        capturedAt: now,
      }));

    const created: FieldEvidenceSet = {
      id,
      organizationId: input.organizationId,
      visitId: input.visitId,
      appraisalId: input.appraisalId,
      propertyId: input.propertyId,
      clientId: input.clientId,
      location: input.registryLocation,
      photos,
      version: 1,
      createdByUserId: input.actorUserId,
      createdAt: now,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
    };
    this.sets.set(id, cloneEvidence(created));
    if (created.visitId) {
      this.visitIndex.set(this.orgKey(created.organizationId, created.visitId), id);
    }
    if (created.appraisalId) {
      this.appraisalIndex.set(
        this.orgKey(created.organizationId, created.appraisalId),
        id
      );
    }
    return cloneEvidence(created);
  }

  async setLocation(
    input: SetFieldEvidenceLocationInput,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    validateFieldEvidenceLocation(input.location);
    const current = this.sets.get(input.evidenceId);
    if (!current || current.organizationId !== input.organizationId) {
      throw new Error('Evidência não encontrada.');
    }
    if (current.version !== input.expectedVersion) {
      throw new Error('A evidência foi alterada por outra operação. Recarregue os dados.');
    }
    const now = new Date().toISOString();
    const next: FieldEvidenceSet = {
      ...current,
      location: { ...input.location },
      version: current.version + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
    };
    this.sets.set(next.id, cloneEvidence(next));
    return cloneEvidence(next);
  }

  async uploadPhoto(
    input: UploadFieldEvidencePhotoInput,
    file: File,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    const mimeType = await validateFieldEvidencePhoto(file);
    const current = this.sets.get(input.evidenceId);
    if (!current || current.organizationId !== input.organizationId) {
      throw new Error('Evidência não encontrada.');
    }
    if (current.version !== input.expectedVersion) {
      throw new Error('A evidência foi alterada por outra operação. Recarregue os dados.');
    }

    const photoId = secureId();
    const now = new Date().toISOString();
    const photo: FieldEvidencePhoto = {
      id: photoId,
      organizationId: input.organizationId,
      evidenceId: current.id,
      source: input.source,
      storageBucket: 'preview',
      storageObjectPath: photoId,
      mimeType,
      fileSizeBytes: file.size,
      caption: input.caption?.trim() || undefined,
      capturedAt: now,
      capturedByUserId: input.actorUserId,
      latitude: input.latitude,
      longitude: input.longitude,
    };

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      this.photoUrls.set(photoId, URL.createObjectURL(file));
    }

    const next: FieldEvidenceSet = {
      ...current,
      photos: [...current.photos, photo],
      version: current.version + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
    };
    this.sets.set(next.id, cloneEvidence(next));
    return cloneEvidence(next);
  }

  async createPhotoUrl(photo: FieldEvidencePhoto): Promise<string | null> {
    return this.photoUrls.get(photo.id) ?? null;
  }

  clearAllSessionData(): void {
    for (const url of this.photoUrls.values()) {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    }
    this.photoUrls.clear();
    this.sets.clear();
    this.visitIndex.clear();
    this.appraisalIndex.clear();
  }
}
