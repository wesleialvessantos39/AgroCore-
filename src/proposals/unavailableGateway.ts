import { ProposalGateway } from './gateway';
import {
  CreateProposalInput,
  PaginatedProposalsResult,
  Proposal,
  ProposalFilterOptions,
  ProposalId,
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

  async cancelProposal(
    _organizationId: string,
    _proposalId: ProposalId,
    _userId: string,
    _reason?: string
  ): Promise<Proposal> {
    throw new Error('Serviço de propostas indisponível neste ambiente.');
  }
}
