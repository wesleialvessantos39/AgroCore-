import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreatePropertyInput,
  Property,
  PropertyConflictField,
  PropertyGateway,
  PropertyListPage,
  PropertyListQuery,
  PropertyMutationResult,
  PropertySummary,
  RuralProperty,
  UpdatePropertyInput,
  UrbanProperty,
} from '../types/property';
import {
  formatArea,
  maskCib,
  maskSncr,
} from './validators';

function normalizePropertySearch(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface PropertyRow {
  readonly organization_id: string;
  readonly payload: Property;
}

function conflictField(message: string): PropertyConflictField | null {
  if (message.includes('AGROCORE_PROPERTY_CIB_CONFLICT')) return 'cib';
  if (message.includes('AGROCORE_PROPERTY_SNCR_CONFLICT')) return 'sncr';
  if (message.includes('AGROCORE_PROPERTY_MUNICIPAL_CONFLICT')) {
    return 'municipalRegistration';
  }
  if (message.includes('AGROCORE_PROPERTY_REGISTRATION_CONFLICT')) {
    return 'registration';
  }
  return null;
}

function mutationFailure(
  error: { readonly message?: string } | null
): PropertyMutationResult {
  const message = error?.message ?? '';
  const field = conflictField(message);
  if (field) {
    return {
      success: false,
      error: 'Já existe um imóvel com esta identificação nesta organização.',
      conflict: {
        field,
        message: 'Já existe um imóvel com esta identificação nesta organização.',
      },
    };
  }
  if (message.includes('AGROCORE_NOT_FOUND')) {
    return { success: false, error: 'Imóvel não encontrado.' };
  }
  if (message.includes('AGROCORE_CLIENT_MISMATCH')) {
    return {
      success: false,
      error: 'Um dos clientes vinculados não pertence a esta organização.',
    };
  }
  if (message.includes('AGROCORE_FORBIDDEN')) {
    return {
      success: false,
      error: 'Você não possui permissão para realizar esta operação.',
    };
  }
  if (message.includes('AGROCORE_INVALID_INPUT')) {
    return { success: false, error: 'Os dados do imóvel são inválidos.' };
  }
  return { success: false, error: 'Serviço de imóveis indisponível neste momento.' };
}

function rpcProperty(data: unknown): Property | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || !('payload' in row)) return null;
  return (row as PropertyRow).payload;
}

function toSummary(property: Property): PropertySummary {
  const primaryLink =
    property.clientLinks.find((link) => link.isPrimaryHolder) ??
    property.clientLinks[0];
  const mainRelationship = primaryLink?.relationship ?? 'owner';

  if (property.propertyType === 'rural') {
    const rural = property as RuralProperty;
    return {
      id: rural.id,
      organizationId: rural.organizationId,
      propertyType: rural.propertyType,
      name: rural.name,
      city: rural.location.city,
      state: rural.location.state,
      status: rural.status,
      totalAreaFormatted: formatArea(rural.areas.totalDeclaredAreaHa, 'ha'),
      primaryClientId: primaryLink?.clientId,
      clientLinksCount: rural.clientLinks.length,
      clientLinks: rural.clientLinks,
      mainRelationship,
      cibMasked: rural.identifiers.cib
        ? maskCib(rural.identifiers.cib)
        : undefined,
      sncrMasked: rural.identifiers.sncrIncraCode
        ? maskSncr(rural.identifiers.sncrIncraCode)
        : undefined,
      registrationsCount: rural.registrations.length,
      createdAt: rural.createdAt,
      updatedAt: rural.updatedAt,
    };
  }

  const urban = property as UrbanProperty;
  return {
    id: urban.id,
    organizationId: urban.organizationId,
    propertyType: urban.propertyType,
    urbanType: urban.urbanType,
    name: urban.name,
    city: urban.location.city,
    state: urban.location.state,
    status: urban.status,
    totalAreaFormatted: formatArea(urban.areas.landAreaM2, 'm²'),
    primaryClientId: primaryLink?.clientId,
    clientLinksCount: urban.clientLinks.length,
    clientLinks: urban.clientLinks,
    mainRelationship,
    cibMasked: urban.identifiers.cib
      ? maskCib(urban.identifiers.cib)
      : undefined,
    registrationsCount: urban.registrations.length,
    createdAt: urban.createdAt,
    updatedAt: urban.updatedAt,
  };
}

export class SupabasePropertyGateway implements PropertyGateway {
  constructor(private readonly client: SupabaseClient) {}

  async listProperties(
    query: PropertyListQuery,
    signal?: AbortSignal
  ): Promise<PropertyListPage> {
    const pageSize = Math.max(1, Number(query.pageSize) || 10);
    const requestedPage = Math.max(1, Number(query.page) || 1);
    const search = normalizePropertySearch(query.searchTerm?.slice(0, 100) ?? '');

    let countRequest = this.client
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', query.organizationId);
    if (query.propertyType && query.propertyType !== 'all') {
      countRequest = countRequest.eq('property_type', query.propertyType);
    }
    if (query.status && query.status !== 'all') {
      countRequest = countRequest.eq('status', query.status);
    }
    if (query.clientId) {
      countRequest = countRequest.contains('client_ids', [query.clientId]);
    }
    if (search) countRequest = countRequest.ilike('search_text', `%${search}%`);
    if (signal) countRequest = countRequest.abortSignal(signal);

    const countResult = await countRequest;
    if (countResult.error) {
      throw new Error('Não foi possível consultar os imóveis.');
    }
    const total = countResult.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(requestedPage, totalPages);

    let dataRequest = this.client
      .from('properties')
      .select('organization_id,payload')
      .eq('organization_id', query.organizationId);
    if (query.propertyType && query.propertyType !== 'all') {
      dataRequest = dataRequest.eq('property_type', query.propertyType);
    }
    if (query.status && query.status !== 'all') {
      dataRequest = dataRequest.eq('status', query.status);
    }
    if (query.clientId) {
      dataRequest = dataRequest.contains('client_ids', [query.clientId]);
    }
    if (search) dataRequest = dataRequest.ilike('search_text', `%${search}%`);

    const start = (safePage - 1) * pageSize;
    dataRequest = dataRequest
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
      .range(start, start + pageSize - 1);
    if (signal) dataRequest = dataRequest.abortSignal(signal);

    const { data, error } = await dataRequest;
    if (error) throw new Error('Não foi possível consultar os imóveis.');
    const properties = ((data ?? []) as unknown as PropertyRow[]).map(
      (row) => row.payload
    );

    return {
      items: properties.map(toSummary),
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  async getPropertyById(
    organizationId: string,
    propertyId: string
  ): Promise<Property | null> {
    const { data, error } = await this.client
      .from('properties')
      .select('organization_id,payload')
      .eq('organization_id', organizationId)
      .eq('id', propertyId)
      .maybeSingle();
    if (error) throw new Error('Não foi possível consultar o imóvel.');
    return data ? (data as unknown as PropertyRow).payload : null;
  }

  async createProperty(
    input: CreatePropertyInput
  ): Promise<PropertyMutationResult> {
    const { data, error } = await this.client.rpc('agrocore_create_property', {
      p_input: input,
    });
    if (error) return mutationFailure(error);
    const property = rpcProperty(data);
    return property
      ? { success: true, property }
      : { success: false, error: 'O banco não confirmou a criação do imóvel.' };
  }

  async updateProperty(
    propertyId: string,
    input: UpdatePropertyInput
  ): Promise<PropertyMutationResult> {
    const { data: row, error: lookupError } = await this.client
      .from('properties')
      .select('organization_id')
      .eq('id', propertyId)
      .maybeSingle();
    if (lookupError) return mutationFailure(lookupError);
    if (!row) return { success: false, error: 'Imóvel não encontrado.' };

    const organizationId = (row as { organization_id: string }).organization_id;
    const { data, error } = await this.client.rpc('agrocore_update_property', {
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_input: input,
    });
    if (error) return mutationFailure(error);
    const property = rpcProperty(data);
    return property
      ? { success: true, property }
      : { success: false, error: 'O banco não confirmou a atualização do imóvel.' };
  }
}
