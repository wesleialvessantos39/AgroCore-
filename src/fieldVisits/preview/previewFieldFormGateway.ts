import { TechnicalVisitDomainError } from '../../types/technicalVisit';
import type {
  SaveTechnicalVisitFieldFormInput,
  TechnicalVisitFieldForm,
  TechnicalVisitFieldFormGateway,
  TechnicalVisitFieldFormRevision,
  TechnicalVisitFieldSection,
} from '../../types/technicalVisitFieldForm';

function cloneSections(
  sections: readonly TechnicalVisitFieldSection[]
): TechnicalVisitFieldSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      options: [...item.options],
      answer: Array.isArray(item.answer) ? [...item.answer] : item.answer,
    })),
  }));
}

function cloneForm(form: TechnicalVisitFieldForm): TechnicalVisitFieldForm {
  return {
    ...form,
    sections: cloneSections(form.sections),
  };
}

function cloneRevision(
  revision: TechnicalVisitFieldFormRevision
): TechnicalVisitFieldFormRevision {
  return {
    ...revision,
    sections: cloneSections(revision.sections),
  };
}

function secureId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new TechnicalVisitDomainError(
      'SERVICE_UNAVAILABLE',
      'Gerador seguro de identificadores indisponível.'
    );
  }
  return globalThis.crypto.randomUUID();
}

export class PreviewTechnicalVisitFieldFormGateway
  implements TechnicalVisitFieldFormGateway
{
  private readonly forms = new Map<string, TechnicalVisitFieldForm>();
  private readonly revisions = new Map<string, TechnicalVisitFieldFormRevision[]>();

  private key(organizationId: string, visitId: string): string {
    return organizationId + ':' + visitId;
  }

  async getFieldForm(
    organizationId: string,
    visitId: string,
    signal?: AbortSignal
  ): Promise<TechnicalVisitFieldForm | null> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    const form = this.forms.get(this.key(organizationId, visitId));
    return form ? cloneForm(form) : null;
  }

  async saveFieldForm(
    input: SaveTechnicalVisitFieldFormInput,
    signal?: AbortSignal
  ): Promise<TechnicalVisitFieldForm> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');

    const key = this.key(input.organizationId, input.visitId);
    const current = this.forms.get(key);

    if (current?.status === 'submitted') {
      throw new TechnicalVisitDomainError(
        'FIELD_FORM_LOCKED',
        'O formulário enviado não pode mais ser alterado.'
      );
    }

    const currentVersion = current?.version ?? 0;
    if (currentVersion !== input.expectedVersion) {
      throw new TechnicalVisitDomainError(
        'CONCURRENCY_CONFLICT',
        'O formulário foi alterado por outra operação. Recarregue os dados.'
      );
    }

    const now = new Date().toISOString();
    const nextVersion = currentVersion + 1;
    const next: TechnicalVisitFieldForm = {
      id: current?.id ?? secureId(),
      organizationId: input.organizationId,
      visitId: input.visitId,
      status: input.submit ? 'submitted' : 'draft',
      sections: cloneSections(input.sections),
      version: nextVersion,
      createdByUserId: current?.createdByUserId ?? input.actorUserId,
      createdAt: current?.createdAt ?? now,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
      submittedByUserId: input.submit ? input.actorUserId : null,
      submittedAt: input.submit ? now : null,
    };

    this.forms.set(key, cloneForm(next));
    const revision: TechnicalVisitFieldFormRevision = {
      id: secureId(),
      organizationId: input.organizationId,
      fieldFormId: next.id,
      visitId: input.visitId,
      version: next.version,
      action: input.submit ? 'submitted' : 'draft_saved',
      actorUserId: input.actorUserId,
      at: now,
      sections: cloneSections(input.sections),
    };
    this.revisions.set(key, [
      ...(this.revisions.get(key) ?? []),
      cloneRevision(revision),
    ]);

    return cloneForm(next);
  }

  async listFieldFormRevisions(
    organizationId: string,
    visitId: string,
    signal?: AbortSignal
  ): Promise<readonly TechnicalVisitFieldFormRevision[]> {
    if (signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
    return (this.revisions.get(this.key(organizationId, visitId)) ?? []).map(
      cloneRevision
    );
  }

  clearAllSessionData(): void {
    this.forms.clear();
    this.revisions.clear();
  }
}
