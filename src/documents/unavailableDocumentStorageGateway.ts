import { DocumentDomainError, type StoredDocumentDescriptor } from '../types/documents';
import type {
  DocumentStorageDownloadInput,
  DocumentStorageGateway,
  DocumentStorageUploadInput,
} from './documentStorageGateway';

function unavailable(): never {
  throw new DocumentDomainError(
    'STORAGE_NOT_CONFIGURED',
    'O envio de documentos está temporariamente indisponível.'
  );
}

export class UnavailableDocumentStorageGateway implements DocumentStorageGateway {
  async upload(_input: DocumentStorageUploadInput): Promise<StoredDocumentDescriptor> {
    return unavailable();
  }
  async download(_input: DocumentStorageDownloadInput): Promise<Blob> {
    return unavailable();
  }
  async remove(_bucket: StoredDocumentDescriptor['bucket'], _objectPath: string): Promise<void> {
    return unavailable();
  }
}
