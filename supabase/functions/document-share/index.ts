declare const Deno: {
  readonly env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const JSON_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

function response(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function readSecretKey(): string | null {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, unknown>;
      if (typeof parsed.default === 'string' && parsed.default.startsWith('sb_secret_')) {
        return parsed.default;
      }
    } catch {
      // Projetos em migração ainda podem disponibilizar apenas a chave legada abaixo.
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? null;
}

function adminHeaders(secretKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: secretKey,
    'Content-Type': 'application/json',
  };
  if (!secretKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${secretKey}`;
  return headers;
}

async function readLimitedText(request: Request, maximumBytes: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let totalBytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel('request_too_large').catch(() => undefined);
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const secretKey = readSecretKey();
  if (!supabaseUrl || !secretKey) return response(503, { error: 'service_unavailable' });

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > 256) {
    return response(413, { error: 'invalid_request' });
  }
  const rawBody = await readLimitedText(request, 256);
  if (rawBody === null) return response(413, { error: 'invalid_request' });
  const body = (() => {
    try {
      return JSON.parse(rawBody) as { token?: unknown };
    } catch {
      return null;
    }
  })();
  if (!body || typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) {
    return response(404, { error: 'not_found' });
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.token));
  const tokenHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  const headers = adminHeaders(secretKey);
  const redemption = await fetch(`${supabaseUrl}/rest/v1/rpc/agrocore_redeem_document_share`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_token_hash: tokenHash }),
  });
  if (!redemption.ok) return response(404, { error: 'not_found' });
  const rows = await redemption.json().catch(() => null) as Array<Record<string, unknown>> | null;
  const item = rows?.[0];
  if (
    !item ||
    item.storage_bucket !== 'organization-documents' ||
    typeof item.storage_object_path !== 'string' ||
    typeof item.display_name !== 'string' ||
    typeof item.mime_type !== 'string'
  ) {
    return response(404, { error: 'not_found' });
  }

  const encodedPath = item.storage_object_path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const signed = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/organization-documents/${encodedPath}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ expiresIn: 60 }),
    }
  );
  if (!signed.ok) return response(404, { error: 'not_found' });
  const signedBody = await signed.json().catch(() => null) as Record<string, unknown> | null;
  const path = typeof signedBody?.signedURL === 'string'
    ? signedBody.signedURL
    : typeof signedBody?.signedUrl === 'string'
      ? signedBody.signedUrl
      : null;
  if (!path) return response(404, { error: 'not_found' });
  const downloadUrl = path.startsWith('http') ? path : `${supabaseUrl}/storage/v1${path}`;

  return response(200, {
    downloadUrl,
    displayName: item.display_name,
    mimeType: item.mime_type,
    urlExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
});
