import { Link, useLocation } from 'react-router-dom';
import { Logo } from './Logo';
import { ROUTES } from '../routes/paths';

export function Footer() {
  const currentYear = new Date().getFullYear();
  const location = useLocation();
  const isPresentationPage = location.pathname === ROUTES.PRESENTATION;

  return (
    <footer 
      id="agrocore-footer" 
      className="bg-[#07261D] text-white border-t border-[#0B3D2E] py-12 sm:py-16 select-none"
      style={{
        paddingBottom: 'calc(3rem + var(--sab, 0px))',
        paddingLeft: 'var(--sal, 0px)',
        paddingRight: 'var(--sar, 0px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-10 border-b border-white/10">
          {/* Identidade no Rodapé */}
          <div className="max-w-md">
            <Link 
              to={ROUTES.PRESENTATION} 
              id="footer-brand-link" 
              className="inline-block focus-visible:ring-2 focus-visible:ring-[#78C89A] rounded-lg p-1 -m-1 cursor-pointer"
              aria-label="AgroCore — Apresentação Institucional"
            >
              <Logo variant="on-dark" size="md" />
            </Link>
            <p className="mt-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
              Plataforma dedicada a escritórios de consultoria agronômica, elaboração de projetos e intermediação de crédito rural.
            </p>
          </div>

          {/* Links e Navegação do Rodapé */}
          <nav aria-label="Navegação do Rodapé" className="flex flex-wrap items-center gap-6 text-xs text-slate-300">
            <Link 
              to={ROUTES.PRESENTATION} 
              className="hover:text-[#78C89A] transition-colors focus-visible:text-[#78C89A] cursor-pointer"
            >
              Início
            </Link>
            <a 
              href={isPresentationPage ? "#agrocore-beneficios" : `${ROUTES.PRESENTATION}#agrocore-beneficios`}
              className="hover:text-[#78C89A] transition-colors focus-visible:text-[#78C89A]"
            >
              Recursos
            </a>
            <a 
              href={isPresentationPage ? "#agrocore-proposito" : `${ROUTES.PRESENTATION}#agrocore-proposito`}
              className="hover:text-[#78C89A] transition-colors focus-visible:text-[#78C89A]"
            >
              Propósito
            </a>
            <Link 
              to={ROUTES.SYSTEM} 
              id="footer-access-system-link"
              className="text-[#78C89A] font-semibold hover:text-[#60B785] transition-colors focus-visible:text-[#60B785] cursor-pointer"
            >
              Acessar sistema
            </Link>
          </nav>
        </div>

        {/* Linha de Copyright */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>
            &copy; {currentYear} AgroCore. Todos os direitos reservados.
          </p>
          <p className="text-slate-400">
            Crédito e Consultoria Rural
          </p>
        </div>

      </div>
    </footer>
  );
}
