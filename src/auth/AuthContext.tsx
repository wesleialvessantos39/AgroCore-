import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AuthSession,
  AuthStatus,
  AuthIdentity,
  PlatformRole,
  OrganizationRole,
  AuthCredentials,
  AuthGateway,
} from '../types/auth';
import { createAuthGateway } from './gatewayFactory';
import { executeDomainSessionCleanup } from './domainCleanupRegistry';

export interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  user: AuthIdentity | null;
  isAuthenticated: boolean;
  platformRole: PlatformRole;
  organizationRole: OrganizationRole;
  organizationName: string | null;
  isPreview: boolean;
  error: string | null;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gatewayRef = useRef<AuthGateway | null>(null);

  // Inicialização do Gateway e Restauração Segura de Sessão
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const gateway = await createAuthGateway();
        gatewayRef.current = gateway;

        const initialSession = await gateway.getInitialSession();

        if (!isMounted) return;

        if (initialSession) {
          setSession(initialSession);
          setStatus('authenticated');
        } else {
          setSession(null);
          setStatus('unauthenticated');
        }
      } catch {
        if (!isMounted) return;
        setSession(null);
        setStatus('unauthenticated');
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  const signIn = useCallback(async (credentials: AuthCredentials) => {
    setError(null);
    try {
      // Limpeza de domínio prévia ao trocar credenciais
      await executeDomainSessionCleanup();

      let gateway = gatewayRef.current;
      if (!gateway) {
        gateway = await createAuthGateway();
        gatewayRef.current = gateway;
      }

      const newSession = await gateway.signIn(credentials);
      setSession(newSession);
      setStatus('authenticated');
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'E-mail ou senha inválidos';
      setError(message);
      throw err;
    }
  }, []);

  const isSigningOutRef = useRef<boolean>(false);

  const signOut = useCallback(async () => {
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;

    try {
      // 1. Limpeza de dados voláteis de domínio e cancelamento assíncrono
      await executeDomainSessionCleanup();

      // 2. Encerramento da sessão no gateway de autenticação
      const gateway = gatewayRef.current;
      if (gateway) {
        await gateway.signOut();
      }
    } catch {
      // Falhas silenciosas
    } finally {
      setSession(null);
      setStatus('unauthenticated');
      setError(null);
      isSigningOutRef.current = false;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      status,
      session,
      user: session?.user || null,
      isAuthenticated: status === 'authenticated' && session !== null,
      platformRole: session?.platformRole || 'none',
      organizationRole: session?.organizationRole || 'none',
      organizationName: session?.organizationName || null,
      isPreview: session?.isPreview || false,
      error,
      signIn,
      signOut,
      clearError,
    };
  }, [status, session, error, signIn, signOut, clearError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
}
