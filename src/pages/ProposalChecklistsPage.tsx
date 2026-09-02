import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  History,
  Plus,
  RefreshCw,
  Settings2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthorization } from '../authorization/useAuthorization';
import { useDocuments } from '../documents/DocumentsContext';
import { DOCUMENT_THEME } from '../documents/theme';
import { useProposals } from '../proposals/useProposals';
import {
  PROPOSAL_CATEGORY_LABELS,
  PROPOSAL_TYPE_LABELS,
} from '../proposals/validators';
import { getDocumentReferencePath, ROUTES } from '../routes/paths';
import {
  DOCUMENT_CATEGORY_LABELS,
  type DocumentAccessScope,
  type DocumentCategory,
  type DocumentReference,
} from '../types/documents';
import {
  PROPOSAL_CHECKLIST_STATE_LABELS,
  type ProposalChecklistItemState,
  type ProposalChecklistTemplate,
  type ProposalChecklistTemplateItemInput,
} from '../types/proposalChecklists';
import type { Proposal, ProposalCategory, ProposalType } from '../types/proposals';

const TYPE_OPTIONS: readonly (ProposalType | 'all')[] = [
  'all',
  'credit',
  'appraisal',
  'technical_project',
  'environmental_regularization',
];
const CATEGORY_OPTIONS: readonly (ProposalCategory | 'all')[] = [
  'all',
  'custeio',
  'investimento',
  'comercializacao',
  'industrializacao',
  'servico_tecnico',
  'outros',
];
const DOCUMENT_CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[];

const TYPE_LABELS: Readonly<Record<ProposalType | 'all', string>> = Object.freeze({
  all: 'Todos os tipos',
  ...PROPOSAL_TYPE_LABELS,
});
const CATEGORY_LABELS: Readonly<Record<ProposalCategory | 'all', string>> = Object.freeze({
  all: 'Todas as categorias',
  ...PROPOSAL_CATEGORY_LABELS,
});
const ACCESS_LABELS: Readonly<Record<DocumentAccessScope, string>> = Object.freeze({
  organization: 'Organização',
  participants: 'Participantes da proposta',
  management: 'Somente gestão',
});

function emptyTemplateItem(): ProposalChecklistTemplateItemInput {
  return {
    title: '',
    category: 'registration_certificate',
    accessScope: 'participants',
    required: true,
  };
}

function formatDate(value?: string): string {
  if (!value) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function stateClass(state: ProposalChecklistItemState): string {
  if (state === 'approved') return 'bg-[#78C89A]/25 border-[#78C89A]/50';
  if (state === 'rejected' || state === 'expired') return 'bg-[#0B3D2E]/10 border-[#0B3D2E]/30';
  return 'bg-white border-[#0B3D2E]/15';
}

function templateMatchesProposal(template: ProposalChecklistTemplate, proposal: Proposal): boolean {
  return (
    (template.proposalType === 'all' || template.proposalType === proposal.proposalType) &&
    (template.proposalCategory === 'all' || template.proposalCategory === proposal.category)
  );
}

export function ProposalChecklistsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryProposalId = searchParams.get('proposta') ?? '';
  const { can } = useAuthorization();
  const { proposals, getProposalById } = useProposals();
  const {
    checklistStatus,
    checklistDashboard,
    checklistErrorMessage,
    refreshChecklistDashboard,
    configureChecklistTemplate,
    applyProposalChecklist,
    transitionProposalChecklistItem,
    listDocumentsForProposal,
  } = useDocuments();

  const [selectedProposalId, setSelectedProposalId] = useState(queryProposalId);
  const [resolvedProposal, setResolvedProposal] = useState<Proposal | null>(null);
  const [proposalDocuments, setProposalDocuments] = useState<readonly DocumentReference[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProposalChecklistTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [proposalType, setProposalType] = useState<ProposalType | 'all'>('all');
  const [proposalCategory, setProposalCategory] = useState<ProposalCategory | 'all'>('all');
  const [changeReason, setChangeReason] = useState('');
  const [templateItems, setTemplateItems] = useState<readonly ProposalChecklistTemplateItemInput[]>([
    emptyTemplateItem(),
  ]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState<Readonly<Record<string, string>>>({});
  const [decisionReasons, setDecisionReasons] = useState<Readonly<Record<string, string>>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canManage = can('documents:manage_requirements');
  const canFulfill = can('documents:fulfill_requirements');
  const canReview = can('documents:review_requirements');
  const selectableProposals = useMemo(() => {
    const map = new Map(proposals.map((proposal) => [proposal.id, proposal]));
    if (resolvedProposal) map.set(resolvedProposal.id, resolvedProposal);
    return [...map.values()].sort((left, right) =>
      left.proposalNumber.localeCompare(right.proposalNumber, 'pt-BR')
    );
  }, [proposals, resolvedProposal]);
  const selectedProposal = selectableProposals.find(
    (proposal) => proposal.id === selectedProposalId
  ) ?? null;
  const matchingTemplates = useMemo(
    () =>
      selectedProposal
        ? (checklistDashboard?.templates ?? []).filter((template) =>
            templateMatchesProposal(template, selectedProposal)
          )
        : [],
    [checklistDashboard, selectedProposal]
  );
  const effectiveSelectedTemplateId = matchingTemplates.some(
    (template) => template.id === selectedTemplateId
  )
    ? selectedTemplateId
    : matchingTemplates[0]?.id ?? '';
  const visibleChecklists = useMemo(
    () =>
      (checklistDashboard?.checklists ?? []).filter(
        (checklist) => !selectedProposalId || checklist.proposalId === selectedProposalId
      ),
    [checklistDashboard, selectedProposalId]
  );
  const visibleAgendaEntries = useMemo(
    () =>
      (checklistDashboard?.agendaEntries ?? []).filter(
        (entry) => !selectedProposalId || entry.proposalId === selectedProposalId
      ),
    [checklistDashboard, selectedProposalId]
  );
  const documentsById = useMemo(
    () => new Map(proposalDocuments.map((document) => [document.id, document])),
    [proposalDocuments]
  );
  const documentsByCategory = useMemo(() => {
    const grouped = new Map<DocumentCategory, DocumentReference[]>();
    for (const document of proposalDocuments) {
      if (document.status !== 'active' || !document.isCurrent) continue;
      const categoryDocuments = grouped.get(document.category) ?? [];
      categoryDocuments.push(document);
      grouped.set(document.category, categoryDocuments);
    }
    return grouped;
  }, [proposalDocuments]);
  const currentUtcDate = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    setSelectedProposalId(queryProposalId);
  }, [queryProposalId]);

  useEffect(() => {
    let active = true;
    if (!queryProposalId || proposals.some((proposal) => proposal.id === queryProposalId)) {
      setResolvedProposal(null);
      return () => {
        active = false;
      };
    }
    void getProposalById(queryProposalId).then((proposal) => {
      if (active) setResolvedProposal(proposal);
    });
    return () => {
      active = false;
    };
  }, [getProposalById, proposals, queryProposalId]);

  useEffect(() => {
    const controller = new AbortController();
    if (!selectedProposalId) {
      setProposalDocuments([]);
      return () => controller.abort();
    }
    setDocumentsLoading(true);
    void listDocumentsForProposal(selectedProposalId, controller.signal)
      .then((documents) => {
        if (!controller.signal.aborted) setProposalDocuments(documents);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) {
          setProposalDocuments([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDocumentsLoading(false);
      });
    return () => controller.abort();
  }, [listDocumentsForProposal, selectedProposalId]);

  function resetTemplateForm() {
    setEditingTemplate(null);
    setTemplateName('');
    setProposalType('all');
    setProposalCategory('all');
    setChangeReason('');
    setTemplateItems([emptyTemplateItem()]);
    setShowTemplateForm(false);
  }

  function editTemplate(template: ProposalChecklistTemplate) {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setProposalType(template.proposalType);
    setProposalCategory(template.proposalCategory);
    setChangeReason('');
    setTemplateItems(
      template.items.map(({ title, category, accessScope, required, dueInDays }) => ({
        title,
        category,
        accessScope,
        required,
        dueInDays,
      }))
    );
    setShowTemplateForm(true);
  }

  function updateTemplateItem(
    index: number,
    patch: Partial<ProposalChecklistTemplateItemInput>
  ) {
    setTemplateItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  }

  async function handleTemplateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey('template');
    setFeedback(null);
    const result = await configureChecklistTemplate({
      name: templateName,
      proposalType,
      proposalCategory,
      changeReason,
      items: templateItems,
      previousTemplateVersionId: editingTemplate?.id,
      expectedVersion: editingTemplate?.versionNumber,
    });
    setBusyKey(null);
    if (result.success) {
      setFeedback(editingTemplate ? 'Nova versão do modelo registrada.' : 'Modelo de checklist criado.');
      resetTemplateForm();
    } else {
      setFeedback(result.error ?? 'Não foi possível salvar o modelo.');
    }
  }

  async function handleApplyChecklist() {
    if (!selectedProposalId || !effectiveSelectedTemplateId) return;
    setBusyKey('apply');
    setFeedback(null);
    const result = await applyProposalChecklist({
      proposalId: selectedProposalId,
      templateVersionId: effectiveSelectedTemplateId,
    });
    setBusyKey(null);
    setFeedback(
      result.success
        ? 'Checklist aplicado à proposta.'
        : result.error ?? 'Não foi possível aplicar o checklist.'
    );
  }

  async function handleTransition(
    checklistId: string,
    itemId: string,
    expectedVersion: number,
    targetState: Exclude<ProposalChecklistItemState, 'pending'>
  ) {
    const key = `${checklistId}:${itemId}`;
    setBusyKey(key);
    setFeedback(null);
    const result = await transitionProposalChecklistItem({
      checklistId,
      itemId,
      expectedVersion,
      targetState,
      documentId: targetState === 'received' ? selectedDocuments[itemId] : undefined,
      reason: decisionReasons[itemId]?.trim() || undefined,
    });
    setBusyKey(null);
    setFeedback(
      result.success
        ? `Requisito atualizado para “${PROPOSAL_CHECKLIST_STATE_LABELS[targetState]}”.`
        : result.error ?? 'Não foi possível atualizar o requisito.'
    );
  }

  return (
    <div id="page-proposal-checklists" className={DOCUMENT_THEME.page}>
      <header className="flex flex-col gap-4 border-b border-[#0B3D2E]/15 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => navigate(ROUTES.DOCUMENTS)}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos documentos
          </button>
          <h1 className="mt-5 text-2xl font-bold text-[#0B3D2E] sm:text-3xl">Checklists de propostas</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#0B3D2E]/70">
            Organize documentos obrigatórios, acompanhe a análise e preserve cada decisão da equipe.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={DOCUMENT_THEME.buttonSecondary}
            onClick={() => void refreshChecklistDashboard()}
            disabled={checklistStatus === 'loading'}
          >
            <RefreshCw className={`h-4 w-4 ${checklistStatus === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
            Atualizar
          </button>
          {canManage ? (
            <button type="button" className={DOCUMENT_THEME.buttonPrimary} onClick={() => setShowTemplateForm(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Novo modelo
            </button>
          ) : null}
        </div>
      </header>

      {feedback ? (
        <p role="status" className={`${DOCUMENT_THEME.surfaceSoft} px-4 py-3 text-sm font-semibold text-[#0B3D2E]`}>
          {feedback}
        </p>
      ) : null}

      {checklistStatus === 'unavailable' || checklistStatus === 'error' ? (
        <section className={`${DOCUMENT_THEME.surface} p-6`}>
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
            <div>
              <h2 className="font-bold text-[#0B3D2E]">Checklists indisponíveis</h2>
              <p className="mt-1 text-sm text-[#0B3D2E]/70">{checklistErrorMessage}</p>
            </div>
          </div>
        </section>
      ) : null}

      {checklistDashboard ? (
        <section aria-label="Resumo dos checklists" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Propostas acompanhadas', checklistDashboard.totals.proposalsWithChecklist],
            ['Pendentes', checklistDashboard.totals.pending],
            ['Em análise', checklistDashboard.totals.inReview],
            ['Exigem atenção', checklistDashboard.totals.rejected + checklistDashboard.totals.expired + checklistDashboard.totals.overdue],
          ].map(([label, value]) => (
            <article key={label} className={`${DOCUMENT_THEME.surface} p-5`}>
              <p className="text-sm text-[#0B3D2E]/65">{label}</p>
              <p className="mt-2 text-3xl font-bold text-[#0B3D2E]">{value}</p>
            </article>
          ))}
        </section>
      ) : null}

      {showTemplateForm && canManage ? (
        <form className={`${DOCUMENT_THEME.surface} space-y-5 p-5 sm:p-6`} onSubmit={handleTemplateSubmit}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#0B3D2E]">
                <Settings2 className="h-5 w-5" aria-hidden="true" />
                {editingTemplate ? 'Criar nova versão do modelo' : 'Configurar modelo'}
              </h2>
              <p className="mt-1 text-sm text-[#0B3D2E]/70">Defina quando o modelo será oferecido e quais documentos serão exigidos.</p>
            </div>
            <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={resetTemplateForm} aria-label="Fechar formulário">
              <X className="h-4 w-4" aria-hidden="true" /> Fechar
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Nome do modelo</span>
              <input className={DOCUMENT_THEME.input} value={templateName} onChange={(event) => setTemplateName(event.target.value)} minLength={3} maxLength={120} required />
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Tipo de proposta</span>
              <select className={DOCUMENT_THEME.input} value={proposalType} onChange={(event) => setProposalType(event.target.value as ProposalType | 'all')}>
                {TYPE_OPTIONS.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Categoria da proposta</span>
              <select className={DOCUMENT_THEME.input} value={proposalCategory} onChange={(event) => setProposalCategory(event.target.value as ProposalCategory | 'all')}>
                {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
              </select>
            </label>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-[#0B3D2E]">Requisitos documentais</h3>
              <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => setTemplateItems((current) => [...current, emptyTemplateItem()])} disabled={templateItems.length >= 50}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar requisito
              </button>
            </div>
            {templateItems.map((item, index) => (
              <fieldset key={`template-item-${index}`} className={`${DOCUMENT_THEME.surfaceSoft} grid gap-3 p-4 lg:grid-cols-6`}>
                <legend className="px-2 text-sm font-bold text-[#0B3D2E]">Requisito {index + 1}</legend>
                <label className="text-sm font-semibold text-[#0B3D2E] lg:col-span-2"><span className="mb-1 block">Título</span><input className={DOCUMENT_THEME.input} value={item.title} onChange={(event) => updateTemplateItem(index, { title: event.target.value })} minLength={3} maxLength={120} required /></label>
                <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1 block">Documento</span><select className={DOCUMENT_THEME.input} value={item.category} onChange={(event) => updateTemplateItem(index, { category: event.target.value as DocumentCategory })}>{DOCUMENT_CATEGORIES.map((category) => <option key={category} value={category}>{DOCUMENT_CATEGORY_LABELS[category]}</option>)}</select></label>
                <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1 block">Acesso</span><select className={DOCUMENT_THEME.input} value={item.accessScope} onChange={(event) => updateTemplateItem(index, { accessScope: event.target.value as DocumentAccessScope })}>{(Object.keys(ACCESS_LABELS) as DocumentAccessScope[]).map((scope) => <option key={scope} value={scope}>{ACCESS_LABELS[scope]}</option>)}</select></label>
                <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1 block">Prazo em dias</span><input className={DOCUMENT_THEME.input} type="number" min={0} max={3650} value={item.dueInDays ?? ''} onChange={(event) => updateTemplateItem(index, { dueInDays: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
                <div className="flex items-end gap-2"><label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#0B3D2E]"><input type="checkbox" checked={item.required} onChange={(event) => updateTemplateItem(index, { required: event.target.checked })} /> Obrigatório</label>{templateItems.length > 1 ? <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => setTemplateItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remover requisito ${index + 1}`}><X className="h-4 w-4" aria-hidden="true" /></button> : null}</div>
              </fieldset>
            ))}
          </div>
          <label className="block text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Motivo da configuração</span><textarea className={DOCUMENT_THEME.textarea} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} minLength={3} maxLength={300} required /></label>
          <button type="submit" className={DOCUMENT_THEME.buttonPrimary} disabled={busyKey === 'template'}>{busyKey === 'template' ? 'Salvando…' : editingTemplate ? 'Registrar nova versão' : 'Criar modelo'}</button>
        </form>
      ) : null}

      <section className={`${DOCUMENT_THEME.surface} space-y-5 p-5 sm:p-6`} aria-labelledby="apply-checklist-title">
        <div>
          <h2 id="apply-checklist-title" className="flex items-center gap-2 text-lg font-bold text-[#0B3D2E]"><ClipboardCheck className="h-5 w-5" aria-hidden="true" /> Checklist por proposta</h2>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">Selecione uma proposta para consultar ou, quando autorizado, aplicar um modelo compatível.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Proposta</span><select className={DOCUMENT_THEME.input} value={selectedProposalId} onChange={(event) => setSelectedProposalId(event.target.value)}><option value="">Todas as propostas visíveis</option>{selectableProposals.map((proposal) => <option key={proposal.id} value={proposal.id}>{proposal.proposalNumber} — {proposal.title}</option>)}</select></label>
          {canManage ? <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Modelo compatível</span><select className={DOCUMENT_THEME.input} value={effectiveSelectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={!selectedProposal}><option value="">Selecione</option>{matchingTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · versão {template.versionNumber}</option>)}</select></label> : <div />}
          {canManage ? <button type="button" className={DOCUMENT_THEME.buttonPrimary} onClick={() => void handleApplyChecklist()} disabled={!selectedProposalId || !effectiveSelectedTemplateId || busyKey === 'apply'}>{busyKey === 'apply' ? 'Aplicando…' : 'Aplicar modelo'}</button> : null}
        </div>
      </section>

      {canManage && (checklistDashboard?.templates.length ?? 0) > 0 ? (
        <section className="space-y-3" aria-labelledby="template-list-title">
          <div className="flex items-center justify-between gap-3"><h2 id="template-list-title" className="text-lg font-bold text-[#0B3D2E]">Modelos da organização</h2><span className={DOCUMENT_THEME.badge}>{checklistDashboard?.templates.length} modelo(s)</span></div>
          <div className="grid gap-3 lg:grid-cols-2">
            {checklistDashboard?.templates.map((template) => (
              <article key={template.id} className={`${DOCUMENT_THEME.surface} p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-[#0B3D2E]">{template.name}</h3><p className="mt-1 text-sm text-[#0B3D2E]/70">{TYPE_LABELS[template.proposalType]} · {CATEGORY_LABELS[template.proposalCategory]}</p></div><span className={DOCUMENT_THEME.badge}>Versão {template.versionNumber}</span></div>
                <p className="mt-3 text-sm text-[#0B3D2E]">{template.items.length} requisito(s) · configurado por {template.createdByDisplayName}</p>
                <button type="button" className={`${DOCUMENT_THEME.buttonSecondary} mt-4`} onClick={() => editTemplate(template)}><Settings2 className="h-4 w-4" aria-hidden="true" /> Criar nova versão</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {visibleAgendaEntries.length > 0 ? (
        <section className={`${DOCUMENT_THEME.surfaceSoft} p-5 sm:p-6`} aria-labelledby="checklist-agenda-title">
          <h2 id="checklist-agenda-title" className="flex items-center gap-2 text-lg font-bold text-[#0B3D2E]"><CalendarClock className="h-5 w-5" aria-hidden="true" /> Prazos documentais</h2>
          <ul className="mt-4 grid gap-3 lg:grid-cols-2">{visibleAgendaEntries.map((entry) => <li key={entry.id} className="rounded-xl border border-[#0B3D2E]/15 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-[#0B3D2E]">{entry.itemTitle}</p><p className="mt-1 text-sm text-[#0B3D2E]/70">{entry.proposalNumber} — {entry.proposalTitle}</p></div><span className={DOCUMENT_THEME.badge}>{entry.isOverdue ? 'Prazo vencido' : formatDate(entry.dueOn)}</span></div></li>)}</ul>
        </section>
      ) : null}

      {visibleChecklists.length === 0 && checklistStatus !== 'loading' ? (
        <section className={`${DOCUMENT_THEME.surface} p-8 text-center`}><ClipboardCheck className="mx-auto h-9 w-9 text-[#0B3D2E]" aria-hidden="true" /><h2 className="mt-3 font-bold text-[#0B3D2E]">Nenhum checklist encontrado</h2><p className="mt-1 text-sm text-[#0B3D2E]/70">A lista será preenchida somente quando um modelo for aplicado a uma proposta real.</p></section>
      ) : null}

      <section className="space-y-5" aria-label="Checklists aplicados">
        {visibleChecklists.map((checklist) => (
          <article key={checklist.id} className={`${DOCUMENT_THEME.surface} overflow-hidden`}>
            <header className="border-b border-[#0B3D2E]/15 bg-[#78C89A]/10 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-[#0B3D2E]">{checklist.proposalNumber} — {checklist.proposalTitle}</h2><p className="mt-1 text-sm text-[#0B3D2E]/70">{checklist.templateName} · versão {checklist.templateVersionNumber}</p></div><span className={DOCUMENT_THEME.badge}>{checklist.status === 'completed' ? 'Concluído' : 'Em andamento'}</span></div></header>
            <ul className="space-y-4 p-5 sm:p-6">{checklist.items.map((item) => {
              const key = `${checklist.id}:${item.id}`;
              const compatibleDocuments = (documentsByCategory.get(item.category) ?? []).filter(
                (document) => !document.expiresOn || document.expiresOn >= currentUtcDate
              );
              const isBusy = busyKey === key;
              const linkedDocument = item.linkedDocumentId
                ? documentsById.get(item.linkedDocumentId)
                : undefined;
              const linkedExpired = Boolean(
                linkedDocument?.expiresOn && linkedDocument.expiresOn < currentUtcDate
              );
              return <li key={item.id} className={`rounded-2xl border p-4 sm:p-5 ${stateClass(item.state)}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-[#0B3D2E]">{item.title}</h3><p className="mt-1 text-sm text-[#0B3D2E]/70">{DOCUMENT_CATEGORY_LABELS[item.category]} · {item.required ? 'Obrigatório' : 'Opcional'} · {formatDate(item.dueOn)}</p></div><span className={DOCUMENT_THEME.badge}>{PROPOSAL_CHECKLIST_STATE_LABELS[item.state]}</span></div>{item.linkedDocumentId ? <button type="button" className={`${DOCUMENT_THEME.buttonSecondary} mt-3`} onClick={() => navigate(getDocumentReferencePath(item.linkedDocumentId!))}><FileCheck2 className="h-4 w-4" aria-hidden="true" /> Abrir documento recebido</button> : null}
                {(item.state === 'pending' || item.state === 'rejected' || item.state === 'expired') && canFulfill ? <div className="mt-4 grid gap-3 border-t border-[#0B3D2E]/15 pt-4 lg:grid-cols-[minmax(0,1fr)_auto]"><label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1 block">Documento recebido</span><select className={DOCUMENT_THEME.input} value={selectedDocuments[item.id] ?? ''} onChange={(event) => setSelectedDocuments((current) => ({ ...current, [item.id]: event.target.value }))} disabled={documentsLoading}><option value="">Selecione</option>{compatibleDocuments.map((document) => <option key={document.id} value={document.id}>{document.displayName} · versão {document.versionNumber}</option>)}</select></label><button type="button" className={DOCUMENT_THEME.buttonPrimary} onClick={() => void handleTransition(checklist.id, item.id, item.versionNumber, 'received')} disabled={!selectedDocuments[item.id] || isBusy}>{isBusy ? 'Salvando…' : 'Marcar como recebido'}</button></div> : null}
                {item.state === 'received' && canReview ? <div className="mt-4 flex flex-wrap gap-2 border-t border-[#0B3D2E]/15 pt-4"><button type="button" className={DOCUMENT_THEME.buttonPrimary} onClick={() => void handleTransition(checklist.id, item.id, item.versionNumber, 'in_review')} disabled={isBusy}><ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Iniciar análise</button>{linkedExpired ? <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => void handleTransition(checklist.id, item.id, item.versionNumber, 'expired')} disabled={isBusy}>Registrar expiração</button> : null}</div> : null}
                {item.state === 'in_review' && canReview ? <div className="mt-4 space-y-3 border-t border-[#0B3D2E]/15 pt-4"><label className="block text-sm font-semibold text-[#0B3D2E]"><span className="mb-1 block">Observação da decisão</span><textarea className={DOCUMENT_THEME.textarea} value={decisionReasons[item.id] ?? ''} onChange={(event) => setDecisionReasons((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={500} /></label><div className="flex flex-wrap gap-2"><button type="button" className={DOCUMENT_THEME.buttonPrimary} onClick={() => void handleTransition(checklist.id, item.id, item.versionNumber, 'approved')} disabled={isBusy}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Aprovar</button><button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => void handleTransition(checklist.id, item.id, item.versionNumber, 'rejected')} disabled={isBusy || (decisionReasons[item.id]?.trim().length ?? 0) < 3}>Recusar</button>{linkedExpired ? <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => void handleTransition(checklist.id, item.id, item.versionNumber, 'expired')} disabled={isBusy}>Registrar expiração</button> : null}</div></div> : null}
                {item.state === 'approved' && canReview && linkedExpired ? <div className="mt-4 border-t border-[#0B3D2E]/15 pt-4"><button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => void handleTransition(checklist.id, item.id, item.versionNumber, 'expired')} disabled={isBusy}>Registrar expiração</button></div> : null}
              </li>;
            })}</ul>
            <details className="border-t border-[#0B3D2E]/15 p-5 sm:p-6"><summary className="flex min-h-[44px] cursor-pointer items-center gap-2 font-bold text-[#0B3D2E]"><History className="h-5 w-5" aria-hidden="true" /> Histórico de decisões ({checklist.history.length})</summary><ol className="mt-4 space-y-3">{[...checklist.history].reverse().map((entry) => <li key={entry.id} className="rounded-xl border border-[#0B3D2E]/15 bg-white p-4"><p className="font-semibold text-[#0B3D2E]">{entry.fromState ? `${PROPOSAL_CHECKLIST_STATE_LABELS[entry.fromState]} → ` : ''}{PROPOSAL_CHECKLIST_STATE_LABELS[entry.toState]}</p><p className="mt-1 text-sm text-[#0B3D2E]/70">{entry.actorDisplayName} · {formatDateTime(entry.occurredAt)}</p>{entry.reason ? <p className="mt-2 text-sm text-[#0B3D2E]">{entry.reason}</p> : null}</li>)}</ol></details>
          </article>
        ))}
      </section>
    </div>
  );
}
