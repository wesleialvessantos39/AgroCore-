import {
  User,
  Mail,
  Shield,
  Building2,
  BadgeCheck,
  LogOut,
  Globe,
  CheckCircle2,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import { useAuthorization } from '../authorization/useAuthorization';
import { getRoleDisplayLabel, getScopeDisplayLabel } from '../auth/roleUtils';
import { PreviewBadge } from '../auth/preview/PreviewBadge';
import { OrganizationStatePreviewPanel } from '../components/organization/OrganizationStatePreviewPanel';

export function MyAccountPage() {
  const { session, signOut, isPreview, platformRole } = useAuth();
  const { activeOrganization, activeMembership, organizationRoleLabel, status: orgStatus } =
    useOrganization();
  const { grantedSummaries } = useAuthorization();

  const isPlatformSuperAdmin = platformRole === 'platform_super_admin';
  const roleLabel = getRoleDisplayLabel(session);
  const scopeLabel = getScopeDisplayLabel(session);

  const isOrgRestricted =
    !isPlatformSuperAdmin &&
    (orgStatus === 'accessPending' ||
      orgStatus === 'suspended' ||
      orgStatus === 'unavailable' ||
      activeMembership?.status !== 'active');

  return (
    <div id="my-account-page" className="max-w-4xl mx-auto space-y-6 select-none">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">
              Minha conta
            </h1>
            {isPreview && <PreviewBadge variant="light" />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Informações cadastrais e perfil de acesso atribuído (modo somente leitura).
          </p>
        </div>

        <button
          id="my-account-btn-signout"
          type="button"
          onClick={() => signOut()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400 outline-none min-h-[44px]"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          <span>Encerrar sessão</span>
        </button>
      </div>

      {/* Cartão de Informações de Identidade e Acesso */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
          <User className="w-5 h-5 text-[#0B3D2E]" aria-hidden="true" />
          <span>Identificação e Papel de Acesso</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Perfil em Português */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Perfil de acesso
            </span>
            <span className="block text-sm font-bold text-[#0F172A]">
              {roleLabel}
            </span>
          </div>

          {/* E-mail */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
              <span>E-mail</span>
            </span>
            <span className="block text-sm font-mono text-[#0F172A] truncate">
              {session?.user.email || 'Não informado'}
            </span>
          </div>

          {/* Escopo de Atuação */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Escopo de atuação</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#EFF5F2] text-[#0B3D2E] border border-[#D1DED7]">
              {scopeLabel}
            </span>
          </div>

          {/* Situação do Vínculo */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Situação do vínculo</span>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold ${
                isPlatformSuperAdmin || activeMembership?.status === 'active'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {isPlatformSuperAdmin
                ? 'Ativo (Global)'
                : activeMembership?.status === 'active'
                ? 'Ativo'
                : 'Pendente'}
            </span>
          </div>

          {/* Informações Organizacionais ou Globais */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 md:col-span-2">
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              {isPlatformSuperAdmin ? (
                <>
                  <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Contexto de governança</span>
                </>
              ) : (
                <>
                  <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Organização vinculada</span>
                </>
              )}
            </span>

            {isPlatformSuperAdmin ? (
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Este perfil atua diretamente no contexto global da plataforma, sem vínculo restrito a uma organização individual.
              </p>
            ) : (
              <div className="mt-1 space-y-1">
                <span className="block text-sm font-bold text-[#0F172A]">
                  {activeOrganization?.name || '—'}
                </span>
                <span className="block text-xs text-slate-500">
                  Papel organizacional: <strong className="text-slate-700 font-semibold">{organizationRoleLabel}</strong>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seção: Acessos do Meu Perfil */}
      <div
        id="my-account-permissions-section"
        className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6"
      >
        <div>
          <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#0B3D2E]" aria-hidden="true" />
            <span>Acessos do meu perfil</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Relação das atribuições e capacidades concedidas ao seu perfil de acesso no AgroCore.
          </p>
        </div>

        {/* Aviso amigável em caso de restrição organizacional */}
        {isOrgRestricted && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" aria-hidden="true" />
            <div className="text-xs leading-relaxed space-y-1">
              <p className="font-bold">Acessos operacionais temporariamente restritos</p>
              <p className="text-amber-800">
                Seu vínculo com a organização está pendente de validação ou a empresa encontra-se indisponível. As capacidades operacionais serão liberadas assim que a situação for regularizada pelo administrador.
              </p>
            </div>
          </div>
        )}

        {/* Grade de Grupos de Capacidades */}
        {grantedSummaries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grantedSummaries.map((group) => (
              <div
                key={group.scope}
                className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2.5"
              >
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                    <span>{group.groupName}</span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    {group.groupDescription}
                  </p>
                </div>

                <ul className="space-y-1.5 pt-1 border-t border-slate-200/60">
                  {group.capabilities.map((capability, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-slate-600 flex items-start gap-2 leading-relaxed"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0B3D2E]/60 shrink-0 mt-1.5" />
                      <span>{capability}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <p className="text-xs text-slate-500">
              Nenhuma capacidade ativa concedida para o perfil e contexto atuais.
            </p>
          </div>
        )}
      </div>

      {/* Painel de Acompanhamento de Estados (Apenas em Desenvolvimento) */}
      <OrganizationStatePreviewPanel />
    </div>
  );
}
