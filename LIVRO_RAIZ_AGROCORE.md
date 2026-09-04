# LIVRO-RAIZ OFICIAL DO PROJETO AGROCORE

> **Edição canônica atualizada em 04/09/2026**  
> **Estado técnico consolidado até:** OE-008.006 — Canais externos e escalonamento  
> **Branch de referência:** `main`  
> **Estado base imediatamente anterior:** `83e31d9815db66c4da8042897bbf632773b74a57` — Livro-Raiz reconciliado até OE-008.005.  
> **Regra:** este arquivo registra apenas implementação/evidência observada. Planejamento, ponto de extensão ou dependência configurável não são promovidos a funcionalidade homologada por inferência.

---

## 0. GOVERNANÇA DESTA EDIÇÃO

Esta edição incorpora a **OE-008.006** ao estado corrente e substitui a edição que terminava em OE-008.005.

A edição anterior foi preservada em:

`docs/archive/LIVRO_RAIZ_AGROCORE_PRE_OE008006_2026-09-04.md`

O histórico ainda mais antigo, anterior à reconciliação da OE-008.005, permanece preservado em:

`docs/archive/LIVRO_RAIZ_AGROCORE_PRE_OE008005_2026-09-04.md`

### Precedência documental

1. **Livro-Raiz:** estado técnico efetivamente observado no código e, quando verificado, na infraestrutura remota.
2. **Especificação Técnica:** arquitetura-alvo e requisitos detalhados.
3. **Plano/Relatórios Mestres:** backlog, ordem de execução, critérios e limites de aceite.
4. Divergências não autorizam duplicação de cadastros, tabelas, eventos, gateways, filas ou fontes de verdade.
5. Nenhuma OE posterior é considerada pronta apenas porque uma OE anterior criou infraestrutura reutilizável.

---

## 1. IDENTIDADE OFICIAL

- **Nome:** AgroCore
- **Namespace visual:** `agrocore-*`
- **Prefixos de sessão/cache:** `agrocore:*` / `agrocore-cache-*`
- **Versão do pacote:** `0.0.0` — desenvolvimento arquitetural contínuo
- **Rebranding global:** OE-GLOBAL.001 concluída no escopo registrado pelo projeto.

---

## 2. PRINCÍPIOS ARQUITETURAIS PERMANENTES

- **Multi-tenant estrito:** `organization_id` é a fronteira de dados empresariais.
- **Deny-by-default:** ausência de vínculo/papel/permissão válida nega a operação.
- **RBAC + backend/RLS:** controle visual nunca substitui autorização no serviço/banco.
- **Fonte única da verdade:** módulos consumidores referenciam entidades canônicas por IDs estáveis.
- **Idempotência e concorrência:** comandos críticos usam versão, lock, fingerprint, recibo e/ou lease conforme o domínio.
- **Auditoria sanitizada:** registrar o necessário sem copiar PII ou conteúdo sensível desnecessário.
- **Sem dados fictícios em produção:** preview não é persistência produtiva.
- **Sem secrets no cliente:** credenciais externas pertencem ao ambiente seguro de backend/hospedagem.
- **PWA resiliente:** cache de assets controlado, sem cache empresarial/autenticado indevido.
- **Acessibilidade e responsividade:** desktop, tablet e mobile com teclado, ARIA, foco e alvos de toque adequados.

---

## 3. IDENTIDADE VISUAL

Paleta oficial:

- `#0B3D2E` — verde-escuro;
- `#78C89A` — verde-claro;
- `#FFFFFF` — branco.

Módulos auditados não devem reintroduzir famílias de cores não homologadas nem variantes de tema incompatíveis com a identidade oficial.

---

## 4. PERFIS ORGANIZACIONAIS

| Perfil | Identificador | Regra geral |
|---|---|---|
| Superadministrador | `platform_super_admin` | Governança de plataforma; não herda acesso a dados privados de organizações. |
| Proprietário | `owner` | Governança integral da organização conforme permissões do domínio. |
| Administrador | `company_admin` | Gestão administrativa/operacional. |
| Gerente | `manager` | Coordenação e gestão operacional. |
| Projetista | `project_designer` | Execução técnica de projetos/laudos/operações autorizadas. |
| Financeiro | `finance` | Domínio financeiro autorizado; não recebe Agenda privada por herança implícita. |
| Captador | `capturer` | Prospecção/atendimento e operações comerciais autorizadas. |

---

## 5. CHECKPOINT DOS MÓDULOS 000–007

### Módulo 000 — Fundação Técnica e Offline-First

**Status:** concluído no escopo registrado.

- Vite/TypeScript/Tailwind e PWA;
- Service Worker e cache versionado;
- barreiras contra vazamento de credenciais;
- identidade AgroCore e base responsiva/acessível.

### Módulo 001 — Autenticação, Organizações e RBAC

**Status:** concluído no escopo registrado até OE-001.006.

- autenticação/sessão;
- contexto organizacional;
- catálogo/matriz de permissões;
- autorização tipada e guards de rota;
- separação entre plataforma e organização.

### Módulo 002 — Clientes e Produtores

**Status:** concluído no escopo registrado até OE-002.003.

- domínio canônico PF/PJ;
- CPF/CNPJ e validações;
- cadastro/edição;
- busca, filtros, ordenação e paginação;
- isolamento por organização.

### Módulo 003 — Imóveis Rurais e Urbanos

**Status:** concluído no escopo registrado, incluindo revisões e georreferenciamento.

- cadastro rural/urbano;
- identificadores/registro/áreas;
- vínculos multicliente;
- coordenadas e glebas;
- topologia, conversões, áreas/perímetros e confrontações;
- auditorias de tema/responsividade.

### Módulo 004 — Laudos de Avaliação

**Status:** implementado até OE-004.003 no escopo registrado.

Regras permanentes:

- cliente/imóvel/profissional vêm das fontes canônicas;
- projetista executa conteúdo técnico;
- captador solicita/acompanha conforme autorização, sem editar conteúdo técnico;
- não duplicar cadastro de profissional;
- integração de agenda/notificações deve consumir fontes existentes.

### Módulo 005 — Propostas

**Status:** implementado até OE-005.007 no escopo registrado.

O Livro-Raiz não mascara dívidas históricas de persistência/integração que tenham sido registradas separadamente.

### Módulo 006 — Gestão Documental

**Status:** implementado até OE-006.007 no código registrado.

Inclui storage/documentos/versionamento/checklists/compliance/segurança conforme migrations e testes existentes. Homologação remota deve sempre ser registrada separadamente da simples existência do código.

### Módulo 007 — Visitas e Operação de Campo

**Status:** implementado até OE-007.007 no escopo registrado.

- visita/vistoria canônica;
- formulário de campo;
- evidências privadas;
- conclusão/relatório;
- integração idempotente com Agenda e demais domínios;
- `technical_visit_integration_events` permanece fonte do evento de integração do Módulo 007;
- teste físico em aparelho/rede real não é inventado por automação.

---

## 6. MÓDULO 008 — AGENDA CORPORATIVA, TAREFAS, PRAZOS E NOTIFICAÇÕES

### Status geral

**IMPLEMENTADO ATÉ OE-008.006.**

A próxima fronteira funcional é:

**OE-008.007 — Homologação de agenda e notificações.**

### Fonte canônica

`public.schedule_items` permanece a fonte persistente única da Agenda.

Nenhuma OE 008.004–008.006 cria uma segunda Agenda. Ocorrências, notificações internas e entregas externas são estruturas derivadas com identidade e contratos próprios.

---

### OE-008.001 — Modelo de tarefas e compromissos

**Status:** implementada.

- tarefas/compromissos tipados;
- organização, autoria, responsável, prioridade, estado, datas e fuso;
- origem integrada por `source_domain`, `source_id`, `source_version`, `source_event_key`;
- comandos com concorrência/idempotência conforme a implementação vigente.

### OE-008.002 — Listas e Agenda

**Status:** implementada.

- visão pessoal/equipe;
- calendário e lista móvel;
- estados vazios reais;
- filtros/autorizações sem coleção paralela.

### OE-008.003 — Atribuição e colaboração

**Status:** implementada.

- responsável canônico por `responsible_user_id`;
- participantes por IDs em `schedule_item_participants`;
- elegibilidade organizacional;
- conclusão, cancelamento, reabertura e histórico;
- diretório restrito à gestão autorizada.

### Reconciliação OE-008.001–003 com Módulo 007

**Status:** implementada.

Agenda consome `technical_visit_integration_events` sem copiar a outbox de visitas. `source_version` monotônico impede regressão por evento antigo.

Migrations históricas:

- `20260903204000_oe_008_001_003_requirements_reconciliation.sql`
- `20260903205500_oe_008_001_003_reconciliation_backfill.sql`

---

### OE-008.004 — Prazos e recorrência

**Status:** implementada e endurecida.

Estruturas derivadas:

- `public.schedule_item_occurrences`;
- `public.schedule_item_occurrence_audit`;
- recibos privados de comandos de ocorrência.

Regras relevantes:

- frequências diária/semanal/mensal/anual;
- fuso IANA;
- DST determinístico;
- janela finita de materialização;
- ocorrência lógica única por `(organization_id, schedule_item_id, occurrence_local_date)`;
- replay idempotente com `result_snapshot` imutável;
- retry apenas para falhas transitórias.

Migrations:

- `20260904100000_oe_008_004_deadlines_recurrence.sql`;
- `20260904123000_oe_008_004_idempotency_identity_hardening.sql`.

Registro remoto observado do hardening: `20260904123600`.

Cobertura específica registrada: **57 verificações**.

---

### OE-008.005 — Central de Notificações Internas

**Status:** implementada.

Fonte canônica interna:

`public.notifications`

Estruturas associadas:

- `public.notification_preferences`;
- `public.notification_audit`;
- `agrocore_private.notification_command_receipts`.

Principais contratos:

- contador não lido calculado no banco;
- validade por `available_at`/`expires_at`;
- leitura individual e em lote;
- preferências por categoria;
- Realtime/WebSocket;
- sincronização temporal;
- RLS e recipient-only;
- idempotência/concorrência de preferências;
- sem storage empresarial local;
- Central única no AppShell desktop/mobile.

Migration:

`20260904151711_oe_008_005_internal_notification_center.sql`

Supabase remoto observado:

`20260904151711 — oe_008_005_internal_notification_center`

Cobertura específica registrada: **32 verificações**.

---

### OE-008.006 — Canais externos e escalonamento

**Status:** IMPLEMENTADA NO CÓDIGO E NO SUPABASE.

#### Objetivo cumprido

Adicionar **e-mail e Web Push autorizados**, com escalonamento por criticidade/atraso, sem duplicar eventos e sem tornar o núcleo da Agenda dependente de provedor externo.

A OE-008.006 não cria segunda fonte de notificações. Toda entrega externa deriva de um registro de `public.notifications` e referencia sua versão.

#### Preferências e políticas

`public.notification_external_preferences`

- por organização/usuário/canal;
- canais atuais: `email` e `push`;
- `enabled=false` por padrão (opt-in);
- versão otimista.

`public.notification_escalation_policies`

- por organização/categoria;
- e-mail/Push habilitados separadamente;
- prioridade mínima;
- prioridade crítica;
- atraso padrão;
- atraso para crítico;
- máximo de tentativas;
- `email_enabled=false` e `push_enabled=false` por padrão.

Gestão de política exige `can_manage_schedule`; preferência individual exige usuário elegível na organização.

#### Fila externa privada

- `agrocore_private.notification_external_deliveries`;
- `agrocore_private.notification_external_attempts`;
- `agrocore_private.notification_push_subscriptions`;
- `agrocore_private.notification_external_audit`;
- `agrocore_private.notification_external_command_receipts`;
- `agrocore_private.notification_worker_credentials`.

A fila guarda somente referências/estado operacional necessários. E-mail do usuário não é copiado para a fila: o worker resolve o destinatário canônico no backend.

#### Idempotência e concorrência

- entregas únicas por `notification_id` + `notification_version` + canal/alvo;
- comandos de preferência/política usam `expectedVersion`;
- advisory locks;
- fingerprint;
- recibo com `result_snapshot` imutável;
- worker usa `FOR UPDATE ... SKIP LOCKED`;
- lease token + `lease_expires_at`;
- retry/backoff determinístico;
- `Retry-After` respeitado dentro do limite permitido.

#### Hardening de versão

A migration R1 invalida filas pendentes da versão anterior da mesma notificação com:

`superseded_notification_version`

O claim exige:

`delivery.notification_version = notifications.version`

Assim, reativação/alteração da notificação interna não causa envio semântico duplicado de uma versão obsoleta.

#### E-mail real

A Edge Function `notification-delivery-worker` possui adaptador para **Resend**.

- templates em português;
- conteúdo minimizado;
- rota interna segura;
- `Idempotency-Key` estável baseado no `delivery_id`;
- 429/5xx = falha transitória;
- rejeição permanente = falha definitiva;
- provedor não configurado = `blocked`, nunca sucesso simulado.

Credenciais de provedor pertencem exclusivamente ao ambiente seguro da Edge Function.

#### Web Push real

O worker usa Web Push/VAPID.

- chave privada nunca é exposta ao cliente;
- `notification-channel-config` retorna apenas capacidades e, quando válido, a chave VAPID pública;
- ativação no navegador exige ação explícita e `Notification.requestPermission()`;
- assinatura Push fica em schema privado;
- endpoint 404/410 revoga assinatura inválida;
- `public/push-sw.js` é Service Worker dedicado ao escopo `/push-notifications/`, sem substituir o SW principal do PWA.

#### Independência do núcleo

Falha de e-mail, Push, rede, endpoint, credencial/provedor ausente ou tentativa externa não reverte nem bloqueia:

- tarefa;
- compromisso;
- recorrência;
- notificação interna.

A entrega é assíncrona e derivada.

#### Scheduler

`pg_cron` + `pg_net` acionam `notification-delivery-worker` a cada minuto.

Foi observado remotamente:

- job `agrocore-notification-delivery-worker` ativo;
- execução do cron com status `succeeded`;
- request do `pg_net` com HTTP `200` quando a fila estava vazia.

#### Edge Functions remotas

- `notification-delivery-worker` — ativa; autenticação customizada por token interno + service role no backend;
- `notification-channel-config` — ativa e com JWT obrigatório.

#### Migrations remotas

- `20260904172154 — oe_008_006_external_channels_escalation`;
- `20260904172859 — oe_008_006_delivery_version_hardening`.

#### Frontend

Arquivos adicionados:

- `src/notifications/externalTypes.ts`;
- `src/notifications/externalNotificationGateway.ts`;
- `src/notifications/pushSubscription.ts`;
- `src/notifications/ExternalNotificationSettings.tsx`;
- `public/push-sw.js`.

Integração:

`src/notifications/NotificationCenter.tsx`

A Central da OE-008.005 continua única. A OE-008.006 adiciona configuração externa e status de entrega dentro dela.

Também foi corrigido o ID ARIA antes fixo da Central. Desktop e mobile passam a usar `useId()`/`panelId` distintos.

#### Cobertura

`scripts/test-schedule-external-notifications.ts`: **51 verificações estruturais e de contrato**.

O gate `scripts/test-module-008.js` passa a executar a suíte e declarar:

`MÓDULO 008 — GATE RECONCILIADO ATÉ OE-008.006 APROVADO`

#### Dados fictícios

Nenhuma organização, usuário, tarefa, notificação, preferência, política, assinatura, entrega ou tentativa fictícia foi criada para demonstrar esta OE.

Na validação remota imediatamente posterior à implementação, estruturas empresariais externas permaneciam com zero registros. A única linha técnica observada nesse conjunto era a credencial interna do worker gerada pela migration.

#### Limite de homologação

Infraestrutura/adaptadores estão implementados. Uma prova ponta a ponta de entrega real exige provedor configurado no ambiente seguro e destinatário/dispositivo real. Essa prova física/de rede pertence à OE-008.007 e não é inventada nesta ordem.

---

## 7. MATRIZ DE COBERTURA DO MÓDULO 008

| Suíte | Cobertura registrada |
|---|---:|
| `scripts/test-schedule-foundation.ts` | 66 — OE-008.001 |
| `scripts/test-schedule-views.ts` | 41 — OE-008.002 |
| `scripts/test-schedule-collaboration.ts` | 64 — OE-008.003 |
| `scripts/test-schedule-reconciliation.ts` | 41 — reconciliação 001–003/Módulo 007 |
| `scripts/test-schedule-recurrence.ts` | 51 — OE-008.004 |
| `scripts/test-schedule-recurrence-hardening.ts` | 6 — hardening OE-008.004 |
| `scripts/test-schedule-notifications.ts` | 32 — OE-008.005 |
| `scripts/test-schedule-external-notifications.ts` | 51 — OE-008.006 |
| **Total específico até OE-008.006** | **352** |
| `scripts/test-schedule-accessibility.ts` | 33 verificações estruturais adicionais |
| `scripts/test-schedule-theme.js` | auditoria visual/linguagem |

Ordem do gate:

1. fundação;
2. listas/agenda;
3. colaboração;
4. reconciliação;
5. recorrência;
6. hardening de recorrência;
7. notificações internas;
8. canais externos/escalonamento;
9. acessibilidade;
10. tema.

---

## 8. SEGURANÇA E SECRETS DA OE-008.006

A UI não solicita:

- API key de Resend;
- remetente configurado;
- chave VAPID privada;
- service role;
- token interno do worker.

O frontend recebe apenas sinalização de capacidade e, no Push, a chave pública VAPID quando a configuração do backend está completa.

O worker técnico usa token aleatório gerado na migration; apenas o hash é persistido na tabela privada. O valor utilizado pelo job não é colocado em arquivo de frontend nem em exemplo de ambiente.

---

## 9. DIRETRIZES PARA A PRÓXIMA ORDEM

### OE-008.007 — Homologação de agenda e notificações

Deve validar, sem criar fonte paralela:

- fusos e mudanças de horário;
- recorrência e exceções;
- perfis positivos/negativos;
- isolamento organizacional/IDOR;
- links/rotas autorizadas;
- preferência interna e externa;
- atraso/escalonamento;
- falhas reais de entrega;
- retries e volume;
- Push em navegador/dispositivo real;
- e-mail com provedor realmente configurado;
- acessibilidade da Agenda e Central;
- auditoria e ausência de duplicidade.

A OE-008.007 é homologação. Ela não deve recriar `schedule_items`, `notifications`, fila externa ou motores já implementados.

---

## 10. CHECKPOINT OFICIAL DE 04/09/2026

| Área | Estado |
|---|---|
| Módulos 000–003 | concluídos conforme histórico registrado |
| Módulo 004 | implementado até OE-004.003 no escopo registrado |
| Módulo 005 | implementado até OE-005.007 no escopo registrado |
| Módulo 006 | implementado até OE-006.007 no código registrado |
| Módulo 007 | implementado até OE-007.007; evidência física permanece separada |
| Módulo 008 | **implementado até OE-008.006** |
| OE-008.004 | implementada e endurecida |
| OE-008.005 | Central interna implementada |
| OE-008.006 | **canais externos/escalonamento implementados no código e Supabase** |
| OE-008.007 | **não executada nesta edição; próxima ordem** |
| Módulos 009–016 | não declarados implementados por esta edição |
| Dados fictícios OE-008.006 | nenhum criado |
| Prova real e-mail/Push | reservada à OE-008.007 quando houver ambiente/destinatário real |

---

**Decisão documental:** o Livro-Raiz está sincronizado com o estado observado do AgroCore **até OE-008.006**. A próxima fronteira do Módulo 008 é **OE-008.007 — Homologação de agenda e notificações**.
