import { Logo } from '../Logo';
import { LoadingIndicator } from './LoadingIndicator';

interface RouteLoadingScreenProps {
  label?: string;
}

export function RouteLoadingScreen({ label = 'Carregando página' }: RouteLoadingScreenProps) {
  return (
    <div
      id="agrocore-route-loading-screen"
      role="status"
      aria-live="polite"
      className="min-h-[400px] w-full flex-1 flex flex-col items-center justify-center p-8 text-center select-none"
    >
      <div className="mb-6 opacity-90">
        <Logo variant="on-light" size="md" />
      </div>

      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
        <LoadingIndicator size="sm" variant="primary" label={label} role="presentation" />
        <span className="text-sm font-semibold text-[#0B3D2E] tracking-tight">
          {label}
        </span>
      </div>
    </div>
  );
}
