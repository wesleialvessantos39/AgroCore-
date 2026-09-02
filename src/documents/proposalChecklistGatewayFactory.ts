import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import type { ProposalChecklistGateway } from './proposalChecklistGateway';
import { PreviewProposalChecklistGateway } from './preview/previewProposalChecklistGateway';
import { SupabaseProposalChecklistGateway } from './supabaseProposalChecklistGateway';
import { UnavailableProposalChecklistGateway } from './unavailableProposalChecklistGateway';

let activeGateway: ProposalChecklistGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

function activate(gateway: ProposalChecklistGateway): ProposalChecklistGateway {
  activeGateway = gateway;
  if (gateway.clearAllSessionData) {
    unregisterCleanup = registerDomainCleanup(() => gateway.clearAllSessionData?.());
  }
  return gateway;
}

export function getProposalChecklistGateway(): ProposalChecklistGateway {
  if (activeGateway) return activeGateway;
  const supabase = getSupabaseClient();
  if (supabase) return activate(new SupabaseProposalChecklistGateway(supabase));
  if (import.meta.env.DEV) return activate(new PreviewProposalChecklistGateway());
  return activate(new UnavailableProposalChecklistGateway());
}

export function setProposalChecklistGatewayForTesting(
  gateway: ProposalChecklistGateway | null
): void {
  unregisterCleanup?.();
  unregisterCleanup = null;
  activeGateway = null;
  if (gateway) activate(gateway);
}
