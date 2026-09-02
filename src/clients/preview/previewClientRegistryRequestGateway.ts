import type {
  ClientRegistryRequest,
  ClientRegistryRequestGateway,
  CreateClientRegistryRequestInput,
} from '../../types/clientRegistryRequest';

function clone(value: ClientRegistryRequest): ClientRegistryRequest {
  return { ...value };
}

function secureId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Gerador seguro de identificadores indisponível.');
  }
  return globalThis.crypto.randomUUID();
}

export class PreviewClientRegistryRequestGateway
  implements ClientRegistryRequestGateway
{
  private readonly requests = new Map<string, ClientRegistryRequest>();

  async listAssigned(
    organizationId: string,
    capturerUserId: string,
    signal?: AbortSignal
  ): Promise<readonly ClientRegistryRequest[]> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    return [...this.requests.values()]
      .filter(
        (item) =>
          item.organizationId === organizationId &&
          item.assignedCapturerUserId === capturerUserId &&
          item.status !== 'cancelled' &&
          item.status !== 'fulfilled'
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  async listRequestedBy(
    organizationId: string,
    requesterUserId: string,
    signal?: AbortSignal
  ): Promise<readonly ClientRegistryRequest[]> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    return [...this.requests.values()]
      .filter(
        (item) =>
          item.organizationId === organizationId &&
          item.requestedByUserId === requesterUserId
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  async create(
    input: CreateClientRegistryRequestInput
  ): Promise<ClientRegistryRequest> {
    const existing = [...this.requests.values()].find(
      (item) =>
        item.organizationId === input.organizationId &&
        item.clientId === input.clientId &&
        item.propertyId === input.propertyId &&
        item.sourceType === input.sourceType &&
        item.sourceId === input.sourceId &&
        item.scope === input.scope &&
        (item.status === 'open' || item.status === 'in_progress')
    );
    if (existing) return clone(existing);

    const now = new Date().toISOString();
    const created: ClientRegistryRequest = {
      id: secureId(),
      organizationId: input.organizationId,
      clientId: input.clientId,
      propertyId: input.propertyId,
      assignedCapturerUserId: 'preview-capturer',
      requestedByUserId: input.requestedByUserId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      scope: input.scope,
      status: 'open',
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    this.requests.set(created.id, created);
    return clone(created);
  }

  async start(
    organizationId: string,
    requestId: string
  ): Promise<ClientRegistryRequest> {
    const current = this.requests.get(requestId);
    if (!current || current.organizationId !== organizationId) {
      throw new Error('Solicitação cadastral não encontrada.');
    }
    if (current.status === 'fulfilled') return clone(current);
    const updated = {
      ...current,
      status: 'in_progress' as const,
      updatedAt: new Date().toISOString(),
    };
    this.requests.set(updated.id, updated);
    return clone(updated);
  }

  async attachProperty(
    organizationId: string,
    requestId: string,
    propertyId: string
  ): Promise<ClientRegistryRequest> {
    const current = this.requests.get(requestId);
    if (!current || current.organizationId !== organizationId) {
      throw new Error('Solicitação cadastral não encontrada.');
    }
    const updated = {
      ...current,
      propertyId,
      status: 'in_progress' as const,
      updatedAt: new Date().toISOString(),
    };
    this.requests.set(updated.id, updated);
    return clone(updated);
  }

  async fulfill(
    organizationId: string,
    requestId: string
  ): Promise<ClientRegistryRequest> {
    const current = this.requests.get(requestId);
    if (!current || current.organizationId !== organizationId) {
      throw new Error('Solicitação cadastral não encontrada.');
    }
    const now = new Date().toISOString();
    const updated = {
      ...current,
      status: 'fulfilled' as const,
      fulfilledAt: now,
      updatedAt: now,
    };
    this.requests.set(updated.id, updated);
    return clone(updated);
  }

  clearAllSessionData(): void {
    this.requests.clear();
  }
}
