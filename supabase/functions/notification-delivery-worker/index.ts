import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";

declare const Deno: {
  readonly env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type DeliveryRow = {
  delivery_id: string;
  organization_id: string;
  notification_id: string;
  recipient_user_id: string;
  channel: 'email' | 'push';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  attempt_number: number;
  max_attempts: number;
  title: string;
  message: string;
  route: string | null;
  push_endpoint: string | null;
  push_p256dh: string | null;
  push_auth_secret: string | null;
  lease_token: string;
};

type DeliveryOutcome =
  | 'delivered'
  | 'transient_failure'
  | 'permanent_failure'
  | 'provider_unconfigured'
  | 'recipient_unavailable';

type DeliveryResult = {
  outcome: DeliveryOutcome;
  httpStatus?: number;
  errorCode?: string;
  providerMessageId?: string;
  retryAfterSeconds?: number;
  revokePush?: boolean;
};

const JSON_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

function json(status: number, body: Record<string, unknown>): Response {
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
      // Compatibilidade com projetos que ainda usam service_role legada.
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? null;
}

function adminHeaders(secretKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: secretKey,
    'Content-Type': 'application/json',
  };
  if (!secretKey.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${secretKey}`;
  }
  return headers;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function cleanText(value: unknown, maximum: number, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maximum);
}

function safeRoute(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('://') ||
    value.length > 500
  ) {
    return null;
  }
  return value;
}

function safeAppUrl(): string | null {
  const raw = Deno.env.get('AGROCORE_APP_URL');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function retryAfterFromHeaders(headers: Headers): number | undefined {
  const raw = headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw, 10);
  if (Number.isFinite(seconds) && seconds >= 1 && seconds <= 86400) return seconds;
  return undefined;
}

async function rpc<T>(
  supabaseUrl: string,
  secretKey: string,
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: adminHeaders(secretKey),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`rpc_${name}_${response.status}`);
  }
  return await response.json() as T;
}

async function loadRecipientEmail(
  supabaseUrl: string,
  secretKey: string,
  userId: string
): Promise<string | null> {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { headers: adminHeaders(secretKey) }
  );
  if (!response.ok) return null;
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function deliverEmail(
  row: DeliveryRow,
  supabaseUrl: string,
  secretKey: string
): Promise<DeliveryResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('AGROCORE_EMAIL_FROM');
  if (!apiKey || !from) {
    return { outcome: 'provider_unconfigured', errorCode: 'email_provider_unconfigured' };
  }

  const email = await loadRecipientEmail(supabaseUrl, secretKey, row.recipient_user_id);
  if (!email) {
    return { outcome: 'recipient_unavailable', errorCode: 'recipient_email_unavailable' };
  }

  const title = cleanText(row.title, 120, 'Aviso da agenda');
  const message = cleanText(row.message, 360, 'Há um novo aviso disponível no AgroCore.');
  const route = safeRoute(row.route);
  const appUrl = safeAppUrl();
  const link = appUrl && route ? `${appUrl}${route}` : appUrl;
  const text = [
    'AgroCore — aviso da agenda',
    '',
    title,
    message,
    link ? `Acesse o AgroCore: ${link}` : 'Acesse o AgroCore para consultar os detalhes autorizados.',
    '',
    'Este aviso contém apenas informações operacionais minimizadas.',
  ].join('\n');
  const html = `<!doctype html><html lang="pt-BR"><body><h1>AgroCore — aviso da agenda</h1><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${link ? `<p><a href="${escapeHtml(link)}">Abrir no AgroCore</a></p>` : '<p>Acesse o AgroCore para consultar os detalhes autorizados.</p>'}<p><small>Este aviso contém apenas informações operacionais minimizadas.</small></p></body></html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `agrocore-notification-${row.delivery_id}`,
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `AgroCore — ${title}`,
      text,
      html,
    }),
  });

  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  const providerMessageId = typeof body?.id === 'string'
    ? body.id.slice(0, 200)
    : undefined;

  if (response.ok) {
    return {
      outcome: 'delivered',
      httpStatus: response.status,
      providerMessageId,
    };
  }

  if (response.status === 429 || response.status >= 500) {
    return {
      outcome: 'transient_failure',
      httpStatus: response.status,
      errorCode: response.status === 429 ? 'email_rate_limited' : 'email_provider_unavailable',
      providerMessageId,
      retryAfterSeconds: retryAfterFromHeaders(response.headers),
    };
  }

  return {
    outcome: 'permanent_failure',
    httpStatus: response.status,
    errorCode: 'email_delivery_rejected',
    providerMessageId,
  };
}

async function deliverPush(row: DeliveryRow): Promise<DeliveryResult> {
  const publicKey = Deno.env.get('AGROCORE_WEB_PUSH_VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('AGROCORE_WEB_PUSH_VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('AGROCORE_WEB_PUSH_VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) {
    return { outcome: 'provider_unconfigured', errorCode: 'push_provider_unconfigured' };
  }
  if (!row.push_endpoint || !row.push_p256dh || !row.push_auth_secret) {
    return { outcome: 'recipient_unavailable', errorCode: 'push_subscription_unavailable' };
  }

  const title = cleanText(row.title, 120, 'AgroCore');
  const body = cleanText(row.message, 320, 'Há um novo aviso disponível no AgroCore.');
  const route = safeRoute(row.route) ?? '/agenda';
  const payload = JSON.stringify({
    title,
    body,
    route,
    notificationId: row.notification_id,
    priority: row.priority,
  });

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const response = await webpush.sendNotification(
      {
        endpoint: row.push_endpoint,
        keys: {
          p256dh: row.push_p256dh,
          auth: row.push_auth_secret,
        },
      },
      payload,
      { TTL: 3600 }
    );

    return {
      outcome: 'delivered',
      httpStatus: response.statusCode,
    };
  } catch (error) {
    const candidate = error as {
      statusCode?: number;
      headers?: Record<string, string | string[]>;
    };
    const status = typeof candidate.statusCode === 'number' ? candidate.statusCode : 503;
    const retryHeader = candidate.headers?.['retry-after'];
    const retryRaw = Array.isArray(retryHeader) ? retryHeader[0] : retryHeader;
    const retrySeconds = retryRaw ? Number.parseInt(retryRaw, 10) : NaN;

    if (status === 404 || status === 410) {
      return {
        outcome: 'permanent_failure',
        httpStatus: status,
        errorCode: 'push_subscription_gone',
        revokePush: true,
      };
    }
    if (status === 429 || status >= 500) {
      return {
        outcome: 'transient_failure',
        httpStatus: status,
        errorCode: status === 429 ? 'push_rate_limited' : 'push_provider_unavailable',
        retryAfterSeconds:
          Number.isFinite(retrySeconds) && retrySeconds >= 1 && retrySeconds <= 86400
            ? retrySeconds
            : undefined,
      };
    }
    return {
      outcome: 'permanent_failure',
      httpStatus: status,
      errorCode: 'push_delivery_rejected',
    };
  }
}

async function complete(
  supabaseUrl: string,
  secretKey: string,
  workerTokenHash: string,
  row: DeliveryRow,
  result: DeliveryResult
): Promise<void> {
  await rpc<string>(
    supabaseUrl,
    secretKey,
    'agrocore_complete_notification_delivery',
    {
      p_worker_token_hash: workerTokenHash,
      p_delivery_id: row.delivery_id,
      p_lease_token: row.lease_token,
      p_outcome: result.outcome,
      p_http_status: result.httpStatus ?? null,
      p_error_code: result.errorCode ?? null,
      p_provider_message_id: result.providerMessageId ?? null,
      p_retry_after_seconds: result.retryAfterSeconds ?? null,
      p_revoke_push: result.revokePush ?? false,
    }
  );
}

async function processRow(
  row: DeliveryRow,
  supabaseUrl: string,
  secretKey: string,
  workerTokenHash: string
): Promise<boolean> {
  let result: DeliveryResult;
  try {
    result = row.channel === 'email'
      ? await deliverEmail(row, supabaseUrl, secretKey)
      : await deliverPush(row);
  } catch {
    result = {
      outcome: 'transient_failure',
      errorCode: 'delivery_network_failure',
    };
  }

  try {
    await complete(supabaseUrl, secretKey, workerTokenHash, row, result);
    return result.outcome === 'delivered';
  } catch {
    // A lease expira e a fila volta a ficar elegível. Nenhum dado sensível é logado.
    return false;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const secretKey = readSecretKey();
  const workerToken = request.headers.get('x-agrocore-worker-token')?.trim() ?? '';
  if (!supabaseUrl || !secretKey || !/^[0-9a-f]{64}$/i.test(workerToken)) {
    return json(401, { error: 'unauthorized' });
  }

  const workerTokenHash = await sha256Hex(workerToken);
  let rows: DeliveryRow[];
  try {
    rows = await rpc<DeliveryRow[]>(
      supabaseUrl,
      secretKey,
      'agrocore_claim_notification_deliveries',
      { p_worker_token_hash: workerTokenHash, p_limit: 20 }
    );
  } catch {
    return json(401, { error: 'unauthorized' });
  }

  let delivered = 0;
  const queue = [...rows];
  const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
    while (queue.length > 0) {
      const row = queue.shift();
      if (!row) break;
      if (await processRow(row, supabaseUrl, secretKey, workerTokenHash)) {
        delivered += 1;
      }
    }
  });
  await Promise.all(workers);

  return json(200, {
    claimed: rows.length,
    delivered,
  });
});
