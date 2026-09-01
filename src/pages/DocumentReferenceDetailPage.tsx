import { Archive, ArrowLeft, Download, Eye, FileClock, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthorization } from '../authorization/useAuthorization';
import { useDocuments } from '../documents/DocumentsContext';
import { DOCUMENT_THEME } from '../documents/theme';
import { sanitizeDownloadFileName } from '../documents/documentStoragePolicy';
import { ROUTES, getDocumentReferencePath } from '../routes/paths';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_OWNER_LABELS,
  type DocumentMimeType,
  type DocumentReference,
} from '../types/documents';

const MIME_LABELS: Readonly<Record<DocumentMimeType, string>> = Object.freeze({
  'application/pdf': 'PDF',
  'image/jpeg': 'Imagem JPEG',
  'image/png': 'Imagem PNG',
  'image/tiff': 'Imagem TIFF',
});

const STATUS_LABELS = Object.freeze({
  active: 'Ativa',
  superseded: 'Substituída',
  archived: 'Arquivada',
});

const ACCESS_LABELS = Object.freeze({
  organization: 'Organização',
  participants: 'Pessoas envolvidas no atendimento',
  management: 'Somente gestores',
});

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatDate(value?: string): string {
  if (!value) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

export function DocumentReferenceDetailPage() {
  const { documentId = '' } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { can } = useAuthorization();
  const { getReferenceById, replaceReference, archiveReference, getDocumentContent } = useDocuments();
  const [reference, setReference] = useState<DocumentReference | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [mimeType, setMimeType] = useState<DocumentMimeType>('application/pdf');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const [busyAction, setBusyAction] = useState<'replace' | 'archive' | null>(null);
  const [contentBusy, setContentBusy] = useState<'preview' | 'download' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setFeedback(null);
      try {
        const result = await getReferenceById(documentId);
        if (!active) return;
        setReference(result);
        if (result) {
          setDisplayName(result.displayName);
          setMimeType(result.mimeType);
          setIssuedOn(result.issuedOn ?? '');
          setExpiresOn(result.expiresOn ?? '');
          setNotes(result.notes ?? '');
        }
      } catch (error) {
        if (active) setFeedback(error instanceof Error ? error.message : 'Não foi possível consultar o documento.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [documentId, getReferenceById]);

  async function handleReplace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reference) return;
    setBusyAction('replace');
    setFeedback(null);
    const result = await replaceReference({
      previousDocumentId: reference.id,
      expectedVersion: reference.versionNumber,
      displayName,
      mimeType,
      issuedOn: issuedOn || undefined,
      expiresOn: expiresOn || undefined,
      notes: notes || undefined,
    });
    setBusyAction(null);
    if (!result.success || !result.data) {
      setFeedback(result.error ?? 'Não foi possível salvar a nova versão.');
      return;
    }
    navigate(getDocumentReferencePath(result.data.id), { replace: true });
  }

  async function handleArchive(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reference) return;
    setBusyAction('archive');
    setFeedback(null);
    const result = await archiveReference({
      documentId: reference.id,
      expectedVersion: reference.versionNumber,
      reason: archiveReason,
    });
    setBusyAction(null);
    if (!result.success || !result.data) {
      setFeedback(result.error ?? 'Não foi possível arquivar o documento.');
      return;
    }
    setReference(result.data);
    setArchiveReason('');
    setFeedback('Documento arquivado.');
  }

  async function handlePreview() {
    if (!reference) return;
    setContentBusy('preview');
    setFeedback(null);
    try {
      const content = await getDocumentContent(reference.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(content.blob));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível abrir o arquivo.');
    } finally {
      setContentBusy(null);
    }
  }

  async function handleDownload() {
    if (!reference) return;
    setContentBusy('download');
    setFeedback(null);
    try {
      const content = await getDocumentContent(reference.id);
      const url = URL.createObjectURL(content.blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = sanitizeDownloadFileName(content.displayName, content.mimeType);
      anchor.rel = 'noopener noreferrer';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível baixar o arquivo.');
    } finally {
      setContentBusy(null);
    }
  }

  if (loading) {
    return (
      <div className={`${DOCUMENT_THEME.surfaceSoft} p-8 text-center`} role="status" aria-live="polite">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#0B3D2E]" aria-hidden="true" />
        <p className="mt-3 text-sm text-[#0B3D2E]">Carregando documento…</p>
      </div>
    );
  }

  if (!reference) {
    return (
      <div className={DOCUMENT_THEME.page}>
        <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => navigate(ROUTES.DOCUMENTS)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar
        </button>
        <div className={`${DOCUMENT_THEME.surfaceSoft} mt-5 p-6`} role="alert">
          <p className="font-semibold text-[#0B3D2E]">Documento não encontrado ou fora do seu acesso.</p>
          {feedback && <p className="mt-1 text-sm text-[#0B3D2E]/70">{feedback}</p>}
        </div>
      </div>
    );
  }

  return (
    <div id="page-document-detail" className={DOCUMENT_THEME.page}>
      <header className="border-b border-[#0B3D2E]/15 pb-5">
        <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => navigate(ROUTES.DOCUMENTS)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos documentos
        </button>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <h1 className="break-words text-2xl font-bold text-[#0B3D2E] sm:text-3xl">{reference.displayName}</h1>
          <span className={DOCUMENT_THEME.badge}>{STATUS_LABELS[reference.status]}</span>
        </div>
        <p className="mt-2 text-sm text-[#0B3D2E]/70">
          {DOCUMENT_CATEGORY_LABELS[reference.category]} · versão {reference.versionNumber}
        </p>
      </header>

      <section className={`${DOCUMENT_THEME.surfaceSoft} flex items-start gap-3 p-4`} aria-label="Natureza do registro">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-[#0B3D2E]">
          {reference.storageState === 'stored'
            ? 'O arquivo está protegido e só é carregado após a verificação do seu acesso.'
            : 'Este registro ainda possui apenas as informações de identificação, sem arquivo disponível.'}
        </p>
      </section>

      {reference.storageState === 'stored' && can('documents:download') && (
        <section className={`${DOCUMENT_THEME.surface} space-y-4 p-5 sm:p-6`} aria-labelledby="document-file-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="document-file-title" className="text-lg font-bold text-[#0B3D2E]">Arquivo protegido</h2>
              <p className="mt-1 text-sm text-[#0B3D2E]/70">A abertura acontece somente nesta sessão. O download exige uma ação explícita.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {reference.mimeType !== 'image/tiff' && (
                <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={handlePreview} disabled={contentBusy !== null}>
                  <Eye className="h-4 w-4" aria-hidden="true" /> {contentBusy === 'preview' ? 'Abrindo…' : 'Visualizar'}
                </button>
              )}
              <button type="button" className={DOCUMENT_THEME.buttonPrimary} onClick={handleDownload} disabled={contentBusy !== null}>
                <Download className="h-4 w-4" aria-hidden="true" /> {contentBusy === 'download' ? 'Preparando…' : 'Baixar arquivo'}
              </button>
            </div>
          </div>
          {previewUrl && (
            <div className="space-y-3 border-t border-[#0B3D2E]/15 pt-4">
              <div className="flex justify-end">
                <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>
                  <X className="h-4 w-4" aria-hidden="true" /> Fechar visualização
                </button>
              </div>
              {reference.mimeType === 'application/pdf' ? (
                <iframe className="h-[70vh] w-full rounded-xl border border-[#0B3D2E]/20 bg-[#FFFFFF]" src={previewUrl} title={`Visualização de ${reference.displayName}`} sandbox="" />
              ) : (
                <img className="max-h-[70vh] w-full rounded-xl border border-[#0B3D2E]/20 bg-[#FFFFFF] object-contain" src={previewUrl} alt={`Visualização de ${reference.displayName}`} />
              )}
            </div>
          )}
        </section>
      )}

      <section className={`${DOCUMENT_THEME.surface} p-5 sm:p-6`} aria-labelledby="document-information-title">
        <h2 id="document-information-title" className="text-lg font-bold text-[#0B3D2E]">Informações do documento</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Relacionado a</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{DOCUMENT_OWNER_LABELS[reference.logicalOwnerType]}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Formato</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{MIME_LABELS[reference.mimeType]}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Quem pode consultar</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{ACCESS_LABELS[reference.accessScope]}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Emissão</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatDate(reference.issuedOn)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Validade</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatDate(reference.expiresOn)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Criada em</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatDateTime(reference.createdAt)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Atualizada em</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatDateTime(reference.updatedAt)}</dd></div>
          {reference.notes && <div className="sm:col-span-2 xl:col-span-3"><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Observação</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-[#0B3D2E]">{reference.notes}</dd></div>}
        </dl>
        {reference.predecessorDocumentId && (
          <button type="button" className={`${DOCUMENT_THEME.buttonSecondary} mt-5`} onClick={() => navigate(getDocumentReferencePath(reference.predecessorDocumentId!))}>
            <FileClock className="h-4 w-4" aria-hidden="true" /> Consultar versão anterior
          </button>
        )}
      </section>

      <div aria-live="polite">
        {feedback && <p className={`${DOCUMENT_THEME.surfaceSoft} p-3 text-sm font-semibold text-[#0B3D2E]`} role="alert">{feedback}</p>}
      </div>

      {reference.status === 'active' && reference.storageState === 'metadata_only' && can('documents:register_reference') && (
        <form className={`${DOCUMENT_THEME.surface} space-y-4 p-5 sm:p-6`} onSubmit={handleReplace}>
          <div>
            <h2 className="text-lg font-bold text-[#0B3D2E]">Atualizar informações</h2>
            <p className="mt-1 text-sm text-[#0B3D2E]/70">A versão atual continuará disponível no histórico.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Nome do documento</span><input className={DOCUMENT_THEME.input} value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={3} maxLength={120} required /></label>
            <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Formato</span><select className={DOCUMENT_THEME.input} value={mimeType} onChange={(event) => setMimeType(event.target.value as DocumentMimeType)}>{Object.entries(MIME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Emissão</span><input className={DOCUMENT_THEME.input} type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} /></label>
              <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Validade</span><input className={DOCUMENT_THEME.input} type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label>
            </div>
          </div>
          <label className="block text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Observação opcional</span><textarea className={DOCUMENT_THEME.textarea} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} /></label>
          <button type="submit" className={DOCUMENT_THEME.buttonPrimary} disabled={busyAction !== null}>{busyAction === 'replace' ? 'Salvando…' : 'Salvar nova versão'}</button>
        </form>
      )}

      {reference.status !== 'archived' && can('documents:manage') && (
        <form className={`${DOCUMENT_THEME.surface} space-y-4 p-5 sm:p-6`} onSubmit={handleArchive}>
          <div>
            <h2 className="text-lg font-bold text-[#0B3D2E]">Arquivar documento</h2>
            <p className="mt-1 text-sm text-[#0B3D2E]/70">As informações serão preservadas, mas o documento deixará de aparecer como ativo.</p>
          </div>
          <label className="block text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Motivo obrigatório</span><textarea className={DOCUMENT_THEME.textarea} value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} minLength={3} maxLength={240} required /></label>
          <button type="submit" className={DOCUMENT_THEME.buttonSecondary} disabled={busyAction !== null || archiveReason.trim().length < 3}>
            <Archive className="h-4 w-4" aria-hidden="true" /> {busyAction === 'archive' ? 'Arquivando…' : 'Arquivar documento'}
          </button>
        </form>
      )}
    </div>
  );
}
