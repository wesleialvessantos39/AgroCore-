/**
 * Controle exclusivo de desenvolvimento para acompanhamento visual do fluxo de recuperação e atualização de senha.
 *
 * DOCUMENTAÇÃO TÉCNICA E LIMITAÇÃO DE ESCOPO:
 * - Este mecanismo existe exclusivamente em ambiente de desenvolvimento (DEV).
 * - O conteúdo do sessionStorage pode ser manipulado livremente pelo usuário.
 * - Não possui nenhum valor de segurança, token criptográfico, hash, assinatura, segredo, UUID ou identificador opaco aleatório.
 * - Não autentica, não identifica e não autoriza nenhum usuário ou conta.
 * - Serve exclusivamente para controlar a sequência visual entre as telas de recuperação de acesso e atualização de senha em modo de acompanhamento.
 * - Não armazena e-mail, senha, usuário, papel, organização, identificador de conta, credenciais ou dados pessoais de qualquer natureza.
 */

import { PREVIEW_STORAGE_KEYS } from './previewKeys';

export const PREVIEW_RECOVERY_STORAGE_KEY = PREVIEW_STORAGE_KEYS.RECOVERY_FLOW;
export const PREVIEW_RECOVERY_SCHEMA_VERSION = '1.0';
export const PREVIEW_RECOVERY_PURPOSE = 'visual_navigation_flow';
export const PREVIEW_RECOVERY_MAX_DURATION_MS = 15 * 60 * 1000; // 15 minutos

export interface PreviewRecoveryRecord {
  version: string;
  purpose: string;
  isVisualAuthorized: boolean;
  expiresAt: number;
}

/**
 * Cria a autorização visual temporária estritamente booleana no sessionStorage para a sequência de telas de desenvolvimento.
 */
export function createPreviewRecoverySession(): boolean {
  if (typeof window === 'undefined' || !sessionStorage) {
    return false;
  }

  const now = Date.now();
  const record: PreviewRecoveryRecord = {
    version: PREVIEW_RECOVERY_SCHEMA_VERSION,
    purpose: PREVIEW_RECOVERY_PURPOSE,
    isVisualAuthorized: true,
    expiresAt: now + PREVIEW_RECOVERY_MAX_DURATION_MS,
  };

  try {
    sessionStorage.setItem(PREVIEW_RECOVERY_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/**
 * Validação estrutural do controle visual temporário.
 * Verifica a conformidade do formato de dados, versão, finalidade e expiração.
 * Não confere nem atesta segurança contra falsificação maliciosa.
 */
export function isPreviewRecoverySessionValid(): boolean {
  if (typeof window === 'undefined' || !sessionStorage) {
    return false;
  }

  const raw = sessionStorage.getItem(PREVIEW_RECOVERY_STORAGE_KEY);
  if (!raw) {
    return false;
  }

  try {
    const data = JSON.parse(raw) as Partial<PreviewRecoveryRecord>;

    // 1. Rejeita não-objeto ou valor nulo
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      sessionStorage.removeItem(PREVIEW_RECOVERY_STORAGE_KEY);
      return false;
    }

    // 2. Rejeição estrita de campos adicionais não permitidos (nenhum campo fora do esquema definido)
    const allowedKeys = new Set(['version', 'purpose', 'isVisualAuthorized', 'expiresAt']);
    const existingKeys = Object.keys(data);
    if (existingKeys.length !== allowedKeys.size) {
      sessionStorage.removeItem(PREVIEW_RECOVERY_STORAGE_KEY);
      return false;
    }

    for (const key of existingKeys) {
      if (!allowedKeys.has(key)) {
        sessionStorage.removeItem(PREVIEW_RECOVERY_STORAGE_KEY);
        return false;
      }
    }

    // 3. Validação dos tipos e valores dos campos permitidos
    if (
      typeof data.version !== 'string' ||
      typeof data.purpose !== 'string' ||
      typeof data.isVisualAuthorized !== 'boolean' ||
      typeof data.expiresAt !== 'number'
    ) {
      sessionStorage.removeItem(PREVIEW_RECOVERY_STORAGE_KEY);
      return false;
    }

    // 4. Validação da versão conhecida
    if (data.version !== PREVIEW_RECOVERY_SCHEMA_VERSION) {
      sessionStorage.removeItem(PREVIEW_RECOVERY_STORAGE_KEY);
      return false;
    }

    // 5. Validação da finalidade correta
    if (data.purpose !== PREVIEW_RECOVERY_PURPOSE) {
      sessionStorage.removeItem(PREVIEW_RECOVERY_STORAGE_KEY);
      return false;
    }

    // 6. Validação de autorização visual booleana estritamente true
    if (data.isVisualAuthorized !== true) {
      sessionStorage.removeItem(PREVIEW_RECOVERY_STORAGE_KEY);
      return false;
    }

    // 7. Validação de data válida e não-NaN
    if (isNaN(data.expiresAt) || !Number.isFinite(data.expiresAt)) {
      sessionStorage.removeItem(PREVIEW_RECOVERY_STORAGE_KEY);
      return false;
    }

    // 8. Validação de expiração temporal (até 15 minutos)
    const now = Date.now();
    if (now > data.expiresAt || data.expiresAt > now + PREVIEW_RECOVERY_MAX_DURATION_MS + 1000) {
      sessionStorage.removeItem(PREVIEW_RECOVERY_STORAGE_KEY);
      return false;
    }

    return true;
  } catch {
    sessionStorage.removeItem(PREVIEW_RECOVERY_STORAGE_KEY);
    return false;
  }
}

/**
 * Remove o registro de controle visual temporário do sessionStorage.
 */
export function clearPreviewRecoverySession(): void {
  if (typeof window !== 'undefined' && sessionStorage) {
    sessionStorage.removeItem(PREVIEW_RECOVERY_STORAGE_KEY);
  }
}
