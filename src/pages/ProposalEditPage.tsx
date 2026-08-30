import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ProposalForm } from '../proposals/components/ProposalForm';
import { Proposal, UpdateProposalInput } from '../types/proposals';
import { useProposals } from '../proposals/useProposals';
import { ROUTES } from '../routes/paths';
import { PROPOSAL_THEME } from '../proposals/theme';

export const ProposalEditPage: React.FC = () => {
  const navigate = useNavigate();
  const { proposalId } = useParams<{ proposalId: string }>();
  const { getProposalById, updateProposal } = useProposals();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [isLoadingProposal, setIsLoadingProposal] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!proposalId) return;
      setIsLoadingProposal(true);
      try {
        const found = await getProposalById(proposalId);
        if (isMounted) {
          setProposal(found);
          if (!found) {
            setErrorMessage('Proposta não encontrada.');
          }
        }
      } catch {
        if (isMounted) {
          setErrorMessage('Erro ao carregar os dados da proposta.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingProposal(false);
        }
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [proposalId, getProposalById]);

  const handleSubmit = async (input: UpdateProposalInput) => {
    if (!proposalId) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await updateProposal(proposalId, input);
      if (!res.success) {
        setErrorMessage(res.error || 'Erro ao atualizar proposta.');
        return;
      }
      navigate(ROUTES.PROPOSALS);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar alterações.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate(ROUTES.PROPOSALS);
  };

  if (isLoadingProposal) {
    return (
      <div className="p-8 text-center bg-white border border-[#0B3D2E]/10 rounded-2xl">
        <p className="text-sm text-[#0B3D2E]/70">Carregando proposta para edição...</p>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="p-8 bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-3">
        <h2 className="text-lg font-bold text-[#0B3D2E]">Proposta Não Encontrada</h2>
        <p className="text-xs text-[#0B3D2E]/70">
          A proposta solicitada não existe ou você não possui permissão para acessá-la.
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

  if (proposal.status !== 'draft' && proposal.status !== 'changes_requested') {
    return (
      <div className="p-8 bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-3">
        <h2 className="text-lg font-bold text-[#0B3D2E]">Edição Bloqueada</h2>
        <p className="text-xs text-[#0B3D2E]/70">
          Apenas propostas em rascunho ou com ajustes solicitados podem ser editadas. Status atual: &quot;{proposal.status}&quot;.
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

  return (
    <div className="space-y-6 text-[#0B3D2E]" id="page-proposal-edit">
      <div className="flex items-center justify-between border-b border-[#0B3D2E]/15 pb-4">
        <div>
          <h2 className="text-xl font-bold text-[#0B3D2E]">
            Editar Proposta: {proposal.proposalNumber}
          </h2>
          <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
            Atualize as especificações, condições de crédito e termos técnicos da proposta.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 bg-[#0B3D2E]/10 border border-[#0B3D2E]/30 rounded-xl text-[#0B3D2E] text-sm"
          id="proposal-edit-error-banner"
        >
          {errorMessage}
        </div>
      )}

      <ProposalForm
        initialData={proposal}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        onCancel={handleCancel}
      />
    </div>
  );
};
