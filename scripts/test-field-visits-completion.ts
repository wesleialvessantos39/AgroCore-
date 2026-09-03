import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20260903021023_oe_007_005_visit_completion_reports.sql',
  'utf8'
);
const hardening = fs.readFileSync(
  'supabase/migrations/20260903022428_oe_007_005_report_hardening.sql',
  'utf8'
);
const integrityHardening = fs.readFileSync(
  'supabase/migrations/20260903022512_oe_007_005_report_integrity_hardening.sql',
  'utf8'
);
const transitionHardening = fs.readFileSync(
  'supabase/migrations/20260903023035_oe_007_005_transition_integrity_hardening.sql',
  'utf8'
);
const evidenceRaceHardening = fs.readFileSync(
  'supabase/migrations/20260903023343_oe_007_005_report_evidence_race_hardening.sql',
  'utf8'
);
const service = fs.readFileSync('src/fieldVisits/technicalVisitService.ts', 'utf8');
const supabaseGateway = fs.readFileSync(
  'src/fieldVisits/supabaseTechnicalVisitGateway.ts',
  'utf8'
);
const previewGateway = fs.readFileSync(
  'src/fieldVisits/preview/previewTechnicalVisitGateway.ts',
  'utf8'
);
const page = fs.readFileSync('src/pages/FieldVisitsPage.tsx', 'utf8');
const panel = fs.readFileSync(
  'src/fieldVisits/VisitCompletionReportPanel.tsx',
  'utf8'
);
const types = fs.readFileSync('src/types/technicalVisitReport.ts', 'utf8');

let passed = 0;
let failed = 0;

function test(name: string, operation: () => void) {
  try {
    operation();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  [FAIL] ${name}`);
    console.error(error);
  }
}

console.log('====================================================');
console.log(' AGROCORE — OE-007.005 — CONCLUSÃO E RELATÓRIO');
console.log('====================================================\n');

test('1. Relatórios possuem tabela versionada e imutável por inserção', () => {
  assert.match(migration, /create table if not exists public\.technical_visit_report_versions/i);
  assert.match(migration, /unique \(visit_id, version\)/i);
  assert.match(migration, /revoke insert, update, delete/i);
});

test('2. Relatórios são protegidos por RLS', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /agrocore_technical_visit_reports_select/i);
});

test('3. Captador e financeiro não recebem acesso ao conteúdo final', () => {
  const policyStart = migration.indexOf('agrocore_technical_visit_reports_select');
  const policyEnd = migration.indexOf('revoke all on table', policyStart);
  const policy = migration.slice(policyStart, policyEnd);
  assert.doesNotMatch(policy, /capturer/);
  assert.doesNotMatch(policy, /finance/);
});

test('4. Projetista só acessa relatório da visita sob sua responsabilidade', () => {
  assert.match(migration, /project_designer/);
  assert.match(migration, /responsible_user_id = \(select auth\.uid\(\)\)/);
});

test('5. Conclusão é transacional e exige visita em execução', () => {
  assert.match(migration, /agrocore_complete_technical_visit/);
  assert.match(migration, /v_current\.status <> 'in_progress'/);
});

test('6. Conclusão exige o responsável autenticado', () => {
  assert.match(migration, /v_current\.responsible_user_id <> v_actor/);
});

test('7. Conclusão exige formulário de campo submetido', () => {
  assert.match(migration, /technical_visit_field_forms/);
  assert.match(migration, /f\.status = 'submitted'/);
  assert.match(migration, /AGROCORE_FIELD_FORM_INCOMPLETE/);
});

test('8. Snapshot final preserva visita, formulário e referência de evidência', () => {
  assert.match(migration, /'visit', v_visit_payload/);
  assert.match(migration, /'fieldForm'/);
  assert.match(migration, /'fieldEvidence'/);
  assert.match(migration, /'photoCount'/);
});

test('9. Revisões preservam o snapshot técnico original', () => {
  assert.match(
    migration,
    /'snapshot', v_current_report\.payload -> 'snapshot'/
  );
});

test('10. Concorrência de conclusão e revisão é protegida', () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /AGROCORE_CONCURRENCY_CONFLICT/);
  assert.match(migration, /p_expected_report_version/);
});

test('11. Hardening residual bloqueia visita terminal no RPC genérico', () => {
  assert.match(migration, /v_current\.status in \('completed','cancelled'\)/);
  assert.match(migration, /AGROCORE_VISIT_LOCKED/);
});

test('12. Hardening residual valida a máquina de estados no banco', () => {
  assert.match(migration, /AGROCORE_INVALID_TRANSITION/);
  assert.match(migration, /v_current\.status = 'planned'/);
  assert.match(migration, /v_current\.status = 'confirmed'/);
});

test('13. RPC genérico não consegue concluir sem relatório', () => {
  assert.match(migration, /AGROCORE_REPORT_REQUIRED/);
  assert.match(service, /REPORT_REQUIRED/);
});

test('14. Serviço e banco validam resumo, pendências e identificadores', () => {
  assert.match(service, /normalizeReportSummary/);
  assert.match(service, /normalizePendingItems/);
  assert.match(service, /items\.length > 50/);
  assert.match(service, /id\.length > 120/);
  assert.match(hardening, /technical_visit_report_versions_issued_by_idx/);
  assert.match(hardening, /item ->> 'id'.*120/s);
});

test('15. Gateway Supabase usa os RPCs canônicos da OE-007.005', () => {
  assert.match(supabaseGateway, /agrocore_complete_technical_visit/);
  assert.match(supabaseGateway, /agrocore_create_technical_visit_report_revision/);
  assert.match(supabaseGateway, /technical_visit_report_versions/);
});

test('16. Preview suporta conclusão e versões sem contaminar produção', () => {
  assert.match(previewGateway, /async completeVisit/);
  assert.match(previewGateway, /async reviseReport/);
  assert.match(previewGateway, /this\.reports\.clear\(\)/);
});

test('17. A tela não usa mais transição genérica para completed', () => {
  assert.doesNotMatch(page, /transition\(visit, 'completed'\)/);
  assert.match(page, /VisitCompletionReportPanel/);
});

test('18. Painel exige formulário pronto antes da emissão', () => {
  assert.match(panel, /completionReady/);
  assert.match(panel, /Envie o formulário de campo antes de concluir/);
});

test('19. Histórico de versões e motivo de revisão estão disponíveis', () => {
  assert.match(panel, /Histórico de versões/);
  assert.match(panel, /revisionReason/);
  assert.match(types, /expectedReportVersion/);
});

test('20. Pendências permanecem no relatório sem criar tarefas automaticamente', () => {
  assert.match(types, /TechnicalVisitPendingItem/);
  assert.doesNotMatch(types, /taskId|fleetId|calendarId/);
  assert.match(panel, /não criam tarefas automaticamente/i);
});

test('21. Snapshot resolve a evidência pela ligação canônica da OE-007.004', () => {
  assert.match(integrityHardening, /from public\.field_evidence_links l/i);
  assert.match(integrityHardening, /l\.entity_type = 'visit'/);
  assert.match(integrityHardening, /l\.entity_id = p_visit_id::text/);
  assert.match(
    integrityHardening,
    /e\.property_id is not distinct from v_current\.property_id/
  );
});

test('22. Banco recusa identificadores duplicados e fora do limite', () => {
  assert.match(integrityHardening, /not between 1 and 120/);
  assert.match(integrityHardening, /group by btrim\(item ->> 'id'\)/);
  assert.match(integrityHardening, /having count\(\*\) > 1/);
});

test('23. Concorrência não pode ser contornada com versão esperada nula', () => {
  assert.match(integrityHardening, /p_expected_version is null/);
  assert.match(integrityHardening, /p_expected_report_version is null/);
});

test('24. Pendências são normalizadas no servidor antes da persistência', () => {
  assert.match(integrityHardening, /v_pending_items jsonb/);
  assert.match(integrityHardening, /'id', btrim\(item ->> 'id'\)/);
  assert.match(integrityHardening, /'description', btrim\(item ->> 'description'\)/);
  assert.match(integrityHardening, /'pendingItems', v_pending_items/);
});

test('25. Transição não pode carregar alteração silenciosa de planejamento', () => {
  assert.match(transitionHardening, /v_is_transition := v_new_status <> v_current\.status/);
  assert.match(transitionHardening, /p_visit ->> 'clientId'.*v_current\.payload ->> 'clientId'/s);
  assert.match(transitionHardening, /p_visit ->> 'responsibleUserId'.*v_current\.payload ->> 'responsibleUserId'/s);
  assert.match(transitionHardening, /p_visit ->> 'purpose'.*v_current\.payload ->> 'purpose'/s);
  assert.match(transitionHardening, /raise exception 'AGROCORE_INVALID_INPUT'/);
});

test('26. Alteração sem mudança de estado exige motivo no banco', () => {
  assert.match(transitionHardening, /v_reason := nullif\(btrim\(coalesce\(p_audit ->> 'reason',''\)\), ''\)/);
  assert.match(transitionHardening, /v_reason is null or length\(v_reason\) < 3/);
  assert.match(transitionHardening, /AGROCORE_REASON_REQUIRED/);
});

test('27. changedFields da auditoria é calculado no servidor', () => {
  assert.match(transitionHardening, /v_changed_fields jsonb := '\[\]'::jsonb/);
  assert.match(transitionHardening, /jsonb_build_array\('clientId'\)/);
  assert.match(transitionHardening, /jsonb_build_array\('preparation'\)/);
  assert.match(transitionHardening, /'changedFields', v_changed_fields/);
  assert.doesNotMatch(
    transitionHardening,
    /then p_audit -> 'changedFields'/
  );
});

test('28. Snapshot canônico não depende da corrida de criação do vínculo da visita', () => {
  assert.match(evidenceRaceHardening, /from public\.field_evidence_sets e/i);
  assert.match(
    evidenceRaceHardening,
    /e\.property_id = v_current\.property_id/
  );
  assert.match(evidenceRaceHardening, /'linkedToVisit', exists/);
  assert.match(evidenceRaceHardening, /from public\.field_evidence_links l/);
  assert.match(types, /linkedToVisit\?: boolean/);
});

console.log(`\nResultado OE-007.005: ${passed} aprovadas, ${failed} falhas.`);
if (failed > 0) process.exit(1);
