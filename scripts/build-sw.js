import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DIST_DIR = path.resolve(process.cwd(), 'dist');

if (!fs.existsSync(DIST_DIR)) {
  console.error('ERRO FATAL: Diretório dist/ não encontrado. Execute o build do Vite primeiro.');
  process.exit(1);
}

function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

try {
  const allFiles = getFilesRecursively(DIST_DIR);
  
  // Filtra arquivos que NÃO devem entrar no pré-cache (ex: o próprio sw.js, mapas de fonte)
  const candidateFiles = allFiles.filter((filePath) => {
    const relativePath = path.relative(DIST_DIR, filePath).replace(/\\/g, '/');
    if (relativePath === 'sw.js') return false;
    if (relativePath.endsWith('.map')) return false;
    return true;
  });

  if (candidateFiles.length === 0) {
    console.error('ERRO FATAL: Nenhum arquivo de asset encontrado em dist/ para pré-cache.');
    process.exit(1);
  }

  // Gera lista de URLs de pré-cache e calcula hash de conteúdo composto
  const precacheList = [];
  const hasher = crypto.createHash('sha256');

  // Adiciona a rota raiz / que serve a casca da aplicação
  precacheList.push('/');

  for (const file of candidateFiles) {
    const relativePath = path.relative(DIST_DIR, file).replace(/\\/g, '/');
    const url = '/' + relativePath;
    const content = fs.readFileSync(file);
    hasher.update(content);
    precacheList.push(url);
  }

  // Ordena para garantir determinismo
  precacheList.sort();

  const buildHash = hasher.digest('hex').substring(0, 10);
  const cacheVersion = `agrocore-cache-${buildHash}`;

  console.log(`[build-sw] Build Hash: ${buildHash}`);
  console.log(`[build-sw] Cache Version: ${cacheVersion}`);
  console.log(`[build-sw] Total de assets no pré-cache: ${precacheList.length}`);

  const swTemplate = `// Service Worker Oficial de Produção — AgroCore
// Versão do Cache Gerada Automaticamente pelo Build: ${cacheVersion}
// Total de Assets no Pré-cache: ${precacheList.length}

const CACHE_VERSION = '${cacheVersion}';
const CACHE_PREFIX = 'agrocore-';

// Manifesto de Pré-cache gerado deterministicamente a partir dos artefatos em dist/
const PRECACHE_ASSETS = ${JSON.stringify(precacheList, null, 2)};

// Limite máximo de entradas no cache dinâmico de runtime
const MAX_RUNTIME_CACHE_ENTRIES = 50;

// 1. INSTALAÇÃO: Pré-cache integral e atômico dos assets compilados
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // Não chamamos skipWaiting() aqui para permitir controle deliberado de atualização (UpdateNotice)
});

// 2. ATIVAÇÃO: Limpeza estrita e seletiva apenas de caches com prefixo agrocore- de versões anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_VERSION) {
            console.log('[AgroCore SW] Removendo cache obsoleto:', cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. MENSAGENS: Tratamento explícito de SKIP_WAITING acionado pelo usuário
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. POLÍTICA DE SEGURANÇA E BLOQUEIO ABSOLUTO DE CACHE
function isBlockedFromCache(request, url) {
  // A. Apenas requisições HTTP GET podem ser cacheadas
  if (request.method !== 'GET') {
    return true;
  }

  // B. Bloqueio absoluto de origens externas / terceiros
  if (url.origin !== self.location.origin) {
    return true;
  }

  // C. Bloqueio de requisições autenticadas ou com cabeçalho de autorização
  if (request.headers.has('Authorization')) {
    return true;
  }

  // D. Bloqueio estrito de rotas de API, autenticação, entrada, recuperação de acesso, atualização de senha e dados sensíveis
  const pathname = url.pathname.toLowerCase();
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/entrar') ||
    pathname.startsWith('/recuperar-acesso') ||
    pathname.startsWith('/atualizar-senha') ||
    pathname.includes('/auth') ||
    pathname.includes('/supabase') ||
    pathname.includes('/firebase') ||
    pathname.includes('/oauth') ||
    pathname.includes('/session') ||
    pathname.includes('/credentials') ||
    pathname.includes('/login') ||
    pathname.includes('/recuperar') ||
    pathname.includes('/senha') ||
    pathname.includes('/organizacao') ||
    pathname.includes('/graphql') ||
    pathname.includes('/admin')
  ) {
    return true;
  }

  // E. Bloqueio de URLs que contenham parâmetros sensíveis (token, code, session, auth, key, secret, credentials)
  const search = url.search.toLowerCase();
  if (
    search.includes('token') ||
    search.includes('code') ||
    search.includes('session') ||
    search.includes('auth') ||
    search.includes('key') ||
    search.includes('secret') ||
    search.includes('credentials') ||
    search.includes('mode=')
  ) {
    return true;
  }

  return false;
}

// 5. GERENCIAMENTO E PODA DO CACHE DINÂMICO DE RUNTIME
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // Remove as entradas mais antigas (FIFO) exceto as que pertencem ao pré-cache original
    for (let i = 0; i < keys.length - maxItems; i++) {
      const requestUrl = new URL(keys[i].url).pathname;
      if (!PRECACHE_ASSETS.includes(requestUrl)) {
        await cache.delete(keys[i]);
      }
    }
  }
}

// 6. VALIDAÇÃO DE RESPOSTA PARA CACHE
function isValidResponseForCache(response) {
  if (!response) return false;
  // Apenas respostas com status 200 OK
  if (response.status !== 200) return false;
  // Bloqueia respostas opacas ou redirecionamentos opacos
  if (response.type === 'opaque' || response.type === 'opaqueredirect') return false;
  // Respeita diretivas Cache-Control que proíbem armazenamento
  const cacheControl = response.headers.get('Cache-Control');
  if (cacheControl && (cacheControl.includes('no-store') || cacheControl.includes('private'))) {
    return false;
  }
  return true;
}

// 7. FETCH HANDLER: Estratégias determinísticas por tipo de recurso
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Regra de segurança: Bloqueia qualquer recurso sensível ou não-cacheável
  if (isBlockedFromCache(request, url)) {
    return;
  }

  // ESTRATÉGIA A: Network First com fallback de SPA / Offline para Navegação (Páginas públicas/gerais)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (isValidResponseForCache(networkResponse)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // 1. Tenta recuperar a resposta da página em cache
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // 2. Fallback para a casca SPA (index.html)
          const appShell = (await caches.match('/index.html')) || (await caches.match('/'));
          if (appShell) {
            return appShell;
          }
          // 3. Fallback para a página offline isolada
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) {
            return offlinePage;
          }
          return new Response('Sem conexão com a internet', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }

  // ESTRATÉGIA B: Cache First EXCLUSIVAMENTE para Assets Compilados Imutáveis ou Presentes no Pré-cache
  const isAllowedAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    PRECACHE_ASSETS.includes(url.pathname) ||
    ['style', 'script', 'image', 'font'].includes(request.destination);

  if (isAllowedAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (isValidResponseForCache(networkResponse)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(request, responseToCache);
              trimCache(CACHE_VERSION, MAX_RUNTIME_CACHE_ENTRIES);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // ESTRATÉGIA C: Recursos desconhecidos da mesma origem utilizam SOMENTE a rede (sem poluir o cache)
  event.respondWith(fetch(request));
});
`;

  // Grava exclusivamente em dist/sw.js (destino de produção)
  fs.writeFileSync(path.join(DIST_DIR, 'sw.js'), swTemplate, 'utf-8');

  console.log('✅ Service Worker gerado com sucesso exclusivamente em dist/sw.js');
} catch (err) {
  console.error('ERRO FATAL na geração do Service Worker:', err);
  process.exit(1);
}
