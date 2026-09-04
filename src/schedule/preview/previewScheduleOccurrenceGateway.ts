import {
  ScheduleDomainError,
  type ScheduleGateway,
  type ScheduleOccurrence,
  type ScheduleOccurrenceAuditEntry,
  type ScheduleOccurrenceGateway,
  type ScheduleOccurrenceTransitionGatewayInput,
} from '../../types/schedule';
import { buildScheduleOccurrenceDrafts } from '../recurrence';

interface PreviewReceipt {
  readonly commandType: 'complete' | 'reopen' | 'cancel';
  readonly occurrenceId: string;
  readonly fingerprint: string;
  readonly result: ScheduleOccurrence;
}

function cloneOccurrence(value: ScheduleOccurrence): ScheduleOccurrence {
  return { ...value };
}

function cloneAudit(value: ScheduleOccurrenceAuditEntry): ScheduleOccurrenceAuditEntry {
  return { ...value };
}

function fingerprint(value: object): string {
  return JSON.stringify(value);
}

function occurrenceLocalDate(scheduledAt: string, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(new Date(scheduledAt))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export class PreviewScheduleOccurrenceGateway
  implements ScheduleOccurrenceGateway
{
  private readonly occurrences = new Map<string, ScheduleOccurrence>();
  private readonly occurrenceKeyToId = new Map<string, string>();
  private readonly occurrenceDateById = new Map<string, string>();
  private readonly audits = new Map<string, ScheduleOccurrenceAuditEntry[]>();
  private readonly receipts = new Map<string, PreviewReceipt>();

  constructor(private readonly scheduleGateway: ScheduleGateway) {}

  private occurrenceKey(
    organizationId: string,
    scheduleItemId: string,
    localDate: string
  ): string {
    return `${organizationId}:${scheduleItemId}:${localDate}`;
  }

  async materializeOccurrences(
    organizationId: string,
    scheduleItemId: string,
    from: string,
    to: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleOccurrence[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada.', 'AbortError');
    }
    const item = await this.scheduleGateway.getItemById(
      organizationId,
      scheduleItemId,
      signal
    );
    if (!item) {
      throw new ScheduleDomainError(
        'ITEM_NOT_FOUND',
        'Registro de agenda não encontrado.'
      );
    }

    const drafts = buildScheduleOccurrenceDrafts(item, { from, to });
    const activeKeys = new Set<string>();

    for (const draft of drafts) {
      const localDate = occurrenceLocalDate(draft.scheduledAt, item.timeZone);
      const key = this.occurrenceKey(
        organizationId,
        scheduleItemId,
        localDate
      );
      activeKeys.add(key);
      const existingId = this.occurrenceKeyToId.get(key);
      const existing = existingId ? this.occurrences.get(existingId) : undefined;
      if (existing) {
        if (
          existing.status === 'pending' &&
          (existing.sourceItemVersion < item.version ||
            existing.scheduledAt !== draft.scheduledAt ||
            existing.endsAt !== draft.endsAt)
        ) {
          this.occurrences.set(existing.id, {
            ...existing,
            sourceItemVersion: item.version,
            scheduledAt: draft.scheduledAt,
            endsAt: draft.endsAt,
            updatedAt: new Date().toISOString(),
            version: existing.version + 1,
          });
        }
        continue;
      }

      const now = new Date().toISOString();
      const id = globalThis.crypto?.randomUUID?.() ??
        `occurrence-${this.occurrences.size + 1}`;
      const occurrence: ScheduleOccurrence = {
        id,
        organizationId,
        scheduleItemId,
        sourceItemVersion: item.version,
        scheduledAt: draft.scheduledAt,
        endsAt: draft.endsAt,
        status: 'pending',
        completedAt: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      this.occurrences.set(id, occurrence);
      this.occurrenceKeyToId.set(key, id);
      this.occurrenceDateById.set(id, localDate);
    }

    for (const occurrence of Array.from(this.occurrences.values())) {
      if (
        occurrence.organizationId === organizationId &&
        occurrence.scheduleItemId === scheduleItemId &&
        occurrence.status === 'pending' &&
        occurrence.sourceItemVersion < item.version &&
        occurrence.scheduledAt >= from &&
        occurrence.scheduledAt < to
      ) {
        const localDate =
          this.occurrenceDateById.get(occurrence.id) ??
          occurrenceLocalDate(occurrence.scheduledAt, item.timeZone);
        const key = this.occurrenceKey(
          organizationId,
          scheduleItemId,
          localDate
        );
        if (!activeKeys.has(key)) {
          this.occurrences.delete(occurrence.id);
          this.occurrenceKeyToId.delete(key);
          this.occurrenceDateById.delete(occurrence.id);
        }
      }
    }

    return Array.from(this.occurrences.values())
      .filter(
        (occurrence) =>
          occurrence.organizationId === organizationId &&
          occurrence.scheduleItemId === scheduleItemId &&
          occurrence.scheduledAt >= from &&
          occurrence.scheduledAt < to
      )
      .sort(
        (left, right) =>
          left.scheduledAt.localeCompare(right.scheduledAt) ||
          left.id.localeCompare(right.id)
      )
      .map(cloneOccurrence);
  }

  private async transition(
    commandType: 'complete' | 'reopen' | 'cancel',
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    const commandKey = `${input.organizationId}:${input.idempotencyKey}`;
    const requestFingerprint = fingerprint({
      occurrenceId: input.occurrenceId,
      expectedVersion: input.expectedVersion,
      commandType,
      reason: input.reason.trim(),
    });
    const receipt = this.receipts.get(commandKey);
    if (receipt) {
      if (
        receipt.commandType !== commandType ||
        receipt.occurrenceId !== input.occurrenceId ||
        receipt.fingerprint !== requestFingerprint
      ) {
        throw new ScheduleDomainError(
          'IDEMPOTENCY_CONFLICT',
          'A operação já foi utilizada com conteúdo diferente.'
        );
      }
      return cloneOccurrence(receipt.result);
    }

    const current = this.occurrences.get(input.occurrenceId);
    if (!current || current.organizationId !== input.organizationId) {
      throw new ScheduleDomainError(
        'OCCURRENCE_NOT_FOUND',
        'Ocorrência de agenda não encontrada.'
      );
    }
    if (current.version !== input.expectedVersion) {
      throw new ScheduleDomainError(
        'CONCURRENCY_CONFLICT',
        'A ocorrência foi alterada por outra operação.'
      );
    }
    const parent = await this.scheduleGateway.getItemById(
      input.organizationId,
      current.scheduleItemId
    );
    if (!parent) {
      throw new ScheduleDomainError(
        'ITEM_NOT_FOUND',
        'Registro de agenda não encontrado.'
      );
    }

    if (
      commandType === 'complete' &&
      !input.actorCanManage &&
      parent.responsibleUserId !== input.actorUserId
    ) {
      throw new ScheduleDomainError(
        'RESPONSIBLE_MISMATCH',
        'Somente o responsável atual ou a gestão pode concluir esta ocorrência.'
      );
    }
    if (
      (commandType === 'cancel' || commandType === 'reopen') &&
      !input.actorCanManage
    ) {
      throw new ScheduleDomainError(
        'PERMISSION_DENIED',
        'Somente a gestão pode realizar esta mudança.'
      );
    }
    if (
      (commandType === 'complete' || commandType === 'cancel') &&
      current.status !== 'pending'
    ) {
      throw new ScheduleDomainError(
        'INVALID_TRANSITION',
        'A ocorrência já está encerrada.'
      );
    }
    if (
      commandType === 'reopen' &&
      !['completed', 'cancelled'].includes(current.status)
    ) {
      throw new ScheduleDomainError(
        'INVALID_TRANSITION',
        'Somente uma ocorrência encerrada pode ser reaberta.'
      );
    }

    const now = new Date().toISOString();
    const status =
      commandType === 'complete'
        ? 'completed'
        : commandType === 'cancel'
          ? 'cancelled'
          : 'pending';
    const next: ScheduleOccurrence = {
      ...current,
      status,
      completedAt: status === 'completed' ? now : null,
      cancelledAt: status === 'cancelled' ? now : null,
      updatedAt: now,
      version: current.version + 1,
    };
    this.occurrences.set(next.id, next);
    this.receipts.set(commandKey, {
      commandType,
      occurrenceId: next.id,
      fingerprint: requestFingerprint,
      result: cloneOccurrence(next),
    });

    const audit: ScheduleOccurrenceAuditEntry = {
      id: `occurrence-audit-${next.id}-${next.version}`,
      organizationId: next.organizationId,
      occurrenceId: next.id,
      action:
        commandType === 'complete'
          ? 'completed'
          : commandType === 'cancel'
            ? 'cancelled'
            : 'reopened',
      actorUserId: input.actorUserId,
      occurredAt: now,
      occurrenceVersion: next.version,
      reason: input.reason.trim(),
    };
    this.audits.set(next.id, [
      ...(this.audits.get(next.id) ?? []),
      audit,
    ]);
    return cloneOccurrence(next);
  }

  completeOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return this.transition('complete', input);
  }

  reopenOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return this.transition('reopen', input);
  }

  cancelOccurrence(
    input: ScheduleOccurrenceTransitionGatewayInput
  ): Promise<ScheduleOccurrence> {
    return this.transition('cancel', input);
  }

  async listOccurrenceAudit(
    organizationId: string,
    occurrenceId: string,
    signal?: AbortSignal
  ): Promise<readonly ScheduleOccurrenceAuditEntry[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada.', 'AbortError');
    }
    const occurrence = this.occurrences.get(occurrenceId);
    if (!occurrence || occurrence.organizationId !== organizationId) return [];
    return (this.audits.get(occurrenceId) ?? []).map(cloneAudit);
  }

  clearAllSessionData(): void {
    this.occurrences.clear();
    this.occurrenceKeyToId.clear();
    this.occurrenceDateById.clear();
    this.audits.clear();
    this.receipts.clear();
  }
}
