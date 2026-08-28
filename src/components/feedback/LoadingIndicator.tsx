interface LoadingIndicatorProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'white' | 'muted';
  label?: string;
  className?: string;
  role?: string;
}

const SIZE_CLASSES = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
};

const VARIANT_CLASSES = {
  primary: 'text-[#0B3D2E]',
  white: 'text-white',
  muted: 'text-[#94A3B8]',
};

export function LoadingIndicator({
  size = 'md',
  variant = 'primary',
  label = 'Carregando...',
  className = '',
  role = 'status',
}: LoadingIndicatorProps) {
  return (
    <span
      role={role}
      className={`inline-flex items-center justify-center ${className}`}
      aria-label={label}
    >
      <svg
        className={`animate-spin motion-reduce:animate-none ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3.5"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
