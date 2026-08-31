import { ArrowLeft, FilePlus2, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DOCUMENT_THEME } from '../documents/theme';
import { useDocuments } from '../documents/DocumentsContext';
import { useDocumentOwnerOptions } from '../documents/useDocumentOwnerOptions';
import { getDocumentReferencePath, ROUTES } from '../routes/paths';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_OWNER_LABELS,
  type DocumentAccessScope,
  type DocumentCategory,
  type DocumentLogicalOwnerType,
  type DocumentMimeType,
} from '../types/documents';

const MIME_LABELS: Readonly<Record<DocumentMimeType, string>> = Object.freeze({
  'application/pdf': 'PDF',
  'image/jpeg': 'Imagem JPEG',
  'image/png': 'Imagem PNG',
  'image/tiff': 'Imagem TIFF',
});

export function DocumentReferenceCreatePage() {
  const navigate = useNavigate();
  const { registerReference } = useDocuments();
  const [ownerType, setOwnerType] = useState<DocumentLogicalOwnerType>('client');
  const [ownerId, setOwnerId] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('registration_certificate');
  const [displayName, setDisplayName] = useState('');
  const [mimeType, setMimeType] = useState<DocumentMimeType>('application/pdf');
  const [accessScope, setAccessScope] = useState<DocumentAccessScope>('participants');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { allowedOwnerTypes, ownerOptions, isManagement } = useDocumentOwnerOptions(ownerType);

  useEffect(() => {
    if (!allowedOwnerTypes.includes(ownerType) && allowedOwnerTypes[0]) {
      setOwnerType(allowedOwnerTypes[0]);
      setOwnerId('');
    }
  }, [allowedOwnerTypes, ownerType]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);
    const result = await registerReference({
      logicalOwnerType: ownerType,
      logicalOwnerId: ownerId,
      category,
      displayName,
      mimeType,
      accessScope,
      issuedOn: issuedOn || undefined,
      expiresOn: expiresOn || undefined,
      notes: notes || undefined,
    });
    setIsSubmitting(false);
    if (!result.success || !result.data) {
      setFeedback(result.error ?? 'Não foi possível adicionar o documento.');
      return;
    }
    navigate(getDocumentReferencePath(result.data.id), { replace: true });
  }

  return (
    <div id="page-document-create" className={DOCUMENT_THEME.page}>
      <header className="border-b border-[#0B3D2E]/15 pb-5">
        <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => navigate(ROUTES.DOCUMENTS)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar aos documentos
        </button>
        <h1 className="mt-5 text-2xl font-bold text-[#0B3D2E] sm:text-3xl">Adicionar documento</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#0B3D2E]/70">
          Escolha onde o documento será usado e informe seus dados básicos. O arquivo não será enviado.
        </p>
      </header>

      <div className={`${DOCUMENT_THEME.surfaceSoft} flex items-start gap-3 p-4`} role="note">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-[#0B3D2E]">
          Não inclua dados pessoais, bancários ou o conteúdo do documento no nome e nas observações.
        </p>
      </div>

      <form className={`${DOCUMENT_THEME.surface} space-y-6 p-5 sm:p-6`} onSubmit={handleSubmit}>
        <fieldset className="space-y-4">
          <legend className="text-lg font-bold text-[#0B3D2E]">Onde o documento será usado</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Relacionado a</span>
              <select
                className={DOCUMENT_THEME.input}
                value={ownerType}
                onChange={(event) => { setOwnerType(event.target.value as DocumentLogicalOwnerType); setOwnerId(''); }}
                required
              >
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
          <legend className="text-lg font-bold text-[#0B3D2E]">Dados do documento</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Categoria</span>
              <select className={DOCUMENT_THEME.input} value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>
                {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Nome do documento</span>
              <input className={DOCUMENT_THEME.input} value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={3} maxLength={120} required />
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Formato</span>
              <select className={DOCUMENT_THEME.input} value={mimeType} onChange={(event) => setMimeType(event.target.value as DocumentMimeType)}>
                {Object.entries(MIME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
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
              <label className="text-sm font-semibold text-[#0B3D2E]">
                <span className="mb-1.5 block">Emissão</span>
                <input className={DOCUMENT_THEME.input} type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} />
              </label>
              <label className="text-sm font-semibold text-[#0B3D2E]">
                <span className="mb-1.5 block">Validade</span>
                <input className={DOCUMENT_THEME.input} type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
              </label>
            </div>
          </div>
          <label className="block text-sm font-semibold text-[#0B3D2E]">
            <span className="mb-1.5 block">Observação operacional opcional</span>
            <textarea className={DOCUMENT_THEME.textarea} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} />
          </label>
        </fieldset>

        <div aria-live="polite">
          {feedback && <p className={`${DOCUMENT_THEME.surfaceSoft} p-3 text-sm font-semibold text-[#0B3D2E]`} role="alert">{feedback}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-[#0B3D2E]/15 pt-5">
          <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => navigate(ROUTES.DOCUMENTS)}>Cancelar</button>
          <button type="submit" className={DOCUMENT_THEME.buttonPrimary} disabled={isSubmitting || !ownerId}>
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            {isSubmitting ? 'Salvando…' : 'Salvar documento'}
          </button>
        </div>
      </form>
    </div>
  );
}
