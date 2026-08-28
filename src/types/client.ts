/**
 * Contratos Tipados do Domínio — Módulo 002: Clientes e Produtores Rurais
 * OE-002.001 & OE-002.002: Modelagem Cadastral e Formulário de Clientes PF e PJ
 */

/**
 * Identificador único do cliente
 */
export type ClientId = string;

/**
 * Tipo de pessoa do cliente:
 * - 'individual': Pessoa Física (Produtor rural pessoa física, arrendatário, etc.)
 * - 'legal_entity': Pessoa Jurídica (Empresa agrícola, cooperativa, agroindústria, etc.)
 */
export type ClientPersonType = 'individual' | 'legal_entity';

/**
 * Situação cadastral do cliente no sistema
 */
export type ClientStatus = 'active' | 'inactive';

/**
 * Tipo de endereço do cliente
 */
export type AddressType = 'urban' | 'rural';

/**
 * Dados de contato do cliente
 */
export interface ClientContact {
  readonly primaryPhone: string;
  readonly hasWhatsapp: boolean;
  readonly secondaryPhone?: string;
  readonly email?: string;
}

/**
 * Endereço urbano estruturado
 */
export interface UrbanClientAddress {
  readonly addressType: 'urban';
  readonly zipCode: string;
  readonly street: string;
  readonly number: string;
  readonly isNoNumber: boolean;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  readonly complement?: string;
  readonly referencePoint?: string;
}

/**
 * Endereço rural estruturado
 */
export interface RuralClientAddress {
  readonly addressType: 'rural';
  readonly locality: string;
  readonly accessDescription: string;
  readonly city: string;
  readonly state: string;
  readonly zipCode?: string;
  readonly complement?: string;
}

/**
 * União discriminada de endereços
 */
export type ClientAddress = UrbanClientAddress | RuralClientAddress;

/**
 * Entidade de Cliente Pessoa Física
 */
export interface IndividualClient {
  readonly id: ClientId;
  readonly organizationId: string;
  readonly personType: 'individual';
  readonly name: string;
  readonly cpf: string; // 11 dígitos normalizados
  readonly rg?: string;
  readonly rgIssuer?: string;
  readonly rgState?: string;
  readonly birthDate?: string; // YYYY-MM-DD
  readonly stateRegistration?: string;
  readonly isStateRegistrationExempt: boolean;
  readonly contact: ClientContact;
  readonly address: ClientAddress;
  readonly status: ClientStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Entidade de Cliente Pessoa Jurídica
 */
export interface LegalEntityClient {
  readonly id: ClientId;
  readonly organizationId: string;
  readonly personType: 'legal_entity';
  readonly companyName: string; // Razão social
  readonly tradeName?: string; // Nome fantasia
  readonly cnpj: string; // 14 dígitos normalizados
  readonly stateRegistration?: string;
  readonly isStateRegistrationExempt: boolean;
  readonly contact: ClientContact;
  readonly address: ClientAddress;
  readonly status: ClientStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * União discriminada de Clientes
 */
export type Client = IndividualClient | LegalEntityClient;

/**
 * Tipos de busca, filtros, ordenação e paginação para listagem de clientes (OE-002.003)
 */
export type ClientSearchTerm = string;

export type ClientPersonTypeFilter = 'all' | 'individual' | 'legal_entity';

export type ClientStatusFilter = 'all' | 'active' | 'inactive';

export type ClientSortField = 'name' | 'createdAt';

export type ClientSortDirection = 'asc' | 'desc';

export type ClientSortOption =
  | 'name_asc'
  | 'name_desc'
  | 'created_at_desc'
  | 'created_at_asc';

export interface ClientListQuery {
  readonly organizationId: string;
  readonly searchTerm?: ClientSearchTerm;
  readonly personType?: ClientPersonTypeFilter;
  readonly status?: ClientStatusFilter;
  readonly sort?: ClientSortOption;
  readonly page: number;
  readonly pageSize: number;
}

export interface ClientListPage {
  readonly items: readonly Client[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface ClientListQueryState {
  readonly searchTerm: ClientSearchTerm;
  readonly personType: ClientPersonTypeFilter;
  readonly status: ClientStatusFilter;
  readonly sort: ClientSortOption;
  readonly page: number;
  readonly pageSize: number;
}

export const DEFAULT_CLIENT_LIST_QUERY_STATE: Readonly<ClientListQueryState> = Object.freeze({
  searchTerm: '',
  personType: 'all',
  status: 'all',
  sort: 'name_asc',
  page: 1,
  pageSize: 10,
});

/**
 * Resumo tipado do cliente para listagens e visualizações estruturadas
 */
export interface ClientSummary {
  readonly id: ClientId;
  readonly organizationId: string;
  readonly personType: ClientPersonType;
  readonly name: string;
  readonly tradeName?: string;
  readonly documentMasked: string;
  readonly primaryContact: string;
  readonly city: string;
  readonly state: string;
  readonly status: ClientStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Parâmetros de filtro para listagem de clientes (legado/compatibilidade)
 */
export interface ClientListFilters {
  readonly search?: string;
  readonly status?: ClientStatus | 'all';
  readonly personType?: ClientPersonType | 'all';
}

/**
 * Metadados de paginação para listagem de clientes (legado/compatibilidade)
 */
export interface ClientListPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly totalItems: number;
}

/**
 * Resultado estruturado de consulta paginada de clientes (legado/compatibilidade)
 */
export interface ClientListResult {
  readonly items: readonly ClientSummary[];
  readonly pagination: ClientListPagination;
}

/**
 * Valores do formulário de Pessoa Física
 */
export interface IndividualClientFormValues {
  personType: 'individual';
  name: string;
  cpf: string;
  rg: string;
  rgIssuer: string;
  rgState: string;
  birthDate: string;
  stateRegistration: string;
  isStateRegistrationExempt: boolean;
  status: ClientStatus;
  primaryPhone: string;
  hasWhatsapp: boolean;
  secondaryPhone: string;
  email: string;
  addressType: AddressType;
  // Endereço Urbano
  zipCode: string;
  street: string;
  number: string;
  isNoNumber: boolean;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
  referencePoint: string;
  // Endereço Rural
  locality: string;
  accessDescription: string;
  ruralZipCode: string;
  ruralComplement: string;
}

/**
 * Valores do formulário de Pessoa Jurídica
 */
export interface LegalEntityClientFormValues {
  personType: 'legal_entity';
  companyName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  isStateRegistrationExempt: boolean;
  status: ClientStatus;
  primaryPhone: string;
  hasWhatsapp: boolean;
  secondaryPhone: string;
  email: string;
  addressType: AddressType;
  // Endereço Urbano
  zipCode: string;
  street: string;
  number: string;
  isNoNumber: boolean;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
  referencePoint: string;
  // Endereço Rural
  locality: string;
  accessDescription: string;
  ruralZipCode: string;
  ruralComplement: string;
}

/**
 * União discriminada dos valores do formulário de cliente
 */
export type ClientFormValues = IndividualClientFormValues | LegalEntityClientFormValues;

/**
 * Entradas de criação de cliente
 */
export type CreateIndividualClientInput = Omit<IndividualClient, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>;
export type CreateLegalEntityClientInput = Omit<LegalEntityClient, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>;
export type CreateClientInput = CreateIndividualClientInput | CreateLegalEntityClientInput;

/**
 * Entradas de atualização de cliente
 */
export type UpdateIndividualClientInput = Omit<IndividualClient, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>;
export type UpdateLegalEntityClientInput = Omit<LegalEntityClient, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>;
export type UpdateClientInput = UpdateIndividualClientInput | UpdateLegalEntityClientInput;

/**
 * Resultado de mutação de cliente
 */
export type ClientMutationResult =
  | { readonly success: true; readonly client: Client }
  | {
      readonly success: false;
      readonly error: string;
      readonly code?: 'duplicate_document' | 'not_found' | 'forbidden' | 'unavailable' | 'validation_error';
    };

/**
 * Mapa de erros de validação por campo
 */
export type ClientValidationErrors = Partial<
  Record<
    | keyof IndividualClientFormValues
    | keyof LegalEntityClientFormValues
    | 'general'
    | string,
    string
  >
>;

/**
 * Estados discriminados do ciclo de vida e carregamento do módulo de clientes
 */
export type ClientContextStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'unavailable'
  | 'error';

/**
 * Contrato de Gateway de Acesso a Dados do Módulo de Clientes
 */
export interface ClientGateway {
  /**
   * Consulta paginada, filtrada e ordenada de clientes vinculados a uma organização específica.
   */
  listClients(
    query: ClientListQuery,
    signal?: AbortSignal
  ): Promise<ClientListPage>;

  /**
   * Busca um cliente por identificador e organização.
   */
  getClientById(
    organizationId: string,
    clientId: string
  ): Promise<Client | null>;

  /**
   * Cria um novo cliente associado à organização.
   */
  createClient(
    organizationId: string,
    input: CreateClientInput
  ): Promise<Client>;

  /**
   * Atualiza os dados de um cliente existente da organização.
   */
  updateClient(
    organizationId: string,
    clientId: string,
    input: UpdateClientInput
  ): Promise<Client>;
}

export * from './clientCapturerAssignment';
