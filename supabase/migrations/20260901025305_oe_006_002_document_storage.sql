-- OE-006.002 — bucket privado e políticas de Storage para documentos organizacionais.
-- O caminho possui cinco partes:
-- organization_id/owner_type/owner_id/document_id/document_id.ext

create schema if not exists agrocore_private;
revoke all on schema agrocore_private from public, anon;
grant usage on schema agrocore_private to authenticated;

create or replace function agrocore_private.has_document_storage_role(
  target_organization_id text,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id::text = target_organization_id
        and membership.user_id = (select auth.uid())
        and membership.status::text = 'active'
        and membership.organization_role::text = any (allowed_roles)
    );
$$;

revoke all on function agrocore_private.has_document_storage_role(text, text[]) from public, anon;
grant execute on function agrocore_private.has_document_storage_role(text, text[]) to authenticated;

create or replace function agrocore_private.document_storage_path_is_valid(object_name text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select object_name ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,159}/(client|property|appraisal_request|appraisal|proposal)/[A-Za-z0-9][A-Za-z0-9_-]{0,159}/[A-Za-z0-9][A-Za-z0-9_-]{0,159}/[A-Za-z0-9][A-Za-z0-9_-]{0,159}\.(pdf|jpg|png|tiff)$';
$$;

revoke all on function agrocore_private.document_storage_path_is_valid(text) from public, anon;
grant execute on function agrocore_private.document_storage_path_is_valid(text) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'organization-documents',
  'organization-documents',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "agrocore_documents_select" on storage.objects;
drop policy if exists "agrocore_documents_insert" on storage.objects;
drop policy if exists "agrocore_documents_update" on storage.objects;
drop policy if exists "agrocore_documents_delete" on storage.objects;

create policy "agrocore_documents_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'organization-documents'
  and (select agrocore_private.document_storage_path_is_valid(name))
  and (select agrocore_private.has_document_storage_role(
    (storage.foldername(name))[1],
    array['owner', 'company_admin', 'manager', 'project_designer', 'finance', 'capturer']::text[]
  ))
);

create policy "agrocore_documents_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-documents'
  and (select agrocore_private.document_storage_path_is_valid(name))
  and (select agrocore_private.has_document_storage_role(
    (storage.foldername(name))[1],
    array['owner', 'company_admin', 'manager', 'project_designer', 'capturer']::text[]
  ))
);

create policy "agrocore_documents_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organization-documents'
  and (select agrocore_private.document_storage_path_is_valid(name))
  and (select agrocore_private.has_document_storage_role(
    (storage.foldername(name))[1],
    array['owner', 'company_admin', 'manager', 'project_designer', 'capturer']::text[]
  ))
)
with check (
  bucket_id = 'organization-documents'
  and (select agrocore_private.document_storage_path_is_valid(name))
  and (select agrocore_private.has_document_storage_role(
    (storage.foldername(name))[1],
    array['owner', 'company_admin', 'manager', 'project_designer', 'capturer']::text[]
  ))
);

create policy "agrocore_documents_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'organization-documents'
  and (select agrocore_private.document_storage_path_is_valid(name))
  and (
    (select agrocore_private.has_document_storage_role(
      (storage.foldername(name))[1],
      array['owner', 'company_admin', 'manager']::text[]
    ))
    or (
      owner_id = (select auth.uid())::text
      and (select agrocore_private.has_document_storage_role(
        (storage.foldername(name))[1],
        array['project_designer', 'capturer']::text[]
      ))
    )
  )
);

comment on function agrocore_private.has_document_storage_role(text, text[])
is 'Valida vínculo organizacional ativo para políticas privadas de documentos.';

comment on function agrocore_private.document_storage_path_is_valid(text)
is 'Rejeita caminhos manipulados e nomes fora do padrão opaco do AgroCore.';
