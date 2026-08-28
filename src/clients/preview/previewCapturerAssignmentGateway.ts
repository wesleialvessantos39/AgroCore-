/**
 * Implementação em Memória do Gateway de Vínculos Cliente-Captador
 * Ambiente de Preview / Desenvolvimento — AgroCore
 */

import {
  ClientCapturerAssignment,
  ClientCapturerAssignmentGateway,
  ClientCapturerError,
  CreateCapturerAssignmentInput,
  TransferCapturerAssignmentInput,
  TerminateCapturerAssignmentInput,
} from '../../types/clientCapturerAssignment';
import { createAppraisalDomainEvent } from '../../appraisals/domainEvents';
import { computeCanonicalSha256 } from '../../appraisals/cryptoHash';

interface CachedIdempotencyRecord {
  readonly commandHash: string;
  readonly result: ClientCapturerAssignment;
}

export class PreviewClientCapturerAssignmentGateway implements ClientCapturerAssignmentGateway {
  // Mapa de organização -> vínculos
  private readonly store = new Map<string, ClientCapturerAssignment[]>();
  private readonly idempotencyStore = new Map<string, CachedIdempotencyRecord>();

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `cca_${crypto.randomUUID()}`;
    }
    return `cca_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async listAssignmentsByClient(
    organizationId: string,
    clientId: string
  ): Promise<readonly ClientCapturerAssignment[]> {
    if (!organizationId || !clientId) return [];
    const orgItems = this.store.get(organizationId) || [];
    return Object.freeze(
      orgItems
        .filter((item) => item.clientId === clientId && item.organizationId === organizationId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
  }

  async getActiveAssignment(
    organizationId: string,
    clientId: string
  ): Promise<ClientCapturerAssignment | null> {
    if (!organizationId || !clientId) return null;
    const orgItems = this.store.get(organizationId) || [];
    const active = orgItems.find(
      (item) => item.clientId === clientId && item.organizationId === organizationId && item.status === 'active'
    );
    return active ? Object.freeze({ ...active }) : null;
  }

  async listClientsByCapturer(
    organizationId: string,
    capturerUserId: string
  ): Promise<readonly string[]> {
    if (!organizationId || !capturerUserId) return [];
    const orgItems = this.store.get(organizationId) || [];
    const clientIds = orgItems
      .filter((item) => item.capturerUserId === capturerUserId && item.organizationId === organizationId && item.status === 'active')
      .map((item) => item.clientId);
    return Object.freeze(Array.from(new Set(clientIds)));
  }

  async assignCapturer(
    organizationId: string,
    input: CreateCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment> {
    if (!organizationId || organizationId.trim() === '') {
      throw new Error('Identificador da organização é obrigatório para vínculo de captador.');
    }
    if (!input.clientId || input.clientId.trim() === '') {
      throw new Error('Identificador do cliente é obrigatório.');
    }
    if (!input.capturerUserId || input.capturerUserId.trim() === '') {
      throw new Error('Identificador do captador é obrigatório.');
    }

    // Idempotência estrita com validação do hash completo do comando
    const commandPayload = {
      clientId: input.clientId,
      capturerUserId: input.capturerUserId,
      assignedByUserId: input.assignedByUserId,
      isPrimary: input.isPrimary,
    };
    const commandHash = computeCanonicalSha256(commandPayload);

    if (input.idempotencyKey) {
      const cacheKey = `${organizationId}:assign:${input.idempotencyKey}`;
      const existing = this.idempotencyStore.get(cacheKey);
      if (existing) {
        if (existing.commandHash !== commandHash) {
          throw new ClientCapturerError('IDEMPOTENCY_CONFLICT', 'Chave de idempotência reutilizada com parâmetros divergentes.');
        }
        return Object.freeze({ ...existing.result });
      }
    }

    const orgItems = this.store.get(organizationId) || [];
    const now = new Date().toISOString();

    // Encerra qualquer vínculo ativo anterior para este cliente preservando histórico
    const updatedItems = orgItems.map((item) => {
      if (item.clientId === input.clientId && item.status === 'active') {
        return {
          ...item,
          status: 'terminated' as const,
          endedAt: now,
          updatedAt: now,
          transferReason: 'Substituição por nova atribuição direta de captador.',
        };
      }
      return item;
    });

    const newAssignment: ClientCapturerAssignment = Object.freeze({
      id: this.generateId(),
      organizationId,
      clientId: input.clientId,
      capturerUserId: input.capturerUserId,
      status: 'active',
      isPrimary: input.isPrimary !== false,
      startedAt: now,
      assignedByUserId: input.assignedByUserId,
      createdAt: now,
      updatedAt: now,
    });

    updatedItems.push(newAssignment);
    this.store.set(organizationId, updatedItems);

    if (input.idempotencyKey) {
      const cacheKey = `${organizationId}:assign:${input.idempotencyKey}`;
      this.idempotencyStore.set(cacheKey, { commandHash, result: newAssignment });
    }

    createAppraisalDomainEvent({
      organizationId,
      eventType: 'client_capturer_assigned',
      entityType: 'client_capturer_assignment',
      entityId: newAssignment.id,
      relatedEntityId: input.clientId,
      actorUserId: input.assignedByUserId,
      payload: {
        clientId: input.clientId,
        capturerUserId: input.capturerUserId,
        isPrimary: newAssignment.isPrimary,
      },
    });

    return newAssignment;
  }

  async transferCapturer(
    organizationId: string,
    input: TransferCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment> {
    if (!organizationId || organizationId.trim() === '') {
      throw new Error('Organização obrigatória para transferência de captador.');
    }
    if (!input.clientId || input.clientId.trim() === '') {
      throw new Error('Cliente obrigatório.');
    }
    if (!input.newCapturerUserId || input.newCapturerUserId.trim() === '') {
      throw new Error('Novo captador responsável é obrigatório.');
    }
    if (!input.transferReason || input.transferReason.trim() === '') {
      throw new Error('Motivo da transferência é obrigatório.');
    }

    const commandPayload = {
      clientId: input.clientId,
      newCapturerUserId: input.newCapturerUserId,
      assignedByUserId: input.assignedByUserId,
      transferReason: input.transferReason,
    };
    const commandHash = computeCanonicalSha256(commandPayload);

    if (input.idempotencyKey) {
      const cacheKey = `${organizationId}:transfer:${input.idempotencyKey}`;
      const existing = this.idempotencyStore.get(cacheKey);
      if (existing) {
        if (existing.commandHash !== commandHash) {
          throw new ClientCapturerError('IDEMPOTENCY_CONFLICT', 'Chave de idempotência reutilizada com parâmetros divergentes.');
        }
        return Object.freeze({ ...existing.result });
      }
    }

    const orgItems = this.store.get(organizationId) || [];
    const now = new Date().toISOString();

    let previousCapturerUserId: string | undefined;

    const updatedItems = orgItems.map((item) => {
      if (item.clientId === input.clientId && item.status === 'active') {
        previousCapturerUserId = item.capturerUserId;
        return {
          ...item,
          status: 'terminated' as const,
          endedAt: now,
          updatedAt: now,
          transferReason: input.transferReason,
        };
      }
      return item;
    });

    const newAssignment: ClientCapturerAssignment = Object.freeze({
      id: this.generateId(),
      organizationId,
      clientId: input.clientId,
      capturerUserId: input.newCapturerUserId,
      status: 'active',
      isPrimary: true,
      startedAt: now,
      assignedByUserId: input.assignedByUserId,
      transferReason: input.transferReason,
      createdAt: now,
      updatedAt: now,
    });

    updatedItems.push(newAssignment);
    this.store.set(organizationId, updatedItems);

    if (input.idempotencyKey) {
      const cacheKey = `${organizationId}:transfer:${input.idempotencyKey}`;
      this.idempotencyStore.set(cacheKey, { commandHash, result: newAssignment });
    }

    createAppraisalDomainEvent({
      organizationId,
      eventType: 'client_capturer_transferred',
      entityType: 'client_capturer_assignment',
      entityId: newAssignment.id,
      relatedEntityId: input.clientId,
      actorUserId: input.assignedByUserId,
      payload: {
        clientId: input.clientId,
        previousCapturerUserId,
        newCapturerUserId: input.newCapturerUserId,
        transferReason: input.transferReason,
      },
    });

    return newAssignment;
  }

  async terminateAssignment(
    organizationId: string,
    input: TerminateCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment> {
    if (!organizationId || !input.clientId || !input.assignmentId) {
      throw new Error('Parâmetros inválidos para encerramento de vínculo de captador.');
    }
    if (!input.reason || input.reason.trim() === '') {
      throw new Error('Motivo do encerramento é obrigatório.');
    }

    const orgItems = this.store.get(organizationId) || [];
    const targetIndex = orgItems.findIndex(
      (item) => item.id === input.assignmentId && item.organizationId === organizationId && item.clientId === input.clientId
    );

    if (targetIndex === -1) {
      throw new Error(`Vínculo ${input.assignmentId} não localizado para o cliente na organização.`);
    }

    const target = orgItems[targetIndex];
    if (target.status === 'terminated') {
      return Object.freeze({ ...target });
    }

    const now = new Date().toISOString();
    const terminated: ClientCapturerAssignment = Object.freeze({
      ...target,
      status: 'terminated',
      endedAt: now,
      updatedAt: now,
      transferReason: input.reason,
    });

    const updatedItems = [...orgItems];
    updatedItems[targetIndex] = terminated;
    this.store.set(organizationId, updatedItems);

    createAppraisalDomainEvent({
      organizationId,
      eventType: 'client_capturer_terminated',
      entityType: 'client_capturer_assignment',
      entityId: terminated.id,
      relatedEntityId: input.clientId,
      actorUserId: input.terminatedByUserId,
      payload: {
        clientId: input.clientId,
        capturerUserId: terminated.capturerUserId,
        reason: terminated.transferReason,
      },
    });

    return terminated;
  }

  clearAllSessionData(): void {
    this.store.clear();
    this.idempotencyStore.clear();
  }
}
