-- AgroCore — OE-007.004 R4
-- Índices de suporte para vínculos Cliente ↔ Captador e solicitações cadastrais.

create index if not exists client_capturer_assignments_client_fk_idx
  on public.client_capturer_assignments (client_id);

create index if not exists client_capturer_assignments_capturer_fk_idx
  on public.client_capturer_assignments (capturer_user_id);

create index if not exists client_capturer_assignments_assigned_by_fk_idx
  on public.client_capturer_assignments (assigned_by_user_id);

create index if not exists client_capturer_idempotency_result_fk_idx
  on public.client_capturer_idempotency (result_assignment_id);

create index if not exists client_registry_requests_client_fk_idx
  on public.client_registry_requests (client_id);

create index if not exists client_registry_requests_property_fk_idx
  on public.client_registry_requests (property_id)
  where property_id is not null;

create index if not exists client_registry_requests_assigned_capturer_fk_idx
  on public.client_registry_requests (assigned_capturer_user_id);

create index if not exists client_registry_requests_requested_by_fk_idx
  on public.client_registry_requests (requested_by_user_id);

create index if not exists client_registry_request_events_org_fk_idx
  on public.client_registry_request_events (organization_id);

create index if not exists client_registry_request_events_actor_fk_idx
  on public.client_registry_request_events (actor_user_id);

create index if not exists field_evidence_links_created_by_fk_idx
  on public.field_evidence_links (created_by_user_id);
