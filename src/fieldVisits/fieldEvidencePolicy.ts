import { DocumentDomainError } from '../types/documents';
import type {
  FieldEvidenceCompleteness,
  FieldEvidenceLocation,
  FieldEvidencePhotoMimeType,
  FieldEvidenceSet,
} from '../types/fieldEvidence';
import type { Property } from '../types/property';
import { verifyDocumentFileSignature } from '../documents/documentStoragePolicy';

export const MAX_FIELD_EVIDENCE_PHOTO_BYTES = 15 * 1024 * 1024;
const PHOTO_MIMES = new Set<FieldEvidencePhotoMimeType>([
  'image/jpeg',
  'image/png',
  'image/tiff',
]);

export function buildPropertyRegistryLocation(
  property: Property | null
): FieldEvidenceLocation | undefined {
  if (!property) return undefined;

  const label =
    property.propertyType === 'urban'
      ? [
          property.location.street,
          property.location.number,
          property.location.neighborhood,
          property.location.city,
          property.location.state,
        ]
          .filter(Boolean)
          .join(', ')
      : [
          property.location.ruralRegionOrCommunity,
          property.location.district,
          property.location.city,
          property.location.state,
        ]
          .filter(Boolean)
          .join(', ');

  const coordinate = property.referenceCoordinate;
  if (coordinate) {
    const latitude = Number(coordinate.latitude);
    const longitude = Number(coordinate.longitude);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return {
        latitude,
        longitude,
        label: label || undefined,
        source: 'property_reference',
      };
    }
  }

  return label
    ? {
        latitude: null,
        longitude: null,
        label,
        source: 'property_reference',
      }
    : undefined;
}

export function getFieldEvidenceCompleteness(
  evidence: FieldEvidenceSet | null,
  propertyId?: string
): FieldEvidenceCompleteness {
  const hasProperty = Boolean(propertyId);
  const hasGeolocation = Boolean(
    evidence?.location &&
      evidence.location.latitude !== null &&
      evidence.location.longitude !== null
  );
  const hasPhotos = Boolean(evidence?.photos.length);

  return {
    hasProperty,
    hasGeolocation,
    hasPhotos,
    complete: hasProperty && hasGeolocation && hasPhotos,
  };
}

export async function validateFieldEvidencePhoto(
  file: File
): Promise<FieldEvidencePhotoMimeType> {
  if (
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > MAX_FIELD_EVIDENCE_PHOTO_BYTES
  ) {
    throw new DocumentDomainError(
      'INVALID_FILE',
      'A foto deve possuir até 15 MB e não pode estar vazia.'
    );
  }
  if (!PHOTO_MIMES.has(file.type as FieldEvidencePhotoMimeType)) {
    throw new DocumentDomainError(
      'INVALID_FILE',
      'Use imagens JPEG, PNG ou TIFF.'
    );
  }
  await verifyDocumentFileSignature(file);
  return file.type as FieldEvidencePhotoMimeType;
}

export function validateFieldEvidenceLocation(
  location: FieldEvidenceLocation
): void {
  const hasLatitude = location.latitude !== null;
  const hasLongitude = location.longitude !== null;

  if (hasLatitude !== hasLongitude) {
    throw new Error('Latitude e longitude devem ser informadas em conjunto.');
  }

  if (hasLatitude && hasLongitude) {
    if (
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      location.latitude! < -90 ||
      location.latitude! > 90 ||
      location.longitude! < -180 ||
      location.longitude! > 180
    ) {
      throw new Error('Coordenadas geográficas inválidas.');
    }
  }

  if (
    location.accuracyMeters !== undefined &&
    (!Number.isFinite(location.accuracyMeters) ||
      location.accuracyMeters < 0)
  ) {
    throw new Error('Precisão geográfica inválida.');
  }
}

export function toAppraisalFieldEvidenceSnapshot(
  evidence: FieldEvidenceSet
): import('../types/fieldEvidence').AppraisalFieldEvidenceSnapshot {
  return {
    evidenceId: evidence.id,
    propertyId: evidence.propertyId,
    location: evidence.location,
    photos: evidence.photos.map((photo) => ({
      id: photo.id,
      source: photo.source,
      caption: photo.caption,
      capturedAt: photo.capturedAt,
      documentVersionId: photo.documentVersionId,
    })),
    synchronizedAt: new Date().toISOString(),
  };
}
