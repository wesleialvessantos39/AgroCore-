/**
 * Factory do Gateway de Perfis Profissionais Técnicos
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { TechnicalProfessionalGateway } from './gateway';
import { UnavailableTechnicalProfessionalGateway } from './unavailableGateway';
import { PreviewTechnicalProfessionalGateway } from './preview/previewTechnicalProfessionalGateway';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';

let activeGatewayInstance: TechnicalProfessionalGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

/**
 * Retorna a instância ativa do Gateway de Perfis Profissionais conforme o ambiente
 */
export function getTechnicalProfessionalGateway(): TechnicalProfessionalGateway {
  if (activeGatewayInstance) {
    return activeGatewayInstance;
  }

  if (import.meta.env.DEV) {
    const previewInstance = new PreviewTechnicalProfessionalGateway();
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

  activeGatewayInstance = new UnavailableTechnicalProfessionalGateway();
  return activeGatewayInstance;
}

/**
 * Permite injetar uma instância de teste
 */
export function setTechnicalProfessionalGatewayForTesting(
  gateway: TechnicalProfessionalGateway | null
): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGatewayInstance = gateway;
}
