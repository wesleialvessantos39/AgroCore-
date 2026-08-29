import React, { useEffect, useState } from 'react';
import {
  CreateProposalInput,
  Proposal,
  ProposalCategory,
  ProposalType,
  UpdateProposalInput,
} from '../../types/proposals';
import {
  PROPOSAL_CATEGORY_LABELS,
  PROPOSAL_TYPE_LABELS,
  formatCentsToBRL,
  parseBRLToCents,
  parsePercentageInput,
  validateProposalInput,
  getClientDisplayName,
  getClientDocument,
} from '../validators';
import { PROPOSAL_THEME } from '../theme';
import { useClients } from '../../clients/useClients';
import { useProperties } from '../../properties/useProperties';
import { useAuth } from '../../auth/useAuth';
import { useOrganization } from '../../organization/useOrganization';
import { useCapturerAssignment } from '../../hooks/useCapturerAssignment';

interface ProposalFormProps {
  initialData?: Proposal;
  onSubmit: (input: CreateProposalInput | UpdateProposalInput) => Promise<void>;
  isSubmitting?: boolean;
  onCancel: () => void;
}

export const ProposalForm: React.FC<ProposalFormProps> = ({
  initialData,
  onSubmit,
  isSubmitting = false,
  onCancel,
}) => {
  const { session } = useAuth();
  const { activeMembership } = useOrganization();
  const { listClientsByCapturer } = useCapturerAssignment();
  const { clients } = useClients();
  const { properties } = useProperties();

  const isEdit = Boolean(initialData);

  const [assignedClientIds, setAssignedClientIds] = useState<readonly string[] | null>(null);
  const isCapturer = activeMembership?.organizationRole === 'capturer';

  useEffect(() => {
    let isMounted = true;
    if (isCapturer && session?.user?.id) {
      listClientsByCapturer(session.user.id).then((ids) => {
        if (isMounted) {
          setAssignedClientIds(ids);
        }
      });
    } else {
      setAssignedClientIds(null);
    }
    return () => {
      isMounted = false;
    };
  }, [isCapturer, session?.user?.id, listClientsByCapturer]);

  const displayedClients = isCapturer
    ? clients.filter((c) => assignedClientIds?.includes(c.id))
    : clients;

  const [clientId, setClientId] = useState(initialData?.clientId || '');
  const [propertyId, setPropertyId] = useState(initialData?.propertyId || '');
  const [title, setTitle] = useState(initialData?.title || '');
  const [proposalType, setProposalType] = useState<ProposalType>(initialData?.proposalType || 'credit');
  const [category, setCategory] = useState<ProposalCategory>(
    initialData?.category || 'custeio'
  );
  const [validityDays, setValidityDays] = useState<string>(
    initialData?.validityDays ? String(initialData.validityDays) : '30'
  );

  // Valores financeiros
  const [amountRaw, setAmountRaw] = useState(
    initialData
      ? (initialData.estimatedValue.amountCents / 100).toFixed(2).replace('.', ',')
      : ''
  );
  const [financingTermMonths, setFinancingTermMonths] = useState<string>(
    initialData?.calculationSummary.financingTermMonths !== undefined
      ? String(initialData.calculationSummary.financingTermMonths)
      : ''
  );
  const [gracePeriodMonths, setGracePeriodMonths] = useState<string>(
    initialData?.calculationSummary.gracePeriodMonths !== undefined
      ? String(initialData.calculationSummary.gracePeriodMonths)
      : ''
  );
  const [interestRateAnnualPercentage, setInterestRateAnnualPercentage] = useState<string>(
    initialData?.calculationSummary.interestRateAnnualPercentage !== undefined
      ? String(initialData.calculationSummary.interestRateAnnualPercentage)
      : ''
  );
  const [notes, setNotes] = useState(initialData?.notes || '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Filtrar imóveis pertencentes ao cliente selecionado e com status ativo
  const availableProperties = clientId
    ? properties.filter(
        (prop) =>
          prop.status === 'active' &&
          prop.clientLinks &&
          prop.clientLinks.some((l) => l.clientId === clientId)
      )
    : [];

  const hasNoPropertiesForClient = Boolean(clientId) && availableProperties.length === 0;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmountRaw(e.target.value);
  };

  const handleClientChange = (newClientId: string) => {
    setClientId(newClientId);
    setPropertyId(''); // Limpar seleção de imóvel ao alterar o cliente
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    const cents = parseBRLToCents(amountRaw);
    const parsedValidity = validityDays ? parseInt(validityDays, 10) : 30;
    const parsedTerm = financingTermMonths ? parseInt(financingTermMonths, 10) : undefined;
    const parsedGrace = gracePeriodMonths ? parseInt(gracePeriodMonths, 10) : undefined;
    const parsedInterest = parsePercentageInput(interestRateAnnualPercentage);

    if (isEdit && initialData) {
      const updatePayload: UpdateProposalInput = {
        title,
        proposalType,
        category,
        propertyId: propertyId ? propertyId : null,
        validityDays: parsedValidity,
        requestedAmountCents: cents,
        financingTermMonths: parsedTerm,
        gracePeriodMonths: parsedGrace,
        interestRateAnnualPercentage: parsedInterest,
        notes: notes || undefined,
        expectedVersion: initialData.version,
      };

      const validation = validateProposalInput(updatePayload, false);
      if (!validation.isValid) {
        setErrors(validation.errors);
        setGeneralError('Corrija os erros apontados nos campos destacados antes de prosseguir.');
        return;
      }

      try {
        await onSubmit(updatePayload);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao atualizar proposta.';
        setGeneralError(msg);
      }
      return;
    }

    const createPayload: CreateProposalInput = {
      clientId,
      propertyId: propertyId ? propertyId : null,
      title,
      proposalType,
      category,
      validityDays: parsedValidity,
      requestedAmountCents: cents,
      financingTermMonths: parsedTerm,
      gracePeriodMonths: parsedGrace,
      interestRateAnnualPercentage: parsedInterest,
      notes: notes || undefined,
    };

    const validation = validateProposalInput(createPayload, true);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setGeneralError('Corrija os erros apontados nos campos destacados antes de prosseguir.');
      return;
    }

    try {
      await onSubmit(createPayload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar proposta.';
      setGeneralError(msg);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`${PROPOSAL_THEME.surfaceCard} border ${PROPOSAL_THEME.border} rounded-2xl p-6 shadow-xs space-y-6 text-[#0B3D2E]`}
      id="proposal-form"
    >
      {generalError && (
        <div
          className="p-4 bg-[#0B3D2E]/10 border border-[#0B3D2E]/30 rounded-xl text-[#0B3D2E] text-sm font-medium"
          id="proposal-form-error-banner"
        >
          {generalError}
        </div>
      )}

      {/* Seção 1: Identificação e Vínculos */}
      <div>
        <h3 className="text-base font-bold text-[#0B3D2E] mb-3 pb-1 border-b border-[#0B3D2E]/15">
          1. Identificação e Vínculos Cadastrais
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label
              htmlFor="proposal-title-input"
              className="block text-xs font-semibold text-[#0B3D2E] mb-1"
            >
              Título / Identificação da Proposta *
            </label>
            <input
              id="proposal-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              placeholder="Ex: Custeio Agrícola Soja Safra 2025/2026 - Fazenda Boa Esperança"
              className={PROPOSAL_THEME.input}
            />
            {errors.title && (
              <span className="text-xs text-[#0B3D2E] font-medium mt-1 block">
                {errors.title}
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="proposal-client-select"
              className="block text-xs font-semibold text-[#0B3D2E] mb-1"
            >
              Cliente / Produtor Rural *
            </label>
            <select
              id="proposal-client-select"
              value={clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              disabled={isSubmitting || isEdit}
              className={PROPOSAL_THEME.select}
            >
              <option value="">Selecione o produtor ou empresa...</option>
              {displayedClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {getClientDisplayName(c)} ({getClientDocument(c)})
                </option>
              ))}
            </select>
            {isCapturer && displayedClients.length === 0 && (
              <span className="text-xs text-[#0B3D2E]/80 mt-1 block">
                Nenhum cliente com vínculo ativo atribuído à sua conta de captador.
              </span>
            )}
            {errors.clientId && (
              <span className="text-xs text-[#0B3D2E] font-medium mt-1 block">
                {errors.clientId}
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="proposal-property-select"
              className="block text-xs font-semibold text-[#0B3D2E] mb-1"
            >
              Imóvel Vinculado (Opcional)
            </label>
            <select
              id="proposal-property-select"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              disabled={isSubmitting || hasNoPropertiesForClient}
              className={hasNoPropertiesForClient ? PROPOSAL_THEME.inputDisabled : PROPOSAL_THEME.select}
            >
              <option value="">
                {hasNoPropertiesForClient
                  ? 'Nenhum imóvel ativo cadastrado para este cliente'
                  : 'Nenhum imóvel vinculado diretamente'}
              </option>
              {availableProperties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.city}/{p.state})
                </option>
              ))}
            </select>
            {hasNoPropertiesForClient && (
              <span className="text-xs text-[#0B3D2E]/80 mt-1 block">
                O cliente selecionado não possui imóveis rurais ativos cadastrados. A proposta pode prosseguir sem vínculo imobiliário.
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="proposal-type-select"
              className="block text-xs font-semibold text-[#0B3D2E] mb-1"
            >
              Tipo de Proposta *
            </label>
            <select
              id="proposal-type-select"
              value={proposalType}
              onChange={(e) => setProposalType(e.target.value as ProposalType)}
              disabled={isSubmitting}
              className={PROPOSAL_THEME.select}
            >
              {Object.entries(PROPOSAL_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {errors.proposalType && (
              <span className="text-xs text-[#0B3D2E] font-medium mt-1 block">{errors.proposalType}</span>
            )}
          </div>

          <div>
            <label
              htmlFor="proposal-category-select"
              className="block text-xs font-semibold text-[#0B3D2E] mb-1"
            >
              Finalidade / Categoria *
            </label>
            <select
              id="proposal-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as ProposalCategory)}
              disabled={isSubmitting}
              className={PROPOSAL_THEME.select}
            >
              {Object.entries(PROPOSAL_CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {errors.category && (
              <span className="text-xs text-[#0B3D2E] font-medium mt-1 block">
                {errors.category}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Seção 2: Especificação Financeira */}
      <div>
        <h3 className="text-base font-bold text-[#0B3D2E] mb-3 pb-1 border-b border-[#0B3D2E]/15">
          2. Condições Financeiras e Prazos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="proposal-amount-input"
              className="block text-xs font-semibold text-[#0B3D2E] mb-1"
            >
              Valor Solicitado (R$) *
            </label>
            <input
              id="proposal-amount-input"
              type="text"
              value={amountRaw}
              onChange={handleAmountChange}
              disabled={isSubmitting}
              placeholder="0,00"
              className={PROPOSAL_THEME.input}
            />
            {amountRaw && (
              <span className="text-[11px] text-[#0B3D2E]/70 mt-0.5 block">
                Valor formatado: {formatCentsToBRL(parseBRLToCents(amountRaw))}
              </span>
            )}
            {errors.requestedAmountCents && (
              <span className="text-xs text-[#0B3D2E] font-medium mt-1 block">
                {errors.requestedAmountCents}
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="proposal-validity-input"
              className="block text-xs font-semibold text-[#0B3D2E] mb-1"
            >
              Validade da Proposta (Dias)
            </label>
            <input
              id="proposal-validity-input"
              type="number"
              min="1"
              max="365"
              step="1"
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
              disabled={isSubmitting}
              placeholder="Ex: 30"
              className={PROPOSAL_THEME.input}
            />
            {errors.validityDays && (
              <span className="text-xs text-[#0B3D2E] font-medium mt-1 block">
                {errors.validityDays}
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="proposal-term-input"
              className="block text-xs font-semibold text-[#0B3D2E] mb-1"
            >
              Prazo de Financiamento (Meses)
            </label>
            <input
              id="proposal-term-input"
              type="number"
              min="0"
              step="1"
              value={financingTermMonths}
              onChange={(e) => setFinancingTermMonths(e.target.value)}
              disabled={isSubmitting}
              placeholder="Ex: 12, 36, 60"
              className={PROPOSAL_THEME.input}
            />
            {errors.financingTermMonths && (
              <span className="text-xs text-[#0B3D2E] font-medium mt-1 block">
                {errors.financingTermMonths}
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="proposal-grace-input"
              className="block text-xs font-semibold text-[#0B3D2E] mb-1"
            >
              Carência (Meses)
            </label>
            <input
              id="proposal-grace-input"
              type="number"
              min="0"
              step="1"
              value={gracePeriodMonths}
              onChange={(e) => setGracePeriodMonths(e.target.value)}
              disabled={isSubmitting}
              placeholder="Ex: 6, 12"
              className={PROPOSAL_THEME.input}
            />
            {errors.gracePeriodMonths && (
              <span className="text-xs text-[#0B3D2E] font-medium mt-1 block">
                {errors.gracePeriodMonths}
              </span>
            )}
          </div>

          <div>
            <label
              htmlFor="proposal-interest-input"
              className="block text-xs font-semibold text-[#0B3D2E] mb-1"
            >
              Taxa de Juros Anual Estimada (% a.a.)
            </label>
            <input
              id="proposal-interest-input"
              type="text"
              value={interestRateAnnualPercentage}
              onChange={(e) => setInterestRateAnnualPercentage(e.target.value)}
              disabled={isSubmitting}
              placeholder="Ex: 8.5 ou 10,5"
              className={PROPOSAL_THEME.input}
            />
            {errors.interestRateAnnualPercentage && (
              <span className="text-xs text-[#0B3D2E] font-medium mt-1 block">
                {errors.interestRateAnnualPercentage}
              </span>
            )}
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="proposal-notes-input"
              className="block text-xs font-semibold text-[#0B3D2E] mb-1"
            >
              Observações e Notas Gerais
            </label>
            <textarea
              id="proposal-notes-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder="Informações adicionais relevantes, garantias ou parecer preliminar..."
              className={PROPOSAL_THEME.textarea}
            />
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#0B3D2E]/15">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className={PROPOSAL_THEME.btnSecondary}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className={PROPOSAL_THEME.btnPrimary}
          id="proposal-form-submit-btn"
        >
          {isSubmitting
            ? 'Salvando proposta...'
            : isEdit
            ? 'Salvar Alterações'
            : 'Cadastrar Proposta'}
        </button>
      </div>
    </form>
  );
};
