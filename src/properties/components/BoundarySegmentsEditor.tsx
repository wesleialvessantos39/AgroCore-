/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Editor de Segmentos de Limites e Confrontações
 * 
 * Gerencia as confrontações técnicas vinculadas a cada segmento perimetral:
 * - Tipo de limite (Propriedade confrontante, Rodovia, Curso d'água, Estrada vicinal, etc.)
 * - Nome do proprietário/confrontante
 * - Matrícula do confrontante e Serventia Registral (Cartório de Registro de Imóveis)
 * - Observações e descrição técnica
 */

import React from 'react';
import { BoundarySegment, BoundaryType, GeoVertex } from '../../types/propertyGeometry';
import { Compass, FileText, User, Building2 } from 'lucide-react';
import { PROPERTY_THEME } from '../theme';

interface BoundarySegmentsEditorProps {
  parcelId: string;
  vertices: GeoVertex[];
  boundarySegments: BoundarySegment[];
  canEdit: boolean;
  onUpdateSegment: (segmentId: string, updates: Partial<BoundarySegment>) => void;
}

const BOUNDARY_TYPE_LABELS: Record<BoundaryType, string> = {
  other_property: 'Outro Imóvel / Confrontante Privado',
  unpaved_road: 'Estrada Vicinal / Estrada Municipal',
  highway: 'Rodovia Estadual / Federal',
  water_body: 'Rio / Curso d’Água / Córrego',
  fence: 'Cerca / Valo / Divisa Física',
  dry_line: 'Linha Seca / Marco Geodésico',
  urban_limit: 'Limite Urbano / Loteamento',
  other: 'Outro Limite Natural ou Artificial',
};

export const BoundarySegmentsEditor: React.FC<BoundarySegmentsEditorProps> = ({
  parcelId,
  vertices,
  boundarySegments,
  canEdit,
  onUpdateSegment,
}) => {
  // Mapa de vértice para busca rápida
  const vertexMap = new Map<string, GeoVertex>();
  vertices.forEach((v) => vertexMap.set(v.id, v));

  return (
    <div id="agrocore-boundary-segments-editor" className="space-y-4">
      <div className="bg-[#78C89A]/10 border border-[#0B3D2E]/15 p-3.5 rounded-xl">
        <h4 className="text-sm font-bold text-[#0B3D2E] flex items-center gap-2">
          <Compass className="w-4 h-4 text-[#78C89A]" />
          <span>Segmentos Perimetrais e Confrontações ({boundarySegments.length})</span>
        </h4>
        <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
          Identifique os limites legais e nomes dos vizinhos/confrontantes para cada trecho entre vértices.
        </p>
      </div>

      {boundarySegments.length === 0 ? (
        <div className="p-6 border border-[#0B3D2E]/15 rounded-xl text-center bg-white">
          <p className="text-xs font-medium text-[#0B3D2E]/70">
            Cadastre ao menos 2 vértices no anel externo para gerar os segmentos de divisa.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {boundarySegments.map((seg, idx) => {
            const fromV = vertexMap.get(seg.fromVertexId);
            const toV = vertexMap.get(seg.toVertexId);

            const fromLabel = fromV ? fromV.code || `V-${fromV.order}` : `V-Origem`;
            const toLabel = toV ? toV.code || `V-${toV.order}` : `V-Destino`;

            return (
              <div
                key={seg.id}
                className="p-4 border border-[#0B3D2E]/15 rounded-xl bg-white space-y-3 shadow-2xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#0B3D2E]/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 bg-[#0B3D2E] text-white rounded-md">
                      Trecho {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-[#0B3D2E]">
                      {fromLabel} ➔ {toLabel}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#0B3D2E]/70">
                    ID: {seg.id.substring(0, 14)}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Tipo de Limite */}
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B3D2E] mb-1">
                      Tipo de Limite
                    </label>
                    <select
                      disabled={!canEdit}
                      value={seg.boundaryType}
                      onChange={(e) =>
                        onUpdateSegment(seg.id, { boundaryType: e.target.value as BoundaryType })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs text-[#0B3D2E]"
                    >
                      {Object.entries(BOUNDARY_TYPE_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Nome do Confrontante */}
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B3D2E] mb-1 flex items-center gap-1">
                      <User className="w-3 h-3 text-[#78C89A]" />
                      <span>Nome do Confrontante / Estrada</span>
                    </label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={seg.adjoiningOwner || ''}
                      onChange={(e) => onUpdateSegment(seg.id, { adjoiningOwner: e.target.value })}
                      placeholder="Ex: Fazenda Boa Esperança / João Silva"
                      className="w-full px-2.5 py-1.5 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs text-[#0B3D2E]"
                    />
                  </div>

                  {/* Matrícula / Registro */}
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B3D2E] mb-1 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-[#78C89A]" />
                      <span>Matrícula Confrontante</span>
                    </label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={seg.adjoiningRegistry || ''}
                      onChange={(e) =>
                        onUpdateSegment(seg.id, { adjoiningRegistry: e.target.value })
                      }
                      placeholder="Ex: Matrícula 12.345"
                      className="w-full px-2.5 py-1.5 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs text-[#0B3D2E]"
                    />
                  </div>

                  {/* Cartório / Serventia */}
                  <div>
                    <label className="block text-[11px] font-bold text-[#0B3D2E] mb-1 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-[#78C89A]" />
                      <span>Serventia / CRI</span>
                    </label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={seg.notaryOffice || ''}
                      onChange={(e) => onUpdateSegment(seg.id, { notaryOffice: e.target.value })}
                      placeholder="Ex: 1º Ofício de Registro de Imóveis"
                      className="w-full px-2.5 py-1.5 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs text-[#0B3D2E]"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
