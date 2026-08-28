import React from 'react';
import { Proposal, ProposalCategory, ProposalStatus, ProposalType } from '../../types/proposals';
import {
  PROPOSAL_CATEGORY_LABELS,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_TYPE_LABELS,
  formatCentsToBRL,
  getClientDisplayName,
} from '../validators';
import { PROPOSAL_THEME } from '../theme';
import { ProposalStatusBadge } from './ProposalStatusBadge';
import { useProposals } from '../useProposals';
import { useClients } from '../../clients/useClients';
import { useProperties } from '../../properties/useProperties';
import { useAuthorization } from '../../authorization/useAuthorization';

interface ProposalListProps {
  onNewProposal: () => void;
  onEditProposal: (proposalId: string) => void;
  onViewProposal: (proposalId: string) => void;
}

export const ProposalList: React.FC<ProposalListProps> = ({
  onNewProposal,
  onEditProposal,
  onViewProposal,
}) => {
  const {
    proposals,
    isLoading,
    errorMessage,
    filters,
    setSearch,
    setStatusFilter,
    setTypeFilter,
    setCategoryFilter,
    clearFilters,
    refresh,
  } = useProposals();

  const { clients } = useClients();
  const { properties } = useProperties();
  const { can } = useAuthorization();

  const canCreate = can('proposals:create');
  const canEdit = can('proposals:edit');

  // Mapeamento rápido de IDs para nomes
  const clientMap = new Map(clients.map((c) => [c.id, getClientDisplayName(c)]));
  const propertyMap = new Map(properties.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6 text-[#0B3D2E]" id="proposals-list-container">
      {/* Barra de Ações do Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0B3D2E]">Propostas de Crédito e Serviços</h2>
          <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
            Gerenciamento e acompanhamento cadastral de propostas agronômicas, crédito e laudos.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={onNewProposal}
            className={PROPOSAL_THEME.btnPrimary}
            id="new-proposal-btn"
          >
            + Nova Proposta
          </button>
        )}
      </div>

      {errorMessage && (
        <div
          className="p-4 bg-[#0B3D2E]/10 border border-[#0B3D2E]/30 rounded-xl text-[#0B3D2E] text-sm"
          id="proposal-list-error-banner"
        >
          <p className="font-semibold">Erro ao carregar propostas</p>
          <p className="text-xs text-[#0B3D2E]/80 mt-1">{errorMessage}</p>
          <button
            type="button"
            onClick={refresh}
            className={`mt-2 ${PROPOSAL_THEME.btnSecondarySmall}`}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Filtros e Busca */}
      <div
        className={`${PROPOSAL_THEME.surfaceCard} border ${PROPOSAL_THEME.border} rounded-2xl p-4 shadow-2xs space-y-3`}
        id="proposals-filter-bar"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label
              htmlFor="proposal-search-input"
              className="block text-[11px] font-semibold text-[#0B3D2E]/70 mb-1"
            >
              Buscar por número ou título
            </label>
            <input
              id="proposal-search-input"
              type="text"
              value={filters.search || ''}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ex: PROP-2026, Custeio..."
              className={PROPOSAL_THEME.input}
            />
          </div>

          <div>
            <label
              htmlFor="proposal-status-filter"
              className="block text-[11px] font-semibold text-[#0B3D2E]/70 mb-1"
            >
              Status
            </label>
            <select
              id="proposal-status-filter"
              value={filters.status || ''}
              onChange={(e) =>
                setStatusFilter((e.target.value as ProposalStatus) || undefined)
              }
              className={PROPOSAL_THEME.select}
            >
              <option value="">Todos os status</option>
              {Object.entries(PROPOSAL_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="proposal-type-filter"
              className="block text-[11px] font-semibold text-[#0B3D2E]/70 mb-1"
            >
              Tipo
            </label>
            <select
              id="proposal-type-filter"
              value={filters.type || ''}
              onChange={(e) =>
                setTypeFilter((e.target.value as ProposalType) || undefined)
              }
              className={PROPOSAL_THEME.select}
            >
              <option value="">Todos os tipos</option>
              {Object.entries(PROPOSAL_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="proposal-category-filter"
              className="block text-[11px] font-semibold text-[#0B3D2E]/70 mb-1"
            >
              Finalidade / Categoria
            </label>
            <select
              id="proposal-category-filter"
              value={filters.category || ''}
              onChange={(e) =>
                setCategoryFilter((e.target.value as ProposalCategory) || undefined)
              }
              className={PROPOSAL_THEME.select}
            >
              <option value="">Todas as finalidades</option>
              {Object.entries(PROPOSAL_CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(filters.search || filters.status || filters.type || filters.category) && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={clearFilters}
              className={PROPOSAL_THEME.btnMutedSmall}
              id="clear-filters-btn"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Conteúdo: Listagem ou Estado Vazio */}
      {isLoading ? (
        <div className="p-8 text-center bg-white border border-[#0B3D2E]/10 rounded-2xl">
          <p className="text-sm text-[#0B3D2E]/70">Carregando propostas...</p>
        </div>
      ) : proposals.length === 0 ? (
        <div
          className="p-12 text-center bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-3"
          id="proposals-empty-state"
        >
          <div className="w-12 h-12 rounded-full bg-[#78C89A]/20 text-[#0B3D2E] flex items-center justify-center mx-auto text-xl font-bold">
            📋
          </div>
          <h3 className="text-base font-bold text-[#0B3D2E]">Nenhuma proposta encontrada</h3>
          <p className="text-xs text-[#0B3D2E]/70 max-w-md mx-auto">
            {filters.search || filters.status || filters.type || filters.category
              ? 'Nenhuma proposta corresponde aos critérios de filtro informados.'
              : 'Não há propostas cadastradas nesta organização até o momento.'}
          </p>
          {canCreate && !filters.search && !filters.status && (
            <button
              type="button"
              onClick={onNewProposal}
              className={`mt-2 ${PROPOSAL_THEME.btnPrimary}`}
              id="empty-state-new-proposal-btn"
            >
              Elaborar Primeira Proposta
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4" id="proposals-items-grid">
          {proposals.map((proposal) => {
            const clientName = clientMap.get(proposal.clientId) || proposal.clientSnapshot.name || 'Produtor não identificado';
            const propertyName = proposal.propertySnapshot?.name || (proposal.propertyId ? propertyMap.get(proposal.propertyId) : null) || 'Sem imóvel vinculado';
            const canEditThis = canEdit && proposal.status === 'draft';

            return (
              <div
                key={proposal.id}
                onClick={() => onViewProposal(proposal.id)}
                className={`${PROPOSAL_THEME.surfaceCard} border ${PROPOSAL_THEME.border} ${PROPOSAL_THEME.surfaceHover} rounded-2xl p-5 shadow-2xs transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4`}
                id={`proposal-card-${proposal.id}`}
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#0B3D2E] bg-[#0B3D2E]/10 px-2 py-0.5 rounded-md">
                      {proposal.proposalNumber}
                    </span>
                    <ProposalStatusBadge status={proposal.status} />
                    <span className="text-xs text-[#0B3D2E]/60">
                      {PROPOSAL_TYPE_LABELS[proposal.proposalType]} •{' '}
                      {PROPOSAL_CATEGORY_LABELS[proposal.category]}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-[#0B3D2E] hover:underline">
                      {proposal.title}
                    </h3>
                    <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
                      <span className="font-semibold text-[#0B3D2E]">Cliente:</span> {clientName} |{' '}
                      <span className="font-semibold text-[#0B3D2E]">Imóvel:</span> {propertyName}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-[#0B3D2E]/80 pt-1">
                    <div>
                      <span className="text-[#0B3D2E]/60 block text-[10px] uppercase font-semibold">
                        Valor Solicitado
                      </span>
                      <span className="font-bold text-[#0B3D2E]">
                        {proposal.estimatedValue.formattedBRL || formatCentsToBRL(proposal.estimatedValue.amountCents)}
                      </span>
                    </div>

                    {proposal.calculationSummary.financingTermMonths !== undefined && (
                      <div>
                        <span className="text-[#0B3D2E]/60 block text-[10px] uppercase font-semibold">
                          Prazo
                        </span>
                        <span className="font-medium text-[#0B3D2E]">
                          {proposal.calculationSummary.financingTermMonths} meses
                        </span>
                      </div>
                    )}

                    {proposal.expiresAt && (
                      <div>
                        <span className="text-[#0B3D2E]/60 block text-[10px] uppercase font-semibold">
                          Validade
                        </span>
                        <span className="font-medium text-[#0B3D2E]">
                          {new Date(proposal.expiresAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botões de Ação */}
                <div
                  className="flex flex-wrap items-center gap-2 md:self-center pt-2 md:pt-0 border-t md:border-t-0 border-[#0B3D2E]/10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onViewProposal(proposal.id)}
                    className={PROPOSAL_THEME.btnSecondarySmall}
                    id={`proposal-view-btn-${proposal.id}`}
                  >
                    Ver Detalhes
                  </button>

                  {canEditThis && (
                    <button
                      type="button"
                      onClick={() => onEditProposal(proposal.id)}
                      className={PROPOSAL_THEME.btnSecondarySmall}
                      id={`proposal-edit-btn-${proposal.id}`}
                    >
                      Editar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
