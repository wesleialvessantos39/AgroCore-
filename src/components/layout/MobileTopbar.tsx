import { Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../Logo';
import { IconButton } from '../ui/IconButton';
import { NotificationCenter } from '../../notifications/NotificationCenter';

interface MobileTopbarProps {
  title?: string;
  isDrawerOpen: boolean;
  onOpenDrawer: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function MobileTopbar({
  title = 'Visão geral',
  isDrawerOpen,
  onOpenDrawer,
  triggerRef,
}: MobileTopbarProps) {
  return (
    <header
      id="agrocore-mobile-topbar"
      aria-label="Cabeçalho móvel do sistema"
      className="flex lg:hidden items-center gap-3 min-h-16 px-4 bg-[#0B3D2E] text-white border-b border-[#07261D] sticky top-0 z-30 select-none shrink-0"
      style={{
        boxShadow: '0 2px 8px rgba(7, 38, 29, 0.2)',
        paddingTop: 'calc(var(--sat, 0px) + 0.5rem)',
        paddingBottom: '0.5rem',
        paddingLeft: 'max(1rem, var(--sal, 0px))',
        paddingRight: 'max(1rem, var(--sar, 0px))',
      }}
    >
      <Link
        to="/sistema"
        id="mobile-topbar-brand-link"
        className="shrink-0 focus-visible:ring-2 focus-visible:ring-[#78C89A] rounded-lg p-1 -m-1 cursor-pointer"
        aria-label="AgroCore — Visão geral"
      >
        <Logo variant="on-dark" size="sm" showSubtitle={false} />
      </Link>

      <span className="min-w-0 flex-1 truncate text-center text-sm font-bold text-white tracking-tight">
        {title}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        <NotificationCenter variant="dark" />
        <IconButton
          ref={triggerRef}
          id="mobile-drawer-toggle-button"
          icon={Menu}
          aria-label="Abrir menu"
          aria-expanded={isDrawerOpen}
          aria-controls="mobile-navigation-drawer"
          variant="dark"
          onClick={onOpenDrawer}
        />
      </div>
    </header>
  );
}
