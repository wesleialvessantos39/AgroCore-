-- AgroCore — OE-007.007 — Homologação de campo / fechamento de índices do Módulo 007.
-- Cobre todas as FKs ainda apontadas pelo advisor para visitas e formulários
-- sem alterar contratos, dados ou regras de autorização.

create index if not exists technical_visits_client_fk_idx
  on public.technical_visits (client_id);

create index if not exists technical_visits_property_fk_idx
  on public.technical_visits (property_id)
  where property_id is not null;

create index if not exists technical_visits_responsible_fk_idx
  on public.technical_visits (responsible_user_id);

create index if not exists technical_visit_audit_actor_fk_idx
  on public.technical_visit_audit (actor_user_id);

create index if not exists technical_visit_field_forms_visit_fk_idx
  on public.technical_visit_field_forms (visit_id);

create index if not exists technical_visit_field_forms_created_by_fk_idx
  on public.technical_visit_field_forms (created_by_user_id);

create index if not exists technical_visit_field_forms_updated_by_fk_idx
  on public.technical_visit_field_forms (updated_by_user_id);

create index if not exists technical_visit_field_forms_submitted_by_fk_idx
  on public.technical_visit_field_forms (submitted_by_user_id)
  where submitted_by_user_id is not null;

create index if not exists technical_visit_field_form_revisions_visit_fk_idx
  on public.technical_visit_field_form_revisions (visit_id);

create index if not exists technical_visit_field_form_revisions_actor_fk_idx
  on public.technical_visit_field_form_revisions (actor_user_id);

comment on index public.technical_visits_client_fk_idx is
  'OE-007.007: cobertura da FK de cliente para homologação de campo.';
comment on index public.technical_visits_property_fk_idx is
  'OE-007.007: cobertura da FK opcional de imóvel para homologação de campo.';
comment on index public.technical_visits_responsible_fk_idx is
  'OE-007.007: cobertura da FK de responsável para homologação de campo.';
comment on index public.technical_visit_audit_actor_fk_idx is
  'OE-007.007: cobertura da FK de ator da auditoria.';
comment on index public.technical_visit_field_forms_visit_fk_idx is
  'OE-007.007: cobertura da FK visita-formulário.';
comment on index public.technical_visit_field_forms_created_by_fk_idx is
  'OE-007.007: cobertura da FK de autoria do formulário.';
comment on index public.technical_visit_field_forms_updated_by_fk_idx is
  'OE-007.007: cobertura da FK de última alteração do formulário.';
comment on index public.technical_visit_field_forms_submitted_by_fk_idx is
  'OE-007.007: cobertura da FK de envio do formulário.';
comment on index public.technical_visit_field_form_revisions_visit_fk_idx is
  'OE-007.007: cobertura da FK visita-revisão.';
comment on index public.technical_visit_field_form_revisions_actor_fk_idx is
  'OE-007.007: cobertura da FK de ator da revisão.';
