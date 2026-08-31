import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Inbox, LoaderCircle, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthorization } from '../authorization/useAuthorization';
import { PROPOSAL_THEME } from '../proposals/theme';
import { useProposals } from '../proposals/useProposals';
import { getProposalHandoffPath } from '../routes/paths';
import { ProposalHandoffQueue, ProposalOperationalHandoffDestination } from '../types/proposals';

const DESTINATION_LABELS: Readonly<Record<ProposalOperationalHandoffDestination, string>> = {
  credit_operations: 'Operações de crédito',
  appraisal_operations: 'Operações de avaliação',
  technical_operations: 'Operações técnicas',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export const ProposalHandoffQueuePage: React.FC = () => {
  const { getProposalHandoffQueue, acknowledgeProposalHandoff } = useProposals();
  const { can } = useAuthorization();
  const [queue, setQueue] = useState<ProposalHandoffQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const requestSequence = useRef(0);

  const loadQueue = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    const result = await getProposalHandoffQueue();
    if (sequence !== requestSequence.current) return;
    setQueue(result);
    setLoading(false);
  }, [getProposalHandoffQueue]);

  useEffect(() => {
    void loadQueue();
    return () => { requestSequence.current += 1; };
  }, [loadQueue]);

  const handleAcknowledge = async (handoff: ProposalHandoffQueue['items'][number]['handoff']) => {
    setBusyId(handoff.id);
    setFeedback(null);
    const result = await acknowledgeProposalHandoff(handoff);
    setFeedback(result.success
      ? { kind: 'success', text: 'Recebimento interno registrado com integridade verificada.' }
      : { kind: 'error', text: result.error ?? 'Não foi possível confirmar o recebimento.' });
    if (result.success) await loadQueue();
    setBusyId(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center" role="status" aria-live="polite">
        <LoaderCircle className="h-7 w-7 animate-spin text-[#0B3D2E]" aria-hidden="true" />
        <span className="sr-only">Carregando fila de encaminhamentos</span>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className={`${PROPOSAL_THEME.surfaceSoft} ${PROPOSAL_THEME.border} rounded-2xl border p-6`} role="alert">
        <h1 className={`text-xl font-bold ${PROPOSAL_THEME.textPrimary}`}>Fila indisponível</h1>
        <p className={`mt-2 ${PROPOSAL_THEME.textSecondary}`}>Não foi possível consultar os encaminhamentos da sua área.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="page-proposal-handoff-queue">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${PROPOSAL_THEME.textPrimary}`}>Fila de encaminhamentos</h1>
          <p className={`mt-1 max-w-3xl text-sm ${PROPOSAL_THEME.textSecondary}`}>
            Recebimento interno por área responsável. Nenhum contrato ou operação externa é criado.
          </p>
        </div>
        <button type="button" className={PROPOSAL_THEME.btnSecondary} onClick={() => void loadQueue()}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Atualizar
        </button>
      </header>

      {feedback && (
        <div
          className={`${feedback.kind === 'error' ? PROPOSAL_THEME.surfaceMuted : PROPOSAL_THEME.surfaceSoft} ${PROPOSAL_THEME.border} rounded-xl border p-4 ${PROPOSAL_THEME.textPrimary}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {feedback.text}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Resumo dos encaminhamentos">
        <article className={`${PROPOSAL_THEME.surface} ${PROPOSAL_THEME.border} rounded-2xl border p-5`}>
          <Inbox className="mb-3 h-5 w-5 text-[#0B3D2E]" aria-hidden="true" />
          <p className={`text-sm ${PROPOSAL_THEME.textSecondary}`}>Aguardando recebimento</p>
          <p className={`mt-1 text-2xl font-bold ${PROPOSAL_THEME.textPrimary}`}>{queue.pendingCount}</p>
        </article>
        <article className={`${PROPOSAL_THEME.surface} ${PROPOSAL_THEME.border} rounded-2xl border p-5`}>
          <CheckCircle2 className="mb-3 h-5 w-5 text-[#0B3D2E]" aria-hidden="true" />
          <p className={`text-sm ${PROPOSAL_THEME.textSecondary}`}>Recebidos</p>
          <p className={`mt-1 text-2xl font-bold ${PROPOSAL_THEME.textPrimary}`}>{queue.receivedCount}</p>
        </article>
      </section>

      <section className="space-y-4" aria-labelledby="handoff-queue-title">
        <h2 id="handoff-queue-title" className={`text-lg font-bold ${PROPOSAL_THEME.textPrimary}`}>Encaminhamentos da sua área</h2>
        {queue.items.length === 0 ? (
          <div className={`${PROPOSAL_THEME.surfaceSoft} ${PROPOSAL_THEME.border} rounded-2xl border p-8 text-center`}>
            <Inbox className="mx-auto mb-3 h-7 w-7 text-[#0B3D2E]" aria-hidden="true" />
            <p className={PROPOSAL_THEME.textPrimary}>Nenhum encaminhamento disponível para sua área.</p>
          </div>
        ) : queue.items.map((item) => (
          <article key={item.handoff.id} className={`${PROPOSAL_THEME.surface} ${PROPOSAL_THEME.border} rounded-2xl border p-5`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <p className={`text-xs font-semibold ${PROPOSAL_THEME.textSecondary}`}>{item.proposalNumber}</p>
                <h3 className={`break-words text-lg font-bold ${PROPOSAL_THEME.textPrimary}`}>{item.title}</h3>
                <p className={`text-sm ${PROPOSAL_THEME.textSecondary}`}>{item.clientName}</p>
                <p className={`text-sm ${PROPOSAL_THEME.textPrimary}`}>Destino: {DESTINATION_LABELS[item.destination]}</p>
                <p className={`text-sm ${PROPOSAL_THEME.textSecondary}`}>Preparado em {formatDate(item.handoff.preparedAt)}</p>
                <p className={`text-sm font-semibold ${PROPOSAL_THEME.textPrimary}`}>
                  {item.receipt ? `Recebido em ${formatDate(item.receipt.receivedAt)}` : 'Aguardando recebimento interno'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className={PROPOSAL_THEME.btnSecondary} to={getProposalHandoffPath(item.proposalId)}>Ver integridade</Link>
                {!item.receipt && can('proposals:acknowledge_handoff') && (
                  <button
                    type="button"
                    className={PROPOSAL_THEME.btnPrimary}
                    disabled={busyId === item.handoff.id}
                    onClick={() => void handleAcknowledge(item.handoff)}
                  >
                    {busyId === item.handoff.id
                      ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                    Confirmar recebimento
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};
