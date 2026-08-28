/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Editor de Vértices e Coordenadas
 * 
 * Suporta edição responsiva em tabela (desktop) e cartões (mobile):
 * - Alternância dinâmica de formato: Decimal (SIRGAS2000), DMS, UTM
 * - Reordenação rápida de vértices (Subir / Descer)
 * - Validação individual de limites geográficos
 * - Modal de importação em lote por texto
 * - Acessibilidade completa e conformidade visual com o PROPERTY_THEME
 */

import React, { useState } from 'react';
import {
  GeoVertex,
  CoordinateInputType,
  GeographicCoordinate,
  UtmCoordinate,
  CoordinateSource,
} from '../../types/propertyGeometry';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  FileText,
  HelpCircle,
  UploadCloud,
  Check,
} from 'lucide-react';
import { PROPERTY_THEME } from '../theme';
import {
  parseDmsString,
  geographicToUtm,
  utmToGeographic,
  decimalToDmsString,
} from '../geometry/coordinateEngine';

interface VertexEditorProps {
  parcelId: string;
  vertices: GeoVertex[];
  selectedVertexId: string | null;
  coordinateMode: CoordinateInputType;
  canEdit: boolean;
  onSelectVertex: (vertexId: string) => void;
  onAddVertex: () => void;
  onUpdateVertex: (vertexId: string, updates: Partial<GeoVertex>) => void;
  onRemoveVertex: (vertexId: string) => void;
  onMoveUp: (vertexId: string) => void;
  onMoveDown: (vertexId: string) => void;
  onBatchImport: (rawText: string, mode: CoordinateInputType) => { count: number; error?: string };
}

export const VertexEditor: React.FC<VertexEditorProps> = ({
  parcelId,
  vertices,
  selectedVertexId,
  coordinateMode,
  canEdit,
  onSelectVertex,
  onAddVertex,
  onUpdateVertex,
  onRemoveVertex,
  onMoveUp,
  onMoveDown,
  onBatchImport,
}) => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Executa importação em lote
  const handleExecuteImport = () => {
    setImportError(null);
    const result = onBatchImport(batchText, coordinateMode);
    if (result.error) {
      setImportError(result.error);
    } else {
      setIsImportModalOpen(false);
      setBatchText('');
    }
  };

  return (
    <div id="agrocore-vertex-editor" className="space-y-4">
      {/* Barra de Ações Superior do Editor */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#78C89A]/10 border border-[#0B3D2E]/15 p-3.5 rounded-xl">
        <div>
          <h4 className="text-sm font-bold text-[#0B3D2E]">
            Vértices do Anel Externo ({vertices.length})
          </h4>
          <p className="text-xs text-[#0B3D2E]/70">
            Cadastre os pontos de inflexão perimetral na ordem sequencial da gleba.
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className={PROPERTY_THEME.btnSecondarySmall}
              title="Importar lista de coordenadas"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Importar Lote</span>
            </button>
            <button
              type="button"
              onClick={onAddVertex}
              className={PROPERTY_THEME.btnPrimary}
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Vértice</span>
            </button>
          </div>
        )}
      </div>

      {/* Lista de Vértices: Tabela no Desktop, Cards no Mobile */}
      {vertices.length === 0 ? (
        <div className="p-8 border border-dashed border-[#0B3D2E]/25 rounded-xl text-center bg-white">
          <p className="text-sm font-semibold text-[#0B3D2E]">Nenhum vértice adicionado a esta gleba.</p>
          <p className="text-xs text-[#0B3D2E]/70 mt-1">
            Clique em "Adicionar Vértice" ou importe um conjunto de coordenadas via texto.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={onAddVertex}
              className={`mt-4 ${PROPERTY_THEME.btnPrimary}`}
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Primeiro Vértice</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Visualização em Tabela (Desktop) */}
          <div className="hidden lg:block overflow-x-auto border border-[#0B3D2E]/15 rounded-xl bg-white shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0B3D2E]/5 border-b border-[#0B3D2E]/15 text-[#0B3D2E] font-bold">
                  <th className="py-2.5 px-3 w-12 text-center">Nº</th>
                  <th className="py-2.5 px-3 w-28">Código</th>
                  {coordinateMode === 'utm' ? (
                    <>
                      <th className="py-2.5 px-3">Easting (X - metros)</th>
                      <th className="py-2.5 px-3">Northing (Y - metros)</th>
                      <th className="py-2.5 px-3 w-20">Fuso</th>
                      <th className="py-2.5 px-3 w-16">Hemis.</th>
                    </>
                  ) : coordinateMode === 'dms' ? (
                    <>
                      <th className="py-2.5 px-3">Latitude (DMS)</th>
                      <th className="py-2.5 px-3">Longitude (DMS)</th>
                    </>
                  ) : (
                    <>
                      <th className="py-2.5 px-3">Latitude (Decimal)</th>
                      <th className="py-2.5 px-3">Longitude (Decimal)</th>
                    </>
                  )}
                  <th className="py-2.5 px-3 w-28" title="Altitude informada no documento ou levantamento (não altera cálculos planimétricos 2D)">
                    Alt. Informada (m)
                  </th>
                  <th className="py-2.5 px-3 w-32">Origem</th>
                  {canEdit && <th className="py-2.5 px-3 w-28 text-center">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0B3D2E]/10 text-[#0B3D2E]">
                {vertices.map((v, idx) => {
                  const isSelected = v.id === selectedVertexId;
                  const isFirst = idx === 0;
                  const isLast = idx === vertices.length - 1;

                  return (
                    <tr
                      key={v.id}
                      onClick={() => onSelectVertex(v.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#78C89A]/20 font-medium' : 'hover:bg-[#78C89A]/10'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-bold">{v.order}</td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={v.code || ''}
                          onChange={(e) => onUpdateVertex(v.id, { code: e.target.value })}
                          className="w-full px-2 py-1 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs focus:ring-1 focus:ring-[#78C89A]"
                        />
                      </td>

                      {coordinateMode === 'utm' ? (
                        <>
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              step="0.001"
                              disabled={!canEdit}
                              value={v.utmCoordinate?.easting ?? ''}
                              onChange={(e) => {
                                const easting = parseFloat(e.target.value);
                                if (!isNaN(easting)) {
                                  const currentUtm: UtmCoordinate = v.utmCoordinate || {
                                    type: 'utm',
                                    crs: 'SIRGAS2000',
                                    easting,
                                    northing: 8000000,
                                    zone: 22,
                                    hemisphere: 'S',
                                  };
                                  const updatedUtm = { ...currentUtm, easting };
                                  onUpdateVertex(v.id, { utmCoordinate: updatedUtm });
                                }
                              }}
                              className="w-full px-2 py-1 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              step="0.001"
                              disabled={!canEdit}
                              value={v.utmCoordinate?.northing ?? ''}
                              onChange={(e) => {
                                const northing = parseFloat(e.target.value);
                                if (!isNaN(northing)) {
                                  const currentUtm: UtmCoordinate = v.utmCoordinate || {
                                    type: 'utm',
                                    crs: 'SIRGAS2000',
                                    easting: 500000,
                                    northing,
                                    zone: 22,
                                    hemisphere: 'S',
                                  };
                                  const updatedUtm = { ...currentUtm, northing };
                                  onUpdateVertex(v.id, { utmCoordinate: updatedUtm });
                                }
                              }}
                              className="w-full px-2 py-1 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="18"
                              max="25"
                              disabled={!canEdit}
                              value={v.utmCoordinate?.zone ?? 22}
                              onChange={(e) => {
                                const zone = parseInt(e.target.value, 10);
                                if (!isNaN(zone)) {
                                  const currentUtm: UtmCoordinate = v.utmCoordinate || {
                                    type: 'utm',
                                    crs: 'SIRGAS2000',
                                    easting: 500000,
                                    northing: 8000000,
                                    zone,
                                    hemisphere: 'S',
                                  };
                                  const updatedUtm = { ...currentUtm, zone };
                                  onUpdateVertex(v.id, { utmCoordinate: updatedUtm });
                                }
                              }}
                              className="w-full px-2 py-1 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-bold text-center">
                            {v.utmCoordinate?.hemisphere || 'S'}
                          </td>
                        </>
                      ) : coordinateMode === 'dms' ? (
                        <>
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              disabled={!canEdit}
                              value={v.coordinate.dmsLatitude || decimalToDmsString(v.coordinate.latitude, true)}
                              onBlur={(e) => {
                                const parsed = parseDmsString(e.target.value, true);
                                if (parsed !== null) {
                                  onUpdateVertex(v.id, {
                                    coordinate: {
                                      ...v.coordinate,
                                      latitude: parsed,
                                    },
                                  });
                                }
                              }}
                              className="w-full px-2 py-1 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              disabled={!canEdit}
                              value={v.coordinate.dmsLongitude || decimalToDmsString(v.coordinate.longitude, false)}
                              onBlur={(e) => {
                                const parsed = parseDmsString(e.target.value, false);
                                if (parsed !== null) {
                                  onUpdateVertex(v.id, {
                                    coordinate: {
                                      ...v.coordinate,
                                      longitude: parsed,
                                    },
                                  });
                                }
                              }}
                              className="w-full px-2 py-1 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs"
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              step="0.000001"
                              disabled={!canEdit}
                              value={v.coordinate.latitude}
                              onChange={(e) => {
                                const lat = parseFloat(e.target.value);
                                if (!isNaN(lat)) {
                                  onUpdateVertex(v.id, {
                                    coordinate: {
                                      ...v.coordinate,
                                      latitude: lat,
                                    },
                                  });
                                }
                              }}
                              className="w-full px-2 py-1 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              step="0.000001"
                              disabled={!canEdit}
                              value={v.coordinate.longitude}
                              onChange={(e) => {
                                const lon = parseFloat(e.target.value);
                                if (!isNaN(lon)) {
                                  onUpdateVertex(v.id, {
                                    coordinate: {
                                      ...v.coordinate,
                                      longitude: lon,
                                    },
                                  });
                                }
                              }}
                              className="w-full px-2 py-1 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs"
                            />
                          </td>
                        </>
                      )}

                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          step="0.1"
                          disabled={!canEdit}
                          value={v.altitudeMeters ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseFloat(e.target.value) : undefined;
                            onUpdateVertex(v.id, { altitudeMeters: val });
                          }}
                          placeholder="Ex: 850"
                          className="w-full px-2 py-1 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs"
                        />
                      </td>

                      <td className="py-2.5 px-3">
                        <select
                          disabled={!canEdit}
                          value={v.source}
                          onChange={(e) => onUpdateVertex(v.id, { source: e.target.value as CoordinateSource })}
                          className="w-full px-2 py-1 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs"
                        >
                          <option value="manual_entry">Entrada Manual</option>
                          <option value="gnss_survey">Levantamento GNSS</option>
                          <option value="technical_document">Doc. Técnico / Planta</option>
                          <option value="coordinate_conversion">Conversão</option>
                        </select>
                      </td>

                      {canEdit && (
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              disabled={isFirst}
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveUp(v.id);
                              }}
                              title="Subir ordem"
                              className="p-1 hover:bg-[#78C89A]/20 rounded-md disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5 text-[#0B3D2E]" />
                            </button>
                            <button
                              type="button"
                              disabled={isLast}
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveDown(v.id);
                              }}
                              title="Descer ordem"
                              className="p-1 hover:bg-[#78C89A]/20 rounded-md disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5 text-[#0B3D2E]" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveVertex(v.id);
                              }}
                              title="Remover vértice"
                              className="p-1 hover:bg-rose-100 text-rose-600 rounded-md cursor-pointer ml-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Visualização em Cartões (Mobile / Telas Pequenas) */}
          <div className="block lg:hidden space-y-3">
            {vertices.map((v, idx) => {
              const isSelected = v.id === selectedVertexId;
              const isFirst = idx === 0;
              const isLast = idx === vertices.length - 1;

              return (
                <div
                  key={v.id}
                  onClick={() => onSelectVertex(v.id)}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-[#78C89A]/15 border-[#0B3D2E]'
                      : 'bg-white border-[#0B3D2E]/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#0B3D2E]">
                      Vértice #{v.order}: {v.code || `V-${v.order}`}
                    </span>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isFirst}
                          onClick={() => onMoveUp(v.id)}
                          className="p-1.5 bg-white border border-[#0B3D2E]/20 rounded-lg text-[#0B3D2E] disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isLast}
                          onClick={() => onMoveDown(v.id)}
                          className="p-1.5 bg-white border border-[#0B3D2E]/20 rounded-lg text-[#0B3D2E] disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveVertex(v.id)}
                          className="p-1.5 bg-white border border-rose-200 text-rose-600 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] font-semibold text-[#0B3D2E]/70 mb-1">
                        Latitude (Dec)
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        disabled={!canEdit}
                        value={v.coordinate.latitude}
                        onChange={(e) => {
                          const lat = parseFloat(e.target.value);
                          if (!isNaN(lat)) {
                            onUpdateVertex(v.id, {
                              coordinate: { ...v.coordinate, latitude: lat },
                            });
                          }
                        }}
                        className="w-full px-2 py-1.5 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-[#0B3D2E]/70 mb-1">
                        Longitude (Dec)
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        disabled={!canEdit}
                        value={v.coordinate.longitude}
                        onChange={(e) => {
                          const lon = parseFloat(e.target.value);
                          if (!isNaN(lon)) {
                            onUpdateVertex(v.id, {
                              coordinate: { ...v.coordinate, longitude: lon },
                            });
                          }
                        }}
                        className="w-full px-2 py-1.5 bg-white border border-[#0B3D2E]/20 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal de Importação em Lote */}
      {isImportModalOpen && (
        <div className={PROPERTY_THEME.modalOverlay}>
          <div className={`${PROPERTY_THEME.modalContent} max-w-lg`}>
            <div className="flex items-center justify-between border-b border-[#0B3D2E]/15 pb-3">
              <h3 className="text-base font-bold text-[#0B3D2E] flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-[#78C89A]" />
                <span>Importar Vértices em Lote</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="text-[#0B3D2E]/60 hover:text-[#0B3D2E] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#0B3D2E]/80 leading-relaxed">
              Cole abaixo a sequência de coordenadas (uma por linha). Exemplo de formatos suportados:
            </p>

            <div className="bg-[#0B3D2E]/5 p-3 rounded-xl text-[11px] font-mono text-[#0B3D2E]/90 space-y-1">
              <div>-15.780123, -47.929234</div>
              <div>-15.781456, -47.928120</div>
              <div>-15.782010, -47.930450</div>
            </div>

            {importError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {importError}
              </div>
            )}

            <textarea
              rows={6}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder="Cole as coordenadas aqui..."
              className={PROPERTY_THEME.input}
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className={PROPERTY_THEME.btnSecondarySmall}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={!batchText.trim()}
                className={PROPERTY_THEME.btnPrimary}
              >
                <Check className="w-4 h-4" />
                <span>Processar e Inserir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
