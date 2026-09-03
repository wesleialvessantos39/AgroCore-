import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifest = JSON.parse(read('public/manifest.webmanifest'));
const appRoutes = read('src/routes/AppRoutes.tsx');
const routeMatrix = read('src/routes/routeMatrix.ts');
const signIn = read('src/pages/SignInPage.tsx');
const header = read('src/components/Header.tsx');
const hero = read('src/components/Hero.tsx');
const fieldTests = read('scripts/test-field-visits-foundation.ts');
const fieldPreparationTests = read('scripts/test-field-visits-preparation.ts');
const fieldFormTests = read('scripts/test-field-visits-field-form.ts');
const fieldEvidenceTests = read('scripts/test-field-visits-evidence.ts');
const fieldAccessibilityTests = read('scripts/test-field-visits-accessibility.ts');
const fieldPreparationPanel = read('src/fieldVisits/VisitPreparationPanel.tsx');
const fieldFormPanel = read('src/fieldVisits/VisitFieldFormPanel.tsx');
const fieldEvidencePanel = read('src/fieldVisits/FieldEvidencePanel.tsx');
const appraisalWorkspace = read('src/components/appraisals/AppraisalDossierWorkspace.tsx');
const appraisalDossierTypes = read('src/types/appraisalDossier.ts');
const fieldVisitTypes = read('src/types/technicalVisit.ts');
const fieldPreparationService = read('src/fieldVisits/preparationService.ts');
const viteConfig = read('vite.config.ts');
const packageJson = JSON.parse(read('package.json'));

assert(manifest.id === '/', 'O PWA AgroCore deve possuir id raiz /.');
assert(manifest.start_url === '/', 'O PWA AgroCore deve iniciar na página pública /.');
assert(
  appRoutes.includes('path={ROUTES.HOME} element={<InstitutionalPage />}'),
  'A rota inicial deve renderizar a página institucional.'
);
assert(
  header.includes('to={ROUTES.SIGN_IN}'),
  'O acesso do cabeçalho deve apontar explicitamente para a tela de entrada.'
);
assert(
  hero.includes('to={ROUTES.SIGN_IN}'),
  'O acesso principal deve apontar explicitamente para a tela de entrada.'
);
assert(
  !signIn.includes('disabled={isSubmitting || !import.meta.env.DEV}'),
  'Os controles de autenticação não podem ser bloqueados apenas por estar em produção.'
);
assert(
  routeMatrix.includes('path: ROUTES.FIELD_VISITS') &&
    routeMatrix.includes("requiredPermissions: 'surveys_and_visits:view'"),
  'A OE-007.001 deve permanecer registrada na matriz central de rotas e RBAC.'
);
assert(
  !fieldTests.includes('process.exit(0)'),
  'A suíte da OE-007.001 não pode conter interrupções de diagnóstico.'
);
assert(
  !fieldPreparationTests.includes('process.exit(0)'),
  'A suíte da OE-007.002 não pode conter interrupções de diagnóstico.'
);
assert(
  !fieldFormTests.includes('process.exit(0)'),
  'A suíte da OE-007.003 não pode conter interrupções de diagnóstico.'
);
assert(
  !fieldEvidenceTests.includes('process.exit(0)'),
  'A suíte da OE-007.004 não pode conter interrupções de diagnóstico.'
);
assert(
  fieldPreparationPanel.includes('Fuso horário') &&
    fieldPreparationPanel.includes('Checklist prévio') &&
    fieldPreparationPanel.includes('Autorizar exceção e salvar'),
  'A preparação operacional da OE-007.002 deve permanecer integrada à interface.'
);
assert(
  viteConfig.includes('production-field-form-gateway-factory') &&
    viteConfig.includes('SupabaseTechnicalVisitFieldFormGateway') &&
    viteConfig.includes('UnavailableTechnicalVisitFieldFormGateway'),
  'O build de produção da OE-007.003 deve usar o factory seguro do formulário de campo sem depender do preview.'
);
assert(
  viteConfig.includes('production-field-evidence-gateway-factory') &&
    viteConfig.includes('SupabaseFieldEvidenceGateway') &&
    viteConfig.includes('UnavailableFieldEvidenceGateway'),
  'O build de produção da OE-007.004 deve usar o serviço seguro de fotos e localização sem depender do preview.'
);
assert(
  viteConfig.includes('production-capturer-assignment-gateway-factory') &&
    viteConfig.includes('SupabaseClientCapturerAssignmentGateway') &&
    fieldEvidenceTests.includes('Solicitar ao captador responsável'),
  'A OE-007.004 deve resolver o captador responsável pelo vínculo Cliente ↔ Captador persistido no Supabase.'
);
assert(
  fieldEvidencePanel.includes('Fotos e geolocalização') &&
    fieldEvidencePanel.includes('Usar localização do dispositivo') &&
    fieldEvidencePanel.includes('Adicionar fotos') &&
    appraisalWorkspace.includes('8. Fotos e localização') &&
    appraisalDossierTypes.includes('fieldEvidence?:'),
  'Fotos e localização da OE-007.004 devem permanecer sincronizadas entre visita e laudo.'
);
assert(
  fieldFormPanel.includes('Formulário de campo') &&
    fieldFormPanel.includes('Adicionar seção') &&
    fieldFormPanel.includes('Enviar formulário') &&
    fieldFormPanel.includes("addEventListener('beforeunload'"),
  'O formulário de campo da OE-007.003 deve permanecer integrado, progressivo e protegido contra perda.'
);
assert(
  !fieldPreparationPanel.includes('Veículo previsto') &&
    !fieldVisitTypes.includes('vehicleReference') &&
    !fieldPreparationService.includes('vehicleReference'),
  'A OE-007.002 não pode antecipar a integração com frota prevista para OE-007.006.'
);
assert(
  fieldAccessibilityTests.includes('[320, 390, 430, 720, 768, 1024, 1366, 1440]') &&
    fieldAccessibilityTests.includes('firstFieldRef.current?.focus()'),
  'A auditoria estrutural de responsividade e acessibilidade do Módulo 007 deve permanecer ativa.'
);
assert(
  !Object.prototype.hasOwnProperty.call(packageJson.scripts ?? {}, 'prebuild'),
  'O build de produção não pode depender do prebuild temporário de diagnóstico.'
);
assert(
  typeof packageJson.scripts?.build === 'string' &&
    packageJson.scripts.build.includes('test:module-001') &&
    packageJson.scripts.build.includes('test:module-002') &&
    packageJson.scripts.build.includes('test:module-003') &&
    packageJson.scripts.build.includes('test:module-006') &&
    packageJson.scripts.build.includes('test:module-007'),
  'O gate de produção deve executar as homologações de código dos Módulos 001, 002, 003, 006 e 007.'
);

console.log('✅ Invariantes de release aprovadas: entrada pública, login utilizável e Módulo 007 integrado até OE-007.004.');
