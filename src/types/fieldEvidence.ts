import type { OrganizationRole } from './auth';

export const FIELD_EVIDENCE_STORAGE_BUCKET = 'field-evidence' as const;

export type FieldEvidenceLocationSource =
  | 'appraisal'
  | 'property_reference'
  | 'property_geometry'
  | 'registry_address'
  | 'device'
  | 'manual';

export type FieldEvidencePhotoSource =
  | 'appraisal_document'
  | 'registry_document'
  | 'appraisal_legacy'
  | 'visit_capture'
  | 'appraisal_capture';

export type FieldEvidencePhotoMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/tiff';

export interface FieldEvidenceLocation {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly accuracyMeters?: number;
  readonly label?: string;
  readonly source: FieldEvidenceLocationSource;
  readonly capturedAt?: string;
}

export interface FieldEvidencePhoto {
  readonly id: string;
  readonly organizationId: string;
  readonly evidenceId: string;
  readonly source: FieldEvidencePhotoSource;
  readonly documentVersionId?: string;
  readonly legacyReference?: string;
  readonly storageBucket?: string;
  readonly storageObjectPath?: string;
  readonly mimeType?: FieldEvidencePhotoMimeType;
  readonly fileSizeBytes?: number;
  readonly caption?: string;
  readonly capturedAt: string;
  readonly capturedByUserId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface FieldEvidenceSet {
  readonly id: string;
  readonly organizationId: string;
  readonly visitId?: string;
  readonly appraisalId?: string;
  readonly propertyId?: string;
  readonly clientId: string;
  readonly location?: FieldEvidenceLocation;
  readonly photos: readonly FieldEvidencePhoto[];
  readonly version: number;
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly updatedByUserId: string;
  readonly updatedAt: string;
}

export interface FieldEvidenceActor {
  readonly userId: string;
  readonly role: OrganizationRole;
  readonly permissions: readonly string[];
}

export interface InitializeFieldEvidenceInput {
  readonly organizationId: string;
  readonly visitId?: string;
  readonly appraisalId?: string;
  readonly propertyId?: string;
  readonly clientId: string;
  readonly actorUserId: string;
  readonly registryLocation?: FieldEvidenceLocation;
  readonly legacyAppraisalPhotoReferences?: readonly string[];
}

export interface SetFieldEvidenceLocationInput {
  readonly organizationId: string;
  readonly evidenceId: string;
  readonly actorUserId: string;
  readonly expectedVersion: number;
  readonly location: FieldEvidenceLocation;
}

export interface UploadFieldEvidencePhotoInput {
  readonly organizationId: string;
  readonly evidenceId: string;
  readonly actorUserId: string;
  readonly expectedVersion: number;
  readonly source: 'visit_capture' | 'appraisal_capture';
  readonly caption?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface FieldEvidenceGateway {
  getByVisit(
    organizationId: string,
    visitId: string,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet | null>;

  getByAppraisal(
    organizationId: string,
    appraisalId: string,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet | null>;

  initialize(
    input: InitializeFieldEvidenceInput,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet>;

  setLocation(
    input: SetFieldEvidenceLocationInput,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet>;

  uploadPhoto(
    input: UploadFieldEvidencePhotoInput,
    file: File,
    signal?: AbortSignal
  ): Promise<FieldEvidenceSet>;

  createPhotoUrl(
    photo: FieldEvidencePhoto,
    expiresInSeconds?: number
  ): Promise<string | null>;

  clearAllSessionData(): void;
}

export interface AppraisalFieldEvidenceSnapshot {
  readonly evidenceId: string;
  readonly location?: FieldEvidenceLocation;
  readonly photos: readonly {
    readonly id: string;
    readonly source: FieldEvidencePhotoSource;
    readonly caption?: string;
    readonly capturedAt: string;
    readonly legacyReference?: string;
    readonly documentVersionId?: string;
  }[];
  readonly synchronizedAt: string;
}
