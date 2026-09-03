import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import type { TechnicalVisit } from '../types/technicalVisit';
import type {
  TechnicalVisitFieldAnswer,
  TechnicalVisitFieldAnswerType,
  TechnicalVisitFieldItem,
  TechnicalVisitFieldSection,
} from '../types/technicalVisitFieldForm';
import { useFieldVisits } from './useFieldVisits';
import { FIELD_VISIT_THEME } from './theme';
import { useFieldConnectivity } from './useFieldConnectivity';
import { FIELD_OFFLINE_DRAFT_MESSAGE } from './fieldDevice';

const TYPE_LABELS: Readonly<Record<TechnicalVisitFieldAnswerType, string>> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  integer: 'Número inteiro',
  decimal: 'Número decimal',
  boolean: 'Sim ou não',
  date: 'Data',
  time: 'Horário',
  single_choice: 'Escolha única',
  multiple_choice: 'Múltipla escolha',
};

function newId(prefix: 'section' | 'item'): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Não foi possível criar um novo item neste dispositivo.');
  }
  return prefix + ':' + globalThis.crypto.randomUUID();
}

function hasMeaningfulContent(section: TechnicalVisitFieldSection): boolean {
  if (section.description?.trim()) return true;
  return section.items.some(
    (item) =>
      item.answer !== null ||
      Boolean(item.observation?.trim()) ||
      item.options.length > 0
  );
}

export interface VisitFieldFormPanelProps {
  readonly visit: TechnicalVisit;
  readonly canAccess: boolean;
  readonly canEdit: boolean;
  readonly onSubmissionStateChange?: (submitted: boolean) => void;
}

export function VisitFieldFormPanel({
  visit,
  canAccess,
  canEdit,
  onSubmissionStateChange,
}: VisitFieldFormPanelProps) {
  const {
    getFieldForm,
    saveFieldFormDraft,
    submitFieldForm,
  } = useFieldVisits();

  const [open, setOpen] = useState(visit.status === 'in_progress');
  const [sections, setSections] = useState<TechnicalVisitFieldSection[]>([]);
  const [version, setVersion] = useState(0);
  const [formStatus, setFormStatus] = useState<'draft' | 'submitted'>('draft');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const connectivity = useFieldConnectivity();
  const isOffline = connectivity === 'offline';

  const sectionsRef = useRef<TechnicalVisitFieldSection[]>([]);
  const versionRef = useRef(0);
  const dirtyRevisionRef = useRef(0);
  const savingRef = useRef(false);
  const firstActionRef = useRef<HTMLButtonElement | null>(null);
  const submissionCallbackRef = useRef(onSubmissionStateChange);

  submissionCallbackRef.current = onSubmissionStateChange;

  const panelId = 'field-form-panel-' + visit.id;

  const setCurrentSections = useCallback(
    (next: TechnicalVisitFieldSection[]) => {
      sectionsRef.current = next;
      setSections(next);
      dirtyRevisionRef.current += 1;
      setDirty(true);
      setError(null);
    },
    []
  );

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  useEffect(() => {
    if (!canAccess) {
      setSections([]);
      sectionsRef.current = [];
      setVersion(0);
      versionRef.current = 0;
      setFormStatus('draft');
      setDirty(false);
      submissionCallbackRef.current?.(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void getFieldForm(visit.id)
      .then((form) => {
        if (!active) return;
        const nextSections = form ? Array.from(form.sections) : [];
        sectionsRef.current = nextSections;
        setSections(nextSections);
        const nextVersion = form?.version ?? 0;
        versionRef.current = nextVersion;
        setVersion(nextVersion);
        setFormStatus(form?.status ?? 'draft');
        setSavedAt(form?.updatedAt ?? null);
        setDirty(false);
        submissionCallbackRef.current?.(form?.status === 'submitted');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar o formulário de campo.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canAccess, getFieldForm, visit.id]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      firstActionRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, saving]);

  const editable =
    canEdit &&
    formStatus === 'draft' &&
    (visit.status === 'confirmed' || visit.status === 'in_progress');

  const persistDraft = useCallback(async () => {
    if (!editable || savingRef.current) return;
    if (isOffline) {
      setError(FIELD_OFFLINE_DRAFT_MESSAGE);
      return;
    }
    const revision = dirtyRevisionRef.current;
    const snapshot = sectionsRef.current.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        options: [...item.options],
        answer: Array.isArray(item.answer) ? [...item.answer] : item.answer,
      })),
    }));

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveFieldFormDraft(
        visit.id,
        snapshot,
        versionRef.current
      );
      versionRef.current = saved.version;
      setVersion(saved.version);
      setSavedAt(saved.updatedAt);
      setFormStatus(saved.status);
      if (dirtyRevisionRef.current === revision) {
        setDirty(false);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar o formulário de campo.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [editable, isOffline, saveFieldFormDraft, visit.id]);

  useEffect(() => {
    if (!editable || !dirty || saving || isOffline) return;
    const timer = window.setTimeout(() => {
      void persistDraft();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [connectivity, dirty, editable, isOffline, persistDraft, saving, sections]);

  const addSection = () => {
    try {
      const id = newId('section');
      const next: TechnicalVisitFieldSection[] = [
        ...sectionsRef.current,
        {
          id,
          title: 'Nova seção',
          description: null,
          order: sectionsRef.current.length + 1,
          items: [],
        },
      ];
      setCurrentSections(next);
      window.setTimeout(() => {
        document.getElementById('field-section-title-' + id)?.focus();
      }, 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar a seção.');
    }
  };

  const updateSection = (
    sectionId: string,
    patch: Partial<Pick<TechnicalVisitFieldSection, 'title' | 'description'>>
  ) => {
    setCurrentSections(
      sectionsRef.current.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section
      )
    );
  };

  const removeSection = (sectionId: string) => {
    const target = sectionsRef.current.find((section) => section.id === sectionId);
    if (!target) return;
    if (
      hasMeaningfulContent(target) &&
      !window.confirm('Esta seção possui conteúdo. Deseja removê-la?')
    ) {
      return;
    }

    setCurrentSections(
      sectionsRef.current
        .filter((section) => section.id !== sectionId)
        .map((section, index) => ({ ...section, order: index + 1 }))
    );
  };

  const addItem = (sectionId: string) => {
    try {
      const id = newId('item');
      setCurrentSections(
        sectionsRef.current.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                items: [
                  ...section.items,
                  {
                    id,
                    label: 'Novo item',
                    type: 'short_text',
                    required: false,
                    options: [],
                    answer: null,
                    observation: null,
                  },
                ],
              }
            : section
        )
      );
      window.setTimeout(() => {
        document.getElementById('field-item-label-' + id)?.focus();
      }, 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar o item.');
    }
  };

  const updateItem = (
    sectionId: string,
    itemId: string,
    updater: (item: TechnicalVisitFieldItem) => TechnicalVisitFieldItem
  ) => {
    setCurrentSections(
      sectionsRef.current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId ? updater(item) : item
              ),
            }
          : section
      )
    );
  };

  const removeItem = (sectionId: string, itemId: string) => {
    const section = sectionsRef.current.find((entry) => entry.id === sectionId);
    const item = section?.items.find((entry) => entry.id === itemId);
    if (!item) return;
    if (
      (item.answer !== null || item.observation?.trim()) &&
      !window.confirm('Este item possui uma resposta. Deseja removê-lo?')
    ) {
      return;
    }

    setCurrentSections(
      sectionsRef.current.map((entry) =>
        entry.id === sectionId
          ? {
              ...entry,
              items: entry.items.filter((candidate) => candidate.id !== itemId),
            }
          : entry
      )
    );
  };

  const setAnswer = (
    sectionId: string,
    itemId: string,
    answer: TechnicalVisitFieldAnswer
  ) => {
    updateItem(sectionId, itemId, (item) => ({ ...item, answer }));
  };

  const changeType = (
    sectionId: string,
    itemId: string,
    type: TechnicalVisitFieldAnswerType
  ) => {
    updateItem(sectionId, itemId, (item) => ({
      ...item,
      type,
      answer: null,
      options:
        type === 'single_choice' || type === 'multiple_choice'
          ? item.options
          : [],
    }));
  };

  const addOption = (sectionId: string, itemId: string) => {
    updateItem(sectionId, itemId, (item) => ({
      ...item,
      options:
        item.options.length >= 30
          ? item.options
          : [...item.options, 'Opção ' + String(item.options.length + 1)],
      answer: null,
    }));
  };

  const updateOption = (
    sectionId: string,
    itemId: string,
    optionIndex: number,
    value: string
  ) => {
    updateItem(sectionId, itemId, (item) => ({
      ...item,
      options: item.options.map((option, index) =>
        index === optionIndex ? value : option
      ),
      answer: null,
    }));
  };

  const removeOption = (
    sectionId: string,
    itemId: string,
    optionIndex: number
  ) => {
    updateItem(sectionId, itemId, (item) => ({
      ...item,
      options: item.options.filter((_, index) => index !== optionIndex),
      answer: null,
    }));
  };

  const submit = async () => {
    if (!editable || visit.status !== 'in_progress' || saving || dirty) return;
    if (isOffline) {
      setError(FIELD_OFFLINE_DRAFT_MESSAGE);
      return;
    }
    setSaving(true);
    savingRef.current = true;
    setError(null);
    try {
      const submitted = await submitFieldForm(
        visit.id,
        sectionsRef.current,
        versionRef.current
      );
      versionRef.current = submitted.version;
      setVersion(submitted.version);
      setFormStatus(submitted.status);
      setSavedAt(submitted.updatedAt);
      setDirty(false);
      submissionCallbackRef.current?.(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível enviar o formulário de campo.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const toggleOpen = () => {
    if (open && dirty) {
      const close = window.confirm(
        'Há alterações aguardando salvamento. Deseja fechar o formulário mesmo assim?'
      );
      if (!close) return;
    }
    setOpen((current) => !current);
  };

  if (!canAccess) return null;

  return (
    <section className={FIELD_VISIT_THEME.surface + ' mt-4 min-w-0 overflow-hidden'}>
      <button
        type="button"
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-[#78C89A]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggleOpen}
      >
        <span className="min-w-0">
          <span className="block font-semibold text-[#0B3D2E]">Formulário de campo</span>
          <span className="block text-xs text-[#0B3D2E]/70">
            {formStatus === 'submitted'
              ? 'Enviado'
              : isOffline && dirty
                ? 'Sem conexão — alterações aguardando envio'
                : saving
                  ? 'Salvando alterações'
                  : dirty
                    ? 'Alterações aguardando salvamento'
                    : savedAt
                    ? 'Rascunho salvo'
                    : 'Sem respostas salvas'}
          </span>
        </span>
        <ChevronDown
          className={'h-5 w-5 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="border-t border-[#0B3D2E]/10 p-4"
          aria-busy={loading || saving}
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div aria-live="polite" role="status" className="text-sm text-[#0B3D2E]/70">
              {loading
                ? 'Carregando formulário...'
                : formStatus === 'submitted'
                  ? 'Formulário enviado e protegido contra alterações.'
                  : savedAt
                    ? 'Último salvamento: ' + new Date(savedAt).toLocaleString('pt-BR')
                    : 'O rascunho é salvo progressivamente.'}
            </div>

            {editable && (
              <div className="flex flex-wrap gap-2">
                <button
                  ref={firstActionRef}
                  type="button"
                  className={FIELD_VISIT_THEME.buttonSecondary}
                  onClick={addSection}
                  disabled={saving}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Adicionar seção
                </button>
                <button
                  type="button"
                  className={FIELD_VISIT_THEME.buttonSecondary}
                  onClick={() => void persistDraft()}
                  disabled={saving || !dirty || isOffline}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Salvar agora
                </button>
              </div>
            )}
          </div>

          {isOffline && (
            <div
              role="status"
              aria-live="polite"
              className={FIELD_VISIT_THEME.surfaceSoft + ' mb-4 p-3 text-sm font-medium'}
            >
              {FIELD_OFFLINE_DRAFT_MESSAGE}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className={FIELD_VISIT_THEME.surfaceSoft + ' mb-4 p-3 text-sm font-medium'}
            >
              {error}
            </div>
          )}

          {visit.status === 'planned' && (
            <p className="text-sm text-[#0B3D2E]/70">
              O formulário ficará disponível para edição após a confirmação da visita.
            </p>
          )}

          {sections.length === 0 && !loading ? (
            <div className={FIELD_VISIT_THEME.surfaceSoft + ' p-4 text-sm'}>
              Nenhuma seção configurada.
              {editable ? ' Adicione uma seção para iniciar a coleta.' : ''}
            </div>
          ) : (
            <div className="space-y-4">
              {sections.map((section, sectionIndex) => (
                <fieldset
                  key={section.id}
                  className="min-w-0 rounded-2xl border border-[#0B3D2E]/15 p-3 sm:p-4"
                >
                  <legend className="px-1 text-sm font-semibold text-[#0B3D2E]">
                    Seção {sectionIndex + 1}
                  </legend>

                  <div className="grid min-w-0 gap-3 md:grid-cols-2">
                    <label className="min-w-0 space-y-1.5 text-sm font-medium">
                      <span>Título da seção</span>
                      <input
                        id={'field-section-title-' + section.id}
                        className={FIELD_VISIT_THEME.input}
                        value={section.title}
                        maxLength={120}
                        disabled={!editable}
                        onChange={(event) =>
                          updateSection(section.id, { title: event.target.value })
                        }
                      />
                    </label>
                    <label className="min-w-0 space-y-1.5 text-sm font-medium">
                      <span>Descrição da seção</span>
                      <input
                        className={FIELD_VISIT_THEME.input}
                        value={section.description ?? ''}
                        maxLength={600}
                        disabled={!editable}
                        onChange={(event) =>
                          updateSection(section.id, {
                            description: event.target.value || null,
                          })
                        }
                      />
                    </label>
                  </div>

                  {editable && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={FIELD_VISIT_THEME.buttonSecondary}
                        onClick={() => addItem(section.id)}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Adicionar item
                      </button>
                      <button
                        type="button"
                        className={FIELD_VISIT_THEME.buttonSecondary}
                        onClick={() => removeSection(section.id)}
                        aria-label={'Remover seção ' + String(sectionIndex + 1)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Remover seção
                      </button>
                    </div>
                  )}

                  <div className="mt-4 space-y-3">
                    {section.items.map((item, itemIndex) => (
                      <div
                        key={item.id}
                        className={FIELD_VISIT_THEME.surfaceSoft + ' min-w-0 p-3 sm:p-4'}
                      >
                        <div className="grid min-w-0 gap-3 md:grid-cols-2">
                          <label className="min-w-0 space-y-1.5 text-sm font-medium">
                            <span>Enunciado do item</span>
                            <input
                              id={'field-item-label-' + item.id}
                              className={FIELD_VISIT_THEME.input}
                              value={item.label}
                              maxLength={180}
                              disabled={!editable}
                              onChange={(event) =>
                                updateItem(section.id, item.id, (current) => ({
                                  ...current,
                                  label: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <label className="min-w-0 space-y-1.5 text-sm font-medium">
                            <span>Tipo de resposta</span>
                            <select
                              className={FIELD_VISIT_THEME.input}
                              value={item.type}
                              disabled={!editable}
                              onChange={(event) =>
                                changeType(
                                  section.id,
                                  item.id,
                                  event.target.value as TechnicalVisitFieldAnswerType
                                )
                              }
                            >
                              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        {editable && (
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <label className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={item.required}
                                onChange={(event) =>
                                  updateItem(section.id, item.id, (current) => ({
                                    ...current,
                                    required: event.target.checked,
                                  }))
                                }
                              />
                              Item obrigatório
                            </label>
                            <button
                              type="button"
                              className={FIELD_VISIT_THEME.buttonSecondary}
                              onClick={() => removeItem(section.id, item.id)}
                              aria-label={
                                'Remover item ' +
                                String(itemIndex + 1) +
                                ' da seção ' +
                                String(sectionIndex + 1)
                              }
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Remover item
                            </button>
                          </div>
                        )}

                        {(item.type === 'single_choice' ||
                          item.type === 'multiple_choice') && (
                          <div className="mt-3 space-y-2">
                            <span className="block text-sm font-medium">Opções de resposta</span>
                            {item.options.map((option, optionIndex) => (
                              <div
                                key={String(optionIndex)}
                                className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"
                              >
                                <input
                                  className={FIELD_VISIT_THEME.input}
                                  value={option}
                                  maxLength={120}
                                  disabled={!editable}
                                  aria-label={'Opção ' + String(optionIndex + 1)}
                                  onChange={(event) =>
                                    updateOption(
                                      section.id,
                                      item.id,
                                      optionIndex,
                                      event.target.value
                                    )
                                  }
                                />
                                {editable && (
                                  <button
                                    type="button"
                                    className={FIELD_VISIT_THEME.buttonSecondary}
                                    onClick={() =>
                                      removeOption(section.id, item.id, optionIndex)
                                    }
                                    aria-label={'Remover opção ' + String(optionIndex + 1)}
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    Remover opção
                                  </button>
                                )}
                              </div>
                            ))}
                            {editable && item.options.length < 30 && (
                              <button
                                type="button"
                                className={FIELD_VISIT_THEME.buttonSecondary}
                                onClick={() => addOption(section.id, item.id)}
                              >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                Adicionar opção
                              </button>
                            )}
                          </div>
                        )}

                        <div className="mt-3">
                          <span className="mb-1.5 block text-sm font-medium">
                            Resposta{item.required ? ' *' : ''}
                          </span>
                          {item.type === 'short_text' && (
                            <input
                              className={FIELD_VISIT_THEME.input}
                              value={typeof item.answer === 'string' ? item.answer : ''}
                              maxLength={500}
                              disabled={!editable}
                              onChange={(event) =>
                                setAnswer(section.id, item.id, event.target.value)
                              }
                            />
                          )}
                          {item.type === 'long_text' && (
                            <textarea
                              className={FIELD_VISIT_THEME.textarea}
                              value={typeof item.answer === 'string' ? item.answer : ''}
                              maxLength={4000}
                              disabled={!editable}
                              onChange={(event) =>
                                setAnswer(section.id, item.id, event.target.value)
                              }
                            />
                          )}
                          {item.type === 'integer' && (
                            <input
                              type="number"
                              inputMode="numeric"
                              step={1}
                              className={FIELD_VISIT_THEME.input}
                              value={typeof item.answer === 'number' ? item.answer : ''}
                              disabled={!editable}
                              onChange={(event) =>
                                setAnswer(
                                  section.id,
                                  item.id,
                                  event.target.value === ''
                                    ? null
                                    : Number.parseInt(event.target.value, 10)
                                )
                              }
                            />
                          )}
                          {item.type === 'decimal' && (
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              className={FIELD_VISIT_THEME.input}
                              value={typeof item.answer === 'number' ? item.answer : ''}
                              disabled={!editable}
                              onChange={(event) =>
                                setAnswer(
                                  section.id,
                                  item.id,
                                  event.target.value === ''
                                    ? null
                                    : Number(event.target.value)
                                )
                              }
                            />
                          )}
                          {item.type === 'boolean' && (
                            <select
                              className={FIELD_VISIT_THEME.input}
                              value={
                                typeof item.answer === 'boolean'
                                  ? item.answer
                                    ? 'yes'
                                    : 'no'
                                  : ''
                              }
                              disabled={!editable}
                              onChange={(event) =>
                                setAnswer(
                                  section.id,
                                  item.id,
                                  event.target.value === ''
                                    ? null
                                    : event.target.value === 'yes'
                                )
                              }
                            >
                              <option value="">Selecione</option>
                              <option value="yes">Sim</option>
                              <option value="no">Não</option>
                            </select>
                          )}
                          {item.type === 'date' && (
                            <input
                              type="date"
                              className={FIELD_VISIT_THEME.input}
                              value={typeof item.answer === 'string' ? item.answer : ''}
                              disabled={!editable}
                              onChange={(event) =>
                                setAnswer(section.id, item.id, event.target.value || null)
                              }
                            />
                          )}
                          {item.type === 'time' && (
                            <input
                              type="time"
                              className={FIELD_VISIT_THEME.input}
                              value={typeof item.answer === 'string' ? item.answer : ''}
                              disabled={!editable}
                              onChange={(event) =>
                                setAnswer(section.id, item.id, event.target.value || null)
                              }
                            />
                          )}
                          {item.type === 'single_choice' && (
                            <select
                              className={FIELD_VISIT_THEME.input}
                              value={typeof item.answer === 'string' ? item.answer : ''}
                              disabled={!editable}
                              onChange={(event) =>
                                setAnswer(section.id, item.id, event.target.value || null)
                              }
                            >
                              <option value="">Selecione</option>
                              {item.options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          )}
                          {item.type === 'multiple_choice' && (
                            <fieldset className="space-y-1">
                              <legend className="sr-only">Opções da resposta</legend>
                              {item.options.map((option) => {
                                const selected = Array.isArray(item.answer)
                                  ? item.answer.includes(option)
                                  : false;
                                return (
                                  <label
                                    key={option}
                                    className="flex min-h-[44px] items-center gap-2 rounded-xl px-2 text-sm"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      disabled={!editable}
                                      onChange={(event) => {
                                        const current = Array.isArray(item.answer)
                                          ? [...item.answer]
                                          : [];
                                        const next = event.target.checked
                                          ? [...current, option]
                                          : current.filter((value) => value !== option);
                                        setAnswer(section.id, item.id, next);
                                      }}
                                    />
                                    <span className="break-words">{option}</span>
                                  </label>
                                );
                              })}
                            </fieldset>
                          )}
                        </div>

                        <label className="mt-3 block space-y-1.5 text-sm font-medium">
                          <span>Observação do item</span>
                          <textarea
                            className={FIELD_VISIT_THEME.textarea}
                            value={item.observation ?? ''}
                            maxLength={1000}
                            disabled={!editable}
                            onChange={(event) =>
                              updateItem(section.id, item.id, (current) => ({
                                ...current,
                                observation: event.target.value || null,
                              }))
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}

          {formStatus === 'submitted' && (
            <div className={FIELD_VISIT_THEME.surfaceSoft + ' mt-4 flex items-center gap-2 p-3 text-sm font-medium'}>
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              Formulário enviado. As respostas ficam somente para consulta.
            </div>
          )}

          {editable && visit.status === 'in_progress' && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className={FIELD_VISIT_THEME.buttonPrimary}
                disabled={saving || dirty || sections.length === 0}
                onClick={() => void submit()}
                title={
                  dirty
                    ? 'Aguarde o salvamento do rascunho antes de enviar'
                    : 'Enviar formulário de campo'
                }
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Enviar formulário
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
