import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import type { DocumentComplianceGateway } from './documentComplianceGateway';
import { getDocumentReferenceGateway } from './documentGatewayFactory';
import { getDocumentStorageGateway } from './documentStorageGatewayFactory';
import { PreviewDocumentComplianceGateway } from './preview/previewDocumentComplianceGateway';
import { SupabaseDocumentComplianceGateway } from './supabaseDocumentComplianceGateway';
import { UnavailableDocumentComplianceGateway } from './unavailableDocumentComplianceGateway';

let activeGateway: DocumentComplianceGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

function activate(gateway: DocumentComplianceGateway): DocumentComplianceGateway {
  activeGateway = gateway;
  if (gateway.clearAllSessionData) {
    unregisterCleanup = registerDomainCleanup(() => gateway.clearAllSessionData?.());
  }
  return gateway;
}

export function getDocumentComplianceGateway(): DocumentComplianceGateway {
  if (activeGateway) return activeGateway;
  const supabase = getSupabaseClient();
  if (supabase) return activate(new SupabaseDocumentComplianceGateway(supabase));
  if (import.meta.env.DEV) {
    return activate(
      new PreviewDocumentComplianceGateway(
        getDocumentReferenceGateway(),
        getDocumentStorageGateway()
      )
    );
  }
  return activate(new UnavailableDocumentComplianceGateway());
}

export function setDocumentComplianceGatewayForTesting(
  gateway: DocumentComplianceGateway | null
): void {
  unregisterCleanup?.();
  unregisterCleanup = null;
  activeGateway = null;
  if (gateway) activate(gateway);
}
