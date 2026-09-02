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
  CreateDocumentRequirementInput,
  DocumentApplicationContext,
  DocumentGovernanceDashboard,
  DocumentFileContent,
  DocumentLogicalOwnerType,
  DocumentOwnerResolution,
  DocumentReference,
  DocumentReferenceFilters,
  DocumentUploadMetadataInput,
  DocumentUploadProgress,
  DocumentRequirement,
  FulfillDocumentRequirementInput,
  RegisterDocumentReferenceInput,
  ReplaceDocumentReferenceInput,
  ReplaceStoredDocumentCommandInput,
  ResolveDocumentRequirementInput,
} from '../types/documents';
import { DocumentDomainError } from '../types/documents';
import type {
  ApplyProposalChecklistInput,
  ConfigureProposalChecklistTemplateInput,
  ProposalChecklistApplicationContext,
  ProposalChecklistDashboard,
  ProposalChecklistTemplate,
  ProposalDocumentChecklist,
  TransitionProposalChecklistItemInput,
} from '../types/proposalChecklists';
import type {
  ConfigureDocumentAlertPolicyInput,
  CreateDocumentBatchExportInput,
  CreateDocumentShareInput,
  CreateDocumentShareResult,
  DocumentAlertPolicy,
  DocumentBatchExportResult,
  DocumentComplianceDashboard,
  DocumentShareGrant,
  RedeemedDocumentShare,
  RevokeDocumentShareInput,
} from '../types/documentCompliance';
import { DocumentApplicationService } from './documentApplicationService';
import { DocumentComplianceApplicationService } from './documentComplianceApplicationService';
import { DocumentUploadService } from './documentUploadService';
import { ProposalChecklistApplicationService } from './proposalChecklistApplicationService';

export type DocumentsContextStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'forbidden'
  | 'unavailable'
  | 'error';

export interface DocumentMutationResult<T = DocumentReference> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly errorCode?: string;
}

export interface DocumentsContextValue {
  readonly status: DocumentsContextStatus;
  readonly references: readonly DocumentReference[];
  readonly filters: DocumentReferenceFilters;
  readonly errorMessage: string | null;
  readonly governanceStatus: DocumentsContextStatus;
  readonly governance: DocumentGovernanceDashboard | null;
  readonly governanceErrorMessage: string | null;
  readonly checklistStatus: DocumentsContextStatus;
  readonly checklistDashboard: ProposalChecklistDashboard | null;
  readonly checklistErrorMessage: string | null;
  readonly complianceStatus: DocumentsContextStatus;
  readonly complianceDashboard: DocumentComplianceDashboard | null;
  readonly complianceErrorMessage: string | null;
  readonly isLoading: boolean;
  readonly setFilters: (filters: DocumentReferenceFilters) => void;
  readonly refresh: () => Promise<void>;
  readonly refreshGovernance: () => Promise<void>;
  readonly refreshChecklistDashboard: () => Promise<void>;
  readonly refreshComplianceDashboard: () => Promise<void>;
  readonly getReferenceById: (documentId: string) => Promise<DocumentReference | null>;
  readonly listDocumentsForProposal: (
    proposalId: string,
    signal?: AbortSignal
  ) => Promise<readonly DocumentReference[]>;
  readonly listVersionHistory: (
    documentId: string,
    signal?: AbortSignal
  ) => Promise<readonly DocumentReference[]>;
  readonly registerReference: (
    input: Omit<RegisterDocumentReferenceInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult>;
  readonly replaceReference: (
    input: Omit<ReplaceDocumentReferenceInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult>;
  readonly archiveReference: (
    input: Omit<ArchiveDocumentReferenceInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult>;
  readonly uploadDocument: (
    file: File,
    metadata: DocumentUploadMetadataInput,
    onProgress: (progress: DocumentUploadProgress) => void,
    signal: AbortSignal,
    idempotencyKey: string
  ) => Promise<DocumentReference>;
  readonly replaceStoredDocument: (
    file: File,
    input: ReplaceStoredDocumentCommandInput,
    onProgress: (progress: DocumentUploadProgress) => void,
    signal: AbortSignal
  ) => Promise<DocumentReference>;
  readonly getDocumentContent: (
    documentId: string,
    signal?: AbortSignal
  ) => Promise<DocumentFileContent>;
  readonly createRequirement: (
    input: Omit<CreateDocumentRequirementInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult<DocumentRequirement>>;
  readonly fulfillRequirement: (
    input: Omit<FulfillDocumentRequirementInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult<DocumentRequirement>>;
  readonly waiveRequirement: (
    input: Omit<ResolveDocumentRequirementInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult<DocumentRequirement>>;
  readonly cancelRequirement: (
    input: Omit<ResolveDocumentRequirementInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult<DocumentRequirement>>;
  readonly configureChecklistTemplate: (
    input: Omit<ConfigureProposalChecklistTemplateInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult<ProposalChecklistTemplate>>;
  readonly applyProposalChecklist: (
    input: Omit<ApplyProposalChecklistInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult<ProposalDocumentChecklist>>;
  readonly transitionProposalChecklistItem: (
    input: Omit<TransitionProposalChecklistItemInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult<ProposalDocumentChecklist>>;
  readonly configureDocumentAlertPolicy: (
    input: Omit<ConfigureDocumentAlertPolicyInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult<DocumentAlertPolicy>>;
  readonly createDocumentShare: (
    input: Omit<CreateDocumentShareInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult<CreateDocumentShareResult>>;
  readonly revokeDocumentShare: (
    input: Omit<RevokeDocumentShareInput, 'idempotencyKey'>
  ) => Promise<DocumentMutationResult<DocumentShareGrant>>;
  readonly exportDocuments: (
    input: Omit<CreateDocumentBatchExportInput, 'idempotencyKey'>,
    signal?: AbortSignal
  ) => Promise<DocumentMutationResult<DocumentBatchExportResult>>;
  readonly redeemSharedDocument: (
    token: string,
    signal?: AbortSignal
  ) => Promise<RedeemedDocumentShare>;
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
  const [governanceStatus, setGovernanceStatus] = useState<DocumentsContextStatus>('idle');
  const [governance, setGovernance] = useState<DocumentGovernanceDashboard | null>(null);
  const [governanceErrorMessage, setGovernanceErrorMessage] = useState<string | null>(null);
  const [checklistStatus, setChecklistStatus] = useState<DocumentsContextStatus>('idle');
  const [checklistDashboard, setChecklistDashboard] = useState<ProposalChecklistDashboard | null>(null);
  const [checklistErrorMessage, setChecklistErrorMessage] = useState<string | null>(null);
  const [complianceStatus, setComplianceStatus] = useState<DocumentsContextStatus>('idle');
  const [complianceDashboard, setComplianceDashboard] = useState<DocumentComplianceDashboard | null>(null);
  const [complianceErrorMessage, setComplianceErrorMessage] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const governanceRequestSequence = useRef(0);
  const checklistRequestSequence = useRef(0);
  const complianceRequestSequence = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const governanceAbortController = useRef<AbortController | null>(null);
  const checklistAbortController = useRef<AbortController | null>(null);
  const complianceAbortController = useRef<AbortController | null>(null);
  const activeOrganizationId = activeOrganization?.id ?? null;
  const activeDocumentContextKey = `${activeOrganizationId ?? ''}:${session?.user.id ?? ''}`;
  const activeDocumentContextKeyRef = useRef(activeDocumentContextKey);
  activeDocumentContextKeyRef.current = activeDocumentContextKey;
  const service = useMemo(() => new DocumentApplicationService(), []);
  const uploadService = useMemo(() => new DocumentUploadService(service), [service]);
  const checklistService = useMemo(() => new ProposalChecklistApplicationService(), []);
  const complianceService = useMemo(() => new DocumentComplianceApplicationService(), []);
  const canViewGovernance = activePermissions.has('documents:view_requirements');

  const resolveProposalChecklistSource = useCallback(
    async (proposalId: string) => {
      const proposal = await getProposalById(proposalId);
      if (!proposal) {
        return {
          exists: false,
          organizationId: null,
          proposalId,
          authorizedUserIds: [],
        } as const;
      }
      return {
        exists: true,
        organizationId: proposal.organizationId,
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        title: proposal.title,
        proposalType: proposal.proposalType,
        proposalCategory: proposal.category,
        authorizedUserIds: [
          proposal.createdByUserId,
          proposal.capturerUserId,
          proposal.activeReviewAssignment?.reviewerUserId,
        ].filter((userId): userId is string => Boolean(userId)),
      } as const;
    },
    [getProposalById]
  );

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

      const proposal = await resolveProposalChecklistSource(ownerId);
      return {
        exists: proposal.exists,
        organizationId: proposal.organizationId,
        authorizedUserIds: proposal.authorizedUserIds,
      };
    },
    [getAppraisalById, getClientById, getPropertyById, getRequestById, resolveProposalChecklistSource]
  );

  const buildContext = useCallback((): DocumentApplicationContext & ProposalChecklistApplicationContext => {
    if (!session || !activeOrganization || !activeMembership) {
      throw new DocumentDomainError('UNAUTHENTICATED', 'Sessão organizacional inválida.');
    }
    return {
      organizationId: activeOrganization.id,
      actor: {
        userId: session.user.id,
        displayName: session.user.name,
        role: activeMembership.organizationRole,
        isActive: activeMembership.status === 'active',
        permissions: [...activePermissions],
      },
      resolveOwner,
      resolveProposalChecklistSource,
    };
  }, [activeMembership, activeOrganization, activePermissions, resolveOwner, resolveProposalChecklistSource, session]);

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

  const refreshGovernance = useCallback(async () => {
    if (
      authStatus !== 'authenticated' ||
      organizationStatus !== 'active' ||
      !activeOrganizationId ||
      !session ||
      !activeMembership ||
      !canViewGovernance
    ) {
      setGovernance(null);
      setGovernanceStatus('idle');
      setGovernanceErrorMessage(null);
      return;
    }

    governanceAbortController.current?.abort();
    const controller = new AbortController();
    governanceAbortController.current = controller;
    const sequence = ++governanceRequestSequence.current;
    setGovernanceStatus('loading');
    setGovernanceErrorMessage(null);
    try {
      const policy = await complianceService.getAlertPolicy(buildContext(), controller.signal);
      const result = await service.getGovernanceDashboard(
        buildContext(),
        policy.warningDays,
        controller.signal
      );
      if (controller.signal.aborted || sequence !== governanceRequestSequence.current) return;
      setGovernance(result);
      setGovernanceStatus(
        result.requirements.length > 0 ||
          result.expiringDocuments.length > 0 ||
          result.expiredDocuments.length > 0
          ? 'ready'
          : 'empty'
      );
    } catch (error) {
      if (controller.signal.aborted || sequence !== governanceRequestSequence.current) return;
      setGovernance(null);
      if (error instanceof DocumentDomainError) {
        setGovernanceErrorMessage(error.message);
        setGovernanceStatus(
          error.code === 'SERVICE_UNAVAILABLE'
            ? 'unavailable'
            : error.code === 'FORBIDDEN'
              ? 'forbidden'
              : 'error'
        );
      } else {
        setGovernanceErrorMessage('Não foi possível consultar pendências e prazos.');
        setGovernanceStatus('error');
      }
    }
  }, [activeMembership, activeOrganizationId, authStatus, buildContext, canViewGovernance, complianceService, organizationStatus, service, session]);

  const refreshChecklistDashboard = useCallback(async () => {
    if (
      authStatus !== 'authenticated' ||
      organizationStatus !== 'active' ||
      !activeOrganizationId ||
      !session ||
      !activeMembership ||
      !canViewGovernance
    ) {
      setChecklistDashboard(null);
      setChecklistStatus('idle');
      setChecklistErrorMessage(null);
      return;
    }
    checklistAbortController.current?.abort();
    const controller = new AbortController();
    checklistAbortController.current = controller;
    const sequence = ++checklistRequestSequence.current;
    setChecklistStatus('loading');
    setChecklistErrorMessage(null);
    try {
      const result = await checklistService.getDashboard(buildContext(), controller.signal);
      if (controller.signal.aborted || sequence !== checklistRequestSequence.current) return;
      setChecklistDashboard(result);
      setChecklistStatus(
        result.templates.length > 0 || result.checklists.length > 0 ? 'ready' : 'empty'
      );
    } catch (error) {
      if (controller.signal.aborted || sequence !== checklistRequestSequence.current) return;
      setChecklistDashboard(null);
      if (error instanceof DocumentDomainError) {
        setChecklistErrorMessage(error.message);
        setChecklistStatus(
          error.code === 'SERVICE_UNAVAILABLE'
            ? 'unavailable'
            : error.code === 'FORBIDDEN'
              ? 'forbidden'
              : 'error'
        );
      } else {
        setChecklistErrorMessage('Não foi possível consultar os checklists das propostas.');
        setChecklistStatus('error');
      }
    }
  }, [activeMembership, activeOrganizationId, authStatus, buildContext, canViewGovernance, checklistService, organizationStatus, session]);

  const refreshComplianceDashboard = useCallback(async () => {
    if (
      authStatus !== 'authenticated' ||
      organizationStatus !== 'active' ||
      !activeOrganizationId ||
      !session ||
      !activeMembership
    ) {
      setComplianceDashboard(null);
      setComplianceStatus('idle');
      setComplianceErrorMessage(null);
      return;
    }
    complianceAbortController.current?.abort();
    const controller = new AbortController();
    complianceAbortController.current = controller;
    const sequence = ++complianceRequestSequence.current;
    setComplianceStatus('loading');
    setComplianceErrorMessage(null);
    try {
      const result = await complianceService.getDashboard(buildContext(), controller.signal);
      if (controller.signal.aborted || sequence !== complianceRequestSequence.current) return;
      setComplianceDashboard(result);
      setComplianceStatus(
        result.alerts.length > 0 || result.shares.length > 0 || result.exports.length > 0
          ? 'ready'
          : 'empty'
      );
    } catch (error) {
      if (controller.signal.aborted || sequence !== complianceRequestSequence.current) return;
      setComplianceDashboard(null);
      if (error instanceof DocumentDomainError) {
        setComplianceErrorMessage(error.message);
        setComplianceStatus(
          error.code === 'SERVICE_UNAVAILABLE'
            ? 'unavailable'
            : error.code === 'FORBIDDEN'
              ? 'forbidden'
              : 'error'
        );
      } else {
        setComplianceErrorMessage('Não foi possível consultar validades e saídas documentais.');
        setComplianceStatus('error');
      }
    }
  }, [activeMembership, activeOrganizationId, authStatus, buildContext, complianceService, organizationStatus, session]);

  useEffect(() => {
    void refresh();
    return () => abortController.current?.abort();
  }, [refresh]);

  useEffect(() => {
    void refreshGovernance();
    return () => governanceAbortController.current?.abort();
  }, [refreshGovernance]);

  useEffect(() => {
    void refreshChecklistDashboard();
    return () => checklistAbortController.current?.abort();
  }, [refreshChecklistDashboard]);

  useEffect(() => {
    void refreshComplianceDashboard();
    return () => complianceAbortController.current?.abort();
  }, [refreshComplianceDashboard]);

  useEffect(() => {
    requestSequence.current += 1;
    abortController.current?.abort();
    governanceRequestSequence.current += 1;
    governanceAbortController.current?.abort();
    checklistRequestSequence.current += 1;
    checklistAbortController.current?.abort();
    complianceRequestSequence.current += 1;
    complianceAbortController.current?.abort();
    setReferences([]);
    setGovernance(null);
    setChecklistDashboard(null);
    setComplianceDashboard(null);
    setErrorMessage(null);
    setGovernanceErrorMessage(null);
    setChecklistErrorMessage(null);
    setComplianceErrorMessage(null);
  }, [activeOrganizationId, session?.user.id]);

  const getReferenceById = useCallback(
    async (documentId: string) => service.getReferenceById(buildContext(), documentId),
    [buildContext, service]
  );

  const listDocumentsForProposal = useCallback(
    async (proposalId: string, signal?: AbortSignal) => {
      const documents = await service.listReferences(
        buildContext(),
        { ownerType: 'proposal', status: 'active' },
        signal
      );
      return documents.filter(
        (document) => document.logicalOwnerType === 'proposal' && document.logicalOwnerId === proposalId
      );
    },
    [buildContext, service]
  );

  const listVersionHistory = useCallback(
    (documentId: string, signal?: AbortSignal) =>
      service.listVersionHistory(buildContext(), documentId, signal),
    [buildContext, service]
  );

  const executeMutation = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<DocumentMutationResult<T>> => {
      const mutationContextKey = activeDocumentContextKeyRef.current;
      try {
        const data = await operation();
        if (mutationContextKey === activeDocumentContextKeyRef.current) {
          await Promise.all([refresh(), refreshGovernance()]);
        }
        return { success: true, data };
      } catch (error) {
        if (error instanceof DocumentDomainError) {
          return { success: false, error: error.message, errorCode: error.code };
        }
        return { success: false, error: 'Não foi possível concluir a operação documental.' };
      }
    },
    [refresh, refreshGovernance]
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

  const uploadDocument = useCallback(
    async (
      file: File,
      metadata: DocumentUploadMetadataInput,
      onProgress: (progress: DocumentUploadProgress) => void,
      signal: AbortSignal,
      idempotencyKey: string
    ) => {
      const mutationContextKey = activeDocumentContextKeyRef.current;
      const result = await uploadService.uploadDocument(buildContext(), {
        file,
        metadata,
        onProgress,
        signal,
        idempotencyKey,
      });
      if (mutationContextKey === activeDocumentContextKeyRef.current) {
        await Promise.all([refresh(), refreshGovernance()]);
      }
      return result;
    },
    [buildContext, refresh, refreshGovernance, uploadService]
  );

  const getDocumentContent = useCallback(
    (documentId: string, signal?: AbortSignal) =>
      uploadService.getDocumentContent(buildContext(), documentId, signal),
    [buildContext, uploadService]
  );

  const replaceStoredDocument = useCallback(
    async (
      file: File,
      input: ReplaceStoredDocumentCommandInput,
      onProgress: (progress: DocumentUploadProgress) => void,
      signal: AbortSignal
    ) => {
      const mutationContextKey = activeDocumentContextKeyRef.current;
      const result = await uploadService.replaceStoredDocument(buildContext(), {
        ...input,
        file,
        onProgress,
        signal,
        idempotencyKey: createMutationKey('document-version-upload'),
      });
      if (mutationContextKey === activeDocumentContextKeyRef.current) {
        await Promise.all([refresh(), refreshGovernance()]);
      }
      return result;
    },
    [buildContext, refresh, refreshGovernance, uploadService]
  );

  const createRequirement = useCallback(
    (input: Omit<CreateDocumentRequirementInput, 'idempotencyKey'>) =>
      executeMutation(() =>
        service.createRequirement(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('document-requirement-create'),
        })
      ),
    [buildContext, executeMutation, service]
  );

  const fulfillRequirement = useCallback(
    (input: Omit<FulfillDocumentRequirementInput, 'idempotencyKey'>) =>
      executeMutation(() =>
        service.fulfillRequirement(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('document-requirement-fulfill'),
        })
      ),
    [buildContext, executeMutation, service]
  );

  const waiveRequirement = useCallback(
    (input: Omit<ResolveDocumentRequirementInput, 'idempotencyKey'>) =>
      executeMutation(() =>
        service.waiveRequirement(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('document-requirement-waive'),
        })
      ),
    [buildContext, executeMutation, service]
  );

  const cancelRequirement = useCallback(
    (input: Omit<ResolveDocumentRequirementInput, 'idempotencyKey'>) =>
      executeMutation(() =>
        service.cancelRequirement(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('document-requirement-cancel'),
        })
      ),
    [buildContext, executeMutation, service]
  );

  const executeChecklistMutation = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<DocumentMutationResult<T>> => {
      const mutationContextKey = activeDocumentContextKeyRef.current;
      try {
        const data = await operation();
        if (mutationContextKey === activeDocumentContextKeyRef.current) {
          await refreshChecklistDashboard();
        }
        return { success: true, data };
      } catch (error) {
        if (error instanceof DocumentDomainError) {
          return { success: false, error: error.message, errorCode: error.code };
        }
        return { success: false, error: 'Não foi possível concluir a operação do checklist.' };
      }
    },
    [refreshChecklistDashboard]
  );

  const configureChecklistTemplate = useCallback(
    (input: Omit<ConfigureProposalChecklistTemplateInput, 'idempotencyKey'>) =>
      executeChecklistMutation(() =>
        checklistService.configureTemplate(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('proposal-checklist-template'),
        })
      ),
    [buildContext, checklistService, executeChecklistMutation]
  );

  const applyProposalChecklist = useCallback(
    (input: Omit<ApplyProposalChecklistInput, 'idempotencyKey'>) =>
      executeChecklistMutation(() =>
        checklistService.applyChecklist(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('proposal-checklist-apply'),
        })
      ),
    [buildContext, checklistService, executeChecklistMutation]
  );

  const transitionProposalChecklistItem = useCallback(
    (input: Omit<TransitionProposalChecklistItemInput, 'idempotencyKey'>) =>
      executeChecklistMutation(() =>
        checklistService.transitionItem(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('proposal-checklist-transition'),
        })
      ),
    [buildContext, checklistService, executeChecklistMutation]
  );

  const executeComplianceMutation = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<DocumentMutationResult<T>> => {
      const mutationContextKey = activeDocumentContextKeyRef.current;
      try {
        const data = await operation();
        if (mutationContextKey === activeDocumentContextKeyRef.current) {
          await Promise.all([refreshComplianceDashboard(), refreshGovernance()]);
        }
        return { success: true, data };
      } catch (error) {
        if (error instanceof DocumentDomainError) {
          return { success: false, error: error.message, errorCode: error.code };
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return { success: false, error: 'Operação cancelada.', errorCode: 'UPLOAD_CANCELLED' };
        }
        return { success: false, error: 'Não foi possível concluir a saída documental.' };
      }
    },
    [refreshComplianceDashboard, refreshGovernance]
  );

  const configureDocumentAlertPolicy = useCallback(
    (input: Omit<ConfigureDocumentAlertPolicyInput, 'idempotencyKey'>) =>
      executeComplianceMutation(() =>
        complianceService.configureAlertPolicy(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('document-alert-policy'),
        })
      ),
    [buildContext, complianceService, executeComplianceMutation]
  );

  const createDocumentShare = useCallback(
    (input: Omit<CreateDocumentShareInput, 'idempotencyKey'>) =>
      executeComplianceMutation(() =>
        complianceService.createShare(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('document-share'),
        })
      ),
    [buildContext, complianceService, executeComplianceMutation]
  );

  const revokeDocumentShare = useCallback(
    (input: Omit<RevokeDocumentShareInput, 'idempotencyKey'>) =>
      executeComplianceMutation(() =>
        complianceService.revokeShare(buildContext(), {
          ...input,
          idempotencyKey: createMutationKey('document-share-revoke'),
        })
      ),
    [buildContext, complianceService, executeComplianceMutation]
  );

  const exportDocuments = useCallback(
    (
      input: Omit<CreateDocumentBatchExportInput, 'idempotencyKey'>,
      signal?: AbortSignal
    ) =>
      executeComplianceMutation(() =>
        complianceService.createBatchExport(
          buildContext(),
          {
            ...input,
            idempotencyKey: createMutationKey('document-export'),
          },
          signal
        )
      ),
    [buildContext, complianceService, executeComplianceMutation]
  );

  const redeemSharedDocument = useCallback(
    (token: string, signal?: AbortSignal) => complianceService.redeemShareToken(token, signal),
    [complianceService]
  );

  const value = useMemo<DocumentsContextValue>(
    () => ({
      status,
      references,
      filters,
      errorMessage,
      governanceStatus,
      governance,
      governanceErrorMessage,
      checklistStatus,
      checklistDashboard,
      checklistErrorMessage,
      complianceStatus,
      complianceDashboard,
      complianceErrorMessage,
      isLoading: status === 'loading',
      setFilters,
      refresh,
      refreshGovernance,
      refreshChecklistDashboard,
      refreshComplianceDashboard,
      getReferenceById,
      listDocumentsForProposal,
      listVersionHistory,
      registerReference,
      replaceReference,
      archiveReference,
      uploadDocument,
      replaceStoredDocument,
      getDocumentContent,
      createRequirement,
      fulfillRequirement,
      waiveRequirement,
      cancelRequirement,
      configureChecklistTemplate,
      applyProposalChecklist,
      transitionProposalChecklistItem,
      configureDocumentAlertPolicy,
      createDocumentShare,
      revokeDocumentShare,
      exportDocuments,
      redeemSharedDocument,
    }),
    [applyProposalChecklist, archiveReference, cancelRequirement, checklistDashboard, checklistErrorMessage, checklistStatus, complianceDashboard, complianceErrorMessage, complianceStatus, configureChecklistTemplate, configureDocumentAlertPolicy, createDocumentShare, createRequirement, errorMessage, exportDocuments, filters, fulfillRequirement, getDocumentContent, getReferenceById, governance, governanceErrorMessage, governanceStatus, listDocumentsForProposal, listVersionHistory, redeemSharedDocument, references, refresh, refreshChecklistDashboard, refreshComplianceDashboard, refreshGovernance, registerReference, replaceReference, replaceStoredDocument, revokeDocumentShare, status, transitionProposalChecklistItem, uploadDocument, waiveRequirement]
  );

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>;
}

export function useDocuments(): DocumentsContextValue {
  const context = useContext(DocumentsContext);
  if (!context) throw new Error('useDocuments deve ser utilizado dentro de DocumentsProvider.');
  return context;
}
