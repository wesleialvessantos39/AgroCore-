-- AgroCore — OE-008.002 — índices de leitura para visão pessoal/equipe.

create index if not exists schedule_items_org_creator_kind_status_idx
  on public.schedule_items (
    organization_id,
    created_by_user_id,
    item_kind,
    status
  );

create index if not exists schedule_items_org_creator_due_idx
  on public.schedule_items (
    organization_id,
    created_by_user_id,
    due_at
  )
  where due_at is not null;

create index if not exists schedule_items_org_creator_start_idx
  on public.schedule_items (
    organization_id,
    created_by_user_id,
    starts_at
  )
  where starts_at is not null;

comment on index public.schedule_items_org_creator_kind_status_idx is
  'OE-008.002: suporta visão pessoal por organização sem criar vínculo de responsável.';
comment on index public.schedule_items_org_creator_due_idx is
  'OE-008.002: suporta leitura pessoal de tarefas datadas.';
comment on index public.schedule_items_org_creator_start_idx is
  'OE-008.002: suporta leitura pessoal de compromissos datados.';
