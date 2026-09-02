import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TechnicalVisitDomainError,
  type TechnicalVisit,
  type TechnicalVisitApplicationContext,
  type TechnicalVisitAuditEntry,
} from '../src/types/technicalVisit.ts';
import type {
  TechnicalVisitFieldSection,
} from '../src/types/technicalVisitFieldForm.ts';
import { getRolePermissions } from '../src/authorization/permissionsMatrix.ts';
import { PreviewTechnicalVisitGateway } from '../src/fieldVisits/preview/previewTechnicalVisitGateway.ts';
import { PreviewTechnicalVisitFieldFormGateway } from '../src/fieldVisits/preview/previewFieldFormGateway.ts';
import { TechnicalVisitFieldFormService } from '../src/fieldVisits/fieldFormService.ts';
import { TechnicalVisitService } from '../src/fieldVisits/technicalVisitService.ts';
import {
  isTechnicalVisitFieldFormComplete,
  validateTechnicalVisitFieldFormSections,
} from '../src/fieldVisits/fieldFormValidation.ts';

let passed = 0;
let failed = 0;

async function test(name: string, operation: () => void | Promise<void>) {
  try {
    await operation();
    passed += 1;
    console.log('  [PASS] ' + name);
  } catch (error) {
    failed += 1;
    console.error('  [FAIL] ' + name);
    console.error(error);
  }
}

function context(
  organizationId = 'org-a',
  userId = 'user-tech',
  role:
    | 'owner'
    | 'company_admin'
    | 'manager'
    | 'project_designer'
    | 'finance'
    | 'capturer'
    | 'none' = 'project_designer'
): TechnicalVisitApplicationContext {
  return {
    organizationId,
    actor: {
      userId,
      role,
      isActive: true,
      permissions: [...getRolePermissions(role)],
    },
    resolveMember: async (id) => ({
      exists: true,
      organizationId,
      userId: id,
      isActive: true,
      canExecute: true,
    }),
    resolveClient: async () => ({
      exists: true,
      organizationId,
      status: 'active',
    }),
    resolveProperty: async () => ({
      exists: true,
      organizationId,
      status: 'active',
      clientIds: ['client-a'],
    }),
    resolveProposal: async () => ({
      exists: true,
      organizationId,
      clientId: 'client-a',
      propertyId: 'property-a',
    }),
    resolveAppraisal: async () => ({
      exists: true,
      organizationId,
      clientId: 'client-a',
      propertyId: 'property-a',
    }),
  };
}

function visit(
  status: TechnicalVisit['status'] = 'confirmed',
  organizationId = 'org-a',
  responsibleUserId = 'user-tech'
): TechnicalVisit {
  return {
    id: 'visit-' + organizationId + '-' + status,
    organizationId,
    activityType: 'technical_visit',
    status,
    clientId: 'client-a',
    propertyId: 'property-a',
    proposalId: null,
    appraisalId: null,
    responsibleUserId,
    scheduledFor: '2026-09-05T12:00:00.000Z',
    preparation: null,
    purpose: 'Coleta técnica em campo',
    createdByUserId: 'user-owner',
    createdAt: '2026-09-02T15:00:00.000Z',
    updatedByUserId: responsibleUserId,
    updatedAt: '2026-09-02T15:00:00.000Z',
    confirmedAt: status === 'planned' ? null : '2026-09-02T15:00:00.000Z',
    startedAt:
      status === 'in_progress' || status === 'completed'
        ? '2026-09-02T15:05:00.000Z'
        : null,
    completedAt:
      status === 'completed' ? '2026-09-02T16:00:00.000Z' : null,
    cancelledAt:
      status === 'cancelled' ? '2026-09-02T15:10:00.000Z' : null,
    cancellationReason:
      status === 'cancelled' ? 'Cancelamento de teste' : null,
    version: 1,
  };
}

async function seedVisit(
  gateway: PreviewTechnicalVisitGateway,
  entity: TechnicalVisit
) {
  const audit: TechnicalVisitAuditEntry = {
    id: 'audit-' + entity.id,
    organizationId: entity.organizationId,
    visitId: entity.id,
    action: 'created',
    actorUserId: entity.createdByUserId,
    at: entity.createdAt,
    version: entity.version,
    fromStatus: null,
    toStatus: entity.status,
    reason: null,
    changedFields: ['status'],
  };
  await gateway.createVisit({ visit: entity, audit, expectedVersion: null });
}

function validSections(answer: string | null = 'Condições verificadas em campo.'): TechnicalVisitFieldSection[] {
  return [
    {
      id: 'section:general',
      title: 'Verificações gerais',
      description: 'Registro técnico da execução',
      order: 1,
      items: [
        {
          id: 'item:summary',
          label: 'Resumo da vistoria',
          type: 'long_text',
          required: true,
          options: [],
          answer,
          observation: null,
        },
      ],
    },
  ];
}

function typedSection(
  type:
    | 'short_text'
    | 'long_text'
    | 'integer'
    | 'decimal'
    | 'boolean'
    | 'date'
    | 'time'
    | 'single_choice'
    | 'multiple_choice',
  answer: string | number | boolean | readonly string[] | null,
  options: readonly string[] = []
): TechnicalVisitFieldSection[] {
  return [
    {
      id: 'section:typed',
      title: 'Medição',
      description: null,
      order: 1,
      items: [
        {
          id: 'item:typed',
          label: 'Resposta',
          type,
          required: true,
          options,
          answer,
          observation: 'Observação permitida',
        },
      ],
    },
  ];
}

async function fixture(status: TechnicalVisit['status'] = 'confirmed') {
  const visitGateway = new PreviewTechnicalVisitGateway();
  const fieldFormGateway = new PreviewTechnicalVisitFieldFormGateway();
  const entity = visit(status);
  await seedVisit(visitGateway, entity);
  const service = new TechnicalVisitFieldFormService(
    fieldFormGateway,
    visitGateway
  );
  return { visitGateway, fieldFormGateway, service, entity };
}

console.log('====================================================');
console.log(' AGROCORE — OE-007.003 FORMULÁRIO DE CAMPO');
console.log('====================================================\n');

await test('1. Formulário inexistente retorna nulo sem criar dado fictício', async () => {
  const { service, entity } = await fixture();
  assert.equal(await service.getFieldForm(context(), entity.id), null);
});

await test('2. Primeiro salvamento cria rascunho versão 1', async () => {
  const { service, entity } = await fixture();
  const form = await service.saveDraft(context(), entity.id, validSections(null), 0);
  assert.equal(form.status, 'draft');
  assert.equal(form.version, 1);
  assert.equal(form.sections.length, 1);
});

await test('3. Salvamento progressivo gera revisão append-only', async () => {
  const { service, entity } = await fixture();
  const first = await service.saveDraft(context(), entity.id, validSections(null), 0);
  await service.saveDraft(context(), entity.id, validSections('Resposta parcial'), first.version);
  const revisions = await service.listRevisions(context(), entity.id);
  assert.equal(revisions.length, 2);
  assert.deepEqual(revisions.map((item) => item.version), [1, 2]);
  assert.deepEqual(revisions.map((item) => item.action), ['draft_saved', 'draft_saved']);
});

await test('4. Versão obsoleta é recusada', async () => {
  const { service, entity } = await fixture();
  await service.saveDraft(context(), entity.id, validSections(null), 0);
  await assert.rejects(
    () => service.saveDraft(context(), entity.id, validSections('Outra resposta'), 0),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'CONCURRENCY_CONFLICT'
  );
});

await test('5. Perfil sem execução não acessa conteúdo do formulário', async () => {
  const { service, entity } = await fixture();
  await assert.rejects(
    () => service.getFieldForm(context('org-a', 'user-capturer', 'capturer'), entity.id),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
});

await test('6. Financeiro permanece fora do conteúdo técnico de campo', async () => {
  const { service, entity } = await fixture();
  await assert.rejects(
    () => service.getFieldForm(context('org-a', 'user-finance', 'finance'), entity.id),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'PERMISSION_DENIED'
  );
});

await test('7. Perfil com execução pode consultar o formulário', async () => {
  const { service, entity } = await fixture();
  await service.saveDraft(context(), entity.id, validSections(null), 0);
  const form = await service.getFieldForm(context('org-a', 'user-manager', 'manager'), entity.id);
  assert.equal(form?.version, 1);
});

await test('8. Somente o responsável atual altera o formulário', async () => {
  const { service, entity } = await fixture();
  await assert.rejects(
    () =>
      service.saveDraft(
        context('org-a', 'user-manager', 'manager'),
        entity.id,
        validSections(null),
        0
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'RESPONSIBLE_MISMATCH'
  );
});

await test('9. Visita planejada ainda não aceita formulário de campo', async () => {
  const { service, entity } = await fixture('planned');
  await assert.rejects(
    () => service.saveDraft(context(), entity.id, validSections(null), 0),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_LOCKED'
  );
});

await test('10. Visita cancelada bloqueia alterações no formulário', async () => {
  const { service, entity } = await fixture('cancelled');
  await assert.rejects(
    () => service.saveDraft(context(), entity.id, validSections(null), 0),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_LOCKED'
  );
});

await test('11. Rascunho pode preservar item obrigatório ainda sem resposta', () => {
  assert.doesNotThrow(() =>
    validateTechnicalVisitFieldFormSections(validSections(null), false)
  );
});

await test('12. Envio somente é permitido durante a execução', async () => {
  const { service, entity } = await fixture('confirmed');
  await assert.rejects(
    () => service.submit(context(), entity.id, validSections(), 0),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_LOCKED'
  );
});

await test('13. Formulário vazio não pode ser enviado', async () => {
  const { service, entity } = await fixture('in_progress');
  await assert.rejects(
    () => service.submit(context(), entity.id, [], 0),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INCOMPLETE'
  );
});

await test('14. Item obrigatório sem resposta impede envio', async () => {
  const { service, entity } = await fixture('in_progress');
  await assert.rejects(
    () => service.submit(context(), entity.id, validSections(null), 0),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INCOMPLETE'
  );
});

await test('15. Texto curto válido é aceito', () => {
  assert.doesNotThrow(() =>
    validateTechnicalVisitFieldFormSections(
      typedSection('short_text', 'Condição normal'),
      true
    )
  );
});

await test('16. Texto longo respeita limite máximo', () => {
  assert.throws(
    () =>
      validateTechnicalVisitFieldFormSections(
        typedSection('long_text', 'x'.repeat(4001)),
        true
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INVALID'
  );
});

await test('17. Inteiro rejeita valor fracionário', () => {
  assert.throws(
    () =>
      validateTechnicalVisitFieldFormSections(
        typedSection('integer', 1.5),
        true
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INVALID'
  );
});

await test('18. Decimal finito é aceito', () => {
  assert.doesNotThrow(() =>
    validateTechnicalVisitFieldFormSections(
      typedSection('decimal', 125.75),
      true
    )
  );
});

await test('19. Booleano false conta como resposta obrigatória válida', () => {
  assert.equal(
    isTechnicalVisitFieldFormComplete(typedSection('boolean', false)),
    true
  );
});

await test('20. Data com formato inválido é recusada', () => {
  assert.throws(
    () =>
      validateTechnicalVisitFieldFormSections(
        typedSection('date', '02/09/2026'),
        true
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INVALID'
  );
});

await test('21. Horário fora do formato é recusado', () => {
  assert.throws(
    () =>
      validateTechnicalVisitFieldFormSections(
        typedSection('time', '25:00'),
        true
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INVALID'
  );
});

await test('22. Escolha única precisa pertencer às opções', () => {
  assert.throws(
    () =>
      validateTechnicalVisitFieldFormSections(
        typedSection('single_choice', 'C', ['A', 'B']),
        true
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INVALID'
  );
});

await test('23. Múltipla escolha aceita somente opções configuradas', () => {
  assert.doesNotThrow(() =>
    validateTechnicalVisitFieldFormSections(
      typedSection('multiple_choice', ['A', 'B'], ['A', 'B', 'C']),
      true
    )
  );
});

await test('24. Opções duplicadas são recusadas', () => {
  assert.throws(
    () =>
      validateTechnicalVisitFieldFormSections(
        typedSection('single_choice', 'A', ['A', 'A']),
        true
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INVALID'
  );
});

await test('24A. Rascunho preserva opção ainda incompleta durante a digitação', () => {
  assert.doesNotThrow(() =>
    validateTechnicalVisitFieldFormSections(
      typedSection('single_choice', null, ['']),
      false
    )
  );
});

await test('24B. Envio final continua recusando opção vazia', () => {
  assert.throws(
    () =>
      validateTechnicalVisitFieldFormSections(
        typedSection('single_choice', null, ['', 'B']),
        true
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INVALID'
  );
});

await test('25. Seções duplicadas são recusadas', () => {
  const sections = validSections();
  assert.throws(
    () =>
      validateTechnicalVisitFieldFormSections(
        [sections[0], { ...sections[0] }],
        true
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INVALID'
  );
});

await test('26. IDs de itens são únicos em todo o formulário', () => {
  const first = validSections()[0];
  const duplicate: TechnicalVisitFieldSection = {
    id: 'section:second',
    title: 'Segunda seção',
    description: null,
    order: 2,
    items: [{ ...first.items[0] }],
  };
  assert.throws(
    () => validateTechnicalVisitFieldFormSections([first, duplicate], true),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INVALID'
  );
});

await test('27. Envio válido altera status para submitted e cria revisão', async () => {
  const { service, entity } = await fixture('in_progress');
  const submitted = await service.submit(context(), entity.id, validSections(), 0);
  assert.equal(submitted.status, 'submitted');
  const revisions = await service.listRevisions(context(), entity.id);
  assert.equal(revisions.at(-1)?.action, 'submitted');
});

await test('28. Formulário enviado é imutável', async () => {
  const { service, entity } = await fixture('in_progress');
  const submitted = await service.submit(context(), entity.id, validSections(), 0);
  await assert.rejects(
    () =>
      service.saveDraft(
        context(),
        entity.id,
        validSections('Alteração indevida'),
        submitted.version
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_LOCKED'
  );
});

await test('29. Conclusão da visita falha sem formulário enviado', async () => {
  const { visitGateway, fieldFormGateway, entity } = await fixture('in_progress');
  const visitService = new TechnicalVisitService(
    visitGateway,
    undefined,
    undefined,
    fieldFormGateway
  );
  await assert.rejects(
    () =>
      visitService.transitionVisit(context(), entity.id, {
        targetStatus: 'completed',
        expectedVersion: entity.version,
      }),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'FIELD_FORM_INCOMPLETE'
  );
});

await test('30. Conclusão da visita funciona após formulário enviado', async () => {
  const { visitGateway, fieldFormGateway, service, entity } = await fixture('in_progress');
  await service.submit(context(), entity.id, validSections(), 0);
  const visitService = new TechnicalVisitService(
    visitGateway,
    undefined,
    undefined,
    fieldFormGateway
  );
  const completed = await visitService.transitionVisit(context(), entity.id, {
    targetStatus: 'completed',
    expectedVersion: entity.version,
  });
  assert.equal(completed.status, 'completed');
});

await test('31. IDOR entre organizações não revela formulário', async () => {
  const { service, entity } = await fixture('confirmed');
  await service.saveDraft(context(), entity.id, validSections(null), 0);
  await assert.rejects(
    () =>
      service.getFieldForm(
        context('org-b', 'user-tech', 'project_designer'),
        entity.id
      ),
    (error: unknown) =>
      error instanceof TechnicalVisitDomainError &&
      error.code === 'VISIT_NOT_FOUND'
  );
});

await test('32. Duas gravações com a mesma versão têm um único vencedor', async () => {
  const { service, entity } = await fixture('confirmed');
  const results = await Promise.allSettled([
    service.saveDraft(context(), entity.id, validSections('A'), 0),
    service.saveDraft(context(), entity.id, validSections('B'), 0),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
});

const componentSource = fs.readFileSync(
  'src/fieldVisits/VisitFieldFormPanel.tsx',
  'utf8'
);
const validationSource = fs.readFileSync(
  'src/fieldVisits/fieldFormValidation.ts',
  'utf8'
);
const typesSource = fs.readFileSync(
  'src/types/technicalVisitFieldForm.ts',
  'utf8'
);
const migrationSource = fs.readFileSync(
  'supabase/migrations/20260902194000_oe_007_003_field_forms.sql',
  'utf8'
);
const resilienceMigrationSource = fs.readFileSync(
  'supabase/migrations/20260902194500_oe_007_003_field_form_draft_resilience.sql',
  'utf8'
);

await test('33. Interface permite configurar seções e itens', () => {
  for (const marker of [
    'Adicionar seção',
    'Adicionar item',
    'Título da seção',
    'Enunciado do item',
    'Tipo de resposta',
    'Item obrigatório',
    'Observação do item',
  ]) {
    assert.equal(componentSource.includes(marker), true, marker);
  }
});

await test('34. Salvamento progressivo usa debounce de 800 ms', () => {
  assert.equal(componentSource.includes('}, 800);'), true);
  assert.equal(componentSource.includes('saveFieldFormDraft'), true);
});

await test('35. Alterações pendentes ativam proteção beforeunload', () => {
  assert.equal(componentSource.includes("addEventListener('beforeunload'"), true);
  assert.equal(componentSource.includes("removeEventListener('beforeunload'"), true);
});

await test('36. Rascunho real não é persistido em armazenamento local do navegador', () => {
  const source = componentSource + '\n' + validationSource + '\n' + typesSource;
  assert.equal(/localStorage|sessionStorage|indexedDB|IndexedDB/.test(source), false);
});

await test('37. Teclado móvel é adequado para inteiro e decimal', () => {
  assert.equal(componentSource.includes('inputMode="numeric"'), true);
  assert.equal(componentSource.includes('inputMode="decimal"'), true);
  assert.equal(componentSource.includes('type="date"'), true);
  assert.equal(componentSource.includes('type="time"'), true);
});

await test('38. Foco é direcionado ao criar seção e item', () => {
  assert.equal(componentSource.includes("document.getElementById('field-section-title-'"), true);
  assert.equal(componentSource.includes("document.getElementById('field-item-label-'"), true);
  assert.equal(componentSource.includes('firstActionRef.current?.focus()'), true);
});

await test('39. Estados de salvamento e erros são anunciáveis', () => {
  assert.equal(componentSource.includes('aria-live="polite"'), true);
  assert.equal(componentSource.includes('role="status"'), true);
  assert.equal(componentSource.includes('role="alert"'), true);
  assert.equal(componentSource.includes('aria-busy={loading || saving}'), true);
});

await test('40. Layout do formulário é mobile-first sem largura fixa de desktop', () => {
  assert.equal(componentSource.includes('md:grid-cols-2'), true);
  assert.equal(componentSource.includes('sm:flex-row'), true);
  assert.equal(/min-w-\[(?:[4-9]\d\d|\d{4,})px\]/.test(componentSource), false);
  assert.equal(/w-\[(?:[4-9]\d\d|\d{4,})px\]/.test(componentSource), false);
});

await test('41. Escopo não antecipa fotos, geolocalização nem frota', () => {
  const source = typesSource + '\n' + validationSource + '\n' + componentSource;
  assert.equal(
    /photoEvidence|photos|latitude|longitude|geolocation|vehicleReference|vehicleGateway/.test(source),
    false
  );
});

await test('42. Migration cria formulário e revisões com RLS', () => {
  assert.equal(migrationSource.includes('technical_visit_field_forms'), true);
  assert.equal(migrationSource.includes('technical_visit_field_form_revisions'), true);
  assert.equal(migrationSource.includes('enable row level security'), true);
  assert.equal(migrationSource.includes('agrocore_technical_visit_field_forms_select'), true);
});

await test('43. Migration reserva conteúdo técnico para perfis de execução', () => {
  assert.equal(
    migrationSource.includes(
      "in ('owner','company_admin','manager','project_designer')"
    ),
    true
  );
  assert.equal(
    migrationSource.includes(
      "in ('owner','company_admin','manager','project_designer','capturer')"
    ),
    true
  );
});

await test('44. Escrita direta fica revogada e mutação passa por RPC autenticada', () => {
  assert.equal(
    migrationSource.includes(
      'revoke insert, update, delete, truncate, references, trigger'
    ),
    true
  );
  assert.equal(
    migrationSource.includes('agrocore_save_technical_visit_field_form'),
    true
  );
  assert.equal(migrationSource.includes('auth.uid()'), true);
});

await test('45. Banco valida tipagem e obrigatórios antes do envio', () => {
  assert.equal(
    migrationSource.includes('validate_technical_visit_field_form'),
    true
  );
  assert.equal(
    migrationSource.includes('AGROCORE_FIELD_FORM_INCOMPLETE'),
    true
  );
  assert.equal(migrationSource.includes("'multiple_choice'"), true);
  assert.equal(migrationSource.includes("'decimal'"), true);
});

await test('46. Banco bloqueia conclusão sem formulário enviado', () => {
  assert.equal(
    migrationSource.includes('agrocore_require_field_form_before_completion'),
    true
  );
  assert.equal(
    migrationSource.includes(
      'enforce_technical_visit_field_form_before_completion'
    ),
    true
  );
});

await test('47. Payload do formulário possui limite autoritativo no banco', () => {
  assert.equal(migrationSource.includes('524288'), true);
  assert.equal(migrationSource.includes('octet_length(p_payload::text)'), true);
});

await test('48. Metadados de autoria e horário são definidos no servidor', () => {
  assert.equal(migrationSource.includes('clock_timestamp()'), true);
  assert.equal(migrationSource.includes('v_actor uuid := (select auth.uid())'), true);
});

await test('49. Migration incremental preserva rascunho parcial e mantém envio estrito', () => {
  assert.equal(
    resilienceMigrationSource.includes(
      'validate_technical_visit_field_form_draft'
    ),
    true
  );
  assert.equal(
    resilienceMigrationSource.includes(
      'validate_technical_visit_field_form(\n      p_payload,\n      true'
    ),
    true
  );
  assert.equal(
    resilienceMigrationSource.includes(
      'validate_technical_visit_field_form_draft(\n      p_payload'
    ),
    true
  );
});

console.log('\n====================================================');
console.log('Resultado: ' + passed + ' passaram, ' + failed + ' falharam');
console.log('====================================================');

if (failed > 0) process.exit(1);
