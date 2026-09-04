# LIVRO-RAIZ OFICIAL DO PROJETO AGROCORE

> **Edição canônica atualizada em 04/09/2026**  
> **Estado técnico consolidado até:** OE-008.007 — Homologação final e fechamento do Módulo 008  
> **Branch de referência:** `main`  
> **Estado base imediatamente anterior:** `4c87d7e451eca29a572bacda56ab0d87a7db163b`  
> **Regra:** este Livro-Raiz registra implementação e evidência observadas. Planejamento futuro não é promovido a funcionalidade pronta.

---

## 0. GOVERNANÇA DESTA EDIÇÃO

Esta edição fecha o **Módulo 008 — Agenda Corporativa, Tarefas, Prazos e Notificações** até a OE-008.007.

A edição imediatamente anterior foi preservada integralmente em:

`docs/archive/LIVRO_RAIZ_AGROCORE_PRE_OE008007_2026-09-04.md`

Históricos anteriores permanecem em `docs/archive/`.

### Precedência documental

1. **Livro-Raiz:** estado técnico efetivamente observado no código e, quando verificado, na infraestrutura remota.
2. **Especificação Técnica:** arquitetura-alvo e requisitos.
3. **Plano/Relatórios Mestres:** backlog, ordem de execução e critérios de aceite.
4. Divergências não autorizam duplicação de cadastros, tabelas, eventos, filas ou fontes de verdade.
5. Nenhuma OE ou módulo posterior é considerado implementado por inferência.

---

## 1. IDENTIDADE E PRINCÍPIOS PERMANENTES

- **Nome oficial:** AgroCore
- **Namespace visual:** `agrocore-*`
- **Paleta:** `#0B3D2E`, `#78C89A`, `#FFFFFF`
- **Multi-tenant:** `organization_id` é fronteira obrigatória.
- **Deny-by-default:** ausência de vínculo/papel/permissão válida nega acesso.
- **RBAC + RLS/backend:** controle visual nunca substitui autorização de serviço/banco.
- **Fonte única da verdade:** módulos consumidores referenciam entidades canônicas.
- **Concorrência/idempotência:** versões, locks, fingerprints, receipts e leases conforme o domínio.
- **Auditoria sanitizada:** rastreabilidade sem duplicar conteúdo sensível desnecessário.
- **Sem dados fictícios em produção:** preview e homologação estrutural não inventam persistência.
- **Sem secrets no cliente:** credenciais externas pertencem ao backend/ambiente seguro.
- **Acessibilidade/responsividade:** teclado, ARIA, foco e uso desktop/tablet/mobile.

---

## 2. PERFIS ORGANIZACIONAIS

| Perfil | Identificador | Regra geral |
|---|---|---|
| Superadministrador | `platform_super_admin` | Governança da plataforma; não herda dados privados de organizações. |
| Proprietário | `owner` | Governança integral da organização. |
| Administrador | `company_admin` | Gestão administrativa e operacional. |
| Gerente | `manager` | Coordenação e gestão operacional. |
| Projetista | `project_designer` | Execução técnica autorizada. |
| Financeiro | `finance` | Domínio financeiro autorizado; sem Agenda por herança. |
| Captador | `capturer` | Prospecção/atendimento e operações autorizadas. |

---

## 3. CHECKPOINT DOS MÓDULOS 000–007

### Módulo 000 — Fundação Técnica e Offline-First
**Status:** concluído no escopo registrado.

### Módulo 001 — Autenticação, Organizações e RBAC
**Status:** concluído até OE-001.006 no escopo registrado.

### Módulo 002 — Clientes e Produtores
**Status:** concluído até OE-002.003 no escopo registrado.

### Módulo 003 — Imóveis Rurais e Urbanos
**Status:** concluído no escopo registrado, incluindo georreferenciamento e revisões.

### Módulo 004 — Laudos de Avaliação
**Status:** implementado até OE-004.003 no escopo registrado.

### Módulo 005 — Propostas
**Status:** implementado até OE-005.007 no escopo registrado.

### Módulo 006 — Gestão Documental
**Status:** implementado até OE-006.007 no código registrado.

### Módulo 007 — Visitas e Operação de Campo
**Status:** implementado até OE-007.007 no escopo registrado.

Regra de integração: `technical_visit_integration_events` permanece a fonte do evento do Módulo 007; Agenda apenas consome esse evento idempotentemente.

---

# 4. MÓDULO 008 — AGENDA CORPORATIVA, TAREFAS, PRAZOS E NOTIFICAÇÕES

## Status geral

**CONCLUÍDO ATÉ OE-008.007.**

Não há OE pendente dentro do Módulo 008 nesta edição.

### Fontes canônicas

- Agenda: `public.schedule_items`.
- Ocorrências: `public.schedule_item_occurrences`, estrutura derivada.
- Notificações internas: `public.notifications`.
- Preferências internas: `public.notification_preferences`.
- Entregas externas: fila derivada de `public.notifications`; não é uma segunda Central.

---

## 4.1 OE-008.001 — Modelo de tarefas e compromissos

**Status:** concluída.

Inclui tarefas/compromissos tipados, organização, autoria, responsável, prioridade, estado, datas, fuso, origem integrada e comandos com contratos de concorrência/idempotência.

---

## 4.2 OE-008.002 — Listas e Agenda

**Status:** concluída.

Inclui visão pessoal/equipe, calendário, lista móvel, filtros, estados vazios reais e autorização sem coleção paralela.

---

## 4.3 OE-008.003 — Atribuição e colaboração

**Status:** concluída.

Inclui responsável canônico, participantes, elegibilidade organizacional, conclusão, cancelamento, reabertura, histórico e diretório restrito à gestão autorizada.

A reconciliação 001–003 preserva `technical_visit_integration_events` e impede regressão por versão antiga de integração.

---

## 4.4 OE-008.004 — Prazos e recorrência

**Status:** concluída e endurecida.

Principais contratos:

- frequências diária, semanal, mensal e anual;
- fuso IANA;
- DST determinístico;
- rejeição de horário inexistente/ambíguo;
- janela finita de materialização;
- identidade lógica única por item/data local;
- `source_item_version`;
- replay idempotente com snapshot imutável;
- retry apenas para falha transitória.

Migrations remotas registradas:

- `20260904115537 — oe_008_004_deadlines_recurrence`;
- `20260904123600 — oe_008_004_idempotency_identity_hardening`.

Cobertura específica: **57 verificações**.

---

## 4.5 OE-008.005 — Central de Notificações Internas

**Status:** concluída.

Fonte canônica: `public.notifications`.

Contratos:

- contador não lido calculado no banco;
- `available_at`/`expires_at`;
- leitura individual/em lote;
- preferências por categoria;
- Realtime;
- sincronização temporal;
- RLS recipient-only;
- idempotência/concorrência de preferência;
- Central única desktop/mobile;
- nenhuma persistência empresarial em storage local.

Migration remota:

`20260904151711 — oe_008_005_internal_notification_center`

Cobertura específica: **32 verificações**.

---

## 4.6 OE-008.006 — Canais externos e escalonamento

**Status:** concluída.

Canais implementados:

- e-mail via adaptador Resend;
- Web Push/VAPID.

Regras:

- opt-in individual (`enabled=false` por padrão);
- política organizacional também desabilitada por padrão;
- criticidade e atraso;
- fila transacional privada;
- attempts, lease, `SKIP LOCKED`, retry e backoff;
- idempotência por entrega;
- hardening por `notification_version`;
- assinatura Push privada;
- chave VAPID privada nunca exposta ao cliente;
- ausência de provedor = `blocked`, nunca sucesso falso;
- falha externa não bloqueia Agenda/Central.

Migrations remotas:

- `20260904172154 — oe_008_006_external_channels_escalation`;
- `20260904172859 — oe_008_006_delivery_version_hardening`.

Edge Functions observadas ACTIVE:

- `notification-delivery-worker`;
- `notification-channel-config`.

Scheduler observado:

- `agrocore-notification-delivery-worker`;
- `* * * * *`;
- execuções recentes `succeeded`.

Cobertura específica: **51 verificações**.

---

## 4.7 OE-008.007 — Homologação final

**Status:** CONCLUÍDA.

### Hardening remoto final

Migration:

`20260904224802 — oe_008_007_final_homologation_hardening`

Alterações:

1. a validade de `public.notifications` permite `expires_at = available_at` exclusivamente para invalidação imediata;
2. `expire_schedule_notifications` não mantém mais a margem residual de um segundo;
3. acesso/eligibilidade de notificações exigem organização ativa;
4. SELECT direto em `public.notifications` passa a aplicar recipient-only, organização ativa, disponibilidade, expiração e preferência interna.

### Homologação de fuso/DST

Validados no contrato automatizado:

- `America/Sao_Paulo`;
- `America/New_York`;
- horário inexistente em avanço de DST;
- horário ambíguo em retorno de DST;
- timezone inválido;
- recorrência mensal em dia 31 sem inventar datas.

O banco remoto confirmou os fusos `America/Sao_Paulo`, `America/New_York` e `UTC`.

### RBAC final

- `owner`, `company_admin`, `manager`: `schedule:view` + `schedule:manage`;
- `project_designer`, `capturer`: `schedule:view`, sem `schedule:manage`;
- `finance`: sem Agenda por padrão;
- `platform_super_admin`: sem herança automática de dados privados da organização.

### Isolamento e rotas

- `/agenda` exige `schedule:view`;
- notificações diretas são recipient-only e válidas;
- rotas externas são rejeitadas pela Central e pelo Service Worker de Push;
- fila externa permanece vinculada à versão corrente da notificação.

### Dados e evidência física

Nenhum dado fictício foi criado.

No fechamento remoto foram observados `0` registros em organizações, memberships, usuários, itens de Agenda, ocorrências, notificações, preferências, políticas, entregas, tentativas e assinaturas Push.

Por inexistir usuário/destinatário real, uma entrega física de e-mail/Push **não foi simulada nem inventada**. Scheduler, Edge Functions, contratos, fila, autorização e persistência foram homologados com a infraestrutura disponível.

### Suíte final

`scripts/test-schedule-final-homologation.ts`: **45 verificações**.

---

# 5. COBERTURA CONSOLIDADA DO MÓDULO 008

| Suíte | Verificações |
|---|---:|
| `test-schedule-foundation.ts` | 66 |
| `test-schedule-views.ts` | 41 |
| `test-schedule-collaboration.ts` | 64 |
| `test-schedule-reconciliation.ts` | 41 |
| `test-schedule-recurrence.ts` | 51 |
| `test-schedule-recurrence-hardening.ts` | 6 |
| `test-schedule-notifications.ts` | 32 |
| `test-schedule-external-notifications.ts` | 51 |
| `test-schedule-final-homologation.ts` | 45 |
| **Total específico** | **397** |
| `test-schedule-accessibility.ts` | 33 adicionais |
| `test-schedule-theme.js` | auditoria visual/tema |

O `scripts/test-module-008.js` executa todas as suítes acima antes de declarar o módulo concluído.

---

# 6. EVIDÊNCIA REMOTA DO FECHAMENTO

Observado no Supabase AgroCore:

- migration final `20260904224802`;
- policy de `notifications` contendo recipient-only + disponibilidade + expiração + preferência;
- `can_access_notifications` e `is_notification_recipient_eligible` exigindo organização ativa;
- scheduler `agrocore-notification-delivery-worker` ativo;
- execuções recentes de cron `succeeded`;
- duas Edge Functions de notificações externas ACTIVE;
- nenhuma entidade empresarial fictícia criada.

---

# 7. RELATÓRIOS DE FECHAMENTO

- `docs/OE-008-007-RELATORIO-FECHAMENTO.md`
- `docs/MODULO-008-RELATORIO-FECHAMENTO.md`

---

# 8. CHECKPOINT OFICIAL

| Área | Estado |
|---|---|
| Módulos 000–003 | concluídos conforme histórico registrado |
| Módulo 004 | implementado até OE-004.003 no escopo registrado |
| Módulo 005 | implementado até OE-005.007 |
| Módulo 006 | implementado até OE-006.007 no código registrado |
| Módulo 007 | implementado até OE-007.007 |
| Módulo 008 | **CONCLUÍDO até OE-008.007** |
| OE-008.007 | **concluída e migration remota aplicada** |
| Dados fictícios na homologação final | **nenhum** |
| Módulos 009–016 | não declarados implementados por esta edição |

---

## 9. PRÓXIMA FRONTEIRA

O Módulo 008 está encerrado. A próxima execução deve seguir o **Módulo 009 conforme o Plano Mestre vigente**, sem reabrir Agenda/notificações nem duplicar suas fontes canônicas.

---

**Decisão documental final:** o Livro-Raiz está sincronizado com o estado observado do AgroCore **até OE-008.007**, e o **Módulo 008 está concluído**.
