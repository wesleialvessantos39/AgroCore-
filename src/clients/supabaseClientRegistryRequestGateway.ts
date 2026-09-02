import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ClientRegistryRequest,
  ClientRegistryRequestGateway,
  ClientRegistryRequestScope,
  ClientRegistryRequestSourceType,
  ClientRegistryRequestStatus,
  CreateClientRegistryRequestInput,
} from '../types/clientRegistryRequest';

interface RequestRow {
  id: string;
  organization_id: string;
  client_id: string;
  property_id: string | null;
  assigned_capturer_user_id: string;
  requested_by_user_id: string;
  source_type: ClientRegistryRequestSourceType;
  source_id: string;
  scope: ClientRegistryRequestScope;
  status: ClientRegistryRequestStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  fulfilled_at: string | null;
}

const SELECT_COLUMNS =
  'id,organization_id,client_id,property_id,assigned_capturer_user_id,requested_by_user_id,source_type,source_id,scope,status,note,created_at,updated_at,fulfilled_at';

function mapRow(row: RequestRow): ClientRegistryRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    propertyId: row.property_id ?? undefined,
    assignedCapturerUserId: row.assigned_capturer_user_id,
    requestedByUserId: row.requested_by_user_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    scope: row.scope,
    status: row.status,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fulfilledAt: row.fulfilled_at ?? undefined,
  };
}

function mapError(error: { readonly message?: string } | null): Error {
  const message = error?.message ?? '';
  if (message.includes('AGROCORE_CAPTURER_NOT_ASSIGNED')) {
    return new Error('Este cliente ainda não possui captador responsável.');
  }
  if (message.includes('AGROCORE_REQUEST_NOT_READY')) {
    return new Error('A solicitação só pode ser concluída após o cadastro solicitado.');
  }
  if (message.includes('AGROCORE_FORBIDDEN')) {
    return new Error('Você não possui permissão para esta solicitação cadastral.');
  }
  if (message.includes('AGROCORE_NOT_FOUND')) {
    return new Error('Solicitação, cliente ou imóvel não encontrado.');
  }
  if (message.includes('AGROCORE_INVALID_INPUT')) {
    return new Error('Dados inválidos para a solicitação cadastral.');
  }
  return new Error('Serviço de solicitações cadastrais indisponível.');
}

function rpcRow(data: unknown): ClientRegistryRequest {
  const row = (Array.isArray(data) ? data[0] : data) as RequestRow | null;
  if (!row) throw new Error('O banco não confirmou a solicitação cadastral.');
  return mapRow(row);
}

export class SupabaseClientRegistryRequestGateway
  implements ClientRegistryRequestGateway
{
  constructor(private readonly client: SupabaseClient) {}

  async listAssigned(
    organizationId: string,
    capturerUserId: string,
    signal?: AbortSignal
  ): Promise<readonly ClientRegistryRequest[]> {
    let request = this.client
      .from('client_registry_requests')
      .select(SELECT_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('assigned_capturer_user_id', capturerUserId)
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false });

    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw mapError(error);
    return ((data ?? []) as unknown as RequestRow[]).map(mapRow);
  }

  async listRequestedBy(
    organizationId: string,
    requesterUserId: string,
    signal?: AbortSignal
  ): Promise<readonly ClientRegistryRequest[]> {
    let request = this.client
      .from('client_registry_requests')
      .select(SELECT_COLUMNS)
      .eq('organization_id', organizationId)
      .eq('requested_by_user_id', requesterUserId)
      .order('created_at', { ascending: false });

    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw mapError(error);
    return ((data ?? []) as unknown as RequestRow[]).map(mapRow);
  }

  async create(
    input: CreateClientRegistryRequestInput
  ): Promise<ClientRegistryRequest> {
    const { data, error } = await this.client.rpc(
      'agrocore_create_client_registry_request',
      {
        p_organization_id: input.organizationId,
        p_client_id: input.clientId,
        p_property_id: input.propertyId ?? null,
        p_source_type: input.sourceType,
        p_source_id: input.sourceId,
        p_scope: input.scope,
        p_note: input.note?.trim() || null,
      }
    );
    if (error) throw mapError(error);
    return rpcRow(data);
  }

  async start(
    organizationId: string,
    requestId: string
  ): Promise<ClientRegistryRequest> {
    const { data, error } = await this.client.rpc(
      'agrocore_start_client_registry_request',
      {
        p_organization_id: organizationId,
        p_request_id: requestId,
      }
    );
    if (error) throw mapError(error);
    return rpcRow(data);
  }

  async attachProperty(
    organizationId: string,
    requestId: string,
    propertyId: string
  ): Promise<ClientRegistryRequest> {
    const { data, error } = await this.client.rpc(
      'agrocore_attach_property_to_registry_request',
      {
        p_organization_id: organizationId,
        p_request_id: requestId,
        p_property_id: propertyId,
      }
    );
    if (error) throw mapError(error);
    return rpcRow(data);
  }

  async fulfill(
    organizationId: string,
    requestId: string
  ): Promise<ClientRegistryRequest> {
    const { data, error } = await this.client.rpc(
      'agrocore_fulfill_client_registry_request',
      {
        p_organization_id: organizationId,
        p_request_id: requestId,
      }
    );
    if (error) throw mapError(error);
    return rpcRow(data);
  }

  clearAllSessionData(): void {}
}
