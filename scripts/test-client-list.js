/**
 * Bateria de Testes Automatizados — Busca, Filtros, Ordenação e Paginação de Clientes (OE-002.003)
 *
 * Casos de teste cobrindo:
 * 1. Inicialização volátil e isolamento por organizationId.
 * 2. Busca por nome completo (case-insensitive, sem acentos).
 * 3. Busca por razão social e nome fantasia.
 * 4. Busca por CPF normalizado (com e sem máscara).
 * 5. Busca por CNPJ normalizado (com e sem máscara).
 * 6. Filtro por tipo de pessoa (PF, PJ, todas).
 * 7. Filtro por situação (ativas, inativas, todas).
 * 8. Combinação cumulativa de busca + tipo + situação.
 * 9. Ordenação por Nome A-Z e Z-A com locale pt-BR e desempate determinístico.
 * 10. Ordenação por Data de Criação (mais recentes e mais antigos).
 * 11. Paginação real (tamanhos 10, 25, 50, corte seguro de páginas).
 * 12. Metadados de paginação (total, page, pageSize, totalPages).
 * 13. Cancelamento por AbortSignal.
 * 14. Mascaramento seguro de documentos.
 */

import { PreviewClientGateway } from '../src/clients/preview/previewClientGateway.ts';
import {
  normalizeSearchTerm,
  normalizeDigits,
  maskCpf,
  maskCnpj,
} from '../src/clients/validators.ts';

console.log('================================================================');
console.log('🧪 EXECUÇÃO DA BATERIA DE HOMOLOGAÇÃO: OE-002.003');
console.log('   Busca, Filtros, Ordenação e Paginação de Clientes');
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

async function runListTests() {
  const gateway = new PreviewClientGateway();
  const ORG_A = 'org-agronegocios-alpha';
  const ORG_B = 'org-fazendas-beta';

  // 1. Início vazio
  const initialPage = await gateway.listClients({
    organizationId: ORG_A,
    page: 1,
    pageSize: 10,
  });
  assert(
    initialPage.items.length === 0 && initialPage.total === 0 && initialPage.totalPages === 1,
    '1. Gateway inicia com coleção vazia e metadados zerados'
  );

  // População controlada de 12 clientes em ORG_A para testes de busca, filtros, sort e paginação
  const clientSeed = [
    {
      personType: 'individual',
      name: 'Álvaro Guimarães Silva',
      cpf: '52998224725',
      rg: 'MG-12.345.678',
      birthDate: '1980-04-10',
      contact: { primaryPhone: '62999991111', isPrimaryPhoneWhatsapp: true },
      address: { addressType: 'urban', zipCode: '74000000', street: 'Rua 1', number: '10', neighborhood: 'Centro', city: 'Goiânia', state: 'GO' },
      status: 'active',
    },
    {
      personType: 'individual',
      name: 'Beatriz Álvares Cabral',
      cpf: '11144477735',
      birthDate: '1990-08-15',
      contact: { primaryPhone: '62999992222', isPrimaryPhoneWhatsapp: false },
      address: { addressType: 'urban', zipCode: '74000000', street: 'Rua 2', number: '20', neighborhood: 'Sul', city: 'Goiânia', state: 'GO' },
      status: 'active',
    },
    {
      personType: 'individual',
      name: 'Carlos Eduardo Santana',
      cpf: '22255588899',
      birthDate: '1975-01-20',
      contact: { primaryPhone: '62999993333', isPrimaryPhoneWhatsapp: true },
      address: { addressType: 'rural', locality: 'Gleba 01', accessDescription: 'Km 12', city: 'Rio Verde', state: 'GO' },
      status: 'inactive',
    },
    {
      personType: 'legal_entity',
      companyName: 'Agropecuária São José Ltda',
      tradeName: 'Fazenda São José',
      cnpj: '00000000000191',
      isStateRegistrationExempt: false,
      stateRegistration: '10.987.654-3',
      contact: { primaryPhone: '62999994444', isPrimaryPhoneWhatsapp: false },
      address: { addressType: 'rural', locality: 'Zona Rural', accessDescription: 'Trevo Sul', city: 'Jataí', state: 'GO' },
      status: 'active',
    },
    {
      personType: 'legal_entity',
      companyName: 'Boa Safra Cereais S.A.',
      tradeName: 'Armazéns Boa Safra',
      cnpj: '11222333000181',
      isStateRegistrationExempt: true,
      contact: { primaryPhone: '62999995555', isPrimaryPhoneWhatsapp: true },
      address: { addressType: 'urban', zipCode: '74000000', street: 'Av Brasil', number: '500', neighborhood: 'Distrito Industrial', city: 'Anápolis', state: 'GO' },
      status: 'active',
    },
    {
      personType: 'legal_entity',
      companyName: 'Cerrado Grãos e Insumos Eireli',
      tradeName: 'Cerrado Insumos',
      cnpj: '22333444000192',
      isStateRegistrationExempt: true,
      contact: { primaryPhone: '62999996666', isPrimaryPhoneWhatsapp: false },
      address: { addressType: 'urban', zipCode: '74000000', street: 'Rua C', number: '30', neighborhood: 'Industrial', city: 'Rio Verde', state: 'GO' },
      status: 'inactive',
    },
    {
      personType: 'individual',
      name: 'Daniela Ferreira Rocha',
      cpf: '33366699900',
      birthDate: '1988-11-30',
      contact: { primaryPhone: '62999997777', isPrimaryPhoneWhatsapp: true },
      address: { addressType: 'urban', zipCode: '74000000', street: 'Rua 4', number: '40', neighborhood: 'Oeste', city: 'Goiânia', state: 'GO' },
      status: 'active',
    },
    {
      personType: 'individual',
      name: 'Élson Martins Filho',
      cpf: '44477700011',
      birthDate: '1965-03-25',
      contact: { primaryPhone: '62999998888', isPrimaryPhoneWhatsapp: false },
      address: { addressType: 'rural', locality: 'Assentamento Esperança', accessDescription: 'Estrada Velha', city: 'Cristalina', state: 'GO' },
      status: 'active',
    },
    {
      personType: 'individual',
      name: 'Fernanda Lima Castro',
      cpf: '55588811122',
      birthDate: '1992-07-14',
      contact: { primaryPhone: '62999999999', isPrimaryPhoneWhatsapp: true },
      address: { addressType: 'urban', zipCode: '74000000', street: 'Rua 5', number: '50', neighborhood: 'Bueno', city: 'Goiânia', state: 'GO' },
      status: 'inactive',
    },
    {
      personType: 'legal_entity',
      companyName: 'Delta Fertilizantes do Brasil Ltda',
      tradeName: 'Delta Fert',
      cnpj: '33444555000103',
      isStateRegistrationExempt: false,
      stateRegistration: '20.123.456-7',
      contact: { primaryPhone: '62988881111', isPrimaryPhoneWhatsapp: false },
      address: { addressType: 'urban', zipCode: '74000000', street: 'Av Goiás', number: '1000', neighborhood: 'Norte', city: 'Goiânia', state: 'GO' },
      status: 'active',
    },
    {
      personType: 'individual',
      name: 'Gustavo Henrique Borges',
      cpf: '66699922233',
      birthDate: '1982-12-05',
      contact: { primaryPhone: '62988882222', isPrimaryPhoneWhatsapp: true },
      address: { addressType: 'urban', zipCode: '74000000', street: 'Rua 6', number: '60', neighborhood: 'Marista', city: 'Goiânia', state: 'GO' },
      status: 'active',
    },
    {
      personType: 'legal_entity',
      companyName: 'EcoTerra Manejo e Pastagens Ltda',
      tradeName: 'EcoTerra Agro',
      cnpj: '44555666000114',
      isStateRegistrationExempt: true,
      contact: { primaryPhone: '62988883333', isPrimaryPhoneWhatsapp: true },
      address: { addressType: 'rural', locality: 'Vale Verde', accessDescription: 'Rodovia GO-060 km 45', city: 'Trindade', state: 'GO' },
      status: 'active',
    },
  ];

  for (const c of clientSeed) {
    await gateway.createClient(ORG_A, c);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  // 2. Isolamento: ORG_B continua sem nenhum registro
  const orgBResult = await gateway.listClients({
    organizationId: ORG_B,
    page: 1,
    pageSize: 10,
  });
  assert(
    orgBResult.total === 0 && orgBResult.items.length === 0,
    '2. Isolamento: clientes cadastrados em ORG_A não aparecem em ORG_B'
  );

  // 3. Busca por nome com acento e caixa alta (ex: "ÁLVARO" -> encontra "Álvaro Guimarães")
  const searchNameResult = await gateway.listClients({
    organizationId: ORG_A,
    searchTerm: 'alvaro',
    page: 1,
    pageSize: 10,
  });
  assert(
    searchNameResult.total >= 1 &&
      searchNameResult.items.some((c) => c.name.includes('Álvaro') || c.name.includes('Álvares')),
    '3. Busca insensível a maiúsculas e acentos localiza nomes com caracteres acentuados'
  );

  // 4. Busca por Razão Social e Nome Fantasia
  const searchTradeNameResult = await gateway.listClients({
    organizationId: ORG_A,
    searchTerm: 'Fazenda Sao Jose',
    page: 1,
    pageSize: 10,
  });
  assert(
    searchTradeNameResult.total === 1 &&
      searchTradeNameResult.items[0].personType === 'legal_entity' &&
      searchTradeNameResult.items[0].tradeName === 'Fazenda São José',
    '4. Busca por nome fantasia (sem acento) localiza PJ correspondente'
  );

  // 5. Busca por CPF formatado e desformatado
  const searchCpfFormatted = await gateway.listClients({
    organizationId: ORG_A,
    searchTerm: '529.982.247-25',
    page: 1,
    pageSize: 10,
  });
  const searchCpfPlain = await gateway.listClients({
    organizationId: ORG_A,
    searchTerm: '52998224725',
    page: 1,
    pageSize: 10,
  });
  assert(
    searchCpfFormatted.total === 1 &&
      searchCpfPlain.total === 1 &&
      searchCpfFormatted.items[0].id === searchCpfPlain.items[0].id,
    '5. Busca por CPF funciona tanto com pontuação quanto com apenas dígitos'
  );

  // 6. Busca por CNPJ formatado e desformatado
  const searchCnpjFormatted = await gateway.listClients({
    organizationId: ORG_A,
    searchTerm: '00.000.000/0001-91',
    page: 1,
    pageSize: 10,
  });
  const searchCnpjPlain = await gateway.listClients({
    organizationId: ORG_A,
    searchTerm: '00000000000191',
    page: 1,
    pageSize: 10,
  });
  assert(
    searchCnpjFormatted.total === 1 &&
      searchCnpjPlain.total === 1 &&
      searchCnpjFormatted.items[0].id === searchCnpjPlain.items[0].id,
    '6. Busca por CNPJ funciona com máscara e dígitos crus'
  );

  // 7. Filtro por tipo de pessoa (individual -> 7 PFs)
  const filterPf = await gateway.listClients({
    organizationId: ORG_A,
    personType: 'individual',
    page: 1,
    pageSize: 50,
  });
  assert(
    filterPf.total === 7 && filterPf.items.every((c) => c.personType === 'individual'),
    '7. Filtro por Pessoa Física retorna estritamente os 7 registros PF'
  );

  // 8. Filtro por tipo de pessoa (legal_entity -> 5 PJs)
  const filterPj = await gateway.listClients({
    organizationId: ORG_A,
    personType: 'legal_entity',
    page: 1,
    pageSize: 50,
  });
  assert(
    filterPj.total === 5 && filterPj.items.every((c) => c.personType === 'legal_entity'),
    '8. Filtro por Pessoa Jurídica retorna estritamente os 5 registros PJ'
  );

  // 9. Filtro por situação ativa (9 ativos)
  const filterActive = await gateway.listClients({
    organizationId: ORG_A,
    status: 'active',
    page: 1,
    pageSize: 50,
  });
  assert(
    filterActive.total === 9 && filterActive.items.every((c) => c.status === 'active'),
    '9. Filtro por clientes ativos retorna 9 registros'
  );

  // 10. Filtro por situação inativa (3 inativos)
  const filterInactive = await gateway.listClients({
    organizationId: ORG_A,
    status: 'inactive',
    page: 1,
    pageSize: 50,
  });
  assert(
    filterInactive.total === 3 && filterInactive.items.every((c) => c.status === 'inactive'),
    '10. Filtro por clientes inativos retorna 3 registros'
  );

  // 11. Filtro cumulativo: PF + Inativos (Carlos Eduardo Santana e Fernanda Lima Castro -> 2)
  const filterPfInactive = await gateway.listClients({
    organizationId: ORG_A,
    personType: 'individual',
    status: 'inactive',
    page: 1,
    pageSize: 50,
  });
  assert(
    filterPfInactive.total === 2 &&
      filterPfInactive.items.every((c) => c.personType === 'individual' && c.status === 'inactive'),
    '11. Filtro cumulativo PF + Inativo retorna exatamente 2 registros'
  );

  // 12. Filtro cumulativo com busca: "Goiânia" + PJ + Ativo
  const filterCumulativeSearch = await gateway.listClients({
    organizationId: ORG_A,
    searchTerm: 'Delta',
    personType: 'legal_entity',
    status: 'active',
    page: 1,
    pageSize: 10,
  });
  assert(
    filterCumulativeSearch.total === 1 &&
      filterCumulativeSearch.items[0].companyName.includes('Delta'),
    '12. Filtro cumulativo Busca + PJ + Ativo retorna registro correspondente'
  );

  // 13. Ordenação Name ASC (A-Z) com locale pt-BR (Álvaro antes de Beatriz)
  const sortNameAsc = await gateway.listClients({
    organizationId: ORG_A,
    sort: 'name_asc',
    page: 1,
    pageSize: 50,
  });
  const namesAsc = sortNameAsc.items.map((c) =>
    c.personType === 'individual' ? c.name : c.companyName
  );
  const isSortedAsc = namesAsc.every((name, i) => {
    if (i === 0) return true;
    return (
      new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true }).compare(
        namesAsc[i - 1],
        name
      ) <= 0
    );
  });
  assert(isSortedAsc === true, '13. Ordenação alfabética A-Z respeita collation pt-BR');

  // 14. Ordenação Name DESC (Z-A)
  const sortNameDesc = await gateway.listClients({
    organizationId: ORG_A,
    sort: 'name_desc',
    page: 1,
    pageSize: 50,
  });
  const namesDesc = sortNameDesc.items.map((c) =>
    c.personType === 'individual' ? c.name : c.companyName
  );
  const isSortedDesc = namesDesc.every((name, i) => {
    if (i === 0) return true;
    return (
      new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true }).compare(
        namesDesc[i - 1],
        name
      ) >= 0
    );
  });
  assert(isSortedDesc === true, '14. Ordenação alfabética Z-A respeita collation pt-BR');

  // 15. Ordenação por criação (created_at_desc -> último adicionado primeiro)
  const sortCreatedDesc = await gateway.listClients({
    organizationId: ORG_A,
    sort: 'created_at_desc',
    page: 1,
    pageSize: 50,
  });
  assert(
    sortCreatedDesc.items[0].personType === 'legal_entity' &&
      sortCreatedDesc.items[0].companyName.includes('EcoTerra'),
    '15. Ordenação Mais Recentes coloca o último registro cadastrado na primeira posição'
  );

  // 16. Paginação Real: 12 itens com pageSize=10 -> Página 1 com 10 itens
  const page1 = await gateway.listClients({
    organizationId: ORG_A,
    page: 1,
    pageSize: 10,
  });
  assert(
    page1.items.length === 10 && page1.total === 12 && page1.page === 1 && page1.totalPages === 2,
    '16. Paginação página 1 de 10 retorna exatamente 10 itens com totalPages=2'
  );

  // 17. Paginação Real: Página 2 com 2 itens
  const page2 = await gateway.listClients({
    organizationId: ORG_A,
    page: 2,
    pageSize: 10,
  });
  assert(
    page2.items.length === 2 && page2.page === 2 && page2.totalPages === 2,
    '17. Paginação página 2 de 10 retorna os 2 itens restantes'
  );

  // 18. Sem sobreposição de itens entre página 1 e página 2
  const page1Ids = new Set(page1.items.map((c) => c.id));
  const hasOverlap = page2.items.some((c) => page1Ids.has(c.id));
  assert(!hasOverlap, '18. Paginação estrita sem sobreposição entre páginas');

  // 19. Paginação com pageSize=25 -> 1 página de 12 itens
  const page25 = await gateway.listClients({
    organizationId: ORG_A,
    page: 1,
    pageSize: 25,
  });
  assert(
    page25.items.length === 12 && page25.totalPages === 1 && page25.pageSize === 25,
    '19. Paginação com pageSize=25 acomoda todos os 12 itens em 1 página'
  );

  // 20. Tratamento seguro de página além do limite (page=999 com 12 itens -> retorna página 2)
  const pageOverflow = await gateway.listClients({
    organizationId: ORG_A,
    page: 999,
    pageSize: 10,
  });
  assert(
    pageOverflow.page === 2 && pageOverflow.items.length === 2,
    '20. Requisição de página excedente ajusta com segurança para a última página válida'
  );

  // 21. Cancelamento com AbortSignal
  const controller = new AbortController();
  controller.abort();
  let aborted = false;
  try {
    await gateway.listClients(
      { organizationId: ORG_A, page: 1, pageSize: 10 },
      controller.signal
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      aborted = true;
    }
  }
  assert(aborted === true, '21. AbortSignal cancela a operação e emite AbortError');

  // 22. Normalização de busca
  assert(
    normalizeSearchTerm('  Fazenda   São   José  ') === 'fazenda sao jose',
    '22. normalizeSearchTerm colapsa espaços, remove acentos e aplica minúsculas'
  );

  // 23. Mascaramento seguro de CPF
  assert(
    maskCpf('52998224725') === '529.***.***-25',
    '23. maskCpf protege os dígitos centrais do CPF'
  );

  // 24. Mascaramento seguro de CNPJ
  assert(
    maskCnpj('00000000000191') === '00.***.***/0001-91',
    '24. maskCnpj preserva filial e DV mascarando o radical'
  );

  // 25. Busca sem resultados retorna lista vazia com total=0
  const noResult = await gateway.listClients({
    organizationId: ORG_A,
    searchTerm: 'termo_inexistente_xyz_999',
    page: 1,
    pageSize: 10,
  });
  assert(
    noResult.total === 0 && noResult.items.length === 0 && noResult.totalPages === 1,
    '25. Busca sem correspondência retorna total 0 e items vazio sem falhas'
  );

  console.log('\n----------------------------------------------------------------');
  console.log(`RESULTADO FINAL: ${passedTests} testes passaram | ${failedTests} falhas`);
  console.log('----------------------------------------------------------------\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runListTests().catch((err) => {
  console.error('Erro inesperado na execução dos testes:', err);
  process.exit(1);
});
