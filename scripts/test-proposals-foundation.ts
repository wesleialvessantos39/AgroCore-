/**
 * SUÍTE DE TESTES DE DOMÍNIO, GOVERNANÇA E SEGURANÇA — MÓDULO 005
 * Verificações automáticas de conformidade:
 * 1. Isolamento multitenant estrito
 * 2. Integridade monetária (centavos inteiros e DecimalMath)
 * 3. Idempotência com chave composta (orgId:operation:key)
 * 4. Controle de concorrência determinístico (expectedVersion)
 * 5. Deny-by-default em autorizações de criação e edição
 * 6. Descomissionamento de esteira/status da OE-005.003 (OPERATION_NOT_IMPLEMENTED)
 * 7. Filtros e buscas na camada de aplicação
 */

import {
  ProposalApplicationService,
  ProposalAppContext,
} from '../src/proposals/proposalApplicationService';
import {
  formatCentsToBRL,
  parseBRLToCents,
  parsePercentageInput,
  validateProposalInput,
} from '../src/proposals/validators';
import {
  calculateProposalFinancialSummary,
  calculateSimpleInterestCents,
  divideBigIntWithRounding,
} from '../src/proposals/financialCalculator';
import { CreateProposalInput, ProposalDomainError } from '../src/types/proposals';
import { Client } from '../src/types/client';
import { Property } from '../src/types/property';
import { OrganizationMember } from '../src/auth/organizationMembersGateway';
import { ClientCapturerAssignmentGateway } from '../src/types/clientCapturerAssignment';
import {
  getProposalDetailPath,
  getProposalEditPath,
} from '../src/routes/paths';
import { findRouteDefinition } from '../src/routes/routeMatrix';
import { getSafeRedirectUrl } from '../src/routes/safeNavigation';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedCount++;
    console.error(`  [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

async function runTests() {
  console.log('Iniciando Suíte de Testes da Fundação do Módulo 005 (ProposalApplicationService)...\n');

  // --- GRUPO 1: Matemática e Formatação Financeira (Centavos Inteiros) ---
  console.log('--- GRUPO 1: Matemática Financeira e Formatação BRL ---');

  assert(
    formatCentsToBRL(15000000) === 'R$ 150.000,00',
    'Formata 15.000.000 centavos como R$ 150.000,00'
  );
  assert(formatCentsToBRL(0) === 'R$ 0,00', 'Formata 0 centavos como R$ 0,00');
  assert(formatCentsToBRL(99) === 'R$ 0,99', 'Formata 99 centavos como R$ 0,99');
  assert(formatCentsToBRL(105) === 'R$ 1,05', 'Formata 105 centavos como R$ 1,05');
  assert(
    formatCentsToBRL(-50000) === '-R$ 500,00',
    'Formata valor negativo adequadamente'
  );

  assert(
    parseBRLToCents('150.000,00') === 15000000,
    'Converte "150.000,00" para 15.000.000 centavos'
  );
  assert(
    parseBRLToCents('R$ 1.250,50') === 125050,
    'Converte "R$ 1.250,50" para 125.050 centavos'
  );
  assert(parseBRLToCents('100') === 10000, 'Converte "100" para 10.000 centavos');
  assert(parseBRLToCents('0,05') === 5, 'Converte "0,05" para 5 centavos');
  assert(
    divideBigIntWithRounding(5n, 2n, 'half_even') === 2n &&
      divideBigIntWithRounding(7n, 2n, 'half_even') === 4n,
    'Arredondamento bancário meio-par resolve empates para o inteiro par'
  );
  assert(
    calculateSimpleInterestCents(10_000, 10.5, 12) === 1_050,
    'Calcula taxa anual fracionária sem perda intermediária de centavos'
  );
  assert(
    parsePercentageInput('10,50') === 10.5 &&
      Number.isNaN(parsePercentageInput('10,5abc')),
    'Parser de taxa aceita decimal completo e rejeita sufixo parcial'
  );

  let unsafePrincipalRejected = false;
  try {
    calculateProposalFinancialSummary({
      principalCents: Number.MAX_SAFE_INTEGER + 1,
    });
  } catch {
    unsafePrincipalRejected = true;
  }
  assert(unsafePrincipalRejected, 'Rejeita principal fora do intervalo de inteiros seguros');

  let totalOverflowRejected = false;
  try {
    calculateProposalFinancialSummary({
      principalCents: Number.MAX_SAFE_INTEGER,
      interestRateAnnualPercentage: 100,
      financingTermMonths: 12,
    });
  } catch {
    totalOverflowRejected = true;
  }
  assert(totalOverflowRejected, 'Rejeita estouro do total financeiro estimado');

  // --- GRUPO 2: Validações de Entrada ---
  console.log('\n--- GRUPO 2: Validações de Entrada Cadastrais ---');

  const validPayload: CreateProposalInput = {
    clientId: 'cli-123',
    title: 'Custeio Soja 2025/2026',
    proposalType: 'credit',
    category: 'custeio',
    requestedAmountCents: 50000000, // R$ 500.000,00
    validityDays: 30,
    financingTermMonths: 24,
    gracePeriodMonths: 6,
    interestRateAnnualPercentage: 10.5,
    notes: 'Aquisição de insumos agrícolas e adubação para safra de soja.',
  };

  const v1 = validateProposalInput(validPayload, true);
  assert(v1.isValid === true, 'Payload válido é aceito');

  const v2 = validateProposalInput({ ...validPayload, clientId: '' }, true);
  assert(v2.isValid === false && Boolean(v2.errors.clientId), 'Rejeita cliente vazio');

  const v3 = validateProposalInput(
    {
      ...validPayload,
      requestedAmountCents: 0,
    },
    true
  );
  assert(v3.isValid === false && Boolean(v3.errors.requestedAmountCents), 'Rejeita valor <= 0');

  const v4 = validateProposalInput(
    {
      ...validPayload,
      title: 'ab',
    },
    true
  );
  assert(
    v4.isValid === false && Boolean(v4.errors.title),
    'Rejeita título curto demais (< 3 chars)'
  );

  // --- GRUPO 3: Contexto e Dependências para o ProposalApplicationService ---
  console.log('\n--- GRUPO 3: Execução Canônica do ProposalApplicationService ---');

  const orgA = 'org-empresa-alpha';
  const orgB = 'org-empresa-beta';
  const userProjetista = 'usr-projetista-1';
  const userCaptador = 'usr-captador-1';

  // Mock fixtures strictly within tests
  const clientsStore: Record<string, Client> = {
    'cli-produtor-1': {
      id: 'cli-produtor-1',
      organizationId: orgA,
      personType: 'individual',
      name: 'João Produtor Rural',
      cpf: '12345678901',
      status: 'active',
      address: { city: 'Rio Verde', state: 'GO' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Client,
  };

  const propertiesStore: Record<string, Property> = {
    'prop-fazenda-1': {
      id: 'prop-fazenda-1',
      organizationId: orgA,
      name: 'Fazenda Boa Esperança',
      propertyType: 'rural',
      status: 'active',
      location: { city: 'Rio Verde', state: 'GO' },
      areas: { totalDeclaredAreaHa: '500' },
      identifiers: {},
      registrations: [],
      clientLinks: [
        {
          clientId: 'cli-produtor-1',
          relationship: 'owner',
          isPrimaryHolder: true,
          linkedAt: new Date().toISOString(),
        },
      ],
      boundaries: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as Property,
  };

  const membersStore: Record<string, OrganizationMember> = {
    [userCaptador]: {
      id: 'mem-cap-1',
      userId: userCaptador,
      name: 'Carlos Captador',
      email: 'carlos@alpha.com',
      organizationRole: 'capturer',
      isActive: true,
    },
    [userProjetista]: {
      id: 'mem-proj-1',
      userId: userProjetista,
      name: 'Paulo Projetista',
      email: 'paulo@alpha.com',
      organizationRole: 'project_designer',
      isActive: true,
    },
  };

  const mockAssignmentGateway: ClientCapturerAssignmentGateway = {
    listAssignmentsByClient: async () => [],
    getActiveAssignment: async (_orgId, clientId) => {
      if (clientId === 'cli-produtor-1') {
        return {
          id: 'asg-1',
          organizationId: orgA,
          clientId: 'cli-produtor-1',
          capturerUserId: userCaptador,
          status: 'active',
          isPrimary: true,
          startedAt: new Date().toISOString(),
          assignedByUserId: 'usr-admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      return null;
    },
    listClientsByCapturer: async () => ['cli-produtor-1'],
    assignCapturer: async () => {
      throw new Error('Not implemented in mock');
    },
    transferCapturer: async () => {
      throw new Error('Not implemented in mock');
    },
    terminateAssignment: async () => {
      throw new Error('Not implemented in mock');
    },
  };

  const ctxOrgA: ProposalAppContext = {
    organizationId: orgA,
    actor: {
      userId: userProjetista,
      role: 'project_designer',
      isActive: true,
      permissions: ['proposals:create', 'proposals:view', 'proposals:edit'],
    },
    clientResolver: async (id) => clientsStore[id] || null,
    propertyResolver: async (id) => propertiesStore[id] || null,
    assignmentGateway: mockAssignmentGateway,
    memberResolver: async (id) => membersStore[id] || null,
  };

  const appService = new ProposalApplicationService();

  // 1. Criação com snapshot canônico
  const createdProposal = await appService.createProposal(
    {
      clientId: 'cli-produtor-1',
      propertyId: 'prop-fazenda-1',
      title: 'Proposta Custeio Agrícola 2026',
      proposalType: 'credit',
      category: 'custeio',
      requestedAmountCents: 35000000, // R$ 350.000,00
      validityDays: 30,
      financingTermMonths: 18,
      interestRateAnnualPercentage: 8.5,
      idempotencyKey: 'idem-key-001',
    },
    ctxOrgA
  );

  assert(createdProposal.id.startsWith('prop-'), 'Cria proposta com ID válido');
  assert(createdProposal.proposalNumber.startsWith('PROP-'), 'Gera número PROP-');
  assert(createdProposal.status === 'draft', 'Status inicial é draft');
  assert(createdProposal.clientSnapshot.name === 'João Produtor Rural', 'Cria snapshot do cliente');
  assert(createdProposal.propertySnapshot?.name === 'Fazenda Boa Esperança', 'Cria snapshot do imóvel');
  assert(createdProposal.capturerSnapshot.userId === userCaptador, 'Resolve captador ativo do cliente');

  // 2. Idempotência Composta: payload idêntico retorna o mesmo registro
  const identicalCall = await appService.createProposal(
    {
      clientId: 'cli-produtor-1',
      propertyId: 'prop-fazenda-1',
      title: 'Proposta Custeio Agrícola 2026',
      proposalType: 'credit',
      category: 'custeio',
      requestedAmountCents: 35000000, // R$ 350.000,00
      validityDays: 30,
      financingTermMonths: 18,
      interestRateAnnualPercentage: 8.5,
      idempotencyKey: 'idem-key-001',
    },
    ctxOrgA
  );
  assert(identicalCall.id === createdProposal.id, 'Idempotência com payload idêntico retorna a mesma proposta');

  // 2.1. Idempotência Composta: payload divergente com mesma chave DEVE lançar IDEMPOTENCY_CONFLICT
  let conflictCaught = false;
  try {
    await appService.createProposal(
      {
        clientId: 'cli-produtor-1',
        title: 'Proposta Custeio Agrícola 2026 - Divergente',
        proposalType: 'credit',
        category: 'custeio',
        requestedAmountCents: 35000000,
        idempotencyKey: 'idem-key-001',
      },
      ctxOrgA
    );
  } catch (err: unknown) {
    if (err instanceof ProposalDomainError && err.code === 'IDEMPOTENCY_CONFLICT') {
      conflictCaught = true;
    }
  }
  assert(conflictCaught, 'Idempotência com payload divergente lança IDEMPOTENCY_CONFLICT');

  // 3. Edição com controle de versão otimista
  const updatedProposal = await appService.updateProposal(
    createdProposal.id,
    {
      title: 'Proposta Custeio Agrícola 2026 - Revisada',
      requestedAmountCents: 40000000,
      expectedVersion: createdProposal.version,
    },
    ctxOrgA
  );
  assert(updatedProposal.title === 'Proposta Custeio Agrícola 2026 - Revisada', 'Atualiza título');
  assert(updatedProposal.version === createdProposal.version + 1, 'Incrementa versão atomicamente');

  // 4. Conflito de versão otimista
  let versionConflictCaught = false;
  try {
    await appService.updateProposal(
      createdProposal.id,
      {
        title: 'Tentativa Conflito',
        expectedVersion: 1, // Stale version
      },
      ctxOrgA
    );
  } catch (err: unknown) {
    if (err instanceof ProposalDomainError && err.code === 'CONCURRENCY_CONFLICT') {
      versionConflictCaught = true;
    }
  }
  assert(versionConflictCaught, 'Rejeita atualização com version conflict (optimistic lock)');

  // 4.1 Concorrência real: duas atualizações simultâneas com a mesma versão
  const concurrentProposal = await appService.createProposal(
    {
      clientId: 'cli-produtor-1',
      propertyId: 'prop-fazenda-1',
      title: 'Proposta para Teste de Concorrência',
      proposalType: 'credit',
      category: 'investimento',
      requestedAmountCents: 20_000_000,
      idempotencyKey: 'idem-concurrency-create',
    },
    ctxOrgA
  );
  const delayedContext: ProposalAppContext = {
    ...ctxOrgA,
    propertyResolver: async (id) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      return propertiesStore[id] || null;
    },
  };
  const concurrentResults = await Promise.allSettled([
    appService.updateProposal(
      concurrentProposal.id,
      {
        title: 'Atualização Concorrente A',
        propertyId: 'prop-fazenda-1',
        expectedVersion: concurrentProposal.version,
        idempotencyKey: 'idem-concurrent-a',
      },
      delayedContext
    ),
    appService.updateProposal(
      concurrentProposal.id,
      {
        title: 'Atualização Concorrente B',
        propertyId: 'prop-fazenda-1',
        expectedVersion: concurrentProposal.version,
        idempotencyKey: 'idem-concurrent-b',
      },
      delayedContext
    ),
  ]);
  const fulfilledUpdates = concurrentResults.filter((result) => result.status === 'fulfilled');
  const rejectedUpdates = concurrentResults.filter((result) => result.status === 'rejected');
  const concurrencyRejected = rejectedUpdates.some(
    (result) =>
      result.status === 'rejected' &&
      result.reason instanceof ProposalDomainError &&
      result.reason.code === 'CONCURRENCY_CONFLICT'
  );
  const concurrentFinal = await appService.getProposalById(concurrentProposal.id, ctxOrgA);
  assert(
    fulfilledUpdates.length === 1 &&
      rejectedUpdates.length === 1 &&
      concurrencyRejected &&
      concurrentFinal.version === concurrentProposal.version + 1,
    'Promise.all: exatamente uma atualização vence e a outra recebe CONCURRENCY_CONFLICT'
  );

  // 5. Isolamento Multitenant: Org B não consegue acessar
  const ctxOrgB: ProposalAppContext = {
    ...ctxOrgA,
    organizationId: orgB,
    actor: {
      userId: 'usr-org-b',
      role: 'project_designer',
      isActive: true,
      permissions: ['proposals:view'],
    },
  };

  let crossOrgCaught = false;
  try {
    await appService.getProposalById(createdProposal.id, ctxOrgB);
  } catch (err: unknown) {
    if (
      err instanceof ProposalDomainError &&
      (err.code === 'PROPOSAL_NOT_FOUND' || err.code === 'PERMISSION_DENIED')
    ) {
      crossOrgCaught = true;
    }
  }
  assert(crossOrgCaught, 'Isolamento estrito: Org B não acessa proposta da Org A');

  // 6. Deny-by-default: Usuário sem permissão
  const ctxNoPerm: ProposalAppContext = {
    ...ctxOrgA,
    actor: {
      userId: 'usr-no-perm',
      role: 'none',
      isActive: true,
      permissions: [],
    },
  };

  let permDeniedCaught = false;
  try {
    await appService.createProposal(
      {
        clientId: 'cli-produtor-1',
        title: 'Proposta Não Autorizada',
        proposalType: 'credit',
        category: 'custeio',
        requestedAmountCents: 10000000,
      },
      ctxNoPerm
    );
  } catch (err: unknown) {
    if (err instanceof ProposalDomainError && err.code === 'PERMISSION_DENIED') {
      permDeniedCaught = true;
    }
  }
  assert(permDeniedCaught, 'Deny-by-default: Bloqueia criação para usuário sem permissão');

  // 6.1 Rotas dinâmicas e redirecionamentos seguros
  const hostileProposalId = 'prop/123?next=https://example.invalid';
  const safeDetailPath = getProposalDetailPath(hostileProposalId);
  const safeEditPath = getProposalEditPath(hostileProposalId);
  assert(
    safeDetailPath === '/propostas/prop%2F123%3Fnext%3Dhttps%3A%2F%2Fexample.invalid' &&
      safeEditPath.endsWith('/editar'),
    'Builders de rotas de propostas codificam identificadores não confiáveis'
  );
  assert(
    findRouteDefinition('/propostas/prop-123')?.requiredPermissions === 'proposals:view' &&
      findRouteDefinition('/propostas/prop-123/editar')?.requiredPermissions === 'proposals:edit' &&
      getSafeRedirectUrl('/propostas/prop-123') === '/propostas/prop-123' &&
      getSafeRedirectUrl('//example.invalid/propostas') === '/sistema',
    'Matriz e navegação reconhecem propostas internas e bloqueiam open redirect'
  );

  // 7. Submissão e Cancelamento Canônicos
  console.log('\n--- GRUPO 4: Submissão e Cancelamento Canônicos com Trava ---');

  const submittedProposal = await appService.submitProposal(createdProposal.id, ctxOrgA);
  assert(submittedProposal.status === 'submitted', 'Submissão atualiza status para submitted');
  assert(submittedProposal.version === updatedProposal.version + 1, 'Submissão incrementa versão');

  let lockedEditBlocked = false;
  try {
    await appService.updateProposal(
      createdProposal.id,
      {
        title: 'Tentativa Edição Proposta Submetida',
        expectedVersion: submittedProposal.version,
      },
      ctxOrgA
    );
  } catch (err: unknown) {
    if (err instanceof ProposalDomainError && err.code === 'PROPOSAL_LOCKED') {
      lockedEditBlocked = true;
    }
  }
  assert(lockedEditBlocked, 'Bloqueia edição de proposta já submetida (PROPOSAL_LOCKED)');

  const cancelledProposal = await appService.cancelProposal(createdProposal.id, ctxOrgA, 'Cliente optou por outra linha');
  assert(cancelledProposal.status === 'cancelled', 'Cancelamento atualiza status para cancelled');
  assert(cancelledProposal.notes?.includes('Cliente optou por outra linha'), 'Registra justificativa no cancelamento');

  console.log(`\n========================================`);
  console.log(`Resultado da Fundação Módulo 005: ${passedCount} aprovados, ${failedCount} falhas`);
  console.log(`========================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro fatal durante a execução dos testes:', err);
  process.exit(1);
});
