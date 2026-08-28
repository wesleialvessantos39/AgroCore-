/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Gateway Preview de Georreferenciamento Interno (Volátil / Isolado por Org / Inicia Vazio)
 */

import {
  PropertyGeometryGateway,
  PropertyGeometry,
  PropertyGeometrySummary,
  SavePropertyGeometryInput,
  PropertyGeometryMutationResult,
  LandParcel,
  GeoVertex,
  InnerVoid,
  BoundarySegment,
} from '../../types/propertyGeometry';
import { calculateParcelMetrics, calculateAreaComparison } from './metricsEngine';
import { validatePropertyGeometry } from './validationEngine';
import { getPropertyGateway } from '../gatewayFactory';

export class PreviewPropertyGeometryGateway implements PropertyGeometryGateway {
  // Mapa indexado por: `${organizationId}:${propertyId}`
  private readonly storage = new Map<string, PropertyGeometry>();

  /**
   * Limpa integralmente a memória volátil (utilizado no logout ou reinício de sessão).
   * Implementa o contrato canônico clearAllSessionData().
   */
  async clearAllSessionData(): Promise<void> {
    this.storage.clear();
  }

  /**
   * Alias de compatibilidade para clearAllSessionData.
   */
  async clearTemporaryData(): Promise<void> {
    await this.clearAllSessionData();
  }

  private getKey(organizationId: string, propertyId: string): string {
    return `${organizationId}:${propertyId}`;
  }

  async getPropertyGeometry(
    propertyId: string,
    organizationId: string
  ): Promise<PropertyGeometry | null> {
    if (!propertyId || !organizationId) return null;
    const key = this.getKey(organizationId, propertyId);
    const existing = this.storage.get(key);
    if (!existing) return null;
    return existing;
  }

  async getPropertyGeometrySummary(
    propertyId: string,
    organizationId: string
  ): Promise<PropertyGeometrySummary> {
    if (!propertyId || !organizationId) {
      return {
        propertyId,
        hasGeometry: false,
        isDraft: false,
        parcelCount: 0,
        totalVertexCount: 0,
        totalAreaHectares: 0,
        status: 'draft',
      };
    }

    const key = this.getKey(organizationId, propertyId);
    const geom = this.storage.get(key);

    if (!geom || geom.parcels.length === 0) {
      return {
        propertyId,
        hasGeometry: false,
        isDraft: false,
        parcelCount: 0,
        totalVertexCount: 0,
        totalAreaHectares: 0,
        status: 'draft',
      };
    }

    return {
      propertyId,
      hasGeometry: true,
      isDraft: geom.status === 'draft',
      parcelCount: geom.parcels.length,
      totalVertexCount: geom.totalMetrics.totalVertexCount,
      totalAreaHectares: geom.totalMetrics.totalAreaHectares,
      status: geom.status,
      updatedAt: geom.updatedAt,
    };
  }

  async savePropertyGeometry(
    input: SavePropertyGeometryInput
  ): Promise<PropertyGeometryMutationResult> {
    const { propertyId, organizationId, status, parcels: inputParcels } = input;

    if (!propertyId || !organizationId) {
      return {
        success: false,
        error: 'Identificador do imóvel ou organização não informado.',
      };
    }

    // Constrói as parcelas completas com cálculo de métricas
    const now = new Date().toISOString();
    const existingKey = this.getKey(organizationId, propertyId);
    const previous = this.storage.get(existingKey);

    const builtParcels: LandParcel[] = (inputParcels || []).map((p, pIdx) => {
      const parcelId = p.id || `parcel_${Date.now()}_${pIdx}_${Math.random().toString(36).substring(2, 7)}`;

      const outerVertices: GeoVertex[] = (p.outerVertices || []).map((v, vIdx) => ({
        id: v.id || `vtx_${Date.now()}_${vIdx}_${Math.random().toString(36).substring(2, 6)}`,
        order: v.order ?? vIdx + 1,
        code: v.code || `V-${(v.order ?? vIdx + 1).toString().padStart(2, '0')}`,
        coordinate: v.coordinate,
        utmCoordinate: v.utmCoordinate,
        altitudeMeters: v.altitudeMeters,
        precisionMeters: v.precisionMeters,
        source: v.source || p.dataOrigin || 'manual_entry',
        notes: v.notes,
      }));

      const innerVoids: InnerVoid[] = (p.innerVoids || []).map((iv, ivIdx) => {
        const voidId = iv.id || `void_${Date.now()}_${ivIdx}_${Math.random().toString(36).substring(2, 6)}`;
        const voidVertices: GeoVertex[] = (iv.vertices || []).map((vv, vvIdx) => ({
          id: vv.id || `void_vtx_${Date.now()}_${vvIdx}`,
          order: vv.order ?? vvIdx + 1,
          code: vv.code || `VZ-${(vv.order ?? vvIdx + 1).toString().padStart(2, '0')}`,
          coordinate: vv.coordinate,
          utmCoordinate: vv.utmCoordinate,
          source: p.dataOrigin || 'manual_entry',
        }));

        return {
          id: voidId,
          name: iv.name || `Vazio Interno ${ivIdx + 1}`,
          description: iv.description,
          ring: {
            type: 'inner',
            vertices: voidVertices,
          },
        };
      });

      const boundarySegments: BoundarySegment[] = (p.boundarySegments || []).map((b, bIdx) => ({
        id: b.id || `bnd_${Date.now()}_${bIdx}`,
        fromVertexId: b.fromVertexId,
        toVertexId: b.toVertexId,
        boundaryType: b.boundaryType,
        description: b.description,
        adjoiningOwner: b.adjoiningOwner,
        adjoiningRegistry: b.adjoiningRegistry,
        notaryOffice: b.notaryOffice,
        notes: b.notes,
      }));

      const interimParcel: LandParcel = {
        id: parcelId,
        code: p.code || `Gleba ${(pIdx + 1).toString().padStart(2, '0')}`,
        name: p.name || `Gleba ${pIdx + 1}`,
        description: p.description,
        status: p.status || 'active',
        outerRing: {
          type: 'outer',
          vertices: outerVertices,
        },
        innerVoids,
        boundarySegments,
        metrics: {
          calculatedAreaSquareMeters: 0,
          calculatedAreaHectares: 0,
          perimeterMeters: 0,
          perimeterKilometers: 0,
          centroid: { latitude: 0, longitude: 0 },
          boundingBox: { minLatitude: 0, maxLatitude: 0, minLongitude: 0, maxLongitude: 0 },
          vertexCount: 0,
          voidCount: 0,
          parcelCount: 1,
          calculationMethod: 'geodesic_karney_spherical',
        },
        dataOrigin: p.dataOrigin || 'manual_entry',
        referenceDate: p.referenceDate,
        technicalNotes: p.technicalNotes,
        createdAt: now,
        updatedAt: now,
      };

      interimParcel.metrics = calculateParcelMetrics(interimParcel);
      return interimParcel;
    });

    // Validação topológica de toda a geometria
    const validationResult = validatePropertyGeometry(builtParcels);

    // Se o usuário tentar colocar status 'validated_internally' mas houver erros impeditivos, rejeita
    if (status === 'validated_internally' && validationResult.hasErrors) {
      return {
        success: false,
        error: 'Não é possível validar internamente uma geometria com inconsistências topológicas graves.',
        validationIssues: validationResult.issues,
      };
    }

    // Calcula métricas consolidadas
    let totalAreaSquareMeters = 0;
    let totalAreaHectares = 0;
    let totalPerimeterMeters = 0;
    let totalVertexCount = 0;
    let totalVoidCount = 0;

    for (const p of builtParcels) {
      totalAreaSquareMeters += p.metrics.calculatedAreaSquareMeters;
      totalAreaHectares += p.metrics.calculatedAreaHectares;
      totalPerimeterMeters += p.metrics.perimeterMeters;
      totalVertexCount += p.metrics.vertexCount;
      totalVoidCount += p.metrics.voidCount;
    }

    const totalPerimeterKilometers = parseFloat((totalPerimeterMeters / 1000).toFixed(3));
    totalAreaHectares = parseFloat(totalAreaHectares.toFixed(4));
    totalAreaSquareMeters = parseFloat(totalAreaSquareMeters.toFixed(2));

    // Carrega o imóvel para comparativo de áreas
    let propertyEntity = null;
    try {
      const propGateway = getPropertyGateway();
      propertyEntity = await propGateway.getPropertyById(organizationId, propertyId);
    } catch {
      // Gateway indisponível ou fallback
    }

    const areaComparison = calculateAreaComparison(
      totalAreaHectares,
      totalAreaSquareMeters,
      propertyEntity
    );

    const fullGeometry: PropertyGeometry = {
      id: previous?.id || `geom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      propertyId,
      organizationId,
      status: status || 'draft',
      parcels: builtParcels,
      totalMetrics: {
        totalAreaSquareMeters,
        totalAreaHectares,
        totalPerimeterMeters,
        totalPerimeterKilometers,
        totalVertexCount,
        totalVoidCount,
        totalParcelCount: builtParcels.length,
      },
      areaComparison,
      validationResult,
      internalRevision: (previous?.internalRevision || 0) + 1,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };

    this.storage.set(existingKey, fullGeometry);

    return {
      success: true,
      geometry: fullGeometry,
      validationIssues: validationResult.issues,
    };
  }

  async clearPropertyGeometry(
    propertyId: string,
    organizationId: string
  ): Promise<{ success: boolean; error?: string }> {
    const key = this.getKey(organizationId, propertyId);
    this.storage.delete(key);
    return { success: true };
  }
}
