import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  RotateCcw,
  UserRoundCog,
  XCircle,
} from 'lucide-react';
import { SCHEDULE_THEME } from './theme';
import type {
  ScheduleItem,
  ScheduleMemberOption,
  ScheduleTransitionInput,
  SetScheduleCollaborationInput,
} from '../types/schedule';

type LifecycleAction = 'complete' | 'reopen' | 'cancel';

function secureCommandId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error(
      'O navegador não oferece um gerador seguro para registrar a operação.'
    );
  }
  return globalThis.crypto.randomUUID();
}

function roleLabel(role: ScheduleMemberOption['organizationRole']): string {
  switch (role) {
    case 'owner':
      return 'Proprietário';
    case 'company_admin':
      return 'Administrador';
    case 'manager':
      return 'Gerente';
    case 'project_designer':
      return 'Projetista';
    case 'capturer':
      return 'Captador';
    case 'finance':
      return 'Financeiro';
    default:
      return 'Integrante';
  }
}

function memberLabel(
  member: ScheduleMemberOption | undefined
): string {
  if (!member) return 'Integrante da organização';
  return `${member.displayName} · ${roleLabel(member.organizationRole)}`;
}

export interface ScheduleItemCollaborationPanelProps {
  readonly item: ScheduleItem;
  readonly members: readonly ScheduleMemberOption[];
  readonly currentUserId: string | null;
  readonly canManage: boolean;
  readonly onSetCollaboration: (
    scheduleItemId: string,
    input: SetScheduleCollaborationInput
  ) => Promise<ScheduleItem>;
  readonly onComplete: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
  readonly onReopen: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
  readonly onCancel: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
}

export function ScheduleItemCollaborationPanel({
  item,
  members,
  currentUserId,
  canManage,
  onSetCollaboration,
  onComplete,
  onReopen,
  onCancel,
}: ScheduleItemCollaborationPanelProps) {
  const [editing, setEditing] = useState(false);
  const [responsibleUserId, setResponsibleUserId] = useState(
    item.responsibleUserId ?? ''
  );
  const [participantUserIds, setParticipantUserIds] = useState<string[]>(
    [...item.participantUserIds]
  );
  const [collaborationReason, setCollaborationReason] = useState('');
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const collaborationCommandRef = useRef<{
    fingerprint: string;
    id: string;
  } | null>(null);
  const lifecycleCommandRef = useRef<{
    fingerprint: string;
    id: string;
  } | null>(null);

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members]
  );

  const active =
    item.status === 'pending' ||
    item.status === 'in_progress' ||
    item.status === 'blocked';
  const terminal =
    item.status === 'completed' || item.status === 'cancelled';
  const manual = item.origin.type === 'manual';
  const canComplete =
    manual &&
    active &&
    (canManage ||
      (currentUserId !== null &&
        item.responsibleUserId === currentUserId));

  const visibleParticipants = item.participantUserIds.map((userId) =>
    memberLabel(memberById.get(userId))
  );

  const closeEditing = () => {
    setResponsibleUserId(item.responsibleUserId ?? '');
    setParticipantUserIds([...item.participantUserIds]);
    setCollaborationReason('');
    collaborationCommandRef.current = null;
    setErrorMessage(null);
    setEditing(false);
  };

  const collaborationCommandId = () => {
    const fingerprint = JSON.stringify({
      version: item.version,
      responsibleUserId: responsibleUserId || null,
      participantUserIds: [...participantUserIds].sort(),
      reason: collaborationReason.trim(),
    });
    if (
      !collaborationCommandRef.current ||
      collaborationCommandRef.current.fingerprint !== fingerprint
    ) {
      collaborationCommandRef.current = {
        fingerprint,
        id: secureCommandId(),
      };
    }
    return collaborationCommandRef.current.id;
  };

  const lifecycleCommandId = (nextAction: LifecycleAction) => {
    const fingerprint = JSON.stringify({
      version: item.version,
      action: nextAction,
      reason: actionReason.trim(),
    });
    if (
      !lifecycleCommandRef.current ||
      lifecycleCommandRef.current.fingerprint !== fingerprint
    ) {
      lifecycleCommandRef.current = {
        fingerprint,
        id: secureCommandId(),
      };
    }
    return lifecycleCommandRef.current.id;
  };

  const submitCollaboration = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onSetCollaboration(item.id, {
        responsibleUserId: responsibleUserId || null,
        participantUserIds,
        expectedVersion: item.version,
        idempotencyKey: collaborationCommandId(),
        reason: collaborationReason,
      });
      closeEditing();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a colaboração.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitLifecycle = async (event: FormEvent) => {
    event.preventDefault();
    if (!action) return;
    setSubmitting(true);
    setErrorMessage(null);

    const input: ScheduleTransitionInput = {
      expectedVersion: item.version,
      idempotencyKey: lifecycleCommandId(action),
      reason: actionReason,
    };

    try {
      if (action === 'complete') {
        await onComplete(item.id, input);
      } else if (action === 'reopen') {
        await onReopen(item.id, input);
      } else {
        await onCancel(item.id, input);
      }
      setAction(null);
      setActionReason('');
      lifecycleCommandRef.current = null;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível alterar a situação do registro.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectResponsible = (userId: string) => {
    setResponsibleUserId(userId);
    if (userId) {
      setParticipantUserIds((current) =>
        current.filter((participantId) => participantId !== userId)
      );
    }
  };

  const toggleParticipant = (userId: string) => {
    setParticipantUserIds((current) =>
      current.includes(userId)
        ? current.filter((participantId) => participantId !== userId)
        : [...current, userId]
    );
  };

  return (
    <div className="mt-4 border-t border-[#0B3D2E]/10 pt-4">
      <div className="grid min-w-0 gap-3 text-sm md:grid-cols-2">
        <div className="min-w-0">
          <p className="font-medium">Responsável</p>
          <p className="mt-1 break-words text-[#0B3D2E]/70">
            {item.responsibleUserId
              ? memberLabel(memberById.get(item.responsibleUserId))
              : 'Não definido'}
          </p>
        </div>
        <div className="min-w-0">
          <p className="font-medium">Participantes</p>
          <p className="mt-1 break-words text-[#0B3D2E]/70">
            {visibleParticipants.length > 0
              ? visibleParticipants.join(', ')
              : 'Nenhum participante'}
          </p>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className={SCHEDULE_THEME.surfaceSoft + ' mt-3 p-3 text-sm'}
        >
          {errorMessage}
        </div>
      )}

      {manual && (
        <div className="mt-4 flex flex-wrap gap-2">
          {canManage && active && (
            <button
              type="button"
              className={SCHEDULE_THEME.buttonSecondary}
              onClick={() => {
                setEditing((current) => !current);
                setAction(null);
                setErrorMessage(null);
              }}
              aria-expanded={editing}
            >
              <UserRoundCog className="h-4 w-4" aria-hidden="true" />
              Colaboração
            </button>
          )}

          {canComplete && (
            <button
              type="button"
              className={SCHEDULE_THEME.buttonPrimary}
              onClick={() => {
                setAction('complete');
                setEditing(false);
                setErrorMessage(null);
              }}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Concluir
            </button>
          )}

          {canManage && active && (
            <button
              type="button"
              className={SCHEDULE_THEME.buttonSecondary}
              onClick={() => {
                setAction('cancel');
                setEditing(false);
                setErrorMessage(null);
              }}
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Cancelar
            </button>
          )}

          {canManage && terminal && (
            <button
              type="button"
              className={SCHEDULE_THEME.buttonSecondary}
              onClick={() => {
                setAction('reopen');
                setEditing(false);
                setErrorMessage(null);
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reabrir
            </button>
          )}
        </div>
      )}

      {editing && canManage && active && manual && (
        <form
          onSubmit={submitCollaboration}
          className={SCHEDULE_THEME.surfaceSoft + ' mt-4 p-4'}
        >
          <h4 className="font-semibold">Responsável e participantes</h4>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            Somente integrantes ativos com acesso à Agenda podem ser
            selecionados.
          </p>

          <label className="mt-4 block space-y-1.5 text-sm font-medium">
            <span>Responsável</span>
            <select
              className={SCHEDULE_THEME.input}
              value={responsibleUserId}
              onChange={(event) => selectResponsible(event.target.value)}
            >
              <option value="">Sem responsável</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {memberLabel(member)}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Participantes</legend>
            {members.length === 0 ? (
              <p className="mt-2 text-sm text-[#0B3D2E]/70">
                Nenhum integrante elegível disponível.
              </p>
            ) : (
              <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2">
                {members
                  .filter((member) => member.userId !== responsibleUserId)
                  .map((member) => {
                    const checked = participantUserIds.includes(member.userId);
                    return (
                      <label
                        key={member.userId}
                        className="flex min-h-[44px] min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-[#0B3D2E]/20 bg-white px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-[#78C89A]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleParticipant(member.userId)}
                        />
                        <span className="min-w-0 break-words">
                          {memberLabel(member)}
                        </span>
                      </label>
                    );
                  })}
              </div>
            )}
          </fieldset>

          <label className="mt-4 block space-y-1.5 text-sm font-medium">
            <span>Motivo da alteração</span>
            <input
              required
              minLength={3}
              maxLength={500}
              className={SCHEDULE_THEME.input}
              value={collaborationReason}
              onChange={(event) =>
                setCollaborationReason(event.target.value)
              }
            />
          </label>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className={SCHEDULE_THEME.buttonSecondary}
              onClick={closeEditing}
              disabled={submitting}
            >
              Voltar
            </button>
            <button
              type="submit"
              className={SCHEDULE_THEME.buttonPrimary}
              disabled={
                submitting || collaborationReason.trim().length < 3
              }
            >
              {submitting ? 'Salvando...' : 'Salvar colaboração'}
            </button>
          </div>
        </form>
      )}

      {action && (
        <form
          onSubmit={submitLifecycle}
          className={SCHEDULE_THEME.surfaceSoft + ' mt-4 p-4'}
          aria-labelledby={`schedule-action-${item.id}`}
        >
          <h4
            id={`schedule-action-${item.id}`}
            className="font-semibold"
          >
            {action === 'complete'
              ? 'Confirmar conclusão'
              : action === 'cancel'
                ? 'Confirmar cancelamento'
                : 'Confirmar reabertura'}
          </h4>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            A alteração ficará registrada no histórico com ator, versão,
            horário e motivo.
          </p>
          <label className="mt-4 block space-y-1.5 text-sm font-medium">
            <span>Motivo</span>
            <input
              required
              minLength={3}
              maxLength={500}
              className={SCHEDULE_THEME.input}
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
            />
          </label>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className={SCHEDULE_THEME.buttonSecondary}
              onClick={() => {
                setAction(null);
                setActionReason('');
                lifecycleCommandRef.current = null;
                setErrorMessage(null);
              }}
              disabled={submitting}
            >
              Voltar
            </button>
            <button
              type="submit"
              className={SCHEDULE_THEME.buttonPrimary}
              disabled={submitting || actionReason.trim().length < 3}
            >
              {submitting ? 'Registrando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
