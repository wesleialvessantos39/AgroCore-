/**
 * Limpeza atômica e idempotente de todos os estados e controles temporários de desenvolvimento.
 *
 * ESCOPO E LIMITAÇÕES:
 * - Remove exclusivamente as cinco chaves centralizadas de desenvolvimento no sessionStorage:
 *   1. agrocore:preview:session (sessão temporária)
 *   2. agrocore:preview:session_activity (registro de atividade para controle de inatividade)
 *   3. agrocore:preview:recovery_flow (controle visual de navegação na recuperação/atualização de senha)
 *   4. agrocore:preview:org_context (contexto temporário de organização configurada localmente)
 *   5. agrocore:preview:org_preference (preferência não autorizativa de organização selecionada)
 * - NUNCA utiliza sessionStorage.clear(), preservando quaisquer outros registros ou preferências da aplicação.
 */

import { PREVIEW_STORAGE_KEYS } from './previewKeys';

export const PREVIEW_SESSION_STORAGE_KEY = PREVIEW_STORAGE_KEYS.SESSION;

function getSessionStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return window.sessionStorage;
  }
  if (typeof sessionStorage !== 'undefined') {
    return sessionStorage;
  }
  return null;
}

/**
 * Remove integralmente e atomicamente apenas os registros temporários de acompanhamento do sessionStorage.
 */
export function clearAllPreviewState(): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(PREVIEW_STORAGE_KEYS.SESSION);
    storage.removeItem(PREVIEW_STORAGE_KEYS.ACTIVITY);
    storage.removeItem(PREVIEW_STORAGE_KEYS.RECOVERY_FLOW);
    storage.removeItem(PREVIEW_STORAGE_KEYS.ORG_CONTEXT);
    storage.removeItem(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE);
  } catch {
    // Falhas silenciosas de storage
  }
}
