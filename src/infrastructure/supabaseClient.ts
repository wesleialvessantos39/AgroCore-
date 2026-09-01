import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseRuntimeConfig {
  readonly url: string;
  readonly projectRef: string;
  readonly publishableKey: string;
}

let activeClient: SupabaseClient | null = null;

function parseProjectRef(url: URL): string | null {
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
  return match?.[1] ?? null;
}

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig | null {
  const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!rawUrl || !publishableKey) return null;
  if (!publishableKey.startsWith('sb_publishable_') && !publishableKey.startsWith('eyJ')) return null;

  try {
    const url = new URL(rawUrl);
    const projectRef = parseProjectRef(url);
    if (url.protocol !== 'https:' || !projectRef) return null;
    return { url: url.origin, projectRef, publishableKey };
  } catch {
    return null;
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseRuntimeConfig();
  if (!config) return null;
  if (!activeClient) {
    activeClient = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return activeClient;
}

export function setSupabaseClientForTesting(client: SupabaseClient | null): void {
  activeClient = client;
}
