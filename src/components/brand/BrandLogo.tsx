import React from 'react';
import { BrandMark, BrandMarkVariant } from './BrandMark';

export interface BrandLogoProps {
  variant?: 'on-dark' | 'on-light';
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
  subtitleText?: string;
}

export function BrandLogo({
  variant = 'on-dark',
  size = 'md',
  showSubtitle = true,
  className = '',
  subtitleText = 'Gestão e Crédito Rural',
}: BrandLogoProps) {
  const isDark = variant === 'on-dark';

  const markSize = size === 'lg' ? 'md' : size === 'md' ? 'sm' : 'xs';

  const titleSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  const subtitleSizes = {
    sm: 'text-[10px]',
    md: 'text-[11px]',
    lg: 'text-xs',
  };

  return (
    <div id="agrocore-brand-logo" className={`flex items-center gap-3 select-none ${className}`}>
      <BrandMark variant={isDark ? 'on-dark' : 'on-light'} size={markSize} aria-hidden={true} />

      <div className="flex flex-col">
        <div className={`font-extrabold tracking-tight leading-none ${titleSizes[size]} flex items-center`}>
          <span
            style={{
              color: isDark ? '#FFFFFF' : '#0B3D2E',
              fontWeight: 800,
            }}
          >
            Agro
          </span>
          <span
            style={{
              color: '#78C89A',
              fontWeight: 800,
            }}
          >
            Core
          </span>
        </div>
        {showSubtitle && (
          <span
            className={`font-semibold tracking-wider mt-1 uppercase ${subtitleSizes[size]}`}
            style={{
              color: isDark ? '#CBD5E1' : '#475569',
              letterSpacing: '0.06em',
            }}
          >
            {subtitleText}
          </span>
        )}
      </div>
    </div>
  );
}
