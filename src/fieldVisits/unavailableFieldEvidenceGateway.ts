import type {
  FieldEvidenceGateway,
  FieldEvidencePhoto,
  FieldEvidenceSet,
  InitializeFieldEvidenceInput,
  SetFieldEvidenceLocationInput,
  UploadFieldEvidencePhotoInput,
} from '../types/fieldEvidence';

function unavailable(): never {
  throw new Error('Serviço de fotos e geolocalização indisponível neste ambiente.');
}

export class UnavailableFieldEvidenceGateway implements FieldEvidenceGateway {
  async getByVisit(): Promise<FieldEvidenceSet | null> {
    return unavailable();
  }

  async getByAppraisal(): Promise<FieldEvidenceSet | null> {
    return unavailable();
  }

  async initialize(
    _input: InitializeFieldEvidenceInput
  ): Promise<FieldEvidenceSet> {
    return unavailable();
  }

  async setLocation(
    _input: SetFieldEvidenceLocationInput
  ): Promise<FieldEvidenceSet> {
    return unavailable();
  }

  async uploadPhoto(
    _input: UploadFieldEvidencePhotoInput,
    _file: File
  ): Promise<FieldEvidenceSet> {
    return unavailable();
  }

  async createPhotoUrl(_photo: FieldEvidencePhoto): Promise<string | null> {
    return unavailable();
  }

  clearAllSessionData(): void {}
}
