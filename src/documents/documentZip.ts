import { DocumentDomainError, type DocumentMimeType } from '../types/documents';

export interface DocumentZipEntry {
  readonly displayName: string;
  readonly mimeType: DocumentMimeType;
  readonly documentId: string;
  readonly blob: Blob;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function write32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function extensionFor(mimeType: DocumentMimeType): string {
  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  return '.tiff';
}

function safeEntryName(entry: DocumentZipEntry, position: number): string {
  const extension = extensionFor(entry.mimeType);
  const withoutExtension = entry.displayName.replace(/\.[A-Za-z0-9]{1,8}$/u, '');
  const compact = withoutExtension
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 _.-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80) || 'documento';
  return `${String(position + 1).padStart(2, '0')}_${compact}_${entry.documentId.slice(0, 8)}${extension}`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
}

/** ZIP sem compactação: evita dependência externa e preserva exatamente os bytes autorizados. */
export async function createDocumentZip(
  entries: readonly DocumentZipEntry[],
  signal?: AbortSignal
): Promise<Blob> {
  if (entries.length < 1 || entries.length > 20) {
    throw new DocumentDomainError('INVALID_INPUT', 'A exportação deve conter entre 1 e 20 documentos.');
  }

  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (let index = 0; index < entries.length; index += 1) {
    throwIfAborted(signal);
    const entry = entries[index]!;
    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    throwIfAborted(signal);
    const name = encoder.encode(safeEntryName(entry, index));
    const checksum = crc32(bytes);

    const localHeader = new ArrayBuffer(30);
    const localView = new DataView(localHeader);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write16(localView, 10, 0);
    write16(localView, 12, 0);
    write32(localView, 14, checksum);
    write32(localView, 18, bytes.byteLength);
    write32(localView, 22, bytes.byteLength);
    write16(localView, 26, name.byteLength);
    write16(localView, 28, 0);
    localParts.push(localHeader, name, bytes);

    const centralHeader = new ArrayBuffer(46);
    const centralView = new DataView(centralHeader);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write16(centralView, 12, 0);
    write16(centralView, 14, 0);
    write32(centralView, 16, checksum);
    write32(centralView, 20, bytes.byteLength);
    write32(centralView, 24, bytes.byteLength);
    write16(centralView, 28, name.byteLength);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, offset);
    centralParts.push(centralHeader, name);

    offset += 30 + name.byteLength + bytes.byteLength;
  }

  const centralSize = centralParts.reduce((total, part) => {
    if (part instanceof ArrayBuffer) return total + part.byteLength;
    if (ArrayBuffer.isView(part)) return total + part.byteLength;
    return total;
  }, 0);
  const end = new ArrayBuffer(22);
  const endView = new DataView(end);
  write32(endView, 0, 0x06054b50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, entries.length);
  write16(endView, 10, entries.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, offset);
  write16(endView, 20, 0);

  throwIfAborted(signal);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}
