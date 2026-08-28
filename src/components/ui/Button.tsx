import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LoadingIndicator } from '../feedback/LoadingIndicator';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#0B3D2E] text-white hover:bg-[#082F23] focus-visible:ring-[#78C89A] border border-transparent shadow-xs',
  secondary:
    'bg-white text-[#0B3D2E] border border-[#E2E8F0] hover:bg-[#EFF5F2] focus-visible:ring-[#0B3D2E] shadow-xs',
  ghost:
    'bg-transparent text-[#0B3D2E] hover:bg-[#EFF5F2] focus-visible:ring-[#0B3D2E] border border-transparent',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs font-semibold rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm font-semibold rounded-xl gap-2',
  lg: 'px-6 py-3.5 text-base font-bold rounded-xl gap-2.5',
};

const LOADING_SPINNER_VARIANTS: Record<ButtonVariant, 'white' | 'primary'> = {
  primary: 'white',
  secondary: 'primary',
  ghost: 'primary',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      type = 'button',
      disabled = false,
      isLoading = false,
      loadingLabel = 'Processando...',
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading ? true : undefined}
        className={`inline-flex items-center justify-center font-medium transition-colors select-none outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer ${
          VARIANT_STYLES[variant]
        } ${SIZE_STYLES[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <LoadingIndicator
              size={size === 'lg' ? 'md' : 'sm'}
              variant={LOADING_SPINNER_VARIANTS[variant]}
              label={loadingLabel}
              role="presentation"
            />
            <span>{loadingLabel}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
