import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileCheck2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useProposals } from '../proposals/useProposals';
import { useAuthorization } from '../authorization/useAuthorization';
import { PROPOSAL_THEME } from '../proposals/theme';
import { Proposal, ProposalHandoffReceipt, ProposalOperationalHandoff } from '../types/proposals';
import { getProposalDetailPath, ROUTES } from '../routes/paths';

const DESTINATION_LABELS: Readonly<Record<ProposalOperationalHandoff['destination'], string>> = {
  credit_operations: 'Operações de crédito',
  appraisal_operations: 'Operações de avaliação',
  technical_operations: 'Operações técnicas',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
}

export const ProposalHandoffPage: React.FC = () => {
  const { proposalId = '' } = useParams<{ proposalId: string }>();
  const {
    getProposalById,
    getProposalHandoff,
    getProposalHandoffReceipt,
    prepareProposalHandoff,
    acknowledgeProposalHandoff,
  } = useProposals();
  const { can } = useAuthorization();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [handoff, setHandoff] = useState<ProposalOperationalHandoff | null>(null);
  const [receipt, setReceipt] = useState<ProposalHandoffReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    const [currentProposal, currentHandoff, currentReceipt] = await Promise.all([
      getProposalById(proposalId),
      getProposalHandoff(proposalId),
      getProposalHandoffReceipt(proposalId),
    ]);
    if (sequence !== requestSequence.current) return;
    setProposal(currentProposal);
    setHandoff(currentHandoff);
    setReceipt(currentReceipt);
    setLoading(false);
  }, [getProposalById, getProposalHandoff, getProposalHandoffReceipt, proposalId]);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  const handlePrepare = async () => {
    setBusy(true);
    setFeedback(null);
    const result = await prepareProposalHandoff(proposalId);
    if (result.success && result.data) {
      setHandoff(result.data);
      setFeedback({ kind: 'success', text: 'Encaminhamento operacional preparado com integridade verificada.' });
    } else {
      setFeedback({ kind: 'error', text: result.error ?? 'Não foi possível preparar o encaminhamento.' });
    }
    setBusy(false);
  };

  const handleAcknowledge = async () => {
    if (!handoff) return;
    setBusy(true);
    setFeedback(null);
    const result = await acknowledgeProposalHandoff(handoff);
    if (result.success && result.data) {
      setReceipt(result.data);
      setFeedback({ kind: 'success', text: 'Recebimento interno registrado com integridade verificada.' });
    } else {
      setFeedback({ kind: 'error', text: result.error ?? 'Não foi possível confirmar o recebimento.' });
    }
    setBusy(false);
  };

  if (loading) {
    return <div className="flex min-h-[240px] items-center justify-center" role="status"><LoaderCircle className="h-7 w-7 animate-spin text-[#0B3D2E]" aria-hidden="true" /><span className="sr-only">Carregando encaminhamento</span></div>;
  }

  if (!proposal && !handoff) {
    return (
      <div className={`${PROPOSAL_THEME.surfaceSoft} ${PROPOSAL_THEME.border} rounded-2xl border p-6`} role="alert">
        <h1 className={`text-xl font-bold ${PROPOSAL_THEME.textPrimary}`}>Proposta não encontrada</h1>
        <Link className={`${PROPOSAL_THEME.btnSecondary} mt-4`} to={ROUTES.PROPOSALS}>Voltar às propostas</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6" id="page-proposal-handoff">
      <header>
        <Link
          className={PROPOSAL_THEME.btnMutedSmall}
          to={proposal ? getProposalDetailPath(proposal.id) : ROUTES.PROPOSALS_HANDOFF_QUEUE}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {proposal ? 'Voltar à proposta' : 'Voltar à fila'}
        </Link>
        <p className={`mt-4 text-sm font-semibold ${PROPOSAL_THEME.textSecondary}`}>{proposal?.proposalNumber ?? handoff!.proposalNumber}</p>
        <h1 className={`text-2xl font-bold ${PROPOSAL_THEME.textPrimary}`}>Encaminhamento interno após o aceite</h1>
        <p className={`mt-2 ${PROPOSAL_THEME.textSecondary}`}>Registro interno para dar continuidade ao atendimento. Nenhum contrato ou operação externa é criado nesta etapa.</p>
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

      {!handoff && (
        <section className={`${PROPOSAL_THEME.surface} ${PROPOSAL_THEME.border} rounded-2xl border p-6`}>
          <FileCheck2 className="mb-4 h-8 w-8 text-[#0B3D2E]" aria-hidden="true" />
          <h2 className={`text-lg font-bold ${PROPOSAL_THEME.textPrimary}`}>Preparar encaminhamento</h2>
          {proposal?.status === 'accepted' ? (
            <>
              <p className={`mt-2 text-sm ${PROPOSAL_THEME.textSecondary}`}>O sistema verificará a versão aceita e o documento comercial apresentado.</p>
              {can('proposals:prepare_handoff') ? (
                <button type="button" className={`${PROPOSAL_THEME.btnPrimary} mt-5`} disabled={busy} onClick={() => void handlePrepare()}>
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                  Preparar encaminhamento
                </button>
              ) : <p className={`mt-4 text-sm ${PROPOSAL_THEME.textSecondary}`}>Seu perfil possui somente consulta.</p>}
            </>
          ) : (
            <p className={`mt-2 text-sm ${PROPOSAL_THEME.textSecondary}`}>Disponível somente para proposta com aceite operacional registrado.</p>
          )}
        </section>
      )}

      {handoff && (
        <section className={`${PROPOSAL_THEME.surface} ${PROPOSAL_THEME.borderStrong} rounded-2xl border-2 p-6`} aria-labelledby="handoff-title">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
            <div>
              <h2 id="handoff-title" className={`text-xl font-bold ${PROPOSAL_THEME.textPrimary}`}>Encaminhamento preparado</h2>
              <p className={`text-sm ${PROPOSAL_THEME.textSecondary}`}>{formatDate(handoff.preparedAt)}</p>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div><dt className={`text-xs font-semibold ${PROPOSAL_THEME.textSecondary}`}>Destino interno</dt><dd className={`mt-1 font-semibold ${PROPOSAL_THEME.textPrimary}`}>{DESTINATION_LABELS[handoff.destination]}</dd></div>
            <div><dt className={`text-xs font-semibold ${PROPOSAL_THEME.textSecondary}`}>Versão aceita</dt><dd className={`mt-1 font-semibold ${PROPOSAL_THEME.textPrimary}`}>v{handoff.acceptedVersionNumber}</dd></div>
          </dl>
          <div className={`${PROPOSAL_THEME.surfaceSoft} ${PROPOSAL_THEME.border} mt-6 rounded-xl border p-4`}>
            <p className={`text-sm font-semibold ${PROPOSAL_THEME.textPrimary}`}>Integridade do encaminhamento verificada pelo sistema.</p>
          </div>
          <p className={`mt-5 text-sm ${PROPOSAL_THEME.textSecondary}`}>{handoff.disclaimerText}</p>
          {!receipt && can('proposals:acknowledge_handoff') && (
            <button type="button" className={`${PROPOSAL_THEME.btnPrimary} mt-5`} disabled={busy} onClick={() => void handleAcknowledge()}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              Confirmar recebimento interno
            </button>
          )}
        </section>
      )}

      {receipt && (
        <section className={`${PROPOSAL_THEME.surfaceSoft} ${PROPOSAL_THEME.borderStrong} rounded-2xl border-2 p-6`} aria-labelledby="receipt-title">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
            <div>
              <h2 id="receipt-title" className={`text-xl font-bold ${PROPOSAL_THEME.textPrimary}`}>Recebimento confirmado</h2>
              <p className={`text-sm ${PROPOSAL_THEME.textSecondary}`}>{formatDate(receipt.receivedAt)}</p>
            </div>
          </div>
          <p className={`mt-4 text-sm ${PROPOSAL_THEME.textSecondary}`}>{receipt.disclaimerText}</p>
          <p className={`mt-4 text-sm font-semibold ${PROPOSAL_THEME.textPrimary}`}>Recebimento registrado com integridade.</p>
        </section>
      )}
    </div>
  );
};
