import { ROLE_PERMISSIONS_SET_MAP } from '../authorization/permissionsMatrix';
import type { Permission } from '../types/authorization';
import {
  DocumentDomainError,
  type DocumentReference,
} from '../types/documents';
import type {
  ApplyProposalChecklistInput,
  ConfigureProposalChecklistTemplateInput,
  ProposalChecklistAgendaEntry,
  ProposalChecklistApplicationContext,
  ProposalChecklistDashboard,
  ProposalChecklistHistoryEntry,
  ProposalChecklistItem,
  ProposalChecklistItemState,
  ProposalChecklistSourceResolution,
  ProposalChecklistTemplate,
  ProposalChecklistTemplateItemInput,
  ProposalDocumentChecklist,
  TransitionProposalChecklistItemInput,
} from '../types/proposalChecklists';
import type { ProposalCategory, ProposalType } from '../types/proposals';
import {
  calculateDocumentSha256,
  canonicalDocumentJson,
  type DocumentClock,
  type DocumentIdGenerator,
  SecureDocumentIdGenerator,
  SystemDocumentClock,
} from './crypto';
import { getDocumentReferenceGateway } from './documentGatewayFactory';
import type { DocumentReferenceGateway } from './documentGateway';
import type { ProposalChecklistGateway } from './proposalChecklistGateway';
import { getProposalChecklistGateway } from './proposalChecklistGatewayFactory';

const MANAGEMENT_ROLES = new Set(['owner', 'company_admin', 'manager']);
const PROPOSAL_TYPES: readonly ProposalType[] = [
  'credit',
  'appraisal',
  'technical_project',
  'environmental_regularization',
];
const PROPOSAL_CATEGORIES: readonly ProposalCategory[] = [
  'custeio',
  'investimento',
  'comercializacao',
  'industrializacao',
  'servico_tecnico',
  'outros',
];
const TARGET_STATES: readonly Exclude<ProposalChecklistItemState, 'pending'>[] = [
  'received',
  'in_review',
  'approved',
  'rejected',
  'expired',
];

const TRANSITIONS: Readonly<Record<ProposalChecklistItemState, readonly ProposalChecklistItemState[]>> =
  Object.freeze({
    pending: ['received'],
    received: ['in_review', 'expired'],
    in_review: ['approved', 'rejected', 'expired'],
    approved: ['expired'],
    rejected: ['received'],
    expired: ['received'],
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') {
    throw new DocumentDomainError('INVALID_INPUT', `${field} deve ser informado.`);
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (
    normalized.length < min ||
    normalized.length > max ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    throw new DocumentDomainError('INVALID_INPUT', `${field} possui formato inválido.`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return compactText(value, field, 1, max);
}

function positiveVersion(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new DocumentDomainError('INVALID_INPUT', `${field} inválida.`);
  }
  return value;
}

function idempotencyKey(value: unknown): string {
  const key = compactText(value, 'Chave da operação', 8, 200);
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Chave da operação possui formato inválido.');
  }
  return key;
}

function parseTemplateItem(value: unknown): ProposalChecklistTemplateItemInput {
  if (!isRecord(value)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Requisito do modelo inválido.');
  }
  const category = value.category;
  const accessScope = value.accessScope;
  const validCategories = [
    'registration_certificate',
    'car_receipt',
    'topography_map',
    'descriptive_memorial',
    'technical_report',
    'photo_report',
    'professional_record',
    'commercial_support',
    'other',
  ];
  if (typeof category !== 'string' || !validCategories.includes(category)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Categoria documental inválida.');
  }
  if (
    accessScope !== 'organization' &&
    accessScope !== 'participants' &&
    accessScope !== 'management'
  ) {
    throw new DocumentDomainError('INVALID_INPUT', 'Regra de acesso do requisito inválida.');
  }
  if (typeof value.required !== 'boolean') {
    throw new DocumentDomainError('INVALID_INPUT', 'Obrigatoriedade do requisito inválida.');
  }
  let dueInDays: number | undefined;
  if (value.dueInDays !== undefined && value.dueInDays !== null && value.dueInDays !== '') {
    if (
      typeof value.dueInDays !== 'number' ||
      !Number.isSafeInteger(value.dueInDays) ||
      value.dueInDays < 0 ||
      value.dueInDays > 3650
    ) {
      throw new DocumentDomainError('INVALID_INPUT', 'Prazo do requisito deve estar entre 0 e 3650 dias.');
    }
    dueInDays = value.dueInDays;
  }
  return {
    title: compactText(value.title, 'Nome do requisito', 3, 120),
    category: category as ProposalChecklistTemplateItemInput['category'],
    accessScope,
    required: value.required,
    dueInDays,
  };
}

function parseConfigureInput(value: unknown): ConfigureProposalChecklistTemplateInput {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Configuração do modelo inválida.');
  }
  const proposalType = value.proposalType;
  const proposalCategory = value.proposalCategory;
  if (proposalType !== 'all' && !PROPOSAL_TYPES.includes(proposalType as ProposalType)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Tipo de proposta do modelo inválido.');
  }
  if (
    proposalCategory !== 'all' &&
    !PROPOSAL_CATEGORIES.includes(proposalCategory as ProposalCategory)
  ) {
    throw new DocumentDomainError('INVALID_INPUT', 'Categoria de proposta do modelo inválida.');
  }
  if (value.items.length < 1 || value.items.length > 50) {
    throw new DocumentDomainError('INVALID_INPUT', 'O modelo deve possuir entre 1 e 50 requisitos.');
  }
  const items = value.items.map(parseTemplateItem);
  const uniqueItems = new Set(
    items.map((item) => `${item.category}:${item.title.toLocaleLowerCase('pt-BR')}`)
  );
  if (uniqueItems.size !== items.length) {
    throw new DocumentDomainError('INVALID_INPUT', 'O modelo contém requisitos repetidos.');
  }
  const previousTemplateVersionId = value.previousTemplateVersionId
    ? compactText(value.previousTemplateVersionId, 'Versão anterior do modelo', 1, 160)
    : undefined;
  const expectedVersion = value.expectedVersion === undefined
    ? undefined
    : positiveVersion(value.expectedVersion, 'Versão esperada');
  if (Boolean(previousTemplateVersionId) !== Boolean(expectedVersion)) {
    throw new DocumentDomainError(
      'INVALID_INPUT',
      'A versão anterior e a versão esperada devem ser informadas juntas.'
    );
  }
  return {
    name: compactText(value.name, 'Nome do modelo', 3, 120),
    proposalType: proposalType as ConfigureProposalChecklistTemplateInput['proposalType'],
    proposalCategory: proposalCategory as ConfigureProposalChecklistTemplateInput['proposalCategory'],
    changeReason: compactText(value.changeReason, 'Motivo da configuração', 3, 300),
    items,
    previousTemplateVersionId,
    expectedVersion,
    idempotencyKey: idempotencyKey(value.idempotencyKey),
  };
}

function parseApplyInput(value: unknown): ApplyProposalChecklistInput {
  if (!isRecord(value)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Aplicação do checklist inválida.');
  }
  return {
    proposalId: compactText(value.proposalId, 'Proposta', 1, 160),
    templateVersionId: compactText(value.templateVersionId, 'Modelo de checklist', 1, 160),
    idempotencyKey: idempotencyKey(value.idempotencyKey),
  };
}

function parseTransitionInput(value: unknown): TransitionProposalChecklistItemInput {
  if (!isRecord(value) || !TARGET_STATES.includes(value.targetState as never)) {
    throw new DocumentDomainError('INVALID_INPUT', 'Alteração do requisito inválida.');
  }
  return {
    checklistId: compactText(value.checklistId, 'Checklist', 1, 160),
    itemId: compactText(value.itemId, 'Requisito', 1, 160),
    expectedVersion: positiveVersion(value.expectedVersion, 'Versão esperada'),
    targetState: value.targetState as TransitionProposalChecklistItemInput['targetState'],
    documentId: value.documentId
      ? compactText(value.documentId, 'Documento', 1, 160)
      : undefined,
    reason: optionalText(value.reason, 'Motivo da decisão', 500),
    idempotencyKey: idempotencyKey(value.idempotencyKey),
  };
}

function actorDisplayName(context: ProposalChecklistApplicationContext): string {
  const name = context.actor.displayName?.replace(/\s+/g, ' ').trim();
  return name && name.length >= 3 && name.length <= 120 ? name : 'Integrante da equipe';
}

function addUtcDays(base: Date, days: number): string {
  const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function templateMatches(
  template: ProposalChecklistTemplate,
  source: ProposalChecklistSourceResolution
): boolean {
  return (
    (template.proposalType === 'all' || template.proposalType === source.proposalType) &&
    (template.proposalCategory === 'all' ||
      template.proposalCategory === source.proposalCategory)
  );
}

function cloneTemplate(template: ProposalChecklistTemplate): ProposalChecklistTemplate {
  return structuredClone(template);
}

function cloneChecklist(checklist: ProposalDocumentChecklist): ProposalDocumentChecklist {
  return structuredClone(checklist);
}

function projectChecklistForParticipant(
  checklist: ProposalDocumentChecklist
): ProposalDocumentChecklist | null {
  const items = checklist.items
    .filter((item) => item.accessScope !== 'management')
    .map((item) => structuredClone(item));
  if (items.length === 0) return null;
  const visibleItemIds = new Set(items.map((item) => item.id));
  const requiredItems = items.filter((item) => item.required);
  return {
    ...structuredClone(checklist),
    status:
      requiredItems.length > 0 && requiredItems.every((item) => item.state === 'approved')
        ? 'completed'
        : 'active',
    items,
    history: checklist.history
      .filter((entry) => visibleItemIds.has(entry.checklistItemId))
      .map((entry) => structuredClone(entry)),
  };
}

export class ProposalChecklistApplicationService {
  constructor(
    private readonly gateway: ProposalChecklistGateway = getProposalChecklistGateway(),
    private readonly documentGateway: DocumentReferenceGateway = getDocumentReferenceGateway(),
    private readonly clock: DocumentClock = SystemDocumentClock,
    private readonly idGenerator: DocumentIdGenerator = SecureDocumentIdGenerator
  ) {}

  private assertPermission(
    context: ProposalChecklistApplicationContext,
    permission: Permission
  ): void {
    if (!context.organizationId || !context.actor.userId) {
      throw new DocumentDomainError('UNAUTHENTICATED', 'Sessão organizacional inválida.');
    }
    if (!context.actor.isActive || context.actor.role === 'none') {
      throw new DocumentDomainError('INACTIVE_MEMBERSHIP', 'Vínculo organizacional inativo.');
    }
    const canonical = ROLE_PERMISSIONS_SET_MAP.get(context.actor.role);
    if (!canonical?.has(permission) || !context.actor.permissions.includes(permission)) {
      throw new DocumentDomainError('FORBIDDEN', 'Operação de checklist não autorizada.');
    }
  }

  private isManagement(context: ProposalChecklistApplicationContext): boolean {
    return MANAGEMENT_ROLES.has(context.actor.role);
  }

  private async source(
    context: ProposalChecklistApplicationContext,
    proposalId: string
  ): Promise<ProposalChecklistSourceResolution> {
    const source = await context.resolveProposalChecklistSource(proposalId);
    if (!source.exists) {
      throw new DocumentDomainError('OWNER_NOT_FOUND', 'Proposta não encontrada.');
    }
    if (source.organizationId !== context.organizationId) {
      throw new DocumentDomainError(
        'OWNER_ORGANIZATION_MISMATCH',
        'A proposta não pertence à organização ativa.'
      );
    }
    if (
      !source.proposalNumber ||
      !source.title ||
      !source.proposalType ||
      !source.proposalCategory
    ) {
      throw new DocumentDomainError('INVALID_STATE', 'A proposta não possui classificação completa.');
    }
    return source;
  }

  private canAccessSource(
    context: ProposalChecklistApplicationContext,
    source: ProposalChecklistSourceResolution
  ): boolean {
    return this.isManagement(context) || source.authorizedUserIds.includes(context.actor.userId);
  }

  async listTemplateHistory(
    context: ProposalChecklistApplicationContext,
    logicalTemplateId: string,
    signal?: AbortSignal
  ): Promise<readonly ProposalChecklistTemplate[]> {
    this.assertPermission(context, 'documents:manage_requirements');
    if (!this.isManagement(context)) {
      throw new DocumentDomainError('FORBIDDEN', 'Somente a gestão consulta versões de modelos.');
    }
    const id = compactText(logicalTemplateId, 'Modelo de checklist', 1, 160);
    const result = await this.gateway.listTemplateHistory(context.organizationId, id, signal);
    return result.map(cloneTemplate);
  }

  async getDashboard(
    context: ProposalChecklistApplicationContext,
    signal?: AbortSignal
  ): Promise<ProposalChecklistDashboard> {
    this.assertPermission(context, 'documents:view_requirements');
    const [templates, allChecklists] = await Promise.all([
      this.isManagement(context)
        ? this.gateway.listCurrentTemplates(context.organizationId, signal)
        : Promise.resolve([]),
      this.gateway.listChecklists(context.organizationId, undefined, signal),
    ]);
    const visibility = await Promise.all(
      allChecklists.map(async (checklist) => ({
        checklist,
        source: await context.resolveProposalChecklistSource(checklist.proposalId),
      }))
    );
    const visibleChecklists = visibility.flatMap(({ checklist, source }) => {
      if (
        !source.exists ||
        source.organizationId !== context.organizationId ||
        !this.canAccessSource(context, source)
      ) {
        return [];
      }
      if (this.isManagement(context)) return [cloneChecklist(checklist)];
      const projected = projectChecklistForParticipant(checklist);
      return projected ? [projected] : [];
    });
    const now = this.clock.now();
    const today = todayUtc(now);
    const linkedDocumentIds = [...new Set(
      visibleChecklists.flatMap((checklist) =>
        checklist.items.flatMap((item) => item.linkedDocumentId ? [item.linkedDocumentId] : [])
      )
    )];
    const linkedDocuments = await Promise.all(
      linkedDocumentIds.map((documentId) =>
        this.documentGateway.getReferenceById(context.organizationId, documentId)
      )
    );
    const documentById = new Map(
      linkedDocuments.flatMap((document) => document ? [[document.id, document] as const] : [])
    );
    const checklists = visibleChecklists.map((checklist) => {
      const items = checklist.items.map((item) => {
        const document = item.linkedDocumentId
          ? documentById.get(item.linkedDocumentId)
          : undefined;
        if (
          item.state !== 'expired' &&
          document?.expiresOn &&
          document.expiresOn < today
        ) {
          return {
            ...item,
            effectiveState: 'expired' as const,
            effectiveStateReason: 'A validade do documento vinculado terminou.',
          };
        }
        return structuredClone(item);
      });
      const required = items.filter((item) => item.required);
      return {
        ...checklist,
        items,
        status:
          required.length > 0 &&
          required.every((item) => (item.effectiveState ?? item.state) === 'approved')
            ? 'completed' as const
            : 'active' as const,
      };
    });
    const agendaEntries: ProposalChecklistAgendaEntry[] = [];
    for (const checklist of checklists) {
      for (const item of checklist.items) {
        if (
          item.dueOn &&
          ['pending', 'received', 'in_review', 'rejected', 'expired'].includes(
            item.effectiveState ?? item.state
          )
        ) {
          agendaEntries.push({
            id: `document-checklist:${checklist.id}:${item.id}`,
            checklistId: checklist.id,
            checklistItemId: item.id,
            proposalId: checklist.proposalId,
            proposalNumber: checklist.proposalNumber,
            proposalTitle: checklist.proposalTitle,
            itemTitle: item.title,
            dueOn: item.dueOn,
            state: item.effectiveState ?? item.state,
            isOverdue: item.dueOn < today,
          });
        }
      }
    }
    agendaEntries.sort(
      (left, right) => left.dueOn.localeCompare(right.dueOn) || left.id.localeCompare(right.id)
    );
    const items = checklists.flatMap((checklist) => checklist.items);
    const count = (state: ProposalChecklistItemState) =>
      items.filter((item) => (item.effectiveState ?? item.state) === state).length;
    return {
      generatedAt: now.toISOString(),
      templates: templates.map(cloneTemplate),
      checklists,
      agendaEntries,
      totals: {
        proposalsWithChecklist: checklists.length,
        pending: count('pending'),
        received: count('received'),
        inReview: count('in_review'),
        approved: count('approved'),
        rejected: count('rejected'),
        expired: count('expired'),
        overdue: agendaEntries.filter((entry) => entry.isOverdue).length,
      },
    };
  }

  async configureTemplate(
    context: ProposalChecklistApplicationContext,
    command: unknown
  ): Promise<ProposalChecklistTemplate> {
    this.assertPermission(context, 'documents:manage_requirements');
    if (!this.isManagement(context)) {
      throw new DocumentDomainError('FORBIDDEN', 'Somente a gestão configura modelos.');
    }
    const input = parseConfigureInput(command);
    const now = this.clock.now().toISOString();
    const payloadHash = await calculateDocumentSha256(
      canonicalDocumentJson({ organizationId: context.organizationId, ...input })
    );

    let previous: ProposalChecklistTemplate | null = null;
    if (input.previousTemplateVersionId) {
      previous = await this.gateway.getTemplateByVersionId(
        context.organizationId,
        input.previousTemplateVersionId
      );
      if (!previous) {
        throw new DocumentDomainError(
          'CHECKLIST_TEMPLATE_NOT_FOUND',
          'Modelo de checklist não encontrado.'
        );
      }
    }

    if (previous && !previous.isCurrent) {
      const history = await this.gateway.listTemplateHistory(
        context.organizationId,
        previous.logicalTemplateId
      );
      const successor = history.find(
        (candidate) =>
          candidate.predecessorTemplateVersionId === previous?.id &&
          candidate.versionNumber === (input.expectedVersion ?? 0) + 1
      );
      if (successor) {
        return this.gateway.configureTemplate({
          template: successor,
          previousTemplateVersionId: input.previousTemplateVersionId,
          expectedVersion: input.expectedVersion,
          actorUserId: context.actor.userId,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
        });
      }
      throw new DocumentDomainError('VERSION_CONFLICT', 'O modelo recebeu outra atualização.');
    }
    if (previous && previous.versionNumber !== input.expectedVersion) {
      throw new DocumentDomainError('VERSION_CONFLICT', 'O modelo recebeu outra atualização.');
    }

    const templateVersionId = this.idGenerator.generate();
    const logicalTemplateId = previous?.logicalTemplateId ?? templateVersionId;
    const template: ProposalChecklistTemplate = {
      id: templateVersionId,
      logicalTemplateId,
      organizationId: context.organizationId,
      name: input.name,
      proposalType: input.proposalType,
      proposalCategory: input.proposalCategory,
      status: 'active',
      isCurrent: true,
      versionNumber: previous ? previous.versionNumber + 1 : 1,
      predecessorTemplateVersionId: previous?.id,
      changeReason: input.changeReason,
      items: input.items.map((item, position) => ({
        ...item,
        id: this.idGenerator.generate(),
        position: position + 1,
      })),
      createdByUserId: context.actor.userId,
      createdByDisplayName: actorDisplayName(context),
      createdAt: now,
    };
    return cloneTemplate(
      await this.gateway.configureTemplate({
        template,
        previousTemplateVersionId: input.previousTemplateVersionId,
        expectedVersion: input.expectedVersion,
        actorUserId: context.actor.userId,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
      })
    );
  }

  async applyChecklist(
    context: ProposalChecklistApplicationContext,
    command: unknown
  ): Promise<ProposalDocumentChecklist> {
    this.assertPermission(context, 'documents:manage_requirements');
    if (!this.isManagement(context)) {
      throw new DocumentDomainError('FORBIDDEN', 'Somente a gestão aplica modelos às propostas.');
    }
    const input = parseApplyInput(command);
    const source = await this.source(context, input.proposalId);
    const template = await this.gateway.getTemplateByVersionId(
      context.organizationId,
      input.templateVersionId
    );
    if (!template || !template.isCurrent || template.status !== 'active') {
      throw new DocumentDomainError(
        'CHECKLIST_TEMPLATE_NOT_FOUND',
        'Modelo ativo de checklist não encontrado.'
      );
    }
    if (!templateMatches(template, source)) {
      throw new DocumentDomainError(
        'CHECKLIST_TEMPLATE_MISMATCH',
        'O modelo não corresponde ao tipo e à categoria da proposta.'
      );
    }
    const payloadHash = await calculateDocumentSha256(
      canonicalDocumentJson({ organizationId: context.organizationId, ...input })
    );
    const existing = (await this.gateway.listChecklists(
      context.organizationId,
      input.proposalId
    ))[0];
    if (existing) {
      return this.gateway.applyChecklist({
        checklist: existing,
        authorizedUserIds: source.authorizedUserIds,
        actorUserId: context.actor.userId,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
      });
    }

    const nowDate = this.clock.now();
    const now = nowDate.toISOString();
    const checklistId = this.idGenerator.generate();
    const items: ProposalChecklistItem[] = template.items.map((templateItem) => ({
      id: this.idGenerator.generate(),
      checklistId,
      templateItemId: templateItem.id,
      title: templateItem.title,
      category: templateItem.category,
      accessScope: templateItem.accessScope,
      required: templateItem.required,
      position: templateItem.position,
      dueOn:
        templateItem.dueInDays === undefined
          ? undefined
          : addUtcDays(nowDate, templateItem.dueInDays),
      state: 'pending',
      versionNumber: 1,
      updatedAt: now,
    }));
    const history: ProposalChecklistHistoryEntry[] = items.map((item) => ({
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      checklistId,
      checklistItemId: item.id,
      toState: 'pending',
      actorUserId: context.actor.userId,
      actorDisplayName: actorDisplayName(context),
      occurredAt: now,
      correlationId: input.idempotencyKey,
    }));
    const checklist: ProposalDocumentChecklist = {
      id: checklistId,
      organizationId: context.organizationId,
      proposalId: input.proposalId,
      proposalNumber: source.proposalNumber!,
      proposalTitle: source.title!,
      proposalType: source.proposalType!,
      proposalCategory: source.proposalCategory!,
      templateLogicalId: template.logicalTemplateId,
      templateVersionId: template.id,
      templateVersionNumber: template.versionNumber,
      templateName: template.name,
      status: 'active',
      versionNumber: 1,
      items,
      history,
      createdByUserId: context.actor.userId,
      createdByDisplayName: actorDisplayName(context),
      createdAt: now,
      updatedAt: now,
    };
    return cloneChecklist(
      await this.gateway.applyChecklist({
        checklist,
        authorizedUserIds: [...new Set(source.authorizedUserIds)],
        actorUserId: context.actor.userId,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
      })
    );
  }

  private async checklistAndSource(
    context: ProposalChecklistApplicationContext,
    checklistId: string
  ): Promise<{
    readonly checklist: ProposalDocumentChecklist;
    readonly source: ProposalChecklistSourceResolution;
  }> {
    const checklist = await this.gateway.getChecklistById(context.organizationId, checklistId);
    if (!checklist) {
      throw new DocumentDomainError('CHECKLIST_NOT_FOUND', 'Checklist da proposta não encontrado.');
    }
    const source = await this.source(context, checklist.proposalId);
    if (!this.canAccessSource(context, source)) {
      throw new DocumentDomainError('FORBIDDEN', 'Checklist fora do escopo autorizado.');
    }
    return { checklist, source };
  }

  private async validateReceivedDocument(
    context: ProposalChecklistApplicationContext,
    checklist: ProposalDocumentChecklist,
    item: ProposalChecklistItem,
    documentId: string
  ): Promise<DocumentReference> {
    const document = await this.documentGateway.getReferenceById(
      context.organizationId,
      documentId
    );
    if (
      !document ||
      !document.isCurrent ||
      document.status !== 'active' ||
      document.logicalOwnerType !== 'proposal' ||
      document.logicalOwnerId !== checklist.proposalId ||
      document.category !== item.category
    ) {
      throw new DocumentDomainError(
        'CHECKLIST_DOCUMENT_MISMATCH',
        'O documento selecionado não atende este requisito.'
      );
    }
    if (document.expiresOn && document.expiresOn < todayUtc(this.clock.now())) {
      throw new DocumentDomainError(
        'DOCUMENT_EXPIRED',
        'Um documento expirado não pode ser recebido.'
      );
    }
    return document;
  }

  async transitionItem(
    context: ProposalChecklistApplicationContext,
    command: unknown
  ): Promise<ProposalDocumentChecklist> {
    const input = parseTransitionInput(command);
    const { checklist, source } = await this.checklistAndSource(context, input.checklistId);
    const current = checklist.items.find((item) => item.id === input.itemId);
    if (!current) {
      throw new DocumentDomainError('CHECKLIST_ITEM_NOT_FOUND', 'Requisito do checklist não encontrado.');
    }
    const payloadHash = await calculateDocumentSha256(
      canonicalDocumentJson({ organizationId: context.organizationId, ...input })
    );

    const isPotentialReplay =
      current.state === input.targetState &&
      current.versionNumber === input.expectedVersion + 1 &&
      (!input.documentId || current.linkedDocumentId === input.documentId);
    if (isPotentialReplay) {
      const previousHistory = [...checklist.history]
        .reverse()
        .find(
          (entry) =>
            entry.checklistItemId === current.id && entry.toState === input.targetState
        );
      if (previousHistory) {
        return this.gateway.transitionItem({
          organizationId: context.organizationId,
          checklistId: checklist.id,
          item: current,
          historyEntry: previousHistory,
          expectedVersion: input.expectedVersion,
          actorUserId: context.actor.userId,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
        });
      }
    }

    if (current.versionNumber !== input.expectedVersion) {
      throw new DocumentDomainError('VERSION_CONFLICT', 'O requisito recebeu outra atualização.');
    }
    if (!this.isManagement(context) && current.accessScope === 'management') {
      throw new DocumentDomainError('FORBIDDEN', 'Requisito restrito à gestão.');
    }
    if (!TRANSITIONS[current.state].includes(input.targetState)) {
      throw new DocumentDomainError(
        'CHECKLIST_TRANSITION_INVALID',
        'A mudança de situação não é permitida.'
      );
    }

    if (input.targetState === 'received') {
      this.assertPermission(context, 'documents:fulfill_requirements');
      if (
        !this.isManagement(context) &&
        (current.accessScope === 'management' ||
          !source.authorizedUserIds.includes(context.actor.userId))
      ) {
        throw new DocumentDomainError('FORBIDDEN', 'Requisito fora do escopo autorizado.');
      }
    } else {
      this.assertPermission(context, 'documents:review_requirements');
      if (!this.isManagement(context) && !source.authorizedUserIds.includes(context.actor.userId)) {
        throw new DocumentDomainError('FORBIDDEN', 'Análise fora do escopo autorizado.');
      }
    }

    let linkedDocumentId = current.linkedDocumentId;
    if (input.targetState === 'received') {
      if (!input.documentId) {
        throw new DocumentDomainError('INVALID_INPUT', 'Selecione o documento recebido.');
      }
      await this.validateReceivedDocument(context, checklist, current, input.documentId);
      linkedDocumentId = input.documentId;
    } else if (!linkedDocumentId) {
      throw new DocumentDomainError(
        'CHECKLIST_DOCUMENT_MISMATCH',
        'O requisito ainda não possui documento recebido.'
      );
    }

    if (input.targetState === 'rejected' && (!input.reason || input.reason.length < 3)) {
      throw new DocumentDomainError('INVALID_INPUT', 'Informe o motivo da recusa.');
    }
    if (input.targetState === 'expired') {
      const document = await this.documentGateway.getReferenceById(
        context.organizationId,
        linkedDocumentId!
      );
      if (!document?.expiresOn || document.expiresOn >= todayUtc(this.clock.now())) {
        throw new DocumentDomainError(
          'CHECKLIST_TRANSITION_INVALID',
          'O documento ainda não está expirado.'
        );
      }
    }

    const now = this.clock.now().toISOString();
    const decisionReason =
      input.targetState === 'expired'
        ? input.reason ?? 'Validade documental encerrada.'
        : input.reason;
    const updated: ProposalChecklistItem = {
      ...current,
      state: input.targetState,
      linkedDocumentId,
      receivedAt: input.targetState === 'received' ? now : current.receivedAt,
      reviewedAt:
        input.targetState === 'received'
          ? undefined
          : input.targetState === 'in_review'
            ? now
            : current.reviewedAt,
      decidedAt: ['approved', 'rejected', 'expired'].includes(input.targetState)
        ? now
        : undefined,
      decidedByUserId: ['approved', 'rejected', 'expired'].includes(input.targetState)
        ? context.actor.userId
        : undefined,
      decisionReason,
      versionNumber: current.versionNumber + 1,
      updatedAt: now,
    };
    const historyEntry: ProposalChecklistHistoryEntry = {
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      checklistId: checklist.id,
      checklistItemId: current.id,
      fromState: current.state,
      toState: input.targetState,
      linkedDocumentId,
      actorUserId: context.actor.userId,
      actorDisplayName: actorDisplayName(context),
      reason: decisionReason,
      occurredAt: now,
      correlationId: input.idempotencyKey,
    };
    return cloneChecklist(
      await this.gateway.transitionItem({
        organizationId: context.organizationId,
        checklistId: checklist.id,
        item: updated,
        historyEntry,
        expectedVersion: input.expectedVersion,
        actorUserId: context.actor.userId,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
      })
    );
  }
}
