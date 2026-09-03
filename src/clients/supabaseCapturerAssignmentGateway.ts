import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ClientCapturerAssignment,
  ClientCapturerAssignmentGateway,
  CreateCapturerAssignmentInput,
  TerminateCapturerAssignmentInput,
  TransferCapturerAssignmentInput,
} from '../types/clientCapturerAssignment';

interface AssignmentRow {
  id: string;
  organization_id: string;
  client_id: string;
  capturer_user_id: string;
  status: 'active' | 'terminated';
  is_primary: boolean;
  started_at: string;
  ended_at: string | null;
  assigned_by_user_id: string;
  transfer_reason: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id,organization_id,client_id,capturer_user_id,status,is_primary,started_at,ended_at,assigned_by_user_id,transfer_reason,created_at,updated_at';

function mapRow(row: AssignmentRow): ClientCapturerAssignment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    capturerUserId: row.capturer_user_id,
    status: row.status,
    isPrimary: row.is_primary,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    assignedByUserId: row.assigned_by_user_id,
    transferReason: row.transfer_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapError(error: { readonly message?: string } | null): Error {
  const message = error?.message ?? '';
  if (message.includes('AGROCORE_CAPTURER_NOT_FOUND')) {
    return new Error('O usuário selecionado não é um captador ativo desta organização.');
  }
  if (message.includes('AGROCORE_IDEMPOTENCY_CONFLICT')) {
    return new Error('A operação já foi processada com informações diferentes.');
  }
  if (message.includes('AGROCORE_FORBIDDEN')) {
    return new Error('Você não possui permissão para gerenciar o captador deste cliente.');
  }
  if (message.includes('AGROCORE_NOT_FOUND')) {
    return new Error('Cliente ou vínculo de captador não encontrado.');
  }
  if (message.includes('AGROCORE_INVALID_INPUT')) {
    return new Error('Os dados do vínculo de captador são inválidos.');
  }
  return new Error('Serviço de vínculo Cliente ↔ Captador indisponível neste momento.');
}

function rpcRow(data: unknown): ClientCapturerAssignment {
  const row = (Array.isArray(data) ? data[0] : data) as AssignmentRow | null;
  if (!row) throw new Error('O banco não confirmou o vínculo do captador.');
  return mapRow(row);
}

export class SupabaseClientCapturerAssignmentGateway
  implements ClientCapturerAssignmentGateway
{
  constructor(private readonly client: SupabaseClient) {}

  async listAssignmentsByClient(
    organizationId: string,
    clientId: string
  ): Promise<readonly ClientCapturerAssignment[]> {
    const { data, error } = await this.client
      .from('client_capturer_assignments')
      .select(COLUMNS)
      .eq('organization_id', organizationId)
      .eq('client_id', clientId)
      .order('started_at', { ascending: false })
      .order('id', { ascending: true });

    if (error) throw mapError(error);
    return ((data ?? []) as unknown as AssignmentRow[]).map(mapRow);
  }

  async getActiveAssignment(
    organizationId: string,
    clientId: string
  ): Promise<ClientCapturerAssignment | null> {
    const { data, error } = await this.client
      .from('client_capturer_assignments')
      .select(COLUMNS)
      .eq('organization_id', organizationId)
      .eq('client_id', clientId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw mapError(error);
    return data ? mapRow(data as unknown as AssignmentRow) : null;
  }

  async listClientsByCapturer(
    organizationId: string,
    capturerUserId: string
  ): Promise<readonly string[]> {
    const { data, error } = await this.client
      .from('client_capturer_assignments')
      .select('client_id')
      .eq('organization_id', organizationId)
      .eq('capturer_user_id', capturerUserId)
      .eq('status', 'active');

    if (error) throw mapError(error);
    const ids = (data ?? []).map((row) => String(row.client_id));
    return [...new Set(ids)];
  }

  async assignCapturer(
    organizationId: string,
    input: CreateCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment> {
    const { data, error } = await this.client.rpc('agrocore_assign_capturer', {
      p_organization_id: organizationId,
      p_client_id: input.clientId,
      p_capturer_user_id: input.capturerUserId,
      p_is_primary: input.isPrimary !== false,
      p_idempotency_key: input.idempotencyKey ?? null,
    });
    if (error) throw mapError(error);
    return rpcRow(data);
  }

  async transferCapturer(
    organizationId: string,
    input: TransferCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment> {
    const { data, error } = await this.client.rpc('agrocore_transfer_capturer', {
      p_organization_id: organizationId,
      p_client_id: input.clientId,
      p_new_capturer_user_id: input.newCapturerUserId,
      p_transfer_reason: input.transferReason.trim(),
      p_idempotency_key: input.idempotencyKey ?? null,
    });
    if (error) throw mapError(error);
    return rpcRow(data);
  }

  async terminateAssignment(
    organizationId: string,
    input: TerminateCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment> {
    const reason =
      input.reason?.trim() || 'Encerramento manual do vínculo de captador.';
    const { data, error } = await this.client.rpc(
      'agrocore_terminate_capturer_assignment',
      {
        p_organization_id: organizationId,
        p_client_id: input.clientId,
        p_assignment_id: input.assignmentId,
        p_reason: reason,
      }
    );
    if (error) throw mapError(error);
    return rpcRow(data);
  }

  clearAllSessionData(): void {}
}
