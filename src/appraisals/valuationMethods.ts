/**
 * Motores dos Métodos Avaliatórios e Execução de Cálculos
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Métodos:
 * 1. Método Comparativo Direto de Dados de Mercado (MCDDM)
 * 2. Método da Quantificação do Custo (MQC)
 * 3. Método Evolutivo (ME)
 * 4. Método da Capitalização da Renda (MCR)
 * 5. Método Involutivo (MI)
 */

import {
  ValuationMethod,
  AppraisalCalculationRun,
} from '../types/appraisalCalculation';
import { DecimalMath } from './decimalMath';
import { computeCanonicalSha256 } from './cryptoHash';

export interface DirectComparativeInput {
  readonly appraisalId: string;
  readonly organizationId: string;
  readonly executedByUserId: string;
  readonly targetArea: number; // ha ou m2
  readonly areaUnit: 'ha' | 'm2';
  readonly homogenizedUnitPrices: readonly number[];
}

export interface CostQuantificationInput {
  readonly appraisalId: string;
  readonly organizationId: string;
  readonly executedByUserId: string;
  readonly improvements: readonly {
    readonly description: string;
    readonly totalCostNew: number;
    readonly depreciationPercentage: number;
    readonly depreciatedTotalValue: number;
  }[];
}

export interface EvolutionaryMethodInput {
  readonly appraisalId: string;
  readonly organizationId: string;
  readonly executedByUserId: string;
  readonly landValue: number; // Terra Nua / Terreno
  readonly improvementsValue: number; // Benfeitorias
  readonly commercializationFactor?: number; // Fator de Comercialização (FC: ex 1.00)
}

export interface IncomeCapitalizationInput {
  readonly appraisalId: string;
  readonly organizationId: string;
  readonly executedByUserId: string;
  readonly annualNetOperatingIncome: number; // R$/ano
  readonly capitalizationRatePercentage: number; // Taxa de capitalização ex: 6%
}

export interface InvolutiveMethodInput {
  readonly appraisalId: string;
  readonly organizationId: string;
  readonly executedByUserId: string;
  readonly grossRevenuePotential: number; // Potencial de Venda
  readonly directCosts: number; // Obras / Infraestrutura
  readonly indirectCostsAndTaxes: number; // BDI, impostos, marketing
  readonly developerProfitMarginPercentage: number; // Lucro do incorporador
  readonly discountingRatePercentage: number; // Taxa de desconto
  readonly projectHorizonMonths: number;
}

export class ValuationMethodEngine {
  /**
   * 1. Método Comparativo Direto de Dados de Mercado
   */
  public static executeDirectComparative(input: DirectComparativeInput): AppraisalCalculationRun {
    const { appraisalId, organizationId, executedByUserId, targetArea, areaUnit, homogenizedUnitPrices } = input;

    if (targetArea <= 0) {
      throw new Error('Área do imóvel avaliando deve ser maior que zero.');
    }
    if (!homogenizedUnitPrices || homogenizedUnitPrices.length === 0) {
      throw new Error('Conjunto de preços unitários homogeneizados insuficiente para o Método Comparativo.');
    }

    const meanUnitPrice = DecimalMath.mean(homogenizedUnitPrices, 2);
    const resultCalculatedValue = DecimalMath.round(DecimalMath.multiply(meanUnitPrice, targetArea, 4), 2);

    const minUnit = Math.min(...homogenizedUnitPrices);
    const maxUnit = Math.max(...homogenizedUnitPrices);

    const resultRange = {
      min: DecimalMath.round(DecimalMath.multiply(minUnit, targetArea, 4), 2),
      max: DecimalMath.round(DecimalMath.multiply(maxUnit, targetArea, 4), 2),
    };

    const warnings: string[] = [];
    if (homogenizedUnitPrices.length < 3) {
      warnings.push('Amostragem com menos de 3 elementos — grau de fundamentação reduzido.');
    }

    const runId = `calc_mcddm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const executedAt = new Date().toISOString();

    const deterministicPayload = {
      appraisalId,
      organizationId,
      method: 'direct_comparative' as const,
      algorithmVersion: '1.0.0',
      inputParameters: {
        targetArea,
        areaUnit,
        sampleCount: homogenizedUnitPrices.length,
        meanUnitPrice,
      },
      decimalPrecisionSettings: {
        currencyDecimals: 2,
        areaDecimals: areaUnit === 'ha' ? 4 : 2,
        factorDecimals: 4,
        roundingMode: 'half_even' as const,
      },
      resultCalculatedValue,
      resultUnitValue: meanUnitPrice,
      resultRange,
    };

    return {
      id: runId,
      appraisalId,
      organizationId,
      method: 'direct_comparative' as const,
      algorithmVersion: '1.0.0',
      inputParameters: deterministicPayload.inputParameters,
      decimalPrecisionSettings: deterministicPayload.decimalPrecisionSettings,
      resultCalculatedValue,
      resultUnitValue: meanUnitPrice,
      resultRange,
      executedByUserId,
      executedAt,
      warnings,
      limitations: ['Aderente às amostras de mercado coletadas no polo avaliatório.'],
      checksumSha256: computeCanonicalSha256(deterministicPayload),
    };
  }

  /**
   * 2. Método da Quantificação do Custo
   */
  public static executeCostQuantification(input: CostQuantificationInput): AppraisalCalculationRun {
    const { appraisalId, organizationId, executedByUserId, improvements } = input;

    let totalCostNew = 0;
    let totalDepreciatedValue = 0;

    for (const item of improvements) {
      totalCostNew += item.totalCostNew;
      totalDepreciatedValue += item.depreciatedTotalValue;
    }

    totalCostNew = DecimalMath.round(totalCostNew, 2);
    totalDepreciatedValue = DecimalMath.round(totalDepreciatedValue, 2);

    const runId = `calc_mqc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const executedAt = new Date().toISOString();

    const deterministicPayload = {
      appraisalId,
      organizationId,
      method: 'cost_quantification' as const,
      algorithmVersion: '1.0.0',
      inputParameters: {
        improvementsCount: improvements.length,
        totalCostNew,
      },
      decimalPrecisionSettings: {
        currencyDecimals: 2,
        areaDecimals: 2,
        factorDecimals: 4,
        roundingMode: 'half_even' as const,
      },
      resultCalculatedValue: totalDepreciatedValue,
      resultUnitValue: totalDepreciatedValue,
      resultRange: {
        min: DecimalMath.round(totalDepreciatedValue * 0.9, 2),
        max: DecimalMath.round(totalDepreciatedValue * 1.1, 2),
      },
    };

    return {
      id: runId,
      appraisalId,
      organizationId,
      method: 'cost_quantification' as const,
      algorithmVersion: '1.0.0',
      inputParameters: deterministicPayload.inputParameters,
      decimalPrecisionSettings: deterministicPayload.decimalPrecisionSettings,
      resultCalculatedValue: totalDepreciatedValue,
      resultUnitValue: totalDepreciatedValue,
      resultRange: deterministicPayload.resultRange,
      executedByUserId,
      executedAt,
      warnings: [],
      limitations: ['Depreciação física e funcional baseada nas idades e conservações informadas.'],
      checksumSha256: computeCanonicalSha256(deterministicPayload),
    };
  }

  /**
   * 3. Método Evolutivo
   */
  public static executeEvolutionary(input: EvolutionaryMethodInput): AppraisalCalculationRun {
    const { appraisalId, organizationId, executedByUserId, landValue, improvementsValue, commercializationFactor = 1.0 } = input;

    if (landValue < 0 || improvementsValue < 0) {
      throw new Error('Valores de terra nua ou benfeitorias não podem ser negativos.');
    }

    const baseSum = DecimalMath.round(landValue + improvementsValue, 2);
    const resultCalculatedValue = DecimalMath.round(DecimalMath.multiply(baseSum, commercializationFactor, 4), 2);

    const runId = `calc_me_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const executedAt = new Date().toISOString();

    const deterministicPayload = {
      appraisalId,
      organizationId,
      method: 'evolutionary' as const,
      algorithmVersion: '1.0.0',
      inputParameters: {
        landValue,
        improvementsValue,
        commercializationFactor,
      },
      decimalPrecisionSettings: {
        currencyDecimals: 2,
        areaDecimals: 2,
        factorDecimals: 4,
        roundingMode: 'half_even' as const,
      },
      resultCalculatedValue,
      resultUnitValue: resultCalculatedValue,
      resultRange: {
        min: DecimalMath.round(resultCalculatedValue * 0.9, 2),
        max: DecimalMath.round(resultCalculatedValue * 1.1, 2),
      },
    };

    return {
      id: runId,
      appraisalId,
      organizationId,
      method: 'evolutionary' as const,
      algorithmVersion: '1.0.0',
      inputParameters: deterministicPayload.inputParameters,
      decimalPrecisionSettings: deterministicPayload.decimalPrecisionSettings,
      resultCalculatedValue,
      resultUnitValue: resultCalculatedValue,
      resultRange: deterministicPayload.resultRange,
      executedByUserId,
      executedAt,
      warnings: [],
      limitations: ['Composição estruturada de terra nua e benfeitorias reprodutíveis.'],
      checksumSha256: computeCanonicalSha256(deterministicPayload),
    };
  }

  /**
   * 4. Método da Capitalização da Renda
   */
  public static executeIncomeCapitalization(input: IncomeCapitalizationInput): AppraisalCalculationRun {
    const { appraisalId, organizationId, executedByUserId, annualNetOperatingIncome, capitalizationRatePercentage } = input;

    if (capitalizationRatePercentage <= 0) {
      throw new Error('Taxa de capitalização deve ser maior que zero.');
    }

    const capRateDecimal = capitalizationRatePercentage / 100;
    const resultCalculatedValue = DecimalMath.divide(annualNetOperatingIncome, capRateDecimal, 2);

    const runId = `calc_mcr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const executedAt = new Date().toISOString();

    const deterministicPayload = {
      appraisalId,
      organizationId,
      method: 'income_capitalization' as const,
      algorithmVersion: '1.0.0',
      inputParameters: {
        annualNetOperatingIncome,
        capitalizationRatePercentage,
      },
      decimalPrecisionSettings: {
        currencyDecimals: 2,
        areaDecimals: 2,
        factorDecimals: 4,
        roundingMode: 'half_even' as const,
      },
      resultCalculatedValue,
      resultUnitValue: resultCalculatedValue,
      resultRange: {
        min: DecimalMath.round(resultCalculatedValue * 0.85, 2),
        max: DecimalMath.round(resultCalculatedValue * 1.15, 2),
      },
    };

    return {
      id: runId,
      appraisalId,
      organizationId,
      method: 'income_capitalization' as const,
      algorithmVersion: '1.0.0',
      inputParameters: deterministicPayload.inputParameters,
      decimalPrecisionSettings: deterministicPayload.decimalPrecisionSettings,
      resultCalculatedValue,
      resultUnitValue: resultCalculatedValue,
      resultRange: deterministicPayload.resultRange,
      executedByUserId,
      executedAt,
      warnings: [],
      limitations: ['Pressupõe fluxo de renda perene e taxa de atratividade estável.'],
      checksumSha256: computeCanonicalSha256(deterministicPayload),
    };
  }

  /**
   * 5. Método Involutivo
   */
  public static executeInvolutive(input: InvolutiveMethodInput): AppraisalCalculationRun {
    const {
      appraisalId,
      organizationId,
      executedByUserId,
      grossRevenuePotential,
      directCosts,
      indirectCostsAndTaxes,
      developerProfitMarginPercentage,
      discountingRatePercentage,
      projectHorizonMonths,
    } = input;

    const totalDeductions = directCosts + indirectCostsAndTaxes + (grossRevenuePotential * developerProfitMarginPercentage) / 100;
    const netFutureSurplus = Math.max(0, grossRevenuePotential - totalDeductions);

    // Desconto a valor presente
    const discountRatePerMonth = discountingRatePercentage / 100 / 12;
    const discountFactor = Math.pow(1 + discountRatePerMonth, projectHorizonMonths / 2); // Ponto médio do fluxo
    const resultCalculatedValue = DecimalMath.round(netFutureSurplus / discountFactor, 2);

    const runId = `calc_mi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const executedAt = new Date().toISOString();

    const deterministicPayload = {
      appraisalId,
      organizationId,
      method: 'involutive' as const,
      algorithmVersion: '1.0.0',
      inputParameters: {
        grossRevenuePotential,
        directCosts,
        indirectCostsAndTaxes,
        developerProfitMarginPercentage,
        discountingRatePercentage,
        projectHorizonMonths,
      },
      decimalPrecisionSettings: {
        currencyDecimals: 2,
        areaDecimals: 2,
        factorDecimals: 4,
        roundingMode: 'half_even' as const,
      },
      resultCalculatedValue,
      resultUnitValue: resultCalculatedValue,
      resultRange: {
        min: DecimalMath.round(resultCalculatedValue * 0.85, 2),
        max: DecimalMath.round(resultCalculatedValue * 1.15, 2),
      },
    };

    return {
      id: runId,
      appraisalId,
      organizationId,
      method: 'involutive' as const,
      algorithmVersion: '1.0.0',
      inputParameters: deterministicPayload.inputParameters,
      decimalPrecisionSettings: deterministicPayload.decimalPrecisionSettings,
      resultCalculatedValue,
      resultUnitValue: resultCalculatedValue,
      resultRange: deterministicPayload.resultRange,
      executedByUserId,
      executedAt,
      warnings: [],
      limitations: ['Modelo dinâmico simplificado sujeito a flutuações de absorção de mercado.'],
      checksumSha256: computeCanonicalSha256(deterministicPayload),
    };
  }
}

/**
 * Funções de conveniência no nível superior do módulo
 */
export const executeMCDDM = ValuationMethodEngine.executeDirectComparative;
export const executeMQC = ValuationMethodEngine.executeCostQuantification;
export const executeEvolutionaryMethod = ValuationMethodEngine.executeEvolutionary;
export const executeIncomeCapitalization = ValuationMethodEngine.executeIncomeCapitalization;
export const executeInvolutiveMethod = ValuationMethodEngine.executeInvolutive;

