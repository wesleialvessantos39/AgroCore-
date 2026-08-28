import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { Benefits } from '../components/Benefits';
import { Footer } from '../components/Footer';

export function InstitutionalPage() {
  return (
    <div id="agrocore-institutional-view" className="min-h-screen flex flex-col bg-[#F8FAF9] text-[#0F172A] w-full overflow-x-hidden">
      {/* Cabeçalho Institucional */}
      <Header />

      {/* Conteúdo Principal com ID para Skip Link e Foco Acessível */}
      <main id="main-content" tabIndex={-1} className="flex-1 w-full outline-none">
        <Hero />
        <Benefits />
      </main>

      {/* Rodapé Institucional */}
      <Footer />
    </div>
  );
}
