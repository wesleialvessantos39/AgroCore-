export interface DocumentClock {
  now(): Date;
}

export const SystemDocumentClock: DocumentClock = Object.freeze({
  now: () => new Date(),
});

export interface DocumentIdGenerator {
  generate(): string;
}

export const SecureDocumentIdGenerator: DocumentIdGenerator = Object.freeze({
  generate(): string {
    if (!globalThis.crypto?.randomUUID) {
      throw new Error('Gerador criptográfico de identificadores indisponível.');
    }
    return globalThis.crypto.randomUUID();
  },
});

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        if (record[key] !== undefined) result[key] = sortCanonical(record[key]);
        return result;
      }, {});
  }
  return value;
}

export function canonicalDocumentJson(value: unknown): string {
  return JSON.stringify(sortCanonical(value));
}

export async function calculateDocumentSha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 indisponível neste ambiente.');
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

