import { AuthGateway, AuthSession, AuthCredentials } from '../types/auth';

export class UnavailableAuthGateway implements AuthGateway {
  async getInitialSession(): Promise<AuthSession | null> {
    return null;
  }

  async signIn(_credentials: AuthCredentials): Promise<AuthSession> {
    throw new Error('A autenticação do sistema está temporariamente indisponível no momento.');
  }

  async signOut(): Promise<void> {
    // Operação segura no gateway indisponível
  }
}
