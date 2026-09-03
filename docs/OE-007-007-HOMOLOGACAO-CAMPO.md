# OE-007.007 — Registro de Homologação de Campo

## Escopo

A OE-007.007 encerra tecnicamente o Módulo 007 validando as cinco frentes definidas no Plano Mestre: celular, permissões, conectividade, evidências e integrações.

Este registro separa evidência automatizada observada de validação física que exige um aparelho real. Nenhuma caixa física é marcada sem execução observável.

## Evidências automatizadas executadas

- [x] Responsividade estrutural coberta em 320, 390, 430, 720, 768, 1024, 1366 e 1440 px.
- [x] Alvos de toque, foco, ARIA, semântica e ausência de overflow fixo cobertos pelas suítes do Módulo 007.
- [x] Matriz dos sete perfis oficiais verificada: platform_super_admin, owner, company_admin, manager, project_designer, finance e capturer.
- [x] Projetista responsável autorizado e projetista não responsável/captador bloqueados para integrações técnicas.
- [x] Detecção de online/offline sem armazenamento local de dados de negócio.
- [x] Rascunho do formulário permanece pendente sem rede, não envia silenciosamente e retoma o salvamento após reconexão enquanto a página permanece aberta.
- [x] Envio final do formulário é bloqueado sem rede.
- [x] GPS possui tratamento distinto para permissão negada, indisponibilidade e timeout, com alternativa manual.
- [x] Coordenadas obtidas no aparelho durante falta de rede permanecem apenas na tela e são explicitamente informadas como ainda não gravadas.
- [x] Upload de fotos sem rede é recusado explicitamente; não existe fila offline falsa.
- [x] Fotos permanecem restritas a JPEG/PNG/TIFF, assinatura real e limite de 15 MB.
- [x] Bucket `field-evidence` confirmado privado no Supabase, com limite de 15 MB e MIME types autorizados.
- [x] Policies de Storage confirmadas para SELECT/INSERT/UPDATE/DELETE somente em `authenticated`, condicionadas às funções de autorização do imóvel.
- [x] RPCs críticos do Módulo 007 confirmados sem EXECUTE para `anon`, com EXECUTE para `authenticated`, `SECURITY DEFINER` e `search_path` vazio.
- [x] RLS confirmada nas tabelas principais de visitas, formulário, evidências, relatório e integrações.
- [x] Advisor de performance sem FK não indexada remanescente nas tabelas do Módulo 007 após a migration da OE-007.007.
- [x] Integrações de Agenda, Proposta e Frota permanecem idempotentes, com trigger autoritativo e retomada de consulta após reconexão.
- [x] `npm run build` aprovado no Vercel no commit `4adcbc0a0b07df3ed0e192314080129de02cfed5`.
- [x] O build aprovado inclui `tsc --noEmit`, `test:module-007`, Vite, Service Worker e verificação de vazamentos.
- [x] A suíte específica `test-field-visits-field-homologation.ts` contém 50 provas.
- [x] O Módulo 007 totaliza 292 provas específicas das OEs 007.001–007.007, além de 25 verificações estruturais de acessibilidade/responsividade, tema e auditoria de texto público.

## Validação física em aparelho real

As verificações abaixo exigem observação em hardware real e não são inferidas a partir de testes automatizados:

- [ ] Abrir a tela de Visitas e vistorias em celular real e confirmar ausência de overflow ou controle inacessível.
- [ ] Confirmar foco/teclado móvel nos campos de data, horário, inteiro, decimal e coordenadas.
- [ ] Autorizar localização no aparelho e confirmar captura, precisão exibida e gravação no imóvel.
- [ ] Negar localização no aparelho e confirmar mensagem de permissão + alternativa manual.
- [ ] Capturar fotografia pela câmera traseira e confirmar upload/visualização.
- [ ] Retirar a conexão durante edição do formulário, alterar dados e confirmar que nenhuma mensagem informa salvamento inexistente.
- [ ] Restaurar a conexão mantendo a página aberta e confirmar retomada do salvamento.
- [ ] Retirar a conexão antes de enviar foto e confirmar bloqueio explícito.
- [ ] Restaurar a conexão e confirmar que foto/coordenadas podem ser gravadas sem duplicação.
- [ ] Concluir uma visita real com formulário enviado, relatório final e atualização das integrações visíveis.

## Gates externos

- **Vercel:** aprovado no commit `4adcbc0a0b07df3ed0e192314080129de02cfed5`.
- **AgroCore CI / GitHub Actions:** o runner continua encerrando o job antes de qualquer step. Como o Vercel executou o gate de produção e foi aprovado, não há evidência de falha de TypeScript/teste no código; a falha do Actions permanece como pendência de infraestrutura externa.

## Decisão

A implementação, persistência remota, RLS/Storage, segurança aplicável, testes automatizados e build de produção do Módulo 007 estão fechados.

A expressão **homologação física em campo** só pode ser registrada após execução observável dos itens de aparelho real acima. Até lá, o status correto é: **Módulo 007 finalizado em implementação e homologação automatizada/remota; aceite físico de campo pendente**.
