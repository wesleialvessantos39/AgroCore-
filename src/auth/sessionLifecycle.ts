/**
 * Modelo de ciclo de vida e funções puras para o cálculo do estado da sessão temporária de acompanhamento.
 *
 * O cálculo é estritamente baseado em timestamps reais (Date.now()) e não depende
 * da contagem de iterações de setInterval.
 */

import {
  SESSION_INACTIVITY_LIMIT_MS,
  SESSION_WARNING_THRESHOLD_MS,
} from './sessionConfig';

export type SessionLifecycleState = 'inactive' | 'active' | 'warning' | 'expired';

export type SessionTerminationReason = 'manual' | 'inactivity' | 'invalid_session';

export interface SessionLifecycleCalculation {
  /** Estado atual do ciclo de vida */
  state: SessionLifecycleState;
  /** Tempo decorrido desde a última atividade válida (em ms) */
  elapsedMs: number;
  /** Tempo total restante até a expiração final (em ms, mínimo 0) */
  remainingMs: number;
  /** Tempo restante dentro da janela de aviso de 2 minutos (em ms, de 0 a 120.000) */
  warningRemainingMs: number;
  /** Formatação visual em MM:SS da contagem regressiva durante a janela de aviso */
  formattedCountdown: string;
  /** Indica se a janela de aviso está ativa (entre 28m e 30m) */
  isWarningActive: boolean;
  /** Indica se a sessão atingiu ou ultrapassou os 30 minutos de inatividade */
  isExpired: boolean;
}

/**
 * Formata milissegundos restantes no formato visual "MM:SS".
 * Exemplo: 120000 -> "02:00", 95000 -> "01:35", 5000 -> "00:05", 0 -> "00:00".
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0 || !Number.isFinite(ms)) {
    return '00:00';
  }

  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${mm}:${ss}`;
}

/**
 * Calcula o estado da sessão temporária com base em timestamps reais e funções puras.
 *
 * @param now Timestamp atual em milissegundos
 * @param lastActivityAt Timestamp da última atividade humana válida em milissegundos
 * @param limitMs Limite máximo de inatividade (padrão: 30 minutos)
 * @param warningThresholdMs Limiar de início do aviso (padrão: 28 minutos)
 */
export function calculateSessionLifecycle(
  now: number,
  lastActivityAt: number,
  limitMs: number = SESSION_INACTIVITY_LIMIT_MS,
  warningThresholdMs: number = SESSION_WARNING_THRESHOLD_MS
): SessionLifecycleCalculation {
  // Se não houver timestamp de atividade válido, o estado é inativo
  if (!lastActivityAt || !Number.isFinite(lastActivityAt) || !Number.isFinite(now)) {
    return {
      state: 'inactive',
      elapsedMs: 0,
      remainingMs: 0,
      warningRemainingMs: 0,
      formattedCountdown: '00:00',
      isWarningActive: false,
      isExpired: true,
    };
  }

  // Prevenção contra distorções temporais do relógio
  const safeLastActivity = Math.min(lastActivityAt, now);
  const elapsedMs = Math.max(0, now - safeLastActivity);
  const remainingMs = Math.max(0, limitMs - elapsedMs);

  // 1. Expiração: decorridos 30 minutos ou mais
  if (elapsedMs >= limitMs) {
    return {
      state: 'expired',
      elapsedMs,
      remainingMs: 0,
      warningRemainingMs: 0,
      formattedCountdown: '00:00',
      isWarningActive: false,
      isExpired: true,
    };
  }

  // 2. Janela de aviso: decorridos 28 minutos até 30 minutos
  if (elapsedMs >= warningThresholdMs) {
    const warningRemainingMs = remainingMs; // O tempo restante do aviso é exatamente o tempo até os 30 minutos
    return {
      state: 'warning',
      elapsedMs,
      remainingMs,
      warningRemainingMs,
      formattedCountdown: formatCountdown(warningRemainingMs),
      isWarningActive: true,
      isExpired: false,
    };
  }

  // 3. Estado ativo normal: menos de 28 minutos de inatividade
  return {
    state: 'active',
    elapsedMs,
    remainingMs,
    warningRemainingMs: 0,
    formattedCountdown: formatCountdown(limitMs - warningThresholdMs),
    isWarningActive: false,
    isExpired: false,
  };
}
