/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Motor Geodésico e de Conversão de Coordenadas
 * 
 * Suporte a:
 * - Graus Decimais (SIRGAS2000 / WGS84 / SAD69)
 * - Graus, Minutos e Segundos (DMS)
 * - Coordenadas Projetadas UTM (Elipsoide GRS80 / SIRGAS2000, WGS84, SAD69)
 * - Cálculo de Área e Perímetro Geodésicos Estimados (Excesso Esférico de Girard)
 * - Orientação Técnica do Anel Perimetral
 * - Identificação do Vértice Mais ao Norte (e Oeste)
 * 
 * NOTA TÉCNICA E GEODÉSICA:
 * - SIRGAS2000 é o Sistema Geodésico Oficial Brasileiro (IBGE / Decreto 5.334/2005), baseado no Elipsoide GRS80.
 * - WGS84 é um sistema global distinto com parâmetros elipsoidais próprios.
 * - As coordenadas não são renomeadas silenciosamente entre datums distintos.
 */

import {
  GeographicCoordinate,
  UtmCoordinate,
  DmsCoordinate,
  CoordinateReferenceSystem,
} from '../../types/propertyGeometry';

export interface EllipsoidParameters {
  name: string;
  crs: CoordinateReferenceSystem;
  a: number; // Semieixo maior em metros
  invF: number; // Inverso do achatamento (1/f)
  f: number; // Achatamento
  b: number; // Semieixo menor
  e2: number; // Primeira excentricidade ao quadrado
  ePrime2: number; // Segunda excentricidade ao quadrado
}

/**
 * Parâmetros Oficiais dos Elipsoides Geodésicos
 */
export const ELLIPSOIDS: Record<CoordinateReferenceSystem, EllipsoidParameters> = {
  // SIRGAS2000: Oficial do Brasil (GRS80)
  SIRGAS2000: (() => {
    const a = 6378137.0;
    const invF = 298.257222101;
    const f = 1 / invF;
    const b = a * (1 - f);
    const e2 = (a * a - b * b) / (a * a);
    const ePrime2 = (a * a - b * b) / (b * b);
    return { name: 'GRS80 (SIRGAS2000)', crs: 'SIRGAS2000', a, invF, f, b, e2, ePrime2 };
  })(),
  // WGS84: Global
  WGS84: (() => {
    const a = 6378137.0;
    const invF = 298.257223563;
    const f = 1 / invF;
    const b = a * (1 - f);
    const e2 = (a * a - b * b) / (a * a);
    const ePrime2 = (a * a - b * b) / (b * b);
    return { name: 'WGS84', crs: 'WGS84', a, invF, f, b, e2, ePrime2 };
  })(),
  // SAD69: Histórico Brasileiro
  SAD69: (() => {
    const a = 6378160.0;
    const invF = 298.25;
    const f = 1 / invF;
    const b = a * (1 - f);
    const e2 = (a * a - b * b) / (a * a);
    const ePrime2 = (a * a - b * b) / (b * b);
    return { name: 'UGGI 1967 (SAD69)', crs: 'SAD69', a, invF, f, b, e2, ePrime2 };
  })(),
};

export function getEllipsoid(crs?: CoordinateReferenceSystem): EllipsoidParameters {
  if (crs && ELLIPSOIDS[crs]) {
    return ELLIPSOIDS[crs];
  }
  return ELLIPSOIDS.SIRGAS2000;
}

const UTM_K0 = 0.9996; // Fator de escala no meridiano central
const EARTH_RADIUS_AUTHALIC = 6371008.8; // Raio esférico médio autálico em metros

// Constantes de conversão angular
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Converte valor decimal para DMS formatado
 */
export function decimalToDmsString(val: number, isLatitude: boolean): string {
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;

  let hemisphere = '';
  if (isLatitude) {
    hemisphere = val >= 0 ? 'N' : 'S';
  } else {
    hemisphere = val >= 0 ? 'E' : 'W';
  }

  const secFormatted = sec.toFixed(3).padStart(6, '0');
  const degFormatted = deg.toString().padStart(isLatitude ? 2 : 3, '0');
  const minFormatted = min.toString().padStart(2, '0');

  return `${degFormatted}°${minFormatted}'${secFormatted}"${hemisphere}`;
}

/**
 * Converte componentes DMS para Decimal
 */
export function dmsToDecimal(dms: DmsCoordinate): number {
  const { degrees, minutes, seconds, hemisphere } = dms;
  let dec = Math.abs(degrees) + Math.abs(minutes) / 60 + Math.abs(seconds) / 3600;
  if (hemisphere === 'S' || hemisphere === 'W') {
    dec = -dec;
  }
  return dec;
}

/**
 * Tenta fazer o parse de uma string no formato DMS
 * Aceita formatos como:
 * - 15°47'38.12"S
 * - 15 47 38.12 S
 * - -15° 47' 38.12"
 */
export function parseDmsString(input: string, isLatitude: boolean): number | null {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();
  if (!clean) return null;

  // Regex abrangente para formatos comuns de DMS
  const dmsRegex = /^([+-]?\d+)[°\s]+(\d+)['\s]+(\d+(?:[.,]\d+)?)["]?\s*([NSEWnsew]?)$/;
  const match = clean.match(dmsRegex);

  if (match) {
    const deg = parseInt(match[1], 10);
    const min = parseInt(match[2], 10);
    const sec = parseFloat(match[3].replace(',', '.'));
    let hemi = match[4].toUpperCase();

    if (min < 0 || min >= 60 || sec < 0 || sec >= 60) {
      return null;
    }

    if (!hemi) {
      hemi = deg < 0 ? (isLatitude ? 'S' : 'W') : (isLatitude ? 'N' : 'E');
    }

    let dec = Math.abs(deg) + min / 60 + sec / 3600;
    if (hemi === 'S' || hemi === 'W' || deg < 0) {
      dec = -Math.abs(dec);
    }
    return dec;
  }

  // Se não for DMS com símbolos, tenta interpretar como decimal direto
  const decVal = parseFloat(clean.replace(',', '.'));
  if (!isNaN(decVal)) {
    return decVal;
  }

  return null;
}

/**
 * Deriva o meridiano central de um fuso UTM
 */
export function getCentralMeridian(zone: number): number {
  return zone * 6 - 183;
}

/**
 * Determina o fuso UTM a partir da longitude
 */
export function getUtmZoneFromLongitude(lon: number): number {
  return Math.floor((lon + 180) / 6) + 1;
}

/**
 * Converte Coordenadas Geográficas (Lat/Lon) para UTM (SIRGAS2000, WGS84, SAD69)
 */
export function geographicToUtm(
  lat: number,
  lon: number,
  forcedZone?: number,
  crs: CoordinateReferenceSystem = 'SIRGAS2000'
): UtmCoordinate {
  const ellipsoid = getEllipsoid(crs);
  const a = ellipsoid.a;
  const e2 = ellipsoid.e2;
  const ePrime2 = ellipsoid.ePrime2;

  const zone = forcedZone || getUtmZoneFromLongitude(lon);
  const lambda0 = getCentralMeridian(zone) * DEG_TO_RAD;

  const phi = lat * DEG_TO_RAD;
  const lambda = lon * DEG_TO_RAD;

  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi));
  const T = Math.tan(phi) * Math.tan(phi);
  const C = ePrime2 * Math.cos(phi) * Math.cos(phi);
  const A = Math.cos(phi) * (lambda - lambda0);

  // Arco meridional M
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * phi));

  // Easting (Coordenada Este)
  const easting =
    UTM_K0 *
      N *
      (A +
        ((1 - T + C) * A * A * A) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ePrime2) * A * A * A * A * A) / 120) +
    500000.0;

  // Northing (Coordenada Norte)
  let northing =
    UTM_K0 *
    (M +
      N *
        Math.tan(phi) *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A * A * A * A) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ePrime2) * A * A * A * A * A * A) / 720));

  const hemisphere = lat < 0 ? 'S' : 'N';
  if (hemisphere === 'S') {
    northing += 10000000.0; // Falso Norte para hemisfério Sul
  }

  return {
    type: 'utm',
    crs,
    easting: parseFloat(easting.toFixed(3)),
    northing: parseFloat(northing.toFixed(3)),
    zone,
    hemisphere,
    centralMeridian: getCentralMeridian(zone),
  };
}

/**
 * Converte Coordenadas UTM para Geográficas (Lat/Lon) respeitando o Datum de Origem
 */
export function utmToGeographic(utm: UtmCoordinate): GeographicCoordinate {
  const { easting, northing, zone, hemisphere, crs } = utm;
  const targetCrs = crs || 'SIRGAS2000';
  const ellipsoid = getEllipsoid(targetCrs);
  const a = ellipsoid.a;
  const e2 = ellipsoid.e2;
  const ePrime2 = ellipsoid.ePrime2;

  const x = easting - 500000.0; // Remove falso este
  let y = northing;
  if (hemisphere === 'S') {
    y -= 10000000.0; // Remove falso norte
  }

  const lambda0 = getCentralMeridian(zone) * DEG_TO_RAD;

  const M = y / UTM_K0;
  const mu =
    M /
    (a *
      (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 * e1 * e1 * e1) / 512) * Math.sin(8 * mu);

  const C1 = ePrime2 * Math.cos(phi1) * Math.cos(phi1);
  const T1 = Math.tan(phi1) * Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) * Math.sin(phi1));
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * Math.sin(phi1) * Math.sin(phi1), 1.5);
  const D = x / (N1 * UTM_K0);

  // Latitude
  const latRad =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ePrime2) * D * D * D * D) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ePrime2 - 3 * C1 * C1) *
          D *
          D *
          D *
          D *
          D *
          D) /
          720);

  // Longitude
  const lonRad =
    lambda0 +
    (D -
      ((1 + 2 * T1 + C1) * D * D * D) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ePrime2 + 24 * T1 * T1) * D * D * D * D * D) /
        120) /
      Math.cos(phi1);

  const latitude = parseFloat((latRad * RAD_TO_DEG).toFixed(8));
  const longitude = parseFloat((lonRad * RAD_TO_DEG).toFixed(8));

  return {
    type: 'geographic',
    crs: targetCrs,
    latitude,
    longitude,
    dmsLatitude: decimalToDmsString(latitude, true),
    dmsLongitude: decimalToDmsString(longitude, false),
  };
}

/**
 * Calcula distância geodésica em metros entre dois pontos (Fórmula de Haversine / Grande Círculo)
 */
export function calculateGeodesicDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const deltaPhi = (lat2 - lat1) * DEG_TO_RAD;
  const deltaLambda = (lon2 - lon1) * DEG_TO_RAD;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_AUTHALIC * c;
}

/**
 * Calcula a área geodésica estimada de um polígono em metros quadrados
 * Usa a fórmula do excesso esférico de Girard / Shoelace esférico
 */
export function calculateGeodesicArea(coordinates: Array<{ latitude: number; longitude: number }>): number {
  const n = coordinates.length;
  if (n < 3) return 0;

  // Garante fechamento lógico no cálculo
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = coordinates[i];
    const p2 = coordinates[j];

    const lat1 = p1.latitude * DEG_TO_RAD;
    const lat2 = p2.latitude * DEG_TO_RAD;
    const lon1 = p1.longitude * DEG_TO_RAD;
    const lon2 = p2.longitude * DEG_TO_RAD;

    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = (area * EARTH_RADIUS_AUTHALIC * EARTH_RADIUS_AUTHALIC) / 2.0;
  return Math.abs(area);
}

/**
 * Calcula o perímetro de um anel em metros
 */
export function calculateRingPerimeter(coordinates: Array<{ latitude: number; longitude: number }>): number {
  const n = coordinates.length;
  if (n < 2) return 0;

  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const nextIdx = (i + 1) % n;
    perimeter += calculateGeodesicDistance(
      coordinates[i].latitude,
      coordinates[i].longitude,
      coordinates[nextIdx].latitude,
      coordinates[nextIdx].longitude
    );
  }

  return perimeter;
}

/**
 * Calcula a área plana (Shoelace) com coordenadas projetadas (ex: UTM)
 * Retorna valor assinado (+ se horário em coordenadas de tela, ou conforme convenção)
 */
export function calculateShoelaceArea(points: Array<{ x: number; y: number }>): number {
  const n = points.length;
  if (n < 3) return 0;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2.0;
}

/**
 * Determina a orientação de um anel geográfico:
 * Retorna true se for Sentido Horário (Clockwise)
 */
export function isClockwiseOrientation(coordinates: Array<{ latitude: number; longitude: number }>): boolean {
  const n = coordinates.length;
  if (n < 3) return false;

  // Calculamos a soma sobre as arestas: (x2 - x1) * (y2 + y1) onde x=lon, y=lat
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = coordinates[i];
    const p2 = coordinates[j];
    sum += (p2.longitude - p1.longitude) * (p2.latitude + p1.latitude);
  }

  // Em coordenadas cartesianas (lon=x, lat=y), sum > 0 indica sentido horário
  return sum > 0;
}

/**
 * Encontra o índice do vértice mais ao norte.
 * Critério de desempate: vértice mais a oeste (menor longitude).
 */
export function findNorthernmostVertexIndex(
  coordinates: Array<{ latitude: number; longitude: number }>
): number {
  if (coordinates.length === 0) return -1;

  let bestIndex = 0;
  let maxLat = coordinates[0].latitude;
  let minLon = coordinates[0].longitude;

  const EPSILON = 1e-8;

  for (let i = 1; i < coordinates.length; i++) {
    const curr = coordinates[i];
    if (curr.latitude > maxLat + EPSILON) {
      maxLat = curr.latitude;
      minLon = curr.longitude;
      bestIndex = i;
    } else if (Math.abs(curr.latitude - maxLat) <= EPSILON) {
      // Empate na latitude -> desempate pelo mais a oeste (menor longitude)
      if (curr.longitude < minLon) {
        minLon = curr.longitude;
        bestIndex = i;
      }
    }
  }

  return bestIndex;
}

/**
 * Reorganiza uma lista de vértices para o Padrão de Referência Técnica:
 * 1. Sentido Horário
 * 2. Inicia no vértice mais ao norte (desempate: mais a oeste)
 * 3. Preserva todos os atributos originais dos vértices
 */
export function organizeVerticesForTechnicalReference<T extends { coordinate: GeographicCoordinate }>(
  vertices: readonly T[]
): T[] {
  if (vertices.length < 3) return [...vertices];

  const coords = vertices.map((v) => ({
    latitude: v.coordinate.latitude,
    longitude: v.coordinate.longitude,
  }));

  const isCw = isClockwiseOrientation(coords);
  let orderedList = [...vertices];

  // Se estiver em sentido anti-horário, inverte a ordem
  if (!isCw) {
    orderedList.reverse();
  }

  // Encontra o novo índice do vértice mais ao norte
  const reorderedCoords = orderedList.map((v) => ({
    latitude: v.coordinate.latitude,
    longitude: v.coordinate.longitude,
  }));

  const startIdx = findNorthernmostVertexIndex(reorderedCoords);

  if (startIdx <= 0) {
    return orderedList;
  }

  // Rotaciona a lista para iniciar em startIdx
  return [...orderedList.slice(startIdx), ...orderedList.slice(0, startIdx)];
}

/**
 * Calcula o centroide aproximado de uma lista de coordenadas
 */
export function calculateApproximateCentroid(
  coordinates: Array<{ latitude: number; longitude: number }>
): { latitude: number; longitude: number } {
  if (coordinates.length === 0) {
    return { latitude: 0, longitude: 0 };
  }

  let totalLat = 0;
  let totalLon = 0;

  for (const c of coordinates) {
    totalLat += c.latitude;
    totalLon += c.longitude;
  }

  return {
    latitude: parseFloat((totalLat / coordinates.length).toFixed(7)),
    longitude: parseFloat((totalLon / coordinates.length).toFixed(7)),
  };
}

/**
 * Calcula a caixa delimitadora (Bounding Box)
 */
export function calculateBoundingBox(
  coordinates: Array<{ latitude: number; longitude: number }>
): {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
} {
  if (coordinates.length === 0) {
    return { minLatitude: 0, maxLatitude: 0, minLongitude: 0, maxLongitude: 0 };
  }

  let minLat = coordinates[0].latitude;
  let maxLat = coordinates[0].latitude;
  let minLon = coordinates[0].longitude;
  let maxLon = coordinates[0].longitude;

  for (const c of coordinates) {
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLon) minLon = c.longitude;
    if (c.longitude > maxLon) maxLon = c.longitude;
  }

  return {
    minLatitude: minLat,
    maxLatitude: maxLat,
    minLongitude: minLon,
    maxLongitude: maxLon,
  };
}
