import { Sparkles, RefreshCw, X } from 'lucide-react';
import { useServiceWorker } from '../../hooks/useServiceWorker';
import { Button } from '../ui/Button';

export function UpdateNotice() {
  const { hasUpdate, updateServiceWorker, dismissUpdate } = useServiceWorker();

  if (!hasUpdate) {
    return null;
  }

  return (
    <aside
      id="agrocore-update-notice"
      role="alert"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md bg-[#0B3D2E] text-white p-4 rounded-2xl border border-[#78C89A]/40 shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 select-none"
      style={{
        boxShadow: '0 10px 25px -5px rgba(7, 38, 29, 0.4), 0 8px 10px -6px rgba(7, 38, 29, 0.3)',
        marginBottom: 'var(--sab, 0px)',
        marginRight: 'var(--sar, 0px)',
        marginLeft: 'var(--sal, 0px)',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#07261D] border border-[#78C89A]/30 flex items-center justify-center shrink-0 text-[#78C89A]">
          <Sparkles className="w-5 h-5" aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <h3 className="text-sm font-bold text-white tracking-tight">
            Nova versão disponível
          </h3>
          <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
            Uma atualização do AgroCore está pronta para ser aplicada.
          </p>

          <div className="flex items-center gap-2 mt-3.5">
            <Button
              id="update-notice-apply-btn"
              variant="primary"
              size="sm"
              onClick={updateServiceWorker}
              className="bg-[#78C89A] text-[#0B3D2E] hover:bg-[#60B785] text-xs font-bold px-3 py-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Atualizar agora</span>
            </Button>

            <Button
              id="update-notice-dismiss-btn"
              variant="ghost"
              size="sm"
              onClick={dismissUpdate}
              className="text-slate-300 hover:text-white hover:bg-[#082F23] text-xs"
            >
              <span>Depois</span>
            </Button>
          </div>
        </div>

        <button
          id="update-notice-close-icon-btn"
          type="button"
          onClick={dismissUpdate}
          aria-label="Fechar aviso de atualização"
          className="text-slate-400 hover:text-white p-1 -m-1 rounded-lg transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#78C89A]"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
