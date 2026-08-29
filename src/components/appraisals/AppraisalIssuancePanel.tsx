/**
 * Painel de Emissão Formal, Prontidão Técnica e Versionamento Canônico
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Em estrita conformidade com a NBR 14653 e a identidade visual AgroCore (#0B3D2E / #78C89A).
 * Integridade pericial garantida por Checksum SHA-256 determinístico.
 */

import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  History,
  Lock,
  Copy,
  ExternalLink,
  Award,
} from 'lucide-react';
import { Appraisal } from '../../types/appraisal';
import { AppraisalTechnicalDossier } from '../../types/appraisalDossier';
import {
  AppraisalCalculationSection,
  AppraisalMarketSample,
} from '../../types/appraisalCalculation';
import { AppraisalNormativeSection } from '../../types/appraisalNormative';
import { AppraisalIssuedVersion } from '../../types/appraisalVersioning';
import { APPRAISAL_THEME } from '../../appraisals/theme';
import { evaluateAppraisalReadiness } from '../../appraisals/readinessEvaluator';
import { calculateSampleHomogenization } from '../../appraisals/homogenizationEngine';
import { formatBRL } from '../../appraisals/decimalMath';

interface AppraisalIssuancePanelProps {
  readonly appraisal: Appraisal;
  readonly dossier: AppraisalTechnicalDossier;
  readonly samples: readonly AppraisalMarketSample[];
  readonly calculation: AppraisalCalculationSection;
  readonly normative: AppraisalNormativeSection;
  readonly issuedVersions: readonly AppraisalIssuedVersion[];
  readonly currentUserId: string;
  readonly currentUserRole: string;
  readonly onIssueFormalVersion: () => Promise<AppraisalIssuedVersion>;
}

export function AppraisalIssuancePanel({
  appraisal,
  dossier,
  samples,
  calculation,
  normative,
  issuedVersions,
  currentUserId,
  currentUserRole,
  onIssueFormalVersion,
}: AppraisalIssuancePanelProps) {
  const [isIssuing, setIsIssuing] = useState(false);
  const [issuanceError, setIssuanceError] = useState<string | null>(null);
  const [issuanceSuccess, setIssuanceSuccess] = useState<string | null>(null);
  const [selectedVersionForInspection, setSelectedVersionForInspection] = useState<AppraisalIssuedVersion | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Avaliação de Prontidão em Tempo Real
  const readiness = useMemo(() => {
    const statistics = calculateSampleHomogenization(samples).stats;
    return evaluateAppraisalReadiness({
      appraisal,
      dossier,
      calculations: calculation,
      statistics,
      normative,
    });
  }, [appraisal, dossier, samples, calculation, normative]);

  // Apenas o projetista responsável técnico cadastrado tem permissão legal para emitir o laudo
  const isDesignatedResponsible = useMemo(() => {
    return !!(appraisal.responsibleUserId && currentUserId === appraisal.responsibleUserId);
  }, [appraisal.responsibleUserId, currentUserId]);

  const handleIssueFormalVersionClick = async () => {
    if (!readiness.isReadyToIssue) {
      setIssuanceError('Não é possível emitir: existem pendências impeditivas que violam a NBR 14653.');
      return;
    }

    if (!isDesignatedResponsible) {
      setIssuanceError('Apenas o Responsável Técnico formalmente designado no laudo possui a atribuição legal e intransferível de emitir a versão formal pericial.');
      return;
    }

    setIsIssuing(true);
    setIssuanceError(null);
    setIssuanceSuccess(null);

    try {
      const issued = await onIssueFormalVersion();
      setIssuanceSuccess(
        `Versão ${issued.versionNumber} emitida com sucesso com Checksum SHA-256: ${issued.checksumSha256.substring(0, 16)}...`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na emissão formal da versão.';
      setIssuanceError(msg);
    } finally {
      setIsIssuing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 3000);
  };

  return (
    <div className="space-y-6" id="appraisal-issuance-panel">
      {/* Header do Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#0B3D2E] flex items-center gap-2">
            <Award className="w-5 h-5 text-[#0B3D2E]" />
            Emissão Formal e Governança Pericial (NBR 14653)
          </h3>
          <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
            Verificação de conformidade normativa, integridade criptográfica SHA-256 e trilha imutável.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {readiness.isReadyToIssue ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#0B3D2E] text-white">
              <CheckCircle2 className="w-4 h-4 text-[#78C89A]" />
              Pronto para Emissão
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#0B3D2E]/10 text-[#0B3D2E] border border-[#0B3D2E]/30">
              <AlertOctagon className="w-4 h-4 text-[#0B3D2E]" />
              Pendências Impeditivas ({readiness.impeditiveCount})
            </span>
          )}
        </div>
      </div>

      {/* Feedback Messages */}
      {issuanceError && (
        <div className="p-4 bg-[#0B3D2E]/10 border border-[#0B3D2E]/40 rounded-2xl text-xs text-[#0B3D2E] flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 text-[#0B3D2E] shrink-0" />
          <span>{issuanceError}</span>
        </div>
      )}

      {issuanceSuccess && (
        <div className="p-4 bg-[#0B3D2E]/10 border border-[#78C89A] rounded-2xl text-xs text-[#0B3D2E] flex items-center gap-2.5 font-medium">
          <CheckCircle2 className="w-5 h-5 text-[#0B3D2E] shrink-0" />
          <span>{issuanceSuccess}</span>
        </div>
      )}

      {/* Grid de Diagnóstico de Prontidão */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card de Resumo de Prontidão */}
        <div className="p-5 bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-4">
          <h4 className="text-xs font-bold text-[#0B3D2E] uppercase tracking-wide flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#0B3D2E]" />
            Diagnóstico de Prontidão Pericial
          </h4>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="p-2.5 bg-[#0B3D2E]/5 rounded-xl">
              <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Impeditivos</span>
              <p className="text-base font-bold text-[#0B3D2E]">{readiness.impeditiveCount}</p>
            </div>
            <div className="p-2.5 bg-[#0B3D2E]/5 rounded-xl">
              <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Críticos</span>
              <p className="text-base font-bold text-[#0B3D2E]">{readiness.criticalCount}</p>
            </div>
            <div className="p-2.5 bg-[#0B3D2E]/5 rounded-xl">
              <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Recomendações</span>
              <p className="text-base font-bold text-[#0B3D2E]">{readiness.recommendationCount}</p>
            </div>
            <div className="p-2.5 bg-[#0B3D2E]/5 rounded-xl">
              <span className="text-[10px] font-bold text-[#0B3D2E]/60 uppercase">Informativos</span>
              <p className="text-base font-bold text-[#0B3D2E]">{readiness.informativeCount}</p>
            </div>
          </div>

          <div className="pt-2 border-t border-[#0B3D2E]/10 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-[#0B3D2E]/70">Valor Adotado Final:</span>
              <span className="font-bold text-[#0B3D2E]">
                {formatBRL(calculation.breakdown?.finalAdoptedValue || calculation.breakdown?.totalCalculatedValue || 0)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[#0B3D2E]/70">Enquadramento NBR:</span>
              <span className="font-bold text-[#0B3D2E]">
                {normative.degreeOfJustification} / {normative.degreeOfPrecision}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={!readiness.isReadyToIssue || isIssuing || !isDesignatedResponsible}
            onClick={handleIssueFormalVersionClick}
            className="w-full py-3 px-4 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4 text-[#78C89A]" />
            {isIssuing
              ? 'Emitindo e Calculando Checksum SHA-256...'
              : `Emitir Versão Formal ${issuedVersions.length + 1} (NBR 14653)`}
          </button>
          {!isDesignatedResponsible && (
            <p className="text-[10px] text-center text-[#0B3D2E]/60">
              * Apenas o Responsável Técnico formalmente designado possui atribuição para emitir o laudo.
            </p>
          )}
        </div>

        {/* Lista de Itens do Verificador de Prontidão */}
        <div className="lg:col-span-2 p-5 bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-3">
          <h4 className="text-xs font-bold text-[#0B3D2E] uppercase tracking-wide">
            Critérios do Verificador de Prontidão Técnica ({readiness.items.length} verificações)
          </h4>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {readiness.items.map((issue) => {
              const isPassed = issue.isResolved;
              return (
                <div
                  key={issue.id}
                  className={`p-2.5 rounded-xl border text-xs flex items-start gap-2.5 transition-colors ${
                    isPassed
                      ? 'bg-white border-[#0B3D2E]/15 text-[#0B3D2E]'
                      : issue.severity === 'impeditive'
                      ? 'bg-[#0B3D2E]/10 border-[#0B3D2E]/40 text-[#0B3D2E]'
                      : 'bg-[#0B3D2E]/5 border-[#0B3D2E]/20 text-[#0B3D2E]'
                  }`}
                >
                  {isPassed ? (
                    <CheckCircle2 className="w-4 h-4 text-[#0B3D2E] shrink-0 mt-0.5" />
                  ) : issue.severity === 'impeditive' ? (
                    <AlertOctagon className="w-4 h-4 text-[#0B3D2E] shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-[#0B3D2E] shrink-0 mt-0.5" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#0B3D2E]">{issue.title}</span>
                      <span className="text-[10px] uppercase font-bold text-[#0B3D2E]/60">
                        {isPassed ? 'Aprovado' : issue.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#0B3D2E]/70 mt-0.5">{issue.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Linha do Tempo e Histórico de Versões Emitidas */}
      <div className="p-5 bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-4">
        <h4 className="text-xs font-bold text-[#0B3D2E] uppercase tracking-wide flex items-center gap-2">
          <History className="w-4 h-4 text-[#0B3D2E]" />
          Histórico de Versões Emitidas & Checksums de Integridade ({issuedVersions.length})
        </h4>

        {issuedVersions.length === 0 ? (
          <div className="p-6 text-center bg-[#0B3D2E]/5 border border-[#0B3D2E]/10 rounded-xl space-y-1">
            <FileCheck className="w-6 h-6 text-[#0B3D2E]/40 mx-auto" />
            <p className="text-xs font-semibold text-[#0B3D2E]">Nenhuma versão formal emitida até o momento</p>
            <p className="text-[11px] text-[#0B3D2E]/60">
              O laudo encontra-se atualmente em fase de elaboração técnica (draft).
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {issuedVersions.map((v) => (
              <div
                key={v.id}
                className="p-4 bg-white border border-[#0B3D2E]/20 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 text-xs font-bold bg-[#0B3D2E] text-white rounded-md">
                      Versão {v.versionNumber}
                    </span>
                    <span className="text-xs text-[#0B3D2E]/70">
                      Emitida em: {new Date(v.issuedAt).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[#0B3D2E]">
                    <span className="font-semibold">Checksum SHA-256:</span>
                    <code className="px-1.5 py-0.5 bg-[#0B3D2E]/5 rounded text-[11px] font-mono text-[#0B3D2E]">
                      {v.checksumSha256.substring(0, 24)}...{v.checksumSha256.substring(56)}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(v.checksumSha256)}
                      className="p-1 text-[#0B3D2E]/60 hover:text-[#0B3D2E] rounded"
                      title="Copiar Hash SHA-256 completo"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {copiedHash === v.checksumSha256 && (
                      <span className="text-[10px] text-[#0B3D2E] font-bold">Copiado!</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedVersionForInspection(v)}
                    className="px-3 py-1.5 text-xs font-semibold text-[#0B3D2E] bg-[#0B3D2E]/5 border border-[#0B3D2E]/20 rounded-xl hover:bg-[#0B3D2E]/10 transition-colors flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Inspecionar Snapshot
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Inspeção do Snapshot Canônico */}
      {selectedVersionForInspection && (
        <div className={APPRAISAL_THEME.modalOverlay}>
          <div className="bg-white border border-[#0B3D2E]/20 rounded-2xl shadow-xl max-w-3xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto text-[#0B3D2E]">
            <div className="flex items-center justify-between pb-3 border-b border-[#0B3D2E]/10">
              <div>
                <h3 className="text-base font-bold text-[#0B3D2E] flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#0B3D2E]" />
                  Fotografia Canônica — Versão {selectedVersionForInspection.versionNumber}
                </h3>
                <p className="text-xs text-[#0B3D2E]/70 font-mono mt-0.5">
                  SHA-256: {selectedVersionForInspection.checksumSha256}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVersionForInspection(null)}
                className="p-1.5 text-[#0B3D2E]/60 hover:text-[#0B3D2E]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#0B3D2E]/5 rounded-xl space-y-1">
                <p><strong>Emissão:</strong> {new Date(selectedVersionForInspection.issuedAt).toLocaleString('pt-BR')}</p>
                <p><strong>Responsável:</strong> {selectedVersionForInspection.issuedByUserName} ({selectedVersionForInspection.issuedByUserId})</p>
                <p><strong>Total de Amostras:</strong> {selectedVersionForInspection.snapshot.marketSamples.length}</p>
                <p><strong>Valor Homologado:</strong> {formatBRL(selectedVersionForInspection.snapshot.calculations.breakdown?.finalAdoptedValue || selectedVersionForInspection.snapshot.calculations.breakdown?.totalCalculatedValue || 0)}</p>
              </div>

              <div>
                <span className="font-bold text-[#0B3D2E] block mb-1">Payload JSON Imutável:</span>
                <pre className="p-3 bg-[#0B3D2E]/5 border border-[#0B3D2E]/15 rounded-xl font-mono text-[10px] max-h-60 overflow-y-auto text-[#0B3D2E]">
                  {JSON.stringify(selectedVersionForInspection.snapshot, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedVersionForInspection(null)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90"
              >
                Fechar Inspeção
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
