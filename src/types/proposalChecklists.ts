import type { DocumentAccessScope, DocumentCategory, DocumentReferenceId } from './documents';
import type { ProposalCategory, ProposalType } from './proposals';

export type ProposalChecklistTemplateMatch<T> = T | 'all';
export type ProposalChecklistTemplateStatus = 'active' | 'archived';

export interface ProposalChecklistTemplateItemInput {
  readonly title: string;
  readonly category: DocumentCategory;
  readonly accessScope: DocumentAccessScope;
  readonly required: boolean;
  readonly dueInDays?: number;
}

export interface ProposalChecklistTemplateItem extends ProposalChecklistTemplateItemInput {
  readonly id: string;
  readonly position: number;
}

/** Versão imutável de um modelo configurado pela organização. */
export interface ProposalChecklistTemplate {
  readonly id: string;
  readonly logicalTemplateId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly proposalType: ProposalChecklistTemplateMatch<ProposalType>;
  readonly proposalCategory: ProposalChecklistTemplateMatch<ProposalCategory>;
  readonly status: ProposalChecklistTemplateStatus;
  readonly isCurrent: boolean;
  readonly versionNumber: number;
  readonly predecessorTemplateVersionId?: string;
  readonly changeReason: string;
  readonly items: readonly ProposalChecklistTemplateItem[];
  readonly createdByUserId: string;
  readonly createdByDisplayName: string;
  readonly createdAt: string;
}

export interface ConfigureProposalChecklistTemplateInput {
  readonly name: string;
  readonly proposalType: ProposalChecklistTemplateMatch<ProposalType>;
  readonly proposalCategory: ProposalChecklistTemplateMatch<ProposalCategory>;
  readonly changeReason: string;
  readonly items: readonly ProposalChecklistTemplateItemInput[];
  readonly previousTemplateVersionId?: string;
  readonly expectedVersion?: number;
  readonly idempotencyKey: string;
}

export interface ProposalChecklistSourceResolution {
  readonly exists: boolean;
  readonly organizationId: string | null;
  readonly proposalId: string;
  readonly proposalNumber?: string;
  readonly title?: string;
  readonly proposalType?: ProposalType;
  readonly proposalCategory?: ProposalCategory;
  readonly authorizedUserIds: readonly string[];
}

export type ProposalChecklistItemState =
  | 'pending'
  | 'received'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'expired';

export type ProposalChecklistStatus = 'active' | 'completed';

export interface ProposalChecklistItem {
  readonly id: string;
  readonly checklistId: string;
  readonly templateItemId: string;
  readonly title: string;
  readonly category: DocumentCategory;
  readonly accessScope: DocumentAccessScope;
  readonly required: boolean;
  readonly position: number;
  readonly dueOn?: string;
  readonly state: ProposalChecklistItemState;
  readonly linkedDocumentId?: DocumentReferenceId;
  readonly receivedAt?: string;
  readonly reviewedAt?: string;
  readonly decidedAt?: string;
  readonly decidedByUserId?: string;
  readonly decisionReason?: string;
  readonly versionNumber: number;
  readonly updatedAt: string;
}

export interface ProposalChecklistHistoryEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly checklistId: string;
  readonly checklistItemId: string;
  readonly fromState?: ProposalChecklistItemState;
  readonly toState: ProposalChecklistItemState;
  readonly linkedDocumentId?: DocumentReferenceId;
  readonly actorUserId: string;
  readonly actorDisplayName: string;
  readonly reason?: string;
  readonly occurredAt: string;
  readonly correlationId: string;
}

/** Instância real e rastreável do modelo para uma proposta existente. */
export interface ProposalDocumentChecklist {
  readonly id: string;
  readonly organizationId: string;
  readonly proposalId: string;
  readonly proposalNumber: string;
  readonly proposalTitle: string;
  readonly proposalType: ProposalType;
  readonly proposalCategory: ProposalCategory;
  readonly templateLogicalId: string;
  readonly templateVersionId: string;
  readonly templateVersionNumber: number;
  readonly templateName: string;
  readonly status: ProposalChecklistStatus;
  readonly versionNumber: number;
  readonly items: readonly ProposalChecklistItem[];
  readonly history: readonly ProposalChecklistHistoryEntry[];
  readonly createdByUserId: string;
  readonly createdByDisplayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApplyProposalChecklistInput {
  readonly proposalId: string;
  readonly templateVersionId: string;
  readonly idempotencyKey: string;
}

export interface TransitionProposalChecklistItemInput {
  readonly checklistId: string;
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly targetState: Exclude<ProposalChecklistItemState, 'pending'>;
  readonly documentId?: DocumentReferenceId;
  readonly reason?: string;
  readonly idempotencyKey: string;
}

export interface ProposalChecklistAgendaEntry {
  readonly id: string;
  readonly checklistId: string;
  readonly checklistItemId: string;
  readonly proposalId: string;
  readonly proposalNumber: string;
  readonly proposalTitle: string;
  readonly itemTitle: string;
  readonly dueOn: string;
  readonly state: ProposalChecklistItemState;
  readonly isOverdue: boolean;
}

export interface ProposalChecklistDashboard {
  readonly generatedAt: string;
  readonly templates: readonly ProposalChecklistTemplate[];
  readonly checklists: readonly ProposalDocumentChecklist[];
  readonly agendaEntries: readonly ProposalChecklistAgendaEntry[];
  readonly totals: {
    readonly proposalsWithChecklist: number;
    readonly pending: number;
    readonly received: number;
    readonly inReview: number;
    readonly approved: number;
    readonly rejected: number;
    readonly expired: number;
    readonly overdue: number;
  };
}

export interface ProposalChecklistApplicationContext {
  readonly organizationId: string;
  readonly actor: {
    readonly userId: string;
    readonly displayName?: string;
    readonly role: import('./auth').OrganizationRole;
    readonly isActive: boolean;
    readonly permissions: readonly import('./authorization').Permission[];
  };
  readonly resolveProposalChecklistSource: (
    proposalId: string
  ) => Promise<ProposalChecklistSourceResolution>;
}

export const PROPOSAL_CHECKLIST_STATE_LABELS: Readonly<
  Record<ProposalChecklistItemState, string>
> = Object.freeze({
  pending: 'Pendente',
  received: 'Recebido',
  in_review: 'Em análise',
  approved: 'Aprovado',
  rejected: 'Recusado',
  expired: 'Expirado',
});
