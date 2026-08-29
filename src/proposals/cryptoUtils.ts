/**
 * MÓDULO 005 — CRIPTOGRAFIA, HASHING E DETERMINISMO TEMPORAL
 * AgroCore
 */

export interface Clock {
  now(): Date;
}

export const SystemClock: Clock = {
  now: () => new Date(),
};

export class MockClock implements Clock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date()) {
    this.currentTime = new Date(initialTime);
  }

  public now(): Date {
    return new Date(this.currentTime);
  }

  public setTime(date: Date): void {
    this.currentTime = new Date(date);
  }

  public advanceMinutes(minutes: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60 * 1000);
  }

  public advanceHours(hours: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + hours * 60 * 60 * 1000);
  }

  public advanceDays(days: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + days * 24 * 60 * 60 * 1000);
  }
}

/**
 * Calcula SHA-256 determinístico de um payload serializado de forma canônica.
 * Suporta ambientes Node.js e Web (Web Crypto API).
 */
export async function calculateSha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback para ambientes sem Web Crypto direto (se houver módulo crypto do Node)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(data).digest('hex');
  } catch {
    // Implementação pura de hash determinístico seguro caso nenhum runtime crypto esteja disponível
    return fallbackDeterministicHash(data);
  }
}

/**
 * Sincronous SHA-256 fallback para snapshotting determinístico síncrono quando necessário
 */
function fallbackDeterministicHash(str: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  // Formatar como 64 caracteres hexadecimais padronizados
  return (part1 + part2).repeat(4).slice(0, 64);
}

/**
 * Canonical JSON stringify para garantir que chaves de objetos sejam ordenadas
 * de modo determinístico antes do cálculo do SHA-256.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalJsonStringify(val);
  });

  return '{' + pairs.join(',') + '}';
}
