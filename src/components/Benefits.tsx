import { 
  FileText, 
  MapPin, 
  FolderLock, 
  CheckCircle2,
  Cpu,
  Layers,
  Building2,
  Check
} from 'lucide-react';

interface BenefitItem {
  id: string;
  icon: typeof FileText;
  title: string;
  description: string;
  details: string[];
}

export function Benefits() {
  const benefits: BenefitItem[] = [
    {
      id: 'recurso-credito-rural',
      icon: FileText,
      title: 'Estruturação de Projetos e Crédito Rural',
      description: 'Organização estruturada dos levantamentos agronômicos e documentais necessários para a formulação de projetos agropecuários.',
      details: [
        'Organização de dados cadastrais e produtivos',
        'Consistência de cronogramas físico-financeiros',
        'Redução do tempo de análise e retrabalho'
      ]
    },
    {
      id: 'recurso-consultoria-tecnica',
      icon: MapPin,
      title: 'Acompanhamento Técnico e Consultoria',
      description: 'Padronização metodológica para o registro ordenado de orientações técnicas de manejo, visitas de campo e recomendações de safra.',
      details: [
        'Registro ordenado de vistorias técnicas',
        'Histórico das recomendações por propriedade',
        'Alinhamento com diretrizes agronômicas'
      ]
    },
    {
      id: 'recurso-organizacao-documental',
      icon: FolderLock,
      title: 'Organização de Documentação Agropecuária',
      description: 'Estrutura pensada para centralizar e organizar certidões, matrículas, outorgas e cadastros de produtores rurais.',
      details: [
        'Conferência de pendências cadastrais',
        'Estruturação centralizada de arquivos',
        'Organização sistemática por cliente'
      ]
    },
    {
      id: 'recurso-eficiencia-escritorio',
      icon: Layers,
      title: 'Fluxo Operacional para o Escritório',
      description: 'Centralização das informações essenciais para substituir controles fragmentados por um fluxo unificado de atendimento.',
      details: [
        'Visão unificada das demandas em andamento',
        'Padronização de procedimentos internos',
        'Clareza no atendimento aos produtores'
      ]
    }
  ];

  return (
    <>
      {/* Seção de Recursos e Benefícios */}
      <section 
        id="agrocore-beneficios" 
        aria-labelledby="beneficios-title"
        className="py-16 sm:py-20 lg:py-24 bg-white border-b border-[#E2E8F0]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Cabeçalho da Seção */}
          <div className="max-w-3xl mx-auto text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#EFF5F2] text-[#0B3D2E] text-xs font-semibold uppercase tracking-wider mb-3">
              <Cpu className="w-3.5 h-3.5 text-[#0B3D2E]" aria-hidden="true" />
              <span>Soluções para o Setor</span>
            </div>
            <h2 
              id="beneficios-title"
              className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#0B3D2E]"
            >
              Recursos planejados para o dia a dia do consultor rural
            </h2>
            <p className="mt-4 text-base sm:text-lg text-[#334155] leading-relaxed">
              O AgroCore foi concebido para atender às demandas práticas dos escritórios de crédito e consultoria agronômica, unindo rigor técnico e organização de processos.
            </p>
          </div>

          {/* Grade de Benefícios */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {benefits.map((item) => {
              const IconComponent = item.icon;
              return (
                <div
                  key={item.id}
                  id={item.id}
                  className="flex flex-col p-6 sm:p-8 rounded-2xl bg-[#F8FAF9] border border-[#E2E8F0] hover:border-[#78C89A] transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-[#0B3D2E] text-[#78C89A] flex items-center justify-center shrink-0">
                      <IconComponent className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-[#0B3D2E]">
                      {item.title}
                    </h3>
                  </div>

                  <p className="text-sm sm:text-base text-[#334155] leading-relaxed mb-6">
                    {item.description}
                  </p>

                  <div className="mt-auto pt-4 border-t border-[#E2E8F0]/80">
                    <ul className="space-y-2.5" role="list">
                      {item.details.map((detail, idx) => (
                        <li key={idx} className="flex items-center gap-2.5 text-xs sm:text-sm text-[#334155]">
                          <CheckCircle2 className="w-4 h-4 text-[#0B3D2E] shrink-0" aria-hidden="true" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* Seção Sobre o Propósito Institucional */}
      <section 
        id="agrocore-proposito" 
        aria-labelledby="proposito-title"
        className="py-16 sm:py-20 lg:py-24 bg-[#F8FAF9] border-b border-[#E2E8F0]"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#0B3D2E] text-[#78C89A] text-xs font-semibold uppercase tracking-wider mb-3">
              <Building2 className="w-3.5 h-3.5 text-[#78C89A]" aria-hidden="true" />
              <span>Propósito Institucional</span>
            </div>
            <h2 
              id="proposito-title"
              className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0B3D2E]"
            >
              Tecnologia a serviço da consultoria e do crédito no campo
            </h2>
            <p className="mt-4 text-sm sm:text-base text-[#334155] leading-relaxed">
              O agronegócio exige precisão nas informações e seriedade na gestão documental. A missão do AgroCore é fornecer uma estrutura sólida, moderna e prática para que engenheiros agrônomos, técnicos e projetistas dediquem mais tempo ao que realmente importa: orientar o produtor rural com excelência.
            </p>
          </div>

          <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl bg-white border border-[#E2E8F0] shadow-sm flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[#EFF5F2] text-[#0B3D2E] shrink-0">
                <Check className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#0B3D2E]">Foco na Realidade do Campo</h4>
                <p className="text-xs text-[#64748B] mt-1">Concebido a partir das rotinas reais de escritórios e profissionais agrícolas.</p>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-[#E2E8F0] shadow-sm flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[#EFF5F2] text-[#0B3D2E] shrink-0">
                <Check className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#0B3D2E]">Clareza e Simplicidade</h4>
                <p className="text-xs text-[#64748B] mt-1">Interface objetiva e pensada para agilizar consultas e organização.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
