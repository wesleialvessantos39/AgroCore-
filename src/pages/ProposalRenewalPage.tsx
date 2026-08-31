import React, { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Proposal, ProposalRenewalLineage } from '../types/proposals';
import { useProposals } from '../proposals/useProposals';
import { PROPOSAL_THEME } from '../proposals/theme';
import { ProposalStatusBadge } from '../proposals/components/ProposalStatusBadge';
import { formatCentsToBRL } from '../proposals/validators';
import { ROUTES, getProposalDetailPath } from '../routes';

const RENEWABLE_STATUSES = new Set<Proposal['status']>([
  'declined',
  'rejected',
  'expired',
  'cancelled',
]);

export const ProposalRenewalPage: React.FC = () => {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const { getProposalById, getProposalRenewalLineage, renewProposal } = useProposals();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [lineage, setLineage] = useState<ProposalRenewalLineage | null>(null);
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!proposalId) {
      setErrorMessage('Referência da proposta não informada.');
      setIsLoading(false);
      return () => {
        active = false;
      };
    }
    setIsLoading(true);
    setErrorMessage(null);
    Promise.all([
      getProposalById(proposalId),
      getProposalRenewalLineage(proposalId),
    ])
      .then(([loadedProposal, loadedLineage]) => {
        if (!active) return;
        setProposal(loadedProposal);
        setLineage(loadedLineage);
        if (!loadedProposal) setErrorMessage('Proposta não encontrada ou indisponível.');
      })
      .catch(() => {
        if (active) setErrorMessage('Não foi possível consultar a proposta com segurança.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [getProposalById, getProposalRenewalLineage, proposalId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!proposal || isSubmitting) return;
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 5 || normalizedReason.length > 500) {
      setErrorMessage('Informe um motivo entre 5 e 500 caracteres.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    const result = await renewProposal(proposal.id, normalizedReason);
    setIsSubmitting(false);
    if (result.success && result.data) {
      navigate(getProposalDetailPath(result.data.id), { replace: true });
      return;
    }
    setErrorMessage(result.error || 'Não foi possível criar a nova proposta vinculada.');
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#0B3D2E]/15 bg-white p-10 text-center" aria-live="polite">
        <p className="text-sm font-medium text-[#0B3D2E]/70">Carregando dados para continuidade comercial...</p>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="space-y-4 rounded-2xl border border-[#0B3D2E]/15 bg-white p-8 text-center">
        <p role="alert" className="text-sm font-semibold text-[#0B3D2E]">
          {errorMessage || 'Proposta não localizada.'}
        </p>
        <button type="button" className={PROPOSAL_THEME.btnPrimary} onClick={() => navigate(ROUTES.PROPOSALS)}>
          Voltar para propostas
        </button>
      </div>
    );
  }

  const isRenewable = RENEWABLE_STATUSES.has(proposal.status);
  const alreadyRenewed = Boolean(lineage?.successor);
  const isBlocked = !isRenewable || alreadyRenewed;

  return (
    <main className="mx-auto max-w-3xl space-y-6 text-[#0B3D2E]" id="page-proposal-renewal">
      <header className="space-y-2 border-b border-[#0B3D2E]/15 pb-4">
        <button
          type="button"
          className={PROPOSAL_THEME.btnMutedSmall}
          onClick={() => navigate(getProposalDetailPath(proposal.id))}
        >
          ← Voltar aos detalhes
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/70">
          Continuidade comercial
        </p>
        <h1 className="text-2xl font-bold text-[#0B3D2E]">Criar nova proposta vinculada</h1>
        <p className="text-sm text-[#0B3D2E]/70">
          A proposta encerrada não será reaberta. Um novo rascunho receberá dados canônicos atuais do cliente,
          do imóvel e do vínculo comercial.
        </p>
      </header>

      <section aria-labelledby="renewal-source-title" className="rounded-2xl border border-[#0B3D2E]/15 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="renewal-source-title" className="text-sm font-bold text-[#0B3D2E]">Proposta de origem</h2>
            <p className="mt-1 text-base font-semibold text-[#0B3D2E]">
              {proposal.proposalNumber} — {proposal.title}
            </p>
          </div>
          <ProposalStatusBadge status={proposal.status} />
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[#0B3D2E]/60">Cliente</dt>
            <dd className="text-sm font-semibold text-[#0B3D2E]">{proposal.clientSnapshot.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#0B3D2E]/60">Valor de referência</dt>
            <dd className="text-sm font-semibold text-[#0B3D2E]">
              {formatCentsToBRL(proposal.estimatedValue.amountCents)}
            </dd>
          </div>
        </dl>
      </section>

      {isBlocked ? (
        <section role="alert" aria-live="assertive" className="rounded-2xl border border-[#0B3D2E]/20 bg-[#78C89A]/15 p-5">
          <h2 className="text-sm font-bold text-[#0B3D2E]">Nova proposta indisponível</h2>
          <p className="mt-1 text-sm text-[#0B3D2E]/75">
            {alreadyRenewed
              ? 'Esta proposta já possui um novo rascunho vinculado. Abra-o pelos detalhes da proposta.'
              : 'A continuidade só pode partir de proposta recusada, rejeitada, expirada ou cancelada.'}
          </p>
        </section>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-[#0B3D2E]/15 bg-white p-5">
          <fieldset className="space-y-4">
            <legend className="text-base font-bold text-[#0B3D2E]">Justificativa da nova negociação</legend>
            <div>
              <label htmlFor="proposal-renewal-reason" className="mb-1 block text-sm font-semibold text-[#0B3D2E]">
                Motivo da continuidade
              </label>
              <textarea
                id="proposal-renewal-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={5}
                maxLength={500}
                required
                rows={5}
                autoFocus
                aria-describedby="proposal-renewal-help proposal-renewal-count"
                className={PROPOSAL_THEME.textarea}
                placeholder="Ex.: Cliente solicitou nova análise com condições comerciais atualizadas."
              />
              <div className="mt-1 flex justify-between gap-3 text-xs text-[#0B3D2E]/60">
                <p id="proposal-renewal-help">O motivo integra a linhagem interna e não é enviado ao cliente.</p>
                <p id="proposal-renewal-count">{reason.length}/500</p>
              </div>
            </div>
          </fieldset>

          <div className="rounded-xl border border-[#78C89A]/50 bg-[#78C89A]/10 p-4 text-xs text-[#0B3D2E]/75">
            Não serão copiados decisão, apresentação, revisão, documentos, acompanhamentos, encaminhamentos ou observações
            da proposta encerrada. A operação não cria contrato, assinatura, crédito, cobrança ou obrigação financeira.
          </div>

          {errorMessage && (
            <p role="alert" aria-live="assertive" className="rounded-xl border border-[#0B3D2E]/25 bg-[#0B3D2E]/5 p-3 text-sm font-semibold text-[#0B3D2E]">
              {errorMessage}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className={PROPOSAL_THEME.btnSecondary}
              onClick={() => navigate(getProposalDetailPath(proposal.id))}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={PROPOSAL_THEME.btnPrimary}
              disabled={isSubmitting || reason.trim().length < 5}
            >
              {isSubmitting ? 'Criando novo rascunho...' : 'Criar nova proposta vinculada'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
};
