/**
 * Factory do Gateway de Notificações Operacionais de Laudos
 * Módulo 004 — AgroCore
 */

import { AppraisalNotificationsGateway } from './notificationsGateway';
import { UnavailableAppraisalNotificationsGateway } from './unavailableNotificationsGateway';
import { PreviewAppraisalNotificationsGateway } from './preview/previewNotificationsGateway';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';

let activeGatewayInstance: AppraisalNotificationsGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getAppraisalNotificationsGateway(): AppraisalNotificationsGateway {
  if (activeGatewayInstance) {
    return activeGatewayInstance;
  }

  if (import.meta.env.DEV) {
    const previewInstance = new PreviewAppraisalNotificationsGateway();
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

  activeGatewayInstance = new UnavailableAppraisalNotificationsGateway();
  return activeGatewayInstance;
}

export function setAppraisalNotificationsGatewayForTesting(
  gateway: AppraisalNotificationsGateway | null
): void {
  activeGatewayInstance = gateway;
}
