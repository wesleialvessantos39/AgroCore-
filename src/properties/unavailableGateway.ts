import {
  PropertyGateway,
  PropertyListPage,
  PropertyListQuery,
  Property,
  CreatePropertyInput,
  UpdatePropertyInput,
  PropertyMutationResult,
} from '../types/property';

/**
 * UnavailablePropertyGateway
 *
 * Implementação segura e fechada utilizada quando não há infraestrutura de persistência real configurada.
 * Rejeita qualquer tentativa de consulta ou mutação sem simular dados nem criar registros artificiais.
 */
export class UnavailablePropertyGateway implements PropertyGateway {
  async listProperties(
    _query: PropertyListQuery,
    _signal?: AbortSignal
  ): Promise<PropertyListPage> {
    throw new Error('Serviço de imóveis indisponível neste ambiente.');
  }

  async getPropertyById(
    _organizationId: string,
    _propertyId: string
  ): Promise<Property | null> {
    throw new Error('Serviço de imóveis indisponível neste ambiente.');
  }

  async createProperty(
    _input: CreatePropertyInput
  ): Promise<PropertyMutationResult> {
    throw new Error('Serviço de imóveis indisponível neste ambiente.');
  }

  async updateProperty(
    _propertyId: string,
    _input: UpdatePropertyInput
  ): Promise<PropertyMutationResult> {
    throw new Error('Serviço de imóveis indisponível neste ambiente.');
  }
}
