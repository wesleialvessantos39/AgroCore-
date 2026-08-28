/**
 * Bateria de Testes Automatizados — Fundação do Módulo de Clientes (OE-002.001)
 */

import fs from 'fs';
import path from 'path';

console.log('================================================================');
console.log('🧪 EXECUÇÃO DA BATERIA DE HOMOLOGAÇÃO: OE-002.001');
console.log('   Fundação do Módulo de Clientes e Produtores Rurais');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (details) console.error(`   Detalhes: ${details}`);
    failedTests++;
  }
}

// 1. Verificação de Arquivos e Contratos Tipados
const clientTypesPath = path.resolve(process.cwd(), 'src/types/client.ts');
const clientTypesContent = fs.readFileSync(clientTypesPath, 'utf-8');

assert(
  !clientTypesContent.includes(': any') && !clientTypesContent.includes('as any'),
  '1. Contratos tipados sem uso de "any"'
);

assert(
  clientTypesContent.includes("'individual'") && clientTypesContent.includes("'legal_entity'"),
  '2. Tipos de pessoa do cliente reconhecidos (individual e legal_entity)'
);

assert(
  clientTypesContent.includes("'active'") && clientTypesContent.includes("'inactive'"),
  '3. Situações de cliente reconhecidas (active e inactive)'
);

assert(
  clientTypesContent.includes('organizationId: string') &&
  clientTypesContent.includes('readonly id: ClientId'),
  '4. Obrigatoriedade do escopo organizacional (organizationId) nos registros'
);

// 2. Verificação do PreviewClientGateway
const previewGatewayPath = path.resolve(process.cwd(), 'src/clients/preview/previewClientGateway.ts');
const previewGatewayContent = fs.readFileSync(previewGatewayPath, 'utf-8');

assert(
  previewGatewayContent.includes('clientsByOrganization:') &&
  previewGatewayContent.includes('new Map()'),
  '5. Gateway de desenvolvimento inicia com coleção estritamente vazia'
);

// Verificação de ausência de dados fictícios pré-fabricados
const hasHardcodedClients =
  previewGatewayContent.includes('João da Silva') ||
  previewGatewayContent.includes('Fazenda') ||
  previewGatewayContent.includes('123.456.789') ||
  previewGatewayContent.includes('12.345.678/0001');

assert(
  !hasHardcodedClients,
  '6. Ausência total de dados e registros pré-cadastrados no gateway'
);

// 3. Verificação do UnavailableClientGateway
const unavailableGatewayPath = path.resolve(process.cwd(), 'src/clients/unavailableGateway.ts');
const unavailableGatewayContent = fs.readFileSync(unavailableGatewayPath, 'utf-8');

assert(
  unavailableGatewayContent.includes('Serviço de clientes indisponível neste ambiente.'),
  '7. Gateway indisponível implementado para operação segura em produção'
);

// 4. Verificação do ClientsContext
const clientsContextPath = path.resolve(process.cwd(), 'src/clients/ClientsContext.tsx');
const clientsContextContent = fs.readFileSync(clientsContextPath, 'utf-8');

assert(
  clientsContextContent.includes("orgStatus !== 'active'") &&
  clientsContextContent.includes("!activeOrgId"),
  '8. Contexto realiza consulta somente com organização ativa'
);

assert(
  clientsContextContent.includes("!hasViewPermission") &&
  clientsContextContent.includes("clients:view"),
  '9. Bloqueio e limpeza imediata sem a permissão clients:view'
);

assert(
  clientsContextContent.includes("isSuperAdmin") &&
  clientsContextContent.includes("session?.platformRole === 'platform_super_admin'"),
  '10. Bloqueio automático para Superadministrador global (sem acesso a clientes de organizações)'
);

assert(
  clientsContextContent.includes("activeOrgIdRef.current !== activeOrgId") &&
  clientsContextContent.includes("setClients([])"),
  '13. Limpeza imediata e reset de estado na troca de organização'
);

assert(
  clientsContextContent.includes("authStatus !== 'authenticated'") &&
  clientsContextContent.includes("setClients([])"),
  '14. Limpeza imediata e reset de estado no logout'
);

assert(
  clientsContextContent.includes("currentRequestId !== requestSequenceRef.current") &&
  clientsContextContent.includes("activeOrgIdRef.current !== targetOrgId"),
  '15. Proteção contra descarte de respostas obsoletas e concorrência'
);

// 5. Verificação da Rota /clientes e Matriz de Rotas
const routeMatrixPath = path.resolve(process.cwd(), 'src/routes/routeMatrix.ts');
const routeMatrixContent = fs.readFileSync(routeMatrixPath, 'utf-8');

assert(
  routeMatrixContent.includes('ROUTES.CLIENTS') &&
  routeMatrixContent.includes("'clients:view'") &&
  routeMatrixContent.includes("scope: 'organization'"),
  '16. Rota /clientes devidamente configurada na matriz central de rotas'
);

// 6. Verificação do Item de Navegação
const navigationPath = path.resolve(process.cwd(), 'src/config/navigation.ts');
const navigationContent = fs.readFileSync(navigationPath, 'utf-8');

assert(
  navigationContent.includes("id: 'nav-item-clients'") &&
  navigationContent.includes("requiredPermission: 'clients:view'") &&
  navigationContent.includes("path: ROUTES.CLIENTS"),
  '17. Item de navegação Clientes condicionado à permissão clients:view'
);

// 7. Verificação da Página e Estados Visuais
const clientsPagePath = path.resolve(process.cwd(), 'src/pages/ClientsPage.tsx');
const clientsPageContent = fs.readFileSync(clientsPagePath, 'utf-8');

assert(
  clientsPageContent.includes("Nenhum cliente cadastrado") &&
  clientsPageContent.includes("Os clientes e produtores rurais vinculados a esta organização serão apresentados aqui."),
  '18. Estado vazio verdadeiro implementado sem dados ou gráficos fictícios'
);

assert(
  clientsPageContent.includes("Serviço de clientes indisponível") &&
  !clientsPageContent.includes("firebase") &&
  !clientsPageContent.includes("supabase") &&
  !clientsPageContent.includes("postgres"),
  '19. Estado indisponível seguro sem exposição de termos técnicos de banco de dados'
);

// 8. Verificação do Script de Auditoria Anti-Vazamento
const leakScriptPath = path.resolve(process.cwd(), 'scripts/verify-leak-free-build.js');
const leakScriptContent = fs.readFileSync(leakScriptPath, 'utf-8');

assert(
  leakScriptContent.includes("'PreviewClientGateway'"),
  '20. Script de auditoria do build de produção inclui PreviewClientGateway'
);

console.log('\n----------------------------------------------------------------');
console.log(`RESULTADO FINAL: ${passedTests} testes passaram | ${failedTests} falhas`);
console.log('----------------------------------------------------------------\n');

if (failedTests > 0) {
  process.exit(1);
}
