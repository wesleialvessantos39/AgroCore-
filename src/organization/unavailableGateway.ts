import {
  OrganizationGateway,
  OrganizationContextData,
  OrganizationMembership,
} from '../types/organization';

/**
 * UnavailableOrganizationGateway
 * Utilizado exclusivamente no ambiente de produção.
 * Falha de forma fechada, segura e neutra, sem criar dados ou persistir preferências.
 */
export class UnavailableOrganizationGateway implements OrganizationGateway {
  async loadContext(_userId: string): Promise<OrganizationContextData> {
    return {
      status: 'unavailable',
      activeOrganization: null,
      activeMembership: null,
      availableMemberships: [],
    };
  }

  async listMemberships(_userId: string): Promise<OrganizationMembership[]> {
    return [];
  }

  async selectOrganization(_orgId: string): Promise<boolean> {
    return false;
  }

  async configureInitialOrganization(_name: string, _userId: string): Promise<boolean> {
    return false;
  }

  async clearPreference(): Promise<void> {
    // Operação segura no gateway de produção
  }
}
