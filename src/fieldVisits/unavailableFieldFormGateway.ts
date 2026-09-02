import { TechnicalVisitDomainError } from '../types/technicalVisit';
import type {
  SaveTechnicalVisitFieldFormInput,
  TechnicalVisitFieldForm,
  TechnicalVisitFieldFormGateway,
  TechnicalVisitFieldFormRevision,
} from '../types/technicalVisitFieldForm';

function unavailable(): never {
  throw new TechnicalVisitDomainError(
    'SERVICE_UNAVAILABLE',
    'Serviço de formulário de campo indisponível neste ambiente.'
  );
}

export class UnavailableTechnicalVisitFieldFormGateway
  implements TechnicalVisitFieldFormGateway
{
  async getFieldForm(): Promise<TechnicalVisitFieldForm | null> {
    return unavailable();
  }

  async saveFieldForm(
    _input: SaveTechnicalVisitFieldFormInput
  ): Promise<TechnicalVisitFieldForm> {
    return unavailable();
  }

  async listFieldFormRevisions(): Promise<
    readonly TechnicalVisitFieldFormRevision[]
  > {
    return unavailable();
  }

  clearAllSessionData(): void {}
}
