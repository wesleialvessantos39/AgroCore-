import { Shield, CheckCircle2, Layers, Building2, BadgeCheck, CalendarClock, ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RoleProfileConfig } from '../../auth/roleConfig';
import { PageHeader } from '../content/PageHeader';
import { Panel } from '../content/Panel';
import { EmptyState } from '../content/EmptyState';
import { PreviewBadge } from '../../auth/preview/PreviewBadge';
import { useOrganization } from '../../organization/useOrganization';
import { useAuthorization } from '../../authorization/useAuthorization';
import { useDocuments } from '../../documents/DocumentsContext';
import { ROUTES } from '../../routes/paths';

interface RoleOverviewPanelProps {
  config: RoleProfileConfig;
  isPreview?: boolean;
}

const OVERVIEW_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

function formatOverviewDate(value: string): string {
  return OVERVIEW_DATE_FORMATTER.format(new Date(`${value}T00:00:00.000Z`));
}

export function RoleOverviewPanel({ config, isPreview = false }: RoleOverviewPanelProps) {
  const Icon = config.icon;
  const navigate = useNavigate();
  const { activeOrganization, activeMembership } = useOrganization();
  const { can } = useAuthorization();
  const { checklistDashboard, checklistStatus } = useDocuments();

  const isPlatformScope = config.scope === 'platform';
  const canViewChecklists = can('documents:view_requirements');
  const hasChecklistData = Boolean(
    canViewChecklists && checklistDashboard && checklistDashboard.checklists.length > 0
  );

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

      {/* 3. Informações operacionais derivadas somente de registros existentes */}
      <Panel
        id="panel-role-empty-state"
        title="Informações operacionais"
        className="bg-white"
      >
        {hasChecklistData && checklistDashboard ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#0B3D2E]/15 bg-white p-4">
                <p className="text-sm text-[#0B3D2E]/65">Propostas com checklist</p>
                <p className="mt-2 text-2xl font-bold text-[#0B3D2E]">{checklistDashboard.totals.proposalsWithChecklist}</p>
              </div>
              <div className="rounded-xl border border-[#0B3D2E]/15 bg-white p-4">
                <p className="text-sm text-[#0B3D2E]/65">Documentos pendentes</p>
                <p className="mt-2 text-2xl font-bold text-[#0B3D2E]">{checklistDashboard.totals.pending}</p>
              </div>
              <div className="rounded-xl border border-[#0B3D2E]/15 bg-white p-4">
                <p className="text-sm text-[#0B3D2E]/65">Em análise</p>
                <p className="mt-2 text-2xl font-bold text-[#0B3D2E]">{checklistDashboard.totals.inReview}</p>
              </div>
            </div>
            {checklistDashboard.agendaEntries.length > 0 ? (
              <div className="rounded-xl border border-[#78C89A]/35 bg-[#78C89A]/10 p-4">
                <h3 className="flex items-center gap-2 font-bold text-[#0B3D2E]">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" /> Próximos prazos documentais
                </h3>
                <ul className="mt-3 space-y-2">
                  {checklistDashboard.agendaEntries.slice(0, 4).map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm text-[#0B3D2E]">
                      <span>{entry.proposalNumber} · {entry.itemTitle}</span>
                      <span className="font-semibold">{entry.isOverdue ? 'Prazo vencido' : formatOverviewDate(entry.dueOn)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button type="button" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#78C89A]" onClick={() => navigate(ROUTES.PROPOSAL_CHECKLISTS)}>
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Abrir checklists
            </button>
          </div>
        ) : checklistStatus === 'loading' && canViewChecklists ? (
          <p className="text-sm text-[#0B3D2E]/70">Carregando informações operacionais…</p>
        ) : (
          <EmptyState
            id="role-empty-state"
            icon={Layers}
            title={config.emptyState.title}
            description={config.emptyState.description}
          />
        )}
      </Panel>
    </div>
  );
}
