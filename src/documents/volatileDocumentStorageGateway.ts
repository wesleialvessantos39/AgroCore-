import { DocumentDomainError, type StoredDocumentDescriptor } from '../types/documents';
import type {
  DocumentStorageDownloadInput,
  DocumentStorageGateway,
  DocumentStorageUploadInput,
} from './documentStorageGateway';

function abortError(): DOMException {
  return new DOMException('Envio cancelado.', 'AbortError');
}

export class VolatileDocumentStorageGateway implements DocumentStorageGateway {
  private readonly objects = new Map<string, Blob>();

  private key(bucket: string, objectPath: string): string {
    return `${bucket}:${objectPath}`;
  }

  async upload(input: DocumentStorageUploadInput): Promise<StoredDocumentDescriptor> {
    if (input.signal.aborted) throw abortError();
    const key = this.key(input.bucket, input.objectPath);
    if (this.objects.has(key)) {
      throw new DocumentDomainError('STORAGE_UPLOAD_FAILED', 'Já existe um arquivo nesta localização.');
    }

    const reader = input.file.stream().getReader();
    const chunks: Uint8Array[] = [];
    let bytesUploaded = 0;
    try {
      while (true) {
        if (input.signal.aborted) throw abortError();
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          bytesUploaded += value.byteLength;
          input.onProgress({
            bytesUploaded,
            bytesTotal: input.file.size,
            percentage: Math.min(100, Math.round((bytesUploaded / input.file.size) * 100)),
          });
        }
      }
      if (input.signal.aborted) throw abortError();
      this.objects.set(key, new Blob(chunks, { type: input.mimeType }));
      input.onProgress({ bytesUploaded: input.file.size, bytesTotal: input.file.size, percentage: 100 });
      return {
        bucket: input.bucket,
        objectPath: input.objectPath,
        uploadedAt: new Date().toISOString(),
      };
    } finally {
      reader.releaseLock();
    }
  }

  async download(input: DocumentStorageDownloadInput): Promise<Blob> {
    if (input.signal?.aborted) throw abortError();
    const stored = this.objects.get(this.key(input.bucket, input.objectPath));
    if (!stored) {
      throw new DocumentDomainError('STORAGE_DOWNLOAD_FAILED', 'O arquivo não está disponível.');
    }
    return stored.slice(0, stored.size, stored.type);
  }

  async remove(bucket: StoredDocumentDescriptor['bucket'], objectPath: string): Promise<void> {
    this.objects.delete(this.key(bucket, objectPath));
  }

  clearAllSessionData(): void {
    this.objects.clear();
  }
}
