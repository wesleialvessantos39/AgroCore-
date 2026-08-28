/**
 * Hook para listagem de Membros da Organização
 * Módulo 004 — AgroCore
 */

import { useCallback, useEffect, useState } from 'react';
import { useOrganization } from '../organization/useOrganization';
import { getOrganizationMembersGateway } from '../auth/organizationMembersGatewayFactory';
import { OrganizationMember } from '../auth/organizationMembersGateway';

export function useOrganizationMembers() {
  const { activeOrganization } = useOrganization();
  const [members, setMembers] = useState<readonly OrganizationMember[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!activeOrganization?.id) {
      setMembers([]);
      return;
    }
    try {
      setLoading(true);
      const gateway = getOrganizationMembersGateway();
      const list = await gateway.listMembers(activeOrganization.id);
      setMembers(list);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [activeOrganization?.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  return {
    members,
    loading,
    refreshMembers: loadMembers,
  };
}
