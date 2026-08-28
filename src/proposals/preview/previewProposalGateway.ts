/**
 * MÓDULO 005 — GATEWAY DE PROPOSTAS EM MODO PREVIEW
 * AgroCore
 */

import {
  CreateProposalInput,
  PaginatedProposalsResult,
  Proposal,
  ProposalDomainError,
  ProposalFilterOptions,
  ProposalId,
  UpdateProposalInput,
} from '../../types/proposals';
import { ProposalGateway } from '../gateway';
import {
  canTransitionProposalStatus,
  validateProposalInput,
} from '../validators';
import { formatBRL } from '../../appraisals/decimalMath';

export class PreviewProposalGateway implements ProposalGateway {
  // Armazenamento isolado por organização
  private proposalsByOrg: Map<string, Map<ProposalId, Proposal>> = new Map();
  private proposalCounterByOrg: Map<string, number> = new Map();

  private getOrgProposalsMap(organizationId: string): Map<ProposalId, Proposal> {
    if (!this.proposalsByOrg.has(organizationId)) {
      this.proposalsByOrg.set(organizationId, new Map());
    }
    return this.proposalsByOrg.get(organizationId)!;
  }

  private getNextProposalNumber(organizationId: string): string {
    const current = this.proposalCounterByOrg.get(organizationId) || 0;
    const next = current + 1;
    this.proposalCounterByOrg.set(organizationId, next);
    const year = new Date().getFullYear();
    return `PROP-${year}-${next.toString().padStart(4, '0')}`;
  }

  async listProposals(
    organizationId: string,
    filters?: ProposalFilterOptions,
    signal?: AbortSignal
  ): Promise<PaginatedProposalsResult> {
    if (!organizationId) {
      return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
    }

    if (signal?.aborted) {
      throw new Error('Operação cancelada pelo cliente.');
    }

    const orgMap = this.getOrgProposalsMap(organizationId);
    let list = Array.from(orgMap.values());

    if (filters) {
      if (filters.status) {
        list = list.filter((p) => p.status === filters.status);
      }
      if (filters.type) {
        list = list.filter((p) => p.proposalType === filters.type);
      }
      if (filters.category) {
        list = list.filter((p) => p.category === filters.category);
      }
      if (filters.clientId) {
        list = list.filter((p) => p.clientId === filters.clientId);
      }
      if (filters.propertyId) {
        list = list.filter((p) => p.propertyId === filters.propertyId);
      }
      if (filters.search && filters.search.trim() !== '') {
        const query = filters.search.toLowerCase().trim();
        list = list.filter(
          (p) =>
            p.title.toLowerCase().includes(query) ||
            p.proposalNumber.toLowerCase().includes(query) ||
            p.clientSnapshot.name.toLowerCase().includes(query) ||
            p.clientSnapshot.documentNumber.includes(query)
        );
      }
    }

    // Ordenação
    const sortField = filters?.sortBy || 'createdAt';
    const direction = filters?.sortDirection || 'desc';

    list.sort((a, b) => {
      let diff = 0;
      if (sortField === 'createdAt') {
        diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === 'updatedAt') {
        diff = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (sortField === 'title') {
        diff = a.title.localeCompare(b.title);
      } else if (sortField === 'amount') {
        diff = a.estimatedValue.amountCents - b.estimatedValue.amountCents;
      }
      return direction === 'asc' ? diff : -diff;
    });

    const page = Math.max(1, filters?.page || 1);
    const pageSize = Math.max(1, Math.min(filters?.pageSize || 10, 100));
    const total = list.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const offset = (page - 1) * pageSize;
    const paginated = list.slice(offset, offset + pageSize);

    if (signal?.aborted) {
      throw new Error('Operação cancelada pelo cliente.');
    }

    return {
      items: JSON.parse(JSON.stringify(paginated)),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async getProposalById(
    organizationId: string,
    proposalId: ProposalId
  ): Promise<Proposal | null> {
    if (!organizationId || !proposalId) return null;
    const orgMap = this.getOrgProposalsMap(organizationId);
    const proposal = orgMap.get(proposalId);
    if (!proposal) return null;
    return JSON.parse(JSON.stringify(proposal));
  }

  async createProposal(
    organizationId: string,
    userId: string,
    input: CreateProposalInput
  ): Promise<Proposal> {
    if (!organizationId) {
      throw new ProposalDomainError('ORGANIZATION_REQUIRED', 'Identificador de organização inválido.');
    }
    if (!userId) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Identificador de usuário autor não informado.');
    }

    const validation = validateProposalInput(input, true);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0] || 'Dados da proposta inválidos.';
      throw new ProposalDomainError('INVALID_FINANCIAL_VALUE', firstError);
    }

    const orgMap = this.getOrgProposalsMap(organizationId);
    const id = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date();
    const validityDays = input.validityDays || 30;
    const expiresDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
    const proposalNumber = this.getNextProposalNumber(organizationId);

    const principalReais = input.requestedAmountCents / 100;
    const installments = input.financingTermMonths && input.financingTermMonths > 0 ? input.financingTermMonths : 1;
    const rate = input.interestRateAnnualPercentage && input.interestRateAnnualPercentage > 0 ? input.interestRateAnnualPercentage : 0;
    const estimatedInterestReais = (principalReais * rate * (installments / 12)) / 100;
    const totalEstimatedReais = principalReais + estimatedInterestReais;
    const totalEstimatedCents = Math.round(totalEstimatedReais * 100);
    const estimatedInterestCents = Math.round(estimatedInterestReais * 100);
    const installmentEstimatedCents = Math.round(totalEstimatedCents / installments);

    const newProposal: Proposal = {
      id,
      organizationId,
      proposalNumber,
      title: input.title.trim(),
      clientId: input.clientId.trim(),
      clientSnapshot: {
        id: input.clientId.trim(),
        name: 'Cliente Cadastrado',
        documentNumber: '000.000.000-00',
        documentType: 'cpf',
      },
      propertyId: input.propertyId ? input.propertyId.trim() : null,
      propertySnapshot: input.propertyId ? {
        id: input.propertyId.trim(),
        name: 'Imóvel Vinculado',
      } : null,
      capturerUserId: userId,
      capturerSnapshot: {
        userId,
        name: 'Captador Responsável',
      },
      proposalType: input.proposalType,
      category: input.category || 'custeio',
      status: 'draft',
      validityDays,
      expiresAt: expiresDate.toISOString(),
      estimatedValue: {
        amountCents: input.requestedAmountCents,
        currency: 'BRL',
        formattedBRL: formatBRL(input.requestedAmountCents / 100),
      },
      calculationSummary: {
        principalCents: input.requestedAmountCents,
        interestRateAnnualPercentage: rate,
        financingTermMonths: input.financingTermMonths,
        gracePeriodMonths: input.gracePeriodMonths,
        estimatedInterestCents,
        totalEstimatedCents,
        installmentsCount: installments,
        installmentEstimatedCents,
        formattedValueBRL: formatBRL(totalEstimatedReais),
      },
      notes: input.notes?.trim(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
    };

    orgMap.set(id, newProposal);
    return JSON.parse(JSON.stringify(newProposal));
  }

  async updateProposal(
    organizationId: string,
    proposalId: ProposalId,
    _userId: string,
    input: UpdateProposalInput
  ): Promise<Proposal> {
    if (!organizationId || !proposalId) {
      throw new ProposalDomainError('ORGANIZATION_REQUIRED', 'Identificadores obrigatórios ausentes.');
    }

    const orgMap = this.getOrgProposalsMap(organizationId);
    const existing = orgMap.get(proposalId);
    if (!existing) {
      throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada na organização.');
    }

    if (existing.status !== 'draft') {
      throw new ProposalDomainError(
        'PROPOSAL_LOCKED',
        `Não é permitido editar uma proposta com status '${existing.status}'.`
      );
    }

    if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
      throw new ProposalDomainError(
        'CONCURRENCY_CONFLICT',
        `Conflito de concorrência: versão atual (${existing.version}) difere da esperada (${input.expectedVersion}).`
      );
    }

    const validation = validateProposalInput(input, false);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0] || 'Dados de atualização inválidos.';
      throw new ProposalDomainError('INVALID_FINANCIAL_VALUE', firstError);
    }

    const now = new Date();
    const validityDays = input.validityDays !== undefined ? input.validityDays : existing.validityDays;
    const expiresDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
    const amountCents = input.requestedAmountCents !== undefined ? input.requestedAmountCents : existing.estimatedValue.amountCents;

    const termMonths = input.financingTermMonths !== undefined ? input.financingTermMonths : existing.calculationSummary.financingTermMonths;
    const interest = input.interestRateAnnualPercentage !== undefined ? input.interestRateAnnualPercentage : existing.calculationSummary.interestRateAnnualPercentage;
    const grace = input.gracePeriodMonths !== undefined ? input.gracePeriodMonths : existing.calculationSummary.gracePeriodMonths;

    const principalReais = amountCents / 100;
    const installments = termMonths && termMonths > 0 ? termMonths : 1;
    const rate = interest && interest > 0 ? interest : 0;
    const estimatedInterestReais = (principalReais * rate * (installments / 12)) / 100;
    const totalEstimatedReais = principalReais + estimatedInterestReais;
    const totalEstimatedCents = Math.round(totalEstimatedReais * 100);
    const estimatedInterestCents = Math.round(estimatedInterestReais * 100);
    const installmentEstimatedCents = Math.round(totalEstimatedCents / installments);

    const updatedProposal: Proposal = {
      ...existing,
      title: input.title !== undefined ? input.title.trim() : existing.title,
      proposalType: input.proposalType !== undefined ? input.proposalType : existing.proposalType,
      category: input.category !== undefined ? input.category : existing.category,
      propertyId: input.propertyId !== undefined ? (input.propertyId ? input.propertyId.trim() : null) : existing.propertyId,
      validityDays,
      expiresAt: expiresDate.toISOString(),
      estimatedValue: {
        amountCents,
        currency: 'BRL',
        formattedBRL: formatBRL(amountCents / 100),
      },
      calculationSummary: {
        principalCents: amountCents,
        interestRateAnnualPercentage: rate,
        financingTermMonths: termMonths,
        gracePeriodMonths: grace,
        estimatedInterestCents,
        totalEstimatedCents,
        installmentsCount: installments,
        installmentEstimatedCents,
        formattedValueBRL: formatBRL(totalEstimatedReais),
      },
      notes: input.notes !== undefined ? input.notes.trim() : existing.notes,
      updatedAt: now.toISOString(),
      version: existing.version + 1,
    };

    orgMap.set(proposalId, updatedProposal);
    return JSON.parse(JSON.stringify(updatedProposal));
  }

  async submitProposal(
    organizationId: string,
    proposalId: ProposalId,
    _userId: string
  ): Promise<Proposal> {
    if (!organizationId || !proposalId) {
      throw new ProposalDomainError('ORGANIZATION_REQUIRED', 'Identificadores obrigatórios ausentes.');
    }

    const orgMap = this.getOrgProposalsMap(organizationId);
    const existing = orgMap.get(proposalId);
    if (!existing) {
      throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
    }

    if (!canTransitionProposalStatus(existing.status, 'submitted')) {
      throw new ProposalDomainError(
        'PROPOSAL_LOCKED',
        `Transição inválida de status: de '${existing.status}' para 'submitted'.`
      );
    }

    const now = new Date().toISOString();
    const updatedProposal: Proposal = {
      ...existing,
      status: 'submitted',
      updatedAt: now,
      version: existing.version + 1,
    };

    orgMap.set(proposalId, updatedProposal);
    return JSON.parse(JSON.stringify(updatedProposal));
  }

  async cancelProposal(
    organizationId: string,
    proposalId: ProposalId,
    _userId: string,
    reason?: string
  ): Promise<Proposal> {
    if (!organizationId || !proposalId) {
      throw new ProposalDomainError('ORGANIZATION_REQUIRED', 'Identificadores obrigatórios ausentes.');
    }

    const orgMap = this.getOrgProposalsMap(organizationId);
    const existing = orgMap.get(proposalId);
    if (!existing) {
      throw new ProposalDomainError('PROPOSAL_NOT_FOUND', 'Proposta não encontrada.');
    }

    if (!canTransitionProposalStatus(existing.status, 'cancelled')) {
      throw new ProposalDomainError(
        'PROPOSAL_LOCKED',
        `Transição inválida de status: de '${existing.status}' para 'cancelled'.`
      );
    }

    const now = new Date().toISOString();
    const updatedProposal: Proposal = {
      ...existing,
      status: 'cancelled',
      notes: reason ? `${existing.notes || ''}\n[Motivo]: ${reason}`.trim() : existing.notes,
      updatedAt: now,
      version: existing.version + 1,
    };

    orgMap.set(proposalId, updatedProposal);
    return JSON.parse(JSON.stringify(updatedProposal));
  }

  clearAll(): void {
    this.proposalsByOrg.clear();
    this.proposalCounterByOrg.clear();
  }

  clearAllSessionData(): void {
    this.clearAll();
  }
}
