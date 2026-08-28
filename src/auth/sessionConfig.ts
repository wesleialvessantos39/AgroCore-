/**
 * Configurações centralizadas e tipadas para o gerenciamento da sessão temporária de acompanhamento e controle de inatividade.
 *
 * Todas as durações e intervalos são definidos exclusivamente aqui, evitando números mágicos.
 */

/** Limite máximo de inatividade: 30 minutos (em milissegundos) */
export const SESSION_INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 1.800.000 ms

/** Momento de início do aviso de encerramento: após 28 minutos de inatividade */
export const SESSION_WARNING_THRESHOLD_MS = 28 * 60 * 1000; // 1.680.000 ms

/** Duração máxima da janela de aviso: 2 minutos (entre 28m e 30m) */
export const SESSION_WARNING_DURATION_MS = 2 * 60 * 1000; // 120.000 ms

/** Intervalo do temporizador visual para atualização da contagem regressiva: 1 segundo */
export const SESSION_COUNTDOWN_INTERVAL_MS = 1000; // 1.000 ms

/** Intervalo mínimo entre gravações de atividade humana no sessionStorage (evita sobrecarga de escrita) */
export const SESSION_ACTIVITY_WRITE_THROTTLE_MS = 5000; // 5.000 ms

/** Eventos do DOM considerados como atividade humana válida (exclui expressamente mousemove) */
export const HUMAN_ACTIVITY_EVENTS = [
  'pointerdown',
  'keydown',
  'touchstart',
  'wheel',
] as const;

export type HumanActivityEvent = (typeof HUMAN_ACTIVITY_EVENTS)[number];
