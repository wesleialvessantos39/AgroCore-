import { ArrowLeft, FilePlus2, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppraisals } from '../appraisals/useAppraisals';
import { useAuth } from '../auth/useAuth';
import { getClientCapturerAssignmentGateway } from '../clients/capturerAssignmentGatewayFactory';
import { useClients } from '../clients/useClients';
import { DOCUMENT_THEME } from '../documents/theme';
import { useDocuments } from '../documents/DocumentsContext';
import { useOrganization } from '../organization/useOrganization';
import { useProperties } from '../properties/useProperties';
import { useProposals } from '../proposals/useProposals';
import { getDocumentReferencePath, ROUTES } from '../routes/paths';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_OWNER_LABELS,
  type DocumentAccessScope,
  type DocumentCategory,
  type DocumentLogicalOwnerType,
  type DocumentMimeType,
} from '../types/documents';

interface OwnerOption {
  readonly id: string;
  readonly label: string;
}

const MIME_LABELS: Readonly<Record<DocumentMimeType, string>> = Object.freeze({
  'application/pdf': 'PDF',
  'image/jpeg': 'Imagem JPEG',
  'image/png': 'Imagem PNG',
  'image/tiff': 'Imagem TIFF',
});

export function DocumentReferenceCreatePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { activeOrganization } = useOrganization();
  const { clients } = useClients();
  const { properties } = useProperties();
  const { appraisals, requests } = useAppraisals();
  const { proposals } = useProposals();
  const { registerReference } = useDocuments();
  const [capturerClientIds, setCapturerClientIds] = useState<ReadonlySet<string>>(new Set());
  const [ownerType, setOwnerType] = useState<DocumentLogicalOwnerType>('client');
  const [ownerId, setOwnerId] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('registration_certificate');
  const [displayName, setDisplayName] = useState('');
  const [mimeType, setMimeType] = useState<DocumentMimeType>('application/pdf');
  const [fileSizeBytes, setFileSizeBytes] = useState('');
  const [accessScope, setAccessScope] = useState<DocumentAccessScope>('participants');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const role = session?.organizationRole ?? 'none';
  const isManagement = role === 'owner' || role === 'company_admin' || role === 'manager';

  useEffect(() => {
    let active = true;
    async function loadCapturerScope() {
      if (role !== 'capturer' || !session?.user.id || !activeOrganization?.id) {
        if (active) setCapturerClientIds(new Set());
        return;
      }
      try {
        const ids = await getClientCapturerAssignmentGateway().listClientsByCapturer(
          activeOrganization.id,
          session.user.id
        );
        if (active) setCapturerClientIds(new Set(ids));
      } catch {
        if (active) setCapturerClientIds(new Set());
      }
    }
    void loadCapturerScope();
    return () => { active = false; };
  }, [activeOrganization?.id, role, session?.user.id]);

  const allowedOwnerTypes = useMemo<readonly DocumentLogicalOwnerType[]>(() => {
    if (isManagement) return ['client', 'property', 'appraisal_request', 'appraisal', 'proposal'];
    if (role === 'project_designer') return ['appraisal_request', 'appraisal', 'proposal'];
    if (role === 'capturer') return ['client', 'property', 'appraisal_request', 'proposal'];
    return [];
  }, [isManagement, role]);

  useEffect(() => {
    if (!allowedOwnerTypes.includes(ownerType) && allowedOwnerTypes[0]) {
      setOwnerType(allowedOwnerTypes[0]);
      setOwnerId('');
    }
  }, [allowedOwnerTypes, ownerType]);

  const ownerOptions = useMemo<readonly OwnerOption[]>(() => {
    if (ownerType === 'client') {
      return clients
        .filter((client) => role !== 'capturer' || capturerClientIds.has(client.id))
        .map((client) => ({
          id: client.id,
          label: client.personType === 'individual' ? client.name : client.companyName,
        }));
    }
    if (ownerType === 'property') {
      return properties
        .filter(
          (property) =>
            role !== 'capturer' || property.clientLinks.some((link) => capturerClientIds.has(link.clientId))
        )
        .map((property) => ({ id: property.id, label: property.name }));
    }
    if (ownerType === 'appraisal_request') {
      return requests.map((request) => ({ id: request.id, label: request.purpose }));
    }
    if (ownerType === 'appraisal') {
      return appraisals.map((appraisal) => ({ id: appraisal.id, label: appraisal.title }));
    }
    return proposals.map((proposal) => ({
      id: proposal.id,
      label: `${proposal.proposalNumber} — ${proposal.title}`,
    }));
  }, [appraisals, capturerClientIds, clients, ownerType, properties, proposals, requests, role]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);
    const size = Number(fileSizeBytes);
    const result = await registerReference({
      logicalOwnerType: ownerType,
      logicalOwnerId: ownerId,
      category,
      displayName,
      mimeType,
      fileSizeBytes: size,
      accessScope,
      issuedOn: issuedOn || undefined,
      expiresOn: expiresOn || undefined,
      notes: notes || undefined,
    });
    setIsSubmitting(false);
    if (!result.success || !result.data) {
      setFeedback(result.error ?? 'Não foi possível registrar a referência.');
      return;
    }
    navigate(getDocumentReferencePath(result.data.id), { replace: true });
  }

  return (
    <div id="page-document-create" className={DOCUMENT_THEME.page}>
      <header className="border-b border-[#0B3D2E]/15 pb-5">
        <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => navigate(ROUTES.DOCUMENTS)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar às referências
        </button>
        <h1 className="mt-5 text-2xl font-bold text-[#0B3D2E] sm:text-3xl">Registrar referência documental</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#0B3D2E]/70">
          Associe metadados a uma entidade canônica. Nenhum arquivo será enviado ou armazenado.
        </p>
      </header>

      <div className={`${DOCUMENT_THEME.surfaceSoft} flex items-start gap-3 p-4`} role="note">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#0B3D2E]" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-[#0B3D2E]">
          Não inclua CPF, CNPJ, telefone, e-mail, dados bancários ou conteúdo documental no nome e nas observações.
        </p>
      </div>

      <form className={`${DOCUMENT_THEME.surface} space-y-6 p-5 sm:p-6`} onSubmit={handleSubmit}>
        <fieldset className="space-y-4">
          <legend className="text-lg font-bold text-[#0B3D2E]">Vínculo canônico</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Tipo de entidade</span>
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
              <span className="mb-1.5 block">Registro vinculado</span>
              <select className={DOCUMENT_THEME.input} value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
                <option value="">Selecione uma fonte disponível</option>
                {ownerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              {ownerOptions.length === 0 && <span className="mt-1.5 block text-xs text-[#0B3D2E]/65">Nenhum registro canônico está disponível no seu escopo atual.</span>}
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[#0B3D2E]/15 pt-5">
          <legend className="text-lg font-bold text-[#0B3D2E]">Metadados permitidos</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Categoria</span>
              <select className={DOCUMENT_THEME.input} value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>
                {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Nome de exibição</span>
              <input className={DOCUMENT_THEME.input} value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={3} maxLength={120} required />
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Formato declarado</span>
              <select className={DOCUMENT_THEME.input} value={mimeType} onChange={(event) => setMimeType(event.target.value as DocumentMimeType)}>
                {Object.entries(MIME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Tamanho declarado em bytes</span>
              <input className={DOCUMENT_THEME.input} type="number" min={1} max={52428800} step={1} value={fileSizeBytes} onChange={(event) => setFileSizeBytes(event.target.value)} required />
            </label>
            <label className="text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Escopo de acesso</span>
              <select className={DOCUMENT_THEME.input} value={accessScope} onChange={(event) => setAccessScope(event.target.value as DocumentAccessScope)}>
                {isManagement && <option value="organization">Organização</option>}
                <option value="participants">Participantes da entidade</option>
                {isManagement && <option value="management">Somente gestão</option>}
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
            {isSubmitting ? 'Registrando…' : 'Registrar metadados'}
          </button>
        </div>
      </form>
    </div>
  );
}
