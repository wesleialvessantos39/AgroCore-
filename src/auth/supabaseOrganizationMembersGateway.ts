import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OrganizationMember,
  OrganizationMembersGateway,
} from './organizationMembersGateway';
import type { OrganizationRole } from '../types/auth';

interface MemberRow {
  membership_id: string;
  user_id: string;
  member_name: string;
  member_email: string;
  organization_role: OrganizationRole;
  is_active: boolean;
}

export class SupabaseOrganizationMembersGateway
  implements OrganizationMembersGateway
{
  constructor(private readonly client: SupabaseClient) {}

  async listMembers(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly OrganizationMember[]> {
    if (signal?.aborted) throw new DOMException('Operação cancelada', 'AbortError');

    const { data, error } = await this.client.rpc(
      'agrocore_list_organization_members',
      { p_organization_id: organizationId }
    );
    if (error) {
      throw new Error('Não foi possível carregar os integrantes da organização.');
    }

    const rows = (Array.isArray(data) ? data : []) as MemberRow[];
    return Object.freeze(
      rows.map((row) => ({
        id: row.membership_id,
        userId: row.user_id,
        name: row.member_name,
        email: row.member_email,
        organizationRole: row.organization_role,
        isActive: row.is_active,
      }))
    );
  }

  async getMemberByUserId(
    organizationId: string,
    userId: string
  ): Promise<OrganizationMember | null> {
    const members = await this.listMembers(organizationId);
    return members.find((member) => member.userId === userId) ?? null;
  }
}
