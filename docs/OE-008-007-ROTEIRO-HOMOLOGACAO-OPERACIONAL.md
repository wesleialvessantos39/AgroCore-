# OE-008.007 — Roteiro de Homologação Operacional

**Módulo 008 — Agenda corporativa, tarefas, prazos e notificações**  
**Objetivo:** executar a prova física/operacional dos fluxos que dependem de usuário, navegador, dispositivo, rede e provedor externos reais, sem alterar as fontes canônicas do módulo.

## 1. Regra de evidência

Este roteiro é deliberadamente fail-closed: **não criar dados fictícios** em produção apenas para produzir uma evidência de homologação. Uma execução física só é válida quando existir organização real ativa, usuário real elegível, item real de Agenda e, para canais externos, provedor e/ou dispositivo real configurado pelo ambiente autorizado.

A ausência desses pré-requisitos não autoriza simular `delivered`, forjar screenshot, inserir linha manual em fila/auditoria ou marcar uma prova como executada. O código automatizado e a infraestrutura podem ser homologados independentemente; a evidência física permanece um checkpoint operacional do ambiente.

## 2. Pré-requisitos

Antes de iniciar a prova física, confirmar:

1. organização real com `status=active`;
2. usuário autenticado com membership ativa e um dos perfis autorizados da Agenda;
3. item real em `public.schedule_items`, criado pelo fluxo normal do AgroCore;
4. navegador suportado e conexão estável;
5. para e-mail: **provedor** configurado no backend seguro, remetente autorizado e e-mail canônico do usuário;
6. para Push: VAPID configurado no backend e **dispositivo real** com Web Push suportado;
7. nenhum secret inserido na interface ou versionado no repositório;
8. relógio/fuso do equipamento conferidos.

## 3. Matriz de perfis

Executar, quando os perfis reais existirem no tenant de homologação:

| Perfil | Esperado |
|---|---|
| `owner` | visualizar e gerenciar Agenda/políticas |
| `company_admin` | visualizar e gerenciar Agenda/políticas |
| `manager` | visualizar e gerenciar Agenda/políticas |
| `project_designer` | visualizar itens relacionados; sem gestão global |
| `capturer` | visualizar itens relacionados; sem gestão global |
| `finance` | sem acesso à Agenda por herança implícita |
| `platform_super_admin` | sem acesso automático aos dados privados da organização |

Registrar tentativa positiva e negativa. Qualquer ID de outra organização deve falhar no backend/RLS, não apenas na interface.

## 4. Fusos, DST, recorrência e exceções

### 4.1 Fusos

Validar ao menos `America/Sao_Paulo`, `America/New_York` e `UTC`. Confirmar que o horário exibido corresponde ao fuso do item, não ao offset fixo do dispositivo.

### 4.2 Mudança de horário

Em `America/New_York`, validar:

- horário inexistente na transição de primavera: criação/materialização deve recusar;
- horário ambíguo na transição de outono: deve recusar ou exigir horário inequívoco conforme contrato vigente;
- horário válido adjacente: deve ser materializado uma única vez.

### 4.3 Recorrência

Cobrir diária, semanal, mensal e anual; intervalo maior que 1; `endsAt`; conclusão/cancelamento; alteração da regra; materialização repetida da mesma janela; alteração apenas do horário preservando identidade lógica por `occurrence_local_date`.

Resultado esperado: nenhuma ocorrência duplicada e nenhum replay antigo regressando versão.

## 5. Links e rotas

Para notificações internas e Push:

- link `/agenda` deve abrir a Agenda autenticada;
- `//host`, `http://`, `https://` ou rota externa injetada deve ser recusada;
- usuário sem `schedule:view` deve receber guarda de acesso;
- link não pode contornar `OrganizationGate`/RLS.

## 6. Preferências internas

Para cada categoria (`schedule_assignment`, `schedule_deadline`, `schedule_status`):

1. confirmar estado atual;
2. desabilitar pelo fluxo da Central;
3. confirmar que snapshot/contador e leitura direta não expõem avisos daquela categoria;
4. reabilitar;
5. repetir uma mesma operação idempotente quando possível e verificar que não há duplicação;
6. provocar concorrência legítima entre duas sessões e confirmar `expectedVersion`/conflito.

## 7. Canais externos e escalonamento

### 7.1 E-mail

Com **provedor** realmente configurado:

1. ativar preferência de e-mail para o usuário real;
2. habilitar política para uma categoria;
3. criar/alterar item real que gere notificação interna;
4. confirmar fila derivada referenciando `notification_id` e `notification_version`;
5. confirmar entrega no endereço canônico;
6. conferir status `delivered`, tentativa e auditoria;
7. repetir/reconciliar a mesma origem e verificar que não há segundo envio semântico da mesma versão.

### 7.2 Push

Em **dispositivo real**:

1. abrir AgroCore publicado via HTTPS;
2. ativar Push explicitamente;
3. conceder permissão do navegador;
4. verificar inscrição do endpoint no backend privado;
5. gerar notificação real;
6. bloquear a tela/colocar app em segundo plano e receber Push;
7. tocar a notificação e confirmar navegação apenas para rota interna segura;
8. revogar a permissão/assinatura e confirmar supressão de filas futuras para o endpoint revogado.

## 8. Falha, retry e escalonamento

Homologar com falhas controladas do ambiente, nunca manipulando diretamente o estado da fila:

- indisponibilidade temporária do provedor/HTTP 5xx;
- rate limit/429 e `Retry-After` quando o provedor permitir cenário de homologação;
- endpoint Push 404/410;
- provedor não configurado em ambiente próprio para esse teste;
- leitura/expiração da notificação antes do próximo retry;
- alteração de versão da notificação com entrega anterior ainda pendente.

Esperado: `retry` com backoff, `blocked` quando provedor ausente, `failed` em rejeição definitiva, `suppressed` quando a origem deixa de ser elegível e `superseded_notification_version` para versão obsoleta. Nenhuma falha externa pode reverter a tarefa, compromisso, recorrência ou notificação interna.

## 9. Volume e concorrência

Em tenant de homologação real autorizado, criar volume por uso normal/API de teste autenticada — nunca por INSERT manual que burle contratos — e verificar:

- worker processa lotes sem claim duplicado;
- `FOR UPDATE ... SKIP LOCKED` evita disputa entre workers;
- lease expirada retorna item à fila;
- `max_attempts` limita retries;
- contadores internos permanecem consistentes;
- nenhuma entrega da versão antiga é reivindicada após reativação/alteração.

## 10. Acessibilidade e responsividade

Validar fisicamente desktop e mobile:

- teclado completo na Central e Agenda;
- foco visível e retorno de foco após `Escape`;
- `aria-expanded`/`aria-controls` coerentes;
- IDs de painel únicos entre Topbar desktop/mobile;
- badge lido por texto acessível sem depender apenas de cor;
- alvos de toque adequados;
- calendário/lista sem corte horizontal impeditivo;
- preferência de Push não solicita permissão automaticamente ao carregar a tela.

## 11. Auditoria

Após cada cenário, conferir por consulta autorizada/console administrativo de homologação:

- trilha de Agenda;
- `notification_audit`;
- auditoria externa privada;
- tentativas e estado final da entrega;
- ausência de conteúdo sensível desnecessário nos detalhes;
- inexistência de duplicidade de `schedule_items`, ocorrências, notificações ou entregas.

## 12. Evidências mínimas por execução física

Registrar data/hora, tenant, perfil, navegador/SO, fuso, ID estável do item/notificação (sem copiar PII), cenário, resultado esperado/obtido, status final e screenshot apenas quando não revelar segredo ou dado pessoal desnecessário.

## 13. Estado do ambiente em 04/09/2026

Na verificação remota usada para fechar a implementação, o projeto Supabase possuía **zero organizações, zero memberships, zero usuários, zero itens de Agenda e zero notificações empresariais**. Por isso, executar e-mail ou Push ponta a ponta agora exigiria inventar tenant/usuário/destinatário — o que este roteiro proíbe.

A prova física fica pronta para execução assim que existir ambiente real autorizado. Isso não altera o fato de que os adaptadores, fila, políticas, worker, scheduler, RLS, idempotência, retries e gates automatizados estão implementados e versionados.
