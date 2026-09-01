import {
  DOCUMENT_STORAGE_BUCKET,
  DocumentDomainError,
  type DocumentLogicalOwnerType,
  type DocumentMimeType,
} from '../types/documents';

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENT_FILES_PER_BATCH = 10;

const MIME_EXTENSION: Readonly<Record<DocumentMimeType, string>> = Object.freeze({
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tiff',
});

const MIME_TYPES = new Set<DocumentMimeType>(Object.keys(MIME_EXTENSION) as DocumentMimeType[]);
const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;

function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT_PATTERN.test(value) || value === '.' || value === '..') {
    throw new DocumentDomainError('INVALID_INPUT', `${label} possui formato inválido.`);
  }
}

export function isDocumentMimeType(value: string): value is DocumentMimeType {
  return MIME_TYPES.has(value as DocumentMimeType);
}

export function buildDocumentStoragePath(input: {
  readonly organizationId: string;
  readonly logicalOwnerType: DocumentLogicalOwnerType;
  readonly logicalOwnerId: string;
  readonly documentId: string;
  readonly mimeType: DocumentMimeType;
}): string {
  assertSafeSegment(input.organizationId, 'Organização');
  assertSafeSegment(input.logicalOwnerId, 'Registro relacionado');
  assertSafeSegment(input.documentId, 'Documento');
  const extension = MIME_EXTENSION[input.mimeType];
  if (!extension) throw new DocumentDomainError('INVALID_FILE', 'Formato de arquivo não permitido.');
  return `${input.organizationId}/${input.logicalOwnerType}/${input.logicalOwnerId}/${input.documentId}/${input.documentId}.${extension}`;
}

export function validateDocumentFile(file: Pick<File, 'name' | 'size' | 'type'>): DocumentMimeType {
  if (!file.name || /[\u0000-\u001f\u007f]/.test(file.name)) {
    throw new DocumentDomainError('INVALID_FILE', 'O arquivo possui nome inválido.');
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    throw new DocumentDomainError('INVALID_FILE', 'O arquivo deve ter até 50 MB e não pode estar vazio.');
  }
  if (!isDocumentMimeType(file.type)) {
    throw new DocumentDomainError('INVALID_FILE', 'Use arquivos PDF, JPEG, PNG ou TIFF.');
  }
  return file.type;
}

export async function verifyDocumentFileSignature(file: File): Promise<void> {
  const mimeType = validateDocumentFile(file);
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const matches =
    (mimeType === 'application/pdf' && header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46 && header[4] === 0x2d) ||
    (mimeType === 'image/jpeg' && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) ||
    (mimeType === 'image/png' && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47 && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a) ||
    (mimeType === 'image/tiff' && ((header[0] === 0x49 && header[1] === 0x49 && header[2] === 0x2a && header[3] === 0x00) || (header[0] === 0x4d && header[1] === 0x4d && header[2] === 0x00 && header[3] === 0x2a)));
  if (!matches) {
    throw new DocumentDomainError('INVALID_FILE', 'O conteúdo do arquivo não corresponde ao formato informado.');
  }
}

export function sanitizeDownloadFileName(displayName: string, mimeType: DocumentMimeType): string {
  const base = displayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'documento';
  return `${base}.${MIME_EXTENSION[mimeType]}`;
}

export function assertStoredObjectMatches(input: {
  readonly organizationId: string;
  readonly logicalOwnerType: DocumentLogicalOwnerType;
  readonly logicalOwnerId: string;
  readonly documentId: string;
  readonly mimeType: DocumentMimeType;
  readonly bucket: string;
  readonly objectPath: string;
}): void {
  const expectedPath = buildDocumentStoragePath(input);
  if (input.bucket !== DOCUMENT_STORAGE_BUCKET || input.objectPath !== expectedPath) {
    throw new DocumentDomainError('INVALID_INPUT', 'A localização privada do documento é inválida.');
  }
}
