import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, CirclePlay, Plus, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useAuthorization } from '../authorization/useAuthorization';
import { useClients } from '../clients/useClients';
import { useFieldVisits } from '../fieldVisits/useFieldVisits';
import { FIELD_VISIT_THEME } from '../fieldVisits/theme';
import { useProperties } from '../properties/useProperties';
import { useProposals } from '../proposals/useProposals';
import { useAppraisals } from '../appraisals/useAppraisals';
import type {
  TechnicalVisit,
  TechnicalVisitActivityType,
  TechnicalVisitStatus,
} from '../types/technicalVisit';

const STATUS_LABEL: Readonly<Record<TechnicalVisitStatus, string>> = {
  planned: 'Planejada',
  confirmed: 'Confirmada',
  in_progress: 'Em execução',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const ACTIVITY_LABEL: Readonly<Record<TechnicalVisitActivityType, string>> = {
  technical_visit: 'Visita técnica',
  inspection: 'Vistoria',
  appraisal_inspection: 'Vistoria para avaliação',
  credit_visit: 'Visita para proposta',
  document_collection: 'Coleta documental',
  other: 'Outra atividade',
};

function toLocalInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export const FieldVisitsPage: React.FC = () => {
  const { session } = useAuth();
  const { can } = useAuthorization();
  const clients = useClients();
  const properties = useProperties();
  const proposals = useProposals();
  const appraisals = useAppraisals();
  const {
    status,
    visits,
    members,
    filters,
    errorMessage,
    setFilters,
    clearFilters,
    refresh,
    createVisit,
    transitionVisit,
  } = useFieldVisits();

  const [showCreate, setShowCreate] = useState(false);
  const [activityType, setActivityType] =
    useState<TechnicalVisitActivityType>('technical_visit');
  const [clientId, setClientId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [proposalId, setProposalId] = useState('');
  const [appraisalId, setAppraisalId] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState(session?.user?.id ?? '');
  const [scheduledFor, setScheduledFor] = useState(
    toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000))
  );
  const [purpose, setPurpose] = useState('');
  const [cancelVisitId, setCancelVisitId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeClients = useMemo(
    () => clients.clients.filter((client) => client.status === 'active'),
    [clients.clients]
  );

  const eligibleProperties = useMemo(
    () =>
      properties.properties.filter(
        (property) =>
          property.status === 'active' &&
          (!clientId || property.clientLinks.some((link) => link.clientId === clientId))
      ),
    [clientId, properties.properties]
  );

  const eligibleProposals = useMemo(
    () =>
      proposals.proposals.filter(
        (proposal) =>
          (!clientId || proposal.clientId === clientId) &&
          (!propertyId || !proposal.propertyId || proposal.propertyId === propertyId)
      ),
    [clientId, propertyId, proposals.proposals]
  );

  const eligibleAppraisals = useMemo(
    () =>
      appraisals.appraisals.filter(
        (appraisal) =>
          (!clientId || appraisal.clientId === clientId) &&
          (!propertyId || appraisal.propertyId === propertyId)
      ),
    [appraisals.appraisals, clientId, propertyId]
  );

  const clientName = (id: string) =>
    clients.clients.find((client) => client.id === id)?.name ?? 'Cliente';

  const propertyName = (id: string | null) =>
    id ? properties.properties.find((property) => property.id === id)?.name ?? 'Imóvel' : null;

  const memberName = (id: string) =>
    members.find((member) => member.userId === id)?.name ?? 'Integrante';

  const resetCreate = () => {
    setActivityType('technical_visit');
    setClientId('');
    setPropertyId('');
    setProposalId('');
    setAppraisalId('');
    setResponsibleUserId(session?.user?.id ?? '');
    setScheduledFor(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)));
    setPurpose('');
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setActionError(null);
    setBusyId('create');
    try {
      await createVisit({
        activityType,
        clientId,
        propertyId: propertyId || null,
        proposalId: proposalId || null,
        appraisalId: appraisalId || null,
        responsibleUserId,
        scheduledFor: new Date(scheduledFor).toISOString(),
        purpose,
      });
      resetCreate();
      setShowCreate(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível registrar a visita.');
    } finally {
      setBusyId(null);
    }
  };

  const transition = async (
    visit: TechnicalVisit,
    targetStatus: TechnicalVisitStatus,
    reason?: string
  ) => {
    setActionError(null);
    setBusyId(visit.id);
    try {
      await transitionVisit(visit.id, {
        targetStatus,
        expectedVersion: visit.version,
        reason,
      });
      setCancelVisitId(null);
      setCancelReason('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível atualizar a visita.');
    } finally {
      setBusyId(null);
    }
  };

  const canSchedule = can('surveys_and_visits:schedule');
  const canExecute = can('surveys_and_visits:execute');

  return (
    <div id="page-field-visits" className={FIELD_VISIT_THEME.page}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B3D2E]">Visitas e vistorias</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#0B3D2E]/70">
            Registre atividades externas, seus responsáveis, vínculos e andamento.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={FIELD_VISIT_THEME.buttonSecondary}
            onClick={() => void refresh()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Atualizar
          </button>
          {canSchedule && (
            <button
              type="button"
              className={FIELD_VISIT_THEME.buttonPrimary}
              onClick={() => setShowCreate((value) => !value)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nova visita
            </button>
          )}
        </div>
      </header>

      {actionError && (
        <div role="alert" className={FIELD_VISIT_THEME.surfaceSoft + ' p-4 text-sm'}>
          {actionError}
        </div>
      )}

      {showCreate && canSchedule && (
        <form onSubmit={submitCreate} className={FIELD_VISIT_THEME.surface + ' p-5 sm:p-6'}>
          <h2 className="text-lg font-semibold">Registrar visita</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              <span>Tipo de atividade</span>
              <select
                className={FIELD_VISIT_THEME.input}
                value={activityType}
                onChange={(event) =>
                  setActivityType(event.target.value as TechnicalVisitActivityType)
                }
              >
                {Object.entries(ACTIVITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-medium">
              <span>Cliente</span>
              <select
                required
                className={FIELD_VISIT_THEME.input}
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setPropertyId('');
                  setProposalId('');
                  setAppraisalId('');
                }}
              >
                <option value="">Selecione</option>
                {activeClients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-medium">
              <span>Imóvel</span>
              <select
                className={FIELD_VISIT_THEME.input}
                value={propertyId}
                onChange={(event) => {
                  setPropertyId(event.target.value);
                  setProposalId('');
                  setAppraisalId('');
                }}
              >
                <option value="">Sem imóvel vinculado</option>
                {eligibleProperties.map((property) => (
                  <option key={property.id} value={property.id}>{property.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-medium">
              <span>Proposta</span>
              <select
                className={FIELD_VISIT_THEME.input}
                value={proposalId}
                onChange={(event) => setProposalId(event.target.value)}
              >
                <option value="">Sem proposta vinculada</option>
                {eligibleProposals.map((proposal) => (
                  <option key={proposal.id} value={proposal.id}>{proposal.title}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-medium">
              <span>Laudo</span>
              <select
                className={FIELD_VISIT_THEME.input}
                value={appraisalId}
                onChange={(event) => setAppraisalId(event.target.value)}
              >
                <option value="">Sem laudo vinculado</option>
                {eligibleAppraisals.map((appraisal) => (
                  <option key={appraisal.id} value={appraisal.id}>{appraisal.title}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-medium">
              <span>Responsável</span>
              <select
                required
                className={FIELD_VISIT_THEME.input}
                value={responsibleUserId}
                onChange={(event) => setResponsibleUserId(event.target.value)}
              >
                <option value="">Selecione</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>{member.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-medium md:col-span-2">
              <span>Data e hora previstas</span>
              <input
                required
                type="datetime-local"
                className={FIELD_VISIT_THEME.input}
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
              />
            </label>

            <label className="space-y-1.5 text-sm font-medium md:col-span-2">
              <span>Finalidade</span>
              <textarea
                required
                maxLength={500}
                className={FIELD_VISIT_THEME.textarea}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Descreva o objetivo da atividade"
              />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={FIELD_VISIT_THEME.buttonSecondary}
              onClick={() => {
                resetCreate();
                setShowCreate(false);
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={FIELD_VISIT_THEME.buttonPrimary}
              disabled={busyId === 'create'}
            >
              Registrar
            </button>
          </div>
        </form>
      )}

      <section className={FIELD_VISIT_THEME.surface + ' p-4 sm:p-5'}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="w-full max-w-xs space-y-1.5 text-sm font-medium">
            <span>Situação</span>
            <select
              className={FIELD_VISIT_THEME.input}
              value={filters.status ?? 'all'}
              onChange={(event) =>
                setFilters({ status: event.target.value as TechnicalVisitStatus | 'all' })
              }
            >
              <option value="all">Todas</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {filters.status && filters.status !== 'all' && (
            <button
              type="button"
              className={FIELD_VISIT_THEME.buttonSecondary}
              onClick={clearFilters}
            >
              Limpar filtro
            </button>
          )}
        </div>
      </section>

      {status === 'loading' && (
        <div className={FIELD_VISIT_THEME.surface + ' p-8 text-center'} aria-live="polite">
          Carregando visitas...
        </div>
      )}

      {(status === 'error' || status === 'unavailable') && (
        <div role="alert" className={FIELD_VISIT_THEME.surfaceSoft + ' p-5'}>
          <p>{errorMessage}</p>
          {status === 'error' && (
            <button
              type="button"
              className={FIELD_VISIT_THEME.buttonSecondary + ' mt-4'}
              onClick={() => void refresh()}
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {status === 'empty' && (
        <div className={FIELD_VISIT_THEME.surface + ' p-8 text-center'}>
          <CalendarDays className="mx-auto h-8 w-8 text-[#0B3D2E]/55" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">Nenhuma visita encontrada</h2>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            Registre uma atividade quando houver uma visita ou vistoria prevista.
          </p>
        </div>
      )}

      {(status === 'ready' || (status === 'loading' && visits.length > 0)) && (
        <div className="grid gap-4">
          {visits.map((visit) => {
            const isResponsible = session?.user?.id === visit.responsibleUserId;
            const canCancel =
              canSchedule &&
              (visit.status === 'planned' ||
                visit.status === 'confirmed' ||
                visit.status === 'in_progress');

            return (
              <article key={visit.id} className={FIELD_VISIT_THEME.surface + ' p-5'}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={FIELD_VISIT_THEME.badge}>{STATUS_LABEL[visit.status]}</span>
                      <span className="text-sm font-medium text-[#0B3D2E]/70">
                        {ACTIVITY_LABEL[visit.activityType]}
                      </span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold">{clientName(visit.clientId)}</h2>
                    {propertyName(visit.propertyId) && (
                      <p className="text-sm text-[#0B3D2E]/70">
                        {propertyName(visit.propertyId)}
                      </p>
                    )}
                    <p className="mt-2 text-sm">{visit.purpose}</p>
                    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="font-medium">Responsável</dt>
                        <dd className="text-[#0B3D2E]/70">{memberName(visit.responsibleUserId)}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">Data prevista</dt>
                        <dd className="text-[#0B3D2E]/70">
                          {new Date(visit.scheduledFor).toLocaleString('pt-BR')}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {visit.status === 'planned' && canSchedule && (
                      <button
                        type="button"
                        className={FIELD_VISIT_THEME.buttonSecondary}
                        disabled={busyId === visit.id}
                        onClick={() => void transition(visit, 'confirmed')}
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Confirmar
                      </button>
                    )}
                    {visit.status === 'confirmed' && canExecute && isResponsible && (
                      <button
                        type="button"
                        className={FIELD_VISIT_THEME.buttonPrimary}
                        disabled={busyId === visit.id}
                        onClick={() => void transition(visit, 'in_progress')}
                      >
                        <CirclePlay className="h-4 w-4" aria-hidden="true" />
                        Iniciar
                      </button>
                    )}
                    {visit.status === 'in_progress' && canExecute && isResponsible && (
                      <button
                        type="button"
                        className={FIELD_VISIT_THEME.buttonPrimary}
                        disabled={busyId === visit.id}
                        onClick={() => void transition(visit, 'completed')}
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Concluir
                      </button>
                    )}
                    {canCancel && cancelVisitId !== visit.id && (
                      <button
                        type="button"
                        className={FIELD_VISIT_THEME.buttonSecondary}
                        onClick={() => {
                          setCancelVisitId(visit.id);
                          setCancelReason('');
                        }}
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        Cancelar visita
                      </button>
                    )}
                  </div>
                </div>

                {cancelVisitId === visit.id && (
                  <div className={FIELD_VISIT_THEME.surfaceSoft + ' mt-4 p-4'}>
                    <label className="space-y-1.5 text-sm font-medium">
                      <span>Motivo do cancelamento</span>
                      <textarea
                        className={FIELD_VISIT_THEME.textarea}
                        value={cancelReason}
                        onChange={(event) => setCancelReason(event.target.value)}
                        maxLength={500}
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className={FIELD_VISIT_THEME.buttonSecondary}
                        onClick={() => {
                          setCancelVisitId(null);
                          setCancelReason('');
                        }}
                      >
                        Manter visita
                      </button>
                      <button
                        type="button"
                        className={FIELD_VISIT_THEME.buttonPrimary}
                        disabled={busyId === visit.id}
                        onClick={() => void transition(visit, 'cancelled', cancelReason)}
                      >
                        Confirmar cancelamento
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
