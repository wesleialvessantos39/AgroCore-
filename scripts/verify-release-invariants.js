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
  !Object.prototype.hasOwnProperty.call(packageJson.scripts ?? {}, 'prebuild'),
  'O build de produção não pode depender do prebuild temporário de diagnóstico.'
);

console.log('✅ Invariantes de release aprovadas: entrada pública, login utilizável e OE-007.001 integrada.');
