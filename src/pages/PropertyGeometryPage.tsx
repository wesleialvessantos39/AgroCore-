/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Página de Georreferenciamento Interno, Glebas e Polígonos
 * 
 * Funcionalidades completas:
 * - Gestão multi-glebas com polígonos independentes
 * - Anéis perimetrais externos e vazios internos (encravamentos/exclusões)
 * - Editor interativo de vértices (Graus Decimais, DMS, UTM)
 * - Visualizador vetorial SVG puro, responsivo e offline
 * - Segmentos de limites com confrontantes e serventias
 * - Validação topológica contínua
 * - Cálculo geodésico de áreas e comparativo com dados cadastrais
 * - Reorganização técnica perimetral
 */

import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePropertyGeometry } from '../properties/geometry/usePropertyGeometry';
import { PropertyGeometryViewer } from '../properties/components/PropertyGeometryViewer';
import { VertexEditor } from '../properties/components/VertexEditor';
import { InnerVoidsEditor } from '../properties/components/InnerVoidsEditor';
import { BoundarySegmentsEditor } from '../properties/components/BoundarySegmentsEditor';
import { AreaComparisonCard } from '../properties/components/AreaComparisonCard';
import { GeometryValidationIssues } from '../properties/components/GeometryValidationIssues';
import { ReorganizeVerticesModal } from '../properties/components/ReorganizeVerticesModal';
import { ROUTES, getPropertyEditPath } from '../routes/paths';
import { PROPERTY_THEME } from '../properties/theme';
import {
  MapPin,
  Save,
  RotateCcw,
  Compass,
  Layers,
  ChevronRight,
  ShieldAlert,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Plus,
  Trash2,
  ArrowLeft,
} from 'lucide-react';
import { CoordinateInputType, PropertyGeometryStatus } from '../types/propertyGeometry';

type TabType = 'vertices' | 'voids' | 'boundaries' | 'metrics';

export const PropertyGeometryPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>('vertices');
  const [showAllParcels, setShowAllParcels] = useState(true);
  const [isReorganizeModalOpen, setIsReorganizeModalOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const {
    isLoading,
    isSaving,
    error,
    property,
    geometry,
    parcels,
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
    saveGeometry,
    resetChanges,
  } = usePropertyGeometry(propertyId || '');

  // Salvar alterações
  const handleSave = async (targetStatus?: PropertyGeometryStatus) => {
    setFeedbackMessage(null);
    const res = await saveGeometry(targetStatus);
    if (res.success) {
      setFeedbackMessage({ text: 'Georreferenciamento salvo com sucesso!', type: 'success' });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } else {
      setFeedbackMessage({ text: res.error || 'Erro ao salvar geometria.', type: 'error' });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#78C89A] border-t-[#0B3D2E] rounded-full animate-spin" />
          <p className="text-sm font-semibold text-[#0B3D2E]">Carregando dados georreferenciados...</p>
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 space-y-2">
          <h3 className="text-base font-bold text-rose-800">Falha ao acessar geometria do imóvel</h3>
          <p className="text-xs">{error || 'Imóvel não encontrado ou sem permissão de acesso.'}</p>
          <Link
            to="/properties"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-900 underline mt-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar para Lista de Imóveis</span>
          </Link>
        </div>
      </div>
    );
  }

  const isRural = property.propertyType === 'rural';
  const cityState = `${property.location.city}/${property.location.state}`;
  const cibDisplay = property.identifiers.cib || 'Não informado';
  const sncrDisplay = isRural ? (property.identifiers.sncrIncraCode || 'Não informado') : null;
  const areaDisplay = isRural
    ? `${property.areas.totalDeclaredAreaHa} ha`
    : `${property.areas.landAreaM2} m²`;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Navegação Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-semibold text-[#0B3D2E]/70">
        <Link to={ROUTES.PROPERTIES} className="hover:text-[#0B3D2E] hover:underline">
          Imóveis
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to={getPropertyEditPath(property.id)} className="hover:text-[#0B3D2E] hover:underline">
          {property.name}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-[#0B3D2E] font-bold">Georreferenciamento Interno</span>
      </nav>

      {/* Cabeçalho do Imóvel e Status */}
      <div className="flex flex-wrap items-start justify-between gap-4 bg-white border border-[#0B3D2E]/15 p-5 rounded-2xl shadow-xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-[#0B3D2E]">{property.name}</h1>
            <span className="text-xs px-2.5 py-0.5 bg-[#78C89A]/20 text-[#0B3D2E] font-bold rounded-full border border-[#78C89A]/40">
              {isRural ? 'Imóvel Rural' : 'Imóvel Urbano'}
            </span>
            {isDirty && (
              <span className="text-xs px-2.5 py-0.5 bg-amber-100 text-amber-900 font-bold rounded-full border border-amber-300">
                Alterações não salvas
              </span>
            )}
          </div>
          <p className="text-xs text-[#0B3D2E]/70">
            {cityState} • CIB: {cibDisplay} {sncrDisplay ? `• SNCR: ${sncrDisplay}` : ''} • Área Declarada: {areaDisplay}
          </p>
        </div>

        {/* Controles de Status e Ações */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[#0B3D2E]/5 border border-[#0B3D2E]/15 px-3 py-1.5 rounded-xl">
            <span className="text-xs font-semibold text-[#0B3D2E]">Status da Geometria:</span>
            <select
              disabled={!canEdit}
              value={status}
              onChange={(e) => setStatus(e.target.value as PropertyGeometryStatus)}
              className="text-xs font-bold text-[#0B3D2E] bg-white border border-[#0B3D2E]/20 rounded-lg px-2 py-1 focus:ring-1 focus:ring-[#78C89A]"
            >
              <option value="draft">Rascunho</option>
              <option value="under_review">Em Revisão</option>
              <option value="validated_internally">Validado Internamente</option>
            </select>
          </div>

          {canEdit && (
            <>
              {isDirty && (
                <button
                  type="button"
                  onClick={resetChanges}
                  className={PROPERTY_THEME.btnSecondarySmall}
                  title="Descartar alterações não salvas"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Descartar</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={isSaving}
                className={PROPERTY_THEME.btnPrimary}
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Salvando...' : 'Salvar Geometria'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alerta de Feedback */}
      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            feedbackMessage.type === 'success'
              ? 'bg-[#78C89A]/20 border border-[#78C89A]/40 text-[#0B3D2E]'
              : 'bg-rose-50 border border-rose-200 text-rose-900'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#0B3D2E]" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-700" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Aviso de Responsabilidade Técnica Interna */}
      <div className="flex items-start gap-3 p-3.5 bg-[#78C89A]/10 border border-[#78C89A]/30 rounded-2xl text-xs text-[#0B3D2E] leading-relaxed">
        <ShieldAlert className="w-5 h-5 text-[#0B3D2E] shrink-0 mt-0.5" />
        <div>
          <strong className="font-bold">Aviso Técnico de Uso Interno:</strong> Os dados, métricas e representações vetoriais disponibilizados nesta ferramenta destinam-se exclusivamente ao planejamento operacional e acompanhamento gerencial interno no AgroCore. Não substituem levantamento topográfico oficial, memorial descritivo emitido por profissional credenciado com ART/TRT, certidão de registro de imóveis ou certificação perante o SIGEF/Incra.
        </div>
      </div>

      {/* Visualizador Vetorial SVG */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#78C89A]" />
            <h3 className="text-sm font-bold text-[#0B3D2E]">
              Prévia Geométrica Vetorial (SIRGAS2000)
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-[#0B3D2E] cursor-pointer">
              <input
                type="checkbox"
                checked={showAllParcels}
                onChange={(e) => setShowAllParcels(e.target.checked)}
                className="rounded border-[#0B3D2E]/30 text-[#0B3D2E] focus:ring-[#78C89A]"
              />
              <span>Exibir todas as glebas simultaneamente</span>
            </label>
          </div>
        </div>

        <PropertyGeometryViewer
          parcels={parcels}
          selectedParcelId={selectedParcelId}
          selectedVertexId={selectedVertexId}
          onSelectParcel={setSelectedParcelId}
          onSelectVertex={setSelectedVertexId}
          showAllParcels={showAllParcels}
        />
      </div>

      {/* Painel de Validação Topológica */}
      <GeometryValidationIssues
        validationResult={validationResult}
        onSelectParcel={setSelectedParcelId}
        onSelectVertex={setSelectedVertexId}
      />

      {/* Barra de Seleção de Glebas e Formato de Coordenadas */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#0B3D2E]/15 p-3 rounded-2xl shadow-2xs">
        {/* Seletor de Glebas */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-[#0B3D2E] mr-1 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-[#78C89A]" />
            <span>Gleba:</span>
          </span>
          {parcels.map((p) => {
            const isSelected = p.id === selectedParcelId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedParcelId(p.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#0B3D2E] text-white shadow-xs'
                    : 'bg-white text-[#0B3D2E] border border-[#0B3D2E]/20 hover:bg-[#78C89A]/15'
                }`}
              >
                {p.code || p.name}
              </button>
            );
          })}
          {canEdit && (
            <button
              type="button"
              onClick={() => addParcel()}
              className="p-1.5 bg-white border border-[#0B3D2E]/30 text-[#0B3D2E] hover:bg-[#78C89A]/20 rounded-xl text-xs font-bold flex items-center gap-1"
              title="Adicionar nova gleba / parcela"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Gleba</span>
            </button>
          )}
        </div>

        {/* Seletor de Formato de Coordenadas e Ações de Ordenação */}
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && activeParcel && (activeParcel.outerRing.vertices || []).length >= 3 && (
            <button
              type="button"
              onClick={() => setIsReorganizeModalOpen(true)}
              className={PROPERTY_THEME.btnSecondarySmall}
              title="Orientar no sentido horário com vértice mais ao norte"
            >
              <Compass className="w-3.5 h-3.5 text-[#0B3D2E]" />
              <span>Orientação Técnica</span>
            </button>
          )}

          <div className="flex items-center bg-[#0B3D2E]/5 border border-[#0B3D2E]/15 p-0.5 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setCoordinateMode('decimal')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                coordinateMode === 'decimal'
                  ? 'bg-white text-[#0B3D2E] shadow-2xs'
                  : 'text-[#0B3D2E]/70 hover:text-[#0B3D2E]'
              }`}
            >
              Decimal (SIRGAS2000)
            </button>
            <button
              type="button"
              onClick={() => setCoordinateMode('dms')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                coordinateMode === 'dms'
                  ? 'bg-white text-[#0B3D2E] shadow-2xs'
                  : 'text-[#0B3D2E]/70 hover:text-[#0B3D2E]'
              }`}
            >
              GMS (DMS)
            </button>
            <button
              type="button"
              onClick={() => setCoordinateMode('utm')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                coordinateMode === 'utm'
                  ? 'bg-white text-[#0B3D2E] shadow-2xs'
                  : 'text-[#0B3D2E]/70 hover:text-[#0B3D2E]'
              }`}
            >
              UTM (Métrico)
            </button>
          </div>
        </div>
      </div>

      {/* Abas de Trabalho da Parcela Ativa */}
      {activeParcel && (
        <div className="space-y-4">
          <div className="flex border-b border-[#0B3D2E]/15 overflow-x-auto gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('vertices')}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'vertices'
                  ? 'border-[#0B3D2E] text-[#0B3D2E]'
                  : 'border-transparent text-[#0B3D2E]/60 hover:text-[#0B3D2E]'
              }`}
            >
              1. Vértices do Anel Externo ({activeParcel.outerRing.vertices?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('voids')}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'voids'
                  ? 'border-[#0B3D2E] text-[#0B3D2E]'
                  : 'border-transparent text-[#0B3D2E]/60 hover:text-[#0B3D2E]'
              }`}
            >
              2. Vazios e Exclusões ({activeParcel.innerVoids?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('boundaries')}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'boundaries'
                  ? 'border-[#0B3D2E] text-[#0B3D2E]'
                  : 'border-transparent text-[#0B3D2E]/60 hover:text-[#0B3D2E]'
              }`}
            >
              3. Confrontações e Divisas ({activeParcel.boundarySegments?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('metrics')}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'metrics'
                  ? 'border-[#0B3D2E] text-[#0B3D2E]'
                  : 'border-transparent text-[#0B3D2E]/60 hover:text-[#0B3D2E]'
              }`}
            >
              4. Métricas e Comparativo Cadastral
            </button>
          </div>

          {/* Conteúdo da Aba Ativa */}
          <div className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-5 shadow-xs">
            {activeTab === 'vertices' && (
              <VertexEditor
                parcelId={activeParcel.id}
                vertices={activeParcel.outerRing.vertices || []}
                selectedVertexId={selectedVertexId}
                coordinateMode={coordinateMode}
                canEdit={canEdit}
                onSelectVertex={setSelectedVertexId}
                onAddVertex={() => addVertexToActiveParcel()}
                onUpdateVertex={(vId, updates) => updateVertex(activeParcel.id, vId, updates)}
                onRemoveVertex={(vId) => removeVertex(activeParcel.id, vId)}
                onMoveUp={(vId) => moveVertexUp(activeParcel.id, vId)}
                onMoveDown={(vId) => moveVertexDown(activeParcel.id, vId)}
                onBatchImport={(text, mode) => importBatchVertices(activeParcel.id, text, mode)}
              />
            )}

            {activeTab === 'voids' && (
              <InnerVoidsEditor
                parcelId={activeParcel.id}
                innerVoids={activeParcel.innerVoids || []}
                coordinateMode={coordinateMode}
                canEdit={canEdit}
                onAddVoid={(name) => addInnerVoid(activeParcel.id, name)}
                onRemoveVoid={(vId) => removeInnerVoid(activeParcel.id, vId)}
                onAddVoidVertex={(vId, coord) => addVertexToVoid(activeParcel.id, vId, coord)}
                onUpdateVoidVertex={(vId, vertId, updates) =>
                  updateVoidVertex(activeParcel.id, vId, vertId, updates)
                }
                onRemoveVoidVertex={(vId, vertId) =>
                  removeVoidVertex(activeParcel.id, vId, vertId)
                }
              />
            )}

            {activeTab === 'boundaries' && (
              <BoundarySegmentsEditor
                parcelId={activeParcel.id}
                vertices={activeParcel.outerRing.vertices || []}
                boundarySegments={activeParcel.boundarySegments || []}
                canEdit={canEdit}
                onUpdateSegment={(sId, updates) =>
                  updateBoundarySegment(activeParcel.id, sId, updates)
                }
              />
            )}

            {activeTab === 'metrics' && (
              <AreaComparisonCard
                totalMetrics={totalMetrics}
                areaComparison={areaComparison}
              />
            )}
          </div>
        </div>
      )}

      {/* Modal de Reorganização de Vértices */}
      {activeParcel && (
        <ReorganizeVerticesModal
          isOpen={isReorganizeModalOpen}
          vertices={activeParcel.outerRing.vertices || []}
          onClose={() => setIsReorganizeModalOpen(false)}
          onConfirm={reorganizeActiveParcelVertices}
        />
      )}
    </div>
  );
};
export default PropertyGeometryPage;
