# LIVRO-RAIZ OFICIAL DO PROJETO AGROCORE

> **Edição canônica atualizada em 04/09/2026**  
> **Estado técnico consolidado até:** OE-008.007 — Homologação final e encerramento do Módulo 008  
> **Branch de referência:** `main`  
> **Estado base imediatamente anterior:** `4c87d7e451eca29a572bacda56ab0d87a7db163b`  
> **Regra:** este arquivo registra implementação e evidência efetivamente observadas. Prova física dependente de provedor, usuário ou dispositivo real não é inventada.

---

## 0. GOVERNANÇA DESTA EDIÇÃO

Esta edição fecha o **Módulo 008 — Agenda corporativa, tarefas, prazos e notificações** de OE-008.001 a OE-008.007 e substitui a edição que terminava em OE-008.006.

A edição imediatamente anterior permanece preservada integralmente em:

`docs/archive/LIVRO_RAIZ_AGROCORE_PRE_OE008007_2026-09-04.md`

Históricos anteriores permanecem em:

- `docs/archive/LIVRO_RAIZ_AGROCORE_PRE_OE008006_2026-09-04.md`;
- `docs/archive/LIVRO_RAIZ_AGROCORE_PRE_OE008005_2026-09-04.md`.

### Precedência documental

1. **Livro-Raiz:** estado técnico efetivamente observado no código e, quando verificado, na infraestrutura remota.
2. **Especificação Técnica:** arquitetura-alvo e requisitos detalhados.
3. **Plano/Relatórios Mestres:** backlog, ordem de execução, critérios e limites de aceite.
4. Divergência não autoriza duplicar cadastros, tabelas, eventos, filas, gateways ou fontes de verdade.
5. Uma prova física só pode ser declarada quando executada com ambiente real; ausência de tenant/provedor/dispositivo nunca é substituída por dado fictício.

---

## 1. IDENTIDADE E PRINCÍPIOS PERMANENTES

- **Nome oficial:** AgroCore.
- **Namespace visual:** `agrocore-*`.
- **Paleta:** `#0B3D2E`, `#78C89A`, `#FFFFFF`.
- **Multi-tenant estrito:** `organization_id` é a fronteira de dados empresariais.
- **Deny-by-default:** ausência de vínculo/papel/permissão válida nega a operação.
- **RBAC + backend/RLS:** autorização visual nunca substitui autorização persistente.
- **Fonte única da verdade:** consumidores referenciam entidades canônicas por IDs estáveis.
- **Idempotência/concorrência:** versão, lock, fingerprint, receipt e lease conforme o domínio.
- **Auditoria sanitizada:** rastreabilidade sem PII excessiva.
- **Sem dados fictícios em produção.**
- **Sem secrets no cliente/repositório.**
- **PWA resiliente e cache controlado.**
- **Acessibilidade e responsividade obrigatórias.**

---

## 2. PERFIS ORGANIZACIONAIS

| Perfil | Identificador | Regra geral |
|---|---|---|
| Superadministrador | `platform_super_admin` | Governança de plataforma; não herda dados privados da organização. |
| Proprietário | `owner` | Governança integral conforme permissões. |
| Administrador | `company_admin` | Gestão administrativa/operacional. |
| Gerente | `manager` | Coordenação e gestão operacional. |
| Projetista | `project_designer` | Execução técnica autorizada. |
| Financeiro | `finance` | Domínio financeiro; sem Agenda por herança implícita. |
| Captador | `capturer` | Prospecção/atendimento e operações autorizadas. |

No Módulo 008 especificamente:

- `owner`, `company_admin`, `manager`: `schedule:view` + `schedule:manage`;
- `project_designer`, `capturer`: `schedule:view`;
- `finance`: sem `schedule:view`/`schedule:manage`;
- `platform_super_admin`: sem acesso automático à Agenda organizacional.

---

## 3. CHECKPOINT DOS MÓDULOS 000–007

| Módulo | Estado registrado |
|---|---|
| 000 — Fundação Técnica/Offline | concluído no escopo histórico |
| 001 — Autenticação/Organizações/RBAC | concluído até OE-001.006 |
| 002 — Clientes/Produtores | concluído até OE-002.003 |
| 003 — Imóveis | concluído no escopo registrado, incluindo georreferenciamento/revisões |
| 004 — Laudos | implementado até OE-004.003 no escopo registrado |
| 005 — Propostas | implementado até OE-005.007 no escopo registrado |
| 006 — Gestão Documental | implementado até OE-006.007 no código registrado |
| 007 — Visitas/Operação de Campo | implementado até OE-007.007; evidência física separada |

Regras de não duplicação continuam válidas: clientes vêm do Módulo 002; imóveis do Módulo 003; profissionais de usuários/memberships; visitas do Módulo 007; integração de visitas usa `technical_visit_integration_events`.

---

# 4. MÓDULO 008 — AGENDA CORPORATIVA, TAREFAS, PRAZOS E NOTIFICAÇÕES

## Status geral

**MÓDULO 008 CONCLUÍDO EM IMPLEMENTAÇÃO E HOMOLOGAÇÃO AUTOMATIZADA — OE-008.001 A OE-008.007.**

A conclusão de software não fabrica evidência física externa. E-mail e Push ponta a ponta exigem tenant, usuário, provedor e dispositivo reais; o procedimento está em `docs/OE-008-007-ROTEIRO-HOMOLOGACAO-OPERACIONAL.md`.

## Fontes canônicas e derivadas

- `public.schedule_items` — fonte persistente única da Agenda;
- `public.schedule_item_occurrences` — materialização derivada de recorrência;
- `public.notifications` — fonte canônica das notificações internas;
- `public.notification_preferences` — preferências internas;
- `public.notification_external_preferences` — opt-in de canais externos;
- `public.notification_escalation_policies` — política organizacional de escalonamento;
- `agrocore_private.notification_external_deliveries` — fila externa derivada;
- `agrocore_private.notification_external_attempts` — tentativas;
- `agrocore_private.notification_push_subscriptions` — assinaturas Push privadas.

Não existe segunda `schedule_items`, segunda Central, segunda fonte de visita ou notificação paralela criada pelas OEs 008.001–007.

---

## 4.1 OE-008.001 — Modelo de tarefas e compromissos

**Status: implementada.**

- tarefas/compromissos tipados;
- organização, autoria, responsável, prioridade, estado, datas e fuso;
- origem manual ou evento de domínio;
- `source_domain`, `source_id`, `source_version`, `source_event_key`;
- RLS e autorização de Agenda;
- criação/atualização com idempotência e concorrência.

---

## 4.2 OE-008.002 — Listas e Agenda

**Status: implementada.**

- visão pessoal/equipe;
- calendário desktop;
- lista móvel;
- estados vazios reais;
- filtros e autorização sem coleção paralela.

---

## 4.3 OE-008.003 — Atribuição e colaboração

**Status: implementada.**

- `responsible_user_id` canônico;
- participantes por `schedule_item_participants`;
- elegibilidade organizacional;
- conclusão, reabertura e cancelamento;
- histórico/auditoria;
- gestão de equipe limitada a perfis autorizados.

### Reconciliação 001–003 com Módulo 007

Agenda consome `technical_visit_integration_events` sem copiar a outbox de visitas. `source_version` monotônico impede regressão por evento antigo.

---

## 4.4 OE-008.004 — Prazos e recorrência

**Status: implementada e endurecida.**

- frequências `daily`, `weekly`, `monthly`, `yearly`;
- intervalo e `endsAt`;
- fuso IANA;
- DST inexistente/ambíguo tratado de forma determinística e fail-closed;
- janela máxima de materialização;
- identidade lógica por `occurrence_local_date`;
- unique `(organization_id, schedule_item_id, occurrence_local_date)`;
- replay idempotente por `result_snapshot` imutável;
- retry apenas para falhas transitórias.

Migrations remotas relevantes:

- `20260904115537 — oe_008_004_deadlines_recurrence`;
- `20260904123600 — oe_008_004_idempotency_identity_hardening`.

Cobertura registrada da OE-.004: **57 verificações**.

---

## 4.5 OE-008.005 — Central de Notificações Internas

**Status: implementada.**

Fonte canônica: `public.notifications`.

Inclui:

- `public.notification_preferences`;
- `public.notification_audit`;
- `agrocore_private.notification_command_receipts`;
- contador não lido real no banco;
- validade `available_at`/`expires_at`;
- leitura individual e em lote;
- preferências por categoria;
- Realtime;
- sincronização/reconciliação temporal;
- recipient-only e organização autorizada;
- Central única desktop/mobile;
- sem persistência empresarial em localStorage/sessionStorage/IndexedDB.

Migration remota:

`20260904151711 — oe_008_005_internal_notification_center`

Cobertura específica: **32 verificações**.

---

## 4.6 OE-008.006 — Canais externos e escalonamento

**Status: implementada no código e Supabase.**

### E-mail

- worker real com Resend;
- destinatário resolvido pelo backend a partir do usuário canônico;
- conteúdo minimizado;
- `Idempotency-Key` estável por entrega;
- 429/5xx transitório;
- rejeição permanente definitiva;
- provedor ausente = `blocked`, nunca sucesso simulado.

### Web Push

- Web Push/VAPID;
- chave privada não sai do backend;
- cliente recebe somente capacidade e VAPID pública quando configurada;
- `Notification.requestPermission()` apenas por ação explícita;
- assinatura privada;
- endpoint 404/410 revogado;
- Service Worker dedicado `/push-notifications/`.

### Escalonamento/fila

- prioridade mínima/crítica;
- atraso normal/crítico;
- `max_attempts`;
- opt-in por usuário/canal;
- `SKIP LOCKED`;
- lease token/expiração;
- backoff determinístico e `Retry-After`;
- recibos de configuração com fingerprint/snapshot;
- versão obsoleta suprimida por `superseded_notification_version`;
- auditoria sanitizada.

### Infraestrutura

- Edge Function `notification-delivery-worker` ativa;
- Edge Function `notification-channel-config` ativa com JWT;
- `pg_cron` + `pg_net` chamam worker a cada minuto;
- falha externa não bloqueia tarefa, compromisso, recorrência ou notificação interna.

Migrations remotas:

- `20260904172154 — oe_008_006_external_channels_escalation`;
- `20260904172859 — oe_008_006_delivery_version_hardening`.

Cobertura específica: **51 verificações**.

---

## 4.7 OE-008.007 — Homologação final

**Status: CONCLUÍDA em hardening remoto, homologação automatizada, documentação e gate final.**

A OE-.007 não criou nova entidade de negócio. Ela homologou o que já existia e corrigiu arestas encontradas durante a revisão final.

### Migration final

`20260904224802 — oe_008_007_final_homologation_hardening`

Arquivo:

`supabase/migrations/20260904224802_oe_008_007_final_homologation_hardening.sql`

### Hardening aplicado

1. `notifications_validity_ck` passou de `expires_at > available_at` para `expires_at >= available_at`;
2. `expire_schedule_notifications` passou a expirar em `greatest(available_at, statement_timestamp())`, eliminando a aresta anterior de aproximadamente um segundo;
3. `can_access_notifications` agora exige organização ativa, membership ativa e papel elegível;
4. `is_notification_recipient_eligible` também exige organização ativa;
5. RLS direto de `public.notifications` impõe recipient, organização autorizada, `available_at <= now`, `expires_at > now` e preferência de categoria habilitada;
6. `agrocore_mark_notification_read` só aceita notificação atualmente válida/preference-enabled.

### Fusos/DST

Homologação automatizada verifica:

- `America/Sao_Paulo`;
- `America/New_York`;
- `UTC`;
- fuso inexistente;
- horário inexistente na entrada do DST;
- horário ambíguo na saída do DST;
- horário válido adjacente;
- recorrência diária/semanal/mensal/anual e exceções.

O catálogo remoto PostgreSQL confirmou os três fusos utilizados na prova automatizada.

### Perfis/IDOR/links

A suíte final verifica os perfis positivos e negativos, guarda `/agenda`, RLS multi-tenant, recipient-only, janela de validade, categoria habilitada e recusa de rotas externas.

### Canais externos/falhas

A homologação verifica os contratos de opt-in, políticas, consentimento Push, Resend/Web Push, 429/5xx, provider-unconfigured, retry, backoff, leases, `SKIP LOCKED`, idempotência de provedor, supressão de versão obsoleta e auditoria.

### Cobertura da OE-.007

`scripts/test-schedule-final-homologation.ts`: **80 verificações finais**.

O gate integral agora executa:

1. fundação;
2. views;
3. colaboração;
4. reconciliação;
5. recorrência;
6. hardening de recorrência;
7. notificações internas;
8. canais externos;
9. homologação final OE-.007;
10. acessibilidade;
11. tema.

Mensagem de encerramento:

`MÓDULO 008 — CONCLUÍDO — OE-008.001 A OE-008.007`

---

## 5. COBERTURA CONSOLIDADA DO MÓDULO 008

| Suíte | Cobertura |
|---|---:|
| `test-schedule-foundation.ts` | 66 |
| `test-schedule-views.ts` | 41 |
| `test-schedule-collaboration.ts` | 64 |
| `test-schedule-reconciliation.ts` | 41 |
| `test-schedule-recurrence.ts` | 51 |
| `test-schedule-recurrence-hardening.ts` | 6 |
| `test-schedule-notifications.ts` | 32 |
| `test-schedule-external-notifications.ts` | 51 |
| `test-schedule-final-homologation.ts` | 80 |
| **Total específico OE-008.001–007** | **432** |
| `test-schedule-accessibility.ts` | **33 adicionais** |
| `test-schedule-theme.js` | auditoria adicional |

---

## 6. EVIDÊNCIA REMOTA DO FECHAMENTO

No Supabase foi observado após a migration final:

- migration `20260904224802` registrada;
- `notifications_validity_ck = CHECK ((expires_at >= available_at))`;
- policy `agrocore_notifications_select` com recipient, organização autorizada, disponibilidade, expiração e preferência;
- `can_access_notifications`/`is_notification_recipient_eligible` exigindo organização ativa;
- cron `agrocore-notification-delivery-worker` ativo a cada minuto;
- execuções recentes do cron com `succeeded`;
- Edge Functions de entrega/configuração ativas.

Também foi observado **zero** em todas as entidades empresariais usadas pela prova:

- organizações;
- memberships;
- usuários Auth;
- `schedule_items`;
- ocorrências;
- notificações;
- preferências internas/externas;
- políticas de escalonamento;
- entregas/tentativas;
- assinaturas Push.

Nenhum dado artificial foi criado para alterar esse estado.

---

## 7. PROVA FÍSICA DE E-MAIL/PUSH

A Especificação/Plano exige validar falhas reais de entrega, e-mail com provedor configurado e Push em navegador/dispositivo real. No ambiente observado não existe tenant, usuário ou destinatário real; portanto essa evidência **não foi fabricada**.

O procedimento está fechado e versionado em:

`docs/OE-008-007-ROTEIRO-HOMOLOGACAO-OPERACIONAL.md`

A ausência de evidência física no ambiente vazio não corresponde a código faltante. É um checkpoint de aceitação operacional a ser executado quando houver ambiente real autorizado. Nenhuma nova OE de desenvolvimento é criada por isso.

---

## 8. RELATÓRIOS DE FECHAMENTO

- `docs/OE-008-007-RELATORIO-FECHAMENTO.md`;
- `docs/OE-008-007-ROTEIRO-HOMOLOGACAO-OPERACIONAL.md`;
- `docs/MODULO-008-RELATORIO-FINAL.md`.

---

## 9. CHECKPOINT OFICIAL

| Área | Estado |
|---|---|
| Módulo 008 | **CONCLUÍDO — OE-008.001 a OE-008.007** |
| Agenda canônica | `public.schedule_items` |
| Recorrência | implementada/endurecida |
| Central interna | implementada/endurecida |
| Canais externos | implementados com fail-closed |
| Homologação final | 80 verificações + hardening remoto |
| Total específico | 432 |
| Acessibilidade | 33 verificações adicionais |
| Tema | auditoria adicional |
| Dados fictícios | nenhum criado |
| Prova física e-mail/Push | não fabricada; roteiro operacional pronto |
| Próxima fronteira | **Módulo 009 — OE-009.001 — Cadastro de veículos** |

---

## 10. PRÓXIMA FRONTEIRA

O Módulo 008 não possui nova ordem pendente no Plano Mestre após OE-008.007.

A próxima ordem funcional passa a ser:

**OE-009.001 — Cadastro de veículos**, dentro do **Módulo 009 — Gestão de Frota e Logística Operacional**.

Módulos 009–016 continuam não declarados implementados por este Livro-Raiz até que suas respectivas ordens sejam executadas e evidenciadas.

---

**Decisão documental:** o Livro-Raiz está sincronizado com o encerramento técnico do AgroCore **até OE-008.007**, e o **Módulo 008 está concluído** no escopo de implementação e homologação automatizada previsto. A evidência física de canais externos permanece explicitamente dependente de ambiente real e não foi inventada.
