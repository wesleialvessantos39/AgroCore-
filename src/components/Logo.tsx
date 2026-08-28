import React from 'react';
import { BrandLogo, BrandLogoProps } from './brand/BrandLogo';

export type LogoProps = BrandLogoProps;

/**
 * Componente unificado de identidade institucional AgroCore.
 * Encaminha para o BrandLogo oficial mantendo total retrocompatibilidade de API.
 */
export function Logo(props: LogoProps) {
  return <BrandLogo {...props} />;
}

export { BrandLogo };
export type { BrandLogoProps };
export { BrandMark } from './brand/BrandMark';
export type { BrandMarkProps, BrandMarkVariant, BrandMarkSize } from './brand/BrandMark';
