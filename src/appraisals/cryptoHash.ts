/**
 * Módulo Criptográfico e de Serialização Canônica SHA-256
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Princípios:
 * 1. Serialização canônica recursiva com ordenação alfabética estrita de chaves.
 * 2. Rejeição de valores não finitos (NaN, Infinity) e detecção de ciclos.
 * 3. Cálculo criptográfico SHA-256 puro em conformidade estrita com FIPS 180-4 / RFC 6234.
 * 4. Vetor de teste comprovado: SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.
 * 5. Checksum canônico de 64 caracteres hexadecimais sem prefixo fictício.
 */

/**
 * Serialização JSON Canônica determinística
 */
export function canonicalJsonStringify(data: unknown, seen = new WeakSet<object>()): string {
  if (data === null) return 'null';
  if (typeof data === 'boolean') return data ? 'true' : 'false';
  if (typeof data === 'number') {
    if (!Number.isFinite(data) || Number.isNaN(data)) {
      throw new Error(`canonicalJsonStringify: Valor numérico inválido ou não finito (${data}).`);
    }
    return data.toString();
  }
  if (typeof data === 'string') {
    return JSON.stringify(data);
  }
  if (typeof data === 'bigint') {
    return data.toString();
  }
  if (typeof data === 'undefined' || typeof data === 'function' || typeof data === 'symbol') {
    return 'null';
  }

  if (typeof data === 'object') {
    if (seen.has(data as object)) {
      throw new Error('canonicalJsonStringify: Estrutura circular detectada.');
    }
    seen.add(data as object);

    if (Array.isArray(data)) {
      const items = data.map((item) => canonicalJsonStringify(item, seen));
      return `[${items.join(',')}]`;
    }

    // Objeto regular: ordenar chaves alfabeticamente
    const keys = Object.keys(data as Record<string, unknown>).sort();
    const entries: string[] = [];

    for (const key of keys) {
      const val = (data as Record<string, unknown>)[key];
      if (val !== undefined && typeof val !== 'function' && typeof val !== 'symbol') {
        const serializedVal = canonicalJsonStringify(val, seen);
        entries.push(`${JSON.stringify(key)}:${serializedVal}`);
      }
    }

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(data);
}

/**
 * Implementação pura de SHA-256 em conformidade com FIPS 180-4
 * Funciona de forma idêntica e síncrona tanto em Node.js quanto em Browsers/Web Workers.
 */
export function computeSha256(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;

  // Constantes de rodada K (primeiros 32 bits das partes fracionárias das raízes cúbicas dos primeiros 64 primos)
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  // Valores iniciais de hash H (primeiros 32 bits das raízes quadradas dos primeiros 8 primos)
  let H0 = 0x6a09e667;
  let H1 = 0xbb67ae85;
  let H2 = 0x3c6ef372;
  let H3 = 0xa54ff53a;
  let H4 = 0x510e527f;
  let H5 = 0x9b05688c;
  let H6 = 0x1f83d9ab;
  let H7 = 0x5be0cd19;

  // Pré-processamento (Padding)
  const byteLength = bytes.length;
  const bitLength = byteLength * 8;

  // Calcula o tamanho do buffer preenchido: múltiplo de 64 bytes
  const newByteLength = (((byteLength + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(newByteLength);
  padded.set(bytes);
  padded[byteLength] = 0x80; // Adiciona bit '1'

  // Adiciona tamanho original em bits no final (64-bit big endian)
  const view = new DataView(padded.buffer);
  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  view.setUint32(newByteLength - 8, highBits, false);
  view.setUint32(newByteLength - 4, lowBits, false);

  const W = new Uint32Array(64);

  // Processamento em blocos de 512 bits (64 bytes)
  for (let chunk = 0; chunk < newByteLength; chunk += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = view.getUint32(chunk + t * 4, false);
    }

    for (let t = 16; t < 64; t++) {
      const s0 =
        (((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^
          ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^
          (W[t - 15] >>> 3)) >>>
        0;
      const s1 =
        (((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^
          ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^
          (W[t - 2] >>> 10)) >>>
        0;
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }

    let a = H0;
    let b = H1;
    let c = H2;
    let d = H3;
    let e = H4;
    let f = H5;
    let g = H6;
    let h = H7;

    for (let t = 0; t < 64; t++) {
      const S1 =
        (((e >>> 6) | (e << 26)) ^
          ((e >>> 11) | (e << 21)) ^
          ((e >>> 25) | (e << 7))) >>>
        0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 =
        (((a >>> 2) | (a << 30)) ^
          ((a >>> 13) | (a << 19)) ^
          ((a >>> 22) | (a << 10))) >>>
        0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H0 = (H0 + a) >>> 0;
    H1 = (H1 + b) >>> 0;
    H2 = (H2 + c) >>> 0;
    H3 = (H3 + d) >>> 0;
    H4 = (H4 + e) >>> 0;
    H5 = (H5 + f) >>> 0;
    H6 = (H6 + g) >>> 0;
    H7 = (H7 + h) >>> 0;
  }

  const toHex = (n: number) => n.toString(16).padStart(8, '0');
  return `${toHex(H0)}${toHex(H1)}${toHex(H2)}${toHex(H3)}${toHex(H4)}${toHex(H5)}${toHex(H6)}${toHex(H7)}`;
}

/**
 * Calcula o checksum SHA-256 determinístico de qualquer estrutura serializável canônica
 */
export function computeCanonicalSha256(data: unknown): string {
  const canonicalJson = canonicalJsonStringify(data);
  return computeSha256(canonicalJson);
}
