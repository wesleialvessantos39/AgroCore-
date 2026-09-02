import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ClipboardList, MapPin, Route, Save, Users } from 'lucide-react';
import type { OrganizationMember } from '../auth/organizationMembersGateway';
import { useFieldVisits } from './useFieldVisits';
import { FIELD_VISIT_THEME } from './theme';
import { utcToZonedLocalInput } from './schedule';
import {
  TechnicalVisitScheduleConflictError,
  type TechnicalVisit,
  type TechnicalVisitScheduleConflict,
  type TechnicalVisitPreparationChecklistInput,
} from '../types/technicalVisit';

interface VisitPreparationPanelProps {
  readonly visit: TechnicalVisit;
  readonly members: readonly OrganizationMember[];
  readonly canEdit: boolean;
}

interface ChecklistDraft {
  readonly id?: string;
  readonly label: string;
  readonly required: boolean;
}

const COMMON_TIME_ZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Cuiaba',
  'America/Rio_Branco',
  'America/Noronha',
] as const;

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
}

function vehicleReferenceId(label: string): string {
  return label
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, '-')
    .slice(0, 120);
}

function conflictLabel(conflict: TechnicalVisitScheduleConflict): string {
  const labels = conflict.reasons.map((reason) => {
    if (reason === 'responsible') return 'responsável';
    if (reason === 'participant') return 'participante';
    return 'veículo';
  });
  return labels.join(', ');
}

export function VisitPreparationPanel({
  visit,
  members,
  canEdit,
}: VisitPreparationPanelProps) {
  const { prepareVisit, setChecklistItemCompletion } = useFieldVisits();
  const initialZone = visit.preparation?.timeZone ?? browserTimeZone();

  const [open, setOpen] = useState(false);
  const [localStart, setLocalStart] = useState(() =>
    utcToZonedLocalInput(visit.scheduledFor, initialZone)
  );
  const [timeZone, setTimeZone] = useState(initialZone);
  const [durationMinutes, setDurationMinutes] = useState(
    visit.preparation?.durationMinutes ?? 60
  );
  const [addressLine, setAddressLine] = useState(
    visit.preparation?.address.addressLine ?? ''
  );
  const [city, setCity] = useState(visit.preparation?.address.city ?? '');
  const [state, setState] = useState(visit.preparation?.address.state ?? '');
  const [postalCode, setPostalCode] = useState(
    visit.preparation?.address.postalCode ?? ''
  );
  const [addressNotes, setAddressNotes] = useState(
    visit.preparation?.address.notes ?? ''
  );
  const [participantUserIds, setParticipantUserIds] = useState<readonly string[]>(
    visit.preparation?.participantUserIds ?? []
  );
  const [checklist, setChecklist] = useState<readonly ChecklistDraft[]>(
    visit.preparation?.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      required: item.required,
    })) ?? []
  );
  const [vehicleLabel, setVehicleLabel] = useState(
    visit.preparation?.vehicleReference?.label ?? ''
  );
  const [routeNotes, setRouteNotes] = useState(visit.preparation?.routeNotes ?? '');
  const [changeReason, setChangeReason] = useState('Preparação operacional da visita');
  const [overrideReason, setOverrideReason] = useState('');
  const [conflicts, setConflicts] = useState<readonly TechnicalVisitScheduleConflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const zone = visit.preparation?.timeZone ?? browserTimeZone();
    setTimeZone(zone);
    setLocalStart(utcToZonedLocalInput(visit.scheduledFor, zone));
    setDurationMinutes(visit.preparation?.durationMinutes ?? 60);
    setAddressLine(visit.preparation?.address.addressLine ?? '');
    setCity(visit.preparation?.address.city ?? '');
    setState(visit.preparation?.address.state ?? '');
    setPostalCode(visit.preparation?.address.postalCode ?? '');
    setAddressNotes(visit.preparation?.address.notes ?? '');
    setParticipantUserIds(visit.preparation?.participantUserIds ?? []);
    setChecklist(
      visit.preparation?.checklist.map((item) => ({
        id: item.id,
        label: item.label,
        required: item.required,
      })) ?? []
    );
    setVehicleLabel(visit.preparation?.vehicleReference?.label ?? '');
    setRouteNotes(visit.preparation?.routeNotes ?? '');
    setConflicts([]);
    setOverrideReason('');
    setError(null);
  }, [visit.id, visit.version]);

  const participantNames = useMemo(
    () =>
      (visit.preparation?.participantUserIds ?? [])
        .map((userId) => members.find((member) => member.userId === userId)?.name)
        .filter((name): name is string => Boolean(name)),
    [members, visit.preparation?.participantUserIds]
  );

  const requiredChecklist = visit.preparation?.checklist.filter((item) => item.required) ?? [];
  const requiredCompleted = requiredChecklist.filter((item) => item.completed).length;

  const toggleParticipant = (userId: string) => {
    setParticipantUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  };

  const updateChecklist = (
    index: number,
    patch: Partial<ChecklistDraft>
  ) => {
    setChecklist((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  };

  const removeChecklistItem = (index: number) => {
    setChecklist((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const save = async (authorizedOverride = false) => {
    setBusy(true);
    setError(null);
    try {
      const checklistInput: TechnicalVisitPreparationChecklistInput[] = checklist.map(
        (item) => ({
          id: item.id,
          label: item.label,
          required: item.required,
        })
      );

      await prepareVisit(visit.id, {
        localStart,
        timeZone,
        durationMinutes,
        address: {
          addressLine,
          city,
          state,
          postalCode: postalCode || null,
          notes: addressNotes || null,
        },
        participantUserIds,
        checklist: checklistInput,
        vehicleReference: vehicleLabel.trim()
          ? {
              referenceId: vehicleReferenceId(vehicleLabel),
              label: vehicleLabel,
            }
          : null,
        routeNotes: routeNotes || null,
        expectedVersion: visit.version,
        changeReason,
        conflictOverrideReason: authorizedOverride ? overrideReason : undefined,
      });

      setOpen(false);
      setConflicts([]);
      setOverrideReason('');
    } catch (caught) {
      if (caught instanceof TechnicalVisitScheduleConflictError) {
        setConflicts(caught.conflicts);
        setError(caught.message);
      } else {
        setError(caught instanceof Error ? caught.message : 'Não foi possível salvar a preparação.');
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleChecklistCompletion = async (itemId: string, completed: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setChecklistItemCompletion(visit.id, {
        itemId,
        completed,
        expectedVersion: visit.version,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível atualizar o checklist.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={FIELD_VISIT_THEME.surfaceSoft + ' mt-4 p-4'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-[#0B3D2E]">Preparação da visita</h3>
          </div>
          {visit.preparation ? (
            <div className="mt-2 space-y-1 text-xs text-[#0B3D2E]/70">
              <p>
                {new Date(visit.scheduledFor).toLocaleString('pt-BR', {
                  timeZone: visit.preparation.timeZone,
                })}{' '}
                · {visit.preparation.durationMinutes} min · {visit.preparation.timeZone}
              </p>
              <p>
                {visit.preparation.address.addressLine}, {visit.preparation.address.city} -{' '}
                {visit.preparation.address.state}
              </p>
              <p>
                Participantes: {participantNames.length > 0 ? participantNames.join(', ') : 'nenhum adicional'}
              </p>
              <p>
                Checklist obrigatório: {requiredCompleted}/{requiredChecklist.length} concluído
              </p>
              {visit.preparation.vehicleReference && (
                <p>Veículo previsto: {visit.preparation.vehicleReference.label}</p>
              )}
              {visit.preparation.conflictOverride && (
                <p>
                  Exceção de agenda autorizada: {visit.preparation.conflictOverride.reason}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-[#0B3D2E]/70">
              A duração, o endereço, os participantes e o checklist ainda não foram preparados.
            </p>
          )}
        </div>
        {canEdit && (visit.status === 'planned' || visit.status === 'confirmed') && (
          <button
            type="button"
            className={FIELD_VISIT_THEME.buttonSecondary}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Fechar' : visit.preparation ? 'Editar preparação' : 'Preparar visita'}
          </button>
        )}
      </div>

      {visit.preparation?.checklist.length ? (
        <div className="mt-4 grid gap-2">
          {visit.preparation.checklist.map((item) => (
            <label
              key={item.id}
              className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[#78C89A]/35 bg-white px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={item.completed}
                disabled={!canEdit || busy || (visit.status !== 'planned' && visit.status !== 'confirmed')}
                onChange={(event) =>
                  void toggleChecklistCompletion(item.id, event.target.checked)
                }
                className="h-5 w-5 accent-[#0B3D2E]"
              />
              <span className="flex-1">
                {item.label}
                {item.required && (
                  <span className="ml-2 text-xs font-semibold text-[#0B3D2E]/65">obrigatório</span>
                )}
              </span>
              {item.completed && <Check className="h-4 w-4" aria-hidden="true" />}
            </label>
          ))}
        </div>
      ) : null}

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-[#0B3D2E]/20 bg-white p-3 text-sm text-[#0B3D2E]">
          {error}
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="mt-4 rounded-xl border border-[#0B3D2E]/25 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Conflitos encontrados
          </div>
          <ul className="mt-2 space-y-1 text-xs text-[#0B3D2E]/70">
            {conflicts.map((conflict) => (
              <li key={conflict.visitId}>
                Visita no mesmo período — conflito de {conflictLabel(conflict)}.
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="mt-3 space-y-2">
              <label className="block text-xs font-semibold">
                Motivo para manter a exceção
                <textarea
                  className={FIELD_VISIT_THEME.textarea + ' mt-1'}
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  maxLength={500}
                  placeholder="Explique por que o conflito pode ser mantido"
                />
              </label>
              <button
                type="button"
                className={FIELD_VISIT_THEME.buttonPrimary}
                disabled={busy || overrideReason.trim().length < 5}
                onClick={() => void save(true)}
              >
                Autorizar exceção e salvar
              </button>
            </div>
          )}
        </div>
      )}

      {open && canEdit && (
        <div className="mt-5 space-y-5 border-t border-[#78C89A]/30 pt-5">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1.5 text-sm font-medium">
              <span>Data e hora local</span>
              <input
                type="datetime-local"
                className={FIELD_VISIT_THEME.input}
                value={localStart}
                onChange={(event) => setLocalStart(event.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Fuso horário</span>
              <input
                list="agrocore-visit-timezones"
                className={FIELD_VISIT_THEME.input}
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
              />
              <datalist id="agrocore-visit-timezones">
                {COMMON_TIME_ZONES.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Duração em minutos</span>
              <input
                type="number"
                min={15}
                max={1440}
                step={15}
                className={FIELD_VISIT_THEME.input}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
              />
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Endereço operacional
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium md:col-span-2">
                <span>Endereço / ponto de encontro</span>
                <input
                  className={FIELD_VISIT_THEME.input}
                  value={addressLine}
                  onChange={(event) => setAddressLine(event.target.value)}
                  maxLength={240}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Cidade</span>
                <input
                  className={FIELD_VISIT_THEME.input}
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  maxLength={120}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Estado</span>
                <input
                  className={FIELD_VISIT_THEME.input}
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                  maxLength={60}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>CEP / referência postal</span>
                <input
                  className={FIELD_VISIT_THEME.input}
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  maxLength={20}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Orientações de chegada</span>
                <input
                  className={FIELD_VISIT_THEME.input}
                  value={addressNotes}
                  onChange={(event) => setAddressNotes(event.target.value)}
                  maxLength={500}
                />
              </label>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" aria-hidden="true" />
              Participantes adicionais
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {members
                .filter((member) => member.userId !== visit.responsibleUserId)
                .map((member) => (
                  <label
                    key={member.userId}
                    className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[#0B3D2E]/15 bg-white px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={participantUserIds.includes(member.userId)}
                      onChange={() => toggleParticipant(member.userId)}
                      className="h-5 w-5 accent-[#0B3D2E]"
                    />
                    <span>{member.name}</span>
                  </label>
                ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                Checklist prévio
              </div>
              <button
                type="button"
                className={FIELD_VISIT_THEME.buttonSecondary}
                onClick={() =>
                  setChecklist((current) => [
                    ...current,
                    { label: '', required: false },
                  ])
                }
              >
                Adicionar item
              </button>
            </div>
            <div className="space-y-2">
              {checklist.map((item, index) => (
                <div
                  key={item.id ?? `new-${index}`}
                  className="grid gap-2 rounded-xl border border-[#0B3D2E]/15 bg-white p-3 sm:grid-cols-[1fr_auto_auto]"
                >
                  <input
                    className={FIELD_VISIT_THEME.input}
                    value={item.label}
                    onChange={(event) =>
                      updateChecklist(index, { label: event.target.value })
                    }
                    maxLength={160}
                    placeholder="Item de preparação"
                  />
                  <label className="flex min-h-[44px] items-center gap-2 px-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={(event) =>
                        updateChecklist(index, { required: event.target.checked })
                      }
                      className="h-5 w-5 accent-[#0B3D2E]"
                    />
                    Obrigatório
                  </label>
                  <button
                    type="button"
                    className={FIELD_VISIT_THEME.buttonSecondary}
                    onClick={() => removeChecklistItem(index)}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              <span>Veículo previsto (opcional)</span>
              <input
                className={FIELD_VISIT_THEME.input}
                value={vehicleLabel}
                onChange={(event) => setVehicleLabel(event.target.value)}
                maxLength={120}
                placeholder="Placa, identificação ou nome de uso"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Motivo da preparação / remarcação</span>
              <input
                className={FIELD_VISIT_THEME.input}
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                maxLength={500}
              />
            </label>
          </div>

          <label className="space-y-1.5 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Route className="h-4 w-4" aria-hidden="true" />
              Roteiro e orientações
            </span>
            <textarea
              className={FIELD_VISIT_THEME.textarea}
              value={routeNotes}
              onChange={(event) => setRouteNotes(event.target.value)}
              maxLength={1200}
              placeholder="Sequência prevista, pontos de parada e orientações operacionais"
            />
          </label>

          <div className="flex justify-end">
            <button
              type="button"
              className={FIELD_VISIT_THEME.buttonPrimary}
              disabled={busy}
              onClick={() => void save(false)}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {busy ? 'Salvando...' : 'Salvar preparação'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
