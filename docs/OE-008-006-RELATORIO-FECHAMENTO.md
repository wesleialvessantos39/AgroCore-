# OE-008.006 — Relatório de Fechamento

**Módulo:** 008 — Agenda Corporativa, Tarefas, Prazos e Notificações  
**Ordem:** OE-008.006 — Canais externos e escalonamento  
**Data:** 04/09/2026  
**Branch:** `main`

## 1. Objetivo

Implementar canais externos autorizados e escalonamento sem duplicar eventos nem tornar o núcleo da Agenda dependente de e-mail, Push ou qualquer provedor externo.

A implementação mantém `public.notifications` como fonte canônica da notificação interna criada na OE-008.005. As entregas externas são projeções derivadas, assíncronas e descartáveis/reprocessáveis conforme estado, preferência, validade, versão e política.

## 2. Persistência e fila transacional

A migration `20260904172154_oe_008_006_external_channels_escalation.sql` cria:

- `public.notification_external_preferences` — preferência individual, opt-in, por canal;
- `public.notification_escalation_policies` — política empresarial por categoria, criticidade, atraso, canais e número máximo de tentativas;
- `agrocore_private.notification_push_subscriptions` — assinaturas Web Push privadas;
- `agrocore_private.notification_external_deliveries` — fila transacional derivada da notificação interna;
- `agrocore_private.notification_external_attempts` — tentativas reais por entrega;
- `agrocore_private.notification_external_audit` — auditoria sanitizada;
- `agrocore_private.notification_external_command_receipts` — idempotência imutável de comandos de configuração;
- `agrocore_private.notification_worker_credentials` — credencial interna do worker armazenada apenas como hash.

A migration não recria `public.notifications` nem `public.schedule_items`.

## 3. Idempotência, concorrência e versões

A fila usa identidade por `notification_id`, `notification_version`, canal e, no Push, assinatura. Comandos de preferência e política usam `expectedVersion`, advisory locks, fingerprint e `result_snapshot` para replay idempotente.

A migration de hardening `20260904172859_oe_008_006_delivery_version_hardening.sql` invalida entregas pendentes de versões anteriores da mesma notificação com `superseded_notification_version` e impede que o worker faça claim de uma entrega cuja `notification_version` não seja a versão corrente.

Workers concorrentes usam `FOR UPDATE ... SKIP LOCKED`, lease token e expiração de lease. Falhas transitórias usam backoff determinístico e respeitam `Retry-After` dentro dos limites aceitos.

## 4. RBAC, RLS e isolamento

- `organization_id` permanece obrigatório nos recursos empresariais.
- Preferências externas são lidas apenas pelo próprio usuário elegível da organização.
- Políticas de escalonamento exigem gestão autorizada por `can_manage_schedule`.
- Claim e conclusão da fila não são executáveis por `anon` nem `authenticated`; ficam restritos ao worker/service role mais o token interno validado no banco.
- Tabelas privadas da fila, assinaturas, tentativas, auditoria, recibos e credencial não são expostas a `public`, `anon` ou `authenticated`.
- Nenhuma UI solicita secrets ou credenciais de provedor.

## 5. Canais externos

### E-mail

A Edge Function `notification-delivery-worker` possui adaptador real para Resend.

- destinatário é resolvido a partir do usuário canônico no backend;
- o e-mail não é duplicado na fila;
- templates são em português e minimizam conteúdo;
- o envio usa `Idempotency-Key` estável baseado em `delivery_id`;
- HTTP 429 e 5xx são tratados como falhas transitórias;
- rejeições permanentes são registradas sem repetir indefinidamente.

Se o provedor de e-mail não estiver configurado no ambiente seguro, a entrega fica `blocked` com `provider_unconfigured`; não existe sucesso simulado.

### Web Push

O worker usa Web Push/VAPID real. A chave privada VAPID permanece somente no ambiente da Edge Function; o cliente recebe apenas a chave pública quando o canal está efetivamente configurado.

O frontend solicita `Notification.requestPermission()` somente durante ativação explícita pelo usuário. A assinatura é persistida em schema privado e pode ser revogada. Respostas 404/410 do endpoint Push revogam a assinatura inválida.

O arquivo `public/push-sw.js` é um Service Worker dedicado ao escopo `/push-notifications/`; ele não substitui o Service Worker principal do PWA e não administra cache do AppShell.

## 6. Escalonamento

A gestão autorizada configura, por categoria:

- e-mail habilitado/desabilitado;
- Push habilitado/desabilitado;
- prioridade mínima;
- atraso padrão;
- prioridade crítica;
- atraso para críticos;
- máximo de tentativas.

A prioridade é derivada da Agenda canônica. O escalonamento apenas gera entregas quando a notificação interna ainda é válida, não lida, autorizada, com categoria habilitada, acima do limiar configurado e com opt-in do destinatário para o canal.

## 7. Independência do núcleo

A geração, claim e envio externos acontecem fora do comando original da Agenda. Falha de Resend, Push, rede, endpoint expirado ou ausência de provedor não reverte nem bloqueia tarefa, compromisso, recorrência ou notificação interna.

`pg_cron` + `pg_net` acionam `notification-delivery-worker` de forma periódica. A execução remota foi observada com scheduler ativo e resposta HTTP 200 quando a fila estava vazia.

## 8. Frontend

Arquivos adicionados:

- `src/notifications/externalTypes.ts`
- `src/notifications/externalNotificationGateway.ts`
- `src/notifications/pushSubscription.ts`
- `src/notifications/ExternalNotificationSettings.tsx`
- `public/push-sw.js`

Arquivo integrado:

- `src/notifications/NotificationCenter.tsx`

A Central única da OE-008.005 continua sendo a interface de notificações. A OE-008.006 apenas adiciona preferências externas, estado real de entrega e, para gestão, regras de escalonamento.

Também foi corrigido o ID ARIA fixo da Central: `useId()` gera um `panelId` distinto entre as instâncias desktop e mobile.

## 9. Edge Functions

- `notification-delivery-worker` — worker real de e-mail/Push, com autenticação customizada por token interno, service role no backend, retries e conclusão transacional.
- `notification-channel-config` — endpoint autenticado que informa somente capacidades de canal e a chave VAPID pública quando aplicável.

Nenhuma chave privada, service role, token interno do worker ou segredo de provedor é devolvido ao frontend.

## 10. Migrations remotas observadas

- `20260904172154 — oe_008_006_external_channels_escalation`
- `20260904172859 — oe_008_006_delivery_version_hardening`

O scheduler `agrocore-notification-delivery-worker` foi observado ativo a cada minuto. Uma execução registrada concluiu com sucesso no cron e o request associado retornou HTTP 200.

## 11. Dados de homologação

Nenhum dado empresarial fictício foi criado para demonstrar a OE-008.006. No momento da validação remota foram observados zero registros em preferências externas, políticas, assinaturas, entregas, tentativas e auditoria; a única linha interna existente nesse conjunto era a credencial técnica do worker gerada pela migration.

## 12. Cobertura automatizada

`scripts/test-schedule-external-notifications.ts` contém **51 verificações estruturais e de contrato**, cobrindo:

- ausência de fonte canônica paralela;
- opt-in de canais;
- fila e tentativas;
- idempotência e concorrência;
- RLS/RBAC/IDOR por organização e usuário;
- versionamento da fila;
- retries e leases;
- Resend real;
- Web Push/VAPID real;
- ausência de secrets no cliente;
- consentimento Push;
- Service Worker dedicado;
- estado real de entrega;
- integração com a Central única;
- correção de IDs ARIA duplicados;
- ausência de SMS/Twilio/SMTP fictício.

`scripts/test-module-008.js` passa a incluir essa suíte antes dos testes de acessibilidade e tema e atualiza o gate textual para OE-008.006.

## 13. Limites e próxima ordem

A OE-008.006 implementa a infraestrutura e os adaptadores reais, mas uma entrega externa ponta a ponta depende de configuração de provedor no ambiente seguro e de destinatário/dispositivo real. Essa prova física/de rede não deve ser inventada e pertence à homologação da **OE-008.007**, juntamente com fusos, recorrência, perfis, links, volume e falhas reais de entrega.

**Decisão de avanço:** implementação funcional e infraestrutural da OE-008.006 concluída no código/banco. Próxima fronteira do Módulo 008: **OE-008.007 — Homologação de agenda e notificações**.
