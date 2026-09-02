-- AgroCore — OE-007.004 R1: índices e endurecimento do Storage.

create index if not exists field_evidence_sets_visit_fk_idx
  on public.field_evidence_sets (visit_id)
  where visit_id is not null;
create index if not exists field_evidence_sets_property_fk_idx
  on public.field_evidence_sets (property_id)
  where property_id is not null;
create index if not exists field_evidence_sets_client_fk_idx
  on public.field_evidence_sets (client_id);
create index if not exists field_evidence_sets_created_by_fk_idx
  on public.field_evidence_sets (created_by_user_id);
create index if not exists field_evidence_sets_updated_by_fk_idx
  on public.field_evidence_sets (updated_by_user_id);

create index if not exists field_evidence_photos_evidence_fk_idx
  on public.field_evidence_photos (evidence_id);
create index if not exists field_evidence_photos_document_fk_idx
  on public.field_evidence_photos (document_version_id)
  where document_version_id is not null;
create index if not exists field_evidence_photos_captured_by_fk_idx
  on public.field_evidence_photos (captured_by_user_id)
  where captured_by_user_id is not null;

create index if not exists field_evidence_events_evidence_fk_idx
  on public.field_evidence_events (evidence_id);
create index if not exists field_evidence_events_actor_fk_idx
  on public.field_evidence_events (actor_user_id);

create or replace function agrocore_private.can_mutate_field_evidence_storage(
  p_organization_id uuid,
  p_evidence_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      agrocore_private.current_organization_role(p_organization_id)
        in ('owner','company_admin','manager','project_designer'),
      false
    )
    and exists (
      select 1
      from public.field_evidence_sets e
      where e.id = p_evidence_id
        and e.organization_id = p_organization_id
        and (
          e.visit_id is null
          or exists (
            select 1
            from public.technical_visits v
            where v.id = e.visit_id
              and v.organization_id = p_organization_id
              and v.responsible_user_id = (select auth.uid())
              and v.status in ('confirmed','in_progress')
          )
        )
    );
$$;

revoke all on function
  agrocore_private.can_mutate_field_evidence_storage(uuid,uuid)
  from public, anon, authenticated;

drop policy if exists "agrocore_field_evidence_storage_insert" on storage.objects;
create policy "agrocore_field_evidence_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'field-evidence'
  and agrocore_private.can_mutate_field_evidence_storage(
    split_part(name,'/',1)::uuid,
    split_part(name,'/',2)::uuid
  )
);

drop policy if exists "agrocore_field_evidence_storage_update" on storage.objects;
create policy "agrocore_field_evidence_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'field-evidence'
  and agrocore_private.can_mutate_field_evidence_storage(
    split_part(name,'/',1)::uuid,
    split_part(name,'/',2)::uuid
  )
)
with check (
  bucket_id = 'field-evidence'
  and agrocore_private.can_mutate_field_evidence_storage(
    split_part(name,'/',1)::uuid,
    split_part(name,'/',2)::uuid
  )
);

drop policy if exists "agrocore_field_evidence_storage_delete" on storage.objects;
create policy "agrocore_field_evidence_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'field-evidence'
  and agrocore_private.can_mutate_field_evidence_storage(
    split_part(name,'/',1)::uuid,
    split_part(name,'/',2)::uuid
  )
);
