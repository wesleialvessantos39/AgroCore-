import { useState, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileTopbar } from './MobileTopbar';
import { MobileDrawer } from './MobileDrawer';
import { MainContent } from './MainContent';
import { InactivityWarningModal } from '../auth/InactivityWarningModal';
import { useSessionInactivity } from '../../auth/useSessionInactivity';
import { getRouteMetadata } from '../../routes/routeMetadata';

export function AppShell() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const { pathname } = useLocation();
  const routeMeta = getRouteMetadata(pathname);
  const currentTitle = routeMeta.announcementTitle || 'Visão geral';

  const {
    isWarningOpen,
    formattedCountdown,
    extendSession,
    signOutManual,
  } = useSessionInactivity();

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const handleOpenDrawer = () => {
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  const handleManualSignOut = async () => {
    setIsDrawerOpen(false);
    await signOutManual();
  };

  return (
    <div 
      id="agrocore-app-shell" 
      className="min-h-screen flex flex-col lg:flex-row bg-[#F8FAF9] text-[#0F172A] w-full overflow-x-hidden"
    >
      {/* 1. Sidebar para Telas Largas (Desktop) */}
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggleCollapse={handleToggleSidebar} 
      />

      {/* 2. Cabeçalho para Telas Móveis e Tablets */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <MobileTopbar
          title={currentTitle}
          isDrawerOpen={isDrawerOpen}
          onOpenDrawer={handleOpenDrawer}
          triggerRef={mobileMenuButtonRef}
        />

        {/* 3. Gaveta de Navegação Móvel Acessível */}
        <MobileDrawer
          isOpen={isDrawerOpen}
          onClose={handleCloseDrawer}
          triggerRef={mobileMenuButtonRef}
        />

        {/* 4. Topbar Contextual para Desktop */}
        <Topbar title={currentTitle} />

        {/* 5. Área de Conteúdo Principal */}
        <MainContent>
          <Outlet />
        </MainContent>
      </div>

      {/* 6. Modal de Aviso de Inatividade da Sessão Temporária */}
      <InactivityWarningModal
        isOpen={isWarningOpen}
        countdown={formattedCountdown}
        onExtend={extendSession}
        onSignOut={handleManualSignOut}
      />
    </div>
  );
}

