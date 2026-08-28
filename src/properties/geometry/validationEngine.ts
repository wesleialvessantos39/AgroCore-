/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Motor de Validação Geométrica e Topológica Pura
 * 
 * Classifica inconsistências em:
 * - 'error': Impede validação técnica / inconsistência fatal
 * - 'warning': Alerta técnico para revisão (ex: sobreposição entre glebas, formato não usual)
 * - 'info': Sugestão / observação geométrica
 */

import {
  GeoRing,
  InnerVoid,
  LandParcel,
  GeometryValidationIssue,
  GeometryValidationResult,
  GeographicCoordinate,
} from '../../types/propertyGeometry';
import { calculateGeodesicArea } from './coordinateEngine';

const EPSILON = 1e-9;

/**
 * Verifica se dois segmentos [p1, p2] e [p3, p4] se interceptam estritamente (em cruzamento no interior)
 */
function doSegmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): boolean {
  function ccw(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  }

  // Se compartilham vértices de extremidade, não é autointerseção de interior
  const isShared =
    (Math.abs(p1.x - p3.x) < EPSILON && Math.abs(p1.y - p3.y) < EPSILON) ||
    (Math.abs(p1.x - p4.x) < EPSILON && Math.abs(p1.y - p4.y) < EPSILON) ||
    (Math.abs(p2.x - p3.x) < EPSILON && Math.abs(p2.y - p3.y) < EPSILON) ||
    (Math.abs(p2.x - p4.x) < EPSILON && Math.abs(p2.y - p4.y) < EPSILON);

  if (isShared) {
    return false;
  }

  return (
    ccw(p1, p3, p4) !== ccw(p2, p3, p4) &&
    ccw(p1, p2, p3) !== ccw(p1, p2, p4)
  );
}

/**
 * Verifica se um anel possui autointerseção em qualquer um dos seus segmentos
 */
export function hasSelfIntersection(
  coordinates: Array<{ latitude: number; longitude: number }>
): boolean {
  const n = coordinates.length;
  if (n < 4) return false;

  const points = coordinates.map((c) => ({ x: c.longitude, y: c.latitude }));

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];

    for (let j = i + 1; j < n; j++) {
      // Segmentos adjacentes não podem se autointerceptar estritamente
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) {
        continue;
      }

      const p3 = points[j];
      const p4 = points[(j + 1) % n];

      if (doSegmentsIntersect(p1, p2, p3, p4)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Algoritmo Ray-Casting (Point-in-Polygon)
 * Retorna true se o ponto estiver dentro do polígono
 */
export function isPointInsidePolygon(
  point: { latitude: number; longitude: number },
  polygon: Array<{ latitude: number; longitude: number }>
): boolean {
  let inside = false;
  const x = point.longitude;
  const y = point.latitude;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + EPSILON) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Valida se um anel de coordenadas é geometricamente consistente
 */
export function validateGeoRing(
  ring: GeoRing,
  contextName: string,
  parcelId?: string,
  voidId?: string
): GeometryValidationIssue[] {
  const issues: GeometryValidationIssue[] = [];
  const vertices = ring.vertices || [];

  if (vertices.length < 3) {
    issues.push({
      code: 'INSUFFICIENT_VERTICES',
      severity: 'error',
      message: `${contextName} possui menos de 3 vértices (${vertices.length}). São necessários ao menos 3 vértices para formar uma área fechada.`,
      parcelId,
      voidId,
    });
    return issues;
  }

  // Verifica coordenadas individuais e nulas/parciais
  for (const v of vertices) {
    const lat = v.coordinate?.latitude;
    const lon = v.coordinate?.longitude;

    if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
      issues.push({
        code: 'PARTIAL_COORDINATE',
        severity: 'error',
        message: `Vértice ${v.code || v.order} possui coordenadas parciais ou inválidas.`,
        parcelId,
        voidId,
        vertexId: v.id,
      });
      continue;
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      issues.push({
        code: 'INVALID_COORDINATE',
        severity: 'error',
        message: `Vértice ${v.code || v.order} com latitude/longitude fora do intervalo geográfico válido (-90 a +90 / -180 a +180).`,
        parcelId,
        voidId,
        vertexId: v.id,
      });
    }
  }

  // Verifica vértices consecutivos duplicados
  for (let i = 0; i < vertices.length; i++) {
    const nextIdx = (i + 1) % vertices.length;
    const v1 = vertices[i];
    const v2 = vertices[nextIdx];

    if (
      v1.coordinate &&
      v2.coordinate &&
      Math.abs(v1.coordinate.latitude - v2.coordinate.latitude) < EPSILON &&
      Math.abs(v1.coordinate.longitude - v2.coordinate.longitude) < EPSILON
    ) {
      issues.push({
        code: 'DUPLICATE_CONSECUTIVE_VERTICES',
        severity: 'error',
        message: `Vértices consecutivos ${v1.code || v1.order} e ${v2.code || v2.order} possuem a mesma posição no ${contextName}.`,
        parcelId,
        voidId,
        vertexId: v1.id,
      });
    }
  }

  const coords = vertices
    .filter((v) => v.coordinate && !isNaN(v.coordinate.latitude) && !isNaN(v.coordinate.longitude))
    .map((v) => ({
      latitude: v.coordinate.latitude,
      longitude: v.coordinate.longitude,
    }));

  if (coords.length >= 3) {
    // Área zero
    const area = calculateGeodesicArea(coords);
    if (area < 0.01) {
      issues.push({
        code: 'ZERO_AREA',
        severity: 'error',
        message: `${contextName} possui área calculada nula (vértices colineares ou coincidentes).`,
        parcelId,
        voidId,
      });
    }

    // Autointerseção
    if (hasSelfIntersection(coords)) {
      issues.push({
        code: 'SELF_INTERSECTING_RING',
        severity: 'error',
        message: `${contextName} apresenta autointerseção em seus segmentos de contorno.`,
        parcelId,
        voidId,
      });
    }
  }

  return issues;
}

/**
 * Valida os vazios internos em relação ao anel externo da gleba
 */
export function validateInnerVoids(
  outerRing: GeoRing,
  innerVoids: InnerVoid[],
  parcelId: string
): GeometryValidationIssue[] {
  const issues: GeometryValidationIssue[] = [];
  const outerCoords = (outerRing.vertices || []).map((v) => ({
    latitude: v.coordinate.latitude,
    longitude: v.coordinate.longitude,
  }));

  if (outerCoords.length < 3) return issues;

  // Valida cada vazio individualmente
  for (const v of innerVoids) {
    const voidIssues = validateGeoRing(v.ring, `Vazio interno "${v.name}"`, parcelId, v.id);
    issues.push(...voidIssues);

    const voidCoords = (v.ring.vertices || []).map((vx) => ({
      latitude: vx.coordinate.latitude,
      longitude: vx.coordinate.longitude,
    }));

    if (voidCoords.length >= 3) {
      // Verifica se todos os vértices do vazio estão dentro do anel externo
      let allInside = true;
      for (const pt of voidCoords) {
        if (!isPointInsidePolygon(pt, outerCoords)) {
          allInside = false;
          break;
        }
      }

      if (!allInside) {
        issues.push({
          code: 'VOID_OUTSIDE_OUTER_RING',
          severity: 'error',
          message: `O vazio interno "${v.name}" possui vértices localizados fora do perímetro externo da gleba.`,
          parcelId,
          voidId: v.id,
        });
      }

      // Verifica se o vazio cruza a borda do anel externo
      let crossesOuter = false;
      const nOut = outerCoords.length;
      const nVoid = voidCoords.length;

      for (let i = 0; i < nOut; i++) {
        const p1 = { x: outerCoords[i].longitude, y: outerCoords[i].latitude };
        const p2 = { x: outerCoords[(i + 1) % nOut].longitude, y: outerCoords[(i + 1) % nOut].latitude };

        for (let j = 0; j < nVoid; j++) {
          const p3 = { x: voidCoords[j].longitude, y: voidCoords[j].latitude };
          const p4 = { x: voidCoords[(j + 1) % nVoid].longitude, y: voidCoords[(j + 1) % nVoid].latitude };

          if (doSegmentsIntersect(p1, p2, p3, p4)) {
            crossesOuter = true;
            break;
          }
        }
        if (crossesOuter) break;
      }

      if (crossesOuter) {
        issues.push({
          code: 'VOID_CROSSING_OUTER_RING',
          severity: 'error',
          message: `O limite do vazio interno "${v.name}" intercepta a divisa externa da gleba.`,
          parcelId,
          voidId: v.id,
        });
      }
    }
  }

  // Verifica sobreposição entre múltiplos vazios internos
  for (let i = 0; i < innerVoids.length; i++) {
    for (let j = i + 1; j < innerVoids.length; j++) {
      const v1 = innerVoids[i];
      const v2 = innerVoids[j];

      const c1 = (v1.ring.vertices || []).map((vx) => ({
        latitude: vx.coordinate.latitude,
        longitude: vx.coordinate.longitude,
      }));
      const c2 = (v2.ring.vertices || []).map((vx) => ({
        latitude: vx.coordinate.latitude,
        longitude: vx.coordinate.longitude,
      }));

      if (c1.length >= 3 && c2.length >= 3) {
        // Verifica se algum ponto de v1 está em v2 ou vice-versa
        let overlaps = false;
        for (const pt of c1) {
          if (isPointInsidePolygon(pt, c2)) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) {
          for (const pt of c2) {
            if (isPointInsidePolygon(pt, c1)) {
              overlaps = true;
              break;
            }
          }
        }

        if (overlaps) {
          issues.push({
            code: 'OVERLAPPING_VOIDS',
            severity: 'error',
            message: `Os vazios internos "${v1.name}" e "${v2.name}" apresentam sobreposição geométrica mútua.`,
            parcelId,
            voidId: v1.id,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Validação completa de todas as glebas e parcelas de um imóvel
 */
export function validatePropertyGeometry(parcels: LandParcel[]): GeometryValidationResult {
  const issues: GeometryValidationIssue[] = [];

  if (!parcels || parcels.length === 0) {
    return {
      isValid: true,
      hasErrors: false,
      hasWarnings: false,
      issues: [],
    };
  }

  // Validação individual de cada parcela
  for (const parcel of parcels) {
    const outerIssues = validateGeoRing(parcel.outerRing, `Gleba/Parcela "${parcel.name || parcel.code}"`, parcel.id);
    issues.push(...outerIssues);

    if (parcel.innerVoids && parcel.innerVoids.length > 0) {
      const voidIssues = validateInnerVoids(parcel.outerRing, parcel.innerVoids, parcel.id);
      issues.push(...voidIssues);
    }
  }

  // Validação de potencial sobreposição entre múltiplas glebas (Alerta Técnico)
  if (parcels.length > 1) {
    for (let i = 0; i < parcels.length; i++) {
      for (let j = i + 1; j < parcels.length; j++) {
        const p1 = parcels[i];
        const p2 = parcels[j];

        const c1 = (p1.outerRing.vertices || []).map((v) => ({
          latitude: v.coordinate.latitude,
          longitude: v.coordinate.longitude,
        }));
        const c2 = (p2.outerRing.vertices || []).map((v) => ({
          latitude: v.coordinate.latitude,
          longitude: v.coordinate.longitude,
        }));

        if (c1.length >= 3 && c2.length >= 3) {
          let hasPointOverlap = false;
          for (const pt of c1) {
            if (isPointInsidePolygon(pt, c2)) {
              hasPointOverlap = true;
              break;
            }
          }
          if (!hasPointOverlap) {
            for (const pt of c2) {
              if (isPointInsidePolygon(pt, c1)) {
                hasPointOverlap = true;
                break;
              }
            }
          }

          if (hasPointOverlap) {
            issues.push({
              code: 'POTENTIAL_PARCEL_OVERLAP',
              severity: 'warning',
              message: `As glebas "${p1.name || p1.code}" e "${p2.name || p2.code}" possuem indício de sobreposição geométrica. Recomenda-se conferência técnica dos limites.`,
              parcelId: p1.id,
            });
          }
        }
      }
    }
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  const hasWarnings = issues.some((i) => i.severity === 'warning');

  return {
    isValid: !hasErrors,
    hasErrors,
    hasWarnings,
    issues,
  };
}
