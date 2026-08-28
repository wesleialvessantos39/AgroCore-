/**
 * Editor Interativo de Benfeitorias e Construções Reprodutíveis
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Em estrita conformidade com a NBR 14653 e a identidade visual AgroCore (#0B3D2E / #78C89A).
 */

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Building2,
  Warehouse,
  Wrench,
  HelpCircle,
} from 'lucide-react';
import {
  AppraisalImprovementItem,
} from '../../types/appraisalDossier';
import { APPRAISAL_THEME } from '../../appraisals/theme';
import { formatBRL, roundHalfEven } from '../../appraisals/decimalMath';

export type ImprovementCategory = AppraisalImprovementItem['category'];
export type ImprovementConservationState = AppraisalImprovementItem['conservationState'];
export type ImprovementStandard = AppraisalImprovementItem['standard'];
export type ImprovementUnit = AppraisalImprovementItem['unit'];

interface AppraisalImprovementsEditorProps {
  readonly improvements: readonly AppraisalImprovementItem[];
  readonly onChange: (improvements: readonly AppraisalImprovementItem[]) => void;
  readonly isReadOnly?: boolean;
}

export function AppraisalImprovementsEditor({
  improvements,
  onChange,
  isReadOnly = false,
}: AppraisalImprovementsEditorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AppraisalImprovementItem | null>(null);

  // Form State
  const [category, setCategory] = useState<ImprovementCategory>('construction');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState<ImprovementUnit>('m2');
  const [quantity, setQuantity] = useState<number>(100);
  const [apparentAgeYears, setApparentAgeYears] = useState<number>(5);
  const [estimatedLifespanYears, setEstimatedLifespanYears] = useState<number>(50);
  const [conservationState, setConservationState] = useState<ImprovementConservationState>('regular');
  const [standard, setStandard] = useState<ImprovementStandard>('normal');
  const [costSource, setCostSource] = useState('SINAPI / CUB');
  const [unitCostNew, setUnitCostNew] = useState<number>(1800);
  const [depreciationPercentage, setDepreciationPercentage] = useState<number>(15);
  const [technicalJustification, setTechnicalJustification] = useState('');

  const totalDepreciatedValue = improvements.reduce((acc, item) => acc + item.depreciatedTotalValue, 0);
  const totalNewValue = improvements.reduce((acc, item) => acc + item.totalCostNew, 0);

  const openAddModal = () => {
    setCategory('construction');
    setDescription('');
    setUnit('m2');
    setQuantity(100);
    setApparentAgeYears(5);
    setEstimatedLifespanYears(50);
    setConservationState('regular');
    setStandard('normal');
    setCostSource('SINAPI / CUB');
    setUnitCostNew(1800);
    setDepreciationPercentage(15);
    setTechnicalJustification('');
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: AppraisalImprovementItem) => {
    setCategory(item.category);
    setDescription(item.description);
    setUnit(item.unit);
    setQuantity(item.quantity);
    setApparentAgeYears(item.apparentAgeYears || 5);
    setEstimatedLifespanYears(item.estimatedLifespanYears || 50);
    setConservationState(item.conservationState);
    setStandard(item.standard);
    setCostSource(item.costSource);
    setUnitCostNew(item.unitCostNew);
    setDepreciationPercentage(item.depreciationPercentage);
    setTechnicalJustification(item.technicalJustification || '');
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || quantity <= 0 || unitCostNew <= 0) return;

    const totalCostNew = roundHalfEven(quantity * unitCostNew, 2);
    const factorDeprec = Math.max(0, Math.min(100, depreciationPercentage)) / 100;
    const depreciatedUnitValue = roundHalfEven(unitCostNew * (1 - factorDeprec), 2);
    const depreciatedTotalValue = roundHalfEven(totalCostNew * (1 - factorDeprec), 2);

    const newItem: AppraisalImprovementItem = {
      id: editingItem?.id || `imp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category,
      description: description.trim(),
      unit,
      quantity,
      apparentAgeYears,
      estimatedLifespanYears,
      conservationState,
      standard,
      costSource: costSource.trim(),
      unitCostNew,
      totalCostNew,
      depreciationPercentage,
      depreciatedUnitValue,
      depreciatedTotalValue,
      technicalJustification: technicalJustification.trim() || 'Avaliação por custo de reprodução e depreciação física.',
    };

    if (editingItem) {
      onChange(improvements.map((i) => (i.id === editingItem.id ? newItem : i)));
    } else {
      onChange([...improvements, newItem]);
    }

    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleDelete = (id: string) => {
    if (isReadOnly) return;
    onChange(improvements.filter((i) => i.id !== id));
  };

  // Cálculo automático de depreciação sugerida ao mudar idade/vida útil
  const autoEstimateDepreciation = (age: number, life: number, state: ImprovementConservationState) => {
    if (life <= 0) return 0;
    const ageRatio = Math.min(1, age / life);
    let stateBonus = 0;
    switch (state) {
      case 'new': stateBonus = -0.05; break;
      case 'regular': stateBonus = 0.08; break;
      case 'reparable': stateBonus = 0.20; break;
      case 'bad': stateBonus = 0.35; break;
      case 'scrap': stateBonus = 0.60; break;
    }
    const estimated = Math.max(0, Math.min(95, roundHalfEven((ageRatio * 0.7 + stateBonus) * 100, 1)));
    setDepreciationPercentage(estimated);
  };

  return (
    <div className="space-y-4" id="appraisal-improvements-container">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-[#0B3D2E] flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#0B3D2E]" />
            Inventário de Benfeitorias e Instalações (Método MQC / Custo)
          </h4>
          <p className="text-xs text-[#0B3D2E]/70">
            Cadastramento físico, custos de reprodução e aplicação de depreciação física (Ross-Heidecke).
          </p>
        </div>

        {!isReadOnly && (
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#78C89A]" />
            Adicionar Benfeitoria
          </button>
        )}
      </div>

      {/* Resumo de Totais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3 bg-white border border-[#0B3D2E]/15 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Custo Total Novo</span>
            <p className="text-base font-bold text-[#0B3D2E]">{formatBRL(totalNewValue)}</p>
          </div>
          <Warehouse className="w-6 h-6 text-[#0B3D2E]/30" />
        </div>

        <div className="p-3 bg-[#0B3D2E]/5 border border-[#0B3D2E]/20 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Total Depreciado (Valor Atual)</span>
            <p className="text-base font-bold text-[#0B3D2E]">{formatBRL(totalDepreciatedValue)}</p>
          </div>
          <Wrench className="w-6 h-6 text-[#0B3D2E]/50" />
        </div>
      </div>

      {/* Tabela de Itens */}
      {improvements.length === 0 ? (
        <div className="p-6 text-center bg-white border border-[#0B3D2E]/15 rounded-xl space-y-2">
          <p className="text-xs text-[#0B3D2E]/60">Nenhuma benfeitoria ou construção reprodutível adicionada.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-[#0B3D2E]/15 rounded-xl">
          <table className="w-full text-left text-xs border-collapse min-w-[680px]">
            <thead>
              <tr className="bg-[#0B3D2E]/5 border-b border-[#0B3D2E]/15 text-[#0B3D2E]">
                <th className="py-2.5 px-3 font-bold">Descrição</th>
                <th className="py-2.5 px-3 font-bold">Categoria</th>
                <th className="py-2.5 px-3 font-bold text-right">Qtd. / Unid.</th>
                <th className="py-2.5 px-3 font-bold text-right">Custo Novo Unit.</th>
                <th className="py-2.5 px-3 font-bold text-center">Idade / Vida</th>
                <th className="py-2.5 px-3 font-bold text-center">Deprec. (%)</th>
                <th className="py-2.5 px-3 font-bold text-right">Valor Atual</th>
                {!isReadOnly && <th className="py-2.5 px-3 font-bold text-center">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0B3D2E]/10">
              {improvements.map((item) => (
                <tr key={item.id} className="hover:bg-[#0B3D2E]/5 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-[#0B3D2E]">
                    {item.description}
                    <div className="text-[10px] text-[#0B3D2E]/60 font-normal">
                      Padrão: {item.standard} | Estado: {item.conservationState}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-[#0B3D2E]/80 capitalize">
                    {item.category}
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium text-[#0B3D2E]">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="py-2.5 px-3 text-right text-[#0B3D2E]">
                    {formatBRL(item.unitCostNew)}
                  </td>
                  <td className="py-2.5 px-3 text-center text-[#0B3D2E]/70">
                    {item.apparentAgeYears || 0}a / {item.estimatedLifespanYears || 50}a
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-[#0B3D2E]">
                    {item.depreciationPercentage}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-[#0B3D2E]">
                    {formatBRL(item.depreciatedTotalValue)}
                  </td>
                  {!isReadOnly && (
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="p-1 text-[#0B3D2E] hover:bg-[#0B3D2E]/10 rounded"
                          title="Editar"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="p-1 text-[#0B3D2E]/60 hover:text-[#0B3D2E] hover:bg-[#0B3D2E]/10 rounded"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Benfeitoria */}
      {isModalOpen && (
        <div className={APPRAISAL_THEME.modalOverlay}>
          <div className="bg-white border border-[#0B3D2E]/20 rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto text-[#0B3D2E]">
            <div className="flex items-center justify-between pb-2 border-b border-[#0B3D2E]/10">
              <h3 className="text-base font-bold text-[#0B3D2E]">
                {editingItem ? 'Editar Benfeitoria' : 'Nova Benfeitoria'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-[#0B3D2E]/60 hover:text-[#0B3D2E]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Categoria *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ImprovementCategory)}
                    className={APPRAISAL_THEME.input}
                  >
                    <option value="construction">Construção / Edificação</option>
                    <option value="installation">Instalação Geral</option>
                    <option value="shed">Barracão / Galpão</option>
                    <option value="residence">Residência</option>
                    <option value="corral">Curral / Manejo</option>
                    <option value="fencing">Cercas e Divisões</option>
                    <option value="irrigation_system">Sistema de Irrigação</option>
                    <option value="internal_road">Estrada Interna / Pavimento</option>
                    <option value="hydraulic_network">Rede Hidráulica</option>
                    <option value="electric_network">Rede Elétrica</option>
                    <option value="permanent_crop">Cultura Permanente</option>
                    <option value="urban_building">Prédio / Casa Urbana</option>
                    <option value="other">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Fonte de Custos</label>
                  <input
                    type="text"
                    value={costSource}
                    onChange={(e) => setCostSource(e.target.value)}
                    className={APPRAISAL_THEME.input}
                    placeholder="Ex: SINAPI / CUB / Tabela Local"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Descrição Detalhada *</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={APPRAISAL_THEME.input}
                  placeholder="Ex: Barracão metálico para maquinários com piso usinado"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Quantidade *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0.01"
                    value={quantity}
                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                    className={APPRAISAL_THEME.input}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Unidade *</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as ImprovementUnit)}
                    className={APPRAISAL_THEME.input}
                  >
                    <option value="m2">m²</option>
                    <option value="ha">ha</option>
                    <option value="m">m</option>
                    <option value="km">km</option>
                    <option value="un">un</option>
                    <option value="conj">conj</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Custo Novo Unit. (R$) *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0.01"
                    value={unitCostNew}
                    onChange={(e) => setUnitCostNew(parseFloat(e.target.value) || 0)}
                    className={APPRAISAL_THEME.input}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Padrão Construtivo</label>
                  <select
                    value={standard}
                    onChange={(e) => setStandard(e.target.value as ImprovementStandard)}
                    className={APPRAISAL_THEME.input}
                  >
                    <option value="low">Baixo</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alto</option>
                    <option value="luxury">Luxo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Estado de Conservação</label>
                  <select
                    value={conservationState}
                    onChange={(e) => {
                      const st = e.target.value as ImprovementConservationState;
                      setConservationState(st);
                      autoEstimateDepreciation(apparentAgeYears, estimatedLifespanYears, st);
                    }}
                    className={APPRAISAL_THEME.input}
                  >
                    <option value="new">Novo (A)</option>
                    <option value="regular">Regular (C)</option>
                    <option value="reparable">Reparos Simples (D)</option>
                    <option value="bad">Reparos Importantes (E)</option>
                    <option value="scrap">Sem Valor / Sucata (F)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 p-3 bg-[#0B3D2E]/5 border border-[#0B3D2E]/10 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold mb-1">Idade Aparente (anos)</label>
                  <input
                    type="number"
                    min="0"
                    value={apparentAgeYears}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10) || 0;
                      setApparentAgeYears(v);
                      autoEstimateDepreciation(v, estimatedLifespanYears, conservationState);
                    }}
                    className={APPRAISAL_THEME.input}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Vida Útil (anos)</label>
                  <input
                    type="number"
                    min="1"
                    value={estimatedLifespanYears}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10) || 50;
                      setEstimatedLifespanYears(v);
                      autoEstimateDepreciation(apparentAgeYears, v, conservationState);
                    }}
                    className={APPRAISAL_THEME.input}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Depreciação (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={depreciationPercentage}
                    onChange={(e) => setDepreciationPercentage(parseFloat(e.target.value) || 0)}
                    className={APPRAISAL_THEME.input}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#0B3D2E] bg-white border border-[#0B3D2E]/30 rounded-xl hover:bg-[#0B3D2E]/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90"
                >
                  Salvar Benfeitoria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
