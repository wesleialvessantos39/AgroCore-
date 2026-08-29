/**
 * MÓDULO 005 — CONTRATO DO GATEWAY DE PROPOSTAS
 * AgroCore
 */

import {
  CreateProposalInput,
  PaginatedProposalsResult,
  PresentProposalInput,
  Proposal,
  ProposalFilterOptions,
  ProposalId,
  ProposalReviewAssignment,
  ProposalStatusHistoryEntry,
  ProposalVersionSnapshot,
  RecordProposalDecisionInput,
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
   * Atualiza dados de uma proposta existente em rascunho ou ajustes solicitados
   */
  updateProposal(
    organizationId: string,
    proposalId: ProposalId,
    userId: string,
    input: UpdateProposalInput
  ): Promise<Proposal>;

  /**
   * Submete a proposta para análise comercial
   */
  submitProposal(
    organizationId: string,
    proposalId: ProposalId,
    userId: string
  ): Promise<Proposal>;

  /**
   * Atribui ou redistribui um revisor técnico para a proposta
   */
  assignProposalReviewer(
    organizationId: string,
    proposalId: ProposalId,
    reviewerUserId: string,
    assignedByUserId: string,
    reasonIfReassignment?: string
  ): Promise<Proposal>;

  /**
   * Inicia a revisão técnica formal da proposta
   */
  startProposalReview(
    organizationId: string,
    proposalId: ProposalId,
    userId: string
  ): Promise<Proposal>;

  /**
   * Solicita correções e ajustes na proposta
   */
  requestProposalChanges(
    organizationId: string,
    proposalId: ProposalId,
    userId: string,
    reasons: string
  ): Promise<Proposal>;

  /**
   * Aprova formalmente a proposta comercial e técnica
   */
  approveProposal(
    organizationId: string,
    proposalId: ProposalId,
    userId: string,
    notes?: string
  ): Promise<Proposal>;

  /**
   * Rejeita a proposta na análise técnica/comercial
   */
  rejectProposal(
    organizationId: string,
    proposalId: ProposalId,
    userId: string,
    reason: string
  ): Promise<Proposal>;

  /**
   * Registra a apresentação formal da proposta ao cliente
   */
  markProposalPresented(
    organizationId: string,
    proposalId: ProposalId,
    userId: string,
    input: PresentProposalInput
  ): Promise<Proposal>;

  /**
   * Registra a decisão formal do cliente (aceite ou declínio)
   */
  recordProposalDecision(
    organizationId: string,
    proposalId: ProposalId,
    userId: string,
    input: RecordProposalDecisionInput
  ): Promise<Proposal>;

  /**
   * Executa varredura de expiração determinística de propostas apresentadas vencidas
   */
  expireDueProposals(organizationId: string): Promise<number>;

  /**
   * Cancela uma proposta em andamento
   */
  cancelProposal(
    organizationId: string,
    proposalId: ProposalId,
    userId: string,
    reason?: string
  ): Promise<Proposal>;

  /**
   * Obtém histórico cronológico de transições de status da proposta
   */
  getProposalHistory(
    organizationId: string,
    proposalId: ProposalId
  ): Promise<readonly ProposalStatusHistoryEntry[]>;

  /**
   * Obtém snapshots imutáveis de versão da proposta
   */
  getProposalSnapshots(
    organizationId: string,
    proposalId: ProposalId
  ): Promise<readonly ProposalVersionSnapshot[]>;

  /**
   * Obtém atribuições de revisão da proposta
   */
  getProposalReviewAssignments(
    organizationId: string,
    proposalId: ProposalId
  ): Promise<readonly ProposalReviewAssignment[]>;
}
