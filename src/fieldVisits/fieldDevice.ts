export type FieldConnectivityState = 'online' | 'offline' | 'unknown';

export function readFieldConnectivity(
  source: Pick<Navigator, 'onLine'> | null | undefined
): FieldConnectivityState {
  if (!source || typeof source.onLine !== 'boolean') return 'unknown';
  return source.onLine ? 'online' : 'offline';
}

export function getGeolocationErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return 'A localização foi bloqueada. Autorize o acesso à localização para este site ou informe as coordenadas manualmente.';
    case 2:
      return 'O dispositivo não conseguiu determinar a localização. Tente novamente em local aberto ou informe as coordenadas manualmente.';
    case 3:
      return 'A localização demorou mais que o limite permitido. Tente novamente ou informe as coordenadas manualmente.';
    default:
      return 'Não foi possível obter a localização. Tente novamente ou informe as coordenadas manualmente.';
  }
}

export const FIELD_OFFLINE_DRAFT_MESSAGE =
  'Sem conexão. As alterações desta tela ainda não foram enviadas. Mantenha a página aberta; o salvamento será retomado quando a conexão voltar.';

export const FIELD_OFFLINE_EVIDENCE_MESSAGE =
  'Sem conexão. Fotos e coordenadas precisam de conexão para serem gravadas com segurança.';
