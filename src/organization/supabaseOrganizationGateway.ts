import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Organization,
  OrganizationContextData,
  OrganizationGateway,
  OrganizationMembership,
  OrganizationStatus,
  MembershipStatus,
} from '../types/organization';
import type { OrganizationRole } from '../types/auth';

interface MembershipRow {
  organization_id: string;
  user_id: string;
  organization_role: OrganizationRole;
  membership_status: MembershipStatus;
  organization_name: string;
  organization_status: OrganizationStatus;
}

const PREFERENCE_KEY = 'agrocore:organization:selected';

function readPreference(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(PREFERENCE_KEY);
  } catch {
    return null;
  }
}

function writePreference(value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage.setItem(PREFERENCE_KEY, value);
    else window.sessionStorage.removeItem(PREFERENCE_KEY);
  } catch {
    // Preferência é apenas conveniência; o banco permanece fonte da verdade.
  }
}

function mapMembership(row: MembershipRow): OrganizationMembership {
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    organizationRole: row.organization_role,
    status: row.membership_status,
    organizationName: row.organization_name,
  };
}

export class SupabaseOrganizationGateway implements OrganizationGateway {
  constructor(private readonly client: SupabaseClient) {}

  private async rows(): Promise<MembershipRow[]> {
    const { data, error } = await this.client.rpc('agrocore_list_my_memberships');
    if (error) throw new Error('Não foi possível carregar os vínculos organizacionais.');
    return (Array.isArray(data) ? data : []) as MembershipRow[];
  }

  async loadContext(userId: string): Promise<OrganizationContextData> {
    const rows = (await this.rows()).filter((row) => row.user_id === userId);

    if (rows.length === 0) {
      writePreference(null);
      return {
        status: 'setupRequired',
        activeOrganization: null,
        activeMembership: null,
        availableMemberships: [],
      };
    }

    const availableMemberships = rows.map(mapMembership);
    const activeRows = rows.filter(
      (row) => row.membership_status === 'active'
    );

    if (activeRows.length === 0) {
      const pending = rows.some((row) => row.membership_status === 'pending');
      return {
        status: pending ? 'accessPending' : 'unavailable',
        activeOrganization: null,
        activeMembership: null,
        availableMemberships,
      };
    }

    let selected = activeRows.find(
      (row) => row.organization_id === readPreference()
    );

    if (!selected && activeRows.length > 1) {
      return {
        status: 'selectionRequired',
        activeOrganization: null,
        activeMembership: null,
        availableMemberships,
      };
    }

    selected ??= activeRows[0];
    writePreference(selected.organization_id);

    const activeOrganization: Organization = {
      id: selected.organization_id,
      name: selected.organization_name,
      status: selected.organization_status,
    };
    const activeMembership = mapMembership(selected);

    if (selected.organization_status === 'suspended') {
      return {
        status: 'suspended',
        activeOrganization,
        activeMembership,
        availableMemberships,
      };
    }

    if (selected.organization_status === 'pending_verification') {
      return {
        status: 'accessPending',
        activeOrganization,
        activeMembership,
        availableMemberships,
      };
    }

    return {
      status: 'active',
      activeOrganization,
      activeMembership,
      availableMemberships,
    };
  }

  async listMemberships(userId: string): Promise<OrganizationMembership[]> {
    return (await this.rows())
      .filter((row) => row.user_id === userId)
      .map(mapMembership);
  }

  async selectOrganization(orgId: string): Promise<boolean> {
    const rows = await this.rows();
    const allowed = rows.some(
      (row) =>
        row.organization_id === orgId &&
        row.membership_status === 'active'
    );
    if (!allowed) return false;
    writePreference(orgId);
    return true;
  }

  async configureInitialOrganization(name: string, userId: string): Promise<boolean> {
    const { data: sessionData } = await this.client.auth.getSession();
    if (sessionData.session?.user.id !== userId) return false;

    const { data, error } = await this.client.rpc(
      'agrocore_configure_initial_organization',
      { p_name: name.trim() }
    );
    if (error || typeof data !== 'string') return false;
    writePreference(data);
    return true;
  }

  async clearPreference(): Promise<void> {
    writePreference(null);
  }
}
