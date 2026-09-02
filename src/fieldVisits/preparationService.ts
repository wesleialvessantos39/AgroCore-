import {
  TechnicalVisitDomainError,
  TechnicalVisitScheduleConflictError,
  type SetTechnicalVisitChecklistItemCompletionInput,
  type TechnicalVisit,
  type TechnicalVisitAddress,
  type TechnicalVisitApplicationContext,
  type TechnicalVisitConflictOverride,
  type TechnicalVisitAuditEntry,
  type TechnicalVisitGateway,
  type TechnicalVisitPreparation,
  type TechnicalVisitPreparationChecklistInput,
  type TechnicalVisitPreparationChecklistItem,
  type TechnicalVisitScheduleConflict,
  type TechnicalVisitScheduleConflictReason,
  type TechnicalVisitVehicleReference,
  type UpdateTechnicalVisitPreparationInput,
} from '../types/technicalVisit';
import type {
  TechnicalVisitClock,
  TechnicalVisitIdGenerator,
} from './technicalVisitService';
import {
  addMinutesToIso,
  intervalsOverlap,
  isValidIanaTimeZone,
  zonedLocalDateTimeToUtc,
} from './schedule';

const defaultClock: TechnicalVisitClock = { now: () => new Date() };
const defaultIds: TechnicalVisitIdGenerator = {
  generate: () => {
    if (!globalThis.crypto?.randomUUID) {
      throw new TechnicalVisitDomainError(
        'SERVICE_UNAVAILABLE',
        'Gerador seguro de identificadores indisponível.'
      );
    }
    return globalThis.crypto.randomUUID();
  },
};

export class TechnicalVisitPreparationService {
  constructor(
    private readonly gateway: TechnicalVisitGateway,
    private readonly clock: TechnicalVisitClock = defaultClock,
    private readonly idGenerator: TechnicalVisitIdGenerator = defaultIds
  ) {}

  async prepareVisit(
    context: TechnicalVisitApplicationContext,
    visitId: string,
    input: UpdateTechnicalVisitPreparationInput
  ): Promise<TechnicalVisit> {
    this.assertContext(context);
    this.assertPermission(context);
    const current = await this.requireEditableVisit(context, visitId, input.expectedVersion);
    const changeReason = this.requireReason(input.changeReason);

    const scheduledFor = zonedLocalDateTimeToUtc(input.localStart, input.timeZone);
    const preparation = await this.normalizePreparation(context, current, input);
    const candidate: TechnicalVisit = {
      ...current,
      scheduledFor,
      preparation,
    };

    const conflicts = await this.detectConflicts(context, candidate);
    let conflictOverride: TechnicalVisitConflictOverride | null = null;
    if (conflicts.length > 0) {
      const overrideReason = input.conflictOverrideReason?.trim() ?? '';
      if (overrideReason.length < 5 || overrideReason.length > 500) {
        throw new TechnicalVisitScheduleConflictError(conflicts);
      }
      conflictOverride = {
        reason: overrideReason,
        authorizedByUserId: context.actor.userId,
        authorizedAt: this.clock.now().toISOString(),
        conflictVisitIds: conflicts.map((conflict) => conflict.visitId),
      };
    }

    const now = this.clock.now().toISOString();
    const nextPreparation: TechnicalVisitPreparation = {
      ...preparation,
      conflictOverride,
      preparedByUserId: context.actor.userId,
      preparedAt: now,
    };
    const next: TechnicalVisit = {
      ...current,
      scheduledFor,
      preparation: nextPreparation,
      updatedByUserId: context.actor.userId,
      updatedAt: now,
      version: current.version + 1,
    };

    const changedFields = this.changedFields(current, next);
    if (changedFields.length === 0) return current;

    const audit = this.buildAudit(context, next, changeReason, changedFields);
    return this.gateway.updateVisit({
      visit: next,
      audit,
      expectedVersion: input.expectedVersion,
    });
  }

  async setChecklistItemCompletion(
    context: TechnicalVisitApplicationContext,
    visitId: string,
    input: SetTechnicalVisitChecklistItemCompletionInput
  ): Promise<TechnicalVisit> {
    this.assertContext(context);
    this.assertPermission(context);
    const current = await this.requireEditableVisit(context, visitId, input.expectedVersion);
    if (!current.preparation) {
      throw new TechnicalVisitDomainError(
        'CHECKLIST_ITEM_NOT_FOUND',
        'A visita ainda não possui checklist de preparação.'
      );
    }

    const index = current.preparation.checklist.findIndex((item) => item.id === input.itemId);
    if (index < 0) {
      throw new TechnicalVisitDomainError(
        'CHECKLIST_ITEM_NOT_FOUND',
        'Item do checklist não encontrado.'
      );
    }

    const item = current.preparation.checklist[index];
    if (item.completed === input.completed) return current;

    const now = this.clock.now().toISOString();
    const checklist = current.preparation.checklist.map((entry, entryIndex) =>
      entryIndex === index
        ? {
            ...entry,
            completed: input.completed,
            completedByUserId: input.completed ? context.actor.userId : null,
            completedAt: input.completed ? now : null,
          }
        : entry
    );

    const next: TechnicalVisit = {
      ...current,
      preparation: {
        ...current.preparation,
        checklist,
        preparedByUserId: context.actor.userId,
        preparedAt: now,
      },
      updatedByUserId: context.actor.userId,
      updatedAt: now,
      version: current.version + 1,
    };

    const audit = this.buildAudit(
      context,
      next,
      input.completed ? 'Item de preparação concluído' : 'Item de preparação reaberto',
      ['preparation.checklist']
    );

    return this.gateway.updateVisit({
      visit: next,
      audit,
      expectedVersion: input.expectedVersion,
    });
  }

  private async normalizePreparation(
    context: TechnicalVisitApplicationContext,
    current: TechnicalVisit,
    input: UpdateTechnicalVisitPreparationInput
  ): Promise<TechnicalVisitPreparation> {
    const timeZone = input.timeZone.trim();
    if (!isValidIanaTimeZone(timeZone)) {
      throw new TechnicalVisitDomainError(
        'INVALID_TIME_ZONE',
        'Informe um fuso horário IANA válido.'
      );
    }

    if (
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes < 15 ||
      input.durationMinutes > 1440
    ) {
      throw new TechnicalVisitDomainError(
        'INVALID_DURATION',
        'A duração deve estar entre 15 minutos e 24 horas.'
      );
    }

    const address = this.normalizeAddress(input.address);
    const participantUserIds = await this.normalizeParticipants(
      context,
      current.responsibleUserId,
      input.participantUserIds
    );
    const checklist = this.normalizeChecklist(
      current.preparation?.checklist ?? [],
      input.checklist
    );
    const vehicleReference = this.normalizeVehicle(input.vehicleReference ?? null);
    const routeNotes = this.normalizeRoute(input.routeNotes ?? null);

    return {
      timeZone,
      durationMinutes: input.durationMinutes,
      address,
      participantUserIds,
      checklist,
      vehicleReference,
      routeNotes,
      conflictOverride: null,
      preparedByUserId: context.actor.userId,
      preparedAt: this.clock.now().toISOString(),
    };
  }

  private normalizeAddress(address: TechnicalVisitAddress): TechnicalVisitAddress {
    const addressLine = address.addressLine.trim();
    const city = address.city.trim();
    const state = address.state.trim();
    const postalCode = address.postalCode?.trim() || null;
    const notes = address.notes?.trim() || null;

    if (
      addressLine.length < 3 ||
      addressLine.length > 240 ||
      city.length < 2 ||
      city.length > 120 ||
      state.length < 2 ||
      state.length > 60 ||
      (postalCode !== null && postalCode.length > 20) ||
      (notes !== null && notes.length > 500)
    ) {
      throw new TechnicalVisitDomainError(
        'INVALID_ADDRESS',
        'Revise o endereço da visita e os limites dos campos informados.'
      );
    }

    return { addressLine, city, state, postalCode, notes };
  }

  private async normalizeParticipants(
    context: TechnicalVisitApplicationContext,
    responsibleUserId: string,
    participantUserIds: readonly string[]
  ): Promise<readonly string[]> {
    if (participantUserIds.length > 30) {
      throw new TechnicalVisitDomainError(
        'INVALID_PARTICIPANT',
        'A visita não pode possuir mais de 30 participantes.'
      );
    }

    const normalized = Array.from(
      new Set(
        participantUserIds
          .map((userId) => userId.trim())
          .filter((userId) => userId && userId !== responsibleUserId)
      )
    );

    for (const userId of normalized) {
      const member = await context.resolveMember(userId);
      if (
        !member.exists ||
        member.organizationId !== context.organizationId ||
        !member.isActive
      ) {
        throw new TechnicalVisitDomainError(
          'INVALID_PARTICIPANT',
          'Todos os participantes devem ser integrantes ativos da organização.'
        );
      }
    }
    return normalized;
  }

  private normalizeChecklist(
    current: readonly TechnicalVisitPreparationChecklistItem[],
    input: readonly TechnicalVisitPreparationChecklistInput[]
  ): readonly TechnicalVisitPreparationChecklistItem[] {
    if (input.length > 50) {
      throw new TechnicalVisitDomainError(
        'INVALID_CHECKLIST',
        'O checklist de preparação não pode possuir mais de 50 itens.'
      );
    }

    const existing = new Map(current.map((item) => [item.id, item]));
    const labels = new Set<string>();
    return input.map((entry) => {
      const label = entry.label.trim();
      if (label.length < 2 || label.length > 160) {
        throw new TechnicalVisitDomainError(
          'INVALID_CHECKLIST',
          'Cada item do checklist deve possuir entre 2 e 160 caracteres.'
        );
      }
      const normalizedLabel = label.toLocaleLowerCase('pt-BR');
      if (labels.has(normalizedLabel)) {
        throw new TechnicalVisitDomainError(
          'INVALID_CHECKLIST',
          'O checklist não pode possuir itens duplicados.'
        );
      }
      labels.add(normalizedLabel);

      const previous = entry.id ? existing.get(entry.id) : undefined;
      if (entry.id && !previous) {
        throw new TechnicalVisitDomainError(
          'INVALID_CHECKLIST',
          'Um item informado não pertence ao checklist atual desta visita.'
        );
      }

      return {
        id: previous?.id ?? this.idGenerator.generate(),
        label,
        required: Boolean(entry.required),
        completed: previous?.completed ?? false,
        completedByUserId: previous?.completedByUserId ?? null,
        completedAt: previous?.completedAt ?? null,
      };
    });
  }

  private normalizeVehicle(
    vehicle: TechnicalVisitVehicleReference | null
  ): TechnicalVisitVehicleReference | null {
    if (!vehicle) return null;
    const referenceId = vehicle.referenceId.trim();
    const label = vehicle.label.trim();
    if (
      referenceId.length < 1 ||
      referenceId.length > 120 ||
      label.length < 2 ||
      label.length > 120
    ) {
      throw new TechnicalVisitDomainError(
        'INVALID_VEHICLE_REFERENCE',
        'Revise a referência e a identificação do veículo previsto.'
      );
    }
    return { referenceId, label };
  }

  private normalizeRoute(routeNotes: string | null): string | null {
    const normalized = routeNotes?.trim() || null;
    if (normalized && normalized.length > 1200) {
      throw new TechnicalVisitDomainError(
        'INVALID_ROUTE',
        'O roteiro deve possuir no máximo 1.200 caracteres.'
      );
    }
    return normalized;
  }

  private async detectConflicts(
    context: TechnicalVisitApplicationContext,
    candidate: TechnicalVisit
  ): Promise<readonly TechnicalVisitScheduleConflict[]> {
    const candidateDuration = candidate.preparation?.durationMinutes ?? 60;
    const candidateEnd = addMinutesToIso(candidate.scheduledFor, candidateDuration);
    const candidateUsers = new Set([
      candidate.responsibleUserId,
      ...(candidate.preparation?.participantUserIds ?? []),
    ]);
    const candidateVehicle = candidate.preparation?.vehicleReference?.referenceId ?? null;

    const visits = await this.gateway.listVisits(context.organizationId, { status: 'all' });
    const conflicts: TechnicalVisitScheduleConflict[] = [];

    for (const other of visits) {
      if (
        other.id === candidate.id ||
        other.status === 'cancelled' ||
        other.status === 'completed'
      ) {
        continue;
      }

      const otherDuration = other.preparation?.durationMinutes ?? 60;
      const otherEnd = addMinutesToIso(other.scheduledFor, otherDuration);
      if (
        !intervalsOverlap(
          candidate.scheduledFor,
          candidateEnd,
          other.scheduledFor,
          otherEnd
        )
      ) {
        continue;
      }

      const otherUsers = new Set([
        other.responsibleUserId,
        ...(other.preparation?.participantUserIds ?? []),
      ]);
      const sharedUserIds = Array.from(candidateUsers).filter((userId) =>
        otherUsers.has(userId)
      );
      const reasons: TechnicalVisitScheduleConflictReason[] = [];

      if (candidate.responsibleUserId === other.responsibleUserId) {
        reasons.push('responsible');
      }
      if (
        sharedUserIds.some(
          (userId) =>
            userId !== candidate.responsibleUserId ||
            userId !== other.responsibleUserId
        )
      ) {
        reasons.push('participant');
      }
      const otherVehicle = other.preparation?.vehicleReference?.referenceId ?? null;
      if (candidateVehicle && otherVehicle && candidateVehicle === otherVehicle) {
        reasons.push('vehicle');
      }

      if (reasons.length > 0) {
        conflicts.push({
          visitId: other.id,
          scheduledFor: other.scheduledFor,
          endsAt: otherEnd,
          reasons,
          sharedUserIds,
        });
      }
    }

    return conflicts.sort(
      (left, right) =>
        left.scheduledFor.localeCompare(right.scheduledFor) ||
        left.visitId.localeCompare(right.visitId)
    );
  }

  private async requireEditableVisit(
    context: TechnicalVisitApplicationContext,
    visitId: string,
    expectedVersion: number
  ): Promise<TechnicalVisit> {
    const visit = await this.gateway.getVisitById(context.organizationId, visitId);
    if (!visit) {
      throw new TechnicalVisitDomainError('VISIT_NOT_FOUND', 'Visita não encontrada.');
    }
    if (visit.version !== expectedVersion) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'A visita foi alterada por outra operação. Recarregue os dados antes de continuar.'
      );
    }
    if (visit.status !== 'planned' && visit.status !== 'confirmed') {
      throw new TechnicalVisitDomainError(
        'PREPARATION_LOCKED',
        'A preparação só pode ser alterada antes do início da execução.'
      );
    }
    return visit;
  }

  private assertContext(context: TechnicalVisitApplicationContext): void {
    if (!context.organizationId || !context.actor.userId || !context.actor.isActive) {
      throw new TechnicalVisitDomainError(
        'ORGANIZATION_REQUIRED',
        'É necessário possuir vínculo ativo com uma organização.'
      );
    }
  }

  private assertPermission(context: TechnicalVisitApplicationContext): void {
    if (!context.actor.permissions.includes('surveys_and_visits:schedule')) {
      throw new TechnicalVisitDomainError(
        'PERMISSION_DENIED',
        'Você não possui permissão para preparar esta visita.'
      );
    }
  }

  private requireReason(reason: string): string {
    const normalized = reason.trim();
    if (normalized.length < 3 || normalized.length > 500) {
      throw new TechnicalVisitDomainError(
        'REASON_REQUIRED',
        'Informe um motivo com pelo menos 3 caracteres.'
      );
    }
    return normalized;
  }

  private changedFields(current: TechnicalVisit, next: TechnicalVisit): string[] {
    const changed: string[] = [];
    if (current.scheduledFor !== next.scheduledFor) changed.push('scheduledFor');
    if (
      JSON.stringify(current.preparation) !== JSON.stringify(next.preparation)
    ) {
      changed.push('preparation');
    }
    return changed;
  }

  private buildAudit(
    context: TechnicalVisitApplicationContext,
    visit: TechnicalVisit,
    reason: string,
    changedFields: readonly string[]
  ): TechnicalVisitAuditEntry {
    return {
      id: this.idGenerator.generate(),
      organizationId: context.organizationId,
      visitId: visit.id,
      action: 'updated',
      actorUserId: context.actor.userId,
      at: visit.updatedAt,
      version: visit.version,
      fromStatus: visit.status,
      toStatus: visit.status,
      reason,
      changedFields: [...changedFields],
    };
  }
}
