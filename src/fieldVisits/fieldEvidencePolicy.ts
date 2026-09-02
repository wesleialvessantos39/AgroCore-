import { DocumentDomainError } from '../types/documents';
import type {
  FieldEvidenceLocation,
  FieldEvidencePhotoMimeType,
  FieldEvidenceSet,
} from '../types/fieldEvidence';
import type { Client } from '../types/client';
import type { Property } from '../types/property';
import { verifyDocumentFileSignature } from '../documents/documentStoragePolicy';

export const MAX_FIELD_EVIDENCE_PHOTO_BYTES = 15 * 1024 * 1024;
const PHOTO_MIMES = new Set<FieldEvidencePhotoMimeType>([
  'image/jpeg',
  'image/png',
  'image/tiff',
]);

export function buildRegistryLocation(
  property: Property | null,
  client: Client | null
): FieldEvidenceLocation | undefined {
  const coordinate = property?.referenceCoordinate;
  let label: string | undefined;

  if (property?.propertyType === 'urban') {
    label = [
      property.location.street,
      property.location.number,
      property.location.neighborhood,
      property.location.city,
      property.location.state,
    ]
      .filter(Boolean)
      .join(', ');
  } else if (property?.propertyType === 'rural') {
    label = [
      property.location.ruralRegionOrCommunity,
      property.location.district,
      property.location.city,
      property.location.state,
    ]
      .filter(Boolean)
      .join(', ');
  } else if (client?.address.addressType === 'urban') {
    label = [
      client.address.street,
      client.address.number,
      client.address.neighborhood,
      client.address.city,
      client.address.state,
    ]
      .filter(Boolean)
      .join(', ');
  } else if (client?.address.addressType === 'rural') {
    label = [
      client.address.locality,
      client.address.city,
      client.address.state,
    ]
      .filter(Boolean)
      .join(', ');
  }

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
        label,
        source: 'property_reference',
      };
    }
  }

  if (label) {
    return {
      latitude: null,
      longitude: null,
      label,
      source: 'registry_address',
    };
  }

  return undefined;
}

export async function validateFieldEvidencePhoto(file: File): Promise<FieldEvidencePhotoMimeType> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_FIELD_EVIDENCE_PHOTO_BYTES) {
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

export function validateFieldEvidenceLocation(location: FieldEvidenceLocation): void {
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
    (!Number.isFinite(location.accuracyMeters) || location.accuracyMeters < 0)
  ) {
    throw new Error('Precisão geográfica inválida.');
  }
}

export function toAppraisalFieldEvidenceSnapshot(
  evidence: FieldEvidenceSet
): import('../types/fieldEvidence').AppraisalFieldEvidenceSnapshot {
  return {
    evidenceId: evidence.id,
    location: evidence.location,
    photos: evidence.photos.map((photo) => ({
      id: photo.id,
      source: photo.source,
      caption: photo.caption,
      capturedAt: photo.capturedAt,
      legacyReference: photo.legacyReference,
      documentVersionId: photo.documentVersionId,
    })),
    synchronizedAt: new Date().toISOString(),
  };
}
