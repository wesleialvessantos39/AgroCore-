import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, AlertCircle, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui/Button';
import { ROUTES } from '../routes/paths';
import { getSafeRedirectUrl } from '../routes/safeNavigation';

// Carregamento dinâmico do painel de desenvolvimento isolado para garantir zero vazamento em produção
const PreviewAccessPanel = import.meta.env.DEV
  ? lazy(() => import(/* @vite-ignore */ '../auth/preview/PreviewAccessPanel.tsx'))
  : null;

export function SignInPage() {
  const { signIn, isAuthenticated, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inactivityNotice, setInactivityNotice] = useState<string | null>(() => {
    const state = location.state as { inactivityExpired?: boolean } | null;
    if (state?.inactivityExpired) {
      return 'Sua sessão temporária de acompanhamento foi encerrada por inatividade.';
    }
    return null;
  });

  // Limpa o state de navegação da história para evitar que reload reexiba a mensagem permanentemente
  useEffect(() => {
    if (location.state && (location.state as { inactivityExpired?: boolean }).inactivityExpired) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Redireciona se o usuário já estiver autenticado
  useEffect(() => {
    if (status !== 'initializing' && isAuthenticated) {
      const rawFrom = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      const safeDestination = getSafeRedirectUrl(rawFrom, ROUTES.SYSTEM);
      navigate(safeDestination, { replace: true });
    }
  }, [isAuthenticated, status, navigate, location]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);
    setInactivityNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Por favor, informe seu e-mail.');
      return;
    }

    if (!password) {
      setErrorMessage('Por favor, informe sua senha.');
      return;
    }

    setIsSubmitting(true);

    try {
      await signIn({ email: trimmedEmail, password });
      const rawFrom = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      const safeDestination = getSafeRedirectUrl(rawFrom, ROUTES.SYSTEM);
      navigate(safeDestination, { replace: true });
    } catch {
      setErrorMessage('E-mail ou senha inválidos');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFillCredentials = (fillEmail: string, fillPassword: string) => {
    setEmail(fillEmail);
    setPassword(fillPassword);
    setErrorMessage(null);
    setInactivityNotice(null);
  };

  return (
    <div
      id="agrocore-signin-page"
      className="min-h-screen bg-[#F8FAF9] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-[#78C89A] selection:text-[#07261D]"
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Marca AgroCore */}
        <div className="flex justify-center mb-6">
          <Logo variant="on-light" size="lg" />
        </div>

        {/* Card do Formulário de Entrada */}
        <div
          id="signin-card"
          className="bg-white py-8 px-6 sm:px-10 rounded-2xl border border-[#E2E8F0] shadow-sm"
        >
          <header className="mb-6 text-center">
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
              Acessar o AgroCore
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#475569]">
              Plataforma de gestão e crédito rural
            </p>
          </header>

          {/* Aviso Acessível de Encerramento por Inatividade */}
          {inactivityNotice && (
            <div
              id="inactivity-expiration-alert"
              role="status"
              aria-live="polite"
              className="mb-5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3 text-xs sm:text-sm text-amber-900 animate-in fade-in duration-200"
            >
              <Clock className="w-5 h-5 text-amber-700 shrink-0" aria-hidden="true" />
              <span className="font-medium">{inactivityNotice}</span>
            </div>
          )}

          {/* Mensagem de Erro Acessível */}
          {errorMessage && (
            <div
              id="signin-error-alert"
              role="alert"
              aria-live="polite"
              className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3 text-xs sm:text-sm text-red-800 animate-in fade-in duration-200"
            >
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Aviso neutro quando em modo de produção fechado */}
          {!import.meta.env.DEV && (
            <div
              id="production-unavailable-notice"
              className="p-4 rounded-xl bg-[#EFF5F2] border border-[#D1DED7] text-xs text-[#0F172A] space-y-2 mb-6"
            >
              <div className="flex items-center gap-2 font-bold text-[#0B3D2E]">
                <ShieldCheck className="w-4 h-4 text-[#0B3D2E]" aria-hidden="true" />
                <span>Acesso em preparação</span>
              </div>
              <p className="text-[#475569] leading-relaxed">
                O acesso direto à plataforma será liberado com a integração da autenticação oficial do AgroCore.
              </p>
            </div>
          )}

          {/* Formulário de Acesso */}
          <form id="signin-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Campo: E-mail */}
            <div>
              <label
                htmlFor="signin-email-input"
                className="block text-xs font-semibold text-[#0F172A] mb-1.5"
              >
                E-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" aria-hidden="true" />
                </div>
                <input
                  id="signin-email-input"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                    if (inactivityNotice) setInactivityNotice(null);
                  }}
                  placeholder="exemplo@agrocore.com.br"
                  disabled={isSubmitting || !import.meta.env.DEV}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>
            </div>

            {/* Campo: Senha */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="signin-password-input"
                  className="block text-xs font-semibold text-[#0F172A]"
                >
                  Senha
                </label>
                <Link
                  id="link-forgot-password"
                  to={ROUTES.RECOVER_ACCESS}
                  className="text-xs font-medium text-[#0B3D2E] hover:text-[#07261D] hover:underline focus:outline-none focus:ring-2 focus:ring-[#78C89A] rounded px-1.5 py-1 min-h-[44px] inline-flex items-center"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" aria-hidden="true" />
                </div>
                <input
                  id="signin-password-input"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                    if (inactivityNotice) setInactivityNotice(null);
                  }}
                  placeholder="••••••••"
                  disabled={isSubmitting || !import.meta.env.DEV}
                  className="w-full pl-9 pr-11 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors disabled:bg-slate-100 disabled:text-slate-500"
                />
                <button
                  id="btn-toggle-password-visibility"
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isSubmitting || !import.meta.env.DEV}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer min-w-[44px] min-h-[44px] focus:outline-none focus:text-[#0B3D2E]"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Botão: Entrar */}
            <div className="pt-2">
              <Button
                id="btn-submit-signin"
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting || !import.meta.env.DEV}
                className="w-full flex items-center justify-center gap-2 cursor-pointer font-semibold min-h-[44px]"
              >
                {isSubmitting ? (
                  <span>Entrando...</span>
                ) : (
                  <>
                    <span>Entrar</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Painel de Perfis Temporários (somente em desenvolvimento) */}
          {import.meta.env.DEV && PreviewAccessPanel && (
            <Suspense fallback={<div className="py-4 text-center text-xs text-slate-400">Carregando acessos...</div>}>
              <PreviewAccessPanel
                onSelectAccount={handleFillCredentials}
                disabled={isSubmitting}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
export default SignInPage;
