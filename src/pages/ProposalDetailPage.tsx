import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Proposal } from '../types/proposals';
import {
  PROPOSAL_CATEGORY_LABELS,
  PROPOSAL_TYPE_LABELS,
  formatCentsToBRL,
  getClientDisplayName,
  getClientDocument,
} from '../proposals/validators';
import { PROPOSAL_THEME } from '../proposals/theme';
import { ProposalStatusBadge } from '../proposals/components/ProposalStatusBadge';
import { useProposals } from '../proposals/useProposals';
import { useClients } from '../clients/useClients';
import { useProperties } from '../properties/useProperties';
import { useAuthorization } from '../authorization/useAuthorization';
import { ROUTES, getProposalEditPath } from '../routes';

export const ProposalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getProposalById } = useProposals();
  const { clients } = useClients();
  const { properties } = useProperties();
  const { can } = useAuthorization();

  const canEdit = can('proposals:edit');

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    getProposalById(id)
      .then((data) => {
        if (!isMounted) return;
        if (data) {
          setProposal(data);
        } else {
          setErrorMessage('Proposta não encontrada.');
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setErrorMessage(err instanceof Error ? err.message : 'Erro ao carregar proposta.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id, getProposalById]);

  if (isLoading) {
    return (
      <div className="p-12 text-center bg-white border border-[#0B3D2E]/10 rounded-2xl">
        <p className="text-sm text-[#0B3D2E]/70">Carregando detalhes da proposta...</p>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="p-12 text-center bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-4">
        <h3 className="text-base font-bold text-[#0B3D2E]">Proposta não localizada</h3>
        <p className="text-xs text-[#0B3D2E]/70 max-w-md mx-auto">
          A proposta solicitada não existe ou não está acessível no contexto desta organização.
        </p>
        <button
          type="button"
          onClick={() => navigate(ROUTES.PROPOSALS)}
          className={PROPOSAL_THEME.btnPrimary}
        >
          Voltar para Propostas
        </button>
      </div>
    );
  }

  const client = clients.find((c) => c.id === proposal.clientId);
  const property = proposal.propertyId
    ? properties.find((p) => p.id === proposal.propertyId)
    : null;

  const canEditThis = canEdit && proposal.status === 'draft';

  return (
    <div className="space-y-6 text-[#0B3D2E]" id="page-proposal-detail">
      {/* Topo / Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#0B3D2E]/15 pb-4">
        <div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.PROPOSALS)}
            className="text-xs font-semibold text-[#0B3D2E] hover:underline mb-1 flex items-center gap-1"
          >
            ← Voltar para listagem de propostas
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-[#0B3D2E]">
              {proposal.proposalNumber} — {proposal.title}
            </h2>
            <ProposalStatusBadge status={proposal.status} />
          </div>
          <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
            {PROPOSAL_TYPE_LABELS[proposal.proposalType]} • {PROPOSAL_CATEGORY_LABELS[proposal.category]} •
            Criada em {new Date(proposal.createdAt).toLocaleDateString('pt-BR')} (Versão: {proposal.version})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEditThis && (
            <button
              type="button"
              onClick={() => navigate(getProposalEditPath(proposal.id))}
              className={PROPOSAL_THEME.btnSecondary}
              id="detail-edit-proposal-btn"
            >
              Editar Proposta
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div
          className="p-4 bg-[#0B3D2E]/10 border border-[#0B3D2E]/30 rounded-xl text-[#0B3D2E] text-sm font-medium"
          id="proposal-detail-error-banner"
        >
          {errorMessage}
        </div>
      )}

      {/* Grid de Informações */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Painel 1: Condições Financeiras */}
        <div
          className={`${PROPOSAL_THEME.surfaceCard} border ${PROPOSAL_THEME.border} rounded-2xl p-5 shadow-2xs space-y-4 md:col-span-2`}
        >
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#0B3D2E] border-b border-[#0B3D2E]/15 pb-2">
            Especificações Financeiras e Prazos
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Valor Solicitado
              </span>
              <span className="text-base font-bold text-[#0B3D2E]">
                {proposal.estimatedValue.formattedBRL || formatCentsToBRL(proposal.estimatedValue.amountCents)}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Validade da Proposta
              </span>
              <span className="text-sm font-medium text-[#0B3D2E]">
                {proposal.validityDays} dias (até {new Date(proposal.expiresAt).toLocaleDateString('pt-BR')})
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Prazo de Financiamento
              </span>
              <span className="text-sm font-medium text-[#0B3D2E]">
                {proposal.calculationSummary.financingTermMonths
                  ? `${proposal.calculationSummary.financingTermMonths} meses`
                  : 'Não especificado'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Carência
              </span>
              <span className="text-sm font-medium text-[#0B3D2E]">
                {proposal.calculationSummary.gracePeriodMonths
                  ? `${proposal.calculationSummary.gracePeriodMonths} meses`
                  : 'Sem carência'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Taxa de Juros Estimada
              </span>
              <span className="text-sm font-medium text-[#0B3D2E]">
                {proposal.calculationSummary.interestRateAnnualPercentage !== undefined
                  ? `${proposal.calculationSummary.interestRateAnnualPercentage}% a.a.`
                  : 'A definir'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Total Estimado
              </span>
              <span className="text-sm font-bold text-[#0B3D2E]">
                {proposal.calculationSummary.formattedValueBRL || formatCentsToBRL(proposal.calculationSummary.totalEstimatedCents)}
              </span>
            </div>
          </div>

          {proposal.notes && (
            <div className="space-y-2 pt-2 border-t border-[#0B3D2E]/10">
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Observações e Parecer Técnico
              </span>
              <p className="text-xs text-[#0B3D2E]/80 bg-white p-3 rounded-xl border border-[#0B3D2E]/10">
                {proposal.notes}
              </p>
            </div>
          )}
        </div>

        {/* Painel 2: Vínculos Cadastrais */}
        <div
          className={`${PROPOSAL_THEME.surfaceCard} border ${PROPOSAL_THEME.border} rounded-2xl p-5 shadow-2xs space-y-4`}
        >
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#0B3D2E] border-b border-[#0B3D2E]/15 pb-2">
            Vínculos Cadastrais
          </h3>

          <div className="space-y-3">
            <div>
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Cliente / Produtor (Snapshot)
              </span>
              <div className="text-xs text-[#0B3D2E] mt-0.5">
                <p className="font-bold">{proposal.clientSnapshot.name || (client ? getClientDisplayName(client) : 'Cliente')}</p>
                <p className="text-[#0B3D2E]/70">
                  {proposal.clientSnapshot.documentNumber || (client ? getClientDocument(client) : '')}
                </p>
                {proposal.clientSnapshot.phone && (
                  <p className="text-[#0B3D2E]/70">{proposal.clientSnapshot.phone}</p>
                )}
                {proposal.clientSnapshot.email && (
                  <p className="text-[#0B3D2E]/70">{proposal.clientSnapshot.email}</p>
                )}
              </div>
            </div>

            <div>
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Imóvel Vinculado
              </span>
              {proposal.propertySnapshot ? (
                <div className="text-xs text-[#0B3D2E] mt-0.5">
                  <p className="font-bold">{proposal.propertySnapshot.name}</p>
                  {proposal.propertySnapshot.city && (
                    <p className="text-[#0B3D2E]/70">
                      {proposal.propertySnapshot.city}/{proposal.propertySnapshot.state}
                    </p>
                  )}
                  {proposal.propertySnapshot.registrationNumber && (
                    <p className="text-[#0B3D2E]/70">
                      Matrícula: {proposal.propertySnapshot.registrationNumber}
                    </p>
                  )}
                  {proposal.propertySnapshot.totalAreaHectares && (
                    <p className="text-[#0B3D2E]/70">
                      Área: {proposal.propertySnapshot.totalAreaHectares} ha
                    </p>
                  )}
                </div>
              ) : property ? (
                <div className="text-xs text-[#0B3D2E] mt-0.5">
                  <p className="font-bold">{property.name}</p>
                  <p className="text-[#0B3D2E]/70">
                    {property.city}/{property.state} • {property.totalAreaFormatted}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[#0B3D2E]/60 italic mt-0.5">
                  Nenhum imóvel vinculado diretamente.
                </p>
              )}
            </div>

            <div>
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Captador / Responsável
              </span>
              <div className="text-xs text-[#0B3D2E] mt-0.5">
                <p className="font-bold">{proposal.capturerSnapshot.name}</p>
                {proposal.capturerSnapshot.email && (
                  <p className="text-[#0B3D2E]/70">{proposal.capturerSnapshot.email}</p>
                )}
                <p className="text-[#0B3D2E]/60">Cargo: {proposal.capturerSnapshot.role}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
