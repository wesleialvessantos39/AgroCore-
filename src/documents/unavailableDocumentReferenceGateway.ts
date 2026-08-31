import type {
  ArchiveDocumentRecord,
  CreateDocumentRecord,
  DocumentReferenceGateway,
  ReplaceDocumentRecord,
} from './documentGateway';
import type { DocumentReference, DocumentReferenceListQuery } from '../types/documents';
import { DocumentDomainError } from '../types/documents';

function unavailable(): never {
  throw new DocumentDomainError(
    'SERVICE_UNAVAILABLE',
    'Serviço documental indisponível até a configuração de uma infraestrutura segura.'
  );
}

/** Gateway fechado por padrão: não simula uploads nem persistência em produção. */
export class UnavailableDocumentReferenceGateway implements DocumentReferenceGateway {
  async listReferences(
    _query: DocumentReferenceListQuery,
    _signal?: AbortSignal
  ): Promise<readonly DocumentReference[]> {
    return unavailable();
  }

  async getReferenceById(
    _organizationId: string,
    _documentId: string
  ): Promise<DocumentReference | null> {
    return unavailable();
  }

  async createReference(_input: CreateDocumentRecord): Promise<DocumentReference> {
    return unavailable();
  }

  async replaceReference(_input: ReplaceDocumentRecord): Promise<DocumentReference> {
    return unavailable();
  }

  async archiveReference(_input: ArchiveDocumentRecord): Promise<DocumentReference> {
    return unavailable();
  }
}

