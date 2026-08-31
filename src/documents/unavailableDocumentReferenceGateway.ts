import type {
  ArchiveDocumentRecord,
  CreateDocumentRecord,
  CreateDocumentRequirementRecord,
  DocumentReferenceGateway,
  ReplaceDocumentRecord,
  ResolveDocumentRequirementRecord,
} from './documentGateway';
import type {
  DocumentReference,
  DocumentReferenceListQuery,
  DocumentRequirement,
  DocumentRequirementListQuery,
} from '../types/documents';
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

  async listRequirements(
    _query: DocumentRequirementListQuery,
    _signal?: AbortSignal
  ): Promise<readonly DocumentRequirement[]> {
    return unavailable();
  }

  async getRequirementById(
    _organizationId: string,
    _requirementId: string
  ): Promise<DocumentRequirement | null> {
    return unavailable();
  }

  async createRequirement(_input: CreateDocumentRequirementRecord): Promise<DocumentRequirement> {
    return unavailable();
  }

  async resolveRequirement(_input: ResolveDocumentRequirementRecord): Promise<DocumentRequirement> {
    return unavailable();
  }
}
