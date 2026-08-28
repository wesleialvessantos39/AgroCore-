import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  User,
  Building2,
  Phone,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  HelpCircle,
  ArrowLeft,
  Save,
} from 'lucide-react';
import {
  Client,
  ClientFormValues,
  ClientPersonType,
  ClientStatus,
  AddressType,
  ClientValidationErrors,
} from '../../types/client';
import {
  BRAZILIAN_STATES,
  formatCpf,
  formatCnpj,
  formatPhone,
  formatCep,
  validateClientForm,
  normalizeDigits,
  normalizeText,
} from '../validators';
import { Button } from '../../components/ui/Button';
import { UnsavedChangesModal } from './UnsavedChangesModal';
import { AddressTypeChangeModal } from './AddressTypeChangeModal';

export interface ClientFormProps {
  mode: 'create' | 'edit';
  initialClient?: Client | null;
  onSubmit: (values: ClientFormValues) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  serverError?: string | null;
}

const DEFAULT_INDIVIDUAL_VALUES: ClientFormValues = {
  personType: 'individual',
  name: '',
  cpf: '',
  rg: '',
  rgIssuer: '',
  rgState: '',
  birthDate: '',
  stateRegistration: '',
  isStateRegistrationExempt: false,
  status: 'active',
  primaryPhone: '',
  hasWhatsapp: false,
  secondaryPhone: '',
  email: '',
  addressType: 'urban',
  zipCode: '',
  street: '',
  number: '',
  isNoNumber: false,
  neighborhood: '',
  city: '',
  state: '',
  complement: '',
  referencePoint: '',
  locality: '',
  accessDescription: '',
  ruralZipCode: '',
  ruralComplement: '',
};

function clientToFormValues(client: Client): ClientFormValues {
  const isIndividual = client.personType === 'individual';
  const isUrban = client.address.addressType === 'urban';

  if (isIndividual) {
    return {
      personType: 'individual',
      name: client.name,
      cpf: formatCpf(client.cpf),
      rg: client.rg || '',
      rgIssuer: client.rgIssuer || '',
      rgState: client.rgState || '',
      birthDate: client.birthDate || '',
      stateRegistration: client.stateRegistration || '',
      isStateRegistrationExempt: client.isStateRegistrationExempt,
      status: client.status,
      primaryPhone: formatPhone(client.contact.primaryPhone),
      hasWhatsapp: client.contact.hasWhatsapp,
      secondaryPhone: client.contact.secondaryPhone ? formatPhone(client.contact.secondaryPhone) : '',
      email: client.contact.email || '',
      addressType: client.address.addressType,
      zipCode: isUrban ? formatCep(client.address.zipCode) : '',
      street: isUrban ? client.address.street : '',
      number: isUrban ? client.address.number : '',
      isNoNumber: isUrban ? client.address.isNoNumber : false,
      neighborhood: isUrban ? client.address.neighborhood : '',
      city: client.address.city,
      state: client.address.state,
      complement: isUrban ? client.address.complement || '' : '',
      referencePoint: isUrban ? client.address.referencePoint || '' : '',
      locality: !isUrban ? client.address.locality : '',
      accessDescription: !isUrban ? client.address.accessDescription : '',
      ruralZipCode: !isUrban && client.address.zipCode ? formatCep(client.address.zipCode) : '',
      ruralComplement: !isUrban ? client.address.complement || '' : '',
    };
  } else {
    return {
      personType: 'legal_entity',
      companyName: client.companyName,
      tradeName: client.tradeName || '',
      cnpj: formatCnpj(client.cnpj),
      stateRegistration: client.stateRegistration || '',
      isStateRegistrationExempt: client.isStateRegistrationExempt,
      status: client.status,
      primaryPhone: formatPhone(client.contact.primaryPhone),
      hasWhatsapp: client.contact.hasWhatsapp,
      secondaryPhone: client.contact.secondaryPhone ? formatPhone(client.contact.secondaryPhone) : '',
      email: client.contact.email || '',
      addressType: client.address.addressType,
      zipCode: isUrban ? formatCep(client.address.zipCode) : '',
      street: isUrban ? client.address.street : '',
      number: isUrban ? client.address.number : '',
      isNoNumber: isUrban ? client.address.isNoNumber : false,
      neighborhood: isUrban ? client.address.neighborhood : '',
      city: client.address.city,
      state: client.address.state,
      complement: isUrban ? client.address.complement || '' : '',
      referencePoint: isUrban ? client.address.referencePoint || '' : '',
      locality: !isUrban ? client.address.locality : '',
      accessDescription: !isUrban ? client.address.accessDescription : '',
      ruralZipCode: !isUrban && client.address.zipCode ? formatCep(client.address.zipCode) : '',
      ruralComplement: !isUrban ? client.address.complement || '' : '',
    };
  }
}

export function ClientForm({
  mode,
  initialClient,
  onSubmit,
  onCancel,
  isSubmitting,
  serverError,
}: ClientFormProps) {
  const initialValues = useMemo<ClientFormValues>(() => {
    if (initialClient) {
      return clientToFormValues(initialClient);
    }
    return DEFAULT_INDIVIDUAL_VALUES;
  }, [initialClient]);

  const [values, setValues] = useState<ClientFormValues>(initialValues);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<ClientValidationErrors>({});
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
  const [pendingAddressType, setPendingAddressType] = useState<AddressType | null>(null);

  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);

  // Calcula se o formulário foi modificado pelo usuário
  const isDirty = useMemo(() => {
    return JSON.stringify(values) !== JSON.stringify(initialValues);
  }, [values, initialValues]);

  // Alerta nativo de fechamento acidental da aba caso haja dados não salvos
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Atualiza valores caso o initialClient mude (ex: carregamento assíncrono na edição)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setValues(initialValues);
  }, [initialValues]);

  // Atualiza campo único
  const handleChange = (field: string, value: unknown) => {
    setValues((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Se o campo já estiver com erro, revalida silenciosamente
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Marcação de campo tocado ao sair (blur)
  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const currentErrors = validateClientForm(values);
    if (currentErrors[field]) {
      setErrors((prev) => ({ ...prev, [field]: currentErrors[field] }));
    } else {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Tratamento da troca de tipo de pessoa (apenas no modo criação)
  const handlePersonTypeChange = (newType: ClientPersonType) => {
    if (mode === 'edit' || values.personType === newType) return;

    if (newType === 'individual') {
      const existingName = values.personType === 'legal_entity' ? values.companyName : values.name;
      setValues((prev) => ({
        ...prev,
        personType: 'individual',
        name: existingName || '',
        cpf: '',
        rg: '',
        rgIssuer: '',
        rgState: '',
        birthDate: '',
      }));
    } else {
      const existingName = values.personType === 'individual' ? values.name : values.companyName;
      setValues((prev) => ({
        ...prev,
        personType: 'legal_entity',
        companyName: existingName || '',
        tradeName: '',
        cnpj: '',
      }));
    }
    setErrors({});
  };

  // Tratamento da troca de tipo de endereço com diálogo de confirmação se houver dados
  const handleAddressTypeSelect = (targetType: AddressType) => {
    if (values.addressType === targetType) return;

    // Verifica se há dados preenchidos no tipo de endereço atual
    const hasUrbanData =
      normalizeText(values.zipCode).length > 0 ||
      normalizeText(values.street).length > 0 ||
      normalizeText(values.neighborhood).length > 0 ||
      normalizeText(values.number).length > 0;

    const hasRuralData =
      normalizeText(values.locality).length > 0 ||
      normalizeText(values.accessDescription).length > 0 ||
      normalizeText(values.ruralZipCode).length > 0;

    const hasConflictingData =
      values.addressType === 'urban' ? hasUrbanData : hasRuralData;

    if (hasConflictingData) {
      setPendingAddressType(targetType);
    } else {
      handleChange('addressType', targetType);
    }
  };

  const confirmAddressTypeChange = () => {
    if (pendingAddressType) {
      setValues((prev) => ({
        ...prev,
        addressType: pendingAddressType,
        // Limpa campos específicos incompatíveis
        zipCode: '',
        street: '',
        number: '',
        isNoNumber: false,
        neighborhood: '',
        complement: '',
        referencePoint: '',
        locality: '',
        accessDescription: '',
        ruralZipCode: '',
        ruralComplement: '',
      }));
      setPendingAddressType(null);
    }
  };

  const cancelAddressTypeChange = () => {
    setPendingAddressType(null);
  };

  // Submissão do formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateClientForm(values);
    setErrors(validationErrors);

    const errorKeys = Object.keys(validationErrors);
    if (errorKeys.length > 0) {
      // Foca no primeiro campo com erro
      const firstErrorField = errorKeys[0];
      const targetElement = document.getElementById(`field-${firstErrorField}`);
      if (targetElement) {
        targetElement.focus();
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (errorSummaryRef.current) {
        errorSummaryRef.current.focus();
      }
      return;
    }

    await onSubmit(values);
  };

  const handleCancelClick = () => {
    if (isDirty) {
      setIsUnsavedModalOpen(true);
    } else {
      onCancel();
    }
  };

  const todayDate = new Date().toISOString().split('T')[0];
  const isIndividual = values.personType === 'individual';
  const isUrban = values.addressType === 'urban';

  return (
    <form
      id="client-form"
      onSubmit={handleSubmit}
      noValidate
      className="space-y-8 max-w-4xl mx-auto pb-12"
    >
      {/* Banner Exclusivo de Desenvolvimento */}
      {import.meta.env.DEV && (
        <div
          id="dev-mode-warning-banner"
          className="rounded-xl bg-amber-50/90 border border-amber-200 p-4 flex items-start gap-3 text-amber-900 shadow-xs"
          role="note"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs sm:text-sm leading-relaxed space-y-1">
            <p className="font-semibold text-amber-950">
              Ambiente de acompanhamento e testes temporários
            </p>
            <p className="text-amber-800">
              Não insira dados pessoais reais. Os registros são temporários e serão descartados ao recarregar ou encerrar a sessão.
            </p>
          </div>
        </div>
      )}

      {/* Resumo Acessível de Erros de Validação */}
      {Object.keys(errors).length > 0 && (
        <div
          ref={errorSummaryRef}
          id="client-form-error-summary"
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="rounded-xl bg-red-50 border border-red-200 p-4 sm:p-5 text-red-900 focus:outline-hidden focus:ring-2 focus:ring-red-500"
        >
          <div className="flex items-center gap-2 mb-2 font-bold text-red-950 text-sm sm:text-base">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
            <span>Por favor, corrija os seguintes campos antes de salvar:</span>
          </div>
          <ul className="list-disc list-inside text-xs sm:text-sm text-red-800 space-y-1 ml-2">
            {Object.entries(errors).map(([key, msg]) => (
              <li key={key}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Erro de Servidor / Unicidade / Autorização */}
      {serverError && (
        <div
          id="client-form-server-error"
          role="alert"
          className="rounded-xl bg-red-50 border border-red-300 p-4 text-red-900 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm font-medium">{serverError}</div>
        </div>
      )}

      {/* SEÇÃO 1: TIPO DE PESSOA E IDENTIFICAÇÃO */}
      <section
        id="section-client-identification"
        aria-labelledby="heading-client-identification"
        className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-6 sm:p-8 space-y-6"
      >
        <div className="border-b border-[#F1F5F9] pb-4">
          <h2
            id="heading-client-identification"
            className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2"
          >
            <User className="w-5 h-5 text-[#0B3D2E]" aria-hidden="true" />
            <span>Identificação Cadastral</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] mt-1">
            Selecione o tipo de produtor e informe os dados principais de identificação.
          </p>
        </div>

        {/* Tipo de Pessoa (PF / PJ) */}
        <div>
          <label className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-2">
            Tipo de Pessoa <span className="text-red-500">*</span>
          </label>

          {mode === 'edit' ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 text-xs sm:text-sm font-semibold">
              {isIndividual ? (
                <>
                  <User className="w-4 h-4 text-slate-600" aria-hidden="true" />
                  <span>Pessoa Física (PF) — Imutável na edição</span>
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4 text-slate-600" aria-hidden="true" />
                  <span>Pessoa Jurídica (PJ) — Imutável na edição</span>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Tipo de pessoa">
              <button
                type="button"
                id="btn-select-individual"
                role="radio"
                aria-checked={isIndividual}
                onClick={() => handlePersonTypeChange('individual')}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                  isIndividual
                    ? 'border-[#0B3D2E] bg-[#EFF5F2] text-[#0B3D2E] ring-1 ring-[#0B3D2E] font-semibold'
                    : 'border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAF9]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    isIndividual ? 'border-[#0B3D2E] bg-[#0B3D2E] text-white' : 'border-[#94A3B8]'
                  }`}
                >
                  {isIndividual && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div>
                  <div className="text-sm font-bold">Pessoa Física (PF)</div>
                  <div className="text-xs text-[#64748B]">Produtores rurais autônomos e cooperados</div>
                </div>
              </button>

              <button
                type="button"
                id="btn-select-legal-entity"
                role="radio"
                aria-checked={!isIndividual}
                onClick={() => handlePersonTypeChange('legal_entity')}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                  !isIndividual
                    ? 'border-[#0B3D2E] bg-[#EFF5F2] text-[#0B3D2E] ring-1 ring-[#0B3D2E] font-semibold'
                    : 'border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAF9]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    !isIndividual ? 'border-[#0B3D2E] bg-[#0B3D2E] text-white' : 'border-[#94A3B8]'
                  }`}
                >
                  {!isIndividual && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div>
                  <div className="text-sm font-bold">Pessoa Jurídica (PJ)</div>
                  <div className="text-xs text-[#64748B]">Empresas rurais, cooperativas e agroindústrias</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Campos Condicionais: PF */}
        {isIndividual ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Nome Completo */}
            <div className="sm:col-span-2 lg:col-span-2">
              <label htmlFor="field-name" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                Nome Completo <span className="text-red-500">*</span>
              </label>
              <input
                id="field-name"
                type="text"
                required
                autoComplete="name"
                value={values.name}
                onChange={(e) => handleChange('name', e.target.value)}
                onBlur={() => handleBlur('name')}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'error-name' : undefined}
                placeholder="Ex: João da Silva Santos"
                className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                  errors.name
                    ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                    : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                }`}
              />
              {errors.name && (
                <p id="error-name" className="text-xs text-red-600 font-medium mt-1">
                  {errors.name}
                </p>
              )}
            </div>

            {/* CPF */}
            <div>
              <label htmlFor="field-cpf" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                CPF <span className="text-red-500">*</span>
              </label>
              <input
                id="field-cpf"
                type="text"
                required
                inputMode="numeric"
                value={values.cpf}
                onChange={(e) => handleChange('cpf', formatCpf(e.target.value))}
                onBlur={() => handleBlur('cpf')}
                aria-invalid={!!errors.cpf}
                aria-describedby={errors.cpf ? 'error-cpf' : undefined}
                placeholder="000.000.000-00"
                maxLength={14}
                className={`w-full h-11 px-3.5 rounded-xl border text-sm font-mono transition-colors focus:outline-hidden focus:ring-2 ${
                  errors.cpf
                    ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                    : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                }`}
              />
              {errors.cpf && (
                <p id="error-cpf" className="text-xs text-red-600 font-medium mt-1">
                  {errors.cpf}
                </p>
              )}
            </div>

            {/* RG */}
            <div>
              <label htmlFor="field-rg" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                RG <span className="text-xs text-[#64748B] font-normal">(Opcional)</span>
              </label>
              <input
                id="field-rg"
                type="text"
                value={values.rg}
                onChange={(e) => handleChange('rg', e.target.value)}
                onBlur={() => handleBlur('rg')}
                aria-invalid={!!errors.rg}
                aria-describedby={errors.rg ? 'error-rg' : undefined}
                placeholder="Número do documento"
                maxLength={20}
                className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                  errors.rg
                    ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                    : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                }`}
              />
              {errors.rg && (
                <p id="error-rg" className="text-xs text-red-600 font-medium mt-1">
                  {errors.rg}
                </p>
              )}
            </div>

            {/* Órgão Expedidor */}
            <div>
              <label htmlFor="field-rgIssuer" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                Órgão Expedidor <span className="text-xs text-[#64748B] font-normal">(Opcional)</span>
              </label>
              <input
                id="field-rgIssuer"
                type="text"
                value={values.rgIssuer}
                onChange={(e) => handleChange('rgIssuer', e.target.value.toUpperCase())}
                onBlur={() => handleBlur('rgIssuer')}
                placeholder="Ex: SSP, PC, DETRAN"
                maxLength={10}
                className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white"
              />
            </div>

            {/* UF do RG */}
            <div>
              <label htmlFor="field-rgState" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                UF do RG <span className="text-xs text-[#64748B] font-normal">(Opcional)</span>
              </label>
              <select
                id="field-rgState"
                value={values.rgState}
                onChange={(e) => handleChange('rgState', e.target.value)}
                onBlur={() => handleBlur('rgState')}
                className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white cursor-pointer"
              >
                <option value="">Selecione a UF</option>
                {BRAZILIAN_STATES.map((s) => (
                  <option key={s.uf} value={s.uf}>
                    {s.uf} — {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Data de Nascimento */}
            <div>
              <label htmlFor="field-birthDate" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                Data de Nascimento <span className="text-xs text-[#64748B] font-normal">(Opcional)</span>
              </label>
              <input
                id="field-birthDate"
                type="date"
                max={todayDate}
                value={values.birthDate}
                onChange={(e) => handleChange('birthDate', e.target.value)}
                onBlur={() => handleBlur('birthDate')}
                aria-invalid={!!errors.birthDate}
                aria-describedby={errors.birthDate ? 'error-birthDate' : undefined}
                className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                  errors.birthDate
                    ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                    : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                }`}
              />
              {errors.birthDate && (
                <p id="error-birthDate" className="text-xs text-red-600 font-medium mt-1">
                  {errors.birthDate}
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Campos Condicionais: PJ */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Razão Social */}
            <div className="sm:col-span-2 lg:col-span-2">
              <label htmlFor="field-companyName" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                Razão Social <span className="text-red-500">*</span>
              </label>
              <input
                id="field-companyName"
                type="text"
                required
                value={values.companyName}
                onChange={(e) => handleChange('companyName', e.target.value)}
                onBlur={() => handleBlur('companyName')}
                aria-invalid={!!errors.companyName}
                aria-describedby={errors.companyName ? 'error-companyName' : undefined}
                placeholder="Ex: Agropecuária Vale Verde Ltda"
                className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                  errors.companyName
                    ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                    : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                }`}
              />
              {errors.companyName && (
                <p id="error-companyName" className="text-xs text-red-600 font-medium mt-1">
                  {errors.companyName}
                </p>
              )}
            </div>

            {/* CNPJ */}
            <div>
              <label htmlFor="field-cnpj" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                CNPJ <span className="text-red-500">*</span>
              </label>
              <input
                id="field-cnpj"
                type="text"
                required
                inputMode="numeric"
                value={values.cnpj}
                onChange={(e) => handleChange('cnpj', formatCnpj(e.target.value))}
                onBlur={() => handleBlur('cnpj')}
                aria-invalid={!!errors.cnpj}
                aria-describedby={errors.cnpj ? 'error-cnpj' : undefined}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                className={`w-full h-11 px-3.5 rounded-xl border text-sm font-mono transition-colors focus:outline-hidden focus:ring-2 ${
                  errors.cnpj
                    ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                    : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                }`}
              />
              {errors.cnpj && (
                <p id="error-cnpj" className="text-xs text-red-600 font-medium mt-1">
                  {errors.cnpj}
                </p>
              )}
            </div>

            {/* Nome Fantasia */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label htmlFor="field-tradeName" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                Nome Fantasia <span className="text-xs text-[#64748B] font-normal">(Opcional)</span>
              </label>
              <input
                id="field-tradeName"
                type="text"
                value={values.tradeName}
                onChange={(e) => handleChange('tradeName', e.target.value)}
                onBlur={() => handleBlur('tradeName')}
                placeholder="Ex: Fazenda Vale Verde"
                className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white"
              />
            </div>
          </div>
        )}
      </section>

      {/* SEÇÃO 2: INSCRIÇÃO ESTADUAL */}
      <section
        id="section-state-registration"
        aria-labelledby="heading-state-registration"
        className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-6 sm:p-8 space-y-6"
      >
        <div className="border-b border-[#F1F5F9] pb-4">
          <h2
            id="heading-state-registration"
            className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2"
          >
            <ShieldCheck className="w-5 h-5 text-[#0B3D2E]" aria-hidden="true" />
            <span>Inscrição Estadual (IE)</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] mt-1">
            Informe a Inscrição Estadual do produtor ou assinale a opção de isenção.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
          <div>
            <label htmlFor="field-stateRegistration" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
              Número da Inscrição Estadual {!values.isStateRegistrationExempt && <span className="text-red-500">*</span>}
            </label>
            <input
              id="field-stateRegistration"
              type="text"
              disabled={values.isStateRegistrationExempt}
              value={values.isStateRegistrationExempt ? '' : values.stateRegistration}
              onChange={(e) => handleChange('stateRegistration', e.target.value)}
              onBlur={() => handleBlur('stateRegistration')}
              aria-invalid={!!errors.stateRegistration}
              aria-describedby={errors.stateRegistration ? 'error-stateRegistration' : undefined}
              placeholder={values.isStateRegistrationExempt ? 'Produtor isento de IE' : 'Número da Inscrição Estadual'}
              maxLength={20}
              className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                values.isStateRegistrationExempt
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : errors.stateRegistration
                  ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                  : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
              }`}
            />
            {errors.stateRegistration && !values.isStateRegistrationExempt && (
              <p id="error-stateRegistration" className="text-xs text-red-600 font-medium mt-1">
                {errors.stateRegistration}
              </p>
            )}
          </div>

          <div className="pt-2 sm:pt-7">
            <label
              htmlFor="field-isStateRegistrationExempt"
              className="inline-flex items-center gap-3 cursor-pointer select-none text-sm text-[#1E293B] font-medium"
            >
              <input
                id="field-isStateRegistrationExempt"
                type="checkbox"
                checked={values.isStateRegistrationExempt}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  handleChange('isStateRegistrationExempt', isChecked);
                  if (isChecked) {
                    handleChange('stateRegistration', '');
                  }
                }}
                className="w-5 h-5 rounded-md border-[#CBD5E1] text-[#0B3D2E] focus:ring-[#78C89A] cursor-pointer"
              />
              <span>Isento de inscrição estadual</span>
            </label>
            <p className="text-xs text-[#64748B] mt-1 ml-8">
              Marque se o produtor ou empresa não possuir inscrição ativa na SEFAZ.
            </p>
          </div>
        </div>
      </section>

      {/* SEÇÃO 3: CONTATOS */}
      <section
        id="section-client-contacts"
        aria-labelledby="heading-client-contacts"
        className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-6 sm:p-8 space-y-6"
      >
        <div className="border-b border-[#F1F5F9] pb-4">
          <h2
            id="heading-client-contacts"
            className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2"
          >
            <Phone className="w-5 h-5 text-[#0B3D2E]" aria-hidden="true" />
            <span>Dados de Contato</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] mt-1">
            Telefones e e-mail para comunicação e acompanhamento das propostas.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Telefone Principal */}
          <div>
            <label htmlFor="field-primaryPhone" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
              Telefone Principal <span className="text-red-500">*</span>
            </label>
            <input
              id="field-primaryPhone"
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel"
              value={values.primaryPhone}
              onChange={(e) => handleChange('primaryPhone', formatPhone(e.target.value))}
              onBlur={() => handleBlur('primaryPhone')}
              aria-invalid={!!errors.primaryPhone}
              aria-describedby={errors.primaryPhone ? 'error-primaryPhone' : undefined}
              placeholder="(00) 00000-0000"
              maxLength={15}
              className={`w-full h-11 px-3.5 rounded-xl border text-sm font-mono transition-colors focus:outline-hidden focus:ring-2 ${
                errors.primaryPhone
                  ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                  : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
              }`}
            />
            {errors.primaryPhone && (
              <p id="error-primaryPhone" className="text-xs text-red-600 font-medium mt-1">
                {errors.primaryPhone}
              </p>
            )}

            <div className="mt-2.5">
              <label
                htmlFor="field-hasWhatsapp"
                className="inline-flex items-center gap-2 cursor-pointer select-none text-xs sm:text-sm text-[#334155]"
              >
                <input
                  id="field-hasWhatsapp"
                  type="checkbox"
                  checked={values.hasWhatsapp}
                  onChange={(e) => handleChange('hasWhatsapp', e.target.checked)}
                  className="w-4 h-4 rounded-md border-[#CBD5E1] text-[#0B3D2E] focus:ring-[#78C89A] cursor-pointer"
                />
                <span>Este número possui WhatsApp</span>
              </label>
            </div>
          </div>

          {/* Telefone Secundário */}
          <div>
            <label htmlFor="field-secondaryPhone" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
              Telefone Secundário <span className="text-xs text-[#64748B] font-normal">(Opcional)</span>
            </label>
            <input
              id="field-secondaryPhone"
              type="tel"
              inputMode="tel"
              value={values.secondaryPhone}
              onChange={(e) => handleChange('secondaryPhone', formatPhone(e.target.value))}
              onBlur={() => handleBlur('secondaryPhone')}
              aria-invalid={!!errors.secondaryPhone}
              aria-describedby={errors.secondaryPhone ? 'error-secondaryPhone' : undefined}
              placeholder="(00) 00000-0000"
              maxLength={15}
              className={`w-full h-11 px-3.5 rounded-xl border text-sm font-mono transition-colors focus:outline-hidden focus:ring-2 ${
                errors.secondaryPhone
                  ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                  : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
              }`}
            />
            {errors.secondaryPhone && (
              <p id="error-secondaryPhone" className="text-xs text-red-600 font-medium mt-1">
                {errors.secondaryPhone}
              </p>
            )}
          </div>

          {/* E-mail */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="field-email" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
              E-mail <span className="text-xs text-[#64748B] font-normal">(Opcional)</span>
            </label>
            <input
              id="field-email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={(e) => handleChange('email', e.target.value)}
              onBlur={() => handleBlur('email')}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'error-email' : undefined}
              placeholder="cliente@exemplo.com.br"
              maxLength={254}
              className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                errors.email
                  ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                  : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
              }`}
            />
            {errors.email && (
              <p id="error-email" className="text-xs text-red-600 font-medium mt-1">
                {errors.email}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* SEÇÃO 4: ENDEREÇO PRINCIPAL */}
      <section
        id="section-client-address"
        aria-labelledby="heading-client-address"
        className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-6 sm:p-8 space-y-6"
      >
        <div className="border-b border-[#F1F5F9] pb-4">
          <h2
            id="heading-client-address"
            className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2"
          >
            <MapPin className="w-5 h-5 text-[#0B3D2E]" aria-hidden="true" />
            <span>Endereço Principal</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] mt-1">
            Defina se o domicílio principal é urbano ou rural e informe a localização.
          </p>
        </div>

        {/* Alternância Urbano / Rural */}
        <div>
          <label className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-2">
            Tipo de Endereço <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Tipo de endereço">
            <button
              type="button"
              id="btn-address-urban"
              role="radio"
              aria-checked={isUrban}
              onClick={() => handleAddressTypeSelect('urban')}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                isUrban
                  ? 'border-[#0B3D2E] bg-[#EFF5F2] text-[#0B3D2E] ring-1 ring-[#0B3D2E] font-semibold'
                  : 'border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAF9]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                  isUrban ? 'border-[#0B3D2E] bg-[#0B3D2E] text-white' : 'border-[#94A3B8]'
                }`}
              >
                {isUrban && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <div className="text-sm font-bold">Endereço Urbano</div>
                <div className="text-xs text-[#64748B]">Com CEP, logradouro, número e bairro</div>
              </div>
            </button>

            <button
              type="button"
              id="btn-address-rural"
              role="radio"
              aria-checked={!isUrban}
              onClick={() => handleAddressTypeSelect('rural')}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                !isUrban
                  ? 'border-[#0B3D2E] bg-[#EFF5F2] text-[#0B3D2E] ring-1 ring-[#0B3D2E] font-semibold'
                  : 'border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAF9]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                  !isUrban ? 'border-[#0B3D2E] bg-[#0B3D2E] text-white' : 'border-[#94A3B8]'
                }`}
              >
                {!isUrban && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <div className="text-sm font-bold">Endereço Rural</div>
                <div className="text-xs text-[#64748B]">Localidade, comunidade, linha e ponto de acesso</div>
              </div>
            </button>
          </div>
        </div>

        {/* Campos de Município e UF (Comuns a ambos os tipos) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="sm:col-span-2">
            <label htmlFor="field-city" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
              Município <span className="text-red-500">*</span>
            </label>
            <input
              id="field-city"
              type="text"
              required
              value={values.city}
              onChange={(e) => handleChange('city', e.target.value)}
              onBlur={() => handleBlur('city')}
              aria-invalid={!!errors.city}
              aria-describedby={errors.city ? 'error-city' : undefined}
              placeholder="Ex: Rio Verde"
              className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                errors.city
                  ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                  : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
              }`}
            />
            {errors.city && (
              <p id="error-city" className="text-xs text-red-600 font-medium mt-1">
                {errors.city}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="field-state" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
              UF <span className="text-red-500">*</span>
            </label>
            <select
              id="field-state"
              required
              value={values.state}
              onChange={(e) => handleChange('state', e.target.value)}
              onBlur={() => handleBlur('state')}
              aria-invalid={!!errors.state}
              aria-describedby={errors.state ? 'error-state' : undefined}
              className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 cursor-pointer ${
                errors.state
                  ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                  : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
              }`}
            >
              <option value="">Selecione a UF</option>
              {BRAZILIAN_STATES.map((s) => (
                <option key={s.uf} value={s.uf}>
                  {s.uf} — {s.name}
                </option>
              ))}
            </select>
            {errors.state && (
              <p id="error-state" className="text-xs text-red-600 font-medium mt-1">
                {errors.state}
              </p>
            )}
          </div>
        </div>

        {/* Campos Específicos: Urbano */}
        {isUrban ? (
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* CEP Urbano */}
              <div>
                <label htmlFor="field-zipCode" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                  CEP <span className="text-red-500">*</span>
                </label>
                <input
                  id="field-zipCode"
                  type="text"
                  required
                  inputMode="numeric"
                  value={values.zipCode}
                  onChange={(e) => handleChange('zipCode', formatCep(e.target.value))}
                  onBlur={() => handleBlur('zipCode')}
                  aria-invalid={!!errors.zipCode}
                  aria-describedby={errors.zipCode ? 'error-zipCode' : undefined}
                  placeholder="00000-000"
                  maxLength={9}
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm font-mono transition-colors focus:outline-hidden focus:ring-2 ${
                    errors.zipCode
                      ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                      : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                  }`}
                />
                {errors.zipCode && (
                  <p id="error-zipCode" className="text-xs text-red-600 font-medium mt-1">
                    {errors.zipCode}
                  </p>
                )}
              </div>

              {/* Logradouro */}
              <div className="sm:col-span-2">
                <label htmlFor="field-street" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                  Logradouro (Rua/Avenida) <span className="text-red-500">*</span>
                </label>
                <input
                  id="field-street"
                  type="text"
                  required
                  value={values.street}
                  onChange={(e) => handleChange('street', e.target.value)}
                  onBlur={() => handleBlur('street')}
                  aria-invalid={!!errors.street}
                  aria-describedby={errors.street ? 'error-street' : undefined}
                  placeholder="Ex: Av. Presidente Vargas"
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                    errors.street
                      ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                      : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                  }`}
                />
                {errors.street && (
                  <p id="error-street" className="text-xs text-red-600 font-medium mt-1">
                    {errors.street}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* Número + Sem número */}
              <div>
                <label htmlFor="field-number" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                  Número {!values.isNoNumber && <span className="text-red-500">*</span>}
                </label>
                <input
                  id="field-number"
                  type="text"
                  disabled={values.isNoNumber}
                  value={values.isNoNumber ? '' : values.number}
                  onChange={(e) => handleChange('number', e.target.value)}
                  onBlur={() => handleBlur('number')}
                  aria-invalid={!!errors.number}
                  aria-describedby={errors.number ? 'error-number' : undefined}
                  placeholder={values.isNoNumber ? 'S/N' : 'Ex: 1200'}
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                    values.isNoNumber
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : errors.number
                      ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                      : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                  }`}
                />
                {errors.number && !values.isNoNumber && (
                  <p id="error-number" className="text-xs text-red-600 font-medium mt-1">
                    {errors.number}
                  </p>
                )}

                <div className="mt-2">
                  <label
                    htmlFor="field-isNoNumber"
                    className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-[#334155]"
                  >
                    <input
                      id="field-isNoNumber"
                      type="checkbox"
                      checked={values.isNoNumber}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        handleChange('isNoNumber', isChecked);
                        if (isChecked) {
                          handleChange('number', '');
                        }
                      }}
                      className="w-4 h-4 rounded-md border-[#CBD5E1] text-[#0B3D2E] focus:ring-[#78C89A] cursor-pointer"
                    />
                    <span>Sem número (S/N)</span>
                  </label>
                </div>
              </div>

              {/* Bairro */}
              <div className="sm:col-span-2">
                <label htmlFor="field-neighborhood" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                  Bairro <span className="text-red-500">*</span>
                </label>
                <input
                  id="field-neighborhood"
                  type="text"
                  required
                  value={values.neighborhood}
                  onChange={(e) => handleChange('neighborhood', e.target.value)}
                  onBlur={() => handleBlur('neighborhood')}
                  aria-invalid={!!errors.neighborhood}
                  aria-describedby={errors.neighborhood ? 'error-neighborhood' : undefined}
                  placeholder="Ex: Setor Central"
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                    errors.neighborhood
                      ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                      : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                  }`}
                />
                {errors.neighborhood && (
                  <p id="error-neighborhood" className="text-xs text-red-600 font-medium mt-1">
                    {errors.neighborhood}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Complemento */}
              <div>
                <label htmlFor="field-complement" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                  Complemento <span className="text-xs text-[#64748B] font-normal">(Opcional)</span>
                </label>
                <input
                  id="field-complement"
                  type="text"
                  value={values.complement}
                  onChange={(e) => handleChange('complement', e.target.value)}
                  onBlur={() => handleBlur('complement')}
                  placeholder="Ex: Sala 402, Bloco B"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white"
                />
              </div>

              {/* Ponto de Referência */}
              <div>
                <label htmlFor="field-referencePoint" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                  Ponto de Referência <span className="text-xs text-[#64748B] font-normal">(Opcional)</span>
                </label>
                <input
                  id="field-referencePoint"
                  type="text"
                  value={values.referencePoint}
                  onChange={(e) => handleChange('referencePoint', e.target.value)}
                  onBlur={() => handleBlur('referencePoint')}
                  placeholder="Ex: Próximo à praça da matriz"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white"
                />
              </div>
            </div>
          </div>
        ) : (
          /* Campos Específicos: Rural */
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Localidade / Linha / Região Rural */}
              <div>
                <label htmlFor="field-locality" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                  Localidade / Linha / Comunidade <span className="text-red-500">*</span>
                </label>
                <input
                  id="field-locality"
                  type="text"
                  required
                  value={values.locality}
                  onChange={(e) => handleChange('locality', e.target.value)}
                  onBlur={() => handleBlur('locality')}
                  aria-invalid={!!errors.locality}
                  aria-describedby={errors.locality ? 'error-locality' : undefined}
                  placeholder="Ex: Gleba Santa Rita, Linha 04"
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                    errors.locality
                      ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                      : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                  }`}
                />
                {errors.locality && (
                  <p id="error-locality" className="text-xs text-red-600 font-medium mt-1">
                    {errors.locality}
                  </p>
                )}
              </div>

              {/* CEP Rural (Opcional) */}
              <div>
                <label htmlFor="field-ruralZipCode" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                  CEP Rural <span className="text-xs text-[#64748B] font-normal">(Opcional)</span>
                </label>
                <input
                  id="field-ruralZipCode"
                  type="text"
                  inputMode="numeric"
                  value={values.ruralZipCode}
                  onChange={(e) => handleChange('ruralZipCode', formatCep(e.target.value))}
                  onBlur={() => handleBlur('ruralZipCode')}
                  aria-invalid={!!errors.ruralZipCode}
                  aria-describedby={errors.ruralZipCode ? 'error-ruralZipCode' : undefined}
                  placeholder="00000-000"
                  maxLength={9}
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm font-mono transition-colors focus:outline-hidden focus:ring-2 ${
                    errors.ruralZipCode
                      ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                      : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                  }`}
                />
                {errors.ruralZipCode && (
                  <p id="error-ruralZipCode" className="text-xs text-red-600 font-medium mt-1">
                    {errors.ruralZipCode}
                  </p>
                )}
              </div>
            </div>

            {/* Descrição de Acesso / Referência Rural */}
            <div>
              <label htmlFor="field-accessDescription" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                Descrição de Acesso ou Referência <span className="text-red-500">*</span>
              </label>
              <textarea
                id="field-accessDescription"
                required
                rows={3}
                value={values.accessDescription}
                onChange={(e) => handleChange('accessDescription', e.target.value)}
                onBlur={() => handleBlur('accessDescription')}
                aria-invalid={!!errors.accessDescription}
                aria-describedby={errors.accessDescription ? 'error-accessDescription' : undefined}
                placeholder="Ex: Rodovia BR-163, km 42, entrar à direita na estrada vicinal do Silo, seguir por 8 km até a porteira branca."
                className={`w-full p-3.5 rounded-xl border text-sm transition-colors focus:outline-hidden focus:ring-2 ${
                  errors.accessDescription
                    ? 'border-red-500 focus:ring-red-400 bg-red-50/30'
                    : 'border-[#CBD5E1] focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white'
                }`}
              />
              {errors.accessDescription && (
                <p id="error-accessDescription" className="text-xs text-red-600 font-medium mt-1">
                  {errors.accessDescription}
                </p>
              )}
            </div>

            {/* Complemento Rural */}
            <div>
              <label htmlFor="field-ruralComplement" className="block text-xs sm:text-sm font-semibold text-[#1E293B] mb-1.5">
                Complemento Rural <span className="text-xs text-[#64748B] font-normal">(Opcional)</span>
              </label>
              <input
                id="field-ruralComplement"
                type="text"
                value={values.ruralComplement}
                onChange={(e) => handleChange('ruralComplement', e.target.value)}
                onBlur={() => handleBlur('ruralComplement')}
                placeholder="Ex: Sede principal, Próximo ao Rio dos Patos"
                className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] bg-white"
              />
            </div>
          </div>
        )}
      </section>

      {/* SEÇÃO 5: SITUAÇÃO CADASTRAL */}
      <section
        id="section-client-status"
        aria-labelledby="heading-client-status"
        className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-6 sm:p-8 space-y-6"
      >
        <div className="border-b border-[#F1F5F9] pb-4">
          <h2
            id="heading-client-status"
            className="text-base sm:text-lg font-bold text-[#0F172A] flex items-center gap-2"
          >
            <ShieldCheck className="w-5 h-5 text-[#0B3D2E]" aria-hidden="true" />
            <span>Situação Cadastral</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] mt-1">
            Indica se o cadastro está ativo para emissão de propostas e acompanhamento.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Situação cadastral">
          <button
            type="button"
            id="btn-status-active"
            role="radio"
            aria-checked={values.status === 'active'}
            onClick={() => handleChange('status', 'active')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
              values.status === 'active'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600 font-semibold'
                : 'border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAF9]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                values.status === 'active' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-[#94A3B8]'
              }`}
            >
              {values.status === 'active' && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-900">Ativo</div>
              <div className="text-xs text-emerald-700">Apto para novas propostas e laudos agronômicos</div>
            </div>
          </button>

          <button
            type="button"
            id="btn-status-inactive"
            role="radio"
            aria-checked={values.status === 'inactive'}
            onClick={() => handleChange('status', 'inactive')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
              values.status === 'inactive'
                ? 'border-slate-600 bg-slate-100 text-slate-900 ring-1 ring-slate-600 font-semibold'
                : 'border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAF9]'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                values.status === 'inactive' ? 'border-slate-700 bg-slate-700 text-white' : 'border-[#94A3B8]'
              }`}
            >
              {values.status === 'inactive' && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800">Inativo</div>
              <div className="text-xs text-slate-500">Cadastro suspenso temporariamente ou sem operação ativa</div>
            </div>
          </button>
        </div>
      </section>

      {/* BARRA DE AÇÕES DO FORMULÁRIO */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#E2E8F0]">
        <Button
          id="btn-cancel-form"
          type="button"
          variant="secondary"
          size="md"
          onClick={handleCancelClick}
          disabled={isSubmitting}
          className="w-full sm:w-auto flex items-center justify-center gap-2 cursor-pointer text-slate-700 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Cancelar</span>
        </Button>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            id="btn-submit-client-form"
            type="submit"
            variant="primary"
            size="md"
            disabled={isSubmitting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 cursor-pointer font-bold min-h-[44px] min-w-[160px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{mode === 'create' ? 'Salvar cliente' : 'Salvar alterações'}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Modais de Confirmação Acessíveis */}
      <UnsavedChangesModal
        isOpen={isUnsavedModalOpen}
        onConfirm={() => {
          setIsUnsavedModalOpen(false);
          onCancel();
        }}
        onCancel={() => setIsUnsavedModalOpen(false)}
      />

      <AddressTypeChangeModal
        isOpen={pendingAddressType !== null}
        targetType={pendingAddressType || 'urban'}
        onConfirm={confirmAddressTypeChange}
        onCancel={cancelAddressTypeChange}
      />
    </form>
  );
}
