import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TechnicalVisitDomainError,
  type TechnicalVisit,
  type TechnicalVisitAuditEntry,
  type TechnicalVisitGateway,
  type TechnicalVisitListFilters,
  type TechnicalVisitWrite,
} from '../types/technicalVisit';

interface VisitRow {
  readonly payload: TechnicalVisit;
}

interface AuditRow {
  readonly payload: TechnicalVisitAuditEntry;
}

function mapError(error: { readonly message?: string } | null): TechnicalVisitDomainError {
  const message = error?.message ?? '';
  if (message.includes('AGROCORE_CONCURRENCY_CONFLICT')) {
    return new TechnicalVisitDomainError(
      'CONCURRENCY_CONFLICT',
      'A visita foi alterada por outra operação. Recarregue os dados.'
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

  clearAllSessionData(): void {
    // Persistência remota: nenhuma informação de domínio é mantida em memória.
  }
}
