import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TechnicalVisitDomainError,
  type CompleteTechnicalVisitGatewayInput,
  type ReviseTechnicalVisitReportGatewayInput,
  type TechnicalVisit,
  type TechnicalVisitAuditEntry,
  type TechnicalVisitCompletionResult,
  type TechnicalVisitGateway,
  type TechnicalVisitListFilters,
  type TechnicalVisitWrite,
} from '../types/technicalVisit';
import type { TechnicalVisitReport } from '../types/technicalVisitReport';

interface VisitRow {
  readonly payload: TechnicalVisit;
}

interface AuditRow {
  readonly payload: TechnicalVisitAuditEntry;
}

function mapError(error: { readonly message?: string } | null): TechnicalVisitDomainError {
  const message = error?.message ?? '';
  if (message.includes('AGROCORE_REPORT_REQUIRED')) {
    return new TechnicalVisitDomainError(
      'REPORT_REQUIRED',
      'Conclua a visita pelo fluxo de relatório final.'
    );
  }
  if (message.includes('AGROCORE_REPORT_INVALID')) {
    return new TechnicalVisitDomainError(
      'REPORT_INVALID',
      'Revise o resumo e as pendências do relatório final.'
    );
  }
  if (message.includes('AGROCORE_REPORT_NOT_FOUND')) {
    return new TechnicalVisitDomainError('REPORT_NOT_FOUND', 'Relatório final não encontrado.');
  }
  if (message.includes('AGROCORE_REPORT_LOCKED')) {
    return new TechnicalVisitDomainError(
      'REPORT_LOCKED',
      'O relatório não pode ser alterado nesta situação.'
    );
  }
  if (message.includes('AGROCORE_VISIT_LOCKED')) {
    return new TechnicalVisitDomainError(
      'VISIT_LOCKED',
      'A visita está encerrada e não pode ser alterada.'
    );
  }
  if (message.includes('AGROCORE_PREPARATION_INCOMPLETE')) {
    return new TechnicalVisitDomainError(
      'PREPARATION_INCOMPLETE',
      'Conclua a preparação obrigatória antes de iniciar a visita.'
    );
  }
  if (message.includes('AGROCORE_INVALID_TRANSITION')) {
    return new TechnicalVisitDomainError(
      'INVALID_TRANSITION',
      'A mudança de situação solicitada não é permitida.'
    );
  }
  if (message.includes('AGROCORE_REASON_REQUIRED')) {
    return new TechnicalVisitDomainError(
      'REASON_REQUIRED',
      'Informe o motivo obrigatório para esta operação.'
    );
  }
  if (message.includes('AGROCORE_CONCURRENCY_CONFLICT')) {
    return new TechnicalVisitDomainError(
      'CONCURRENCY_CONFLICT',
      'A visita foi alterada por outra operação. Recarregue os dados.'
    );
  }
  if (message.includes('AGROCORE_FIELD_FORM_INCOMPLETE')) {
    return new TechnicalVisitDomainError(
      'FIELD_FORM_INCOMPLETE',
      'Envie o formulário de campo completo antes de concluir a visita.'
    );
  }
  if (message.includes('AGROCORE_SCHEDULE_CONFLICT')) {
    return new TechnicalVisitDomainError(
      'SCHEDULE_CONFLICT',
      'Outra sessão registrou um conflito de agenda. Recarregue a visita e revise o horário.'
    );
  }
  if (message.includes('AGROCORE_RESPONSIBLE_MISMATCH')) {
    return new TechnicalVisitDomainError(
      'RESPONSIBLE_MISMATCH',
      'O responsável informado não pode executar esta visita.'
    );
  }
  if (message.includes('AGROCORE_CLIENT_MISMATCH')) {
    return new TechnicalVisitDomainError(
      'CLIENT_NOT_FOUND',
      'O cliente não pertence à organização ativa ou está inativo.'
    );
  }
  if (message.includes('AGROCORE_PROPERTY_MISMATCH')) {
    return new TechnicalVisitDomainError(
      'PROPERTY_CLIENT_MISMATCH',
      'O imóvel não pertence ao cliente informado nesta organização.'
    );
  }
  if (message.includes('AGROCORE_NOT_FOUND')) {
    return new TechnicalVisitDomainError('VISIT_NOT_FOUND', 'Visita não encontrada.');
  }
  if (message.includes('AGROCORE_FORBIDDEN')) {
    return new TechnicalVisitDomainError(
      'PERMISSION_DENIED',
      'Você não possui permissão para alterar visitas nesta organização.'
    );
  }
  if (message.includes('AGROCORE_INVALID')) {
    return new TechnicalVisitDomainError(
      'INVALID_PURPOSE',
      'Os dados recebidos para a visita são inválidos.'
    );
  }
  return new TechnicalVisitDomainError(
    'SERVICE_UNAVAILABLE',
    'Serviço de visitas indisponível neste momento.'
  );
}

function visitFromRpc(data: unknown): TechnicalVisit {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || !('payload' in row)) {
    throw new TechnicalVisitDomainError(
      'SERVICE_UNAVAILABLE',
      'O banco não confirmou a operação da visita.'
    );
  }
  return (row as VisitRow).payload;
}

export class SupabaseTechnicalVisitGateway implements TechnicalVisitGateway {
  constructor(private readonly client: SupabaseClient) {}

  async listVisits(
    organizationId: string,
    filters: TechnicalVisitListFilters = {},
    signal?: AbortSignal
  ): Promise<readonly TechnicalVisit[]> {
    let request = this.client
      .from('technical_visits')
      .select('payload')
      .eq('organization_id', organizationId);

    if (filters.status && filters.status !== 'all') {
      request = request.eq('status', filters.status);
    }
    if (filters.clientId) request = request.eq('client_id', filters.clientId);
    if (filters.propertyId) request = request.eq('property_id', filters.propertyId);
    if (filters.responsibleUserId) {
      request = request.eq('responsible_user_id', filters.responsibleUserId);
    }

    request = request
      .order('scheduled_for', { ascending: true })
      .order('id', { ascending: true });
    if (signal) request = request.abortSignal(signal);

    const { data, error } = await request;
    if (error) throw mapError(error);
    return Object.freeze(
      ((data ?? []) as unknown as VisitRow[]).map((row) => row.payload)
    );
  }

  async getVisitById(
    organizationId: string,
    visitId: string
  ): Promise<TechnicalVisit | null> {
    const { data, error } = await this.client
      .from('technical_visits')
      .select('payload')
      .eq('organization_id', organizationId)
      .eq('id', visitId)
      .maybeSingle();
    if (error) throw mapError(error);
    return data ? (data as unknown as VisitRow).payload : null;
  }

  async createVisit(write: TechnicalVisitWrite): Promise<TechnicalVisit> {
    if (write.expectedVersion !== null) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'Uma nova visita não pode possuir versão anterior.'
      );
    }
    const { data, error } = await this.client.rpc(
      'agrocore_create_technical_visit',
      {
        p_visit: write.visit,
        p_audit: write.audit,
      }
    );
    if (error) throw mapError(error);
    return visitFromRpc(data);
  }

  async updateVisit(write: TechnicalVisitWrite): Promise<TechnicalVisit> {
    if (write.expectedVersion === null) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'A versão esperada da visita é obrigatória.'
      );
    }
    const { data, error } = await this.client.rpc(
      'agrocore_update_technical_visit',
      {
        p_visit: write.visit,
        p_audit: write.audit,
        p_expected_version: write.expectedVersion,
      }
    );
    if (error) throw mapError(error);
    return visitFromRpc(data);
  }

  async listAudit(
    organizationId: string,
    visitId: string
  ): Promise<readonly TechnicalVisitAuditEntry[]> {
    const { data: visit, error: visitError } = await this.client
      .from('technical_visits')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', visitId)
      .maybeSingle();
    if (visitError) throw mapError(visitError);
    if (!visit) {
      throw new TechnicalVisitDomainError('VISIT_NOT_FOUND', 'Visita não encontrada.');
    }

    const { data, error } = await this.client
      .from('technical_visit_audit')
      .select('payload')
      .eq('organization_id', organizationId)
      .eq('visit_id', visitId)
      .order('version', { ascending: true });
    if (error) throw mapError(error);
    return Object.freeze(
      ((data ?? []) as unknown as AuditRow[]).map((row) => ({
        ...row.payload,
        changedFields: [...row.payload.changedFields],
      }))
    );
  }

  async completeVisit(
    input: CompleteTechnicalVisitGatewayInput
  ): Promise<TechnicalVisitCompletionResult> {
    const { data, error } = await this.client.rpc(
      'agrocore_complete_technical_visit',
      {
        p_organization_id: input.organizationId,
        p_visit_id: input.visitId,
        p_expected_version: input.expectedVersion,
        p_summary: input.summary,
        p_pending_items: input.pendingItems,
      }
    );
    if (error) throw mapError(error);
    if (
      !data ||
      typeof data !== 'object' ||
      !('visit' in data) ||
      !('report' in data)
    ) {
      throw new TechnicalVisitDomainError(
        'SERVICE_UNAVAILABLE',
        'O banco não confirmou a conclusão da visita.'
      );
    }
    const result = data as {
      readonly visit: TechnicalVisit;
      readonly report: TechnicalVisitReport;
    };
    return {
      visit: result.visit,
      report: result.report,
    };
  }

  async getLatestReport(
    organizationId: string,
    visitId: string
  ): Promise<TechnicalVisitReport | null> {
    const { data, error } = await this.client
      .from('technical_visit_report_versions')
      .select('payload')
      .eq('organization_id', organizationId)
      .eq('visit_id', visitId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw mapError(error);
    return data ? (data.payload as TechnicalVisitReport) : null;
  }

  async listReportVersions(
    organizationId: string,
    visitId: string
  ): Promise<readonly TechnicalVisitReport[]> {
    const { data, error } = await this.client
      .from('technical_visit_report_versions')
      .select('payload')
      .eq('organization_id', organizationId)
      .eq('visit_id', visitId)
      .order('version', { ascending: false });
    if (error) throw mapError(error);
    return Object.freeze(
      ((data ?? []) as Array<{ payload: TechnicalVisitReport }>).map((row) => row.payload)
    );
  }

  async reviseReport(
    input: ReviseTechnicalVisitReportGatewayInput
  ): Promise<TechnicalVisitReport> {
    const { data, error } = await this.client.rpc(
      'agrocore_create_technical_visit_report_revision',
      {
        p_organization_id: input.organizationId,
        p_visit_id: input.visitId,
        p_expected_report_version: input.expectedReportVersion,
        p_summary: input.summary,
        p_pending_items: input.pendingItems,
        p_revision_reason: input.reason,
      }
    );
    if (error) throw mapError(error);
    if (!data || typeof data !== 'object') {
      throw new TechnicalVisitDomainError(
        'SERVICE_UNAVAILABLE',
        'O banco não confirmou a nova versão do relatório.'
      );
    }
    return data as TechnicalVisitReport;
  }

  clearAllSessionData(): void {
    // Persistência remota: nenhuma informação de domínio é mantida em memória.
  }
}
