/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Hook usePropertyGeometry
 * 
 * Gerencia o estado reativo da geometria territorial do imóvel:
 * - Leitura e persistência via Gateway
 * - Edição de glebas, anéis externos, vazios internos e confrontações
 * - Conversão de coordenadas bidirecional (Decimal / DMS / UTM)
 * - Validação topológica contínua em tempo de edição
 * - Cálculo automático de métricas geodésicas e comparativo cadastral
 * - Reorganização técnica de vértices (sentido horário + vértice mais ao norte)
 * - Rastreamento de alterações pendentes (dirty state)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PropertyGeometry,
  LandParcel,
  GeoVertex,
  InnerVoid,
  BoundarySegment,
  PropertyGeometryStatus,
  CoordinateInputType,
  GeographicCoordinate,
  UtmCoordinate,
  GeometryValidationResult,
  PropertyAreaComparison,
  CoordinateSource,
} from '../../types/propertyGeometry';
import { Property } from '../../types/property';
import { getPropertyGeometryGateway } from './geometryGatewayFactory';
import { getPropertyGateway } from '../gatewayFactory';
import {
  geographicToUtm,
  utmToGeographic,
  decimalToDmsString,
  organizeVerticesForTechnicalReference,
} from './coordinateEngine';
import { calculateParcelMetrics, calculateInnerVoidMetrics, calculateAreaComparison } from './metricsEngine';
import { validatePropertyGeometry } from './validationEngine';
import { useAuth } from '../../auth/useAuth';
import { useOrganization } from '../../organization/useOrganization';
import { useAuthorization } from '../../authorization/useAuthorization';

export interface UsePropertyGeometryResult {
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  property: Property | null;
  geometry: PropertyGeometry | null;
  parcels: LandParcel[];
  selectedParcelId: string | null;
  activeParcel: LandParcel | null;
  selectedVertexId: string | null;
  status: PropertyGeometryStatus;
  isDirty: boolean;
  canEdit: boolean;
  canView: boolean;
  coordinateMode: CoordinateInputType;
  validationResult: GeometryValidationResult;
  totalMetrics: {
    totalAreaSquareMeters: number;
    totalAreaHectares: number;
    totalPerimeterMeters: number;
    totalPerimeterKilometers: number;
    totalVertexCount: number;
    totalVoidCount: number;
    totalParcelCount: number;
  };
  areaComparison: PropertyAreaComparison;

  // Seleção e Modos
  setSelectedParcelId: (id: string | null) => void;
  setSelectedVertexId: (id: string | null) => void;
  setCoordinateMode: (mode: CoordinateInputType) => void;
  setStatus: (status: PropertyGeometryStatus) => void;

  // Ações de Parcelas / Glebas
  addParcel: (name?: string, code?: string) => void;
  removeParcel: (parcelId: string) => void;
  updateParcelMeta: (parcelId: string, updates: Partial<Pick<LandParcel, 'name' | 'code' | 'description' | 'technicalNotes' | 'dataOrigin'>>) => void;

  // Ações de Vértices do Anel Externo
  addVertexToActiveParcel: (coord?: GeographicCoordinate) => void;
  insertVertexAt: (parcelId: string, index: number, coord: GeographicCoordinate) => void;
  updateVertex: (parcelId: string, vertexId: string, updates: Partial<GeoVertex>) => void;
  removeVertex: (parcelId: string, vertexId: string) => void;
  moveVertexUp: (parcelId: string, vertexId: string) => void;
  moveVertexDown: (parcelId: string, vertexId: string) => void;
  reorganizeActiveParcelVertices: () => void;

  // Ações de Vazios Internos
  addInnerVoid: (parcelId: string, name?: string) => void;
  removeInnerVoid: (parcelId: string, voidId: string) => void;
  addVertexToVoid: (parcelId: string, voidId: string, coord?: GeographicCoordinate) => void;
  updateVoidVertex: (parcelId: string, voidId: string, vertexId: string, updates: Partial<GeoVertex>) => void;
  removeVoidVertex: (parcelId: string, voidId: string, vertexId: string) => void;

  // Ações de Segmentos e Confrontações
  updateBoundarySegment: (parcelId: string, segmentId: string, updates: Partial<BoundarySegment>) => void;

  // Importação e Limpeza
  importBatchVertices: (parcelId: string, rawText: string, mode: CoordinateInputType) => { count: number; error?: string };
  clearActiveParcelVertices: (parcelId: string) => void;

  // Persistência
  saveGeometry: (newStatus?: PropertyGeometryStatus) => Promise<{ success: boolean; error?: string }>;
  reload: () => Promise<void>;
  resetChanges: () => void;
}

export function usePropertyGeometry(propertyId: string): UsePropertyGeometryResult {
  const { user } = useAuth();
  const { activeOrganization } = useOrganization();
  const { can } = useAuthorization();
  const organizationId = activeOrganization?.id || '';

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [property, setProperty] = useState<Property | null>(null);
  const [geometry, setGeometry] = useState<PropertyGeometry | null>(null);
  const [parcels, setParcels] = useState<LandParcel[]>([]);
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [selectedVertexId, setSelectedVertexId] = useState<string | null>(null);
  const [status, setStatusState] = useState<PropertyGeometryStatus>('draft');
  const [coordinateMode, setCoordinateMode] = useState<CoordinateInputType>('decimal');
  const [isDirty, setIsDirty] = useState(false);

  // Permissões
  const canView = can('properties:geospatial:view');
  const canEdit = can('properties:geospatial:edit');

  // Carrega os dados iniciais
  const loadData = useCallback(async () => {
    if (!propertyId || !organizationId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const propGateway = getPropertyGateway();
      const geomGateway = getPropertyGeometryGateway();

      const [propEntity, geomEntity] = await Promise.all([
        propGateway.getPropertyById(organizationId, propertyId),
        geomGateway.getPropertyGeometry(propertyId, organizationId),
      ]);

      if (!propEntity) {
        setError('Imóvel não encontrado.');
        setIsLoading(false);
        return;
      }

      setProperty(propEntity);
      setGeometry(geomEntity);

      if (geomEntity && geomEntity.parcels.length > 0) {
        setParcels(geomEntity.parcels);
        setSelectedParcelId(geomEntity.parcels[0].id);
        setStatusState(geomEntity.status);
      } else {
        // Inicializa uma primeira gleba padrão vazia
        const initialParcelId = `parcel_${Date.now()}`;
        const initialParcel: LandParcel = {
          id: initialParcelId,
          code: 'Gleba 01',
          name: 'Gleba Principal',
          status: 'active',
          outerRing: {
            type: 'outer',
            vertices: [],
          },
          innerVoids: [],
          boundarySegments: [],
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
          dataOrigin: 'manual_entry',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setParcels([initialParcel]);
        setSelectedParcelId(initialParcelId);
        setStatusState('draft');
      }

      setIsDirty(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar dados georreferenciados.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [propertyId, organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Parcela ativa selecionada
  const activeParcel = useMemo(() => {
    if (!parcels.length) return null;
    return parcels.find((p) => p.id === selectedParcelId) || parcels[0];
  }, [parcels, selectedParcelId]);

  // Recalcula métricas de cada parcela em tempo de edição
  const enrichedParcels = useMemo(() => {
    return parcels.map((p) => {
      const calculatedMetrics = calculateParcelMetrics(p);
      return {
        ...p,
        metrics: calculatedMetrics,
      };
    });
  }, [parcels]);

  // Validação topológica em tempo real
  const validationResult = useMemo(() => {
    return validatePropertyGeometry(enrichedParcels);
  }, [enrichedParcels]);

  // Métricas totais consolidadas
  const totalMetrics = useMemo(() => {
    let totalAreaSquareMeters = 0;
    let totalAreaHectares = 0;
    let totalPerimeterMeters = 0;
    let totalVertexCount = 0;
    let totalVoidCount = 0;

    for (const p of enrichedParcels) {
      totalAreaSquareMeters += p.metrics.calculatedAreaSquareMeters;
      totalAreaHectares += p.metrics.calculatedAreaHectares;
      totalPerimeterMeters += p.metrics.perimeterMeters;
      totalVertexCount += p.metrics.vertexCount;
      totalVoidCount += p.metrics.voidCount;
    }

    return {
      totalAreaSquareMeters: parseFloat(totalAreaSquareMeters.toFixed(2)),
      totalAreaHectares: parseFloat(totalAreaHectares.toFixed(4)),
      totalPerimeterMeters: parseFloat(totalPerimeterMeters.toFixed(2)),
      totalPerimeterKilometers: parseFloat((totalPerimeterMeters / 1000).toFixed(3)),
      totalVertexCount,
      totalVoidCount,
      totalParcelCount: enrichedParcels.length,
    };
  }, [enrichedParcels]);

  // Comparativo de áreas em tempo real
  const areaComparison = useMemo(() => {
    return calculateAreaComparison(
      totalMetrics.totalAreaHectares,
      totalMetrics.totalAreaSquareMeters,
      property
    );
  }, [totalMetrics, property]);

  // Atualiza o status
  const setStatus = useCallback((newStatus: PropertyGeometryStatus) => {
    setStatusState(newStatus);
    setIsDirty(true);
  }, []);

  // Helper para atualizar uma parcela na lista
  const updateParcelInState = useCallback((parcelId: string, updater: (parcel: LandParcel) => LandParcel) => {
    setParcels((prev) => {
      return prev.map((p) => {
        if (p.id === parcelId) {
          const updated = updater(p);
          return updated;
        }
        return p;
      });
    });
    setIsDirty(true);
  }, []);

  // Adiciona nova parcela
  const addParcel = useCallback((name?: string, code?: string) => {
    const nextIdx = parcels.length + 1;
    const newId = `parcel_${Date.now()}`;
    const newParcel: LandParcel = {
      id: newId,
      code: code || `Gleba ${nextIdx.toString().padStart(2, '0')}`,
      name: name || `Gleba ${nextIdx}`,
      status: 'active',
      outerRing: {
        type: 'outer',
        vertices: [],
      },
      innerVoids: [],
      boundarySegments: [],
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
      dataOrigin: 'manual_entry',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setParcels((prev) => [...prev, newParcel]);
    setSelectedParcelId(newId);
    setIsDirty(true);
  }, [parcels.length]);

  // Remove parcela
  const removeParcel = useCallback((parcelId: string) => {
    setParcels((prev) => {
      const filtered = prev.filter((p) => p.id !== parcelId);
      if (selectedParcelId === parcelId && filtered.length > 0) {
        setSelectedParcelId(filtered[0].id);
      }
      return filtered;
    });
    setIsDirty(true);
  }, [selectedParcelId]);

  // Atualiza metadados da parcela
  const updateParcelMeta = useCallback(
    (parcelId: string, updates: Partial<Pick<LandParcel, 'name' | 'code' | 'description' | 'technicalNotes' | 'dataOrigin'>>) => {
      updateParcelInState(parcelId, (p) => ({
        ...p,
        ...updates,
      }));
    },
    [updateParcelInState]
  );

  // Deriva confrontações automáticas a partir dos vértices
  const syncBoundarySegments = (vertices: GeoVertex[], currentSegments: BoundarySegment[]): BoundarySegment[] => {
    if (vertices.length < 2) return [];

    const segments: BoundarySegment[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const fromV = vertices[i];
      const toV = vertices[(i + 1) % vertices.length];

      const existing = currentSegments.find(
        (s) => s.fromVertexId === fromV.id && s.toVertexId === toV.id
      );

      if (existing) {
        segments.push(existing);
      } else {
        segments.push({
          id: `bnd_${fromV.id}_${toV.id}`,
          fromVertexId: fromV.id,
          toVertexId: toV.id,
          boundaryType: 'other_property',
          description: `Confrontação do Vértice ${fromV.code || fromV.order} ao ${toV.code || toV.order}`,
        });
      }
    }
    return segments;
  };

  // Adiciona vértice ao anel externo da parcela ativa
  const addVertexToActiveParcel = useCallback((coord?: GeographicCoordinate) => {
    if (!activeParcel) return;

    const currentVertices = activeParcel.outerRing.vertices || [];
    const nextOrder = currentVertices.length + 1;
    const vertexId = `vtx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Ponto default próximo ao centro do Brasil ou coordenada de referência do imóvel
    let defaultLat = -15.7801;
    let defaultLon = -47.9292;

    if (
      property?.referenceCoordinate?.latitude &&
      property?.referenceCoordinate?.longitude
    ) {
      const parsedLat = parseFloat(property.referenceCoordinate.latitude);
      const parsedLon = parseFloat(property.referenceCoordinate.longitude);
      if (!isNaN(parsedLat) && !isNaN(parsedLon)) {
        defaultLat = parsedLat;
        defaultLon = parsedLon;
      }
    } else if (currentVertices.length > 0) {
      const last = currentVertices[currentVertices.length - 1];
      defaultLat = last.coordinate.latitude + 0.001;
      defaultLon = last.coordinate.longitude + 0.001;
    }

    const finalCoord: GeographicCoordinate = coord || {
      type: 'geographic',
      crs: 'SIRGAS2000',
      latitude: parseFloat(defaultLat.toFixed(7)),
      longitude: parseFloat(defaultLon.toFixed(7)),
      dmsLatitude: decimalToDmsString(defaultLat, true),
      dmsLongitude: decimalToDmsString(defaultLon, false),
    };

    const utmCoord = geographicToUtm(finalCoord.latitude, finalCoord.longitude);

    const newVertex: GeoVertex = {
      id: vertexId,
      order: nextOrder,
      code: `V-${nextOrder.toString().padStart(2, '0')}`,
      coordinate: finalCoord,
      utmCoordinate: utmCoord,
      source: activeParcel.dataOrigin || 'manual_entry',
    };

    const newVertices = [...currentVertices, newVertex];
    const newSegments = syncBoundarySegments(newVertices, activeParcel.boundarySegments || []);

    updateParcelInState(activeParcel.id, (p) => ({
      ...p,
      outerRing: {
        ...p.outerRing,
        vertices: newVertices,
      },
      boundarySegments: newSegments,
    }));

    setSelectedVertexId(vertexId);
  }, [activeParcel, property, updateParcelInState]);

  // Insere vértice em posição específica
  const insertVertexAt = useCallback((parcelId: string, index: number, coord: GeographicCoordinate) => {
    updateParcelInState(parcelId, (p) => {
      const vertices = [...(p.outerRing.vertices || [])];
      const utmCoord = geographicToUtm(coord.latitude, coord.longitude);
      const newVertex: GeoVertex = {
        id: `vtx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        order: index + 1,
        code: `V-${(index + 1).toString().padStart(2, '0')}`,
        coordinate: coord,
        utmCoordinate: utmCoord,
        source: p.dataOrigin || 'manual_entry',
      };

      vertices.splice(index, 0, newVertex);

      // Re-indexa ordens
      const reindexed = vertices.map((v, i) => ({
        ...v,
        order: i + 1,
        code: `V-${(i + 1).toString().padStart(2, '0')}`,
      }));

      const newSegments = syncBoundarySegments(reindexed, p.boundarySegments || []);

      return {
        ...p,
        outerRing: {
          ...p.outerRing,
          vertices: reindexed,
        },
        boundarySegments: newSegments,
      };
    });
  }, [updateParcelInState]);

  // Atualiza vértice existente
  const updateVertex = useCallback((parcelId: string, vertexId: string, updates: Partial<GeoVertex>) => {
    updateParcelInState(parcelId, (p) => {
      const vertices = (p.outerRing.vertices || []).map((v) => {
        if (v.id === vertexId) {
          const merged = { ...v, ...updates };

          // Se a coordenada geográfica mudou, recalcula UTM e DMS automaticamente
          if (updates.coordinate && (updates.coordinate.latitude !== v.coordinate.latitude || updates.coordinate.longitude !== v.coordinate.longitude)) {
            const lat = updates.coordinate.latitude;
            const lon = updates.coordinate.longitude;
            merged.coordinate = {
              ...updates.coordinate,
              dmsLatitude: decimalToDmsString(lat, true),
              dmsLongitude: decimalToDmsString(lon, false),
            };
            merged.utmCoordinate = geographicToUtm(lat, lon);
          }

          // Se a coordenada UTM mudou diretamente
          if (updates.utmCoordinate && updates.utmCoordinate !== v.utmCoordinate) {
            const geo = utmToGeographic(updates.utmCoordinate);
            merged.coordinate = geo;
          }

          return merged;
        }
        return v;
      });

      return {
        ...p,
        outerRing: {
          ...p.outerRing,
          vertices,
        },
      };
    });
  }, [updateParcelInState]);

  // Remove vértice
  const removeVertex = useCallback((parcelId: string, vertexId: string) => {
    updateParcelInState(parcelId, (p) => {
      const filtered = (p.outerRing.vertices || []).filter((v) => v.id !== vertexId);
      const reindexed = filtered.map((v, i) => ({
        ...v,
        order: i + 1,
        code: `V-${(i + 1).toString().padStart(2, '0')}`,
      }));

      const newSegments = syncBoundarySegments(reindexed, p.boundarySegments || []);

      return {
        ...p,
        outerRing: {
          ...p.outerRing,
          vertices: reindexed,
        },
        boundarySegments: newSegments,
      };
    });

    if (selectedVertexId === vertexId) {
      setSelectedVertexId(null);
    }
  }, [selectedVertexId, updateParcelInState]);

  // Move vértice para cima na ordem
  const moveVertexUp = useCallback((parcelId: string, vertexId: string) => {
    updateParcelInState(parcelId, (p) => {
      const list = [...(p.outerRing.vertices || [])];
      const idx = list.findIndex((v) => v.id === vertexId);
      if (idx <= 0) return p;

      const temp = list[idx];
      list[idx] = list[idx - 1];
      list[idx - 1] = temp;

      const reindexed = list.map((v, i) => ({
        ...v,
        order: i + 1,
        code: `V-${(i + 1).toString().padStart(2, '0')}`,
      }));

      const newSegments = syncBoundarySegments(reindexed, p.boundarySegments || []);

      return {
        ...p,
        outerRing: {
          ...p.outerRing,
          vertices: reindexed,
        },
        boundarySegments: newSegments,
      };
    });
  }, [updateParcelInState]);

  // Move vértice para baixo na ordem
  const moveVertexDown = useCallback((parcelId: string, vertexId: string) => {
    updateParcelInState(parcelId, (p) => {
      const list = [...(p.outerRing.vertices || [])];
      const idx = list.findIndex((v) => v.id === vertexId);
      if (idx === -1 || idx >= list.length - 1) return p;

      const temp = list[idx];
      list[idx] = list[idx + 1];
      list[idx + 1] = temp;

      const reindexed = list.map((v, i) => ({
        ...v,
        order: i + 1,
        code: `V-${(i + 1).toString().padStart(2, '0')}`,
      }));

      const newSegments = syncBoundarySegments(reindexed, p.boundarySegments || []);

      return {
        ...p,
        outerRing: {
          ...p.outerRing,
          vertices: reindexed,
        },
        boundarySegments: newSegments,
      };
    });
  }, [updateParcelInState]);

  // Reorganiza a parcela ativa no padrão técnico (Sentido Horário + Vértice Mais ao Norte)
  const reorganizeActiveParcelVertices = useCallback(() => {
    if (!activeParcel || !activeParcel.outerRing.vertices || activeParcel.outerRing.vertices.length < 3) {
      return;
    }

    const reordered = organizeVerticesForTechnicalReference(activeParcel.outerRing.vertices);
    const reindexed = reordered.map((v, i) => ({
      ...v,
      order: i + 1,
      code: `V-${(i + 1).toString().padStart(2, '0')}`,
    }));

    const newSegments = syncBoundarySegments(reindexed, activeParcel.boundarySegments || []);

    updateParcelInState(activeParcel.id, (p) => ({
      ...p,
      outerRing: {
        ...p.outerRing,
        vertices: reindexed,
      },
      boundarySegments: newSegments,
    }));
  }, [activeParcel, updateParcelInState]);

  // Adiciona Vazio Interno
  const addInnerVoid = useCallback((parcelId: string, name?: string) => {
    updateParcelInState(parcelId, (p) => {
      const currentVoids = p.innerVoids || [];
      const nextIdx = currentVoids.length + 1;
      const voidId = `void_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      const newVoid: InnerVoid = {
        id: voidId,
        name: name || `Vazio Interno ${nextIdx.toString().padStart(2, '0')}`,
        description: 'Área encravada ou exclusão territorial',
        ring: {
          type: 'inner',
          vertices: [],
        },
        metrics: {
          areaSquareMeters: 0,
          areaHectares: 0,
          perimeterMeters: 0,
        },
      };

      return {
        ...p,
        innerVoids: [...currentVoids, newVoid],
      };
    });
  }, [updateParcelInState]);

  // Remove Vazio Interno
  const removeInnerVoid = useCallback((parcelId: string, voidId: string) => {
    updateParcelInState(parcelId, (p) => ({
      ...p,
      innerVoids: (p.innerVoids || []).filter((v) => v.id !== voidId),
    }));
  }, [updateParcelInState]);

  // Adiciona vértice ao vazio
  const addVertexToVoid = useCallback((parcelId: string, voidId: string, coord?: GeographicCoordinate) => {
    updateParcelInState(parcelId, (p) => {
      const targetVoid = (p.innerVoids || []).find((v) => v.id === voidId);
      if (!targetVoid) return p;

      const currentVertices = targetVoid.ring.vertices || [];
      const nextOrder = currentVertices.length + 1;

      let defaultLat = -15.7801;
      let defaultLon = -47.9292;
      if (p.outerRing.vertices && p.outerRing.vertices.length > 0) {
        defaultLat = p.outerRing.vertices[0].coordinate.latitude;
        defaultLon = p.outerRing.vertices[0].coordinate.longitude;
      }

      const finalCoord: GeographicCoordinate = coord || {
        type: 'geographic',
        crs: 'SIRGAS2000',
        latitude: parseFloat(defaultLat.toFixed(7)),
        longitude: parseFloat(defaultLon.toFixed(7)),
        dmsLatitude: decimalToDmsString(defaultLat, true),
        dmsLongitude: decimalToDmsString(defaultLon, false),
      };

      const utmCoord = geographicToUtm(finalCoord.latitude, finalCoord.longitude);

      const newV: GeoVertex = {
        id: `void_vtx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        order: nextOrder,
        code: `VZ-${nextOrder.toString().padStart(2, '0')}`,
        coordinate: finalCoord,
        utmCoordinate: utmCoord,
        source: p.dataOrigin || 'manual_entry',
      };

      const updatedVertices = [...currentVertices, newV];
      const updatedVoid: InnerVoid = {
        ...targetVoid,
        ring: {
          ...targetVoid.ring,
          vertices: updatedVertices,
        },
      };

      updatedVoid.metrics = calculateInnerVoidMetrics(updatedVoid);

      return {
        ...p,
        innerVoids: (p.innerVoids || []).map((v) => (v.id === voidId ? updatedVoid : v)),
      };
    });
  }, [updateParcelInState]);

  // Atualiza vértice do vazio
  const updateVoidVertex = useCallback((parcelId: string, voidId: string, vertexId: string, updates: Partial<GeoVertex>) => {
    updateParcelInState(parcelId, (p) => {
      const targetVoid = (p.innerVoids || []).find((v) => v.id === voidId);
      if (!targetVoid) return p;

      const updatedVertices = (targetVoid.ring.vertices || []).map((v) => {
        if (v.id === vertexId) {
          const merged = { ...v, ...updates };
          if (updates.coordinate) {
            const lat = updates.coordinate.latitude;
            const lon = updates.coordinate.longitude;
            merged.coordinate = {
              ...updates.coordinate,
              dmsLatitude: decimalToDmsString(lat, true),
              dmsLongitude: decimalToDmsString(lon, false),
            };
            merged.utmCoordinate = geographicToUtm(lat, lon);
          }
          return merged;
        }
        return v;
      });

      const updatedVoid: InnerVoid = {
        ...targetVoid,
        ring: {
          ...targetVoid.ring,
          vertices: updatedVertices,
        },
      };

      updatedVoid.metrics = calculateInnerVoidMetrics(updatedVoid);

      return {
        ...p,
        innerVoids: (p.innerVoids || []).map((v) => (v.id === voidId ? updatedVoid : v)),
      };
    });
  }, [updateParcelInState]);

  // Remove vértice do vazio
  const removeVoidVertex = useCallback((parcelId: string, voidId: string, vertexId: string) => {
    updateParcelInState(parcelId, (p) => {
      const targetVoid = (p.innerVoids || []).find((v) => v.id === voidId);
      if (!targetVoid) return p;

      const updatedVertices = (targetVoid.ring.vertices || [])
        .filter((v) => v.id !== vertexId)
        .map((v, i) => ({
          ...v,
          order: i + 1,
          code: `VZ-${(i + 1).toString().padStart(2, '0')}`,
        }));

      const updatedVoid: InnerVoid = {
        ...targetVoid,
        ring: {
          ...targetVoid.ring,
          vertices: updatedVertices,
        },
      };

      updatedVoid.metrics = calculateInnerVoidMetrics(updatedVoid);

      return {
        ...p,
        innerVoids: (p.innerVoids || []).map((v) => (v.id === voidId ? updatedVoid : v)),
      };
    });
  }, [updateParcelInState]);

  // Atualiza segmento de confronto
  const updateBoundarySegment = useCallback((parcelId: string, segmentId: string, updates: Partial<BoundarySegment>) => {
    updateParcelInState(parcelId, (p) => {
      const boundarySegments = (p.boundarySegments || []).map((s) => {
        if (s.id === segmentId) {
          return { ...s, ...updates };
        }
        return s;
      });
      return {
        ...p,
        boundarySegments,
      };
    });
  }, [updateParcelInState]);

  // Limpa vértices da parcela ativa
  const clearActiveParcelVertices = useCallback((parcelId: string) => {
    updateParcelInState(parcelId, (p) => ({
      ...p,
      outerRing: {
        ...p.outerRing,
        vertices: [],
      },
      boundarySegments: [],
    }));
  }, [updateParcelInState]);

  // Importação em lote por texto (Parser resiliente)
  const importBatchVertices = useCallback((parcelId: string, rawText: string, mode: CoordinateInputType): { count: number; error?: string } => {
    if (!rawText || !rawText.trim()) {
      return { count: 0, error: 'O texto de coordenadas está vazio.' };
    }

    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsedVertices: GeoVertex[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Aceita separadores: tab, vírgula, ponto e vírgula, espaço duplo
      const parts = line.split(/[\t,;]+/).map((s) => s.trim()).filter(Boolean);

      if (parts.length < 2) continue;

      if (mode === 'utm') {
        // Formato esperado: Easting, Northing, [Zona], [Hemisfério]
        const easting = parseFloat(parts[0].replace(',', '.'));
        const northing = parseFloat(parts[1].replace(',', '.'));
        const zone = parts[2] ? parseInt(parts[2], 10) : 22; // default zona 22
        const hemisphere = parts[3]?.toUpperCase() === 'N' ? 'N' : 'S';

        if (isNaN(easting) || isNaN(northing)) continue;

        const utm: UtmCoordinate = {
          type: 'utm',
          crs: 'SIRGAS2000',
          easting,
          northing,
          zone,
          hemisphere,
        };

        const geo = utmToGeographic(utm);
        parsedVertices.push({
          id: `vtx_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 5)}`,
          order: parsedVertices.length + 1,
          code: `V-${(parsedVertices.length + 1).toString().padStart(2, '0')}`,
          coordinate: geo,
          utmCoordinate: utm,
          source: 'technical_document',
        });
      } else {
        // Modo decimal ou DMS
        const lat = parseFloat(parts[0].replace(',', '.'));
        const lon = parseFloat(parts[1].replace(',', '.'));

        if (isNaN(lat) || isNaN(lon)) continue;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

        const geo: GeographicCoordinate = {
          type: 'geographic',
          crs: 'SIRGAS2000',
          latitude: lat,
          longitude: lon,
          dmsLatitude: decimalToDmsString(lat, true),
          dmsLongitude: decimalToDmsString(lon, false),
        };
        const utm = geographicToUtm(lat, lon);

        parsedVertices.push({
          id: `vtx_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 5)}`,
          order: parsedVertices.length + 1,
          code: `V-${(parsedVertices.length + 1).toString().padStart(2, '0')}`,
          coordinate: geo,
          utmCoordinate: utm,
          source: 'technical_document',
        });
      }
    }

    if (parsedVertices.length === 0) {
      return { count: 0, error: 'Nenhuma coordenada válida identificada no formato informado.' };
    }

    updateParcelInState(parcelId, (p) => {
      const newSegments = syncBoundarySegments(parsedVertices, []);
      return {
        ...p,
        outerRing: {
          ...p.outerRing,
          vertices: parsedVertices,
        },
        boundarySegments: newSegments,
      };
    });

    return { count: parsedVertices.length };
  }, [updateParcelInState]);

  // Salva no gateway
  const saveGeometry = useCallback(async (newStatus?: PropertyGeometryStatus): Promise<{ success: boolean; error?: string }> => {
    if (!propertyId || !organizationId) {
      return { success: false, error: 'Identificador do imóvel ou organização não informado.' };
    }

    if (!canEdit) {
      return { success: false, error: 'Você não tem permissão para editar dados georreferenciados deste imóvel.' };
    }

    setIsSaving(true);
    setError(null);

    const targetStatus = newStatus || status;

    try {
      const geomGateway = getPropertyGeometryGateway();

      const input = {
        propertyId,
        organizationId,
        status: targetStatus,
        parcels: enrichedParcels.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          status: p.status,
          outerVertices: p.outerRing.vertices || [],
          innerVoids: (p.innerVoids || []).map((iv) => ({
            id: iv.id,
            name: iv.name,
            description: iv.description,
            vertices: iv.ring.vertices || [],
          })),
          boundarySegments: p.boundarySegments || [],
          dataOrigin: p.dataOrigin,
          referenceDate: p.referenceDate,
          technicalNotes: p.technicalNotes,
        })),
      };

      const result = await geomGateway.savePropertyGeometry(input);

      if (!result.success || !result.geometry) {
        const msg = result.error || 'Falha ao salvar georreferenciamento do imóvel.';
        setError(msg);
        setIsSaving(false);
        return { success: false, error: msg };
      }

      setGeometry(result.geometry);
      setParcels(result.geometry.parcels);
      setStatusState(result.geometry.status);
      setIsDirty(false);
      setIsSaving(false);

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado ao salvar geometria.';
      setError(msg);
      setIsSaving(false);
      return { success: false, error: msg };
    }
  }, [propertyId, organizationId, canEdit, status, enrichedParcels]);

  // Reseta alterações para o último estado salvo
  const resetChanges = useCallback(() => {
    if (geometry && geometry.parcels.length > 0) {
      setParcels(geometry.parcels);
      setStatusState(geometry.status);
    }
    setIsDirty(false);
  }, [geometry]);

  return {
    isLoading,
    isSaving,
    error,
    property,
    geometry,
    parcels: enrichedParcels,
    selectedParcelId,
    activeParcel,
    selectedVertexId,
    status,
    isDirty,
    canEdit,
    canView,
    coordinateMode,
    validationResult,
    totalMetrics,
    areaComparison,

    setSelectedParcelId,
    setSelectedVertexId,
    setCoordinateMode,
    setStatus,

    addParcel,
    removeParcel,
    updateParcelMeta,

    addVertexToActiveParcel,
    insertVertexAt,
    updateVertex,
    removeVertex,
    moveVertexUp,
    moveVertexDown,
    reorganizeActiveParcelVertices,

    addInnerVoid,
    removeInnerVoid,
    addVertexToVoid,
    updateVoidVertex,
    removeVoidVertex,

    updateBoundarySegment,

    importBatchVertices,
    clearActiveParcelVertices,

    saveGeometry,
    reload: loadData,
    resetChanges,
  };
}
