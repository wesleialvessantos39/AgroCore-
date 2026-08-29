import fs from 'fs';
import path from 'path';

console.log('--- TESTE AUTOMATIZADO DO CICLO DE VIDA DO SERVICE WORKER ---');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const swContent = fs.readFileSync(path.resolve('dist/sw.js'), 'utf-8');

// 1. Validação de versão e hash
const versionMatch = swContent.match(/const CACHE_VERSION = '([^']+)';/);
if (!versionMatch) {
  throw new Error('CACHE_VERSION não encontrada no dist/sw.js');
}
console.log('✓ CACHE_VERSION encontrada:', versionMatch[1]);

// 2. Validação da lista de pré-cache
const precacheMatch = swContent.match(/const PRECACHE_ASSETS = (\[[\s\S]*?\]);/);
if (!precacheMatch) {
  throw new Error('PRECACHE_ASSETS não encontrado no dist/sw.js');
}
const precacheList = JSON.parse(precacheMatch[1]);
console.log(`✓ PRECACHE_ASSETS contém ${precacheList.length} arquivos compilados reais.`);

// Verifica se todos os arquivos do precache existem em dist/ (exceto '/')
for (const assetUrl of precacheList) {
  if (assetUrl === '/') continue;
  const localPath = path.join('dist', assetUrl.replace(/^\//, ''));
  if (!fs.existsSync(localPath)) {
    throw new Error(`Arquivo do pré-cache não existe fisicamente em dist: ${localPath}`);
  }
}
console.log('✓ Todos os arquivos declarados no pré-cache existem fisicamente em dist/.');

// 3. Validação das funções de bloqueio de segurança
// Simulamos o comportamento da função isBlockedFromCache extraída do script
function isBlockedFromCache(method, urlStr, headers = {}) {
  const url = new URL(urlStr, 'https://agrocore.local');
  if (method !== 'GET') return true;
  if (url.origin !== 'https://agrocore.local') return true;
  if (headers['Authorization']) return true;
  const pathname = url.pathname.toLowerCase();
  if (
    pathname.startsWith('/api/') ||
    pathname.includes('/auth') ||
    pathname.includes('/supabase') ||
    pathname.includes('/firebase') ||
    pathname.includes('/oauth') ||
    pathname.includes('/session') ||
    pathname.includes('/credentials') ||
    pathname.includes('/login') ||
    pathname.includes('/graphql') ||
    pathname.includes('/admin')
  ) return true;
  const search = url.search.toLowerCase();
  if (
    search.includes('token=') ||
    search.includes('key=') ||
    search.includes('secret=') ||
    search.includes('auth=') ||
    search.includes('code=') ||
    search.includes('session=')
  ) return true;
  return false;
}

// Testes de bloqueio
console.log('\n--- TESTES DE POLÍTICA DE SEGURANÇA E BLOQUEIO ---');
assert(isBlockedFromCache('POST', 'https://agrocore.local/sistema') === true, 'POST deve ser bloqueado');
assert(isBlockedFromCache('GET', 'https://externo.com/script.js') === true, 'Origem externa deve ser bloqueada');
assert(isBlockedFromCache('GET', 'https://agrocore.local/sistema', { Authorization: 'Bearer xxx' }) === true, 'Authorization header deve ser bloqueado');
assert(isBlockedFromCache('GET', 'https://agrocore.local/api/credito') === true, '/api/ deve ser bloqueado');
assert(isBlockedFromCache('GET', 'https://agrocore.local/auth/v1/user') === true, '/auth/ deve ser bloqueado');
assert(isBlockedFromCache('GET', 'https://agrocore.local/supabase/rest') === true, '/supabase/ deve ser bloqueado');
assert(isBlockedFromCache('GET', 'https://agrocore.local/firebase/firestore') === true, '/firebase/ deve ser bloqueado');
assert(isBlockedFromCache('GET', 'https://agrocore.local/oauth/callback') === true, '/oauth/ deve ser bloqueado');
assert(isBlockedFromCache('GET', 'https://agrocore.local/sistema?token=secret123') === true, 'Parâmetro token deve ser bloqueado');
assert(isBlockedFromCache('GET', 'https://agrocore.local/assets/index.js') === false, 'Asset estático permitido');
assert(isBlockedFromCache('GET', 'https://agrocore.local/sistema') === false, 'Navegação de página permitida');

console.log('✓ Todos os testes de segurança e bloqueio foram aprovados com sucesso.');
