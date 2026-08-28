import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProposalForm } from '../proposals/components/ProposalForm';
import { CreateProposalInput } from '../types/proposals';
import { useProposals } from '../proposals/useProposals';
import { ROUTES } from '../routes/paths';
import { PROPOSAL_THEME } from '../proposals/theme';

export const ProposalCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { createProposal } = useProposals();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (input: CreateProposalInput) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await createProposal(input);
      if (!res.success) {
        setErrorMessage(res.error || 'Erro ao cadastrar proposta.');
        return;
      }
      navigate(ROUTES.PROPOSALS);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar proposta.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate(ROUTES.PROPOSALS);
  };

  return (
    <div className="space-y-6 text-[#0B3D2E]" id="page-proposal-create">
      <div className="flex items-center justify-between border-b border-[#0B3D2E]/15 pb-4">
        <div>
          <button
            type="button"
            onClick={handleCancel}
            className="text-xs font-semibold text-[#0B3D2E] hover:underline mb-1 flex items-center gap-1"
          >
            ← Voltar para listagem de propostas
          </button>
          <h2 className="text-xl font-bold text-[#0B3D2E]">Elaborar Nova Proposta</h2>
          <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
            Cadastre as especificações da proposta de crédito ou prestação de serviços técnicos.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div
          className="p-4 bg-[#0B3D2E]/10 border border-[#0B3D2E]/30 rounded-xl text-[#0B3D2E] text-sm"
          id="proposal-create-error-banner"
        >
          {errorMessage}
        </div>
      )}

      <ProposalForm
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        onCancel={handleCancel}
      />
    </div>
  );
};
