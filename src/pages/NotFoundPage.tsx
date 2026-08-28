import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { LayoutDashboard, Compass, Globe } from 'lucide-react';
import { ROUTES } from '../routes/paths';

export function NotFoundPage() {
  return (
    <div id="agrocore-not-found-view" className="min-h-screen flex flex-col bg-[#F8FAF9] text-[#0F172A] w-full overflow-x-hidden">
      {/* Cabeçalho */}
      <Header />

      {/* Conteúdo Principal */}
      <main 
        id="main-content" 
        tabIndex={-1} 
        className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32 flex flex-col items-center justify-center text-center outline-none"
      >
        {/* Ícone Indicador Visual */}
        <div 
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#EFF5F2] border border-[#D1DED7] flex items-center justify-center text-[#0B3D2E] mb-6 shadow-xs"
          aria-hidden="true"
        >
          <Compass className="w-8 h-8 sm:w-10 sm:h-10 text-[#0B3D2E]" />
        </div>

        {/* Título Principal */}
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#0B3D2E] mb-4">
          Página não encontrada
        </h1>

        {/* Mensagem Amigável */}
        <p className="text-sm sm:text-base md:text-lg text-[#334155] leading-relaxed max-w-md mx-auto mb-8">
          O endereço que você tentou acessar não está disponível ou foi movido. Verifique o link digitado ou acesse as áreas da plataforma abaixo.
        </p>

        {/* Ações de Navegação */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md">
          <Link
            id="not-found-system-button"
            to={ROUTES.SYSTEM}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#0B3D2E] text-white font-bold text-sm sm:text-base hover:bg-[#082F23] transition-colors shadow-xs focus-visible:ring-2 focus-visible:ring-[#78C89A] cursor-pointer"
          >
            <LayoutDashboard className="w-4 h-4 text-[#78C89A]" aria-hidden="true" />
            <span>Ir para a Visão geral</span>
          </Link>

          <Link
            id="not-found-presentation-button"
            to={ROUTES.PRESENTATION}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white border border-[#E2E8F0] text-[#0B3D2E] font-semibold text-sm sm:text-base hover:bg-[#EFF5F2] transition-colors shadow-xs focus-visible:ring-2 focus-visible:ring-[#0B3D2E] cursor-pointer"
          >
            <Globe className="w-4 h-4 text-[#0B3D2E]" aria-hidden="true" />
            <span>Conhecer o AgroCore</span>
          </Link>
        </div>
      </main>

      {/* Rodapé */}
      <Footer />
    </div>
  );
}
export default NotFoundPage;
