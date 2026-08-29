import { ProposalGateway } from './gateway';
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

/**
 * UnavailableProposalGateway
 *
 * Implementação segura e fechada utilizada quando não há infraestrutura de persistência real configurada.
 * Rejeita qualquer tentativa de consulta ou mutação sem simular dados nem criar registros artificiais.
 */
export class UnavailableProposalGateway implements ProposalGateway {
  async listProposals(
    _organizationId: string,
    _filters?: ProposalFilterOptions,
    _signal?: AbortSignal
  ): Promise<PaginatedProposalsResult> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async getProposalById(
    _organizationId: string,
    _proposalId: ProposalId
  ): Promise<Proposal | null> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async createProposal(
    _organizationId: string,
    _userId: string,
    _input: CreateProposalInput
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async updateProposal(
    _organizationId: string,
    _proposalId: ProposalId,
    _userId: string,
    _input: UpdateProposalInput
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async submitProposal(
    _organizationId: string,
    _proposalId: ProposalId,
    _userId: string
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async assignProposalReviewer(
    _organizationId: string,
    _proposalId: ProposalId,
    _reviewerUserId: string,
    _assignedByUserId: string,
    _reasonIfReassignment?: string
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async startProposalReview(
    _organizationId: string,
    _proposalId: ProposalId,
    _userId: string
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async requestProposalChanges(
    _organizationId: string,
    _proposalId: ProposalId,
    _userId: string,
    _reasons: string
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async approveProposal(
    _organizationId: string,
    _proposalId: ProposalId,
    _userId: string,
    _notes?: string
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async rejectProposal(
    _organizationId: string,
    _proposalId: ProposalId,
    _userId: string,
    _reason: string
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async markProposalPresented(
    _organizationId: string,
    _proposalId: ProposalId,
    _userId: string,
    _input: PresentProposalInput
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async recordProposalDecision(
    _organizationId: string,
    _proposalId: ProposalId,
    _userId: string,
    _input: RecordProposalDecisionInput
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async expireDueProposals(_organizationId: string): Promise<number> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async cancelProposal(
    _organizationId: string,
    _proposalId: ProposalId,
    _userId: string,
    _reason?: string
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async getProposalHistory(
    _organizationId: string,
    _proposalId: ProposalId
  ): Promise<readonly ProposalStatusHistoryEntry[]> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async getProposalSnapshots(
    _organizationId: string,
    _proposalId: ProposalId
  ): Promise<readonly ProposalVersionSnapshot[]> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }

  async getProposalReviewAssignments(
    _organizationId: string,
    _proposalId: ProposalId
  ): Promise<readonly ProposalReviewAssignment[]> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }
}
