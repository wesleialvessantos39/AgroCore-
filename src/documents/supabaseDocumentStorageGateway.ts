import { Upload } from 'tus-js-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, getSupabaseRuntimeConfig } from '../infrastructure/supabaseClient';
import { DocumentDomainError, type StoredDocumentDescriptor } from '../types/documents';
import type {
  DocumentStorageDownloadInput,
  DocumentStorageGateway,
  DocumentStorageUploadInput,
} from './documentStorageGateway';

function storageError(code: 'STORAGE_UPLOAD_FAILED' | 'STORAGE_DOWNLOAD_FAILED', message: string): DocumentDomainError {
  return new DocumentDomainError(code, message);
}

export class SupabaseDocumentStorageGateway implements DocumentStorageGateway {
  constructor(private readonly client: SupabaseClient = getSupabaseClient() as SupabaseClient) {}

  async upload(input: DocumentStorageUploadInput): Promise<StoredDocumentDescriptor> {
    const config = getSupabaseRuntimeConfig();
    if (!config || !this.client) {
      throw new DocumentDomainError('STORAGE_NOT_CONFIGURED', 'O envio de documentos está indisponível.');
    }
    const { data, error } = await this.client.auth.getSession();
    if (error || !data.session?.access_token) {
      throw storageError('STORAGE_UPLOAD_FAILED', 'Sua sessão expirou. Entre novamente para enviar o arquivo.');
    }

    return new Promise<StoredDocumentDescriptor>((resolve, reject) => {
      let settled = false;
      let cancel = () => undefined;
      const cleanup = () => input.signal.removeEventListener('abort', cancel);
      const upload = new Upload(input.file, {
        endpoint: `https://${config.projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
        retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
        headers: {
          authorization: `Bearer ${data.session.access_token}`,
          apikey: config.publishableKey,
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: {
          bucketName: input.bucket,
          objectName: input.objectPath,
          contentType: input.mimeType,
          cacheControl: '3600',
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          input.onProgress({
            bytesUploaded,
            bytesTotal,
            percentage: bytesTotal > 0 ? Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100)) : 0,
          });
        },
        onError: () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(storageError('STORAGE_UPLOAD_FAILED', 'Não foi possível concluir o envio. Tente novamente.'));
        },
        onSuccess: () => {
          if (settled) return;
          settled = true;
          cleanup();
          input.onProgress({ bytesUploaded: input.file.size, bytesTotal: input.file.size, percentage: 100 });
          resolve({ bucket: input.bucket, objectPath: input.objectPath, uploadedAt: new Date().toISOString() });
        },
      });

      cancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        void upload.abort(true).finally(() => reject(new DocumentDomainError('UPLOAD_CANCELLED', 'Envio cancelado.')));
      };
      input.signal.addEventListener('abort', cancel, { once: true });

      void upload.findPreviousUploads()
        .then((previousUploads) => {
          if (input.signal.aborted || settled) return;
          if (previousUploads[0]) upload.resumeFromPreviousUpload(previousUploads[0]);
          upload.start();
        })
        .catch(() => {
          if (settled) return;
          upload.start();
        });
    });
  }

  async download(input: DocumentStorageDownloadInput): Promise<Blob> {
    if (input.signal?.aborted) throw new DocumentDomainError('UPLOAD_CANCELLED', 'Operação cancelada.');
    const { data, error } = await this.client.storage.from(input.bucket).download(input.objectPath);
    if (error || !data) {
      throw storageError('STORAGE_DOWNLOAD_FAILED', 'Não foi possível abrir o arquivo.');
    }
    return data;
  }

  async remove(bucket: StoredDocumentDescriptor['bucket'], objectPath: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([objectPath]);
    if (error) {
      throw new DocumentDomainError('STORAGE_COMPENSATION_FAILED', 'Não foi possível concluir a limpeza do envio interrompido.');
    }
  }
}
