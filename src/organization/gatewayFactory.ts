import { OrganizationGateway } from '../types/organization';
import { UnavailableOrganizationGateway } from './unavailableGateway';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { SupabaseOrganizationGateway } from './supabaseOrganizationGateway';

export async function createOrganizationGateway(): Promise<OrganizationGateway> {
  const supabase = getSupabaseClient();
  if (supabase) {
    return new SupabaseOrganizationGateway(supabase);
  }
  if (import.meta.env.DEV) {
    const { PreviewOrganizationGateway } = await import('./preview/previewGateway');
    return new PreviewOrganizationGateway();
  }
  return new UnavailableOrganizationGateway();
}
