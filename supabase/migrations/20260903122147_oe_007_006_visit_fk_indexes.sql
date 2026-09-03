-- AgroCore — OE-007.006 R2 — índices das FKs de visita.
-- Cobre as FKs apontadas pelo advisor sem remover os índices de consulta
-- multiempresa já usados pelas projeções operacionais.

create index if not exists technical_visit_integration_links_visit_fk_idx
  on public.technical_visit_integration_links (visit_id);

create index if not exists technical_visit_integration_events_visit_fk_idx
  on public.technical_visit_integration_events (visit_id);

comment on index public.technical_visit_integration_links_visit_fk_idx is
  'OE-007.006 R2: cobertura da FK visit_id para integridade e remoção eficiente.';

comment on index public.technical_visit_integration_events_visit_fk_idx is
  'OE-007.006 R2: cobertura da FK visit_id para integridade e remoção eficiente.';
