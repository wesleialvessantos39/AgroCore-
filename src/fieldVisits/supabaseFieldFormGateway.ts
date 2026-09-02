import type { SupabaseClient } from '@supabase/supabase-js';
import { TechnicalVisitDomainError } from '../types/technicalVisit';
import type {
  SaveTechnicalVisitFieldFormInput,
  TechnicalVisitFieldForm,
  TechnicalVisitFieldFormGateway,
  TechnicalVisitFieldFormRevision,
  TechnicalVisitFieldSection,
} from '../types/technicalVisitFieldForm';

interface FieldFormRow {
  id: string;
  organization_id: string;
  visit_id: string;
  status: 'draft' | 'submitted';
  version: number;
  payload: { sections?: TechnicalVisitFieldSection[] };
  created_by_user_id: string;
  created_at: string;
  updated_by_user_id: string;
  updated_at: string;
  submitted_by_user_id: string | null;
  submitted_at: string | null;
}

interface FieldFormRevisionRow {
  id: string;
  organization_id: string;
  field_form_id: string;
  visit_id: string;
  version: number;
  action: 'draft_saved' | 'submitted';
  actor_user_id: string;
  occurred_at: string;
  payload: { sections?: TechnicalVisitFieldSection[] };
}

function mapError(error: { readonly message?: string } | null): TechnicalVisitDomainError {
  const message = error?.message ?? '';
  if (message.includes('AGROCORE_FIELD_FORM_INCOMPLETE')) {
    return new TechnicalVisitDomainError(
      'FIELD_FORM_INCOMPLETE',
      'Preencha os itens obrigatórios antes de enviar o formulário.'
    );
  }
  if (message.includes('AGROCORE_FIELD_FORM_LOCKED')) {
    return new TechnicalVisitDomainError(
      'FIELD_FORM_LOCKED',
      'O formulário enviado não pode mais ser alterado.'
    );
  }
  if (message.includes('AGROCORE_CONCURRENCY_CONFLICT')) {
    return new TechnicalVisitDomainError(
      'CONCURRENCY_CONFLICT',
      'O formulário foi alterado por outra operação. Recarregue os dados.'
    );
  }
  if (message.includes('AGROCORE_VISIT_NOT_READY')) {
    return new TechnicalVisitDomainError(
      'FIELD_FORM_LOCKED',
      'O formulário de campo ainda não pode ser alterado nesta situação da visita.'
    );
  }
  if (message.includes('AGROCORE_RESPONSIBLE_MISMATCH')) {
    return new TechnicalVisitDomainError(
      'RESPONSIBLE_MISMATCH',
      'Somente o responsável atual pode alterar o formulário de campo.'
    );
  }
  if (message.includes('AGROCORE_FORBIDDEN')) {
    return new TechnicalVisitDomainError(
      'PERMISSION_DENIED',
      'Você não possui permissão para acessar o formulário de campo.'
    );
  }
  if (message.includes('AGROCORE_NOT_FOUND')) {
    return new TechnicalVisitDomainError('VISIT_NOT_FOUND', 'Visita não encontrada.');
  }
  if (message.includes('AGROCORE_FIELD_FORM_INVALID')) {
    return new TechnicalVisitDomainError(
      'FIELD_FORM_INVALID',
      'Os dados do formulário de campo são inválidos.'
    );
  }
  return new TechnicalVisitDomainError(
    'SERVICE_UNAVAILABLE',
    'Serviço de formulário de campo indisponível neste momento.'
  );
}

function mapForm(row: FieldFormRow): TechnicalVisitFieldForm {
  return {
    id: row.id,
    organizationId: row.organization_id,
    visitId: row.visit_id,
    status: row.status,
    sections: row.payload?.sections ?? [],
    version: row.version,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedByUserId: row.updated_by_user_id,
    updatedAt: row.updated_at,
    submittedByUserId: row.submitted_by_user_id,
    submittedAt: row.submitted_at,
  };
}

function mapRpcForm(data: unknown): TechnicalVisitFieldForm {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new TechnicalVisitDomainError(
      'SERVICE_UNAVAILABLE',
      'O banco não confirmou o salvamento do formulário.'
    );
  }
  return mapForm(row as FieldFormRow);
}

export class SupabaseTechnicalVisitFieldFormGateway
  implements TechnicalVisitFieldFormGateway
{
  constructor(private readonly client: SupabaseClient) {}

  async getFieldForm(
    organizationId: string,
    visitId: string,
    signal?: AbortSignal
  ): Promise<TechnicalVisitFieldForm | null> {
    let request = this.client
      .from('technical_visit_field_forms')
      .select(
        'id,organization_id,visit_id,status,version,payload,created_by_user_id,created_at,updated_by_user_id,updated_at,submitted_by_user_id,submitted_at'
      )
      .eq('organization_id', organizationId)
      .eq('visit_id', visitId)
      .maybeSingle();
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw mapError(error);
    return data ? mapForm(data as unknown as FieldFormRow) : null;
  }

  async saveFieldForm(
    input: SaveTechnicalVisitFieldFormInput,
    signal?: AbortSignal
  ): Promise<TechnicalVisitFieldForm> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    const { data, error } = await this.client.rpc(
      'agrocore_save_technical_visit_field_form',
      {
        p_organization_id: input.organizationId,
        p_visit_id: input.visitId,
        p_payload: { sections: input.sections },
        p_expected_version: input.expectedVersion,
        p_submit: input.submit,
      }
    );
    if (error) throw mapError(error);
    return mapRpcForm(data);
  }

  async listFieldFormRevisions(
    organizationId: string,
    visitId: string,
    signal?: AbortSignal
  ): Promise<readonly TechnicalVisitFieldFormRevision[]> {
    let request = this.client
      .from('technical_visit_field_form_revisions')
      .select(
        'id,organization_id,field_form_id,visit_id,version,action,actor_user_id,occurred_at,payload'
      )
      .eq('organization_id', organizationId)
      .eq('visit_id', visitId)
      .order('version', { ascending: true });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw mapError(error);

    return ((data ?? []) as unknown as FieldFormRevisionRow[]).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      fieldFormId: row.field_form_id,
      visitId: row.visit_id,
      version: row.version,
      action: row.action,
      actorUserId: row.actor_user_id,
      at: row.occurred_at,
      sections: row.payload?.sections ?? [],
    }));
  }

  clearAllSessionData(): void {}
}
