import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, ArrowRight, LogOut, Loader2 } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useOrganization } from '../organization/useOrganization';
import { useAuth } from '../auth/useAuth';
import { ROUTES } from '../routes/paths';

export function SelectOrganizationPage() {
  const {
    availableMemberships,
    activeOrganization,
    selectOrganization,
  } = useOrganization();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const [selectedId, setSelectedId] = useState<string>(activeOrganization?.id || '');
  const [isSelecting, setIsSelecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Se houver exatamente 1 vínculo ativo e não estiver em processo de seleção manual
  useEffect(() => {
    if (availableMemberships.length === 1 && !selectedId) {
      setSelectedId(availableMemberships[0].organizationId);
    }
  }, [availableMemberships, selectedId]);

  const handleSelect = async (orgId: string) => {
    if (isSelecting) return;
    setIsSelecting(true);
    setErrorMessage(null);

    try {
      const success = await selectOrganization(orgId);
      if (success) {
        navigate(ROUTES.SYSTEM, { replace: true });
      } else {
        setErrorMessage('Não foi possível selecionar esta organização.');
        setIsSelecting(false);
      }
    } catch {
      setErrorMessage('Erro ao selecionar organização.');
      setIsSelecting(false);
    }
  };

  const handleConfirmCurrent = async () => {
    if (!selectedId) return;
    await handleSelect(selectedId);
  };

  return (
    <div
      id="select-organization-page"
      className="min-h-screen flex flex-col justify-center items-center p-4 bg-[#F8FAF9] text-[#0F172A] select-none"
    >
      <main className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Identidade AgroCore */}
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>

        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#EFF5F2] border border-[#D1DED7] flex items-center justify-center text-[#0B3D2E]">
          <Building2 className="w-6 h-6" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-bold text-center text-[#0F172A] tracking-tight mb-2">
          Selecionar organização
        </h1>

        <p className="text-xs text-slate-600 text-center mb-6 leading-relaxed">
          Selecione a organização ativa para acompanhar as atividades do sistema.
        </p>

        {errorMessage && (
          <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 text-center" role="alert">
            {errorMessage}
          </div>
        )}

        {/* Lista de Organizações Disponíveis */}
        <div className="space-y-2.5 mb-6" role="radiogroup" aria-label="Organizações disponíveis">
          {availableMemberships.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
              Nenhuma organização vinculada disponível para seleção.
            </div>
          ) : (
            availableMemberships.map((membership) => {
              const isSelected = (selectedId || activeOrganization?.id) === membership.organizationId;
              const orgName = membership.organizationName || activeOrganization?.name || '—';

              return (
                <button
                  key={membership.organizationId}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setSelectedId(membership.organizationId);
                    setErrorMessage(null);
                  }}
                  disabled={isSelecting}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#78C89A] outline-none min-h-[44px] ${
                    isSelected
                      ? 'border-[#0B3D2E] bg-[#EFF5F2] text-[#0B3D2E] font-semibold'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Building2 className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#0B3D2E]' : 'text-slate-400'}`} aria-hidden="true" />
                    <div className="truncate">
                      <span className="block text-sm truncate">{orgName}</span>
                      <span className="block text-[11px] text-slate-500 font-normal">
                        Vínculo de acompanhamento
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-[#0B3D2E] text-white flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" aria-hidden="true" />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Botão de Confirmação */}
        <button
          id="select-org-btn-submit"
          type="button"
          disabled={!selectedId || isSelecting || availableMemberships.length === 0}
          onClick={handleConfirmCurrent}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold hover:bg-[#07261D] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#78C89A] outline-none disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {isSelecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Acessando...</span>
            </>
          ) : (
            <>
              <span>Acessar organização</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </>
          )}
        </button>

        {/* Ação Sair */}
        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <button
            id="select-org-btn-signout"
            type="button"
            onClick={() => signOut()}
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
