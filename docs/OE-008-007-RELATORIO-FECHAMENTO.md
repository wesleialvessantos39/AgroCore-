# OE-008.007 — Homologação final de Agenda e Notificações

**Projeto:** AgroCore  
**Módulo:** 008 — Agenda corporativa, tarefas, prazos e notificações  
**Ordem:** OE-008.007  
**Data de fechamento técnico:** 04/09/2026  
**Estado:** CONCLUÍDA no escopo técnico automatizável e remoto disponível.

## 1. Objetivo

A OE-008.007 fecha o Módulo 008 por homologação transversal. Ela não cria uma segunda Agenda, uma segunda Central de notificações nem uma segunda fila externa. O objetivo é verificar e endurecer o que já foi implementado nas OE-008.001 a OE-008.006: fusos, recorrência, perfis, isolamento organizacional, validade, preferências, rotas, escalonamento, retries, acessibilidade, auditoria e ausência de duplicidade.

## 2. Hardening aplicado

Migration versionada e aplicada no Supabase:

`20260904224802_oe_008_007_final_homologation_hardening.sql`

Registro remoto observado:

`20260904224802 — oe_008_007_final_homologation_hardening`

O hardening corrige quatro pontos de fechamento:

1. `notifications_validity_ck` passa a aceitar `expires_at >= available_at`, permitindo invalidar uma notificação exatamente no instante de disponibilidade sem criar um intervalo artificial.
2. `agrocore_private.expire_schedule_notifications` remove a antiga margem `available_at + interval '1 second'` e usa `greatest(available_at, statement_timestamp())`.
3. `agrocore_private.can_access_notifications` e `is_notification_recipient_eligible` passam a exigir também `organizations.status = 'active'`.
4. a policy `agrocore_notifications_select` passa a aplicar, inclusive em SELECT direto autenticado, recipient-only + organização ativa + `available_at <= now` + `expires_at > now` + preferência interna habilitada.

Nenhuma tabela canônica foi recriada.

## 3. Homologação de fuso e recorrência

A suíte final verifica conversões IANA e os casos de mudança de horário:

- `America/Sao_Paulo` com conversão determinística;
- `America/New_York` após mudança de DST;
- horário inexistente no avanço de relógio rejeitado;
- horário ambíguo no retorno de relógio rejeitado;
- timezone inválido rejeitado;
- recorrência mensal não inventa dia inexistente.

No Supabase remoto também foi confirmada a disponibilidade dos fusos `America/Sao_Paulo`, `America/New_York` e `UTC`.

## 4. RBAC positivo e negativo

A homologação final reafirma a matriz vigente:

- `owner`, `company_admin`, `manager`: `schedule:view` + `schedule:manage`;
- `project_designer`, `capturer`: `schedule:view`, sem herdar `schedule:manage`;
- `finance`: não recebe Agenda por padrão;
- `platform_super_admin`: não herda dados privados da Agenda de organizações.

A rota `/agenda` continua protegida por `schedule:view`.

## 5. Isolamento organizacional e validade

A leitura direta de `public.notifications` está protegida por RLS com:

- `recipient_user_id = auth.uid()`;
- organização ativa;
- vínculo organizacional ativo;
- validade temporal corrente;
- preferência interna habilitada.

As RPCs continuam exigindo `organization_id` e ator autenticado. A fila externa continua derivada de `public.notifications` e o hardening da OE-008.006 exige igualdade de `notification_version` antes do claim.

## 6. Preferências, escalonamento e falhas externas

Foi preservado o desenho fail-closed:

- e-mail e Push externos continuam `enabled=false` por padrão;
- políticas de escalonamento continuam desabilitadas por padrão;
- ausência de provedor não é convertida em entrega bem-sucedida;
- retries permanecem assíncronos, com lease e backoff;
- a falha externa não reverte tarefa, compromisso, ocorrência ou notificação interna;
- UI não solicita API key, service role, VAPID privada ou token de worker.

## 7. Worker e infraestrutura remota

No fechamento foram observados:

- job `agrocore-notification-delivery-worker` ativo, agenda `* * * * *`;
- três execuções recentes do cron com status `succeeded`;
- Edge Function `notification-delivery-worker` ACTIVE;
- Edge Function `notification-channel-config` ACTIVE;
- migration final registrada no projeto remoto.

## 8. Dados de homologação

Nenhum dado fictício foi criado.

Contagens remotas observadas no fechamento:

- `organizations=0`;
- `organization_memberships=0`;
- `schedule_items=0`;
- `schedule_item_occurrences=0`;
- `notifications=0`;
- `notification_preferences=0`;
- `notification_external_preferences=0`;
- `notification_escalation_policies=0`;
- `notification_external_deliveries=0`;
- `notification_external_attempts=0`;
- `notification_push_subscriptions=0`;
- `auth.users=0`.

Isso impede uma prova física de e-mail/Push com destinatário real neste ambiente. Essa prova **não foi simulada nem inventada**. O que foi homologado é o contrato de software, segurança, persistência, fila, scheduler e Edge Functions disponíveis. Quando houver usuário real e provedor configurado, a validação física pode ser executada operacionalmente sem nova arquitetura ou nova OE.

## 9. Suíte final

Arquivo:

`scripts/test-schedule-final-homologation.ts`

Cobertura: **45 verificações finais** de fuso, DST, recorrência, RBAC, RLS, organização ativa, validade, preferências, derivação da fila, versionamento, rotas seguras, secrets, ARIA, documentação e integridade do gate.

O `scripts/test-module-008.js` executa todas as suítes anteriores e a homologação final antes de declarar:

`MÓDULO 008 — CONCLUÍDO`

## 10. Resultado

**OE-008.007 concluída.**

O fechamento técnico do Módulo 008 não depende de criar dados artificiais nem de fingir uma entrega externa. O módulo fica encerrado com contratos, hardenings, gates, documentação e evidências remotas preservados.
