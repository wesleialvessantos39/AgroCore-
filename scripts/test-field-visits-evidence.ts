import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Client } from '../src/types/client.ts';
import type { Property } from '../src/types/property.ts';
import { PreviewFieldEvidenceGateway } from '../src/fieldVisits/preview/previewFieldEvidenceGateway.ts';
import {
  buildRegistryLocation,
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

function urbanProperty(
  latitude = '-15.793889',
  longitude = '-47.882778'
): Property {
  return {
    id: 'property-a',
    organizationId: 'org-a',
    propertyType: 'urban',
    urbanType: 'house',
    name: 'Imóvel A',
    location: {
      zipCode: '74000000',
      street: 'Rua Principal',
      number: '10',
      noNumber: false,
      neighborhood: 'Centro',
      city: 'Goiânia',
      state: 'GO',
    },
    areas: {
      landAreaM2: 500,
      builtAreaM2: 200,
    },
    identifiers: {},
    registrations: [],
    clientLinks: [],
    referenceCoordinate: {
      latitude,
      longitude,
      geodeticSystem: 'SIRGAS2000',
    },
    boundaries: [],
    status: 'active',
    createdAt: '2026-09-02T12:00:00.000Z',
    updatedAt: '2026-09-02T12:00:00.000Z',
  } as unknown as Property;
}

function urbanClient(): Client {
  return {
    id: 'client-a',
    organizationId: 'org-a',
    personType: 'individual',
    name: 'Cliente A',
    cpf: '12345678909',
    stateRegistration: '',
    isStateRegistrationExempt: true,
    contact: {
      primaryPhone: '62999999999',
      email: 'cliente@example.com',
    },
    address: {
      addressType: 'urban',
      zipCode: '74000000',
      street: 'Avenida Cliente',
      number: '20',
      isNoNumber: false,
      neighborhood: 'Setor Sul',
      city: 'Goiânia',
      state: 'GO',
    },
    status: 'active',
    createdAt: '2026-09-02T12:00:00.000Z',
    updatedAt: '2026-09-02T12:00:00.000Z',
  } as unknown as Client;
}

function ruralClient(): Client {
  return {
    id: 'client-rural',
    organizationId: 'org-a',
    personType: 'individual',
    name: 'Cliente Rural',
    cpf: '12345678909',
    stateRegistration: '',
    isStateRegistrationExempt: true,
    contact: {
      primaryPhone: '62999999999',
      email: 'rural@example.com',
    },
    address: {
      addressType: 'rural',
      locality: 'Comunidade Boa Vista',
      accessDescription: 'Estrada vicinal',
      city: 'Jataí',
      state: 'GO',
    },
    status: 'active',
    createdAt: '2026-09-02T12:00:00.000Z',
    updatedAt: '2026-09-02T12:00:00.000Z',
  } as unknown as Client;
}

function initializer(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-a',
    appraisalId: 'app_123',
    propertyId: 'property-a',
    clientId: 'client-a',
    actorUserId: 'user-tech',
    ...overrides,
  };
}

console.log('====================================================');
console.log(' AGROCORE — OE-007.004 FOTOS E GEOLOCALIZAÇÃO');
console.log('====================================================\n');

await test('1. Consulta sem evidência não cria conteúdo fictício', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  assert.equal(await gateway.getByAppraisal('org-a', 'app_123'), null);
});

await test('2. Laudo inicializa um conjunto único de evidências', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const evidence = await gateway.initialize(initializer());
  assert.equal(evidence.organizationId, 'org-a');
  assert.equal(evidence.appraisalId, 'app_123');
  assert.equal(evidence.clientId, 'client-a');
  assert.equal(evidence.version, 1);
});

await test('3. Visita vinculada ao laudo reutiliza exatamente o mesmo conjunto', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const appraisalEvidence = await gateway.initialize(initializer());
  const visitEvidence = await gateway.initialize(
    initializer({ visitId: 'visit-a' })
  );
  assert.equal(visitEvidence.id, appraisalEvidence.id);
  assert.equal(visitEvidence.visitId, 'visit-a');
  assert.equal(
    (await gateway.getByVisit('org-a', 'visit-a'))?.id,
    appraisalEvidence.id
  );
});

await test('4. Evidência iniciada na visita também passa a ser a evidência do laudo', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const visitEvidence = await gateway.initialize(
    initializer({ appraisalId: undefined, visitId: 'visit-a' })
  );
  const linked = await gateway.initialize(initializer({ visitId: 'visit-a' }));
  assert.equal(linked.id, visitEvidence.id);
  assert.equal(
    (await gateway.getByAppraisal('org-a', 'app_123'))?.id,
    visitEvidence.id
  );
});

await test('5. Referências fotográficas antigas do laudo são importadas', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const evidence = await gateway.initialize(
    initializer({ legacyAppraisalPhotoReferences: ['foto-1', 'foto-2'] })
  );
  assert.deepEqual(
    evidence.photos.map((photo) => photo.legacyReference),
    ['foto-1', 'foto-2']
  );
  assert.ok(evidence.photos.every((photo) => photo.source === 'appraisal_legacy'));
});

await test('6. Importação repetida não duplica referência fotográfica', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  await gateway.initialize(
    initializer({ legacyAppraisalPhotoReferences: ['foto-1'] })
  );
  const evidence = await gateway.initialize(
    initializer({ legacyAppraisalPhotoReferences: ['foto-1'] })
  );
  assert.equal(evidence.photos.length, 1);
});

await test('7. Localização já existente no laudo tem precedência sobre cadastro posterior', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const first = await gateway.initialize(
    initializer({
      registryLocation: {
        latitude: -16,
        longitude: -48,
        source: 'appraisal',
      },
    })
  );
  const second = await gateway.initialize(
    initializer({
      visitId: 'visit-a',
      registryLocation: {
        latitude: -15,
        longitude: -47,
        source: 'property_reference',
      },
    })
  );
  assert.equal(second.id, first.id);
  assert.equal(second.location?.source, 'appraisal');
  assert.equal(second.location?.latitude, -16);
});

await test('8. Coordenada de referência do imóvel é usada automaticamente', () => {
  const location = buildRegistryLocation(urbanProperty(), urbanClient());
  assert.equal(location?.source, 'property_reference');
  assert.equal(location?.latitude, -15.793889);
  assert.equal(location?.longitude, -47.882778);
  assert.ok(location?.label?.includes('Rua Principal'));
});

await test('9. Endereço urbano do cliente é fallback quando não há imóvel', () => {
  const location = buildRegistryLocation(null, urbanClient());
  assert.equal(location?.source, 'registry_address');
  assert.equal(location?.latitude, null);
  assert.equal(location?.longitude, null);
  assert.ok(location?.label?.includes('Avenida Cliente'));
});

await test('10. Endereço rural do cliente também é preservado como referência', () => {
  const location = buildRegistryLocation(null, ruralClient());
  assert.equal(location?.source, 'registry_address');
  assert.ok(location?.label?.includes('Comunidade Boa Vista'));
  assert.ok(location?.label?.includes('Jataí'));
});

await test('11. Coordenadas manuais válidas são salvas com versão otimista', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const evidence = await gateway.initialize(initializer());
  const updated = await gateway.setLocation({
    organizationId: 'org-a',
    evidenceId: evidence.id,
    actorUserId: 'user-tech',
    expectedVersion: evidence.version,
    location: {
      latitude: -15.8,
      longitude: -47.9,
      source: 'manual',
    },
  });
  assert.equal(updated.version, evidence.version + 1);
  assert.equal(updated.location?.source, 'manual');
});

await test('12. Versão obsoleta não sobrescreve geolocalização concorrente', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  const evidence = await gateway.initialize(initializer());
  await gateway.setLocation({
    organizationId: 'org-a',
    evidenceId: evidence.id,
    actorUserId: 'user-tech',
    expectedVersion: evidence.version,
    location: {
      latitude: -15.8,
      longitude: -47.9,
      source: 'manual',
    },
  });
  await assert.rejects(() =>
    gateway.setLocation({
      organizationId: 'org-a',
      evidenceId: evidence.id,
      actorUserId: 'user-tech',
      expectedVersion: evidence.version,
      location: {
        latitude: -15.7,
        longitude: -47.8,
        source: 'device',
      },
    })
  );
});

await test('13. Organização diferente não enxerga a evidência por ID de visita', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  await gateway.initialize(initializer({ visitId: 'visit-a' }));
  assert.equal(await gateway.getByVisit('org-b', 'visit-a'), null);
});

await test('14. Cliente diferente não pode ser associado à evidência existente', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  await gateway.initialize(initializer());
  await assert.rejects(() =>
    gateway.initialize(initializer({ visitId: 'visit-a', clientId: 'client-b' }))
  );
});

await test('15. Imóvel diferente não pode substituir vínculo já existente', async () => {
  const gateway = new PreviewFieldEvidenceGateway();
  await gateway.initialize(initializer());
  await assert.rejects(() =>
    gateway.initialize(
      initializer({ visitId: 'visit-a', propertyId: 'property-b' })
    )
  );
});

await test('16. Latitude fora da faixa geográfica é rejeitada', () => {
  assert.throws(() =>
    validateFieldEvidenceLocation({
      latitude: 91,
      longitude: -47,
      source: 'manual',
    })
  );
});

await test('17. Longitude fora da faixa geográfica é rejeitada', () => {
  assert.throws(() =>
    validateFieldEvidenceLocation({
      latitude: -15,
      longitude: 181,
      source: 'manual',
    })
  );
});

await test('18. Latitude sem longitude é rejeitada', () => {
  assert.throws(() =>
    validateFieldEvidenceLocation({
      latitude: -15,
      longitude: null,
      source: 'manual',
    })
  );
});

await test('19. Precisão negativa da geolocalização é rejeitada', () => {
  assert.throws(() =>
    validateFieldEvidenceLocation({
      latitude: -15,
      longitude: -47,
      accuracyMeters: -1,
      source: 'device',
    })
  );
});

const panelSource = fs.readFileSync(
  'src/fieldVisits/FieldEvidencePanel.tsx',
  'utf8'
);
const policySource = fs.readFileSync(
  'src/fieldVisits/fieldEvidencePolicy.ts',
  'utf8'
);
const gatewaySource = fs.readFileSync(
  'src/fieldVisits/supabaseFieldEvidenceGateway.ts',
  'utf8'
);
const typesSource = fs.readFileSync('src/types/fieldEvidence.ts', 'utf8');
const dossierTypesSource = fs.readFileSync(
  'src/types/appraisalDossier.ts',
  'utf8'
);
const workspaceSource = fs.readFileSync(
  'src/components/appraisals/AppraisalDossierWorkspace.tsx',
  'utf8'
);
const visitsSource = fs.readFileSync(
  'src/pages/FieldVisitsPage.tsx',
  'utf8'
);
const migrationSource = fs.readFileSync(
  'supabase/migrations/20260902210500_oe_007_004_field_evidence.sql',
  'utf8'
);
const viteSource = fs.readFileSync('vite.config.ts', 'utf8');
const visitServiceSource = fs.readFileSync(
  'src/fieldVisits/technicalVisitService.ts',
  'utf8'
);

await test('20. Fotografias novas usam validação de assinatura real do arquivo', () => {
  assert.equal(policySource.includes('verifyDocumentFileSignature'), true);
  assert.equal(policySource.includes('15 * 1024 * 1024'), true);
  assert.equal(typesSource.includes("'image/jpeg'"), true);
  assert.equal(typesSource.includes("'image/png'"), true);
  assert.equal(typesSource.includes("'image/tiff'"), true);
});

await test('21. Interface oferece geolocalização precisa do dispositivo', () => {
  assert.equal(panelSource.includes('navigator.geolocation.getCurrentPosition'), true);
  assert.equal(panelSource.includes('enableHighAccuracy: true'), true);
  assert.equal(panelSource.includes('maximumAge: 0'), true);
});

await test('22. Interface oferece entrada manual quando GPS não estiver disponível', () => {
  assert.equal(panelSource.includes('Latitude'), true);
  assert.equal(panelSource.includes('Longitude'), true);
  assert.equal(panelSource.includes('Salvar coordenadas informadas'), true);
  assert.equal(panelSource.includes('inputMode="decimal"'), true);
});

await test('23. Captura fotográfica usa câmera traseira quando suportada', () => {
  assert.equal(panelSource.includes('capture="environment"'), true);
  assert.equal(
    panelSource.includes('accept="image/jpeg,image/png,image/tiff"'),
    true
  );
  assert.equal(panelSource.includes('multiple'), true);
});

await test('24. Fotos e localização não são gravadas em armazenamento local do navegador', () => {
  const source = panelSource + '\n' + gatewaySource;
  assert.equal(
    /localStorage|sessionStorage|indexedDB|IndexedDB|readAsDataURL|base64/.test(source),
    false
  );
});

await test('25. Mesmo painel de evidências está presente no laudo e na visita', () => {
  assert.equal(workspaceSource.includes('<FieldEvidencePanel'), true);
  assert.equal(workspaceSource.includes('mode="appraisal"'), true);
  assert.equal(visitsSource.includes('<FieldEvidencePanel'), true);
  assert.equal(visitsSource.includes('mode="visit"'), true);
});

await test('26. Dossiê do laudo recebe resumo sincronizado das evidências', () => {
  assert.equal(dossierTypesSource.includes('fieldEvidence?:'), true);
  assert.equal(workspaceSource.includes('appraisalEvidenceSnapshot'), true);
  assert.equal(visitsSource.includes('appraisalEvidenceSnapshot'), true);
  assert.equal(visitsSource.includes('saveTechnicalDossier'), true);
});

await test('27. Seção Fotos e geolocalização aparece no dossiê antes dos anexos', () => {
  assert.equal(workspaceSource.includes("'field_evidence'"), true);
  assert.equal(workspaceSource.includes('8. Fotos e localização'), true);
  assert.equal(workspaceSource.includes('9. Anexos / Docs'), true);
  assert.equal(workspaceSource.includes('10. Emissão Formal'), true);
});

await test('28. Cadastro do cliente e do imóvel é consultado antes de pedir nova captura', () => {
  assert.equal(panelSource.includes('buildRegistryLocation'), true);
  assert.equal(panelSource.includes('properties.getPropertyById'), true);
  assert.equal(panelSource.includes('clients.getClientById'), true);
});

await test('29. Fotos documentais existentes no laudo são reutilizadas sem duplicar arquivo', () => {
  assert.equal(migrationSource.includes("d.logical_owner_type = 'appraisal'"), true);
  assert.equal(migrationSource.includes("d.category = 'photo_report'"), true);
  assert.equal(migrationSource.includes("'appraisal_document'"), true);
  assert.equal(
    migrationSource.includes('on conflict (evidence_id, document_version_id)'),
    true
  );
});

await test('30. Fotos documentais do cliente ou imóvel também alimentam a evidência', () => {
  assert.equal(migrationSource.includes("d.logical_owner_type = 'client'"), true);
  assert.equal(migrationSource.includes("d.logical_owner_type = 'property'"), true);
  assert.equal(migrationSource.includes("'registry_document'"), true);
});

await test('31. Coordenada do imóvel tem precedência e geometria fornece fallback', () => {
  assert.equal(
    migrationSource.includes("'{referenceCoordinate,latitude}'"),
    true
  );
  assert.equal(migrationSource.includes('public.property_geometries'), true);
  assert.equal(
    migrationSource.includes("'{totalMetrics,centroid,latitude}'"),
    true
  );
  assert.equal(migrationSource.includes("'property_geometry'"), true);
});

await test('32. Bucket de novas fotos é privado e limitado a imagens', () => {
  assert.equal(migrationSource.includes("'field-evidence'"), true);
  assert.equal(migrationSource.includes('false,\n  15728640'), true);
  assert.equal(
    migrationSource.includes("array['image/jpeg','image/png','image/tiff']"),
    true
  );
});

await test('33. Tabelas de evidência usam RLS e escrita direta fica revogada', () => {
  for (const table of [
    'field_evidence_sets',
    'field_evidence_photos',
    'field_evidence_events',
  ]) {
    assert.equal(migrationSource.includes('alter table public.' + table + ' enable row level security'), true);
  }
  assert.equal(
    migrationSource.includes(
      'revoke insert, update, delete, truncate, references, trigger'
    ),
    true
  );
});

await test('34. Conteúdo técnico não é exposto a captador ou financeiro', () => {
  assert.equal(
    migrationSource.includes(
      "in ('owner','company_admin','manager','project_designer')"
    ),
    true
  );
  const policyArea = migrationSource.slice(
    migrationSource.indexOf('agrocore_field_evidence_sets_select'),
    migrationSource.indexOf('create or replace function agrocore_private.validate_field_evidence_location')
  );
  assert.equal(policyArea.includes("'capturer'"), false);
  assert.equal(policyArea.includes("'finance'"), false);
});

await test('35. Mutação valida responsável, estado da visita e organização', () => {
  assert.equal(migrationSource.includes('AGROCORE_RESPONSIBLE_MISMATCH'), true);
  assert.equal(migrationSource.includes('AGROCORE_VISIT_NOT_READY'), true);
  assert.equal(
    migrationSource.includes('current_organization_role(p_organization_id)'),
    true
  );
});

await test('36. Escritas usam versão otimista para impedir sobrescrita concorrente', () => {
  assert.equal(migrationSource.includes('p_expected_version'), true);
  assert.equal(migrationSource.includes('AGROCORE_CONCURRENCY_CONFLICT'), true);
  assert.equal(gatewaySource.includes('expectedVersion'), true);
});

await test('37. Falha ao registrar foto remove o objeto recém-enviado', () => {
  assert.equal(gatewaySource.includes('.remove([objectPath])'), true);
});

await test('38. Imagens privadas são exibidas por URL temporária', () => {
  assert.equal(gatewaySource.includes('createSignedUrl'), true);
  assert.equal(gatewaySource.includes('Math.min(3600'), true);
});

await test('39. Produção possui factory próprio para evidências e não depende de preview', () => {
  assert.equal(viteSource.includes('production-field-evidence-gateway-factory'), true);
  assert.equal(viteSource.includes('SupabaseFieldEvidenceGateway'), true);
  assert.equal(viteSource.includes('UnavailableFieldEvidenceGateway'), true);
});

await test('40. Evidência não vira requisito artificial para concluir qualquer tipo de visita', () => {
  assert.equal(visitServiceSource.includes('FIELD_FORM_INCOMPLETE'), true);
  assert.equal(visitServiceSource.includes('fieldEvidence'), false);
});

await test('41. Layout de fotos e localização é mobile-first', () => {
  assert.equal(panelSource.includes('grid-cols-2'), true);
  assert.equal(panelSource.includes('sm:grid-cols-3'), true);
  assert.equal(panelSource.includes('sm:grid-cols-2'), true);
  assert.equal(/min-w-\[(?:[4-9]\d\d|\d{4,})px\]/.test(panelSource), false);
});

await test('42. Alvos de toque e estados de trabalho são acessíveis', () => {
  assert.equal(panelSource.includes('min-h-[44px]'), true);
  assert.equal(panelSource.includes('role="alert"'), true);
  assert.equal(panelSource.includes('role="status"'), true);
  assert.equal(panelSource.includes('aria-live="polite"'), true);
});

console.log('\n====================================================');
console.log('Resultado: ' + passed + ' passaram, ' + failed + ' falharam');
console.log('====================================================');

if (failed > 0) process.exit(1);
