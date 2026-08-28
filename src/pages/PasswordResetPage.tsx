import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, Check, X, ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui/Button';
import { ROUTES } from '../routes/paths';
import { evaluatePasswordPolicy } from '../auth/passwordPolicy';
import { isResetViewAllowed, completePasswordResetValidation } from '../auth/recoveryService';

export function PasswordResetPage() {
  const navigate = useNavigate();

  // Guarda de navegação exclusiva: só permite visualizar se houver autorização visual válida em DEV
  const isAllowed = isResetViewAllowed();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationCompletedMessage, setValidationCompletedMessage] = useState<string | null>(null);

  if (!isAllowed) {
    return <Navigate to={ROUTES.RECOVER_ACCESS} replace />;
  }

  const policyResult = evaluatePasswordPolicy(newPassword, confirmPassword);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || !policyResult.isValid) return;

    setIsSubmitting(true);

    // Conclui a validação da interface sem alterar nenhuma credencial
    completePasswordResetValidation();
    setValidationCompletedMessage('Validação da interface concluída. Nenhuma senha foi alterada neste ambiente.');
    setIsSubmitting(false);
  };

  return (
    <div
      id="agrocore-reset-password-page"
      className="min-h-screen bg-[#F8FAF9] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-[#78C89A] selection:text-[#07261D]"
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Marca AgroCore */}
        <div className="flex justify-center mb-6">
          <Logo variant="on-light" size="lg" />
        </div>

        {/* Card do Formulário de Atualização de Senha */}
        <div
          id="reset-password-card"
          className="bg-white py-8 px-6 sm:px-10 rounded-2xl border border-[#E2E8F0] shadow-sm"
        >
          <header className="mb-6 text-center">
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
              Atualização de senha
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#475569] leading-relaxed">
              Defina os novos parâmetros de segurança para o seu acesso corporativo.
            </p>
          </header>

          {/* Mensagem de Conclusão Honesta */}
          {validationCompletedMessage ? (
            <div
              id="reset-success-feedback"
              role="status"
              aria-live="polite"
              className="space-y-6 animate-in fade-in duration-200"
            >
              <div className="p-4 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs sm:text-sm text-[#14532D] space-y-1">
                  <p className="font-semibold">{validationCompletedMessage}</p>
                  <p className="text-[#15803D] leading-relaxed">
                    Você pode retornar à tela de entrada para continuar navegando na plataforma.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  id="btn-return-to-signin-after-reset"
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => navigate(ROUTES.SIGN_IN)}
                  className="w-full flex items-center justify-center gap-2 cursor-pointer font-semibold min-h-[44px]"
                >
                  <span>Voltar para entrar</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : (
            <form id="reset-password-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Campo: Nova senha */}
              <div>
                <label
                  htmlFor="new-password-input"
                  className="block text-xs font-semibold text-[#0F172A] mb-1.5"
                >
                  Nova senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <input
                    id="new-password-input"
                    name="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo de 8 caracteres"
                    disabled={isSubmitting}
                    className="w-full pl-9 pr-11 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <button
                    id="btn-toggle-new-password"
                    type="button"
                    aria-label={showNewPassword ? 'Ocultar nova senha' : 'Exibir nova senha'}
                    aria-pressed={showNewPassword}
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    disabled={isSubmitting}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer min-w-[44px] min-h-[44px] focus:outline-none focus:text-[#0B3D2E]"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {/* Campo: Confirmar nova senha */}
              <div>
                <label
                  htmlFor="confirm-password-input"
                  className="block text-xs font-semibold text-[#0F172A] mb-1.5"
                >
                  Confirmar nova senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <input
                    id="confirm-password-input"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    disabled={isSubmitting}
                    className="w-full pl-9 pr-11 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <button
                    id="btn-toggle-confirm-password"
                    type="button"
                    aria-label={showConfirmPassword ? 'Ocultar confirmação de senha' : 'Exibir confirmação de senha'}
                    aria-pressed={showConfirmPassword}
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    disabled={isSubmitting}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer min-w-[44px] min-h-[44px] focus:outline-none focus:text-[#0B3D2E]"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {/* Critérios de Validação da Senha */}
              <div
                id="password-criteria-panel"
                className="p-3.5 rounded-xl bg-[#F8FAF9] border border-[#E2E8F0] text-xs space-y-2"
                aria-label="Critérios de validação da senha"
              >
                <p className="font-semibold text-[#0F172A] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#0B3D2E]" aria-hidden="true" />
                  Requisitos de segurança:
                </p>
                <ul className="space-y-1 text-slate-600">
                  {policyResult.criteria.map((criterion) => (
                    <li
                      key={criterion.id}
                      className={`flex items-center gap-2 transition-colors ${
                        criterion.met ? 'text-[#16A34A] font-medium' : 'text-slate-500'
                      }`}
                    >
                      {criterion.met ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" aria-hidden="true" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block shrink-0" />
                      )}
                      <span>{criterion.label}</span>
                    </li>
                  ))}

                  {/* Verificação de Coincidência */}
                  {confirmPassword.length > 0 && (
                    <li
                      className={`flex items-center gap-2 pt-1 border-t border-slate-200 transition-colors ${
                        policyResult.passwordsMatch ? 'text-[#16A34A] font-medium' : 'text-red-600'
                      }`}
                    >
                      {policyResult.passwordsMatch ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" aria-hidden="true" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-red-600 shrink-0" aria-hidden="true" />
                      )}
                      <span>
                        {policyResult.passwordsMatch
                          ? 'As senhas coincidem perfeitamente'
                          : 'As senhas digitadas não coincidem'}
                      </span>
                    </li>
                  )}
                </ul>
              </div>

              {/* Botão: Validar interface */}
              <div className="pt-2">
                <Button
                  id="btn-submit-reset-password"
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmitting || !policyResult.isValid}
                  className="w-full flex items-center justify-center gap-2 cursor-pointer font-semibold min-h-[44px]"
                >
                  {isSubmitting ? (
                    <span>Validando...</span>
                  ) : (
                    <>
                      <span>Validar interface</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </div>

              {/* Ação: Cancelar e voltar para entrar */}
              <div className="mt-4 text-center">
                <Link
                  id="link-cancel-reset"
                  to={ROUTES.SIGN_IN}
                  className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#0B3D2E] hover:text-[#07261D] hover:underline focus:outline-none focus:ring-2 focus:ring-[#78C89A] rounded-lg p-2 min-h-[44px] transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Cancelar e voltar para entrar</span>
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default PasswordResetPage;
