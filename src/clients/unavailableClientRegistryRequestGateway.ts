import type {
  ClientRegistryRequest,
  ClientRegistryRequestGateway,
  CreateClientRegistryRequestInput,
} from '../types/clientRegistryRequest';

function unavailable(): never {
  throw new Error('Serviço de solicitações cadastrais indisponível neste ambiente.');
}

export class UnavailableClientRegistryRequestGateway
  implements ClientRegistryRequestGateway
{
  async listAssigned(): Promise<readonly ClientRegistryRequest[]> {
    return unavailable();
  }

  async listRequestedBy(): Promise<readonly ClientRegistryRequest[]> {
    return unavailable();
  }

  async create(
    _input: CreateClientRegistryRequestInput
  ): Promise<ClientRegistryRequest> {
    return unavailable();
  }

  async start(): Promise<ClientRegistryRequest> {
    return unavailable();
  }

  async attachProperty(): Promise<ClientRegistryRequest> {
    return unavailable();
  }

  async fulfill(): Promise<ClientRegistryRequest> {
    return unavailable();
  }

  clearAllSessionData(): void {}
}
