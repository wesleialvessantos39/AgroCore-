/**
 * Motor de Homogeneização de Amostras de Mercado
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Tratamento por Fatores:
 * - Fator de Fonte / Oferta (elasticidade de negociação)
 * - Fator de Transposição no Tempo (atualização monetária / índice)
 * - Fator de Localização e Acesso
 * - Fator de Dimensão / Área
 * - Fator de Topografia e Solo / Capacidade de Uso
 * - Fator de Recursos Hídricos
 * - Fator de Padrão Construtivo e Conservação
 */

import {
  AppraisalMarketSample,
  HomogenizationFactorDefinition,
  HomogenizedSampleResult,
  StatisticalAnalysisResult,
} from '../types/appraisalCalculation';
import { DecimalMath } from './decimalMath';
import { computeStatisticalAnalysis } from './statisticalEngine';

export const DEFAULT_HOMOGENIZATION_FACTORS: readonly HomogenizationFactorDefinition[] = [
  {
    id: 'factor_offer',
    factorType: 'offer',
    name: 'Fator de Oferta / Negociação',
    formulaDescription: 'Ajuste de elasticidade de negociação em ofertas de mercado (0.90 a 1.00)',
    source: 'Prática Avaliatória Regional / Pesquisa Local',
    version: '1.0',
    justification: 'Desconto médio apurado em negociações à vista ou fechamento efetivo.',
    defaultMultiplier: 0.95,
  },
  {
    id: 'factor_access',
    factorType: 'access',
    name: 'Fator de Acesso e Malha Viária',
    formulaDescription: 'Relação de trafegabilidade (pavimentação e distância do eixo principal)',
    source: 'Manual de Avaliação Territorial AgroCore',
    version: '1.0',
    justification: 'Diferencial de custo logístico e escoamento.',
    defaultMultiplier: 1.00,
  },
  {
    id: 'factor_topography',
    factorType: 'topography',
    name: 'Fator de Topografia e Relevo',
    formulaDescription: 'Ajuste proporcional à declividade e mecanização',
    source: 'Classificação de Relevo AgroCore',
    version: '1.0',
    justification: 'Impacto na mecanização e aptidão agrícola/construtiva.',
    defaultMultiplier: 1.00,
  },
  {
    id: 'factor_water',
    factorType: 'water',
    name: 'Fator de Recursos Hídricos',
    formulaDescription: 'Presença de mananciais perenes, outorga e potencial de irrigação',
    source: 'Diagnóstico Hidrológico',
    version: '1.0',
    justification: 'Valorização pela segurança hídrica e potencial produtivo irrigável.',
    defaultMultiplier: 1.00,
  },
];

export interface HomogenizeSamplesInput {
  readonly samples: readonly AppraisalMarketSample[];
  readonly customFactors?: readonly HomogenizationFactorDefinition[];
  readonly sampleFactorOverrides?: Record<string, Record<string, number>>; // sampleId -> factorId -> multiplier
}

export function homogenizeMarketSamples(input: HomogenizeSamplesInput): readonly HomogenizedSampleResult[] {
  const { samples, customFactors, sampleFactorOverrides = {} } = input;
  const factors = customFactors && customFactors.length > 0 ? customFactors : DEFAULT_HOMOGENIZATION_FACTORS;

  return samples.map((sample) => {
    if (sample.status === 'excluded') {
      return {
        sampleId: sample.id,
        sampleCode: sample.sampleCode,
        rawUnitPrice: sample.rawUnitPrice,
        factorMultipliers: {},
        totalFactorMultiplier: 1.0,
        homogenizedUnitPrice: sample.rawUnitPrice,
        status: 'excluded',
        exclusionJustification: sample.exclusionJustification || 'Amostra excluída pelo responsável técnico.',
      };
    }

    const factorMultipliers: Record<string, number> = {};
    let accumulatedMultiplier = 1.0;

    for (const factor of factors) {
      const overrideVal = sampleFactorOverrides[sample.id]?.[factor.id];
      let factorValue = overrideVal !== undefined ? overrideVal : factor.defaultMultiplier;

      if (factor.factorType === 'offer' && sample.nature === 'transaction') {
        factorValue = 1.0; // Transações reais já representam o preço fechado sem fator de oferta
      }

      if (factorValue <= 0 || !Number.isFinite(factorValue)) {
        throw new Error(`Fator ${factor.name} com valor inválido (${factorValue}) para a amostra ${sample.sampleCode}.`);
      }

      factorMultipliers[factor.id] = DecimalMath.round(factorValue, 4);
      accumulatedMultiplier = DecimalMath.multiply(accumulatedMultiplier, factorValue, 6);
    }

    const totalFactor = DecimalMath.round(accumulatedMultiplier, 4);
    const homogenizedUnitPrice = DecimalMath.round(
      DecimalMath.multiply(sample.rawUnitPrice, totalFactor, 4),
      2
    );

    return {
      sampleId: sample.id,
      sampleCode: sample.sampleCode,
      rawUnitPrice: sample.rawUnitPrice,
      factorMultipliers,
      totalFactorMultiplier: totalFactor,
      homogenizedUnitPrice,
      status: 'included',
    };
  });
}

/**
 * Calcula de forma integrada a homogeneização e o sumário estatístico das amostras
 */
export function calculateSampleHomogenization(samples: readonly AppraisalMarketSample[]): {
  readonly homogenizedResults: readonly HomogenizedSampleResult[];
  readonly stats: StatisticalAnalysisResult;
} {
  const homogenizedResults = homogenizeMarketSamples({ samples });
  const stats = computeStatisticalAnalysis({ homogenizedSamples: homogenizedResults });
  return { homogenizedResults, stats };
}

