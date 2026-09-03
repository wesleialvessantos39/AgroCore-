
-- AgroCore — OE-008.001 R2 — idempotência de comandos, retries e recorrência semanal explícita.

create table if not exists agrocore_private.schedule_item_command_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  schedule_item_id uuid not null references public.schedule_items(id) on delete restrict,
  command_type text not null check (command_type in ('create','update')),
  command_key text not null check (char_length(btrim(command_key)) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint) = 64),
  result_version integer not null check (result_version >= 1),
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, command_key)
);

create index if not exists schedule_item_command_receipts_item_fk_idx
  on agrocore_private.schedule_item_command_receipts (schedule_item_id);

revoke all on agrocore_private.schedule_item_command_receipts
  from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.schedule_items
    where create_idempotency_key is not null
  ) then
    raise exception 'AGROCORE_SCHEDULE_LEGACY_IDEMPOTENCY_DATA_PRESENT';
  end if;
end;
$$;

drop index if exists public.schedule_items_org_idempotency_uq;

alter table public.schedule_items
  drop constraint if exists schedule_items_create_fingerprint_check,
  drop constraint if exists schedule_items_create_idempotency_key_check,
  drop column if exists create_fingerprint,
  drop column if exists create_idempotency_key;

create or replace function agrocore_private.is_valid_schedule_recurrence(
  p_recurrence jsonb
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_frequency text;
  v_interval integer;
  v_weekdays jsonb;
  v_ends_at text;
  v_day jsonb;
  v_day_integer integer;
  v_seen integer[] := '{}'::integer[];
begin
  if p_recurrence is null or jsonb_typeof(p_recurrence) <> 'object' then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_recurrence) as key_name
    where key_name not in ('frequency','interval','weekdays','endsAt')
  ) then
    return false;
  end if;

  v_frequency := p_recurrence ->> 'frequency';
  if v_frequency not in ('none','daily','weekly','monthly','yearly') then
    return false;
  end if;

  begin
    v_interval := (p_recurrence ->> 'interval')::integer;
  exception when others then
    return false;
  end;

  if v_interval not between 1 and 365 then
    return false;
  end if;

  v_weekdays := coalesce(p_recurrence -> 'weekdays', '[]'::jsonb);
  if jsonb_typeof(v_weekdays) <> 'array'
     or jsonb_array_length(v_weekdays) > 7 then
    return false;
  end if;

  if v_frequency = 'weekly' and jsonb_array_length(v_weekdays) = 0 then
    return false;
  end if;

  if v_frequency <> 'weekly' and jsonb_array_length(v_weekdays) > 0 then
    return false;
  end if;

  for v_day in select value from jsonb_array_elements(v_weekdays)
  loop
    if jsonb_typeof(v_day) <> 'number' then
      return false;
    end if;

    begin
      v_day_integer := (v_day::text)::integer;
    exception when others then
      return false;
    end;

    if v_day_integer not between 0 and 6
       or v_day_integer = any(v_seen) then
      return false;
    end if;

    v_seen := array_append(v_seen, v_day_integer);
  end loop;

  v_ends_at := nullif(btrim(coalesce(p_recurrence ->> 'endsAt','')), '');
  if v_ends_at is not null then
    begin
      perform v_ends_at::timestamptz;
    exception when others then
      return false;
    end;
  end if;

  return true;
end;
$$;

revoke all on function agrocore_private.is_valid_schedule_recurrence(jsonb)
  from public, anon, authenticated;

create or replace function public.agrocore_create_schedule_item(
  p_organization_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
returns public.schedule_items
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_kind text;
  v_title text;
  v_description text;
  v_priority text;
  v_time_zone text;
  v_due_at timestamptz;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_recurrence jsonb;
  v_frequency text;
  v_recurrence_ends_at timestamptz;
  v_fingerprint text;
  v_receipt agrocore_private.schedule_item_command_receipts%rowtype;
  v_existing public.schedule_items%rowtype;
  v_created public.schedule_items%rowtype;
begin
  if v_actor is null
     or p_organization_id is null
     or not agrocore_private.can_manage_schedule(p_organization_id) then
    raise exception 'AGROCORE_SCHEDULE_FORBIDDEN';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) as key_name
    where key_name not in (
      'kind','title','description','priority','timeZone',
      'dueAt','startsAt','endsAt','recurrence'
    )
  ) then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end if;

  if p_idempotency_key is null
     or char_length(btrim(p_idempotency_key)) not between 8 and 200 then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end if;

  v_kind := p_payload ->> 'kind';
  v_title := btrim(coalesce(p_payload ->> 'title',''));
  v_description := nullif(btrim(coalesce(p_payload ->> 'description','')), '');
  v_priority := coalesce(nullif(btrim(coalesce(p_payload ->> 'priority','')), ''), 'medium');
  v_time_zone := btrim(coalesce(p_payload ->> 'timeZone',''));
  v_recurrence := coalesce(
    p_payload -> 'recurrence',
    '{"frequency":"none","interval":1,"weekdays":[],"endsAt":null}'::jsonb
  );

  if v_kind not in ('task','appointment')
     or char_length(v_title) not between 3 and 160
     or (v_description is not null and char_length(v_description) > 2000)
     or v_priority not in ('low','medium','high','urgent')
     or char_length(v_time_zone) not between 1 and 120
     or not exists (
       select 1 from pg_catalog.pg_timezone_names where name = v_time_zone
     )
     or not agrocore_private.is_valid_schedule_recurrence(v_recurrence) then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end if;

  begin
    v_due_at := case
      when nullif(btrim(coalesce(p_payload ->> 'dueAt','')), '') is null then null
      else (p_payload ->> 'dueAt')::timestamptz
    end;
    v_starts_at := case
      when nullif(btrim(coalesce(p_payload ->> 'startsAt','')), '') is null then null
      else (p_payload ->> 'startsAt')::timestamptz
    end;
    v_ends_at := case
      when nullif(btrim(coalesce(p_payload ->> 'endsAt','')), '') is null then null
      else (p_payload ->> 'endsAt')::timestamptz
    end;
    v_recurrence_ends_at := case
      when nullif(btrim(coalesce(v_recurrence ->> 'endsAt','')), '') is null then null
      else (v_recurrence ->> 'endsAt')::timestamptz
    end;
  exception when others then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end;

  if v_kind = 'task' then
    if v_starts_at is not null or v_ends_at is not null then
      raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
    end if;
  else
    if v_due_at is not null
       or v_starts_at is null
       or v_ends_at is null
       or v_ends_at <= v_starts_at then
      raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
    end if;
  end if;

  v_frequency := v_recurrence ->> 'frequency';
  if v_frequency <> 'none' then
    if (v_kind = 'task' and v_due_at is null)
       or (v_kind = 'appointment' and v_starts_at is null) then
      raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
    end if;
    if v_recurrence_ends_at is not null
       and v_recurrence_ends_at <= coalesce(v_due_at, v_starts_at) then
      raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
    end if;
  end if;

  v_fingerprint := encode(
    extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || btrim(p_idempotency_key),
      0
    )
  );

  select *
  into v_receipt
  from agrocore_private.schedule_item_command_receipts r
  where r.organization_id = p_organization_id
    and r.command_key = btrim(p_idempotency_key);

  if found then
    if v_receipt.command_type <> 'create'
       or v_receipt.request_fingerprint is distinct from v_fingerprint then
      raise exception 'AGROCORE_SCHEDULE_IDEMPOTENCY_CONFLICT';
    end if;

    select *
    into v_existing
    from public.schedule_items s
    where s.organization_id = p_organization_id
      and s.id = v_receipt.schedule_item_id;

    if not found then
      raise exception 'AGROCORE_SCHEDULE_CONCURRENCY_CONFLICT';
    end if;

    return v_existing;
  end if;

  insert into public.schedule_items (
    organization_id,
    item_kind,
    title,
    description,
    priority,
    status,
    time_zone,
    due_at,
    starts_at,
    ends_at,
    recurrence,
    origin_type,
    created_by_user_id,
    updated_by_user_id
  ) values (
    p_organization_id,
    v_kind,
    v_title,
    v_description,
    v_priority,
    'pending',
    v_time_zone,
    v_due_at,
    v_starts_at,
    v_ends_at,
    v_recurrence,
    'manual',
    v_actor,
    v_actor
  )
  returning * into v_created;

  insert into public.schedule_item_audit (
    organization_id,
    schedule_item_id,
    action,
    actor_user_id,
    item_version,
    changed_fields
  ) values (
    p_organization_id,
    v_created.id,
    'created',
    v_actor,
    v_created.version,
    array['item_kind','title','priority','time_zone','recurrence','origin_type']
  );

  insert into agrocore_private.schedule_item_command_receipts (
    organization_id,
    schedule_item_id,
    command_type,
    command_key,
    request_fingerprint,
    result_version
  ) values (
    p_organization_id,
    v_created.id,
    'create',
    btrim(p_idempotency_key),
    v_fingerprint,
    v_created.version
  );

  return v_created;
end;
$$;

drop function if exists public.agrocore_update_schedule_item(
  uuid,uuid,integer,jsonb,text
);

create or replace function public.agrocore_update_schedule_item(
  p_organization_id uuid,
  p_schedule_item_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_payload jsonb,
  p_reason text
)
returns public.schedule_items
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current public.schedule_items%rowtype;
  v_updated public.schedule_items%rowtype;
  v_receipt agrocore_private.schedule_item_command_receipts%rowtype;
  v_title text;
  v_description text;
  v_priority text;
  v_time_zone text;
  v_due_at timestamptz;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_recurrence jsonb;
  v_recurrence_ends_at timestamptz;
  v_changed_fields text[];
  v_reason text := btrim(coalesce(p_reason,''));
  v_fingerprint text;
begin
  if v_actor is null
     or p_organization_id is null
     or p_schedule_item_id is null
     or not agrocore_private.can_manage_schedule(p_organization_id) then
    raise exception 'AGROCORE_SCHEDULE_FORBIDDEN';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or p_idempotency_key is null
     or char_length(btrim(p_idempotency_key)) not between 8 and 200
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or char_length(v_reason) not between 3 and 500 then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) as key_name
    where key_name not in (
      'title','description','priority','timeZone',
      'dueAt','startsAt','endsAt','recurrence'
    )
  ) then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end if;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'scheduleItemId', p_schedule_item_id::text,
          'expectedVersion', p_expected_version,
          'payload', p_payload,
          'reason', v_reason
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || btrim(p_idempotency_key),
      0
    )
  );

  select *
  into v_receipt
  from agrocore_private.schedule_item_command_receipts r
  where r.organization_id = p_organization_id
    and r.command_key = btrim(p_idempotency_key);

  if found then
    if v_receipt.command_type <> 'update'
       or v_receipt.schedule_item_id is distinct from p_schedule_item_id
       or v_receipt.request_fingerprint is distinct from v_fingerprint then
      raise exception 'AGROCORE_SCHEDULE_IDEMPOTENCY_CONFLICT';
    end if;

    select *
    into v_current
    from public.schedule_items s
    where s.organization_id = p_organization_id
      and s.id = p_schedule_item_id;

    if not found then
      raise exception 'AGROCORE_SCHEDULE_NOT_FOUND';
    end if;

    return v_current;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_schedule_item_id::text,
      0
    )
  );

  select *
  into v_current
  from public.schedule_items s
  where s.organization_id = p_organization_id
    and s.id = p_schedule_item_id
  for update;

  if not found then
    raise exception 'AGROCORE_SCHEDULE_NOT_FOUND';
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_SCHEDULE_CONCURRENCY_CONFLICT';
  end if;

  if v_current.origin_type <> 'manual' then
    raise exception 'AGROCORE_SCHEDULE_SOURCE_OWNED';
  end if;

  if v_current.status <> 'pending' then
    raise exception 'AGROCORE_SCHEDULE_STATUS_LOCKED';
  end if;

  v_title := btrim(coalesce(p_payload ->> 'title', v_current.title));
  v_description := case
    when p_payload ? 'description'
      then nullif(btrim(coalesce(p_payload ->> 'description','')), '')
    else v_current.description
  end;
  v_priority := coalesce(
    nullif(btrim(coalesce(p_payload ->> 'priority','')), ''),
    v_current.priority
  );
  v_time_zone := coalesce(
    nullif(btrim(coalesce(p_payload ->> 'timeZone','')), ''),
    v_current.time_zone
  );
  v_recurrence := coalesce(p_payload -> 'recurrence', v_current.recurrence);

  if char_length(v_title) not between 3 and 160
     or (v_description is not null and char_length(v_description) > 2000)
     or v_priority not in ('low','medium','high','urgent')
     or char_length(v_time_zone) not between 1 and 120
     or not exists (
       select 1 from pg_catalog.pg_timezone_names where name = v_time_zone
     )
     or not agrocore_private.is_valid_schedule_recurrence(v_recurrence) then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end if;

  begin
    v_due_at := case
      when p_payload ? 'dueAt' then
        case
          when nullif(btrim(coalesce(p_payload ->> 'dueAt','')), '') is null then null
          else (p_payload ->> 'dueAt')::timestamptz
        end
      else v_current.due_at
    end;
    v_starts_at := case
      when p_payload ? 'startsAt' then
        case
          when nullif(btrim(coalesce(p_payload ->> 'startsAt','')), '') is null then null
          else (p_payload ->> 'startsAt')::timestamptz
        end
      else v_current.starts_at
    end;
    v_ends_at := case
      when p_payload ? 'endsAt' then
        case
          when nullif(btrim(coalesce(p_payload ->> 'endsAt','')), '') is null then null
          else (p_payload ->> 'endsAt')::timestamptz
        end
      else v_current.ends_at
    end;
    v_recurrence_ends_at := case
      when nullif(btrim(coalesce(v_recurrence ->> 'endsAt','')), '') is null then null
      else (v_recurrence ->> 'endsAt')::timestamptz
    end;
  exception when others then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end;

  if v_current.item_kind = 'task' then
    if v_starts_at is not null or v_ends_at is not null then
      raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
    end if;
  else
    if v_due_at is not null
       or v_starts_at is null
       or v_ends_at is null
       or v_ends_at <= v_starts_at then
      raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
    end if;
  end if;

  if (v_recurrence ->> 'frequency') <> 'none' then
    if (v_current.item_kind = 'task' and v_due_at is null)
       or (v_current.item_kind = 'appointment' and v_starts_at is null) then
      raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
    end if;
    if v_recurrence_ends_at is not null
       and v_recurrence_ends_at <= coalesce(v_due_at, v_starts_at) then
      raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
    end if;
  end if;

  v_changed_fields := array_remove(array[
    case when v_current.title is distinct from v_title then 'title' end,
    case when v_current.description is distinct from v_description then 'description' end,
    case when v_current.priority is distinct from v_priority then 'priority' end,
    case when v_current.time_zone is distinct from v_time_zone then 'time_zone' end,
    case when v_current.due_at is distinct from v_due_at then 'due_at' end,
    case when v_current.starts_at is distinct from v_starts_at then 'starts_at' end,
    case when v_current.ends_at is distinct from v_ends_at then 'ends_at' end,
    case when v_current.recurrence is distinct from v_recurrence then 'recurrence' end
  ], null);

  if cardinality(v_changed_fields) = 0 then
    raise exception 'AGROCORE_SCHEDULE_NO_CHANGES';
  end if;

  update public.schedule_items
  set
    title = v_title,
    description = v_description,
    priority = v_priority,
    time_zone = v_time_zone,
    due_at = v_due_at,
    starts_at = v_starts_at,
    ends_at = v_ends_at,
    recurrence = v_recurrence,
    updated_by_user_id = v_actor,
    updated_at = statement_timestamp(),
    version = v_current.version + 1
  where id = v_current.id
  returning * into v_updated;

  insert into public.schedule_item_audit (
    organization_id,
    schedule_item_id,
    action,
    actor_user_id,
    item_version,
    changed_fields,
    reason
  ) values (
    p_organization_id,
    v_updated.id,
    'updated',
    v_actor,
    v_updated.version,
    v_changed_fields,
    v_reason
  );

  insert into agrocore_private.schedule_item_command_receipts (
    organization_id,
    schedule_item_id,
    command_type,
    command_key,
    request_fingerprint,
    result_version
  ) values (
    p_organization_id,
    v_updated.id,
    'update',
    btrim(p_idempotency_key),
    v_fingerprint,
    v_updated.version
  );

  return v_updated;
end;
$$;

revoke all on function public.agrocore_create_schedule_item(uuid,jsonb,text)
  from public, anon;
revoke all on function public.agrocore_update_schedule_item(
  uuid,uuid,integer,text,jsonb,text
) from public, anon;

grant execute on function public.agrocore_create_schedule_item(uuid,jsonb,text)
  to authenticated;
grant execute on function public.agrocore_update_schedule_item(
  uuid,uuid,integer,text,jsonb,text
) to authenticated;

comment on table agrocore_private.schedule_item_command_receipts is
  'Recibos privados e idempotentes dos comandos de criação/edição da Agenda; não expostos ao cliente.';
comment on function public.agrocore_update_schedule_item(
  uuid,uuid,integer,text,jsonb,text
) is
  'Edição concorrente e idempotente por expectedVersion + command key; retry seguro sem duplicar efeitos.';
