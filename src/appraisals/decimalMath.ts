/**
 * Motor Numérico Decimal Determinístico para Avaliação Imobiliária
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Princípios:
 * - Aritmética decimal determinística para evitar imprecisões de ponto flutuante IEEE-754.
 * - Suporte exato a arredondamento Half-Up e Half-Even (Bancário).
 * - Tratamento estrito contra NaN, Infinity e divisão por zero.
 * - Testado para casos críticos: round(1.005, 2, 'half_up') === 1.01 e round(2.675, 2, 'half_up') === 2.68.
 */

export type RoundingMode = 'half_up' | 'half_even';

export class DecimalMath {
  /**
   * Converte um número para representação de string decimal exata normalizada
   */
  private static toExactDecimalString(value: number): { sign: number; intPart: string; fracPart: string } {
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      throw new Error(`DecimalMath: Valor numérico inválido (${value}).`);
    }

    const str = value.toString();
    const isNegative = str.startsWith('-');
    const cleanStr = isNegative ? str.substring(1) : str;

    // Trata notação científica (ex: 1e-7 ou 1.5e4)
    if (cleanStr.includes('e') || cleanStr.includes('E')) {
      const [coeff, expStr] = cleanStr.toLowerCase().split('e');
      const exp = parseInt(expStr, 10);
      const [cInt, cFrac = ''] = coeff.split('.');
      const combined = cInt + cFrac;
      const originalFracLen = cFrac.length;

      if (exp < 0) {
        const leadingZeros = -exp - cInt.length;
        if (leadingZeros >= 0) {
          const frac = '0'.repeat(leadingZeros) + combined;
          return { sign: isNegative ? -1 : 1, intPart: '0', fracPart: frac };
        } else {
          const splitIdx = cInt.length + exp;
          return {
            sign: isNegative ? -1 : 1,
            intPart: combined.substring(0, splitIdx),
            fracPart: combined.substring(splitIdx),
          };
        }
      } else {
        const trailingZeros = exp - originalFracLen;
        if (trailingZeros >= 0) {
          return {
            sign: isNegative ? -1 : 1,
            intPart: combined + '0'.repeat(trailingZeros),
            fracPart: '',
          };
        } else {
          const splitIdx = cInt.length + exp;
          return {
            sign: isNegative ? -1 : 1,
            intPart: combined.substring(0, splitIdx),
            fracPart: combined.substring(splitIdx),
          };
        }
      }
    }

    const [intPart, fracPart = ''] = cleanStr.split('.');
    return {
      sign: isNegative ? -1 : 1,
      intPart: intPart || '0',
      fracPart,
    };
  }

  /**
   * Arredonda um número para um número específico de casas decimais com modo determinístico
   */
  public static round(value: number, decimals: number = 2, mode: RoundingMode = 'half_even'): number {
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      throw new Error(`DecimalMath: Valor numérico inválido (${value}).`);
    }
    if (decimals < 0 || !Number.isInteger(decimals)) {
      throw new Error(`DecimalMath: Número de casas decimais inválido (${decimals}).`);
    }

    if (value === 0) return 0;

    const { sign, intPart, fracPart } = this.toExactDecimalString(value);

    // Se já tiver menos ou igual casas decimais que o requisitado, apenas formata
    if (fracPart.length <= decimals) {
      return value;
    }

    // Pega os dígitos preservados
    const preservedFrac = fracPart.substring(0, decimals);
    const roundDigit = parseInt(fracPart.charAt(decimals), 10);
    const remainderDigits = fracPart.substring(decimals + 1);
    const hasNonZeroRemainder = remainderDigits.split('').some((d) => d !== '0');

    // Base do inteiro escalado (ex: "100" para 1.00 com decimals=2)
    const baseDigitsStr = intPart + preservedFrac.padEnd(decimals, '0');
    let scaledBigInt = BigInt(baseDigitsStr);

    let shouldRoundUp = false;

    if (mode === 'half_up') {
      // Half-Up: arredonda para cima se o dígito >= 5
      shouldRoundUp = roundDigit >= 5;
    } else {
      // Half-Even: arredonda para o par mais próximo se exatamente na metade
      if (roundDigit > 5 || (roundDigit === 5 && hasNonZeroRemainder)) {
        shouldRoundUp = true;
      } else if (roundDigit === 5 && !hasNonZeroRemainder) {
        // Exatamente na metade: verifica se o último dígito mantido é ímpar
        const lastKeptDigit = decimals > 0
          ? parseInt(preservedFrac.charAt(decimals - 1) || '0', 10)
          : parseInt(intPart.slice(-1) || '0', 10);
        shouldRoundUp = lastKeptDigit % 2 !== 0;
      }
    }

    if (shouldRoundUp) {
      scaledBigInt += 1n;
    }

    // Reconstrói o número float
    const resultStr = scaledBigInt.toString();
    const divisor = Math.pow(10, decimals);
    const floatVal = Number(resultStr) / divisor;

    return sign === -1 ? -floatVal : floatVal;
  }

  /**
   * Multiplicação determinística
   */
  public static multiply(a: number, b: number, decimals: number = 2): number {
    if (!Number.isFinite(a) || !Number.isFinite(b) || Number.isNaN(a) || Number.isNaN(b)) {
      throw new Error('DecimalMath: Multiplicação com operandos inválidos ou não finitos.');
    }
    if (a === 0 || b === 0) return 0;

    const raw = a * b;
    return DecimalMath.round(raw, decimals, 'half_even');
  }

  /**
   * Divisão segura com proteção contra zero
   */
  public static divide(numerator: number, denominator: number, decimals: number = 4): number {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Number.isNaN(numerator) || Number.isNaN(denominator)) {
      throw new Error('DecimalMath: Divisão com operandos inválidos.');
    }
    if (Math.abs(denominator) === 0) {
      throw new Error('DecimalMath: Divisão por zero detectada.');
    }
    if (numerator === 0) return 0;

    const raw = numerator / denominator;
    return DecimalMath.round(raw, decimals, 'half_even');
  }

  /**
   * Soma de série numérica com precisão
   */
  public static sum(values: readonly number[], decimals: number = 2): number {
    let total = 0;
    for (const val of values) {
      if (!Number.isFinite(val) || Number.isNaN(val)) {
        throw new Error('DecimalMath: Soma contém valores não finitos.');
      }
      total += val;
    }
    return DecimalMath.round(total, decimals, 'half_even');
  }

  /**
   * Subtração determinística
   */
  public static subtract(a: number, b: number, decimals: number = 2): number {
    if (!Number.isFinite(a) || !Number.isFinite(b) || Number.isNaN(a) || Number.isNaN(b)) {
      throw new Error('DecimalMath: Subtração com operandos inválidos.');
    }
    return DecimalMath.round(a - b, decimals, 'half_even');
  }

  /**
   * Calcula a média aritmética de uma série
   */
  public static mean(values: readonly number[], decimals: number = 4): number {
    if (!values || values.length === 0) {
      throw new Error('DecimalMath: Impossível calcular média de conjunto vazio.');
    }
    const total = DecimalMath.sum(values, 8);
    return DecimalMath.divide(total, values.length, decimals);
  }

  /**
   * Calcula percentual (base * percentage / 100)
   */
  public static percentage(base: number, percentage: number, decimals: number = 2): number {
    if (!Number.isFinite(base) || !Number.isFinite(percentage)) {
      throw new Error('DecimalMath: Percentual com operandos inválidos.');
    }
    return DecimalMath.round((base * percentage) / 100, decimals, 'half_even');
  }

  /**
   * Formata moeda brasileira R$ de forma padronizada e limpa
   */
  public static formatCurrency(value: number): string {
    if (!Number.isFinite(value) || Number.isNaN(value)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  /**
   * Formata área com unidade
   */
  public static formatArea(value: number, unit: 'ha' | 'm2'): string {
    if (!Number.isFinite(value) || Number.isNaN(value)) return `0 ${unit}`;
    const decimals = unit === 'ha' ? 4 : 2;
    const formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    }).format(value);
    return `${formatted} ${unit === 'ha' ? 'ha' : 'm²'}`;
  }
}

/**
 * Funções auxiliares de conveniência no nível superior do módulo
 */
export function formatBRL(value: number): string {
  return DecimalMath.formatCurrency(value);
}

export function roundHalfEven(value: number, decimals: number = 2): number {
  return DecimalMath.round(value, decimals, 'half_even');
}

export function roundHalfUp(value: number, decimals: number = 2): number {
  return DecimalMath.round(value, decimals, 'half_up');
}


