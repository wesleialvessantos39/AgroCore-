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
- **Status Geral:** OE-006.001 a OE-006.007 possuem homologação de código executada no gate de produção. A revisão complementar da OE-006.007 foi aprovada pelo Vercel no commit `74ed52aac6dfecb87132a3eab3a361844da4ea09`, executando invariantes, TypeScript estrito, `test:module-006`, `test:module-007`, build Vite, Service Worker e verificação de vazamentos. O fechamento remoto do Módulo 006 continua pendente: o projeto Supabase AgroCore não está conectado nesta sessão, portanto migrações, RLS, Storage e a função `document-share` não são declarados aplicados ou homologados remotamente. O AgroCore CI continua encerrando antes de qualquer `step`.
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
- **Entregas da OE-006.007 — Segurança e Homologação Documental (revisão contra Plano Mestre e Relatório Consolidado):**
  - **Bateria Ofensiva Executada:** `scripts/test-document-security-homologation.ts` contém agora 29 provas para isolamento multiempresa, IDOR/BOLA, matriz positiva/negativa dos sete perfis oficiais, Storage privado, arquivos incompatíveis, órfãos, compensação, rede instável, retry, concorrência, idempotência, checklists, compartilhamento, exportação, RLS, migrações, Edge Function e deny-by-default.
  - **Retry e Órfãos:** `DocumentUploadService` mantém identificador e caminho estáveis para o mesmo comando idempotente, permitindo retomada coerente; compensação só é iniciada depois de o Storage confirmar o objeto, preservando o erro raiz quando o upload sequer foi criado. Falha de limpeza após objeto confirmado tenta três vezes e sinaliza `STORAGE_COMPENSATION_FAILED` sem criar referência documental falsa.
  - **Hardening de Arquivos:** nome, extensão, tamanho, MIME e assinatura inicial por magic bytes são validados para PDF/JPEG/PNG/TIFF e arquivos disfarçados são recusados. Esta revisão não declara antivírus/antimalware externo, pois nenhuma integração desse tipo foi comprovada.
  - **RLS, Storage e Função Pública:** as provas estruturais verificam bucket privado, políticas por operação, vínculo organizacional, ausência de políticas universais, `security definer` com `search_path` fechado, RPC pública de resgate restrita a `service_role` e Edge Function com corpo limitado, hash SHA-256, `no-store`, `no-referrer`, `nosniff` e URL assinada por 60 segundos.
  - **Gate de Produção:** `npm run build` passou a executar também `test:module-006` antes do Módulo 007. O Vercel aprovou o conjunto no commit `74ed52aac6dfecb87132a3eab3a361844da4ea09`; portanto as 29 provas da OE-006.007 foram efetivamente executadas no gate de código.
  - **Evidência Remota — atualização:** o projeto Supabase AgroCore está agora conectado e recebeu migrations dos módulos persistentes já executadas nesta fase. Esta atualização de contexto não reabre nem altera retroativamente a homologação histórica da OE-006.007; a Edge Function `document-share` e a infraestrutura documental completa devem continuar sendo verificadas pelo gate específico do Módulo 006 antes de qualquer nova declaração de homologação remota integral.
  - **CI Externo:** o AgroCore CI do commit aprovado pelo Vercel terminou como falha com `steps=[]`; continua sendo uma indisponibilidade anterior à execução e não substitui nem invalida o gate efetivamente executado pelo Vercel.
  - **Contagem:** 130 provas comportamentais até OE-006.006 + 29 provas de segurança da OE-006.007 = **159 provas automatizadas de código executadas**, além das auditorias de texto e tema. O Módulo 006 não é declarado integralmente homologado em infraestrutura remota enquanto o Supabase AgroCore não for validado.


### MÓDULO 007: VISITAS, VISTORIAS E OPERAÇÃO EM CAMPO
- **Status Geral:** OE-007.001 a OE-007.007 estão implementadas. OE-007.003/004/005/006 e a migration de fechamento da OE-007.007 possuem persistência aplicada no Supabase AgroCore. A OE-007.007 acrescentou políticas explícitas de conectividade de campo, retomada segura do rascunho após reconexão, tratamento de permissão/indisponibilidade/timeout de GPS, bloqueio explícito de upload sem rede, fechamento dos índices de FKs do módulo e uma suíte final de 50 provas. O gate de produção foi executado e aprovado pelo Vercel no commit `4adcbc0a0b07df3ed0e192314080129de02cfed5`, incluindo invariantes, `tsc --noEmit`, `test:module-007`, Vite, Service Worker e verificação de vazamentos. O AgroCore CI/GitHub Actions continua encerrando antes do primeiro step, sem evidência de falha do código. O Módulo 007 está **finalizado em implementação, banco remoto e homologação automatizada/remota**. A validação física em aparelho celular real permanece separada e não é declarada executada porque este ambiente não observa hardware real; seu roteiro de aceite está em `docs/OE-007-007-HOMOLOGACAO-CAMPO.md`.

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
  - **Homologação Executada:** `scripts/test-field-visits-foundation.ts` contém 35 provas comportamentais e estruturais. Além dos estados, fontes canônicas, isolamento, concorrência, rota e deny-by-default, a revisão passou a verificar matriz dos sete perfis, IDOR da auditoria, normalização de data com offset e imutabilidade por cópia das leituras de auditoria.
#### Revisão complementar da OE-007.001 contra o Plano Mestre e Relatório Consolidado
- **Auditoria de ciclo de vida:** transições agora registram não apenas `status`, mas também `confirmedAt`, `startedAt`, `completedAt` e, no cancelamento, `cancelledAt` e `cancellationReason`, refletindo todos os campos efetivamente modificados.
- **Matriz por perfil:** owner, company_admin, manager e project_designer mantêm `view/schedule/execute`; capturer possui somente `view`; finance e platform_super_admin não recebem permissões organizacionais de campo automaticamente.
- **Isolamento:** consulta da auditoria de uma visita por outra organização é tratada como `VISIT_NOT_FOUND`, evitando enumeração cruzada.
- **Datas:** instantes fornecidos com offset são normalizados para UTC preservando o mesmo momento.
- **Integridade da auditoria:** leituras retornam cópias dos arrays de campos alterados; mutação externa não modifica o histórico interno.
- **Evidência:** as 35 provas da fundação foram executadas dentro do `test:module-007` no gate Vercel aprovado em `74ed52aac6dfecb87132a3eab3a361844da4ea09`.
- **Decisão:** OE-007.001 está revisada e sem bloqueador de código identificado para a continuidade arquitetural.

- **Entregas da OE-007.002 — Agenda e Preparação:**
  - **Agenda com Fuso:** a preparação usa horário local + fuso IANA, converte para UTC de forma determinística e rejeita horários locais inexistentes em mudanças de fuso.
  - **Duração e Endereço:** cada preparação registra duração de 15 minutos a 24 horas e endereço operacional estruturado com ponto de encontro, cidade, estado, referência postal e orientações.
  - **Participantes:** integrantes ativos da mesma organização podem ser adicionados como participantes, com deduplicação e sem repetir o responsável principal.
  - **Checklist Prévio:** itens versionados por visita possuem obrigatoriedade, conclusão/reabertura, autoria e horário; a definição do checklist preserva IDs existentes e bloqueia duplicidades.
  - **Conflitos de Agenda:** sobreposição é sinalizada quando há responsável ou participante compartilhado. A exceção somente é persistida por usuário com permissão de agendamento, com motivo, autor, data e visitas conflitantes auditáveis; mutações concorrentes da agenda são serializadas por organização no gateway em uso para impedir que duas preparações simultâneas ignorem o conflito.
  - **Roteiro:** roteiro e orientações ficam limitados ao planejamento textual desta ordem. A referência de veículo introduzida na primeira implementação foi removida para não antecipar a integração com frota, reservada à OE-007.006.
  - **Remarcação e Cancelamento:** remarcações passam exclusivamente pelo serviço de preparação, usam versão otimista e motivo explícito; horários inexistentes ou ambíguos em mudanças de fuso são recusados. Visitas canceladas deixam de bloquear o horário e a preparação fica bloqueada após início da execução.
  - **Interface:** `VisitPreparationPanel` oferece edição responsiva de data/hora, fuso, duração, endereço, participantes, checklist e roteiro, além do fluxo explícito para autorizar exceção de conflito. O painel possui foco inicial controlado, estado expandido via ARIA, grupos semânticos e nomes acessíveis para itens editáveis.
  - **Escopo Preservado:** a OE-007.002 não cria formulário de campo, fotos, geolocalização, cadastro/referência operacional de veículos, agenda corporativa ou integração com frota; esses itens permanecem para OE-007.003, OE-007.004 e OE-007.006.
  - **Homologação Executada:** `scripts/test-field-visits-preparation.ts` contém 37 provas específicas, incluindo matriz positiva/negativa dos sete perfis oficiais, IDOR entre organizações, deny-by-default, checklist obrigatório antes do início, concorrência entre visitas, fusos e remarcação. Somadas às 35 provas da fundação, o Módulo 007 possui **72 provas comportamentais/estruturais aprovadas**. `scripts/test-field-visits-accessibility.ts` acrescenta 12 verificações estruturais de responsividade e acessibilidade. A validação física em aparelhos e condições reais de campo permanece para a OE-007.007 e não é declarada como executada nesta revisão.

#### Revisão complementar da OE-007.002 contra o Plano Mestre
- **Correções residuais aplicadas:** remoção da referência antecipada de veículo/frota; bloqueio de início sem preparação ou com checklist obrigatório pendente; rejeição de horário local ambíguo; serialização de preparação concorrente por organização; motivo explícito de remarcação; exibição do fuso preparado; foco e ARIA no painel; matriz de acesso positiva/negativa para os sete perfis oficiais; teste IDOR e produção deny-by-default.
- **Banco remoto / RLS / Storage:** não há nova migração ou Storage nesta OE. O domínio de visitas continua com gateway de produção indisponível por padrão enquanto persistência real não for ligada; portanto nenhuma aplicação remota é declarada.
- **Evidência de produção:** Vercel SUCCESS no commit `2edebf8aab91ff9eee44a7f04e6c8cefe7658dd7` com `npm run build`, que inclui invariantes, `tsc --noEmit`, `test:module-007`, Vite, Service Worker e verificação de vazamentos.
- **CI externo:** o AgroCore CI do mesmo commit encerrou antes de executar qualquer etapa (`steps=[]`), mantendo a pendência externa já conhecida sem invalidar o gate efetivamente executado pelo Vercel.
- **Risco/pendência real:** não foi realizada por este ambiente uma inspeção visual em aparelho físico; a cobertura atual é automatizada e estrutural. A validação física de celular, conectividade e operação de campo permanece explicitamente para OE-007.007.
- **Decisão objetiva:** OE-007.002 está corrigida e apta para avanço arquitetural; OE-007.003 não foi iniciada nesta revisão.

- **Entregas da OE-007.003 — Formulário de Campo:**
  - **Domínio Tipado:** formulário por visita com seções configuráveis, itens tipados, obrigatoriedade, opções, resposta e observação. Tipos suportados: texto curto, texto longo, inteiro, decimal, booleano, data, horário, escolha única e múltipla escolha.
  - **Fluxo Operacional:** rascunho disponível após confirmação da visita e durante execução; envio final permitido somente em `in_progress`; após envio o formulário se torna imutável.
  - **Salvamento Progressivo:** rascunho remoto com debounce de 800 ms, salvamento manual, versão otimista e proteção `beforeunload` contra perda de alterações pendentes. A revisão R1 permite opções ainda incompletas durante digitação sem relaxar a validação do envio final.
  - **Concorrência:** cada salvamento usa `expectedVersion`; versões obsoletas são recusadas e somente um escritor vence em corrida.
  - **RBAC e Responsabilidade:** conteúdo técnico acessível somente a owner, company_admin, manager e project_designer; mutações exigem `surveys_and_visits:execute` e correspondência com o responsável atual da visita. Captador preserva acesso à visita, mas não ao conteúdo técnico do formulário; financeiro permanece fora do fluxo de campo.
  - **Supabase:** tabelas `technical_visit_field_forms` e `technical_visit_field_form_revisions` com RLS; RPC `agrocore_save_technical_visit_field_form`; validadores privados para rascunho e envio; trigger `agrocore_require_field_form_before_completion` bloqueando conclusão sem formulário enviado.
  - **Migrations Remotas Aplicadas:** `oe_007_003_field_forms` e `oe_007_003_field_form_draft_resilience` estão registradas no projeto Supabase AgroCore.
  - **Interface Mobile:** painel responsivo com alvos de toque, foco acessível, anúncios ARIA, inputs adequados a teclado móvel e ausência de largura fixa que force overflow em 320/390 px.
  - **Escopo Preservado:** fotos, evidências visuais e geolocalização permanecem fora da OE-007.003 e reservadas às ordens posteriores; frota continua reservada à OE-007.006.
  - **Homologação Automatizada:** nova suíte `scripts/test-field-visits-field-form.ts` integrada ao `test:module-007`, além da ampliação da suíte de acessibilidade e das invariantes de release.
  - **Produção:** o factory de produção do formulário foi explicitamente ligado ao Supabase por módulo virtual no Vite, com fallback `Unavailable` deny-by-default. O deploy Vercel atual ainda falha e não disponibiliza logs ao conector desta sessão; por isso não é registrada aprovação de produção.

- **Entregas da OE-007.004 — Fotos e Geolocalização Canônicas do Imóvel:**
  - **Fonte única por imóvel:** `field_evidence_sets` possui unicidade por `(organization_id, property_id)`. Laudos e visitas/vistorias são vinculados por `field_evidence_links`; não recebem cópias independentes das fotos ou coordenadas.
  - **Vínculo cliente-imóvel:** o cliente do atendimento continua sendo validado contra `properties.client_ids`, porém não é proprietário exclusivo da evidência. A revisão R3 tornou `field_evidence_sets.client_id` opcional/contextual e toda autorização passou a usar `property_id`, suportando coproprietários e demais vínculos legítimos sem criar conjuntos divergentes.
  - **Localização autoritativa:** a inicialização prioriza `properties.referenceCoordinate`, depois o centróide de `property_geometries` e, sem coordenadas, apenas a descrição/endereço do próprio imóvel. Endereço do cliente não é usado como substituto geográfico do imóvel. GPS ou coordenadas manuais atualizam também `properties.payload.referenceCoordinate`.
  - **Fotografias autoritativas:** documentos `photo_report` são importados somente quando pertencem ao próprio imóvel. Fotos capturadas no cadastro, laudo ou visita/vistoria são gravadas no mesmo `evidenceId`, no bucket privado `field-evidence`, com validação JPEG/PNG/TIFF, assinatura real do arquivo e limite de 15 MB.
  - **Cadastro pelo cliente:** a rota dedicada `/clientes/:clientId/fotos-geolocalizacao` lista os imóveis vinculados ao cliente e abre exatamente a mesma evidência canônica usada pelo laudo e pela vistoria.
  - **Pendência detectada pelo projetista:** quando falta imóvel, geolocalização, fotografias ou ambos, o projetista recebe as duas ações explícitas `Cadastrar agora` e `Solicitar ao captador responsável`.
  - **Solicitação ao captador:** `client_registry_requests` registra origem (`appraisal` ou `visit`), cliente, imóvel opcional, escopo da pendência, projetista solicitante e captador atribuído. O captador é resolvido server-side pelo vínculo ativo `client_capturer_assignments`; se não existir responsável, a solicitação é recusada com erro explícito em vez de ser entregue a um usuário aleatório.
  - **Atendimento pelo captador:** a área Clientes apresenta `Solicitações de cadastro`; ao clicar em `Abrir cadastro`, o captador é levado diretamente à área de Fotos e geolocalização daquele cliente/imóvel. Se ainda não houver imóvel, o fluxo abre o cadastro de imóvel pré-vinculado ao cliente e retorna à mesma solicitação.
  - **Vínculo Cliente ↔ Captador em produção:** `SupabaseClientCapturerAssignmentGateway` passou a usar os RPCs `agrocore_assign_capturer`, `agrocore_transfer_capturer` e `agrocore_terminate_capturer_assignment`; factory e build de produção deixam de cair sempre em `Unavailable` quando o Supabase está configurado.
  - **RLS e Storage:** leitura/mutação das evidências usa a função privada por `property_id`; captador só acessa imóvel ligado a pelo menos um cliente da sua carteira ativa, enquanto owner/company_admin/manager/project_designer preservam o escopo autorizado. `anon` não executa os RPCs públicos.
  - **Migrations aplicadas:** `oe_007_004_field_evidence`, `oe_007_004_field_evidence_hardening`, `oe_007_004_property_canonical_sync`, `oe_007_004_property_multi_client` e `oe_007_004_request_indexes` estão registradas no Supabase AgroCore.
  - **Cobertura automatizada definida:** `scripts/test-field-visits-evidence.ts` contém 48 provas. As provas estruturais 15–48 foram novamente confrontadas com a `main` após a R3 e nenhuma asserção ficou falsa. A execução integral remota do conjunto atual não é declarada porque o GitHub Actions segue com `steps=[]` e o Vercel falhou sem logs acessíveis ao conector.
  - **Gate de saída da OE-007.004:** código e banco permanecem implementados. Na auditoria imediatamente anterior à OE-007.005, o RPC autoritativo de atualização foi endurecido para validar a máquina de estados também no servidor, bloquear visitas terminais e impedir conclusão sem o fluxo de relatório. Essa correção residual foi incorporada à OE-007.005 conforme a regra de execução do Plano Mestre.


- **Entregas da OE-007.005 — Conclusão e Relatório:**
  - **Conclusão governada:** a transição para `completed` deixa de usar o RPC genérico e passa por `agrocore_complete_technical_visit`, que exige organização ativa, ator autorizado, visita em `in_progress`, versão esperada, correspondência com o responsável e formulário de campo `submitted`.
  - **Atomicidade:** a mesma transação conclui a visita, incrementa a versão, grava a auditoria de mudança de estado e emite a versão 1 do relatório. Uma falha em qualquer etapa impede conclusão parcial.
  - **Registro final versionado:** `technical_visit_report_versions` preserva versões append-only do relatório. Usuários autenticados não possuem INSERT/UPDATE/DELETE direto; mutações ocorrem pelos RPCs governados.
  - **Snapshot técnico:** a primeira versão preserva fotografia do registro final da visita, do formulário enviado e da referência canônica de evidência de campo (evidenceId, versão, imóvel, localização e quantidade de fotos), sem copiar arquivos privados.
  - **Pendências:** o relatório registra até 50 pendências categorizadas (`documentation`, `property_registry`, `evidence`, `technical`, `other`). Nesta OE elas permanecem parte do relatório; não são convertidas em tarefas, compromissos ou reservas, evitando antecipar OE-007.006/008/009.
  - **Revisões imutáveis:** `agrocore_create_technical_visit_report_revision` gera nova versão com motivo obrigatório e concorrência otimista, preservando exatamente o snapshot técnico da versão anterior.
  - **Menor privilégio:** owner, company_admin e manager podem consultar/revisar relatórios da organização; project_designer somente quando é o responsável pela visita; capturer, finance e platform_super_admin não recebem o conteúdo técnico do relatório por este fluxo.
  - **Correção herdada da OE-007.004:** `agrocore_update_technical_visit` agora valida transições no banco, recusa mutação de `completed/cancelled`, exige preparação antes de `in_progress` e devolve `AGROCORE_REPORT_REQUIRED` para tentativa de conclusão genérica.
  - **Interface:** `VisitCompletionReportPanel` substitui a conclusão direta. O responsável registra resumo e pendências, só pode emitir após o formulário estar pronto e, após conclusão, perfis autorizados consultam a versão vigente, histórico, motivo de revisão e impressão.
  - **Supabase aplicado:** estão registradas no projeto Supabase AgroCore as migrations `oe_007_005_visit_completion_reports` (`20260903021023`), `oe_007_005_report_hardening` (`20260903022428`), `oe_007_005_report_integrity_hardening` (`20260903022512`), `oe_007_005_transition_integrity_hardening` (`20260903023035`) e `oe_007_005_report_evidence_race_hardening` (`20260903023343`). Tabela, RLS e RPCs foram verificados remotamente; os RPCs usam `SECURITY DEFINER` com `search_path` vazio e checagens internas explícitas de autorização.
  - **R1 — Integridade do relatório:** IDs de pendência são limitados e deduplicados no banco, valores são normalizados antes da persistência e versões esperadas nulas/inválidas são recusadas para impedir bypass de concorrência.
  - **R2 — Integridade das transições:** `agrocore_update_technical_visit` impede combinar mudança de estado com alteração silenciosa de cliente, imóvel, proposta, laudo, responsável, data, preparação ou finalidade; updates sem mudança de estado exigem motivo e `changedFields` é calculado no servidor.
  - **R3 — Snapshot resiliente:** a conclusão resolve a evidência pela fonte canônica do imóvel `(organization_id, property_id)`, independentemente da corrida assíncrona de criação do vínculo da visita, e registra `linkedToVisit` como proveniência de auditoria.
  - **Cobertura automatizada definida:** `scripts/test-field-visits-completion.ts` adiciona 28 verificações estruturais específicas da OE-007.005 e foi incorporado ao `test:module-007`. A fundação também passou a concluir visita pelo novo serviço de relatório.
  - **Situação de CI/deploy:** o GitHub Actions existe e as execuções do AgroCore CI associadas aos commits desta revisão falham antes de iniciar qualquer step (`steps=[]`); a reexecução manual do job repetiu o mesmo comportamento e a leitura do log retornou `BlobNotFound`. Assim não há evidência de falha de TypeScript/teste dentro do workflow. O deploy Vercel não pôde ser homologado pela conexão disponível nesta sessão, pois o projeto AgroCore não aparece na conta Vercel conectada. Portanto as 28 provas estão versionadas e foram confrontadas estruturalmente com a `main`, mas a execução remota integral não é declarada.
  - **Revisão de entrada da OE-007.006:** foi corrigido o import ausente de `CompleteTechnicalVisitGatewayInput`, `TechnicalVisitCompletionResult` e `ReviseTechnicalVisitReportGatewayInput` no factory de visitas, divergência que impediria o TypeScript de resolver o contrato completo. A cópia pública de pendências também foi atualizada para não afirmar que integrações ainda pertenciam a ordens futuras.
  - **Decisão objetiva:** OE-007.005 permanece implementada no código e aplicada no Supabase; os resíduos comprovados encontrados nesta auditoria foram corrigidos antes do avanço.


- **Entregas da OE-007.006 — Integração com Agenda, Propostas e Frota:**
  - **Fronteira de integração:** `technical_visit_integration_links` mantém um vínculo atual por visita e domínio, enquanto `technical_visit_integration_events` funciona como outbox append-only de eventos de integração. A visita continua sendo a fonte autoritativa do Módulo 007.
  - **Identificadores estáveis:** Agenda e Frota usam o próprio `visitId` como referência de correlação. Propostas usam o `proposalId` já existente e previamente validado pelo serviço de visitas. Nenhum ID de veículo, reserva, compromisso ou tarefa é inventado.
  - **Eventos idempotentes:** chaves determinísticas combinam visita, versão, domínio e tipo de evento. Replay com o mesmo conteúdo converge; reutilização da mesma chave com conteúdo divergente gera `AGROCORE_IDEMPOTENCY_CONFLICT`.
  - **Concorrência:** os helpers privados serializam links por organização/visita/domínio e eventos por organização/`event_key`. `source_version` é monotônico; backfill ou escrita concorrente antiga não consegue substituir uma projeção mais nova.
  - **Agenda:** criação, remarcação, mudança de responsável, preparação e mudança de estado produzem `calendar.visit_sync_requested`; conclusão/cancelamento produz `calendar.visit_release_requested`.
  - **Propostas:** vínculo inicial, troca, remoção e mudanças de estado produzem `proposal.visit_linked`, `proposal.visit_relinked`, `proposal.visit_unlinked` e `proposal.visit_status_changed`. Há índice reverso por `(organization_id, target_domain, stable_reference, status)` para localizar visitas a partir da referência estável.
  - **Frota:** alterações relevantes produzem `fleet.visit_sync_requested`; conclusão/cancelamento produz `fleet.visit_release_requested`. A ordem não cria veículos nem reservas, preservando o escopo futuro do Módulo 009.
  - **Trigger autoritativo:** `agrocore_technical_visit_integrations_sync` executa após INSERT/UPDATE de `technical_visits`, incluindo operações feitas diretamente pelos RPCs. O backfill inicial projeta visitas já existentes sem atualizar a visita nem alterar sua versão.
  - **RLS e menor privilégio:** as duas tabelas possuem apenas policy SELECT para authenticated. Owner, company_admin e manager consultam no escopo da organização; project_designer somente quando é o responsável pela visita. Capturer, finance e platform_super_admin não recebem o conteúdo das integrações técnicas por este fluxo. A inspeção remota confirmou SELECT como único privilégio de tabela para authenticated; os helpers de escrita privados permanecem sem EXECUTE.
  - **R1 — Autorizador RLS:** `authenticated` recebeu apenas EXECUTE no avaliador privado usado pelas policies; nenhum helper de escrita foi exposto.
  - **R2 — Performance:** os índices dedicados de `visit_id` corrigiram as duas advertências de FK criadas pela implementação. O advisor atual não apresenta mais FK sem índice para as tabelas da OE-007.006; os índices aparecem somente como ainda não usados porque as tabelas remotas estão vazias.
  - **R3 — Concorrência:** projeções não regridem `source_version` e a emissão da outbox usa advisory lock por chave idempotente.
  - **R4 — Lookup reverso:** referência estável recebeu índice multiempresa para consumo futuro por Propostas, Agenda ou Frota.
  - **Preview e UI:** `PreviewTechnicalVisitGateway` espelha links/eventos, idempotência, troca de proposta, liberação terminal e limpeza de sessão. `VisitIntegrationPanel` mostra Agenda, Proposta e Frota sem códigos internos e sem criar segunda fonte de visita.
  - **Migrations remotas aplicadas:** `oe_007_006_visit_integrations` (`20260903121204`), `oe_007_006_rls_authorizer_access` (`20260903121647`), `oe_007_006_visit_fk_indexes` (`20260903122147`), `oe_007_006_integration_concurrency_hardening` (`20260903122504`) e `oe_007_006_stable_reference_index` (`20260903122955`).
  - **Cobertura definida:** `scripts/test-field-visits-integrations.ts` contém 41 provas estruturais/comportamentais; o gate `test:module-007` foi ampliado até OE-007.006. A suíte de acessibilidade possui 25 verificações e o tema passou a auditar também os painéis de conclusão e integração.
  - **Limitação herdada do Módulo 005:** `ProposalApplicationService` ainda mantém a proposta autoritativa em memória e não existe tabela canônica `public.proposals` no Supabase atual. A OE-007.006 não cria um espelho falso; ela preserva o `proposalId` recebido da fonte existente e fornece a fronteira estável/idempotente para consumo. A persistência integral do domínio de propostas permanece dívida técnica anterior e deve ser resolvida antes de uma homologação ponta a ponta que exija sobrevivência do vínculo após reinício.
  - **Gate externo histórico:** durante a implementação da OE-007.006 houve commits com Vercel failure e AgroCore CI sem steps. Esse estado foi superado no fechamento da OE-007.007: o Vercel aprovou o gate do Módulo 007 completo no commit `4adcbc0a0b07df3ed0e192314080129de02cfed5`, portanto a OE-007.006 está coberta pelo build atual.
  - **Decisão objetiva:** OE-007.006 está implementada, persistida no Supabase e integrada ao gate final do Módulo 007.


- **Entregas da OE-007.007 — Homologação de Campo e Fechamento do Módulo:**
  - **Auditoria de entrada:** o commit externo `cf08081569754b488f8aadd9e4bea96f6e6d34fb` foi revisado antes da execução. O fluxo de conclusão explícito permaneceu correto; foi corrigida uma regressão de teste que ainda exigia o texto antigo “Fonte canônica única do imóvel” depois da simplificação da interface para “Fonte única do imóvel”.
  - **Celular e responsividade:** a cobertura estrutural permanece ativa para 320/390/430/720/768/1024/1366/1440 px, com correção do filtro principal para `w-full/min-w-0/max-w-full`, alvos mínimos de toque, foco, ARIA e ausência de larguras fixas grandes.
  - **Permissões:** as 50 provas da OE-007.007 revisitarm os sete perfis oficiais. Owner/company_admin/manager/project_designer mantêm view/schedule/execute; capturer permanece somente em view; finance e platform_super_admin não recebem operação de campo. O projetista responsável acessa integrações técnicas e projetista não responsável/captador são bloqueados.
  - **Conectividade:** `useFieldConnectivity` observa `online/offline`. O formulário não envia rascunho sem rede, mantém `dirty`, preserva `beforeunload` e retoma o debounce original de 800 ms quando a conexão volta com a página aberta. Envio final também é bloqueado offline. Não foi criado IndexedDB, localStorage de dados de negócio ou fila offline, preservando o escopo futuro do Módulo 013.
  - **GPS e permissões do dispositivo:** erros de geolocalização são diferenciados entre permissão negada, posição indisponível e timeout. A captura usa alta precisão, timeout de 15 s e `maximumAge=0`; quando o GPS retorna coordenadas sem rede, elas permanecem apenas nos campos da tela e a interface informa explicitamente que ainda não foram gravadas.
  - **Fotos/evidências:** upload sem rede é bloqueado explicitamente; fotos continuam JPEG/PNG/TIFF, até 15 MB, com validação de assinatura real. O bucket remoto `field-evidence` foi confirmado privado, com limite de 15 MB e os três MIME types; policies de Storage são restritas a authenticated e condicionadas à autorização do imóvel.
  - **RPCs e segurança:** RPCs críticos de visitas, formulário, evidências e relatório foram verificados remotamente como `SECURITY DEFINER`, `search_path` vazio, sem EXECUTE para `anon` e com EXECUTE apenas para `authenticated` como entrada da aplicação. Os avisos do advisor sobre SECURITY DEFINER são intencionais para esses RPCs e permanecem mitigados pelas checagens internas já homologadas.
  - **RLS:** `technical_visits`, formulário de campo, evidências, relatório e integrações permanecem com RLS ativa. A inspeção remota confirmou policies existentes nas tabelas principais.
  - **Performance/índices:** a migration `oe_007_007_field_homologation_indexes` (`20260903125730`) adicionou os dez índices de FKs pendentes de visitas, auditoria, formulário e revisões. O advisor de performance passou a retornar zero FKs não indexadas no escopo do Módulo 007.
  - **Integrações:** Agenda, Proposta e Frota continuam usando os links/outbox idempotentes da OE-007.006; o painel evita consulta enquanto offline e atualiza novamente após reconexão.
  - **Suíte final:** `scripts/test-field-visits-field-homologation.ts` contém 50 provas específicas das cinco frentes do Plano Mestre. O Módulo 007 totaliza **292 provas específicas** das OEs 007.001–007.007, além de **25 verificações** estruturais de acessibilidade/responsividade, auditoria de tema e texto público.
  - **Gate de produção executado:** Vercel SUCCESS no commit `4adcbc0a0b07df3ed0e192314080129de02cfed5`. O `npm run build` executa invariantes, TypeScript, `test:module-007`, Vite, geração do Service Worker e verificação de vazamentos.
  - **GitHub Actions:** o AgroCore CI continua encerrando antes de qualquer step. Como o mesmo código passou no gate Vercel, a pendência é registrada como infraestrutura externa do runner e não como falha demonstrada do Módulo 007.
  - **Evidência física:** não é declarado teste físico em aparelho real sem observação. O checklist manual e a separação entre evidência automatizada e física estão registrados em `docs/OE-007-007-HOMOLOGACAO-CAMPO.md`.
  - **Decisão objetiva:** **Módulo 007 finalizado em implementação, Supabase, RLS/Storage aplicável e gates automatizados de produção.** O único aceite não observável nesta execução é a validação física em hardware real, que permanece explicitamente não marcada em vez de ser inferida.



### MÓDULO 008: AGENDA CORPORATIVA, TAREFAS, PRAZOS E NOTIFICAÇÕES
- **Status Geral:** implementado e reconciliado até **OE-008.003 — Atribuição e Colaboração**. A revisão atual confrontou o código com o Livro-Raiz e os sete arquivos mestres fornecidos pelo usuário. public.schedule_items permanece a **única fonte autoritativa da Agenda**. OE-008.004 continua não iniciada e reservada à geração idempotente de ocorrências e regras de prazo; OE-008.005/006 permanecem reservadas às notificações internas e canais externos.
- **Regra de precedência:** o Livro-Raiz registra o estado técnico observado; a Especificação Técnica define a arquitetura-alvo; Plano e Relatórios definem backlog, limites e critérios de aceite. Divergências temporais não autorizam duplicação de entidades nem antecipação de OEs.

- **OE-008.001 — Modelo de Tarefas e Compromissos**
  - CorporateTask e CalendarAppointment compartilham organização, título, descrição, prioridade low/medium/high/urgent, estados pending/in_progress/blocked/completed/cancelled, fuso IANA, recorrência declarativa, origem, autoria, auditoria e versão otimista.
  - Tarefa possui prazo UTC opcional; compromisso exige início/fim coerentes. Fusos inexistentes e horários locais inexistentes ou ambíguos por DST são recusados.
  - A recorrência é declarativa: none/daily/weekly/monthly/yearly, intervalo, dias semanais explícitos e término opcional. A OE-008.001 guarda a regra, mas não materializa ocorrências; isso permanece na OE-008.004.
  - ScheduleSourceDomain foi restringido a technical_visit, appraisal e proposal. Registros integrados usam somente source_domain/source_id/source_version/source_event_key, sem copiar cliente, imóvel, usuário, laudo ou proposta como novo cadastro mestre.
  - O índice único schedule_items_org_source_entity_uq garante uma única projeção por organização, domínio e entidade de origem.
  - Criação e edição usam command key, fingerprint SHA-256, advisory lock, expectedVersion e replay convergente.
  - owner/company_admin/manager possuem schedule:view + schedule:manage; project_designer/capturer possuem schedule:view; finance/platform_super_admin não herdam Agenda privada.

- **OE-008.002 — Listas e Agenda**
  - Lista e Calendário consomem a mesma coleção canônica. “Minha agenda” inclui autoria, responsabilidade ou participação; “Equipe” é exclusiva de owner/company_admin/manager.
  - A ausência de viewScope agora converge para personal. project_designer e capturer não podem solicitar team pelo serviço nem enumerar item alheio por ID.
  - As policies finais de schedule_items, schedule_item_audit, schedule_item_participants e schedule_item_collaboration_revisions usam agrocore_private.can_view_schedule_item. Gestão consulta os registros permitidos da organização; project_designer/capturer somente autoria, responsabilidade ou participação.
  - Calendário desktop usa grade mensal determinística; mobile usa lista cronológica; tarefas sem prazo ficam em seção própria. Definições recorrentes não são expandidas artificialmente.
  - O botão “Equipe” só aparece para gestão autorizada. Controles preservam alvo mínimo de 44 px, foco visível, ARIA e paleta oficial.

- **OE-008.003 — Atribuição e Colaboração**
  - responsible_user_id referencia usuário canônico; schedule_item_participants guarda relações por IDs e não copia perfis ou PII. Integrantes devem estar ativos na mesma organização e em papel elegível.
  - agrocore_list_schedule_members exige schedule:manage no serviço e can_manage_schedule no backend. Projetista/captador não recebem o diretório completo apenas por possuírem leitura.
  - schedule_item_collaboration_revisions mantém snapshots append-only de responsável, participantes, versão, ator e motivo.
  - Conclusão, cancelamento e reabertura usam comandos/RPCs próprios. Gestão realiza as transições autorizadas e o responsável atual pode concluir o próprio item; participante sem responsabilidade não recebe essa prerrogativa.
  - Colaboração e transições usam expectedVersion, command key, SHA-256, advisory/row locks e recibos privados. Replay idêntico converge e reutilização divergente da chave falha.
  - Falha do diretório canônico bloqueia o editor de atribuição em modo fail-closed.

- **Reconciliação OE-008.001–003 com os documentos mestres**
  - Migrations remotas aplicadas: 20260903204000_oe_008_001_003_requirements_reconciliation.sql e 20260903205500_oe_008_001_003_reconciliation_backfill.sql.
  - O Módulo 008 consome a outbox já existente technical_visit_integration_events do Módulo 007. calendar.visit_sync_requested cria ou atualiza uma única projeção CalendarAppointment de origem technical_visit; calendar.visit_release_requested projeta a situação terminal da visita.
  - Não foi criada fila ou tabela paralela. O compromisso integrado continua em schedule_items e referencia o visitId canônico.
  - Início usa technical_visits.scheduled_for; duração, participantes e fuso vêm do evento real; responsável vem da TechnicalVisit. Evento sem duração válida não cria projeção em vez de inventar valor.
  - A sincronização usa advisory lock e source_version monotônico; eventos antigos não regridem a projeção. O backfill usa o último evento de calendário mesmo quando a visita avançou por alteração de outro domínio que não mudou a Agenda.
  - As policies SELECT finais, a constraint de source_domain, o índice único de origem e o trigger agrocore_schedule_consume_visit_calendar_event foram confirmados no Supabase.
  - Na inspeção remota havia 0 schedule_items, 0 participantes, 0 revisões e 0 eventos calendar; nenhum dado fictício foi criado para demonstração.
  - Não existem schedule_occurrences nem schedule_notifications nesta reconciliação; não foram adicionados e-mail, SMS, push ou webhook.
  - Cobertura versionada atual: 66 provas da fundação + 41 de listas/agenda + 64 de atribuição/colaboração + 41 da reconciliação = **212 provas específicas**, além de **33 verificações estruturais de acessibilidade/responsividade** e auditoria de tema.
  - O gate externo do HEAD atual não é declarado aprovado: a Vercel responde “Deployment rate limited — retry in 24 hours” e o GitHub Actions continua encerrando antes do primeiro step. Código versionado e migrations aplicadas não são confundidos com execução externa de TypeScript/build/testes.
  - **Decisão objetiva:** OE-008.001, OE-008.002 e OE-008.003 estão implementadas, reconciliadas com as fontes mestres e persistidas no Supabase no que é aplicável. OE-008.004 somente poderá iniciar após nova auditoria de entrada.

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
| `npm run test:document-security` | Executa 29 provas da OE-006.007: isolamento multiempresa, IDOR/BOLA, matriz dos sete perfis, arquivos, órfãos, rede instável/retry, concorrência, checklists, compartilhamento, exportação, RLS, migrações, Edge Function e deny-by-default |
| `npm run test:environment-contract` | Impede campos de chaves no exemplo de ambiente e dependência de secrets no AgroCore CI |
| `npm run test:documents-ui-copy` | Impede linguagem interna e códigos de ordem nas páginas públicas do Módulo 006 |
| `npm run test:documents-theme` | Audita a paleta oficial, variantes proibidas e seleção controlada de arquivos no Módulo 006 |
| `npm run test:module-006` | Gate consolidado de código do Módulo 006 até OE-006.007: 130 provas até OE-006.006 + 29 de segurança = 159 provas, além de texto público e tema. A homologação remota de Supabase permanece separada. |
| `npm run test:field-visits-foundation` | Valida a OE-007.001 com 35 provas de estados, matriz dos sete perfis, responsáveis, fontes canônicas, datas, isolamento/IDOR, concorrência, auditoria, rota e produção fechada |
| `npm run test:field-visits-preparation` | Valida a OE-007.002 com 37 provas de fusos, horários ambíguos, duração, endereço, participantes, checklist, remarcação, cancelamento, conflitos, exceções auditáveis, matriz dos sete perfis, IDOR, deny-by-default, concorrência, roteiro e isolamento |
| `npm run test:field-visits-field-form` | Valida a OE-007.003 com 51 provas de rascunho, envio, concorrência, responsabilidade, RLS, persistência e bloqueio de conclusão sem formulário |
| `npm run test:field-visits-evidence` | Valida a OE-007.004 com 50 provas de fonte canônica por imóvel, sincronização Laudo ↔ Visita ↔ Cadastro, fotos, GPS, solicitações ao captador, RBAC, RLS, Storage e produção deny-by-default |
| `npm run test:field-visits-completion` | Valida a OE-007.005 com 28 verificações de conclusão atômica, relatório versionado, snapshot canônico resiliente, pendências, concorrência, RLS/RBAC, revisão imutável, integridade de transições e bloqueio de conclusão genérica |
| `npm run test:field-visits-integrations` | Valida a OE-007.006 com 41 provas de links estáveis, outbox idempotente, RLS, isolamento, concorrência, Agenda, Propostas, Frota, preview, índices e escopo futuro |
| `npm run test:field-visits-field-homologation` | Valida a OE-007.007 com 50 provas de celular/responsividade, sete perfis, conectividade, GPS/permissões, fotos/evidências, integrações, índices e gates finais |
| `npm run test:field-visits-accessibility` | Executa 25 verificações estruturais de responsividade/acessibilidade, incluindo larguras 320/390/430/720/768/1024/1366/1440, alvos de 44 px, foco, ARIA, semântica, formulário e evidências |
| `npm run test:field-visits-theme` | Audita a identidade visual oficial do Módulo 007 e bloqueia famílias de cores não autorizadas |
| `npm run test:module-007` | Gate consolidado do Módulo 007 até OE-007.007: 35 + 37 + 51 + 50 + 28 + 41 + 50 = **292 provas específicas**, além de 25 verificações de acessibilidade/responsividade, tema e textos públicos. O gate completo foi executado com Vercel SUCCESS no commit `4adcbc0a0b07df3ed0e192314080129de02cfed5`. |
| `npm run test:schedule-foundation` | Valida a OE-008.001 com 66 provas de tarefas/compromissos, sete perfis, tenant/IDOR, origem, recorrência, UTC/DST, RLS, concorrência, idempotência, retry e persistência. |
| `npm run test:schedule-views` | Define 41 provas da OE-008.002 para visão pessoal/equipe, filtros, RBAC/tenant, calendário com fuso, lista móvel, não antecipação de ocorrências, migration e casos de erro. |
| `npm run test:schedule-accessibility` | Executa 25 verificações estruturais de responsividade/acessibilidade da Agenda, incluindo criação, recorrência semanal, escopo pessoal/equipe, calendário semântico e lista móvel. |
| `npm run test:schedule-theme` | Audita a identidade visual oficial da Agenda, incluindo as novas telas de listas/calendário, e impede famílias de cores não homologadas/códigos internos. |
| `npm run test:module-008` | Gate consolidado do Módulo 008 até OE-008.002: **66 + 41 = 107 provas específicas**, além de 25 verificações de acessibilidade/responsividade e auditoria de tema. |
| `npm run test:rebranding` | Valida a ausência absoluta de termos e referências legadas no código |
| `npm run test:sw-lifecycle` | Valida pré-cache, arquivos físicos e bloqueios de segurança do Service Worker |
| `npm run test:multi-build-update` | Valida a substituição de cache entre versões sem apagar caches de terceiros |
| `npm run build` | Gate de produção reproduzível: contrato de ambiente sem chaves + invariantes + TypeScript estrito + regressões `test:module-001` a `test:module-008` + Vite + geração de Service Worker + verificação de vazamentos. Gate integral observado com Vercel SUCCESS no commit `a1fba4beea09ad5881a387934cc2627cd51002ad`. |
| `npm run lint` | Checagem estrita de tipos TypeScript (`tsc --noEmit`) |

---

## 8. POLÍTICA DESEJADA PARA A BRANCH PRINCIPAL (`main`)

O repositório contém CI para pushes e pull requests. A existência do arquivo de workflow não comprova que regras administrativas de proteção estejam ativas no GitHub; enquanto essa configuração não for verificada pela API administrativa, o Livro‑Raiz não a declara homologada.

Configuração recomendada: pull request obrigatório, status check do workflow AgroCore CI, branch atualizada com a base, histórico linear e aplicação a administradores.

---
## 9. DIRETRIZES PARA AS PRÓXIMAS EXECUÇÕES

1. **Módulo 004 — Laudos de Avaliação:** concluído até OE-004.003; emissão final em produção continua condicionada a infraestrutura persistente real e integrações futuras explicitamente fora deste preview.
2. **Módulo 005 — Propostas de Crédito e Serviços:** concluído até OE-005.007 no escopo volátil atual; persistência real, assinatura digital, contratos, criação automática de operações downstream e integrações externas permanecem fora do escopo.
3. **Módulo 006 — Gestão Documental:** OE-006.007 permanece com 29 provas de segurança e 159 provas de código registradas. O Supabase AgroCore está conectado nesta fase, mas esta revisão da OE-007.004 não repetiu a homologação integral da infraestrutura documental nem da Edge Function `document-share`; portanto o veredito remoto do Módulo 006 não é ampliado por inferência. O GitHub Actions continua encerrando com zero `steps`.
4. **Módulo 007 — Visitas, Vistorias e Operação em Campo:** OE-007.001 a OE-007.007 estão implementadas e integradas ao gate consolidado. OE-007.003/004/005/006 e a migration de índices da OE-007.007 estão aplicadas no Supabase AgroCore; RLS, Storage privado de evidências e RPCs críticos foram reinspecionados. O código atual define 292 provas específicas das OEs 007.001–007 e 25 verificações adicionais de acessibilidade/responsividade. O Vercel aprovou o `npm run build` no commit `4adcbc0a0b07df3ed0e192314080129de02cfed5`. O AgroCore CI continua encerrando antes do primeiro step, pendência externa já isolada. O módulo está finalizado em implementação e homologação automatizada/remota; teste físico em aparelho real não é inferido e permanece no checklist `docs/OE-007-007-HOMOLOGACAO-CAMPO.md`.
5. **Módulo 008 — Agenda Corporativa, Tarefas, Prazos e Notificações:** OE-008.001 e OE-008.002 estão implementadas. O Supabase possui as três migrations da fundação e `20260903190345_oe_008_002_schedule_view_indexes`; a OE-008.002 adiciona visão pessoal/equipe, calendário e lista móvel sem fonte paralela nem antecipação de atribuição/colaboração. O código define 107 provas específicas até OE-008.002 e 25 verificações atuais de acessibilidade/responsividade. O último gate integral executado externamente continua sendo o Vercel SUCCESS da OE-008.001 em `a1fba4beea09ad5881a387934cc2627cd51002ad`; o HEAD da OE-008.002 está sem novo gate executado porque Vercel responde rate limit e GitHub Actions encerra antes dos steps. A próxima ordem arquitetural é **OE-008.003 — Atribuição e colaboração**.