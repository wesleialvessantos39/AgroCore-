/**
 * Fonte única tipada da verdade para as chaves de armazenamento temporário (sessionStorage)
 * utilizadas exclusivamente no ambiente de desenvolvimento (DEV).
 *
 * ESCOPO E LIMITAÇÕES:
 * - As chaves aqui centralizadas pertencem unicamente ao modo de acompanhamento e simulação visual local.
 * - Nenhuma chave representa token criptográfico, sessão remota ou credencial real de segurança.
 * - Todos os módulos de desenvolvimento devem importar suas chaves exclusivamente deste arquivo.
 */

export const PREVIEW_STORAGE_KEYS = {
  /** Chave da sessão temporária de acompanhamento */
  SESSION: 'agrocore:preview:session',
  /** Chave do registro de atividade humana para controle de inatividade */
  ACTIVITY: 'agrocore:preview:session_activity',
  /** Chave de controle visual temporário de navegação entre recuperação e atualização de senha */
  RECOVERY_FLOW: 'agrocore:preview:recovery_flow',
  /** Chave de contexto organizacional temporário configurado localmente */
  ORG_CONTEXT: 'agrocore:preview:org_context',
  /** Chave de preferência não autorizativa de organização selecionada */
  ORG_PREFERENCE: 'agrocore:preview:org_preference',
} as const;

export type PreviewStorageKeyType = (typeof PREVIEW_STORAGE_KEYS)[keyof typeof PREVIEW_STORAGE_KEYS];
