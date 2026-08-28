import { KeyRound, ShieldAlert, Sparkles, UserCheck } from 'lucide-react';
import { PREVIEW_ACCOUNTS, PreviewAccountConfig } from './previewAccounts';
import { Button } from '../../components/ui/Button';

interface PreviewAccessPanelProps {
  onSelectAccount: (email: string, password: string) => void;
  disabled?: boolean;
}

export function PreviewAccessPanel({ onSelectAccount, disabled = false }: PreviewAccessPanelProps) {
  return (
    <div
      id="preview-access-panel"
      className="mt-8 pt-8 border-t border-[#E2E8F0] space-y-4"
    >
      {/* Cabeçalho do Painel de Acompanhamento */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#EFF5F2] border border-[#D1DED7]">
        <Sparkles className="w-5 h-5 text-[#0B3D2E] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-xs text-[#0F172A] leading-relaxed">
          <h2 className="font-bold text-sm text-[#0B3D2E] mb-1">
            Acessos para acompanhamento
          </h2>
          <p className="text-[#475569]">
            Estes acessos são temporários e funcionam exclusivamente durante a fase de desenvolvimento e visualização das interfaces. Eles não realizam login automático e não contêm dados operacionais.
          </p>
        </div>
      </div>

      {/* Lista dos 7 Perfis de Acompanhamento */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
        role="region"
        aria-label="Lista de perfis de acompanhamento"
      >
        {PREVIEW_ACCOUNTS.map((account: PreviewAccountConfig) => {
          const isPlatform = account.scopeType === 'platform';

          return (
            <div
              key={account.id}
              id={`preview-card-${account.roleCode}`}
              className="p-3.5 rounded-xl border border-[#E2E8F0] bg-white hover:border-[#78C89A] transition-colors flex flex-col justify-between gap-3 shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-bold text-[#0B3D2E] line-clamp-1">
                    {account.roleLabel}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                      isPlatform
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-[#EFF5F2] text-[#0B3D2E] border border-[#D1DED7]'
                    }`}
                  >
                    {isPlatform ? 'Plataforma' : 'Organização'}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-[#475569]">
                  <p className="flex items-center gap-1.5">
                    <span className="font-medium text-[#0F172A]">E-mail:</span>
                    <code className="text-[#0B3D2E] font-mono text-[11px] bg-slate-50 px-1 py-0.5 rounded">
                      {account.email}
                    </code>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <span className="font-medium text-[#0F172A]">Senha:</span>
                    <code className="text-slate-600 font-mono text-[11px] bg-slate-50 px-1 py-0.5 rounded">
                      {account.password}
                    </code>
                  </p>
                </div>
              </div>

              <Button
                id={`btn-preencher-${account.roleCode}`}
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => onSelectAccount(account.email, account.password)}
                className="w-full text-xs font-semibold text-[#0B3D2E] border-[#D1DED7] hover:bg-[#EFF5F2] hover:text-[#082F23] cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                <span>Preencher acesso</span>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export default PreviewAccessPanel;
