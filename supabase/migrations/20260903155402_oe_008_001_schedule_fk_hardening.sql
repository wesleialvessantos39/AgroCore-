-- AgroCore — OE-008.001 R1 — cobertura da FK de auditoria.
create index if not exists schedule_item_audit_schedule_item_fk_idx
  on public.schedule_item_audit (schedule_item_id);

comment on index public.schedule_item_audit_schedule_item_fk_idx is
  'OE-008.001 R1: cobertura direta da FK schedule_item_id para manutenção e integridade performática.';
