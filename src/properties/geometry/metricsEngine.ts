/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Motor de Métricas Espaciais e Comparativo de Áreas
 * 
 * Executa os cálculos matemáticos e geodésicos puros:
 * - Área de cada anel (externo e vazios internos)
 * - Área líquida da gleba (Anel Externo - Vazios)
 * - Perímetro total
 * - Centroide e Bounding Box
 * - Confronto analítico com as áreas declaradas, CAR, SNCR e Matrículas
 */

import {
  LandParcel,
  InnerVoid,
  GeometryMetrics,
  PropertyAreaComparison,
  AreaComparisonSource,
} from '../../types/propertyGeometry';
import { Property, RuralProperty, UrbanProperty } from '../../types/property';
import {
  calculateGeodesicArea,
  calculateRingPerimeter,
  calculateApproximateCentroid,
  calculateBoundingBox,
} from './coordinateEngine';

const SQM_TO_HECTARES = 0.0001;

/**
 * Calcula as métricas de um vazio interno
 */
export function calculateInnerVoidMetrics(voidItem: InnerVoid): {
  areaSquareMeters: number;
  areaHectares: number;
  perimeterMeters: number;
} {
  const coords = (voidItem.ring.vertices || [])
    .filter((v) => v.coordinate && !isNaN(v.coordinate.latitude) && !isNaN(v.coordinate.longitude))
    .map((v) => ({
      latitude: v.coordinate.latitude,
      longitude: v.coordinate.longitude,
    }));

  if (coords.length < 3) {
    return {
      areaSquareMeters: 0,
      areaHectares: 0,
      perimeterMeters: 0,
    };
  }

  const areaSquareMeters = calculateGeodesicArea(coords);
  const areaHectares = parseFloat((areaSquareMeters * SQM_TO_HECTARES).toFixed(4));
  const perimeterMeters = parseFloat(calculateRingPerimeter(coords).toFixed(2));

  return {
    areaSquareMeters: parseFloat(areaSquareMeters.toFixed(2)),
    areaHectares,
    perimeterMeters,
  };
}

/**
 * Calcula as métricas completas de uma gleba/parcela
 */
export function calculateParcelMetrics(parcel: LandParcel): GeometryMetrics {
  const outerCoords = (parcel.outerRing.vertices || [])
    .filter((v) => v.coordinate && !isNaN(v.coordinate.latitude) && !isNaN(v.coordinate.longitude))
    .map((v) => ({
      latitude: v.coordinate.latitude,
      longitude: v.coordinate.longitude,
    }));

  if (outerCoords.length < 3) {
    return {
      calculatedAreaSquareMeters: 0,
      calculatedAreaHectares: 0,
      perimeterMeters: 0,
      perimeterKilometers: 0,
      centroid: { latitude: 0, longitude: 0 },
      boundingBox: { minLatitude: 0, maxLatitude: 0, minLongitude: 0, maxLongitude: 0 },
      vertexCount: parcel.outerRing.vertices?.length || 0,
      voidCount: parcel.innerVoids?.length || 0,
      parcelCount: 1,
      calculationMethod: 'geodesic_karney_spherical',
    };
  }

  // 1. Área bruta do anel externo
  const grossAreaSqm = calculateGeodesicArea(outerCoords);
  const outerPerimeterMeters = calculateRingPerimeter(outerCoords);

  // 2. Área e perímetro dos vazios internos
  let totalVoidAreaSqm = 0;
  let totalVoidPerimeterMeters = 0;
  let totalVoidVertices = 0;

  if (parcel.innerVoids && parcel.innerVoids.length > 0) {
    for (const v of parcel.innerVoids) {
      const vMetrics = calculateInnerVoidMetrics(v);
      totalVoidAreaSqm += vMetrics.areaSquareMeters;
      totalVoidPerimeterMeters += vMetrics.perimeterMeters;
      totalVoidVertices += v.ring.vertices?.length || 0;
    }
  }

  // 3. Área líquida (Bruta - Vazios)
  const netAreaSqm = Math.max(0, grossAreaSqm - totalVoidAreaSqm);
  const netAreaHa = parseFloat((netAreaSqm * SQM_TO_HECTARES).toFixed(4));
  const totalPerimeter = parseFloat((outerPerimeterMeters + totalVoidPerimeterMeters).toFixed(2));
  const perimeterKm = parseFloat((totalPerimeter / 1000).toFixed(3));

  const centroid = calculateApproximateCentroid(outerCoords);
  const boundingBox = calculateBoundingBox(outerCoords);

  return {
    calculatedAreaSquareMeters: parseFloat(netAreaSqm.toFixed(2)),
    calculatedAreaHectares: netAreaHa,
    perimeterMeters: totalPerimeter,
    perimeterKilometers: perimeterKm,
    centroid,
    boundingBox,
    vertexCount: (parcel.outerRing.vertices?.length || 0) + totalVoidVertices,
    voidCount: parcel.innerVoids?.length || 0,
    parcelCount: 1,
    calculationMethod: 'geodesic_karney_spherical',
  };
}

function getDiscrepancyLevel(pctDiff: number): 'none' | 'low' | 'medium' | 'high' {
  const absPct = Math.abs(pctDiff);
  if (absPct < 0.5) return 'none';
  if (absPct <= 2.0) return 'low';
  if (absPct <= 5.0) return 'medium';
  return 'high';
}

/**
 * Calcula o comparativo entre a área geodésica calculada e as fontes documentais cadastradas no imóvel
 */
export function calculateAreaComparison(
  calculatedAreaHectares: number,
  calculatedAreaSquareMeters: number,
  property: Property | null
): PropertyAreaComparison {
  const sources: AreaComparisonSource[] = [];

  if (!property) {
    return {
      calculatedAreaHectares,
      calculatedAreaSquareMeters,
      sources,
      summary: {
        overallDiscrepancyLevel: 'none',
      },
    };
  }

  if (property.propertyType === 'rural') {
    const r = property as RuralProperty;

    // 1. Área Total Declarada
    const totalDeclared = parseFloat(r.areas.totalDeclaredAreaHa || '0');
    if (totalDeclared > 0) {
      const diff = calculatedAreaHectares - totalDeclared;
      const pct = (diff / totalDeclared) * 100;
      sources.push({
        sourceName: 'Área Total Declarada (Cadastro)',
        areaHectares: totalDeclared,
        differenceHectares: parseFloat(diff.toFixed(4)),
        differencePercentage: parseFloat(pct.toFixed(2)),
        isRegistered: true,
        discrepancyLevel: getDiscrepancyLevel(pct),
      });
    }

    // 2. Área no CAR
    const carArea = parseFloat(r.areas.carReportedAreaHa || '0');
    if (carArea > 0) {
      const diff = calculatedAreaHectares - carArea;
      const pct = (diff / carArea) * 100;
      sources.push({
        sourceName: 'Área do CAR (Recibo Federal/Estadual)',
        areaHectares: carArea,
        differenceHectares: parseFloat(diff.toFixed(4)),
        differencePercentage: parseFloat(pct.toFixed(2)),
        isRegistered: true,
        discrepancyLevel: getDiscrepancyLevel(pct),
      });
    }

    // 3. Área no SNCR / INCRA (CCIR)
    const sncrArea = parseFloat(r.areas.sncrReportedAreaHa || '0');
    if (sncrArea > 0) {
      const diff = calculatedAreaHectares - sncrArea;
      const pct = (diff / sncrArea) * 100;
      sources.push({
        sourceName: 'Área do SNCR / CCIR (Incra)',
        areaHectares: sncrArea,
        differenceHectares: parseFloat(diff.toFixed(4)),
        differencePercentage: parseFloat(pct.toFixed(2)),
        isRegistered: true,
        discrepancyLevel: getDiscrepancyLevel(pct),
      });
    }

    // 4. Soma das Matrículas Cartorárias
    const totalMatriculasHa = r.registrations.reduce((acc, reg) => {
      const val = parseFloat(reg.registeredArea || '0');
      if (reg.areaUnit === 'm²') {
        return acc + val * SQM_TO_HECTARES;
      }
      return acc + (isNaN(val) ? 0 : val);
    }, 0);

    if (totalMatriculasHa > 0) {
      const diff = calculatedAreaHectares - totalMatriculasHa;
      const pct = (diff / totalMatriculasHa) * 100;
      sources.push({
        sourceName: `Soma das Matrículas (${r.registrations.length} registro${r.registrations.length > 1 ? 's' : ''})`,
        areaHectares: parseFloat(totalMatriculasHa.toFixed(4)),
        differenceHectares: parseFloat(diff.toFixed(4)),
        differencePercentage: parseFloat(pct.toFixed(2)),
        isRegistered: true,
        discrepancyLevel: getDiscrepancyLevel(pct),
      });
    }
  } else {
    // Imóvel Urbano
    const u = property as UrbanProperty;
    const landAreaM2 = parseFloat(u.areas.landAreaM2 || '0');
    const landAreaHa = parseFloat((landAreaM2 * SQM_TO_HECTARES).toFixed(4));

    if (landAreaHa > 0) {
      const diff = calculatedAreaHectares - landAreaHa;
      const pct = (diff / landAreaHa) * 100;
      sources.push({
        sourceName: `Área do Terreno Urbano (${landAreaM2.toLocaleString('pt-BR')} m²)`,
        areaHectares: landAreaHa,
        differenceHectares: parseFloat(diff.toFixed(4)),
        differencePercentage: parseFloat(pct.toFixed(2)),
        isRegistered: true,
        discrepancyLevel: getDiscrepancyLevel(pct),
      });
    }

    // Matrículas urbanas
    const totalMatriculasM2 = u.registrations.reduce((acc, reg) => {
      const val = parseFloat(reg.registeredArea || '0');
      if (reg.areaUnit === 'ha') {
        return acc + val / SQM_TO_HECTARES;
      }
      return acc + (isNaN(val) ? 0 : val);
    }, 0);

    if (totalMatriculasM2 > 0) {
      const matriculasHa = parseFloat((totalMatriculasM2 * SQM_TO_HECTARES).toFixed(4));
      const diff = calculatedAreaHectares - matriculasHa;
      const pct = (diff / matriculasHa) * 100;
      sources.push({
        sourceName: `Soma das Matrículas Urbanas (${totalMatriculasM2.toLocaleString('pt-BR')} m²)`,
        areaHectares: matriculasHa,
        differenceHectares: parseFloat(diff.toFixed(4)),
        differencePercentage: parseFloat(pct.toFixed(2)),
        isRegistered: true,
        discrepancyLevel: getDiscrepancyLevel(pct),
      });
    }
  }

  let overall: 'none' | 'low' | 'medium' | 'high' = 'none';
  if (sources.some((s) => s.discrepancyLevel === 'high')) {
    overall = 'high';
  } else if (sources.some((s) => s.discrepancyLevel === 'medium')) {
    overall = 'medium';
  } else if (sources.some((s) => s.discrepancyLevel === 'low')) {
    overall = 'low';
  }

  return {
    calculatedAreaHectares,
    calculatedAreaSquareMeters,
    sources,
    summary: {
      overallDiscrepancyLevel: overall,
    },
  };
}
