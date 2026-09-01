import { ROLE_PERMISSIONS_SET_MAP } from '../authorization/permissionsMatrix';
import {
  DOCUMENT_STORAGE_BUCKET,
  DocumentDomainError,
  type DocumentApplicationContext,
  type DocumentFileContent,
  type DocumentReference,
  type DocumentUploadMetadataInput,
  type DocumentUploadProgress,
} from '../types/documents';
import { SecureDocumentIdGenerator, type DocumentIdGenerator } from './crypto';
import { DocumentApplicationService } from './documentApplicationService';
import type { DocumentStorageGateway } from './documentStorageGateway';
import { getDocumentStorageGateway } from './documentStorageGatewayFactory';
import {
  buildDocumentStoragePath,
  validateDocumentFile,
  verifyDocumentFileSignature,
} from './documentStoragePolicy';

export interface UploadDocumentCommand {
  readonly file: File;
  readonly metadata: DocumentUploadMetadataInput;
  readonly idempotencyKey: string;
  readonly signal: AbortSignal;
  readonly onProgress: (progress: DocumentUploadProgress) => void;
}

export class DocumentUploadService {
  constructor(
    private readonly applicationService: DocumentApplicationService = new DocumentApplicationService(),
    private readonly storageGateway: DocumentStorageGateway = getDocumentStorageGateway(),
    private readonly idGenerator: DocumentIdGenerator = SecureDocumentIdGenerator
  ) {}

  private async compensate(objectPath: string): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.storageGateway.remove(DOCUMENT_STORAGE_BUCKET, objectPath);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw new DocumentDomainError(
      'STORAGE_COMPENSATION_FAILED',
      lastError instanceof Error
        ? 'O envio falhou e a limpeza automática precisa ser repetida.'
        : 'Não foi possível limpar o envio interrompido.'
    );
  }

  async uploadDocument(
    context: DocumentApplicationContext,
    command: UploadDocumentCommand
  ): Promise<DocumentReference> {
    const mimeType = validateDocumentFile(command.file);
    const authorizationInput = {
      ...command.metadata,
      mimeType,
      fileSizeBytes: command.file.size,
      idempotencyKey: command.idempotencyKey,
    };
    await this.applicationService.authorizeStoredUpload(context, authorizationInput);
    await verifyDocumentFileSignature(command.file);
    if (command.signal.aborted) {
      throw new DocumentDomainError('UPLOAD_CANCELLED', 'Envio cancelado.');
    }

    const documentId = this.idGenerator.generate();
    const objectPath = buildDocumentStoragePath({
      organizationId: context.organizationId,
      logicalOwnerType: command.metadata.logicalOwnerType,
      logicalOwnerId: command.metadata.logicalOwnerId,
      documentId,
      mimeType,
    });

    try {
      const storedObject = await this.storageGateway.upload({
        bucket: DOCUMENT_STORAGE_BUCKET,
        objectPath,
        file: command.file,
        mimeType,
        signal: command.signal,
        onProgress: command.onProgress,
      });
      return await this.applicationService.registerStoredDocument(context, {
        ...authorizationInput,
        documentId,
        storedObject,
      });
    } catch (error) {
      if (error instanceof DocumentDomainError && error.code === 'STORAGE_COMPENSATION_FAILED') throw error;
      try {
        await this.compensate(objectPath);
      } catch (compensationError) {
        throw compensationError;
      }
      if (command.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new DocumentDomainError('UPLOAD_CANCELLED', 'Envio cancelado.');
      }
      throw error instanceof DocumentDomainError
        ? error
        : new DocumentDomainError('STORAGE_UPLOAD_FAILED', 'Não foi possível concluir o envio.');
    }
  }

  async getDocumentContent(
    context: DocumentApplicationContext,
    documentId: string,
    signal?: AbortSignal
  ): Promise<DocumentFileContent> {
    const canonicalPermissions = ROLE_PERMISSIONS_SET_MAP.get(context.actor.role);
    if (
      !canonicalPermissions?.has('documents:download') ||
      !context.actor.permissions.includes('documents:download')
    ) {
      throw new DocumentDomainError('FORBIDDEN', 'Você não pode abrir este documento.');
    }
    const reference = await this.applicationService.getReferenceById(context, documentId);
    if (
      !reference ||
      reference.storageState !== 'stored' ||
      !reference.storageBucket ||
      !reference.storageObjectPath
    ) {
      throw new DocumentDomainError('STORAGE_DOWNLOAD_FAILED', 'O arquivo não está disponível.');
    }
    const blob = await this.storageGateway.download({
      bucket: reference.storageBucket,
      objectPath: reference.storageObjectPath,
      signal,
    });
    return { blob, displayName: reference.displayName, mimeType: reference.mimeType };
  }
}
