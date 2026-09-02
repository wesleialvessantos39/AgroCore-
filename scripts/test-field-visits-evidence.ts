import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Property } from '../src/types/property.ts';
import { PreviewFieldEvidenceGateway } from '../src/fieldVisits/preview/previewFieldEvidenceGateway.ts';
import {
  buildPropertyRegistryLocation,
  getFieldEvidenceCompleteness,
  validateFieldEvidenceLocation,
} from '../src/fieldVisits/fieldEvidencePolicy.ts';

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

function property(id = 'property-a', clientId = 'client-a'): Property {
  return {
    id,
    organizationId: 'org-a',
    propertyType: 'urban',
    urbanType: 'house',
    name: 'Imóvel cadastrado',
    status: 'active',
    location: {
      zipCode: '74000000',
      street: 'Rua do Imóvel',
      number: '10',
      noNumber: false,
      neighborhood: 'Centro',
      city: 'Goiânia',
      state: 'GO',
    },
    areas: {
      landAreaM2: '500',
      builtAreaM2: '200',
    },
    identifiers: {},
    registrations: [],
    clientLinks: [
      {
        clientId,
        relationship: 'owner',
        isPrimaryHolder: true,
        linkedAt: '2026-09-02T12:00:00.000Z',
      },
    ],
    referenceCoordinate: {
      latitude: '-16.680882',
      longitude: '-49.253269',
      geodeticSystem: 'SIRGAS2000',
      format: 'decimal_degrees',
      origin: 'gnss',
    },
    boundaries: [],
    createdAt: '2026-09-02T12:00:00.000Z',
    updatedAt: '2026-09-02T12:00:00.000Z',
  } as Property;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-a',
    propertyId: 'property-a',
    clientId: 'client-a',
    actorUserId: 'designer-a',
    registryLocation: {
      latitude: -16.680882,
      longitude: -49.253269,
      label: 'Rua do Imóvel, 10, Centro, Goiânia, GO',
      source: 'property_reference' as const,
    },
    ...overrides,
  };
}

console.log('====================================================');
console.log(' AGROCORE — OE-007.004 R2 FONTE CANÔNICA DO IMÓVEL');
console.log('====================================================\n');

await test('1. Coordenadas cadastrais são lidas exclusivamente do imóvel', () => {
  const location = buildPropertyRegistryLocation(property());
  assert.equal(location?.source, 'property_reference');
  assert.equal(location?.latitude, -16.680882);
  assert.equal(location?.longitude, -49.253269);
  assert.ok(location?.label?.includes('Rua do Imóvel'));
});

await test('2. Ausência de imóvel não usa endereço do cliente como localização', () => {
  assert.equal(buildPropertyRegistryLocation(null), undefined);
});

await test('3. Primeiro acesso cria uma evidência canônica por imóvel', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const evidence = await gateway.initialize(input());
  assert.equal(evidence.propertyId, 'property-a');
  assert.equal(evidence.clientId, 'client-a');
  assert.equal((await gateway.getByProperty('org-a', 'property-a'))?.id, evidence.id);
});

await test('4. Laudo aponta para a mesma evidência do imóvel', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const base = await gateway.initialize(input());
  const appraisal = await gateway.initialize(input({ appraisalId: 'app-a' }));
  assert.equal(appraisal.id, base.id);
  assert.equal((await gateway.getByAppraisal('org-a', 'app-a'))?.id, base.id);
});

await test('5. Visita aponta para a mesma evidência do imóvel', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const base = await gateway.initialize(input());
  const visit = await gateway.initialize(input({ visitId: 'visit-a' }));
  assert.equal(visit.id, base.id);
  assert.equal((await gateway.getByVisit('org-a', 'visit-a'))?.id, base.id);
});

await test('6. Laudo e visita do mesmo imóvel retornam exatamente o mesmo conjunto', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const appraisal = await gateway.initialize(input({ appraisalId: 'app-a' }));
  const visit = await gateway.initialize(input({ visitId: 'visit-a' }));
  assert.equal(appraisal.id, visit.id);
  assert.deepEqual(
    await gateway.getByAppraisal('org-a', 'app-a'),
    await gateway.getByVisit('org-a', 'visit-a')
  );
});

await test('7. Segundo imóvel do mesmo cliente recebe evidência diferente', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const first = await gateway.initialize(input());
  const second = await gateway.initialize(
    input({ propertyId: 'property-b' })
  );
  assert.notEqual(first.id, second.id);
});

await test('8. Mesmo imóvel não pode trocar silenciosamente de cliente', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  await gateway.initialize(input());
  await assert.rejects(() =>
    gateway.initialize(input({ clientId: 'client-b' }))
  );
});

await test('9. Organização diferente não enxerga evidência do imóvel', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  await gateway.initialize(input());
  assert.equal(await gateway.getByProperty('org-b', 'property-a'), null);
});

await test('10. Alteração de localização preserva controle otimista de versão', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const evidence = await gateway.initialize(input());
  const next = await gateway.setLocation({
    organizationId: 'org-a',
    evidenceId: evidence.id,
    actorUserId: 'designer-a',
    expectedVersion: evidence.version,
    location: {
      latitude: -16.7,
      longitude: -49.3,
      source: 'device',
    },
  });
  assert.equal(next.version, evidence.version + 1);
  assert.equal(next.location?.latitude, -16.7);
});

await test('11. Versão obsoleta não sobrescreve localização do imóvel', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const evidence = await gateway.initialize(input());
  await gateway.setLocation({
    organizationId: 'org-a',
    evidenceId: evidence.id,
    actorUserId: 'designer-a',
    expectedVersion: evidence.version,
    location: {
      latitude: -16.7,
      longitude: -49.3,
      source: 'device',
    },
  });
  await assert.rejects(() =>
    gateway.setLocation({
      organizationId: 'org-a',
      evidenceId: evidence.id,
      actorUserId: 'designer-a',
      expectedVersion: evidence.version,
      location: {
        latitude: -16.8,
        longitude: -49.4,
        source: 'manual',
      },
    })
  );
});

await test('12. Latitude inválida continua bloqueada', () => {
  assert.throws(() =>
    validateFieldEvidenceLocation({
      latitude: 91,
      longitude: -49,
      source: 'manual',
    })
  );
});

await test('13. Longitude inválida continua bloqueada', () => {
  assert.throws(() =>
    validateFieldEvidenceLocation({
      latitude: -16,
      longitude: 181,
      source: 'manual',
    })
  );
});

await test('14. Cadastro completo exige imóvel, coordenadas e foto', () => {
  const incomplete = getFieldEvidenceCompleteness(
    {
      id: 'ev-a',
      organizationId: 'org-a',
      propertyId: 'property-a',
      clientId: 'client-a',
      location: {
        latitude: -16,
        longitude: -49,
        source: 'property_reference',
      },
      photos: [],
      version: 1,
      createdByUserId: 'u',
      createdAt: '',
      updatedByUserId: 'u',
      updatedAt: '',
    },
    'property-a'
  );
  assert.equal(incomplete.hasGeolocation, true);
  assert.equal(incomplete.hasPhotos, false);
  assert.equal(incomplete.complete, false);
});

const panel = fs.readFileSync('src/fieldVisits/FieldEvidencePanel.tsx', 'utf8');
const supabaseGateway = fs.readFileSync(
  'src/fieldVisits/supabaseFieldEvidenceGateway.ts',
  'utf8'
);
const migration = fs.readFileSync(
  'supabase/migrations/20260902230000_oe_007_004_property_canonical_sync.sql',
  'utf8'
);
const requestTypes = fs.readFileSync(
  'src/types/clientRegistryRequest.ts',
  'utf8'
);
const requestGateway = fs.readFileSync(
  'src/clients/supabaseClientRegistryRequestGateway.ts',
  'utf8'
);
const requestPanel = fs.readFileSync(
  'src/clients/components/ClientRegistryRequestsPanel.tsx',
  'utf8'
);
const clientEvidencePage = fs.readFileSync(
  'src/pages/ClientEvidencePage.tsx',
  'utf8'
);
const propertyCreatePage = fs.readFileSync(
  'src/pages/PropertyCreatePage.tsx',
  'utf8'
);
const routes = fs.readFileSync('src/routes/AppRoutes.tsx', 'utf8');
const paths = fs.readFileSync('src/routes/paths.ts', 'utf8');
const permissions = fs.readFileSync(
  'src/authorization/permissionsMatrix.ts',
  'utf8'
);
const vite = fs.readFileSync('vite.config.ts', 'utf8');

await test('15. Banco impõe um único conjunto por organização e imóvel', () => {
  assert.equal(
    migration.includes('field_evidence_sets_org_property_uq'),
    true
  );
  assert.equal(
    migration.includes('(organization_id, property_id)'),
    true
  );
});

await test('16. Laudo e visita usam tabela de links, não duplicam evidência', () => {
  assert.equal(migration.includes('public.field_evidence_links'), true);
  assert.equal(supabaseGateway.includes("entity_type', entityType"), true);
  assert.equal(supabaseGateway.includes('getByProperty'), true);
});

await test('17. Localização salva pela vistoria atualiza properties.referenceCoordinate', () => {
  assert.equal(
    migration.includes("'{referenceCoordinate}'"),
    true
  );
  assert.equal(
    migration.includes("'synchronizedToProperty',true"),
    true
  );
});

await test('18. Inicialização lê referência do imóvel antes da geometria', () => {
  const referenceIndex = migration.indexOf('{referenceCoordinate,latitude}');
  const geometryIndex = migration.indexOf('{totalMetrics,centroid,latitude}');
  assert.notEqual(referenceIndex, -1);
  assert.notEqual(geometryIndex, -1);
  assert.ok(referenceIndex < geometryIndex);
});

await test('19. Cadastro do cliente não é usado como fallback geográfico do imóvel', () => {
  assert.equal(migration.includes("'{address,street}'"), false);
  assert.equal(panel.includes('clients.getClientById'), false);
  assert.equal(panel.includes('buildPropertyRegistryLocation'), true);
});

await test('20. Fotos genéricas do cliente não são importadas para o imóvel', () => {
  assert.equal(
    migration.includes("d.logical_owner_type = 'client'"),
    false
  );
  assert.equal(
    migration.includes("d.logical_owner_type = 'property'"),
    true
  );
});

await test('21. Fotos documentais canônicas pertencem ao imóvel', () => {
  assert.equal(migration.includes("'property_document'"), true);
  assert.equal(
    migration.includes("d.logical_owner_id = p_property_id::text"),
    true
  );
});

await test('22. Capturas no laudo, visita e cadastro gravam no mesmo evidenceId', () => {
  assert.equal(
    supabaseGateway.includes('p_evidence_id: input.evidenceId'),
    true
  );
  assert.equal(
    migration.includes("'property_capture','visit_capture','appraisal_capture'"),
    true
  );
});

await test('23. Painel informa explicitamente a fonte canônica do imóvel', () => {
  assert.equal(panel.includes('Fonte canônica única do imóvel'), true);
  assert.equal(panel.includes('Cliente, laudo e visita/vistoria'), true);
});

await test('24. Projetista recebe exatamente as duas ações para pendência cadastral', () => {
  assert.equal(panel.includes('Cadastrar agora'), true);
  assert.equal(panel.includes('Solicitar ao captador responsável'), true);
  assert.equal(panel.includes("userRole === 'project_designer'"), true);
});

await test('25. Solicitação diferencia falta de imóvel, fotos, localização ou ambos', () => {
  for (const scope of [
    'property_registration',
    'geolocation',
    'photos',
    'photos_and_geolocation',
  ]) {
    assert.equal(requestTypes.includes(scope), true);
    assert.equal(panel.includes(scope), true);
  }
});

await test('26. Captador responsável é resolvido no servidor pelo vínculo ativo do cliente', () => {
  assert.equal(migration.includes('public.client_capturer_assignments'), true);
  assert.equal(migration.includes("a.status='active'"), true);
  assert.equal(migration.includes('a.is_primary desc'), true);
  assert.equal(migration.includes('AGROCORE_CAPTURER_NOT_ASSIGNED'), true);
});

await test('27. Solicitações abertas são idempotentes por origem e escopo', () => {
  assert.equal(
    migration.includes('client_registry_requests_open_source_uq'),
    true
  );
  assert.equal(
    migration.includes("where status in ('open','in_progress')"),
    true
  );
});

await test('28. Captador vê somente solicitações atribuídas a ele', () => {
  assert.equal(
    requestGateway.includes(".eq('assigned_capturer_user_id', capturerUserId)"),
    true
  );
  assert.equal(
    migration.includes('assigned_capturer_user_id = (select auth.uid())'),
    true
  );
});

await test('29. Caixa de solicitações aparece na área Clientes', () => {
  assert.equal(requestPanel.includes('Solicitações de cadastro'), true);
  assert.equal(requestPanel.includes('Abrir cadastro'), true);
  assert.equal(requestPanel.includes('listAssigned'), true);
});

await test('30. Clique da solicitação abre diretamente fotos e geolocalização do cliente', () => {
  assert.equal(
    requestPanel.includes('getClientEvidencePath'),
    true
  );
  assert.equal(
    paths.includes('/fotos-geolocalizacao'),
    true
  );
  assert.equal(
    clientEvidencePage.includes('<FieldEvidencePanel'),
    true
  );
  assert.equal(
    clientEvidencePage.includes('mode="registry"'),
    true
  );
});

await test('31. Cliente sem imóvel oferece cadastro já vinculado ao cliente', () => {
  assert.equal(
    clientEvidencePage.includes('Cadastrar imóvel deste cliente'),
    true
  );
  assert.equal(propertyCreatePage.includes("params.set('clientId'"), false);
  assert.equal(propertyCreatePage.includes("clientLinks = ["), true);
  assert.equal(
    propertyCreatePage.includes("declaredParticipationPercentage: '100'"),
    true
  );
});

await test('32. Imóvel criado por solicitação retorna para a mesma pendência', () => {
  assert.equal(propertyCreatePage.includes('attachProperty'), true);
  assert.equal(propertyCreatePage.includes('registryRequestId'), true);
  assert.equal(
    propertyCreatePage.includes('getClientEvidencePath'),
    true
  );
});

await test('33. Solicitação só pode ser concluída quando a evidência exigida existe', () => {
  assert.equal(migration.includes('AGROCORE_REQUEST_NOT_READY'), true);
  assert.equal(
    migration.includes("v_result.scope='photos_and_geolocation'"),
    true
  );
  assert.equal(migration.includes('v_has_geo and v_has_photos'), true);
});

await test('34. Criação de imóvel para solicitação de visita preserva auditoria da visita', () => {
  assert.equal(migration.includes('public.technical_visit_audit'), true);
  assert.equal(migration.includes("'changedFields'"), true);
  assert.equal(migration.includes("jsonb_build_array('propertyId')"), true);
});

await test('35. RBAC dá criação ao projetista e atendimento ao captador', () => {
  const designer = permissions.slice(
    permissions.indexOf('project_designer:'),
    permissions.indexOf('// Financeiro')
  );
  const capturer = permissions.slice(
    permissions.indexOf('capturer:'),
    permissions.indexOf('// Nenhum papel')
  );
  assert.equal(designer.includes('client_registry_requests:create'), true);
  assert.equal(capturer.includes('client_registry_requests:view_assigned'), true);
  assert.equal(capturer.includes('client_registry_requests:fulfill'), true);
});

await test('36. Captador não recebe edição cadastral geral do cliente', () => {
  const capturer = permissions.slice(
    permissions.indexOf('capturer:'),
    permissions.indexOf('// Nenhum papel')
  );
  assert.equal(capturer.includes("'clients:edit'"), false);
});

await test('37. Rota específica evita liberar ClientEditPage ao captador', () => {
  assert.equal(
    routes.includes('path=":clientId/fotos-geolocalizacao"'),
    true
  );
  assert.equal(
    routes.includes("'client_registry_requests:fulfill'"),
    true
  );
});

await test('38. Produção possui gateway Supabase para solicitações cadastrais', () => {
  assert.equal(
    vite.includes('production-client-registry-request-gateway-factory'),
    true
  );
  assert.equal(vite.includes('SupabaseClientRegistryRequestGateway'), true);
  assert.equal(vite.includes('UnavailableClientRegistryRequestGateway'), true);
});

await test('39. RPCs antigos deixam de criar evidência paralela', () => {
  assert.equal(
    migration.includes(
      'revoke execute on function public.agrocore_initialize_field_evidence'
    ),
    true
  );
  assert.equal(
    supabaseGateway.includes('agrocore_initialize_property_field_evidence'),
    true
  );
});

await test('40. Evidência mantém isolamento organizacional e RLS', () => {
  assert.equal(
    migration.includes('alter table public.field_evidence_links enable row level security'),
    true
  );
  assert.equal(
    migration.includes('alter table public.client_registry_requests enable row level security'),
    true
  );
});

await test('41. Fotos continuam em bucket privado e nunca em base64/localStorage', () => {
  const source = panel + '\n' + supabaseGateway;
  assert.equal(
    /localStorage|sessionStorage|readAsDataURL|base64/.test(source),
    false
  );
  assert.equal(
    supabaseGateway.includes('createSignedUrl'),
    true
  );
});

await test('42. GPS permanece de alta precisão e grava no cadastro do imóvel', () => {
  assert.equal(panel.includes('enableHighAccuracy: true'), true);
  assert.equal(panel.includes('maximumAge: 0'), true);
  assert.equal(panel.includes('Salvar no cadastro do imóvel'), true);
});

await test('43. Fotos continuam validadas por formato real antes do upload', () => {
  const policy = fs.readFileSync(
    'src/fieldVisits/fieldEvidencePolicy.ts',
    'utf8'
  );
  assert.equal(policy.includes('verifyDocumentFileSignature'), true);
  assert.equal(policy.includes('15 * 1024 * 1024'), true);
});

await test('44. Fluxo permanece mobile-first e acessível', () => {
  assert.equal(panel.includes('min-h-[44px]'), true);
  assert.equal(panel.includes('sm:grid-cols-2'), true);
  assert.equal(panel.includes('sm:grid-cols-3'), true);
  assert.equal(panel.includes('role="alert"'), true);
  assert.equal(panel.includes('aria-live="polite"'), true);
});

console.log('\n====================================================');
console.log('Resultado: ' + passed + ' passaram, ' + failed + ' falharam');
console.log('====================================================');

if (failed > 0) process.exit(1);
