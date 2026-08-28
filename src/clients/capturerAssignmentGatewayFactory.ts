/**
 * Factory do Gateway de Vínculos Cliente-Captador
 * Módulo 002 & Módulo 004 — AgroCore
 */

import { ClientCapturerAssignmentGateway } from '../types/clientCapturerAssignment';
import { UnavailableClientCapturerAssignmentGateway } from './unavailableCapturerAssignmentGateway';
import { PreviewClientCapturerAssignmentGateway } from './preview/previewCapturerAssignmentGateway';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';

let activeGatewayInstance: ClientCapturerAssignmentGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getClientCapturerAssignmentGateway(): ClientCapturerAssignmentGateway {
  if (activeGatewayInstance) {
    return activeGatewayInstance;
  }

  if (import.meta.env.DEV) {
    const previewInstance = new PreviewClientCapturerAssignmentGateway();
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

  activeGatewayInstance = new UnavailableClientCapturerAssignmentGateway();
  return activeGatewayInstance;
}

export function setClientCapturerAssignmentGatewayForTesting(
  gateway: ClientCapturerAssignmentGateway | null
): void {
  activeGatewayInstance = gateway;
}
