# LIVRO-RAIZ OFICIAL DO PROJETO AGROCORE

> **Edição canônica atualizada em 04/09/2026**  
> **Estado técnico consolidado até:** OE-008.005 — Central de Notificações Internas  
> **Branch de referência:** `main`  
> **Commit funcional imediatamente anterior a esta atualização documental:** `f61dfa12066596d90afa148af1a47a7508fe87fe`  
> **Regra:** este arquivo registra o estado técnico observado e não transforma pendência de infraestrutura, documentação-alvo ou planejamento futuro em funcionalidade implementada.

---

## 0. GOVERNANÇA DESTA EDIÇÃO

Esta edição substitui a versão do Livro-Raiz que ainda registrava o Módulo 008 somente até OE-008.003 em sua seção principal, somente até OE-008.003 no gate consolidado e, de forma ainda mais desatualizada, somente até OE-008.002 nas diretrizes finais.

Para não perder nenhum detalhe histórico, a edição anterior foi preservada integralmente e sem alteração em:

`docs/archive/LIVRO_RAIZ_AGROCORE_PRE_OE008005_2026-09-04.md`

A partir desta edição, o arquivo raiz volta a ser a referência operacional corrente. O arquivo arquivado existe apenas para rastreabilidade histórica.

### Regra de precedência documental

1. **Livro-Raiz:** estado técnico efetivamente observado no repositório e, quando verificado, na infraestrutura remota.
2. **Especificação Técnica:** arquitetura-alvo.
3. **Plano Mestre e Relatórios Consolidados:** backlog, ordem de execução, critérios e limites de aceite.
4. Divergência entre documentos não autoriza duplicar cadastros, tabelas, eventos, gateways, arquivos ou fontes de verdade.
5. Nenhuma Ordem de Execução posterior é considerada implementada por compatibilidade arquitetural, preparação de interface ou simples previsão documental.

---

## 1. IDENTIDADE OFICIAL DO PROJETO

- **Nome Oficial:** AgroCore
- **Identificador de pacote / metadata:** AgroCore
- **Namespace visual:** `agrocore-*`
- **Prefixos de sessão/cache:** `agrocore:*` / `agrocore-cache-*`
- **Versão do pacote:** `0.0.0` — desenvolvimento arquitetural contínuo
- **Rebranding global:** OE-GLOBAL.001 concluída e homologada no escopo registrado pelo projeto.

---

## 2. MISSÃO E PRINCÍPIOS ARQUITETURAIS

O **AgroCore** é uma plataforma corporativa e operacional para engenharia agronômica, gestão de crédito rural, propostas, laudos, documentos, visitas técnicas, agenda e governança do agronegócio.

### Princípios permanentes

- **Multi-tenant estrito:** `organization_id` é fronteira obrigatória de dados empresariais.
- **Deny-by-default:** ausência de papel, vínculo ou permissão válida nega a operação.
- **RBAC de menor privilégio:** acesso de interface nunca substitui validação de backend/RLS.
- **Fonte única da verdade:** módulos consumidores referenciam entidades canônicas por IDs estáveis em vez de copiá-las.
- **Concorrência explícita:** operações críticas usam versão otimista, locks e/ou idempotência conforme o domínio.
- **Auditoria:** transições críticas devem ser rastreáveis e sanitizadas.
- **Sem dados falsos em produção:** preview não pode ser promovido a persistência produtiva.
- **Sem secrets no código:** chaves públicas de ambiente pertencem ao ambiente de hospedagem; secrets não são solicitados para cumprir fluxo normal do sistema.
- **PWA e operação resiliente:** Service Worker, cache controlado e tratamento explícito de conectividade sem mascarar persistência inexistente.
- **Acessibilidade e responsividade:** desktop, tablet e mobile, com foco visível, semântica, ARIA e alvos adequados de toque.

---

## 3. IDENTIDADE VISUAL

A identidade visual é centralizada nos componentes de marca do AgroCore.

- **Verde-escuro oficial:** `#0B3D2E`
- **Verde-claro oficial:** `#78C89A`
- **Branco:** `#FFFFFF`
- Transparências derivadas são permitidas quando mantêm contraste e coerência.
- Módulos com auditorias próprias de tema não devem reintroduzir famílias de cores não homologadas nem variantes `dark:*` fora das exceções expressamente controladas.

---

## 4. MATRIZ DOS 7 PERFIS DE ACESSO

| Perfil | Identificador | Escopo | Regra geral |
|---|---|---|---|
| Superadministrador | `platform_super_admin` | Plataforma | Governança global de plataforma; não recebe acesso automático a dados privados das organizações. |
| Proprietário | `owner` | Organização | Governança integral da organização conforme permissões do domínio. |
| Administrador | `company_admin` | Organização | Gestão operacional e administrativa. |
| Gerente | `manager` | Organização | Coordenação operacional, revisão e gestão conforme domínio. |
| Projetista | `project_designer` | Organização | Execução técnica, projetos, laudos e atividades autorizadas. |
| Financeiro | `finance` | Organização | Escopo financeiro e consultas expressamente concedidas. |
| Captador | `capturer` | Organização | Prospecção, atendimento inicial e operações relacionadas aos próprios vínculos. |

A presença do perfil não concede acesso fora da matriz efetiva de permissões do recurso.

---

## 5. REGRAS DE FONTE CANÔNICA E NÃO DUPLICAÇÃO

### 5.1 Clientes e produtores

O Módulo 002 é a fonte canônica para clientes/produtores. Laudos, propostas, documentos, visitas e agenda devem referenciar o cliente existente, sem segundo cadastro do mesmo cliente dentro do módulo consumidor.

### 5.2 Imóveis

O Módulo 003 é a fonte canônica para imóveis rurais e urbanos. Dados territoriais e cadastrais não devem ser copiados como um segundo imóvel em módulos de laudo, proposta, visita ou frota.

### 5.3 Profissionais e usuários

Responsáveis técnicos, responsáveis por agenda e participantes devem usar o usuário/membro organizacional canônico. Não criar cadastro duplicado de profissional apenas para atender um módulo consumidor.

### 5.4 Visitas técnicas

O Módulo 007 mantém a visita técnica como fonte autoritativa. A integração com Agenda usa a outbox `technical_visit_integration_events` e vínculos estáveis; Agenda não cria uma segunda entidade mestre de visita.

### 5.5 Agenda

`public.schedule_items` é a **fonte persistente autoritativa da Agenda corporativa**.

`public.schedule_item_occurrences` é uma materialização derivada de recorrência/prazo e não uma segunda agenda.

### 5.6 Notificações internas

`public.notifications` é a fonte canônica genérica de notificações **in-app** criada na OE-008.005.

Não existe fonte paralela `schedule_notifications`.

Preferências ficam em `public.notification_preferences` e auditoria em `public.notification_audit`.

### 5.7 Canais externos

E-mail, SMS, push externo, filas de entrega, provedores externos e escalonamento pertencem à **OE-008.006** e não são declarados implementados nesta edição.

---

## 6. ESTADO DOS MÓDULOS

### MÓDULO 000 — FUNDAÇÃO TÉCNICA E OFFLINE-FIRST

**Status:** concluído no escopo registrado historicamente.

Principais fundamentos: Vite, TypeScript estrito, PWA/Service Worker, ciclo de cache, invariantes de release e barreira de vazamentos.

### MÓDULO 001 — AUTENTICAÇÃO, SESSÃO, ORGANIZAÇÕES E AUTORIZAÇÃO

**Status:** OE-001.001 a OE-001.006 concluídas no escopo registrado.

Inclui autenticação, sessão, contexto organizacional, catálogo/matriz de autorização e guardas de rota.

### MÓDULO 002 — CLIENTES E PRODUTORES RURAIS

**Status:** OE-002.001 a OE-002.003 implementadas e homologadas no escopo do módulo.

Inclui fundação, cadastro/edição PF-PJ e busca/filtros/ordenação/paginação.

### MÓDULO 003 — IMÓVEIS RURAIS E URBANOS

**Status:** fundação, cadastro completo, revisões de responsividade/tema e georreferenciamento registrados como concluídos no Livro-Raiz histórico.

O módulo permanece fonte canônica de imóvel para os módulos consumidores.

### MÓDULO 004 — LAUDOS DE AVALIAÇÃO

**Status registrado:** concluído até OE-004.003 no escopo atual.

Regras permanentes preservadas:

- solicitação operacional e processo técnico são conceitos distintos;
- captador solicita/acompanha, mas não edita conteúdo técnico;
- projetista atua tecnicamente conforme atribuição/permissão;
- cliente, imóvel e profissional são referenciados das fontes canônicas;
- a emissão produtiva definitiva continua dependente das infraestruturas e integrações reais previstas, não de preview.

A UI independente de notificações de Laudos foi desativada na OE-008.005 para evitar duas centrais visuais concorrentes. Os contratos legados do domínio foram preservados até integração canônica real com a Central de Notificações.

### MÓDULO 005 — PROPOSTAS DE CRÉDITO E SERVIÇOS

**Status registrado:** OE-005.001 a OE-005.007 implementadas no escopo atual do módulo.

O Livro-Raiz preserva a dívida técnica já conhecida: não inferir persistência integral de propostas no Supabase onde o domínio ainda opera por estrutura volátil/preview. Integrações downstream devem consumir referências estáveis e não criar espelhos falsos.

### MÓDULO 006 — GESTÃO DOCUMENTAL E ANEXOS TÉCNICOS

**Status registrado:** OE-006.001 a OE-006.007 implementadas no gate de código; migrations persistentes foram trabalhadas no Supabase em etapas posteriores.

A revisão atual do Módulo 008 **não reexecuta nem amplia por inferência** a homologação remota integral de Storage, RLS e da Edge Function `document-share`. Qualquer afirmação de fechamento remoto do Módulo 006 deve vir de nova inspeção específica do módulo.

### MÓDULO 007 — VISITAS, VISTORIAS E OPERAÇÃO EM CAMPO

**Status:** OE-007.001 a OE-007.007 implementadas; persistência e integrações críticas foram aplicadas no Supabase no fechamento do módulo.

O Módulo 007 mantém:

- `technical_visits` como fonte autoritativa de visita;
- `technical_visit_integration_links` como vínculo estável por domínio;
- `technical_visit_integration_events` como outbox append-only;
- Agenda, Propostas e Frota como consumidores/referenciadores, sem recriar a visita.

O teste físico em aparelho celular real continua separado da homologação automatizada e não é declarado por inferência.

---

## 6.8 MÓDULO 008 — AGENDA CORPORATIVA, TAREFAS, PRAZOS E NOTIFICAÇÕES

### Status Geral

**IMPLEMENTADO ATÉ OE-008.005.**

O estado anterior do Livro-Raiz estava defasado:

- seção principal: encerrava em OE-008.003;
- tabela do gate: encerrava em OE-008.003;
- diretrizes finais: ainda declaravam apenas OE-008.001 e OE-008.002 e apontavam OE-008.003 como próxima ordem.

Esse descompasso está corrigido nesta edição.

A próxima fronteira funcional é **OE-008.006 — canais externos de notificação**, que permanece **não implementada**.

### OE-008.001 — Modelo de Tarefas e Compromissos

**Status:** implementada.

- `public.schedule_items` é a fonte persistente única da Agenda.
- Tarefas e compromissos compartilham o agregado canônico e são diferenciados por tipo/contrato.
- Organização, origem, autoria, prioridade, situação, prazo/horário, fuso e versão são tratados explicitamente.
- Origem integrada usa referências estáveis (`source_domain`, `source_id`, `source_version`, `source_event_key`) em vez de duplicar entidades de módulos de origem.
- Criação e edição usam idempotência, fingerprint e controle de concorrência conforme a migration/serviço vigente.
- A recorrência é declarada no item, mas a materialização pertence à OE-008.004.

### OE-008.002 — Listas e Agenda

**Status:** implementada.

- Lista e calendário leem a coleção canônica.
- Visão pessoal inclui itens em que o usuário é autor, responsável ou participante conforme autorização.
- Visão de equipe é restrita à gestão autorizada.
- Calendário desktop e experiência mobile não criam coleções alternativas.
- Definições recorrentes não são fabricadas como ocorrências antes da camada de materialização.

### OE-008.003 — Atribuição e Colaboração

**Status:** implementada.

- `responsible_user_id` referencia usuário canônico.
- `schedule_item_participants` guarda relações por IDs, sem cópia de perfil ou PII.
- Integrantes precisam ser elegíveis e ativos na mesma organização.
- Diretório de membros para atribuição é restrito à gestão autorizada.
- Revisões/snapshots de colaboração são preservados.
- Conclusão, cancelamento e reabertura usam comandos explícitos.
- Operações críticas usam `expectedVersion`, idempotência e locks conforme a implementação vigente.

### Reconciliação OE-008.001–003 com o Módulo 007

**Status:** implementada.

- Agenda consome `technical_visit_integration_events`.
- `calendar.visit_sync_requested` cria/atualiza uma única projeção de compromisso para a visita.
- `calendar.visit_release_requested` projeta situação terminal/liberação.
- `source_version` monotônico impede regressão por evento antigo.
- `public.schedule_items` continua sendo a única agenda autoritativa; a outbox de visitas continua pertencendo ao Módulo 007.

Migrations de reconciliação registradas historicamente:

- `20260903204000_oe_008_001_003_requirements_reconciliation.sql`
- `20260903205500_oe_008_001_003_reconciliation_backfill.sql`

### OE-008.004 — Regras de Prazo e Recorrência

**Status:** implementada e endurecida.

#### Estruturas derivadas

- `public.schedule_item_occurrences`
- `public.schedule_item_occurrence_audit`
- recibos privados de comandos de ocorrência

Essas estruturas **não substituem `schedule_items`**. A ocorrência é uma projeção materializada da definição recorrente/prazo do item.

#### Motor de recorrência

- frequências diária, semanal, mensal e anual;
- intervalos maiores que um;
- término configurado;
- tarefas baseadas em `dueAt`;
- compromissos baseados em `startsAt`/`endsAt` com preservação de duração;
- fuso IANA;
- tratamento determinístico de horários locais inexistentes/ambíguos por DST;
- janela finita de materialização.

#### Hardening

A migration de hardening adicionou identidade lógica de ocorrência por data local:

`(organization_id, schedule_item_id, occurrence_local_date)`

Isso impede duplicidade semântica da mesma ocorrência quando apenas o horário é alterado, inclusive preservando ocorrência terminal histórica.

Recibos idempotentes guardam `result_snapshot` imutável para replay do resultado original, mesmo que transições posteriores tenham alterado o estado atual.

O gateway remoto passou a repetir apenas falhas transitórias na materialização, e a interface mantém uma chave idempotente estável durante as tentativas da mesma ação.

#### Migrations

- `supabase/migrations/20260904100000_oe_008_004_deadlines_recurrence.sql`
- `supabase/migrations/20260904123000_oe_008_004_idempotency_identity_hardening.sql`

A migration de hardening foi observada no Supabase também sob o registro remoto `20260904123600 — oe_008_004_idempotency_identity_hardening`.

#### Cobertura

- `scripts/test-schedule-recurrence.ts`: **51 verificações**
- `scripts/test-schedule-recurrence-hardening.ts`: **6 verificações**
- Total específico OE-008.004: **57 verificações**

### OE-008.005 — Central de Notificações Internas

**Status:** implementada no Supabase e versionada na `main`.

**Commit funcional:** `f61dfa12066596d90afa148af1a47a7508fe87fe` — `feat(schedule): implement OE-008.005 internal notification center`.

#### Escopo efetivamente implementado

- central única de notificações **in-app**;
- preferências internas por categoria;
- validade (`available_at` / `expires_at`);
- marcação individual como lida;
- marcação em lote;
- contador real de não lidas calculado no banco;
- atualização por Supabase Realtime/WebSocket;
- reconciliação temporal periódica e no retorno à aba;
- integração ao AppShell desktop e mobile;
- auditoria sanitizada;
- idempotência e concorrência para alteração de preferências;
- produção sem cache empresarial em `localStorage`, `sessionStorage` ou IndexedDB;
- ausência de envio por e-mail, SMS, push externo ou provedor de mensageria.

#### Estruturas canônicas

`public.notifications`

- uma única tabela genérica de notificações internas;
- destinatário por `recipient_user_id`;
- `organization_id` obrigatório;
- categoria, tipo, origem, chave de evento e rota interna segura;
- janela de disponibilidade e expiração;
- `read_at` e versão;
- unicidade de evento por organização/destinatário/chave.

`public.notification_preferences`

Categorias atuais:

- `schedule_assignment`
- `schedule_deadline`
- `schedule_status`

Ausência de registro de preferência equivale ao padrão habilitado; alterações reais são persistidas com controle de versão.

`public.notification_audit`

Registra ações sanitizadas de criação, leitura, leitura em lote, expiração e alteração de preferência.

`agrocore_private.notification_command_receipts`

Mantém replay idempotente de comandos de preferência com fingerprint e `result_snapshot` imutável.

#### RPCs públicas da Central

- `agrocore_notification_snapshot`
- `agrocore_get_notification_preferences`
- `agrocore_set_notification_preference`
- `agrocore_mark_notification_read`
- `agrocore_mark_all_notifications_read`
- `agrocore_sync_internal_notifications`

As entradas públicas são destinadas a `authenticated`; `anon/public` não recebem execução. Helpers de emissão/transição permanecem privados conforme os grants verificados durante a implementação.

#### Geração e validade dos avisos

A Central gera/reconcilia avisos de Agenda para:

- nova responsabilidade;
- nova participação;
- prazo de item não recorrente;
- prazo de ocorrência recorrente;
- alteração de situação para stakeholders elegíveis.

Notificações inválidas, futuras ainda indisponíveis, expiradas ou de categoria desabilitada não entram no snapshot/contador efetivo.

A política atual usa validade de 30 dias para os avisos gerados pela OE-008.005.

#### Integração com recorrência

A sincronização da Central **reutiliza** `agrocore_materialize_schedule_occurrences` da OE-008.004. Não existe segundo motor de recorrência.

#### Realtime

`public.notifications` e `public.notification_preferences` foram adicionadas à publicação `supabase_realtime` quando ainda não presentes.

O frontend assina `postgres_changes` e reconcilia novamente o snapshot real. Também existe atualização temporal em intervalo de 60 segundos e ao retornar a aba visível, cobrindo notificações que passam a ser válidas pelo relógio sem novo evento de banco.

#### Frontend

Arquitetura versionada em:

- `src/notifications/types.ts`
- `src/notifications/supabaseNotificationGateway.ts`
- `src/notifications/unavailableNotificationGateway.ts`
- `src/notifications/gatewayFactory.ts`
- `src/notifications/NotificationContext.tsx`
- `src/notifications/useNotifications.ts`
- `src/notifications/NotificationCenter.tsx`

Integrações:

- `src/App.tsx` monta `NotificationProvider` dentro do contexto autenticado/organizacional e do Módulo 008;
- `Topbar.tsx` exibe a Central no desktop;
- `MobileTopbar.tsx` exibe a Central no mobile;
- a antiga central visual específica de Laudos foi neutralizada para evitar duas UIs concorrentes, sem promover o gateway de preview de Laudos a fonte canônica.

#### RBAC

A Central só é habilitada no frontend quando o usuário autenticado possui organização ativa e `schedule:view`.

No backend, o acesso permanece limitado aos papéis organizacionais elegíveis definidos para o Módulo 008; `finance` e `platform_super_admin` não recebem acesso à Agenda privada por herança implícita.

#### Migration

`supabase/migrations/20260904151711_oe_008_005_internal_notification_center.sql`

A migration foi aplicada no Supabase AgroCore sob o registro remoto:

`20260904151711 — oe_008_005_internal_notification_center`

Na validação imediatamente posterior à aplicação foram observados `0` registros nas estruturas de notificação/preferência/auditoria/recibo e a Agenda remota continuava sem dados artificiais. Nenhum registro fictício foi criado para demonstrar a Central.

#### Cobertura

`scripts/test-schedule-notifications.ts` contém **32 verificações estruturais e de contrato**, incluindo:

- tabela genérica única;
- ausência de `schedule_notifications`;
- RLS;
- idempotência e concorrência;
- validade e contador real;
- recorrência reaproveitada;
- Realtime/WebSocket;
- retries transitórios;
- ausência de storage local empresarial;
- RBAC;
- provider global;
- acessibilidade;
- desktop/mobile;
- ausência de canais externos antecipados.

### OE-008.006 — Canais Externos

**Status:** NÃO IMPLEMENTADA nesta edição.

Escopo reservado aos documentos mestres: canais externos e mecanismos de entrega fora do AgroCore, tais como e-mail/SMS/push e respectivas políticas de entrega, somente quando houver integração real.

A OE-008.005 não deve ser reclassificada como implementação parcial da OE-008.006 apenas por possuir eventos internos, Realtime ou central in-app.

---

## 7. MATRIZ DE COBERTURA AUTOMATIZADA ATUAL DO MÓDULO 008

| Suíte | Cobertura registrada |
|---|---:|
| `scripts/test-schedule-foundation.ts` | 66 provas — OE-008.001 |
| `scripts/test-schedule-views.ts` | 41 provas — OE-008.002 |
| `scripts/test-schedule-collaboration.ts` | 64 provas — OE-008.003 |
| `scripts/test-schedule-reconciliation.ts` | 41 provas — reconciliação OE-008.001–003/Módulo 007 |
| `scripts/test-schedule-recurrence.ts` | 51 provas — OE-008.004 |
| `scripts/test-schedule-recurrence-hardening.ts` | 6 provas — hardening OE-008.004 |
| `scripts/test-schedule-notifications.ts` | 32 provas — OE-008.005 |
| **Total específico Módulo 008 até OE-008.005** | **301 provas** |
| `scripts/test-schedule-accessibility.ts` | 33 verificações estruturais adicionais |
| `scripts/test-schedule-theme.js` | auditoria de identidade visual/linguagem |

O orquestrador `scripts/test-module-008.js` executa, nesta ordem:

1. fundação;
2. listas/agenda;
3. colaboração;
4. reconciliação;
5. recorrência;
6. hardening de recorrência;
7. notificações;
8. acessibilidade;
9. tema.

A mensagem final do gate está atualizada para:

`MÓDULO 008 — GATE RECONCILIADO ATÉ OE-008.005 APROVADO`

### Scripts npm

O `package.json` mantém `test:module-008` como gate público do módulo e `test:schedule-recurrence` como execução individual registrada. As suítes de hardening e notificações são chamadas diretamente pelo orquestrador do Módulo 008; a ausência de aliases npm individuais não significa ausência de cobertura.

---

## 8. GATE DE PRODUÇÃO E EVIDÊNCIA EXTERNA

### Vercel

O commit funcional da OE-008.005:

`f61dfa12066596d90afa148af1a47a7508fe87fe`

possui status **Vercel SUCCESS** observado após a implementação.

Isto é evidência externa de que o deployment associado ao commit chegou ao estado de sucesso.

### AgroCore CI / GitHub Actions

Para o mesmo commit, o workflow **AgroCore CI** gerou o run `33892327323` e terminou com `conclusion=failure`, porém o job retornou `steps=null`.

Portanto:

- não houve evidência de execução de `npm ci`;
- não houve evidência de execução de TypeScript;
- não houve evidência de execução dos testes;
- não houve evidência de build dentro daquele runner.

Esse resultado continua classificado como falha anterior aos steps/infraestrutura do runner e **não deve ser descrito como erro comprovado do código**, nem como CI aprovado.

### Regra de evidência

- Vercel SUCCESS: pode ser registrado como sucesso do deployment observado.
- GitHub Actions sem steps: registrar como pendência/falha de infraestrutura anterior à execução.
- Supabase aplicado/verificado: registrar separadamente da execução do frontend.
- Nunca somar evidências diferentes para afirmar algo que nenhuma delas observou individualmente.

---

## 9. DIRETRIZES PARA AS PRÓXIMAS EXECUÇÕES

1. Antes de implementar qualquer OE dos Módulos 008–016, consultar este Livro-Raiz e os arquivos mestres fornecidos pelo usuário.
2. Não recriar estruturas já canônicas.
3. Não inserir dados fictícios para demonstrar telas, contadores, listas, visitas, ocorrências ou notificações.
4. Não pedir chaves/secrets ao usuário para contornar contratos de ambiente já estabelecidos.
5. Toda migration nova deve preservar `organization_id`, RLS e menor privilégio conforme o recurso.
6. Comandos críticos devem tratar idempotência e concorrência conforme a semântica do domínio.
7. Antes de avançar de OE, revisar regressões da ordem imediatamente anterior e corrigir resíduos comprovados.
8. UI não substitui autorização de backend.
9. Dados de preview não são homologação produtiva.
10. Nenhuma OE futura é declarada pronta apenas porque o código anterior deixou pontos de extensão.

### Próxima Ordem do Módulo 008

**OE-008.006 — Canais Externos de Notificação.**

Antes de iniciar:

- revisar a OE-008.005 contra as fontes mestres e o estado real do Supabase;
- preservar `public.notifications` como fonte da notificação interna;
- não criar segunda Central in-app;
- definir claramente o que é evento interno e o que é tentativa/entrega em canal externo;
- só declarar e-mail, SMS, push ou outro canal quando existir provedor/infraestrutura real e evidência observável;
- manter idempotência, validade, preferências, auditoria, isolamento por organização e minimização de dados.

### Módulos 009–016

Permanecem fora do estado implementado registrado por esta atualização, salvo implementações futuras que sejam explicitamente verificadas e incorporadas ao Livro-Raiz. O planejamento desses módulos deve continuar sendo lido nos documentos mestres, sem antecipação por inferência.

---

## 10. CHECKPOINT OFICIAL DE 04/09/2026

| Área | Estado |
|---|---|
| Módulos 000–003 | concluídos conforme histórico do projeto |
| Módulo 004 | implementado até OE-004.003 no escopo registrado; limitações produtivas preservadas |
| Módulo 005 | implementado até OE-005.007 no escopo atual; dívida de persistência integral não mascarada |
| Módulo 006 | implementado até OE-006.007 em código; homologação remota integral não ampliada por inferência nesta revisão |
| Módulo 007 | implementado até OE-007.007; integração/persistência crítica registrada; teste físico real permanece separado |
| Módulo 008 | **implementado até OE-008.005** |
| OE-008.004 | **implementada e endurecida** |
| OE-008.005 | **implementada, migration aplicada no Supabase, versionada na `main`, Vercel SUCCESS observado** |
| OE-008.006 | **não implementada** |
| Módulos 009–016 | não declarados implementados por esta edição |
| Dados fictícios na OE-008.004/.005 | nenhum criado para demonstração |
| GitHub Actions do commit OE-008.005 | falhou antes dos steps (`steps=null`), sem evidência de falha do código |
| Arquivo histórico anterior | preservado em `docs/archive/LIVRO_RAIZ_AGROCORE_PRE_OE008005_2026-09-04.md` |

---

**Decisão documental:** o Livro-Raiz está corrigido e sincronizado com o estado observado do repositório **até OE-008.005**. A próxima fronteira do Módulo 008 é **OE-008.006**, não OE-008.003, OE-008.004 ou OE-008.005.
