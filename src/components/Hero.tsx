import { Link } from 'react-router-dom';
import { FileCheck, Sprout, Layers, ArrowRight, ArrowDown } from 'lucide-react';
import { ROUTES } from '../routes/paths';

export function Hero() {
  return (
    <section 
      id="agrocore-hero" 
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-gradient-to-b from-[#0B3D2E] via-[#0B3D2E] to-[#082F23] text-white pt-12 pb-16 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24"
    >
      {/* Padrão geométrico de fundo vetorial sutil */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-10"
        aria-hidden="true"
        style={{
          backgroundImage: `radial-gradient(#78C89A 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          
          {/* Badge institucional */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#07261D] border border-[#78C89A]/40 text-[#78C89A] text-xs sm:text-sm font-medium mb-6 shadow-sm">
            <Sprout className="w-4 h-4 shrink-0 text-[#78C89A]" aria-hidden="true" />
            <span>Plataforma para Escritórios de Crédito e Consultoria Rural</span>
          </div>

          {/* Título Principal */}
          <h1 
            id="hero-title"
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight sm:leading-tight mb-6"
          >
            Gestão estruturada para operações de{' '}
            <span className="text-[#78C89A]">crédito</span> e{' '}
            <span className="text-[#78C89A]">consultoria rural</span>
          </h1>

          {/* Descrição institucional */}
          <p className="text-base sm:text-lg md:text-xl text-slate-200 leading-relaxed font-normal mb-8 max-w-2xl mx-auto">
            Projetado para apoiar o fluxo de elaboração técnica de propostas agropecuárias, o acompanhamento de visitas a campo e o relacionamento com produtores rurais.
          </p>

          {/* Ações Institucionais e Acesso ao Sistema */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-12">
            <Link
              id="hero-access-system-cta"
              to={ROUTES.SIGN_IN}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#78C89A] text-[#0B3D2E] font-bold text-sm sm:text-base hover:bg-[#60B785] transition-all shadow-md focus-visible:ring-2 focus-visible:ring-white w-full sm:w-auto cursor-pointer"
            >
              <span>Acessar sistema</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>

            <a
              id="cta-conhecer-recursos"
              href="#agrocore-beneficios"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#07261D] border border-[#78C89A]/40 text-slate-200 font-semibold text-sm sm:text-base hover:bg-[#082F23] hover:text-white transition-all w-full sm:w-auto"
            >
              <span>Conheça os recursos</span>
              <ArrowDown className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>

          {/* Pilares conceituais do sistema */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#07261D]/80 border border-[#78C89A]/20">
              <FileCheck className="w-5 h-5 text-[#78C89A] shrink-0" aria-hidden="true" />
              <span className="text-xs sm:text-sm font-medium text-slate-200">Padronização Técnica</span>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#07261D]/80 border border-[#78C89A]/20">
              <Sprout className="w-5 h-5 text-[#78C89A] shrink-0" aria-hidden="true" />
              <span className="text-xs sm:text-sm font-medium text-slate-200">Orientação Agronômica</span>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[#07261D]/80 border border-[#78C89A]/20">
              <Layers className="w-5 h-5 text-[#78C89A] shrink-0" aria-hidden="true" />
              <span className="text-xs sm:text-sm font-medium text-slate-200">Organização Operacional</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
