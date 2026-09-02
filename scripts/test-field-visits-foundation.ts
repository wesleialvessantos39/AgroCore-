import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TechnicalVisitDomainError,
  type TechnicalVisitApplicationContext,
  type TechnicalVisitMemberResolution,
  type TechnicalVisitClientResolution,
  type TechnicalVisitPropertyResolution,
  type TechnicalVisitProposalResolution,
  type TechnicalVisitAppraisalResolution,
} from '../src/types/technicalVisit.ts';
import { PreviewTechnicalVisitGateway } from '../src/fieldVisits/preview/previewTechnicalVisitGateway.ts';
import { UnavailableTechnicalVisitGateway } from '../src/fieldVisits/unavailableGateway.ts';
import {
  TechnicalVisitService,
  type TechnicalVisitClock,
  type TechnicalVisitIdGenerator,
} from '../src/fieldVisits/technicalVisitService.ts';
import {
  assertTechnicalVisitTransition,
  canTransitionTechnicalVisit,
  isTechnicalVisitTerminal,
} from '../src/fieldVisits/stateMachine.ts';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';

let passed = 0;
let failed = 0;

async function test(name: string, operation: () => void | Promise<void>) {
  try {
    await operation();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  [FAIL] ${name}`);
    console.error(error);
  }
}

class FixedClock implements TechnicalVisitClock {
  constructor(private readonly iso: string) {}
  now(): Date {
    return new Date(this.iso);
  }
}

class SequentialIds implements TechnicalVisitIdGenerator {
  private count = 0;
  generate(): string {
    this.count += 1;
    return `id-${String(this.count).padStart(4, '0')}`;
  }
}

interface FixtureMaps {
  readonly members: Map<string, TechnicalVisitMemberResolution>;
  readonly clients: Map<string, TechnicalVisitClientResolution>;
  readonly properties: Map<string, TechnicalVisitPropertyResolution>;
  readonly proposals: Map<string, TechnicalVisitProposalResolution>;
  readonly appraisals: Map<string, TechnicalVisitAppraisalResolution>;
}

function baseMaps(orgId = 'org-a'): FixtureMaps {
  return {
    members: new Map([
      ['user-owner', { exists: true, organizationId: orgId, userId: 'user-owner', isActive: true, canExecute: true, name: 'Owner' }],
      ['user-tech', { exists: true, organizationId: orgId, userId: 'user-tech', isActive: true, canExecute: true, name: 'Técnico' }],
      ['user-inactive', { exists: true, organizationId: orgId, userId: 'user-inactive', isActive: false, canExecute: true, name: 'Inativo' }],
    ]),
    clients: new Map([
      ['client-a', { exists: true, organizationId: orgId, status: 'active' }],
      ['client-inactive', { exists: true, organizationId: orgId, status: 'inactive' }],
    ]),
    properties: new Map([
      ['property-a', { exists: true, organizationId: orgId, status: 'active', clientIds: ['client-a'] }],
      ['property-other-client', { exists: true, organizationId: orgId, status: 'active', clientIds: ['client-x'] }],
      ['property-inactive', { exists: true, organizationId: orgId, status: 'inactive', clientIds: ['client-a'] }],
    ]),
    proposals: new Map([
      ['proposal-a', { exists: true, organizationId: orgId, clientId: 'client-a', propertyId: 'property-a' }],
      ['proposal-client-only', { exists: true, organizationId: orgId, clientId: 'client-a', propertyId: null }],
      ['proposal-mismatch', { exists: true, organizationId: orgId, clientId: 'client-x', propertyId: 'property-a' }],
    ]),
    appraisals: new Map([
      ['appraisal-a', { exists: true, organizationId: orgId, clientId: 'client-a', propertyId: 'property-a' }],
      ['appraisal-mismatch', { exists: true, organizationId: orgId, clientId: 'client-x', propertyId: 'property-a' }],
    ]),
  };
}

function context(
  orgId = 'org-a',
  userId = 'user-owner',
  role: 'owner' | 'company_admin' | 'manager' | 'project_designer' | 'finance' | 'capturer' | 'none' = 'owner',
  maps: FixtureMaps = baseMaps(orgId)
): TechnicalVisitApplicationContext {
  return {
    organizationId: orgId,
    actor: {
      userId,
      role,
      isActive: true,
      permissions: [...getRolePermissions(role)],
    },
    resolveMember: async (id) =>
      maps.members.get(id) ?? { exists: false, organizationId: null, userId: id, isActive: false, canExecute: false },
    resolveClient: async (id) =>
      maps.clients.get(id) ?? { exists: false, organizationId: null, status: null },
    resolveProperty: async (id) =>
      maps.properties.get(id) ?? { exists: false, organizationId: null, status: null, clientIds: [] },
    resolveProposal: async (id) =>
      maps.proposals.get(id) ?? { exists: false, organizationId: null, clientId: null, propertyId: null },
    resolveAppraisal: async (id) =>
      maps.appraisals.get(id) ?? { exists: false, organizationId: null, clientId: null, propertyId: null },
  };
}

function validInput(responsibleUserId = 'user-tech') {
  return {
    activityType: 'technical_visit' as const,
    clientId: 'client-a',
    propertyId: 'property-a',
    proposalId: 'proposal-a',
    appraisalId: 'appraisal-a',
    responsibleUserId,
    scheduledFor: '2026-09-05T12:00:00.000Z',
    purpose: 'Vistoria técnica do imóvel vinculada ao atendimento.',
  };
}

function newService(gateway = new PreviewTechnicalVisitGateway()) {
  return {
    gateway,
    service: new TechnicalVisitService(
      gateway,
      new FixedClock('2026-09-02T15:00:00.000Z'),
      new SequentialIds()
    ),
  };
}

console.log('====================================================');
console.log(' AGROCORE — FUNDAÇÃO DE VISITAS E VISTORIAS');
console.log('====================================================\n');

await test('1. Máquina de estados permite somente o fluxo previsto', () => {
  assert.equal(canTransitionTechnicalVisit('planned', 'confirmed'), true);
  assert.equal(canTransitionTechnicalVisit('planned', 'cancelled'), true);
  assert.equal(canTransitionTechnicalVisit('confirmed', 'in_progress'), true);
  assert.equal(canTransitionTechnicalVisit('in_progress', 'completed'), true);
  assert.equal(canTransitionTechnicalVisit('completed', 'planned'), false);
  assert.equal(canTransitionTechnicalVisit('cancelled', 'confirmed'), false);
});

await test('2. Estados concluído e cancelado são terminais', () => {
  assert.equal(isTechnicalVisitTerminal('completed'), true);
  assert.equal(isTechnicalVisitTerminal('cancelled'), true);
  assert.equal(isTechnicalVisitTerminal('in_progress'), false);
});

await test('3. Transição inválida é recusada pelo domínio', () => {
  assert.throws(
    () => assertTechnicalVisitTransition('planned', 'completed'),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_TRANSITION'
  );
});

await test('4. Criação gera visita planejada, versionada e auditada', async () => {
  const { service } = newService();
  const ctx = context();
  const visit = await service.createVisit(ctx, validInput());
  assert.equal(visit.status, 'planned');
  assert.equal(visit.version, 1);
  assert.equal(visit.organizationId, 'org-a');
  assert.equal(visit.createdByUserId, 'user-owner');
  const audit = await service.listAudit(ctx, visit.id);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'created');
  assert.equal(audit[0].toStatus, 'planned');
});

await test('5. Somente quem possui permissão de agendamento pode criar', async () => {
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context('org-a', 'user-owner', 'capturer'), validInput()),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'PERMISSION_DENIED'
  );
});

await test('6. Financeiro não consulta o domínio de campo', async () => {
  const { service } = newService();
  await assert.rejects(
    () => service.listVisits(context('org-a', 'user-owner', 'finance')),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'PERMISSION_DENIED'
  );
});

await test('7. Superadministrador global permanece fora do escopo organizacional', async () => {
  const { service } = newService();
  const ctx = context('org-a', 'user-owner', 'none');
  await assert.rejects(
    () => service.listVisits(ctx),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'PERMISSION_DENIED'
  );
});

await test('8. Responsável precisa existir na mesma organização', async () => {
  const maps = baseMaps();
  maps.members.set('foreign-user', {
    exists: true,
    organizationId: 'org-b',
    userId: 'foreign-user',
    isActive: true,
    canExecute: true,
  });
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context('org-a', 'user-owner', 'owner', maps), validInput('foreign-user')),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'RESPONSIBLE_NOT_FOUND'
  );
});

await test('9. Integrante inativo não pode ser responsável', async () => {
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context(), validInput('user-inactive')),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'RESPONSIBLE_INACTIVE'
  );
});

await test('9A. Responsável ativo sem permissão de execução é recusado', async () => {
  const maps = baseMaps();
  maps.members.set('user-finance', {
    exists: true,
    organizationId: 'org-a',
    userId: 'user-finance',
    isActive: true,
    canExecute: false,
    name: 'Financeiro',
  });
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context('org-a', 'user-owner', 'owner', maps), validInput('user-finance')),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'RESPONSIBLE_INELIGIBLE'
  );
});

await test('10. Cliente precisa existir na organização', async () => {
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context(), { ...validInput(), clientId: 'missing-client' }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'CLIENT_NOT_FOUND'
  );
});

await test('11. Cliente inativo não recebe nova visita', async () => {
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context(), {
      ...validInput(),
      clientId: 'client-inactive',
      propertyId: null,
      proposalId: null,
      appraisalId: null,
    }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'CLIENT_INACTIVE'
  );
});

await test('12. Imóvel precisa pertencer à organização e estar ativo', async () => {
  const maps = baseMaps();
  maps.properties.set('foreign-property', {
    exists: true,
    organizationId: 'org-b',
    status: 'active',
    clientIds: ['client-a'],
  });
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context('org-a', 'user-owner', 'owner', maps), {
      ...validInput(),
      propertyId: 'foreign-property',
      proposalId: null,
      appraisalId: null,
    }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'PROPERTY_NOT_FOUND'
  );
  await assert.rejects(
    () => service.createVisit(context(), {
      ...validInput(),
      propertyId: 'property-inactive',
      proposalId: null,
      appraisalId: null,
    }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'PROPERTY_INACTIVE'
  );
});

await test('13. Imóvel incompatível com o cliente é recusado', async () => {
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context(), {
      ...validInput(),
      propertyId: 'property-other-client',
      proposalId: null,
      appraisalId: null,
    }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'PROPERTY_CLIENT_MISMATCH'
  );
});

await test('14. Proposta deve corresponder ao cliente e imóvel', async () => {
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context(), {
      ...validInput(),
      proposalId: 'proposal-mismatch',
      appraisalId: null,
    }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'PROPOSAL_MISMATCH'
  );
});

await test('15. Proposta vinculada pode derivar o imóvel quando ele não foi informado', async () => {
  const { service } = newService();
  const visit = await service.createVisit(context(), {
    ...validInput(),
    propertyId: null,
    appraisalId: null,
  });
  assert.equal(visit.propertyId, 'property-a');
});

await test('16. Laudo deve corresponder ao cliente e imóvel', async () => {
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context(), {
      ...validInput(),
      proposalId: null,
      appraisalId: 'appraisal-mismatch',
    }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'APPRAISAL_MISMATCH'
  );
});

await test('17. Data inválida é recusada', async () => {
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context(), { ...validInput(), scheduledFor: 'data-invalida' }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_DATE'
  );
});

await test('18. Finalidade vazia ou excessiva é recusada', async () => {
  const { service } = newService();
  await assert.rejects(
    () => service.createVisit(context(), { ...validInput(), purpose: '  ' }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_PURPOSE'
  );
  await assert.rejects(
    () => service.createVisit(context(), { ...validInput(), purpose: 'x'.repeat(501) }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_PURPOSE'
  );
});

await test('19. Listagem e leitura são isoladas por organização', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const service = new TechnicalVisitService(
    gateway,
    new FixedClock('2026-09-02T15:00:00.000Z'),
    new SequentialIds()
  );
  const visitA = await service.createVisit(context('org-a'), validInput());
  const mapsB = baseMaps('org-b');
  const visitB = await service.createVisit(
    context('org-b', 'user-owner', 'owner', mapsB),
    {
      ...validInput(),
      clientId: 'client-a',
      propertyId: 'property-a',
      proposalId: 'proposal-a',
      appraisalId: 'appraisal-a',
    }
  );
  assert.equal((await service.listVisits(context('org-a'))).length, 1);
  assert.equal((await service.listVisits(context('org-b', 'user-owner', 'owner', mapsB))).length, 1);
  assert.equal(await service.getVisitById(context('org-a'), visitB.id), null);
  assert.equal(await service.getVisitById(context('org-b', 'user-owner', 'owner', mapsB), visitA.id), null);
});

await test('20. Alteração sensível exige motivo e versão esperada', async () => {
  const { service } = newService();
  const ctx = context();
  const visit = await service.createVisit(ctx, validInput());
  await assert.rejects(
    () => service.updateVisit(ctx, visit.id, {
      scheduledFor: '2026-09-06T12:00:00.000Z',
      expectedVersion: visit.version,
      changeReason: '',
    }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'REASON_REQUIRED'
  );
  await assert.rejects(
    () => service.updateVisit(ctx, visit.id, {
      scheduledFor: '2026-09-06T12:00:00.000Z',
      expectedVersion: 999,
      changeReason: 'Remarcação autorizada',
    }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'CONCURRENCY_CONFLICT'
  );
});

await test('21. Alteração de planejamento incrementa versão e preserva auditoria', async () => {
  const { service } = newService();
  const ctx = context();
  const visit = await service.createVisit(ctx, validInput());
  const updated = await service.updateVisit(ctx, visit.id, {
    scheduledFor: '2026-09-06T12:00:00.000Z',
    expectedVersion: visit.version,
    changeReason: 'Ajuste solicitado pelo cliente',
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.scheduledFor, '2026-09-06T12:00:00.000Z');
  const audit = await service.listAudit(ctx, visit.id);
  assert.equal(audit.length, 2);
  assert.equal(audit[1].action, 'updated');
  assert.equal(audit[1].reason, 'Ajuste solicitado pelo cliente');
  assert.deepEqual(audit[1].changedFields, ['scheduledFor']);
});

await test('22. Confirmação é feita por perfil de agendamento', async () => {
  const { service } = newService();
  const ctx = context();
  const visit = await service.createVisit(ctx, validInput());
  const confirmed = await service.transitionVisit(ctx, visit.id, {
    targetStatus: 'confirmed',
    expectedVersion: visit.version,
  });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.version, 2);
  assert.ok(confirmed.confirmedAt);
});

await test('23. Somente o responsável pode iniciar a execução', async () => {
  const { service } = newService();
  const managerCtx = context();
  const visit = await service.createVisit(managerCtx, validInput());
  const confirmed = await service.transitionVisit(managerCtx, visit.id, {
    targetStatus: 'confirmed',
    expectedVersion: visit.version,
  });
  await assert.rejects(
    () => service.transitionVisit(managerCtx, visit.id, {
      targetStatus: 'in_progress',
      expectedVersion: confirmed.version,
    }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'RESPONSIBLE_MISMATCH'
  );
});

await test('24. Projetista responsável executa e conclui a visita', async () => {
  const maps = baseMaps();
  const { service } = newService();
  const ownerCtx = context('org-a', 'user-owner', 'owner', maps);
  const techCtx = context('org-a', 'user-tech', 'project_designer', maps);
  const visit = await service.createVisit(ownerCtx, validInput('user-tech'));
  const confirmed = await service.transitionVisit(ownerCtx, visit.id, {
    targetStatus: 'confirmed',
    expectedVersion: visit.version,
  });
  const started = await service.transitionVisit(techCtx, visit.id, {
    targetStatus: 'in_progress',
    expectedVersion: confirmed.version,
  });
  const completed = await service.transitionVisit(techCtx, visit.id, {
    targetStatus: 'completed',
    expectedVersion: started.version,
  });
  assert.equal(started.status, 'in_progress');
  assert.equal(completed.status, 'completed');
  assert.ok(started.startedAt);
  assert.ok(completed.completedAt);
});

await test('25. Cancelamento exige motivo e fica auditado', async () => {
  const { service } = newService();
  const ctx = context();
  const visit = await service.createVisit(ctx, validInput());
  await assert.rejects(
    () => service.transitionVisit(ctx, visit.id, {
      targetStatus: 'cancelled',
      expectedVersion: visit.version,
      reason: '',
    }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'REASON_REQUIRED'
  );
  const cancelled = await service.transitionVisit(ctx, visit.id, {
    targetStatus: 'cancelled',
    expectedVersion: visit.version,
    reason: 'Cliente solicitou cancelamento',
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancellationReason, 'Cliente solicitou cancelamento');
  const audit = await service.listAudit(ctx, visit.id);
  assert.equal(audit.at(-1)?.reason, 'Cliente solicitou cancelamento');
});

await test('26. Visita em execução ou terminal bloqueia alteração de planejamento', async () => {
  const maps = baseMaps();
  const { service } = newService();
  const ownerCtx = context('org-a', 'user-owner', 'owner', maps);
  const techCtx = context('org-a', 'user-tech', 'project_designer', maps);
  const visit = await service.createVisit(ownerCtx, validInput('user-tech'));
  const confirmed = await service.transitionVisit(ownerCtx, visit.id, {
    targetStatus: 'confirmed',
    expectedVersion: visit.version,
  });
  const started = await service.transitionVisit(techCtx, visit.id, {
    targetStatus: 'in_progress',
    expectedVersion: confirmed.version,
  });
  await assert.rejects(
    () => service.updateVisit(ownerCtx, visit.id, {
      purpose: 'Mudança indevida durante execução',
      expectedVersion: started.version,
      changeReason: 'Tentativa',
    }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'VISIT_LOCKED'
  );
});

await test('27. Corrida de versão tem um único vencedor', async () => {
  const { service } = newService();
  const ctx = context();
  const visit = await service.createVisit(ctx, validInput());
  const results = await Promise.allSettled([
    service.updateVisit(ctx, visit.id, {
      purpose: 'Primeira atualização concorrente',
      expectedVersion: visit.version,
      changeReason: 'Operação concorrente A',
    }),
    service.updateVisit(ctx, visit.id, {
      purpose: 'Segunda atualização concorrente',
      expectedVersion: visit.version,
      changeReason: 'Operação concorrente B',
    }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
});

await test('28. Gateway indisponível fecha produção sem simular sucesso', async () => {
  const service = new TechnicalVisitService(new UnavailableTechnicalVisitGateway());
  await assert.rejects(
    () => service.listVisits(context()),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'SERVICE_UNAVAILABLE'
  );
});

await test('29. Rota, navegação, provider e barreira de build estão integrados', () => {
  const paths = fs.readFileSync('src/routes/paths.ts', 'utf8');
  const routes = fs.readFileSync('src/routes/AppRoutes.tsx', 'utf8');
  const navigation = fs.readFileSync('src/config/navigation.ts', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const leak = fs.readFileSync('scripts/verify-leak-free-build.js', 'utf8');
  assert.equal(paths.includes("FIELD_VISITS: '/visitas'"), true);
  assert.equal(routes.includes('ROUTES.FIELD_VISITS'), true);
  assert.equal(routes.includes('permission="surveys_and_visits:view"'), true);
  assert.equal(navigation.includes('nav-item-field-visits'), true);
  assert.equal(app.includes('FieldVisitsProvider'), true);
  assert.equal(leak.includes('PreviewTechnicalVisitGateway'), true);
});

await test('30. Escopo não antecipa agenda detalhada, frota, fotos ou formulário de campo', () => {
  const source = [
    fs.readFileSync('src/types/technicalVisit.ts', 'utf8'),
    fs.readFileSync('src/fieldVisits/technicalVisitService.ts', 'utf8'),
  ].join('\n');
  assert.equal(/vehicleId|routePlan|photoEvidence|formSections|checklistItems/.test(source), false);
});

console.log('\n====================================================');
console.log(`Resultado: ${passed} passaram, ${failed} falharam`);
console.log('====================================================');

if (failed > 0) process.exit(1);
