import { ShieldAlert, RefreshCw, LogOut } from 'lucide-react';
import { useOrganization } from '../../organization/useOrganization';
import { useAuth } from '../../auth/useAuth';
import { Logo } from '../Logo';

export function SuspendedOrganizationView() {
  const { refreshOrganization } = useOrganization();
  const { signOut } = useAuth();

  return (
    <div
      id="suspended-organization-screen"
      className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#F8FAF9] text-[#0F172A] select-none"
    >
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-sm text-center">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>

        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
          <ShieldAlert className="w-7 h-7" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-bold text-[#0F172A] tracking-tight mb-2">
          Acesso à organização indisponível
        </h1>

        <p className="text-sm text-slate-600 leading-relaxed mb-8">
          O acesso a esta organização está temporariamente suspenso. Entre em contato com a administração para mais informações.
        </p>

        <div className="flex flex-col gap-3">
          <button
            id="suspended-btn-retry"
            type="button"
            onClick={() => refreshOrganization()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold hover:bg-[#07261D] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#78C89A] outline-none min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Verificar novamente</span>
          </button>

          <button
            id="suspended-btn-signout"
            type="button"
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 outline-none min-h-[44px]"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </div>
  );
}
