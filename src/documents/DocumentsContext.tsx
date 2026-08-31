import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../auth/useAuth';
import { useAuthorization } from '../authorization/useAuthorization';
import { getClientCapturerAssignmentGateway } from '../clients/capturerAssignmentGatewayFactory';
import { useClients } from '../clients/useClients';
import { useOrganization } from '../organization/useOrganization';
import { useProperties } from '../properties/useProperties';
import { useAppraisals } from '../appraisals/useAppraisals';
import { useProposals } from '../proposals/useProposals';
import type {
  ArchiveDocumentReferenceInput,
  DocumentApplicationContext,
  DocumentLogicalOwnerType,
  DocumentOwnerResolution,
  DocumentReference,
  DocumentReferenceFilters,
  RegisterDocumentReferenceInput,
  ReplaceDocumentReferenceInput,
} from '../types/documents';
import { DocumentDomainError } from '../types/documents';
import { DocumentApplicationService } from './documentApplicationService';

export type DocumentsContextStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'forbidden'
  | 'unavailable'
  | 'error';

export interface DocumentMutationResult {
  readonly success: boolean;
  readonly data?: DocumentReference;
  readonly error?: string;
  readonly errorCode?: string;
}

export interface DocumentsContextValue {
  readonly status: DocumentsContextStatus;
  readonly references: readonly DocumentReference[];
  readonly filters: DocumentReferenceFilters;
  readonly errorMessage: string | null;
  readonly isLoading: boolean;
  readonly setFilters: (filters: DocumentReferenceFilters) => void;
  readonly refresh: () => Promise<void>;
  readonly getReferenceById: (documentId: string) => Promise<DocumentReference | null>;
  readonly registerReference: (
    input: Omit<RegisterDocumentReferenceInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult>;
  readonly replaceReference: (
    input: Omit<ReplaceDocumentReferenceInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult>;
  readonly archiveReference: (
    input: Omit<ArchiveDocumentReferenceInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult>;
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

function createMutationKey(operation: string): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Gerador seguro de operação indisponível.');
  }
  return `${operation}:${globalThis.crypto.randomUUID()}`;
}

export function DocumentsProvider({ children }: { readonly children: React.ReactNode }) {
  const { session, status: authStatus } = useAuth();
  const { activeOrganization, activeMembership, status: organizationStatus } = useOrganization();
  const { activePermissions } = useAuthorization();
  const { getClientById } = useClients();
  const { getPropertyById } = useProperties();
  const { getAppraisalById, getRequestById } = useAppraisals();
  const { getProposalById } = useProposals();

  const [status, setStatus] = useState<DocumentsContextStatus>('idle');
  const [references, setReferences] = useState<readonly DocumentReference[]>([]);
  const [filters, setFilters] = useState<DocumentReferenceFilters>({ status: 'all' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const activeOrganizationId = activeOrganization?.id ?? null;
  const service = useMemo(() => new DocumentApplicationService(), []);

  const resolveOwner = useCallback(
    async (
      ownerType: DocumentLogicalOwnerType,
      ownerId: string
    ): Promise<DocumentOwnerResolution> => {
      const assignmentGateway = getClientCapturerAssignmentGateway();
      if (ownerType === 'client') {
        const client = await getClientById(ownerId);
        if (!client) return { exists: false, organizationId: null, authorizedUserIds: [] };
        const assignment = await assignmentGateway.getActiveAssignment(client.organizationId, client.id);
        return {
          exists: true,
          organizationId: client.organizationId,
          authorizedUserIds: assignment ? [assignment.capturerUserId] : [],
        };
      }

      if (ownerType === 'property') {
        const property = await getPropertyById(ownerId);
        if (!property) return { exists: false, organizationId: null, authorizedUserIds: [] };
        const userIds = new Set<string>();
        const assignments = await Promise.all(
          property.clientLinks.map((link) =>
            assignmentGateway.getActiveAssignment(property.organizationId, link.clientId)
          )
        );
        for (const assignment of assignments) {
          if (assignment) userIds.add(assignment.capturerUserId);
        }
        return {
          exists: true,
          organizationId: property.organizationId,
          authorizedUserIds: [...userIds],
        };
      }

      if (ownerType === 'appraisal') {
        const appraisal = await getAppraisalById(ownerId);
        return appraisal
          ? {
              exists: true,
              organizationId: appraisal.organizationId,
              authorizedUserIds: [appraisal.responsibleUserId],
            }
          : { exists: false, organizationId: null, authorizedUserIds: [] };
      }

      if (ownerType === 'appraisal_request') {
        const request = await getRequestById(ownerId);
        return request
          ? {
              exists: true,
              organizationId: request.organizationId,
              authorizedUserIds: [request.requestedByUserId, request.assignedToUserId].filter(
                (userId): userId is string => Boolean(userId)
              ),
            }
          : { exists: false, organizationId: null, authorizedUserIds: [] };
      }

      const proposal = await getProposalById(ownerId);
      return proposal
        ? {
            exists: true,
            organizationId: proposal.organizationId,
            authorizedUserIds: [
              proposal.createdByUserId,
              proposal.capturerUserId,
              proposal.activeReviewAssignment?.reviewerUserId,
            ].filter((userId): userId is string => Boolean(userId)),
          }
        : { exists: false, organizationId: null, authorizedUserIds: [] };
    },
    [getAppraisalById, getClientById, getPropertyById, getProposalById, getRequestById]
  );

  const buildContext = useCallback((): DocumentApplicationContext => {
    if (!session || !activeOrganization || !activeMembership) {
      throw new DocumentDomainError('UNAUTHENTICATED', 'Sessão organizacional inválida.');
    }
    return {
      organizationId: activeOrganization.id,
      actor: {
        userId: session.user.id,
        role: activeMembership.organizationRole,
        isActive: activeMembership.status === 'active',
        permissions: [...activePermissions],
      },
      resolveOwner,
    };
  }, [activeMembership, activeOrganization, activePermissions, resolveOwner, session]);

  const refresh = useCallback(async () => {
    if (
      authStatus !== 'authenticated' ||
      organizationStatus !== 'active' ||
      !activeOrganizationId ||
      !session ||
      !activeMembership
    ) {
      setReferences([]);
      setStatus('idle');
      setErrorMessage(null);
      return;
    }

    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    const sequence = ++requestSequence.current;
    setStatus('loading');
    setErrorMessage(null);
    try {
      const result = await service.listReferences(buildContext(), filters, controller.signal);
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      setReferences(result);
      setStatus(result.length > 0 ? 'ready' : 'empty');
    } catch (error) {
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      setReferences([]);
      if (error instanceof DocumentDomainError) {
        setErrorMessage(error.message);
        setStatus(error.code === 'SERVICE_UNAVAILABLE' ? 'unavailable' : error.code === 'FORBIDDEN' ? 'forbidden' : 'error');
      } else {
        setErrorMessage('Não foi possível consultar as referências documentais.');
        setStatus('error');
      }
    }
  }, [activeMembership, activeOrganizationId, authStatus, buildContext, filters, organizationStatus, service, session]);

  useEffect(() => {
    void refresh();
    return () => abortController.current?.abort();
  }, [refresh]);

  useEffect(() => {
    requestSequence.current += 1;
    abortController.current?.abort();
    setReferences([]);
    setErrorMessage(null);
  }, [activeOrganizationId, session?.user.id]);

  const getReferenceById = useCallback(
    async (documentId: string) => service.getReferenceById(buildContext(), documentId),
    [buildContext, service]
  );

  const executeMutation = useCallback(
    async (operation: () => Promise<DocumentReference>): Promise<DocumentMutationResult> => {
      try {
        const data = await operation();
        await refresh();
        return { success: true, data };
      } catch (error) {
        if (error instanceof DocumentDomainError) {
          return { success: false, error: error.message, errorCode: error.code };
        }
        return { success: false, error: 'Não foi possível concluir a operação documental.' };
      }
    },
    [refresh]
  );

  const registerReference = useCallback(
    (input: Omit<RegisterDocumentReferenceInput, 'idempotencyKey'>) =>
      executeMutation(() =>
        service.registerReference(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('document-register'),
        })
      ),
    [buildContext, executeMutation, service]
  );

  const replaceReference = useCallback(
    (input: Omit<ReplaceDocumentReferenceInput, 'idempotencyKey'>) =>
      executeMutation(() =>
        service.replaceReference(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('document-replace'),
        })
      ),
    [buildContext, executeMutation, service]
  );

  const archiveReference = useCallback(
    (input: Omit<ArchiveDocumentReferenceInput, 'idempotencyKey'>) =>
      executeMutation(() =>
        service.archiveReference(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('document-archive'),
        })
      ),
    [buildContext, executeMutation, service]
  );

  const value = useMemo<DocumentsContextValue>(
    () => ({
      status,
      references,
      filters,
      errorMessage,
      isLoading: status === 'loading',
      setFilters,
      refresh,
      getReferenceById,
      registerReference,
      replaceReference,
      archiveReference,
    }),
    [archiveReference, errorMessage, filters, getReferenceById, references, refresh, registerReference, replaceReference, status]
  );

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>;
}

export function useDocuments(): DocumentsContextValue {
  const context = useContext(DocumentsContext);
  if (!context) throw new Error('useDocuments deve ser utilizado dentro de DocumentsProvider.');
  return context;
}
