/**
 * Entidades e Contratos de Vínculo entre Cliente e Captador
 * Módulo 002 & Módulo 004 — AgroCore
 * OE-004.002: Governança de Carteira Comercial e Solicitações de Laudos
 */

export type ClientCapturerAssignmentId = string;

export type CapturerAssignmentStatus = 'active' | 'terminated';

export interface ClientCapturerAssignment {
  readonly id: ClientCapturerAssignmentId;
  readonly organizationId: string;
  readonly clientId: string;
  readonly capturerUserId: string;
  readonly status: CapturerAssignmentStatus;
  readonly isPrimary: boolean;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly assignedByUserId: string;
  readonly transferReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateCapturerAssignmentInput {
  readonly clientId: string;
  readonly capturerUserId: string;
  readonly isPrimary?: boolean;
  readonly assignedByUserId: string;
  readonly idempotencyKey?: string;
}

export interface TransferCapturerAssignmentInput {
  readonly clientId: string;
  readonly newCapturerUserId: string;
  readonly assignedByUserId: string;
  readonly transferReason: string;
  readonly idempotencyKey?: string;
}

export interface TerminateCapturerAssignmentInput {
  readonly clientId: string;
  readonly assignmentId: ClientCapturerAssignmentId;
  readonly terminatedByUserId: string;
  readonly reason?: string;
}

export type ClientCapturerErrorCode =
  | 'CLIENT_NOT_FOUND'
  | 'CLIENT_INACTIVE'
  | 'CAPTURER_NOT_FOUND'
  | 'INCOMPATIBLE_ROLE'
  | 'DIVERGENT_ORGANIZATION'
  | 'UNAUTHORIZED_ACTOR'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_COMMAND';

export class ClientCapturerError extends Error {
  readonly code: ClientCapturerErrorCode;

  constructor(code: ClientCapturerErrorCode, message: string) {
    super(message);
    this.name = 'ClientCapturerError';
    this.code = code;
    Object.setPrototypeOf(this, ClientCapturerError.prototype);
  }
}

export interface ClientCapturerAssignmentGateway {
  listAssignmentsByClient(
    organizationId: string,
    clientId: string
  ): Promise<readonly ClientCapturerAssignment[]>;

  getActiveAssignment(
    organizationId: string,
    clientId: string
  ): Promise<ClientCapturerAssignment | null>;

  listClientsByCapturer(
    organizationId: string,
    capturerUserId: string
  ): Promise<readonly string[]>;

  assignCapturer(
    organizationId: string,
    input: CreateCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment>;

  transferCapturer(
    organizationId: string,
    input: TransferCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment>;

  terminateAssignment(
    organizationId: string,
    input: TerminateCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment>;
}
