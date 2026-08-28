/**
 * MÓDULO 005 — CONTRATO DO GATEWAY DE PROPOSTAS
 * AgroCore
 */

import {
  CreateProposalInput,
  PaginatedProposalsResult,
  Proposal,
  ProposalFilterOptions,
  ProposalId,
  ProposalStatus,
  UpdateProposalInput,
} from '../types/proposals';

export interface ProposalGateway {
  /**
   * Lista todas as propostas da organização com filtros, paginação e suporte a AbortSignal
   */
  listProposals(
    organizationId: string,
    filters?: ProposalFilterOptions,
    signal?: AbortSignal
  ): Promise<PaginatedProposalsResult>;

  /**
   * Busca uma proposta específica por ID e organização
   */
  getProposalById(organizationId: string, proposalId: ProposalId): Promise<Proposal | null>;

  /**
   * Cria uma nova proposta em rascunho
   */
  createProposal(
    organizationId: string,
    userId: string,
    input: CreateProposalInput
  ): Promise<Proposal>;

  /**
   * Atualiza dados de uma proposta existente em rascunho
   */
  updateProposal(
    organizationId: string,
    proposalId: ProposalId,
    userId: string,
    input: UpdateProposalInput
  ): Promise<Proposal>;

  /**
   * Submete a proposta formalmente
   */
  submitProposal(
    organizationId: string,
    proposalId: ProposalId,
    userId: string
  ): Promise<Proposal>;

  /**
   * Cancela uma proposta
   */
  cancelProposal(
    organizationId: string,
    proposalId: ProposalId,
    userId: string,
    reason?: string
  ): Promise<Proposal>;
}
