/**
 * Implementação Indisponível do Gateway de Vínculos Cliente-Captador
 * Utilizada em produção enquanto o backend/banco de dados real não estiver conectado.
 */

import {
  ClientCapturerAssignment,
  ClientCapturerAssignmentGateway,
  CreateCapturerAssignmentInput,
  TransferCapturerAssignmentInput,
  TerminateCapturerAssignmentInput,
} from '../types/clientCapturerAssignment';

export class UnavailableClientCapturerAssignmentGateway implements ClientCapturerAssignmentGateway {
  async listAssignmentsByClient(): Promise<readonly ClientCapturerAssignment[]> {
    throw new Error('Serviço de vínculos de captador indisponível no ambiente de produção.');
  }

  async getActiveAssignment(): Promise<ClientCapturerAssignment | null> {
    throw new Error('Serviço de vínculos de captador indisponível no ambiente de produção.');
  }

  async listClientsByCapturer(): Promise<readonly string[]> {
    throw new Error('Serviço de vínculos de captador indisponível no ambiente de produção.');
  }

  async assignCapturer(
    _organizationId: string,
    _input: CreateCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment> {
    throw new Error('Serviço de atribuição de captador indisponível no ambiente de produção.');
  }

  async transferCapturer(
    _organizationId: string,
    _input: TransferCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment> {
    throw new Error('Serviço de transferência de captador indisponível no ambiente de produção.');
  }

  async terminateAssignment(
    _organizationId: string,
    _input: TerminateCapturerAssignmentInput
  ): Promise<ClientCapturerAssignment> {
    throw new Error('Serviço de encerramento de vínculo indisponível no ambiente de produção.');
  }
}
