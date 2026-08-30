/**
 * MÓDULO 005 — CRIPTOGRAFIA, HASHING E DETERMINISMO TEMPORAL
 * AgroCore
 */

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export const SystemClock: Clock = {
  now: () => new Date(),
};

export const SecureIdGenerator: IdGenerator = {
  next(prefix: string): string {
    if (!globalThis.crypto?.randomUUID) {
      throw new Error('Gerador criptograficamente seguro de identificadores indisponível.');
    }
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  },
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
 * Usa exclusivamente Web Crypto. Ambientes sem SHA-256 real falham de forma
 * fechada; nunca é produzido um checksum apenas semelhante a SHA-256.
 */
export async function calculateSha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);

  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 indisponível neste ambiente.');
  }

  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Canonical JSON stringify para garantir que chaves de objetos sejam ordenadas
 * de modo determinístico antes do cálculo do SHA-256.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === undefined) {
    return 'null';
  }
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
