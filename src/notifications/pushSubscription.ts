export interface BrowserPushSubscription {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface BrowserPushState {
  readonly supported: boolean;
  readonly permission: NotificationPermission | 'unsupported';
  readonly activeEndpoint: string | null;
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = globalThis.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function canUsePush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    import.meta.env.PROD
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!canUsePush()) return null;
  const existing = await navigator.serviceWorker.getRegistration('/push-notifications/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/push-sw.js', {
    scope: '/push-notifications/',
  });
}

export async function getBrowserPushState(): Promise<BrowserPushState> {
  if (!canUsePush()) {
    return { supported: false, permission: 'unsupported', activeEndpoint: null };
  }
  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return {
    supported: true,
    permission: Notification.permission,
    activeEndpoint: subscription?.endpoint ?? null,
  };
}

export async function activateBrowserPush(
  vapidPublicKey: string
): Promise<BrowserPushSubscription> {
  if (!canUsePush()) {
    throw new Error('Este navegador não oferece Web Push na versão publicada do AgroCore.');
  }
  if (!vapidPublicKey.trim()) {
    throw new Error('O canal Push ainda não está configurado no ambiente seguro.');
  }

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('A permissão de notificações do dispositivo não foi concedida.');
    }
  }

  const registration = await getRegistration();
  if (!registration) throw new Error('O Service Worker de Push não pôde ser registrado.');

  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  const serialized = subscription.toJSON();
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;
  if (!subscription.endpoint || !p256dh || !auth) {
    throw new Error('A assinatura Push retornada pelo navegador está incompleta.');
  }

  return { endpoint: subscription.endpoint, p256dh, auth };
}

export async function deactivateBrowserPush(): Promise<string | null> {
  if (!canUsePush()) return null;
  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
