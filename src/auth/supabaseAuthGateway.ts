import type { SupabaseClient, User } from '@supabase/supabase-js';
import type {
  AuthCredentials,
  AuthGateway,
  AuthSession,
  OrganizationRole,
  PlatformRole,
} from '../types/auth';

interface MembershipRow {
  organization_id: string;
  user_id: string;
  organization_role: OrganizationRole;
  membership_status: 'active' | 'pending' | 'revoked';
  organization_name: string;
  organization_status: 'active' | 'suspended' | 'pending_verification';
}

function userName(user: User): string | undefined {
  const metadata = user.user_metadata ?? {};
  const candidate =
    typeof metadata.name === 'string'
      ? metadata.name
      : typeof metadata.full_name === 'string'
        ? metadata.full_name
        : undefined;
  return candidate?.trim() || undefined;
}

export class SupabaseAuthGateway implements AuthGateway {
  constructor(private readonly client: SupabaseClient) {}

  private async hydrate(user: User): Promise<AuthSession> {
    const [platformResult, membershipsResult] = await Promise.all([
      this.client.rpc('agrocore_get_platform_role'),
      this.client.rpc('agrocore_list_my_memberships'),
    ]);

    if (platformResult.error) throw new Error('Não foi possível validar o perfil da plataforma.');
    if (membershipsResult.error) throw new Error('Não foi possível carregar os vínculos organizacionais.');

    const platformRole =
      platformResult.data === 'platform_super_admin'
        ? 'platform_super_admin'
        : 'none';

    const memberships = (Array.isArray(membershipsResult.data)
      ? membershipsResult.data
      : []) as MembershipRow[];
    const activeMemberships = memberships.filter(
      (membership) =>
        membership.membership_status === 'active' &&
        membership.organization_status === 'active'
    );

    const singleActive = activeMemberships.length === 1 ? activeMemberships[0] : null;

    return {
      user: {
        id: user.id,
        email: user.email ?? '',
        name: userName(user),
      },
      mode: 'supabase',
      platformRole: platformRole as PlatformRole,
      activeOrganizationId:
        platformRole === 'platform_super_admin'
          ? null
          : singleActive?.organization_id ?? null,
      organizationName:
        platformRole === 'platform_super_admin'
          ? null
          : singleActive?.organization_name ?? null,
      organizationRole:
        platformRole === 'platform_super_admin'
          ? 'none'
          : singleActive?.organization_role ?? 'none',
      isPreview: false,
    };
  }

  async getInitialSession(): Promise<AuthSession | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) return null;
    const user = data.session?.user;
    if (!user) return null;
    return this.hydrate(user);
  }

  async signIn(credentials: AuthCredentials): Promise<AuthSession> {
    const email = credentials.email.trim().toLowerCase();
    const password = credentials.password ?? '';
    if (!email || !password) {
      throw new Error('E-mail ou senha inválidos');
    }

    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      throw new Error('E-mail ou senha inválidos');
    }

    return this.hydrate(data.user);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}
