import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileCheck2,
  RefreshCcw,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { useProposals } from '../proposals/useProposals';
import { useAuthorization } from '../authorization/useAuthorization';
import { useOrganizationMembers } from '../hooks/useOrganizationMembers';
import { useAuth } from '../auth/useAuth';
import { PROPOSAL_THEME } from '../proposals/theme';
import { ProposalCommercialDashboard, ProposalFollowUpPurpose, ProposalPresentationChannel } from '../types/proposals';
import { ProposalStatusBadge } from '../proposals/components/ProposalStatusBadge';
import { getProposalDetailPath, getProposalHandoffPath } from '../routes/paths';

const CHANNEL_LABELS: Readonly<Record<ProposalPresentationChannel, string>> = {
  email: 'E-mail',
  phone: 'Telefone',
  in_person: 'Presencial',
  messaging: 'Mensageria',
  other: 'Outro canal',
};

const PURPOSE_LABELS: Readonly<Record<ProposalFollowUpPurpose, string>> = {
  decision_reminder: 'Lembrete de decisão',
  document_clarification: 'Esclarecimento do documento',
  commercial_alignment: 'Alinhamento comercial',
  other: 'Outro acompanhamento',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function nextHourInputValue(): string {
  const date = new Date(Date.now() + 3_600_000);
  date.setMinutes(0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export const ProposalTrackingPage: React.FC = () => {
  const {
    getCommercialDashboard,
    scheduleProposalFollowUp,
    completeProposalFollowUp,
    cancelProposalFollowUp,
  } = useProposals();
  const { can } = useAuthorization();
  const { members, loading: membersLoading } = useOrganizationMembers();
  const { session } = useAuth();
  const [dashboard, setDashboard] = useState<ProposalCommercialDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState(nextHourInputValue);
  const [channel, setChannel] = useState<ProposalPresentationChannel>('phone');
  const [purpose, setPurpose] = useState<ProposalFollowUpPurpose>('decision_reminder');
  const [assignedUserId, setAssignedUserId] = useState(session?.user?.id ?? '');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const requestSequence = useRef(0);
  const canManage = can('proposals:manage_follow_up');

  const commercialMembers = useMemo(
    () => members.filter((member) => member.isActive && ['owner', 'company_admin', 'manager', 'capturer'].includes(member.organizationRole)),
    [members]
  );

  useEffect(() => {
    if (!assignedUserId && session?.user?.id) setAssignedUserId(session.user.id);
  }, [assignedUserId, session?.user?.id]);

  const loadDashboard = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    const result = await getCommercialDashboard();
    if (sequence !== requestSequence.current) return;
    setDashboard(result);
    setLoading(false);
  }, [getCommercialDashboard]);

  useEffect(() => {
    void loadDashboard();
    return () => {
      requestSequence.current += 1;
    };
  }, [loadDashboard]);

  const handleSchedule = async (proposalId: string) => {
    setBusyId(proposalId);
    setFeedback(null);
    const parsed = new Date(scheduledFor);
    if (!Number.isFinite(parsed.getTime())) {
      setFeedback({ kind: 'error', text: 'Informe uma data e hora válidas.' });
      setBusyId(null);
      return;
    }
    const result = await scheduleProposalFollowUp(proposalId, {
      assignedUserId,
      scheduledFor: parsed.toISOString(),
      channel,
      purpose,
    });
    setFeedback(result.success
      ? { kind: 'success', text: 'Acompanhamento interno agendado.' }
      : { kind: 'error', text: result.error ?? 'Não foi possível agendar.' });
    if (result.success) {
      setSelectedProposalId(null);
      await loadDashboard();
    }
    setBusyId(null);
  };

  const handleComplete = async (proposalId: string, activeFollowUp: NonNullable<ProposalCommercialDashboard['trackedItems'][number]['activeFollowUp']>) => {
    setBusyId(proposalId);
    setFeedback(null);
    const result = await completeProposalFollowUp(activeFollowUp, 'contacted');
    setFeedback(result.success
      ? { kind: 'success', text: 'Contato registrado como realizado.' }
      : { kind: 'error', text: result.error ?? 'Não foi possível concluir.' });
    if (result.success) await loadDashboard();
    setBusyId(null);
  };

  const handleCancel = async (proposalId: string, activeFollowUp: NonNullable<ProposalCommercialDashboard['trackedItems'][number]['activeFollowUp']>) => {
    setBusyId(proposalId);
    setFeedback(null);
    const result = await cancelProposalFollowUp(activeFollowUp, 'Cancelado pelo responsável comercial');
    setFeedback(result.success
      ? { kind: 'success', text: 'Acompanhamento cancelado.' }
      : { kind: 'error', text: result.error ?? 'Não foi possível cancelar.' });
    if (result.success) await loadDashboard();
    setBusyId(null);
  };

  if (loading) {
    return (
      <div className={`${PROPOSAL_THEME.surface} ${PROPOSAL_THEME.border} rounded-2xl border p-8 text-center`} role="status" aria-live="polite">
        <RefreshCcw className="mx-auto mb-3 h-6 w-6 animate-spin text-[#0B3D2E]" aria-hidden="true" />
        <p className={PROPOSAL_THEME.textPrimary}>Carregando acompanhamento comercial…</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className={`${PROPOSAL_THEME.surfaceSoft} ${PROPOSAL_THEME.border} rounded-2xl border p-6`} role="alert">
        <h1 className={`text-xl font-bold ${PROPOSAL_THEME.textPrimary}`}>Acompanhamento indisponível</h1>
        <p className={`mt-2 ${PROPOSAL_THEME.textSecondary}`}>Não foi possível consultar o funil com o vínculo atual.</p>
      </div>
    );
  }

  const metricCards = [
    { label: 'Apresentadas em aberto', value: dashboard.presentedOpenCount, icon: Clock3 },
    { label: 'Aceitas', value: dashboard.acceptedCount, icon: CheckCircle2 },
    { label: 'Follow-ups vencidos', value: dashboard.overdueFollowUpCount, icon: CalendarClock },
    { label: 'Conversão das decisões', value: `${(dashboard.decisionConversionBasisPoints / 100).toFixed(2)}%`, icon: TrendingUp },
  ];

  return (
    <div className="space-y-6" id="page-proposal-tracking">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${PROPOSAL_THEME.textPrimary}`}>Acompanhamento comercial</h1>
          <p className={`mt-1 max-w-3xl text-sm ${PROPOSAL_THEME.textSecondary}`}>
            Funil e compromissos internos. O registro não envia mensagens nem cria evento em agenda externa.
          </p>
        </div>
        <button type="button" className={PROPOSAL_THEME.btnSecondary} onClick={() => void loadDashboard()}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Atualizar
        </button>
      </header>

      {feedback && (
        <div
          className={`${feedback.kind === 'error' ? PROPOSAL_THEME.surfaceMuted : PROPOSAL_THEME.surfaceSoft} ${PROPOSAL_THEME.border} rounded-xl border p-4 text-sm ${PROPOSAL_THEME.textPrimary}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {feedback.text}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores do funil">
        {metricCards.map(({ label, value, icon: Icon }) => (
          <article key={label} className={`${PROPOSAL_THEME.surface} ${PROPOSAL_THEME.border} rounded-2xl border p-5`}>
            <Icon className="mb-3 h-5 w-5 text-[#0B3D2E]" aria-hidden="true" />
            <p className={`text-sm ${PROPOSAL_THEME.textSecondary}`}>{label}</p>
            <p className={`mt-1 text-2xl font-bold ${PROPOSAL_THEME.textPrimary}`}>{value}</p>
          </article>
        ))}
      </section>

      <section className="space-y-4" aria-labelledby="tracking-list-title">
        <div>
          <h2 id="tracking-list-title" className={`text-lg font-bold ${PROPOSAL_THEME.textPrimary}`}>Propostas em acompanhamento e encerradas</h2>
          {dashboard.acceptedAmountCents !== undefined && (
            <p className={`text-sm ${PROPOSAL_THEME.textSecondary}`}>Valor aceito visível: {formatBRL(dashboard.acceptedAmountCents)}</p>
          )}
        </div>

        {dashboard.trackedItems.length === 0 ? (
          <div className={`${PROPOSAL_THEME.surfaceSoft} ${PROPOSAL_THEME.border} rounded-2xl border p-8 text-center`}>
            <CalendarClock className="mx-auto mb-3 h-7 w-7 text-[#0B3D2E]" aria-hidden="true" />
            <p className={PROPOSAL_THEME.textPrimary}>Nenhuma proposta apresentada ou encerrada no seu escopo.</p>
          </div>
        ) : dashboard.trackedItems.map((item) => {
          const isBusy = busyId === item.proposalId;
          const isScheduling = selectedProposalId === item.proposalId;
          return (
            <article key={item.proposalId} className={`${PROPOSAL_THEME.surface} ${PROPOSAL_THEME.border} rounded-2xl border p-5`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProposalStatusBadge status={item.status} />
                    <span className={`text-xs font-semibold ${PROPOSAL_THEME.textSecondary}`}>{item.proposalNumber}</span>
                  </div>
                  <h3 className={`break-words text-lg font-bold ${PROPOSAL_THEME.textPrimary}`}>{item.title}</h3>
                  <p className={`text-sm ${PROPOSAL_THEME.textSecondary}`}>{item.clientName}</p>
                  {item.amountCents !== undefined && <p className={`text-sm font-semibold ${PROPOSAL_THEME.textPrimary}`}>{formatBRL(item.amountCents)}</p>}
                  {item.activeFollowUp && (
                    <p className={`text-sm ${PROPOSAL_THEME.textSecondary}`}>
                      Próximo acompanhamento: {formatDate(item.activeFollowUp.scheduledFor)} · {CHANNEL_LABELS[item.activeFollowUp.channel]}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className={PROPOSAL_THEME.btnSecondarySmall} to={getProposalDetailPath(item.proposalId)}>Abrir proposta</Link>
                  {item.status === 'accepted' && (
                    <Link className={PROPOSAL_THEME.btnSecondarySmall} to={getProposalHandoffPath(item.proposalId)}>
                      <FileCheck2 className="h-4 w-4" aria-hidden="true" /> Encaminhamento
                    </Link>
                  )}
                  {item.status === 'presented' && canManage && !item.activeFollowUp && (
                    <button type="button" className={PROPOSAL_THEME.btnSecondarySmall} onClick={() => setSelectedProposalId(isScheduling ? null : item.proposalId)}>
                      <CalendarClock className="h-4 w-4" aria-hidden="true" /> Agendar
                    </button>
                  )}
                  {item.status === 'presented' && canManage && item.activeFollowUp && (
                    <>
                      <button type="button" className={PROPOSAL_THEME.btnPrimary} disabled={isBusy} onClick={() => void handleComplete(item.proposalId, item.activeFollowUp!)}>
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Concluir contato
                      </button>
                      <button type="button" className={PROPOSAL_THEME.btnSecondarySmall} disabled={isBusy} onClick={() => void handleCancel(item.proposalId, item.activeFollowUp!)}>
                        <XCircle className="h-4 w-4" aria-hidden="true" /> Cancelar
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isScheduling && (
                <fieldset className={`${PROPOSAL_THEME.surfaceSoft} ${PROPOSAL_THEME.border} mt-5 rounded-xl border p-4`}>
                  <legend className={`px-2 text-sm font-bold ${PROPOSAL_THEME.textPrimary}`}>Novo acompanhamento interno</legend>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label className={`text-sm font-semibold ${PROPOSAL_THEME.textPrimary}`}>
                      Data e hora
                      <input className={`${PROPOSAL_THEME.input} mt-1`} type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} />
                    </label>
                    <label className={`text-sm font-semibold ${PROPOSAL_THEME.textPrimary}`}>
                      Canal previsto
                      <select className={`${PROPOSAL_THEME.select} mt-1`} value={channel} onChange={(event) => setChannel(event.target.value as ProposalPresentationChannel)}>
                        {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className={`text-sm font-semibold ${PROPOSAL_THEME.textPrimary}`}>
                      Finalidade
                      <select className={`${PROPOSAL_THEME.select} mt-1`} value={purpose} onChange={(event) => setPurpose(event.target.value as ProposalFollowUpPurpose)}>
                        {Object.entries(PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className={`text-sm font-semibold ${PROPOSAL_THEME.textPrimary}`}>
                      Responsável
                      <select className={`${PROPOSAL_THEME.select} mt-1`} value={assignedUserId} disabled={membersLoading} onChange={(event) => setAssignedUserId(event.target.value)}>
                        <option value="">Selecione</option>
                        {commercialMembers.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className={PROPOSAL_THEME.btnPrimary} disabled={isBusy || !assignedUserId} onClick={() => void handleSchedule(item.proposalId)}>Confirmar agendamento</button>
                    <button type="button" className={PROPOSAL_THEME.btnSecondary} onClick={() => setSelectedProposalId(null)}>Voltar</button>
                  </div>
                </fieldset>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
};
