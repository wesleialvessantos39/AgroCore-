import { Archive, CalendarClock, ClipboardCheck, ClipboardList, FileCheck2, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthorization } from '../authorization/useAuthorization';
import { DOCUMENT_THEME } from '../documents/theme';
import { useDocuments } from '../documents/DocumentsContext';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_OWNER_LABELS,
  type DocumentCategory,
  type DocumentLogicalOwnerType,
  type DocumentReferenceStatus,
} from '../types/documents';
import { ROUTES, getDocumentReferencePath } from '../routes/paths';

const STATUS_LABELS: Readonly<Record<DocumentReferenceStatus, string>> = Object.freeze({
  active: 'Ativa',
  superseded: 'Substituída',
  archived: 'Arquivada',
});

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function DocumentsPage() {
  const navigate = useNavigate();
  const { can } = useAuthorization();
  const { status, references, filters, setFilters, refresh, errorMessage, isLoading } = useDocuments();

  return (
    <div id="page-documents" className={DOCUMENT_THEME.page}>
      <header className="flex flex-col gap-4 border-b border-[#0B3D2E]/15 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0B3D2E] sm:text-3xl">Documentos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#0B3D2E]/70 sm:text-base">
            Organize e acompanhe os documentos usados nos atendimentos da empresa.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={DOCUMENT_THEME.buttonSecondary}
            onClick={() => void refresh()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Atualizar
          </button>
          {can('documents:view_requirements') && (
            <>
              <button
                type="button"
                className={DOCUMENT_THEME.buttonSecondary}
                onClick={() => navigate(ROUTES.PROPOSAL_CHECKLISTS)}
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                Checklists de propostas
              </button>
              <button
                type="button"
                className={DOCUMENT_THEME.buttonSecondary}
                onClick={() => navigate(ROUTES.DOCUMENT_REQUIREMENTS)}
              >
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                Pendências e prazos
              </button>
            </>
          )}
          <button
            type="button"
            className={DOCUMENT_THEME.buttonSecondary}
            onClick={() => navigate(ROUTES.DOCUMENT_COMPLIANCE)}
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Validades e saídas
          </button>
          {can('documents:upload') && (
            <button
              type="button"
              className={DOCUMENT_THEME.buttonPrimary}
              onClick={() => navigate(ROUTES.DOCUMENTS_NEW)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Enviar documentos
            </button>
          )}
        </div>
      </header>

      <section className={`${DOCUMENT_THEME.surfaceSoft} p-4`} aria-label="Disponibilidade de arquivos">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-[#0B3D2E]">
            Os arquivos são protegidos por empresa e só podem ser abertos ou baixados por pessoas autorizadas.
          </p>
        </div>
      </section>

      <section className={`${DOCUMENT_THEME.surface} p-4 sm:p-5`} aria-labelledby="document-filters-title">
        <h2 id="document-filters-title" className="text-base font-bold text-[#0B3D2E]">Filtros</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block text-sm font-semibold text-[#0B3D2E]">
            <span className="mb-1.5 block">Buscar pelo nome</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[#0B3D2E]/55" aria-hidden="true" />
              <input
                className={`${DOCUMENT_THEME.input} pl-9`}
                value={filters.search ?? ''}
                maxLength={100}
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                placeholder="Nome do documento"
              />
            </span>
          </label>

          <label className="block text-sm font-semibold text-[#0B3D2E]">
            <span className="mb-1.5 block">Relacionado a</span>
            <select
              className={DOCUMENT_THEME.input}
              value={filters.ownerType ?? 'all'}
              onChange={(event) => setFilters({ ...filters, ownerType: event.target.value as DocumentLogicalOwnerType | 'all' })}
            >
              <option value="all">Todas</option>
              {Object.entries(DOCUMENT_OWNER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-[#0B3D2E]">
            <span className="mb-1.5 block">Categoria</span>
            <select
              className={DOCUMENT_THEME.input}
              value={filters.category ?? 'all'}
              onChange={(event) => setFilters({ ...filters, category: event.target.value as DocumentCategory | 'all' })}
            >
              <option value="all">Todas</option>
              {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-[#0B3D2E]">
            <span className="mb-1.5 block">Situação</span>
            <select
              className={DOCUMENT_THEME.input}
              value={filters.status ?? 'all'}
              onChange={(event) => setFilters({ ...filters, status: event.target.value as DocumentReferenceStatus | 'all' })}
            >
              <option value="all">Todas</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section aria-labelledby="document-list-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="document-list-title" className="text-lg font-bold text-[#0B3D2E]">Documentos disponíveis</h2>
          <span className="text-sm text-[#0B3D2E]/65">{references.length} registro(s)</span>
        </div>

        {status === 'loading' && (
          <div className={`${DOCUMENT_THEME.surfaceSoft} p-8 text-center`} role="status" aria-live="polite">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#0B3D2E]" aria-hidden="true" />
            <p className="mt-3 text-sm text-[#0B3D2E]">Carregando documentos…</p>
          </div>
        )}

        {(['error', 'unavailable', 'forbidden'] as const).includes(status as 'error' | 'unavailable' | 'forbidden') && (
          <div className={`${DOCUMENT_THEME.surfaceSoft} p-6`} role="alert" aria-live="assertive">
            <p className="font-semibold text-[#0B3D2E]">Não foi possível mostrar os documentos.</p>
            <p className="mt-1 text-sm text-[#0B3D2E]/70">{errorMessage ?? 'Acesso ou serviço indisponível.'}</p>
            <button type="button" className={`${DOCUMENT_THEME.buttonSecondary} mt-4`} onClick={() => void refresh()}>
              Tentar novamente
            </button>
          </div>
        )}

        {status === 'empty' && (
          <div className={`${DOCUMENT_THEME.surfaceSoft} p-8 text-center`}>
            <Archive className="mx-auto h-7 w-7 text-[#0B3D2E]" aria-hidden="true" />
            <p className="mt-3 font-semibold text-[#0B3D2E]">Nenhum documento encontrado</p>
            <p className="mt-1 text-sm text-[#0B3D2E]/70">
              Ajuste os filtros ou adicione um documento quando houver um atendimento disponível.
            </p>
          </div>
        )}

        {status === 'ready' && (
          <ul className="grid gap-4 lg:grid-cols-2">
            {references.map((reference) => (
              <li key={reference.id} className={`${DOCUMENT_THEME.surface} overflow-hidden`}>
                <button
                  type="button"
                  className="flex min-h-[132px] w-full items-start gap-4 p-5 text-left hover:bg-[#78C89A]/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#78C89A]"
                  onClick={() => navigate(getDocumentReferencePath(reference.id))}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#78C89A]/15 text-[#0B3D2E]">
                    <FileCheck2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="break-words font-bold text-[#0B3D2E]">{reference.displayName}</span>
                      <span className={DOCUMENT_THEME.badge}>{STATUS_LABELS[reference.status]}</span>
                    </span>
                    <span className="mt-2 block text-sm text-[#0B3D2E]/70">
                      {DOCUMENT_CATEGORY_LABELS[reference.category]} · {DOCUMENT_OWNER_LABELS[reference.logicalOwnerType]}
                    </span>
                    <span className="mt-1 block text-xs text-[#0B3D2E]/55">
                      Versão {reference.versionNumber} · Atualizada em {formatDate(reference.updatedAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
