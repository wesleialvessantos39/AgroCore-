-- AgroCore — OE-007.006 R1 — acesso mínimo à função de autorização do RLS.
-- A função permanece no schema privado e apenas pode ser executada para que
-- as policies SELECT avaliem o acesso; helpers de escrita continuam revogados.

grant execute on function agrocore_private.can_view_technical_visit_integrations(uuid,uuid)
  to authenticated;

comment on function agrocore_private.can_view_technical_visit_integrations(uuid,uuid) is
  'OE-007.006 R1: avaliador privado de RLS; EXECUTE mínimo para authenticated, sem mutação.';
