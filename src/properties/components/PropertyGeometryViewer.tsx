/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Visualizador Geoespacial Vetorial SVG Interno
 * 
 * Renderização geométrica pura em SVG responsivo e offline:
 * - Desenho de anéis externos e vazios internos com preenchimento diferenciado
 * - Marcadores interativos de vértices com indicação de código e ordem
 * - Rosa dos Ventos / Indicador de Norte Verdadeiro
 * - Barra de escala métrica estimada
 * - Controles de zoom in, zoom out, panorâmica e centralização
 * - Destaque visual para o vértice selecionado
 */

import React, { useState, useMemo, useRef } from 'react';
import { LandParcel, GeoVertex, InnerVoid } from '../../types/propertyGeometry';
import { ZoomIn, ZoomOut, RotateCcw, Compass, MapPin, Eye } from 'lucide-react';
import { PROPERTY_THEME } from '../theme';
import { calculateGeodesicDistance } from '../geometry/coordinateEngine';

interface PropertyGeometryViewerProps {
  parcels: LandParcel[];
  selectedParcelId: string | null;
  selectedVertexId: string | null;
  onSelectVertex?: (vertexId: string) => void;
  onSelectParcel?: (parcelId: string) => void;
  showAllParcels?: boolean;
}

export const PropertyGeometryViewer: React.FC<PropertyGeometryViewerProps> = ({
  parcels,
  selectedParcelId,
  selectedVertexId,
  onSelectVertex,
  onSelectParcel,
  showAllParcels = true,
}) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredVertex, setHoveredVertex] = useState<GeoVertex | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Filtra as parcelas visíveis
  const visibleParcels = useMemo(() => {
    if (showAllParcels) return parcels;
    return parcels.filter((p) => p.id === selectedParcelId);
  }, [parcels, selectedParcelId, showAllParcels]);

  // Coleta todos os vértices de todas as parcelas visíveis para definir o Bounding Box
  const allCoordinates = useMemo(() => {
    const coords: Array<{ latitude: number; longitude: number }> = [];
    for (const p of visibleParcels) {
      for (const v of p.outerRing.vertices || []) {
        if (v.coordinate && !isNaN(v.coordinate.latitude) && !isNaN(v.coordinate.longitude)) {
          coords.push({ latitude: v.coordinate.latitude, longitude: v.coordinate.longitude });
        }
      }
      for (const iv of p.innerVoids || []) {
        for (const vv of iv.ring.vertices || []) {
          if (vv.coordinate && !isNaN(vv.coordinate.latitude) && !isNaN(vv.coordinate.longitude)) {
            coords.push({ latitude: vv.coordinate.latitude, longitude: vv.coordinate.longitude });
          }
        }
      }
    }
    return coords;
  }, [visibleParcels]);

  // Calcula Bounding Box e escala de projeção SVG
  const bounds = useMemo(() => {
    if (allCoordinates.length === 0) {
      return {
        minLat: -15.80,
        maxLat: -15.76,
        minLon: -47.95,
        maxLon: -47.90,
        widthLon: 0.05,
        heightLat: 0.04,
      };
    }

    let minLat = allCoordinates[0].latitude;
    let maxLat = allCoordinates[0].latitude;
    let minLon = allCoordinates[0].longitude;
    let maxLon = allCoordinates[0].longitude;

    for (const c of allCoordinates) {
      if (c.latitude < minLat) minLat = c.latitude;
      if (c.latitude > maxLat) maxLat = c.latitude;
      if (c.longitude < minLon) minLon = c.longitude;
      if (c.longitude > maxLon) maxLon = c.longitude;
    }

    const marginLat = Math.max(0.0005, (maxLat - minLat) * 0.15);
    const marginLon = Math.max(0.0005, (maxLon - minLon) * 0.15);

    return {
      minLat: minLat - marginLat,
      maxLat: maxLat + marginLat,
      minLon: minLon - marginLon,
      maxLon: maxLon + marginLon,
      widthLon: Math.max(0.001, maxLon - minLon + marginLon * 2),
      heightLat: Math.max(0.001, maxLat - minLat + marginLat * 2),
    };
  }, [allCoordinates]);

  // Dimensões do ViewBox SVG
  const SVG_WIDTH = 800;
  const SVG_HEIGHT = 600;

  // Função de projeção: (Lon, Lat) -> (SVG X, SVG Y)
  const project = (lat: number, lon: number): { x: number; y: number } => {
    const normX = (lon - bounds.minLon) / bounds.widthLon;
    // Inverte Y porque latitudes maiores ficam em cima
    const normY = (bounds.maxLat - lat) / bounds.heightLat;

    const x = normX * SVG_WIDTH;
    const y = normY * SVG_HEIGHT;
    return { x, y };
  };

  // Calcula estimativa da barra de escala métrica (largura de 100px no SVG em metros)
  const scaleBarInfo = useMemo(() => {
    if (allCoordinates.length < 2) return null;
    const p1 = bounds.minLon;
    const p2 = bounds.minLon + bounds.widthLon * (100 / SVG_WIDTH);
    const midLat = (bounds.minLat + bounds.maxLat) / 2;
    const distMeters = calculateGeodesicDistance(midLat, p1, midLat, p2);

    let displayLabel = '';
    if (distMeters >= 1000) {
      displayLabel = `${(distMeters / 1000).toFixed(1)} km`;
    } else {
      displayLabel = `${Math.round(distMeters)} m`;
    }

    return {
      pixelWidth: 100,
      label: displayLabel,
    };
  }, [bounds, allCoordinates.length]);

  // Handlers de Zoom e Pan
  const handleZoomIn = () => setZoomLevel((z) => Math.min(5, z + 0.3));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.5, z - 0.3));
  const handleResetView = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Se não houver vértices
  const hasNoGeometry = allCoordinates.length === 0;

  return (
    <div
      id="agrocore-property-geometry-viewer"
      ref={containerRef}
      className={`relative w-full h-[480px] md:h-[540px] bg-white border ${PROPERTY_THEME.border} rounded-2xl overflow-hidden shadow-xs select-none`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Controles Flutuantes de Zoom e Reset */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 bg-white/90 backdrop-blur-xs border border-[#0B3D2E]/20 p-1.5 rounded-xl shadow-sm">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Aproximar (Zoom +)"
          className="p-2 text-[#0B3D2E] hover:bg-[#78C89A]/20 rounded-lg transition-colors cursor-pointer"
          aria-label="Aproximar"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Afastar (Zoom -)"
          className="p-2 text-[#0B3D2E] hover:bg-[#78C89A]/20 rounded-lg transition-colors cursor-pointer"
          aria-label="Afastar"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleResetView}
          title="Redefinir Enquadramento"
          className="p-2 text-[#0B3D2E] hover:bg-[#78C89A]/20 rounded-lg transition-colors cursor-pointer"
          aria-label="Centralizar e Redefinir"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Rosa dos Ventos / Indicador de Norte */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2 bg-white/90 backdrop-blur-xs border border-[#0B3D2E]/20 px-3 py-1.5 rounded-xl shadow-sm text-xs font-semibold text-[#0B3D2E]">
        <Compass className="w-4 h-4 text-[#0B3D2E] animate-pulse" />
        <span>NORTE</span>
      </div>

      {/* Barra de Escala Estimada */}
      {scaleBarInfo && (
        <div className="absolute bottom-3 left-3 z-20 bg-white/90 backdrop-blur-xs border border-[#0B3D2E]/20 px-3 py-1.5 rounded-xl shadow-sm flex flex-col items-start gap-1">
          <span className="text-[10px] font-bold text-[#0B3D2E]">{scaleBarInfo.label}</span>
          <div className="w-[100px] h-1 bg-[#0B3D2E] rounded-full flex justify-between">
            <div className="w-0.5 h-2 bg-[#0B3D2E] -mt-0.5" />
            <div className="w-0.5 h-2 bg-[#0B3D2E] -mt-0.5" />
          </div>
        </div>
      )}

      {/* Informações do Vértice em Hover */}
      {hoveredVertex && (
        <div className="absolute bottom-3 right-3 z-20 bg-white/95 backdrop-blur-xs border border-[#0B3D2E]/30 px-3 py-2 rounded-xl shadow-md text-xs text-[#0B3D2E] space-y-0.5">
          <div className="font-bold flex items-center gap-1.5 text-[#0B3D2E]">
            <MapPin className="w-3.5 h-3.5 text-[#78C89A]" />
            <span>Vértice: {hoveredVertex.code || `V-${hoveredVertex.order}`}</span>
          </div>
          <div>Lat: {hoveredVertex.coordinate.latitude.toFixed(6)}°</div>
          <div>Lon: {hoveredVertex.coordinate.longitude.toFixed(6)}°</div>
          {hoveredVertex.altitudeMeters && <div>Alt: {hoveredVertex.altitudeMeters} m</div>}
        </div>
      )}

      {/* Estado Vazio */}
      {hasNoGeometry ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-[#0B3D2E]/60 bg-[#78C89A]/5">
          <MapPin className="w-12 h-12 text-[#78C89A] mb-2 opacity-60" />
          <h4 className="text-base font-semibold text-[#0B3D2E]">Nenhum polígono desenhado</h4>
          <p className="text-xs max-w-sm text-[#0B3D2E]/70 mt-1">
            Cadastre as coordenadas dos vértices da gleba na tabela abaixo para visualizar o perímetro territorial.
          </p>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          style={{
            transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          }}
        >
          {/* Grade de Fundo Sutil */}
          <defs>
            <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#78C89A" strokeWidth="0.5" strokeOpacity="0.15" />
            </pattern>
          </defs>
          <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#grid-pattern)" />

          {/* Renderização das Parcelas */}
          {visibleParcels.map((parcel, pIdx) => {
            const isSelectedParcel = parcel.id === selectedParcelId;
            const outerVertices = parcel.outerRing.vertices || [];

            // Pontos do anel externo
            const outerPoints = outerVertices.map((v) => {
              const p = project(v.coordinate.latitude, v.coordinate.longitude);
              return `${p.x},${p.y}`;
            });

            // Caminho SVG com preenchimento e suporte a vazios internos (FillRule="evenodd")
            let pathD = '';
            if (outerVertices.length >= 3) {
              const first = project(outerVertices[0].coordinate.latitude, outerVertices[0].coordinate.longitude);
              pathD = `M ${first.x} ${first.y} `;
              for (let i = 1; i < outerVertices.length; i++) {
                const pt = project(outerVertices[i].coordinate.latitude, outerVertices[i].coordinate.longitude);
                pathD += `L ${pt.x} ${pt.y} `;
              }
              pathD += 'Z ';

              // Adiciona os vazios internos ao caminho para furação visual
              for (const iv of parcel.innerVoids || []) {
                const voidV = iv.ring.vertices || [];
                if (voidV.length >= 3) {
                  const vFirst = project(voidV[0].coordinate.latitude, voidV[0].coordinate.longitude);
                  pathD += `M ${vFirst.x} ${vFirst.y} `;
                  for (let j = 1; j < voidV.length; j++) {
                    const vPt = project(voidV[j].coordinate.latitude, voidV[j].coordinate.longitude);
                    pathD += `L ${vPt.x} ${vPt.y} `;
                  }
                  pathD += 'Z ';
                }
              }
            }

            return (
              <g key={parcel.id} id={`svg-parcel-${parcel.id}`}>
                {/* Polígono da Gleba */}
                {pathD && (
                  <path
                    d={pathD}
                    fillRule="evenodd"
                    fill={isSelectedParcel ? '#78C89A' : '#0B3D2E'}
                    fillOpacity={isSelectedParcel ? 0.35 : 0.15}
                    stroke={isSelectedParcel ? '#0B3D2E' : '#0B3D2E'}
                    strokeWidth={isSelectedParcel ? 2.5 : 1.5}
                    strokeDasharray={isSelectedParcel ? 'none' : '4 2'}
                    className="transition-colors cursor-pointer hover:fill-opacity-45"
                    onClick={() => onSelectParcel && onSelectParcel(parcel.id)}
                  />
                )}

                {/* Vértices do Anel Externo */}
                {outerVertices.map((v) => {
                  const pt = project(v.coordinate.latitude, v.coordinate.longitude);
                  const isSelectedVertex = v.id === selectedVertexId;
                  const isFirstVertex = v.order === 1;

                  return (
                    <g
                      key={v.id}
                      className="cursor-pointer group"
                      onMouseEnter={() => setHoveredVertex(v)}
                      onMouseLeave={() => setHoveredVertex(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectVertex) onSelectVertex(v.id);
                        if (onSelectParcel) onSelectParcel(parcel.id);
                      }}
                    >
                      {/* Círculo indicador */}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelectedVertex ? 7 : isFirstVertex ? 6 : 4.5}
                        fill={isSelectedVertex ? '#78C89A' : isFirstVertex ? '#0B3D2E' : '#FFFFFF'}
                        stroke="#0B3D2E"
                        strokeWidth={isSelectedVertex ? 2.5 : 1.5}
                        className="transition-all hover:scale-125"
                      />

                      {/* Rótulo do Vértice */}
                      <text
                        x={pt.x + 8}
                        y={pt.y - 8}
                        fontSize={isSelectedVertex ? '11' : '9'}
                        fontWeight={isSelectedVertex || isFirstVertex ? 'bold' : 'normal'}
                        fill="#0B3D2E"
                        className="pointer-events-none select-none drop-shadow-xs"
                      >
                        {v.code || `V-${v.order}`}
                      </text>
                    </g>
                  );
                })}

                {/* Vértices e Contornos dos Vazios Internos */}
                {(parcel.innerVoids || []).map((iv) => {
                  const voidVertices = iv.ring.vertices || [];
                  return (
                    <g key={iv.id}>
                      {voidVertices.map((vv) => {
                        const pt = project(vv.coordinate.latitude, vv.coordinate.longitude);
                        return (
                          <circle
                            key={vv.id}
                            cx={pt.x}
                            cy={pt.y}
                            r={3.5}
                            fill="#E11D48"
                            stroke="#FFFFFF"
                            strokeWidth={1}
                            className="pointer-events-none"
                          />
                        );
                      })}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
};
