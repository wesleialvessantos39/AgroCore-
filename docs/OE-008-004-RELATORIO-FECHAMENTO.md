# AgroCore — Relatório de Fechamento OE-008.004

**Ordem:** OE-008.004 — Regras de prazo e recorrência  
**Módulo:** 008 — Agenda, tarefas, prazos e notificações  
**Data da auditoria:** 04/09/2026  
**Escopo deste fechamento:** revisão residual das OE-008.001, OE-008.002 e OE-008.003 + verificação da implementação da OE-008.004.

## 1. Fontes documentais confrontadas

A auditoria foi executada contra os sete artefatos fornecidos pelo usuário:

1. `AgroCore_Plano_Relatorio_Mestre_Consolidado.pdf`;
2. `AgroCore_Documento_Tecnico_Mestre_Consolidado_000-016_2026-09-03.docx`;
3. `Especificação Técnica Completa AgroCore (1).pdf`;
4. `AgroCore_Plano_Relatorio_Mestre_Consolidado_ATUALIZADO_2026-09-02(1).docx`;
5. `LIVRO_RAIZ_AGROCORE.md`;
6. `Especificação Técnica Completa AgroCore`;
7. `Plano_Mestre_Execucao_AgroCore(2).md`.

Os documentos convergem para a mesma fronteira da OE-008.004: materializar ocorrências de prazo/recorrência de forma determinística e idempotente, preservar `organization_id`, RBAC, RLS, concorrência, fusos e fonte canônica, sem antecipar a central de notificações da OE-008.005 nem os canais externos da OE-008.006.

## 2. Auditoria de entrada — OE-008.001 a OE-008.003

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

A implementação mantém as visões pessoal/equipe e calendário sobre a mesma fonte canônica. Os índices específicos de leitura permanecem versionados e as regras de visibilidade não transformam a interface em mecanismo de autorização: o backend continua aplicando a fronteira organizacional e as regras de acesso.

### OE-008.003 — Atribuição e colaboração

A revisão confirmou a permanência de:

- responsável canônico por `user_id`;
- participantes por IDs, sem cópia paralela de perfil/PII;
- diretório de integrantes restrito à gestão autorizada;
- snapshots append-only de colaboração;
- conclusão, cancelamento e reabertura por comandos explícitos;
- `expectedVersion`, chave idempotente, SHA-256, advisory/row locks e recibos privados;
- sincronização da visita técnica por `technical_visit_integration_events`, sem criar segunda fonte de visita.

**Resultado da auditoria residual:** não foi identificado bloqueador funcional novo nas OE-008.001–003 que justificasse reabrir seus contratos de domínio. A continuidade para a OE-008.004 permanece válida.

## 3. OE-008.004 — Implementação verificada

### 3.1 Persistência

Migration versionada:

`supabase/migrations/20260904100000_oe_008_004_deadlines_recurrence.sql`

A migration acrescenta a camada de ocorrências sem substituir `schedule_items`:

- `public.schedule_item_occurrences`;
- `public.schedule_item_occurrence_audit`;
- recibos privados de comando para idempotência;
- índices para consulta por item, organização, situação e instante;
- RLS de leitura por vínculo/autorização;
- escrita direta revogada para o papel autenticado;
- RPC de materialização e RPCs de transição.

A inspeção do Supabase AgroCore confirmou a presença da migration aplicada e das tabelas/funções correspondentes. `schedule_items`, `schedule_item_participants`, `schedule_item_occurrences` e `schedule_item_occurrence_audit` permanecem com RLS habilitada. A inspeção também confirmou estado vazio no domínio de agenda/ocorrências no momento da auditoria, preservando a regra de não criar dados fictícios.

### 3.2 Motor determinístico de recorrência

A implementação cobre:

- frequência diária;
- frequência semanal;
- frequência mensal;
- frequência anual;
- intervalos maiores que um;
- limite explícito de materialização por janela, impedindo série infinita;
- regra de término `endsAt`;
- tarefas baseadas em `dueAt`;
- compromissos baseados em `startsAt`/`endsAt`;
- preservação da duração do compromisso;
- cálculo no fuso IANA do item;
- tratamento determinístico de transições de DST, sem inventar horário local inválido/ambíguo.

### 3.3 Idempotência, concorrência e integridade

A materialização preserva uma ocorrência única por identidade canônica e converge em reexecuções. Mudança de versão do item não regride ocorrências terminais já concluídas/canceladas. A camada de transição utiliza:

- `expectedVersion`;
- advisory lock;
- row lock;
- fingerprint SHA-256 do comando;
- recibo idempotente privado;
- auditoria append-only;
- estados `pending`, `completed` e `cancelled` com transições explícitas.

O responsável atual pode concluir a própria ocorrência quando autorizado pelo vínculo do item; cancelamento e reabertura continuam reservados à gestão autorizada.

### 3.4 Aplicação e interface

A OE-008.004 acrescenta gateway de ocorrências para preview, Supabase e modo indisponível/fail-closed; serviço de aplicação; integração ao `ScheduleContext`; e `ScheduleOccurrencePanel` na agenda. A interface somente materializa quando o usuário expande explicitamente o painel e usa uma janela finita, evitando geração automática ilimitada.

Não foram introduzidos `schedule_notifications`, e-mail, SMS, push, webhook ou preferência de canal. Esses elementos continuam reservados para OE-008.005/OE-008.006.

## 4. Gates e cobertura versionada

A suíte `scripts/test-schedule-recurrence.ts` contém **51 verificações específicas da OE-008.004**. Ela está registrada como `test:schedule-recurrence` no `package.json` e integrada a `scripts/test-module-008.js`.

O `test:module-008` executa, em sequência:

- fundação;
- listas/agenda;
- atribuição/colaboração;
- reconciliação 001–003;
- prazos/recorrência;
- acessibilidade;
- tema.

O `npm run build` inclui o gate do Módulo 008, TypeScript estrito, Vite, Service Worker e verificação de vazamentos.

## 5. Evidência externa e limitação de homologação

O código atual está versionado na `main` e a persistência da OE-008.004 está presente no Supabase AgroCore. Entretanto, a execução mais recente observada do **AgroCore CI** para o HEAD auditado terminou antes do primeiro step (`steps=[]`). Portanto este relatório **não declara o GitHub Actions aprovado** nem transforma a ausência de execução do runner em aprovação de testes remotos.

Essa indisponibilidade externa não demonstra defeito do código, mas impede declarar homologação remota integral do pipeline enquanto o runner não executar os steps normalmente.

## 6. Decisão objetiva

- **OE-008.001:** revisada; sem novo bloqueador funcional identificado.
- **OE-008.002:** revisada; sem novo bloqueador funcional identificado.
- **OE-008.003:** revisada; sem novo bloqueador funcional identificado.
- **OE-008.004:** **IMPLEMENTADA no código e persistida no Supabase**, com ocorrências determinísticas/idempotentes, regras de prazo/recorrência, concorrência, RLS, auditoria, UI e gate versionado.
- **Homologação externa integral:** **PENDENTE exclusivamente da execução observável do AgroCore CI**, que continua encerrando antes do primeiro step.
- **OE-008.005:** não antecipada por esta entrega.

A próxima fronteira funcional do Módulo 008, após o gate externo voltar a executar normalmente, é **OE-008.005 — Central de notificações**.
