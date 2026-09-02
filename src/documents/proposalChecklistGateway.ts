import type {
  ProposalChecklistHistoryEntry,
  ProposalChecklistItem,
  ProposalChecklistTemplate,
  ProposalDocumentChecklist,
} from '../types/proposalChecklists';

export interface ConfigureProposalChecklistTemplateRecord {
  readonly template: ProposalChecklistTemplate;
  readonly previousTemplateVersionId?: string;
  readonly expectedVersion?: number;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export interface ApplyProposalChecklistRecord {
  readonly checklist: ProposalDocumentChecklist;
  readonly authorizedUserIds: readonly string[];
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export interface TransitionProposalChecklistItemRecord {
  readonly organizationId: string;
  readonly checklistId: string;
  readonly item: ProposalChecklistItem;
  readonly historyEntry: ProposalChecklistHistoryEntry;
  readonly expectedVersion: number;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export interface ProposalChecklistGateway {
  listCurrentTemplates(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly ProposalChecklistTemplate[]>;
  listTemplateHistory(
    organizationId: string,
    logicalTemplateId: string,
    signal?: AbortSignal
  ): Promise<readonly ProposalChecklistTemplate[]>;
  getTemplateByVersionId(
    organizationId: string,
    templateVersionId: string
  ): Promise<ProposalChecklistTemplate | null>;
  configureTemplate(
    input: ConfigureProposalChecklistTemplateRecord
  ): Promise<ProposalChecklistTemplate>;
  listChecklists(
    organizationId: string,
    proposalId?: string,
    signal?: AbortSignal
  ): Promise<readonly ProposalDocumentChecklist[]>;
  getChecklistById(
    organizationId: string,
    checklistId: string
  ): Promise<ProposalDocumentChecklist | null>;
  applyChecklist(input: ApplyProposalChecklistRecord): Promise<ProposalDocumentChecklist>;
  transitionItem(
    input: TransitionProposalChecklistItemRecord
  ): Promise<ProposalDocumentChecklist>;
  clearAllSessionData?(): void;
}
