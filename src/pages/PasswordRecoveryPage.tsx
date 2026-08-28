import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, ArrowLeft, AlertCircle, Info, ShieldAlert } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui/Button';
import { ROUTES } from '../routes/paths';
import { requestAccessRecovery, isValidEmailFormat } from '../auth/recoveryService';

export function PasswordRecoveryPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfoMessage, setSuccessInfoMessage] = useState<string | null>(null);
  const [canProceedToReset, setCanProceedToReset] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);
    setSuccessInfoMessage(null);
    setCanProceedToReset(false);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setErrorMessage('Informe seu endereço de e-mail corporativo para continuar.');
      return;
    }

    if (!isValidEmailFormat(trimmedEmail)) {
      setErrorMessage('Formato de e-mail inválido. Verifique o endereço digitado.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await requestAccessRecovery(trimmedEmail);

      if (result.outcome === 'validation_error') {
        setErrorMessage(result.message);
      } else if (result.outcome === 'production_unavailable') {
        setErrorMessage(result.message);
      } else if (result.outcome === 'dev_preview_authorized') {
        setSuccessInfoMessage(result.message);
        setCanProceedToReset(result.canProceedToResetVisual);
      }
    } catch {
      setErrorMessage('Ocorreu um erro ao processar a solicitação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="agrocore-recovery-page"
      className="min-h-screen bg-[#F8FAF9] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-[#78C89A] selection:text-[#07261D]"
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Marca AgroCore */}
        <div className="flex justify-center mb-6">
          <Logo variant="on-light" size="lg" />
        </div>

        {/* Card de Solicitação de Recuperação */}
        <div
          id="recovery-card"
          className="bg-white py-8 px-6 sm:px-10 rounded-2xl border border-[#E2E8F0] shadow-sm"
        >
          <header className="mb-6 text-center">
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
              Recuperar acesso
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#475569] leading-relaxed">
              Informe seu e-mail corporativo cadastrado para orientações sobre o acesso à plataforma.
            </p>
          </header>

          {/* Região aria-live para mensagens de erro */}
          {errorMessage && (
            <div
              id="recovery-error-alert"
              role="alert"
              aria-live="polite"
              className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-xs sm:text-sm text-red-800 animate-in fade-in duration-200"
            >
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="font-medium leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Aviso neutro quando em modo de produção fechado */}
          {!import.meta.env.DEV && (
            <div
              id="production-recovery-notice"
              className="p-4 rounded-xl bg-[#EFF5F2] border border-[#D1DED7] text-xs text-[#0F172A] space-y-2 mb-6"
            >
              <div className="flex items-center gap-2 font-bold text-[#0B3D2E]">
                <ShieldAlert className="w-4 h-4 text-[#0B3D2E]" aria-hidden="true" />
                <span>Recuperação em preparação</span>
              </div>
              <p className="text-[#475569] leading-relaxed">
                A recuperação de acesso pelo sistema está temporariamente indisponível no momento. Entre em contato com a administração da sua organização.
              </p>
            </div>
          )}

          {/* Comunicação honesta e direta em desenvolvimento */}
          {successInfoMessage && (
            <div
              id="recovery-honest-notice"
              role="status"
              aria-live="polite"
              className="mb-6 p-4 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-xs sm:text-sm text-[#14532D] space-y-3 animate-in fade-in duration-200"
            >
              <div className="flex items-start gap-2.5">
                <Info className="w-5 h-5 text-[#16A34A] shrink-0 mt-0.5" aria-hidden="true" />
                <p className="font-medium leading-relaxed text-[#14532D]">
                  {successInfoMessage}
                </p>
              </div>

              {canProceedToReset && (
                <div className="pt-2 border-t border-[#DCFCE7] flex flex-col gap-2">
                  <Button
                    id="btn-go-to-reset-password"
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => navigate(ROUTES.RESET_PASSWORD)}
                    className="w-full flex items-center justify-center gap-2 cursor-pointer font-semibold min-h-[44px]"
                  >
                    <span>Visualizar atualização de senha</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Formulário de Recuperação (oculto após validação no dev para focar nas ações) */}
          {!successInfoMessage && (
            <form id="recovery-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Campo: E-mail */}
              <div>
                <label
                  htmlFor="recovery-email-input"
                  className="block text-xs font-semibold text-[#0F172A] mb-1.5"
                >
                  E-mail corporativo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <input
                    id="recovery-email-input"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="exemplo@agrocore.com.br"
                    disabled={isSubmitting || !import.meta.env.DEV}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
              </div>

              {/* Botão: Continuar */}
              <div className="pt-2">
                <Button
                  id="btn-submit-recovery"
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmitting || !import.meta.env.DEV}
                  className="w-full flex items-center justify-center gap-2 cursor-pointer font-semibold min-h-[44px]"
                >
                  {isSubmitting ? (
                    <span>Processando...</span>
                  ) : (
                    <>
                      <span>Continuar</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Link: Voltar para entrar */}
          <div className="mt-6 pt-4 border-t border-[#F1F5F9] text-center">
            <Link
              id="link-back-to-signin"
              to={ROUTES.SIGN_IN}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#0B3D2E] hover:text-[#07261D] hover:underline focus:outline-none focus:ring-2 focus:ring-[#78C89A] rounded-lg p-2 min-h-[44px] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Voltar para entrar</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PasswordRecoveryPage;
