import { Eye, RotateCcw, Building2, CheckCircle2, Clock, ShieldAlert, AlertCircle } from 'lucide-react';
import { useOrganization } from '../../organization/useOrganization';
import { OrganizationContextStatus } from '../../types/organization';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes/paths';

export function OrganizationStatePreviewPanel() {
  // Desaparece integralmente se não estiver em ambiente DEV
  if (!import.meta.env.DEV) {
    return null;
  }

  const { status, previewStateOverride, setPreviewStateOverride } = useOrganization();

  if (!setPreviewStateOverride) return null;

  const states: { id: OrganizationContextStatus; label: string; icon: typeof Eye; desc: string }[] = [
    {
      id: 'active',
      label: 'Ativa',
      icon: CheckCircle2,
      desc: 'Contexto organizacional normal e ativo',
    },
    {
      id: 'setupRequired',
      label: 'Configuração exigida',
      icon: Building2,
      desc: 'Redireciona para /configurar-empresa',
    },
    {
      id: 'accessPending',
      label: 'Acesso pendente',
      icon: Clock,
      desc: 'Redireciona para /acesso-pendente',
    },
    {
      id: 'suspended',
      label: 'Suspensa',
      icon: ShieldAlert,
      desc: 'Apresenta tela de organização suspensa',
    },
    {
      id: 'unavailable',
      label: 'Indisponível',
      icon: AlertCircle,
      desc: 'Apresenta tela neutra de indisponibilidade',
    },
  ];

  return (
    <div
      id="organization-state-preview-panel"
      className="p-4 sm:p-5 rounded-2xl bg-amber-50/60 border border-amber-200/80 text-[#0F172A] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
        <div className="flex items-center gap-2 text-amber-800">
          <Eye className="w-4 h-4 shrink-0 text-amber-700" aria-hidden="true" />
          <h3 className="text-xs font-bold uppercase tracking-wider">
            Acompanhamento de telas (Modo de desenvolvimento)
          </h3>
        </div>

        {previewStateOverride && (
          <button
            type="button"
            onClick={() => setPreviewStateOverride(null)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-amber-900 bg-amber-100/80 hover:bg-amber-200 rounded-lg transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 outline-none"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>Restaurar estado real</span>
          </button>
        )}
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        Selecione um estado visual para avaliar como a interface se comporta diante das diferentes condições organizacionais. As alterações são estritamente visuais e temporárias, não persistindo nem criando registros reais.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
        {states.map((st) => {
          const Icon = st.icon;
          const isCurrent = (previewStateOverride || status) === st.id;

          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setPreviewStateOverride(st.id)}
              className={`flex items-start gap-2.5 p-3 rounded-xl text-left text-xs transition-all cursor-pointer border focus-visible:ring-2 focus-visible:ring-amber-500 outline-none ${
                isCurrent
                  ? 'bg-amber-100/90 border-amber-400 font-bold text-amber-950 shadow-xs'
                  : 'bg-white/80 hover:bg-white border-amber-100/90 text-slate-700'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${isCurrent ? 'text-amber-700' : 'text-slate-400'}`} aria-hidden="true" />
              <div className="min-w-0">
                <span className="block font-semibold">{st.label}</span>
                <span className="block text-[11px] text-slate-500 mt-0.5 font-normal">{st.desc}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
        <span className="text-[11px] text-slate-500">Navegação direta para tela de seleção:</span>
        <Link
          to={ROUTES.SELECT_ORGANIZATION}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B3D2E] hover:underline cursor-pointer focus-visible:ring-2 focus-visible:ring-[#78C89A] rounded px-1.5 py-0.5 outline-none"
        >
          <span>Abrir /selecionar-empresa</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </div>
  );
}
