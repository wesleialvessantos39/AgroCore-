import {
  ArrowLeft,
  Ban,
  FilePlus2,
  FolderOpen,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthorization } from '../authorization/useAuthorization';
import { useDocuments } from '../documents/DocumentsContext';
import {
  MAX_DOCUMENT_FILES_PER_BATCH,
  validateDocumentFile,
} from '../documents/documentStoragePolicy';
import { DOCUMENT_THEME } from '../documents/theme';
import { useDocumentOwnerOptions } from '../documents/useDocumentOwnerOptions';
import { useDocumentUploadQueue } from '../documents/useDocumentUploadQueue';
import { getDocumentReferencePath, ROUTES } from '../routes/paths';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_OWNER_LABELS,
  type DocumentAccessScope,
  type DocumentCategory,
  type DocumentLogicalOwnerType,
} from '../types/documents';

const STATE_LABELS = Object.freeze({
  queued: 'Aguardando',
  uploading: 'Enviando',
  completed: 'Concluído',
  failed: 'Falhou',
  cancelled: 'Cancelado',
});

export function DocumentReferenceCreatePage() {
  const navigate = useNavigate();
  const { can } = useAuthorization();
  const { uploadDocument } = useDocuments();
  const queue = useDocumentUploadQueue(uploadDocument);
  const [ownerType, setOwnerType] = useState<DocumentLogicalOwnerType>('client');
  const [ownerId, setOwnerId] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('registration_certificate');
  const [displayName, setDisplayName] = useState('');
  const [accessScope, setAccessScope] = useState<DocumentAccessScope>('participants');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<readonly File[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { allowedOwnerTypes, ownerOptions, isManagement } = useDocumentOwnerOptions(ownerType);
  const hasActiveUploads = queue.items.some((item) => item.state === 'queued' || item.state === 'uploading');
  const canUpload = can('documents:upload');
  const completedCount = queue.items.filter((item) => item.state === 'completed').length;

  useEffect(() => {
    if (!allowedOwnerTypes.includes(ownerType) && allowedOwnerTypes[0]) {
      setOwnerType(allowedOwnerTypes[0]);
      setOwnerId('');
    }
  }, [allowedOwnerTypes, ownerType]);

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    setFeedback(null);
    const files = Array.from(event.target.files ?? []);
    if (files.length > MAX_DOCUMENT_FILES_PER_BATCH) {
      setSelectedFiles([]);
      setFeedback(`Selecione no máximo ${MAX_DOCUMENT_FILES_PER_BATCH} arquivos por vez.`);
      event.target.value = '';
      return;
    }
    try {
      files.forEach(validateDocumentFile);
      setSelectedFiles(files);
    } catch (error) {
      setSelectedFiles([]);
      setFeedback(error instanceof Error ? error.message : 'Um dos arquivos não pode ser enviado.');
      event.target.value = '';
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (!canUpload || selectedFiles.length === 0) {
      setFeedback('Selecione pelo menos um arquivo permitido.');
      return;
    }
    queue.startUploads(selectedFiles.map((file, index) => ({
      file,
      metadata: {
        logicalOwnerType: ownerType,
        logicalOwnerId: ownerId,
        category,
        displayName: selectedFiles.length > 1 ? `${displayName} ${index + 1}` : displayName,
        accessScope,
        issuedOn: issuedOn || undefined,
        expiresOn: expiresOn || undefined,
        notes: notes || undefined,
      },
    })));
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFeedback('Os arquivos foram adicionados à fila de envio.');
  }

  return (
    <div id="page-document-create" className={DOCUMENT_THEME.page}>
      <header className="border-b border-[#0B3D2E]/15 pb-5">
        <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => navigate(ROUTES.DOCUMENTS)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos documentos
        </button>
        <h1 className="mt-5 text-2xl font-bold text-[#0B3D2E] sm:text-3xl">Enviar documentos</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#0B3D2E]/70">
          Selecione até dez arquivos. Cada envio mostra o andamento e pode ser cancelado ou repetido.
        </p>
      </header>

      <div className={`${DOCUMENT_THEME.surfaceSoft} flex items-start gap-3 p-4`} role="note">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-[#0B3D2E]">
          Não inclua CPF, CNPJ, conta bancária ou outros dados pessoais no nome informado abaixo.
        </p>
      </div>

      <form className={`${DOCUMENT_THEME.surface} space-y-6 p-5 sm:p-6`} onSubmit={handleSubmit}>
        <fieldset className="space-y-4">
          <legend className="text-lg font-bold text-[#0B3D2E]">Onde os documentos serão usados</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Relacionado a</span>
              <select className={DOCUMENT_THEME.input} value={ownerType} onChange={(event) => { setOwnerType(event.target.value as DocumentLogicalOwnerType); setOwnerId(''); }} required>
                {allowedOwnerTypes.map((value) => <option key={value} value={value}>{DOCUMENT_OWNER_LABELS[value]}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Cliente, imóvel ou atendimento</span>
              <select className={DOCUMENT_THEME.input} value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
                <option value="">Selecione uma opção disponível</option>
                {ownerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              {ownerOptions.length === 0 && <span className="mt-1.5 block text-xs text-[#0B3D2E]/65">Nenhuma opção está disponível para o seu acesso atual.</span>}
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[#0B3D2E]/15 pt-5">
          <legend className="text-lg font-bold text-[#0B3D2E]">Identificação e acesso</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Categoria</span>
              <select className={DOCUMENT_THEME.input} value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>
                {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Nome para identificação</span>
              <input className={DOCUMENT_THEME.input} value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={3} maxLength={110} required />
              {selectedFiles.length > 1 && <span className="mt-1.5 block text-xs text-[#0B3D2E]/65">O sistema acrescentará a numeração de cada arquivo.</span>}
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Quem pode consultar</span>
              <select className={DOCUMENT_THEME.input} value={accessScope} onChange={(event) => setAccessScope(event.target.value as DocumentAccessScope)}>
                {isManagement && <option value="organization">Equipe da empresa</option>}
                <option value="participants">Pessoas envolvidas no atendimento</option>
                {isManagement && <option value="management">Somente gestores</option>}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Emissão</span><input className={DOCUMENT_THEME.input} type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} /></label>
              <label className="text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Validade</span><input className={DOCUMENT_THEME.input} type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label>
            </div>
          </div>
          <label className="block text-sm font-semibold text-[#0B3D2E]"><span className="mb-1.5 block">Observação operacional opcional</span><textarea className={DOCUMENT_THEME.textarea} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} /></label>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[#0B3D2E]/15 pt-5">
          <legend className="text-lg font-bold text-[#0B3D2E]">Arquivos</legend>
          <label className="block text-sm font-semibold text-[#0B3D2E]">
            <span className="mb-1.5 block">PDF, JPEG, PNG ou TIFF, com até 50 MB cada</span>
            <input
              ref={fileInputRef}
              className={`${DOCUMENT_THEME.input} file:mr-3 file:rounded-lg file:border-0 file:bg-[#78C89A] file:px-3 file:py-2 file:font-semibold file:text-[#0B3D2E]`}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/tiff,.pdf,.jpg,.jpeg,.png,.tif,.tiff"
              multiple
              onChange={handleFileSelection}
              disabled={!canUpload || hasActiveUploads}
              required={selectedFiles.length === 0}
            />
          </label>
          {selectedFiles.length > 0 && (
            <ul className="space-y-2" aria-label="Arquivos selecionados">
              {selectedFiles.map((file) => <li key={`${file.name}:${file.size}:${file.lastModified}`} className={`${DOCUMENT_THEME.surfaceSoft} break-all p-3 text-sm text-[#0B3D2E]`}>{file.name}</li>)}
            </ul>
          )}
        </fieldset>

        <div aria-live="polite">
          {feedback && <p className={`${DOCUMENT_THEME.surfaceSoft} p-3 text-sm font-semibold text-[#0B3D2E]`} role="status">{feedback}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-[#0B3D2E]/15 pt-5">
          <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => navigate(ROUTES.DOCUMENTS)}>Voltar</button>
          <button type="submit" className={DOCUMENT_THEME.buttonPrimary} disabled={!canUpload || hasActiveUploads || !ownerId || selectedFiles.length === 0 || displayName.trim().length < 3}>
            <UploadCloud className="h-4 w-4" aria-hidden="true" /> Adicionar à fila
          </button>
        </div>
      </form>

      {queue.items.length > 0 && (
        <section className={`${DOCUMENT_THEME.surface} space-y-4 p-5 sm:p-6`} aria-labelledby="upload-queue-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="upload-queue-title" className="text-lg font-bold text-[#0B3D2E]">Andamento dos envios</h2>
              <p className="mt-1 text-sm text-[#0B3D2E]/70">{completedCount} concluído(s)</p>
            </div>
            {!hasActiveUploads && <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={queue.clearFinished}><Trash2 className="h-4 w-4" aria-hidden="true" /> Limpar lista</button>}
          </div>
          <ul className="space-y-3">
            {queue.items.map((item) => (
              <li key={item.id} className={`${DOCUMENT_THEME.surfaceSoft} space-y-3 p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><p className="break-all text-sm font-semibold text-[#0B3D2E]">{item.fileName}</p><p className="mt-1 text-xs text-[#0B3D2E]/65">{STATE_LABELS[item.state]} · {item.percentage}%</p></div>
                  <div className="flex flex-wrap gap-2">
                    {(item.state === 'queued' || item.state === 'uploading') && <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => queue.cancelUpload(item.id)}><Ban className="h-4 w-4" aria-hidden="true" /> Cancelar</button>}
                    {(item.state === 'failed' || item.state === 'cancelled') && <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => queue.retryUpload(item.id)}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente</button>}
                    {item.documentId && <button type="button" className={DOCUMENT_THEME.buttonPrimary} onClick={() => navigate(getDocumentReferencePath(item.documentId!))}><FolderOpen className="h-4 w-4" aria-hidden="true" /> Ver documento</button>}
                  </div>
                </div>
                <progress className="h-2 w-full accent-[#0B3D2E]" max={100} value={item.percentage} aria-label={`Andamento de ${item.fileName}`} />
                {item.error && <p className="text-sm font-semibold text-[#0B3D2E]" role="alert">{item.error}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!canUpload && (
        <div className={`${DOCUMENT_THEME.surfaceSoft} flex items-start gap-3 p-4`} role="alert">
          <FilePlus2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
          <p className="text-sm text-[#0B3D2E]">Seu perfil pode consultar documentos, mas não pode enviar novos arquivos.</p>
        </div>
      )}
    </div>
  );
}
