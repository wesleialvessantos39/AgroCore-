/**
 * Factory do Gateway de Laudos de Avaliação
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { AppraisalGateway } from './gateway';
import { UnavailableAppraisalGateway } from './unavailableGateway';
import { PreviewAppraisalGateway } from './preview/previewAppraisalGateway';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { clearDomainEventJournal } from './domainEvents';

let activeGatewayInstance: AppraisalGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

/**
 * Retorna a instância singleton do Gateway de Laudos conforme o ambiente
 */
export function getAppraisalGateway(): AppraisalGateway {
  if (activeGatewayInstance) {
    return activeGatewayInstance;
  }

  if (import.meta.env.DEV) {
    const previewInstance = new PreviewAppraisalGateway();
    if (unregisterCleanup) {
      unregisterCleanup();
      unregisterCleanup = null;
    }
    unregisterCleanup = registerDomainCleanup(() => {
      previewInstance.clearAllSessionData();
      clearDomainEventJournal();
    });
    activeGatewayInstance = previewInstance;
    return activeGatewayInstance;
  }

  activeGatewayInstance = new UnavailableAppraisalGateway();
  return activeGatewayInstance;
}

/**
 * Permite injetar uma instância de teste controlada
 */
export function setAppraisalGatewayForTesting(gateway: AppraisalGateway | null): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGatewayInstance = gateway;
}
