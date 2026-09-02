import type { SupabaseClient } from '@supabase/supabase-js';
import { DocumentDomainError } from '../types/documents';
import type {
  ProposalChecklistHistoryEntry,
  ProposalChecklistItem,
  ProposalChecklistTemplate,
  ProposalChecklistTemplateItem,
  ProposalDocumentChecklist,
} from '../types/proposalChecklists';
import type {
  ApplyProposalChecklistRecord,
  ConfigureProposalChecklistTemplateRecord,
  ProposalChecklistGateway,
  TransitionProposalChecklistItemRecord,
} from './proposalChecklistGateway';

interface TemplateRow {
  readonly id: string;
  readonly logical_template_id: string;
  readonly organization_id: string;
  readonly name: string;
  readonly proposal_type: ProposalChecklistTemplate['proposalType'];
  readonly proposal_category: ProposalChecklistTemplate['proposalCategory'];
  readonly status: ProposalChecklistTemplate['status'];
  readonly is_current: boolean;
  readonly version_number: number;
  readonly predecessor_template_version_id: string | null;
  readonly change_reason: string;
  readonly created_by_user_id: string;
  readonly created_by_display_name: string;
  readonly created_at: string;
}

interface TemplateItemRow {
  readonly id: string;
  readonly template_version_id: string;
  readonly title: string;
  readonly category: ProposalChecklistTemplateItem['category'];
  readonly access_scope: ProposalChecklistTemplateItem['accessScope'];
  readonly required: boolean;
  readonly due_in_days: number | null;
  readonly position: number;
}

interface ChecklistRow {
  readonly id: string;
  readonly organization_id: string;
  readonly proposal_id: string;
  readonly proposal_number: string;
  readonly proposal_title: string;
  readonly proposal_type: ProposalDocumentChecklist['proposalType'];
  readonly proposal_category: ProposalDocumentChecklist['proposalCategory'];
  readonly template_logical_id: string;
  readonly template_version_id: string;
  readonly template_version_number: number;
  readonly template_name: string;
  readonly status: ProposalDocumentChecklist['status'];
  readonly version_number: number;
  readonly created_by_user_id: string;
  readonly created_by_display_name: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ChecklistItemRow {
  readonly id: string;
  readonly checklist_id: string;
  readonly template_item_id: string;
  readonly title: string;
  readonly category: ProposalChecklistItem['category'];
  readonly access_scope: ProposalChecklistItem['accessScope'];
  readonly required: boolean;
  readonly position: number;
  readonly due_on: string | null;
  readonly state: ProposalChecklistItem['state'];
  readonly linked_document_id: string | null;
  readonly received_at: string | null;
  readonly reviewed_at: string | null;
  readonly decided_at: string | null;
  readonly decided_by_user_id: string | null;
  readonly decision_reason: string | null;
  readonly version_number: number;
  readonly updated_at: string;
}

interface ChecklistHistoryRow {
  readonly id: string;
  readonly organization_id: string;
  readonly checklist_id: string;
  readonly checklist_item_id: string;
  readonly from_state: ProposalChecklistHistoryEntry['fromState'] | null;
  readonly to_state: ProposalChecklistHistoryEntry['toState'];
  readonly linked_document_id: string | null;
  readonly actor_user_id: string;
  readonly actor_display_name: string;
  readonly reason: string | null;
  readonly occurred_at: string;
  readonly correlation_id: string;
}

const TEMPLATE_COLUMNS = [
  'id',
  'logical_template_id',
  'organization_id',
  'name',
  'proposal_type',
  'proposal_category',
  'status',
  'is_current',
  'version_number',
  'predecessor_template_version_id',
  'change_reason',
  'created_by_user_id',
  'created_by_display_name',
  'created_at',
].join(',');

const TEMPLATE_ITEM_COLUMNS = [
  'id',
  'template_version_id',
  'title',
  'category',
  'access_scope',
  'required',
  'due_in_days',
  'position',
].join(',');

const CHECKLIST_COLUMNS = [
  'id',
  'organization_id',
  'proposal_id',
  'proposal_number',
  'proposal_title',
  'proposal_type',
  'proposal_category',
  'template_logical_id',
  'template_version_id',
  'template_version_number',
  'template_name',
  'status',
  'version_number',
  'created_by_user_id',
  'created_by_display_name',
  'created_at',
  'updated_at',
].join(',');

const CHECKLIST_ITEM_COLUMNS = [
  'id',
  'checklist_id',
  'template_item_id',
  'title',
  'category',
  'access_scope',
  'required',
  'position',
  'due_on',
  'state',
  'linked_document_id',
  'received_at',
  'reviewed_at',
  'decided_at',
  'decided_by_user_id',
  'decision_reason',
  'version_number',
  'updated_at',
].join(',');

const HISTORY_COLUMNS = [
  'id',
  'organization_id',
  'checklist_id',
  'checklist_item_id',
  'from_state',
  'to_state',
  'linked_document_id',
  'actor_user_id',
  'actor_display_name',
  'reason',
  'occurred_at',
  'correlation_id',
].join(',');

function databaseError(error: { readonly message?: string; readonly code?: string } | null): DocumentDomainError {
  const message = error?.message ?? '';
  if (message.includes('AGROCORE_VERSION_CONFLICT')) {
    return new DocumentDomainError('VERSION_CONFLICT', 'O checklist recebeu outra atualização.');
  }
  if (message.includes('AGROCORE_IDEMPOTENCY_CONFLICT')) {
    return new DocumentDomainError('IDEMPOTENCY_CONFLICT', 'A operação já foi usada com informações diferentes.');
  }
  if (message.includes('AGROCORE_TEMPLATE_NOT_FOUND')) {
    return new DocumentDomainError('CHECKLIST_TEMPLATE_NOT_FOUND', 'Modelo de checklist não encontrado.');
  }
  if (message.includes('AGROCORE_TEMPLATE_MISMATCH')) {
    return new DocumentDomainError('CHECKLIST_TEMPLATE_MISMATCH', 'O modelo não corresponde à proposta.');
  }
  if (message.includes('AGROCORE_CHECKLIST_NOT_FOUND')) {
    return new DocumentDomainError('CHECKLIST_NOT_FOUND', 'Checklist da proposta não encontrado.');
  }
  if (message.includes('AGROCORE_ITEM_NOT_FOUND')) {
    return new DocumentDomainError('CHECKLIST_ITEM_NOT_FOUND', 'Requisito do checklist não encontrado.');
  }
  if (message.includes('AGROCORE_CHECKLIST_EXISTS')) {
    return new DocumentDomainError('CHECKLIST_ALREADY_EXISTS', 'A proposta já possui checklist.');
  }
  if (message.includes('AGROCORE_INVALID_TRANSITION')) {
    return new DocumentDomainError('CHECKLIST_TRANSITION_INVALID', 'Mudança de situação não permitida.');
  }
  if (message.includes('AGROCORE_DOCUMENT_MISMATCH')) {
    return new DocumentDomainError('CHECKLIST_DOCUMENT_MISMATCH', 'O documento não atende o requisito.');
  }
  if (message.includes('AGROCORE_DOCUMENT_EXPIRED')) {
    return new DocumentDomainError('DOCUMENT_EXPIRED', 'O documento está expirado.');
  }
  if (message.includes('AGROCORE_FORBIDDEN')) {
    return new DocumentDomainError('FORBIDDEN', 'Operação de checklist não autorizada.');
  }
  if (message.includes('AGROCORE_INVALID_INPUT')) {
    return new DocumentDomainError('INVALID_INPUT', 'As informações do checklist são inválidas.');
  }
  if (message.includes('AGROCORE_INVALID_STATE')) {
    return new DocumentDomainError('INVALID_STATE', 'O checklist não permite esta operação.');
  }
  if (error?.code === '23505' && message.includes('proposal_document_checklists')) {
    return new DocumentDomainError('CHECKLIST_ALREADY_EXISTS', 'A proposta já possui checklist.');
  }
  if (error?.code === '23505' && message.includes('proposal_checklist_template_current_name_idx')) {
    return new DocumentDomainError('INVALID_INPUT', 'Já existe um modelo ativo com esse nome.');
  }
  if (error?.code === '23505') {
    return new DocumentDomainError('VERSION_CONFLICT', 'O checklist recebeu outra atualização.');
  }
  return new DocumentDomainError('SERVICE_UNAVAILABLE', 'Não foi possível acessar os checklists.');
}

function toTemplateItem(row: TemplateItemRow): ProposalChecklistTemplateItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    accessScope: row.access_scope,
    required: row.required,
    dueInDays: row.due_in_days ?? undefined,
    position: row.position,
  };
}

function toTemplate(
  row: TemplateRow,
  items: readonly TemplateItemRow[]
): ProposalChecklistTemplate {
  return {
    id: row.id,
    logicalTemplateId: row.logical_template_id,
    organizationId: row.organization_id,
    name: row.name,
    proposalType: row.proposal_type,
    proposalCategory: row.proposal_category,
    status: row.status,
    isCurrent: row.is_current,
    versionNumber: row.version_number,
    predecessorTemplateVersionId: row.predecessor_template_version_id ?? undefined,
    changeReason: row.change_reason,
    items: items
      .filter((item) => item.template_version_id === row.id)
      .sort((left, right) => left.position - right.position)
      .map(toTemplateItem),
    createdByUserId: row.created_by_user_id,
    createdByDisplayName: row.created_by_display_name,
    createdAt: row.created_at,
  };
}

function toChecklistItem(row: ChecklistItemRow): ProposalChecklistItem {
  return {
    id: row.id,
    checklistId: row.checklist_id,
    templateItemId: row.template_item_id,
    title: row.title,
    category: row.category,
    accessScope: row.access_scope,
    required: row.required,
    position: row.position,
    dueOn: row.due_on ?? undefined,
    state: row.state,
    linkedDocumentId: row.linked_document_id ?? undefined,
    receivedAt: row.received_at ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    decidedAt: row.decided_at ?? undefined,
    decidedByUserId: row.decided_by_user_id ?? undefined,
    decisionReason: row.decision_reason ?? undefined,
    versionNumber: row.version_number,
    updatedAt: row.updated_at,
  };
}

function toHistory(row: ChecklistHistoryRow): ProposalChecklistHistoryEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    checklistId: row.checklist_id,
    checklistItemId: row.checklist_item_id,
    fromState: row.from_state ?? undefined,
    toState: row.to_state,
    linkedDocumentId: row.linked_document_id ?? undefined,
    actorUserId: row.actor_user_id,
    actorDisplayName: row.actor_display_name,
    reason: row.reason ?? undefined,
    occurredAt: row.occurred_at,
    correlationId: row.correlation_id,
  };
}

function toChecklist(
  row: ChecklistRow,
  items: readonly ChecklistItemRow[],
  history: readonly ChecklistHistoryRow[]
): ProposalDocumentChecklist {
  return {
    id: row.id,
    organizationId: row.organization_id,
    proposalId: row.proposal_id,
    proposalNumber: row.proposal_number,
    proposalTitle: row.proposal_title,
    proposalType: row.proposal_type,
    proposalCategory: row.proposal_category,
    templateLogicalId: row.template_logical_id,
    templateVersionId: row.template_version_id,
    templateVersionNumber: row.template_version_number,
    templateName: row.template_name,
    status: row.status,
    versionNumber: row.version_number,
    items: items
      .filter((item) => item.checklist_id === row.id)
      .sort((left, right) => left.position - right.position)
      .map(toChecklistItem),
    history: history
      .filter((entry) => entry.checklist_id === row.id)
      .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at) || left.id.localeCompare(right.id))
      .map(toHistory),
    createdByUserId: row.created_by_user_id,
    createdByDisplayName: row.created_by_display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rpcObject(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export class SupabaseProposalChecklistGateway implements ProposalChecklistGateway {
  constructor(private readonly client: SupabaseClient) {}

  private async templatesFromRows(rows: readonly TemplateRow[]): Promise<readonly ProposalChecklistTemplate[]> {
    if (rows.length === 0) return [];
    const { data, error } = await this.client
      .from('proposal_checklist_template_items')
      .select(TEMPLATE_ITEM_COLUMNS)
      .in('template_version_id', rows.map((row) => row.id))
      .order('position', { ascending: true });
    if (error) throw databaseError(error);
    const items = (data ?? []) as unknown as TemplateItemRow[];
    return rows.map((row) => toTemplate(row, items));
  }

  async listCurrentTemplates(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly ProposalChecklistTemplate[]> {
    let request = this.client
      .from('proposal_checklist_template_versions')
      .select(TEMPLATE_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('is_current', true)
      .eq('status', 'active')
      .order('name', { ascending: true });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw databaseError(error);
    return this.templatesFromRows((data ?? []) as unknown as TemplateRow[]);
  }

  async listTemplateHistory(
    organizationId: string,
    logicalTemplateId: string,
    signal?: AbortSignal
  ): Promise<readonly ProposalChecklistTemplate[]> {
    let request = this.client
      .from('proposal_checklist_template_versions')
      .select(TEMPLATE_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('logical_template_id', logicalTemplateId)
      .order('version_number', { ascending: false });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw databaseError(error);
    return this.templatesFromRows((data ?? []) as unknown as TemplateRow[]);
  }

  async getTemplateByVersionId(
    organizationId: string,
    templateVersionId: string
  ): Promise<ProposalChecklistTemplate | null> {
    const { data, error } = await this.client
      .from('proposal_checklist_template_versions')
      .select(TEMPLATE_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('id', templateVersionId)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) return null;
    return (await this.templatesFromRows([data as unknown as TemplateRow]))[0] ?? null;
  }

  async configureTemplate(
    input: ConfigureProposalChecklistTemplateRecord
  ): Promise<ProposalChecklistTemplate> {
    const { data, error } = await this.client.rpc(
      'agrocore_configure_proposal_checklist_template',
      {
        p_template: rpcObject(input.template),
        p_items: input.template.items.map(rpcObject),
        p_previous_template_version_id: input.previousTemplateVersionId ?? null,
        p_expected_version: input.expectedVersion ?? null,
        p_idempotency_key: input.idempotencyKey,
        p_payload_hash: input.payloadHash,
      }
    );
    if (error) throw databaseError(error);
    const row = (Array.isArray(data) ? data[0] : data) as TemplateRow | null;
    if (!row) throw databaseError(null);
    return (await this.templatesFromRows([row]))[0]!;
  }

  private async checklistsFromRows(rows: readonly ChecklistRow[]): Promise<readonly ProposalDocumentChecklist[]> {
    if (rows.length === 0) return [];
    const checklistIds = rows.map((row) => row.id);
    const [itemsResult, historyResult] = await Promise.all([
      this.client
        .from('proposal_document_checklist_items')
        .select(CHECKLIST_ITEM_COLUMNS)
        .in('checklist_id', checklistIds)
        .order('position', { ascending: true }),
      this.client
        .from('proposal_document_checklist_history')
        .select(HISTORY_COLUMNS)
        .in('checklist_id', checklistIds)
        .order('occurred_at', { ascending: true }),
    ]);
    if (itemsResult.error) throw databaseError(itemsResult.error);
    if (historyResult.error) throw databaseError(historyResult.error);
    const items = (itemsResult.data ?? []) as unknown as ChecklistItemRow[];
    const history = (historyResult.data ?? []) as unknown as ChecklistHistoryRow[];
    return rows.map((row) => toChecklist(row, items, history));
  }

  async listChecklists(
    organizationId: string,
    proposalId?: string,
    signal?: AbortSignal
  ): Promise<readonly ProposalDocumentChecklist[]> {
    let request = this.client
      .from('proposal_document_checklists')
      .select(CHECKLIST_COLUMNS)
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false });
    if (proposalId) request = request.eq('proposal_id', proposalId);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw databaseError(error);
    return this.checklistsFromRows((data ?? []) as unknown as ChecklistRow[]);
  }

  async getChecklistById(
    organizationId: string,
    checklistId: string
  ): Promise<ProposalDocumentChecklist | null> {
    const { data, error } = await this.client
      .from('proposal_document_checklists')
      .select(CHECKLIST_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('id', checklistId)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!data) return null;
    return (await this.checklistsFromRows([data as unknown as ChecklistRow]))[0] ?? null;
  }

  async applyChecklist(input: ApplyProposalChecklistRecord): Promise<ProposalDocumentChecklist> {
    const { data, error } = await this.client.rpc('agrocore_apply_proposal_checklist', {
      p_checklist: rpcObject(input.checklist),
      p_items: input.checklist.items.map(rpcObject),
      p_history: input.checklist.history.map(rpcObject),
      p_authorized_user_ids: [...input.authorizedUserIds],
      p_idempotency_key: input.idempotencyKey,
      p_payload_hash: input.payloadHash,
    });
    if (error) throw databaseError(error);
    const row = (Array.isArray(data) ? data[0] : data) as ChecklistRow | null;
    if (!row) throw databaseError(null);
    return (await this.checklistsFromRows([row]))[0]!;
  }

  async transitionItem(
    input: TransitionProposalChecklistItemRecord
  ): Promise<ProposalDocumentChecklist> {
    const { data, error } = await this.client.rpc(
      'agrocore_transition_proposal_checklist_item',
      {
        p_organization_id: input.organizationId,
        p_checklist_id: input.checklistId,
        p_item: rpcObject(input.item),
        p_history: rpcObject(input.historyEntry),
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_payload_hash: input.payloadHash,
      }
    );
    if (error) throw databaseError(error);
    const row = (Array.isArray(data) ? data[0] : data) as ChecklistRow | null;
    if (!row) throw databaseError(null);
    return (await this.checklistsFromRows([row]))[0]!;
  }
}
