/**
 * MÓDULO 005 — CALCULADORA FINANCEIRA DETERMINÍSTICA
 * AgroCore — Propostas de Crédito e Serviços
 *
 * Princípios:
 * 1. Aritmética 100% inteira / BigInt baseada em centavos.
 * 2. Nenhuma conversão intermediária para ponto flutuante (IEEE 754).
 * 3. Política de arredondamento explícita e determinística: Arredondamento Bancário (Half-Even / Meio-Par).
 * 4. Tratamento robusto para valores zero, limites, taxas fracionárias e meio centavo.
 */

export type RoundingMode = 'half_even' | 'half_up';

export interface FinancialCalculationParams {
  readonly principalCents: number;
  readonly interestRateAnnualPercentage?: number;
  readonly financingTermMonths?: number;
  readonly gracePeriodMonths?: number;
  readonly installmentsCount?: number;
  readonly roundingMode?: RoundingMode;
}

export interface FinancialCalculationResult {
  readonly principalCents: number;
  readonly interestRateAnnualPercentage: number;
  readonly financingTermMonths: number;
  readonly gracePeriodMonths: number;
  readonly estimatedInterestCents: number;
  readonly totalEstimatedCents: number;
  readonly installmentsCount: number;
  readonly installmentEstimatedCents: number;
  readonly formattedValueBRL: string;
}

/**
 * Converte a entrada textual de porcentagem sem aceitar prefixos ou sufixos parciais.
 * Retorna NaN para conteúdo inválido para que a camada de validação apresente o erro no campo.
 */
export function parsePercentageInput(value: string): number | undefined {
  const normalized = value.trim().replace(',', '.');
  if (normalized === '') return undefined;
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return Number.NaN;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Realiza divisão inteira com arredondamento determinístico (Half-Even ou Half-Up).
 */
export function divideBigIntWithRounding(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = 'half_even'
): bigint {
  if (denominator === 0n) {
    throw new Error('Divisão por zero em cálculo financeiro.');
  }

  // Normaliza sinais para que o denominador seja positivo
  let num = numerator;
  let den = denominator;
  let isNegative = false;

  if (den < 0n) {
    num = -num;
    den = -den;
  }
  if (num < 0n) {
    isNegative = true;
    num = -num;
  }

  const quotient = num / den;
  const remainder = num % den;

  if (remainder === 0n) {
    return isNegative ? -quotient : quotient;
  }

  let roundedQuotient = quotient;
  const doubleRemainder = remainder * 2n;

  if (mode === 'half_up') {
    if (doubleRemainder >= den) {
      roundedQuotient += 1n;
    }
  } else {
    // half_even (Bancário): se remainder * 2 > den -> arredonda para cima.
    // Se remainder * 2 === den -> arredonda para o par mais próximo.
    if (doubleRemainder > den) {
      roundedQuotient += 1n;
    } else if (doubleRemainder === den) {
      if (quotient % 2n !== 0n) {
        roundedQuotient += 1n;
      }
    }
  }

  return isNegative ? -roundedQuotient : roundedQuotient;
}

/**
 * Converte taxa de porcentagem (number ou string) para representação inteira escalonada (BigInt).
 * Ex: 10.5% com escala 6 -> 10500000n, fator de divisão 100 * 10^6 = 100_000_000n.
 */
export function parseRateToScaledBigInt(rate: number): { scaledRate: bigint; scaleFactor: bigint } {
  if (rate <= 0 || !Number.isFinite(rate)) {
    return { scaledRate: 0n, scaleFactor: 100n };
  }

  // Converte para string para evitar artefatos de ponto flutuante
  const rateStr = rate.toString();
  const parts = rateStr.split('.');
  const intPart = parts[0];
  const fracPart = parts[1] || '';

  const scale = fracPart.length;
  const digits = intPart + fracPart;
  const scaledRate = BigInt(digits);
  const scaleFactor = 100n * (10n ** BigInt(scale));

  return { scaledRate, scaleFactor };
}

/**
 * Converte uma string formatada em BRL para valor inteiro em centavos de forma determinística, sem ponto flutuante.
 */
export function parseBRLToCents(val: string): number {
  if (!val || typeof val !== 'string') return 0;

  const cleaned = val.replace(/[R$\s]/g, '').trim();
  if (!cleaned) return 0;

  const isNegative = cleaned.startsWith('-');
  const unsigned = cleaned.replace(/^-/, '').replace(/\./g, '');
  const parts = unsigned.split(',');
  const intPart = parts[0] ? parts[0].replace(/\D/g, '') : '0';
  const fracPart = parts[1] ? parts[1].replace(/\D/g, '').padEnd(2, '0').slice(0, 2) : '00';

  const centsBigInt = BigInt(intPart || '0') * 100n + BigInt(fracPart || '0');
  const finalCents = isNegative ? -Number(centsBigInt) : Number(centsBigInt);

  if (!Number.isSafeInteger(finalCents)) {
    throw new Error('Valor monetário excede o limite numérico seguro (Number.MAX_SAFE_INTEGER).');
  }

  return finalCents;
}

/**
 * Calcula os juros simples estimados em centavos de forma determinística:
 * Juros = (Principal * TaxaAnual * Meses) / (100 * 12)
 */
export function calculateSimpleInterestCents(
  principalCents: number,
  interestRateAnnualPercentage: number,
  termMonths: number,
  mode: RoundingMode = 'half_even'
): number {
  if (principalCents <= 0 || interestRateAnnualPercentage <= 0 || termMonths <= 0) {
    return 0;
  }

  if (!Number.isSafeInteger(principalCents)) {
    throw new Error('O valor do principal em centavos deve ser um inteiro seguro.');
  }

  const principal = BigInt(principalCents);
  const { scaledRate, scaleFactor } = parseRateToScaledBigInt(interestRateAnnualPercentage);
  const months = BigInt(termMonths);

  // Numerador: principal * scaledRate * months
  const numerator = principal * scaledRate * months;
  // Denominador: scaleFactor * 12
  const denominator = scaleFactor * 12n;

  const resultBigInt = divideBigIntWithRounding(numerator, denominator, mode);
  const resultNum = Number(resultBigInt);

  if (!Number.isSafeInteger(resultNum)) {
    throw new Error('O resultado dos juros excede o limite numérico seguro.');
  }

  return resultNum;
}

/**
 * Formata um valor em centavos para a string monetária brasileira 'R$ X.XXX,XX' de forma determinística.
 */
export function formatCentsToBRL(cents: number): string {
  if (!Number.isFinite(cents) || !Number.isSafeInteger(Math.round(cents))) return 'R$ 0,00';

  const isNegative = cents < 0;
  const absCents = Math.abs(Math.round(cents));

  const integerPart = Math.floor(absCents / 100);
  const decimalPart = absCents % 100;

  const formattedInteger = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formattedDecimal = decimalPart.toString().padStart(2, '0');

  const sign = isNegative ? '-' : '';
  return `${sign}R$ ${formattedInteger},${formattedDecimal}`;
}

/**
 * Executa o cálculo completo de simulação de proposta de crédito ou serviço.
 */
export function calculateProposalFinancialSummary(
  params: FinancialCalculationParams
): FinancialCalculationResult {
  const {
    principalCents,
    interestRateAnnualPercentage = 0,
    financingTermMonths = 1,
    gracePeriodMonths = 0,
    installmentsCount,
    roundingMode = 'half_even',
  } = params;

  if (!Number.isSafeInteger(principalCents)) {
    throw new Error('Principal em centavos deve ser um número inteiro seguro.');
  }
  if (!Number.isFinite(interestRateAnnualPercentage) || interestRateAnnualPercentage < 0) {
    throw new Error('Taxa anual deve ser um número finito não negativo.');
  }
  if (!Number.isSafeInteger(financingTermMonths) || financingTermMonths < 1) {
    throw new Error('Prazo de financiamento deve ser um inteiro seguro maior que zero.');
  }
  if (!Number.isSafeInteger(gracePeriodMonths) || gracePeriodMonths < 0) {
    throw new Error('Carência deve ser um inteiro seguro não negativo.');
  }
  if (
    installmentsCount !== undefined &&
    (!Number.isSafeInteger(installmentsCount) || installmentsCount < 1)
  ) {
    throw new Error('Quantidade de parcelas deve ser um inteiro seguro maior que zero.');
  }

  const validPrincipal = Math.max(0, principalCents);
  const validRate = interestRateAnnualPercentage;
  const validTerm = financingTermMonths;
  const validGrace = gracePeriodMonths;

  const estimatedInterestCents = calculateSimpleInterestCents(
    validPrincipal,
    validRate,
    validTerm,
    roundingMode
  );

  const totalEstimatedCents = validPrincipal + estimatedInterestCents;
  if (!Number.isSafeInteger(totalEstimatedCents)) {
    throw new Error('Total estimado excede o limite numérico seguro.');
  }

  const effectiveInstallments = Math.max(1, installmentsCount || validTerm);
  const installmentEstimatedBigInt = divideBigIntWithRounding(
    BigInt(totalEstimatedCents),
    BigInt(effectiveInstallments),
    roundingMode
  );
  const installmentEstimatedCents = Number(installmentEstimatedBigInt);

  return {
    principalCents: validPrincipal,
    interestRateAnnualPercentage: validRate,
    financingTermMonths: validTerm,
    gracePeriodMonths: validGrace,
    estimatedInterestCents,
    totalEstimatedCents,
    installmentsCount: effectiveInstallments,
    installmentEstimatedCents,
    formattedValueBRL: formatCentsToBRL(totalEstimatedCents),
  };
}
