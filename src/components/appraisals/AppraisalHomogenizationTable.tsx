/**
 * Tabela Interativa de Amostras de Mercado e Homogeneização
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Em estrita conformidade com a NBR 14653 e a identidade visual AgroCore (#0B3D2E / #78C89A).
 */

import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart3,
  Calculator,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  AppraisalMarketSample,
  HomogenizedSampleResult,
  MarketSampleNature,
  MarketSampleStatus,
  StatisticalAnalysisResult,
} from '../../types/appraisalCalculation';
import { APPRAISAL_THEME } from '../../appraisals/theme';
import { calculateSampleHomogenization } from '../../appraisals/homogenizationEngine';
import { formatBRL, roundHalfEven } from '../../appraisals/decimalMath';

interface AppraisalHomogenizationTableProps {
  readonly appraisalId: string;
  readonly samples: readonly AppraisalMarketSample[];
  readonly onSaveSample: (sample: AppraisalMarketSample) => Promise<void>;
  readonly onDeleteSample: (sampleId: string) => Promise<void>;
  readonly isReadOnly?: boolean;
}

export function AppraisalHomogenizationTable({
  appraisalId,
  samples,
  onSaveSample,
  onDeleteSample,
  isReadOnly = false,
}: AppraisalHomogenizationTableProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSample, setEditingSample] = useState<AppraisalMarketSample | null>(null);

  // Form State para Nova Amostra
  const [sampleCode, setSampleCode] = useState(`AM-${samples.length + 1}`);
  const [source, setSource] = useState('');
  const [nature, setNature] = useState<MarketSampleNature>('offer');
  const [city, setCity] = useState('');
  const [state, setState] = useState('MT');
  const [locationDescription, setLocationDescription] = useState('');
  const [totalArea, setTotalArea] = useState<number>(100);
  const [areaUnit, setAreaUnit] = useState<'ha' | 'm2'>('ha');
  const [totalPrice, setTotalPrice] = useState<number>(3000000);
  const [accessScore, setAccessScore] = useState<number>(3);
  const [topographyScore, setTopographyScore] = useState<number>(3);
  const [soilScore, setSoilScore] = useState<number>(3);
  const [waterScore, setWaterScore] = useState<number>(3);
  const [constructionStandardScore, setConstructionStandardScore] = useState<number>(3);
  const [conservationScore, setConservationScore] = useState<number>(3);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Cálculo da homogeneização de todas as amostras
  const { homogenizedResults, stats } = useMemo(() => {
    return calculateSampleHomogenization(samples);
  }, [samples]);

  const openNewSampleModal = () => {
    setSampleCode(`AM-${samples.length + 1}`);
    setSource('');
    setNature('offer');
    setCity('');
    setState('MT');
    setLocationDescription('');
    setTotalArea(100);
    setAreaUnit('ha');
    setTotalPrice(3000000);
    setAccessScore(3);
    setTopographyScore(3);
    setSoilScore(3);
    setWaterScore(3);
    setConstructionStandardScore(3);
    setConservationScore(3);
    setNotes('');
    setFormError(null);
    setEditingSample(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (sample: AppraisalMarketSample) => {
    setSampleCode(sample.sampleCode);
    setSource(sample.source);
    setNature(sample.nature);
    setCity(sample.city);
    setState(sample.state);
    setLocationDescription(sample.locationDescription);
    setTotalArea(sample.totalArea);
    setAreaUnit(sample.areaUnit);
    setTotalPrice(sample.totalPrice);
    setAccessScore(sample.attributes.accessScore || 3);
    setTopographyScore(sample.attributes.topographyScore || 3);
    setSoilScore(sample.attributes.soilScore || 3);
    setWaterScore(sample.attributes.waterScore || 3);
    setConstructionStandardScore(sample.attributes.constructionStandardScore || 3);
    setConservationScore(sample.attributes.conservationScore || 3);
    setNotes(sample.notes || '');
    setFormError(null);
    setEditingSample(sample);
    setIsAddModalOpen(true);
  };

  const handleSaveSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sampleCode.trim() || !source.trim() || !city.trim() || totalArea <= 0 || totalPrice <= 0) {
      setFormError('Preencha os campos obrigatórios e informe valores numéricos maiores que zero.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const rawUnitPrice = roundHalfEven(totalPrice / totalArea, 2);
    const now = new Date().toISOString();

    const sampleData: AppraisalMarketSample = {
      id: editingSample?.id || '',
      appraisalId,
      organizationId: editingSample?.organizationId || '',
      sampleCode: sampleCode.trim(),
      source: source.trim(),
      collectionDate: editingSample?.collectionDate || now.split('T')[0],
      nature,
      locationDescription: locationDescription.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase(),
      totalArea,
      areaUnit,
      totalPrice,
      rawUnitPrice,
      currency: 'BRL',
      attributes: {
        accessScore,
        topographyScore,
        soilScore,
        waterScore,
        constructionStandardScore,
        conservationScore,
      },
      status: editingSample?.status || 'included',
      exclusionJustification: editingSample?.exclusionJustification,
      notes: notes.trim() || undefined,
      collectedByUserId: editingSample?.collectedByUserId || 'system',
      createdAt: editingSample?.createdAt || now,
      updatedAt: now,
    };

    try {
      await onSaveSample(sampleData);
      setIsAddModalOpen(false);
      setEditingSample(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar amostra de mercado.';
      setFormError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (sample: AppraisalMarketSample) => {
    if (isReadOnly) return;
    const newStatus: MarketSampleStatus = sample.status === 'included' ? 'excluded' : 'included';
    const justification =
      newStatus === 'excluded'
        ? 'Amostra excluída por critério técnico ou dispersão estatística.'
        : undefined;

    await onSaveSample({
      ...sample,
      status: newStatus,
      exclusionJustification: justification,
    });
  };

  return (
    <div className="space-y-6" id="appraisal-homogenization-container">
      {/* Header & Ação de Adicionar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#0B3D2E] flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[#0B3D2E]" />
            Pesquisa de Mercado e Homogeneização (NBR 14653)
          </h3>
          <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
            Amostras coletadas, ponderação de fatores e cálculo estatístico do valor unitário.
          </p>
        </div>

        {!isReadOnly && (
          <button
            type="button"
            id="add-market-sample-btn"
            onClick={openNewSampleModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4 text-[#78C89A]" />
            Nova Amostra
          </button>
        )}
      </div>

      {/* Cards de Métricas Estatísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-white border border-[#0B3D2E]/15 rounded-xl">
          <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Amostras Válidas</span>
          <p className="text-lg font-bold text-[#0B3D2E] mt-1">
            {stats.validSamplesCount} <span className="text-xs font-normal text-[#0B3D2E]/60">/ {stats.totalSamples}</span>
          </p>
        </div>

        <div className="p-3.5 bg-white border border-[#0B3D2E]/15 rounded-xl">
          <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Média Homogeneizada</span>
          <p className="text-lg font-bold text-[#0B3D2E] mt-1">
            {formatBRL(stats.mean)}
          </p>
        </div>

        <div className="p-3.5 bg-white border border-[#0B3D2E]/15 rounded-xl">
          <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Mediana</span>
          <p className="text-lg font-bold text-[#0B3D2E] mt-1">
            {formatBRL(stats.median)}
          </p>
        </div>

        <div className="p-3.5 bg-white border border-[#0B3D2E]/15 rounded-xl">
          <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Coef. Variação (CV)</span>
          <p className="text-lg font-bold text-[#0B3D2E] mt-1">
            {stats.coefficientOfVariationPercentage.toFixed(2)}%
          </p>
          <span className="text-[9px] text-[#0B3D2E]/60">
            {stats.coefficientOfVariationPercentage <= 15 ? 'Grau III / II' : 'Grau I / Disperso'}
          </span>
        </div>

        <div className="p-3.5 bg-white border border-[#0B3D2E]/15 rounded-xl">
          <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Desvio Padrão</span>
          <p className="text-lg font-bold text-[#0B3D2E] mt-1">
            {formatBRL(stats.standardDeviation)}
          </p>
        </div>

        <div className="p-3.5 bg-white border border-[#0B3D2E]/15 rounded-xl">
          <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Int. Confiança (90%)</span>
          <p className="text-xs font-bold text-[#0B3D2E] mt-1">
            {formatBRL(stats.confidenceInterval90.lower)}
          </p>
          <p className="text-xs font-bold text-[#0B3D2E]">
            {formatBRL(stats.confidenceInterval90.upper)}
          </p>
        </div>
      </div>

      {/* Tabela de Amostras */}
      {samples.length === 0 ? (
        <div className="p-8 text-center bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-3">
          <Calculator className="w-8 h-8 text-[#0B3D2E]/40 mx-auto" />
          <h4 className="text-sm font-bold text-[#0B3D2E]">Nenhuma amostra de mercado cadastrada</h4>
          <p className="text-xs text-[#0B3D2E]/70 max-w-md mx-auto">
            Cadastre elementos amostrais pesquisados no mercado para realizar a homogeneização e o enquadramento estatístico conforme a NBR 14653.
          </p>
          {!isReadOnly && (
            <button
              type="button"
              onClick={openNewSampleModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-[#78C89A]" />
              Cadastrar Primeira Amostra
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-[#0B3D2E]/15 rounded-2xl shadow-xs">
          <table className="w-full text-left text-xs border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-[#0B3D2E]/5 border-b border-[#0B3D2E]/15 text-[#0B3D2E]">
                <th className="py-3 px-3.5 font-bold">Código</th>
                <th className="py-3 px-3 font-bold">Natureza / Fonte</th>
                <th className="py-3 px-3 font-bold">Localização</th>
                <th className="py-3 px-3 font-bold text-right">Área</th>
                <th className="py-3 px-3 font-bold text-right">Preço Total</th>
                <th className="py-3 px-3 font-bold text-right">Unitário Bruto</th>
                <th className="py-3 px-3 font-bold text-center">Fator Total</th>
                <th className="py-3 px-3 font-bold text-right">Unitário Homog.</th>
                <th className="py-3 px-3 font-bold text-center">Status</th>
                {!isReadOnly && <th className="py-3 px-3 font-bold text-center">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0B3D2E]/10">
              {samples.map((sample) => {
                const homog = homogenizedResults.find((h) => h.sampleId === sample.id);
                const isExcluded = sample.status === 'excluded';

                return (
                  <tr
                    key={sample.id}
                    className={`hover:bg-[#0B3D2E]/5 transition-colors ${
                      isExcluded ? 'opacity-60 bg-[#0B3D2E]/5' : ''
                    }`}
                  >
                    <td className="py-3 px-3.5 font-bold text-[#0B3D2E]">
                      {sample.sampleCode}
                    </td>
                    <td className="py-3 px-3 text-[#0B3D2E]/80">
                      <span className="font-semibold text-[#0B3D2E]">
                        {sample.nature === 'offer' ? 'Oferta (-5%)' : 'Transação'}
                      </span>
                      <div className="text-[11px] text-[#0B3D2E]/60 truncate max-w-[140px]">
                        {sample.source}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[#0B3D2E]/80">
                      <div>{sample.city}/{sample.state}</div>
                      <div className="text-[10px] text-[#0B3D2E]/60 truncate max-w-[120px]">
                        {sample.locationDescription || 'Não informada'}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-[#0B3D2E]">
                      {sample.totalArea.toLocaleString('pt-BR')} {sample.areaUnit}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-[#0B3D2E]">
                      {formatBRL(sample.totalPrice)}
                    </td>
                    <td className="py-3 px-3 text-right text-[#0B3D2E]/80">
                      {formatBRL(sample.rawUnitPrice)}/{sample.areaUnit}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-[#0B3D2E]">
                      {homog ? homog.totalFactorMultiplier.toFixed(3) : '1.000'}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-[#0B3D2E]">
                      {homog ? formatBRL(homog.homogenizedUnitPrice) : formatBRL(sample.rawUnitPrice)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(sample)}
                        disabled={isReadOnly}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                          sample.status === 'included'
                            ? 'bg-[#0B3D2E] text-white border-[#0B3D2E]'
                            : 'bg-white text-[#0B3D2E]/60 border-[#0B3D2E]/30'
                        }`}
                        title="Alternar inclusão no cálculo estatístico"
                      >
                        {sample.status === 'included' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-[#78C89A]" />
                            Válida
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" />
                            Excluída
                          </>
                        )}
                      </button>
                    </td>
                    {!isReadOnly && (
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(sample)}
                            className="p-1 text-[#0B3D2E] hover:bg-[#0B3D2E]/10 rounded-md transition-colors"
                            title="Editar Amostra"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSample(sample.id)}
                            className="p-1 text-[#0B3D2E]/70 hover:text-[#0B3D2E] hover:bg-[#0B3D2E]/10 rounded-md transition-colors"
                            title="Excluir Amostra"
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
      )}

      {/* Modal de Cadastro / Edição de Amostra */}
      {isAddModalOpen && (
        <div className={APPRAISAL_THEME.modalOverlay}>
          <div className="bg-white border border-[#0B3D2E]/20 rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#0B3D2E]/10">
              <h3 className="text-base font-bold text-[#0B3D2E] flex items-center gap-2">
                <Calculator className="w-5 h-5 text-[#0B3D2E]" />
                {editingSample ? 'Editar Amostra de Mercado' : 'Nova Amostra de Mercado'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-[#0B3D2E]/60 hover:text-[#0B3D2E] rounded-lg"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-[#0B3D2E]/10 border border-[#0B3D2E]/30 rounded-xl text-xs text-[#0B3D2E]">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveSample} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                    Código Amostral *
                  </label>
                  <input
                    type="text"
                    required
                    value={sampleCode}
                    onChange={(e) => setSampleCode(e.target.value)}
                    className={APPRAISAL_THEME.input}
                    placeholder="Ex: AM-01"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                    Natureza do Dado *
                  </label>
                  <select
                    value={nature}
                    onChange={(e) => setNature(e.target.value as MarketSampleNature)}
                    className={APPRAISAL_THEME.input}
                  >
                    <option value="offer">Oferta (Aplica Fator Oferta 0.95)</option>
                    <option value="transaction">Transação Efetiva (Fator 1.00)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                    Fonte da Informação *
                  </label>
                  <input
                    type="text"
                    required
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className={APPRAISAL_THEME.input}
                    placeholder="Ex: Imobiliária Terra Boa / Cartório"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                    Município *
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={APPRAISAL_THEME.input}
                    placeholder="Ex: Sorriso"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                    UF *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    className={APPRAISAL_THEME.input}
                    placeholder="MT"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Localização / Referência
                </label>
                <input
                  type="text"
                  value={locationDescription}
                  onChange={(e) => setLocationDescription(e.target.value)}
                  className={APPRAISAL_THEME.input}
                  placeholder="Ex: Rodovia MT-242, km 35, margem direita"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                    Área Total *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0.01"
                    value={totalArea}
                    onChange={(e) => setTotalArea(parseFloat(e.target.value) || 0)}
                    className={APPRAISAL_THEME.input}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                    Unidade de Área
                  </label>
                  <select
                    value={areaUnit}
                    onChange={(e) => setAreaUnit(e.target.value as 'ha' | 'm2')}
                    className={APPRAISAL_THEME.input}
                  >
                    <option value="ha">Hectares (ha)</option>
                    <option value="m2">Metros Quadrados (m²)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                    Preço Total (R$) *
                  </label>
                  <input
                    type="number"
                    required
                    step="1"
                    min="1"
                    value={totalPrice}
                    onChange={(e) => setTotalPrice(parseFloat(e.target.value) || 0)}
                    className={APPRAISAL_THEME.input}
                  />
                </div>
              </div>

              {/* Fatores Qualitativos para Homogeneização */}
              <div className="p-4 bg-[#0B3D2E]/5 border border-[#0B3D2E]/15 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-[#0B3D2E] uppercase tracking-wide">
                  Atributos e Fatores de Ponderação (Escala 1 a 5)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-[#0B3D2E] font-medium mb-1">Acesso (1-5)</label>
                    <select
                      value={accessScore}
                      onChange={(e) => setAccessScore(parseInt(e.target.value, 10))}
                      className={APPRAISAL_THEME.input}
                    >
                      <option value={1}>1 - Muito Ruim / Isolado</option>
                      <option value={2}>2 - Ruim / Vicinal precária</option>
                      <option value={3}>3 - Regular / Vicinal boa</option>
                      <option value={4}>4 - Bom / Próximo a asfalto</option>
                      <option value={5}>5 - Ótimo / Frente ao Asfalto</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#0B3D2E] font-medium mb-1">Topografia (1-5)</label>
                    <select
                      value={topographyScore}
                      onChange={(e) => setTopographyScore(parseInt(e.target.value, 10))}
                      className={APPRAISAL_THEME.input}
                    >
                      <option value={1}>1 - Montanhoso</option>
                      <option value={2}>2 - Forte Ondulado</option>
                      <option value={3}>3 - Ondulado</option>
                      <option value={4}>4 - Suave Ondulado</option>
                      <option value={5}>5 - Plano / Mecanizável</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#0B3D2E] font-medium mb-1">Solos / Aptidão (1-5)</label>
                    <select
                      value={soilScore}
                      onChange={(e) => setSoilScore(parseInt(e.target.value, 10))}
                      className={APPRAISAL_THEME.input}
                    >
                      <option value={1}>1 - Arenoso / Raso</option>
                      <option value={2}>2 - Textura Média Baixa</option>
                      <option value={3}>3 - Médio Argiloso</option>
                      <option value={4}>4 - Argiloso Fértil</option>
                      <option value={5}>5 - Muito Argiloso Prime</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#0B3D2E] font-medium mb-1">Recursos Hídricos (1-5)</label>
                    <select
                      value={waterScore}
                      onChange={(e) => setWaterScore(parseInt(e.target.value, 10))}
                      className={APPRAISAL_THEME.input}
                    >
                      <option value={1}>1 - Sem água superficial</option>
                      <option value={2}>2 - Córrego temporário</option>
                      <option value={3}>3 - Córrego perene</option>
                      <option value={4}>4 - Rio / Nascentes perenes</option>
                      <option value={5}>5 - Potencial de Irrigação/Pivô</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#0B3D2E] font-medium mb-1">Padrão Construtivo (1-5)</label>
                    <select
                      value={constructionStandardScore}
                      onChange={(e) => setConstructionStandardScore(parseInt(e.target.value, 10))}
                      className={APPRAISAL_THEME.input}
                    >
                      <option value={1}>1 - Rústico / Mínimo</option>
                      <option value={2}>2 - Baixo</option>
                      <option value={3}>3 - Normal</option>
                      <option value={4}>4 - Alto</option>
                      <option value={5}>5 - Luxo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#0B3D2E] font-medium mb-1">Conservação (1-5)</label>
                    <select
                      value={conservationScore}
                      onChange={(e) => setConservationScore(parseInt(e.target.value, 10))}
                      className={APPRAISAL_THEME.input}
                    >
                      <option value={1}>1 - Demolição / Ruína</option>
                      <option value={2}>2 - Reparos Importantes</option>
                      <option value={3}>3 - Regular</option>
                      <option value={4}>4 - Bom</option>
                      <option value={5}>5 - Novo / Excelente</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Observações Periciais
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={APPRAISAL_THEME.input}
                  placeholder="Informações adicionais sobre o vendedor, condições de pagamento ou benfeitorias inclusas..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#0B3D2E]/10">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#0B3D2E] bg-white border border-[#0B3D2E]/30 rounded-xl hover:bg-[#0B3D2E]/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 disabled:opacity-50"
                >
                  {isSaving ? 'Salvando...' : editingSample ? 'Salvar Alterações' : 'Adicionar Amostra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
