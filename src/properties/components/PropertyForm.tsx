import React, { useState, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building,
  TreePine,
  MapPin,
  Users,
  FileText,
  Compass,
  Layers,
  Plus,
  Trash2,
  AlertCircle,
  HelpCircle,
  Loader2,
  Save,
  Sparkles,
} from 'lucide-react';
import {
  PropertyFormValues,
  RuralPropertyFormValues,
  UrbanPropertyFormValues,
  PropertyType,
  UrbanPropertyType,
  RegistrationStatus,
  CoordinateFormat,
  CoordinateOrigin,
  PropertyAltitudeType,
  PropertyClientRelationship,
  GeodeticSystem,
  BoundaryLimitType,
  BoundarySource,
  PropertyValidationErrors,
  URBAN_PROPERTY_TYPE_LABELS,
  REGISTRATION_STATUS_LABELS,
  COORDINATE_FORMAT_LABELS,
  COORDINATE_ORIGIN_LABELS,
  PROPERTY_ALTITUDE_TYPE_LABELS,
  PROPERTY_RELATIONSHIP_LABELS,
  GEODETIC_SYSTEM_LABELS,
  BOUNDARY_LIMIT_TYPE_LABELS,
  BOUNDARY_SOURCE_LABELS,
  PropertyRegistrationFormItem,
  PropertyClientLinkFormItem,
  PropertyBoundaryFormItem,
  PropertyStatus,
} from '../../types/property';
import {
  validatePropertyForm,
  getDefaultPropertyFormValues,
  normalizeCib,
  normalizeDigits,
  normalizeSncr,
} from '../validators';

function parseNumber(value?: string | null): number | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}
import { PropertyClientSelector } from './PropertyClientSelector';
import { ClientSummary } from '../../types/client';
import { ROUTES } from '../../routes/paths';
import { PROPERTY_THEME } from '../theme';

export interface PropertyFormProps {
  initialValues?: PropertyFormValues;
  initialData?: PropertyFormValues;
  isEditing?: boolean;
  mode?: 'create' | 'edit';
  onSubmit: (values: PropertyFormValues) => Promise<{ success: boolean; error?: string }>;
  onCancel?: () => void;
}

export function PropertyForm({
  initialValues,
  initialData,
  isEditing,
  mode,
  onSubmit,
  onCancel,
}: PropertyFormProps) {
  const navigate = useNavigate();
  const summaryAlertId = useId();

  const isEditMode = isEditing ?? (mode === 'edit');
  const baseInitial = initialData || initialValues;

  const [values, setValues] = useState<PropertyFormValues>(
    () => baseInitial || getDefaultPropertyFormValues('rural')
  );
  const [errors, setErrors] = useState<PropertyValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Modais de confirmação
  const [showTypeChangeModal, setShowTypeChangeModal] = useState<PropertyType | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [pendingDeleteRegistrationId, setPendingDeleteRegistrationId] = useState<string | null>(null);
  const [pendingDeleteBoundaryId, setPendingDeleteBoundaryId] = useState<string | null>(null);
  const [pendingDeleteClientId, setPendingDeleteClientId] = useState<string | null>(null);

  const isRural = values.propertyType === 'rural';

  // Proteção contra fechamento da janela com alterações não salvas
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Atualização genérica de campos raiz
  type AllPropertyFormKey = keyof RuralPropertyFormValues | keyof UrbanPropertyFormValues;
  type AllPropertyFormValue<K extends AllPropertyFormKey> = K extends keyof RuralPropertyFormValues
    ? RuralPropertyFormValues[K]
    : K extends keyof UrbanPropertyFormValues
    ? UrbanPropertyFormValues[K]
    : never;

  const updateField = <K extends AllPropertyFormKey>(field: K, value: AllPropertyFormValue<K>) => {
    setIsDirty(true);
    setValues((prev) => ({
      ...prev,
      [field]: value,
    } as PropertyFormValues));
    // Limpa erro individual do campo
    if (errors[field as keyof PropertyValidationErrors]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof PropertyValidationErrors];
        return next;
      });
    }
  };

  // Troca de tipo Rural / Urbano
  const handleTypeChange = (newType: PropertyType) => {
    if (isEditMode || newType === values.propertyType) return;

    // Se já houver dados inseridos, solicita confirmação
    if (isDirty && (values.name || values.clientLinks.length > 0)) {
      setShowTypeChangeModal(newType);
      return;
    }

    setValues(getDefaultPropertyFormValues(newType));
    setErrors({});
    setIsDirty(false);
  };

  const confirmTypeChange = () => {
    if (showTypeChangeModal) {
      setValues(getDefaultPropertyFormValues(showTypeChangeModal));
      setErrors({});
      setIsDirty(false);
      setShowTypeChangeModal(null);
    }
  };

  // --- Matrículas ---
  const handleAddRegistration = () => {
    setIsDirty(true);
    const newReg: PropertyRegistrationFormItem = {
      id: `reg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      registrationNumber: '',
      cnmCode: '',
      registryOffice: '',
      registryOfficeCode: '',
      district: '',
      state: '',
      bookAndPage: '',
      certificateIssuedAt: '',
      registrationStatus: 'active',
      isPrimary: values.registrations.length === 0,
      registeredArea: '',
      areaUnit: isRural ? 'ha' : 'm²',
      observation: '',
    };
    setValues((prev) => ({
      ...prev,
      registrations: [...prev.registrations, newReg],
    }));
  };

  const handleUpdateRegistration = <K extends keyof PropertyRegistrationFormItem>(
    id: string,
    field: K,
    val: PropertyRegistrationFormItem[K]
  ) => {
    setIsDirty(true);
    setValues((prev) => ({
      ...prev,
      registrations: prev.registrations.map((r) => {
        if (field === 'isPrimary' && val === true) {
          return { ...r, isPrimary: r.id === id };
        }
        return r.id === id ? { ...r, [field]: val } : r;
      }),
    }));
  };

  const handleRequestRemoveRegistration = (id: string) => {
    const reg = values.registrations.find((r) => r.id === id);
    if (reg && (reg.registrationNumber || reg.registryOffice)) {
      setPendingDeleteRegistrationId(id);
    } else {
      setValues((prev) => {
        const remaining = prev.registrations.filter((r) => r.id !== id);
        if (remaining.length > 0 && !remaining.some((r) => r.isPrimary)) {
          remaining[0].isPrimary = true;
        }
        return { ...prev, registrations: remaining };
      });
    }
  };

  const confirmRemoveRegistration = () => {
    if (pendingDeleteRegistrationId) {
      setValues((prev) => {
        const remaining = prev.registrations.filter((r) => r.id !== pendingDeleteRegistrationId);
        if (remaining.length > 0 && !remaining.some((r) => r.isPrimary)) {
          remaining[0].isPrimary = true;
        }
        return { ...prev, registrations: remaining };
      });
      setPendingDeleteRegistrationId(null);
    }
  };

  // --- Clientes Vinculados ---
  const handleAddClient = (client: ClientSummary) => {
    setIsDirty(true);
    const isFirst = values.clientLinks.length === 0;
    const newLink: PropertyClientLinkFormItem = {
      clientId: client.id,
      relationship: 'owner',
      otherRelationshipDescription: '',
      isPrimaryHolder: isFirst, // O primeiro vira principal por padrão
      declaredParticipationPercentage: '',
      observation: '',
    };
    setValues((prev) => ({
      ...prev,
      clientLinks: [...prev.clientLinks, newLink],
    }));
    // Limpa erro de cliente se houver
    if (errors.clientLinks) {
      setErrors((prev) => ({ ...prev, clientLinks: undefined }));
    }
  };

  const handleUpdateClientLink = <K extends keyof PropertyClientLinkFormItem>(
    clientId: string,
    field: K,
    val: PropertyClientLinkFormItem[K]
  ) => {
    setIsDirty(true);
    setValues((prev) => ({
      ...prev,
      clientLinks: prev.clientLinks.map((l) => {
        if (l.clientId === clientId) {
          if (field === 'isPrimaryHolder' && val === true) {
            // Ao definir um como principal, todos os outros deixam de ser
            return { ...l, isPrimaryHolder: true };
          }
          return { ...l, [field]: val };
        }
        if (field === 'isPrimaryHolder' && val === true) {
          return { ...l, isPrimaryHolder: false };
        }
        return l;
      }),
    }));
  };

  const handleRequestRemoveClient = (clientId: string) => {
    setPendingDeleteClientId(clientId);
  };

  const confirmRemoveClient = () => {
    if (pendingDeleteClientId) {
      setValues((prev) => {
        const remaining = prev.clientLinks.filter((l) => l.clientId !== pendingDeleteClientId);
        // Se removeu o principal e ainda sobraram clientes, define o primeiro como principal
        if (remaining.length > 0 && !remaining.some((l) => l.isPrimaryHolder)) {
          remaining[0].isPrimaryHolder = true;
        }
        return {
          ...prev,
          clientLinks: remaining,
        };
      });
      setPendingDeleteClientId(null);
    }
  };

  // --- Confrontações ---
  const handleAddBoundary = () => {
    setIsDirty(true);
    const newBnd: PropertyBoundaryFormItem = {
      id: `bnd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      direction: '',
      adjoiningDescription: '',
      boundaryType: 'other_property',
      otherBoundaryTypeDescription: '',
      source: 'unknown',
      observation: '',
    };
    setValues((prev) => ({
      ...prev,
      boundaries: [...prev.boundaries, newBnd],
    }));
  };

  const handleUpdateBoundary = <K extends keyof PropertyBoundaryFormItem>(
    id: string,
    field: K,
    val: PropertyBoundaryFormItem[K]
  ) => {
    setIsDirty(true);
    setValues((prev) => ({
      ...prev,
      boundaries: prev.boundaries.map((b) => (b.id === id ? { ...b, [field]: val } : b)),
    }));
  };

  const handleRequestRemoveBoundary = (id: string) => {
    const bnd = values.boundaries.find((b) => b.id === id);
    if (bnd && (bnd.direction || bnd.adjoiningDescription)) {
      setPendingDeleteBoundaryId(id);
    } else {
      setValues((prev) => ({
        ...prev,
        boundaries: prev.boundaries.filter((b) => b.id !== id),
      }));
    }
  };

  const confirmRemoveBoundary = () => {
    if (pendingDeleteBoundaryId) {
      setValues((prev) => ({
        ...prev,
        boundaries: prev.boundaries.filter((b) => b.id !== pendingDeleteBoundaryId),
      }));
      setPendingDeleteBoundaryId(null);
    }
  };

  // Envio do formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    const validation = validatePropertyForm(values);
    if (!validation.isValid) {
      setErrors(validation.errors);
      // Foco no topo / resumo de erros
      const errorEl = document.getElementById(summaryAlertId);
      if (errorEl) {
        errorEl.scrollIntoView({ behavior: 'smooth' });
        errorEl.focus();
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSubmit(values);
      if (!result.success) {
        setGlobalError(result.error || 'Não foi possível salvar o imóvel.');
        setIsSubmitting(false);
      } else {
        setIsDirty(false);
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Falha inesperada ao processar o imóvel.');
      setIsSubmitting(false);
    }
  };

  const handleCancelClick = () => {
    if (isDirty) {
      setShowCancelModal(true);
    } else if (onCancel) {
      onCancel();
    } else {
      navigate(ROUTES.PROPERTIES);
    }
  };

  const errorKeys = Object.keys(errors).filter(
    (k) => k !== 'registrationErrors' && k !== 'clientLinkErrors' && k !== 'boundaryErrors'
  );
  const hasErrors =
    errorKeys.length > 0 ||
    !!errors.registrationErrors ||
    !!errors.clientLinkErrors ||
    !!errors.boundaryErrors;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Resumo Acessível de Erros */}
      {hasErrors && (
        <div
          id={summaryAlertId}
          tabIndex={-1}
          role="alert"
          aria-live="polite"
          className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2 focus:outline-hidden"
        >
          <div className="flex items-center gap-2 text-rose-800 font-semibold text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>Por favor, corrija os seguintes itens no formulário:</span>
          </div>
          <ul className="list-disc list-inside text-xs text-rose-700 space-y-1 pl-2">
            {errorKeys.map((key) => (
              <li key={key}>{errors[key as keyof PropertyValidationErrors] as string}</li>
            ))}
            {errors.clientLinks && <li>{errors.clientLinks}</li>}
          </ul>
        </div>
      )}

      {/* Erro Global do Servidor / Gateway */}
      {globalError && (
        <div
          role="alert"
          className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-sm text-rose-800"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Falha na operação</p>
            <p className="text-xs text-rose-700 mt-0.5">{globalError}</p>
          </div>
        </div>
      )}

      {/* 1. Tipo do Imóvel e Identificação Básica */}
      <section className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-[#0B3D2E]/10">
          <div className="p-2.5 rounded-xl bg-[#0B3D2E]/10 text-[#0B3D2E]">
            {isRural ? <TreePine className="w-5 h-5" /> : <Building className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-base font-bold text-[#0B3D2E]">
              1. Tipo de Imóvel e Identificação
            </h2>
            <p className="text-xs text-[#0B3D2E]/70">
              Defina a natureza territorial do imóvel e o nome cadastral de identificação.
            </p>
          </div>
        </div>

        {/* Seleção do Tipo Rural / Urbano */}
        <div>
          <label className="block text-xs font-bold text-[#0B3D2E] uppercase tracking-wider mb-2">
            Classificação Territorial {isEditMode && <span className="text-[#0B3D2E]/50 font-normal lowercase">(imutável na edição)</span>}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
            <button
              type="button"
              disabled={isEditMode}
              onClick={() => handleTypeChange('rural')}
              className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all min-h-[44px] ${
                isRural
                  ? 'border-[#0B3D2E] bg-[#78C89A]/15 text-[#0B3D2E] ring-2 ring-[#78C89A] shadow-xs'
                  : 'border-[#0B3D2E]/20 bg-white hover:bg-[#78C89A]/10 text-[#0B3D2E]'
              } ${isEditMode ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <TreePine className="w-5 h-5 text-[#0B3D2E] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-[#0B3D2E]">Imóvel Rural</p>
                <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
                  Fazendas, sítios, glebas agrícolas e propriedades produtivas.
                </p>
              </div>
            </button>

            <button
              type="button"
              disabled={isEditMode}
              onClick={() => handleTypeChange('urban')}
              className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all min-h-[44px] ${
                !isRural
                  ? 'border-[#0B3D2E] bg-[#78C89A]/15 text-[#0B3D2E] ring-2 ring-[#78C89A] shadow-xs'
                  : 'border-[#0B3D2E]/20 bg-white hover:bg-[#78C89A]/10 text-[#0B3D2E]'
              } ${isEditMode ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <Building className="w-5 h-5 text-[#0B3D2E] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-[#0B3D2E]">Imóvel Urbano</p>
                <p className="text-xs text-[#0B3D2E]/70 mt-0.5">
                  Casas, apartamentos, terrenos, galpões e sedes urbanas.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Campos de Identificação e Situação */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="property-name-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
              {isRural ? 'Denominação do Imóvel Rural *' : 'Identificação / Nome do Imóvel Urbano *'}
            </label>
            <input
              id="property-name-input"
              type="text"
              value={values.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder={isRural ? 'Ex: Fazenda Santa Maria, Sítio Três Meninas' : 'Ex: Galpão Logístico Sul, Terreno Lote 14'}
              className={PROPERTY_THEME.input}
            />
            {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="property-status-select" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
              Situação Cadastral *
            </label>
            <select
              id="property-status-select"
              value={values.status}
              onChange={(e) => updateField('status', e.target.value as PropertyStatus)}
              className={PROPERTY_THEME.input}
            >
              <option value="active">Ativo (Em operação)</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
        </div>

        {/* Observações Gerais */}
        <div>
          <label htmlFor="property-notes-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
            Observações Cadastrais Gerais <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
          </label>
          <textarea
            id="property-notes-input"
            rows={2}
            value={values.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Informações adicionais ou notas internas da equipe técnica..."
            className="w-full px-3 py-2.5 text-sm bg-white border border-[#0B3D2E]/20 rounded-xl text-[#0B3D2E] placeholder-[#0B3D2E]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors"
          />
        </div>
      </section>

      {/* 2. Localização Estruturada */}
      <section className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-[#0B3D2E]/10">
          <div className="p-2.5 rounded-xl bg-[#0B3D2E]/10 text-[#0B3D2E]">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#0B3D2E]">
              2. Localização e Endereço
            </h2>
            <p className="text-xs text-[#0B3D2E]/70">
              {isRural
                ? 'Município, UF e roteiro descritivo de acesso à propriedade rural.'
                : 'Endereço urbano completo com CEP, logradouro e numeração.'}
            </p>
          </div>
        </div>

        {isRural ? (
          <div className="space-y-4">
            {/* Linha 1: Município, UF, Distrito e CEP */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="rural-city-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Município *
                </label>
                <input
                  id="rural-city-input"
                  type="text"
                  value={(values as RuralPropertyFormValues).city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="Ex: Rio Verde, Sorriso, Uberaba"
                  className={PROPERTY_THEME.input}
                />
                {errors.city && <p className="text-xs text-rose-600 mt-1">{errors.city}</p>}
              </div>

              <div>
                <label htmlFor="rural-state-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  UF *
                </label>
                <input
                  id="rural-state-input"
                  type="text"
                  maxLength={2}
                  value={(values as RuralPropertyFormValues).state}
                  onChange={(e) => updateField('state', e.target.value.toUpperCase())}
                  placeholder="Ex: GO"
                  className={`${PROPERTY_THEME.input} uppercase`}
                />
                {errors.state && <p className="text-xs text-rose-600 mt-1">{errors.state}</p>}
              </div>

              <div>
                <label htmlFor="rural-postalcode-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  CEP Rural <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="rural-postalcode-input"
                  type="text"
                  maxLength={9}
                  value={(values as RuralPropertyFormValues).postalCode}
                  onChange={(e) => updateField('postalCode', e.target.value)}
                  placeholder="00000-000"
                  className={PROPERTY_THEME.input}
                />
                {errors.postalCode && <p className="text-xs text-rose-600 mt-1">{errors.postalCode}</p>}
              </div>
            </div>

            {/* Linha 2: Distrito / Subdistrito, Comunidade e Complemento */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="rural-district-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Distrito / Subdistrito <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="rural-district-input"
                  type="text"
                  value={(values as RuralPropertyFormValues).district}
                  onChange={(e) => updateField('district', e.target.value)}
                  placeholder="Ex: Distrito de Bela Alvorada"
                  className={PROPERTY_THEME.input}
                />
              </div>

              <div>
                <label htmlFor="rural-region-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Localidade, Linha, Comunidade ou Gleba <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="rural-region-input"
                  type="text"
                  value={(values as RuralPropertyFormValues).ruralRegionOrCommunity}
                  onChange={(e) => updateField('ruralRegionOrCommunity', e.target.value)}
                  placeholder="Ex: Comunidade São José, Linha 4 Sul"
                  className={PROPERTY_THEME.input}
                />
              </div>

              <div>
                <label htmlFor="rural-complement-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Complemento do Endereço <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="rural-complement-input"
                  type="text"
                  value={(values as RuralPropertyFormValues).complement}
                  onChange={(e) => updateField('complement', e.target.value)}
                  placeholder="Ex: Km 15 à esquerda, Setor Norte"
                  className={PROPERTY_THEME.input}
                />
              </div>
            </div>

            {/* Linha 3: Roteiro de Acesso */}
            <div>
              <label htmlFor="rural-access-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                Roteiro de Acesso ou Ponto de Referência <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
              </label>
              <input
                id="rural-access-input"
                type="text"
                value={(values as RuralPropertyFormValues).accessRouteDescription}
                onChange={(e) => updateField('accessRouteDescription', e.target.value)}
                placeholder="Ex: BR-060 km 42, entrar à direita por 12 km na estrada vicinal"
                className={PROPERTY_THEME.input}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tipologia Urbana */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="urban-type-select" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Tipologia Urbana *
                </label>
                <select
                  id="urban-type-select"
                  value={(values as UrbanPropertyFormValues).urbanType}
                  onChange={(e) => updateField('urbanType', e.target.value as UrbanPropertyType)}
                  className={PROPERTY_THEME.input}
                >
                  {Object.entries(URBAN_PROPERTY_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                {errors.urbanType && <p className="text-xs text-rose-600 mt-1">{errors.urbanType}</p>}
              </div>

              {(values as UrbanPropertyFormValues).urbanType === 'other' && (
                <div>
                  <label htmlFor="urban-other-type-desc" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                    Descrição da Tipologia *
                  </label>
                  <input
                    id="urban-other-type-desc"
                    type="text"
                    value={(values as UrbanPropertyFormValues).otherUrbanTypeDescription}
                    onChange={(e) => updateField('otherUrbanTypeDescription', e.target.value)}
                    placeholder="Ex: Centro de distribuição com pátio de manobra"
                    className={PROPERTY_THEME.input}
                  />
                  {errors.otherUrbanTypeDescription && (
                    <p className="text-xs text-rose-600 mt-1">{errors.otherUrbanTypeDescription}</p>
                  )}
                </div>
              )}
            </div>

            {/* Endereço Urbano */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label htmlFor="urban-zipcode-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  CEP *
                </label>
                <input
                  id="urban-zipcode-input"
                  type="text"
                  maxLength={9}
                  value={(values as UrbanPropertyFormValues).zipCode}
                  onChange={(e) => updateField('zipCode', e.target.value)}
                  placeholder="00000-000"
                  className={PROPERTY_THEME.input}
                />
                {errors.zipCode && <p className="text-xs text-rose-600 mt-1">{errors.zipCode}</p>}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="urban-street-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Logradouro *
                </label>
                <input
                  id="urban-street-input"
                  type="text"
                  value={(values as UrbanPropertyFormValues).street}
                  onChange={(e) => updateField('street', e.target.value)}
                  placeholder="Rua, Avenida, Alameda..."
                  className={PROPERTY_THEME.input}
                />
                {errors.street && <p className="text-xs text-rose-600 mt-1">{errors.street}</p>}
              </div>

              <div>
                <label htmlFor="urban-number-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Número
                </label>
                <input
                  id="urban-number-input"
                  type="text"
                  disabled={(values as UrbanPropertyFormValues).noNumber}
                  value={(values as UrbanPropertyFormValues).number}
                  onChange={(e) => updateField('number', e.target.value)}
                  placeholder="123"
                  className={(values as UrbanPropertyFormValues).noNumber ? PROPERTY_THEME.inputDisabled : PROPERTY_THEME.input}
                />
                <label className="flex items-center gap-1.5 mt-1.5 text-xs text-[#0B3D2E]/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(values as UrbanPropertyFormValues).noNumber}
                    onChange={(e) => {
                      updateField('noNumber', e.target.checked);
                      if (e.target.checked) updateField('number', '');
                    }}
                    className="rounded text-[#0B3D2E] focus:ring-[#78C89A]"
                  />
                  <span>Sem número (S/N)</span>
                </label>
                {errors.number && <p className="text-xs text-rose-600 mt-1">{errors.number}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label htmlFor="urban-neighborhood-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Bairro *
                </label>
                <input
                  id="urban-neighborhood-input"
                  type="text"
                  value={(values as UrbanPropertyFormValues).neighborhood}
                  onChange={(e) => updateField('neighborhood', e.target.value)}
                  placeholder="Bairro ou setor"
                  className={PROPERTY_THEME.input}
                />
                {errors.neighborhood && <p className="text-xs text-rose-600 mt-1">{errors.neighborhood}</p>}
              </div>

              <div>
                <label htmlFor="urban-complement-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Complemento <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="urban-complement-input"
                  type="text"
                  value={(values as UrbanPropertyFormValues).complement}
                  onChange={(e) => updateField('complement', e.target.value)}
                  placeholder="Apto 402, Bloco B"
                  className={PROPERTY_THEME.input}
                />
              </div>

              <div>
                <label htmlFor="urban-city-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Município *
                </label>
                <input
                  id="urban-city-input"
                  type="text"
                  value={(values as UrbanPropertyFormValues).city}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="Cidade"
                  className={PROPERTY_THEME.input}
                />
                {errors.city && <p className="text-xs text-rose-600 mt-1">{errors.city}</p>}
              </div>

              <div>
                <label htmlFor="urban-state-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  UF *
                </label>
                <input
                  id="urban-state-input"
                  type="text"
                  maxLength={2}
                  value={(values as UrbanPropertyFormValues).state}
                  onChange={(e) => updateField('state', e.target.value.toUpperCase())}
                  placeholder="UF"
                  className={`${PROPERTY_THEME.input} uppercase`}
                />
                {errors.state && <p className="text-xs text-rose-600 mt-1">{errors.state}</p>}
              </div>
            </div>

            {/* Lote / Quadra / Unidade */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label htmlFor="urban-lot-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Lote <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="urban-lot-input"
                  type="text"
                  value={(values as UrbanPropertyFormValues).lot}
                  onChange={(e) => updateField('lot', e.target.value)}
                  placeholder="Ex: Lote 04"
                  className={PROPERTY_THEME.input}
                />
              </div>

              <div>
                <label htmlFor="urban-block-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Quadra <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="urban-block-input"
                  type="text"
                  value={(values as UrbanPropertyFormValues).block}
                  onChange={(e) => updateField('block', e.target.value)}
                  placeholder="Ex: Quadra 12"
                  className={PROPERTY_THEME.input}
                />
              </div>

              <div>
                <label htmlFor="urban-unit-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Unidade / Sala <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="urban-unit-input"
                  type="text"
                  value={(values as UrbanPropertyFormValues).unit}
                  onChange={(e) => updateField('unit', e.target.value)}
                  placeholder="Ex: Sala 301"
                  className={PROPERTY_THEME.input}
                />
              </div>
            </div>

            {/* Ponto de Referência Urbano */}
            <div>
              <label htmlFor="urban-reference-point-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                Ponto de Referência <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
              </label>
              <input
                id="urban-reference-point-input"
                type="text"
                value={(values as UrbanPropertyFormValues).referencePoint}
                onChange={(e) => updateField('referencePoint', e.target.value)}
                placeholder="Ex: Próximo ao Shopping Plaza, esquina com Av. Central"
                className={PROPERTY_THEME.input}
              />
            </div>
          </div>
        )}
      </section>

      {/* 3. Clientes e Produtores Vinculados */}
      <section className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#0B3D2E]/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#0B3D2E]/10 text-[#0B3D2E]">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0B3D2E]">
                3. Clientes e Produtores Vinculados *
              </h2>
              <p className="text-xs text-[#0B3D2E]/70">
                Vincule ao menos um cliente da organização com relação jurídica e exatamente um titular principal.
              </p>
            </div>
          </div>
        </div>

        {/* Seletor Independente de Clientes */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-[#0B3D2E]">
            Adicionar Cliente / Produtor da Organização
          </label>
          <PropertyClientSelector
            onSelectClient={handleAddClient}
            selectedClientIds={values.clientLinks.map((l) => l.clientId)}
          />
        </div>

        {errors.clientLinks && (
          <p className="text-xs font-semibold text-rose-600 flex items-center gap-1.5 mt-1">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errors.clientLinks}
          </p>
        )}

        {/* Lista de Vínculos de Clientes */}
        {values.clientLinks.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-[#0B3D2E]/15 rounded-2xl text-center bg-white">
            <Users className="w-8 h-8 text-[#0B3D2E]/40 mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#0B3D2E]">
              Nenhum cliente vinculado a este imóvel
            </p>
            <p className="text-xs text-[#0B3D2E]/70 mt-1">
              Utilize o campo de busca acima para vincular proprietários, arrendatários ou parceiros rurais.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {values.clientLinks.map((link, index) => {
              const linkErrors = errors.clientLinkErrors?.[link.clientId || `index_${index}`];

              return (
                <div
                  key={link.clientId || index}
                  className={`p-4 rounded-xl border transition-all ${
                    link.isPrimaryHolder
                      ? 'border-[#0B3D2E]/40 bg-[#78C89A]/10 ring-1 ring-[#78C89A]'
                      : 'border-[#0B3D2E]/15 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#0B3D2E]/10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#0B3D2E]">
                        Vínculo #{index + 1}
                      </span>
                      {link.isPrimaryHolder && (
                        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#0B3D2E] text-white rounded-full">
                          Titular Principal
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-[#0B3D2E] cursor-pointer font-medium">
                        <input
                          type="radio"
                          name="primaryClientRadio"
                          checked={link.isPrimaryHolder}
                          onChange={() => handleUpdateClientLink(link.clientId, 'isPrimaryHolder', true)}
                          className="text-[#0B3D2E] focus:ring-[#78C89A]"
                        />
                        <span>Definir como Principal</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => handleRequestRemoveClient(link.clientId)}
                        className="p-1 text-[#0B3D2E]/40 hover:text-rose-600 rounded-md transition-colors"
                        aria-label={`Remover vínculo com cliente #${index + 1}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Relação Jurídica *
                      </label>
                      <select
                        value={link.relationship}
                        onChange={(e) =>
                          handleUpdateClientLink(
                            link.clientId,
                            'relationship',
                            e.target.value as PropertyClientRelationship
                          )
                        }
                        className={PROPERTY_THEME.input}
                      >
                        {Object.entries(PROPERTY_RELATIONSHIP_LABELS).map(([rel, label]) => (
                          <option key={rel} value={rel}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {linkErrors?.relationship && (
                        <p className="text-xs text-rose-600 mt-1">{linkErrors.relationship}</p>
                      )}
                    </div>

                    {link.relationship === 'other' && (
                      <div>
                        <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                          Descrição da Relação *
                        </label>
                        <input
                          type="text"
                          value={link.otherRelationshipDescription}
                          onChange={(e) =>
                            handleUpdateClientLink(
                              link.clientId,
                              'otherRelationshipDescription',
                              e.target.value
                            )
                          }
                          placeholder="Ex: Cessionário de direitos hereditários"
                          className={PROPERTY_THEME.input}
                        />
                        {linkErrors?.otherRelationshipDescription && (
                          <p className="text-xs text-rose-600 mt-1">{linkErrors.otherRelationshipDescription}</p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Participação informada (%) <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={link.declaredParticipationPercentage}
                        onChange={(e) =>
                          handleUpdateClientLink(
                            link.clientId,
                            'declaredParticipationPercentage',
                            e.target.value
                          )
                        }
                        placeholder="Ex: 50.00 ou 100"
                        className={PROPERTY_THEME.input}
                      />
                      {linkErrors?.declaredParticipationPercentage && (
                        <p className="text-xs text-rose-600 mt-1">{linkErrors.declaredParticipationPercentage}</p>
                      )}
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Observação do Vínculo <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={link.observation}
                        onChange={(e) =>
                          handleUpdateClientLink(link.clientId, 'observation', e.target.value)
                        }
                        placeholder="Notas específicas deste cliente em relação ao imóvel..."
                        className={PROPERTY_THEME.input}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Cadastros e Identificadores Oficiais */}
      <section className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-[#0B3D2E]/10">
          <div className="p-2.5 rounded-xl bg-[#0B3D2E]/10 text-[#0B3D2E]">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#0B3D2E]">
              4. Cadastros e Identificadores Fiscais
            </h2>
            <p className="text-xs text-[#0B3D2E]/70">
              CIB (identificador atual), NIRF legado e registros regulatórios.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="property-cib-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
              CIB — Cadastro Imobiliário Brasileiro <span className="text-[#0B3D2E]/50 font-normal">(identificador fiscal atual)</span>
            </label>
            <input
              id="property-cib-input"
              type="text"
              value={values.cib}
              onChange={(e) => updateField('cib', normalizeCib(e.target.value))}
              placeholder="Ex: CIB 7891012-3"
              className={`${PROPERTY_THEME.input} uppercase`}
            />
            {errors.cib && <p className="text-xs text-rose-600 mt-1">{errors.cib}</p>}
          </div>

          {isRural ? (
            <div>
              <label htmlFor="rural-nirf-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                NIRF — documento legado <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
              </label>
              <input
                id="rural-nirf-input"
                type="text"
                maxLength={8}
                value={(values as RuralPropertyFormValues).nirfLegacy}
                onChange={(e) => updateField('nirfLegacy', normalizeDigits(e.target.value))}
                placeholder="8 dígitos numéricos"
                className={PROPERTY_THEME.input}
              />
              {errors.nirfLegacy && <p className="text-xs text-rose-600 mt-1">{errors.nirfLegacy}</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="urban-municipal-reg" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Inscrição Imobiliária Municipal / IPTU <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="urban-municipal-reg"
                  type="text"
                  value={(values as UrbanPropertyFormValues).municipalRegistration}
                  onChange={(e) => updateField('municipalRegistration', e.target.value)}
                  placeholder="Ex: 01.02.003.0004.001"
                  className={PROPERTY_THEME.input}
                />
              </div>

              <div>
                <label htmlFor="urban-condo-id" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Identificação do Condomínio / Edifício <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="urban-condo-id"
                  type="text"
                  value={(values as UrbanPropertyFormValues).condominiumIdentification}
                  onChange={(e) => updateField('condominiumIdentification', e.target.value)}
                  placeholder="Ex: Edifício Metropolitan Tower"
                  className={PROPERTY_THEME.input}
                />
              </div>
            </div>
          )}
        </div>

        {/* Específicos Rurais: SNCR, CCIR, CAR */}
        {isRural && (
          <div className="space-y-4 pt-2 border-t border-[#0B3D2E]/10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="rural-sncr-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Código do Imóvel no SNCR / Incra <span className="text-[#0B3D2E]/50 font-normal">(13 dígitos)</span>
                </label>
                <input
                  id="rural-sncr-input"
                  type="text"
                  maxLength={13}
                  value={(values as RuralPropertyFormValues).sncrIncraCode}
                  onChange={(e) => updateField('sncrIncraCode', normalizeSncr(e.target.value))}
                  placeholder="9999999999999"
                  className={PROPERTY_THEME.input}
                />
                {errors.sncrIncraCode && <p className="text-xs text-rose-600 mt-1">{errors.sncrIncraCode}</p>}
              </div>

              <div>
                <label htmlFor="rural-ccir-ref" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Referência do CCIR <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="rural-ccir-ref"
                  type="text"
                  value={(values as RuralPropertyFormValues).ccirReference}
                  onChange={(e) => updateField('ccirReference', e.target.value)}
                  placeholder="Código do CCIR"
                  className={PROPERTY_THEME.input}
                />
              </div>

              <div>
                <label htmlFor="rural-ccir-year" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Exercício do CCIR <span className="text-[#0B3D2E]/50 font-normal">(ano)</span>
                </label>
                <input
                  id="rural-ccir-year"
                  type="text"
                  maxLength={4}
                  value={(values as RuralPropertyFormValues).ccirExerciseYear}
                  onChange={(e) => updateField('ccirExerciseYear', normalizeDigits(e.target.value))}
                  placeholder="Ex: 2024"
                  className={PROPERTY_THEME.input}
                />
                {errors.ccirExerciseYear && <p className="text-xs text-rose-600 mt-1">{errors.ccirExerciseYear}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="rural-car-receipt" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                Número do Recibo de Inscrição no CAR <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
              </label>
              <input
                id="rural-car-receipt"
                type="text"
                value={(values as RuralPropertyFormValues).carReceiptNumber}
                onChange={(e) => updateField('carReceiptNumber', e.target.value)}
                placeholder="UF-1234567-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                className={PROPERTY_THEME.input}
              />
              <p className="text-xs text-[#0B3D2E]/70 mt-1 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 shrink-0 text-[#0B3D2E]" />
                O CAR é um cadastro ambiental e não constitui título de propriedade ou posse.
              </p>
              {errors.carReceiptNumber && <p className="text-xs text-rose-600 mt-1">{errors.carReceiptNumber}</p>}
            </div>
          </div>
        )}
      </section>

      {/* 5. Áreas e Medições */}
      <section className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-[#0B3D2E]/10">
          <div className="p-2.5 rounded-xl bg-[#0B3D2E]/10 text-[#0B3D2E]">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#0B3D2E]">
              5. Áreas e Dimensões
            </h2>
            <p className="text-xs text-[#0B3D2E]/70">
              {isRural
                ? 'Área total declarada e medições em hectares (ha).'
                : 'Área do terreno, construída e privativa em metros quadrados (m²).'}
            </p>
          </div>
        </div>

        {isRural ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="rural-total-area-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                Área Total Declarada (ha) *
              </label>
              <input
                id="rural-total-area-input"
                type="text"
                value={(values as RuralPropertyFormValues).totalDeclaredAreaHa}
                onChange={(e) => updateField('totalDeclaredAreaHa', e.target.value)}
                placeholder="Ex: 1250,50"
                className={PROPERTY_THEME.input}
              />
              {errors.totalDeclaredAreaHa && (
                <p className="text-xs text-rose-600 mt-1">{errors.totalDeclaredAreaHa}</p>
              )}
            </div>

            <div>
              <label htmlFor="rural-car-area-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                Área do CAR (ha) <span className="text-[#0B3D2E]/50 font-normal">(ambiental)</span>
              </label>
              <input
                id="rural-car-area-input"
                type="text"
                value={(values as RuralPropertyFormValues).carReportedAreaHa}
                onChange={(e) => updateField('carReportedAreaHa', e.target.value)}
                placeholder="Ex: 1248,30"
                className={PROPERTY_THEME.input}
              />
              {errors.carReportedAreaHa && (
                <p className="text-xs text-rose-600 mt-1">{errors.carReportedAreaHa}</p>
              )}
            </div>

            <div>
              <label htmlFor="rural-sncr-area-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                Área no SNCR (ha) <span className="text-[#0B3D2E]/50 font-normal">(cadastral)</span>
              </label>
              <input
                id="rural-sncr-area-input"
                type="text"
                value={(values as RuralPropertyFormValues).sncrReportedAreaHa}
                onChange={(e) => updateField('sncrReportedAreaHa', e.target.value)}
                placeholder="Ex: 1250,50"
                className={PROPERTY_THEME.input}
              />
              {errors.sncrReportedAreaHa && (
                <p className="text-xs text-rose-600 mt-1">{errors.sncrReportedAreaHa}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="urban-land-area-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                Área do Terreno (m²) *
              </label>
              <input
                id="urban-land-area-input"
                type="text"
                value={(values as UrbanPropertyFormValues).landAreaM2}
                onChange={(e) => updateField('landAreaM2', e.target.value)}
                placeholder="Ex: 450,00"
                className={PROPERTY_THEME.input}
              />
              {errors.landAreaM2 && <p className="text-xs text-rose-600 mt-1">{errors.landAreaM2}</p>}
            </div>

            <div>
              <label htmlFor="urban-built-area-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                Área Construída (m²) <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
              </label>
              <input
                id="urban-built-area-input"
                type="text"
                value={(values as UrbanPropertyFormValues).builtAreaM2}
                onChange={(e) => updateField('builtAreaM2', e.target.value)}
                placeholder="Ex: 620,00"
                className={PROPERTY_THEME.input}
              />
              {errors.builtAreaM2 && <p className="text-xs text-rose-600 mt-1">{errors.builtAreaM2}</p>}
            </div>

            <div>
              <label htmlFor="urban-priv-area-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                Área Privativa (m²) <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
              </label>
              <input
                id="urban-priv-area-input"
                type="text"
                value={(values as UrbanPropertyFormValues).privateAreaM2}
                onChange={(e) => updateField('privateAreaM2', e.target.value)}
                placeholder="Ex: 180,00"
                className={PROPERTY_THEME.input}
              />
            </div>

            <div>
              <label htmlFor="urban-comm-area-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                Área Comum (m²) <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
              </label>
              <input
                id="urban-comm-area-input"
                type="text"
                value={(values as UrbanPropertyFormValues).commonAreaM2}
                onChange={(e) => updateField('commonAreaM2', e.target.value)}
                placeholder="Ex: 45,00"
                className={PROPERTY_THEME.input}
              />
            </div>
          </div>
        )}
      </section>

      {/* 6. Matrículas e Registros Imobiliários */}
      <section className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#0B3D2E]/10 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#0B3D2E]/10 text-[#0B3D2E]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0B3D2E]">
                6. Matrículas e Registros Cartoriais
              </h2>
              <p className="text-xs text-[#0B3D2E]/70">
                Adicione uma ou mais matrículas de registro de imóveis vinculadas a esta propriedade.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {values.registrations.length > 0 && (
              <div className="px-3 py-1.5 bg-[#0B3D2E]/5 border border-[#0B3D2E]/10 rounded-xl text-xs font-medium text-[#0B3D2E]">
                <span>
                  {values.registrations.length} {values.registrations.length === 1 ? 'matrícula cadastrada' : 'matrículas cadastradas'}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={handleAddRegistration}
              className={PROPERTY_THEME.btnSecondarySmall}
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar Matrícula
            </button>
          </div>
        </div>

        {values.registrations.length > 0 && (
          <div className="p-3.5 bg-[#0B3D2E]/5 border border-[#0B3D2E]/15 rounded-xl flex items-start gap-2.5 text-xs text-[#0B3D2E]/80">
            <AlertCircle className="w-4 h-4 text-[#0B3D2E] shrink-0 mt-0.5" />
            <p>
              <strong>Aviso Cadastral:</strong> As áreas das matrículas são registradas individualmente e não são somadas automaticamente pelo sistema, prevenindo distorções decorrentes de sobreposição, desmembramento, frações ideais ou áreas cartoriais coincidentes.
            </p>
          </div>
        )}

        {values.registrations.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-[#0B3D2E]/15 rounded-2xl text-center bg-white">
            <p className="text-sm font-semibold text-[#0B3D2E]">
              Nenhuma matrícula vinculada
            </p>
            <p className="text-xs text-[#0B3D2E]/70 mt-1">
              Clique em &ldquo;Adicionar Matrícula&rdquo; para inserir dados registrais e de cartório.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {values.registrations.map((reg, index) => {
              const regErrors = errors.registrationErrors?.[reg.id || `index_${index}`];

              return (
                <div
                  key={reg.id || index}
                  className="p-4 rounded-xl border border-[#0B3D2E]/15 bg-white space-y-4 shadow-2xs"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#0B3D2E]/10">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[#0B3D2E]">
                        Matrícula #{index + 1}
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-[#0B3D2E] cursor-pointer">
                        <input
                          type="radio"
                          name="primary_registration"
                          checked={reg.isPrimary}
                          onChange={() => handleUpdateRegistration(reg.id, 'isPrimary', true)}
                          className="text-[#0B3D2E] focus:ring-[#78C89A] w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className={reg.isPrimary ? 'font-bold text-[#0B3D2E]' : 'text-[#0B3D2E]/70'}>
                          {reg.isPrimary ? 'Principal' : 'Tornar Principal'}
                        </span>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRequestRemoveRegistration(reg.id)}
                      className="p-1 text-[#0B3D2E]/40 hover:text-rose-600 rounded-md transition-colors"
                      aria-label={`Remover matrícula #${index + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Número da Matrícula *
                      </label>
                      <input
                        type="text"
                        value={reg.registrationNumber}
                        onChange={(e) => handleUpdateRegistration(reg.id, 'registrationNumber', e.target.value)}
                        placeholder="Ex: 12.345"
                        className={PROPERTY_THEME.input}
                      />
                      {regErrors?.registrationNumber && (
                        <p className="text-xs text-rose-600 mt-1">{regErrors.registrationNumber}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Cartório / Serventia *
                      </label>
                      <input
                        type="text"
                        value={reg.registryOffice}
                        onChange={(e) => handleUpdateRegistration(reg.id, 'registryOffice', e.target.value)}
                        placeholder="Ex: 1º Ofício de Registro de Imóveis"
                        className={PROPERTY_THEME.input}
                      />
                      {regErrors?.registryOffice && (
                        <p className="text-xs text-rose-600 mt-1">{regErrors.registryOffice}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Código CNS <span className="text-[#0B3D2E]/50 font-normal">(6 dígitos)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={reg.registryOfficeCode}
                        onChange={(e) => handleUpdateRegistration(reg.id, 'registryOfficeCode', normalizeDigits(e.target.value))}
                        placeholder="Ex: 123456"
                        className={PROPERTY_THEME.input}
                      />
                      {regErrors?.registryOfficeCode && (
                        <p className="text-xs text-rose-600 mt-1">{regErrors.registryOfficeCode}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Código CNM <span className="text-[#0B3D2E]/50 font-normal">(15 dígitos)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={16}
                        value={reg.cnmCode}
                        onChange={(e) => handleUpdateRegistration(reg.id, 'cnmCode', normalizeDigits(e.target.value))}
                        placeholder="Ex: 1234561001234501"
                        className={PROPERTY_THEME.input}
                      />
                      {regErrors?.cnmCode && (
                        <p className="text-xs text-rose-600 mt-1">{regErrors.cnmCode}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Comarca *
                      </label>
                      <input
                        type="text"
                        value={reg.district}
                        onChange={(e) => handleUpdateRegistration(reg.id, 'district', e.target.value)}
                        placeholder="Comarca do Cartório"
                        className={PROPERTY_THEME.input}
                      />
                      {regErrors?.district && (
                        <p className="text-xs text-rose-600 mt-1">{regErrors.district}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        UF *
                      </label>
                      <input
                        type="text"
                        maxLength={2}
                        value={reg.state}
                        onChange={(e) => handleUpdateRegistration(reg.id, 'state', e.target.value.toUpperCase())}
                        placeholder="UF"
                        className={`${PROPERTY_THEME.input} uppercase`}
                      />
                      {regErrors?.state && (
                        <p className="text-xs text-rose-600 mt-1">{regErrors.state}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Situação da Matrícula
                      </label>
                      <select
                        value={reg.registrationStatus}
                        onChange={(e) => handleUpdateRegistration(reg.id, 'registrationStatus', e.target.value as RegistrationStatus)}
                        className={PROPERTY_THEME.input}
                      >
                        {Object.entries(REGISTRATION_STATUS_LABELS).map(([st, label]) => (
                          <option key={st} value={st}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Área Registrada <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={reg.registeredArea}
                          onChange={(e) => handleUpdateRegistration(reg.id, 'registeredArea', e.target.value)}
                          placeholder="Ex: 500,00"
                          className={PROPERTY_THEME.input}
                        />
                        <select
                          value={reg.areaUnit}
                          onChange={(e) => handleUpdateRegistration(reg.id, 'areaUnit', e.target.value as 'ha' | 'm²')}
                          className="px-2.5 py-2 text-xs bg-white border border-[#0B3D2E]/20 rounded-xl text-[#0B3D2E] focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] shrink-0"
                        >
                          <option value="ha">ha</option>
                          <option value="m²">m²</option>
                        </select>
                      </div>
                      {regErrors?.registeredArea && (
                        <p className="text-xs text-rose-600 mt-1">{regErrors.registeredArea}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Data da Certidão / Atualização <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="date"
                        value={reg.certificateIssuedAt}
                        onChange={(e) => handleUpdateRegistration(reg.id, 'certificateIssuedAt', e.target.value)}
                        className={PROPERTY_THEME.input}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Livro / Folha <span className="text-[#0B3D2E]/50 font-normal">(legado)</span>
                      </label>
                      <input
                        type="text"
                        value={reg.bookAndPage}
                        onChange={(e) => handleUpdateRegistration(reg.id, 'bookAndPage', e.target.value)}
                        placeholder="Livro 2-RG, Fls. 12"
                        className={PROPERTY_THEME.input}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                      Observações da Matrícula <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={reg.observation}
                      onChange={(e) => handleUpdateRegistration(reg.id, 'observation', e.target.value)}
                      placeholder="Anotações de gravames, ônus ou referências registrais..."
                      className={PROPERTY_THEME.input}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 7. Coordenada de Referência */}
      <section className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#0B3D2E]/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#0B3D2E]/10 text-[#0B3D2E]">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0B3D2E]">
                7. Coordenada Geográfica de Referência
              </h2>
              <p className="text-xs text-[#0B3D2E]/70">
                Ponto geodésico de referência da sede ou vértice principal em SIRGAS2000.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-[#0B3D2E] cursor-pointer">
            <input
              type="checkbox"
              checked={values.hasCoordinate}
              onChange={(e) => updateField('hasCoordinate', e.target.checked)}
              className="rounded text-[#0B3D2E] focus:ring-[#78C89A] w-4 h-4 cursor-pointer"
            />
            <span>Informar Coordenada</span>
          </label>
        </div>

        {values.hasCoordinate && (
          <div className="space-y-4">
            {/* Linha 1: Latitude, Longitude, Datum e Formato */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label htmlFor="coord-lat-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Latitude (graus decimais) *
                </label>
                <input
                  id="coord-lat-input"
                  type="text"
                  value={values.latitude}
                  onChange={(e) => updateField('latitude', e.target.value)}
                  placeholder="Ex: -15.793889"
                  className={PROPERTY_THEME.input}
                />
                {errors.latitude && <p className="text-xs text-rose-600 mt-1">{errors.latitude}</p>}
              </div>

              <div>
                <label htmlFor="coord-lng-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Longitude (graus decimais) *
                </label>
                <input
                  id="coord-lng-input"
                  type="text"
                  value={values.longitude}
                  onChange={(e) => updateField('longitude', e.target.value)}
                  placeholder="Ex: -47.882778"
                  className={PROPERTY_THEME.input}
                />
                {errors.longitude && <p className="text-xs text-rose-600 mt-1">{errors.longitude}</p>}
              </div>

              <div>
                <label htmlFor="coord-datum-select" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Sistema Geodésico (Datum) *
                </label>
                <select
                  id="coord-datum-select"
                  value={values.datum || values.geodeticSystem}
                  onChange={(e) => {
                    const val = e.target.value as GeodeticSystem;
                    updateField('datum', val);
                    updateField('geodeticSystem', val);
                  }}
                  className={PROPERTY_THEME.input}
                >
                  {Object.entries(GEODETIC_SYSTEM_LABELS).map(([datum, label]) => (
                    <option key={datum} value={datum}>
                      {label}
                    </option>
                  ))}
                </select>
                {errors.datum && <p className="text-xs text-rose-600 mt-1">{errors.datum}</p>}
              </div>

              <div>
                <label htmlFor="coord-format-select" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Formato de Coordenadas
                </label>
                <select
                  id="coord-format-select"
                  value={values.format || 'decimal_degrees'}
                  onChange={(e) => updateField('format', e.target.value as CoordinateFormat)}
                  className={PROPERTY_THEME.input}
                >
                  {Object.entries(COORDINATE_FORMAT_LABELS).map(([fmt, label]) => (
                    <option key={fmt} value={fmt}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Linha 2: Origem do Dado, Altitude e Tipo de Altitude */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="coord-origin-select" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Origem do Ponto / Coordenada
                </label>
                <select
                  id="coord-origin-select"
                  value={values.origin || 'unknown'}
                  onChange={(e) => updateField('origin', e.target.value as CoordinateOrigin)}
                  className={PROPERTY_THEME.input}
                >
                  {Object.entries(COORDINATE_ORIGIN_LABELS).map(([orig, label]) => (
                    <option key={orig} value={orig}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="coord-altitude-input" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Altitude (metros) <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="coord-altitude-input"
                  type="text"
                  value={values.altitude || ''}
                  onChange={(e) => updateField('altitude', e.target.value)}
                  placeholder="Ex: 850,5"
                  className={PROPERTY_THEME.input}
                />
              </div>

              <div>
                <label htmlFor="coord-altitude-type-select" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Tipo de Altitude <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <select
                  id="coord-altitude-type-select"
                  value={values.altitudeType || ''}
                  onChange={(e) => updateField('altitudeType', e.target.value as PropertyAltitudeType)}
                  className={PROPERTY_THEME.input}
                >
                  <option value="">Não especificado</option>
                  {Object.entries(PROPERTY_ALTITUDE_TYPE_LABELS).map(([at, label]) => (
                    <option key={at} value={at}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(values.geodeticSystem === 'SAD69' || values.geodeticSystem === 'Corrego_Alegre' || values.datum === 'SAD69' || values.datum === 'Corrego_Alegre') && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Referencial geodésico legado ({GEODETIC_SYSTEM_LABELS[values.datum || values.geodeticSystem]}). Os valores originais fornecidos serão mantidos sem conversões automáticas.
                </span>
              </div>
            )}

            {(values.geodeticSystem === 'other' || values.datum === 'other') && (
              <div>
                <label htmlFor="coord-other-datum-desc" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Descrição do Sistema Geodésico *
                </label>
                <input
                  id="coord-other-datum-desc"
                  type="text"
                  value={values.otherGeodeticSystemDescription}
                  onChange={(e) => updateField('otherGeodeticSystemDescription', e.target.value)}
                  placeholder="Ex: WGS84, Projeção UTM Fuso 22S"
                  className={PROPERTY_THEME.input}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="coord-point-desc" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Descrição do Ponto <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="coord-point-desc"
                  type="text"
                  value={values.pointDescription}
                  onChange={(e) => updateField('pointDescription', e.target.value)}
                  placeholder="Ex: Sede da fazenda, Porteira principal, Vértice V-01"
                  className={PROPERTY_THEME.input}
                />
              </div>

              <div>
                <label htmlFor="coord-obs" className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                  Observações da Coordenada <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                </label>
                <input
                  id="coord-obs"
                  type="text"
                  value={values.observation || ''}
                  onChange={(e) => updateField('observation', e.target.value)}
                  placeholder="Precisão do receptor, época de levantamento..."
                  className={PROPERTY_THEME.input}
                />
              </div>
            </div>
            {errors.coordinate && <p className="text-xs text-rose-600">{errors.coordinate}</p>}
          </div>
        )}
      </section>

      {/* 8. Confrontações Textuais */}
      <section className="bg-white border border-[#0B3D2E]/15 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#0B3D2E]/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#0B3D2E]/10 text-[#0B3D2E]">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0B3D2E]">
                8. Confrontações Textuais
              </h2>
              <p className="text-xs text-[#0B3D2E]/70">
                Divisas descritivas com vizinhos, estradas, rodovias ou cursos d’água.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddBoundary}
            className={PROPERTY_THEME.btnSecondarySmall}
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar Confrontação
          </button>
        </div>

        {values.boundaries.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-[#0B3D2E]/15 rounded-2xl text-center bg-white">
            <p className="text-sm font-semibold text-[#0B3D2E]">
              Nenhuma confrontação descrita
            </p>
            <p className="text-xs text-[#0B3D2E]/70 mt-1">
              Clique em &ldquo;Adicionar Confrontação&rdquo; para registrar limites com confrontantes e rodovias.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {values.boundaries.map((bnd, index) => {
              const bndErrors = errors.boundaryErrors?.[bnd.id || `index_${index}`];

              return (
                <div
                  key={bnd.id || index}
                  className="p-4 rounded-xl border border-[#0B3D2E]/15 bg-white space-y-4 shadow-2xs"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#0B3D2E]/10">
                    <span className="text-xs font-bold text-[#0B3D2E]">
                      Confrontação #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRequestRemoveBoundary(bnd.id)}
                      className="p-1 text-[#0B3D2E]/40 hover:text-rose-600 rounded-md transition-colors"
                      aria-label={`Remover confrontação #${index + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Direção / Trecho *
                      </label>
                      <input
                        type="text"
                        value={bnd.direction}
                        onChange={(e) => handleUpdateBoundary(bnd.id, 'direction', e.target.value)}
                        placeholder="Ex: Norte, Leste, Divisa 01"
                        className={PROPERTY_THEME.input}
                      />
                      {bndErrors?.direction && (
                        <p className="text-xs text-rose-600 mt-1">{bndErrors.direction}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Tipo de Divisa *
                      </label>
                      <select
                        value={bnd.boundaryType}
                        onChange={(e) =>
                          handleUpdateBoundary(
                            bnd.id,
                            'boundaryType',
                            e.target.value as BoundaryLimitType
                          )
                        }
                        className={PROPERTY_THEME.input}
                      >
                        {Object.entries(BOUNDARY_LIMIT_TYPE_LABELS).map(([bt, label]) => (
                          <option key={bt} value={bt}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Fonte da Informação
                      </label>
                      <select
                        value={bnd.source || 'unknown'}
                        onChange={(e) =>
                          handleUpdateBoundary(
                            bnd.id,
                            'source',
                            e.target.value as BoundarySource
                          )
                        }
                        className={PROPERTY_THEME.input}
                      >
                        {Object.entries(BOUNDARY_SOURCE_LABELS).map(([src, label]) => (
                          <option key={src} value={src}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Confrontante / Descrição *
                      </label>
                      <input
                        type="text"
                        value={bnd.adjoiningDescription}
                        onChange={(e) => handleUpdateBoundary(bnd.id, 'adjoiningDescription', e.target.value)}
                        placeholder="Ex: Fazenda Boa Esperança (João Silva)"
                        className={PROPERTY_THEME.input}
                      />
                      {bndErrors?.adjoiningDescription && (
                        <p className="text-xs text-rose-600 mt-1">{bndErrors.adjoiningDescription}</p>
                      )}
                    </div>
                  </div>

                  {bnd.boundaryType === 'other' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Descrição do Tipo de Divisa *
                      </label>
                      <input
                        type="text"
                        value={bnd.otherBoundaryTypeDescription}
                        onChange={(e) =>
                          handleUpdateBoundary(bnd.id, 'otherBoundaryTypeDescription', e.target.value)
                        }
                        placeholder="Ex: Canal de drenagem artificial"
                        className={PROPERTY_THEME.input}
                      />
                      {bndErrors?.otherBoundaryTypeDescription && (
                        <p className="text-xs text-rose-600 mt-1">{bndErrors.otherBoundaryTypeDescription}</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                      Observações da Divisa <span className="text-[#0B3D2E]/50 font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={bnd.observation}
                      onChange={(e) => handleUpdateBoundary(bnd.id, 'observation', e.target.value)}
                      placeholder="Detalhes sobre cercas, marcos ou especificidades..."
                      className={PROPERTY_THEME.input}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Barra de Ações Inferior */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-6 border-t border-[#0B3D2E]/15">
        <button
          type="button"
          onClick={handleCancelClick}
          disabled={isSubmitting}
          className={`${PROPERTY_THEME.btnSecondary} w-full sm:w-auto justify-center`}
        >
          Cancelar
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`${PROPERTY_THEME.btnPrimary} w-full sm:w-auto justify-center`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[#78C89A]" />
              <span>Salvando imóvel...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4 text-[#78C89A]" />
              <span>{isEditMode ? 'Salvar alterações' : 'Salvar imóvel'}</span>
            </>
          )}
        </button>
      </div>

      {/* Modal de Confirmação: Troca de Tipo */}
      {showTypeChangeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="type-change-modal-title"
          className={PROPERTY_THEME.modalOverlay}
        >
          <div className={PROPERTY_THEME.modalContent}>
            <div className="flex items-start gap-3 text-amber-700">
              <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
              <div>
                <h3 id="type-change-modal-title" className="text-base font-bold text-[#0B3D2E]">
                  Alterar tipo de imóvel
                </h3>
                <p className="text-sm text-[#0B3D2E]/80 mt-1">
                  Ao trocar a classificação para <strong>{showTypeChangeModal === 'rural' ? 'Rural' : 'Urbano'}</strong>, os campos preenchidos específicos do tipo anterior serão redefinidos.
                </p>
                <p className="text-xs text-[#0B3D2E]/60 mt-2">
                  Deseja prosseguir com a troca?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowTypeChangeModal(null)}
                className={PROPERTY_THEME.btnSecondary}
              >
                Manter atual
              </button>
              <button
                type="button"
                onClick={confirmTypeChange}
                className="px-4 py-2 text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-xl transition-colors min-h-[44px] cursor-pointer"
              >
                Sim, alterar tipo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação: Cancelamento com Alterações Não Salvas */}
      {showCancelModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
          className={PROPERTY_THEME.modalOverlay}
        >
          <div className={PROPERTY_THEME.modalContent}>
            <div className="flex items-start gap-3 text-amber-700">
              <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
              <div>
                <h3 id="cancel-modal-title" className="text-base font-bold text-[#0B3D2E]">
                  Descartar alterações não salvas?
                </h3>
                <p className="text-sm text-[#0B3D2E]/80 mt-1">
                  Existem informações preenchidas neste formulário. Se você sair agora, todos os dados não salvos serão perdidos.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className={PROPERTY_THEME.btnSecondary}
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  if (onCancel) onCancel();
                  else navigate(ROUTES.PROPERTIES);
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition-colors min-h-[44px] cursor-pointer"
              >
                Descartar e sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação: Excluir Matrícula com dados */}
      {pendingDeleteRegistrationId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="del-reg-title"
          className={PROPERTY_THEME.modalOverlay}
        >
          <div className={PROPERTY_THEME.modalContent}>
            <h3 id="del-reg-title" className="text-base font-bold text-[#0B3D2E]">
              Remover matrícula preenchida
            </h3>
            <p className="text-sm text-[#0B3D2E]/80">
              Esta linha contém informações de matrícula e cartório preenchidas. Tem certeza de que deseja removê-la?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteRegistrationId(null)}
                className={PROPERTY_THEME.btnSecondary}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRemoveRegistration}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition-colors min-h-[44px] cursor-pointer"
              >
                Remover matrícula
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação: Excluir Confrontação com dados */}
      {pendingDeleteBoundaryId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="del-bnd-title"
          className={PROPERTY_THEME.modalOverlay}
        >
          <div className={PROPERTY_THEME.modalContent}>
            <h3 id="del-bnd-title" className="text-base font-bold text-[#0B3D2E]">
              Remover confrontação
            </h3>
            <p className="text-sm text-[#0B3D2E]/80">
              Tem certeza de que deseja remover este limite/confrontação do imóvel?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteBoundaryId(null)}
                className={PROPERTY_THEME.btnSecondary}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRemoveBoundary}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition-colors min-h-[44px] cursor-pointer"
              >
                Remover confrontação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação: Excluir Vínculo com Cliente */}
      {pendingDeleteClientId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="del-cli-title"
          className={PROPERTY_THEME.modalOverlay}
        >
          <div className={PROPERTY_THEME.modalContent}>
            <h3 id="del-cli-title" className="text-base font-bold text-[#0B3D2E]">
              Remover vínculo com o cliente
            </h3>
            <p className="text-sm text-[#0B3D2E]/80">
              Tem certeza de que deseja desvincular este cliente deste imóvel?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteClientId(null)}
                className={PROPERTY_THEME.btnSecondary}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRemoveClient}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition-colors min-h-[44px] cursor-pointer"
              >
                Desvincular cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

export default PropertyForm;
