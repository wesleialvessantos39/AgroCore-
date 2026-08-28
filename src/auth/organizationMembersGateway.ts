/**
 * Contrato de Consulta de Membros e Colaboradores da Organização
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { OrganizationRole } from '../types/auth';

export interface OrganizationMember {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly organizationRole: OrganizationRole;
  readonly isActive: boolean;
}

export interface OrganizationMembersGateway {
  listMembers(
    organizationId: string,
    signal?: AbortSignal
  ): Promise<readonly OrganizationMember[]>;

  getMemberByUserId(
    organizationId: string,
    userId: string
  ): Promise<OrganizationMember | null>;
}
