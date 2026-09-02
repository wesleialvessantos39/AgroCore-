import { DocumentDomainError } from '../../types/documents';
import type {
  ProposalChecklistTemplate,
  ProposalDocumentChecklist,
} from '../../types/proposalChecklists';
import type {
  ApplyProposalChecklistRecord,
  ConfigureProposalChecklistTemplateRecord,
  ProposalChecklistGateway,
  TransitionProposalChecklistItemRecord,
} from '../proposalChecklistGateway';

interface OperationReceipt {
  readonly actorUserId: string;
  readonly payloadHash: string;
  readonly result: ProposalChecklistTemplate | ProposalDocumentChecklist;
}

function cloneTemplate(template: ProposalChecklistTemplate): ProposalChecklistTemplate {
  return structuredClone(template);
}

function cloneChecklist(checklist: ProposalDocumentChecklist): ProposalDocumentChecklist {
  return structuredClone(checklist);
}

/** Fonte volátil, vazia e isolada usada somente no ambiente de desenvolvimento. */
export class PreviewProposalChecklistGateway implements ProposalChecklistGateway {
  private readonly templatesByOrganization = new Map<
    string,
    Map<string, ProposalChecklistTemplate>
  >();

  private readonly checklistsByOrganization = new Map<
    string,
    Map<string, ProposalDocumentChecklist>
  >();

  private readonly receipts = new Map<string, OperationReceipt>();

  private templateStore(organizationId: string): Map<string, ProposalChecklistTemplate> {
    const current = this.templatesByOrganization.get(organizationId);
    if (current) return current;
    const created = new Map<string, ProposalChecklistTemplate>();
    this.templatesByOrganization.set(organizationId, created);
    return created;
  }

  private checklistStore(organizationId: string): Map<string, ProposalDocumentChecklist> {
    const current = this.checklistsByOrganization.get(organizationId);
    if (current) return current;
    const created = new Map<string, ProposalDocumentChecklist>();
    this.checklistsByOrganization.set(organizationId, created);
    return created;
  }

  private replay<T extends ProposalChecklistTemplate | ProposalDocumentChecklist>(
    organizationId: string,
    operation: string,
    actorUserId: string,
    idempotencyKey: string,
    payloadHash: string
  ): T | null {
    const receipt = this.receipts.get(`${organizationId}:${operation}:${idempotencyKey}`);
    if (!receipt) return null;
    if (receipt.actorUserId !== actorUserId) {
      throw new DocumentDomainError('FORBIDDEN', 'A operação pertence a outro integrante.');
    }
    if (receipt.payloadHash !== payloadHash) {
      throw new DocumentDomainError(
        'IDEMPOTENCY_CONFLICT',
        'A operação já foi utilizada com informações diferentes.'
      );
    }
    return structuredClone(receipt.result) as T;
  }

  private remember(
    organizationId: string,
    operation: string,
    actorUserId: string,
    idempotencyKey: string,
    payloadHash: string,
    result: ProposalChecklistTemplate | ProposalDocumentChecklist
  ): void {
    this.receipts.set(`${organizationId}:${operation}:${idempotencyKey}`, {
      actorUserId,
      payloadHash,
      result: structuredClone(result),
    });
  }

  async listCurrentTemplates(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly ProposalChecklistTemplate[]> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const templates = [...this.templateStore(organizationId).values()]
      .filter((template) => template.isCurrent && template.status === 'active')
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return templates.map(cloneTemplate);
  }

  async listTemplateHistory(
    organizationId: string,
    logicalTemplateId: string,
    signal?: AbortSignal
  ): Promise<readonly ProposalChecklistTemplate[]> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const templates = [...this.templateStore(organizationId).values()]
      .filter((template) => template.logicalTemplateId === logicalTemplateId)
      .sort((left, right) => right.versionNumber - left.versionNumber);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return templates.map(cloneTemplate);
  }

  async getTemplateByVersionId(
    organizationId: string,
    templateVersionId: string
  ): Promise<ProposalChecklistTemplate | null> {
    const template = this.templateStore(organizationId).get(templateVersionId);
    return template ? cloneTemplate(template) : null;
  }

  async configureTemplate(
    input: ConfigureProposalChecklistTemplateRecord
  ): Promise<ProposalChecklistTemplate> {
    const organizationId = input.template.organizationId;
    const replay = this.replay<ProposalChecklistTemplate>(
      organizationId,
      'configure-template',
      input.actorUserId,
      input.idempotencyKey,
      input.payloadHash
    );
    if (replay) return replay;

    const store = this.templateStore(organizationId);
    if (input.previousTemplateVersionId) {
      const previous = store.get(input.previousTemplateVersionId);
      if (!previous) {
        throw new DocumentDomainError(
          'CHECKLIST_TEMPLATE_NOT_FOUND',
          'Modelo de checklist não encontrado.'
        );
      }
      if (
        !previous.isCurrent ||
        previous.versionNumber !== input.expectedVersion ||
        input.template.logicalTemplateId !== previous.logicalTemplateId ||
        input.template.versionNumber !== previous.versionNumber + 1 ||
        input.template.predecessorTemplateVersionId !== previous.id
      ) {
        throw new DocumentDomainError(
          'VERSION_CONFLICT',
          'O modelo de checklist foi alterado por outra operação.'
        );
      }
      store.set(previous.id, Object.freeze(cloneTemplate({ ...previous, isCurrent: false })));
    } else if (
      input.template.id !== input.template.logicalTemplateId ||
      input.template.versionNumber !== 1 ||
      input.template.predecessorTemplateVersionId
    ) {
      throw new DocumentDomainError('INVALID_STATE', 'A versão inicial do modelo é inválida.');
    }

    const duplicateName = [...store.values()].find(
      (candidate) =>
        candidate.isCurrent &&
        candidate.logicalTemplateId !== input.template.logicalTemplateId &&
        candidate.name.localeCompare(input.template.name, 'pt-BR', { sensitivity: 'base' }) === 0
    );
    if (duplicateName) {
      throw new DocumentDomainError(
        'INVALID_INPUT',
        'Já existe um modelo ativo com esse nome.'
      );
    }

    store.set(input.template.id, Object.freeze(cloneTemplate(input.template)));
    this.remember(
      organizationId,
      'configure-template',
      input.actorUserId,
      input.idempotencyKey,
      input.payloadHash,
      input.template
    );
    return cloneTemplate(input.template);
  }

  async listChecklists(
    organizationId: string,
    proposalId?: string,
    signal?: AbortSignal
  ): Promise<readonly ProposalDocumentChecklist[]> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const checklists = [...this.checklistStore(organizationId).values()]
      .filter((checklist) => !proposalId || checklist.proposalId === proposalId)
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
      );
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return checklists.map(cloneChecklist);
  }

  async getChecklistById(
    organizationId: string,
    checklistId: string
  ): Promise<ProposalDocumentChecklist | null> {
    const checklist = this.checklistStore(organizationId).get(checklistId);
    return checklist ? cloneChecklist(checklist) : null;
  }

  async applyChecklist(
    input: ApplyProposalChecklistRecord
  ): Promise<ProposalDocumentChecklist> {
    const { checklist } = input;
    const replay = this.replay<ProposalDocumentChecklist>(
      checklist.organizationId,
      'apply-checklist',
      input.actorUserId,
      input.idempotencyKey,
      input.payloadHash
    );
    if (replay) return replay;

    const store = this.checklistStore(checklist.organizationId);
    if ([...store.values()].some((candidate) => candidate.proposalId === checklist.proposalId)) {
      throw new DocumentDomainError(
        'CHECKLIST_ALREADY_EXISTS',
        'A proposta já possui um checklist documental.'
      );
    }
    store.set(checklist.id, Object.freeze(cloneChecklist(checklist)));
    this.remember(
      checklist.organizationId,
      'apply-checklist',
      input.actorUserId,
      input.idempotencyKey,
      input.payloadHash,
      checklist
    );
    return cloneChecklist(checklist);
  }

  async transitionItem(
    input: TransitionProposalChecklistItemRecord
  ): Promise<ProposalDocumentChecklist> {
    const replay = this.replay<ProposalDocumentChecklist>(
      input.organizationId,
      'transition-item',
      input.actorUserId,
      input.idempotencyKey,
      input.payloadHash
    );
    if (replay) return replay;

    const store = this.checklistStore(input.organizationId);
    const checklist = store.get(input.checklistId);
    if (!checklist) {
      throw new DocumentDomainError('CHECKLIST_NOT_FOUND', 'Checklist da proposta não encontrado.');
    }
    const itemIndex = checklist.items.findIndex((item) => item.id === input.item.id);
    if (itemIndex < 0) {
      throw new DocumentDomainError('CHECKLIST_ITEM_NOT_FOUND', 'Requisito do checklist não encontrado.');
    }
    const current = checklist.items[itemIndex];
    if (current.versionNumber !== input.expectedVersion) {
      throw new DocumentDomainError(
        'VERSION_CONFLICT',
        'O requisito foi alterado por outra operação.'
      );
    }
    if (input.item.versionNumber !== current.versionNumber + 1) {
      throw new DocumentDomainError('INVALID_STATE', 'A nova versão do requisito é inválida.');
    }

    const items = checklist.items.map((item, index) =>
      index === itemIndex ? structuredClone(input.item) : structuredClone(item)
    );
    const completed = items
      .filter((item) => item.required)
      .every((item) => item.state === 'approved');
    const updated: ProposalDocumentChecklist = {
      ...checklist,
      status: completed ? 'completed' : 'active',
      versionNumber: checklist.versionNumber + 1,
      items,
      history: [...checklist.history.map((entry) => structuredClone(entry)), input.historyEntry],
      updatedAt: input.historyEntry.occurredAt,
    };
    store.set(updated.id, Object.freeze(cloneChecklist(updated)));
    this.remember(
      input.organizationId,
      'transition-item',
      input.actorUserId,
      input.idempotencyKey,
      input.payloadHash,
      updated
    );
    return cloneChecklist(updated);
  }

  clearAllSessionData(): void {
    this.templatesByOrganization.clear();
    this.checklistsByOrganization.clear();
    this.receipts.clear();
  }
}
