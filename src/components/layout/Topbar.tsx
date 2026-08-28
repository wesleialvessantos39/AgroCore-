import { useAuth } from '../../auth/useAuth';
import { useOrganization } from '../../organization/useOrganization';
import { getRoleDisplayLabel, getScopeDisplayLabel } from '../../auth/roleUtils';
import { PreviewBadge } from '../../auth/preview/PreviewBadge';
import { LogOut, Building2 } from 'lucide-react';

interface TopbarProps {
  title?: string;
}

export function Topbar({ title = 'Visão geral' }: TopbarProps) {
  const { session, signOut, isPreview, platformRole } = useAuth();
  const { activeOrganization } = useOrganization();

  const isPlatformScope = platformRole === 'platform_super_admin';
  const roleLabel = getRoleDisplayLabel(session);
  const scopeLabel = getScopeDisplayLabel(session);

  return (
    <header
      id="agrocore-desktop-topbar"
      aria-label="Barra superior do sistema"
      className="hidden lg:flex items-center justify-between h-20 px-8 bg-white border-b border-[#E2E8F0] select-none sticky top-0 z-30 shrink-0"
    >
      {/* Título Contextual da Página e Escopo/Organização */}
      <div className="flex items-center gap-3">
        <span
          className="text-xs font-semibold text-[#0B3D2E] bg-[#EFF5F2] px-2.5 py-1 rounded-md border border-[#D1DED7]"
          aria-hidden="true"
        >
          {scopeLabel}
        </span>

        {!isPlatformScope && activeOrganization && (
          <>
            <span className="text-[#94A3B8]" aria-hidden="true">/</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
              <Building2 className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>{activeOrganization.name}</span>
            </span>
          </>
        )}

        <span className="text-[#94A3B8]" aria-hidden="true">/</span>
        <h2 className="text-base font-bold text-[#0F172A] tracking-tight">
          {title}
        </h2>
      </div>

      {/* Identificador da Sessão e Ação Sair */}
      <div className="flex items-center gap-4">
        {session && (
          <div className="flex items-center gap-3">
            {isPreview && <PreviewBadge variant="light" />}
            <div className="text-right">
              <span className="block text-xs font-bold text-[#0F172A] leading-tight">
                {roleLabel}
              </span>
              <span className="block text-[11px] text-slate-500 font-mono">
                {session.user.email}
              </span>
            </div>

            <button
              id="topbar-btn-signout"
              type="button"
              onClick={() => signOut()}
              title="Encerrar sessão"
              aria-label="Encerrar sessão"
              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400 outline-none"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
