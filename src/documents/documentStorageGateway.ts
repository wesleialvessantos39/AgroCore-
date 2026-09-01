import type { DocumentMimeType, DocumentUploadProgress, StoredDocumentDescriptor } from '../types/documents';

export interface DocumentStorageUploadInput {
  readonly bucket: StoredDocumentDescriptor['bucket'];
  readonly objectPath: string;
  readonly file: File;
  readonly mimeType: DocumentMimeType;
  readonly signal: AbortSignal;
  readonly onProgress: (progress: DocumentUploadProgress) => void;
}

export interface DocumentStorageDownloadInput {
  readonly bucket: StoredDocumentDescriptor['bucket'];
  readonly objectPath: string;
  readonly signal?: AbortSignal;
}

export interface DocumentStorageGateway {
  upload(input: DocumentStorageUploadInput): Promise<StoredDocumentDescriptor>;
  download(input: DocumentStorageDownloadInput): Promise<Blob>;
  remove(bucket: StoredDocumentDescriptor['bucket'], objectPath: string): Promise<void>;
  clearAllSessionData?(): void;
}
