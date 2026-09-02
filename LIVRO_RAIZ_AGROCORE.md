# LIVRO-RAIZ OFICIAL DO PROJETO AGROCORE

---

## 1. IDENTIDADE OFICIAL DO PROJETO

- **Nome Oficial:** AgroCore
- **Identificador de Pacote / Metadata:** AgroCore
- **Domínio / Namespace Visual:** `agrocore-*`
- **Sessão / Cache Storage Prefix:** `agrocore:*` / `agrocore-cache-*`
- **Versão do pacote:** 0.0.0 (desenvolvimento arquitetural contínuo)
- **Status do Rebranding Global (OE-GLOBAL.001):** 100% Concluído e Homologado. Nenhuma referência residual ao nome anterior existe no código-fonte, metadados, PWA, scripts ou suítes de testes.

---

## 2. MISSÃO E ESCOPO DO SISTEMA

O **AgroCore** é uma plataforma corporativa e operacional de alta precisão para engenharia agronômica, gestão de crédito rural, planejamento técnico de safras, vistorias e governança do agronegócio.

### Pilares Arquiteturais
1. **Offline-First & PWA:** Arquitetura resiliente a campo, com pré-cache estático inteligente via Service Worker dedicado e sincronização transacional em background.
2. **Isolamento Organizacional Estrito (Multi-tenant):** Separação total de dados, clientes, propostas e auditoria entre empresas e filiais, sem vazamento horizontal.
3. **Controle de Acesso Baseado em Papéis (RBAC):** 7 perfis operacionais com menor privilégio estrito, separação formal entre escopo global (Plataforma) e escopo de empresa (Organização).
4. **Segurança OWASP e Leak-Free:** Build de produção auditado por script de barreira contra vazamento de credenciais, chaves, termos proibidos ou módulos simulados.
5. **Experiência do Usuário (UX/UI):** Interface limpa, responsiva (desktop, tablet e mobile), sem clichês visuais, tipografia hierárquica e acessibilidade auditada.

---

## 3. IDENTIDADE VISUAL E ÍCONES

A identidade visual do AgroCore é centralizada nos componentes `BrandLogo.tsx`, `BrandMark.tsx` e `Logo.tsx`.

- **Paleta oficial exclusiva:** `#0B3D2E` (verde-escuro), `#78C89A` (verde-claro), `#FFFFFF` (branco) e transparências derivadas dessas cores.
- **Favicon & PWA Icons:** `public/favicon.svg`, `public/icons/icon-192x192.png`, `public/icons/icon-512x512.png` e variantes maskable.
- **Tema:** módulos 003, 004, 005 e 006 possuem barreiras automatizadas contra famílias Tailwind externas e variantes `dark:*`.
- **Tipografia:** Famílias sans-serif corporativas de alta legibilidade, com contraste em conformidade com WCAG AA.

---

## 4. MATRIZ DOS 7 PERFIS DE ACESSO (RBAC)

| Perfil | Identificador | Escopo | Descrição Operacional |
|---|---|---|---|
| **Superadministrador** | `platform_super_admin` | Plataforma (Global) | Governança institucional, monitoramento de organizações, auditoria global da plataforma. Isolado das operações privadas das fazendas. |
| **Proprietário** | `owner` | Organização | Governança integral da empresa/escritório, gestão de filiais, atribuição de papéis, finanças estratégicas e auditoria interna. |
| **Administrador** | `company_admin` | Organização | Gestão operacional cotidiana, membros, permissões departamentais e configurações da empresa. |
| **Gerente** | `manager` | Organização | Coordenação de equipes de campo, validação de projetos, aprovação de propostas e logística de frotas. |
| **Projetista** | `project_designer` | Organização | Elaboração técnica de projetos agropecuários, laudos agronômicos e registro governado de referências técnicas. |
| **Financeiro** | `finance` | Organização | Acompanhamento de fluxo de caixa, honorários, faturamento de projetos e controle de inadimplência. |
| **Captador** | `capturer` | Organização | Prospecção comercial, atendimento inicial ao produtor, pré-cadastro restrito de clientes e propriedades. |

---

## 5. ESTRUTURA DE MÓDULOS E STATUS DE HOMOLOGAÇÃO

### MÓDULO 000: FUNDAÇÃO TÉCNICA E OFFLINE-FIRST
- **Status:** Homologado e 100% Concluído.
- **Entregas:**
  - Configuração do Vite, Tailwind CSS v4, TypeScript em modo estrito.
  - Service Worker customizado com cache versionado, hash de integridade e descarte automático de caches legados.
  - Manifest PWA, ícones, meta tags e proteção de rotas restritas no Service Worker.
  - Barreira de segurança `verify-leak-free-build.js` impedindo compilação com vazamento de dados.

### MÓDULO 001: AUTENTICAÇÃO, SESSÃO, ORGANIZAÇÕES E AUTORIZAÇÃO
- **Status:** Homologado e 100% Concluído.
- **Entregas:**
  - `OE-001.001 / OE-001.002`: Autenticação, política de senhas fortes, recuperação de acesso, lockout por tentativas falhas e 7 contas de demonstração.
  - `OE-001.003`: Gerenciamento de sessão, heartbeat de inatividade com aviso aos 13 minutos e expiração aos 15 minutos, visões contextuais dos 7 perfis.
  - `OE-001.004`: Contexto organizacional multitenant, seleção e troca de filiais, bloqueio de estados suspensos/pendentes.
  - `OE-001.005`: Catálogo de 30+ permissões, matriz RBAC imutável, avaliador de autorização e rota de Acesso Negado.
  - `OE-001.006`: Orquestrador de rotas seguras, guarda de navegação unificada e homologação ponta a ponta.

### MÓDULO 002: GESTÃO DE CLIENTES E PRODUTORES RURAIS
- **Status:** 100% Implementado e Homologado (OE-002.001, OE-002.002 e OE-002.003).
- **Entregas:**
  - `OE-002.001`: Fundação de domínio de clientes, contratos tipados sem uso de any, gateway de desenvolvimento volátil isolado por organização, gateway indisponível para operação segura, contexto React integrado à autorização e rotas.
  - `OE-002.002`: Modelagem cadastral PF e PJ, validadores algorítmicos de CPF e CNPJ com máscaras, Inscrição Estadual com isenção, endereços urbanos e rurais com conversão estruturada, contatos primários e secundários com WhatsApp, proteção contra perda de dados com diálogo de confirmação de saída e operações Create/Update com integridade de dados.
  - `OE-002.003`: Busca otimizada (case/accent-insensitive, busca por nome, razão social, nome fantasia, CPF/CNPJ com debounce de 300ms e cancelamento de requisições anteriores com AbortController), filtros cumulativos (Pessoa Física / Pessoa Jurídica, Ativas / Inativas), ordenação multilíngue (A-Z, Z-A, Mais recentes, Mais antigos com desempate determinístico), paginação real (10, 25 e 50 itens por página com metadados e bloqueios nos limites), estados visuais distintos (loading acessível, indisponível, erro com recarregamento, lista vazia sem clientes e sem resultados para os filtros com limpeza rápida) e mascaramento de documentos.

### MÓDULO 003: GESTÃO DE IMÓVEIS RURAIS E URBANOS
- **Status Geral:** 100% Implementado e Homologado (OE-003.001, OE-003.002, OE-003.002-R2, OE-003.002-R3, OE-003.002-R4, OE-003.003, OE-003.003-R1 e OE-003.003-R2).
- **Entregas Concluídas e Homologadas:**
  - `OE-003.001`: Fundação arquitetural do módulo de imóveis. Contratos tipados sem `any` (`PropertySummary`, `PropertyType`, `PropertyStatus`, `PropertyClientRelationship`, `PropertyClientLink`, `PropertyFilterParams`, `PropertyGateway`), Gateway Pattern com `PreviewPropertyGateway` estritamente em memória e isolado por tenant e `UnavailablePropertyGateway` para produção segura sem persistência em storage local, `PropertiesContext` com observabilidade reativa, proteção anti-concorrência e limpeza no logout/troca de organização, permissões no catálogo (`properties:view`, `properties:create`, `properties:edit`), matriz de autorização dos 7 perfis, rota `/imoveis` com `OrganizationGate` e `RequirePermission`, navegação contextual no Sidebar e MobileDrawer, página `PropertiesPage` com estados visuais acessíveis (loading, indisponível, erro e estado vazio real sem dados fictícios), suite de testes automatizados `test:properties-foundation` e inclusão no audit de build limpo `verify-leak-free-build.js`.
  - `OE-003.002`: Cadastro e Edição de Imóveis Rurais e Urbanos — Concluída e homologada funcional e visualmente (revisões R1 e R2). Formulário unificado em 8 seções (Classificação e Nome, Localização, Áreas, Identificadores e Registros, Vínculos com Clientes/Produtores, Matrículas Cartorárias, Coordenadas e Limites, Situação Cadastral), validações de campos obrigatórios e formato, normalização canônica de CIB, SNCR, áreas em ha/m² e coordenadas SIRGAS2000, validação algorítmica de vínculo titular principal único, diálogo modal de confirmação para descarte de alterações não salvas, modal de confirmação para troca de tipo de imóvel e remoção de registros preenchidos, isolamento por organização garantindo unicidade de identificadores no escopo corporativo.
  - `OE-003.002-R2`: Purga final e rigorosa de classes de cores residuais (slate, gray, zinc, neutral, stone, black, dark mode classes) em todas as telas e componentes de imóveis (`PropertiesPage.tsx`, `PropertyCreatePage.tsx`, `PropertyEditPage.tsx`, `PropertyForm.tsx`, `PropertyClientSelector.tsx`). Centralização nos tokens do tema oficial AgroCore (`#0B3D2E` Verde-escuro, `#78C89A` Verde-claro e `#FFFFFF` Branco). Validação visual auditada em breakpoints (320px, 390px, 768px, 1024px e 1440px), com contraste WCAG AA, foco acessível e consistência absoluta. Validado via `test:property-theme`, `test:module-003` e compilação de produção.
  - `OE-003.002-R3 / OE-003.002-R4`: Completude Cadastral Canônica e Responsividade Mobile do Cadastro de Imóveis — 100% Concluída e Homologada.
    - **Identificadores Cartorários Oficiais:** Normalização e validação de Código Nacional de Matrícula (CNM - 15 dígitos numéricos) e Código Nacional de Serventias (CNS - 6 dígitos numéricos do cartório), validação de matrícula principal (`isPrimary`), status registral (`registrationStatus`: ativa, encerrada, desmembrada, unificada) e data de certidão (`certificateIssuedAt`).
    - **Áreas e Matrículas Canônicas:** Abertura estrutural dos campos de áreas declarada, registrada, CAR e SNCR para imóveis rurais (em hectares) e áreas de terreno, construída, privativa e comum para imóveis urbanos (em m²). Áreas de matrículas são exibidas individualmente e não são somadas automaticamente, pois podem representar sobreposição territorial.
    - **Localização Completa:** Endereçamento rural canônico com CEP rural opcional, distrito municipal e complemento; endereçamento urbano com ponto de referência, identificação de condomínio/edifício e validação de sem número.
    - **Geodésica e Confrontações:** Coordenada de referência estendida com formato, origem documental (`gnss`, `document`, `manual`), altitude e tipo de altitude (`geometric`, `orthometric`), referencial geodésico SIRGAS2000 e confrontações com origem documental (`source`).
    - **Responsividade e Acessibilidade:** Viewport e theme-color institucionais (#0B3D2E), ausência de escalas artificiais e scroll horizontal em 320px/390px, alvos de toque >= 44px, banner de acompanhamento único no cabeçalho da página e situação ativa como padrão inicial.
    - **Bateria de Homologação:** 34 testes automatizados em `scripts/test-property-responsive.js` consolidados no orquestrador `test:module-003`.
  - `OE-003.003 / OE-003.003-R1 / OE-003.003-R2`: Georreferenciamento, Glebas, Polígonos e Gestão Territorial Interna — 100% Homologada.
    - **Gestão de Múltiplas Glebas e Vértices:** Cadastro de múltiplas glebas/parcelas por imóvel, anéis externos e anéis internos (vazios/exclusões territoriais), vértices perimetrais com latitude, longitude, altitude informada (`altitudeType`: elipsoidal, ortométrica ou desconhecida) e método de levantamento.
    - **Mecanismo Matemático de Coordenadas:** Conversão precisa bidirecional em tempo real entre Graus Decimais (SIRGAS2000/GRS80, WGS84, SAD69), Graus Minutos e Segundos (GMS/DMS) com parsers resilientes e projeção UTM (Easting, Northing, Fuso e Hemisfério) parametrizada por elipsoides de referência.
    - **Cálculos Geodésicos de Alta Precisão:** Cálculo de área geodésica por excesso esférico, perímetro real em metros e quilômetros, centroide aproximado e Bounding Box espacial. Dedução precisa de vazios internos na apuração da área líquida total.
    - **Validação Topológica e Estrutural:** Detecção algorítmica de autointerseção de anéis (laços/gravatas), identificação de vértices duplicados e ordenamento incorreto, verificação de vazios externos ao perímetro e vazios que interceptam as divisas externas.
    - **Orientação Técnica e Padronização:** Ferramenta de reorganização vetorial automática em sentido horário (Clockwise) com ponto de partida fixado no vértice mais ao norte geográfico (com desempate pelo mais a oeste).
    - **Segmentos de Limite e Confrontações:** Cadastro estruturado de confrontações vinculadas a cada segmento da poligonal (confrontantes, tipo de limite, rodovias, cursos d'água, cercas).
    - **Comparador Cadastral de Divergências:** Matriz de conferência entre área calculada e fontes documentais cadastradas (Área Declarada, CAR, SNCR/CCIR e Matrículas Cartorárias), com classificação, badges de convergência e aviso técnico explícito sobre dados declarados (sem consultas externas automatizadas).
    - **Visualizador Vetorial SVG Responsivo:** Renderização vetorial SVG interativa com preenchimento diferenciado para vazios (`evenodd`), rosa dos ventos / indicador de Norte, escala métrica estimada, zoom e pan, destaque de vértices selecionados e tooltips informativos.
    - **Gateway e Multi-Tenancy:** Persistência em memória por tenant e imóvel (`PreviewPropertyGeometryGateway`), bloqueio estrito de avanço de status para "validado internamente" na presença de inconsistências topológicas e `UnavailablePropertyGeometryGateway` seguro para produção sem persistência.
    - **Homologação e Auditoria:** 112 testes automatizados aprovados em `test:property-geometry` (incluindo benchmarks IBGE/ProGriD e 15 cenários de RBAC/ciclo organizacional), cobertura total de tema em `test:property-theme`, consolidação em `test:module-003`, typecheck estrito e compilação de produção sem vazamentos.
    - **Ressalva Geoespacial:** Importação e exportação de arquivos geoespaciais externos (como KML, KMZ, GeoJSON, SHP e DXF) permanecem reservadas para ordens futuras dedicadas.

### MÓDULO 004: LAUDOS DE AVALIAÇÃO DE IMÓVEIS RURAIS E URBANOS
- **Status Geral:** Implementado e homologado até a OE-004.003, incluindo o saneamento residual incorporado nesta revisão.
- **Entregas Concluídas e Homologadas:**
  - **Contratos Tipados de Domínio:** Interfaces estritas sem `any` para `Appraisal`, `AppraisalSummary`, `AppraisalRequest`, `AppraisalVersionMetadata`, `AppraisalDocumentReference`, `TechnicalProfessionalProfile`, `TechnicalEligibilityEvaluation`, `AppraisalDomainEvent` e tipos discriminados para status, origens, conselhos e disciplinas.
  - **Máquinas de Estados Puras:** `appraisalStateMachine.ts` (12 estados do ciclo pericial, matriz de transições permitidas, bloqueio de reversão de emitidos, exigência de justificativa de cancelamento e fechamento estrito de emissão direta) e `appraisalRequestStateMachine.ts` (10 estados do ciclo de captação/atribuição/conversão).
  - **Avaliador de Elegibilidade Técnica:** `technicalEligibilityEvaluator.ts` com separação formal entre RBAC (autorização do sistema) e Habilitação Profissional (conselho CREA/CAU/CFT, situação do registro, impedimentos e compatibilidade de disciplina rural/urbana).
  - **Gerador de Eventos de Domínio:** `domainEvents.ts` com criação imutável de eventos auditáveis (`AppraisalDomainEvent`) e correlação de solicitações e laudos.
  - **Arquitetura de Gateways & Multitenancy:** `PreviewAppraisalGateway`, `PreviewAppraisalRequestGateway` e `PreviewTechnicalProfessionalGateway` estritamente em memória, isolados por organização (`organizationId`), coleções vazias por padrão sem dados simulados/mocks, e contrapartes seguras `Unavailable*Gateway` para ambiente de produção.
  - **Segurança e Governança Comportamental (R4):**
    - `ClientCapturerAssignment` ativo e obrigatório no fluxo do captador, com isolamento por organização e histórico de atribuição.
    - Remoção da operação pública manipulável `createAppraisal`; início direto (`startDirectAppraisal`) e conversão (`convertRequestToAppraisal`) são comandos separados.
    - Início direto valida cliente, imóvel, vínculo cliente-imóvel, perfil técnico e deriva o tipo territorial exclusivamente do imóvel canônico.
    - Validação de consistência cadastral e sanitização de dados sensíveis em `addRequestDocument`.
    - Purga de permissões legadas/inexistentes (`appraisal_requests:edit`) e restrição de transição de status para perfis autorizados.
  - **Permissões RBAC e Navegação:** Permissões granulares para laudos e solicitações, incluindo `appraisals:issue`, `appraisal_requests:view_assigned` e `appraisal_requests:assign`. As permissões técnicas reais são `technical_professionals:view_self`, `technical_professionals:update_self`, `technical_professionals:verify` e `technical_professionals:manage_capabilities`; a antiga permissão global foi removida. Rotas canônicas e navegação segura permanecem centralizadas.
  - **Identidade Visual e Purga de Cores (R4):** `AppraisalsPage.tsx`, `AppraisalRequestsPage.tsx` e `theme.ts` estritamente centralizados na paleta AgroCore (`#0B3D2E`, `#78C89A`, `#FFFFFF`), sem classes residuais ou famílias fora da identidade (slate, gray, zinc, neutral, stone, dark:*, rose, red, amber, yellow, emerald, blue).
  - **Bateria de Homologação:** `scripts/test-appraisals-foundation.ts` possui 28 provas; `scripts/test-oe-004-002.ts` possui 19; `scripts/test-oe-004-003.ts` possui 37. O agregador `test-module-004.js` executa 7 suítes, incluindo regressões dos Módulos 001 a 003.

### OE-GLOBAL.001: REBRANDING INTEGRAL PARA AGROCORE
- **Status:** Homologado e 100% Concluído.
- **Entregas:**
  - Renomeação global de todas as ocorrências da aplicação para a marca oficial única `AgroCore`.
  - Atualização de assets, meta tags, títulos de páginas, rotas, textos em português e IDs de elementos (`agrocore-*`).
  - Atualização dos scripts de build, Service Worker, políticas de segurança e suítes de testes automatizados.
  - Criação do teste automatizado `test:rebranding`.

---

## 6. ARQUITETURA DE LAUDOS DE AVALIAÇÃO (IMPLEMENTADA ATÉ OE-004.003)

### 6.1 Fontes Canônicas e Proibição de Duplicidade Cadastral
Como diretriz arquitetural inviolável do AgroCore, o módulo de Laudos é estritamente um **consumidor especializado** dos dados cadastrais e territoriais, sendo expressamente proibida a criação de cadastros mestres paralelos.

#### 6.1.1 Clientes e Produtores (Módulo 002)
- O **Módulo 002** é e continuará sendo a única fonte canônica de dados de clientes, produtores rurais, pessoas físicas e jurídicas.
- O módulo de Laudos não poderá criar, manter ou persistir uma segunda estrutura independente de clientes.
- Todo laudo e toda solicitação deverão possuir referência tipada estrita a um `clientId` pertencente à mesma organização ativa.
- A seleção de cliente no fluxo do laudo consultará diretamente a base do Módulo 002.
- Caso seja necessário cadastrar um novo cliente ou corrigir dados existentes durante o fluxo do laudo, a aplicação deverá reutilizar os componentes, formulários, validadores, gateways e permissões do Módulo 002, retornando ao fluxo do laudo após a operação no cadastro canônico.
- É estritamente proibido copiar silenciosamente dados de clientes para entidades independentes de laudo; CPF, CNPJ, contatos e endereços não poderão originar cadastros duplicados.

#### 6.1.2 Imóveis Rurais e Urbanos (Módulo 003)
- O **Módulo 003** é e continuará sendo a única fonte canônica de imóveis rurais e urbanos, matrículas, áreas, identificadores fiscais (CIB, SNCR, CAR) e dados georreferenciados.
- Todo laudo deverá possuir referência tipada a um `propertyId` pertencente à mesma organização e vinculado canonicamente ao cliente correspondente.
- O módulo de Laudos deverá reutilizar o cadastro, edição, certidões, áreas, confrontações e polígonos já mantidos pelo Módulo 003.
- Se o imóvel ainda não estiver cadastrado, o fluxo deverá encaminhar o usuário autorizado ao cadastro do Módulo 003 e retornar ao laudo após a conclusão.
- Se houver dados territoriais desatualizados, a retificação deverá ser realizada de forma explícita no Módulo 003.
- É vedada a criação de cópias operacionais paralelas de imóveis no módulo de laudos.

#### 6.1.3 Profissional Responsável (Módulo 001)
- O profissional técnico designado para a elaboração ou responsabilidade pelo laudo deverá ser referenciado por seu `userId`, `organizationId`, vínculo organizacional e perfil profissional canônico.
- O formulário do laudo não poderá disponibilizar opções de cadastro de "responsável solto" ou texto livre não vinculado a um usuário corporativo da organização.
- Nome, qualificação, contatos e dados técnicos serão recuperados do cadastro central de usuários.
- A substituição do profissional responsável deverá ocorrer exclusivamente por uma ação formal de atribuição ou reatribuição, gerando histórico de auditoria e notificações pertinentes.

#### 6.1.4 Registros Históricos do Laudo: Canônico vs. Fotografia Histórica Imutável
Para conciliar a integridade cadastral com o rigor pericial e jurídico de um laudo técnico, estabelece-se a separação estrita entre:
1. **Cadastro Canônico Operacional:** Mantido dinamicamente nos Módulos 001, 002 e 003, refletindo a situação cadastral do momento atual.
2. **Referência de Trabalho em Rascunho:** Durante a fase de rascunho e instrução técnica, o laudo faz referência aos dados canônicos em tempo real.
3. **Fotografia Histórica Imutável (Snapshot Pericial):** No momento formal da emissão e finalização de uma versão do laudo (`AppraisalVersion`), o sistema gerará uma fotografia estática e criptograficamente protegida de todos os dados utilizados no documento (dados do cliente, dados do imóvel, matrículas vigentes na data, dados do profissional, memorial de cálculo, amostras de mercado, metodologias e conclusões periciais).
   - Essa fotografia histórica existe exclusivamente para garantir **reprodutibilidade pericial, preservação da prova técnica, auditoria e conformidade legal**.
   - A fotografia histórica **não constitui um segundo cadastro operacional** e jamais poderá ser utilizada pelo sistema para criar ou alimentar novos clientes ou imóveis.

---

### 6.2 Vínculo entre Cliente e Captador
O vínculo comercial é representado pela entidade implementada `ClientCapturerAssignment`:
- `organizationId`: Isolamento multitenant obrigatório.
- `clientId`: Referência tipada ao cliente canônico.
- `capturerUserId`: Usuário com perfil `capturer` formalmente atribuído.
- `startDate`: Data e hora do início do vínculo.
- `endDate`: Data de encerramento do vínculo (opcional/nulo enquanto ativo).
- `status`: Situação do vínculo (`active` ou `terminated`).
- `isPrimary`: Flag indicando se é o captador titular responsável pelo cliente.
- `assignedByUserId`: Ator administrativo responsável pela designação.
- `transferReason`: Justificativa formal em caso de transferência de carteira.

**Regras de Governança:**
- Um captador comercial somente poderá criar solicitações de laudo e acompanhar processos para clientes com os quais possua vínculo `ClientCapturerAssignment` ativo.
- A transferência de carteira mantém integralmente o histórico de vínculos anteriores para auditoria.
- Apenas captadores com vínculo ativo e autorizado receberão notificações operacionais.
- É vedada a notificação indiscriminada a captadores arbitrários da empresa.

---

### 6.3 Perfil de Sistema versus Habilitação Profissional

#### 6.3.1 Separação entre RBAC e Habilitação Legal
- O perfil `project_designer` é um papel do controle de acesso baseado em funções (RBAC) do AgroCore, concedendo permissão técnica para operar o fluxo de trabalho de projetos e laudos.
- **O perfil RBAC não comprova nem substitui a habilitação legal e profissional** exigida pelos conselhos de classe para subscrever laudos de avaliação patrimonial.
- A emissão, assinatura ou finalização formal de um laudo técnico dependerá da existência e conformidade de um perfil de habilitação técnica organizacionalmente verificado.
- Perfis administrativos (`owner`, `company_admin`, `manager`, `platform_super_admin`) não possuem autorização para emitir laudos por mera prerrogativa de sua função administrativa no sistema.
- O sistema não fará alegações falsas de verificação automática perante CREA, CAU, Incra ou outros órgãos sem a existência de integrações oficiais ativas e homologadas.

#### 6.3.2 Entidade Implementada: `TechnicalProfessionalProfile`
Vinculada ao usuário autenticado e ao escopo da organização:
- `organizationId`: Empresa empregadora ou contratante.
- `userId`: Usuário autenticado no sistema.
- `declaredProfession`: Profissão e formação acadêmica declarada (ex.: Engenheiro Agrônomo, Engenheiro Civil, Engenheiro Florestal, Arquiteto e Urbanista).
- `professionalCouncil`: Conselho profissional (CREA, CAU, etc.).
- `registrationNumber`: Número de registro no conselho de classe.
- `registrationState`: UF do registro profissional e eventuais vistos regionais.
- `specialties`: Especialidades e atribuições profissionais declaradas.
- `technicalResponsibilityType`: Tipo de responsabilidade técnica padrão (ART de cargo e função, ART de obra/serviço, RRT correspondente).
- `verificationStatus`: Estado da conferência interna (`not_informed`, `pending_review`, `manually_verified`, `ineligible`, `suspended`, `expired`).
- `verificationDate`: Data da última conferência documental.
- `verifiedByUserId`: Responsável administrativo ou técnico que conferiu a certidão de quitação e atribuições.
- `documentReferences`: Identificadores de documentos comprobatórios anexados (diplomas, carteira profissional, certidão de registro e quitação).
- `impediments`: Registro de impedimentos técnicos, judiciais ou restrições de escopo.

**Bloqueio de Emissão:**
O projetista poderá criar, instruir e editar rascunhos conforme suas permissões. A emissão formal exige perfil `manually_verified`, capacidade compatível, responsabilidade técnica, permissão explícita `appraisals:issue`, responsabilidade pelo laudo, prontidão integral e estado `ready_to_issue`.

---

### 6.4 Fluxo de Solicitação de Laudo pelo Captador (`AppraisalRequest`)
O módulo de Laudos separa conceitualmente as entidades `AppraisalRequest` (solicitação comercial/operacional), `Appraisal` (processo técnico pericial) e `AppraisalVersion` (fotografia de versão emitida).

1. O captador autenticado acessa sua área de solicitações de serviços técnicos.
2. O sistema lista exclusivamente os clientes aos quais o captador está formalmente vinculado (`ClientCapturerAssignment`).
3. O captador seleciona o cliente desejado e um imóvel previamente cadastrado e vinculado àquele cliente.
4. Se o cadastro do cliente ou imóvel estiver incompleto, o captador utiliza os fluxos canônicos de edição dos Módulos 002 e 003, conforme suas permissões.
5. O captador informa a finalidade da avaliação (garantia bancária, crédito rural, partilha, alienação, desapropriação, fins fiscais), prazos e observações comerciais.
6. O captador vincula referências a documentos prévios já existentes (certidões, fotos preliminares, contratos).
7. Ao confirmar a solicitação, o sistema registra o protocolo, organização, cliente, imóvel, data, documentos e usuário solicitante.
8. A solicitação ingressa na fila de atendimento da organização para triagem e atribuição pelo gestor ou atendimento por projetista autorizado.
9. O projetista designado aceita a solicitação e converte o protocolo em um processo de avaliação técnica (`Appraisal`).
10. O captador acompanha exclusivamente o protocolo e os status operacionais autorizados.
11. **Bloqueio de Acesso Técnico ao Captador:** O captador não possui permissão para abrir, editar, redigir, revisar, emitir, assinar, calcular valores ou excluir o conteúdo técnico do laudo de avaliação.

---

### 6.5 Iniciativa Técnica pelo Projetista sem Solicitação Prévia
Reconhecendo a rotina pericial e de consultoria agronômica, o sistema permite a abertura direta de avaliações por iniciativa técnica:
- O projetista autenticado e com permissão técnica pode identificar a necessidade de um laudo e iniciar o processo diretamente.
- O projetista seleciona o cliente e o imóvel a partir dos cadastros canônicos existentes.
- O laudo é criado com origem registrada como `technical_initiative`.
- O projetista autenticado é atribuído automaticamente como responsável inicial pelo laudo, sem necessidade de duplicar cadastros.
- O sistema localiza o captador ativo formalmente vinculado ao cliente e emite uma notificação operacional informando que foi iniciado um processo de avaliação para aquele imóvel.
- A notificação enviada ao captador informa apenas metadados operacionais (cliente, imóvel, protocolo e projetista responsável), sem jamais expor metodologias, cálculos preliminares, amostras, valores de avaliação ou pareceres restritos.
- Caso o cliente não possua captador ativo vinculado, o evento de auditoria é registrado normalmente e a notificação é encaminhada ao responsável administrativo conforme as políticas da empresa.
- A iniciativa direta mantém todas as exigências de habilitação profissional e isolamento multitenant.

---

### 6.6 Matriz de Autorização RBAC para Laudos e Solicitações

| Operação / Recurso | `capturer` | `project_designer` | `manager` | `company_admin` | `owner` | `finance` | `platform_super_admin` |
|---|---|---|---|---|---|---|---|
| **Criar Solicitação (`AppraisalRequest`)** | Sim (Clientes vinculados) | Não | Sim | Sim | Sim | Não | Não |
| **Visualizar Solicitações** | Apenas suas vinculadas | Sim (Fila/Atribuídas) | Sim (Todas da org) | Sim (Todas da org) | Sim (Todas da org) | Não | Não |
| **Anexar Docs na Solicitação** | Sim | Sim | Sim | Sim | Sim | Não | Não |
| **Atribuir/Reatribuir Projetista** | Não | Não | Sim | Sim | Sim | Não | Não |
| **Iniciar Laudo Direto (`Appraisal`)** | Não | Sim | Sim | Sim | Sim | Não | Não |
| **Editar Conteúdo Técnico do Laudo** | **NÃO (Bloqueio estrito)** | Sim (Atribuído) | Não | Não | Não | Não | Não |
| **Agendar Visita Técnica** | Não | Sim | Sim | Sim | Sim | Não | Não |
| **Emitir Versão de Laudo** | **NÃO (Bloqueio estrito)** | Sim (se `manually_verified` e demais condições) | Não | Não | Não | Não | Não |
| **Visualizar Valores e Parecer Técnico**| **NÃO (Bloqueio estrito)** | Sim | Sim | Sim | Sim | Apenas Honorários | Não |
| **Excluir Laudo** | **NÃO** | Não | Conforme política | Sim (Auditor) | Sim | Não | Não |

*Nota de Menor Privilégio:* O `platform_super_admin` possui escopo global de infraestrutura e governança e não possui acesso a dados de clientes, imóveis, laudos técnicos ou documentos particulares das organizações.

---

### 6.7 Gestão de Documentos e Anexos Técnicos
- **Fundação Referencial Implementada:** a OE-006.001 registra somente informações identificadas por `documentId`, vinculadas a cliente, imóvel, solicitação, laudo ou proposta existente. Nenhum arquivo integra o agregado atual.
- Cada referência contém `organizationId`, `logicalOwnerType`, `logicalOwnerId`, `category`, `versionNumber`, `mimeType`, escopo de acesso, situação, datas referenciais, checksum SHA-256 interno e autoria organizacional. `fileSizeBytes` é opcional e não é solicitado na interface enquanto não existir arquivo real.
- A substituição cria uma nova referência ativa, preserva a anterior como `superseded` e mantém a cadeia imutável por `predecessorDocumentId`. O arquivamento é versionado e exige motivo operacional.
- O serviço rejeita em tempo de execução arquivo, `Blob`, buffers, Base64, URLs, credenciais, tokens e payloads incompatíveis, inclusive diante de tentativa de contorno da tipagem.
- **Governança e Validade Antecipadas:** `DocumentRequirement`, prazos, estados aberto/atendido/dispensado/cancelado e projeções de validade foram preservados como entregas antecipadas das ordens dedicadas a checklists e alertas; não substituem o escopo oficial da OE-006.002.
- Somente `owner`, `company_admin` e `manager` criam, dispensam ou cancelam pendências; projetista e captador consultam e atendem apenas pendências dos próprios atendimentos; financeiro e superadministrador de plataforma não recebem acesso implícito.
- As rotas `/documentos/pendencias` e `/documentos/pendencias/nova` apresentam painel, indicadores e ações conforme as permissões. A linguagem pública não expõe códigos de ordem, IDs de implementação, checksum, hash, metadado, snapshot ou termos equivalentes.
- A infraestrutura de arquivos usa bucket privado, caminho opaco por organização e entidade, upload retomável e associação ao mesmo identificador documental somente após confirmação do armazenamento.
- Documentos sensíveis e dados de clientes (CPF, CNPJ, dados bancários) jamais serão registrados em arquivos de log do servidor ou do cliente.
- É expressamente proibido o armazenamento de arquivos reais de documentos em `localStorage`, `sessionStorage` ou `IndexedDB`.
- Na ausência de infraestrutura de nuvem configurada para storage de arquivos, a aplicação operará em modo seguro com gateway de indisponibilidade, sem simular uploads em produção.

---

### 6.8 Agenda e Visita Técnica Integradas ao Laudo
- A visita técnica (`TechnicalVisit`) nascerá obrigatoriamente vinculada a um `appraisalId` e, quando aplicável, ao `appraisalRequestId` de origem.
- Cliente, imóvel, endereço oficial, vias de acesso, pontos de referência e coordenadas geográficas serão herdados diretamente dos Módulos 002 e 003.
- O compromisso na agenda do profissional referenciará o registro da visita técnica, sem duplicação de dados cadastrais.
- Operações de agendamento, reagendamento e cancelamento emitirão eventos transacionais idempotentes para sincronização de calendário.
- O registro de visita conterá: finalidade, data, janela de horário, participantes, rota planejada, checklist de vistoria, notas técnicas de campo, registro fotográfico georreferenciado e anexos.
- Alterações de local específicas da visita não poderão alterar silenciosamente o endereço canônico do imóvel no Módulo 003 (exigindo campo de exceção justificado).
- O profissional atribuído ao laudo terá o compromisso inserido automaticamente em sua agenda corporativa.
- O captador relacionado receberá apenas confirmação de data e horário operacional da visita, permanecendo com anotações e fotos técnicas inacessíveis.

---

### 6.9 Integração com Frota e Logística de Campo
- A reserva de veículos da empresa (`FleetReservation`) poderá ser solicitada a partir de uma visita técnica de avaliação previamente registrada.
- A reserva referenciará o `technicalVisitId`, o profissional solicitante, a categoria/veículo selecionado e o período de deslocamento.
- É vedada a duplicação de dados do cliente, imóvel ou endereço dentro do módulo de frota.
- Alterações na data ou horário da visita técnica dispararão revalidação automática de disponibilidade na frota.
- Conflitos de horário para o mesmo veículo serão bloqueados automaticamente.
- O cancelamento de uma visita técnica cancelará ou liberará a reserva de frota correspondente de forma auditada.
- O módulo de frota obedecerá ao princípio da minimização de dados: motoristas e gestores de frota terão acesso estritamente aos dados de deslocamento (origem, destino, horário e passageiros), sem qualquer visibilidade sobre o conteúdo pericial, valores ou dados confidenciais do laudo.

---

### 6.10 Arquitetura de Notificações e Eventos
O sistema adotará uma arquitetura orientada a eventos de domínio com despacho idempotente:

**Catálogo de Eventos Conceituais:**
- `appraisal.request.created` — Nova solicitação comercial enviada.
- `appraisal.request.documents_added` — Documentação complementar anexada à solicitação.
- `appraisal.request.assigned` — Solicitação atribuída a um projetista técnico.
- `appraisal.request.info_requested` — Pedido de complementação de documentos/dados ao captador.
- `appraisal.request.rejected` — Solicitação recusada com justificativa formal.
- `appraisal.technical.initiated` — Laudo iniciado por iniciativa técnica direta.
- `appraisal.visit.scheduled` — Visita técnica de campo agendada.
- `appraisal.visit.rescheduled` — Visita técnica reagendada.
- `appraisal.visit.cancelled` — Visita técnica cancelada.
- `appraisal.fleet.confirmed` / `appraisal.fleet.rejected` — Reserva de veículo processada.
- `appraisal.fieldwork.completed` — Vistoria de campo finalizada e dados de campo salvos.
- `appraisal.status.updated` — Mudança de fase no fluxo do laudo.
- `appraisal.ready_for_review` — Laudo finalizado para revisão técnica.
- `appraisal.version.issued` — Nova versão formal emitida; assinatura digital permanece fora do escopo atual.

**Diretrizes de Governança das Notificações:**
- O recebimento de uma notificação não concede permissão de acesso ao recurso; a autorização RBAC continuará sendo validada no momento da abertura.
- Notificações enviadas a captadores contêm exclusivamente dados de andamento e protocolo, sem expor valores avaliados, metodologias ou laudo integral.
- O centro de notificações in-app constitui a base arquitetural nativa do sistema.
- Canais externos (e-mail, push notifications, SMS) somente serão declarados operacionais após implementação real de serviços transacionais.

---

### 6.11 Trilha de Auditoria Imutável
Todas as ações críticas do ciclo de vida das solicitações e laudos serão registradas em trilha de auditoria append-only:
- Criação de solicitação, aceite, recusa e cancelamento.
- Inclusão, substituição e desativação de referências documentais.
- Atribuição, reatribuição e aceite de responsabilidade técnica.
- Início de laudo por iniciativa técnica.
- Agendamentos, alterações e cancelamentos de visitas técnicas e reservas de frota.
- Abertura de telas e ações de edição no cadastro canônico de clientes e imóveis originadas do contexto do laudo.
- Conclusão de etapas da metodologia avaliatória.
- Geração de rascunhos, emissão de versões finais (`AppraisalVersion`) e eventuais anulações.
- Consultas a documentos confidenciais e logs de download de laudos emitidos.

**Estrutura do Registro de Auditoria:**
Cada entrada registrará: `organizationId`, `actorUserId`, `actorRole`, `entityType`, `entityId`, `actionType`, `timestampIso`, `clientIpOrOrigin`, `reason`, `previousStateSummary`, `newStateSummary` e `correlationId` para rastreamento unificado entre solicitação, laudo, visita e frota.

---

### 6.12 Máquinas de Estados Conceituais

#### 6.12.1 Estados da Solicitação (`AppraisalRequestState`)
```
[enviada] ───► [recebida] ───► [aguardando_atribuicao] ───► [atribuida]
    │              │                     │                        │
    ▼              ▼                     ▼                        ▼
[cancelada]   [recusada]           [aguardando_docs]      [convertida_em_laudo]
                                                                  │
                                                                  ▼
                                                             [concluida]
```

#### 6.12.2 Estados do Processo de Laudo (`AppraisalState`)
```
[rascunho] ──► [coleta_de_dados] ──► [visita_a_agendar] ──► [visita_agendada]
    │                                                               │
    ▼                                                               ▼
[cancelado] ◄── [aguardando_complementacao] ◄────────────── [trabalho_de_campo]
    │                        │                                      │
    │                        ▼                                      ▼
    └──────────────► [analise_metodologica] ──────────────► [revisao_tecnica]
                             │                                      │
                             ▼                                      ▼
                   [pronto_para_emissao] ───────────────► [emitido (Versão 1)]
                             │                                      │
                             └────────────────────────► [substituido_por_nova_versao]
```

---

### 6.13 Matriz de Impacto e Dependências nos Módulos do Sistema

| Módulo | Papel e Dependências com o Módulo de Laudos |
|---|---|
| **Módulo 000 (Fundações & Offline-First)** | Infraestrutura unificada de eventos de domínio, barreira de segurança anti-vazamento, trilha de auditoria centralizada, versionamento de esquemas, gerenciamento seguro de cache PWA e política de minimização de dados periciais. |
| **Módulo 001 (Auth, Tenants & RBAC)** | Catálogo de novas permissões para solicitações e laudos, entidade `TechnicalProfessionalProfile`, verificação de elegibilidade profissional, isolamento multitenant estrito e dissociação entre privilégio administrativo e habilitação pericial. |
| **Módulo 002 (Clientes e Produtores)** | Fonte canônica exclusiva de dados cadastrais, entidade de relacionamento comercial `ClientCapturerAssignment`, reutilização de formulários e validadores, retorno ao fluxo do laudo após edições e vedação de cadastros mestres duplicados. |
| **Módulo 003 (Imóveis e Georreferenciamento)** | Fonte canônica exclusiva de dados territoriais, matrículas, áreas, identificadores (CIB/SNCR/CAR), coordenadas SIRGAS2000, vértices e polígonos periciais, retorno ao fluxo do laudo e vedação de cópias de imóveis. |
| **Módulo 004 (Laudos de Avaliação)** | Consumidor especializado das fontes canônicas, orquestrador do fluxo pericial, cálculos e metodologias ABNT, geração de fotografias históricas imutáveis (`AppraisalVersion`), integração de visitas técnicas e reservas logísticas. |

---

### 6.14 Referências Normativas e Legais
O desenvolvimento futuro do Módulo de Laudos observará as melhores práticas da engenharia de avaliações, pautando-se pelas edições vigentes e licenciadas dos seguintes instrumentos:
1. **Série ABNT NBR 14653 (Avaliação de Bens):**
   - NBR 14653-1: Procedimentos gerais.
   - NBR 14653-2: Imóveis urbanos.
   - NBR 14653-3: Imóveis rurais e seus recursos naturais.
2. **Resolução CONFEA nº 345/1990:** Dispõe sobre o exercício das atividades de perícias e avaliações de engenharia.
3. **Lei Federal nº 6.496/1977:** Institui a Anotação de Responsabilidade Técnica (ART) e dá outras providências.
4. **Lei Federal nº 12.378/2010:** Regulamenta o exercício da Arquitetura e Urbanismo e institui o Registro de Responsabilidade Técnica (RRT).
5. **Legislação e Resoluções Profissionais do Sistema CONFEA/CREA e CAU/BR.**

*Ressalva Institucional Obrigatória:* O software **AgroCore** atuará como ferramenta de apoio tecnológico, automação de cálculos, organização de dados de mercado, gestão de fluxo, vistoria de campo e governança documental. O sistema **não concede habilitação profissional**, não gera nem emite ART/RRT de forma autônoma e **não substitui a responsabilidade técnica e civil indelegável do profissional legalmente habilitado** subscritor do documento.

---

### MÓDULO 004: LAUDOS DE AVALIAÇÃO DE IMÓVEIS RURAIS E URBANOS (NBR 14653)
- **Status Geral:** Implementado e homologado (OE-004.001, OE-004.002 e OE-004.003), com resíduos de segurança fechados nesta revisão.
- **Entregas Concluídas e Homologadas:**
  - `OE-004.001`: Fundação arquitetural do módulo de laudos periciais. Contratos tipados sem `any` (`Appraisal`, `AppraisalType`, `AppraisalStatus`, `AppraisalGateway`), Gateway Pattern com `PreviewAppraisalGateway` em memória e isolado por tenant, `UnavailableAppraisalGateway` para produção segura, contexto React integrado à autorização e rotas.
  - `OE-004.002`: Governança técnica pericial, controle de elegibilidade de responsáveis técnicos (`TechnicalProfessionalProfile`, verificação de conselhos CREA/CAU/CFT, registro de ART/RRT/TRT), triagem e conversão de solicitações de laudos, vínculo estrito com clientes e imóveis cadastrados.
  - `OE-004.003`: Dossiê técnico estruturado (identificação, caracterização física e logística, benfeitorias, conclusão), homogeneização, estatística, métodos avaliatórios, prontidão técnica e fotografia canônica com checksum SHA-256. `AppraisalIssuanceService` exige `appraisals:issue`, responsável designado, perfil verificado, prontidão e estado `ready_to_issue`; versão e status são confirmados por um único `commitIssuedVersion`, sem caminho público de gravação avulsa.

### MÓDULO 005: PROPOSTAS DE CRÉDITO E PRESTAÇÃO DE SERVIÇOS
- **Status Geral:** Concluído e homologado no escopo volátil até a OE-005.007. As seis suítes de domínio, auditoria de texto público e tema totalizam 186 provas comportamentais aprovadas; a indisponibilidade do executor remoto é registrada separadamente como infraestrutura, não como aprovação da CI.
- **Entregas Concluídas e Homologadas:**
  - `OE-005.001`: Fundação de propostas comerciais e técnicas, com contratos tipados (`Proposal`, snapshots canônicos, valores em centavos, cálculo financeiro e `ProposalStatus`) e armazenamento volátil isolado por organização.
  - `OE-005.002`: Fechamento final e saneamento de segurança e concorrência:
    - **Governança e Autorização Estrita:** Permissões granulares `proposals:view`, `proposals:view_related`, `proposals:view_assigned`, `proposals:view_financials`, `proposals:create`, `proposals:edit_draft`, `proposals:submit`, `proposals:assign_review`, `proposals:review`, `proposals:approve`, `proposals:present`, `proposals:record_decision` e `proposals:cancel`. Ausência de vínculo organizacional, papel canônico ou permissão explícita nega a operação por padrão (*Deny-by-Default*). A permissão legada `proposals:edit` foi removida.
    - **Controle de Concorrência e Idempotência:** Serialização de criação, atualização, submissão e cancelamento via locks em memória (`updateLocks`). A idempotência compara a representação determinística do payload normalizado e lança `IDEMPOTENCY_CONFLICT` diante de conteúdo divergente; não há alegação de hash SHA-256 nesse serviço.
    - **Integridade Financeira em Centavos:** Cálculos financeiros determinísticos com `BigInt` e inteiros seguros (`Number.isSafeInteger`), validação de limites máximos (R$ 10.000.000.000,00), parser estrito de moeda brasileira (BRL) e divisão com arredondamento bancário *half_even*.
    - **Isolamento de Captadores e Clientes:** Consulta e formulários de propostas filtrados exclusivamente pelos clientes permitidos para o captador ou organização, eliminando acesso irrestrito.
    - **Identidade Visual e Purga de Cores:** Telas e componentes do Módulo 005 em conformidade estrita com a paleta oficial AgroCore (`#0B3D2E` Verde-escuro, `#78C89A` Verde-claro e `#FFFFFF` Branco).
    - **Navegação Segura:** Rotas `/propostas` e sub-rotas integradas à lista de prefixos internos seguros (`SAFE_INTERNAL_PREFIXES`), prevenindo vulnerabilidades de *Open Redirect*.
    - **Portabilidade de Testes:** Scripts npm e agregadores usam o executável Node local com `--import tsx`, sem depender do IPC do binário `tsx`.
    - **Automação de CI:** `.github/workflows/ci.yml` executa `npm ci`, lint, build, Módulos 001 a 005 e rebranding em pushes e pull requests para `main`. O lockfile npm é versionado para tornar `npm ci` reproduzível.
    - **Homologação comportamental da fundação:** 39 provas em `scripts/test-proposals-foundation.ts`, incluindo arredondamento meio-par, taxa fracionária, limites de inteiros seguros, idempotência, corrida real com `Promise.allSettled`, UUID seguro e rotas seguras.
  - `OE-005.003`: Pipeline comercial operacional e governado:
    - **Máquina de Estados:** `draft` → `submitted` → `under_review`, com ajustes e reenvio, aprovação administrativa independente, apresentação, decisão declaratória e estados terminais. Não existe mutador público genérico de status.
    - **Segregação de Funções:** somente o projetista ativo atualmente atribuído inicia revisão, solicita ajustes ou rejeita tecnicamente; somente `owner`, `company_admin` ou `manager`, sem participação incompatível na proposta, pode aprovar. A aprovação é bloqueada para criador, captador, remetente e revisor.
    - **Fila e Atribuição:** `/propostas/fila` exige `proposals:assign_review`; `/propostas/:proposalId/revisao` exige simultaneamente `proposals:view_assigned` e `proposals:review`; `/propostas/:proposalId/historico` respeita a visibilidade por organização, vínculo ou atribuição. IDs de rota são codificados por `encodeURIComponent`.
    - **Concorrência e Idempotência Integral:** todos os comandos de mutação exigem `expectedVersion` e `idempotencyKey`; reexecuções equivalentes retornam o mesmo resultado e comandos simultâneos com versão obsoleta recebem `CONCURRENCY_CONFLICT`.
    - **Auditoria e Integridade:** cada transição prepara histórico e snapshot antes do commit em memória, usa correlação e checksum SHA-256 real via Web Crypto, e retorna cópias para preservar imutabilidade externa. Ambientes sem SHA-256 falham de forma fechada.
    - **Privacidade Operacional:** pareceres, justificativas e observações protegidas permanecem no agregado autorizado; eventos e notificações usam payloads e mensagens sanitizados. Decisões do cliente são registros internos declaratórios e não simulam assinatura ou aceite formal autenticado.
    - **Prazo Determinístico:** a vigência começa na apresentação; no instante `agora >= expiresAt` a decisão é recusada e a proposta expira. A varredura automática exige o contexto interno `proposal-expiration-scheduler`.
    - **Ciclo de Sessão:** propostas, históricos, snapshots, atribuições, idempotência, locks, eventos e notificações voláteis participam da limpeza central de logout.
    - **Homologação comportamental do pipeline:** 31 provas em `scripts/test-proposals-pipeline.ts`, além das 39 provas da fundação e da auditoria visual em `scripts/test-proposals-theme.js`.
  - `OE-005.004`: Documento comercial versionado, prévia A4 e exportação segura:
    - **Emissão Canônica:** `issueProposalDocument` exige `proposals:issue_document`, proposta em estado `approved`, versão otimista exata e snapshot aprovado correspondente. Não existe emissão a partir de rascunho, revisão ou estado terminal.
    - **Documento Imutável:** `ProposalCommercialDocument` referencia o ID, a versão e o checksum SHA-256 do snapshot aprovado. Cada snapshot origina no máximo um documento canônico, inclusive sob chamadas concorrentes ou chaves idempotentes diferentes.
    - **Minimização de Dados:** a projeção documental contém somente identificação comercial necessária, cliente, imóvel, condições estimadas e prazo. CPF, CNPJ, telefone, e-mail e observações internas não são copiados para o documento, eventos ou notificações.
    - **Apresentação Vinculada:** `markProposalPresented` exige o documento emitido para a versão aprovada atual; referências arbitrárias e documentos de outra organização, proposta ou versão são recusados.
    - **RBAC Documental:** `proposals:view_document` permite consulta conforme o escopo já autorizado da proposta; `proposals:issue_document` é concedida a `owner`, `company_admin`, `manager` e ao captador exclusivamente relacionado. Financeiro permanece somente leitura e projetista não recebe emissão por permissão injetada.
    - **Prévia e Exportação:** `/propostas/:proposalId/documento` apresenta layout A4 responsivo e impressão pelo navegador, inclusive a opção nativa de salvar como PDF. Nenhum arquivo binário, Base64 ou URL temporária é armazenado.
    - **Limite Jurídico:** o documento informa expressamente que não constitui contrato, assinatura digital, aprovação de crédito ou garantia de liberação de recursos.
    - **Ciclo de Sessão:** documentos, contadores, idempotência, operações em voo, eventos e notificações participam da limpeza central do logout.
    - **Homologação comportamental documental:** 26 provas em `scripts/test-proposal-documents.ts`, além das 39 provas da fundação, 31 provas do pipeline e auditoria visual do módulo.
  - `OE-005.005`: Acompanhamento e encerramento comercial governado:
    - **Funil Derivado:** `/propostas/acompanhamento` calcula indicadores exclusivamente das propostas canônicas visíveis ao usuário, sem duplicar cadastros nem criar repositório analítico paralelo. Captadores permanecem restritos às próprias propostas; financeiro possui consulta somente leitura; projetistas não recebem acesso comercial implícito.
    - **Follow-up Interno:** propostas `presented` podem possuir no máximo um acompanhamento ativo, sempre antes de `expiresAt`, com responsável organizacional ativo, finalidade e canal tipados. Agendamento, conclusão e cancelamento são operações idempotentes, serializadas e protegidas por versão.
    - **Fechamento Determinístico:** aceite, recusa, expiração ou cancelamento encerram automaticamente acompanhamentos pendentes com códigos de motivo tipados. O recurso não envia e-mail, mensagem, telefonema e não integra agenda externa.
    - **Encaminhamento Pós-Aceite:** `/propostas/:proposalId/encaminhamento` prepara uma referência operacional imutável somente após `accepted`, vinculando snapshot aceito e documento comercial apresentado, com checksum SHA-256 real e destino derivado do tipo canônico da proposta.
    - **Limite Jurídico e Operacional:** o encaminhamento não cria contrato, projeto, laudo, operação de crédito, cobrança, assinatura ou obrigação financeira. Persistência real e integrações posteriores permanecem fora do escopo.
    - **RBAC Granular:** `proposals:view_commercial_tracking`, `proposals:manage_follow_up`, `proposals:view_handoff` e `proposals:prepare_handoff` aplicam menor privilégio no serviço e nas rotas, com IDOR multitenant negado por padrão.
    - **Auditoria e Ciclo de Sessão:** eventos de follow-up e handoff carregam somente metadados sanitizados; stores, idempotência, operações em voo, notificações e locks participam da limpeza central do logout.
    - **Homologação comportamental:** 39 provas em `scripts/test-proposal-commercial-tracking.ts`, somadas às 39 provas da fundação, 31 do pipeline, 26 documentais e auditoria visual do módulo.
  - `OE-005.006`: Fila operacional e recebimento governado de encaminhamentos:
    - **Fila Derivada:** `/propostas/encaminhamentos` consulta a fonte canônica de encaminhamentos pós-aceite e apresenta estados pendente/recebido sem duplicar proposta, cliente, documento ou operação downstream.
    - **Recebimento Imutável:** `acknowledgeProposalHandoff` confirma exatamente o ID e o checksum SHA-256 do encaminhamento, gera um único `ProposalHandoffReceipt` canônico por encaminhamento e preserva correlação, ator organizacional e checksum próprio.
    - **Escopo por Destino:** `owner`, `company_admin` e `manager` operam a fila organizacional; `finance` recebe somente `credit_operations`; `project_designer` recebe somente `appraisal_operations` e `technical_operations`; captadores não recebem permissão operacional implícita.
    - **Deny-by-Default e Concorrência:** as permissões `proposals:view_handoff_queue` e `proposals:acknowledge_handoff` são reavaliadas no serviço. Destino incompatível, IDOR, checksum obsoleto ou membro inativo são recusados; replay e chamadas concorrentes convergem para o mesmo comprovante.
    - **Limite Operacional:** o recebimento registra somente a entrega interna. Não cria contrato, operação de crédito, laudo, projeto técnico, cobrança, assinatura ou integração externa.
    - **Auditoria e Sessão:** evento `proposal.handoff.acknowledged` e notificações usam metadados sanitizados; comprovantes, idempotência, operações em voo, locks, eventos e notificações participam da limpeza central do logout.
    - **Proteção da Interface:** identificadores internos de Ordem de Execução foram removidos das páginas públicas. `scripts/test-ui-copy.ts` percorre a AST de todo `src/**/*.tsx` e bloqueia novos códigos `OE-xxx.xxx` em textos renderizáveis, sem confundir comentários técnicos com conteúdo de interface.
    - **Instalação Reproduzível:** `package-lock.json` foi regenerado sem referências a checkouts locais ou dependências por symlink; `npm ci` instala integralmente 224 pacotes em uma árvore limpa antes das validações.
    - **Homologação comportamental:** 23 provas em `scripts/test-proposal-handoff-receipts.ts`; até esta ordem o Módulo 005 totalizava 158 provas comportamentais em cinco suítes de domínio, além das auditorias de texto público e tema.
  - `OE-005.007`: Renovação governada e linhagem de propostas encerradas:
    - **Novo Rascunho sem Reabertura:** `renewProposal` aceita somente origem `declined`, `rejected`, `expired` ou `cancelled`; `accepted` e estados ativos permanecem fechados. A proposta de origem não é alterada e cada origem possui no máximo um sucessor canônico.
    - **Cópia Segura e Dados Atuais:** o novo rascunho preserva somente condições comerciais permitidas e recarrega cliente, imóvel e captador de fontes canônicas. Decisão, apresentação, revisão, documentos, acompanhamentos, encaminhamentos e observações da origem não são copiados.
    - **Linhagem Imutável:** `ProposalRenewalLink` registra raiz, sequência, estado e versão da origem, correlação e checksum SHA-256. Gerações sucessivas preservam a raiz e são consultadas por `getProposalRenewalLineage`.
    - **RBAC e Vínculo:** `proposals:renew` é concedida a `owner`, `company_admin`, `manager` e captador relacionado. O captador precisa manter vínculo comercial ativo; financeiro, projetista, outro captador, outra organização e permissão injetada são negados por padrão.
    - **Idempotência e Concorrência:** replays e comandos concorrentes equivalentes convergem para o mesmo rascunho; chave com payload divergente e tentativa de criar segundo sucessor incompatível produzem erros tipados.
    - **Interface e Rotas:** `/propostas/:proposalId/renovar` usa builder com `encodeURIComponent`, apresenta somente linguagem comercial pública e informa que não cria contrato, assinatura, crédito, cobrança ou obrigação financeira.
    - **Auditoria e Sessão:** evento `proposal.renewal.created` e notificações carregam somente metadados sanitizados; proposta, vínculos, idempotência, operações em voo, locks, eventos e notificações são eliminados pela limpeza central de logout.
    - **Homologação comportamental:** 28 provas em `scripts/test-proposal-renewals.ts`; o Módulo 005 totaliza 186 provas comportamentais nas seis suítes de domínio, além das auditorias de texto público e tema.

### MÓDULO 006: GESTÃO DOCUMENTAL E ANEXOS TÉCNICOS
- **Status Geral:** OE-006.001 a OE-006.006 homologadas localmente; OE-006.007 implementada e integrada à homologação consolidada. A execução remota do AgroCore CI no commit `0b980aaca3fb5e98227b4045564a354b991a302f` falhou antes de iniciar qualquer etapa do job, portanto a OE-006.007 ainda não é declarada homologada. O build Vercel desse commit foi aprovado. As migrações de Storage, versionamento, checklists e conformidade continuam versionadas e deverão ser aplicadas somente ao projeto Supabase próprio do AgroCore.
- **Entregas da OE-006.001:**
  - **Agregado Referencial Canônico:** `DocumentReference` possui organização, entidade lógica, categoria, nome de exibição, MIME permitido, tamanho opcional, escopo de acesso, situação, versão, datas, autoria e checksum SHA-256 interno. Referências legadas podem permanecer `metadata_only`; envios confirmados usam `stored`.
  - **Fontes Canônicas:** referências aceitam exclusivamente clientes, imóveis, solicitações de laudo, laudos e propostas já existentes na mesma organização. A interface usa seletores derivados dessas fontes e não oferece campo livre para identificadores internos.
  - **RBAC Granular:** permissões `documents:view`, `documents:upload`, `documents:download`, `documents:register_reference` e `documents:manage`. Proprietário, administrador, gerente, projetista e captador enviam dentro do próprio escopo; financeiro permanece em consulta; superadministrador continua isolado dos documentos privados.
  - **Segurança de Conteúdo:** validadores recusam arquivo, `Blob`, bytes, buffers, Base64, URL, token, credencial e segredo. MIME é limitado a PDF, JPEG, PNG e TIFF; tamanho e datas são validados sem armazenar conteúdo físico.
  - **Versionamento e Concorrência:** registro, substituição e arquivamento são idempotentes, protegidos por versão e confirmados atomicamente no gateway de preview. Referências equivalentes ativas não são duplicadas e replays concorrentes convergem para o mesmo resultado.
  - **Gateway Seguro:** `PreviewDocumentReferenceGateway` usa coleção vazia, volátil e isolada por organização; `UnavailableDocumentReferenceGateway` nega leitura e mutação em produção até existir infraestrutura segura. Nenhum dado é persistido em storage do navegador.
  - **Auditoria e Sessão:** eventos append-only carregam apenas IDs e metadados sanitizados; referências, idempotência e diário de eventos são eliminados pela limpeza central do logout.
  - **Rotas e Interface:** `/documentos`, `/documentos/novo` e `/documentos/:documentId` usam guards de permissão, builders com `encodeURIComponent`, navegação segura, estados acessíveis e paleta oficial.
  - **Homologação Comportamental:** 39 provas em `scripts/test-documents-foundation.ts`, auditoria visual em `scripts/test-documents-theme.js` e agregador `test:module-006`.
- **Entregas da OE-006.002:**
  - **Bucket Privado:** `organization-documents` permanece não público, com limite de 50 MB e somente PDF, JPEG, PNG e TIFF.
  - **Caminho Opaco:** organização, tipo de vínculo, registro relacionado e documento compõem a chave; o nome original do arquivo não é gravado no caminho.
  - **Políticas Separadas:** `SELECT`, `INSERT`, `UPDATE` e `DELETE` possuem políticas próprias em `storage.objects`, vínculo organizacional ativo, perfil permitido e validação integral do caminho.
  - **Menor Privilégio:** financeiro não envia; exclusão é limitada à gestão ou ao próprio responsável pelo envio; superadministrador da plataforma não atravessa o isolamento das organizações.
  - **Barreiras de Acesso:** bucket público, troca de organização no caminho, segmentos manipulados e formatos fora da lista são recusados por banco e aplicação.
  - **Homologação Comportamental:** 8 provas em `scripts/test-document-storage.ts`, incluindo inspeção estrutural da migração versionada.
- **Entregas da OE-006.003:**
  - **Upload Retomável:** adaptador Supabase usa TUS no host direto de Storage, partes de 6 MB, repetição automática de falhas transitórias e retomada de envio interrompido.
  - **Fila Controlada:** seleção de até dez arquivos, no máximo dois envios simultâneos, progresso real por arquivo, cancelamento e tentativa novamente.
  - **Validação em Camadas:** nome, tamanho, MIME e assinatura inicial do conteúdo são conferidos antes do armazenamento; caminhos usam identificadores opacos.
  - **Confirmação e Compensação:** a referência é criada somente após confirmação do arquivo. Falha posterior aciona remoção compensatória com repetição, impedindo registro sem arquivo.
  - **Abertura Protegida:** formatos suportados são visualizados por `Blob` temporário após autorização; baixar exige ação explícita e não expõe URL pública ou assinada no agregado.
  - **Sessão:** arquivos do modo de desenvolvimento ficam apenas em memória e são eliminados no logout; produção permanece fechada quando Supabase não está configurado.
  - **Homologação Comportamental:** 7 provas em `scripts/test-document-upload.ts`. Com as 39 provas da fundação, 32 antecipadas de governança e 8 de Storage, o módulo totaliza 86 provas comportamentais, além das auditorias de texto e tema.
- **Entregas da OE-006.004:**
  - **Identidade e Linhagem:** cada documento possui identidade lógica estável, versões numeradas, predecessor, responsável autenticado, data definida pelo banco e motivo obrigatório. A versão anterior e seu arquivo permanecem preservados.
  - **Troca Atômica:** a migração `20260901115546_oe_006_004_document_versions.sql` usa lock transacional da linha, índice parcial exclusivo para uma única versão atual e recibos idempotentes vinculados ao ator. Atualizações simultâneas têm um único vencedor.
  - **Persistência Fechada:** escrita direta em `document_versions` é revogada; criação, substituição e arquivamento passam por RPCs validadas. A exposição à Data API possui `GRANT` explícito somente de leitura e RLS habilitada.
  - **Isolamento de Participantes:** vínculos autorizados ficam em tabela privada, fora do contrato público. Gestão acessa a organização, financeiro somente o escopo organizacional e projetista/captador somente documentos relacionados.
  - **Imutabilidade do Arquivo:** o banco confere o caminho privado contra organização, registro relacionado, documento lógico, versão e formato. Após a referência ser registrada, o objeto não pode ser sobrescrito nem removido pelas políticas do cliente; compensação continua permitida apenas para envio próprio ainda órfão.
  - **Gateway Real e Interface:** `SupabaseDocumentReferenceGateway` consulta histórico e executa as RPCs quando a configuração pública de produção existe. A tela apresenta versão atual/histórica, autoria, motivo, linha do tempo, comparação exclusivamente descritiva, substituição de arquivo com progresso/cancelamento e acesso protegido a versões anteriores.
  - **Correções da Auditoria:** as rotas estáticas `/documentos/pendencias` e `/documentos/pendencias/nova` foram retiradas do agrupamento de clientes e posicionadas antes de `/documentos/:documentId`, impedindo que `pendencias` fosse interpretado como ID de documento. A função de Storage que identifica objetos registrados agora valida sessão, organização extraída do caminho e vínculo ativo antes da consulta, eliminando enumeração entre organizações. Erros de entrada e estado das RPCs também preservam seus códigos de domínio.
  - **Ambiente e CI sem Chaves:** `.env.example` não declara campos preenchíveis e o workflow não referencia secrets. `test:environment-contract` impede a reintrodução dessas dependências; as chaves públicas do Supabase pertencem somente ao ambiente de hospedagem de produção.
  - **Homologação:** 6 provas específicas em `scripts/test-document-versioning.ts`, incluindo concorrência real e compensação. O Módulo 006 totaliza 92 provas comportamentais, além das auditorias de texto e tema. A matriz integral dos Módulos 001–006 passou localmente. O GitHub Actions permanece sem executar etapas enquanto a conta estiver bloqueada por cobrança; esse estado externo não é registrado como aprovação de CI.
- **Entregas da OE-006.005:**
  - **Modelos por Produto e Linha:** modelos são configurados por organização, tipo e categoria de proposta, com requisitos ordenados, categoria documental, obrigatoriedade, prazo e escopo de acesso. Cada alteração cria uma versão imutável e preserva a anterior, a autoria e o motivo.
  - **Aplicação Canônica:** a aplicação exige proposta real da organização, modelo atual compatível e perfil de gestão. Cada proposta possui no máximo um checklist; tipo, categoria, número, título e versão do modelo são copiados como fotografia rastreável.
  - **Estados e Segregação de Funções:** cada item percorre `pending`, `received`, `in_review`, `approved`, `rejected` e `expired` por transições explícitas. Captador e projetista participantes podem atender requisitos dentro do escopo; decisões exigem `documents:review_requirements`, concedida somente à gestão e ao projetista participante.
  - **Vínculo Documental Seguro:** recebimento exige documento atual, ativo, não vencido, da mesma proposta e categoria. Recusa exige motivo; expiração depende da validade real; reenvio limpa a decisão anterior sem apagar o histórico.
  - **Histórico e Concorrência:** decisões registram estado anterior e seguinte, documento, ator autenticado, horário do banco, motivo e correlação. Versão otimista, locks curtos e recibos idempotentes garantem um único vencedor em comandos simultâneos.
  - **Persistência e RLS:** a migração `20260901170544_oe_006_005_proposal_checklists.sql` cria modelos versionados, checklists, itens, histórico append-only, acesso privado de participantes e RPCs transacionais. Escritas diretas são revogadas; somente leitura explícita com RLS é concedida ao papel autenticado.
  - **Interface e Dados Reais:** `/documentos/checklists` permite configurar modelos, aplicá-los, receber documentos, analisar, decidir e consultar histórico. O detalhe da proposta abre o checklist correspondente; visão geral e agenda exibem somente registros derivados de checklists existentes, mantendo estado vazio verdadeiro quando não há dados.
  - **Correção da Auditoria:** a situação efetiva do item passa a ser derivada novamente da validade atual do documento vinculado. Um item aprovado cujo arquivo venceu volta à agenda como expirado, sem reescrever a decisão aprovada nem apagar seu histórico imutável.
  - **Produção Fechada:** o bundle de produção substitui a factory de preview por `UnavailableProposalChecklistGateway`; nenhum dado volátil ou chave entra no build. A migração permanece pronta, mas não foi aplicada sem o projeto Supabase específico do AgroCore.
  - **Homologação:** 19 provas específicas em `scripts/test-proposal-checklists.ts` cobrem RBAC, modelos, compatibilidade, idempotência, documentos, escopos restritos, estados, expiração derivada, corrida, isolamento, rotas, RLS e o hardening da OE-006.004.
- **Entregas da OE-006.006:**
  - **Validade Configurável e Alertas Reais:** gestão configura antecedências de alerta por organização com versão otimista. A central `/documentos/validades` deriva avisos exclusivamente das datas atuais dos documentos e separa vencidos, críticos e próximos do vencimento.
  - **Compartilhamento Temporário Exato:** perfis autorizados geram vínculo para uma única versão atual, armazenada e não vencida, com finalidade, prazo entre cinco minutos e sete dias e limite de acessos. O token possui 256 bits, aparece uma única vez no fragmento da URL e somente seu SHA-256 é persistido.
  - **Consumo Público Endurecido:** a página pública exige confirmação humana antes de consumir o acesso. A Edge Function recebe corpo limitado, calcula o hash, usa uma RPC exclusiva de `service_role`, incrementa o contador atomicamente e assina apenas o caminho exato por 60 segundos, com respostas sem cache e sem referência. Revogação ou substituição bloqueia novos consumos.
  - **Exportação em Lote Auditada:** o usuário seleciona explicitamente até 20 documentos atuais, armazenados, válidos e acessíveis, limitados a 100 MiB. O ZIP sem compressão contém somente a seleção autorizada; início, itens, conclusão, tamanho, hash SHA-256, falha e finalidade ficam registrados no banco.
  - **Menor Privilégio e RLS:** as permissões `documents:manage_validity`, `documents:share` e `documents:export` foram separadas por perfil. A migração `20260902010000_oe_006_006_document_compliance.sql` mantém tokens e recibos no schema privado, revoga escrita direta, protege consultas por organização/participação e concentra mutações em RPCs transacionais.
  - **Concorrência de Interface e Entrada Pública:** trocas de organização, usuário ou token invalidam respostas assíncronas anteriores e impedem consumo/exportação duplicados. A função pública interrompe a leitura acima de 256 bytes mesmo quando a requisição omite `Content-Length`.
  - **Produção Fechada:** a factory de preview não entra no bundle de produção. A migração e a função `document-share` estão versionadas, mas ainda dependem de aplicação e implantação no projeto Supabase específico do AgroCore.
  - **Homologação:** 19 provas específicas em `scripts/test-document-compliance.ts` cobrem RBAC, política de alerta, tokens, limites, revogação, consumo atômico, validade, seleção exata, ZIP, auditoria, isolamento entre organizações e integrantes, integridade estrutural das migrações, RLS, Edge Function, concorrência de interface, separação do bundle e rotas. O Módulo 006 totaliza 130 provas comportamentais, além das auditorias de texto e tema; lint, build, Service Worker e a matriz integral dos Módulos 001–006 passaram localmente.
- **Entregas da OE-006.007 (implementadas; homologação final pendente do runner):**
  - **Bateria Ofensiva:** `scripts/test-document-security-homologation.ts` adiciona 21 provas automatizadas para isolamento multiempresa, IDOR/BOLA, RBAC dos perfis, Storage privado, arquivos incompatíveis, órfãos e compensação, concorrência, idempotência, checklists, compartilhamento, exportação, RLS, migrations, rotas e deny-by-default.
  - **Hardening de Arquivos:** `src/documents/documentStoragePolicy.ts` passou a rejeitar nomes acima de 255 caracteres, caracteres de controle, barras, `..`, ausência de extensão, extensão incompatível com o MIME declarado e arquivos pequenos demais para validação de assinatura, mantendo verificação de magic bytes para os formatos permitidos.
  - **Integração Oficial:** `package.json` expõe `test:document-security` e `scripts/test-module-006.js` executa a bateria da OE-006.007 antes das auditorias de texto e tema; o agregador agora cobre OE-006.001 a OE-006.007.
  - **CI e Evidência Remota:** o push de integração disparou o AgroCore CI, porém o job terminou antes de executar qualquer `step` e sem logs de teste disponíveis. Esse estado externo não é registrado como reprovação funcional da suíte nem como homologação. Separadamente, o status Vercel do commit de integração concluiu com sucesso.
  - **Contagem:** permanecem 130 provas comportamentais já homologadas até OE-006.006 e foram adicionadas 21 provas da OE-006.007, totalizando 151 provas automatizadas definidas para o módulo. As 21 novas provas somente entram na contagem de homologação após execução efetiva e aprovação do runner.


### MÓDULO 007: VISITAS, VISTORIAS E OPERAÇÃO EM CAMPO
- **Status Geral:** OE-007.001 e OE-007.002 implementadas no código. O Módulo 007 cobre agora a fundação de visitas e a preparação operacional pré-campo, mantendo formulário de campo, evidências, conclusão e integrações externas para as ordens posteriores.
- **Entregas da OE-007.001 — Modelo de Visitas e Vistorias:**
  - **Domínio Tipado:** `TechnicalVisit` registra organização, tipo de atividade, situação, cliente, imóvel opcional, proposta opcional, laudo opcional, responsável, data prevista, finalidade, autoria, datas de ciclo de vida e versão otimista.
  - **Estados Controlados:** fluxo explícito `planned → confirmed → in_progress → completed`, com cancelamento permitido antes da conclusão; estados concluído e cancelado são terminais e transições inválidas são recusadas.
  - **Fontes Canônicas:** cliente, imóvel, proposta e laudo são resolvidos pelos módulos existentes. O módulo não cria cadastros paralelos e bloqueia vínculos incompatíveis ou pertencentes a outra organização.
  - **Responsabilidade Operacional:** somente integrante ativo da organização e com autorização de execução pode ser responsável. O perfil `project_designer` passa a possuir `surveys_and_visits:execute`; financeiro e captador permanecem sem capacidade de execução.
  - **Segregação de Funções:** consultar exige `surveys_and_visits:view`; criar, confirmar, alterar planejamento e cancelar exigem `surveys_and_visits:schedule`; iniciar e concluir exigem `surveys_and_visits:execute` e correspondência com o responsável atribuído.
  - **Concorrência e Auditoria:** alterações usam `expectedVersion`, um único vencedor em corrida de versão, motivo obrigatório para alterações de planejamento e cancelamento, e trilha append-only com ator, horário, versão, transição e campos alterados.
  - **Gateways:** `PreviewTechnicalVisitGateway` é volátil, vazio por padrão e isolado por organização; produção usa `UnavailableTechnicalVisitGateway` e fecha com segurança. O factory de desenvolvimento foi ajustado para impedir inclusão estática do gateway de preview no bundle de produção.
  - **Contexto e Sessão:** `FieldVisitsProvider` integra autenticação, organização, RBAC e as fontes canônicas, cancela respostas obsoletas na troca de contexto e limpa dados voláteis pelo registro central de logout.
  - **Interface:** rota `/visitas`, navegação “Visitas e vistorias”, formulário com seletores canônicos, estado vazio real, filtros por situação e comandos de confirmar, iniciar, concluir e cancelar conforme autorização. A identidade visual permanece restrita à paleta oficial AgroCore.
  - **Escopo Preservado na OE-007.001:** a fundação não antecipou preparação operacional; esses elementos passam a ser tratados exclusivamente pela OE-007.002, enquanto formulário de campo, fotos e geolocalização continuam reservados para ordens posteriores.
  - **Homologação Definida:** `scripts/test-field-visits-foundation.ts` contém 31 provas comportamentais e estruturais e voltou ao fluxo integral, sem interrupções de diagnóstico; a prova de integração agora também exige a presença de `/visitas` na matriz central. `scripts/test-field-visits-theme.js` audita a paleta e `scripts/test-module-007.js` consolida fundação, tema e auditoria global de textos.
- **Entregas da OE-007.002 — Agenda e Preparação:**
  - **Agenda com Fuso:** a preparação usa horário local + fuso IANA, converte para UTC de forma determinística e rejeita horários locais inexistentes em mudanças de fuso.
  - **Duração e Endereço:** cada preparação registra duração de 15 minutos a 24 horas e endereço operacional estruturado com ponto de encontro, cidade, estado, referência postal e orientações.
  - **Participantes:** integrantes ativos da mesma organização podem ser adicionados como participantes, com deduplicação e sem repetir o responsável principal.
  - **Checklist Prévio:** itens versionados por visita possuem obrigatoriedade, conclusão/reabertura, autoria e horário; a definição do checklist preserva IDs existentes e bloqueia duplicidades.
  - **Conflitos de Agenda:** sobreposição é sinalizada quando há responsável, participante ou veículo previsto compartilhado. A exceção somente é persistida por usuário com permissão de agendamento, com motivo, autor, data e visitas conflitantes auditáveis.
  - **Veículo e Roteiro:** vínculo opcional usa referência preparatória sem criar cadastro paralelo de frota; roteiro e orientações ficam limitados ao planejamento textual desta ordem.
  - **Remarcação e Cancelamento:** remarcações passam exclusivamente pelo serviço de preparação, usam versão otimista e motivo; visitas canceladas deixam de bloquear o horário e preparação fica bloqueada após início da execução.
  - **Interface:** `VisitPreparationPanel` oferece edição responsiva de data/hora, fuso, duração, endereço, participantes, checklist, veículo e roteiro, além do fluxo explícito para autorizar exceção de conflito.
  - **Escopo Preservado:** a OE-007.002 não cria formulário de campo, fotos, geolocalização, cadastro de veículos, agenda corporativa ou integração com frota; esses itens permanecem para OE-007.003, OE-007.004 e OE-007.006.
  - **Homologação Definida:** `scripts/test-field-visits-preparation.ts` adiciona 30 provas específicas. Somadas às 31 provas da fundação, o Módulo 007 passa a ter 61 provas comportamentais/estruturais definidas, além da auditoria de tema e de textos públicos.

---

## 7. SUÍTE DE TESTES E VERIFICAÇÃO AUTOMATIZADA

| Comando | Descrição da Bateria |
|---|---|
| `npm run test:auth` | Valida credenciais, recuperação, bloqueio e políticas de senha |
| `npm run test:session` | Valida ciclo de vida da sessão, timeout de inatividade e renovação |
| `npm run test:roles` | Valida as 7 configurações de perfis e visões contextuais |
| `npm run test:organization` | Valida multitenancy, seleção de organização e estados restritos |
| `npm run test:authorization` | Valida as matrizes RBAC, avaliador e proteção contra acessos indevidos |
| `npm run test:access-flow` | Valida o fluxo integrado de rotas e decisões de redirecionamento |
| `npm run test:module-001` | Homologação consolidada de todas as suítes do Módulo 001 |
| `npm run test:clients` | Valida a fundação do módulo de clientes (OE-002.001) |
| `npm run test:client-form` | Valida os 30 casos de teste cadastrais de PF, PJ, CPF, CNPJ e endereços (OE-002.002) |
| `npm run test:client-list` | Valida busca, filtros, ordenação e paginação real de clientes (OE-002.003) |
| `npm run test:module-002` | Homologação consolidada de todas as suítes do Módulo 002 |
| `npm run test:properties-foundation` | Valida a fundação arquitetural do módulo de imóveis (OE-003.001) |
| `npm run test:property-form` | Valida a lógica cadastral, validações e conversões de formulário de imóveis (OE-003.002) |
| `npm run test:property-geometry` | Valida geodésia, conversões DMS/UTM, autointerseção, vazios, comparativo de áreas e gateway (OE-003.003-R1) |
| `npm run test:property-theme` | Valida a conformidade e purga total de cores no Módulo 003 (OE-003.002-R2) |
| `npm run test:module-003` | Homologação consolidada de todas as suítes do Módulo 003 |
| `npm run test:appraisals-foundation` | Valida a fundação do módulo de laudos de avaliação, contratos, estados, RBAC e gateways (OE-004.001) |
| `npm run test:appraisal-theme` | Valida a identidade visual oficial AgroCore e purga de cores no Módulo 004 (OE-004.001) |
| `npm run test:oe-004-002` | Valida vínculo do captador, fila, atribuição, conversão e notificações (19 provas) |
| `npm run test:oe-004-003` | Valida dossiê, cálculos, prontidão e emissão atômica (37 provas) |
| `npm run test:module-004` | Homologação consolidada de todas as suítes do Módulo 004 (OE-004.001 a OE-004.003) |
| `npm run test:proposals-foundation` | Valida domínio, finanças, multitenancy, idempotência, concorrência e rotas de propostas (39 provas) |
| `npm run test:proposal-pipeline` | Valida comportamentalmente RBAC, atribuição, revisão, segregação, concorrência, prazos, SHA-256, privacidade, imutabilidade e limpeza do pipeline (31 provas) |
| `npm run test:proposal-documents` | Valida emissão documental, snapshot aprovado, SHA-256, concorrência, idempotência, IDOR, minimização de dados, apresentação vinculada, rota segura e limpeza (26 provas) |
| `npm run test:proposal-commercial-tracking` | Valida funil, follow-ups, responsáveis canônicos, concorrência, RBAC, fechamento automático, handoff pós-aceite, SHA-256, IDOR, rotas e limpeza (39 provas) |
| `npm run test:proposal-handoff-receipts` | Valida fila por destino, recebimento canônico, SHA-256, concorrência, idempotência, IDOR, eventos sanitizados, rota e limpeza (23 provas) |
| `npm run test:proposal-renewals` | Valida elegibilidade terminal, novo rascunho, linhagem SHA-256, cópia segura, RBAC, vínculo ativo, concorrência, idempotência, IDOR, eventos, rotas e limpeza (28 provas) |
| `npm run test:ui-copy` | Audita via AST todas as telas TSX e impede códigos de ordem e termos internos de implementação em conteúdo renderizável |
| `npm run test:proposals-theme` | Audita a paleta oficial e bloqueia famílias externas no Módulo 005 |
| `npm run test:module-005` | Homologação consolidada da fundação, pipeline, documento comercial, acompanhamento, recebimento, renovação, texto público e tema do Módulo 005 (OE-005.001 a OE-005.007; 186 provas comportamentais) |
| `npm run test:documents-foundation` | Valida metadados seguros, fontes canônicas, RBAC, IDOR, versionamento, idempotência, concorrência, eventos, rotas e limpeza documental (39 provas) |
| `npm run test:document-governance` | Valida pendências, validade, RBAC, isolamento, associação documental, concorrência, idempotência, eventos, rotas e limpeza (32 provas) |
| `npm run test:document-storage` | Valida bucket privado, caminhos, formatos, tamanho, cancelamento e as quatro políticas de Storage (8 provas) |
| `npm run test:document-upload` | Valida progresso, confirmação, compensação, RBAC, conteúdo, cancelamento e isolamento do upload (7 provas) |
| `npm run test:document-versioning` | Valida linhagem, autoria, histórico, versão atual única, concorrência, compensação, comparação segura e estrutura da migração (6 provas) |
| `npm run test:proposal-checklists` | Valida modelos versionados, aplicação por proposta, estados, RBAC, escopos, vínculo documental, histórico, concorrência, expiração derivada, agenda, rotas e RLS (19 provas) |
| `npm run test:document-compliance` | Valida alertas, validade, compartilhamento temporário, revogação, consumo atômico, exportação exata, ZIP, auditoria, isolamento, migrações, RLS, função pública e concorrência de interface (19 provas) |
| `npm run test:document-security` | Executa a bateria ofensiva da OE-006.007: isolamento multiempresa, IDOR/BOLA, RBAC, arquivos, órfãos, concorrência, checklists, compartilhamento, exportação, RLS, migrations e deny-by-default (21 provas) |
| `npm run test:environment-contract` | Impede campos de chaves no exemplo de ambiente e dependência de secrets no AgroCore CI |
| `npm run test:documents-ui-copy` | Impede linguagem interna e códigos de ordem nas páginas públicas do Módulo 006 |
| `npm run test:documents-theme` | Audita a paleta oficial, variantes proibidas e seleção controlada de arquivos no Módulo 006 |
| `npm run test:module-006` | Homologação consolidada do Módulo 006 até OE-006.007; agrega as 130 provas anteriormente homologadas, as 21 novas provas de segurança, texto público e tema. A homologação das 21 novas provas depende de execução efetiva do runner. |
| `npm run test:field-visits-foundation` | Valida a OE-007.001 com 31 provas de estados, RBAC, responsáveis, fontes canônicas, isolamento organizacional, concorrência, auditoria, rota e produção fechada |
| `npm run test:field-visits-preparation` | Valida a OE-007.002 com 30 provas de fusos, duração, endereço, participantes, checklist, remarcação, cancelamento, conflitos, exceções auditáveis, veículo previsto, roteiro e isolamento |
| `npm run test:field-visits-theme` | Audita a identidade visual oficial do Módulo 007 e bloqueia famílias de cores não autorizadas |
| `npm run test:module-007` | Homologação consolidada do Módulo 007 até OE-007.002: 31 provas da fundação + 30 provas de agenda/preparação, tema e textos públicos |
| `npm run test:rebranding` | Valida a ausência absoluta de termos e referências legadas no código |
| `npm run test:sw-lifecycle` | Valida pré-cache, arquivos físicos e bloqueios de segurança do Service Worker |
| `npm run test:multi-build-update` | Valida a substituição de cache entre versões sem apagar caches de terceiros |
| `npm run build` | Compilação de produção Vite + geração de SW + verificação de vazamentos |
| `npm run lint` | Checagem estrita de tipos TypeScript (`tsc --noEmit`) |

---

## 8. POLÍTICA DESEJADA PARA A BRANCH PRINCIPAL (`main`)

O repositório contém CI para pushes e pull requests. A existência do arquivo de workflow não comprova que regras administrativas de proteção estejam ativas no GitHub; enquanto essa configuração não for verificada pela API administrativa, o Livro‑Raiz não a declara homologada.

Configuração recomendada: pull request obrigatório, status check do workflow AgroCore CI, branch atualizada com a base, histórico linear e aplicação a administradores.

---
## 9. DIRETRIZES PARA AS PRÓXIMAS EXECUÇÕES

1. **Módulo 004 — Laudos de Avaliação:** concluído até OE-004.003; emissão final em produção continua condicionada a infraestrutura persistente real e integrações futuras explicitamente fora deste preview.
2. **Módulo 005 — Propostas de Crédito e Serviços:** concluído até OE-005.007 no escopo volátil atual; persistência real, assinatura digital, contratos, criação automática de operações downstream e integrações externas permanecem fora do escopo.
3. **Módulo 006 — Gestão Documental:** OE-006.007 implementada e integrada no código, com 21 novas provas de segurança adicionadas ao agregador `test:module-006`. O fechamento formal pelo runner continua pendente porque o AgroCore CI encerra antes de iniciar etapas. As migrações de Storage, versionamento, checklists e conformidade, além da função pública de compartilhamento, devem ser aplicadas somente quando o projeto Supabase específico do AgroCore estiver conectado.
4. **Módulo 007 — Visitas, Vistorias e Operação em Campo:** OE-007.001 e OE-007.002 implementadas no código, totalizando 61 provas definidas. A próxima ordem é a OE-007.003 — Formulário de campo, preservando a separação de responsabilidades com evidências/geolocalização (OE-007.004) e integrações com agenda/frota (OE-007.006).