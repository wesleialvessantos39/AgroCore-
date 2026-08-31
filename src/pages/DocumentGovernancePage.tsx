import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthorization } from '../authorization/useAuthorization';
import { useDocuments } from '../documents/DocumentsContext';
import { DOCUMENT_THEME } from '../documents/theme';
import { getDocumentReferencePath, ROUTES } from '../routes/paths';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_OWNER_LABELS,
  type DocumentRequirementEffectiveState,
  type DocumentReference,
} from '../types/documents';

const REQUIREMENT_STATE_LABELS: Readonly<Record<DocumentRequirementEffectiveState, string>> =
  Object.freeze({
    pending: 'Pendente',
    overdue: 'Prazo vencido',
    fulfilled: 'Atendida',
    document_expiring: 'Documento próximo do vencimento',
    document_expired: 'Documento vencido',
    document_unavailable: 'Documento indisponível',
    waived: 'Dispensada',
    cancelled: 'Cancelada',
  });

function formatDate(value?: string): string {
  if (!value) return 'Sem prazo definido';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`)
  );
}

function documentRequirementKey(document: DocumentReference): string {
  return `${document.logicalOwnerType}:${document.logicalOwnerId}:${document.category}`;
}

export function DocumentGovernancePage() {
  const navigate = useNavigate();
  const { can } = useAuthorization();
  const {
    governanceStatus,
    governance,
    governanceErrorMessage,
    refreshGovernance,
    fulfillRequirement,
    waiveRequirement,
    cancelRequirement,
  } = useDocuments();
  const [selectedDocuments, setSelectedDocuments] = useState<Readonly<Record<string, string>>>({});
  const [reasons, setReasons] = useState<Readonly<Record<string, string>>>({});
  const [busyRequirementId, setBusyRequirementId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const documentsByRequirement = useMemo(() => {
    const index = new Map<string, DocumentReference[]>();
    for (const document of governance?.availableDocuments ?? []) {
      const key = documentRequirementKey(document);
      const current = index.get(key);
      if (current) current.push(document);
      else index.set(key, [document]);
    }
    return index;
  }, [governance]);

  async function handleFulfill(requirementId: string, expectedVersion: number) {
    const documentId = selectedDocuments[requirementId];
    if (!documentId) return;
    setBusyRequirementId(requirementId);
    setFeedback(null);
    const result = await fulfillRequirement({ requirementId, documentId, expectedVersion });
    setBusyRequirementId(null);
    setFeedback(result.success ? 'Pendência atendida com o documento selecionado.' : result.error ?? 'Não foi possível atender a pendência.');
  }

  async function handleClose(
    requirementId: string,
    expectedVersion: number,
    operation: 'waive' | 'cancel'
  ) {
    const reason = reasons[requirementId]?.trim() ?? '';
    if (reason.length < 3) return;
    setBusyRequirementId(requirementId);
    setFeedback(null);
    const result = operation === 'waive'
      ? await waiveRequirement({ requirementId, expectedVersion, reason })
      : await cancelRequirement({ requirementId, expectedVersion, reason });
    setBusyRequirementId(null);
    setFeedback(
      result.success
        ? operation === 'waive'
          ? 'Pendência dispensada.'
          : 'Pendência cancelada.'
        : result.error ?? 'Não foi possível encerrar a pendência.'
    );
  }

  return (
    <div id="page-document-governance" className={DOCUMENT_THEME.page}>
      <header className="flex flex-col gap-4 border-b border-[#0B3D2E]/15 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            className={DOCUMENT_THEME.buttonSecondary}
            onClick={() => navigate(ROUTES.DOCUMENTS)}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos documentos
          </button>
          <h1 className="mt-5 text-2xl font-bold text-[#0B3D2E] sm:text-3xl">Pendências e prazos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#0B3D2E]/70">
            Acompanhe documentos solicitados, prazos vencidos e validades que exigem atenção.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={DOCUMENT_THEME.buttonSecondary}
            onClick={() => void refreshGovernance()}
            disabled={governanceStatus === 'loading'}
          >
            <RefreshCw className={`h-4 w-4 ${governanceStatus === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
            Atualizar
          </button>
          {can('documents:manage_requirements') ? (
            <button
              type="button"
              className={DOCUMENT_THEME.buttonPrimary}
              onClick={() => navigate(ROUTES.DOCUMENT_REQUIREMENTS_NEW)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Nova pendência
            </button>
          ) : null}
        </div>
      </header>

      <section className={`${DOCUMENT_THEME.surfaceSoft} flex items-start gap-3 p-4`} aria-label="Como funciona">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-[#0B3D2E]">
          Atender uma pendência associa um documento já cadastrado. Nenhum arquivo é enviado por esta tela.
        </p>
      </section>

      {governance ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo dos documentos">
          <article className={`${DOCUMENT_THEME.surface} p-5`}>
            <ClipboardList className="h-5 w-5 text-[#0B3D2E]" aria-hidden="true" />
            <p className="mt-3 text-sm text-[#0B3D2E]/65">Pendentes</p>
            <p className="mt-1 text-2xl font-bold text-[#0B3D2E]">{governance.totals.pending}</p>
          </article>
          <article className={`${DOCUMENT_THEME.surface} p-5`}>
            <CalendarClock className="h-5 w-5 text-[#0B3D2E]" aria-hidden="true" />
            <p className="mt-3 text-sm text-[#0B3D2E]/65">Com prazo vencido</p>
            <p className="mt-1 text-2xl font-bold text-[#0B3D2E]">{governance.totals.overdue}</p>
          </article>
          <article className={`${DOCUMENT_THEME.surface} p-5`}>
            <AlertCircle className="h-5 w-5 text-[#0B3D2E]" aria-hidden="true" />
            <p className="mt-3 text-sm text-[#0B3D2E]/65">Precisam de atenção</p>
            <p className="mt-1 text-2xl font-bold text-[#0B3D2E]">{governance.totals.attentionRequired}</p>
          </article>
          <article className={`${DOCUMENT_THEME.surface} p-5`}>
            <CheckCircle2 className="h-5 w-5 text-[#0B3D2E]" aria-hidden="true" />
            <p className="mt-3 text-sm text-[#0B3D2E]/65">Atendidas</p>
            <p className="mt-1 text-2xl font-bold text-[#0B3D2E]">{governance.totals.fulfilled}</p>
          </article>
        </section>
      ) : null}

      <div aria-live="polite">
        {feedback ? (
          <p className={`${DOCUMENT_THEME.surfaceSoft} p-3 text-sm font-semibold text-[#0B3D2E]`} role="status">
            {feedback}
          </p>
        ) : null}
      </div>

      {governanceStatus === 'loading' ? (
        <div className={`${DOCUMENT_THEME.surfaceSoft} p-8 text-center`} role="status" aria-live="polite">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#0B3D2E]" aria-hidden="true" />
          <p className="mt-3 text-sm text-[#0B3D2E]">Carregando pendências e prazos…</p>
        </div>
      ) : null}

      {governanceStatus === 'error' || governanceStatus === 'unavailable' || governanceStatus === 'forbidden' ? (
        <div className={`${DOCUMENT_THEME.surfaceSoft} p-6`} role="alert" aria-live="assertive">
          <p className="font-semibold text-[#0B3D2E]">Não foi possível mostrar as pendências.</p>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            {governanceErrorMessage ?? 'Acesso ou serviço indisponível.'}
          </p>
          <button type="button" className={`${DOCUMENT_THEME.buttonSecondary} mt-4`} onClick={() => void refreshGovernance()}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {governanceStatus === 'empty' ? (
        <div className={`${DOCUMENT_THEME.surfaceSoft} p-8 text-center`}>
          <ClipboardList className="mx-auto h-7 w-7 text-[#0B3D2E]" aria-hidden="true" />
          <p className="mt-3 font-semibold text-[#0B3D2E]">Nenhuma pendência ou validade exige atenção.</p>
        </div>
      ) : null}

      {governance && governance.requirements.length > 0 ? (
        <section aria-labelledby="document-requirements-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="document-requirements-title" className="text-lg font-bold text-[#0B3D2E]">
              Pendências de documentos
            </h2>
            <span className="text-sm text-[#0B3D2E]/65">{governance.requirements.length} registro(s)</span>
          </div>
          <ul className="space-y-4">
            {governance.requirements.map((item) => {
              const requirement = item.requirement;
              const matchingDocuments =
                documentsByRequirement.get(
                  `${requirement.logicalOwnerType}:${requirement.logicalOwnerId}:${requirement.category}`
                ) ?? [];
              const isOpen = requirement.status === 'open';
              const isBusy = busyRequirementId === requirement.id;
              const reason = reasons[requirement.id] ?? '';
              return (
                <li key={requirement.id} className={`${DOCUMENT_THEME.surface} p-5 sm:p-6`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words font-bold text-[#0B3D2E]">{requirement.title}</h3>
                      <p className="mt-1 text-sm text-[#0B3D2E]/70">
                        {DOCUMENT_CATEGORY_LABELS[requirement.category]} · {DOCUMENT_OWNER_LABELS[requirement.logicalOwnerType]}
                      </p>
                      <p className="mt-1 text-sm text-[#0B3D2E]/70">Prazo: {formatDate(requirement.dueOn)}</p>
                    </div>
                    <span className={DOCUMENT_THEME.badge}>{REQUIREMENT_STATE_LABELS[item.effectiveState]}</span>
                  </div>
                  {requirement.notes ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-[#0B3D2E]">{requirement.notes}</p>
                  ) : null}
                  {item.linkedDocument ? (
                    <button
                      type="button"
                      className={`${DOCUMENT_THEME.buttonSecondary} mt-4`}
                      onClick={() => navigate(getDocumentReferencePath(item.linkedDocument!.id))}
                    >
                      Ver documento associado
                    </button>
                  ) : null}

                  {isOpen ? (
                    <div className="mt-5 grid gap-4 border-t border-[#0B3D2E]/15 pt-5 lg:grid-cols-2">
                      {can('documents:fulfill_requirements') ? (
                        <fieldset className="space-y-3">
                          <legend className="text-sm font-bold text-[#0B3D2E]">Atender pendência</legend>
                          <label className="block text-sm font-semibold text-[#0B3D2E]">
                            <span className="mb-1.5 block">Documento disponível</span>
                            <select
                              className={DOCUMENT_THEME.input}
                              value={selectedDocuments[requirement.id] ?? ''}
                              onChange={(event) =>
                                setSelectedDocuments((current) => ({
                                  ...current,
                                  [requirement.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Selecione um documento compatível</option>
                              {matchingDocuments.map((document) => (
                                <option key={document.id} value={document.id}>{document.displayName}</option>
                              ))}
                            </select>
                          </label>
                          {matchingDocuments.length === 0 ? (
                            <p className="text-xs text-[#0B3D2E]/65">
                              Nenhum documento compatível está disponível. Adicione o documento antes de atender esta pendência.
                            </p>
                          ) : null}
                          <button
                            type="button"
                            className={DOCUMENT_THEME.buttonPrimary}
                            disabled={isBusy || !selectedDocuments[requirement.id]}
                            onClick={() => void handleFulfill(requirement.id, requirement.versionNumber)}
                          >
                            {isBusy ? 'Salvando…' : 'Marcar como atendida'}
                          </button>
                        </fieldset>
                      ) : null}

                      {can('documents:manage_requirements') ? (
                        <fieldset className="space-y-3">
                          <legend className="text-sm font-bold text-[#0B3D2E]">Encerrar sem documento</legend>
                          <label className="block text-sm font-semibold text-[#0B3D2E]">
                            <span className="mb-1.5 block">Motivo obrigatório</span>
                            <textarea
                              className={DOCUMENT_THEME.textarea}
                              value={reason}
                              minLength={3}
                              maxLength={240}
                              onChange={(event) =>
                                setReasons((current) => ({ ...current, [requirement.id]: event.target.value }))
                              }
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={DOCUMENT_THEME.buttonSecondary}
                              disabled={isBusy || reason.trim().length < 3}
                              onClick={() => void handleClose(requirement.id, requirement.versionNumber, 'waive')}
                            >
                              Dispensar
                            </button>
                            <button
                              type="button"
                              className={DOCUMENT_THEME.buttonSecondary}
                              disabled={isBusy || reason.trim().length < 3}
                              onClick={() => void handleClose(requirement.id, requirement.versionNumber, 'cancel')}
                            >
                              Cancelar pendência
                            </button>
                          </div>
                        </fieldset>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {governance && (governance.expiringDocuments.length > 0 || governance.expiredDocuments.length > 0) ? (
        <section className={`${DOCUMENT_THEME.surface} p-5 sm:p-6`} aria-labelledby="document-validity-title">
          <h2 id="document-validity-title" className="text-lg font-bold text-[#0B3D2E]">Validades que exigem atenção</h2>
          <ul className="mt-4 divide-y divide-[#0B3D2E]/15">
            {[...governance.expiredDocuments, ...governance.expiringDocuments].map((document) => (
              <li key={document.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-[#0B3D2E]">{document.displayName}</p>
                  <p className="mt-1 text-sm text-[#0B3D2E]/70">Validade: {formatDate(document.expiresOn)}</p>
                </div>
                <button
                  type="button"
                  className={DOCUMENT_THEME.buttonSecondary}
                  onClick={() => navigate(getDocumentReferencePath(document.id))}
                >
                  Ver documento
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
