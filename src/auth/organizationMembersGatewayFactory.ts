/**
 * Factory do Gateway de Membros da Organização
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { OrganizationMembersGateway } from './organizationMembersGateway';
import { UnavailableOrganizationMembersGateway } from './unavailableOrganizationMembersGateway';
import { PreviewOrganizationMembersGateway } from './preview/previewOrganizationMembersGateway';
import { registerDomainCleanup } from './domainCleanupRegistry';

let activeGatewayInstance: OrganizationMembersGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getOrganizationMembersGateway(): OrganizationMembersGateway {
  if (activeGatewayInstance) {
    return activeGatewayInstance;
  }

  if (import.meta.env.DEV) {
    const previewInstance = new PreviewOrganizationMembersGateway();
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

  activeGatewayInstance = new UnavailableOrganizationMembersGateway();
  return activeGatewayInstance;
}

export function setOrganizationMembersGatewayForTesting(
  gateway: OrganizationMembersGateway | null
): void {
  activeGatewayInstance = gateway;
}
