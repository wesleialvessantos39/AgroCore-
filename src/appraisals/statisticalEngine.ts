/**
 * Motor Estatístico Puro para Tratamento de Dados de Mercado
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Funções matemáticas puras, auditáveis e sem efeitos colaterais.
 * Implementa distribuição t de Student exata para N < 30 com graus de liberdade (N-1).
 */

import { StatisticalAnalysisResult, HomogenizedSampleResult } from '../types/appraisalCalculation';
import { DecimalMath } from './decimalMath';

/**
 * Tabela de Valores Críticos da Distribuição t de Student (Bicaudal)
 * Índice = Graus de Liberdade (gl = N - 1)
 */
const STUDENT_T_CRITICAL_TABLE: Record<number, { t80: number; t90: number; t95: number }> = {
  1: { t80: 3.078, t90: 6.314, t95: 12.706 },
  2: { t80: 1.886, t90: 2.920, t95: 4.303 },
  3: { t80: 1.638, t90: 2.353, t95: 3.182 },
  4: { t80: 1.533, t90: 2.132, t95: 2.776 },
  5: { t80: 1.476, t90: 2.015, t95: 2.571 },
  6: { t80: 1.440, t90: 1.943, t95: 2.447 },
  7: { t80: 1.415, t90: 1.895, t95: 2.365 },
  8: { t80: 1.397, t90: 1.860, t95: 2.306 },
  9: { t80: 1.383, t90: 1.833, t95: 2.262 },
  10: { t80: 1.372, t90: 1.812, t95: 2.228 },
  11: { t80: 1.363, t90: 1.796, t95: 2.201 },
  12: { t80: 1.356, t90: 1.782, t95: 2.179 },
  13: { t80: 1.350, t90: 1.771, t95: 2.160 },
  14: { t80: 1.345, t90: 1.761, t95: 2.145 },
  15: { t80: 1.341, t90: 1.753, t95: 2.131 },
  16: { t80: 1.337, t90: 1.746, t95: 2.120 },
  17: { t80: 1.333, t90: 1.740, t95: 2.110 },
  18: { t80: 1.330, t90: 1.734, t95: 2.101 },
  19: { t80: 1.328, t90: 1.729, t95: 2.093 },
  20: { t80: 1.325, t90: 1.725, t95: 2.086 },
  21: { t80: 1.323, t90: 1.721, t95: 2.080 },
  22: { t80: 1.321, t90: 1.717, t95: 2.074 },
  23: { t80: 1.319, t90: 1.714, t95: 2.069 },
  24: { t80: 1.318, t90: 1.711, t95: 2.064 },
  25: { t80: 1.316, t90: 1.708, t95: 2.060 },
  26: { t80: 1.315, t90: 1.706, t95: 2.056 },
  27: { t80: 1.314, t90: 1.703, t95: 2.052 },
  28: { t80: 1.313, t90: 1.701, t95: 2.048 },
  29: { t80: 1.311, t90: 1.699, t95: 2.045 },
  30: { t80: 1.310, t90: 1.697, t95: 2.042 },
};

/**
 * Obtém os valores críticos t de Student para os graus de liberdade informados
 */
export function getStudentTCriticalValues(degreesOfFreedom: number): { t80: number; t90: number; t95: number } {
  if (degreesOfFreedom <= 0) {
    return { t80: 3.078, t90: 6.314, t95: 12.706 };
  }
  if (degreesOfFreedom <= 30) {
    return STUDENT_T_CRITICAL_TABLE[degreesOfFreedom] || { t80: 1.31, t90: 1.70, t95: 2.04 };
  }
  // Para N >= 30, aproximação assintótica Gaussiana
  return { t80: 1.282, t90: 1.645, t95: 1.960 };
}

export interface ComputeStatisticsInput {
  readonly homogenizedSamples: readonly HomogenizedSampleResult[];
}

export function computeStatisticalAnalysis(input: ComputeStatisticsInput): StatisticalAnalysisResult {
  const { homogenizedSamples } = input;
  const totalSamples = homogenizedSamples.length;

  const validSamples = homogenizedSamples.filter((s) => s.status === 'included');
  const excludedSamplesCount = totalSamples - validSamples.length;
  const validSamplesCount = validSamples.length;

  if (validSamplesCount === 0) {
    return {
      totalSamples,
      validSamplesCount: 0,
      excludedSamplesCount,
      mean: 0,
      median: 0,
      minimum: 0,
      maximum: 0,
      amplitude: 0,
      variance: 0,
      standardDeviation: 0,
      coefficientOfVariationPercentage: 0,
      lowerQuartile: 0,
      upperQuartile: 0,
      interquartileRange: 0,
      confidenceInterval80: { lower: 0, upper: 0 },
      confidenceInterval90: { lower: 0, upper: 0 },
      confidenceInterval95: { lower: 0, upper: 0 },
      outliersDetected: [],
    };
  }

  const values = validSamples.map((s) => s.homogenizedUnitPrice).sort((a, b) => a - b);

  // Média aritmética
  const mean = DecimalMath.mean(values, 2);

  // Mediana
  let median: number;
  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 0) {
    median = DecimalMath.round((values[mid - 1] + values[mid]) / 2, 2, 'half_even');
  } else {
    median = DecimalMath.round(values[mid], 2, 'half_even');
  }

  // Mínimo, Máximo e Amplitude
  const minimum = values[0];
  const maximum = values[values.length - 1];
  const amplitude = DecimalMath.round(maximum - minimum, 2, 'half_even');

  // Variância amostral (s²) com divisor (N - 1)
  const degreesOfFreedom = validSamplesCount > 1 ? validSamplesCount - 1 : 1;
  let sumSquaredDiffs = 0;
  for (const v of values) {
    sumSquaredDiffs += Math.pow(v - mean, 2);
  }

  const variance = DecimalMath.round(sumSquaredDiffs / degreesOfFreedom, 4, 'half_even');
  const standardDeviation = DecimalMath.round(Math.sqrt(variance), 2, 'half_even');

  // Coeficiente de Variação (CV = s / mean * 100)
  const coefficientOfVariationPercentage =
    mean > 0 ? DecimalMath.round((standardDeviation / mean) * 100, 2, 'half_even') : 0;

  // Quartis
  const q1Index = Math.floor(values.length * 0.25);
  const q3Index = Math.floor(values.length * 0.75);
  const lowerQuartile = values[q1Index] !== undefined ? values[q1Index] : values[0];
  const upperQuartile = values[q3Index] !== undefined ? values[q3Index] : values[values.length - 1];
  const interquartileRange = DecimalMath.round(upperQuartile - lowerQuartile, 2, 'half_even');

  // Erro padrão da média (SE = s / sqrt(N))
  const standardError = validSamplesCount > 0 ? standardDeviation / Math.sqrt(validSamplesCount) : 0;

  // Distribuição t de Student exata para N < 30
  const tCritical = getStudentTCriticalValues(degreesOfFreedom);

  const confidenceInterval80 = {
    lower: DecimalMath.round(Math.max(0, mean - tCritical.t80 * standardError), 2, 'half_even'),
    upper: DecimalMath.round(mean + tCritical.t80 * standardError, 2, 'half_even'),
  };

  const confidenceInterval90 = {
    lower: DecimalMath.round(Math.max(0, mean - tCritical.t90 * standardError), 2, 'half_even'),
    upper: DecimalMath.round(mean + tCritical.t90 * standardError, 2, 'half_even'),
  };

  const confidenceInterval95 = {
    lower: DecimalMath.round(Math.max(0, mean - tCritical.t95 * standardError), 2, 'half_even'),
    upper: DecimalMath.round(mean + tCritical.t95 * standardError, 2, 'half_even'),
  };

  // Identificação Assistida de Outliers (Z-score >= 2.0 ou critério IQR [Q1 - 1.5*IQR, Q3 + 1.5*IQR])
  const outliersDetected = validSamples.map((s) => {
    const val = s.homogenizedUnitPrice;
    const zScore = standardDeviation > 0 ? DecimalMath.round((val - mean) / standardDeviation, 2, 'half_even') : 0;
    const isOutlierByIqr = val < lowerQuartile - 1.5 * interquartileRange || val > upperQuartile + 1.5 * interquartileRange;
    const isOutlierByZScore = Math.abs(zScore) >= 2.0;
    const isOutlier = isOutlierByIqr || isOutlierByZScore;

    return {
      sampleId: s.sampleId,
      sampleCode: s.sampleCode,
      value: val,
      zScore,
      isOutlier,
      professionalJustification: s.exclusionJustification,
    };
  });

  return {
    totalSamples,
    validSamplesCount,
    excludedSamplesCount,
    mean,
    median,
    minimum,
    maximum,
    amplitude,
    variance,
    standardDeviation,
    coefficientOfVariationPercentage,
    lowerQuartile,
    upperQuartile,
    interquartileRange,
    confidenceInterval80,
    confidenceInterval90,
    confidenceInterval95,
    outliersDetected,
  };
}
