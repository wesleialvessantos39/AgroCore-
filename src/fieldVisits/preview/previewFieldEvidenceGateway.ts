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
  private readonly propertyIndex = new Map<string, string>();
  private readonly visitIndex = new Map<string, string>();
  private readonly appraisalIndex = new Map<string, string>();
  private readonly photoUrls = new Map<string, string>();

  private key(organizationId: string, id: string): string {
    return organizationId + ':' + id;
  }

  private byId(id: string | undefined): FieldEvidenceSet | null {
    if (!id) return null;
    const value = this.sets.get(id);
    return value ? cloneEvidence(value) : null;
  }

  async getByProperty(
    organizationId: string,
    propertyId: string,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet | null> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    return this.byId(this.propertyIndex.get(this.key(organizationId, propertyId)));
  }

  async getByVisit(
    organizationId: string,
    visitId: string,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet | null> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    return this.byId(this.visitIndex.get(this.key(organizationId, visitId)));
  }

  async getByAppraisal(
    organizationId: string,
    appraisalId: string,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet | null> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    return this.byId(this.appraisalIndex.get(this.key(organizationId, appraisalId)));
  }

  async initialize(
    input: InitializeFieldEvidenceInput,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    if (!input.propertyId) throw new Error('Imóvel obrigatório para fotos e geolocalização.');

    const propertyKey = this.key(input.organizationId, input.propertyId);
    const existingId = this.propertyIndex.get(propertyKey);
    const now = new Date().toISOString();

    if (existingId) {
      const current = this.sets.get(existingId);
      if (!current) throw new Error('Evidência canônica não encontrada.');
      const next: FieldEvidenceSet = {
        ...current,
        location: input.registryLocation ?? current.location,
        updatedByUserId: input.actorUserId,
        updatedAt: now,
        version:
          input.registryLocation &&
          JSON.stringify(input.registryLocation) !== JSON.stringify(current.location)
            ? current.version + 1
            : current.version,
      };
      this.sets.set(next.id, cloneEvidence(next));

      if (input.visitId) {
        this.visitIndex.set(this.key(input.organizationId, input.visitId), next.id);
      }
      if (input.appraisalId) {
        this.appraisalIndex.set(this.key(input.organizationId, input.appraisalId), next.id);
      }
      return cloneEvidence(next);
    }

    const id = secureId();
    const created: FieldEvidenceSet = {
      id,
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      clientId: input.clientId,
      location: input.registryLocation,
      photos: [],
      version: 1,
      createdByUserId: input.actorUserId,
      createdAt: now,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
    };

    this.sets.set(id, cloneEvidence(created));
    this.propertyIndex.set(propertyKey, id);
    if (input.visitId) {
      this.visitIndex.set(this.key(input.organizationId, input.visitId), id);
    }
    if (input.appraisalId) {
      this.appraisalIndex.set(this.key(input.organizationId, input.appraisalId), id);
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
    this.propertyIndex.clear();
    this.visitIndex.clear();
    this.appraisalIndex.clear();
  }
}
