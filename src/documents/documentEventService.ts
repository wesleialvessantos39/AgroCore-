import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import type { DocumentDomainEvent } from '../types/documents';

function cloneEvent(event: DocumentDomainEvent): DocumentDomainEvent {
  return structuredClone(event);
}

class DocumentEventJournal {
  private readonly eventsByOrganization = new Map<string, DocumentDomainEvent[]>();
  private readonly recordedOperations = new Set<string>();

  record(event: DocumentDomainEvent): void {
    const operationKey = `${event.organizationId}:${event.eventType}:${event.idempotencyKey}`;
    if (this.recordedOperations.has(operationKey)) return;
    this.recordedOperations.add(operationKey);
    const events = this.eventsByOrganization.get(event.organizationId) ?? [];
    events.push(Object.freeze(cloneEvent(event)));
    this.eventsByOrganization.set(event.organizationId, events);
  }

  list(organizationId: string): readonly DocumentDomainEvent[] {
    return (this.eventsByOrganization.get(organizationId) ?? []).map(cloneEvent);
  }

  clearAllSessionData(): void {
    this.eventsByOrganization.clear();
    this.recordedOperations.clear();
  }
}

export const documentEventJournal = new DocumentEventJournal();

registerDomainCleanup(() => {
  documentEventJournal.clearAllSessionData();
});

