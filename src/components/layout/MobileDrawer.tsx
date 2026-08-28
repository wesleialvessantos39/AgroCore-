import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, LogOut, Building2 } from 'lucide-react';
import { Logo } from '../Logo';
import { SYSTEM_NAV_ITEMS, SYSTEM_SECONDARY_ACTIONS } from '../../config/navigation';
import { IconButton } from '../ui/IconButton';
import { useAuth } from '../../auth/useAuth';
import { useOrganization } from '../../organization/useOrganization';
import { useAuthorization } from '../../authorization/useAuthorization';
import { getRoleDisplayLabel, getScopeDisplayLabel } from '../../auth/roleUtils';
import { PreviewBadge } from '../../auth/preview/PreviewBadge';
import { Permission } from '../../types/authorization';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function MobileDrawer({ isOpen, onClose, triggerRef }: MobileDrawerProps) {
  const location = useLocation();
  const { session, signOut, isPreview, platformRole } = useAuth();
  const { activeOrganization } = useOrganization();
  const { can, canAny } = useAuthorization();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Foco acessível no fechamento e abertura
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    } else if (triggerRef?.current) {
      triggerRef.current.focus();
    }
  }, [isOpen, triggerRef]);

  if (!isOpen) return null;

  const isPlatformScope = platformRole === 'platform_super_admin';
  const roleLabel = getRoleDisplayLabel(session);
  const scopeLabel = getScopeDisplayLabel(session);

  const visibleNavItems = SYSTEM_NAV_ITEMS.filter((item) => {
    if (!item.requiredPermission) return true;
    if (Array.isArray(item.requiredPermission)) {
      return canAny(item.requiredPermission);
    }
    return can(item.requiredPermission as Permission);
  });

  return (
    <div
      id="agrocore-mobile-drawer-root"
      className="fixed inset-0 z-50 lg:hidden flex"
      role="dialog"
      aria-modal="true"
      aria-label="Menu de Navegação Principal"
    >
      {/* Backdrop com desfoque e escurecimento */}
      <div
        id="mobile-drawer-backdrop"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel do Drawer */}
      <div
        id="mobile-drawer-panel"
        className="relative w-4/5 max-w-xs bg-[#0B3D2E] text-white flex flex-col h-full z-10 shadow-2xl border-r border-[#07261D]"
        style={{
          paddingTop: 'var(--sat, 0px)',
          paddingBottom: 'var(--sab, 0px)',
          paddingLeft: 'var(--sal, 0px)',
        }}
      >
        {/* Topo do Drawer */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#07261D]">
          <Logo variant="on-dark" size="sm" showSubtitle={false} />
          <IconButton
            id="mobile-drawer-close-btn"
            ref={closeButtonRef}
            icon={X}
            aria-label="Fechar menu de navegação"
            title="Fechar menu"
            variant="dark"
            onClick={onClose}
          />
        </div>

        {/* Links de Navegação Filtrados por Permissão */}
        <nav
          aria-label="Navegação móvel do sistema"
          className="flex-1 py-4 px-3 space-y-1 overflow-y-auto"
        >
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.id}
                id={`drawer-${item.id}`}
                to={item.path}
                onClick={onClose}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl font-semibold text-sm transition-all focus-visible:ring-2 focus-visible:ring-[#78C89A] outline-none cursor-pointer ${
                  isActive
                    ? 'bg-[#07261D] text-[#78C89A] border border-[#78C89A]/30 shadow-sm'
                    : 'text-slate-200 hover:text-white hover:bg-[#082F23]'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 transition-colors ${
                    isActive ? 'text-[#78C89A]' : 'text-slate-300'
                  }`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Rodapé da Conta & Ações */}
        <div className="p-4 border-t border-[#07261D] space-y-3">
          {session && (
            <div
              id="mobile-drawer-user-card"
              className="p-3 rounded-xl bg-[#07261D] border border-[#78C89A]/20 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">
                    {roleLabel}
                  </p>
                  <p className="text-[11px] text-slate-300 truncate">
                    {scopeLabel}
                  </p>
                  {!isPlatformScope && activeOrganization && (
                    <p className="text-[11px] text-[#78C89A] font-semibold flex items-center gap-1 truncate mt-0.5">
                      <Building2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{activeOrganization.name}</span>
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                    {session.user.email}
                  </p>
                </div>
              </div>

              {isPreview && <PreviewBadge variant="dark" />}

              {/* Botão Sair Real */}
              <button
                id="drawer-btn-signout"
                type="button"
                onClick={() => {
                  onClose();
                  signOut();
                }}
                className="w-full flex items-center gap-2 rounded-lg text-xs font-medium text-red-300 hover:text-red-100 hover:bg-red-950/40 p-1.5 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400 outline-none mt-1"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Encerrar sessão</span>
              </button>
            </div>
          )}

          {SYSTEM_SECONDARY_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.id}
                id={`drawer-${action.id}`}
                to={action.path}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-[#082F23] transition-all focus-visible:ring-2 focus-visible:ring-[#78C89A] outline-none cursor-pointer"
              >
                <Icon className="w-4 h-4 shrink-0 text-slate-300" aria-hidden="true" />
                <span>{action.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
