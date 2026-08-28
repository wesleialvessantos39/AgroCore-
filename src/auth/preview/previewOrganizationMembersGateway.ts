/**
 * Implementação em Memória para Listagem de Membros da Organização
 * Ambiente de Preview / Desenvolvimento — AgroCore
 */

import { OrganizationMember, OrganizationMembersGateway } from '../organizationMembersGateway';
import { PREVIEW_ACCOUNTS } from './previewAccounts';

export class PreviewOrganizationMembersGateway implements OrganizationMembersGateway {
  private readonly customMembers = new Map<string, OrganizationMember[]>();

  async listMembers(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly OrganizationMember[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }
    if (!organizationId) return [];

    const custom = this.customMembers.get(organizationId) || [];
    if (custom.length > 0) {
      return Object.freeze([...custom]);
    }

    // Carrega membros padrão a partir das contas da organização de preview
    const defaultMembers: OrganizationMember[] = PREVIEW_ACCOUNTS
      .filter((acc) => acc.scopeType === 'organization')
      .map((acc) => ({
        id: `mem_${acc.id}`,
        userId: acc.id,
        name: acc.roleLabel,
        email: acc.email,
        organizationRole: acc.organizationRole,
        isActive: true,
      }));

    return Object.freeze(defaultMembers);
  }

  async getMemberByUserId(
    organizationId: string,
    userId: string
  ): Promise<OrganizationMember | null> {
    const members = await this.listMembers(organizationId);
    const found = members.find((m) => m.userId === userId);
    return found ? Object.freeze({ ...found }) : null;
  }

  addMemberForTesting(organizationId: string, member: OrganizationMember): void {
    const existing = this.customMembers.get(organizationId) || [];
    this.customMembers.set(organizationId, [...existing, member]);
  }

  clearAllSessionData(): void {
    this.customMembers.clear();
  }
}
