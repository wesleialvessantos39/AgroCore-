/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Factory do Gateway de Georreferenciamento Interno
 */

import { PropertyGeometryGateway } from '../../types/propertyGeometry';
import { UnavailablePropertyGeometryGateway } from './unavailableGeometryGateway';
import { PreviewPropertyGeometryGateway } from './previewGeometryGateway';
import { registerDomainCleanup } from '../../auth/domainCleanupRegistry';

let activeGeometryGateway: PropertyGeometryGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getPropertyGeometryGateway(): PropertyGeometryGateway {
  if (activeGeometryGateway) {
    return activeGeometryGateway;
  }

  if (import.meta.env.DEV) {
    const previewInstance = new PreviewPropertyGeometryGateway();
    if (unregisterCleanup) {
      unregisterCleanup();
      unregisterCleanup = null;
    }
    unregisterCleanup = registerDomainCleanup(() => {
      previewInstance.clearAllSessionData();
    });
    activeGeometryGateway = previewInstance;
    return activeGeometryGateway;
  }

  activeGeometryGateway = new UnavailablePropertyGeometryGateway();
  return activeGeometryGateway;
}

export function setPropertyGeometryGatewayForTesting(gateway: PropertyGeometryGateway | null): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGeometryGateway = gateway;
}
