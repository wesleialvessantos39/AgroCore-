import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ROUTES } from '../routes/paths';
import { useAuth } from '../auth/useAuth';
import { getRoleDisplayLabel } from '../auth/roleUtils';

export function AccessDeniedPage() {
  const { session } = useAuth();
  const roleLabel = getRoleDisplayLabel(session);

  return (
    <div
      id="access-denied-page"
      className="min-h-screen flex flex-col justify-center items-center p-4 bg-[#F8FAF9] text-[#0F172A] select-none"
    >
      <main
        id="main-content"
        tabIndex={-1}
        className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-sm text-center outline-none"
      >
        {/* Identidade AgroCore */}
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>

        {/* Ícone de Acesso Restrito */}
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
          <ShieldAlert className="w-7 h-7" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-bold text-[#0F172A] tracking-tight mb-2">
          Acesso não autorizado
        </h1>

        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Seu perfil de acesso atual não possui permissão para visualizar esta página ou recurso.
        </p>

        {/* Card informativo com perfil */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 mb-6 text-left space-y-1">
          <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Perfil ativo
          </span>
          <span className="block text-sm font-bold text-[#0F172A]">
            {roleLabel}
          </span>
          <p className="text-xs text-slate-500 mt-1">
            Caso precise de permissões adicionais, solicite ao administrador responsável pela organização.
          </p>
        </div>

        {/* Botão de Retorno Seguro */}
        <div className="space-y-3">
          <Link
            id="btn-return-system"
            to={ROUTES.SYSTEM}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold hover:bg-[#07261D] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#78C89A] outline-none min-h-[44px]"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Voltar para a visão geral</span>
          </Link>

          <Link
            id="btn-return-account"
            to={ROUTES.MY_ACCOUNT}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 outline-none min-h-[44px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Consultar meus acessos</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
