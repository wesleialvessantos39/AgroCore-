import { WifiOff } from 'lucide-react';
import { useConnectivity } from '../../hooks/useConnectivity';

export function ConnectivityNotice() {
  const { isOnline } = useConnectivity();

  if (isOnline) {
    return null;
  }

  return (
    <aside
      id="agrocore-connectivity-notice"
      role="status"
      aria-live="polite"
      className="bg-[#D97706] text-white px-4 py-2.5 shadow-md sticky top-0 z-50 transition-all select-none"
      style={{
        paddingTop: 'calc(var(--sat, 0px) + 0.625rem)',
        paddingLeft: 'max(1rem, var(--sal, 0px))',
        paddingRight: 'max(1rem, var(--sar, 0px))',
      }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2.5 text-xs sm:text-sm font-medium text-center">
        <WifiOff className="w-4 h-4 shrink-0 text-amber-100" aria-hidden="true" />
        <span>
          Você está sem conexão. Algumas informações podem não estar disponíveis.
        </span>
      </div>
    </aside>
  );
}
