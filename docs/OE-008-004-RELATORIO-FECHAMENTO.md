# AgroCore — Relatório de Fechamento OE-008.004

**Ordem:** OE-008.004 — Regras de prazo e recorrência  
**Módulo:** 008 — Agenda, tarefas, prazos e notificações  
**Data da auditoria:** 04/09/2026  
**Escopo deste fechamento:** reinício da auditoria a partir do estado real já versionado, revisão residual das OE-008.001, OE-008.002 e OE-008.003 e fechamento/hardening da OE-008.004 sem recriar fontes, tabelas ou fluxos já existentes.

## 1. Fontes documentais confrontadas

A auditoria foi reiniciada contra os sete artefatos fornecidos pelo usuário, antes de qualquer nova escrita:

1. `AgroCore_Plano_Relatorio_Mestre_Consolidado.pdf`;
2. `AgroCore_Documento_Tecnico_Mestre_Consolidado_000-016_2026-09-03.docx`;
3. `Especificação Técnica Completa AgroCore (1).pdf`;
4. `AgroCore_Plano_Relatorio_Mestre_Consolidado_ATUALIZADO_2026-09-02(1).docx`;
5. `LIVRO_RAIZ_AGROCORE.md`;
6. `Especificação Técnica Completa AgroCore`;
7. `Plano_Mestre_Execucao_AgroCore(2).md`.

Os documentos convergem para a mesma fronteira da OE-008.004: materializar ocorrências de prazo/recorrência de forma determinística e idempotente, preservar `organization_id`, RBAC, RLS, concorrência, fusos e a fonte canônica já existente, sem antecipar a central de notificações da OE-008.005 nem os canais externos da OE-008.006.

## 2. Regra de reinício: verificar antes de criar

Antes de implementar qualquer coisa, foram inspecionados o `main` do GitHub e o Supabase AgroCore. A OE-008.004 já possuía uma implementação substancial: migration de ocorrências, motor de recorrência, gateways preview/Supabase/fail-closed, serviço, contexto, painel de ocorrências e suíte específica.

Por isso, esta execução **não recriou** `schedule_items`, `schedule_item_participants`, `technical_visit_integration_events`, diretórios de membros, filas de calendário, entidades de visita nem uma segunda tabela mestre de Agenda. `public.schedule_items` continua sendo a fonte persistente autoritativa da Agenda e `public.schedule_item_occurrences` continua sendo somente uma projeção/materialização derivada da regra recorrente do item.

No início desta auditoria, o Supabase real possuía `0` itens de Agenda, `0` ocorrências e `0` recibos privados de ocorrência. Nenhum registro fictício foi criado para demonstrar a implementação.

## 3. Auditoria de entrada — OE-008.001 a OE-008.003

### OE-008.001 — Modelo de tarefas e compromissos

Permanece compatível com os documentos mestres:

- `public.schedule_items` é a fonte persistente única do Módulo 008;
- tarefas e compromissos são diferenciados por contrato/tipo sem duplicar entidades de negócio;
- `organization_id` é obrigatório na persistência;
- prazo/horário são armazenados como instantes UTC e acompanhados de fuso IANA quando aplicável;
- origem manual e origem por evento de domínio permanecem diferenciadas;
- comandos usam versão otimista e idempotência;
- produção não depende de dados simulados nem solicita secrets ao usuário.

### OE-008.002 — Listas e agenda

A implementação mantém as visões pessoal/equipe e calendário sobre a mesma coleção canônica. A ausência de escopo converge para a visão pessoal; a visão de equipe permanece restrita à gestão. As regras de interface não substituem autorização do backend: a fronteira organizacional e a leitura por item continuam protegidas por serviço/RLS.

### OE-008.003 — Atribuição e colaboração

A revisão confirmou a permanência de:

- responsável canônico por `user_id`;
- participantes por IDs, sem cópia paralela de perfil/PII;
- diretório de integrantes restrito à gestão autorizada;
- snapshots append-only de colaboração;
- conclusão, cancelamento e reabertura por comandos explícitos;
- `expectedVersion`, chave idempotente, SHA-256, advisory/row locks e recibos privados;
- sincronização da visita técnica por `technical_visit_integration_events`, sem criar segunda fonte de visita.

**Resultado da auditoria residual:** não foi identificado bloqueador funcional novo nas OE-008.001–003 que justificasse recriar seus contratos ou persistências. As estruturas existentes foram preservadas.

## 4. OE-008.004 — Base já existente

A implementação já versionada antes deste reinício contém:

`supabase/migrations/20260904100000_oe_008_004_deadlines_recurrence.sql`

Ela acrescenta a camada derivada de ocorrências sem substituir `schedule_items`:

- `public.schedule_item_occurrences`;
- `public.schedule_item_occurrence_audit`;
- recibos privados de comando;
- índices de consulta por organização/item/situação/instante;
- RLS de leitura por vínculo/autorização;
- escrita direta revogada para o papel autenticado;
- RPC de materialização e RPCs explícitas de conclusão, cancelamento e reabertura.

O motor cobre frequência diária, semanal, mensal e anual, intervalos maiores que um, `endsAt`, tarefas por `dueAt`, compromissos por `startsAt`/`endsAt`, preservação de duração, fuso IANA e rejeição determinística de horário local inexistente/ambíguo por DST. A janela de materialização é finita para impedir série ilimitada.

## 5. Resíduos encontrados e corrigidos nesta revisão

A inspeção aprofundada encontrou quatro pontos que justificavam hardening, sem mudar a fonte canônica.

### 5.1 Identidade lógica de ocorrência e prevenção de duplicidade semântica

A base anterior identificava a ocorrência persistida pelo instante `scheduled_at`. Isso permitia um caso residual: uma ocorrência já concluída/cancelada poderia permanecer no horário antigo e uma alteração somente do horário do item recorrente poderia materializar outra ocorrência no **mesmo dia local**, gerando duplicidade semântica.

Foi adicionada a migration:

`supabase/migrations/20260904123000_oe_008_004_idempotency_identity_hardening.sql`

Ela acrescenta `occurrence_local_date`, derivada no fuso IANA do próprio `schedule_item`, e cria a unicidade:

`(organization_id, schedule_item_id, occurrence_local_date)`.

A materialização passa a convergir por essa identidade lógica. Ocorrência `pending` pode acompanhar a nova hora da mesma data local; ocorrência terminal permanece histórica e impede que uma segunda ocorrência do mesmo item/data seja criada.

### 5.2 Replay idempotente imutável

O recibo anterior guardava a versão retornada, porém um replay consultava o estado **atual** da ocorrência. Assim, depois de `complete → reopen`, repetir exatamente a chave antiga de conclusão poderia observar a ocorrência já reaberta, em vez do resultado original daquele comando.

O hardening acrescenta `result_snapshot jsonb NOT NULL` ao recibo privado. O primeiro comando armazena o snapshot integral da resposta; o replay idêntico reconstitui e devolve esse snapshot, mesmo que comandos posteriores tenham avançado a ocorrência. Reutilização divergente da chave continua falhando.

### 5.3 Retry transitório na materialização remota

`SupabaseScheduleOccurrenceGateway.materializeOccurrences` passou a usar o mesmo mecanismo limitado de retry transitório já aplicado às mutações, recriando a chamada RPC a cada tentativa. Erros determinísticos de domínio não entram em retry.

### 5.4 Chave idempotente estável na interface

O painel de ocorrências antes gerava uma nova chave em cada envio. Em uma perda de resposta após commit remoto, o usuário poderia repetir a mesma intenção com uma chave nova. Agora a chave segura é criada uma única vez ao abrir a ação e permanece estável durante as tentativas daquela ação; fechar e iniciar outra ação cria uma nova chave.

## 6. Persistência remota verificada

A migration de hardening foi aplicada com sucesso no projeto Supabase `AgroCore-` e registrada remotamente como:

`20260904123600 — oe_008_004_idempotency_identity_hardening`.

Após a aplicação, foi confirmado no banco real:

- `public.schedule_item_occurrences.occurrence_local_date` = `date NOT NULL`;
- índice único `schedule_item_occurrences_org_item_local_date_uq` presente;
- `agrocore_private.schedule_occurrence_command_receipts.result_snapshot` = `jsonb NOT NULL`;
- domínio de Agenda continua vazio (`0` itens, `0` ocorrências, `0` recibos), portanto nenhum dado fictício foi introduzido;
- helper privado `agrocore_private.transition_schedule_occurrence` não é executável por `authenticated`, `anon` nem `public`;
- as quatro RPCs públicas da OE-008.004 são executáveis por `authenticated`, não por `anon/public`, e realizam as validações internas previstas.

Os avisos genéricos do advisor sobre RPCs `SECURITY DEFINER` autenticadas foram confrontados com os grants reais acima. Nesse desenho, as RPCs públicas são deliberadamente a entrada autenticada e o helper privilegiado permanece privado; a simples presença do aviso não foi tratada como autorização irrestrita.

## 7. Gates e cobertura versionada

A suíte original `scripts/test-schedule-recurrence.ts` contém **51 verificações específicas**. Foi adicionada `scripts/test-schedule-recurrence-hardening.ts` com **6 verificações adicionais** para:

1. impedir duplicação terminal após alteração somente do horário;
2. garantir replay do snapshot original após transição posterior;
3. validar estruturalmente a migration de identidade/snapshot;
4. exigir retry transitório na materialização remota;
5. exigir reaproveitamento da chave idempotente na mesma ação da interface;
6. impedir antecipação de notificações/canais externos.

Assim, a OE-008.004 possui **57 verificações específicas versionadas**. O `scripts/test-module-008.js` inclui fundação, listas/agenda, colaboração, reconciliação 001–003, recorrência base, hardening de recorrência, acessibilidade e tema.

Essas verificações estão **versionadas no gate**, mas a execução externa integral mais recente não é declarada aprovada, conforme a seção seguinte.

## 8. Evidência externa e limitação de homologação

O HEAD desta revisão está versionado na `main`. O **AgroCore CI** do GitHub Actions continua encerrando antes de qualquer step: o job mais recente observado apresenta `steps=[]`, `runner_id=0` e `runner_name` vazio. Portanto não houve execução observável de `npm ci`, TypeScript, testes ou build nesse runner.

Esse estado é registrado como indisponibilidade do runner/infraestrutura do workflow e **não** é transformado nem em aprovação nem em falha demonstrada do código. A persistência Supabase foi aplicada e verificada separadamente; a homologação externa integral do código permanece pendente até existir uma execução real dos steps.

## 9. Decisão objetiva

- **OE-008.001:** revisada novamente; sem novo bloqueador funcional identificado e sem recriação de fonte/tabela.
- **OE-008.002:** revisada novamente; sem novo bloqueador funcional identificado e mantendo listas/calendário sobre `schedule_items`.
- **OE-008.003:** revisada novamente; sem novo bloqueador funcional identificado e mantendo responsável/participantes canônicos.
- **OE-008.004:** **IMPLEMENTADA E ENDURECIDA**, com base já existente preservada, migration adicional aplicada no Supabase, identidade lógica anti-duplicidade, replay idempotente imutável, retry remoto, chave de UI estável, RLS/RBAC e auditoria mantidos.
- **Dados fictícios:** nenhum criado.
- **OE-008.005/OE-008.006:** não antecipadas.
- **Homologação externa integral de código:** pendente de runner que efetivamente execute os steps do AgroCore CI.

A próxima fronteira funcional prevista pelos documentos é **OE-008.005 — Central de notificações**, mas ela não faz parte desta entrega.