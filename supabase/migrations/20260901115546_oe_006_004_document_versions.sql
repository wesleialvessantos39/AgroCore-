-- OE-006.004 — versões documentais imutáveis e versão atual atômica.
-- A migração cria somente metadados. Arquivos permanecem no bucket privado
-- organization-documents e versões anteriores nunca são removidas pela troca.

create schema if not exists agrocore_private;
revoke all on schema agrocore_private from public, anon;
grant usage on schema agrocore_private to authenticated;

create table if not exists public.document_versions (
  id uuid primary key,
  logical_document_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  logical_owner_type text not null check (
    logical_owner_type in ('client', 'property', 'appraisal_request', 'appraisal', 'proposal')
  ),
  logical_owner_id text not null check (
    length(logical_owner_id) between 1 and 160
    and logical_owner_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$'
  ),
  category text not null check (
    category in (
      'registration_certificate', 'car_receipt', 'topography_map',
      'descriptive_memorial', 'technical_report', 'photo_report',
      'professional_record', 'commercial_support', 'other'
    )
  ),
  display_name text not null check (length(btrim(display_name)) between 3 and 120),
  mime_type text not null check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/tiff')
  ),
  file_size_bytes bigint check (file_size_bytes between 1 and 52428800),
  access_scope text not null check (access_scope in ('organization', 'participants', 'management')),
  status text not null check (status in ('active', 'superseded', 'archived')),
  is_current boolean not null,
  version_number integer not null check (version_number > 0),
  predecessor_version_id uuid references public.document_versions(id) on delete restrict,
  version_note text not null check (length(btrim(version_note)) between 3 and 500),
  issued_on date,
  expires_on date,
  notes text check (notes is null or length(btrim(notes)) between 1 and 500),
  storage_state text not null check (storage_state in ('metadata_only', 'stored')),
  storage_bucket text,
  storage_object_path text,
  storage_uploaded_at timestamptz,
  metadata_checksum_sha256 text not null check (metadata_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  created_by_user_id uuid not null,
  created_by_display_name text not null check (
    length(btrim(created_by_display_name)) between 3 and 120
  ),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  archived_at timestamptz,
  archived_by_user_id uuid,
  constraint document_versions_dates_valid check (
    expires_on is null or issued_on is null or expires_on >= issued_on
  ),
  constraint document_versions_lineage_valid check (
    (version_number = 1 and predecessor_version_id is null and id = logical_document_id)
    or (version_number > 1 and predecessor_version_id is not null and id <> logical_document_id)
  ),
  constraint document_versions_storage_valid check (
    (
      storage_state = 'metadata_only'
      and storage_bucket is null
      and storage_object_path is null
      and storage_uploaded_at is null
    )
    or (
      storage_state = 'stored'
      and storage_bucket = 'organization-documents'
      and storage_object_path is not null
      and storage_uploaded_at is not null
      and file_size_bytes is not null
    )
  ),
  constraint document_versions_storage_path_bound check (
    storage_state <> 'stored'
    or storage_object_path = concat(
      organization_id::text, '/', logical_owner_type, '/', logical_owner_id, '/',
      logical_document_id::text, '/', id::text, '.',
      case mime_type
        when 'application/pdf' then 'pdf'
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        when 'image/tiff' then 'tiff'
      end
    )
  ),
  constraint document_versions_archive_valid check (
    (status = 'archived' and archived_at is not null and archived_by_user_id is not null)
    or (status <> 'archived' and archived_at is null and archived_by_user_id is null)
  ),
  constraint document_versions_current_status_valid check (
    (is_current and status in ('active', 'archived'))
    or (not is_current and status = 'superseded')
  ),
  unique (organization_id, logical_document_id, version_number)
);

create unique index if not exists document_versions_one_current_idx
  on public.document_versions (organization_id, logical_document_id)
  where is_current;

create index if not exists document_versions_current_list_idx
  on public.document_versions (organization_id, is_current, updated_at desc);

create index if not exists document_versions_history_idx
  on public.document_versions (organization_id, logical_document_id, version_number desc);

create index if not exists document_versions_predecessor_idx
  on public.document_versions (predecessor_version_id)
  where predecessor_version_id is not null;

create table if not exists agrocore_private.document_access (
  logical_document_id uuid primary key references public.document_versions(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  authorized_user_ids uuid[] not null default '{}'::uuid[] check (
    cardinality(authorized_user_ids) <= 256
    and array_position(authorized_user_ids, null) is null
  ),
  updated_at timestamptz not null default clock_timestamp(),
  unique (organization_id, logical_document_id)
);

revoke all on table agrocore_private.document_access from public, anon, authenticated;

create table if not exists agrocore_private.document_command_receipts (
  organization_id uuid not null,
  actor_user_id uuid not null,
  operation text not null check (operation in ('create-version', 'replace-version', 'archive-version')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  result_version_id uuid not null references public.document_versions(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, operation, idempotency_key)
);

revoke all on table agrocore_private.document_command_receipts from public, anon, authenticated;

create or replace function agrocore_private.document_member_role(target_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership.organization_role::text
  from public.organization_memberships membership
  where membership.organization_id::text = target_organization_id::text
    and membership.user_id = (select auth.uid())
    and membership.status::text = 'active'
  limit 1;
$$;

revoke all on function agrocore_private.document_member_role(uuid) from public, anon;
grant execute on function agrocore_private.document_member_role(uuid) to authenticated;

create or replace function agrocore_private.document_actor_display_name()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when length(btrim(coalesce(
      (select auth.jwt()) -> 'user_metadata' ->> 'name',
      (select auth.jwt()) -> 'user_metadata' ->> 'full_name',
      ''
    ))) between 3 and 120
    then left(btrim(coalesce(
      (select auth.jwt()) -> 'user_metadata' ->> 'name',
      (select auth.jwt()) -> 'user_metadata' ->> 'full_name'
    )), 120)
    else 'Integrante da equipe'
  end;
$$;

revoke all on function agrocore_private.document_actor_display_name()
  from public, anon, authenticated;

create or replace function agrocore_private.can_read_document(
  target_organization_id uuid,
  target_logical_document_id uuid,
  target_access_scope text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_role text;
begin
  if v_actor_id is null then return false; end if;
  v_role := agrocore_private.document_member_role(target_organization_id);
  if v_role in ('owner', 'company_admin', 'manager') then return true; end if;
  if v_role = 'finance' then return target_access_scope = 'organization'; end if;
  if v_role is null
    or v_role not in ('project_designer', 'capturer')
    or target_access_scope = 'management' then
    return false;
  end if;
  return exists (
    select 1
    from agrocore_private.document_access access_rule
    where access_rule.organization_id = target_organization_id
      and access_rule.logical_document_id = target_logical_document_id
      and v_actor_id = any (access_rule.authorized_user_ids)
  );
end;
$$;

revoke all on function agrocore_private.can_read_document(uuid, uuid, text) from public, anon;
grant execute on function agrocore_private.can_read_document(uuid, uuid, text) to authenticated;

alter table public.document_versions enable row level security;

drop policy if exists "agrocore_document_versions_select" on public.document_versions;
create policy "agrocore_document_versions_select"
on public.document_versions
for select
to authenticated
using (
  (select agrocore_private.can_read_document(
    organization_id,
    logical_document_id,
    access_scope
  ))
);

revoke all on table public.document_versions from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.document_versions from authenticated;
grant select on table public.document_versions to authenticated;

create or replace function agrocore_private.create_document_version(
  p_reference jsonb,
  p_authorized_user_ids uuid[],
  p_idempotency_key text,
  p_payload_hash text
)
returns public.document_versions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid := (p_reference ->> 'organizationId')::uuid;
  v_document_id uuid := (p_reference ->> 'id')::uuid;
  v_logical_document_id uuid := (p_reference ->> 'logicalDocumentId')::uuid;
  v_authorized_user_ids uuid[] := array(
    select distinct candidate
    from unnest(coalesce(p_authorized_user_ids, '{}'::uuid[])) as authorized(candidate)
    order by candidate
  );
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_receipt agrocore_private.document_command_receipts%rowtype;
  v_result public.document_versions%rowtype;
begin
  if v_actor_id is null then raise exception 'AGROCORE_FORBIDDEN'; end if;
  if p_payload_hash is null
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 200
    or cardinality(v_authorized_user_ids) > 256 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_role := agrocore_private.document_member_role(v_organization_id);
  if v_role is null
    or v_role not in ('owner', 'company_admin', 'manager', 'project_designer', 'capturer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if exists (
    select 1
    from unnest(v_authorized_user_ids) authorized_user_id
    where not exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id::text = v_organization_id::text
        and membership.user_id = authorized_user_id
        and membership.status::text = 'active'
    )
  ) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  if v_role in ('project_designer', 'capturer')
    and (
      p_reference ->> 'accessScope' = 'management'
      or not (v_actor_id = any (v_authorized_user_ids))
    ) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':create-version:' || p_idempotency_key, 0)
  );
  select * into v_receipt
  from agrocore_private.document_command_receipts
  where organization_id = v_organization_id
    and operation = 'create-version'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_user_id <> v_actor_id then
      raise exception 'AGROCORE_FORBIDDEN';
    end if;
    if v_receipt.payload_hash <> p_payload_hash then
      raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
    end if;
    select * into strict v_result from public.document_versions where id = v_receipt.result_version_id;
    return v_result;
  end if;

  if p_reference ->> 'accessScope' = 'management'
    and v_role not in ('owner', 'company_admin', 'manager') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if (p_reference ->> 'createdByUserId') is distinct from v_actor_id::text
    or v_document_id is distinct from v_logical_document_id
    or (p_reference ->> 'versionNumber')::integer is distinct from 1
    or coalesce((p_reference ->> 'isCurrent')::boolean, false) is not true
    or (p_reference ->> 'status') is distinct from 'active'
    or p_reference ? 'predecessorDocumentId' then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  insert into public.document_versions (
    id, logical_document_id, organization_id, logical_owner_type, logical_owner_id,
    category, display_name, mime_type, file_size_bytes, access_scope, status,
    is_current, version_number, predecessor_version_id, version_note, issued_on,
    expires_on, notes, storage_state, storage_bucket, storage_object_path,
    storage_uploaded_at, metadata_checksum_sha256, created_by_user_id,
    created_by_display_name, created_at, updated_at
  ) values (
    v_document_id,
    v_logical_document_id,
    v_organization_id,
    p_reference ->> 'logicalOwnerType',
    p_reference ->> 'logicalOwnerId',
    p_reference ->> 'category',
    p_reference ->> 'displayName',
    p_reference ->> 'mimeType',
    nullif(p_reference ->> 'fileSizeBytes', '')::bigint,
    p_reference ->> 'accessScope',
    p_reference ->> 'status',
    (p_reference ->> 'isCurrent')::boolean,
    (p_reference ->> 'versionNumber')::integer,
    null,
    p_reference ->> 'versionNote',
    nullif(p_reference ->> 'issuedOn', '')::date,
    nullif(p_reference ->> 'expiresOn', '')::date,
    nullif(p_reference ->> 'notes', ''),
    p_reference ->> 'storageState',
    nullif(p_reference ->> 'storageBucket', ''),
    nullif(p_reference ->> 'storageObjectPath', ''),
    nullif(p_reference ->> 'storageUploadedAt', '')::timestamptz,
    p_reference ->> 'metadataChecksumSha256',
    v_actor_id,
    agrocore_private.document_actor_display_name(),
    v_now,
    v_now
  ) returning * into v_result;

  insert into agrocore_private.document_access (
    logical_document_id, organization_id, authorized_user_ids, updated_at
  ) values (
    v_logical_document_id, v_organization_id, v_authorized_user_ids, v_now
  );

  insert into agrocore_private.document_command_receipts (
    organization_id, actor_user_id, operation, idempotency_key, payload_hash, result_version_id
  ) values (
    v_organization_id, v_actor_id, 'create-version', p_idempotency_key, p_payload_hash, v_result.id
  );
  return v_result;
end;
$$;

create or replace function agrocore_private.replace_document_version(
  p_reference jsonb,
  p_previous_version_id uuid,
  p_expected_version integer,
  p_authorized_user_ids uuid[],
  p_idempotency_key text,
  p_payload_hash text
)
returns public.document_versions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid := (p_reference ->> 'organizationId')::uuid;
  v_authorized_user_ids uuid[] := array(
    select distinct candidate
    from unnest(coalesce(p_authorized_user_ids, '{}'::uuid[])) as authorized(candidate)
    order by candidate
  );
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_previous public.document_versions%rowtype;
  v_receipt agrocore_private.document_command_receipts%rowtype;
  v_result public.document_versions%rowtype;
begin
  if v_actor_id is null then raise exception 'AGROCORE_FORBIDDEN'; end if;
  if p_payload_hash is null
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 200
    or cardinality(v_authorized_user_ids) > 256 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_role := agrocore_private.document_member_role(v_organization_id);
  if v_role is null or v_role not in ('owner', 'company_admin', 'manager') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if exists (
    select 1
    from unnest(v_authorized_user_ids) authorized_user_id
    where not exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id::text = v_organization_id::text
        and membership.user_id = authorized_user_id
        and membership.status::text = 'active'
    )
  ) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':replace-version:' || p_idempotency_key, 0)
  );
  select * into v_receipt
  from agrocore_private.document_command_receipts
  where organization_id = v_organization_id
    and operation = 'replace-version'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_user_id <> v_actor_id then
      raise exception 'AGROCORE_FORBIDDEN';
    end if;
    if v_receipt.payload_hash <> p_payload_hash then
      raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
    end if;
    select * into strict v_result from public.document_versions where id = v_receipt.result_version_id;
    return v_result;
  end if;

  select * into v_previous
  from public.document_versions
  where organization_id = v_organization_id and id = p_previous_version_id
  for update;
  if not found then raise exception 'AGROCORE_REFERENCE_NOT_FOUND'; end if;
  if not v_previous.is_current
    or v_previous.status <> 'active'
    or v_previous.version_number is distinct from p_expected_version then
    raise exception 'AGROCORE_VERSION_CONFLICT';
  end if;

  if (p_reference ->> 'createdByUserId') is distinct from v_actor_id::text
    or (p_reference ->> 'logicalDocumentId')::uuid is distinct from v_previous.logical_document_id
    or (p_reference ->> 'predecessorDocumentId')::uuid is distinct from v_previous.id
    or (p_reference ->> 'versionNumber')::integer is distinct from v_previous.version_number + 1
    or coalesce((p_reference ->> 'isCurrent')::boolean, false) is not true
    or (p_reference ->> 'status') is distinct from 'active'
    or (p_reference ->> 'logicalOwnerType') is distinct from v_previous.logical_owner_type
    or (p_reference ->> 'logicalOwnerId') is distinct from v_previous.logical_owner_id
    or (p_reference ->> 'category') is distinct from v_previous.category
    or (p_reference ->> 'accessScope') is distinct from v_previous.access_scope then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  update public.document_versions
  set is_current = false,
      status = 'superseded',
      updated_at = v_now
  where id = v_previous.id;

  insert into public.document_versions (
    id, logical_document_id, organization_id, logical_owner_type, logical_owner_id,
    category, display_name, mime_type, file_size_bytes, access_scope, status,
    is_current, version_number, predecessor_version_id, version_note, issued_on,
    expires_on, notes, storage_state, storage_bucket, storage_object_path,
    storage_uploaded_at, metadata_checksum_sha256, created_by_user_id,
    created_by_display_name, created_at, updated_at
  ) values (
    (p_reference ->> 'id')::uuid,
    v_previous.logical_document_id,
    v_organization_id,
    v_previous.logical_owner_type,
    v_previous.logical_owner_id,
    v_previous.category,
    p_reference ->> 'displayName',
    p_reference ->> 'mimeType',
    nullif(p_reference ->> 'fileSizeBytes', '')::bigint,
    v_previous.access_scope,
    'active',
    true,
    v_previous.version_number + 1,
    v_previous.id,
    p_reference ->> 'versionNote',
    nullif(p_reference ->> 'issuedOn', '')::date,
    nullif(p_reference ->> 'expiresOn', '')::date,
    nullif(p_reference ->> 'notes', ''),
    p_reference ->> 'storageState',
    nullif(p_reference ->> 'storageBucket', ''),
    nullif(p_reference ->> 'storageObjectPath', ''),
    nullif(p_reference ->> 'storageUploadedAt', '')::timestamptz,
    p_reference ->> 'metadataChecksumSha256',
    v_actor_id,
    agrocore_private.document_actor_display_name(),
    v_now,
    v_now
  ) returning * into v_result;

  update agrocore_private.document_access
  set authorized_user_ids = v_authorized_user_ids,
      updated_at = v_now
  where organization_id = v_organization_id
    and logical_document_id = v_previous.logical_document_id;
  if not found then raise exception 'AGROCORE_INVALID_STATE'; end if;

  insert into agrocore_private.document_command_receipts (
    organization_id, actor_user_id, operation, idempotency_key, payload_hash, result_version_id
  ) values (
    v_organization_id, v_actor_id, 'replace-version', p_idempotency_key, p_payload_hash, v_result.id
  );
  return v_result;
end;
$$;

create or replace function agrocore_private.archive_document_version(
  p_organization_id uuid,
  p_document_id uuid,
  p_expected_version integer,
  p_archived_at timestamptz,
  p_archived_by_user_id uuid,
  p_idempotency_key text,
  p_payload_hash text
)
returns public.document_versions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_current public.document_versions%rowtype;
  v_receipt agrocore_private.document_command_receipts%rowtype;
begin
  if v_actor_id is null or p_archived_by_user_id is distinct from v_actor_id then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if p_payload_hash is null
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  v_role := agrocore_private.document_member_role(p_organization_id);
  if v_role is null or v_role not in ('owner', 'company_admin', 'manager') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':archive-version:' || p_idempotency_key, 0)
  );
  select * into v_receipt
  from agrocore_private.document_command_receipts
  where organization_id = p_organization_id
    and operation = 'archive-version'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_user_id <> v_actor_id then
      raise exception 'AGROCORE_FORBIDDEN';
    end if;
    if v_receipt.payload_hash <> p_payload_hash then
      raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
    end if;
    select * into strict v_current from public.document_versions where id = v_receipt.result_version_id;
    return v_current;
  end if;

  select * into v_current
  from public.document_versions
  where organization_id = p_organization_id and id = p_document_id
  for update;
  if not found then raise exception 'AGROCORE_REFERENCE_NOT_FOUND'; end if;
  if not v_current.is_current or v_current.version_number is distinct from p_expected_version then
    raise exception 'AGROCORE_VERSION_CONFLICT';
  end if;
  if v_current.status = 'archived' then raise exception 'AGROCORE_VERSION_CONFLICT'; end if;

  update public.document_versions
  set status = 'archived',
      updated_at = v_now,
      archived_at = v_now,
      archived_by_user_id = v_actor_id
  where id = v_current.id
  returning * into v_current;

  insert into agrocore_private.document_command_receipts (
    organization_id, actor_user_id, operation, idempotency_key, payload_hash, result_version_id
  ) values (
    p_organization_id, v_actor_id, 'archive-version', p_idempotency_key, p_payload_hash, v_current.id
  );
  return v_current;
end;
$$;

revoke all on function agrocore_private.create_document_version(jsonb, uuid[], text, text)
  from public, anon, authenticated;
revoke all on function agrocore_private.replace_document_version(jsonb, uuid, integer, uuid[], text, text)
  from public, anon, authenticated;
revoke all on function agrocore_private.archive_document_version(uuid, uuid, integer, timestamptz, uuid, text, text)
  from public, anon, authenticated;

create or replace function public.agrocore_create_document_version(
  p_reference jsonb,
  p_authorized_user_ids uuid[],
  p_idempotency_key text,
  p_payload_hash text
)
returns setof public.document_versions
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.create_document_version(
    p_reference, p_authorized_user_ids, p_idempotency_key, p_payload_hash
  )).*;
$$;

create or replace function public.agrocore_replace_document_version(
  p_reference jsonb,
  p_previous_version_id uuid,
  p_expected_version integer,
  p_authorized_user_ids uuid[],
  p_idempotency_key text,
  p_payload_hash text
)
returns setof public.document_versions
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.replace_document_version(
    p_reference, p_previous_version_id, p_expected_version,
    p_authorized_user_ids, p_idempotency_key, p_payload_hash
  )).*;
$$;

create or replace function public.agrocore_archive_document_version(
  p_organization_id uuid,
  p_document_id uuid,
  p_expected_version integer,
  p_archived_at timestamptz,
  p_archived_by_user_id uuid,
  p_idempotency_key text,
  p_payload_hash text
)
returns setof public.document_versions
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.archive_document_version(
    p_organization_id, p_document_id, p_expected_version, p_archived_at,
    p_archived_by_user_id, p_idempotency_key, p_payload_hash
  )).*;
$$;

revoke all on function public.agrocore_create_document_version(jsonb, uuid[], text, text)
  from public, anon;
revoke all on function public.agrocore_replace_document_version(jsonb, uuid, integer, uuid[], text, text)
  from public, anon;
revoke all on function public.agrocore_archive_document_version(uuid, uuid, integer, timestamptz, uuid, text, text)
  from public, anon;
grant execute on function public.agrocore_create_document_version(jsonb, uuid[], text, text)
  to authenticated;
grant execute on function public.agrocore_replace_document_version(jsonb, uuid, integer, uuid[], text, text)
  to authenticated;
grant execute on function public.agrocore_archive_document_version(uuid, uuid, integer, timestamptz, uuid, text, text)
  to authenticated;

create or replace function agrocore_private.document_storage_object_is_registered(
  target_bucket text,
  target_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_text text := split_part(target_path, '/', 1);
  v_organization_id uuid;
begin
  if v_actor_id is null
    or target_bucket <> 'organization-documents'
    or v_organization_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  v_organization_id := v_organization_text::uuid;
  if agrocore_private.document_member_role(v_organization_id) is null then
    return false;
  end if;

  return exists (
    select 1
    from public.document_versions version
    where version.organization_id = v_organization_id
      and version.storage_bucket = target_bucket
      and version.storage_object_path = target_path
  );
end;
$$;

revoke all on function agrocore_private.document_storage_object_is_registered(text, text)
  from public, anon;
grant execute on function agrocore_private.document_storage_object_is_registered(text, text)
  to authenticated;

-- A leitura exige uma versão autorizada; objetos já registrados são imutáveis.
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
  and exists (
    select 1
    from public.document_versions version
    where version.storage_bucket = bucket_id
      and version.storage_object_path = name
      and (select agrocore_private.can_read_document(
        version.organization_id,
        version.logical_document_id,
        version.access_scope
      ))
  )
);

create policy "agrocore_documents_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-documents'
  and owner_id = (select auth.uid())::text
  and (select agrocore_private.document_storage_path_is_valid(name))
  and (select agrocore_private.has_document_storage_role(
    (storage.foldername(name))[1],
    array['owner', 'company_admin', 'manager', 'project_designer', 'capturer']::text[]
  ))
  and not (select agrocore_private.document_storage_object_is_registered(bucket_id, name))
);

create policy "agrocore_documents_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organization-documents'
  and owner_id = (select auth.uid())::text
  and (select agrocore_private.document_storage_path_is_valid(name))
  and (select agrocore_private.has_document_storage_role(
    (storage.foldername(name))[1],
    array['owner', 'company_admin', 'manager', 'project_designer', 'capturer']::text[]
  ))
  and not (select agrocore_private.document_storage_object_is_registered(bucket_id, name))
)
with check (
  bucket_id = 'organization-documents'
  and owner_id = (select auth.uid())::text
  and (select agrocore_private.document_storage_path_is_valid(name))
  and (select agrocore_private.has_document_storage_role(
    (storage.foldername(name))[1],
    array['owner', 'company_admin', 'manager', 'project_designer', 'capturer']::text[]
  ))
  and not (select agrocore_private.document_storage_object_is_registered(bucket_id, name))
);

create policy "agrocore_documents_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'organization-documents'
  and owner_id = (select auth.uid())::text
  and (select agrocore_private.document_storage_path_is_valid(name))
  and (select agrocore_private.has_document_storage_role(
    (storage.foldername(name))[1],
    array['owner', 'company_admin', 'manager', 'project_designer', 'capturer']::text[]
  ))
  and not (select agrocore_private.document_storage_object_is_registered(bucket_id, name))
);

comment on table public.document_versions
is 'Versões imutáveis de documentos; uma única linha atual por documento lógico.';
comment on function public.agrocore_replace_document_version(jsonb, uuid, integer, uuid[], text, text)
is 'Troca a versão atual sob lock curto e preserva toda a linhagem anterior.';
