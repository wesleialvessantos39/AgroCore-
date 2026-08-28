import { useEffect, useRef } from 'react';
import { Clock, LogOut, ArrowRight } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';

export interface InactivityWarningModalProps {
  isOpen: boolean;
  countdown: string;
  onExtend: () => void;
  onSignOut: () => void;
}

export function InactivityWarningModal({
  isOpen,
  countdown,
  onExtend,
  onSignOut,
}: InactivityWarningModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const initialAnnouncedRef = useRef<boolean>(false);

  // 1. Bloqueio de rolagem do body enquanto o modal estiver visível
  useEffect(() => {
    if (!isOpen) {
      initialAnnouncedRef.current = false;
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // 2. Intercepta tecla Escape para impedir fechamento involuntário sem decisão
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Não fecha ao pressionar Escape; exige escolha deliberada do usuário
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // 3. Contenção estrita de foco acessível
  useFocusTrap({
    containerRef: dialogRef,
    isActive: isOpen,
    initialFocusRef: continueButtonRef,
  });

  if (!isOpen) return null;

  return (
    <div
      id="inactivity-warning-portal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none"
      aria-hidden={!isOpen}
    >
      {/* Backdrop não clicável para fechamento */}
      <div
        id="inactivity-warning-backdrop"
        className="fixed inset-0 bg-[#07261D]/75 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        aria-hidden="true"
      />

      {/* Caixa do Diálogo Modal Acessível */}
      <div
        ref={dialogRef}
        id="inactivity-warning-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="inactivity-dialog-title"
        aria-describedby="inactivity-dialog-desc"
        className="relative w-full max-w-md bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl p-6 sm:p-8 z-10 animate-in zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        {/* Anúncio pontual para leitores de tela na abertura do modal (não repete a cada segundo) */}
        <div className="sr-only" role="status" aria-live="assertive">
          Aviso: Sua sessão temporária de acompanhamento está prestes a encerrar por inatividade.
        </div>

        {/* Ícone de Destaque */}
        <div className="mx-auto w-12 h-12 rounded-2xl bg-[#EFF5F2] border border-[#D1DED7] flex items-center justify-center text-[#0B3D2E] mb-5">
          <Clock className="w-6 h-6" aria-hidden="true" />
        </div>

        {/* Cabeçalho do Diálogo */}
        <div className="text-center space-y-2">
          <h2
            id="inactivity-dialog-title"
            className="text-lg sm:text-xl font-bold text-[#0F172A] tracking-tight"
          >
            Sua sessão está prestes a encerrar
          </h2>
          <p
            id="inactivity-dialog-desc"
            className="text-xs sm:text-sm text-[#475569] leading-relaxed"
          >
            Por inatividade, esta sessão temporária de acompanhamento será encerrada em:
          </p>
        </div>

        {/* Painel do Contador Visual em MM:SS */}
        <div
          id="inactivity-countdown-display"
          aria-label={`Tempo restante: ${countdown}`}
          className="my-6 py-4 px-6 rounded-xl bg-[#F8FAF9] border border-[#CBD5E1] flex items-center justify-center"
        >
          <span className="text-3xl sm:text-4xl font-extrabold font-mono text-[#0B3D2E] tracking-wider">
            {countdown}
          </span>
        </div>

        {/* Ações do Diálogo */}
        <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
          <Button
            ref={continueButtonRef}
            id="btn-inactivity-extend"
            type="button"
            variant="primary"
            size="md"
            onClick={onExtend}
            className="w-full sm:flex-1 flex items-center justify-center gap-2 cursor-pointer font-semibold min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#78C89A]"
          >
            <span>Continuar sessão</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Button>

          <Button
            id="btn-inactivity-signout"
            type="button"
            variant="secondary"
            size="md"
            onClick={onSignOut}
            className="w-full sm:w-auto flex items-center justify-center gap-2 cursor-pointer text-slate-700 hover:text-red-700 hover:bg-red-50 hover:border-red-200 border-slate-300 min-h-[44px] focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <LogOut className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
            <span>Sair agora</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
