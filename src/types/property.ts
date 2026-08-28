/**
 * Contratos Tipados do Domínio — Módulo 003: Gestão de Imóveis Rurais e Urbanos
 * OE-003.001 & OE-003.002: Cadastro, Edição e Estrutura Territorial Completa (R1-R4)
 */

/**
 * Identificador único do imóvel
 */
export type PropertyId = string;

/**
 * Tipo fundamental do imóvel (União discriminada imutável após criação):
 * - 'rural': Imóveis rurais, fazendas, sítios, glebas, chácaras.
 * - 'urban': Imóveis urbanos, casas, apartamentos, terrenos, galpões comerciais/industriais.
 */
export type PropertyType = 'rural' | 'urban';

/**
 * Tipologias de imóveis urbanos
 */
export type UrbanPropertyType =
  | 'house'
  | 'apartment'
  | 'urban_land'
  | 'commercial'
  | 'industrial'
  | 'mixed_use'
  | 'other';

export const URBAN_PROPERTY_TYPE_LABELS: Readonly<Record<UrbanPropertyType, string>> = Object.freeze({
  house: 'Casa residencial',
  apartment: 'Apartamento / Unidade autônoma',
  urban_land: 'Terreno urbano / Lote',
  commercial: 'Imóvel comercial / Sala / Loja',
  industrial: 'Imóvel industrial / Galpão',
  mixed_use: 'Uso misto (Comercial / Residencial)',
  other: 'Outro tipo urbano',
});

/**
 * Situação cadastral do imóvel no sistema
 */
export type PropertyStatus = 'active' | 'inactive';

/**
 * Situação jurídica/registral da matrícula
 */
export type RegistrationStatus = 'active' | 'closed' | 'subdivided' | 'merged' | 'unknown';

export const REGISTRATION_STATUS_LABELS: Readonly<Record<RegistrationStatus, string>> = Object.freeze({
  active: 'Ativa / Vigente',
  closed: 'Encerrada',
  subdivided: 'Desmembrada',
  merged: 'Unificada / Fusionada',
  unknown: 'Não informada / Desconhecida',
});

/**
 * Formato de representação de coordenadas
 */
export type CoordinateFormat = 'decimal_degrees' | 'dms' | 'utm' | 'other';

export const COORDINATE_FORMAT_LABELS: Readonly<Record<CoordinateFormat, string>> = Object.freeze({
  decimal_degrees: 'Graus Decimais (Ex: -15.793889, -47.882778)',
  dms: 'Graus, Minutos e Segundos (GMS)',
  utm: 'Projetadas UTM (Easting / Northing)',
  other: 'Outro formato',
});

/**
 * Origem / Método de obtenção da coordenada de referência
 */
export type CoordinateOrigin = 'gnss' | 'document' | 'manual' | 'unknown';

export const COORDINATE_ORIGIN_LABELS: Readonly<Record<CoordinateOrigin, string>> = Object.freeze({
  gnss: 'Levantamento GNSS / GPS de campo',
  document: 'Documento técnico / Memorial / Planta',
  manual: 'Inserção manual / Ponto aproximado',
  unknown: 'Origem desconhecida / Não informada',
});

/**
 * Natureza da altitude informada
 */
export type PropertyAltitudeType = 'orthometric' | 'geometric' | 'unknown';

export const PROPERTY_ALTITUDE_TYPE_LABELS: Readonly<Record<PropertyAltitudeType, string>> = Object.freeze({
  orthometric: 'Ortométrica (Referenciada ao nível médio do mar / Geoide)',
  geometric: 'Geométrica / Elipsoidal (Referenciada ao Elipsoide)',
  unknown: 'Não informada / Desconhecida',
});

/**
 * Origem documental da confrontação declarada
 */
export type BoundarySource =
  | 'registration'
  | 'descriptive_memorial'
  | 'document'
  | 'declaration'
  | 'unknown';

export const BOUNDARY_SOURCE_LABELS: Readonly<Record<BoundarySource, string>> = Object.freeze({
  registration: 'Matrícula imobiliária',
  descriptive_memorial: 'Memorial descritivo técnico',
  document: 'Outro documento cartorial / Escritura',
  declaration: 'Declaração do proprietário / Posseiro',
  unknown: 'Origem não informada',
});

/**
 * Relações jurídicas e operacionais possíveis entre cliente/produtor e o imóvel:
 * - 'owner': Proprietário (titular de domínio com matrícula)
 * - 'co_owner': Coproprietário / Condômino
 * - 'possessor': Possuidor a justo título ou posse mansa e pacífica
 * - 'tenant': Arrendatário
 * - 'rural_partner': Parceiro rural / Parceria agrícola
 * - 'usufructuary': Usufrutuário
 * - 'other': Outro vínculo juridicamente informado (exige descrição obrigatória)
 */
export type PropertyClientRelationship =
  | 'owner'
  | 'co_owner'
  | 'possessor'
  | 'tenant'
  | 'rural_partner'
  | 'usufructuary'
  | 'other';

export const PROPERTY_RELATIONSHIP_LABELS: Readonly<Record<PropertyClientRelationship, string>> = Object.freeze({
  owner: 'Proprietário',
  co_owner: 'Coproprietário',
  possessor: 'Possuidor',
  tenant: 'Arrendatário',
  rural_partner: 'Parceiro rural',
  usufructuary: 'Usufrutuário',
  other: 'Outro vínculo jurídico',
});

/**
 * Sistemas geodésicos de referência reconhecidos para coordenadas
 */
export type GeodeticSystem = 'SIRGAS2000' | 'SAD69' | 'Corrego_Alegre' | 'other';

export const GEODETIC_SYSTEM_LABELS: Readonly<Record<GeodeticSystem, string>> = Object.freeze({
  SIRGAS2000: 'SIRGAS2000 (Padrão Oficial Brasileiro)',
  SAD69: 'SAD69 (Referencial Histórico / Legado)',
  Corrego_Alegre: 'Córrego Alegre (Referencial Histórico / Legado)',
  other: 'Outro referencial geodésico',
});

/**
 * Tipos de limites e confrontações
 */
export type BoundaryLimitType =
  | 'other_property'
  | 'road'
  | 'highway'
  | 'river'
  | 'fence'
  | 'dry_line'
  | 'urban_boundary'
  | 'other';

export const BOUNDARY_LIMIT_TYPE_LABELS: Readonly<Record<BoundaryLimitType, string>> = Object.freeze({
  other_property: 'Outro imóvel / Confrontante vizinho',
  road: 'Estrada municipal / Vicinal',
  highway: 'Rodovia estadual ou federal',
  river: 'Rio, córrego ou curso d’água natural',
  fence: 'Cerca de divisa',
  dry_line: 'Linha seca / Marco geodésico',
  urban_boundary: 'Limite de loteamento / Via urbana',
  other: 'Outro tipo de divisa',
});

/**
 * Vínculo estruturado entre um cliente da organização e o imóvel
 */
export interface PropertyClientLink {
  readonly clientId: string;
  readonly relationship: PropertyClientRelationship;
  readonly otherRelationshipDescription?: string;
  readonly isPrimaryHolder: boolean;
  readonly declaredParticipationPercentage?: string; // Decimal controlado (ex: "50.00")
  readonly observation?: string;
  readonly linkedAt: string;
}

/**
 * Registro de Matrícula / Transcrição Imobiliária
 */
export interface PropertyRegistration {
  readonly id: string; // ID estável único no array
  readonly registrationNumber: string; // Número da matrícula
  readonly cnmCode?: string; // Código Nacional de Matrícula (CNM - 15 dígitos numéricos)
  readonly registryOffice: string; // Cartório ou Serventia Registral
  readonly registryOfficeCode?: string; // Código da serventia (CNS - 6 dígitos numéricos)
  readonly district: string; // Comarca
  readonly state: string; // UF da comarca
  readonly bookAndPage?: string; // Livro e Folha (registros anteriores/legados)
  readonly certificateIssuedAt?: string; // Data de emissão/certidão (ISO YYYY-MM-DD)
  readonly registrationStatus?: RegistrationStatus; // Situação registral da matrícula
  readonly isPrimary?: boolean; // Indicador de matrícula principal
  readonly registeredArea?: string; // Área constante no registro (decimal normalizado)
  readonly areaUnit?: 'ha' | 'm²'; // Unidade da área
  readonly observation?: string;
}

/**
 * Coordenada de Referência do Imóvel
 */
export interface PropertyReferenceCoordinate {
  readonly latitude: string; // Decimal formatado (ex: "-15.793889")
  readonly longitude: string; // Decimal formatado (ex: "-47.882778")
  readonly datum?: string; // Sistema / Datum Geodésico
  readonly format?: CoordinateFormat; // Formato de representação
  readonly origin?: CoordinateOrigin; // Origem da coordenada
  readonly altitude?: string; // Altitude numérica
  readonly altitudeType?: PropertyAltitudeType; // Tipo da altitude
  readonly geodeticSystem: GeodeticSystem;
  readonly otherGeodeticSystemDescription?: string;
  readonly pointDescription?: string; // Descrição do ponto (ex: "Sede", "Vértice V-01")
  readonly observation?: string; // Observações adicionais do ponto
}

/**
 * Confrontação textual de divisa
 */
export interface PropertyBoundary {
  readonly id: string; // ID estável único no array
  readonly direction: string; // Direção / Trecho (ex: "Norte", "Leste", "Confrontação 01")
  readonly adjoiningDescription: string; // Descrição do confrontante
  readonly boundaryType: BoundaryLimitType;
  readonly otherBoundaryTypeDescription?: string;
  readonly source?: BoundarySource; // Origem da confrontação declarada
  readonly observation?: string;
}

/**
 * Localização de Imóvel Rural
 */
export interface RuralPropertyLocation {
  readonly postalCode?: string; // CEP rural (opcional, 8 dígitos)
  readonly district?: string; // Distrito / Subdistrito municipal (opcional)
  readonly complement?: string; // Complemento de endereço rural (opcional)
  readonly city: string; // Município (obrigatório)
  readonly state: string; // UF (obrigatório)
  readonly ruralRegionOrCommunity?: string; // Localidade, linha, comunidade ou gleba
  readonly accessRouteDescription?: string; // Roteiro de acesso ou ponto de referência
}

/**
 * Localização de Imóvel Urbano
 */
export interface UrbanPropertyLocation {
  readonly zipCode: string; // CEP (obrigatório)
  readonly street: string; // Logradouro (obrigatório)
  readonly number?: string; // Número
  readonly noNumber: boolean; // Flag "Sem número"
  readonly neighborhood: string; // Bairro (obrigatório)
  readonly complement?: string;
  readonly city: string; // Município (obrigatório)
  readonly state: string; // UF (obrigatório)
  readonly lot?: string; // Lote
  readonly block?: string; // Quadra
  readonly unit?: string; // Unidade / Apartamento / Bloco
  readonly referencePoint?: string; // Ponto de referência urbano
}

/**
 * Identificadores Cadastrais de Imóvel Rural
 */
export interface PropertyRuralIdentifiers {
  readonly cib?: string; // CIB - Cadastro Imobiliário Brasileiro (identificador fiscal atual)
  readonly nirfLegacy?: string; // NIRF - documento legado, opcional
  readonly sncrIncraCode?: string; // Código do imóvel no SNCR/Incra (13 dígitos numéricos)
  readonly ccirReference?: string; // Código / Referência do CCIR
  readonly ccirExerciseYear?: string; // Ano de exercício do CCIR
  readonly carReceiptNumber?: string; // Número do recibo de inscrição no CAR
}

/**
 * Identificadores Cadastrais de Imóvel Urbano
 */
export interface PropertyUrbanIdentifiers {
  readonly cib?: string; // CIB - Cadastro Imobiliário Brasileiro (quando apresentado)
  readonly municipalRegistration?: string; // Inscrição imobiliária municipal (IPTU / SQL)
  readonly condominiumIdentification?: string; // Identificação do condomínio / Edifício
}

/**
 * Medições e Áreas de Imóvel Rural (em Hectares - 'ha')
 */
export interface RuralPropertyAreas {
  readonly totalDeclaredAreaHa: string; // Área total declarada em ha (obrigatória > 0)
  readonly registeredAreaHa?: string; // Área registrada na matrícula em ha (derivada/legada)
  readonly carReportedAreaHa?: string; // Área informada no CAR em ha
  readonly sncrReportedAreaHa?: string; // Área informada no SNCR em ha
}

/**
 * Medições e Áreas de Imóvel Urbano (em Metros Quadrados - 'm²')
 */
export interface UrbanPropertyAreas {
  readonly landAreaM2: string; // Área do terreno em m² (obrigatória > 0)
  readonly builtAreaM2?: string; // Área construída em m² (pode ser maior que o terreno)
  readonly privateAreaM2?: string; // Área privativa em m²
  readonly commonAreaM2?: string; // Área de uso comum em m²
}

/**
 * Entidade de Imóvel Rural
 */
export interface RuralProperty {
  readonly id: PropertyId;
  readonly organizationId: string;
  readonly propertyType: 'rural';
  readonly name: string; // Denominação do imóvel rural (ex: "Fazenda Santa Maria")
  readonly status: PropertyStatus;
  readonly location: RuralPropertyLocation;
  readonly areas: RuralPropertyAreas;
  readonly identifiers: PropertyRuralIdentifiers;
  readonly registrations: readonly PropertyRegistration[];
  readonly clientLinks: readonly PropertyClientLink[];
  readonly referenceCoordinate?: PropertyReferenceCoordinate;
  readonly boundaries: readonly PropertyBoundary[];
  readonly notes?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Entidade de Imóvel Urbano
 */
export interface UrbanProperty {
  readonly id: PropertyId;
  readonly organizationId: string;
  readonly propertyType: 'urban';
  readonly urbanType: UrbanPropertyType;
  readonly otherUrbanTypeDescription?: string;
  readonly name: string; // Identificação do imóvel urbano (ex: "Galpão Logístico Sul")
  readonly status: PropertyStatus;
  readonly location: UrbanPropertyLocation;
  readonly areas: UrbanPropertyAreas;
  readonly identifiers: PropertyUrbanIdentifiers;
  readonly registrations: readonly PropertyRegistration[];
  readonly clientLinks: readonly PropertyClientLink[];
  readonly referenceCoordinate?: PropertyReferenceCoordinate;
  readonly boundaries: readonly PropertyBoundary[];
  readonly notes?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * União discriminada central de Imóveis do sistema
 */
export type Property = RuralProperty | UrbanProperty;

/**
 * Resumo tipado do imóvel para listagens, cartões e seletores
 */
export interface PropertySummary {
  readonly id: PropertyId;
  readonly organizationId: string;
  readonly propertyType: PropertyType;
  readonly urbanType?: UrbanPropertyType;
  readonly name: string;
  readonly city: string;
  readonly state: string;
  readonly status: PropertyStatus;
  readonly totalAreaFormatted: string; // ex: "1.250,50 ha" ou "450,00 m²"
  readonly primaryClientName?: string;
  readonly primaryClientId?: string;
  readonly clientLinksCount: number;
  readonly clientLinks: readonly PropertyClientLink[];
  readonly mainRelationship: PropertyClientRelationship;
  readonly cibMasked?: string;
  readonly sncrMasked?: string;
  readonly registrationsCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Estrutura do item de Matrícula no formulário
 */
export interface PropertyRegistrationFormItem {
  id: string;
  registrationNumber: string;
  cnmCode: string;
  registryOffice: string;
  registryOfficeCode: string;
  district: string;
  state: string;
  bookAndPage: string;
  certificateIssuedAt: string; // Data da certidão/emissão (ISO YYYY-MM-DD)
  registrationStatus: RegistrationStatus; // Situação registral
  isPrimary: boolean; // Flag de matrícula principal
  registeredArea: string;
  areaUnit: 'ha' | 'm²';
  observation: string;
}

/**
 * Estrutura do item de Cliente Vinculado no formulário
 */
export interface PropertyClientLinkFormItem {
  clientId: string;
  relationship: PropertyClientRelationship;
  otherRelationshipDescription: string;
  isPrimaryHolder: boolean;
  declaredParticipationPercentage: string;
  observation: string;
}

/**
 * Estrutura do item de Confrontação no formulário
 */
export interface PropertyBoundaryFormItem {
  id: string;
  direction: string;
  adjoiningDescription: string;
  boundaryType: BoundaryLimitType;
  otherBoundaryTypeDescription: string;
  source: BoundarySource; // Origem da confrontação
  observation: string;
}

/**
 * Valores do Formulário de Imóvel Rural
 */
export interface RuralPropertyFormValues {
  propertyType: 'rural';
  name: string;
  status: PropertyStatus;
  notes: string;
  // Localização
  postalCode: string; // CEP rural (opcional)
  district: string; // Distrito municipal (opcional)
  complement: string; // Complemento rural (opcional)
  city: string;
  state: string;
  ruralRegionOrCommunity: string;
  accessRouteDescription: string;
  // Áreas
  totalDeclaredAreaHa: string;
  registeredAreaHa: string; // Resumo derivado das matrículas
  carReportedAreaHa: string;
  sncrReportedAreaHa: string;
  // Identificadores
  cib: string;
  nirfLegacy: string;
  sncrIncraCode: string;
  ccirReference: string;
  ccirExerciseYear: string;
  carReceiptNumber: string;
  // Matrículas
  registrations: PropertyRegistrationFormItem[];
  // Clientes
  clientLinks: PropertyClientLinkFormItem[];
  // Coordenada
  hasCoordinate: boolean;
  latitude: string;
  longitude: string;
  datum: string;
  format: CoordinateFormat;
  origin: CoordinateOrigin;
  altitude: string;
  altitudeType: PropertyAltitudeType;
  geodeticSystem: GeodeticSystem;
  otherGeodeticSystemDescription: string;
  pointDescription: string;
  observation: string;
  // Confrontações
  boundaries: PropertyBoundaryFormItem[];
}

/**
 * Valores do Formulário de Imóvel Urbano
 */
export interface UrbanPropertyFormValues {
  propertyType: 'urban';
  urbanType: UrbanPropertyType;
  otherUrbanTypeDescription: string;
  name: string;
  status: PropertyStatus;
  notes: string;
  // Localização
  zipCode: string;
  street: string;
  number: string;
  noNumber: boolean;
  neighborhood: string;
  complement: string;
  city: string;
  state: string;
  lot: string;
  block: string;
  unit: string;
  referencePoint: string;
  // Áreas
  landAreaM2: string;
  builtAreaM2: string;
  privateAreaM2: string;
  commonAreaM2: string;
  // Identificadores
  cib: string;
  municipalRegistration: string;
  condominiumIdentification: string;
  // Matrículas
  registrations: PropertyRegistrationFormItem[];
  // Clientes
  clientLinks: PropertyClientLinkFormItem[];
  // Coordenada
  hasCoordinate: boolean;
  latitude: string;
  longitude: string;
  datum: string;
  format: CoordinateFormat;
  origin: CoordinateOrigin;
  altitude: string;
  altitudeType: PropertyAltitudeType;
  geodeticSystem: GeodeticSystem;
  otherGeodeticSystemDescription: string;
  pointDescription: string;
  observation: string;
  // Confrontações
  boundaries: PropertyBoundaryFormItem[];
}

/**
 * União discriminada dos valores do formulário
 */
export type PropertyFormValues = RuralPropertyFormValues | UrbanPropertyFormValues;

/**
 * Erros estruturados de validação do formulário de imóvel
 */
export type PropertyValidationErrors = Partial<
  Record<
    | 'propertyType'
    | 'urbanType'
    | 'otherUrbanTypeDescription'
    | 'name'
    | 'postalCode'
    | 'district'
    | 'city'
    | 'state'
    | 'ruralRegionOrCommunity'
    | 'accessRouteDescription'
    | 'zipCode'
    | 'street'
    | 'number'
    | 'neighborhood'
    | 'complement'
    | 'lot'
    | 'block'
    | 'unit'
    | 'referencePoint'
    | 'totalDeclaredAreaHa'
    | 'registeredAreaHa'
    | 'carReportedAreaHa'
    | 'sncrReportedAreaHa'
    | 'landAreaM2'
    | 'builtAreaM2'
    | 'privateAreaM2'
    | 'commonAreaM2'
    | 'cib'
    | 'nirfLegacy'
    | 'sncrIncraCode'
    | 'ccirReference'
    | 'ccirExerciseYear'
    | 'carReceiptNumber'
    | 'municipalRegistration'
    | 'condominiumIdentification'
    | 'registrations'
    | 'clientLinks'
    | 'coordinate'
    | 'latitude'
    | 'longitude'
    | 'datum'
    | 'format'
    | 'origin'
    | 'altitude'
    | 'altitudeType'
    | 'geodeticSystem'
    | 'pointDescription'
    | 'boundaries'
    | 'notes',
    string
  >
> & {
  registrationErrors?: Record<string, Record<string, string>>;
  clientLinkErrors?: Record<string, Record<string, string>>;
  boundaryErrors?: Record<string, Record<string, string>>;
};

/**
 * Dados para criação de imóvel rural
 */
export interface CreateRuralPropertyInput {
  readonly organizationId: string;
  readonly propertyType: 'rural';
  readonly name: string;
  readonly status: PropertyStatus;
  readonly location: RuralPropertyLocation;
  readonly areas: RuralPropertyAreas;
  readonly identifiers: PropertyRuralIdentifiers;
  readonly registrations: readonly PropertyRegistration[];
  readonly clientLinks: readonly PropertyClientLink[];
  readonly referenceCoordinate?: PropertyReferenceCoordinate;
  readonly boundaries: readonly PropertyBoundary[];
  readonly notes?: string;
}

/**
 * Dados para criação de imóvel urbano
 */
export interface CreateUrbanPropertyInput {
  readonly organizationId: string;
  readonly propertyType: 'urban';
  readonly urbanType: UrbanPropertyType;
  readonly otherUrbanTypeDescription?: string;
  readonly name: string;
  readonly status: PropertyStatus;
  readonly location: UrbanPropertyLocation;
  readonly areas: UrbanPropertyAreas;
  readonly identifiers: PropertyUrbanIdentifiers;
  readonly registrations: readonly PropertyRegistration[];
  readonly clientLinks: readonly PropertyClientLink[];
  readonly referenceCoordinate?: PropertyReferenceCoordinate;
  readonly boundaries: readonly PropertyBoundary[];
  readonly notes?: string;
}

export type CreatePropertyInput = CreateRuralPropertyInput | CreateUrbanPropertyInput;

/**
 * Dados para atualização de imóvel rural
 */
export interface UpdateRuralPropertyInput {
  readonly name: string;
  readonly status: PropertyStatus;
  readonly location: RuralPropertyLocation;
  readonly areas: RuralPropertyAreas;
  readonly identifiers: PropertyRuralIdentifiers;
  readonly registrations: readonly PropertyRegistration[];
  readonly clientLinks: readonly PropertyClientLink[];
  readonly referenceCoordinate?: PropertyReferenceCoordinate;
  readonly boundaries: readonly PropertyBoundary[];
  readonly notes?: string;
}

/**
 * Dados para atualização de imóvel urbano
 */
export interface UpdateUrbanPropertyInput {
  readonly urbanType: UrbanPropertyType;
  readonly otherUrbanTypeDescription?: string;
  readonly name: string;
  readonly status: PropertyStatus;
  readonly location: UrbanPropertyLocation;
  readonly areas: UrbanPropertyAreas;
  readonly identifiers: PropertyUrbanIdentifiers;
  readonly registrations: readonly PropertyRegistration[];
  readonly clientLinks: readonly PropertyClientLink[];
  readonly referenceCoordinate?: PropertyReferenceCoordinate;
  readonly boundaries: readonly PropertyBoundary[];
  readonly notes?: string;
}

export type UpdatePropertyInput = UpdateRuralPropertyInput | UpdateUrbanPropertyInput;

/**
 * Tipos de conflito de duplicidade detectados
 */
export type PropertyConflictField = 'cib' | 'sncr' | 'registration' | 'municipalRegistration';

export interface PropertyConflict {
  readonly field: PropertyConflictField;
  readonly message: string;
}

/**
 * Resultado de mutação de imóvel (criação ou edição)
 */
export type PropertyMutationResult =
  | {
      readonly success: true;
      readonly property: Property;
    }
  | {
      readonly success: false;
      readonly error: string;
      readonly validationErrors?: PropertyValidationErrors;
      readonly conflict?: PropertyConflict;
    };

/**
 * Parâmetros de consulta e filtros
 */
export interface PropertyListFilters {
  readonly search?: string;
  readonly propertyType?: PropertyType | 'all';
  readonly status?: PropertyStatus | 'all';
  readonly clientId?: string;
}

export interface PropertyListPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly totalItems: number;
}

export interface PropertyListResult {
  readonly items: readonly PropertySummary[];
  readonly pagination: PropertyListPagination;
}

export interface PropertyListQuery {
  readonly organizationId: string;
  readonly searchTerm?: string;
  readonly propertyType?: PropertyType | 'all';
  readonly status?: PropertyStatus | 'all';
  readonly clientId?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface PropertyListPage {
  readonly items: readonly PropertySummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export type PropertyContextStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'unavailable'
  | 'error';

/**
 * Contrato central do Gateway de Imóveis
 */
export interface PropertyGateway {
  listProperties(
    query: PropertyListQuery,
    signal?: AbortSignal
  ): Promise<PropertyListPage>;

  getPropertyById(
    organizationId: string,
    propertyId: string
  ): Promise<Property | null>;

  createProperty(
    input: CreatePropertyInput
  ): Promise<PropertyMutationResult>;

  updateProperty(
    propertyId: string,
    input: UpdatePropertyInput
  ): Promise<PropertyMutationResult>;
}
