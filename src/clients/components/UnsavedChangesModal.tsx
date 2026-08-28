import { useEffect, useRef } from 'react';
import { AlertTriangle, ArrowLeft, X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../../components/ui/Button';

export interface UnsavedChangesModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function UnsavedChangesModal({
  isOpen,
  onConfirm,
  onCancel,
}: UnsavedChangesModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stayButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  useFocusTrap({
    containerRef: dialogRef,
    isActive: isOpen,
    initialFocusRef: stayButtonRef,
  });

  if (!isOpen) return null;

  return (
    <div
      id="unsaved-changes-portal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none"
      aria-hidden={!isOpen}
    >
      <div
        id="unsaved-changes-backdrop"
        className="fixed inset-0 bg-[#07261D]/75 backdrop-blur-xs transition-opacity"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        id="unsaved-changes-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-dialog-title"
        aria-describedby="unsaved-dialog-desc"
        className="relative w-full max-w-md bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl p-6 sm:p-8 z-10 animate-in zoom-in-95 duration-200"
      >
        <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-5">
          <AlertTriangle className="w-6 h-6" aria-hidden="true" />
        </div>

        <div className="text-center space-y-2">
          <h2
            id="unsaved-dialog-title"
            className="text-lg sm:text-xl font-bold text-[#0F172A] tracking-tight"
          >
            Alterações não salvas
          </h2>
          <p
            id="unsaved-dialog-desc"
            className="text-xs sm:text-sm text-[#475569] leading-relaxed"
          >
            Você possui dados preenchidos no formulário. Se você sair agora, todas as informações não salvas serão descartadas.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row-reverse gap-3 pt-6">
          <Button
            ref={stayButtonRef}
            id="btn-stay-on-form"
            type="button"
            variant="primary"
            size="md"
            onClick={onCancel}
            className="w-full sm:flex-1 flex items-center justify-center gap-2 cursor-pointer font-semibold min-h-[44px]"
          >
            <span>Continuar editando</span>
          </Button>

          <Button
            id="btn-discard-changes"
            type="button"
            variant="secondary"
            size="md"
            onClick={onConfirm}
            className="w-full sm:w-auto flex items-center justify-center gap-2 cursor-pointer text-red-700 hover:bg-red-50 border-red-200 min-h-[44px]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>Descartar e sair</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
