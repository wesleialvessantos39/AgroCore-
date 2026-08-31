import { Archive, ArrowLeft, FileClock, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthorization } from '../authorization/useAuthorization';
import { useDocuments } from '../documents/DocumentsContext';
import { DOCUMENT_THEME } from '../documents/theme';
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
  participants: 'Participantes da entidade',
  management: 'Somente gestão',
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
  const { getReferenceById, replaceReference, archiveReference } = useDocuments();
  const [reference, setReference] = useState<DocumentReference | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [mimeType, setMimeType] = useState<DocumentMimeType>('application/pdf');
  const [fileSizeBytes, setFileSizeBytes] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const [busyAction, setBusyAction] = useState<'replace' | 'archive' | null>(null);

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
          setFileSizeBytes(String(result.fileSizeBytes));
          setIssuedOn(result.issuedOn ?? '');
          setExpiresOn(result.expiresOn ?? '');
          setNotes(result.notes ?? '');
        }
      } catch (error) {
        if (active) setFeedback(error instanceof Error ? error.message : 'Não foi possível consultar a referência.');
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
      fileSizeBytes: Number(fileSizeBytes),
      issuedOn: issuedOn || undefined,
      expiresOn: expiresOn || undefined,
      notes: notes || undefined,
    });
    setBusyAction(null);
    if (!result.success || !result.data) {
      setFeedback(result.error ?? 'Não foi possível substituir a referência.');
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
      setFeedback(result.error ?? 'Não foi possível arquivar a referência.');
      return;
    }
    setReference(result.data);
    setArchiveReason('');
    setFeedback('Referência arquivada com rastreabilidade.');
  }

  if (loading) {
    return (
      <div className={`${DOCUMENT_THEME.surfaceSoft} p-8 text-center`} role="status" aria-live="polite">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#0B3D2E]" aria-hidden="true" />
        <p className="mt-3 text-sm text-[#0B3D2E]">Carregando referência documental…</p>
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
          <p className="font-semibold text-[#0B3D2E]">Referência não encontrada ou fora do seu escopo.</p>
          {feedback && <p className="mt-1 text-sm text-[#0B3D2E]/70">{feedback}</p>}
        </div>
      </div>
    );
  }

  return (
    <div id="page-document-detail" className={DOCUMENT_THEME.page}>
      <header className="border-b border-[#0B3D2E]/15 pb-5">
        <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => navigate(ROUTES.DOCUMENTS)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar às referências
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
          Registro de metadados somente. Não existe arquivo para visualizar ou baixar nesta etapa.
        </p>
      </section>

      <section className={`${DOCUMENT_THEME.surface} p-5 sm:p-6`} aria-labelledby="document-metadata-title">
        <h2 id="document-metadata-title" className="text-lg font-bold text-[#0B3D2E]">Metadados canônicos</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Entidade</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{DOCUMENT_OWNER_LABELS[reference.logicalOwnerType]}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Formato</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{MIME_LABELS[reference.mimeType]}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Tamanho declarado</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{new Intl.NumberFormat('pt-BR').format(reference.fileSizeBytes)} bytes</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Escopo</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{ACCESS_LABELS[reference.accessScope]}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Emissão</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatDate(reference.issuedOn)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Validade</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatDate(reference.expiresOn)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Criada em</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatDateTime(reference.createdAt)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Atualizada em</dt><dd className="mt-1 text-sm font-semibold text-[#0B3D2E]">{formatDateTime(reference.updatedAt)}</dd></div>
          <div className="sm:col-span-2 xl:col-span-3"><dt className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/55">Checksum SHA-256 dos metadados</dt><dd className="mt-1 break-all font-mono text-xs text-[#0B3D2E]">{reference.metadataChecksumSha256}</dd></div>
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

      {reference.status === 'active' && can('documents:register_reference') && (
        <form className={`${DOCUMENT_THEME.surface} space-y-4 p-5 sm:p-6`} onSubmit={handleReplace}>
          <div>
            <h2 className="text-lg font-bold text-[#0B3D2E]">Registrar nova versão</h2>
            <p className="mt-1 text-sm text-[#0B3D2E]/70">A versão atual permanecerá preservada como substituída.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Nome de exibição</span><input className={DOCUMENT_THEME.input} value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={3} maxLength={120} required /></label>
            <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Formato declarado</span><select className={DOCUMENT_THEME.input} value={mimeType} onChange={(event) => setMimeType(event.target.value as DocumentMimeType)}>{Object.entries(MIME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Tamanho declarado em bytes</span><input className={DOCUMENT_THEME.input} type="number" min={1} max={52428800} step={1} value={fileSizeBytes} onChange={(event) => setFileSizeBytes(event.target.value)} required /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Emissão</span><input className={DOCUMENT_THEME.input} type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} /></label>
              <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Validade</span><input className={DOCUMENT_THEME.input} type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label>
            </div>
          </div>
          <label className="block text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Observação opcional</span><textarea className={DOCUMENT_THEME.textarea} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} /></label>
          <button type="submit" className={DOCUMENT_THEME.buttonPrimary} disabled={busyAction !== null}>{busyAction === 'replace' ? 'Registrando versão…' : 'Registrar nova versão'}</button>
        </form>
      )}

      {reference.status !== 'archived' && can('documents:manage') && (
        <form className={`${DOCUMENT_THEME.surface} space-y-4 p-5 sm:p-6`} onSubmit={handleArchive}>
          <div>
            <h2 className="text-lg font-bold text-[#0B3D2E]">Arquivar referência</h2>
            <p className="mt-1 text-sm text-[#0B3D2E]/70">O registro será preservado e deixará de ser tratado como ativo.</p>
          </div>
          <label className="block text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Motivo obrigatório</span><textarea className={DOCUMENT_THEME.textarea} value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} minLength={3} maxLength={240} required /></label>
          <button type="submit" className={DOCUMENT_THEME.buttonSecondary} disabled={busyAction !== null || archiveReason.trim().length < 3}>
            <Archive className="h-4 w-4" aria-hidden="true" /> {busyAction === 'archive' ? 'Arquivando…' : 'Arquivar com rastreabilidade'}
          </button>
        </form>
      )}
    </div>
  );
}

