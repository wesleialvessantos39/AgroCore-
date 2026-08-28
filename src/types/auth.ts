export type AuthMode = 'preview' | 'unavailable';

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated';

export type PlatformRole = 'platform_super_admin' | 'none';

export type OrganizationRole =
  | 'owner'
  | 'company_admin'
  | 'manager'
  | 'project_designer'
  | 'finance'
  | 'capturer'
  | 'none';

export interface AuthIdentity {
  id: string;
  email: string;
  name?: string;
}

export interface AuthSession {
  user: AuthIdentity;
  mode: AuthMode;
  platformRole: PlatformRole;
  activeOrganizationId: string | null;
  organizationName: string | null;
  organizationRole: OrganizationRole;
  isPreview: boolean;
}

export interface AuthCredentials {
  email: string;
  password?: string;
}

export interface AuthGateway {
  getInitialSession(): Promise<AuthSession | null>;
  signIn(credentials: AuthCredentials): Promise<AuthSession>;
  signOut(): Promise<void>;
}
