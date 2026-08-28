/**
 * Serviço desacoplado para solicitação de recuperação de acesso e atualização visual de senha.
 * Em desenvolvimento (DEV), opera com o controle de acompanhamento temporário.
 * Em produção, responde de forma estritamente fechada como serviço indisponível.
 */

import {
  createPreviewRecoverySession,
  isPreviewRecoverySessionValid,
  clearPreviewRecoverySession,
} from './preview/previewRecoveryControl';

export type RecoveryRequestOutcome =
  | 'dev_preview_authorized'
  | 'production_unavailable'
  | 'validation_error';

export interface RecoveryOutcomeResult {
  outcome: RecoveryRequestOutcome;
  message: string;
  canProceedToResetVisual: boolean;
}

export const EMAIL_VALIDATION_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkIsDev(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.DEV === 'boolean') {
      return import.meta.env.DEV;
    }
  } catch {
    // fallback
  }
  return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
}

export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  return EMAIL_VALIDATION_REGEX.test(trimmed);
}

export async function requestAccessRecovery(email: string, forceDevMode?: boolean): Promise<RecoveryOutcomeResult> {
  const trimmed = email.trim();

  if (!trimmed) {
    return {
      outcome: 'validation_error',
      message: 'Informe seu endereço de e-mail corporativo para continuar.',
      canProceedToResetVisual: false,
    };
  }

  if (!isValidEmailFormat(trimmed)) {
    return {
      outcome: 'validation_error',
      message: 'Formato de e-mail inválido. Verifique o endereço digitado.',
      canProceedToResetVisual: false,
    };
  }

  const isDev = typeof forceDevMode === 'boolean' ? forceDevMode : checkIsDev();

  // Em ambiente de produção, retorna estado fechado e neutro sem revelar nada
  if (!isDev) {
    return {
      outcome: 'production_unavailable',
      message: 'A recuperação de acesso pelo sistema está temporariamente indisponível no momento. Entre em contato com a administração da sua organização.',
      canProceedToResetVisual: false,
    };
  }

  // Em ambiente de desenvolvimento: cria a autorização visual de 15 minutos
  const created = createPreviewRecoverySession();
  if (!created) {
    return {
      outcome: 'validation_error',
      message: 'Não foi possível inicializar a navegação temporária no momento.',
      canProceedToResetVisual: false,
    };
  }

  return {
    outcome: 'dev_preview_authorized',
    message: 'Este é um fluxo de acompanhamento. Nenhum e-mail foi enviado e nenhuma alteração de acesso foi realizada.',
    canProceedToResetVisual: true,
  };
}

export function isResetViewAllowed(forceDevMode?: boolean): boolean {
  const isDev = typeof forceDevMode === 'boolean' ? forceDevMode : checkIsDev();
  if (!isDev) {
    return false;
  }
  return isPreviewRecoverySessionValid();
}

export function completePasswordResetValidation(): void {
  if (checkIsDev()) {
    clearPreviewRecoverySession();
  }
}
