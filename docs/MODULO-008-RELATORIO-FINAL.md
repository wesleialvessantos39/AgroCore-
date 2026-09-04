# Módulo 008 — Relatório Final

**Agenda corporativa, tarefas, prazos e notificações**  
**Período de consolidação:** 03–04/09/2026  
**Estado:** o **Módulo 008 está concluído** em implementação e homologação automatizada de OE-008.001 a OE-008.007.

## 1. Resultado executivo

O Módulo 008 entrega uma Agenda corporativa multi-tenant com tarefas e compromissos, visão pessoal/equipe, atribuição e colaboração, recorrência com identidade local, Central de notificações internas e canais externos opcionais com escalonamento, retry e auditoria.

O fechamento da OE-008.007 não criou fonte paralela. O módulo continua apoiado em entidades canônicas e estruturas derivadas explicitamente identificadas.

## 2. Ordens concluídas

| Ordem | Resultado |
|---|---|
| OE-008.001 | modelo canônico de tarefas/compromissos, origem, RBAC e idempotência |
| OE-008.002 | listas, calendário, visão pessoal/equipe e lista móvel |
| OE-008.003 | responsável, participantes, colaboração, conclusão/reabertura/cancelamento |
| OE-008.004 | prazos, recorrência, ocorrências idempotentes e hardening de identidade |
| OE-008.005 | Central interna, preferências, validade, Realtime e contadores reais |
| OE-008.006 | e-mail/Web Push, políticas de escalonamento, fila, leases, retries e auditoria |
| OE-008.007 | homologação final, RLS/IDOR/validade, matriz de perfis, DST, links, falhas e fechamento |

## 3. Fontes de verdade

- `public.schedule_items`: fonte persistente da Agenda;
- `public.schedule_item_occurrences`: ocorrências derivadas de recorrência;
- `public.notifications`: fonte canônica de notificações internas;
- `public.notification_preferences`: preferências internas;
- `public.notification_external_preferences`: opt-in de canais externos;
- `public.notification_escalation_policies`: política organizacional;
- `agrocore_private.notification_external_deliveries`: fila de entrega derivada;
- `technical_visit_integration_events`: continua no Módulo 007 como fonte do evento de visita.

Não existe segunda `schedule_items`, segunda Central ou segunda outbox de visita criada pelo Módulo 008.

## 4. Segurança e isolamento

O fechamento preserva deny-by-default e multi-tenant estrito:

- organização ativa + membership ativa para acesso à Agenda/Notificações;
- tenant sempre validado por `organization_id`;
- recipient-only para notificação interna;
- RLS direto de `notifications` agora filtra disponibilidade, expiração e preferência;
- rota `/agenda` requer `schedule:view`;
- gestão exige `schedule:manage`;
- `finance` e `platform_super_admin` não recebem acesso organizacional à Agenda por herança implícita;
- links de notificação aceitam apenas rotas internas seguras;
- secrets de e-mail/Push permanecem fora do cliente e do repositório.

## 5. Recorrência, fuso e DST

A Agenda utiliza fuso IANA e identidade lógica por data local. A recorrência suporta diária, semanal, mensal e anual com intervalo e término. Horário local inexistente ou ambíguo em mudança de DST é rejeitado, evitando ocorrência silenciosamente deslocada ou duplicada.

A unique key de ocorrência por `(organization_id, schedule_item_id, occurrence_local_date)` protege a identidade lógica mesmo quando a regra/horário é reconciliado.

## 6. Notificações internas

A Central interna possui:

- contador não lido real;
- validade temporal;
- leitura individual e em lote;
- preferências por categoria;
- sincronização/reconciliação;
- Realtime;
- auditoria;
- UI única em desktop/mobile;
- IDs ARIA distintos por instância.

No hardening final, uma notificação invalidada pela mudança do item pode expirar exatamente em `available_at`, sem janela artificial de um segundo.

## 7. Canais externos

E-mail e Web Push são derivados da notificação interna e opt-in. A infraestrutura inclui:

- Resend no worker de e-mail;
- Web Push/VAPID;
- assinatura Push privada;
- prioridade mínima/crítica e atrasos configuráveis;
- lote concorrente com `SKIP LOCKED`;
- lease;
- retries e backoff;
- `Retry-After`;
- `max_attempts`;
- supressão de versões obsoletas;
- idempotency key de provedor;
- auditoria de entrega.

Falhas externas não revertem tarefa, compromisso, recorrência ou notificação interna.

## 8. Infraestrutura remota observada

Migrations do fechamento do Módulo 008 presentes no Supabase incluem:

- `20260904151711 — oe_008_005_internal_notification_center`;
- `20260904172154 — oe_008_006_external_channels_escalation`;
- `20260904172859 — oe_008_006_delivery_version_hardening`;
- `20260904224802 — oe_008_007_final_homologation_hardening`.

Edge Functions relevantes observadas ativas:

- `notification-delivery-worker`;
- `notification-channel-config`.

Scheduler observado:

- `agrocore-notification-delivery-worker`;
- execução a cada minuto;
- execuções recentes com `succeeded` durante a homologação remota.

## 9. Cobertura consolidada

| Suíte | Verificações |
|---|---:|
| OE-008.001 — fundação | 66 |
| OE-008.002 — views | 41 |
| OE-008.003 — colaboração | 64 |
| reconciliação 001–003/Módulo 007 | 41 |
| OE-008.004 — recorrência | 51 |
| OE-008.004 — hardening | 6 |
| OE-008.005 — notificações internas | 32 |
| OE-008.006 — canais externos | 51 |
| OE-008.007 — homologação final | 80 |
| **Total específico** | **432** |
| acessibilidade estrutural adicional | 33 |
| tema/linguagem | auditoria adicional |

O gate integral termina somente depois da homologação final, acessibilidade e tema.

## 10. Evidência física e ambiente

Na data do fechamento, o Supabase remoto não possuía organização, membership, usuário, item de Agenda ou notificação empresarial real. Portanto, uma prova ponta a ponta de e-mail ou Push não poderia ser feita sem fabricar tenant/destinatário/dispositivo.

Nenhuma evidência foi inventada. O roteiro `docs/OE-008-007-ROTEIRO-HOMOLOGACAO-OPERACIONAL.md` define a execução com usuário, provedor e dispositivo reais quando houver ambiente autorizado. Essa evidência é de aceitação física/operacional, não uma nova ordem de desenvolvimento.

## 11. Decisão

**Módulo 008 — CONCLUÍDO de OE-008.001 a OE-008.007.**

A próxima fronteira funcional do Plano Mestre passa a ser o **Módulo 009 — Gestão de Frota**, iniciando por **OE-009.001 — Cadastro de veículos**. O Módulo 009 não é declarado implementado por este fechamento.
