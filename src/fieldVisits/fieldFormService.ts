import {
  TechnicalVisitDomainError,
  type TechnicalVisitApplicationContext,
  type TechnicalVisitGateway,
} from '../types/technicalVisit';
import type {
  TechnicalVisitFieldForm,
  TechnicalVisitFieldFormGateway,
  TechnicalVisitFieldFormRevision,
  TechnicalVisitFieldSection,
} from '../types/technicalVisitFieldForm';
import { validateTechnicalVisitFieldFormSections } from './fieldFormValidation';

export class TechnicalVisitFieldFormService {
  constructor(
    private readonly fieldFormGateway: TechnicalVisitFieldFormGateway,
    private readonly visitGateway: TechnicalVisitGateway
  ) {}

  async getFieldForm(
    context: TechnicalVisitApplicationContext,
    visitId: string,
    signal?: AbortSignal
  ): Promise<TechnicalVisitFieldForm | null> {
    this.assertContext(context);
    this.assertExecutePermission(context);
    await this.requireVisit(context, visitId);
    return this.fieldFormGateway.getFieldForm(
      context.organizationId,
      visitId,
      signal
    );
  }

  async listRevisions(
    context: TechnicalVisitApplicationContext,
    visitId: string,
    signal?: AbortSignal
  ): Promise<readonly TechnicalVisitFieldFormRevision[]> {
    this.assertContext(context);
    this.assertExecutePermission(context);
    await this.requireVisit(context, visitId);
    return this.fieldFormGateway.listFieldFormRevisions(
      context.organizationId,
      visitId,
      signal
    );
  }

  async saveDraft(
    context: TechnicalVisitApplicationContext,
    visitId: string,
    sections: readonly TechnicalVisitFieldSection[],
    expectedVersion: number,
    signal?: AbortSignal
  ): Promise<TechnicalVisitFieldForm> {
    this.assertContext(context);
    this.assertExecutePermission(context);
    const visit = await this.requireVisit(context, visitId);
    this.assertResponsible(context, visit.responsibleUserId);
    if (visit.status !== 'confirmed' && visit.status !== 'in_progress') {
      throw new TechnicalVisitDomainError(
        'FIELD_FORM_LOCKED',
        'O formulário de campo pode ser alterado somente após a confirmação e durante a execução.'
      );
    }

    validateTechnicalVisitFieldFormSections(sections, false);
    return this.fieldFormGateway.saveFieldForm(
      {
        organizationId: context.organizationId,
        visitId,
        actorUserId: context.actor.userId,
        sections,
        expectedVersion,
        submit: false,
      },
      signal
    );
  }

  async submit(
    context: TechnicalVisitApplicationContext,
    visitId: string,
    sections: readonly TechnicalVisitFieldSection[],
    expectedVersion: number,
    signal?: AbortSignal
  ): Promise<TechnicalVisitFieldForm> {
    this.assertContext(context);
    this.assertExecutePermission(context);
    const visit = await this.requireVisit(context, visitId);
    this.assertResponsible(context, visit.responsibleUserId);
    if (visit.status !== 'in_progress') {
      throw new TechnicalVisitDomainError(
        'FIELD_FORM_LOCKED',
        'O formulário de campo somente pode ser enviado durante a execução da visita.'
      );
    }

    validateTechnicalVisitFieldFormSections(sections, true);
    return this.fieldFormGateway.saveFieldForm(
      {
        organizationId: context.organizationId,
        visitId,
        actorUserId: context.actor.userId,
        sections,
        expectedVersion,
        submit: true,
      },
      signal
    );
  }

  private assertContext(context: TechnicalVisitApplicationContext): void {
    if (!context.organizationId || !context.actor.userId || !context.actor.isActive) {
      throw new TechnicalVisitDomainError(
        'ORGANIZATION_REQUIRED',
        'É necessário possuir vínculo ativo com uma organização.'
      );
    }
  }

  private assertExecutePermission(context: TechnicalVisitApplicationContext): void {
    if (!context.actor.permissions.includes('surveys_and_visits:execute')) {
      throw new TechnicalVisitDomainError(
        'PERMISSION_DENIED',
        'Você não possui permissão para o formulário de campo.'
      );
    }
  }

  private assertResponsible(
    context: TechnicalVisitApplicationContext,
    responsibleUserId: string
  ): void {
    if (responsibleUserId !== context.actor.userId) {
      throw new TechnicalVisitDomainError(
        'RESPONSIBLE_MISMATCH',
        'Somente o responsável atual pode alterar o formulário de campo.'
      );
    }
  }

  private async requireVisit(
    context: TechnicalVisitApplicationContext,
    visitId: string
  ) {
    const visit = await this.visitGateway.getVisitById(
      context.organizationId,
      visitId
    );
    if (!visit) {
      throw new TechnicalVisitDomainError('VISIT_NOT_FOUND', 'Visita não encontrada.');
    }
    return visit;
  }
}
