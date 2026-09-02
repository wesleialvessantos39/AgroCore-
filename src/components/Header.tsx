import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Logo } from './Logo';
import { ROUTES } from '../routes/paths';

export function Header() {
  const location = useLocation();
  const isPresentationPage = location.pathname === ROUTES.PRESENTATION || location.pathname === ROUTES.HOME;

  return (
    <header 
      id="agrocore-header" 
      className="w-full bg-[#0B3D2E] text-white border-b border-[#07261D] sticky top-0 z-40"
      style={{
        boxShadow: '0 2px 10px rgba(7, 38, 29, 0.25)',
        paddingTop: 'var(--sat, 0px)',
        paddingLeft: 'var(--sal, 0px)',
        paddingRight: 'var(--sar, 0px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-4">
        {/* Marca AgroCore com Link para a Página Principal */}
        <Link 
          to={ROUTES.HOME} 
          id="header-brand-link"
          className="focus-visible:ring-2 focus-visible:ring-[#78C89A] rounded-lg p-1 -m-1 transition-transform shrink-0 cursor-pointer"
          aria-label="AgroCore — Página Principal"
        >
          <div className="hidden sm:block">
            <Logo variant="on-dark" size="md" />
          </div>
          <div className="sm:hidden">
            <Logo variant="on-dark" size="sm" showSubtitle={false} />
          </div>
        </Link>

        {/* Navegação Institucional e Acesso ao Sistema */}
        <nav aria-label="Navegação Principal" className="flex items-center gap-2 sm:gap-6">
          <a 
            href={isPresentationPage ? "#agrocore-beneficios" : `${ROUTES.HOME}#agrocore-beneficios`}
            className="text-xs sm:text-sm font-medium text-slate-200 hover:text-[#78C89A] transition-colors focus-visible:text-[#78C89A] px-1 py-1"
          >
            Recursos
          </a>
          <a 
            href={isPresentationPage ? "#agrocore-proposito" : `${ROUTES.HOME}#agrocore-proposito`}
            className="hidden md:inline-block text-xs sm:text-sm font-medium text-slate-200 hover:text-[#78C89A] transition-colors focus-visible:text-[#78C89A] px-1 py-1"
          >
            Propósito
          </a>
          <Link
            id="header-access-system-link"
            to={ROUTES.SIGN_IN}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-[#78C89A] text-[#0B3D2E] text-xs sm:text-sm font-bold hover:bg-[#60B785] transition-colors shadow-xs focus-visible:ring-2 focus-visible:ring-white shrink-0 cursor-pointer"
          >
            <span>Acessar sistema</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
