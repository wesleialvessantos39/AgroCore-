import { OrganizationRole } from './auth';

export type OrganizationStatus = 'active' | 'suspended' | 'pending_verification';

export type MembershipStatus = 'active' | 'pending' | 'revoked';

export interface Organization {
  id: string;
  name: string;
  status: OrganizationStatus;
}

export interface OrganizationMembership {
  organizationId: string;
  userId: string;
  organizationRole: OrganizationRole;
  status: MembershipStatus;
  organizationName?: string;
}

export type OrganizationContextStatus =
  | 'loading'
  | 'setupRequired'
  | 'selectionRequired'
  | 'active'
  | 'accessPending'
  | 'suspended'
  | 'unavailable';

export interface OrganizationContextData {
  status: OrganizationContextStatus;
  activeOrganization: Organization | null;
  activeMembership: OrganizationMembership | null;
  availableMemberships: OrganizationMembership[];
}

export interface OrganizationGateway {
  loadContext(userId: string): Promise<OrganizationContextData>;
  listMemberships(userId: string): Promise<OrganizationMembership[]>;
  selectOrganization(orgId: string): Promise<boolean>;
  configureInitialOrganization(name: string, userId: string): Promise<boolean>;
  clearPreference(): Promise<void>;
}
