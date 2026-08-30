/**
 * MÓDULO 005 — VALIDADORES E UTILITÁRIOS CANÔNICOS DE PROPOSTAS
 * AgroCore
 */

import {
  CreateProposalInput,
  ProposalCategory,
  ProposalPresentationChannel,
  ProposalStatus,
  ProposalType,
  UpdateProposalInput,
} from '../types/proposals';
import { Client } from '../types/client';

export function getClientDisplayName(client: Client): string {
  if (client.personType === 'individual') {
    return client.name;
  }
  return client.tradeName ? `${client.companyName} (${client.tradeName})` : client.companyName;
}

export function getClientDocument(client: Client): string {
  if (client.personType === 'individual') {
    return client.cpf;
  }
  return client.cnpj;
}

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Rascunho',
  submitted: 'Submetida',
  under_review: 'Em Revisão Técnica',
  changes_requested: 'Ajustes Solicitados',
  approved: 'Aprovada',
  presented: 'Apresentada ao Cliente',
  accepted: 'Aceita pelo Cliente',
  declined: 'Declinada pelo Cliente',
  rejected: 'Rejeitada na Análise',
  expired: 'Expirada',
  cancelled: 'Cancelada',
};

export const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  credit: 'Crédito Rural',
  appraisal: 'Laudo de Avaliação',
  technical_project: 'Projeto Técnico Agronômico',
  environmental_regularization: 'Regularização Ambiental',
};

export const PROPOSAL_CATEGORY_LABELS: Record<ProposalCategory, string> = {
  custeio: 'Custeio Agrícola/Pecuário',
  investimento: 'Investimento em Infraestrutura/Maquinário',
  comercializacao: 'Comercialização',
  industrializacao: 'Industrialização',
  servico_tecnico: 'Prestação de Serviços Técnicos',
  outros: 'Outros',
};

export function isProposalStatus(value: unknown): value is ProposalStatus {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(PROPOSAL_STATUS_LABELS, value);
}

export function isProposalType(value: unknown): value is ProposalType {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(PROPOSAL_TYPE_LABELS, value);
}

export function isProposalCategory(value: unknown): value is ProposalCategory {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(PROPOSAL_CATEGORY_LABELS, value);
}

export function isProposalPresentationChannel(value: unknown): value is ProposalPresentationChannel {
  return typeof value === 'string'
    && ['email', 'phone', 'in_person', 'messaging', 'other'].includes(value);
}

export {
  formatCentsToBRL,
  parseBRLToCents,
  parsePercentageInput,
} from './financialCalculator';

/**
 * Máquina de estados oficial do Pipeline Comercial (OE-005.003)
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['under_review', 'cancelled'],
  under_review: ['changes_requested', 'approved', 'rejected', 'cancelled'],
  changes_requested: ['submitted', 'cancelled'],
  approved: ['presented', 'cancelled'],
  presented: ['accepted', 'declined', 'expired', 'cancelled'],
  accepted: [],
  declined: [],
  rejected: [],
  expired: [],
  cancelled: [],
};

export function canTransitionProposalStatus(from: ProposalStatus, to: ProposalStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function isTerminalProposalStatus(status: ProposalStatus): boolean {
  return ['accepted', 'declined', 'rejected', 'expired', 'cancelled'].includes(status);
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateProposalInput(
  input: Partial<CreateProposalInput & UpdateProposalInput>,
  isCreate = true
): ValidationResult {
  const errors: Record<string, string> = {};

  if (isCreate) {
    if (!input.clientId || typeof input.clientId !== 'string' || input.clientId.trim() === '') {
      errors.clientId = 'O cliente/produtor rural é obrigatório.';
    }
  }

  if (isCreate || input.title !== undefined) {
    if (!input.title || typeof input.title !== 'string' || input.title.trim().length < 3) {
      errors.title = 'O título da proposta deve conter pelo menos 3 caracteres.';
    }
  }

  if (isCreate || input.proposalType !== undefined) {
    const validTypes: ProposalType[] = [
      'credit',
      'appraisal',
      'technical_project',
      'environmental_regularization',
    ];
    if (!input.proposalType || !validTypes.includes(input.proposalType)) {
      errors.proposalType = 'Selecione um tipo de proposta válido.';
    }
  }

  if (isCreate || input.category !== undefined) {
    const validCategories: ProposalCategory[] = [
      'custeio',
      'investimento',
      'comercializacao',
      'industrializacao',
      'servico_tecnico',
      'outros',
    ];
    if (input.category && !validCategories.includes(input.category)) {
      errors.category = 'Selecione uma finalidade/categoria válida.';
    }
  }

  if (isCreate || input.requestedAmountCents !== undefined) {
    const cents = input.requestedAmountCents;
    if (cents === undefined || cents === null || Number.isNaN(cents) || cents <= 0) {
      errors.requestedAmountCents = 'O valor solicitado deve ser maior que zero.';
    } else if (!Number.isInteger(cents)) {
      errors.requestedAmountCents = 'O valor solicitado deve ser um número inteiro de centavos.';
    } else if (cents > 100_000_000_000_00) {
      errors.requestedAmountCents = 'O valor informado excede o limite operacional do sistema.';
    }
  }

  if (input.validityDays !== undefined && input.validityDays !== null) {
    if (input.validityDays < 1 || input.validityDays > 365 || !Number.isInteger(input.validityDays)) {
      errors.validityDays = 'A validade da proposta deve ser entre 1 e 365 dias.';
    }
  }

  if (input.financingTermMonths !== undefined && input.financingTermMonths !== null) {
    if (input.financingTermMonths < 1 || !Number.isInteger(input.financingTermMonths)) {
      errors.financingTermMonths = 'O prazo de financiamento deve ser um número inteiro de meses maior que zero.';
    }
  }

  if (input.gracePeriodMonths !== undefined && input.gracePeriodMonths !== null) {
    if (input.gracePeriodMonths < 0 || !Number.isInteger(input.gracePeriodMonths)) {
      errors.gracePeriodMonths = 'O prazo de carência deve ser um número inteiro de meses positivo.';
    }
  }

  if (
    input.interestRateAnnualPercentage !== undefined &&
    input.interestRateAnnualPercentage !== null
  ) {
    if (
      !Number.isFinite(input.interestRateAnnualPercentage) ||
      input.interestRateAnnualPercentage < 0
    ) {
      errors.interestRateAnnualPercentage = 'A taxa de juros anual deve ser um número válido e não negativo.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
