/**
 * Hook para gerenciamento do ciclo de vida, controle local de inatividade e aviso de encerramento da sessão temporária.
 *
 * ESCOPO:
 * - Ativo exclusivamente quando há uma sessão temporária de acompanhamento ativa.
 * - Registra eventos humanos reais (pointerdown, keydown, touchstart, wheel) com debounce/throttle de escrita.
 * - Não utiliza mousemove.
 * - Trata visibilitychange para recalcular timestamps reais após suspensão de aba em segundo plano.
 * - Em produção, atua de forma inócua sem ativar listeners ou temporizadores.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import {
  SESSION_INACTIVITY_LIMIT_MS,
  SESSION_WARNING_THRESHOLD_MS,
  SESSION_COUNTDOWN_INTERVAL_MS,
  SESSION_ACTIVITY_WRITE_THROTTLE_MS,
  HUMAN_ACTIVITY_EVENTS,
} from './sessionConfig';
import {
  calculateSessionLifecycle,
  SessionLifecycleCalculation,
  SessionLifecycleState,
} from './sessionLifecycle';
import {
  savePreviewActivity,
  getPreviewActivity,
  clearPreviewActivity,
} from './preview/previewActivityStorage';
import { clearAllPreviewState } from './preview/clearAllPreviewState';
import { ROUTES } from '../routes/paths';

export interface UseSessionInactivityReturn {
  lifecycleState: SessionLifecycleState;
  isWarningOpen: boolean;
  formattedCountdown: string;
  warningRemainingMs: number;
  extendSession: () => void;
  signOutManual: () => Promise<void>;
}

export function useSessionInactivity(): UseSessionInactivityReturn {
  const { session, isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();

  const [lifecycle, setLifecycle] = useState<SessionLifecycleCalculation>(() => {
    return {
      state: isAuthenticated ? 'active' : 'inactive',
      elapsedMs: 0,
      remainingMs: SESSION_INACTIVITY_LIMIT_MS,
      warningRemainingMs: 0,
      formattedCountdown: '02:00',
      isWarningActive: false,
      isExpired: false,
    };
  });

  const lastActivityRef = useRef<number>(Date.now());
  const lastStorageWriteRef = useRef<number>(0);
  const isTerminatingRef = useRef<boolean>(false);

  // Inicializa o timestamp de atividade a partir do storage ou do momento atual
  useEffect(() => {
    if (!isAuthenticated || !session || !import.meta.env.DEV) {
      return;
    }

    isTerminatingRef.current = false;
    const storedActivity = getPreviewActivity();
    const initialTime = storedActivity ? storedActivity.lastActivityAt : Date.now();
    lastActivityRef.current = initialTime;
    lastStorageWriteRef.current = initialTime;

    if (!storedActivity) {
      savePreviewActivity(initialTime);
    }
  }, [isAuthenticated, session]);

  // Encerramento atômico por inatividade
  const handleInactivityExpiration = useCallback(async () => {
    if (isTerminatingRef.current) return;
    isTerminatingRef.current = true;

    try {
      clearAllPreviewState();
      await signOut();
    } finally {
      navigate(ROUTES.SIGN_IN, {
        replace: true,
        state: { inactivityExpired: true },
      });
    }
  }, [signOut, navigate]);

  // Logout manual centralizado
  const signOutManual = useCallback(async () => {
    if (isTerminatingRef.current) return;
    isTerminatingRef.current = true;

    try {
      clearAllPreviewState();
      await signOut();
    } finally {
      navigate(ROUTES.SIGN_IN, {
        replace: true,
      });
    }
  }, [signOut, navigate]);

  // Continuidade voluntária da sessão ("Continuar sessão")
  const extendSession = useCallback(() => {
    if (!isAuthenticated || isTerminatingRef.current) return;

    const now = Date.now();
    lastActivityRef.current = now;
    lastStorageWriteRef.current = now;
    savePreviewActivity(now);

    const updated = calculateSessionLifecycle(now, now);
    setLifecycle(updated);
  }, [isAuthenticated]);

  // Listener de eventos humanos com throttle de gravação no sessionStorage
  useEffect(() => {
    if (!isAuthenticated || !session || !import.meta.env.DEV) {
      return;
    }

    const handleHumanActivity = () => {
      // Se a janela de aviso estiver ativa, a sessão só é renovada pelo botão explícito "Continuar sessão"
      if (lifecycle.isWarningActive || isTerminatingRef.current) {
        return;
      }

      const now = Date.now();
      lastActivityRef.current = now;

      // Throttle para gravação no sessionStorage (evita escrita contínua a cada evento)
      if (now - lastStorageWriteRef.current >= SESSION_ACTIVITY_WRITE_THROTTLE_MS) {
        lastStorageWriteRef.current = now;
        savePreviewActivity(now);
      }
    };

    // Registra listeners passivos para os eventos humanos autorizados
    for (const eventName of HUMAN_ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleHumanActivity, { passive: true });
    }

    return () => {
      for (const eventName of HUMAN_ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleHumanActivity);
      }
    };
  }, [isAuthenticated, session, lifecycle.isWarningActive]);

  // Temporizador de 1 segundo e tratamento de retorno de aba (visibilitychange)
  useEffect(() => {
    if (!isAuthenticated || !session || !import.meta.env.DEV) {
      return;
    }

    const evaluateState = (now: number) => {
      if (isTerminatingRef.current) return;

      const calc = calculateSessionLifecycle(now, lastActivityRef.current);
      setLifecycle(calc);

      if (calc.isExpired) {
        handleInactivityExpiration();
      }
    };

    // 1. Intervalo periódico a cada 1 segundo
    const intervalId = window.setInterval(() => {
      evaluateState(Date.now());
    }, SESSION_COUNTDOWN_INTERVAL_MS);

    // 2. Tratamento de aba em segundo plano (visibilitychange)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Ao voltar para a aba, recalcula imediatamente utilizando Date.now()
        evaluateState(Date.now());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, session, handleInactivityExpiration]);

  return {
    lifecycleState: lifecycle.state,
    isWarningOpen: isAuthenticated && lifecycle.isWarningActive && !lifecycle.isExpired,
    formattedCountdown: lifecycle.formattedCountdown,
    warningRemainingMs: lifecycle.warningRemainingMs,
    extendSession,
    signOutManual,
  };
}
