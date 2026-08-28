import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, LogOut, Loader2 } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useOrganization } from '../organization/useOrganization';
import { useAuth } from '../auth/useAuth';
import { ROUTES } from '../routes/paths';

export function ConfigureOrganizationPage() {
  const [orgName, setOrgName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { configureInitialOrganization } = useOrganization();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmed = orgName.trim();
    if (!trimmed) {
      setErrorMessage('Informe o nome da organização para continuar.');
      return;
    }

    if (trimmed.length < 2) {
      setErrorMessage('O nome da organização deve ter pelo menos 2 caracteres.');
      return;
    }

    if (trimmed.length > 100) {
      setErrorMessage('O nome da organização deve ter no máximo 100 caracteres.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const success = await configureInitialOrganization(trimmed);
      if (success) {
        navigate(ROUTES.SYSTEM, { replace: true });
      } else {
        setErrorMessage('Não foi possível registrar a organização de acompanhamento. Tente novamente.');
        setIsSubmitting(false);
      }
    } catch {
      setErrorMessage('Ocorreu um erro ao definir a organização. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div
      id="configure-organization-page"
      className="min-h-screen flex flex-col justify-center items-center p-4 bg-[#F8FAF9] text-[#0F172A] select-none"
    >
      <main className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Identidade AgroCore */}
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>

        {/* Ícone de Contexto */}
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#EFF5F2] border border-[#D1DED7] flex items-center justify-center text-[#0B3D2E]">
          <Building2 className="w-6 h-6" aria-hidden="true" />
        </div>

        {/* Título Principal Único (h1) */}
        <h1 className="text-xl font-bold text-center text-[#0F172A] tracking-tight mb-2">
          Configuração inicial de acompanhamento
        </h1>

        {/* Aviso de Transparência Obrigatório */}
        <div className="p-3 mb-6 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed text-center">
          Esta configuração existe somente para acompanhamento. Nenhuma organização real foi cadastrada.
        </div>

        {/* Formulário de Configuração */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="organization-name-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Nome da organização
            </label>
            <input
              id="organization-name-input"
              type="text"
              name="organizationName"
              autoFocus
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="Ex.: Fazenda Modelo"
              disabled={isSubmitting}
              aria-required="true"
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? 'org-name-error' : undefined}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-transparent transition-all disabled:opacity-50 min-h-[44px]"
            />
            {errorMessage && (
              <p id="org-name-error" className="text-xs text-red-600 font-medium mt-1.5" role="alert">
                {errorMessage}
              </p>
            )}
          </div>

          <button
            id="configure-org-btn-submit"
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold hover:bg-[#07261D] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#78C89A] outline-none disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Atualizando visualização...</span>
              </>
            ) : (
              <>
                <span>Continuar</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        {/* Ação Sair */}
        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <button
            id="configure-org-btn-signout"
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400 rounded px-2 py-1 outline-none min-h-[44px]"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sair do sistema</span>
          </button>
        </div>
      </main>
    </div>
  );
}
