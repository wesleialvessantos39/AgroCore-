/**
 * Registro e persistência local da atividade humana para o controle de inatividade.
 *
 * ESCOPO E LIMITAÇÕES:
 * 1. Este controle é utilizado EXCLUSIVAMENTE em ambiente de desenvolvimento (DEV) para a sessão temporária.
 * 2. É armazenado no sessionStorage local do navegador e pode ser inspecionado ou manipulado pelo usuário.
 * 3. Não possui valor criptográfico, não é token, não autentica e não representa revogação de sessão remota.
 * 4. Não armazena nenhum dado pessoal, e-mail, usuário, papel, organização ou credencial.
 * 5. Em produção, este módulo é eliminado integralmente durante a compilação.
 */

import { SESSION_INACTIVITY_LIMIT_MS } from '../sessionConfig';
import { PREVIEW_STORAGE_KEYS } from './previewKeys';

export const PREVIEW_ACTIVITY_STORAGE_KEY = PREVIEW_STORAGE_KEYS.ACTIVITY;
export const PREVIEW_ACTIVITY_SCHEMA_VERSION = '1.0';
export const PREVIEW_ACTIVITY_PURPOSE = 'session_activity_tracking';

export interface PreviewActivityRecord {
  version: string;
  purpose: string;
  lastActivityAt: number;
  expiresAt: number;
}

/**
 * Valida estritamente a estrutura do registro de atividade armazenado no sessionStorage.
 *
 * Rejeita qualquer registro corrompido, com campos ausentes, campos adicionais não permitidos,
 * versões incompatíveis, finalidades incorretas, datas futuras incompatíveis ou registros já expirados.
 */
export function validateActivityRecord(
  data: unknown,
  now: number = Date.now(),
  maxLimitMs: number = SESSION_INACTIVITY_LIMIT_MS
): data is PreviewActivityRecord {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const record = data as Record<string, unknown>;
  const allowedKeys = ['version', 'purpose', 'lastActivityAt', 'expiresAt'];
  const keys = Object.keys(record);

  // Rejeita se houver campos a mais ou a menos
  if (keys.length !== allowedKeys.length) {
    return false;
  }

  for (const key of allowedKeys) {
    if (!(key in record)) {
      return false;
    }
  }

  // Validação dos campos fixos
  if (
    record.version !== PREVIEW_ACTIVITY_SCHEMA_VERSION ||
    record.purpose !== PREVIEW_ACTIVITY_PURPOSE
  ) {
    return false;
  }

  // Validação dos timestamps
  const lastActivityAt = record.lastActivityAt;
  const expiresAt = record.expiresAt;

  if (
    typeof lastActivityAt !== 'number' ||
    !Number.isFinite(lastActivityAt) ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt)
  ) {
    return false;
  }

  // A data de atividade não pode ser superior ao momento atual com margem tolerável de skew (5 segundos)
  if (lastActivityAt > now + 5000) {
    return false;
  }

  // O prazo de expiração deve ser coerente com a atividade registrada
  const expectedExpiresAt = lastActivityAt + maxLimitMs;
  if (Math.abs(expiresAt - expectedExpiresAt) > 5000) {
    return false;
  }

  // Se já estiver expirado no momento da validação, o registro é inválido
  if (now >= expiresAt) {
    return false;
  }

  return true;
}

/**
 * Salva o registro de atividade no sessionStorage local.
 */
export function savePreviewActivity(
  lastActivityAt: number = Date.now(),
  inactivityLimitMs: number = SESSION_INACTIVITY_LIMIT_MS
): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const record: PreviewActivityRecord = {
      version: PREVIEW_ACTIVITY_SCHEMA_VERSION,
      purpose: PREVIEW_ACTIVITY_PURPOSE,
      lastActivityAt,
      expiresAt: lastActivityAt + inactivityLimitMs,
    };

    sessionStorage.setItem(PREVIEW_ACTIVITY_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/**
 * Recupera e valida estruturalmente o registro de atividade salvo.
 * Retorna null se inexistente, corrompido, adulterado ou expirado.
 */
export function getPreviewActivity(
  now: number = Date.now(),
  maxLimitMs: number = SESSION_INACTIVITY_LIMIT_MS
): PreviewActivityRecord | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(PREVIEW_ACTIVITY_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!validateActivityRecord(parsed, now, maxLimitMs)) {
      clearPreviewActivity();
      return null;
    }

    return parsed;
  } catch {
    clearPreviewActivity();
    return null;
  }
}

/**
 * Remove completamente o registro de atividade do sessionStorage.
 */
export function clearPreviewActivity(): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.removeItem(PREVIEW_ACTIVITY_STORAGE_KEY);
  } catch {
    // Falhas silenciosas de storage
  }
}
