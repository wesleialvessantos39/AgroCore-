import React from 'react';
import { LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { getRoleProfileConfig } from '../auth/roleConfig';
import { RoleOverviewPanel } from '../components/auth/RoleOverviewPanel';
import { PageHeader } from '../components/content/PageHeader';
import { Panel } from '../components/content/Panel';
import { EmptyState } from '../components/content/EmptyState';

export function OverviewPage() {
  const { session, isPreview, signOut } = useAuth();
  const roleConfig = getRoleProfileConfig(session);

  // Caso o papel seja nulo ou desconhecido: exibe estado neutro seguro com ação única de Sair
  if (!roleConfig) {
    return (
      <div id="agrocore-unknown-role-page" className="space-y-6 select-none">
        <PageHeader
          title="Área restrita"
          description="Sessão sem permissões ou papel institucional atribuído."
        />

        <Panel id="panel-unknown-role" title="Acesso não configurado" className="bg-white">
          <EmptyState
            id="empty-state-unknown-role"
            icon={ShieldAlert}
            title="Nenhum perfil operacional localizado"
            description="Não foi possível identificar o perfil de acesso desta sessão. Por segurança, encerre o acesso."
            action={
              <button
                id="btn-unknown-role-signout"
                type="button"
                onClick={() => signOut()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-[#0B3D2E] hover:bg-[#07261D] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#0B3D2E] outline-none min-h-[44px]"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>Encerrar sessão</span>
              </button>
            }
          />
        </Panel>
      </div>
    );
  }

  // Renderização contextual da visão do perfil conectado
  return (
    <RoleOverviewPanel
      config={roleConfig}
      isPreview={isPreview}
    />
  );
}

export default OverviewPage;
