/**
 * MÓDULO 005 — SERVIÇO DE APLICAÇÃO DE PROPOSTAS
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 * 
 * Regras e Garantias:
 * 1. Deny-by-Default: validação estrita de organização, ator, permissões e status.
 * 2. Vínculo Captador-Cliente obrigatório e ativo.
 * 3. Validação de Cliente e Imóvel (existência, status ativo e relação de posse/propriedade).
 * 4. Aritmética determinística 100% inteira (centavos) com arredondamento bancário Half-Even.
 * 5. Idempotência atômica com trava de concorrência in-flight e detecção de payload divergente (IDEMPOTENCY_CONFLICT).
 * 6. Controle de concorrência otimista via versionamento determinístico (expectedVersion).
 * 7. Isolamento multitenant estrito e limpeza determinística de sessão.
 */

import {
  CreateProposalInput,
  PaginatedProposalsResult,
  Proposal,
  ProposalCalculationSummary,
  ProposalCapturerSnapshot,
  ProposalClientSnapshot,
  ProposalDomainError,
  ProposalFilterOptions,
  ProposalId,
  ProposalPropertySnapshot,
  UpdateProposalInput,
} from '../types/proposals';
import { Client } from '../types/client';
import { Property } from '../types/property';
import { ClientCapturerAssignmentGateway } from '../types/clientCapturerAssignment';
import { OrganizationMember } from '../auth/organizationMembersGateway';
import { OrganizationRole } from '../types/auth';
import { Permission } from '../types/authorization';
import {
  calculateProposalFinancialSummary,
  formatCentsToBRL,
} from './financialCalculator';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';

export interface ProposalAppContext {
  readonly organizationId: string;
  readonly actor: {
    readonly userId: string;
    readonly role: OrganizationRole;
    readonly isActive: boolean;
    readonly permissions: readonly Permission[];
  };
  readonly clientResolver: (clientId: string) => Promise<Client | null>;
  readonly propertyResolver?: (propertyId: string) => Promise<Property | null>;
  readonly assignmentGateway: ClientCapturerAssignmentGateway;
  readonly memberResolver: (userId: string) => Promise<OrganizationMember | null>;
}

export class ProposalApplicationService {
  // Armazenamento em memória autoritativo por organização para preview e testes
  private static proposalsStore: Map<string, Map<ProposalId, Proposal>> = new Map();
  private static counterStore: Map<string, number> = new Map();
  private static idempotencyStore: Map<string, { payloadHash: string; proposal: Proposal }> = new Map();
  private static inFlightOperations: Map<string, { payloadHash: string; promise: Promise<Proposal> }> = new Map();
  private static updateLocks: Map<string, Promise<void>> = new Map();

  private static isCleanupRegistered = false;

  constructor() {
    if (!ProposalApplicationService.isCleanupRegistered) {
      registerDomainCleanup(() => {
        ProposalApplicationService.clearAll();
      });
      ProposalApplicationService.isCleanupRegistered = true;
    }
  }

  private static async acquireLock(key: string): Promise<() => void> {
    while (ProposalApplicationService.updateLocks.has(key)) {
      try {
        await ProposalApplicationService.updateLocks.get(key);
      } catch {
        // Ignora erros de promessas anteriores
      }
    }

    let release!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      release = () => {
        ProposalApplicationService.updateLocks.delete(key);
        resolve();
      };
    });

    ProposalApplicationService.updateLocks.set(key, lockPromise);
    return release;
  }

  private static getOrgStore(orgId: string): Map<ProposalId, Proposal> {
    if (!ProposalApplicationService.proposalsStore.has(orgId)) {
      ProposalApplicationService.proposalsStore.set(orgId, new Map());
    }
    return ProposalApplicationService.proposalsStore.get(orgId)!;
  }

  private static getNextNumber(orgId: string): string {
    const current = ProposalApplicationService.counterStore.get(orgId) || 0;
    const next = current + 1;
    ProposalApplicationService.counterStore.set(orgId, next);
    const year = new Date().getFullYear();
    return `PROP-${year}-${next.toString().padStart(4, '0')}`;
  }

  public static clearAll(): void {
    ProposalApplicationService.proposalsStore.clear();
    ProposalApplicationService.counterStore.clear();
    ProposalApplicationService.idempotencyStore.clear();
    ProposalApplicationService.inFlightOperations.clear();
    ProposalApplicationService.updateLocks.clear();
  }

  // --- Normalização Determinística de Payloads para Hash de Idempotência ---
  private normalizeCreatePayload(input: CreateProposalInput): string {
    return JSON.stringify({
      clientId: input.clientId?.trim() || '',
      propertyId: input.propertyId ? input.propertyId.trim() : null,
      title: input.title?.trim() || '',
      proposalType: input.proposalType,
      category: input.category || 'custeio',
      validityDays: input.validityDays ?? 30,
      requestedAmountCents: input.requestedAmountCents,
      financingTermMonths: input.financingTermMonths ?? null,
      gracePeriodMonths: input.gracePeriodMonths ?? null,
      interestRateAnnualPercentage: input.interestRateAnnualPercentage ?? null,
      notes: input.notes?.trim() || null,
    });
  }

  private normalizeUpdatePayload(input: UpdateProposalInput): string {
    return JSON.stringify({
      title: input.title?.trim() ?? null,
      proposalType: input.proposalType ?? null,
      category: input.category ?? null,
      propertyId: input.propertyId !== undefined ? (input.propertyId ? input.propertyId.trim() : null) : undefined,
      validityDays: input.validityDays ?? null,
      requestedAmountCents: input.requestedAmountCents ?? null,
      financingTermMonths: input.financingTermMonths ?? null,
      gracePeriodMonths: input.gracePeriodMonths ?? null,
      interestRateAnnualPercentage: input.interestRateAnnualPercentage ?? null,
      notes: input.notes?.trim() ?? null,
      expectedVersion: input.expectedVersion,
    });
  }

  // --- Validações de Contexto e Ator (Deny-by-Default) ---
  private validateContext(ctx: ProposalAppContext): void {
    if (!ctx.organizationId || ctx.organizationId.trim() === '') {
      throw new ProposalDomainError('ORGANIZATION_REQUIRED', 'Identificador de organização ativa é obrigatório.');
    }
    if (!ctx.actor || !ctx.actor.userId || ctx.actor.isActive !== true) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Usuário não autenticado ou vínculo inativo na organização.');
    }
  }

  private checkReadAccess(proposal: Proposal, ctx: ProposalAppContext): void {
    if (!ctx.actor.permissions.includes('proposals:view')) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: você não tem permissão para visualizar esta proposta.'
      );
    }

    if (ctx.actor.role === 'capturer' && proposal.capturerUserId !== ctx.actor.userId) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: captadores só podem visualizar propostas de clientes a eles vinculados.'
      );
    }
  }

  private checkEditAccess(proposal: Proposal, ctx: ProposalAppContext): void {
    if (!ctx.actor.permissions.includes('proposals:edit')) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: você não tem permissão para editar esta proposta.'
      );
    }

    if (ctx.actor.role === 'capturer' && proposal.capturerUserId !== ctx.actor.userId) {
      throw new ProposalDomainError(
        'PERMISSION_DENIED',
        'Acesso negado: captadores só podem editar propostas de clientes a eles vinculados.'
      );
    }
  }

  // --- Criação de Proposta com Idempotência e Concorrência Atômica ---
  public async createProposal(input: CreateProposalInput, ctx: ProposalAppContext): Promise<Proposal> {
    this.validateContext(ctx);

    // Validação estrita de permissão: capturer NÃO contorna proposals:create
    if (!ctx.actor.permissions.includes('proposals:create')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:create" requerida para cadastrar propostas.');
    }

    // Tratamento atômico de Idempotência e Concorrência In-Flight
    if (input.idempotencyKey && input.idempotencyKey.trim() !== '') {
      const compositeKey = `${ctx.organizationId}:createProposal:${input.idempotencyKey.trim()}`;
      const payloadHash = this.normalizeCreatePayload(input);

      // 1. Verifica se já foi finalizado anteriormente
      const existing = ProposalApplicationService.idempotencyStore.get(compositeKey);
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new ProposalDomainError(
            'IDEMPOTENCY_CONFLICT',
            'Chave de idempotência já utilizada com parâmetros divergentes.'
          );
        }
        return JSON.parse(JSON.stringify(existing.proposal));
      }

      // 2. Verifica se há operação concorrente em andamento (in-flight)
      const inFlight = ProposalApplicationService.inFlightOperations.get(compositeKey);
      if (inFlight) {
        if (inFlight.payloadHash !== payloadHash) {
          throw new ProposalDomainError(
            'IDEMPOTENCY_CONFLICT',
            'Chave de idempotência já utilizada com parâmetros divergentes em operação concorrente.'
          );
        }
        const inFlightResult = await inFlight.promise;
        return JSON.parse(JSON.stringify(inFlightResult));
      }

      // 3. Registra operação in-flight antes de qualquer await
      const execPromise = this.executeCreateProposal(input, ctx);
      ProposalApplicationService.inFlightOperations.set(compositeKey, { payloadHash, promise: execPromise });

      try {
        const createdProposal = await execPromise;
        ProposalApplicationService.idempotencyStore.set(compositeKey, {
          payloadHash,
          proposal: JSON.parse(JSON.stringify(createdProposal)),
        });
        return createdProposal;
      } finally {
        ProposalApplicationService.inFlightOperations.delete(compositeKey);
      }
    }

    return this.executeCreateProposal(input, ctx);
  }

  private async executeCreateProposal(input: CreateProposalInput, ctx: ProposalAppContext): Promise<Proposal> {
    // Validações básicas de entrada
    if (!input.title || input.title.trim().length < 3) {
      throw new ProposalDomainError('INVALID_FINANCIAL_VALUE', 'Título da proposta deve ter no mínimo 3 caracteres.');
    }

    if (!input.requestedAmountCents || input.requestedAmountCents <= 0 || !Number.isInteger(input.requestedAmountCents)) {
      throw new ProposalDomainError('INVALID_FINANCIAL_VALUE', 'Valor solicitado deve ser um número inteiro de centavos positivo.');
    }

    const validityDays = input.validityDays && input.validityDays > 0 ? Math.min(input.validityDays, 365) : 30;

    // 1. Validação do Cliente
    const client = await ctx.clientResolver(input.clientId);
    if (!client) {
      throw new ProposalDomainError('CLIENT_NOT_FOUND', `Cliente com ID "${input.clientId}" não foi encontrado.`);
    }
    if (client.status !== 'active') {
      throw new ProposalDomainError('CLIENT_INACTIVE', 'Não é permitido criar proposta para um cliente inativo.');
    }
    if (client.organizationId !== ctx.organizationId) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'O cliente não pertence à organização ativa.');
    }

    // 2. Validação do Captador Responsável e Vínculo Ativo
    let capturerUserId = ctx.actor.userId;
    if (ctx.actor.role === 'capturer') {
      const activeAssignment = await ctx.assignmentGateway.getActiveAssignment(ctx.organizationId, client.id);
      if (!activeAssignment || activeAssignment.capturerUserId !== ctx.actor.userId || activeAssignment.status !== 'active') {
        throw new ProposalDomainError(
          'CAPTURER_NOT_ASSIGNED',
          'O captador logado não possui vínculo comercial ativo com este cliente.'
        );
      }
    } else {
      const activeAssignment = await ctx.assignmentGateway.getActiveAssignment(ctx.organizationId, client.id);
      if (activeAssignment && activeAssignment.status === 'active') {
        capturerUserId = activeAssignment.capturerUserId;
      }
    }

    // 3. Captura do Snapshot do Captador
    const capturerMember = await ctx.memberResolver(capturerUserId);
    const capturerSnapshot: ProposalCapturerSnapshot = {
      userId: capturerUserId,
      name: capturerMember?.name || ctx.actor.userId,
      email: capturerMember?.email,
      role: capturerMember?.organizationRole || ctx.actor.role,
    };

    // 4. Captura do Snapshot do Cliente
    const isIndividual = client.personType === 'individual';
    const clientDocument = isIndividual ? client.cpf : client.cnpj;
    const clientName = isIndividual ? client.name : (client.companyName || client.tradeName || client.cnpj);
    const clientSnapshot: ProposalClientSnapshot = {
      id: client.id,
      name: clientName,
      documentNumber: clientDocument,
      documentType: isIndividual ? 'cpf' : 'cnpj',
      email: client.contact?.email,
      phone: client.contact?.primaryPhone,
    };

    // 5. Validação do Imóvel (se fornecido)
    let propertySnapshot: ProposalPropertySnapshot | null = null;
    let validPropertyId: string | null = null;

    if (input.propertyId && input.propertyId.trim() !== '') {
      if (!ctx.propertyResolver) {
        throw new ProposalDomainError('PROPERTY_NOT_FOUND', 'Serviço de resolução de imóveis não configurado.');
      }
      const property = await ctx.propertyResolver(input.propertyId);
      if (!property) {
        throw new ProposalDomainError('PROPERTY_NOT_FOUND', `Imóvel com ID "${input.propertyId}" não foi encontrado.`);
      }
      if (property.status !== 'active') {
        throw new ProposalDomainError('PROPERTY_INACTIVE', 'O imóvel vinculado encontra-se inativo.');
      }
      if (property.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'O imóvel não pertence à organização ativa.');
      }

      const isLinkedToClient = property.clientLinks && property.clientLinks.some((l) => l.clientId === client.id);
      if (!isLinkedToClient) {
        throw new ProposalDomainError(
          'PROPERTY_NOT_BELONGS_TO_CLIENT',
          'O imóvel informado não possui vínculo cadastral com o cliente selecionado.'
        );
      }

      validPropertyId = property.id;
      const primaryReg = property.registrations?.find((r) => r.isPrimary) || property.registrations?.[0];
      let totalAreaHectares: number | undefined = undefined;
      if (property.propertyType === 'rural') {
        const parsed = parseFloat(property.areas.totalDeclaredAreaHa);
        if (!isNaN(parsed)) totalAreaHectares = parsed;
      }
      propertySnapshot = {
        id: property.id,
        name: property.name,
        registrationNumber: primaryReg?.registrationNumber,
        totalAreaHectares,
        city: property.location?.city,
        state: property.location?.state,
      };
    }

    // 6. Geração de Dados da Proposta com Matemática Determinística
    const now = new Date();
    const expiresDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
    const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
    const id: ProposalId = `prop-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const proposalNumber = ProposalApplicationService.getNextNumber(ctx.organizationId);

    const calcResult = calculateProposalFinancialSummary({
      principalCents: input.requestedAmountCents,
      financingTermMonths: input.financingTermMonths,
      interestRateAnnualPercentage: input.interestRateAnnualPercentage,
      gracePeriodMonths: input.gracePeriodMonths,
      roundingMode: 'half_even',
    });

    const calculationSummary: ProposalCalculationSummary = {
      principalCents: calcResult.principalCents,
      interestRateAnnualPercentage: calcResult.interestRateAnnualPercentage,
      financingTermMonths: calcResult.financingTermMonths,
      gracePeriodMonths: calcResult.gracePeriodMonths,
      estimatedInterestCents: calcResult.estimatedInterestCents,
      totalEstimatedCents: calcResult.totalEstimatedCents,
      installmentsCount: calcResult.installmentsCount,
      installmentEstimatedCents: calcResult.installmentEstimatedCents,
      formattedValueBRL: calcResult.formattedValueBRL,
    };

    const newProposal: Proposal = {
      id,
      organizationId: ctx.organizationId,
      proposalNumber,
      title: input.title.trim(),
      clientId: client.id,
      clientSnapshot,
      propertyId: validPropertyId,
      propertySnapshot,
      capturerUserId,
      capturerSnapshot,
      proposalType: input.proposalType,
      category: input.category || 'custeio',
      status: 'draft',
      validityDays,
      expiresAt: expiresDate.toISOString(),
      estimatedValue: {
        amountCents: input.requestedAmountCents,
        currency: 'BRL',
        formattedBRL: formatCentsToBRL(input.requestedAmountCents),
      },
      calculationSummary,
      notes: input.notes?.trim() || undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
    };

    orgStore.set(id, newProposal);
    return newProposal;
  }

  // --- Atualização de Proposta com Idempotência e Concorrência Transacional ---
  public async updateProposal(
    proposalId: ProposalId,
    input: UpdateProposalInput,
    ctx: ProposalAppContext
  ): Promise<Proposal> {
    this.validateContext(ctx);

    if (input.idempotencyKey && input.idempotencyKey.trim() !== '') {
      const compositeKey = `${ctx.organizationId}:updateProposal:${proposalId}:${input.idempotencyKey.trim()}`;
      const payloadHash = this.normalizeUpdatePayload(input);

      const existing = ProposalApplicationService.idempotencyStore.get(compositeKey);
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new ProposalDomainError(
            'IDEMPOTENCY_CONFLICT',
            'Chave de idempotência já utilizada com parâmetros divergentes.'
          );
        }
        return JSON.parse(JSON.stringify(existing.proposal));
      }

      const inFlight = ProposalApplicationService.inFlightOperations.get(compositeKey);
      if (inFlight) {
        if (inFlight.payloadHash !== payloadHash) {
          throw new ProposalDomainError(
            'IDEMPOTENCY_CONFLICT',
            'Chave de idempotência já utilizada com parâmetros divergentes em operação concorrente.'
          );
        }
        const inFlightResult = await inFlight.promise;
        return JSON.parse(JSON.stringify(inFlightResult));
      }

      const execPromise = this.lockAndUpdateProposal(proposalId, input, ctx);
      ProposalApplicationService.inFlightOperations.set(compositeKey, { payloadHash, promise: execPromise });

      try {
        const updatedProposal = await execPromise;
        ProposalApplicationService.idempotencyStore.set(compositeKey, {
          payloadHash,
          proposal: JSON.parse(JSON.stringify(updatedProposal)),
        });
        return updatedProposal;
      } finally {
        ProposalApplicationService.inFlightOperations.delete(compositeKey);
      }
    }

    return this.lockAndUpdateProposal(proposalId, input, ctx);
  }

  private async lockAndUpdateProposal(
    proposalId: ProposalId,
    input: UpdateProposalInput,
    ctx: ProposalAppContext
  ): Promise<Proposal> {
    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);
    try {
      return await this.executeUpdateProposal(proposalId, input, ctx);
    } finally {
      release();
    }
  }

  private async executeUpdateProposal(
    proposalId: ProposalId,
    input: UpdateProposalInput,
    ctx: ProposalAppContext
  ): Promise<Proposal> {
    const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
    const existing = orgStore.get(proposalId);

    if (!existing) {
      throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
    }

    if (existing.organizationId !== ctx.organizationId) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
    }

    this.checkEditAccess(existing, ctx);

    if (existing.status !== 'draft') {
      throw new ProposalDomainError(
        'PROPOSAL_LOCKED',
        `Propostas no status "${existing.status}" não podem ser alteradas.`
      );
    }

    // Controle de concorrência estrito com recarga e trava
    if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
      throw new ProposalDomainError(
        'CONCURRENCY_CONFLICT',
        `Conflito de versão: a proposta foi modificada por outro usuário (versão atual: ${existing.version}, versão esperada: ${input.expectedVersion}).`
      );
    }

    // 1. Atualização de Imóvel se requisitado
    let propertySnapshot = existing.propertySnapshot;
    let propertyId = existing.propertyId;

    if (input.propertyId !== undefined) {
      if (input.propertyId === null || input.propertyId.trim() === '') {
        propertyId = null;
        propertySnapshot = null;
      } else {
        if (!ctx.propertyResolver) {
          throw new ProposalDomainError('PROPERTY_NOT_FOUND', 'Serviço de resolução de imóveis não configurado.');
        }
        const property = await ctx.propertyResolver(input.propertyId);
        if (!property) {
          throw new ProposalDomainError('PROPERTY_NOT_FOUND', `Imóvel com ID "${input.propertyId}" não foi encontrado.`);
        }
        if (property.status !== 'active') {
          throw new ProposalDomainError('PROPERTY_INACTIVE', 'O imóvel vinculado encontra-se inativo.');
        }
        if (property.organizationId !== ctx.organizationId) {
          throw new ProposalDomainError('PERMISSION_DENIED', 'O imóvel não pertence à organização ativa.');
        }

        const isLinkedToClient = property.clientLinks && property.clientLinks.some((l) => l.clientId === existing.clientId);
        if (!isLinkedToClient) {
          throw new ProposalDomainError(
            'PROPERTY_NOT_BELONGS_TO_CLIENT',
            'O imóvel informado não possui vínculo cadastral com o cliente desta proposta.'
          );
        }

        propertyId = property.id;
        const primaryReg = property.registrations?.find((r) => r.isPrimary) || property.registrations?.[0];
        let totalAreaHectares: number | undefined = undefined;
        if (property.propertyType === 'rural') {
          const parsed = parseFloat(property.areas.totalDeclaredAreaHa);
          if (!isNaN(parsed)) totalAreaHectares = parsed;
        }
        propertySnapshot = {
          id: property.id,
          name: property.name,
          registrationNumber: primaryReg?.registrationNumber,
          totalAreaHectares,
          city: property.location?.city,
          state: property.location?.state,
        };
      }
    }

    // 2. Atualização financeira
    const newAmountCents = input.requestedAmountCents ?? existing.estimatedValue.amountCents;
    if (newAmountCents <= 0 || !Number.isInteger(newAmountCents) || !Number.isSafeInteger(newAmountCents)) {
      throw new ProposalDomainError('INVALID_FINANCIAL_VALUE', 'Valor solicitado deve ser um número inteiro de centavos positivo e seguro.');
    }

    const newTerm = input.financingTermMonths !== undefined ? input.financingTermMonths : existing.calculationSummary.financingTermMonths;
    const newInterest = input.interestRateAnnualPercentage !== undefined ? input.interestRateAnnualPercentage : existing.calculationSummary.interestRateAnnualPercentage;
    const newGrace = input.gracePeriodMonths !== undefined ? input.gracePeriodMonths : existing.calculationSummary.gracePeriodMonths;

    const calcResult = calculateProposalFinancialSummary({
      principalCents: newAmountCents,
      financingTermMonths: newTerm,
      interestRateAnnualPercentage: newInterest,
      gracePeriodMonths: newGrace,
      roundingMode: 'half_even',
    });

    const calculationSummary: ProposalCalculationSummary = {
      principalCents: calcResult.principalCents,
      interestRateAnnualPercentage: calcResult.interestRateAnnualPercentage,
      financingTermMonths: calcResult.financingTermMonths,
      gracePeriodMonths: calcResult.gracePeriodMonths,
      estimatedInterestCents: calcResult.estimatedInterestCents,
      totalEstimatedCents: calcResult.totalEstimatedCents,
      installmentsCount: calcResult.installmentsCount,
      installmentEstimatedCents: calcResult.installmentEstimatedCents,
      formattedValueBRL: calcResult.formattedValueBRL,
    };

    const validityDays = input.validityDays !== undefined ? Math.min(Math.max(1, input.validityDays), 365) : existing.validityDays;
    const createdAtTime = new Date(existing.createdAt).getTime();
    const expiresAt = new Date(createdAtTime + validityDays * 24 * 60 * 60 * 1000).toISOString();

    const updatedProposal: Proposal = {
      ...existing,
      title: input.title !== undefined ? input.title.trim() : existing.title,
      proposalType: input.proposalType || existing.proposalType,
      category: input.category || existing.category,
      propertyId,
      propertySnapshot,
      validityDays,
      expiresAt,
      estimatedValue: {
        amountCents: newAmountCents,
        currency: 'BRL',
        formattedBRL: formatCentsToBRL(newAmountCents),
      },
      calculationSummary,
      notes: input.notes !== undefined ? (input.notes.trim() || undefined) : existing.notes,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };

    orgStore.set(proposalId, updatedProposal);
    return updatedProposal;
  }

  // --- Submissão de Proposta com Trava Concorrente ---
  public async submitProposal(
    proposalId: ProposalId,
    ctx: ProposalAppContext
  ): Promise<Proposal> {
    this.validateContext(ctx);

    if (!ctx.actor.permissions.includes('proposals:edit')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:edit" requerida para submeter proposta.');
    }

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);

    try {
      const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
      const existing = orgStore.get(proposalId);

      if (!existing) {
        throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
      }

      if (existing.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
      }

      this.checkEditAccess(existing, ctx);

      if (existing.status !== 'draft') {
        throw new ProposalDomainError(
          'PROPOSAL_LOCKED',
          `Apenas propostas em rascunho podem ser submetidas (status atual: "${existing.status}").`
        );
      }

      const updatedProposal: Proposal = {
        ...existing,
        status: 'submitted',
        updatedAt: new Date().toISOString(),
        version: existing.version + 1,
      };

      orgStore.set(proposalId, updatedProposal);
      return updatedProposal;
    } finally {
      release();
    }
  }

  // --- Cancelamento de Proposta com Trava Concorrente ---
  public async cancelProposal(
    proposalId: ProposalId,
    ctx: ProposalAppContext,
    reason?: string
  ): Promise<Proposal> {
    this.validateContext(ctx);

    if (!ctx.actor.permissions.includes('proposals:edit')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:edit" requerida para cancelar proposta.');
    }

    const lockKey = `${ctx.organizationId}:${proposalId}`;
    const release = await ProposalApplicationService.acquireLock(lockKey);

    try {
      const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
      const existing = orgStore.get(proposalId);

      if (!existing) {
        throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
      }

      if (existing.organizationId !== ctx.organizationId) {
        throw new ProposalDomainError('PERMISSION_DENIED', 'A proposta não pertence à organização ativa.');
      }

      this.checkEditAccess(existing, ctx);

      if (existing.status === 'cancelled' || existing.status === 'expired') {
        throw new ProposalDomainError(
          'PROPOSAL_LOCKED',
          `Não é permitido cancelar uma proposta no status "${existing.status}".`
        );
      }

      const updatedNotes = reason ? `${existing.notes || ''}\n[Cancelamento]: ${reason}`.trim() : existing.notes;

      const updatedProposal: Proposal = {
        ...existing,
        status: 'cancelled',
        notes: updatedNotes,
        updatedAt: new Date().toISOString(),
        version: existing.version + 1,
      };

      orgStore.set(proposalId, updatedProposal);
      return updatedProposal;
    } finally {
      release();
    }
  }

  // --- Consulta de Proposta por ID ---
  public async getProposalById(proposalId: ProposalId, ctx: ProposalAppContext): Promise<Proposal | null> {
    this.validateContext(ctx);
    const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
    const proposal = orgStore.get(proposalId);
    if (!proposal || proposal.organizationId !== ctx.organizationId) {
      throw new ProposalDomainError('PROPOSAL_NOT_FOUND', `Proposta com ID "${proposalId}" não encontrada.`);
    }

    this.checkReadAccess(proposal, ctx);
    return proposal;
  }

  // --- Listagem Paginada de Propostas ---
  public async listProposals(
    filters: ProposalFilterOptions = {},
    ctx: ProposalAppContext,
    signal?: AbortSignal
  ): Promise<PaginatedProposalsResult> {
    if (signal?.aborted) {
      throw new Error('Operação cancelada pelo usuário.');
    }
    this.validateContext(ctx);

    if (!ctx.actor.permissions.includes('proposals:view')) {
      throw new ProposalDomainError('PERMISSION_DENIED', 'Permissão "proposals:view" requerida.');
    }

    const orgStore = ProposalApplicationService.getOrgStore(ctx.organizationId);
    let items = Array.from(orgStore.values()).filter((p) => p.organizationId === ctx.organizationId);

    // Captador só enxerga propostas das quais é o captador responsável
    if (ctx.actor.role === 'capturer') {
      items = items.filter((p) => p.capturerUserId === ctx.actor.userId);
    }

    // Filtros de busca
    if (filters.search && filters.search.trim() !== '') {
      const q = filters.search.trim().toLowerCase();
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.proposalNumber.toLowerCase().includes(q) ||
          p.clientSnapshot.name.toLowerCase().includes(q) ||
          p.clientSnapshot.documentNumber.includes(q) ||
          (p.propertySnapshot && p.propertySnapshot.name.toLowerCase().includes(q))
      );
    }

    if (filters.status) {
      items = items.filter((p) => p.status === filters.status);
    }

    if (filters.type) {
      items = items.filter((p) => p.proposalType === filters.type);
    }

    if (filters.category) {
      items = items.filter((p) => p.category === filters.category);
    }

    if (filters.clientId) {
      items = items.filter((p) => p.clientId === filters.clientId);
    }

    if (filters.propertyId) {
      items = items.filter((p) => p.propertyId === filters.propertyId);
    }

    // Ordenação
    const sortBy = filters.sortBy || 'createdAt';
    const sortDir = filters.sortDirection || 'desc';

    items.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'updatedAt') {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (sortBy === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortBy === 'amount') {
        cmp = a.estimatedValue.amountCents - b.estimatedValue.amountCents;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.max(1, Math.min(filters.pageSize || 20, 100));
    const total = items.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = items.slice(startIndex, startIndex + pageSize);

    return {
      items: paginatedItems,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  // --- Simulação Financeira Pura e Determinística ---
  public simulateCreditCalculation(
    principalCents: number,
    termMonths?: number,
    interestRateAnnualPercentage?: number,
    gracePeriodMonths?: number
  ): ProposalCalculationSummary {
    const calc = calculateProposalFinancialSummary({
      principalCents,
      financingTermMonths: termMonths,
      interestRateAnnualPercentage,
      gracePeriodMonths,
      roundingMode: 'half_even',
    });

    return {
      principalCents: calc.principalCents,
      interestRateAnnualPercentage: calc.interestRateAnnualPercentage,
      financingTermMonths: calc.financingTermMonths,
      gracePeriodMonths: calc.gracePeriodMonths,
      estimatedInterestCents: calc.estimatedInterestCents,
      totalEstimatedCents: calc.totalEstimatedCents,
      installmentsCount: calc.installmentsCount,
      installmentEstimatedCents: calc.installmentEstimatedCents,
      formattedValueBRL: calc.formattedValueBRL,
    };
  }
}
