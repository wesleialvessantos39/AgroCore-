/**
 * Espaço de Trabalho do Dossiê Técnico Pericial (NBR 14653)
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Integração completa das 9 seções do laudo:
 * 1. Identificação e Finalidade
 * 2. Caracterização Física e Territorial
 * 3. Benfeitorias e Custo de Reprodução
 * 4. Pesquisa de Mercado e Homogeneização
 * 5. Métodos Avaliatórios e Cálculos (MCDDM / Evolutivo)
 * 6. Enquadramento e Graus NBR 14653
 * 7. Síntese Avaliatória e Conclusão
 * 8. Documentos e Anexos Consultados
 * 9. Emissão Formal, Prontidão e Versionamento Canônico
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  MapPin,
  Building2,
  Sliders,
  Calculator,
  ShieldCheck,
  Award,
  Paperclip,
  CheckSquare,
  ArrowLeft,
  Save,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  Appraisal,
} from '../../types/appraisal';
import {
  AppraisalTechnicalDossier,
  DossierSectionKey,
  AppraisalImprovementItem,
  RuralCharacterizationSection,
} from '../../types/appraisalDossier';
import {
  AppraisalMarketSample,
  AppraisalCalculationSection,
} from '../../types/appraisalCalculation';
import { AppraisalNormativeSection, NormativeDegree } from '../../types/appraisalNormative';
import { AppraisalIssuedVersion } from '../../types/appraisalVersioning';
import { APPRAISAL_THEME } from '../../appraisals/theme';
import { roundHalfEven, formatBRL } from '../../appraisals/decimalMath';
import { AppraisalHomogenizationTable } from './AppraisalHomogenizationTable';
import { AppraisalImprovementsEditor } from './AppraisalImprovementsEditor';
import { AppraisalIssuancePanel } from './AppraisalIssuancePanel';
import { ValuationMethodEngine } from '../../appraisals/valuationMethods';

export interface AppraisalDossierWorkspaceProps {
  readonly appraisal: Appraisal;
  readonly onBack: () => void;
  readonly currentUserId: string;
  readonly currentUserRole: string;
  readonly getTechnicalDossier: (appraisalId: string) => Promise<AppraisalTechnicalDossier>;
  readonly saveTechnicalDossier: (dossier: AppraisalTechnicalDossier) => Promise<AppraisalTechnicalDossier>;
  readonly listMarketSamples: (appraisalId: string) => Promise<readonly AppraisalMarketSample[]>;
  readonly saveMarketSample: (sample: AppraisalMarketSample) => Promise<AppraisalMarketSample>;
  readonly deleteMarketSample: (appraisalId: string, sampleId: string) => Promise<void>;
  readonly getCalculationSection: (appraisalId: string) => Promise<AppraisalCalculationSection>;
  readonly saveCalculationSection: (appraisalId: string, section: AppraisalCalculationSection) => Promise<AppraisalCalculationSection>;
  readonly getNormativeSection: (appraisalId: string) => Promise<AppraisalNormativeSection>;
  readonly saveNormativeSection: (appraisalId: string, section: AppraisalNormativeSection) => Promise<AppraisalNormativeSection>;
  readonly listIssuedVersions: (appraisalId: string) => Promise<readonly AppraisalIssuedVersion[]>;
  readonly issueAppraisalVersion?: (appraisalId: string) => Promise<AppraisalIssuedVersion>;
}

export function AppraisalDossierWorkspace({
  appraisal,
  onBack,
  currentUserId,
  currentUserRole,
  getTechnicalDossier,
  saveTechnicalDossier,
  listMarketSamples,
  saveMarketSample,
  deleteMarketSample,
  getCalculationSection,
  saveCalculationSection,
  getNormativeSection,
  saveNormativeSection,
  listIssuedVersions,
  issueAppraisalVersion,
}: AppraisalDossierWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<DossierSectionKey | 'issuance'>('identification');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // States dos Documentos do Dossiê
  const [dossier, setDossier] = useState<AppraisalTechnicalDossier | null>(null);
  const [samples, setSamples] = useState<readonly AppraisalMarketSample[]>([]);
  const [calculation, setCalculation] = useState<AppraisalCalculationSection | null>(null);
  const [normative, setNormative] = useState<AppraisalNormativeSection | null>(null);
  const [issuedVersions, setIssuedVersions] = useState<readonly AppraisalIssuedVersion[]>([]);

  // Carregamento de todos os dados do dossiê
  const loadWorkspaceData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [d, s, c, n, v] = await Promise.all([
        getTechnicalDossier(appraisal.id),
        listMarketSamples(appraisal.id),
        getCalculationSection(appraisal.id),
        getNormativeSection(appraisal.id),
        listIssuedVersions(appraisal.id),
      ]);
      setDossier(d);
      setSamples(s);
      setCalculation(c);
      setNormative(n);
      setIssuedVersions(v);
    } catch (err) {
      console.error('Falha ao carregar dados do dossiê:', err);
    } finally {
      setIsLoading(false);
    }
  }, [appraisal.id, getTechnicalDossier, listMarketSamples, getCalculationSection, getNormativeSection, listIssuedVersions]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  // Salvar Dossiê Geral
  const handleSaveAll = async () => {
    if (!dossier || !calculation || !normative) return;
    setIsSaving(true);
    setSaveSuccessNotice(null);
    try {
      const [savedDossier, savedCalc, savedNorm] = await Promise.all([
        saveTechnicalDossier(dossier),
        saveCalculationSection(appraisal.id, calculation),
        saveNormativeSection(appraisal.id, normative),
      ]);
      setDossier(savedDossier);
      setCalculation(savedCalc);
      setNormative(savedNorm);
      setSaveSuccessNotice('Dossiê técnico e cálculos salvos com sucesso!');
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    } catch (err) {
      console.error('Erro ao salvar dossiê:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handlers de Amostras
  const handleSaveSample = async (sample: AppraisalMarketSample) => {
    const saved = await saveMarketSample(sample);
    setSamples((prev) => {
      const exists = prev.some((s) => s.id === saved.id);
      return exists ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved];
    });
  };

  const handleDeleteSample = async (sampleId: string) => {
    await deleteMarketSample(appraisal.id, sampleId);
    setSamples((prev) => prev.filter((s) => s.id !== sampleId));
  };

  const [calculationError, setCalculationError] = useState<string | null>(null);

  // Recálculo do Método MCDDM com base nas amostras
  const handleRunMCDDM = () => {
    if (!calculation || !dossier) return;
    setCalculationError(null);

    const evaluatedArea =
      dossier.characterization.propertyType === 'rural'
        ? dossier.characterization.totalAreaHa
        : dossier.characterization.totalTerrainAreaM2;

    if (!evaluatedArea || evaluatedArea <= 0) {
      setCalculationError('Informe a área do imóvel avaliando (Seção 2) antes de executar o cálculo do MCDDM.');
      return;
    }

    const validSamples = samples.filter((s) => s.status === 'included');
    if (validSamples.length === 0) {
      setCalculationError('Nenhuma amostra de mercado válida/incluída na Seção 4 para execução do MCDDM.');
      return;
    }

    const homogenizedUnitPrices = validSamples.map((s) => s.rawUnitPrice);

    try {
      const run = ValuationMethodEngine.executeDirectComparative({
        appraisalId: appraisal.id,
        organizationId: appraisal.organizationId,
        executedByUserId: currentUserId,
        targetArea: evaluatedArea,
        areaUnit: dossier.characterization.propertyType === 'rural' ? 'ha' : 'm2',
        homogenizedUnitPrices,
      });

      const updatedCalc: AppraisalCalculationSection = {
        ...calculation,
        primaryMethod: 'direct_comparative',
        calculationRuns: [...(calculation.calculationRuns || []), run],
        breakdown: {
          landValue: run.resultCalculatedValue,
          improvementsValue: dossier.improvements.totalImprovementsDepreciatedValue,
          specialComponentsValue: 0,
          totalCalculatedValue: run.resultCalculatedValue,
          roundingAppliedAmount: 0,
          finalAdoptedValue: run.resultCalculatedValue,
          recommendedRangeMin: run.resultRange.min,
          recommendedRangeMax: run.resultRange.max,
        },
        technicalJustification: `Método Comparativo Direto de Dados de Mercado (MCDDM) com amostras tratadas por homogeneização por fatores. Valor unitário adotado: ${formatBRL(run.resultUnitValue)}/unidade.`,
        updatedAt: new Date().toISOString(),
      };

      setCalculation(updatedCalc);
      saveCalculationSection(appraisal.id, updatedCalc);
      setSaveSuccessNotice('Cálculo MCDDM executado com sucesso!');
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao executar o cálculo MCDDM.';
      setCalculationError(msg);
    }
  };

  // Recálculo do Método Evolutivo
  const handleRunEvolutionary = () => {
    if (!calculation || !dossier) return;
    setCalculationError(null);

    const evaluatedArea =
      dossier.characterization.propertyType === 'rural'
        ? dossier.characterization.totalAreaHa
        : dossier.characterization.totalTerrainAreaM2;

    const landValueFromCalc = calculation.breakdown?.landValue || 0;
    const totalImprovementsValue = dossier.improvements.totalImprovementsDepreciatedValue || 0;

    if (landValueFromCalc <= 0 && (!evaluatedArea || evaluatedArea <= 0)) {
      setCalculationError('Necessário determinar o valor da terra nua/terreno ou informar a área antes de executar o Método Evolutivo.');
      return;
    }

    const totalLandValue = landValueFromCalc > 0 ? landValueFromCalc : 0;

    try {
      const run = ValuationMethodEngine.executeEvolutionary({
        appraisalId: appraisal.id,
        organizationId: appraisal.organizationId,
        executedByUserId: currentUserId,
        landValue: totalLandValue,
        improvementsValue: totalImprovementsValue,
        commercializationFactor: 1.0,
      });

      const updatedCalc: AppraisalCalculationSection = {
        ...calculation,
        primaryMethod: 'evolutionary',
        calculationRuns: [...(calculation.calculationRuns || []), run],
        breakdown: {
          landValue: totalLandValue,
          improvementsValue: totalImprovementsValue,
          specialComponentsValue: 0,
          totalCalculatedValue: run.resultCalculatedValue,
          roundingAppliedAmount: 0,
          finalAdoptedValue: run.resultCalculatedValue,
          recommendedRangeMin: run.resultRange.min,
          recommendedRangeMax: run.resultRange.max,
        },
        technicalJustification: `Método Evolutivo combinando Terra Nua (${formatBRL(totalLandValue)}) e Benfeitorias Depreciadas (${formatBRL(totalImprovementsValue)}) com Fator de Comercialização 1.00.`,
        updatedAt: new Date().toISOString(),
      };

      setCalculation(updatedCalc);
      saveCalculationSection(appraisal.id, updatedCalc);
      setSaveSuccessNotice('Método Evolutivo calculado com sucesso!');
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao executar o Método Evolutivo.';
      setCalculationError(msg);
    }
  };

  // Atualização das benfeitorias no dossiê
  const handleImprovementsChange = (newItems: readonly AppraisalImprovementItem[]) => {
    if (!dossier) return;
    const totalNew = newItems.reduce((acc, i) => acc + i.totalCostNew, 0);
    const totalDeprec = newItems.reduce((acc, i) => acc + i.depreciatedTotalValue, 0);

    setDossier({
      ...dossier,
      improvements: {
        ...dossier.improvements,
        items: newItems,
        totalImprovementsCostNew: totalNew,
        totalImprovementsDepreciatedValue: totalDeprec,
        status: newItems.length > 0 ? 'complete' : 'in_progress',
        updatedAt: new Date().toISOString(),
      },
    });
  };

  // Seções da NBR 14653
  const navSections: { key: DossierSectionKey | 'issuance'; label: string; icon: React.ReactNode }[] = [
    { key: 'identification', label: '1. Identificação', icon: <FileText className="w-4 h-4" /> },
    { key: 'characterization', label: '2. Caracterização', icon: <MapPin className="w-4 h-4" /> },
    { key: 'improvements', label: '3. Benfeitorias', icon: <Building2 className="w-4 h-4" /> },
    { key: 'market_research', label: '4. Amostras / Homog.', icon: <Sliders className="w-4 h-4" /> },
    { key: 'methods_and_calculations', label: '5. Métodos & Cálculos', icon: <Calculator className="w-4 h-4" /> },
    { key: 'normative_and_degree', label: '6. Enquadramento NBR', icon: <ShieldCheck className="w-4 h-4" /> },
    { key: 'conclusion', label: '7. Síntese Avaliatória', icon: <Award className="w-4 h-4" /> },
    { key: 'annexes', label: '8. Anexos / Docs', icon: <Paperclip className="w-4 h-4" /> },
    { key: 'issuance', label: '9. Emissão Formal', icon: <CheckSquare className="w-4 h-4" /> },
  ];

  if (isLoading || !dossier || !calculation || !normative) {
    return (
      <div className="p-12 text-center bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-3">
        <RefreshCw className="w-8 h-8 text-[#0B3D2E] animate-spin mx-auto" />
        <h3 className="text-sm font-bold text-[#0B3D2E]">Carregando Dossiê Técnico Pericial...</h3>
        <p className="text-xs text-[#0B3D2E]/70">Recuperando parâmetros e amostras da NBR 14653.</p>
      </div>
    );
  }

  const ruralChar = dossier.characterization.propertyType === 'rural' ? (dossier.characterization as RuralCharacterizationSection) : null;

  return (
    <div className="space-y-6" id="appraisal-dossier-workspace">
      {/* Top Header com Voltar e Botão de Salvar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#0B3D2E]/15">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 text-[#0B3D2E] hover:bg-[#0B3D2E]/10 rounded-xl transition-colors cursor-pointer"
            title="Voltar para a listagem"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold bg-[#0B3D2E] text-white rounded-md uppercase">
                {appraisal.id.substring(0, 8)}
              </span>
              <h2 className="text-base font-bold text-[#0B3D2E]">{appraisal.title}</h2>
            </div>
            <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
              Dossiê Técnico Pericial • NBR 14653 • Versões Emitidas: {issuedVersions.length}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveSuccessNotice && (
            <span className="text-xs font-semibold text-[#0B3D2E] bg-[#0B3D2E]/10 px-3 py-1.5 rounded-xl border border-[#78C89A]">
              {saveSuccessNotice}
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4 text-[#78C89A]" />
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* Barra de Navegação das 9 Seções do Dossiê */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-center gap-1.5 min-w-max border-b border-[#0B3D2E]/15 pb-2">
          {navSections.map((sec) => {
            const isActive = activeSection === sec.key;
            return (
              <button
                key={sec.key}
                type="button"
                onClick={() => setActiveSection(sec.key)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#0B3D2E] text-white shadow-2xs'
                    : 'bg-white text-[#0B3D2E] hover:bg-[#0B3D2E]/5 border border-[#0B3D2E]/15'
                }`}
              >
                {sec.icon}
                {sec.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo Dinâmico por Seção */}
      <div className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-6 shadow-xs">
        {/* SEÇÃO 1: IDENTIFICAÇÃO E FINALIDADE */}
        {activeSection === 'identification' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#0B3D2E] uppercase tracking-wide flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0B3D2E]" />
              1. Identificação do Solicitante, Objeto e Finalidade (NBR 14653)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Finalidade da Avaliação</label>
                <input
                  type="text"
                  value={dossier.identification.purpose}
                  onChange={(e) =>
                    setDossier({
                      ...dossier,
                      identification: { ...dossier.identification, purpose: e.target.value },
                    })
                  }
                  className={APPRAISAL_THEME.input}
                  placeholder="Ex: Garantia bancária / Alienação fiduciária"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Objetivo da Avaliação</label>
                <input
                  type="text"
                  value={dossier.identification.objective}
                  onChange={(e) =>
                    setDossier({
                      ...dossier,
                      identification: { ...dossier.identification, objective: e.target.value },
                    })
                  }
                  className={APPRAISAL_THEME.input}
                  placeholder="Ex: Determinação do Valor de Mercado"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Data de Referência</label>
                <input
                  type="date"
                  value={dossier.identification.referenceDate}
                  onChange={(e) =>
                    setDossier({
                      ...dossier,
                      identification: { ...dossier.identification, referenceDate: e.target.value },
                    })
                  }
                  className={APPRAISAL_THEME.input}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Nome do Solicitante / Cliente</label>
                <input
                  type="text"
                  value={dossier.identification.requesterName}
                  onChange={(e) =>
                    setDossier({
                      ...dossier,
                      identification: { ...dossier.identification, requesterName: e.target.value },
                    })
                  }
                  className={APPRAISAL_THEME.input}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Parte Interessada</label>
                <input
                  type="text"
                  value={dossier.identification.interestedPartyName || ''}
                  onChange={(e) =>
                    setDossier({
                      ...dossier,
                      identification: { ...dossier.identification, interestedPartyName: e.target.value },
                    })
                  }
                  className={APPRAISAL_THEME.input}
                  placeholder="Ex: Banco do Brasil / Proprietário"
                />
              </div>
            </div>

            {/* Responsabilidade Técnica */}
            <div className="p-4 bg-[#0B3D2E]/5 border border-[#0B3D2E]/15 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-[#0B3D2E] uppercase">
                Habilitação Profissional e Anotação de Responsabilidade Técnica (ART/RRT/TRT)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Conselho Profissional</label>
                  <select
                    value={dossier.identification.technicalRegistration?.councilType || 'CREA'}
                    onChange={(e) =>
                      setDossier({
                        ...dossier,
                        identification: {
                          ...dossier.identification,
                          technicalRegistration: {
                            councilType: e.target.value as 'CREA' | 'CAU' | 'CFT' | 'CFTA',
                            registrationNumber: dossier.identification.technicalRegistration?.registrationNumber || '',
                            artRrtTrtNumber: dossier.identification.technicalRegistration?.artRrtTrtNumber || '',
                            issuingState: dossier.identification.technicalRegistration?.issuingState || 'GO',
                            issueDate: dossier.identification.technicalRegistration?.issueDate || new Date().toISOString(),
                            isVerified: Boolean(dossier.identification.technicalRegistration?.isVerified),
                          },
                        },
                      })
                    }
                    className={APPRAISAL_THEME.input}
                  >
                    <option value="CREA">CREA (Engenharia Agronômica/Civil)</option>
                    <option value="CAU">CAU (Arquitetura e Urbanismo)</option>
                    <option value="CFTA">CFTA (Técnico Agrícola)</option>
                    <option value="CFT">CFT (Técnico Industrial)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Registro / Visto</label>
                  <input
                    type="text"
                    value={dossier.identification.technicalRegistration?.registrationNumber || ''}
                    onChange={(e) =>
                      setDossier({
                        ...dossier,
                        identification: {
                          ...dossier.identification,
                          technicalRegistration: {
                            councilType: dossier.identification.technicalRegistration?.councilType || 'CREA',
                            registrationNumber: e.target.value,
                            artRrtTrtNumber: dossier.identification.technicalRegistration?.artRrtTrtNumber || '',
                            issuingState: dossier.identification.technicalRegistration?.issuingState || 'GO',
                            issueDate: dossier.identification.technicalRegistration?.issueDate || new Date().toISOString(),
                            isVerified: Boolean(dossier.identification.technicalRegistration?.isVerified),
                          },
                        },
                      })
                    }
                    className={APPRAISAL_THEME.input}
                    placeholder="Ex: 123456/D-GO"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Número ART / RRT / TRT</label>
                  <input
                    type="text"
                    value={dossier.identification.technicalRegistration?.artRrtTrtNumber || ''}
                    onChange={(e) =>
                      setDossier({
                        ...dossier,
                        identification: {
                          ...dossier.identification,
                          technicalRegistration: {
                            councilType: dossier.identification.technicalRegistration?.councilType || 'CREA',
                            registrationNumber: dossier.identification.technicalRegistration?.registrationNumber || '',
                            artRrtTrtNumber: e.target.value,
                            issuingState: dossier.identification.technicalRegistration?.issuingState || 'GO',
                            issueDate: dossier.identification.technicalRegistration?.issueDate || new Date().toISOString(),
                            isVerified: Boolean(dossier.identification.technicalRegistration?.isVerified),
                          },
                        },
                      })
                    }
                    className={APPRAISAL_THEME.input}
                    placeholder="Ex: 202612345678"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SEÇÃO 2: CARACTERIZAÇÃO FÍSICA E TERRITORIAL */}
        {activeSection === 'characterization' && ruralChar && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#0B3D2E] uppercase tracking-wide flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#0B3D2E]" />
              2. Caracterização da Região, Solo, Relevo e Uso Territorial
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Área Total (ha)</label>
                <input
                  type="number"
                  step="0.01"
                  value={ruralChar.totalAreaHa || 100}
                  onChange={(e) =>
                    setDossier({
                      ...dossier,
                      characterization: {
                        ...ruralChar,
                        totalAreaHa: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className={APPRAISAL_THEME.input}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Topografia / Relevo</label>
                <select
                  value={ruralChar.topographyRelief.value}
                  onChange={(e) =>
                    setDossier({
                      ...dossier,
                      characterization: {
                        ...ruralChar,
                        topographyRelief: {
                          value: e.target.value as 'flat' | 'gently_undulating' | 'undulating' | 'strongly_undulating' | 'mountainous' | 'mixed',
                          provenance: 'reported_survey',
                        },
                      },
                    })
                  }
                  className={APPRAISAL_THEME.input}
                >
                  <option value="flat">Plano (0 a 3%)</option>
                  <option value="gently_undulating">Suave Ondulado (3 a 8%)</option>
                  <option value="undulating">Ondulado (8 a 20%)</option>
                  <option value="strongly_undulating">Forte Ondulado (20 a 45%)</option>
                  <option value="mountainous">Montanhoso (&gt; 45%)</option>
                  <option value="mixed">Misto / Heterogêneo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Tipo Predominante de Solo</label>
                <input
                  type="text"
                  value={ruralChar.soilTypesDescription.value}
                  onChange={(e) =>
                    setDossier({
                      ...dossier,
                      characterization: {
                        ...ruralChar,
                        soilTypesDescription: { value: e.target.value, provenance: 'reported_survey' },
                      },
                    })
                  }
                  className={APPRAISAL_THEME.input}
                  placeholder="Ex: Latossolo Vermelho-Amarelo Distrófico"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Acesso e Vias de Trânsito</label>
                <input
                  type="text"
                  value={ruralChar.accessDescription.value}
                  onChange={(e) =>
                    setDossier({
                      ...dossier,
                      characterization: {
                        ...ruralChar,
                        accessDescription: { value: e.target.value, provenance: 'reported_survey' },
                      },
                    })
                  }
                  className={APPRAISAL_THEME.input}
                  placeholder="Ex: 25 km de rodovia pavimentada BR-163 + 12 km de vicinal cascalhada"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Recursos Hídricos e Hidrografia</label>
                <input
                  type="text"
                  value={ruralChar.waterResourcesDescription.value}
                  onChange={(e) =>
                    setDossier({
                      ...dossier,
                      characterization: {
                        ...ruralChar,
                        waterResourcesDescription: { value: e.target.value, provenance: 'reported_survey' },
                      },
                    })
                  }
                  className={APPRAISAL_THEME.input}
                  placeholder="Ex: Córrego perene na divisa norte e 2 nascentes protegidas"
                />
              </div>
            </div>
          </div>
        )}

        {/* SEÇÃO 3: BENFEITORIAS E CONSTRUÇÕES */}
        {activeSection === 'improvements' && (
          <AppraisalImprovementsEditor
            improvements={dossier.improvements.items}
            onChange={handleImprovementsChange}
          />
        )}

        {/* SEÇÃO 4: PESQUISA DE MERCADO E HOMOGENEIZAÇÃO */}
        {activeSection === 'market_research' && (
          <AppraisalHomogenizationTable
            appraisalId={appraisal.id}
            samples={samples}
            onSaveSample={handleSaveSample}
            onDeleteSample={handleDeleteSample}
          />
        )}

        {/* SEÇÃO 5: MÉTODOS AVALIATÓRIOS E CÁLCULOS */}
        {activeSection === 'methods_and_calculations' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#0B3D2E] uppercase tracking-wide flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-[#0B3D2E]" />
                  5. Métodos Avaliatórios e Determinação do Valor (NBR 14653)
                </h3>
                <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
                  Execute e sincronize os modelos avaliatórios normatizados.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunMCDDM}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#78C89A]" />
                  Calcular MCDDM (Amostras)
                </button>
                <button
                  type="button"
                  onClick={handleRunEvolutionary}
                  className="px-3 py-1.5 text-xs font-semibold text-[#0B3D2E] bg-white border border-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/5 flex items-center gap-1.5 cursor-pointer"
                >
                  Calcular Método Evolutivo
                </button>
              </div>
            </div>

            {/* Alerta de erro de validação ou cálculo */}
            {calculationError && (
              <div className="p-3.5 bg-[#0B3D2E]/10 border border-[#0B3D2E]/30 rounded-xl text-xs font-semibold text-[#0B3D2E] flex items-center justify-between">
                <span>{calculationError}</span>
                <button
                  type="button"
                  onClick={() => setCalculationError(null)}
                  className="text-[#0B3D2E] hover:text-[#0B3D2E]/70 font-bold ml-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Painel de Resultados do Cálculo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-[#0B3D2E]/5 border border-[#0B3D2E]/20 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Método Primário Selecionado</span>
                <p className="text-sm font-bold text-[#0B3D2E] capitalize">
                  {calculation.primaryMethod === 'direct_comparative'
                    ? 'Comparativo Direto (MCDDM)'
                    : calculation.primaryMethod === 'evolutionary'
                    ? 'Método Evolutivo'
                    : calculation.primaryMethod}
                </p>
              </div>

              <div className="p-4 bg-white border border-[#0B3D2E]/20 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Benfeitorias Agregadas</span>
                <p className="text-base font-bold text-[#0B3D2E]">
                  {formatBRL(calculation.breakdown?.improvementsValue || dossier.improvements.totalImprovementsDepreciatedValue || 0)}
                </p>
              </div>

              <div className="p-4 bg-[#0B3D2E] text-white rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-[#78C89A] uppercase">Valor Total Adotado</span>
                <p className="text-lg font-bold text-white">
                  {formatBRL(calculation.breakdown?.finalAdoptedValue || calculation.breakdown?.totalCalculatedValue || 0)}
                </p>
              </div>
            </div>

            {/* Detalhamento de Intervalo e Arredondamento */}
            <div className="p-4 bg-white border border-[#0B3D2E]/15 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-[#0B3D2E] uppercase">Intervalo Admissível de Valores (NBR 14653)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[#0B3D2E]/70">Limite Mínimo (-15%):</span>
                  <p className="font-bold text-[#0B3D2E]">{formatBRL(calculation.breakdown?.recommendedRangeMin || 0)}</p>
                </div>
                <div>
                  <span className="text-[#0B3D2E]/70">Valor Médio Adotado:</span>
                  <p className="font-bold text-[#0B3D2E]">{formatBRL(calculation.breakdown?.finalAdoptedValue || 0)}</p>
                </div>
                <div>
                  <span className="text-[#0B3D2E]/70">Limite Máximo (+15%):</span>
                  <p className="font-bold text-[#0B3D2E]">{formatBRL(calculation.breakdown?.recommendedRangeMax || 0)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SEÇÃO 6: ENQUADRAMENTO E FUNDAMENTAÇÃO NBR 14653 */}
        {activeSection === 'normative_and_degree' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#0B3D2E] uppercase tracking-wide flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#0B3D2E]" />
              6. Enquadramento e Graus de Fundamentação e Precisão (NBR 14653)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Grau de Fundamentação</label>
                <select
                  value={normative.degreeOfJustification}
                  onChange={(e) =>
                    setNormative({
                      ...normative,
                      degreeOfJustification: e.target.value as NormativeDegree,
                    })
                  }
                  className={APPRAISAL_THEME.input}
                >
                  <option value="grau_III">Grau III (Máxima Fundamentação)</option>
                  <option value="grau_II">Grau II (Padrão de Mercado)</option>
                  <option value="grau_I">Grau I (Expedito / Restrito)</option>
                  <option value="unconfigured">Não Configurado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">Grau de Precisão</label>
                <select
                  value={normative.degreeOfPrecision}
                  onChange={(e) =>
                    setNormative({
                      ...normative,
                      degreeOfPrecision: e.target.value as NormativeDegree,
                    })
                  }
                  className={APPRAISAL_THEME.input}
                >
                  <option value="grau_III">Grau III (Alta Precisão)</option>
                  <option value="grau_II">Grau II (Precisão Normal)</option>
                  <option value="grau_I">Grau I (Precisão Admissível)</option>
                  <option value="unconfigured">Não Configurado / Tratamento por Fatores</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* SEÇÃO 7: CONCLUSÃO E SÍNTESE AVALIATÓRIA */}
        {activeSection === 'conclusion' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#0B3D2E] uppercase tracking-wide flex items-center gap-2">
              <Award className="w-4 h-4 text-[#0B3D2E]" />
              7. Síntese Avaliatória e Declaração Pericial
            </h3>

            <div className="p-4 bg-[#0B3D2E]/5 border border-[#0B3D2E]/20 rounded-xl space-y-2">
              <span className="text-xs font-bold text-[#0B3D2E] uppercase">Parecer Conclusivo do Avaliador</span>
              <p className="text-xs text-[#0B3D2E]/80 leading-relaxed">
                Diante das vistorias realizadas, caracterização física do imóvel e análise comparativa de mercado fundamentada na NBR 14653, fixa-se o Valor de Mercado total do bem em:
              </p>
              <p className="text-xl font-bold text-[#0B3D2E]">
                {formatBRL(calculation.breakdown?.finalAdoptedValue || calculation.breakdown?.totalCalculatedValue || 0)}
              </p>
            </div>
          </div>
        )}

        {/* SEÇÃO 8: DOCUMENTOS E ANEXOS */}
        {activeSection === 'annexes' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#0B3D2E] uppercase tracking-wide flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-[#0B3D2E]" />
              8. Documentos Periciais Consultados e Anexos
            </h3>

            <div className="space-y-2">
              {dossier.documentReferences.length === 0 ? (
                <p className="text-xs text-[#0B3D2E]/60">Nenhum documento anexado ao dossiê.</p>
              ) : (
                dossier.documentReferences.map((doc, idx) => (
                  <div key={idx} className="p-3 bg-[#0B3D2E]/5 border border-[#0B3D2E]/15 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-[#0B3D2E]">{doc.displayName}</span>
                      <p className="text-[11px] text-[#0B3D2E]/60">{doc.category} • {doc.mimeType}</p>
                    </div>
                    <span className="text-[10px] bg-[#0B3D2E]/10 px-2 py-0.5 rounded text-[#0B3D2E] font-medium">
                      Consultado
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SEÇÃO 9: EMISSÃO FORMAL E HISTÓRICO DE VERSÕES */}
        {activeSection === 'issuance' && (
          <AppraisalIssuancePanel
            appraisal={appraisal}
            dossier={dossier}
            samples={samples}
            calculation={calculation}
            normative={normative}
            issuedVersions={issuedVersions}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            onIssueFormalVersion={async () => {
              if (issueAppraisalVersion) {
                const issued = await issueAppraisalVersion(appraisal.id);
                setIssuedVersions((prev) => [issued, ...prev]);
                return issued;
              }
              throw new Error('Serviço de emissão não disponível.');
            }}
          />
        )}
      </div>
    </div>
  );
}
