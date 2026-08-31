import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import type { DocumentReferenceGateway } from './documentGateway';
import { PreviewDocumentReferenceGateway } from './preview/previewDocumentReferenceGateway';
import { UnavailableDocumentReferenceGateway } from './unavailableDocumentReferenceGateway';

let activeGateway: DocumentReferenceGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getDocumentReferenceGateway(): DocumentReferenceGateway {
  if (activeGateway) return activeGateway;

  if (import.meta.env.DEV) {
    const previewGateway = new PreviewDocumentReferenceGateway();
    unregisterCleanup = registerDomainCleanup(() => previewGateway.clearAllSessionData());
    activeGateway = previewGateway;
    return activeGateway;
  }

  activeGateway = new UnavailableDocumentReferenceGateway();
  return activeGateway;
}

export function setDocumentReferenceGatewayForTesting(
  gateway: DocumentReferenceGateway | null
): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGateway = gateway;
  if (gateway?.clearAllSessionData) {
    unregisterCleanup = registerDomainCleanup(() => gateway.clearAllSessionData?.());
  }
}

