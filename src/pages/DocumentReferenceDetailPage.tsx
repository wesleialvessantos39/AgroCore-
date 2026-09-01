import {
  Archive,
  ArrowLeft,
  Ban,
  Download,
  Eye,
  FileClock,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthorization } from '../authorization/useAuthorization';
import { useDocuments } from '../documents/DocumentsContext';
import { sanitizeDownloadFileName } from '../documents/documentStoragePolicy';
import { DOCUMENT_THEME } from '../documents/theme';
import { compareDocumentVersionMetadata } from '../documents/documentVersioning';
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
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value));
}

function formatDate(value?: string): string {
  if (!value) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`));
}

function formatFileSize(value?: number): string {
  if (!value) return 'Não informado';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentReferenceDetailPage() {
  const { documentId = '' } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { can } = useAuthorization();
  const {
    listVersionHistory,
    replaceReference,
    replaceStoredDocument,
    archiveReference,
    getDocumentContent,
  } = useDocuments();
  const [reference, setReference] = useState<DocumentReference | null>(null);
  const [history, setHistory] = useState<readonly DocumentReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [mimeType, setMimeType] = useState<DocumentMimeType>('application/pdf');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [versionNote, setVersionNote] = useState('');
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [versionProgress, setVersionProgress] = useState(0);
  const [archiveReason, setArchiveReason] = useState('');
  const [busyAction, setBusyAction] = useState<'replace' | 'archive' | null>(null);
  const [contentBusy, setContentBusy] = useState<'preview' | 'download' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const versionAbortController = useRef<AbortController | null>(null);

  useEffect(() => () => {
    versionAbortController.current?.abort();
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setFeedback(null);
      setReference(null);
      setHistory([]);
      setPreviewUrl(null);
      try {
        const versions = await listVersionHistory(documentId, controller.signal);
        if (!active || controller.signal.aborted) return;
        const result = versions.find((version) => version.id === documentId) ?? null;
        setReference(result);
        if (result) {
          setHistory(versions);
          setDisplayName(result.displayName);
          setMimeType(result.mimeType);
          setIssuedOn(result.issuedOn ?? '');
          setExpiresOn(result.expiresOn ?? '');
          setNotes(result.notes ?? '');
          setVersionNote('');
          setReplacementFile(null);
          setVersionProgress(0);
        } else {
          setHistory([]);
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setFeedback(error instanceof Error ? error.message : 'Não foi possível consultar o documento.');
        }
      } finally {
        if (active && !controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [documentId, listVersionHistory]);

  const predecessor = useMemo(
    () => reference?.predecessorDocumentId
      ? history.find((version) => version.id === reference.predecessorDocumentId) ?? null
      : null,
    [history, reference]
  );
  const currentVersion = useMemo(
    () => history.find((version) => version.isCurrent) ?? null,
    [history]
  );
  const metadataChanges = useMemo(
    () => reference && predecessor
      ? compareDocumentVersionMetadata(predecessor, reference)
      : [],
    [predecessor, reference]
  );

  async function handleMetadataReplace(event: React.FormEvent<HTMLFormElement>) {
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
      versionNote,
    });
    setBusyAction(null);
    if (!result.success || !result.data) {
      setFeedback(result.error ?? 'Não foi possível salvar a nova versão.');
      return;
    }
    navigate(getDocumentReferencePath(result.data.id), { replace: true });
  }

  async function handleStoredReplace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reference || !replacementFile) return;
    const controller = new AbortController();
    versionAbortController.current = controller;
    setBusyAction('replace');
    setVersionProgress(0);
    setFeedback(null);
    try {
      const result = await replaceStoredDocument(
        replacementFile,
        {
          previousDocumentId: reference.id,
          expectedVersion: reference.versionNumber,
          displayName,
          issuedOn: issuedOn || undefined,
          expiresOn: expiresOn || undefined,
          notes: notes || undefined,
          versionNote,
        },
        (progress) => setVersionProgress(progress.percentage),
        controller.signal
      );
      navigate(getDocumentReferencePath(result.id), { replace: true });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível concluir a nova versão.');
    } finally {
      if (versionAbortController.current === controller) versionAbortController.current = null;
      setBusyAction(null);
    }
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
    const archived = result.data;
    setReference(archived);
    setHistory((versions) => versions.map((version) => version.id === archived.id ? archived : version));
    setArchiveReason('');
    setFeedback('Documento arquivado. O histórico foi preservado.');
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
        <p className="mt-3 text-sm text-[#0B3D2E]">Carregando documento e histórico…</p>
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

  const canManageVersions = can('documents:manage');

  return (
    <div id="page-document-detail" className={DOCUMENT_THEME.page}>
      <header className="border-b border-[#0B3D2E]/15 pb-5">
        <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => navigate(ROUTES.DOCUMENTS)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos documentos
        </button>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <h1 className="break-words text-2xl font-bold text-[#0B3D2E] sm:text-3xl">{reference.displayName}</h1>
          <span className={DOCUMENT_THEME.badge}>{STATUS_LABELS[reference.status]}</span>
          <span className={DOCUMENT_THEME.badge}>{reference.isCurrent ? 'Versão atual' : 'Versão histórica'}</span>
        </div>
        <p className="mt-2 text-sm text-[#0B3D2E]/70">
          {DOCUMENT_CATEGORY_LABELS[reference.category]} · versão {reference.versionNumber}
        </p>
        {!reference.isCurrent && currentVersion && (
          <button
            type="button"
            className={`${DOCUMENT_THEME.buttonPrimary} mt-4`}
            onClick={() => navigate(getDocumentReferencePath(currentVersion.id))}
          >
            <FileClock className="h-4 w-4" aria-hidden="true" /> Ir para a versão atual
          </button>
        )}
      </header>

      <section className={`${DOCUMENT_THEME.surfaceSoft} flex items-start gap-3 p-4`} aria-label="Proteção e rastreabilidade">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-[#0B3D2E]">
          Esta versão preserva autor, data e motivo da alteração. O arquivo só é carregado após a verificação do acesso.
        </p>
      </section>

      {reference.storageState === 'stored' && can('documents:download') && (
        <section className={`${DOCUMENT_THEME.surface} space-y-4 p-5 sm:p-6`} aria-labelledby="document-file-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="document-file-title" className="text-lg font-bold text-[#0B3D2E]">Arquivo protegido desta versão</h2>
              <p className="mt-1 text-sm text-[#0B3D2E]/70">Abrir ou baixar não altera a versão atual.</p>
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
        <h2 id="document-information-title" className="text-lg font-bold text-[#0B3D2E]">Informações da versão</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Relacionado a</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{DOCUMENT_OWNER_LABELS[reference.logicalOwnerType]}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Formato</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{MIME_LABELS[reference.mimeType]}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Tamanho</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatFileSize(reference.fileSizeBytes)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Quem pode consultar</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{ACCESS_LABELS[reference.accessScope]}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Emissão</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatDate(reference.issuedOn)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Validade</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatDate(reference.expiresOn)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Responsável</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{reference.createdByDisplayName}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Registrada em</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatDateTime(reference.createdAt)}</dd></div>
          <div className="sm:col-span-2 xl:col-span-3"><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Motivo desta versão</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-[#0B3D2E]">{reference.versionNote}</dd></div>
          {reference.notes && <div className="sm:col-span-2 xl:col-span-3"><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Observação do documento</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-[#0B3D2E]">{reference.notes}</dd></div>}
        </dl>
      </section>

      <section className={`${DOCUMENT_THEME.surface} p-5 sm:p-6`} aria-labelledby="version-history-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="version-history-title" className="text-lg font-bold text-[#0B3D2E]">Histórico de versões</h2>
            <p className="mt-1 text-sm text-[#0B3D2E]/70">{history.length} versão(ões) preservada(s)</p>
          </div>
        </div>
        <ol className="mt-4 space-y-3">
          {history.map((version) => (
            <li key={version.id} className={`${DOCUMENT_THEME.surfaceSoft} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-[#0B3D2E]">
                    Versão {version.versionNumber} {version.isCurrent ? '· atual' : ''}
                  </p>
                  <p className="mt-1 text-sm text-[#0B3D2E]/70">
                    {version.createdByDisplayName} · {formatDateTime(version.createdAt)}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[#0B3D2E]">{version.versionNote}</p>
                </div>
                {version.id !== reference.id && (
                  <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => navigate(getDocumentReferencePath(version.id))}>
                    Consultar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {predecessor && (
        <section className={`${DOCUMENT_THEME.surface} p-5 sm:p-6`} aria-labelledby="version-comparison-title">
          <h2 id="version-comparison-title" className="text-lg font-bold text-[#0B3D2E]">Comparação com a versão anterior</h2>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">Somente as informações descritivas autorizadas são comparadas; o conteúdo dos arquivos não é exposto.</p>
          {metadataChanges.length === 0 ? (
            <p className={`${DOCUMENT_THEME.surfaceSoft} mt-4 p-4 text-sm text-[#0B3D2E]`}>As informações comparáveis permaneceram iguais.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-[#0B3D2E]/15">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-[#78C89A]/15 text-[#0B3D2E]">
                  <tr><th className="p-3 font-bold">Campo</th><th className="p-3 font-bold">Versão {predecessor.versionNumber}</th><th className="p-3 font-bold">Versão {reference.versionNumber}</th></tr>
                </thead>
                <tbody>
                  {metadataChanges.map((change) => (
                    <tr key={change.field} className="border-t border-[#0B3D2E]/10 align-top">
                      <th className="p-3 font-semibold text-[#0B3D2E]">{change.label}</th>
                      <td className="max-w-sm whitespace-pre-wrap break-words p-3 text-[#0B3D2E]/70">{change.previousValue}</td>
                      <td className="max-w-sm whitespace-pre-wrap break-words p-3 text-[#0B3D2E]">{change.currentValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div aria-live="polite">
        {feedback && <p className={`${DOCUMENT_THEME.surfaceSoft} p-3 text-sm font-semibold text-[#0B3D2E]`} role="alert">{feedback}</p>}
      </div>

      {reference.isCurrent && reference.status === 'active' && canManageVersions && (
        <form
          className={`${DOCUMENT_THEME.surface} space-y-4 p-5 sm:p-6`}
          onSubmit={reference.storageState === 'stored' ? handleStoredReplace : handleMetadataReplace}
        >
          <div>
            <h2 className="text-lg font-bold text-[#0B3D2E]">Criar nova versão</h2>
            <p className="mt-1 text-sm text-[#0B3D2E]/70">A versão atual e seu arquivo continuarão disponíveis no histórico.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Nome do documento</span><input className={DOCUMENT_THEME.input} value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={3} maxLength={120} required /></label>
            {reference.storageState === 'metadata_only' && (
              <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Formato</span><select className={DOCUMENT_THEME.input} value={mimeType} onChange={(event) => setMimeType(event.target.value as DocumentMimeType)}>{Object.entries(MIME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            )}
            {reference.storageState === 'stored' && (
              <label className="text-sm font-semibold text-[#0B3D2E] md:col-span-2">
                <span className="mb-1.5 block">Novo arquivo — PDF, JPEG, PNG ou TIFF, até 50 MB</span>
                <input
                  className={`${DOCUMENT_THEME.input} file:mr-3 file:rounded-lg file:border-0 file:bg-[#78C89A] file:px-3 file:py-2 file:font-semibold file:text-[#0B3D2E]`}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/tiff,.pdf,.jpg,.jpeg,.png,.tif,.tiff"
                  onChange={(event) => setReplacementFile(event.target.files?.[0] ?? null)}
                  disabled={busyAction !== null}
                  required
                />
              </label>
            )}
            <div className="grid grid-cols-2 gap-3 md:col-span-2">
              <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Emissão</span><input className={DOCUMENT_THEME.input} type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} /></label>
              <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Validade</span><input className={DOCUMENT_THEME.input} type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label>
            </div>
          </div>
          <label className="block text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Observação do documento (opcional)</span><textarea className={DOCUMENT_THEME.textarea} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} /></label>
          <label className="block text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Motivo da nova versão</span><textarea className={DOCUMENT_THEME.textarea} value={versionNote} onChange={(event) => setVersionNote(event.target.value)} minLength={3} maxLength={500} required /></label>
          {busyAction === 'replace' && reference.storageState === 'stored' && (
            <div role="status" aria-live="polite">
              <p className="text-sm font-semibold text-[#0B3D2E]">Enviando nova versão · {versionProgress}%</p>
              <progress className="mt-2 h-2 w-full accent-[#0B3D2E]" max={100} value={versionProgress} aria-label="Andamento da nova versão" />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={DOCUMENT_THEME.buttonPrimary} disabled={busyAction !== null || versionNote.trim().length < 3 || (reference.storageState === 'stored' && !replacementFile)}>
              <UploadCloud className="h-4 w-4" aria-hidden="true" /> {busyAction === 'replace' ? 'Processando…' : 'Salvar nova versão'}
            </button>
            {busyAction === 'replace' && reference.storageState === 'stored' && (
              <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => versionAbortController.current?.abort()}>
                <Ban className="h-4 w-4" aria-hidden="true" /> Cancelar envio
              </button>
            )}
          </div>
        </form>
      )}

      {reference.isCurrent && reference.status !== 'archived' && can('documents:manage') && (
        <form className={`${DOCUMENT_THEME.surface} space-y-4 p-5 sm:p-6`} onSubmit={handleArchive}>
          <div>
            <h2 className="text-lg font-bold text-[#0B3D2E]">Arquivar documento</h2>
            <p className="mt-1 text-sm text-[#0B3D2E]/70">Todas as versões continuarão preservadas e consultáveis conforme a permissão.</p>
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
