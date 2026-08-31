import { ArrowLeft, ClipboardPlus, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocuments } from '../documents/DocumentsContext';
import { DOCUMENT_THEME } from '../documents/theme';
import { useDocumentOwnerOptions } from '../documents/useDocumentOwnerOptions';
import { ROUTES } from '../routes/paths';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_OWNER_LABELS,
  type DocumentAccessScope,
  type DocumentCategory,
  type DocumentLogicalOwnerType,
} from '../types/documents';

export function DocumentRequirementCreatePage() {
  const navigate = useNavigate();
  const { createRequirement } = useDocuments();
  const [ownerType, setOwnerType] = useState<DocumentLogicalOwnerType>('client');
  const [ownerId, setOwnerId] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('registration_certificate');
  const [title, setTitle] = useState('');
  const [accessScope, setAccessScope] = useState<DocumentAccessScope>('participants');
  const [dueOn, setDueOn] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const { allowedOwnerTypes, ownerOptions } = useDocumentOwnerOptions(ownerType);

  useEffect(() => {
    if (!allowedOwnerTypes.includes(ownerType) && allowedOwnerTypes[0]) {
      setOwnerType(allowedOwnerTypes[0]);
      setOwnerId('');
    }
  }, [allowedOwnerTypes, ownerType]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    const result = await createRequirement({
      logicalOwnerType: ownerType,
      logicalOwnerId: ownerId,
      category,
      title,
      accessScope,
      dueOn: dueOn || undefined,
      notes: notes || undefined,
    });
    setIsSubmitting(false);
    if (!result.success) {
      setFeedback(result.error ?? 'Não foi possível criar a pendência.');
      return;
    }
    navigate(ROUTES.DOCUMENT_REQUIREMENTS, { replace: true });
  }

  return (
    <div id="page-document-requirement-create" className={DOCUMENT_THEME.page}>
      <header className="border-b border-[#0B3D2E]/15 pb-5">
        <button
          type="button"
          className={DOCUMENT_THEME.buttonSecondary}
          onClick={() => navigate(ROUTES.DOCUMENT_REQUIREMENTS)}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar às pendências
        </button>
        <h1 className="mt-5 text-2xl font-bold text-[#0B3D2E] sm:text-3xl">
          Criar pendência de documento
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#0B3D2E]/70">
          Informe qual documento será necessário, para qual atendimento e até quando ele deve ser apresentado.
        </p>
      </header>

      <div className={`${DOCUMENT_THEME.surfaceSoft} flex items-start gap-3 p-4`} role="note">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-[#0B3D2E]">
          Use orientações curtas e não inclua dados pessoais, bancários ou o conteúdo do documento.
        </p>
      </div>

      <form className={`${DOCUMENT_THEME.surface} space-y-6 p-5 sm:p-6`} onSubmit={handleSubmit}>
        <fieldset className="space-y-4">
          <legend className="text-lg font-bold text-[#0B3D2E]">Atendimento relacionado</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Relacionado a</span>
              <select
                className={DOCUMENT_THEME.input}
                value={ownerType}
                onChange={(event) => {
                  setOwnerType(event.target.value as DocumentLogicalOwnerType);
                  setOwnerId('');
                }}
                required
              >
                {allowedOwnerTypes.map((value) => (
                  <option key={value} value={value}>{DOCUMENT_OWNER_LABELS[value]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Cliente, imóvel ou atendimento</span>
              <select
                className={DOCUMENT_THEME.input}
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                required
              >
                <option value="">Selecione uma opção disponível</option>
                {ownerOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              {ownerOptions.length === 0 ? (
                <span className="mt-1.5 block text-xs text-[#0B3D2E]/65">
                  Nenhuma opção está disponível para o seu acesso atual.
                </span>
              ) : null}
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[#0B3D2E]/15 pt-5">
          <legend className="text-lg font-bold text-[#0B3D2E]">Documento necessário</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Categoria</span>
              <select
                className={DOCUMENT_THEME.input}
                value={category}
                onChange={(event) => setCategory(event.target.value as DocumentCategory)}
              >
                {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Título da pendência</span>
              <input
                className={DOCUMENT_THEME.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={3}
                maxLength={120}
                required
              />
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Prazo</span>
              <input
                className={DOCUMENT_THEME.input}
                type="date"
                value={dueOn}
                onChange={(event) => setDueOn(event.target.value)}
              />
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Quem pode consultar</span>
              <select
                className={DOCUMENT_THEME.input}
                value={accessScope}
                onChange={(event) => setAccessScope(event.target.value as DocumentAccessScope)}
              >
                <option value="organization">Equipe da empresa</option>
                <option value="participants">Pessoas envolvidas no atendimento</option>
                <option value="management">Somente gestores</option>
              </select>
            </label>
          </div>
          <label className="block text-sm font-semibold text-[#0B3D2E]">
            <span className="mb-1.5 block">Orientação opcional</span>
            <textarea
              className={DOCUMENT_THEME.textarea}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
            />
          </label>
        </fieldset>

        <div aria-live="polite">
          {feedback ? (
            <p className={`${DOCUMENT_THEME.surfaceSoft} p-3 text-sm font-semibold text-[#0B3D2E]`} role="alert">
              {feedback}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-[#0B3D2E]/15 pt-5">
          <button
            type="button"
            className={DOCUMENT_THEME.buttonSecondary}
            onClick={() => navigate(ROUTES.DOCUMENT_REQUIREMENTS)}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={DOCUMENT_THEME.buttonPrimary}
            disabled={isSubmitting || !ownerId}
          >
            <ClipboardPlus className="h-4 w-4" aria-hidden="true" />
            {isSubmitting ? 'Salvando…' : 'Criar pendência'}
          </button>
        </div>
      </form>
    </div>
  );
}
