/**
 * Factory do Gateway de Solicitações de Laudo
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { AppraisalRequestGateway } from './requestGateway';
import { UnavailableAppraisalRequestGateway } from './unavailableRequestGateway';
import { PreviewAppraisalRequestGateway } from './preview/previewAppraisalRequestGateway';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';

let activeGatewayInstance: AppraisalRequestGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

/**
 * Retorna a instância ativa do Gateway de Solicitações conforme o ambiente
 */
export function getAppraisalRequestGateway(): AppraisalRequestGateway {
  if (activeGatewayInstance) {
    return activeGatewayInstance;
  }

  if (import.meta.env.DEV) {
    const previewInstance = new PreviewAppraisalRequestGateway();
    if (unregisterCleanup) {
      unregisterCleanup();
      unregisterCleanup = null;
    }
    unregisterCleanup = registerDomainCleanup(() => {
      previewInstance.clearAllSessionData();
    });
    activeGatewayInstance = previewInstance;
    return activeGatewayInstance;
  }

  activeGatewayInstance = new UnavailableAppraisalRequestGateway();
  return activeGatewayInstance;
}

/**
 * Permite injetar uma instância de teste
 */
export function setAppraisalRequestGatewayForTesting(
  gateway: AppraisalRequestGateway | null
): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGatewayInstance = gateway;
}
