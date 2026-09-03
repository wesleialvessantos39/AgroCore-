import {
  TechnicalVisitDomainError,
  type CreateTechnicalVisitInput,
  type TechnicalVisit,
  type TechnicalVisitActivityType,
  type TechnicalVisitApplicationContext,
  type TechnicalVisitAuditEntry,
  type TechnicalVisitGateway,
  type TechnicalVisitListFilters,
  type TechnicalVisitStatus,
  type TransitionTechnicalVisitInput,
  type UpdateTechnicalVisitInput,
} from '../types/technicalVisit';
import type {
  CompleteTechnicalVisitInput,
  ReviseTechnicalVisitReportInput,
  TechnicalVisitPendingCategory,
  TechnicalVisitPendingItem,
  TechnicalVisitReport,
} from '../types/technicalVisitReport';
import type { TechnicalVisitFieldFormGateway } from '../types/technicalVisitFieldForm';
import { assertTechnicalVisitTransition, isTechnicalVisitTerminal } from './stateMachine';

const ACTIVITY_TYPES: readonly TechnicalVisitActivityType[] = [
  'technical_visit',
  'inspection',
  'appraisal_inspection',
  'credit_visit',
  'document_collection',
  'other',
];

export interface TechnicalVisitClock {
  now(): Date;
}

export interface TechnicalVisitIdGenerator {
  generate(): string;
}

const systemClock: TechnicalVisitClock = {
  now: () => new Date(),
};

const secureIdGenerator: TechnicalVisitIdGenerator = {
  generate: () => {
    if (!globalThis.crypto?.randomUUID) {
      throw new TechnicalVisitDomainError(
        'SERVICE_UNAVAILABLE',
        'Gerador seguro de identificadores indisponível.'
      );
    }
    return globalThis.crypto.randomUUID();
  },
};

export class TechnicalVisitService {
  constructor(
    private readonly gateway: TechnicalVisitGateway,
    private readonly clock: TechnicalVisitClock = systemClock,
    private readonly idGenerator: TechnicalVisitIdGenerator = secureIdGenerator,
    private readonly fieldFormGateway?: TechnicalVisitFieldFormGateway
  ) {}

  async listVisits(
    context: TechnicalVisitApplicationContext,
    filters: TechnicalVisitListFilters = {},
    signal?: AbortSignal
  ): Promise<readonly TechnicalVisit[]> {
    this.assertContext(context);
    this.assertPermission(context, 'surveys_and_visits:view');
    return this.gateway.listVisits(context.organizationId, filters, signal);
  }

  async getVisitById(
    context: TechnicalVisitApplicationContext,
    visitId: string
  ): Promise<TechnicalVisit | null> {
    this.assertContext(context);
    this.assertPermission(context, 'surveys_and_visits:view');
    return this.gateway.getVisitById(context.organizationId, visitId);
  }

  async listAudit(
    context: TechnicalVisitApplicationContext,
    visitId: string
  ): Promise<readonly TechnicalVisitAuditEntry[]> {
    this.assertContext(context);
    this.assertPermission(context, 'surveys_and_visits:view');
    const visit = await this.gateway.getVisitById(context.organizationId, visitId);
    if (!visit) {
      throw new TechnicalVisitDomainError('VISIT_NOT_FOUND', 'Visita não encontrada.');
    }
    return this.gateway.listAudit(context.organizationId, visitId);
  }

  async createVisit(
    context: TechnicalVisitApplicationContext,
    input: CreateTechnicalVisitInput
  ): Promise<TechnicalVisit> {
    this.assertContext(context);
    this.assertPermission(context, 'surveys_and_visits:schedule');

    const normalized = await this.validateVisitData(context, {
      activityType: input.activityType,
      clientId: input.clientId,
      propertyId: input.propertyId ?? null,
      proposalId: input.proposalId ?? null,
      appraisalId: input.appraisalId ?? null,
      responsibleUserId: input.responsibleUserId,
      scheduledFor: input.scheduledFor,
      purpose: input.purpose,
    });

    const now = this.clock.now().toISOString();
    const visit: TechnicalVisit = {
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      activityType: normalized.activityType,
      status: 'planned',
      clientId: normalized.clientId,
      propertyId: normalized.propertyId,
      proposalId: normalized.proposalId,
      appraisalId: normalized.appraisalId,
      responsibleUserId: normalized.responsibleUserId,
      scheduledFor: normalized.scheduledFor,
      preparation: null,
      purpose: normalized.purpose,
      createdByUserId: context.actor.userId,
      createdAt: now,
      updatedByUserId: context.actor.userId,
      updatedAt: now,
      confirmedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      version: 1,
    };

    const audit = this.buildAudit(
      context,
      visit,
      'created',
      null,
      'planned',
      null,
      [
        'activityType',
        'clientId',
        'propertyId',
        'proposalId',
        'appraisalId',
        'responsibleUserId',
        'scheduledFor',
        'purpose',
      ]
    );

    return this.gateway.createVisit({ visit, audit, expectedVersion: null });
  }

  async updateVisit(
    context: TechnicalVisitApplicationContext,
    visitId: string,
    input: UpdateTechnicalVisitInput
  ): Promise<TechnicalVisit> {
    this.assertContext(context);
    this.assertPermission(context, 'surveys_and_visits:schedule');

    const current = await this.requireVisit(context, visitId);
    if (isTechnicalVisitTerminal(current.status) || current.status === 'in_progress') {
      throw new TechnicalVisitDomainError(
        'VISIT_LOCKED',
        'A visita não pode ter seus dados de planejamento alterados nesta situação.'
      );
    }

    if (current.version !== input.expectedVersion) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'A visita foi alterada por outra operação. Recarregue os dados antes de continuar.'
      );
    }

    const reason = this.requireReason(input.changeReason);

    const nextData = await this.validateVisitData(context, {
      activityType: input.activityType ?? current.activityType,
      clientId: input.clientId ?? current.clientId,
      propertyId: input.propertyId === undefined ? current.propertyId : input.propertyId,
      proposalId: input.proposalId === undefined ? current.proposalId : input.proposalId,
      appraisalId: input.appraisalId === undefined ? current.appraisalId : input.appraisalId,
      responsibleUserId: input.responsibleUserId ?? current.responsibleUserId,
      scheduledFor: current.scheduledFor,
      purpose: input.purpose ?? current.purpose,
    });

    const changedFields = this.changedPlanningFields(current, nextData);
    if (changedFields.length === 0) return current;

    const now = this.clock.now().toISOString();
    const next: TechnicalVisit = {
      ...current,
      ...nextData,
      updatedByUserId: context.actor.userId,
      updatedAt: now,
      version: current.version + 1,
    };

    const audit = this.buildAudit(
      context,
      next,
      'updated',
      current.status,
      current.status,
      reason,
      changedFields
    );

    return this.gateway.updateVisit({
      visit: next,
      audit,
      expectedVersion: input.expectedVersion,
    });
  }

  async transitionVisit(
    context: TechnicalVisitApplicationContext,
    visitId: string,
    input: TransitionTechnicalVisitInput
  ): Promise<TechnicalVisit> {
    this.assertContext(context);
    const current = await this.requireVisit(context, visitId);

    if (current.version !== input.expectedVersion) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'A visita foi alterada por outra operação. Recarregue os dados antes de continuar.'
      );
    }

    if (input.targetStatus === 'completed') {
      throw new TechnicalVisitDomainError(
        'REPORT_REQUIRED',
        'Conclua a visita pelo fluxo de relatório final.'
      );
    }

    assertTechnicalVisitTransition(current.status, input.targetStatus);

    if (input.targetStatus === 'confirmed' || input.targetStatus === 'cancelled') {
      this.assertPermission(context, 'surveys_and_visits:schedule');
    } else {
      this.assertPermission(context, 'surveys_and_visits:execute');
      if (current.responsibleUserId !== context.actor.userId) {
        throw new TechnicalVisitDomainError(
          'RESPONSIBLE_MISMATCH',
          'Somente o responsável atual pode registrar a execução desta visita.'
        );
      }

      if (input.targetStatus === 'in_progress') {
        if (!current.preparation) {
          throw new TechnicalVisitDomainError(
            'PREPARATION_REQUIRED',
            'Conclua a preparação operacional antes de iniciar a visita.'
          );
        }

        const pendingRequiredItems = current.preparation.checklist.filter(
          (item) => item.required && !item.completed
        );
        if (pendingRequiredItems.length > 0) {
          throw new TechnicalVisitDomainError(
            'PREPARATION_INCOMPLETE',
            'Conclua os itens obrigatórios do checklist antes de iniciar a visita.'
          );
        }
      }
    }

    const reason =
      input.targetStatus === 'cancelled'
        ? this.requireReason(input.reason)
        : this.normalizeOptionalReason(input.reason);

    const now = this.clock.now().toISOString();
    const next: TechnicalVisit = {
      ...current,
      status: input.targetStatus,
      updatedByUserId: context.actor.userId,
      updatedAt: now,
      confirmedAt: input.targetStatus === 'confirmed' ? now : current.confirmedAt,
      startedAt: input.targetStatus === 'in_progress' ? now : current.startedAt,
      completedAt: input.targetStatus === 'completed' ? now : current.completedAt,
      cancelledAt: input.targetStatus === 'cancelled' ? now : current.cancelledAt,
      cancellationReason:
        input.targetStatus === 'cancelled' ? reason : current.cancellationReason,
      version: current.version + 1,
    };

    const changedFields = ['status'];
    if (input.targetStatus === 'confirmed') changedFields.push('confirmedAt');
    if (input.targetStatus === 'in_progress') changedFields.push('startedAt');
    if (input.targetStatus === 'completed') changedFields.push('completedAt');
    if (input.targetStatus === 'cancelled') {
      changedFields.push('cancelledAt', 'cancellationReason');
    }

    const audit = this.buildAudit(
      context,
      next,
      'status_changed',
      current.status,
      next.status,
      reason,
      changedFields
    );

    return this.gateway.updateVisit({
      visit: next,
      audit,
      expectedVersion: input.expectedVersion,
    });
  }

  async completeVisit(
    context: TechnicalVisitApplicationContext,
    visitId: string,
    input: CompleteTechnicalVisitInput
  ): Promise<import('../types/technicalVisit').TechnicalVisitCompletionResult> {
    this.assertContext(context);
    this.assertPermission(context, 'surveys_and_visits:execute');
    const current = await this.requireVisit(context, visitId);

    if (current.version !== input.expectedVersion) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'A visita foi alterada por outra operação. Recarregue os dados antes de concluir.'
      );
    }
    if (current.status !== 'in_progress') {
      throw new TechnicalVisitDomainError(
        'INVALID_TRANSITION',
        'Somente uma visita em execução pode ser concluída.'
      );
    }
    if (current.responsibleUserId !== context.actor.userId) {
      throw new TechnicalVisitDomainError(
        'RESPONSIBLE_MISMATCH',
        'Somente o responsável atual pode concluir esta visita.'
      );
    }
    if (!this.fieldFormGateway) {
      throw new TechnicalVisitDomainError(
        'SERVICE_UNAVAILABLE',
        'Serviço de formulário de campo indisponível.'
      );
    }

    const fieldForm = await this.fieldFormGateway.getFieldForm(
      context.organizationId,
      visitId
    );
    if (!fieldForm || fieldForm.status !== 'submitted') {
      throw new TechnicalVisitDomainError(
        'FIELD_FORM_INCOMPLETE',
        'Envie o formulário de campo completo antes de concluir a visita.'
      );
    }

    const summary = this.normalizeReportSummary(input.summary);
    const pendingItems = this.normalizePendingItems(input.pendingItems);
    const completedAt = this.clock.now().toISOString();

    return this.gateway.completeVisit({
      organizationId: context.organizationId,
      visitId,
      expectedVersion: input.expectedVersion,
      actorUserId: context.actor.userId,
      completedAt,
      summary,
      pendingItems,
    });
  }

  async getLatestReport(
    context: TechnicalVisitApplicationContext,
    visitId: string
  ): Promise<TechnicalVisitReport | null> {
    this.assertContext(context);
    this.assertPermission(context, 'surveys_and_visits:view');
    const visit = await this.requireVisit(context, visitId);
    this.assertReportAccess(context, visit);
    return this.gateway.getLatestReport(context.organizationId, visitId);
  }

  async listReportVersions(
    context: TechnicalVisitApplicationContext,
    visitId: string
  ): Promise<readonly TechnicalVisitReport[]> {
    this.assertContext(context);
    this.assertPermission(context, 'surveys_and_visits:view');
    const visit = await this.requireVisit(context, visitId);
    this.assertReportAccess(context, visit);
    return this.gateway.listReportVersions(context.organizationId, visitId);
  }

  async reviseReport(
    context: TechnicalVisitApplicationContext,
    visitId: string,
    input: ReviseTechnicalVisitReportInput
  ): Promise<TechnicalVisitReport> {
    this.assertContext(context);
    this.assertPermission(context, 'surveys_and_visits:view');
    const visit = await this.requireVisit(context, visitId);
    this.assertReportAccess(context, visit);
    if (visit.status !== 'completed') {
      throw new TechnicalVisitDomainError(
        'REPORT_LOCKED',
        'O relatório só pode receber nova versão após a conclusão da visita.'
      );
    }

    const summary = this.normalizeReportSummary(input.summary);
    const pendingItems = this.normalizePendingItems(input.pendingItems);
    const reason = this.requireReason(input.reason);

    return this.gateway.reviseReport({
      organizationId: context.organizationId,
      visitId,
      expectedReportVersion: input.expectedReportVersion,
      actorUserId: context.actor.userId,
      issuedAt: this.clock.now().toISOString(),
      summary,
      pendingItems,
      reason,
    });
  }

  private assertReportAccess(
    context: TechnicalVisitApplicationContext,
    visit: TechnicalVisit
  ): void {
    const role = context.actor.role;
    const management =
      role === 'owner' || role === 'company_admin' || role === 'manager';
    const assignedDesigner =
      role === 'project_designer' &&
      visit.responsibleUserId === context.actor.userId;
    if (!management && !assignedDesigner) {
      throw new TechnicalVisitDomainError(
        'PERMISSION_DENIED',
        'Você não possui autorização para consultar o relatório final desta visita.'
      );
    }
  }

  private normalizeReportSummary(summary: string): string {
    const normalized = summary.trim();
    if (normalized.length < 10 || normalized.length > 5000) {
      throw new TechnicalVisitDomainError(
        'REPORT_INVALID',
        'O resumo final deve possuir entre 10 e 5.000 caracteres.'
      );
    }
    return normalized;
  }

  private normalizePendingItems(
    items: readonly TechnicalVisitPendingItem[]
  ): readonly TechnicalVisitPendingItem[] {
    if (items.length > 50) {
      throw new TechnicalVisitDomainError(
        'REPORT_INVALID',
        'O relatório não pode possuir mais de 50 pendências.'
      );
    }
    const categories = new Set<TechnicalVisitPendingCategory>([
      'documentation',
      'property_registry',
      'evidence',
      'technical',
      'other',
    ]);
    const ids = new Set<string>();
    return items.map((item) => {
      const id = item.id.trim();
      const description = item.description.trim();
      if (
        !id ||
        ids.has(id) ||
        !categories.has(item.category) ||
        description.length < 3 ||
        description.length > 1000
      ) {
        throw new TechnicalVisitDomainError(
          'REPORT_INVALID',
          'Revise as pendências informadas no relatório final.'
        );
      }
      ids.add(id);
      return {
        id,
        category: item.category,
        description,
      };
    });
  }

  private async requireVisit(
    context: TechnicalVisitApplicationContext,
    visitId: string
  ): Promise<TechnicalVisit> {
    const visit = await this.gateway.getVisitById(context.organizationId, visitId);
    if (!visit) {
      throw new TechnicalVisitDomainError('VISIT_NOT_FOUND', 'Visita não encontrada.');
    }
    return visit;
  }

  private assertContext(context: TechnicalVisitApplicationContext): void {
    if (!context.organizationId || !context.actor.userId || !context.actor.isActive) {
      throw new TechnicalVisitDomainError(
        'ORGANIZATION_REQUIRED',
        'É necessário possuir vínculo ativo com uma organização.'
      );
    }
  }

  private assertPermission(
    context: TechnicalVisitApplicationContext,
    permission: 'surveys_and_visits:view' | 'surveys_and_visits:schedule' | 'surveys_and_visits:execute'
  ): void {
    if (!context.actor.permissions.includes(permission)) {
      throw new TechnicalVisitDomainError(
        'PERMISSION_DENIED',
        'Você não possui permissão para esta operação.'
      );
    }
  }

  private async validateVisitData(
    context: TechnicalVisitApplicationContext,
    input: {
      readonly activityType: TechnicalVisitActivityType;
      readonly clientId: string;
      readonly propertyId: string | null;
      readonly proposalId: string | null;
      readonly appraisalId: string | null;
      readonly responsibleUserId: string;
      readonly scheduledFor: string;
      readonly purpose: string;
    }
  ): Promise<{
    readonly activityType: TechnicalVisitActivityType;
    readonly clientId: string;
    readonly propertyId: string | null;
    readonly proposalId: string | null;
    readonly appraisalId: string | null;
    readonly responsibleUserId: string;
    readonly scheduledFor: string;
    readonly purpose: string;
  }> {
    if (!ACTIVITY_TYPES.includes(input.activityType)) {
      throw new TechnicalVisitDomainError(
        'INVALID_ACTIVITY_TYPE',
        'Tipo de atividade inválido.'
      );
    }

    const clientId = input.clientId.trim();
    if (!clientId) {
      throw new TechnicalVisitDomainError('CLIENT_NOT_FOUND', 'Cliente não encontrado.');
    }

    const client = await context.resolveClient(clientId);
    if (!client.exists || client.organizationId !== context.organizationId) {
      throw new TechnicalVisitDomainError('CLIENT_NOT_FOUND', 'Cliente não encontrado.');
    }
    if (client.status !== 'active') {
      throw new TechnicalVisitDomainError(
        'CLIENT_INACTIVE',
        'O cliente precisa estar ativo para receber uma nova visita.'
      );
    }

    const responsibleUserId = input.responsibleUserId.trim();
    const responsible = await context.resolveMember(responsibleUserId);
    if (
      !responsible.exists ||
      responsible.organizationId !== context.organizationId
    ) {
      throw new TechnicalVisitDomainError(
        'RESPONSIBLE_NOT_FOUND',
        'Responsável não encontrado na organização.'
      );
    }
    if (!responsible.isActive) {
      throw new TechnicalVisitDomainError(
        'RESPONSIBLE_INACTIVE',
        'Somente integrantes ativos da organização podem ser responsáveis.'
      );
    }
    if (!responsible.canExecute) {
      throw new TechnicalVisitDomainError(
        'RESPONSIBLE_INELIGIBLE',
        'O responsável precisa possuir autorização para executar visitas e vistorias.'
      );
    }

    let propertyId: string | null = input.propertyId?.trim() || null;
    let propertyValidated = false;
    const validateProperty = async (targetPropertyId: string): Promise<void> => {
      const property = await context.resolveProperty(targetPropertyId);
      if (!property.exists || property.organizationId !== context.organizationId) {
        throw new TechnicalVisitDomainError('PROPERTY_NOT_FOUND', 'Imóvel não encontrado.');
      }
      if (property.status !== 'active') {
        throw new TechnicalVisitDomainError(
          'PROPERTY_INACTIVE',
          'O imóvel precisa estar ativo para receber uma nova visita.'
        );
      }
      if (property.clientIds.length > 0 && !property.clientIds.includes(clientId)) {
        throw new TechnicalVisitDomainError(
          'PROPERTY_CLIENT_MISMATCH',
          'O imóvel selecionado não está vinculado ao cliente informado.'
        );
      }
      propertyValidated = true;
    };

    if (propertyId) await validateProperty(propertyId);

    let proposalId: string | null = input.proposalId?.trim() || null;
    if (proposalId) {
      const proposal = await context.resolveProposal(proposalId);
      if (!proposal.exists || proposal.organizationId !== context.organizationId) {
        throw new TechnicalVisitDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
      }
      if (
        proposal.clientId !== clientId ||
        (proposal.propertyId && propertyId && proposal.propertyId !== propertyId)
      ) {
        throw new TechnicalVisitDomainError(
          'PROPOSAL_MISMATCH',
          'A proposta selecionada não corresponde ao cliente e imóvel da visita.'
        );
      }
      if (!propertyId && proposal.propertyId) {
        propertyId = proposal.propertyId;
        await validateProperty(propertyId);
      }
    }

    let appraisalId: string | null = input.appraisalId?.trim() || null;
    if (appraisalId) {
      const appraisal = await context.resolveAppraisal(appraisalId);
      if (!appraisal.exists || appraisal.organizationId !== context.organizationId) {
        throw new TechnicalVisitDomainError('APPRAISAL_NOT_FOUND', 'Laudo não encontrado.');
      }
      if (
        appraisal.clientId !== clientId ||
        (propertyId && appraisal.propertyId !== propertyId)
      ) {
        throw new TechnicalVisitDomainError(
          'APPRAISAL_MISMATCH',
          'O laudo selecionado não corresponde ao cliente e imóvel da visita.'
        );
      }
      if (!propertyId && appraisal.propertyId) {
        propertyId = appraisal.propertyId;
        await validateProperty(propertyId);
      }
    }

    if (propertyId && !propertyValidated) await validateProperty(propertyId);

    const scheduledDate = new Date(input.scheduledFor);
    if (!input.scheduledFor || Number.isNaN(scheduledDate.getTime())) {
      throw new TechnicalVisitDomainError(
        'INVALID_DATE',
        'Informe uma data e hora válidas para a visita.'
      );
    }

    const purpose = input.purpose.trim();
    if (purpose.length < 3 || purpose.length > 500) {
      throw new TechnicalVisitDomainError(
        'INVALID_PURPOSE',
        'A finalidade deve possuir entre 3 e 500 caracteres.'
      );
    }

    return {
      activityType: input.activityType,
      clientId,
      propertyId,
      proposalId,
      appraisalId,
      responsibleUserId,
      scheduledFor: scheduledDate.toISOString(),
      purpose,
    };
  }

  private changedPlanningFields(
    current: TechnicalVisit,
    next: {
      readonly activityType: TechnicalVisitActivityType;
      readonly clientId: string;
      readonly propertyId: string | null;
      readonly proposalId: string | null;
      readonly appraisalId: string | null;
      readonly responsibleUserId: string;
      readonly scheduledFor: string;
      readonly purpose: string;
    }
  ): string[] {
    const fields: Array<keyof typeof next> = [
      'activityType',
      'clientId',
      'propertyId',
      'proposalId',
      'appraisalId',
      'responsibleUserId',
      'scheduledFor',
      'purpose',
    ];
    return fields.filter((field) => current[field] !== next[field]);
  }

  private buildAudit(
    context: TechnicalVisitApplicationContext,
    visit: TechnicalVisit,
    action: TechnicalVisitAuditEntry['action'],
    fromStatus: TechnicalVisitStatus | null,
    toStatus: TechnicalVisitStatus | null,
    reason: string | null,
    changedFields: readonly string[]
  ): TechnicalVisitAuditEntry {
    return {
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      visitId: visit.id,
      action,
      actorUserId: context.actor.userId,
      at: visit.updatedAt,
      version: visit.version,
      fromStatus,
      toStatus,
      reason,
      changedFields: [...changedFields],
    };
  }

  private requireReason(reason?: string): string {
    const normalized = reason?.trim() ?? '';
    if (normalized.length < 3 || normalized.length > 500) {
      throw new TechnicalVisitDomainError(
        'REASON_REQUIRED',
        'Informe um motivo com pelo menos 3 caracteres.'
      );
    }
    return normalized;
  }

  private normalizeOptionalReason(reason?: string): string | null {
    const normalized = reason?.trim() ?? '';
    return normalized ? normalized.slice(0, 500) : null;
  }
}
