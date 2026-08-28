import React from 'react';

export type BrandMarkVariant = 'on-dark' | 'on-light' | 'monochrome' | 'white' | 'standalone';
export type BrandMarkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface BrandMarkProps {
  variant?: BrandMarkVariant;
  size?: BrandMarkSize;
  className?: string;
  badge?: boolean;
  'aria-hidden'?: boolean | 'true' | 'false';
  'aria-label'?: string;
}

const sizeMap = {
  xs: 'w-4 h-4',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  xl: 'w-12 h-12',
};

const badgeSizeMap = {
  xs: 'w-6 h-6 rounded-md p-0.5',
  sm: 'w-8 h-8 rounded-lg p-1',
  md: 'w-10 h-10 rounded-xl p-1.5',
  lg: 'w-12 h-12 rounded-xl p-2',
  xl: 'w-14 h-14 rounded-2xl p-2.5',
};

/**
 * Símbolo Oficial AgroCore — Identidade Vetorial Exclusiva
 *
 * Composição Conceitual:
 * 1. Núcleo Circular Central (Core): O centro da governança e gestão rural.
 * 2. Arco Externo em "C": Representa o abraço organizacional, integração tecnológica e a inicial do Core.
 * 3. Folha Agrícola Integrada: Representa a força do campo, produtividade e sustentabilidade.
 *
 * Paleta Oficial:
 * - Verde-escuro: #0B3D2E
 * - Verde-claro: #78C89A
 * - Branco: #FFFFFF
 */
export function BrandMark({
  variant = 'on-dark',
  size = 'md',
  className = '',
  badge = true,
  'aria-hidden': ariaHidden,
  'aria-label': ariaLabel,
}: BrandMarkProps) {
  const isDark = variant === 'on-dark';
  const isWhite = variant === 'white';
  const isMonochrome = variant === 'monochrome';

  // Cores dinâmicas para o símbolo
  let arcStroke = isDark ? '#78C89A' : '#0B3D2E';
  let coreFill = isDark ? '#FFFFFF' : '#0B3D2E';
  let leafFill = '#78C89A';

  if (isWhite) {
    arcStroke = '#FFFFFF';
    coreFill = '#FFFFFF';
    leafFill = '#FFFFFF';
  } else if (isMonochrome) {
    arcStroke = 'currentColor';
    coreFill = 'currentColor';
    leafFill = 'currentColor';
  }

  const svgContent = (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={badge ? 'w-full h-full' : sizeMap[size]}
      aria-hidden={ariaHidden ?? (ariaLabel ? undefined : true)}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {/* Arco externo sugerindo a letra "C" (Core / AgroCore) */}
      <path
        d="M21 9.5C19.5 8 17.4 7 15 7C10.03 7 6 11.03 6 16C6 20.97 10.03 25 15 25C17.4 25 19.5 24 21 22.5"
        stroke={arcStroke}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Núcleo central (Core da gestão) */}
      <circle
        cx="15"
        cy="16"
        r="3.2"
        fill={coreFill}
      />

      {/* Folha agrícola integrada ascendente */}
      <path
        d="M15 13C15 13 18.5 10 24 10C24 15.5 21 19 21 19C21 19 19.5 15.5 15 13Z"
        fill={leafFill}
      />
    </svg>
  );

  if (!badge || variant === 'standalone') {
    return (
      <span className={`inline-flex items-center justify-center shrink-0 ${className}`}>
        {svgContent}
      </span>
    );
  }

  return (
    <span
      id="agrocore-brand-mark"
      className={`inline-flex items-center justify-center shrink-0 select-none shadow-sm transition-transform ${badgeSizeMap[size]} ${className}`}
      style={{
        backgroundColor: isDark ? '#07261D' : '#FFFFFF',
        border: isDark ? '1px solid rgba(120, 200, 154, 0.35)' : '1px solid #D1DED7',
      }}
      aria-hidden={ariaHidden ?? (ariaLabel ? undefined : true)}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {svgContent}
    </span>
  );
}
