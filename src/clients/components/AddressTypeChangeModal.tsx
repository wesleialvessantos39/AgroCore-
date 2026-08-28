import { useEffect, useRef } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../../components/ui/Button';

export interface AddressTypeChangeModalProps {
  isOpen: boolean;
  targetType: 'urban' | 'rural';
  onConfirm: () => void;
  onCancel: () => void;
}

export function AddressTypeChangeModal({
  isOpen,
  targetType,
  onConfirm,
  onCancel,
}: AddressTypeChangeModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

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
    initialFocusRef: confirmButtonRef,
  });

  if (!isOpen) return null;

  const targetLabel = targetType === 'rural' ? 'Endereço Rural' : 'Endereço Urbano';

  return (
    <div
      id="address-type-modal-portal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none"
      aria-hidden={!isOpen}
    >
      <div
        id="address-type-modal-backdrop"
        className="fixed inset-0 bg-[#07261D]/75 backdrop-blur-xs transition-opacity"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        id="address-type-modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="address-type-dialog-title"
        aria-describedby="address-type-dialog-desc"
        className="relative w-full max-w-md bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl p-6 sm:p-8 z-10 animate-in zoom-in-95 duration-200"
      >
        <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-5">
          <AlertCircle className="w-6 h-6" aria-hidden="true" />
        </div>

        <div className="text-center space-y-2">
          <h2
            id="address-type-dialog-title"
            className="text-lg sm:text-xl font-bold text-[#0F172A] tracking-tight"
          >
            Alterar tipo de endereço?
          </h2>
          <p
            id="address-type-dialog-desc"
            className="text-xs sm:text-sm text-[#475569] leading-relaxed"
          >
            Você já preencheu campos do endereço atual. Ao mudar para{' '}
            <span className="font-semibold text-slate-800">{targetLabel}</span>,
            os campos específicos incompatíveis do tipo anterior serão limpos.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row-reverse gap-3 pt-6">
          <Button
            ref={confirmButtonRef}
            id="btn-confirm-address-change"
            type="button"
            variant="primary"
            size="md"
            onClick={onConfirm}
            className="w-full sm:flex-1 flex items-center justify-center gap-2 cursor-pointer font-semibold min-h-[44px]"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>Mudar para {targetLabel}</span>
          </Button>

          <Button
            id="btn-cancel-address-change"
            type="button"
            variant="secondary"
            size="md"
            onClick={onCancel}
            className="w-full sm:w-auto flex items-center justify-center gap-2 cursor-pointer text-slate-700 min-h-[44px]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>Manter atual</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
