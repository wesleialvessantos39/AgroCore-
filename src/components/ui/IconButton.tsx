import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type IconButtonVariant = 'dark' | 'surface' | 'ghost';
export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  icon?: LucideIcon;
  children?: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const VARIANT_STYLES: Record<IconButtonVariant, string> = {
  dark:
    'text-slate-200 hover:text-white hover:bg-[#07261D] focus-visible:ring-[#78C89A]',
  surface:
    'text-[#0B3D2E] hover:bg-[#EFF5F2] focus-visible:ring-[#0B3D2E] border border-[#E2E8F0] bg-white shadow-2xs',
  ghost:
    'text-[#475569] hover:text-[#0B3D2E] hover:bg-[#EFF5F2] focus-visible:ring-[#0B3D2E]',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      'aria-label': ariaLabel,
      icon: Icon,
      children,
      variant = 'dark',
      type = 'button',
      disabled = false,
      title,
      className = '',
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        className={`min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl transition-colors select-none outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
          VARIANT_STYLES[variant]
        } ${className}`}
        {...props}
      >
        {Icon ? <Icon className="w-5 h-5 shrink-0" aria-hidden="true" /> : children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
