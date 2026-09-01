import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DocumentReference,
  DocumentUploadMetadataInput,
  DocumentUploadProgress,
  DocumentUploadQueueItem,
} from '../types/documents';

interface PendingUpload {
  readonly file: File;
  readonly metadata: DocumentUploadMetadataInput;
  readonly idempotencyKey: string;
}

export interface DocumentUploadRequest {
  readonly file: File;
  readonly metadata: DocumentUploadMetadataInput;
}

type UploadOperation = (
  file: File,
  metadata: DocumentUploadMetadataInput,
  onProgress: (progress: DocumentUploadProgress) => void,
  signal: AbortSignal,
  idempotencyKey: string
) => Promise<DocumentReference>;

const MAX_CONCURRENT_UPLOADS = 2;

function secureId(prefix: string): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Gerador seguro indisponível.');
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

export function useDocumentUploadQueue(upload: UploadOperation) {
  const [items, setItems] = useState<readonly DocumentUploadQueueItem[]>([]);
  const pending = useRef(new Map<string, PendingUpload>());
  const waiting = useRef<string[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const activeCount = useRef(0);
  const mounted = useRef(true);
  const pumpRef = useRef<() => void>(() => undefined);

  const update = useCallback((id: string, patch: Partial<DocumentUploadQueueItem>) => {
    if (!mounted.current) return;
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const run = useCallback(async (id: string) => {
    const operation = pending.current.get(id);
    if (!operation) return;
    activeCount.current += 1;
    const controller = new AbortController();
    controllers.current.set(id, controller);
    update(id, { state: 'uploading', error: undefined });
    try {
      const document = await upload(
        operation.file,
        operation.metadata,
        (progress) => update(id, progress),
        controller.signal,
        operation.idempotencyKey
      );
      pending.current.delete(id);
      update(id, {
        state: 'completed',
        documentId: document.id,
        bytesUploaded: operation.file.size,
        bytesTotal: operation.file.size,
        percentage: 100,
      });
    } catch (error) {
      const cancelled = controller.signal.aborted ||
        (error instanceof Error && (error.name === 'AbortError' || error.message === 'Envio cancelado.'));
      update(id, {
        state: cancelled ? 'cancelled' : 'failed',
        error: cancelled ? 'Envio cancelado.' : error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.',
      });
    } finally {
      controllers.current.delete(id);
      activeCount.current -= 1;
      pumpRef.current();
    }
  }, [update, upload]);

  const pump = useCallback(() => {
    while (activeCount.current < MAX_CONCURRENT_UPLOADS && waiting.current.length > 0) {
      const id = waiting.current.shift();
      if (id && pending.current.has(id)) void run(id);
    }
  }, [run]);
  pumpRef.current = pump;

  const startUploads = useCallback((requests: readonly DocumentUploadRequest[]) => {
    const created = requests.map(({ file, metadata }) => {
      const id = secureId('upload-item');
      pending.current.set(id, { file, metadata, idempotencyKey: secureId('document-upload') });
      waiting.current.push(id);
      return {
        id,
        fileName: file.name,
        state: 'queued' as const,
        bytesUploaded: 0,
        bytesTotal: file.size,
        percentage: 0,
      };
    });
    setItems((current) => [...created, ...current]);
    queueMicrotask(() => pumpRef.current());
  }, []);

  const cancelUpload = useCallback((id: string) => {
    const controller = controllers.current.get(id);
    if (controller) {
      controller.abort();
      return;
    }
    waiting.current = waiting.current.filter((queuedId) => queuedId !== id);
    if (pending.current.has(id)) {
      update(id, { state: 'cancelled', error: 'Envio cancelado.' });
    }
  }, [update]);

  const retryUpload = useCallback((id: string) => {
    if (!pending.current.has(id) || controllers.current.has(id)) return;
    waiting.current = waiting.current.filter((queuedId) => queuedId !== id);
    waiting.current.push(id);
    update(id, { state: 'queued', error: undefined, bytesUploaded: 0, percentage: 0 });
    queueMicrotask(() => pumpRef.current());
  }, [update]);

  const clearFinished = useCallback(() => {
    setItems((current) => {
      const active = current.filter((item) => item.state === 'queued' || item.state === 'uploading');
      for (const item of current) {
        if (item.state !== 'queued' && item.state !== 'uploading') pending.current.delete(item.id);
      }
      return active;
    });
  }, []);

  useEffect(() => () => {
    mounted.current = false;
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
    waiting.current = [];
    pending.current.clear();
  }, []);

  return { items, startUploads, cancelUpload, retryUpload, clearFinished };
}
