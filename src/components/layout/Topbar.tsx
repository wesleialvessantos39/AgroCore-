import { useAuth } from '../../auth/useAuth';
import { useOrganization } from '../../organization/useOrganization';
import { getRoleDisplayLabel, getScopeDisplayLabel } from '../../auth/roleUtils';
import { PreviewBadge } from '../../auth/preview/PreviewBadge';
import { NotificationCenter } from '../../notifications/NotificationCenter';
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
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="text-xs font-semibold text-[#0B3D2E] bg-[#EFF5F2] px-2.5 py-1 rounded-md border border-[#D1DED7]"
          aria-hidden="true"
        >
          {scopeLabel}
        </span>

        {!isPlatformScope && activeOrganization && (
          <>
            <span className="text-[#0B3D2E]/35" aria-hidden="true">/</span>
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-[#0B3D2E]/15 bg-[#EFF5F2] px-2.5 py-1 text-xs font-semibold text-[#0B3D2E]">
              <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{activeOrganization.name}</span>
            </span>
          </>
        )}

        <span className="text-[#0B3D2E]/35" aria-hidden="true">/</span>
        <h2 className="truncate text-base font-bold text-[#0F172A] tracking-tight">
          {title}
        </h2>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <NotificationCenter variant="light" />

        {session && (
          <div className="flex items-center gap-3">
            {isPreview && <PreviewBadge variant="light" />}
            <div className="text-right">
              <span className="block text-xs font-bold text-[#0F172A] leading-tight">
                {roleLabel}
              </span>
              <span className="block max-w-[220px] truncate text-[11px] font-mono text-[#0B3D2E]/60">
                {session.user.email}
              </span>
            </div>

            <button
              id="topbar-btn-signout"
              type="button"
              onClick={() => signOut()}
              title="Encerrar sessão"
              aria-label="Encerrar sessão"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#0B3D2E]/15 bg-white text-[#0B3D2E] transition-colors hover:bg-[#78C89A]/10 focus-visible:ring-2 focus-visible:ring-[#78C89A] outline-none"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
