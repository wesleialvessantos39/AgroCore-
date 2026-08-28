/**
 * Implementação Indisponível do Gateway de Membros da Organização
 * Utilizada em produção enquanto a API real não estiver conectada.
 */

import { OrganizationMember, OrganizationMembersGateway } from './organizationMembersGateway';

export class UnavailableOrganizationMembersGateway implements OrganizationMembersGateway {
  async listMembers(): Promise<readonly OrganizationMember[]> {
    throw new Error('Serviço de membros da organização indisponível em produção.');
  }

  async getMemberByUserId(): Promise<OrganizationMember | null> {
    throw new Error('Serviço de membros da organização indisponível em produção.');
  }
}
