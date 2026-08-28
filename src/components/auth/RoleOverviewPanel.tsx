import { Shield, CheckCircle2, Layers, Building2, BadgeCheck } from 'lucide-react';
import { RoleProfileConfig } from '../../auth/roleConfig';
import { PageHeader } from '../content/PageHeader';
import { Panel } from '../content/Panel';
import { EmptyState } from '../content/EmptyState';
import { PreviewBadge } from '../../auth/preview/PreviewBadge';
import { useOrganization } from '../../organization/useOrganization';

interface RoleOverviewPanelProps {
  config: RoleProfileConfig;
  isPreview?: boolean;
}

export function RoleOverviewPanel({ config, isPreview = false }: RoleOverviewPanelProps) {
  const Icon = config.icon;
  const { activeOrganization, activeMembership } = useOrganization();

  const isPlatformScope = config.scope === 'platform';

  return (
    <div id="agrocore-role-overview-panel" className="space-y-6 select-none">
      {/* 1. Cabeçalho com H1 Único e Distintivos de Perfil/Escopo/Organização */}
      <PageHeader
        title={config.viewTitle}
        description={config.description}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Distintivo de Escopo */}
          <span
            id="role-panel-scope-badge"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
              isPlatformScope
                ? 'bg-[#EFF5F2] text-[#0B3D2E] border-[#D1DED7]'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{config.scopeLabel}</span>
          </span>

          {/* Distintivo de Organização (apenas para escopo organizacional) */}
          {!isPlatformScope && activeOrganization && (
            <span
              id="role-panel-org-badge"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#EFF5F2] text-[#0B3D2E] border border-[#D1DED7]"
            >
              <Building2 className="w-3.5 h-3.5 text-[#0B3D2E]" aria-hidden="true" />
              <span>{activeOrganization.name}</span>
            </span>
          )}

          {/* Distintivo de Situação do Vínculo (apenas para escopo organizacional) */}
          {!isPlatformScope && activeMembership && (
            <span
              id="role-panel-membership-badge"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
            >
              <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Vínculo: {activeMembership.status === 'active' ? 'Ativo' : 'Pendente'}</span>
            </span>
          )}

          {/* Distintivo do Perfil em Português */}
          <span
            id="role-panel-name-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#0B3D2E] text-white border border-[#07261D]"
          >
            <Icon className="w-3.5 h-3.5 text-[#78C89A]" aria-hidden="true" />
            <span>{config.name}</span>
          </span>

          {/* Distintivo de Acompanhamento em Desenvolvimento */}
          {isPreview && <PreviewBadge variant="light" />}
        </div>
      </PageHeader>

      {/* 2. Seção Informativa: Responsabilidades do Perfil */}
      <Panel
        id="panel-role-responsibilities"
        title="Responsabilidades do perfil"
        description="Atribuições e escopo institucional designados para este acesso no AgroCore."
        className="bg-white"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
          {config.responsibilities.map((resp, index) => (
            <div
              key={`responsibility-${index}`}
              id={`responsibility-item-${index}`}
              className="flex items-start gap-3 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] cursor-default text-left"
            >
              <div
                className="w-6 h-6 rounded-lg bg-[#EFF5F2] border border-[#D1DED7] flex items-center justify-center text-[#0B3D2E] shrink-0 mt-0.5"
                aria-hidden="true"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-[#0B3D2E]" />
              </div>
              <p className="text-xs sm:text-sm text-[#334155] font-medium leading-relaxed">
                {resp}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {/* 3. Estado Vazio Verdadeiro de Atividades e Informações Operacionais */}
      <Panel
        id="panel-role-empty-state"
        title="Informações operacionais"
        className="bg-white"
      >
        <EmptyState
          id="role-empty-state"
          icon={Layers}
          title={config.emptyState.title}
          description={config.emptyState.description}
        />
      </Panel>
    </div>
  );
}
