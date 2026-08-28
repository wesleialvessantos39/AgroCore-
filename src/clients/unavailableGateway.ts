import {
  Client,
  ClientGateway,
  ClientListPage,
  ClientListQuery,
  CreateClientInput,
  UpdateClientInput,
} from '../types/client';

/**
 * UnavailableClientGateway
 *
 * Implementação segura e fechada utilizada quando não há infraestrutura de persistência real configurada.
 * Rejeita qualquer tentativa de consulta ou mutação sem simular dados nem criar registros artificiais.
 */
export class UnavailableClientGateway implements ClientGateway {
  async listClients(
    _query: ClientListQuery,
    _signal?: AbortSignal
  ): Promise<ClientListPage> {
    throw new Error('Serviço de clientes indisponível neste ambiente.');
  }

  async getClientById(
    _organizationId: string,
    _clientId: string
  ): Promise<Client | null> {
    throw new Error('Serviço de clientes indisponível neste ambiente.');
  }

  async createClient(
    _organizationId: string,
    _input: CreateClientInput
  ): Promise<Client> {
    throw new Error('Serviço de clientes indisponível neste ambiente.');
  }

  async updateClient(
    _organizationId: string,
    _clientId: string,
    _input: UpdateClientInput
  ): Promise<Client> {
    throw new Error('Serviço de clientes indisponível neste ambiente.');
  }
}
