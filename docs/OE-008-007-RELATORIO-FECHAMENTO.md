# OE-008.007 — Relatório de Fechamento

**Ordem:** OE-008.007 — Homologação de agenda e notificações  
**Módulo:** 008 — Agenda corporativa, tarefas, prazos e notificações  
**Data:** 04/09/2026  
**Resultado:** implementação completa da ordem no escopo de software, hardening remoto e homologação automatizada; evidência física externa separada e não fabricada.

## 1. Escopo homologado

A OE-008.007 foi executada como fechamento, sem criar segunda Agenda, segunda Central de notificações ou segunda fila externa. Permanecem canônicas/derivadas as mesmas estruturas das OEs anteriores:

- `public.schedule_items` — fonte persistente da Agenda;
- `public.schedule_item_occurrences` — materialização derivada de recorrência;
- `public.notifications` — Central interna;
- `agrocore_private.notification_external_deliveries` — fila derivada da notificação interna;
- outboxes dos módulos de origem permanecem em seus próprios domínios.

Foram homologados por teste executável e auditoria de código: fuso IANA, DST, recorrência e exceções, perfis positivos/negativos, rota `/agenda`, RLS/IDOR, links seguros, preferências internas/externas, escalonamento, retries, leases, versão/idempotência, falhas de provedor, Push, e-mail, acessibilidade, tema e ausência de fonte paralela.

## 2. Hardening final aplicado ao Supabase

Migration aplicada remotamente:

`20260904224802 — oe_008_007_final_homologation_hardening`

Arquivo canônico versionado:

`supabase/migrations/20260904224802_oe_008_007_final_homologation_hardening.sql`

Correções efetivas:

1. `notifications_validity_ck` passa a aceitar `expires_at >= available_at`, permitindo invalidar uma notificação futura exatamente no instante de disponibilidade, sem criar janela artificial;
2. `expire_schedule_notifications` passa a usar `greatest(available_at, statement_timestamp())`, eliminando a aresta de aproximadamente um segundo da implementação anterior;
3. `can_access_notifications` exige organização ativa, membership ativa e papel elegível;
4. `is_notification_recipient_eligible` também exige organização ativa;
5. RLS de `public.notifications` passa a impor, além de recipient/tenant, `available_at <= now`, `expires_at > now` e preferência de categoria habilitada;
6. `agrocore_mark_notification_read` só aceita notificação atualmente válida e visível para o destinatário.

Nenhuma tabela empresarial nova foi criada por esse hardening.

## 3. Evidência remota observada após a migration

Foi verificado no projeto Supabase:

- migration `20260904224802` registrada;
- constraint `notifications_validity_ck` = `CHECK ((expires_at >= available_at))`;
- policy `agrocore_notifications_select` contendo recipient-only, organização autorizada, janela temporal válida e categoria habilitada;
- `can_access_notifications` e `is_notification_recipient_eligible` exigindo `organizations.status='active'`;
- fusos `America/Sao_Paulo`, `America/New_York` e `UTC` presentes no catálogo PostgreSQL;
- job `agrocore-notification-delivery-worker` ativo em `* * * * *`;
- execuções recentes do cron com status `succeeded`;
- Edge Functions `notification-delivery-worker` e `notification-channel-config` ativas.

## 4. Homologação automatizada final

Foi adicionada a suíte:

`scripts/test-schedule-final-homologation.ts`

Ela contém **80 verificações finais** organizadas nos seguintes grupos:

- fusos e mudanças de horário;
- recorrência e exceções;
- perfis positivos/negativos e guarda de rota;
- multi-tenant, IDOR e RLS;
- links, validade, preferências e leitura;
- canais externos, consentimento e escalonamento;
- falha/retry/volume/idempotência/auditoria;
- fechamento integral, acessibilidade e rastreabilidade.

O gate `scripts/test-module-008.js` executa a OE-008.007 antes das auditorias finais de acessibilidade e tema e encerra com:

`MÓDULO 008 — CONCLUÍDO — OE-008.001 A OE-008.007`

Cobertura específica consolidada do Módulo 008:

- 352 verificações específicas já existentes até OE-008.006;
- + 80 verificações OE-008.007;
- = **432 verificações específicas**;
- + **33 verificações estruturais de acessibilidade**;
- + auditoria de tema/linguagem.

## 5. Perfis e isolamento

A matriz final preserva:

- `owner`, `company_admin`, `manager`: `schedule:view` + `schedule:manage`;
- `project_designer`, `capturer`: `schedule:view`, sem gestão global;
- `finance`: sem permissão de Agenda;
- `platform_super_admin`: sem herança automática de dados organizacionais;
- `none`: nenhuma permissão.

A rota `/agenda` continua protegida por `schedule:view`, `ProtectedRoute`, `OrganizationGate` e autorização de backend/RLS.

## 6. Dados e evidência física

No **ambiente atual** da verificação final foram observados:

- 0 organizações;
- 0 memberships;
- 0 usuários Auth;
- 0 itens de Agenda;
- 0 ocorrências;
- 0 notificações;
- 0 preferências internas/externas;
- 0 políticas de escalonamento;
- 0 entregas/tentativas Push/e-mail;
- 0 assinaturas Push.

Logo, uma entrega real ponta a ponta por e-mail ou Push exigiria criar artificialmente organização, usuário, destinatário ou dispositivo. Essa evidência **não foi fabricada**. O roteiro operacional `docs/OE-008-007-ROTEIRO-HOMOLOGACAO-OPERACIONAL.md` define a prova física para quando existir tenant, usuário, provedor e dispositivo reais autorizados.

Isso é uma dependência de ambiente/evidência física, não uma lacuna de código: adaptadores, fila, policy, retry, lease, scheduler, Edge Functions e controles de segurança já estão implementados.

## 7. Segurança

A OE-008.007 não adiciona segredo ao repositório nem à UI. Não solicita API key, service role, chave VAPID privada ou token do worker ao usuário. As advertências genéricas do advisor sobre RPCs `SECURITY DEFINER` autenticadas foram avaliadas no contexto do padrão atual: essas RPCs possuem autorização explícita e são intencionalmente a fronteira do backend. Nenhuma permissão foi revogada cegamente para não quebrar os fluxos autorizados.

## 8. Decisão de fechamento

**OE-008.007 encerrada em implementação, hardening remoto, documentação e homologação automatizada.** O software do Módulo 008 está fechado de OE-008.001 a OE-008.007. A única evidência que permanece naturalmente dependente do ambiente é a prova física de e-mail/Push com provedor/destinatário/dispositivo reais; ela está explicitamente roteirizada e não altera a integridade do fechamento de software.
