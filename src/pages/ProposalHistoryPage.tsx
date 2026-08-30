import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ProposalStatusHistoryEntry } from '../types/proposals';
import { useProposals } from '../proposals/ProposalsContext';
import { PROPOSAL_THEME } from '../proposals/theme';
import { getProposalDetailPath, ROUTES } from '../routes/paths';

export const ProposalHistoryPage: React.FC = () => {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const { getProposalHistory } = useProposals();
  const [history, setHistory] = useState<readonly ProposalStatusHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!proposalId) {
      setError('Identificador da proposta ausente.');
      setIsLoading(false);
      return () => { active = false; };
    }
    getProposalHistory(proposalId)
      .then((entries) => {
        if (active) setHistory(entries);
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar o histórico autorizado.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [getProposalHistory, proposalId]);

  return (
    <section className={`space-y-5 rounded-2xl border p-4 sm:p-6 ${PROPOSAL_THEME.surfaceCard} ${PROPOSAL_THEME.border}`}>
      <header className="space-y-1">
        <h1 className={`text-xl font-bold ${PROPOSAL_THEME.textPrimary}`}>Histórico da proposta</h1>
        <p className={PROPOSAL_THEME.textSecondary}>Transições imutáveis registradas no pipeline comercial.</p>
      </header>

      {isLoading && <p aria-live="polite" className={PROPOSAL_THEME.textSecondary}>Carregando histórico…</p>}
      {error && <p role="alert" aria-live="assertive" className={PROPOSAL_THEME.textPrimary}>{error}</p>}
      {!isLoading && !error && history.length === 0 && (
        <p className={PROPOSAL_THEME.textSecondary}>Nenhuma transição registrada.</p>
      )}
      {!isLoading && !error && history.length > 0 && (
        <ol className="space-y-3" aria-label="Transições da proposta">
          {history.map((entry) => (
            <li key={entry.id} className={`rounded-xl border p-4 ${PROPOSAL_THEME.borderSoft} ${PROPOSAL_THEME.surfaceSoft}`}>
              <p className={`font-semibold ${PROPOSAL_THEME.textPrimary}`}>
                {entry.fromStatus} → {entry.toStatus}
              </p>
              <p className={`text-sm ${PROPOSAL_THEME.textSecondary}`}>
                Versão {entry.versionNumber} · {new Date(entry.timestamp).toLocaleString('pt-BR')}
              </p>
              {entry.reason && <p className={`mt-1 text-sm ${PROPOSAL_THEME.textSecondary}`}>Código: {entry.reason}</p>}
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        className={PROPOSAL_THEME.btnSecondary}
        onClick={() => navigate(proposalId ? getProposalDetailPath(proposalId) : ROUTES.PROPOSALS)}
      >
        Voltar
      </button>
    </section>
  );
};
