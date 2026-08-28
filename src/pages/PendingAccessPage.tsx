import { useState } from 'react';
import { Clock, RefreshCw, LogOut, Loader2, Building2 } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useOrganization } from '../organization/useOrganization';
import { useAuth } from '../auth/useAuth';

export function PendingAccessPage() {
  const { activeOrganization, refreshOrganization } = useOrganization();
  const { signOut } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshOrganization();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div
      id="pending-access-page"
      className="min-h-screen flex flex-col justify-center items-center p-4 bg-[#F8FAF9] text-[#0F172A] select-none"
    >
      <main className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-sm text-center">
        {/* Identidade AgroCore */}
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>

        {/* Ícone de Aguardando */}
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
          <Clock className="w-7 h-7" aria-hidden="true" />
        </div>

        {/* Título Principal Único (h1) */}
        <h1 className="text-xl font-bold text-[#0F172A] tracking-tight mb-2">
          Acesso aguardando aprovação
        </h1>

        {/* Identificação da Organização */}
        {activeOrganization && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700">
            <Building2 className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>{activeOrganization.name}</span>
          </div>
        )}

        {/* Explicação Objetiva */}
        <p className="text-sm text-slate-600 leading-relaxed mb-8">
          Seu acesso a esta organização foi solicitado e está aguardando a análise da administração responsável.
        </p>

        {/* Ações */}
        <div className="flex flex-col gap-3">
          <button
            id="pending-access-btn-refresh"
            type="button"
            disabled={isRefreshing}
            onClick={handleRefresh}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold hover:bg-[#07261D] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#78C89A] outline-none disabled:opacity-60 min-h-[44px]"
          >
            {isRefreshing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Verificando situação...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                <span>Verificar novamente</span>
              </>
            )}
          </button>

          <button
            id="pending-access-btn-signout"
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 outline-none min-h-[44px]"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Sair</span>
          </button>
        </div>
      </main>
    </div>
  );
}
