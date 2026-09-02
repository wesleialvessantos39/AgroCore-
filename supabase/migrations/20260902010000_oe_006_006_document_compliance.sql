-- OE-006.006 — validades configuráveis, compartilhamentos temporários e
-- exportações auditadas. Tokens em texto puro nunca chegam ao banco.

create table if not exists public.document_alert_policies (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  warning_days integer not null check (warning_days between 1 and 3650),
  critical_days integer not null check (critical_days between 0 and 365),
  version_number integer not null check (version_number > 0),
  updated_by_user_id uuid not null,
  updated_by_display_name text not null check (
    length(btrim(updated_by_display_name)) between 3 and 120
  ),
  updated_at timestamptz not null,
  constraint document_alert_policy_windows_valid check (critical_days <= warning_days)
);

create table if not exists public.document_share_grants (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null references public.document_versions(id) on delete restrict,
  logical_document_id uuid not null,
  document_display_name text not null check (
    length(btrim(document_display_name)) between 3 and 120
  ),
  purpose text not null check (length(btrim(purpose)) between 3 and 240),
  status text not null check (status in ('active', 'revoked', 'expired', 'exhausted')),
  expires_at timestamptz not null,
  max_accesses integer not null check (max_accesses between 1 and 20),
  access_count integer not null default 0 check (access_count between 0 and max_accesses),
  created_by_user_id uuid not null,
  created_by_display_name text not null check (
    length(btrim(created_by_display_name)) between 3 and 120
  ),
  created_at timestamptz not null,
  last_accessed_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  revocation_reason text check (
    revocation_reason is null or length(btrim(revocation_reason)) between 3 and 240
  ),
  constraint document_share_revocation_valid check (
    (
      status = 'revoked'
      and revoked_at is not null
      and revoked_by_user_id is not null
      and revocation_reason is not null
    )
    or (
      status <> 'revoked'
      and revoked_at is null
      and revoked_by_user_id is null
      and revocation_reason is null
    )
  ),
  constraint document_share_exhaustion_valid check (
    status <> 'exhausted' or access_count = max_accesses
  )
);

create index if not exists document_share_grants_org_list_idx
  on public.document_share_grants (organization_id, created_at desc, id);

create index if not exists document_share_grants_active_expiry_idx
  on public.document_share_grants (organization_id, expires_at, id)
  where status = 'active';

create index if not exists document_share_grants_document_idx
  on public.document_share_grants (document_id, created_at desc);

create table if not exists agrocore_private.document_share_tokens (
  share_id uuid primary key references public.document_share_grants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (organization_id, share_id)
);

revoke all on table agrocore_private.document_share_tokens
  from public, anon, authenticated;

create table if not exists public.document_export_audits (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_count integer not null check (document_count between 1 and 20),
  purpose text not null check (length(btrim(purpose)) between 3 and 240),
  status text not null check (status in ('preparing', 'completed', 'failed')),
  requested_by_user_id uuid not null,
  requested_by_display_name text not null check (
    length(btrim(requested_by_display_name)) between 3 and 120
  ),
  requested_at timestamptz not null,
  completed_at timestamptz,
  file_size_bytes bigint check (file_size_bytes between 1 and 105000000),
  checksum_sha256 text check (
    checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'
  ),
  failure_reason text check (
    failure_reason is null or length(btrim(failure_reason)) between 3 and 240
  ),
  constraint document_export_result_valid check (
    (
      status = 'preparing'
      and completed_at is null
      and file_size_bytes is null
      and checksum_sha256 is null
      and failure_reason is null
    )
    or (
      status = 'completed'
      and completed_at is not null
      and file_size_bytes is not null
      and checksum_sha256 is not null
      and failure_reason is null
    )
    or (
      status = 'failed'
      and completed_at is not null
      and file_size_bytes is null
      and checksum_sha256 is null
      and failure_reason is not null
    )
  )
);

create index if not exists document_export_audits_org_list_idx
  on public.document_export_audits (organization_id, requested_at desc, id);

create index if not exists document_export_audits_requester_idx
  on public.document_export_audits (
    organization_id, requested_by_user_id, requested_at desc
  );

create table if not exists public.document_export_items (
  export_id uuid not null references public.document_export_audits(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null references public.document_versions(id) on delete restrict,
  position integer not null check (position between 1 and 20),
  primary key (export_id, document_id),
  unique (export_id, position)
);

create index if not exists document_export_items_document_idx
  on public.document_export_items (document_id, export_id);

create index if not exists document_export_items_organization_idx
  on public.document_export_items (organization_id, export_id);

create table if not exists agrocore_private.document_compliance_command_receipts (
  organization_id uuid not null,
  actor_user_id uuid not null,
  operation text not null check (
    operation in ('configure-alert-policy', 'create-share', 'revoke-share', 'create-export')
  ),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  result_policy_organization_id uuid references public.document_alert_policies(organization_id) on delete restrict,
  result_share_id uuid references public.document_share_grants(id) on delete restrict,
  result_export_id uuid references public.document_export_audits(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  constraint document_compliance_receipt_result_valid check (
    (
      operation = 'configure-alert-policy'
      and result_policy_organization_id is not null
      and result_share_id is null
      and result_export_id is null
    )
    or (
      operation in ('create-share', 'revoke-share')
      and result_policy_organization_id is null
      and result_share_id is not null
      and result_export_id is null
    )
    or (
      operation = 'create-export'
      and result_policy_organization_id is null
      and result_share_id is null
      and result_export_id is not null
    )
  ),
  primary key (organization_id, operation, idempotency_key)
);

revoke all on table agrocore_private.document_compliance_command_receipts
  from public, anon, authenticated;

create index if not exists document_compliance_receipts_policy_idx
  on agrocore_private.document_compliance_command_receipts (result_policy_organization_id)
  where result_policy_organization_id is not null;

create index if not exists document_compliance_receipts_share_idx
  on agrocore_private.document_compliance_command_receipts (result_share_id)
  where result_share_id is not null;

create index if not exists document_compliance_receipts_export_idx
  on agrocore_private.document_compliance_command_receipts (result_export_id)
  where result_export_id is not null;

create or replace function agrocore_private.can_read_document_compliance(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select agrocore_private.document_member_role(target_organization_id)
    in ('owner', 'company_admin', 'manager', 'project_designer', 'finance', 'capturer');
$$;

create or replace function agrocore_private.can_read_document_share(
  target_organization_id uuid,
  target_created_by_user_id uuid,
  target_logical_document_id uuid,
  target_document_id uuid
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
  if v_role not in ('project_designer', 'capturer')
    or v_actor_id is distinct from target_created_by_user_id then
    return false;
  end if;
  return exists (
    select 1
    from public.document_versions document
    where document.organization_id = target_organization_id
      and document.logical_document_id = target_logical_document_id
      and document.id = target_document_id
      and agrocore_private.can_read_document(
        document.organization_id,
        document.logical_document_id,
        document.access_scope
      )
  );
end;
$$;

create or replace function agrocore_private.can_read_document_export(
  target_organization_id uuid,
  target_requested_by_user_id uuid
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
  return v_role in ('project_designer', 'finance', 'capturer')
    and v_actor_id = target_requested_by_user_id;
end;
$$;

revoke all on function agrocore_private.can_read_document_compliance(uuid)
  from public, anon;
revoke all on function agrocore_private.can_read_document_share(uuid, uuid, uuid, uuid)
  from public, anon;
revoke all on function agrocore_private.can_read_document_export(uuid, uuid)
  from public, anon;
grant execute on function agrocore_private.can_read_document_compliance(uuid)
  to authenticated;
grant execute on function agrocore_private.can_read_document_share(uuid, uuid, uuid, uuid)
  to authenticated;
grant execute on function agrocore_private.can_read_document_export(uuid, uuid)
  to authenticated;

alter table public.document_alert_policies enable row level security;
alter table public.document_share_grants enable row level security;
alter table public.document_export_audits enable row level security;
alter table public.document_export_items enable row level security;

drop policy if exists "agrocore_document_alert_policies_select"
  on public.document_alert_policies;
create policy "agrocore_document_alert_policies_select"
on public.document_alert_policies
for select
to authenticated
using (
  (select agrocore_private.can_read_document_compliance(organization_id))
);

drop policy if exists "agrocore_document_share_grants_select"
  on public.document_share_grants;
create policy "agrocore_document_share_grants_select"
on public.document_share_grants
for select
to authenticated
using (
  (select agrocore_private.can_read_document_share(
    organization_id,
    created_by_user_id,
    logical_document_id,
    document_id
  ))
);

drop policy if exists "agrocore_document_export_audits_select"
  on public.document_export_audits;
create policy "agrocore_document_export_audits_select"
on public.document_export_audits
for select
to authenticated
using (
  (select agrocore_private.can_read_document_export(
    organization_id,
    requested_by_user_id
  ))
);

drop policy if exists "agrocore_document_export_items_select"
  on public.document_export_items;
create policy "agrocore_document_export_items_select"
on public.document_export_items
for select
to authenticated
using (
  exists (
    select 1
    from public.document_export_audits audit
    where audit.id = document_export_items.export_id
      and audit.organization_id = document_export_items.organization_id
      and agrocore_private.can_read_document_export(
        audit.organization_id,
        audit.requested_by_user_id
      )
  )
);

revoke all on table public.document_alert_policies
  from public, anon, authenticated;
revoke all on table public.document_share_grants
  from public, anon, authenticated;
revoke all on table public.document_export_audits
  from public, anon, authenticated;
revoke all on table public.document_export_items
  from public, anon, authenticated;

grant select on table public.document_alert_policies to authenticated;
grant select on table public.document_share_grants to authenticated;
grant select on table public.document_export_audits to authenticated;
grant select on table public.document_export_items to authenticated;

create or replace function agrocore_private.configure_document_alert_policy(
  p_policy jsonb,
  p_expected_version integer,
  p_idempotency_key text,
  p_payload_hash text
)
returns public.document_alert_policies
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid := (p_policy ->> 'organizationId')::uuid;
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_receipt agrocore_private.document_compliance_command_receipts%rowtype;
  v_current public.document_alert_policies%rowtype;
  v_result public.document_alert_policies%rowtype;
begin
  if v_actor_id is null then raise exception 'AGROCORE_FORBIDDEN'; end if;
  if p_policy is null
    or jsonb_typeof(p_policy) is distinct from 'object'
    or p_expected_version is null
    or p_expected_version < 0
    or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 200
    or p_payload_hash is null
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or (p_policy ->> 'warningDays')::integer not between 1 and 3650
    or (p_policy ->> 'criticalDays')::integer not between 0 and 365
    or (p_policy ->> 'criticalDays')::integer > (p_policy ->> 'warningDays')::integer then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  v_role := agrocore_private.document_member_role(v_organization_id);
  if v_role not in ('owner', 'company_admin', 'manager') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if (p_policy ->> 'updatedByUserId') is distinct from v_actor_id::text
    or (p_policy ->> 'versionNumber')::integer is distinct from p_expected_version + 1 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':alert-policy', 0)
  );
  select * into v_receipt
  from agrocore_private.document_compliance_command_receipts
  where organization_id = v_organization_id
    and operation = 'configure-alert-policy'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_user_id <> v_actor_id then raise exception 'AGROCORE_FORBIDDEN'; end if;
    if v_receipt.payload_hash <> p_payload_hash then
      raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
    end if;
    select * into strict v_result
    from public.document_alert_policies
    where organization_id = v_receipt.result_policy_organization_id;
    return v_result;
  end if;

  select * into v_current
  from public.document_alert_policies
  where organization_id = v_organization_id
  for update;
  if coalesce(v_current.version_number, 0) is distinct from p_expected_version then
    raise exception 'AGROCORE_VERSION_CONFLICT';
  end if;

  insert into public.document_alert_policies (
    organization_id, warning_days, critical_days, version_number,
    updated_by_user_id, updated_by_display_name, updated_at
  ) values (
    v_organization_id,
    (p_policy ->> 'warningDays')::integer,
    (p_policy ->> 'criticalDays')::integer,
    p_expected_version + 1,
    v_actor_id,
    agrocore_private.document_actor_display_name(),
    v_now
  )
  on conflict (organization_id) do update
  set warning_days = excluded.warning_days,
      critical_days = excluded.critical_days,
      version_number = excluded.version_number,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_by_display_name = excluded.updated_by_display_name,
      updated_at = excluded.updated_at
  returning * into v_result;

  insert into agrocore_private.document_compliance_command_receipts (
    organization_id, actor_user_id, operation, idempotency_key, payload_hash,
    result_policy_organization_id
  ) values (
    v_organization_id, v_actor_id, 'configure-alert-policy', p_idempotency_key,
    p_payload_hash, v_organization_id
  );
  return v_result;
end;
$$;

create or replace function agrocore_private.create_document_share(
  p_grant jsonb,
  p_token_hash text,
  p_idempotency_key text,
  p_payload_hash text
)
returns public.document_share_grants
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid := (p_grant ->> 'organizationId')::uuid;
  v_share_id uuid := (p_grant ->> 'id')::uuid;
  v_document_id uuid := (p_grant ->> 'documentId')::uuid;
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz := (p_grant ->> 'expiresAt')::timestamptz;
  v_document public.document_versions%rowtype;
  v_receipt agrocore_private.document_compliance_command_receipts%rowtype;
  v_result public.document_share_grants%rowtype;
begin
  if v_actor_id is null then raise exception 'AGROCORE_FORBIDDEN'; end if;
  if p_grant is null
    or jsonb_typeof(p_grant) is distinct from 'object'
    or p_token_hash is null
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_payload_hash is null
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 200
    or (p_grant ->> 'maxAccesses')::integer not between 1 and 20
    or length(btrim(p_grant ->> 'purpose')) not between 3 and 240 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  v_role := agrocore_private.document_member_role(v_organization_id);
  if v_role not in ('owner', 'company_admin', 'manager', 'project_designer', 'capturer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if (p_grant ->> 'createdByUserId') is distinct from v_actor_id::text
    or (p_grant ->> 'status') is distinct from 'active'
    or (p_grant ->> 'accessCount')::integer is distinct from 0
    -- A validade é calculada antes da ida à rede; a tolerância evita rejeitar
    -- um acesso solicitado por cinco minutos por causa do tempo de transporte.
    or v_expires_at < v_now + interval '4 minutes'
    or v_expires_at > v_now + interval '7 days' then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':create-share:' || p_idempotency_key, 0)
  );
  select * into v_receipt
  from agrocore_private.document_compliance_command_receipts
  where organization_id = v_organization_id
    and operation = 'create-share'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_user_id <> v_actor_id then raise exception 'AGROCORE_FORBIDDEN'; end if;
    if v_receipt.payload_hash <> p_payload_hash then
      raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
    end if;
    select * into strict v_result
    from public.document_share_grants
    where id = v_receipt.result_share_id;
    return v_result;
  end if;

  select * into v_document
  from public.document_versions document
  where document.organization_id = v_organization_id
    and document.id = v_document_id
    and document.is_current
    and document.status = 'active'
    and document.storage_state = 'stored'
  for share;
  if not found then raise exception 'AGROCORE_REFERENCE_NOT_FOUND'; end if;
  if not agrocore_private.can_read_document(
    v_document.organization_id,
    v_document.logical_document_id,
    v_document.access_scope
  ) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if v_document.expires_on is not null
    and (
      v_document.expires_on < (v_now at time zone 'UTC')::date
      or v_expires_at > (v_document.expires_on::timestamp + interval '1 day') at time zone 'UTC'
    ) then
    raise exception 'AGROCORE_DOCUMENT_EXPIRED';
  end if;
  if (p_grant ->> 'logicalDocumentId')::uuid is distinct from v_document.logical_document_id
    or (p_grant ->> 'documentDisplayName') is distinct from v_document.display_name then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  insert into public.document_share_grants (
    id, organization_id, document_id, logical_document_id, document_display_name,
    purpose, status, expires_at, max_accesses, access_count,
    created_by_user_id, created_by_display_name, created_at
  ) values (
    v_share_id, v_organization_id, v_document.id, v_document.logical_document_id,
    v_document.display_name, p_grant ->> 'purpose', 'active', v_expires_at,
    (p_grant ->> 'maxAccesses')::integer, 0, v_actor_id,
    agrocore_private.document_actor_display_name(), v_now
  ) returning * into v_result;

  insert into agrocore_private.document_share_tokens (
    share_id, organization_id, token_hash, created_at
  ) values (v_result.id, v_organization_id, p_token_hash, v_now);

  insert into agrocore_private.document_compliance_command_receipts (
    organization_id, actor_user_id, operation, idempotency_key, payload_hash,
    result_share_id
  ) values (
    v_organization_id, v_actor_id, 'create-share', p_idempotency_key,
    p_payload_hash, v_result.id
  );
  return v_result;
end;
$$;

create or replace function agrocore_private.revoke_document_share(
  p_organization_id uuid,
  p_share_id uuid,
  p_reason text,
  p_expected_access_count integer,
  p_idempotency_key text,
  p_payload_hash text
)
returns public.document_share_grants
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_receipt agrocore_private.document_compliance_command_receipts%rowtype;
  v_result public.document_share_grants%rowtype;
begin
  if v_actor_id is null then raise exception 'AGROCORE_FORBIDDEN'; end if;
  if p_reason is null
    or length(btrim(p_reason)) not between 3 and 240
    or p_expected_access_count not between 0 and 20
    or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 200
    or p_payload_hash is null
    or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  v_role := agrocore_private.document_member_role(p_organization_id);
  if v_role not in ('owner', 'company_admin', 'manager', 'project_designer', 'capturer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':revoke-share:' || p_idempotency_key, 0)
  );
  select * into v_receipt
  from agrocore_private.document_compliance_command_receipts
  where organization_id = p_organization_id
    and operation = 'revoke-share'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_user_id <> v_actor_id then raise exception 'AGROCORE_FORBIDDEN'; end if;
    if v_receipt.payload_hash <> p_payload_hash then
      raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
    end if;
    select * into strict v_result
    from public.document_share_grants
    where id = v_receipt.result_share_id;
    return v_result;
  end if;

  select * into v_result
  from public.document_share_grants
  where organization_id = p_organization_id and id = p_share_id
  for update;
  if not found then raise exception 'AGROCORE_SHARE_NOT_FOUND'; end if;
  if v_role not in ('owner', 'company_admin', 'manager')
    and v_result.created_by_user_id <> v_actor_id then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if v_result.status <> 'active' then raise exception 'AGROCORE_INVALID_STATE'; end if;
  if v_result.access_count is distinct from p_expected_access_count then
    raise exception 'AGROCORE_VERSION_CONFLICT';
  end if;

  update public.document_share_grants
  set status = 'revoked',
      revoked_at = v_now,
      revoked_by_user_id = v_actor_id,
      revocation_reason = btrim(p_reason)
  where id = v_result.id
  returning * into v_result;

  insert into agrocore_private.document_compliance_command_receipts (
    organization_id, actor_user_id, operation, idempotency_key, payload_hash,
    result_share_id
  ) values (
    p_organization_id, v_actor_id, 'revoke-share', p_idempotency_key,
    p_payload_hash, v_result.id
  );
  return v_result;
end;
$$;

create or replace function agrocore_private.create_document_export(
  p_audit jsonb,
  p_document_ids uuid[],
  p_idempotency_key text,
  p_payload_hash text
)
returns public.document_export_audits
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid := (p_audit ->> 'organizationId')::uuid;
  v_export_id uuid := (p_audit ->> 'id')::uuid;
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_document_id uuid;
  v_document public.document_versions%rowtype;
  v_total_bytes bigint := 0;
  v_receipt agrocore_private.document_compliance_command_receipts%rowtype;
  v_result public.document_export_audits%rowtype;
begin
  if v_actor_id is null then raise exception 'AGROCORE_FORBIDDEN'; end if;
  if p_audit is null
    or jsonb_typeof(p_audit) is distinct from 'object'
    or p_document_ids is null
    or cardinality(p_document_ids) not between 1 and 20
    or cardinality(p_document_ids) <> (select count(distinct item) from unnest(p_document_ids) item)
    or array_position(p_document_ids, null) is not null
    or length(btrim(p_audit ->> 'purpose')) not between 3 and 240
    or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 200
    or p_payload_hash is null
    or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  v_role := agrocore_private.document_member_role(v_organization_id);
  if v_role not in ('owner', 'company_admin', 'manager', 'project_designer', 'finance', 'capturer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if (p_audit ->> 'requestedByUserId') is distinct from v_actor_id::text
    or (p_audit ->> 'status') is distinct from 'preparing'
    or (p_audit ->> 'documentCount')::integer is distinct from cardinality(p_document_ids) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':create-export:' || p_idempotency_key, 0)
  );
  select * into v_receipt
  from agrocore_private.document_compliance_command_receipts
  where organization_id = v_organization_id
    and operation = 'create-export'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_user_id <> v_actor_id then raise exception 'AGROCORE_FORBIDDEN'; end if;
    if v_receipt.payload_hash <> p_payload_hash then
      raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
    end if;
    select * into strict v_result
    from public.document_export_audits
    where id = v_receipt.result_export_id;
    return v_result;
  end if;

  foreach v_document_id in array p_document_ids loop
    select * into v_document
    from public.document_versions document
    where document.organization_id = v_organization_id
      and document.id = v_document_id
      and document.is_current
      and document.status = 'active'
      and document.storage_state = 'stored';
    if not found then raise exception 'AGROCORE_REFERENCE_NOT_FOUND'; end if;
    if not agrocore_private.can_read_document(
      v_document.organization_id,
      v_document.logical_document_id,
      v_document.access_scope
    ) then
      raise exception 'AGROCORE_FORBIDDEN';
    end if;
    if v_document.expires_on is not null
      and v_document.expires_on < (v_now at time zone 'UTC')::date then
      raise exception 'AGROCORE_DOCUMENT_EXPIRED';
    end if;
    v_total_bytes := v_total_bytes + v_document.file_size_bytes;
    if v_total_bytes > 104857600 then raise exception 'AGROCORE_INVALID_INPUT'; end if;
  end loop;

  insert into public.document_export_audits (
    id, organization_id, document_count, purpose, status,
    requested_by_user_id, requested_by_display_name, requested_at
  ) values (
    v_export_id, v_organization_id, cardinality(p_document_ids),
    p_audit ->> 'purpose', 'preparing', v_actor_id,
    agrocore_private.document_actor_display_name(), v_now
  ) returning * into v_result;

  insert into public.document_export_items (
    export_id, organization_id, document_id, position
  )
  select v_result.id, v_organization_id, selected.document_id, selected.position::integer
  from unnest(p_document_ids) with ordinality as selected(document_id, position);

  insert into agrocore_private.document_compliance_command_receipts (
    organization_id, actor_user_id, operation, idempotency_key, payload_hash,
    result_export_id
  ) values (
    v_organization_id, v_actor_id, 'create-export', p_idempotency_key,
    p_payload_hash, v_result.id
  );
  return v_result;
end;
$$;

create or replace function agrocore_private.complete_document_export(
  p_organization_id uuid,
  p_export_id uuid,
  p_file_size_bytes bigint,
  p_checksum_sha256 text
)
returns public.document_export_audits
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_result public.document_export_audits%rowtype;
begin
  if v_actor_id is null
    or p_file_size_bytes not between 1 and 105000000
    or p_checksum_sha256 is null
    or p_checksum_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  select * into v_result
  from public.document_export_audits
  where organization_id = p_organization_id and id = p_export_id
  for update;
  if not found then raise exception 'AGROCORE_REFERENCE_NOT_FOUND'; end if;
  if v_result.requested_by_user_id <> v_actor_id then raise exception 'AGROCORE_FORBIDDEN'; end if;
  if v_result.status <> 'preparing' then raise exception 'AGROCORE_INVALID_STATE'; end if;
  update public.document_export_audits
  set status = 'completed',
      completed_at = clock_timestamp(),
      file_size_bytes = p_file_size_bytes,
      checksum_sha256 = p_checksum_sha256
  where id = v_result.id
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function agrocore_private.fail_document_export(
  p_organization_id uuid,
  p_export_id uuid,
  p_failure_reason text
)
returns public.document_export_audits
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_result public.document_export_audits%rowtype;
begin
  if v_actor_id is null
    or p_failure_reason is null
    or length(btrim(p_failure_reason)) not between 3 and 240 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  select * into v_result
  from public.document_export_audits
  where organization_id = p_organization_id and id = p_export_id
  for update;
  if not found then raise exception 'AGROCORE_REFERENCE_NOT_FOUND'; end if;
  if v_result.requested_by_user_id <> v_actor_id then raise exception 'AGROCORE_FORBIDDEN'; end if;
  if v_result.status <> 'preparing' then raise exception 'AGROCORE_INVALID_STATE'; end if;
  update public.document_export_audits
  set status = 'failed',
      completed_at = clock_timestamp(),
      failure_reason = btrim(p_failure_reason)
  where id = v_result.id
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function agrocore_private.redeem_document_share(
  p_token_hash text
)
returns table (
  storage_bucket text,
  storage_object_path text,
  display_name text,
  mime_type text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_grant public.document_share_grants%rowtype;
  v_document public.document_versions%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'AGROCORE_SHARE_NOT_FOUND';
  end if;
  select grant_row.* into v_grant
  from agrocore_private.document_share_tokens token
  join public.document_share_grants grant_row on grant_row.id = token.share_id
  where token.token_hash = p_token_hash
  for update of grant_row;
  if not found
    or v_grant.status <> 'active'
    or v_grant.expires_at <= v_now
    or v_grant.access_count >= v_grant.max_accesses then
    raise exception 'AGROCORE_SHARE_NOT_FOUND';
  end if;

  select * into v_document
  from public.document_versions document
  where document.organization_id = v_grant.organization_id
    and document.id = v_grant.document_id
    and document.logical_document_id = v_grant.logical_document_id
    and document.is_current
    and document.status = 'active'
    and document.storage_state = 'stored';
  if not found
    or (
      v_document.expires_on is not null
      and v_document.expires_on < (v_now at time zone 'UTC')::date
    ) then
    raise exception 'AGROCORE_SHARE_NOT_FOUND';
  end if;

  update public.document_share_grants
  set access_count = access_count + 1,
      last_accessed_at = v_now,
      status = case
        when access_count + 1 >= max_accesses then 'exhausted'
        else 'active'
      end
  where id = v_grant.id;

  return query select
    v_document.storage_bucket,
    v_document.storage_object_path,
    v_document.display_name,
    v_document.mime_type;
end;
$$;

revoke all on function agrocore_private.configure_document_alert_policy(jsonb, integer, text, text)
  from public, anon, authenticated;
revoke all on function agrocore_private.create_document_share(jsonb, text, text, text)
  from public, anon, authenticated;
revoke all on function agrocore_private.revoke_document_share(uuid, uuid, text, integer, text, text)
  from public, anon, authenticated;
revoke all on function agrocore_private.create_document_export(jsonb, uuid[], text, text)
  from public, anon, authenticated;
revoke all on function agrocore_private.complete_document_export(uuid, uuid, bigint, text)
  from public, anon, authenticated;
revoke all on function agrocore_private.fail_document_export(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function agrocore_private.redeem_document_share(text)
  from public, anon, authenticated;

create or replace function public.agrocore_configure_document_alert_policy(
  p_policy jsonb,
  p_expected_version integer,
  p_idempotency_key text,
  p_payload_hash text
)
returns setof public.document_alert_policies
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.configure_document_alert_policy(
    p_policy, p_expected_version, p_idempotency_key, p_payload_hash
  )).*;
$$;

create or replace function public.agrocore_create_document_share(
  p_grant jsonb,
  p_token_hash text,
  p_idempotency_key text,
  p_payload_hash text
)
returns setof public.document_share_grants
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.create_document_share(
    p_grant, p_token_hash, p_idempotency_key, p_payload_hash
  )).*;
$$;

create or replace function public.agrocore_revoke_document_share(
  p_organization_id uuid,
  p_share_id uuid,
  p_reason text,
  p_expected_access_count integer,
  p_idempotency_key text,
  p_payload_hash text
)
returns setof public.document_share_grants
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.revoke_document_share(
    p_organization_id, p_share_id, p_reason, p_expected_access_count,
    p_idempotency_key, p_payload_hash
  )).*;
$$;

create or replace function public.agrocore_create_document_export(
  p_audit jsonb,
  p_document_ids uuid[],
  p_idempotency_key text,
  p_payload_hash text
)
returns setof public.document_export_audits
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.create_document_export(
    p_audit, p_document_ids, p_idempotency_key, p_payload_hash
  )).*;
$$;

create or replace function public.agrocore_complete_document_export(
  p_organization_id uuid,
  p_export_id uuid,
  p_file_size_bytes bigint,
  p_checksum_sha256 text
)
returns setof public.document_export_audits
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.complete_document_export(
    p_organization_id, p_export_id, p_file_size_bytes, p_checksum_sha256
  )).*;
$$;

create or replace function public.agrocore_fail_document_export(
  p_organization_id uuid,
  p_export_id uuid,
  p_failure_reason text
)
returns setof public.document_export_audits
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.fail_document_export(
    p_organization_id, p_export_id, p_failure_reason
  )).*;
$$;

create or replace function public.agrocore_redeem_document_share(
  p_token_hash text
)
returns table (
  storage_bucket text,
  storage_object_path text,
  display_name text,
  mime_type text
)
language sql
volatile
security definer
set search_path = ''
as $$
  select * from agrocore_private.redeem_document_share(p_token_hash);
$$;

revoke all on function public.agrocore_configure_document_alert_policy(jsonb, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.agrocore_create_document_share(jsonb, text, text, text)
  from public, anon, authenticated;
revoke all on function public.agrocore_revoke_document_share(uuid, uuid, text, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.agrocore_create_document_export(jsonb, uuid[], text, text)
  from public, anon, authenticated;
revoke all on function public.agrocore_complete_document_export(uuid, uuid, bigint, text)
  from public, anon, authenticated;
revoke all on function public.agrocore_fail_document_export(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.agrocore_redeem_document_share(text)
  from public, anon, authenticated;

grant execute on function public.agrocore_configure_document_alert_policy(jsonb, integer, text, text)
  to authenticated;
grant execute on function public.agrocore_create_document_share(jsonb, text, text, text)
  to authenticated;
grant execute on function public.agrocore_revoke_document_share(uuid, uuid, text, integer, text, text)
  to authenticated;
grant execute on function public.agrocore_create_document_export(jsonb, uuid[], text, text)
  to authenticated;
grant execute on function public.agrocore_complete_document_export(uuid, uuid, bigint, text)
  to authenticated;
grant execute on function public.agrocore_fail_document_export(uuid, uuid, text)
  to authenticated;
grant execute on function public.agrocore_redeem_document_share(text)
  to service_role;

comment on table public.document_alert_policies
is 'Janelas versionadas de alerta de validade por organização.';
comment on table public.document_share_grants
is 'Autorizações revogáveis para um único arquivo; o token permanece fora desta tabela.';
comment on table public.document_export_audits
is 'Trilha imutável da seleção e do resultado de cada exportação documental.';
