import type { TechnicalVisitId } from './technicalVisit';

export type TechnicalVisitFieldAnswerType =
  | 'short_text'
  | 'long_text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'time'
  | 'single_choice'
  | 'multiple_choice';

export type TechnicalVisitFieldAnswer =
  | string
  | number
  | boolean
  | readonly string[]
  | null;

export interface TechnicalVisitFieldItem {
  readonly id: string;
  readonly label: string;
  readonly type: TechnicalVisitFieldAnswerType;
  readonly required: boolean;
  readonly options: readonly string[];
  readonly answer: TechnicalVisitFieldAnswer;
  readonly observation: string | null;
}

export interface TechnicalVisitFieldSection {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly order: number;
  readonly items: readonly TechnicalVisitFieldItem[];
}

export type TechnicalVisitFieldFormStatus = 'draft' | 'submitted';

export interface TechnicalVisitFieldForm {
  readonly id: string;
  readonly organizationId: string;
  readonly visitId: TechnicalVisitId;
  readonly status: TechnicalVisitFieldFormStatus;
  readonly sections: readonly TechnicalVisitFieldSection[];
  readonly version: number;
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly updatedByUserId: string;
  readonly updatedAt: string;
  readonly submittedByUserId: string | null;
  readonly submittedAt: string | null;
}

export type TechnicalVisitFieldFormRevisionAction =
  | 'draft_saved'
  | 'submitted';

export interface TechnicalVisitFieldFormRevision {
  readonly id: string;
  readonly organizationId: string;
  readonly fieldFormId: string;
  readonly visitId: TechnicalVisitId;
  readonly version: number;
  readonly action: TechnicalVisitFieldFormRevisionAction;
  readonly actorUserId: string;
  readonly at: string;
  readonly sections: readonly TechnicalVisitFieldSection[];
}

export interface SaveTechnicalVisitFieldFormInput {
  readonly organizationId: string;
  readonly visitId: TechnicalVisitId;
  readonly actorUserId: string;
  readonly sections: readonly TechnicalVisitFieldSection[];
  readonly expectedVersion: number;
  readonly submit: boolean;
}

export interface TechnicalVisitFieldFormGateway {
  getFieldForm(
    organizationId: string,
    visitId: TechnicalVisitId,
    signal?: AbortSignal
  ): Promise<TechnicalVisitFieldForm | null>;

  saveFieldForm(
    input: SaveTechnicalVisitFieldFormInput,
    signal?: AbortSignal
  ): Promise<TechnicalVisitFieldForm>;

  listFieldFormRevisions(
    organizationId: string,
    visitId: TechnicalVisitId,
    signal?: AbortSignal
  ): Promise<readonly TechnicalVisitFieldFormRevision[]>;

  clearAllSessionData(): void;
}
