import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Proposal,
  ProposalPresentationChannel,
  ProposalStatus,
  ProposalStatusHistoryEntry,
  ProposalVersionSnapshot,
} from '../types/proposals';
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
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import { ROUTES, getProposalEditPath } from '../routes';
import { getOrganizationMembersGateway } from '../auth/organizationMembersGatewayFactory';
import { OrganizationMember } from '../auth/organizationMembersGateway';

export const ProposalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { activeOrganization, activeMembership } = useOrganization();
  const { can } = useAuthorization();
  const {
    getProposalById,
    submitProposal,
    assignProposalReviewer,
    startProposalReview,
    requestProposalChanges,
    approveProposal,
    rejectProposal,
    markProposalPresented,
    recordProposalDecision,
    cancelProposal,
    getProposalHistory,
    getProposalSnapshots,
  } = useProposals();
  const { clients } = useClients();
  const { properties } = useProperties();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [history, setHistory] = useState<readonly ProposalStatusHistoryEntry[]>([]);
  const [snapshots, setSnapshots] = useState<readonly ProposalVersionSnapshot[]>([]);
  const [members, setMembers] = useState<readonly OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modais e Diálogos de Ação
  const [actionModal, setActionModal] = useState<
    | null
    | 'assign'
    | 'changes'
    | 'approve'
    | 'reject'
    | 'present'
    | 'decision'
    | 'cancel'
  >(null);

  // Estados dos formulários dos modais
  const [selectedReviewerId, setSelectedReviewerId] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [presentationChannel, setPresentationChannel] = useState<ProposalPresentationChannel>('in_person');
  const [decisionType, setDecisionType] = useState<'accepted' | 'declined'>('accepted');
  const [operationalRef, setOperationalRef] = useState('');

  const currentUserId = session?.user?.id;
  const userRole = activeMembership?.organizationRole;

  const loadDetails = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getProposalById(id);
      if (data) {
        setProposal(data);
        const [h, s] = await Promise.all([
          getProposalHistory(id),
          getProposalSnapshots(id),
        ]);
        setHistory(h || []);
        setSnapshots(s || []);
      } else {
        setErrorMessage('Proposta não encontrada.');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao carregar proposta.');
    }
  }, [id, getProposalById, getProposalHistory, getProposalSnapshots]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    loadDetails().finally(() => {
      if (isMounted) setIsLoading(false);
    });

    if (activeOrganization?.id) {
      getOrganizationMembersGateway()
        .listMembers(activeOrganization.id)
        .then((m) => {
          if (isMounted) setMembers(m);
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [loadDetails, activeOrganization?.id]);

  if (isLoading) {
    return (
      <div className="p-12 text-center bg-white border border-[#0B3D2E]/10 rounded-2xl">
        <p className="text-sm text-[#0B3D2E]/70 font-medium">Carregando detalhes da proposta...</p>
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

  // Permissões e Regras de Negócio do Pipeline
  const canEditDraft =
    (can('proposals:edit_draft') || can('proposals:edit')) &&
    (proposal.status === 'draft' || proposal.status === 'changes_requested');

  const canSubmit =
    (can('proposals:submit') || can('proposals:edit')) &&
    (proposal.status === 'draft' || proposal.status === 'changes_requested');

  const canAssign =
    can('proposals:assign_review') &&
    (proposal.status === 'submitted' || proposal.status === 'under_review');

  const isAssignedReviewer =
    proposal.activeReviewAssignment?.reviewerUserId === currentUserId;
  const isManagerOrAdmin = ['manager', 'company_admin', 'owner'].includes(userRole || '');

  const canStartReview =
    can('proposals:review') &&
    proposal.status === 'submitted' &&
    (isAssignedReviewer || isManagerOrAdmin);

  const canReview =
    can('proposals:review') &&
    proposal.status === 'under_review' &&
    (isAssignedReviewer || isManagerOrAdmin);

  // Anti-Self-Approval: Captador/autor não pode aprovar
  const isAuthor = proposal.capturerUserId === currentUserId;
  const canApprove = can('proposals:approve') && proposal.status === 'under_review' && !isAuthor;

  const canPresent =
    can('proposals:present') &&
    proposal.status === 'approved';

  const canRecordDecision =
    can('proposals:record_decision') &&
    proposal.status === 'presented';

  const isTerminal = [
    'accepted',
    'declined',
    'rejected',
    'expired',
    'cancelled',
  ].includes(proposal.status);

  const canCancel =
    (can('proposals:cancel') || can('proposals:edit')) &&
    !isTerminal;

  // Executores de Ação
  const handleSubmitAction = async () => {
    if (!proposal) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const res = await submitProposal(proposal.id);
    setIsProcessing(false);
    if (res.success) {
      setSuccessMessage('Proposta submetida com sucesso para parecer técnico.');
      loadDetails();
    } else {
      setErrorMessage(res.error || 'Erro ao submeter proposta.');
    }
  };

  const handleAssignAction = async () => {
    if (!proposal || !selectedReviewerId) return;
    setIsProcessing(true);
    setErrorMessage(null);
    const res = await assignProposalReviewer(proposal.id, selectedReviewerId, actionReason || undefined);
    setIsProcessing(false);
    if (res.success) {
      setActionModal(null);
      setSuccessMessage('Revisor técnico designado com sucesso.');
      loadDetails();
    } else {
      setErrorMessage(res.error || 'Erro ao designar revisor.');
    }
  };

  const handleStartReviewAction = async () => {
    if (!proposal) return;
    setIsProcessing(true);
    setErrorMessage(null);
    const res = await startProposalReview(proposal.id);
    setIsProcessing(false);
    if (res.success) {
      setSuccessMessage('Revisão técnica iniciada.');
      loadDetails();
    } else {
      setErrorMessage(res.error || 'Erro ao iniciar revisão.');
    }
  };

  const handleRequestChangesAction = async () => {
    if (!proposal || !actionReason.trim()) return;
    setIsProcessing(true);
    setErrorMessage(null);
    const res = await requestProposalChanges(proposal.id, actionReason);
    setIsProcessing(false);
    if (res.success) {
      setActionModal(null);
      setActionReason('');
      setSuccessMessage('Apontamentos de ajuste enviados ao captador.');
      loadDetails();
    } else {
      setErrorMessage(res.error || 'Erro ao solicitar ajustes.');
    }
  };

  const handleApproveAction = async () => {
    if (!proposal) return;
    setIsProcessing(true);
    setErrorMessage(null);
    const res = await approveProposal(proposal.id, actionNotes || undefined);
    setIsProcessing(false);
    if (res.success) {
      setActionModal(null);
      setActionNotes('');
      setSuccessMessage('Proposta aprovada e homologada com sucesso.');
      loadDetails();
    } else {
      setErrorMessage(res.error || 'Erro ao aprovar proposta.');
    }
  };

  const handleRejectAction = async () => {
    if (!proposal || !actionReason.trim()) return;
    setIsProcessing(true);
    setErrorMessage(null);
    const res = await rejectProposal(proposal.id, actionReason);
    setIsProcessing(false);
    if (res.success) {
      setActionModal(null);
      setActionReason('');
      setSuccessMessage('Proposta indeferida na análise.');
      loadDetails();
    } else {
      setErrorMessage(res.error || 'Erro ao rejeitar proposta.');
    }
  };

  const handlePresentAction = async () => {
    if (!proposal) return;
    setIsProcessing(true);
    setErrorMessage(null);
    const res = await markProposalPresented(proposal.id, {
      channel: presentationChannel,
      notes: actionNotes || undefined,
      documentReference: operationalRef || undefined,
    });
    setIsProcessing(false);
    if (res.success) {
      setActionModal(null);
      setActionNotes('');
      setOperationalRef('');
      setSuccessMessage('Apresentação comercial registrada. Vigência iniciada.');
      loadDetails();
    } else {
      setErrorMessage(res.error || 'Erro ao registrar apresentação.');
    }
  };

  const handleDecisionAction = async () => {
    if (!proposal) return;
    setIsProcessing(true);
    setErrorMessage(null);
    const res = await recordProposalDecision(proposal.id, {
      decision: decisionType,
      channel: presentationChannel,
      notes: actionNotes || undefined,
      operationalReference: operationalRef || undefined,
    });
    setIsProcessing(false);
    if (res.success) {
      setActionModal(null);
      setActionNotes('');
      setOperationalRef('');
      setSuccessMessage(`Decisão (${decisionType === 'accepted' ? 'Aceite' : 'Declínio'}) registrada com sucesso.`);
      loadDetails();
    } else {
      setErrorMessage(res.error || 'Erro ao registrar decisão.');
    }
  };

  const handleCancelAction = async () => {
    if (!proposal) return;
    setIsProcessing(true);
    setErrorMessage(null);
    const res = await cancelProposal(proposal.id, actionReason || undefined);
    setIsProcessing(false);
    if (res.success) {
      setActionModal(null);
      setActionReason('');
      setSuccessMessage('Proposta cancelada.');
      loadDetails();
    } else {
      setErrorMessage(res.error || 'Erro ao cancelar proposta.');
    }
  };

  // Pipeline Stages visual
  const pipelineStages: Array<{ key: ProposalStatus; label: string }> = [
    { key: 'draft', label: 'Rascunho' },
    { key: 'submitted', label: 'Submetida' },
    { key: 'under_review', label: 'Em Revisão' },
    { key: 'approved', label: 'Aprovada' },
    { key: 'presented', label: 'Apresentada' },
    { key: 'accepted', label: 'Aceita' },
  ];

  const getStageIndex = (st: ProposalStatus) => {
    if (st === 'draft' || st === 'changes_requested') return 0;
    if (st === 'submitted') return 1;
    if (st === 'under_review') return 2;
    if (st === 'approved') return 3;
    if (st === 'presented') return 4;
    if (st === 'accepted') return 5;
    return -1;
  };

  const currentStageIndex = getStageIndex(proposal.status);

  return (
    <div className="space-y-6 text-[#0B3D2E]" id="page-proposal-detail">
      {/* Topo / Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#0B3D2E]/15 pb-4">
        <div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.PROPOSALS)}
            className="text-xs font-semibold text-[#0B3D2E] hover:underline mb-1 flex items-center gap-1 cursor-pointer"
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
            Criada em {new Date(proposal.createdAt).toLocaleDateString('pt-BR')} (Versão Oficial: {proposal.version})
          </p>
        </div>

        {/* Barra de Ações Rápidas do Pipeline */}
        <div className="flex flex-wrap items-center gap-2" id="detail-actions-bar">
          {canEditDraft && (
            <button
              type="button"
              onClick={() => navigate(getProposalEditPath(proposal.id))}
              className={PROPOSAL_THEME.btnSecondary}
              id="detail-edit-proposal-btn"
              disabled={isProcessing}
            >
              Editar Rascunho
            </button>
          )}

          {canSubmit && (
            <button
              type="button"
              onClick={handleSubmitAction}
              className={PROPOSAL_THEME.btnPrimary}
              id="detail-submit-proposal-btn"
              disabled={isProcessing}
            >
              {proposal.status === 'changes_requested' ? 'Reenviar Proposta' : 'Submeter Proposta'}
            </button>
          )}

          {canAssign && (
            <button
              type="button"
              onClick={() => {
                setSelectedReviewerId(proposal.activeReviewAssignment?.reviewerUserId || '');
                setActionModal('assign');
              }}
              className={PROPOSAL_THEME.btnSecondary}
              id="detail-assign-reviewer-btn"
              disabled={isProcessing}
            >
              {proposal.activeReviewAssignment ? 'Redistribuir Revisor' : 'Designar Revisor'}
            </button>
          )}

          {canStartReview && (
            <button
              type="button"
              onClick={handleStartReviewAction}
              className={PROPOSAL_THEME.btnPrimary}
              id="detail-start-review-btn"
              disabled={isProcessing}
            >
              Iniciar Parecer Técnico
            </button>
          )}

          {canReview && (
            <>
              <button
                type="button"
                onClick={() => setActionModal('changes')}
                className="inline-flex items-center justify-center px-3 py-1.5 bg-[#78C89A]/20 text-[#0B3D2E] border border-[#78C89A]/50 hover:bg-[#78C89A]/30 rounded-xl text-xs font-semibold transition cursor-pointer min-h-[36px]"
                id="detail-request-changes-btn"
                disabled={isProcessing}
              >
                Solicitar Ajustes
              </button>

              <button
                type="button"
                onClick={() => setActionModal('reject')}
                className="inline-flex items-center justify-center px-3 py-1.5 bg-[#0B3D2E]/10 text-[#0B3D2E] border border-[#0B3D2E]/30 hover:bg-[#0B3D2E]/20 rounded-xl text-xs font-semibold transition cursor-pointer min-h-[36px]"
                id="detail-reject-btn"
                disabled={isProcessing}
              >
                Indeferir
              </button>
            </>
          )}

          {canApprove && (
            <button
              type="button"
              onClick={() => setActionModal('approve')}
              className={PROPOSAL_THEME.btnPrimary}
              id="detail-approve-btn"
              disabled={isProcessing}
            >
              Aprovar Proposta
            </button>
          )}

          {proposal.status === 'under_review' && isAuthor && (
            <span
              className="text-[11px] text-[#0B3D2E] bg-[#78C89A]/20 px-2.5 py-1 rounded-xl border border-[#78C89A]/40 font-medium"
              title="Segregação de Funções: o autor não pode aprovar a própria proposta."
            >
              Auto-aprovação restrita
            </span>
          )}

          {canPresent && (
            <button
              type="button"
              onClick={() => setActionModal('present')}
              className={PROPOSAL_THEME.btnPrimary}
              id="detail-present-btn"
              disabled={isProcessing}
            >
              Apresentar ao Cliente
            </button>
          )}

          {canRecordDecision && (
            <button
              type="button"
              onClick={() => setActionModal('decision')}
              className={PROPOSAL_THEME.btnPrimary}
              id="detail-record-decision-btn"
              disabled={isProcessing}
            >
              Registrar Decisão do Cliente
            </button>
          )}

          {canCancel && (
            <button
              type="button"
              onClick={() => setActionModal('cancel')}
              className="inline-flex items-center justify-center px-3 py-1.5 text-[#0B3D2E]/70 hover:bg-[#0B3D2E]/10 rounded-xl text-xs font-semibold transition cursor-pointer min-h-[36px]"
              id="detail-cancel-btn"
              disabled={isProcessing}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Alertas de Sucesso / Erro */}
      {errorMessage && (
        <div
          className="p-4 bg-[#0B3D2E]/10 border border-[#0B3D2E]/30 rounded-xl text-[#0B3D2E] text-xs font-medium"
          id="proposal-detail-error-banner"
        >
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div
          className="p-4 bg-[#78C89A]/20 border border-[#78C89A]/50 rounded-xl text-[#0B3D2E] text-xs font-medium"
          id="proposal-detail-success-banner"
        >
          {successMessage}
        </div>
      )}

      {/* Esteira Visual do Pipeline Comercial */}
      <div className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-4 shadow-2xs">
        <div className="text-[11px] uppercase font-bold text-[#0B3D2E]/70 tracking-wider mb-3">
          Esteira do Ciclo de Vida Comercial
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
          {pipelineStages.map((stage, idx) => {
            const isCompleted = currentStageIndex >= 0 && idx < currentStageIndex;
            const isCurrent = currentStageIndex === idx;

            let bgClass = 'bg-[#0B3D2E]/5 text-[#0B3D2E]/40 border-[#0B3D2E]/10';
            if (isCurrent) {
              bgClass = 'bg-[#0B3D2E] text-white font-bold shadow-xs border-[#0B3D2E]';
            } else if (isCompleted) {
              bgClass = 'bg-[#78C89A]/20 text-[#0B3D2E] font-semibold border-[#78C89A]/40';
            }

            return (
              <div
                key={stage.key}
                className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center gap-0.5 ${bgClass}`}
              >
                <span className="text-[10px] opacity-75">Passo {idx + 1}</span>
                <span className="truncate w-full">{stage.label}</span>
              </div>
            );
          })}
        </div>
        {['rejected', 'declined', 'cancelled', 'expired'].includes(proposal.status) && (
          <div className="mt-3 p-2.5 bg-[#0B3D2E]/5 border border-[#0B3D2E]/20 rounded-xl text-xs text-[#0B3D2E] flex items-center justify-between">
            <span>
              <strong>Status de Encerramento:</strong> Proposta finalizada como{' '}
              <span className="uppercase font-bold">{proposal.status}</span>.
            </span>
            <ProposalStatusBadge status={proposal.status} />
          </div>
        )}
      </div>

      {/* Grid Principal de Informações */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Painel 1: Condições Financeiras */}
        <div
          className={`${PROPOSAL_THEME.surfaceCard} border ${PROPOSAL_THEME.border} rounded-2xl p-5 shadow-2xs space-y-4 md:col-span-2`}
        >
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#0B3D2E] border-b border-[#0B3D2E]/15 pb-2">
            Especificações Financeiras e Condições
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
                {proposal.validityDays} dias (expira em {new Date(proposal.expiresAt).toLocaleDateString('pt-BR')})
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
                Taxa Anual Estimada
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

          {/* Registros de Parecer e Observações */}
          {proposal.notes && (
            <div className="space-y-2 pt-2 border-t border-[#0B3D2E]/10">
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Observações, Apontamentos e Pareceres
              </span>
              <p className="text-xs text-[#0B3D2E]/90 bg-white p-3 rounded-xl border border-[#0B3D2E]/10 whitespace-pre-wrap leading-relaxed">
                {proposal.notes}
              </p>
            </div>
          )}

          {/* Registro de Apresentação */}
          {proposal.presentationRecord && (
            <div className="p-4 bg-[#78C89A]/15 border border-[#78C89A]/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0B3D2E] uppercase tracking-wide">
                  Registro de Apresentação Comercial
                </span>
                <span className="text-[11px] text-[#0B3D2E]/80">
                  Canal: <strong>{proposal.presentationRecord.channel}</strong>
                </span>
              </div>
              <p className="text-xs text-[#0B3D2E]">
                Apresentada em {new Date(proposal.presentationRecord.presentedAt).toLocaleDateString('pt-BR')} às{' '}
                {new Date(proposal.presentationRecord.presentedAt).toLocaleTimeString('pt-BR')}.
                {proposal.presentationRecord.notes && ` — Observações: ${proposal.presentationRecord.notes}`}
              </p>
            </div>
          )}

          {/* Registro de Decisão */}
          {proposal.decisionRecord && (
            <div className="p-4 bg-[#0B3D2E]/5 border border-[#0B3D2E]/20 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0B3D2E] uppercase tracking-wide">
                  Registro Formal de Decisão do Cliente
                </span>
                <span className="text-xs font-bold uppercase text-[#0B3D2E]">
                  {proposal.decisionRecord.decision === 'accepted' ? 'Aceite Homologado' : 'Proposta Declinada'}
                </span>
              </div>
              <p className="text-xs text-[#0B3D2E]/90">
                Manifestado via {proposal.decisionRecord.channel} em{' '}
                {new Date(proposal.decisionRecord.decidedAt).toLocaleDateString('pt-BR')}.
              </p>
              <p className="text-[10px] text-[#0B3D2E]/70 italic border-t border-[#0B3D2E]/10 pt-1">
                {proposal.decisionRecord.disclaimerText}
              </p>
            </div>
          )}
        </div>

        {/* Painel 2: Vínculos Cadastrais e Revisor */}
        <div
          className={`${PROPOSAL_THEME.surfaceCard} border ${PROPOSAL_THEME.border} rounded-2xl p-5 shadow-2xs space-y-4`}
        >
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#0B3D2E] border-b border-[#0B3D2E]/15 pb-2">
            Vínculos e Responsáveis
          </h3>

          <div className="space-y-4">
            {/* Cliente */}
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

            {/* Imóvel */}
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

            {/* Captador Responsável */}
            <div>
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Captador / Autor da Proposta
              </span>
              <div className="text-xs text-[#0B3D2E] mt-0.5">
                <p className="font-bold">{proposal.capturerSnapshot.name}</p>
                {proposal.capturerSnapshot.email && (
                  <p className="text-[#0B3D2E]/70">{proposal.capturerSnapshot.email}</p>
                )}
                <p className="text-[#0B3D2E]/60">Papel: {proposal.capturerSnapshot.role}</p>
              </div>
            </div>

            {/* Revisor Designado */}
            <div className="pt-2 border-t border-[#0B3D2E]/10">
              <span className="text-[11px] text-[#0B3D2E]/60 uppercase font-semibold block">
                Revisão Técnica Designada
              </span>
              {proposal.activeReviewAssignment ? (
                <div className="text-xs text-[#0B3D2E] mt-0.5 bg-white p-2.5 rounded-xl border border-[#0B3D2E]/15">
                  <p className="font-bold">{proposal.activeReviewAssignment.reviewerName}</p>
                  {proposal.activeReviewAssignment.reviewerEmail && (
                    <p className="text-[#0B3D2E]/70">{proposal.activeReviewAssignment.reviewerEmail}</p>
                  )}
                  <p className="text-[10px] text-[#0B3D2E]/60 mt-1">
                    Designado em {new Date(proposal.activeReviewAssignment.assignedAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[#0B3D2E]/60 italic mt-0.5">
                  Nenhum revisor designado no momento.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Seções de Auditoria: Linha do Tempo e Snapshots de Versão */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Linha do Tempo */}
        <div className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-5 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#0B3D2E] border-b border-[#0B3D2E]/15 pb-2">
            Linha do Tempo e Histórico de Transições
          </h3>
          {history.length === 0 ? (
            <p className="text-xs text-[#0B3D2E]/60 italic py-4 text-center">
              Nenhuma transição de status registrada até o momento.
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="text-xs border-l-2 border-[#0B3D2E]/30 pl-3 py-1 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0B3D2E]">
                      {item.fromStatus} → <span className="uppercase">{item.toStatus}</span>
                    </span>
                    <span className="text-[10px] text-[#0B3D2E]/60">
                      {new Date(item.timestamp).toLocaleDateString('pt-BR')}{' '}
                      {new Date(item.timestamp).toLocaleTimeString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-[#0B3D2E]/80">
                    Ator: <strong>{item.actorName || item.actorUserId}</strong> (Versão: {item.versionNumber})
                  </p>
                  {item.reason && (
                    <p className="text-[11px] text-[#0B3D2E]/90 bg-[#0B3D2E]/5 p-1.5 rounded">
                      Motivo: {item.reason}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-[11px] text-[#0B3D2E]/70 italic">
                      Notas: {item.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Snapshots Imutáveis de Versão */}
        <div className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-5 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#0B3D2E] border-b border-[#0B3D2E]/15 pb-2">
            Snapshots Imutáveis de Versão (SHA-256)
          </h3>
          {snapshots.length === 0 ? (
            <p className="text-xs text-[#0B3D2E]/60 italic py-4 text-center">
              Nenhum snapshot de versão congelado até o momento.
            </p>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="text-xs bg-[#0B3D2E]/5 border border-[#0B3D2E]/10 rounded-xl p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0B3D2E]">
                      Versão {snap.versionNumber} ({snap.status})
                    </span>
                    <span className="text-[10px] text-[#0B3D2E]/60">
                      {new Date(snap.createdAt).toLocaleDateString('pt-BR')}{' '}
                      {new Date(snap.createdAt).toLocaleTimeString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#0B3D2E]/70 font-mono break-all">
                    Checksum SHA-256: {snap.checksumSha256}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modais de Ação */}
      {actionModal === 'assign' && (
        <div className="fixed inset-0 bg-[#0B3D2E]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 border border-[#0B3D2E]/20 text-[#0B3D2E]">
            <h3 className="text-base font-bold text-[#0B3D2E]">Designar Revisor Técnico</h3>
            <p className="text-xs text-[#0B3D2E]/70">
              Selecione o profissional habilitado para emissão de parecer técnico e econômico da proposta.
            </p>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Revisor Técnico Responsável
              </label>
              <select
                value={selectedReviewerId}
                onChange={(e) => setSelectedReviewerId(e.target.value)}
                className={PROPOSAL_THEME.select}
              >
                <option value="">Selecione um profissional...</option>
                {members
                  .filter((m) =>
                    ['project_designer', 'manager', 'company_admin', 'owner'].includes(
                      m.organizationRole
                    )
                  )
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.organizationRole})
                    </option>
                  ))}
              </select>
            </div>
            {proposal.activeReviewAssignment && (
              <div>
                <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                  Justificativa de Redistribuição
                </label>
                <input
                  type="text"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Ex: Férias do revisor anterior ou redistribuição de carga"
                  className={PROPOSAL_THEME.input}
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className={PROPOSAL_THEME.btnSecondary}
                disabled={isProcessing}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAssignAction}
                className={PROPOSAL_THEME.btnPrimary}
                disabled={isProcessing || !selectedReviewerId}
              >
                Confirmar Designação
              </button>
            </div>
          </div>
        </div>
      )}

      {actionModal === 'changes' && (
        <div className="fixed inset-0 bg-[#0B3D2E]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 border border-[#0B3D2E]/20 text-[#0B3D2E]">
            <h3 className="text-base font-bold text-[#0B3D2E]">Solicitar Ajustes na Proposta</h3>
            <p className="text-xs text-[#0B3D2E]/70">
              Descreva detalhadamente os apontamentos e documentos complementares exigidos do captador.
            </p>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Apontamentos Técnicos (Obrigatório)
              </label>
              <textarea
                rows={4}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Ex: Anexar certidão negativa de débitos ou ajustar prazo..."
                className={PROPOSAL_THEME.textarea}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className={PROPOSAL_THEME.btnSecondary}
                disabled={isProcessing}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRequestChangesAction}
                className={PROPOSAL_THEME.btnPrimary}
                disabled={isProcessing || !actionReason.trim()}
              >
                Emitir Apontamentos
              </button>
            </div>
          </div>
        </div>
      )}

      {actionModal === 'approve' && (
        <div className="fixed inset-0 bg-[#0B3D2E]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 border border-[#0B3D2E]/20 text-[#0B3D2E]">
            <h3 className="text-base font-bold text-[#0B3D2E]">Aprovar e Homologar Proposta</h3>
            <p className="text-xs text-[#0B3D2E]/70">
              Confirme a homologação técnica e comercial favorável para liberação de apresentação ao cliente.
            </p>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Parecer / Observações do Parecer (Opcional)
              </label>
              <textarea
                rows={3}
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Ex: Documentação conforme e viabilidade econômica validada."
                className={PROPOSAL_THEME.textarea}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className={PROPOSAL_THEME.btnSecondary}
                disabled={isProcessing}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApproveAction}
                className={PROPOSAL_THEME.btnPrimary}
                disabled={isProcessing}
              >
                Confirmar Aprovação
              </button>
            </div>
          </div>
        </div>
      )}

      {actionModal === 'reject' && (
        <div className="fixed inset-0 bg-[#0B3D2E]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 border border-[#0B3D2E]/20 text-[#0B3D2E]">
            <h3 className="text-base font-bold text-[#0B3D2E]">Indeferir Proposta</h3>
            <p className="text-xs text-[#0B3D2E]/70">
              Esta ação encerra a proposta em status terminal. Informe o motivo de indeferimento.
            </p>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Motivo do Indeferimento (Obrigatório)
              </label>
              <textarea
                rows={3}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Ex: Capacidade de pagamento insuficiente ou inconformidade cadastral."
                className={PROPOSAL_THEME.textarea}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className={PROPOSAL_THEME.btnSecondary}
                disabled={isProcessing}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleRejectAction}
                className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-[#0B3D2E] hover:bg-[#0B3D2E]/90 rounded-xl transition cursor-pointer min-h-[44px]"
                disabled={isProcessing || !actionReason.trim()}
              >
                Confirmar Indeferimento
              </button>
            </div>
          </div>
        </div>
      )}

      {actionModal === 'present' && (
        <div className="fixed inset-0 bg-[#0B3D2E]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 border border-[#0B3D2E]/20 text-[#0B3D2E]">
            <h3 className="text-base font-bold text-[#0B3D2E]">Registrar Apresentação Comercial</h3>
            <p className="text-xs text-[#0B3D2E]/70">
              Inicia formalmente o prazo de validade ({proposal.validityDays} dias) a partir desta data.
            </p>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Canal de Apresentação
              </label>
              <select
                value={presentationChannel}
                onChange={(e) => setPresentationChannel(e.target.value as ProposalPresentationChannel)}
                className={PROPOSAL_THEME.select}
              >
                <option value="in_person">Presencial (Sede da Fazenda/Escritório)</option>
                <option value="messaging">Aplicativo de Mensagens (WhatsApp Oficial)</option>
                <option value="email">Correio Eletrônico (E-mail)</option>
                <option value="phone">Telefônico</option>
                <option value="other">Outro Canal Formal</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Referência Operacional / Documental (Opcional)
              </label>
              <input
                type="text"
                value={operationalRef}
                onChange={(e) => setOperationalRef(e.target.value)}
                placeholder="Ex: Minuta entregue em mãos ou protocolo 2026-X"
                className={PROPOSAL_THEME.input}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Observações (Opcional)
              </label>
              <textarea
                rows={2}
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Ex: Produtor avaliando condições com agrônomo."
                className={PROPOSAL_THEME.textarea}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className={PROPOSAL_THEME.btnSecondary}
                disabled={isProcessing}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePresentAction}
                className={PROPOSAL_THEME.btnPrimary}
                disabled={isProcessing}
              >
                Registrar Apresentação
              </button>
            </div>
          </div>
        </div>
      )}

      {actionModal === 'decision' && (
        <div className="fixed inset-0 bg-[#0B3D2E]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 border border-[#0B3D2E]/20 text-[#0B3D2E]">
            <h3 className="text-base font-bold text-[#0B3D2E]">Registrar Decisão do Cliente</h3>
            <p className="text-xs text-[#0B3D2E]/70">
              Registro declaratório da manifestação de vontade expressa pelo produtor rural/cliente.
            </p>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Decisão Manifestada
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDecisionType('accepted')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer min-h-[44px] ${
                    decisionType === 'accepted'
                      ? 'bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-xs'
                      : 'bg-[#78C89A]/15 text-[#0B3D2E] border-[#78C89A]/40'
                  }`}
                >
                  ✓ Aceite (Aprovada)
                </button>
                <button
                  type="button"
                  onClick={() => setDecisionType('declined')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer min-h-[44px] ${
                    decisionType === 'declined'
                      ? 'bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-xs'
                      : 'bg-[#0B3D2E]/5 text-[#0B3D2E] border-[#0B3D2E]/20'
                  }`}
                >
                  ✕ Declínio (Recusada)
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Canal da Manifestação
              </label>
              <select
                value={presentationChannel}
                onChange={(e) => setPresentationChannel(e.target.value as ProposalPresentationChannel)}
                className={PROPOSAL_THEME.select}
              >
                <option value="in_person">Presencial</option>
                <option value="messaging">Mensagem / WhatsApp</option>
                <option value="email">E-mail</option>
                <option value="phone">Telefônico</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Referência Operacional / Registro Formal
              </label>
              <input
                type="text"
                value={operationalRef}
                onChange={(e) => setOperationalRef(e.target.value)}
                placeholder="Ex: Mensagem gravada no protocolo ou termo assinado"
                className={PROPOSAL_THEME.input}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Notas / Motivo (Opcional)
              </label>
              <textarea
                rows={2}
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Observações declaratórias..."
                className={PROPOSAL_THEME.textarea}
              />
            </div>
            <p className="text-[10px] text-[#0B3D2E]/60 italic">
              * Registro formal declaratório da manifestação do cliente.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className={PROPOSAL_THEME.btnSecondary}
                disabled={isProcessing}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDecisionAction}
                className={PROPOSAL_THEME.btnPrimary}
                disabled={isProcessing}
              >
                Confirmar Registro
              </button>
            </div>
          </div>
        </div>
      )}

      {actionModal === 'cancel' && (
        <div className="fixed inset-0 bg-[#0B3D2E]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 border border-[#0B3D2E]/20 text-[#0B3D2E]">
            <h3 className="text-base font-bold text-[#0B3D2E]">Cancelar Proposta</h3>
            <p className="text-xs text-[#0B3D2E]/70">
              Tem certeza que deseja cancelar esta proposta? Esta ação não poderá ser desfeita.
            </p>
            <div>
              <label className="text-xs font-semibold text-[#0B3D2E] block mb-1">
                Motivo do Cancelamento
              </label>
              <textarea
                rows={3}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Ex: Produtor optou por linha de crédito diferente."
                className={PROPOSAL_THEME.textarea}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className={PROPOSAL_THEME.btnSecondary}
                disabled={isProcessing}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleCancelAction}
                className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-[#0B3D2E] hover:bg-[#0B3D2E]/90 rounded-xl transition cursor-pointer min-h-[44px]"
                disabled={isProcessing}
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
