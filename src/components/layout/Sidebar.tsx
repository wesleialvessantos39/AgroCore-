import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, LogOut, User, Building2 } from 'lucide-react';
import { Logo } from '../Logo';
import { BrandMark } from '../brand/BrandMark';
import { SYSTEM_NAV_ITEMS, SYSTEM_SECONDARY_ACTIONS } from '../../config/navigation';
import { IconButton } from '../ui/IconButton';
import { useAuth } from '../../auth/useAuth';
import { useOrganization } from '../../organization/useOrganization';
import { useAuthorization } from '../../authorization/useAuthorization';
import { getRoleDisplayLabel, getScopeDisplayLabel } from '../../auth/roleUtils';
import { PreviewBadge } from '../../auth/preview/PreviewBadge';
import { Permission } from '../../types/authorization';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const { session, signOut, isPreview, platformRole } = useAuth();
  const { activeOrganization } = useOrganization();
  const { can, canAny } = useAuthorization();

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
    <aside
      id="agrocore-desktop-sidebar"
      aria-label="Navegação lateral principal"
      className={`hidden lg:flex flex-col shrink-0 bg-[#0B3D2E] text-white border-r border-[#07261D] transition-all duration-300 ease-in-out select-none ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
      style={{
        boxShadow: '2px 0 10px rgba(7, 38, 29, 0.15)',
        paddingTop: 'var(--sat, 0px)',
        paddingBottom: 'var(--sab, 0px)',
        paddingLeft: 'var(--sal, 0px)',
      }}
    >
      {/* Cabeçalho da Sidebar: Marca e Botão de Recolhimento */}
      <div
        className={`h-20 flex items-center border-b border-[#07261D] px-4 ${
          isCollapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        <Link
          to="/sistema"
          id="sidebar-brand-link"
          className="focus-visible:ring-2 focus-visible:ring-[#78C89A] rounded-lg p-1 -m-1 transition-transform cursor-pointer"
          aria-label="AgroCore — Área de Trabalho"
        >
          {isCollapsed ? (
            /* Marca reduzida para o modo recolhido */
            <BrandMark variant="on-dark" size="sm" aria-hidden={true} />
          ) : (
            <Logo variant="on-dark" size="sm" showSubtitle={false} />
          )}
        </Link>

        {/* Botão de Recolher Sidebar */}
        {!isCollapsed && (
          <IconButton
            id="sidebar-collapse-toggle-btn"
            icon={PanelLeftClose}
            aria-label="Recolher menu lateral"
            title="Recolher menu"
            aria-expanded={true}
            variant="dark"
            onClick={onToggleCollapse}
          />
        )}
      </div>

      {/* Botão de expansão isolado quando recolhido */}
      {isCollapsed && (
        <div className="flex justify-center py-2 border-b border-[#07261D]">
          <IconButton
            id="sidebar-expand-toggle-btn"
            icon={PanelLeftOpen}
            aria-label="Expandir menu lateral"
            title="Expandir menu"
            aria-expanded={false}
            variant="dark"
            onClick={onToggleCollapse}
          />
        </div>
      )}

      {/* Itens de Navegação Interna Filtrados por Permissão */}
      <nav
        aria-label="Navegação do Sistema"
        className="flex-1 py-4 px-2 space-y-1 overflow-y-auto"
      >
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.id}
              id={item.id}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all focus-visible:ring-2 focus-visible:ring-[#78C89A] outline-none cursor-pointer ${
                isActive
                  ? 'bg-[#07261D] text-[#78C89A] border border-[#78C89A]/30 shadow-sm'
                  : 'text-slate-200 hover:text-white hover:bg-[#082F23]'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-colors ${
                  isActive ? 'text-[#78C89A]' : 'text-slate-300'
                }`}
                aria-hidden="true"
              />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Seção da Conta / Sessão e Ações de Rodapé */}
      <div className="p-3 border-t border-[#07261D] space-y-2">
        {session && (
          <div
            id="sidebar-user-session-card"
            className={`rounded-xl bg-[#07261D] border border-[#78C89A]/20 transition-all ${
              isCollapsed ? 'p-2 flex flex-col items-center' : 'p-3 space-y-2'
            }`}
          >
            {isCollapsed ? (
              <div
                title={`${roleLabel} • ${scopeLabel}\n${session.user.email}`}
                className="w-8 h-8 rounded-lg bg-[#0B3D2E] text-[#78C89A] flex items-center justify-center font-bold text-xs"
              >
                <User className="w-4 h-4" aria-hidden="true" />
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-1">
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
              </>
            )}

            {/* Botão Sair Real */}
            <button
              id="sidebar-btn-signout"
              type="button"
              onClick={() => signOut()}
              title="Encerrar sessão"
              aria-label="Encerrar sessão"
              className={`w-full flex items-center gap-2 rounded-lg text-xs font-medium text-red-300 hover:text-red-100 hover:bg-red-950/40 p-1.5 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400 outline-none ${
                isCollapsed ? 'justify-center' : 'mt-1'
              }`}
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {!isCollapsed && <span>Sair</span>}
            </button>
          </div>
        )}

        {SYSTEM_SECONDARY_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.id}
              id={action.id}
              to={action.path}
              title={isCollapsed ? action.label : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-[#082F23] transition-all focus-visible:ring-2 focus-visible:ring-[#78C89A] outline-none cursor-pointer ${
                isCollapsed ? 'justify-center px-0' : ''
              }`}
            >
              <Icon className="w-4 h-4 shrink-0 text-slate-300" aria-hidden="true" />
              {!isCollapsed && <span>{action.label}</span>}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
