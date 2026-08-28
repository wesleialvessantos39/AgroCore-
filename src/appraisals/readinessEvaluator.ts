/**
 * Avaliador de Prontidão e Emissibilidade de Laudos de Avaliação
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Princípio:
 * Avaliação determinística e pura das condições técnicas, normativas e
 * documentais necessárias para que um laudo possa ser submetido ou emitido.
 */

import { Appraisal } from '../types/appraisal';
import { AppraisalTechnicalDossier } from '../types/appraisalDossier';
import { AppraisalCalculationSection, StatisticalAnalysisResult } from '../types/appraisalCalculation';
import { AppraisalNormativeSection, AppraisalReadinessItem, AppraisalReadinessReport } from '../types/appraisalNormative';
import { TechnicalProfessionalProfile } from '../types/appraisal';

export interface EvaluateReadinessInput {
  readonly appraisal: Appraisal;
  readonly dossier?: AppraisalTechnicalDossier | null;
  readonly calculations?: AppraisalCalculationSection | null;
  readonly statistics?: StatisticalAnalysisResult | null;
  readonly normative?: AppraisalNormativeSection | null;
  readonly technicalProfile?: TechnicalProfessionalProfile | null;
}

export function evaluateAppraisalReadiness(input: EvaluateReadinessInput): AppraisalReadinessReport {
  const { appraisal, dossier, calculations, statistics, normative, technicalProfile } = input;
  const items: AppraisalReadinessItem[] = [];

  // 1. Verificações de Identificação e Responsabilidade Técnica
  if (!appraisal.responsibleUserId) {
    items.push({
      id: 'imp_resp_user',
      sectionKey: 'identification',
      severity: 'impeditive',
      title: 'Responsável Técnico não atribuído',
      description: 'O laudo precisa possuir um profissional técnico responsável formalmente designado.',
      isResolved: false,
    });
  }

  if (technicalProfile) {
    if (!technicalProfile.responsibilityDocumentType || !technicalProfile.registrationNumber) {
      items.push({
        id: 'imp_art_rrt_missing',
        sectionKey: 'identification',
        severity: 'impeditive',
        title: 'Documento de responsabilidade técnica não configurado',
        description: 'É obrigatório registrar o tipo e número do documento de responsabilidade técnica (ART/RRT/TRT).',
        isResolved: false,
      });
    }
  }

  if (!dossier || !dossier.identification || dossier.identification.status !== 'complete') {
    items.push({
      id: 'imp_dossier_id_incomplete',
      sectionKey: 'identification',
      severity: 'impeditive',
      title: 'Seção de Identificação incompleta',
      description: 'A finalidade, objetivo, data-base e solicitante devem estar preenchidos e validados.',
      isResolved: false,
    });
  }

  // 2. Verificações de Caracterização Física e Territorial
  if (!dossier || !dossier.characterization || dossier.characterization.status !== 'complete') {
    items.push({
      id: 'imp_dossier_char_incomplete',
      sectionKey: 'characterization',
      severity: 'impeditive',
      title: 'Caracterização do imóvel incompleta',
      description: 'A caracterização física, acessos, relevo, solo e infraestrutura devem estar concluídas.',
      isResolved: false,
    });
  }

  // 3. Verificações Metodológicas e Amostrais
  if (calculations) {
    if (calculations.primaryMethod === 'direct_comparative') {
      if (!statistics || statistics.validSamplesCount < 1) {
        items.push({
          id: 'imp_samples_zero',
          sectionKey: 'market_research',
          severity: 'impeditive',
          title: 'Nenhuma amostra de mercado válida',
          description: 'O método comparativo direto exige ao menos uma amostra de mercado incluída e homogeneizada.',
          isResolved: false,
        });
      } else if (statistics.validSamplesCount < 3) {
        items.push({
          id: 'crit_samples_low',
          sectionKey: 'market_research',
          severity: 'critical',
          title: 'Amostragem reduzida (< 3 amostras)',
          description: 'Amostragem com menos de 3 dados restringe o enquadramento nos graus de fundamentação.',
          isResolved: false,
        });
      }

      // Outliers não justificados
      if (statistics && statistics.outliersDetected.some((o) => o.isOutlier && !o.professionalJustification)) {
        items.push({
          id: 'crit_outliers_unjustified',
          sectionKey: 'statistics',
          severity: 'critical',
          title: 'Outliers sem justificativa técnica',
          description: 'Existem amostras com afastamento estatístico significativo sem anotação de julgamento profissional.',
          isResolved: false,
        });
      }
    }

    if (calculations.breakdown.finalAdoptedValue <= 0) {
      items.push({
        id: 'imp_final_value_zero',
        sectionKey: 'methods_and_calculations',
        severity: 'impeditive',
        title: 'Valor final adotado não calculado',
        description: 'O laudo deve possuir o valor final de avaliação apurado e discriminado.',
        isResolved: false,
      });
    }
  } else {
    items.push({
      id: 'imp_no_calculations',
      sectionKey: 'methods_and_calculations',
      severity: 'impeditive',
      title: 'Memória de cálculo não executada',
      description: 'É necessário definir o método avaliatório e rodar a rotina de cálculo.',
      isResolved: false,
    });
  }

  // 4. Verificações de Conclusão e Parecer
  if (!dossier || !dossier.conclusion || dossier.conclusion.status !== 'complete') {
    items.push({
      id: 'imp_conclusion_incomplete',
      sectionKey: 'conclusion',
      severity: 'impeditive',
      title: 'Conclusão e Parecer Técnico incompletos',
      description: 'O resumo de diagnóstico e a declaração de conformidade técnica precisam ser validados.',
      isResolved: false,
    });
  }

  // 5. Normativa & Avisos informativos
  if (normative && normative.isUnconfiguredNotice) {
    items.push({
      id: 'info_normative_unconfigured',
      sectionKey: 'normative_and_degree',
      severity: 'informative',
      title: 'Tabela normativa não configurada explicitamente',
      description: 'O laudo utilizou diretrizes gerais de fundamentação técnica sem vínculo a regramento regional específico.',
      isResolved: true,
    });
  }

  const impeditiveCount = items.filter((i) => i.severity === 'impeditive' && !i.isResolved).length;
  const criticalCount = items.filter((i) => i.severity === 'critical' && !i.isResolved).length;
  const recommendationCount = items.filter((i) => i.severity === 'recommendation' && !i.isResolved).length;
  const informativeCount = items.filter((i) => i.severity === 'informative' && !i.isResolved).length;

  return {
    isReadyToIssue: impeditiveCount === 0,
    impeditiveCount,
    criticalCount,
    recommendationCount,
    informativeCount,
    items,
    generatedAt: new Date().toISOString(),
  };
}
