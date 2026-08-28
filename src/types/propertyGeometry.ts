/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * OE-003.003: Contratos Geoespaciais, Glebas, Polígonos e Georreferenciamento Interno
 * 
 * Aviso técnico e jurídico:
 * Esta geometria é destinada exclusivamente ao acompanhamento interno.
 * Não substitui levantamento técnico, planta, memorial descritivo, registro imobiliário ou certificação do Incra.
 */

export type PropertyGeometryId = string;
export type LandParcelId = string;
export type GeoVertexId = string;
export type InnerVoidId = string;
export type BoundarySegmentId = string;

/**
 * Status da Geometria Interna
 */
export type PropertyGeometryStatus = 'draft' | 'under_review' | 'validated_internally';

/**
 * Sistema de Referência de Coordenadas (CRS / Datum Geodésico)
 * - SIRGAS2000: Sistema Geodésico Oficial Brasileiro (IBGE / Decreto 5.334/2005) com Elipsoide GRS80 (a=6378137.0m, 1/f=298.257222101).
 * - WGS84: Sistema Geodésico Global com Elipsoide WGS84 (a=6378137.0m, 1/f=298.257223563).
 * - SAD69: Sistema Geodésico Histórico Brasileiro com Elipsoide de Referência 1967 (a=6378160.0m, 1/f=298.25).
 */
export type CoordinateReferenceSystem = 'SIRGAS2000' | 'WGS84' | 'SAD69';

/**
 * Classificação da Natureza da Altitude do Vértice
 */
export type AltitudeType = 'ellipsoidal' | 'orthometric' | 'unknown' | 'not_informed';

/**
 * Origem / Método de entrada das coordenadas
 */
export type CoordinateSource = 
  | 'manual_entry'
  | 'gnss_survey'
  | 'technical_document'
  | 'coordinate_conversion'
  | 'internal_calculation';

/**
 * Tipo de entrada de coordenada no formulário/editor
 */
export type CoordinateInputType = 'decimal' | 'dms' | 'utm';

/**
 * Formato DMS (Graus, Minutos, Segundos)
 */
export interface DmsCoordinate {
  degrees: number;
  minutes: number;
  seconds: number;
  hemisphere: 'N' | 'S' | 'E' | 'W';
}

/**
 * Coordenada Geográfica Decimal canônica (SIRGAS2000 / Geodésica)
 */
export interface GeographicCoordinate {
  type: 'geographic';
  crs: CoordinateReferenceSystem;
  latitude: number;   // -90 a +90
  longitude: number; // -180 a +180
  dmsLatitude?: string;  // Formato legível, ex: 15°47'38.12"S
  dmsLongitude?: string; // Formato legível, ex: 47°52'58.22"W
  rawInput?: {
    format: CoordinateInputType;
    latString: string;
    lonString: string;
  };
}

/**
 * Coordenada Projetada UTM
 */
export interface UtmCoordinate {
  type: 'utm';
  crs: CoordinateReferenceSystem;
  easting: number;     // 100.000m a 900.000m
  northing: number;    // 0 a 10.000.000m
  zone: number;        // 18 a 25 no Brasil
  hemisphere: 'N' | 'S';
  centralMeridian?: number;
  rawInput?: {
    eastingString: string;
    northingString: string;
    zoneString: string;
    hemisphere: 'N' | 'S';
  };
}

/**
 * União discriminada para coordenadas
 */
export type GeoCoordinate = GeographicCoordinate | UtmCoordinate;

/**
 * Vértice do Polígono
 */
export interface GeoVertex {
  id: GeoVertexId;
  order: number;
  code?: string; // Ex: M-01, V-01, P-01
  coordinate: GeographicCoordinate;
  utmCoordinate?: UtmCoordinate;
  altitudeMeters?: number;
  altitudeType?: AltitudeType;
  precisionMeters?: number;
  source: CoordinateSource;
  notes?: string;
}

/**
 * Tipos de Limites e Confrontações
 */
export type BoundaryType =
  | 'other_property'   // Outro imóvel / confrontante
  | 'unpaved_road'      // Estrada municipal / vicinal
  | 'highway'           // Rodovia estadual / federal
  | 'water_body'        // Rio ou curso d’água / córrego
  | 'fence'             // Cerca / divisa física
  | 'dry_line'          // Linha seca / marco
  | 'urban_limit'       // Limite urbano / loteamento
  | 'other';            // Outro (exige descrição)

/**
 * Segmento de Limite entre dois vértices (V_n -> V_n+1)
 */
export interface BoundarySegment {
  id: BoundarySegmentId;
  fromVertexId: GeoVertexId;
  toVertexId: GeoVertexId;
  boundaryType: BoundaryType;
  description: string;
  adjoiningOwner?: string;       // Nome do confrontante
  adjoiningRegistry?: string;    // Matrícula do confrontante (quando informada)
  notaryOffice?: string;         // Serventia / Cartório
  notes?: string;
}

/**
 * Anel Geométrico (Externo ou Vazio Interno)
 */
export interface GeoRing {
  type: 'outer' | 'inner';
  vertices: GeoVertex[];
}

/**
 * Vazio Interno / Encravamento / Exclusão Geométrica
 */
export interface InnerVoid {
  id: InnerVoidId;
  name: string;
  description?: string;
  ring: GeoRing;
  metrics?: {
    areaSquareMeters: number;
    areaHectares: number;
    perimeterMeters: number;
  };
}

/**
 * Métricas Calculadas da Geometria (Estimativa Interna)
 */
export interface GeometryMetrics {
  calculatedAreaSquareMeters: number;
  calculatedAreaHectares: number;
  perimeterMeters: number;
  perimeterKilometers: number;
  centroid: {
    latitude: number;
    longitude: number;
  };
  boundingBox: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  };
  vertexCount: number;
  voidCount: number;
  parcelCount: number;
  calculationMethod: 'geodesic_karney_spherical' | 'shoelace_utm';
}

/**
 * Gleba ou Parcela do Imóvel
 */
export interface LandParcel {
  id: LandParcelId;
  code: string; // Ex: Gleba 01, Lote A, Parcela Sede
  name: string;
  description?: string;
  status: 'active' | 'in_study' | 'archived';
  outerRing: GeoRing;
  innerVoids: InnerVoid[];
  boundarySegments: BoundarySegment[];
  metrics: GeometryMetrics;
  dataOrigin: CoordinateSource;
  referenceDate?: string;
  technicalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Problemas e Inconsistências Detectadas na Validação
 */
export type GeometryValidationSeverity = 'error' | 'warning' | 'info';

export type GeometryValidationCode =
  | 'INSUFFICIENT_VERTICES'
  | 'INVALID_COORDINATE'
  | 'PARTIAL_COORDINATE'
  | 'DUPLICATE_CONSECUTIVE_VERTICES'
  | 'ZERO_AREA'
  | 'SELF_INTERSECTING_RING'
  | 'UNCLOSED_RING'
  | 'VOID_OUTSIDE_OUTER_RING'
  | 'VOID_CROSSING_OUTER_RING'
  | 'OVERLAPPING_VOIDS'
  | 'MIXED_CRS'
  | 'MIXED_UTM_ZONES'
  | 'UNMATCHED_SEGMENTS'
  | 'POTENTIAL_PARCEL_OVERLAP'
  | 'NON_NUMERIC_VALUE'
  | 'PRECISION_LOSS_DETECTED';

export interface GeometryValidationIssue {
  code: GeometryValidationCode;
  severity: GeometryValidationSeverity;
  message: string;
  parcelId?: LandParcelId;
  voidId?: InnerVoidId;
  vertexId?: GeoVertexId;
  affectedVertexIds?: GeoVertexId[];
  segmentId?: BoundarySegmentId;
}

export interface GeometryValidationResult {
  isValid: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  issues: GeometryValidationIssue[];
}

/**
 * Comparativo de Áreas entre Geometria Calculada e Fontes Cadastrais
 */
export interface AreaComparisonSource {
  sourceName: string;
  areaHectares: number;
  differenceHectares: number;
  differencePercentage: number;
  isRegistered: boolean;
  discrepancyLevel: 'none' | 'low' | 'medium' | 'high';
}

export interface PropertyAreaComparison {
  calculatedAreaHectares: number;
  calculatedAreaSquareMeters: number;
  sources: AreaComparisonSource[];
  summary: {
    overallDiscrepancyLevel: 'none' | 'low' | 'medium' | 'high';
  };
}

/**
 * Entidade Principal de Georreferenciamento Interno do Imóvel
 */
export interface PropertyGeometry {
  id: PropertyGeometryId;
  propertyId: string;
  organizationId: string;
  status: PropertyGeometryStatus;
  parcels: LandParcel[];
  totalMetrics: {
    totalAreaSquareMeters: number;
    totalAreaHectares: number;
    totalPerimeterMeters: number;
    totalPerimeterKilometers: number;
    totalVertexCount: number;
    totalVoidCount: number;
    totalParcelCount: number;
  };
  areaComparison?: PropertyAreaComparison;
  validationResult: GeometryValidationResult;
  internalRevision: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Resumo Geoespacial do Imóvel para a listagem
 */
export interface PropertyGeometrySummary {
  propertyId: string;
  hasGeometry: boolean;
  isDraft: boolean;
  parcelCount: number;
  totalVertexCount: number;
  totalAreaHectares: number;
  status: PropertyGeometryStatus;
  updatedAt?: string;
}

/**
 * Payload de Salvamento da Geometria
 */
export interface SavePropertyGeometryInput {
  propertyId: string;
  organizationId: string;
  status: PropertyGeometryStatus;
  parcels: Array<{
    id?: LandParcelId;
    code: string;
    name: string;
    description?: string;
    status?: 'active' | 'in_study' | 'archived';
    outerVertices: Array<{
      id?: GeoVertexId;
      order?: number;
      code?: string;
      coordinate: GeographicCoordinate;
      utmCoordinate?: UtmCoordinate;
      altitudeMeters?: number;
      precisionMeters?: number;
      source?: CoordinateSource;
      notes?: string;
    }>;
    innerVoids?: Array<{
      id?: InnerVoidId;
      name: string;
      description?: string;
      vertices: Array<{
        id?: GeoVertexId;
        order?: number;
        code?: string;
        coordinate: GeographicCoordinate;
        utmCoordinate?: UtmCoordinate;
      }>;
    }>;
    boundarySegments?: Array<{
      id?: BoundarySegmentId;
      fromVertexId: GeoVertexId;
      toVertexId: GeoVertexId;
      boundaryType: BoundaryType;
      description: string;
      adjoiningOwner?: string;
      adjoiningRegistry?: string;
      notaryOffice?: string;
      notes?: string;
    }>;
    dataOrigin?: CoordinateSource;
    referenceDate?: string;
    technicalNotes?: string;
  }>;
}

/**
 * Resultado da Mutação da Geometria
 */
export interface PropertyGeometryMutationResult {
  success: boolean;
  geometry?: PropertyGeometry;
  error?: string;
  validationIssues?: GeometryValidationIssue[];
}

/**
 * Interface do Gateway Geoespacial
 */
export interface PropertyGeometryGateway {
  getPropertyGeometry(propertyId: string, organizationId: string): Promise<PropertyGeometry | null>;
  savePropertyGeometry(input: SavePropertyGeometryInput): Promise<PropertyGeometryMutationResult>;
  getPropertyGeometrySummary(propertyId: string, organizationId: string): Promise<PropertyGeometrySummary>;
  clearPropertyGeometry(propertyId: string, organizationId: string): Promise<{ success: boolean; error?: string }>;
  clearAllSessionData(): Promise<void>;
}
