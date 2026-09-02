import type { TechnicalVisitGateway } from '../types/technicalVisit';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { PreviewTechnicalVisitGateway } from './preview/previewTechnicalVisitGateway';
import { UnavailableTechnicalVisitGateway } from './unavailableGateway';

let activeGatewayInstance: TechnicalVisitGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getTechnicalVisitGateway(): TechnicalVisitGateway {
  if (activeGatewayInstance) return activeGatewayInstance;

  if (import.meta.env.DEV) {
    const previewInstance = new PreviewTechnicalVisitGateway();
    if (unregisterCleanup) unregisterCleanup();
    unregisterCleanup = registerDomainCleanup(() => {
      previewInstance.clearAllSessionData();
    });
    activeGatewayInstance = previewInstance;
    return activeGatewayInstance;
  }

  activeGatewayInstance = new UnavailableTechnicalVisitGateway();
  return activeGatewayInstance;
}

export function setTechnicalVisitGatewayForTesting(
  gateway: TechnicalVisitGateway | null
): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGatewayInstance = gateway;
}
