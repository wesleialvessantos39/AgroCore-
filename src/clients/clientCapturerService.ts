/**
 * Serviço Canônico de Aplicação para Gestão de Vínculos Cliente-Captador
 * Módulo 002 & Módulo 004 — AgroCore
 * 
 * Validação rigorosa em modelo Deny-By-Default:
 * 1. Organização ativa na sessão;
 * 2. Ator autenticado com vínculo ativo;
 * 3. Ator com papel autorizado ('owner' | 'company_admin' | 'manager');
 * 4. Permissão 'client_capturer_assignments:manage';
 * 5. Cliente existente, ativo e pertencente à mesma organização;
 * 6. Captador existente como membro ativo da mesma organização com papel 'capturer';
 * 7. No máximo um vínculo principal ativo por cliente;
 * 8. Idempotência estrita com conferência do payload integral;
 * 9. Preservação histórica sem exclusão definitiva;
 * 10. Transferência atômica.
 */

import {
  ClientCapturerAssignment,
  ClientCapturerError,
  CreateCapturerAssignmentInput,
  TransferCapturerAssignmentInput,
  TerminateCapturerAssignmentInput,
} from '../types/clientCapturerAssignment';
import { getClientCapturerAssignmentGateway } from './capturerAssignmentGatewayFactory';
import { Client } from '../types/client';
import { OrganizationMember } from '../auth/organizationMembersGateway';
import { Permission } from '../types/authorization';
import { OrganizationRole } from '../types/auth';

export interface CapturerOrchestrationContext {
  readonly organizationId: string;
  readonly actor: {
    readonly userId: string;
    readonly organizationRole: OrganizationRole;
    readonly isActive: boolean;
    readonly permissions: readonly Permission[];
  };
  readonly clientResolver: (clientId: string) => Promise<Client | null> | Client | null;
  readonly memberResolver: (userId: string) => Promise<OrganizationMember | null> | OrganizationMember | null;
}

export class ClientCapturerService {
  private validateActor(ctx: CapturerOrchestrationContext): void {
    if (!ctx.organizationId || ctx.organizationId.trim() === '') {
      throw new ClientCapturerError('DIVERGENT_ORGANIZATION', 'Organização ativa não informada.');
    }

    if (!ctx.actor || !ctx.actor.userId || ctx.actor.userId.trim() === '') {
      throw new ClientCapturerError('UNAUTHORIZED_ACTOR', 'Usuário não autenticado.');
    }

    if (ctx.actor.isActive !== true) {
      throw new ClientCapturerError('UNAUTHORIZED_ACTOR', 'Vínculo do usuário com a organização encontra-se inativo.');
    }

    const allowedRoles: readonly OrganizationRole[] = ['owner', 'company_admin', 'manager'];
    if (!allowedRoles.includes(ctx.actor.organizationRole)) {
      throw new ClientCapturerError(
        'UNAUTHORIZED_ACTOR',
        'Apenas gestores ou administradores podem gerenciar vínculos de captadores.'
      );
    }

    if (!ctx.actor.permissions.includes('client_capturer_assignments:manage')) {
      throw new ClientCapturerError(
        'UNAUTHORIZED_ACTOR',
        'Permissão "client_capturer_assignments:manage" é estritamente requerida.'
      );
    }
  }

  private validateReadActor(ctx: CapturerOrchestrationContext): void {
    if (!ctx.organizationId || ctx.organizationId.trim() === '') {
      throw new ClientCapturerError('DIVERGENT_ORGANIZATION', 'Organização ativa não informada.');
    }

    if (!ctx.actor || !ctx.actor.userId || ctx.actor.userId.trim() === '') {
      throw new ClientCapturerError('UNAUTHORIZED_ACTOR', 'Usuário não autenticado.');
    }

    if (ctx.actor.isActive !== true) {
      throw new ClientCapturerError('UNAUTHORIZED_ACTOR', 'Vínculo do usuário com a organização encontra-se inativo.');
    }

    const hasViewPermission =
      ctx.actor.permissions.includes('clients:view') ||
      ctx.actor.permissions.includes('client_capturer_assignments:manage');

    if (!hasViewPermission && ctx.actor.organizationRole !== 'capturer') {
      throw new ClientCapturerError(
        'UNAUTHORIZED_ACTOR',
        'Permissão "clients:view" requerida para consultar vínculos de captadores.'
      );
    }
  }

  private async validateClient(clientId: string, ctx: CapturerOrchestrationContext): Promise<Client> {
    if (!clientId || clientId.trim() === '') {
      throw new ClientCapturerError('INVALID_COMMAND', 'Identificador do cliente é obrigatório.');
    }

    const client = await ctx.clientResolver(clientId);
    if (!client) {
      throw new ClientCapturerError('CLIENT_NOT_FOUND', `Cliente com ID ${clientId} não foi encontrado.`);
    }

    if (client.organizationId !== ctx.organizationId) {
      throw new ClientCapturerError(
        'DIVERGENT_ORGANIZATION',
        'O cliente não pertence à organização ativa da sessão.'
      );
    }

    if (client.status !== 'active') {
      throw new ClientCapturerError('CLIENT_INACTIVE', 'O cliente encontra-se inativo ou bloqueado.');
    }

    return client;
  }

  private async validateCapturer(capturerUserId: string, ctx: CapturerOrchestrationContext): Promise<OrganizationMember> {
    if (!capturerUserId || capturerUserId.trim() === '') {
      throw new ClientCapturerError('INVALID_COMMAND', 'Identificador do captador é obrigatório.');
    }

    const member = await ctx.memberResolver(capturerUserId);
    if (!member) {
      throw new ClientCapturerError(
        'CAPTURER_NOT_FOUND',
        `Profissional captador com ID ${capturerUserId} não foi encontrado no quadro de membros.`
      );
    }

    if (!member.isActive) {
      throw new ClientCapturerError(
        'CAPTURER_NOT_FOUND',
        'O profissional captador encontra-se inativo na organização.'
      );
    }

    if (member.organizationRole !== 'capturer') {
      throw new ClientCapturerError(
        'INCOMPATIBLE_ROLE',
        `O membro selecionado possui o papel "${member.organizationRole}", incompatível com a função de captador ("capturer").`
      );
    }

    return member;
  }

  async assignCapturer(
    input: CreateCapturerAssignmentInput,
    ctx: CapturerOrchestrationContext
  ): Promise<ClientCapturerAssignment> {
    this.validateActor(ctx);
    await this.validateClient(input.clientId, ctx);
    await this.validateCapturer(input.capturerUserId, ctx);

    const gateway = getClientCapturerAssignmentGateway();
    return gateway.assignCapturer(ctx.organizationId, {
      ...input,
      assignedByUserId: ctx.actor.userId,
    });
  }

  async transferCapturer(
    input: TransferCapturerAssignmentInput,
    ctx: CapturerOrchestrationContext
  ): Promise<ClientCapturerAssignment> {
    this.validateActor(ctx);
    await this.validateClient(input.clientId, ctx);
    await this.validateCapturer(input.newCapturerUserId, ctx);

    if (!input.transferReason || input.transferReason.trim() === '') {
      throw new ClientCapturerError('INVALID_COMMAND', 'O motivo da transferência é obrigatório.');
    }

    const gateway = getClientCapturerAssignmentGateway();
    return gateway.transferCapturer(ctx.organizationId, {
      ...input,
      assignedByUserId: ctx.actor.userId,
    });
  }

  async terminateAssignment(
    input: TerminateCapturerAssignmentInput,
    ctx: CapturerOrchestrationContext
  ): Promise<ClientCapturerAssignment> {
    this.validateActor(ctx);
    await this.validateClient(input.clientId, ctx);

    if (!input.assignmentId || input.assignmentId.trim() === '') {
      throw new ClientCapturerError('INVALID_COMMAND', 'Identificador do vínculo a encerrar é obrigatório.');
    }

    const gateway = getClientCapturerAssignmentGateway();
    return gateway.terminateAssignment(ctx.organizationId, {
      ...input,
      terminatedByUserId: ctx.actor.userId,
    });
  }

  async getActiveAssignment(
    clientId: string,
    ctx: CapturerOrchestrationContext
  ): Promise<ClientCapturerAssignment | null> {
    this.validateReadActor(ctx);
    const gateway = getClientCapturerAssignmentGateway();
    const assignment = await gateway.getActiveAssignment(ctx.organizationId, clientId);

    if (
      assignment &&
      ctx.actor.organizationRole === 'capturer' &&
      assignment.capturerUserId !== ctx.actor.userId
    ) {
      return null;
    }

    return assignment;
  }

  async listAssignmentsByClient(
    clientId: string,
    ctx: CapturerOrchestrationContext
  ): Promise<readonly ClientCapturerAssignment[]> {
    this.validateReadActor(ctx);
    const gateway = getClientCapturerAssignmentGateway();
    const list = await gateway.listAssignmentsByClient(ctx.organizationId, clientId);

    if (ctx.actor.organizationRole === 'capturer') {
      return list.filter((a) => a.capturerUserId === ctx.actor.userId);
    }

    return list;
  }

  async listClientsByCapturer(
    capturerUserId: string,
    ctx: CapturerOrchestrationContext
  ): Promise<readonly string[]> {
    this.validateReadActor(ctx);

    if (ctx.actor.organizationRole === 'capturer' && capturerUserId !== ctx.actor.userId) {
      throw new ClientCapturerError(
        'UNAUTHORIZED_ACTOR',
        'Captadores só podem consultar seus próprios clientes vinculados.'
      );
    }

    const gateway = getClientCapturerAssignmentGateway();
    return gateway.listClientsByCapturer(ctx.organizationId, capturerUserId);
  }
}

export const clientCapturerService = new ClientCapturerService();
