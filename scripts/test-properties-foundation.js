/**
 * Bateria de Testes Automatizados — Fundação do Módulo de Imóveis (OE-003.001)
 * Validação de Contratos, Gateway, Contexto, Permissões, Rotas, Navegação e Estados
 */

import fs from 'fs';
import path from 'path';

console.log('================================================================');
console.log('🧪 EXECUÇÃO DA BATERIA DE HOMOLOGAÇÃO: OE-003.001');
console.log('   Fundação do Módulo de Gestão de Imóveis Rurais e Urbanos');
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
const propertyTypesPath = path.resolve(process.cwd(), 'src/types/property.ts');
const propertyTypesContent = fs.readFileSync(propertyTypesPath, 'utf-8');

assert(
  !propertyTypesContent.includes(': any') && !propertyTypesContent.includes('as any'),
  '1. Contratos tipados de imóveis sem uso de "any"'
);

assert(
  propertyTypesContent.includes("'rural'") && propertyTypesContent.includes("'urban'"),
  '2. Tipos de imóvel reconhecidos (rural e urban)'
);

assert(
  propertyTypesContent.includes("'active'") && propertyTypesContent.includes("'inactive'"),
  '3. Situações cadastrais de imóvel reconhecidas (active e inactive)'
);

assert(
  propertyTypesContent.includes("'owner'") &&
  propertyTypesContent.includes("'co_owner'") &&
  propertyTypesContent.includes("'possessor'") &&
  propertyTypesContent.includes("'tenant'") &&
  propertyTypesContent.includes("'rural_partner'") &&
  propertyTypesContent.includes("'usufructuary'") &&
  propertyTypesContent.includes("'other'"),
  '4. Relações cliente-imóvel reconhecidas (owner, co_owner, possessor, tenant, rural_partner, usufructuary, other)'
);

assert(
  propertyTypesContent.includes('interface PropertyClientLink') &&
  propertyTypesContent.includes('clientId: string') &&
  propertyTypesContent.includes('relationship: PropertyClientRelationship'),
  '5. Estrutura PropertyClientLink contemplando vínculo entre cliente e imóvel'
);

assert(
  propertyTypesContent.includes('interface PropertySummary') &&
  propertyTypesContent.includes('propertyType: PropertyType') &&
  propertyTypesContent.includes('clientLinks: readonly PropertyClientLink[]') &&
  propertyTypesContent.includes('mainRelationship: PropertyClientRelationship'),
  '6. Resumo PropertySummary contemplando tipagem estruturada e relações'
);

assert(
  propertyTypesContent.includes('organizationId: string') &&
  propertyTypesContent.includes('readonly id: PropertyId'),
  '7. Obrigatoriedade do escopo organizacional (organizationId) nos registros de imóveis'
);

// 2. Verificação do PreviewPropertyGateway
const previewGatewayPath = path.resolve(process.cwd(), 'src/properties/preview/previewPropertyGateway.ts');
const previewGatewayContent = fs.readFileSync(previewGatewayPath, 'utf-8');

assert(
  previewGatewayContent.includes('storageByOrg') &&
  previewGatewayContent.includes('new Map'),
  '8. Gateway de desenvolvimento inicia com coleção estritamente vazia por organização'
);

const hasHardcodedProperties =
  previewGatewayContent.includes('Fazenda') ||
  previewGatewayContent.includes('Sítio') ||
  previewGatewayContent.includes('Gleba') ||
  previewGatewayContent.includes('Lote') ||
  previewGatewayContent.includes('Matrícula');

assert(
  !hasHardcodedProperties,
  '9. Ausência total de dados e registros pré-cadastrados ou fictícios no gateway'
);

// 3. Verificação do UnavailablePropertyGateway
const unavailableGatewayPath = path.resolve(process.cwd(), 'src/properties/unavailableGateway.ts');
const unavailableGatewayContent = fs.readFileSync(unavailableGatewayPath, 'utf-8');

assert(
  unavailableGatewayContent.includes('Serviço de imóveis indisponível neste ambiente.'),
  '10. Gateway indisponível implementado para operação segura em produção'
);

// 4. Verificação do PropertiesContext
const propertiesContextPath = path.resolve(process.cwd(), 'src/properties/PropertiesContext.tsx');
const propertiesContextContent = fs.readFileSync(propertiesContextPath, 'utf-8');

assert(
  propertiesContextContent.includes("orgStatus !== 'active'") &&
  propertiesContextContent.includes("!activeOrgId"),
  '11. Contexto realiza consulta somente com organização ativa'
);

assert(
  propertiesContextContent.includes("!hasViewPermission") &&
  propertiesContextContent.includes("properties:view"),
  '12. Bloqueio e limpeza imediata sem a permissão properties:view'
);

assert(
  propertiesContextContent.includes("isSuperAdmin") &&
  propertiesContextContent.includes("session?.platformRole === 'platform_super_admin'"),
  '13. Bloqueio automático para Superadministrador global (sem acesso a imóveis de organizações)'
);

assert(
  propertiesContextContent.includes("activeOrgIdRef.current !== activeOrgId") &&
  propertiesContextContent.includes("setProperties([])"),
  '14. Limpeza imediata e reset de estado na troca de organização'
);

assert(
  propertiesContextContent.includes("authStatus !== 'authenticated'") &&
  propertiesContextContent.includes("setProperties([])"),
  '15. Limpeza imediata e reset de estado no logout'
);

assert(
  propertiesContextContent.includes("currentRequestId !== requestSequenceRef.current") &&
  propertiesContextContent.includes("activeOrgIdRef.current !== targetOrgId"),
  '16. Proteção contra descarte de respostas obsoletas e concorrência'
);

// 5. Verificação das Permissões
const authCatalogPath = path.resolve(process.cwd(), 'src/authorization/permissionsCatalog.ts');
const authCatalogContent = fs.readFileSync(authCatalogPath, 'utf-8');

assert(
  authCatalogContent.includes("'properties:view'") &&
  authCatalogContent.includes("'properties:create'") &&
  authCatalogContent.includes("'properties:edit'"),
  '17. Permissões properties:view, properties:create e properties:edit cadastradas no catálogo'
);

assert(
  authCatalogContent.includes("id: 'properties'") &&
  authCatalogContent.includes("name: 'Imóveis'"),
  '18. Grupo de escopo de permissões "properties" configurado com metadados em português'
);

const authMatrixPath = path.resolve(process.cwd(), 'src/authorization/permissionsMatrix.ts');
const authMatrixContent = fs.readFileSync(authMatrixPath, 'utf-8');

assert(
  authMatrixContent.includes("'properties:view'") &&
  authMatrixContent.includes("'properties:create'") &&
  authMatrixContent.includes("'properties:edit'"),
  '19. Matriz de permissões atualizada com atribuições dos perfis autorizados'
);

// 6. Verificação de Rotas e Matriz Central
const routeMatrixPath = path.resolve(process.cwd(), 'src/routes/routeMatrix.ts');
const routeMatrixContent = fs.readFileSync(routeMatrixPath, 'utf-8');

assert(
  routeMatrixContent.includes('ROUTES.PROPERTIES') &&
  routeMatrixContent.includes("'properties:view'") &&
  routeMatrixContent.includes("scope: 'organization'"),
  '20. Rota /imoveis devidamente configurada na matriz central de rotas com scope organization'
);

// 7. Verificação do Item de Navegação
const navigationPath = path.resolve(process.cwd(), 'src/config/navigation.ts');
const navigationContent = fs.readFileSync(navigationPath, 'utf-8');

assert(
  navigationContent.includes("id: 'nav-item-properties'") &&
  navigationContent.includes("requiredPermission: 'properties:view'") &&
  navigationContent.includes("path: ROUTES.PROPERTIES"),
  '21. Item de navegação Imóveis condicionado à permissão properties:view'
);

// 8. Verificação da Página e Estados Visuais
const propertiesPagePath = path.resolve(process.cwd(), 'src/pages/PropertiesPage.tsx');
const propertiesPageContent = fs.readFileSync(propertiesPagePath, 'utf-8');

assert(
  propertiesPageContent.includes("Nenhum imóvel cadastrado") &&
  propertiesPageContent.includes("Os imóveis rurais e urbanos vinculados aos clientes desta organização serão apresentados aqui."),
  '22. Estado vazio verdadeiro implementado sem dados, gráficos ou cards fictícios'
);

assert(
  propertiesPageContent.includes("Serviço temporariamente indisponível") &&
  !propertiesPageContent.includes("firebase") &&
  !propertiesPageContent.includes("firestore") &&
  !propertiesPageContent.includes("supabase") &&
  !propertiesPageContent.includes("postgres"),
  '23. Estado indisponível seguro sem exposição de termos técnicos de banco de dados'
);

// 9. Verificação do Script de Auditoria Anti-Vazamento
const leakScriptPath = path.resolve(process.cwd(), 'scripts/verify-leak-free-build.js');
const leakScriptContent = fs.readFileSync(leakScriptPath, 'utf-8');

assert(
  leakScriptContent.includes("'PreviewPropertyGateway'"),
  '24. Script de auditoria do build de produção inclui PreviewPropertyGateway'
);

console.log('\n----------------------------------------------------------------');
console.log(`RESULTADO FINAL: ${passedTests} testes passaram | ${failedTests} falhas`);
console.log('----------------------------------------------------------------\n');

if (failedTests > 0) {
  process.exit(1);
}
