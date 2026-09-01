import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseRuntimeConfig {
  readonly url: string;
  readonly projectRef: string;
  readonly publishableKey: string;
}

let activeClient: SupabaseClient | null = null;

const SUPABASE_URL_ENV_KEY = ['VITE', 'SUPABASE', 'URL'].join('_');
const SUPABASE_PUBLISHABLE_ENV_KEY = ['VITE', 'SUPABASE', 'PUBLISHABLE', 'KEY'].join('_');

function readClientEnvironment(key: string): string | undefined {
  const value = (import.meta.env as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseProjectRef(url: URL): string | null {
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
  return match?.[1] ?? null;
}

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig | null {
  const rawUrl = readClientEnvironment(SUPABASE_URL_ENV_KEY);
  const publishableKey = readClientEnvironment(SUPABASE_PUBLISHABLE_ENV_KEY);
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
