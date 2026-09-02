import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TechnicalVisitDomainError,
  TechnicalVisitScheduleConflictError,
  type TechnicalVisitApplicationContext,
  type TechnicalVisitMemberResolution,
  type TechnicalVisitClientResolution,
  type TechnicalVisitPropertyResolution,
  type TechnicalVisitProposalResolution,
  type TechnicalVisitAppraisalResolution,
  type UpdateTechnicalVisitPreparationInput,
} from '../src/types/technicalVisit.ts';
import { PreviewTechnicalVisitGateway } from '../src/fieldVisits/preview/previewTechnicalVisitGateway.ts';
import { UnavailableTechnicalVisitGateway } from '../src/fieldVisits/unavailableGateway.ts';
import {
  TechnicalVisitService,
  type TechnicalVisitClock,
  type TechnicalVisitIdGenerator,
} from '../src/fieldVisits/technicalVisitService.ts';
import { TechnicalVisitPreparationService } from '../src/fieldVisits/preparationService.ts';
import {
  addMinutesToIso,
  intervalsOverlap,
  isValidIanaTimeZone,
  utcToZonedLocalInput,
  zonedLocalDateTimeToUtc,
} from '../src/fieldVisits/schedule.ts';
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

class MutableClock implements TechnicalVisitClock {
  private current: Date;

  constructor(iso: string) {
    this.current = new Date(iso);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(iso: string): void {
    this.current = new Date(iso);
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
      ['user-owner', {
        exists: true,
        organizationId: orgId,
        userId: 'user-owner',
        isActive: true,
        canExecute: true,
        name: 'Owner',
      }],
      ['user-tech', {
        exists: true,
        organizationId: orgId,
        userId: 'user-tech',
        isActive: true,
        canExecute: true,
        name: 'Técnico A',
      }],
      ['user-tech-2', {
        exists: true,
        organizationId: orgId,
        userId: 'user-tech-2',
        isActive: true,
        canExecute: true,
        name: 'Técnico B',
      }],
      ['user-participant', {
        exists: true,
        organizationId: orgId,
        userId: 'user-participant',
        isActive: true,
        canExecute: false,
        name: 'Participante',
      }],
      ['user-inactive', {
        exists: true,
        organizationId: orgId,
        userId: 'user-inactive',
        isActive: false,
        canExecute: false,
        name: 'Inativo',
      }],
    ]),
    clients: new Map([
      ['client-a', { exists: true, organizationId: orgId, status: 'active' }],
    ]),
    properties: new Map([
      ['property-a', {
        exists: true,
        organizationId: orgId,
        status: 'active',
        clientIds: ['client-a'],
      }],
    ]),
    proposals: new Map(),
    appraisals: new Map(),
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
      maps.members.get(id) ?? {
        exists: false,
        organizationId: null,
        userId: id,
        isActive: false,
        canExecute: false,
      },
    resolveClient: async (id) =>
      maps.clients.get(id) ?? { exists: false, organizationId: null, status: null },
    resolveProperty: async (id) =>
      maps.properties.get(id) ?? {
        exists: false,
        organizationId: null,
        status: null,
        clientIds: [],
      },
    resolveProposal: async (id) =>
      maps.proposals.get(id) ?? {
        exists: false,
        organizationId: null,
        clientId: null,
        propertyId: null,
      },
    resolveAppraisal: async (id) =>
      maps.appraisals.get(id) ?? {
        exists: false,
        organizationId: null,
        clientId: null,
        propertyId: null,
      },
  };
}

function createInput(
  responsibleUserId = 'user-tech',
  scheduledFor = '2026-09-06T12:00:00.000Z'
) {
  return {
    activityType: 'technical_visit' as const,
    clientId: 'client-a',
    propertyId: 'property-a',
    proposalId: null,
    appraisalId: null,
    responsibleUserId,
    scheduledFor,
    purpose: 'Visita técnica para acompanhamento do imóvel.',
  };
}

function preparationInput(
  expectedVersion: number,
  overrides: Partial<UpdateTechnicalVisitPreparationInput> = {}
): UpdateTechnicalVisitPreparationInput {
  return {
    localStart: '2026-09-05T09:00',
    timeZone: 'America/Sao_Paulo',
    durationMinutes: 60,
    address: {
      addressLine: 'Fazenda Boa Vista, acesso pela estrada municipal',
      city: 'Uberaba',
      state: 'MG',
      postalCode: '38000-000',
      notes: 'Entrada pelo portão principal',
    },
    participantUserIds: ['user-participant'],
    checklist: [
      { label: 'Confirmar documentos do imóvel', required: true },
      { label: 'Levar equipamentos de medição', required: false },
    ],
    routeNotes: 'Saída do escritório e deslocamento direto até a propriedade.',
    expectedVersion,
    changeReason: 'Preparação operacional da visita',
    ...overrides,
  };
}

function services() {
  const gateway = new PreviewTechnicalVisitGateway();
  const clock = new MutableClock('2026-09-02T16:00:00.000Z');
  const ids = new SequentialIds();
  return {
    gateway,
    clock,
    visitService: new TechnicalVisitService(gateway, clock, ids),
    preparationService: new TechnicalVisitPreparationService(gateway, clock, ids),
  };
}

console.log('====================================================');
console.log(' AGROCORE — OE-007.002 AGENDA E PREPARAÇÃO');
console.log('====================================================\n');

await test('1. Reconhece fusos IANA válidos e rejeita fuso inexistente', () => {
  assert.equal(isValidIanaTimeZone('America/Sao_Paulo'), true);
  assert.equal(isValidIanaTimeZone('America/Manaus'), true);
  assert.equal(isValidIanaTimeZone('AgroCore/Invalid'), false);
});

await test('2. Converte horário local de São Paulo para UTC corretamente', () => {
  assert.equal(
    zonedLocalDateTimeToUtc('2026-09-05T09:30', 'America/Sao_Paulo'),
    '2026-09-05T12:30:00.000Z'
  );
});

await test('3. Converte horário local de Manaus para UTC corretamente', () => {
  assert.equal(
    zonedLocalDateTimeToUtc('2026-09-05T09:30', 'America/Manaus'),
    '2026-09-05T13:30:00.000Z'
  );
});

await test('4. Rejeita horário local inexistente durante mudança de fuso', () => {
  assert.throws(
    () => zonedLocalDateTimeToUtc('2026-03-08T02:30', 'America/New_York'),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_DATE'
  );
});

await test('4A. Rejeita horário local ambíguo durante retorno de horário de verão', () => {
  assert.throws(
    () => zonedLocalDateTimeToUtc('2026-11-01T01:30', 'America/New_York'),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_DATE'
  );
});

await test('5. Converte UTC de volta para o valor local usado na interface', () => {
  assert.equal(
    utcToZonedLocalInput('2026-09-05T12:30:00.000Z', 'America/Sao_Paulo'),
    '2026-09-05T09:30'
  );
});

await test('6. Calcula fim de intervalo e sobreposição sem considerar horários adjacentes como conflito', () => {
  assert.equal(
    addMinutesToIso('2026-09-05T12:00:00.000Z', 60),
    '2026-09-05T13:00:00.000Z'
  );
  assert.equal(
    intervalsOverlap(
      '2026-09-05T12:00:00.000Z',
      '2026-09-05T13:00:00.000Z',
      '2026-09-05T12:30:00.000Z',
      '2026-09-05T13:30:00.000Z'
    ),
    true
  );
  assert.equal(
    intervalsOverlap(
      '2026-09-05T12:00:00.000Z',
      '2026-09-05T13:00:00.000Z',
      '2026-09-05T13:00:00.000Z',
      '2026-09-05T14:00:00.000Z'
    ),
    false
  );
});

await test('7. Salva preparação completa com horário, duração, endereço, participantes, checklist e roteiro', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());
  const prepared = await preparationService.prepareVisit(
    ctx,
    visit.id,
    preparationInput(visit.version)
  );

  assert.equal(prepared.version, 2);
  assert.equal(prepared.scheduledFor, '2026-09-05T12:00:00.000Z');
  assert.equal(prepared.preparation?.timeZone, 'America/Sao_Paulo');
  assert.equal(prepared.preparation?.durationMinutes, 60);
  assert.equal(prepared.preparation?.address.city, 'Uberaba');
  assert.deepEqual(prepared.preparation?.participantUserIds, ['user-participant']);
  assert.equal(prepared.preparation?.checklist.length, 2);
  assert.equal(prepared.preparation?.routeNotes?.includes('deslocamento'), true);
});

await test('8. Responsável não é duplicado como participante adicional', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());
  const prepared = await preparationService.prepareVisit(
    ctx,
    visit.id,
    preparationInput(visit.version, {
      participantUserIds: ['user-tech', 'user-participant', 'user-participant'],
    })
  );
  assert.deepEqual(prepared.preparation?.participantUserIds, ['user-participant']);
});

await test('9. Participante precisa ser integrante ativo da mesma organização', async () => {
  const { visitService, preparationService } = services();
  const maps = baseMaps();
  maps.members.set('foreign-user', {
    exists: true,
    organizationId: 'org-b',
    userId: 'foreign-user',
    isActive: true,
    canExecute: false,
  });
  const ctx = context('org-a', 'user-owner', 'owner', maps);
  const visit = await visitService.createVisit(ctx, createInput());

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        ctx,
        visit.id,
        preparationInput(visit.version, { participantUserIds: ['user-inactive'] })
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_PARTICIPANT'
  );

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        ctx,
        visit.id,
        preparationInput(visit.version, { participantUserIds: ['foreign-user'] })
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_PARTICIPANT'
  );
});

await test('10. Duração fora do intervalo permitido é recusada', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        ctx,
        visit.id,
        preparationInput(visit.version, { durationMinutes: 10 })
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_DURATION'
  );
});

await test('11. Endereço incompleto ou excessivo é recusado', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        ctx,
        visit.id,
        preparationInput(visit.version, {
          address: {
            addressLine: ' ',
            city: 'U',
            state: 'M',
            postalCode: null,
            notes: null,
          },
        })
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_ADDRESS'
  );
});

await test('12. Checklist recusa rótulos duplicados e preserva identidade dos itens existentes', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        ctx,
        visit.id,
        preparationInput(visit.version, {
          checklist: [
            { label: 'Levar documentos', required: true },
            { label: 'levar documentos', required: false },
          ],
        })
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_CHECKLIST'
  );

  const prepared = await preparationService.prepareVisit(
    ctx,
    visit.id,
    preparationInput(visit.version)
  );
  const firstId = prepared.preparation!.checklist[0].id;
  const preparedAgain = await preparationService.prepareVisit(
    ctx,
    visit.id,
    preparationInput(prepared.version, {
      checklist: prepared.preparation!.checklist.map((item) => ({
        id: item.id,
        label: item.label,
        required: item.required,
      })),
      changeReason: 'Revisão do checklist',
    })
  );
  assert.equal(preparedAgain.preparation!.checklist[0].id, firstId);
});

await test('13. Roteiro excessivo é recusado', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        ctx,
        visit.id,
        preparationInput(visit.version, { routeNotes: 'x'.repeat(1201) })
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'INVALID_ROUTE'
  );
});

await test('14. Conflito de horário do mesmo responsável é sinalizado e não é salvo silenciosamente', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const first = await visitService.createVisit(ctx, createInput('user-tech'));
  const second = await visitService.createVisit(ctx, createInput('user-tech'));

  const preparedFirst = await preparationService.prepareVisit(
    ctx,
    first.id,
    preparationInput(first.version)
  );
  assert.equal(preparedFirst.preparation?.conflictOverride, null);

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        ctx,
        second.id,
        preparationInput(second.version, { localStart: '2026-09-05T09:30' })
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitScheduleConflictError &&
      error.conflicts.some((conflict) => conflict.reasons.includes('responsible'))
  );
});

await test('15. Exceção de conflito autorizada exige motivo e fica registrada', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const first = await visitService.createVisit(ctx, createInput('user-tech'));
  const second = await visitService.createVisit(ctx, createInput('user-tech'));

  await preparationService.prepareVisit(ctx, first.id, preparationInput(first.version));
  const preparedSecond = await preparationService.prepareVisit(
    ctx,
    second.id,
    preparationInput(second.version, {
      localStart: '2026-09-05T09:30',
      conflictOverrideReason: 'Equipes compartilharão apenas parte do deslocamento',
    })
  );

  assert.ok(preparedSecond.preparation?.conflictOverride);
  assert.equal(
    preparedSecond.preparation?.conflictOverride?.conflictVisitIds.includes(first.id),
    true
  );
  assert.equal(
    preparedSecond.preparation?.conflictOverride?.authorizedByUserId,
    'user-owner'
  );
});

await test('16. Conflito de participante compartilhado é detectado mesmo com responsáveis diferentes', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const first = await visitService.createVisit(ctx, createInput('user-tech'));
  const second = await visitService.createVisit(ctx, createInput('user-tech-2'));

  await preparationService.prepareVisit(
    ctx,
    first.id,
    preparationInput(first.version, { participantUserIds: ['user-participant'] })
  );

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        ctx,
        second.id,
        preparationInput(second.version, {
          localStart: '2026-09-05T09:15',
          participantUserIds: ['user-participant'],
        })
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitScheduleConflictError &&
      error.conflicts.some((conflict) => conflict.reasons.includes('participant'))
  );
});

await test('17. Acesso cruzado por organização é recusado como visita inexistente', async () => {
  const { visitService, preparationService } = services();
  const ctxA = context('org-a', 'user-owner', 'owner', baseMaps('org-a'));
  const ctxB = context('org-b', 'user-owner', 'owner', baseMaps('org-b'));
  const visitA = await visitService.createVisit(ctxA, createInput());

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        ctxB,
        visitA.id,
        preparationInput(visitA.version)
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'VISIT_NOT_FOUND'
  );
});

await test('18. Horários adjacentes não geram falso conflito', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const first = await visitService.createVisit(ctx, createInput('user-tech'));
  const second = await visitService.createVisit(ctx, createInput('user-tech'));

  await preparationService.prepareVisit(
    ctx,
    first.id,
    preparationInput(first.version, { localStart: '2026-09-05T09:00', durationMinutes: 60 })
  );

  const preparedSecond = await preparationService.prepareVisit(
    ctx,
    second.id,
    preparationInput(second.version, { localStart: '2026-09-05T10:00', durationMinutes: 60 })
  );
  assert.equal(preparedSecond.preparation?.conflictOverride, null);
});

await test('19. Visita cancelada não bloqueia nova agenda no mesmo período', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const first = await visitService.createVisit(ctx, createInput('user-tech'));
  const second = await visitService.createVisit(ctx, createInput('user-tech'));

  const preparedFirst = await preparationService.prepareVisit(
    ctx,
    first.id,
    preparationInput(first.version)
  );
  await visitService.transitionVisit(ctx, first.id, {
    targetStatus: 'cancelled',
    expectedVersion: preparedFirst.version,
    reason: 'Cliente solicitou cancelamento',
  });

  const preparedSecond = await preparationService.prepareVisit(
    ctx,
    second.id,
    preparationInput(second.version)
  );
  assert.equal(preparedSecond.preparation?.conflictOverride, null);
});

await test('20. Conflitos nunca atravessam organizações', async () => {
  const gateway = new PreviewTechnicalVisitGateway();
  const clock = new MutableClock('2026-09-02T16:00:00.000Z');
  const ids = new SequentialIds();
  const visitService = new TechnicalVisitService(gateway, clock, ids);
  const preparationService = new TechnicalVisitPreparationService(gateway, clock, ids);

  const ctxA = context('org-a', 'user-owner', 'owner', baseMaps('org-a'));
  const ctxB = context('org-b', 'user-owner', 'owner', baseMaps('org-b'));

  const visitA = await visitService.createVisit(ctxA, createInput('user-tech'));
  const visitB = await visitService.createVisit(ctxB, createInput('user-tech'));

  await preparationService.prepareVisit(ctxA, visitA.id, preparationInput(visitA.version));
  const preparedB = await preparationService.prepareVisit(
    ctxB,
    visitB.id,
    preparationInput(visitB.version)
  );

  assert.equal(preparedB.preparation?.conflictOverride, null);
});

await test('21. Remarcação altera horário, versão e trilha de auditoria', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());
  const prepared = await preparationService.prepareVisit(
    ctx,
    visit.id,
    preparationInput(visit.version)
  );

  const rescheduled = await preparationService.prepareVisit(
    ctx,
    visit.id,
    preparationInput(prepared.version, {
      localStart: '2026-09-05T11:00',
      changeReason: 'Cliente solicitou novo horário',
    })
  );

  assert.equal(rescheduled.scheduledFor, '2026-09-05T14:00:00.000Z');
  assert.equal(rescheduled.version, 3);
  const audit = await visitService.listAudit(ctx, visit.id);
  assert.equal(audit.at(-1)?.reason, 'Cliente solicitou novo horário');
  assert.equal(audit.at(-1)?.changedFields.includes('scheduledFor'), true);
  assert.equal(audit.at(-1)?.changedFields.includes('preparation'), true);
});

await test('22. Preparação só pode ser alterada por perfil com permissão de agendamento', async () => {
  const { visitService, preparationService } = services();
  const ownerCtx = context();
  const visit = await visitService.createVisit(ownerCtx, createInput());

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        context('org-a', 'user-owner', 'capturer'),
        visit.id,
        preparationInput(visit.version)
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'PERMISSION_DENIED'
  );
});

await test('23. Preparação é bloqueada depois que a execução começa', async () => {
  const maps = baseMaps();
  const { visitService, preparationService } = services();
  const ownerCtx = context('org-a', 'user-owner', 'owner', maps);
  const techCtx = context('org-a', 'user-tech', 'project_designer', maps);

  const visit = await visitService.createVisit(ownerCtx, createInput('user-tech'));
  const prepared = await preparationService.prepareVisit(
    ownerCtx,
    visit.id,
    preparationInput(visit.version, {
      checklist: [{ label: 'Levar equipamentos', required: false }],
    })
  );
  const confirmed = await visitService.transitionVisit(ownerCtx, visit.id, {
    targetStatus: 'confirmed',
    expectedVersion: prepared.version,
  });
  const started = await visitService.transitionVisit(techCtx, visit.id, {
    targetStatus: 'in_progress',
    expectedVersion: confirmed.version,
  });

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        ownerCtx,
        visit.id,
        preparationInput(started.version, { changeReason: 'Alteração tardia' })
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'PREPARATION_LOCKED'
  );
});

await test('24. Checklist pode ser concluído e reaberto com autoria e versão', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());
  const prepared = await preparationService.prepareVisit(
    ctx,
    visit.id,
    preparationInput(visit.version)
  );
  const itemId = prepared.preparation!.checklist[0].id;

  const completed = await preparationService.setChecklistItemCompletion(
    ctx,
    visit.id,
    {
      itemId,
      completed: true,
      expectedVersion: prepared.version,
    }
  );
  const completedItem = completed.preparation!.checklist.find((item) => item.id === itemId)!;
  assert.equal(completedItem.completed, true);
  assert.equal(completedItem.completedByUserId, 'user-owner');
  assert.ok(completedItem.completedAt);

  const reopened = await preparationService.setChecklistItemCompletion(
    ctx,
    visit.id,
    {
      itemId,
      completed: false,
      expectedVersion: completed.version,
    }
  );
  const reopenedItem = reopened.preparation!.checklist.find((item) => item.id === itemId)!;
  assert.equal(reopenedItem.completed, false);
  assert.equal(reopenedItem.completedAt, null);
});

await test('25. Item de checklist inexistente é recusado', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());
  const prepared = await preparationService.prepareVisit(
    ctx,
    visit.id,
    preparationInput(visit.version)
  );

  await assert.rejects(
    () =>
      preparationService.setChecklistItemCompletion(ctx, visit.id, {
        itemId: 'missing-item',
        completed: true,
        expectedVersion: prepared.version,
      }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'CHECKLIST_ITEM_NOT_FOUND'
  );
});

await test('26. Cancelamento continua funcional após a preparação e mantém motivo', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());
  const prepared = await preparationService.prepareVisit(
    ctx,
    visit.id,
    preparationInput(visit.version)
  );

  const cancelled = await visitService.transitionVisit(ctx, visit.id, {
    targetStatus: 'cancelled',
    expectedVersion: prepared.version,
    reason: 'Chuva forte inviabilizou a saída',
  });

  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancellationReason, 'Chuva forte inviabilizou a saída');
});

await test('27. Concorrência de preparação tem um único vencedor', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());

  const results = await Promise.allSettled([
    preparationService.prepareVisit(
      ctx,
      visit.id,
      preparationInput(visit.version, { localStart: '2026-09-05T09:00' })
    ),
    preparationService.prepareVisit(
      ctx,
      visit.id,
      preparationInput(visit.version, { localStart: '2026-09-05T10:00' })
    ),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
});

await test('28. Interface de preparação expõe agenda, participantes, checklist e roteiro', () => {
  const source = fs.readFileSync('src/fieldVisits/VisitPreparationPanel.tsx', 'utf8');
  for (const marker of [
    'Data e hora local',
    'Fuso horário',
    'Duração em minutos',
    'Participantes adicionais',
    'Checklist prévio',
    'Roteiro e orientações',
    'Autorizar exceção e salvar',
  ]) {
    assert.equal(source.includes(marker), true, `Marcador ausente: ${marker}`);
  }
});

await test('29. OE-007.002 não antecipa formulário de campo, fotos, geolocalização nem frota', () => {
  const source = [
    fs.readFileSync('src/types/technicalVisit.ts', 'utf8'),
    fs.readFileSync('src/fieldVisits/preparationService.ts', 'utf8'),
    fs.readFileSync('src/fieldVisits/VisitPreparationPanel.tsx', 'utf8'),
  ].join('\n');
  assert.equal(
    /photoEvidence|formSections|fieldResponses|latitude|longitude|vehicleReference|vehicleGateway|Veículo previsto/.test(source),
    false
  );
});

await test('30. Serviço de preparação preserva isolamento e auditoria no gateway existente', () => {
  const source = fs.readFileSync('src/fieldVisits/preparationService.ts', 'utf8');
  assert.equal(source.includes('this.gateway.listVisits(context.organizationId'), true);
  assert.equal(source.includes('expectedVersion: input.expectedVersion'), true);
  assert.equal(source.includes("action: 'updated'"), true);
});

await test('31. Todos os perfis oficiais respeitam a matriz positiva e negativa de preparação', async () => {
  for (const role of ['owner', 'company_admin', 'manager', 'project_designer'] as const) {
    const { visitService, preparationService } = services();
    const maps = baseMaps();
    const ownerCtx = context('org-a', 'user-owner', 'owner', maps);
    const visit = await visitService.createVisit(ownerCtx, createInput());
    const actorCtx = context('org-a', 'user-owner', role, maps);
    const prepared = await preparationService.prepareVisit(
      actorCtx,
      visit.id,
      preparationInput(visit.version)
    );
    assert.equal(prepared.preparation?.preparedByUserId, 'user-owner');
  }

  for (const role of ['finance', 'capturer'] as const) {
    const { visitService, preparationService } = services();
    const maps = baseMaps();
    const ownerCtx = context('org-a', 'user-owner', 'owner', maps);
    const visit = await visitService.createVisit(ownerCtx, createInput());
    await assert.rejects(
      () =>
        preparationService.prepareVisit(
          context('org-a', 'user-owner', role, maps),
          visit.id,
          preparationInput(visit.version)
        ),
      (error: unknown) =>
        error instanceof TechnicalVisitDomainError && error.code === 'PERMISSION_DENIED'
    );
  }

  assert.equal(
    getRolePermissions('platform_super_admin').includes('surveys_and_visits:schedule'),
    false
  );
});

await test('32. Início da execução exige preparação operacional', async () => {
  const maps = baseMaps();
  const { visitService } = services();
  const ownerCtx = context('org-a', 'user-owner', 'owner', maps);
  const techCtx = context('org-a', 'user-tech', 'project_designer', maps);
  const visit = await visitService.createVisit(ownerCtx, createInput('user-tech'));
  const confirmed = await visitService.transitionVisit(ownerCtx, visit.id, {
    targetStatus: 'confirmed',
    expectedVersion: visit.version,
  });

  await assert.rejects(
    () =>
      visitService.transitionVisit(techCtx, visit.id, {
        targetStatus: 'in_progress',
        expectedVersion: confirmed.version,
      }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'PREPARATION_REQUIRED'
  );
});

await test('33. Checklist obrigatório precisa estar concluído antes do início', async () => {
  const maps = baseMaps();
  const { visitService, preparationService } = services();
  const ownerCtx = context('org-a', 'user-owner', 'owner', maps);
  const techCtx = context('org-a', 'user-tech', 'project_designer', maps);
  const visit = await visitService.createVisit(ownerCtx, createInput('user-tech'));
  const prepared = await preparationService.prepareVisit(
    ownerCtx,
    visit.id,
    preparationInput(visit.version)
  );
  const confirmed = await visitService.transitionVisit(ownerCtx, visit.id, {
    targetStatus: 'confirmed',
    expectedVersion: prepared.version,
  });

  await assert.rejects(
    () =>
      visitService.transitionVisit(techCtx, visit.id, {
        targetStatus: 'in_progress',
        expectedVersion: confirmed.version,
      }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'PREPARATION_INCOMPLETE'
  );

  const requiredItem = confirmed.preparation!.checklist.find((item) => item.required)!;
  const checked = await preparationService.setChecklistItemCompletion(
    ownerCtx,
    visit.id,
    {
      itemId: requiredItem.id,
      completed: true,
      expectedVersion: confirmed.version,
    }
  );
  const started = await visitService.transitionVisit(techCtx, visit.id, {
    targetStatus: 'in_progress',
    expectedVersion: checked.version,
  });
  assert.equal(started.status, 'in_progress');
});

await test('34. Operações concorrentes em visitas diferentes não ignoram conflito de agenda', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const first = await visitService.createVisit(ctx, createInput('user-tech'));
  const second = await visitService.createVisit(ctx, createInput('user-tech'));

  const results = await Promise.allSettled([
    preparationService.prepareVisit(
      ctx,
      first.id,
      preparationInput(first.version, { localStart: '2026-09-05T09:00' })
    ),
    preparationService.prepareVisit(
      ctx,
      second.id,
      preparationInput(second.version, { localStart: '2026-09-05T09:00' })
    ),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(
    rejected?.status === 'rejected' &&
      rejected.reason instanceof TechnicalVisitScheduleConflictError,
    true
  );
});

await test('35. Produção fechada recusa preparação sem gateway persistente real', async () => {
  const preparationService = new TechnicalVisitPreparationService(
    new UnavailableTechnicalVisitGateway()
  );
  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        context(),
        'visit-missing',
        preparationInput(1)
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'SERVICE_UNAVAILABLE'
  );
});

await test('36. Remarcação exige motivo explícito', async () => {
  const { visitService, preparationService } = services();
  const ctx = context();
  const visit = await visitService.createVisit(ctx, createInput());
  const prepared = await preparationService.prepareVisit(
    ctx,
    visit.id,
    preparationInput(visit.version)
  );

  await assert.rejects(
    () =>
      preparationService.prepareVisit(
        ctx,
        visit.id,
        preparationInput(prepared.version, {
          localStart: '2026-09-05T11:00',
          changeReason: '',
        })
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError && error.code === 'REASON_REQUIRED'
  );
});

console.log('\n====================================================');
console.log(`Resultado: ${passed} passaram, ${failed} falharam`);
console.log('====================================================');

if (failed > 0) process.exit(1);
