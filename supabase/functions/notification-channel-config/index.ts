import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: {
  readonly env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

Deno.serve((request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: HEADERS });
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const emailConfigured = Boolean(
    Deno.env.get('RESEND_API_KEY') && Deno.env.get('AGROCORE_EMAIL_FROM')
  );
  const vapidPublicKey = Deno.env.get('AGROCORE_WEB_PUSH_VAPID_PUBLIC_KEY') ?? null;
  const pushConfigured = Boolean(
    vapidPublicKey &&
    Deno.env.get('AGROCORE_WEB_PUSH_VAPID_PRIVATE_KEY') &&
    Deno.env.get('AGROCORE_WEB_PUSH_VAPID_SUBJECT')
  );

  return json(200, {
    emailConfigured,
    pushConfigured,
    vapidPublicKey: pushConfigured ? vapidPublicKey : null,
  });
});
