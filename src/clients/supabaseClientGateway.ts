import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Client,
  ClientGateway,
  ClientListPage,
  ClientListQuery,
  CreateClientInput,
  UpdateClientInput,
} from '../types/client';
import { normalizeDigits, normalizeSearchTerm } from './validators';

interface ClientRow {
  readonly payload: Client;
}

function clientError(error: { readonly message?: string } | null): Error {
  const message = error?.message ?? '';
  if (message.includes('AGROCORE_DUPLICATE_DOCUMENT')) {
    return new Error('Já existe um cliente com este documento nesta organização.');
  }
  if (message.includes('AGROCORE_NOT_FOUND')) {
    return new Error('Cliente não encontrado nesta organização.');
  }
  if (message.includes('AGROCORE_FORBIDDEN')) {
    return new Error('Você não possui permissão para realizar esta operação.');
  }
  if (message.includes('AGROCORE_INVALID_INPUT')) {
    return new Error('Os dados do cliente são inválidos.');
  }
  return new Error('Serviço de clientes indisponível neste momento.');
}

function rpcClient(data: unknown): Client {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || !('payload' in row)) {
    throw new Error('O banco não confirmou a operação do cliente.');
  }
  return (row as ClientRow).payload;
}

export class SupabaseClientGateway implements ClientGateway {
  constructor(private readonly client: SupabaseClient) {}

  async listClients(
    query: ClientListQuery,
    signal?: AbortSignal
  ): Promise<ClientListPage> {
    const pageSize = [10, 25, 50].includes(Number(query.pageSize))
      ? Number(query.pageSize)
      : 10;
    const requestedPage = Math.max(1, Number(query.page) || 1);
    const rawSearch = query.searchTerm?.slice(0, 100).trim() ?? '';
    const documentSearch = /^[\d.\-/ ]+$/.test(rawSearch)
      ? normalizeDigits(rawSearch)
      : '';
    const textSearch = normalizeSearchTerm(rawSearch);

    let countRequest = this.client
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', query.organizationId);

    if (query.personType && query.personType !== 'all') {
      countRequest = countRequest.eq('person_type', query.personType);
    }
    if (query.status && query.status !== 'all') {
      countRequest = countRequest.eq('status', query.status);
    }
    if (rawSearch) {
      countRequest = documentSearch
        ? countRequest.ilike('document_digits', `%${documentSearch}%`)
        : countRequest.ilike('search_text', `%${textSearch}%`);
    }
    if (signal) countRequest = countRequest.abortSignal(signal);

    const countResult = await countRequest;
    if (countResult.error) throw clientError(countResult.error);
    const total = countResult.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(requestedPage, totalPages);

    let dataRequest = this.client
      .from('clients')
      .select('payload')
      .eq('organization_id', query.organizationId);

    if (query.personType && query.personType !== 'all') {
      dataRequest = dataRequest.eq('person_type', query.personType);
    }
    if (query.status && query.status !== 'all') {
      dataRequest = dataRequest.eq('status', query.status);
    }
    if (rawSearch) {
      dataRequest = documentSearch
        ? dataRequest.ilike('document_digits', `%${documentSearch}%`)
        : dataRequest.ilike('search_text', `%${textSearch}%`);
    }

    const sort = query.sort ?? 'name_asc';
    if (sort === 'name_asc' || sort === 'name_desc') {
      dataRequest = dataRequest
        .order('display_name', { ascending: sort === 'name_asc' })
        .order('id', { ascending: sort === 'name_asc' });
    } else {
      dataRequest = dataRequest
        .order('created_at', { ascending: sort === 'created_at_asc' })
        .order('id', { ascending: sort === 'created_at_asc' });
    }

    const start = (safePage - 1) * pageSize;
    dataRequest = dataRequest.range(start, start + pageSize - 1);
    if (signal) dataRequest = dataRequest.abortSignal(signal);

    const { data, error } = await dataRequest;
    if (error) throw clientError(error);

    return {
      items: ((data ?? []) as unknown as ClientRow[]).map((row) => row.payload),
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  async getClientById(
    organizationId: string,
    clientId: string
  ): Promise<Client | null> {
    const { data, error } = await this.client
      .from('clients')
      .select('payload')
      .eq('organization_id', organizationId)
      .eq('id', clientId)
      .maybeSingle();
    if (error) throw clientError(error);
    return data ? (data as unknown as ClientRow).payload : null;
  }

  async createClient(
    organizationId: string,
    input: CreateClientInput
  ): Promise<Client> {
    const { data, error } = await this.client.rpc('agrocore_create_client', {
      p_organization_id: organizationId,
      p_input: input,
    });
    if (error) throw clientError(error);
    return rpcClient(data);
  }

  async updateClient(
    organizationId: string,
    clientId: string,
    input: UpdateClientInput
  ): Promise<Client> {
    const { data, error } = await this.client.rpc('agrocore_update_client', {
      p_organization_id: organizationId,
      p_client_id: clientId,
      p_input: input,
    });
    if (error) throw clientError(error);
    return rpcClient(data);
  }
}
