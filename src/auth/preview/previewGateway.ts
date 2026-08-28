import { AuthGateway, AuthSession, AuthCredentials } from '../../types/auth';
import { PREVIEW_ACCOUNTS, buildSessionFromAccount } from './previewAccounts';
import { clearAllPreviewState, PREVIEW_SESSION_STORAGE_KEY } from './clearAllPreviewState';
import {
  savePreviewActivity,
  getPreviewActivity,
  clearPreviewActivity,
} from './previewActivityStorage';

export class PreviewAuthGateway implements AuthGateway {
  async getInitialSession(): Promise<AuthSession | null> {
    if (typeof window === 'undefined') return null;

    try {
      const stored = sessionStorage.getItem(PREVIEW_SESSION_STORAGE_KEY);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') {
        clearAllPreviewState();
        return null;
      }

      // Validação estrita de integridade da sessão salva
      const { user, mode, platformRole, organizationRole } = parsed;
      if (
        !user ||
        typeof user.id !== 'string' ||
        typeof user.email !== 'string' ||
        mode !== 'preview'
      ) {
        clearAllPreviewState();
        return null;
      }

      // Confirma se a conta ainda é válida na lista de perfis de acompanhamento
      const matchingAccount = PREVIEW_ACCOUNTS.find(
        (acc) => acc.id === user.id && acc.email === user.email
      );

      if (!matchingAccount) {
        clearAllPreviewState();
        return null;
      }

      // Rejeita sessões adulteradas onde papéis foram alterados indevidamente
      if (
        platformRole !== matchingAccount.platformRole ||
        organizationRole !== matchingAccount.organizationRole
      ) {
        clearAllPreviewState();
        return null;
      }

      // Valida se a atividade registrada no sessionStorage ainda é válida
      const activity = getPreviewActivity();
      if (!activity) {
        // Se não houver registro de atividade válido ao restaurar a sessão, inicializa com o momento atual
        savePreviewActivity();
      }

      // Reconstrói a sessão garantindo coerência
      const validatedSession = buildSessionFromAccount(matchingAccount);
      return validatedSession;
    } catch {
      clearAllPreviewState();
      return null;
    }
  }

  async signIn(credentials: AuthCredentials): Promise<AuthSession> {
    const trimmedEmail = (credentials.email || '').trim().toLowerCase();
    const providedPassword = credentials.password || '';

    const matchingAccount = PREVIEW_ACCOUNTS.find(
      (acc) =>
        acc.email.toLowerCase() === trimmedEmail &&
        acc.password === providedPassword
    );

    if (!matchingAccount) {
      throw new Error('E-mail ou senha inválidos');
    }

    const session = buildSessionFromAccount(matchingAccount);

    try {
      sessionStorage.setItem(PREVIEW_SESSION_STORAGE_KEY, JSON.stringify(session));
      savePreviewActivity();
    } catch {
      // Falhas silenciosas de storage
    }

    return session;
  }

  async signOut(): Promise<void> {
    clearAllPreviewState();
  }
}

