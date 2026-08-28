/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Editor de Vazios Internos, Encravamentos e Exclusões Territoriais
 * 
 * Permite definir áreas internas a serem subtraídas do cômputo da gleba:
 * - Cadastro de múltiplos vazios (ex: áreas de preservação encravadas, posse de terceiros, lagoas)
 * - Coordenadas dos vértices de cada anel interno
 * - Cálculo automático da área de desconto em hectares e m²
 */

import React, { useState } from 'react';
import { InnerVoid, GeoVertex, CoordinateInputType, GeographicCoordinate } from '../../types/propertyGeometry';
import { Plus, Trash2, ShieldAlert, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { PROPERTY_THEME } from '../theme';
import { calculateInnerVoidMetrics } from '../geometry/metricsEngine';

interface InnerVoidsEditorProps {
  parcelId: string;
  innerVoids: InnerVoid[];
  coordinateMode: CoordinateInputType;
  canEdit: boolean;
  onAddVoid: (name?: string) => void;
  onRemoveVoid: (voidId: string) => void;
  onAddVoidVertex: (voidId: string, coord?: GeographicCoordinate) => void;
  onUpdateVoidVertex: (voidId: string, vertexId: string, updates: Partial<GeoVertex>) => void;
  onRemoveVoidVertex: (voidId: string, vertexId: string) => void;
}

export const InnerVoidsEditor: React.FC<InnerVoidsEditorProps> = ({
  parcelId,
  innerVoids,
  coordinateMode,
  canEdit,
  onAddVoid,
  onRemoveVoid,
  onAddVoidVertex,
  onUpdateVoidVertex,
  onRemoveVoidVertex,
}) => {
  const [expandedVoidIds, setExpandedVoidIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedVoidIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div id="agrocore-inner-voids-editor" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#78C89A]/10 border border-[#0B3D2E]/15 p-3.5 rounded-xl">
        <div>
          <h4 className="text-sm font-bold text-[#0B3D2E] flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#78C89A]" />
            <span>Vazios Internos e Encravamentos ({innerVoids.length})</span>
          </h4>
          <p className="text-xs text-[#0B3D2E]/70">
            Áreas descontadas do cálculo da gleba (posses de terceiros, corpos hídricos ou exclusões).
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => onAddVoid()}
            className={PROPERTY_THEME.btnPrimary}
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Vazio Interno</span>
          </button>
        )}
      </div>

      {innerVoids.length === 0 ? (
        <div className="p-6 border border-[#0B3D2E]/15 rounded-xl text-center bg-white">
          <p className="text-xs font-medium text-[#0B3D2E]/70">
            Nenhum vazio interno ou exclusão geométrica cadastrada nesta gleba.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {innerVoids.map((iv, ivIdx) => {
            const isExpanded = expandedVoidIds[iv.id] !== false; // Default aberto
            const vertices = iv.ring.vertices || [];
            const metrics = calculateInnerVoidMetrics(iv);

            return (
              <div
                key={iv.id}
                className="border border-[#0B3D2E]/20 rounded-xl bg-white overflow-hidden shadow-2xs"
              >
                {/* Cabeçalho do Vazio */}
                <div
                  className="flex items-center justify-between p-3 bg-[#0B3D2E]/5 cursor-pointer hover:bg-[#78C89A]/10 transition-colors"
                  onClick={() => toggleExpand(iv.id)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-[#0B3D2E]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#0B3D2E]" />
                    )}
                    <span className="text-sm font-bold text-[#0B3D2E]">
                      {iv.name || `Vazio Interno ${ivIdx + 1}`}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-white border border-[#0B3D2E]/20 rounded-full font-semibold text-[#0B3D2E]">
                      {metrics.areaHectares.toLocaleString('pt-BR')} ha ({metrics.areaSquareMeters.toLocaleString('pt-BR')} m²)
                    </span>
                  </div>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveVoid(iv.id);
                      }}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                      title="Excluir vazio"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Conteúdo Expandido com Vértices do Vazio */}
                {isExpanded && (
                  <div className="p-4 space-y-3 border-t border-[#0B3D2E]/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#0B3D2E]">
                        Vértices do Contorno do Vazio ({vertices.length})
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => onAddVoidVertex(iv.id)}
                          className={PROPERTY_THEME.btnSecondarySmall}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Adicionar Vértice</span>
                        </button>
                      )}
                    </div>

                    {vertices.length === 0 ? (
                      <p className="text-xs text-[#0B3D2E]/60 italic">
                        Nenhum vértice adicionado. Adicione ao menos 3 pontos para fechar o vazio.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {vertices.map((vv) => (
                          <div
                            key={vv.id}
                            className="p-2.5 bg-[#78C89A]/10 border border-[#0B3D2E]/15 rounded-lg flex items-center justify-between text-xs"
                          >
                            <div className="space-y-0.5">
                              <span className="font-bold text-[#0B3D2E]">{vv.code || `VZ-${vv.order}`}</span>
                              <div className="text-[11px] text-[#0B3D2E]/80">
                                Lat: {vv.coordinate.latitude.toFixed(5)}°
                              </div>
                              <div className="text-[11px] text-[#0B3D2E]/80">
                                Lon: {vv.coordinate.longitude.toFixed(5)}°
                              </div>
                            </div>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => onRemoveVoidVertex(iv.id, vv.id)}
                                className="text-rose-600 hover:bg-rose-50 p-1 rounded-md"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
