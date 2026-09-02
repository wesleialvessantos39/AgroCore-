import { AuthGateway } from '../types/auth';
import { UnavailableAuthGateway } from './unavailableGateway';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { SupabaseAuthGateway } from './supabaseAuthGateway';

export async function createAuthGateway(): Promise<AuthGateway> {
  const supabase = getSupabaseClient();
  if (supabase) {
    return new SupabaseAuthGateway(supabase);
  }
  if (import.meta.env.DEV) {
    const { PreviewAuthGateway } = await import('./preview/previewGateway');
    return new PreviewAuthGateway();
  }
  return new UnavailableAuthGateway();
}
