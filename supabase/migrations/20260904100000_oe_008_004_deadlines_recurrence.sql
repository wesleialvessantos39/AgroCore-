-- AgroCore — OE-008.004 — Prazos e recorrência
-- Ocorrências derivadas e idempotentes a partir da fonte única public.schedule_items.
-- Não cria notificações, canais externos ou qualquer fonte canônica paralela.

create unique index if not exists schedule_items_org_id_uq
  on public.schedule_items (organization_id, id);

create table if not exists public.schedule_item_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  schedule_item_id uuid not null,
  source_item_version integer not null check (source_item_version >= 1),
  scheduled_at timestamptz not null,
  ends_at timestamptz null,
  status text not null default 'pending'
    check (status in ('pending','completed','cancelled')),
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version >= 1),
  constraint schedule_item_occurrences_parent_fk
    foreign key (organization_id, schedule_item_id)
    references public.schedule_items(organization_id, id)
    on delete restrict,
  constraint schedule_item_occurrences_unique_instant
    unique (organization_id, schedule_item_id, scheduled_at),
  constraint schedule_item_occurrences_terminal_ck check (
    (status = 'pending' and completed_at is null and cancelled_at is null)
    or (status = 'completed' and completed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
  ),
  constraint schedule_item_occurrences_interval_ck check (
    ends_at is null or ends_at > scheduled_at
  )
);

create index if not exists schedule_item_occurrences_org_item_time_idx
  on public.schedule_item_occurrences (
    organization_id, schedule_item_id, scheduled_at
  );

create index if not exists schedule_item_occurrences_org_status_time_idx
  on public.schedule_item_occurrences (
    organization_id, status, scheduled_at
  );

create table if not exists public.schedule_item_occurrence_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  occurrence_id uuid not null references public.schedule_item_occurrences(id) on delete restrict,
  action text not null check (action in ('completed','cancelled','reopened')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default statement_timestamp(),
  occurrence_version integer not null check (occurrence_version >= 1),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  unique (occurrence_id, occurrence_version)
);

create index if not exists schedule_item_occurrence_audit_org_occurrence_idx
  on public.schedule_item_occurrence_audit (
    organization_id, occurrence_id, occurrence_version desc
  );

create index if not exists schedule_item_occurrence_audit_actor_fk_idx
  on public.schedule_item_occurrence_audit (actor_user_id);

create table if not exists agrocore_private.schedule_occurrence_command_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  occurrence_id uuid not null references public.schedule_item_occurrences(id) on delete restrict,
  command_type text not null check (command_type in ('complete','reopen','cancel')),
  command_key text not null check (char_length(btrim(command_key)) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint) = 64),
  result_version integer not null check (result_version >= 1),
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, command_key)
);

create index if not exists schedule_occurrence_command_receipts_occurrence_idx
  on agrocore_private.schedule_occurrence_command_receipts (occurrence_id);

revoke all on agrocore_private.schedule_occurrence_command_receipts
  from public, anon, authenticated;

create or replace function agrocore_private.can_view_schedule_occurrence(
  p_organization_id uuid,
  p_occurrence_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.schedule_item_occurrences o
    where o.organization_id = p_organization_id
      and o.id = p_occurrence_id
      and agrocore_private.can_view_schedule_item(
        o.organization_id,
        o.schedule_item_id
      )
  );
$$;

revoke all on function agrocore_private.can_view_schedule_occurrence(uuid,uuid)
  from public, anon, authenticated;
grant execute on function agrocore_private.can_view_schedule_occurrence(uuid,uuid)
  to authenticated;

alter table public.schedule_item_occurrences enable row level security;
alter table public.schedule_item_occurrence_audit enable row level security;

drop policy if exists "agrocore_schedule_item_occurrences_select"
  on public.schedule_item_occurrences;
create policy "agrocore_schedule_item_occurrences_select"
on public.schedule_item_occurrences
for select
to authenticated
using (
  (select agrocore_private.can_view_schedule_item(
    organization_id,
    schedule_item_id
  ))
);

drop policy if exists "agrocore_schedule_item_occurrence_audit_select"
  on public.schedule_item_occurrence_audit;
create policy "agrocore_schedule_item_occurrence_audit_select"
on public.schedule_item_occurrence_audit
for select
to authenticated
using (
  (select agrocore_private.can_view_schedule_occurrence(
    organization_id,
    occurrence_id
  ))
);

revoke all on public.schedule_item_occurrences from public, anon;
revoke all on public.schedule_item_occurrence_audit from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.schedule_item_occurrences from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.schedule_item_occurrence_audit from authenticated;
grant select on public.schedule_item_occurrences to authenticated;
grant select on public.schedule_item_occurrence_audit to authenticated;

create or replace function public.agrocore_materialize_schedule_occurrences(
  p_organization_id uuid,
  p_schedule_item_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns setof public.schedule_item_occurrences
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_item public.schedule_items%rowtype;
  v_frequency text;
  v_interval integer;
  v_weekdays integer[] := '{}'::integer[];
  v_recurrence_end timestamptz;
  v_anchor timestamptz;
  v_anchor_local timestamp;
  v_anchor_date date;
  v_window_start_date date;
  v_window_end_date date;
  v_candidate_date date;
  v_candidate_local timestamp;
  v_candidate_utc timestamptz;
  v_candidate_end timestamptz;
  v_generated timestamptz[] := '{}'::timestamptz[];
  v_matches boolean;
  v_week_delta integer;
  v_month_delta integer;
begin
  if v_actor is null
     or p_organization_id is null
     or p_schedule_item_id is null
     or p_from is null
     or p_to is null
     or p_to <= p_from
     or p_to - p_from > interval '366 days'
     or not agrocore_private.can_view_schedule_item(
       p_organization_id,
       p_schedule_item_id
     ) then
    raise exception 'AGROCORE_SCHEDULE_OCCURRENCE_FORBIDDEN_OR_INVALID';
  end if;

  select *
  into v_item
  from public.schedule_items s
  where s.organization_id = p_organization_id
    and s.id = p_schedule_item_id;

  if not found then
    raise exception 'AGROCORE_SCHEDULE_NOT_FOUND';
  end if;

  v_frequency := v_item.recurrence ->> 'frequency';

  if v_frequency = 'none' then
    return query
    select o.*
    from public.schedule_item_occurrences o
    where o.organization_id = p_organization_id
      and o.schedule_item_id = p_schedule_item_id
      and o.scheduled_at >= p_from
      and o.scheduled_at < p_to
    order by o.scheduled_at, o.id;
    return;
  end if;

  if v_item.status in ('completed','cancelled') then
    return query
    select o.*
    from public.schedule_item_occurrences o
    where o.organization_id = p_organization_id
      and o.schedule_item_id = p_schedule_item_id
      and o.scheduled_at >= p_from
      and o.scheduled_at < p_to
    order by o.scheduled_at, o.id;
    return;
  end if;

  begin
    v_interval := (v_item.recurrence ->> 'interval')::integer;
    v_recurrence_end := case
      when nullif(btrim(coalesce(v_item.recurrence ->> 'endsAt','')), '') is null
        then null
      else (v_item.recurrence ->> 'endsAt')::timestamptz
    end;
  exception when others then
    raise exception 'AGROCORE_SCHEDULE_INVALID_RECURRENCE';
  end;

  if v_frequency not in ('daily','weekly','monthly','yearly')
     or v_interval not between 1 and 365 then
    raise exception 'AGROCORE_SCHEDULE_INVALID_RECURRENCE';
  end if;

  if v_frequency = 'weekly' then
    select coalesce(array_agg((value)::integer order by (value)::integer), '{}'::integer[])
    into v_weekdays
    from jsonb_array_elements_text(v_item.recurrence -> 'weekdays') value;

    if cardinality(v_weekdays) = 0 then
      raise exception 'AGROCORE_SCHEDULE_INVALID_RECURRENCE';
    end if;
  end if;

  v_anchor := coalesce(v_item.due_at, v_item.starts_at);
  if v_anchor is null then
    raise exception 'AGROCORE_SCHEDULE_INVALID_RECURRENCE';
  end if;

  v_anchor_local := v_anchor at time zone v_item.time_zone;
  v_anchor_date := v_anchor_local::date;
  v_window_start_date := greatest(
    v_anchor_date,
    (p_from at time zone v_item.time_zone)::date
  );
  v_window_end_date := (p_to at time zone v_item.time_zone)::date;

  for v_candidate_date in
    select d::date
    from generate_series(
      v_window_start_date::timestamp,
      v_window_end_date::timestamp,
      interval '1 day'
    ) d
  loop
    v_matches := false;

    if v_frequency = 'daily' then
      v_matches :=
        (v_candidate_date - v_anchor_date) >= 0
        and mod(v_candidate_date - v_anchor_date, v_interval) = 0;
    elsif v_frequency = 'weekly' then
      v_week_delta := floor(
        (v_candidate_date - date_trunc('week', v_anchor_local)::date) / 7.0
      )::integer;
      v_matches :=
        v_candidate_date >= v_anchor_date
        and v_week_delta >= 0
        and mod(v_week_delta, v_interval) = 0
        and extract(dow from v_candidate_date)::integer = any(v_weekdays);
    elsif v_frequency = 'monthly' then
      v_month_delta :=
        (extract(year from v_candidate_date)::integer * 12
          + extract(month from v_candidate_date)::integer)
        - (extract(year from v_anchor_date)::integer * 12
          + extract(month from v_anchor_date)::integer);
      v_matches :=
        v_month_delta >= 0
        and mod(v_month_delta, v_interval) = 0
        and extract(day from v_candidate_date)::integer
          = extract(day from v_anchor_date)::integer;
    elsif v_frequency = 'yearly' then
      v_matches :=
        extract(year from v_candidate_date)::integer
          >= extract(year from v_anchor_date)::integer
        and mod(
          extract(year from v_candidate_date)::integer
            - extract(year from v_anchor_date)::integer,
          v_interval
        ) = 0
        and extract(month from v_candidate_date)::integer
          = extract(month from v_anchor_date)::integer
        and extract(day from v_candidate_date)::integer
          = extract(day from v_anchor_date)::integer;
    end if;

    if not v_matches then
      continue;
    end if;

    v_candidate_local := v_candidate_date + v_anchor_local::time;
    v_candidate_utc := v_candidate_local at time zone v_item.time_zone;

    if (v_candidate_utc at time zone v_item.time_zone) is distinct from v_candidate_local then
      raise exception 'AGROCORE_SCHEDULE_RECURRENCE_DST_INVALID';
    end if;

    if exists (
      select 1
      from generate_series(-120, 120, 15) g(step_minutes)
      where g.step_minutes <> 0
        and (
          (v_candidate_utc + make_interval(mins => g.step_minutes))
            at time zone v_item.time_zone
        ) = v_candidate_local
    ) then
      raise exception 'AGROCORE_SCHEDULE_RECURRENCE_DST_AMBIGUOUS';
    end if;

    if v_candidate_utc < v_anchor
       or v_candidate_utc < p_from
       or v_candidate_utc >= p_to
       or (v_recurrence_end is not null and v_candidate_utc > v_recurrence_end) then
      continue;
    end if;

    v_candidate_end := case
      when v_item.item_kind = 'appointment'
        then v_candidate_utc + (v_item.ends_at - v_item.starts_at)
      else null
    end;

    v_generated := array_append(v_generated, v_candidate_utc);

    insert into public.schedule_item_occurrences (
      organization_id,
      schedule_item_id,
      source_item_version,
      scheduled_at,
      ends_at,
      status,
      completed_at,
      cancelled_at,
      created_at,
      updated_at,
      version
    ) values (
      p_organization_id,
      p_schedule_item_id,
      v_item.version,
      v_candidate_utc,
      v_candidate_end,
      'pending',
      null,
      null,
      statement_timestamp(),
      statement_timestamp(),
      1
    )
    on conflict (organization_id, schedule_item_id, scheduled_at)
    do update set
      source_item_version = excluded.source_item_version,
      ends_at = excluded.ends_at,
      updated_at = statement_timestamp(),
      version = public.schedule_item_occurrences.version + 1
    where public.schedule_item_occurrences.status = 'pending'
      and (
        public.schedule_item_occurrences.source_item_version
          < excluded.source_item_version
        or public.schedule_item_occurrences.ends_at
          is distinct from excluded.ends_at
      );
  end loop;

  if cardinality(v_generated) = 0 then
    delete from public.schedule_item_occurrences o
    where o.organization_id = p_organization_id
      and o.schedule_item_id = p_schedule_item_id
      and o.status = 'pending'
      and o.source_item_version < v_item.version
      and o.scheduled_at >= p_from
      and o.scheduled_at < p_to;
  else
    delete from public.schedule_item_occurrences o
    where o.organization_id = p_organization_id
      and o.schedule_item_id = p_schedule_item_id
      and o.status = 'pending'
      and o.source_item_version < v_item.version
      and o.scheduled_at >= p_from
      and o.scheduled_at < p_to
      and not (o.scheduled_at = any(v_generated));
  end if;

  return query
  select o.*
  from public.schedule_item_occurrences o
  where o.organization_id = p_organization_id
    and o.schedule_item_id = p_schedule_item_id
    and o.scheduled_at >= p_from
    and o.scheduled_at < p_to
  order by o.scheduled_at, o.id;
end;
$$;

revoke all on function public.agrocore_materialize_schedule_occurrences(
  uuid,uuid,timestamptz,timestamptz
) from public, anon;
grant execute on function public.agrocore_materialize_schedule_occurrences(
  uuid,uuid,timestamptz,timestamptz
) to authenticated;

create or replace function agrocore_private.transition_schedule_occurrence(
  p_organization_id uuid,
  p_occurrence_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_command_type text,
  p_reason text
)
returns public.schedule_item_occurrences
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_occurrence public.schedule_item_occurrences%rowtype;
  v_item public.schedule_items%rowtype;
  v_receipt agrocore_private.schedule_occurrence_command_receipts%rowtype;
  v_updated public.schedule_item_occurrences%rowtype;
  v_reason text := btrim(coalesce(p_reason,''));
  v_key text := btrim(coalesce(p_idempotency_key,''));
  v_fingerprint text;
  v_can_manage boolean;
  v_target_status text;
  v_action text;
begin
  if v_actor is null
     or p_organization_id is null
     or p_occurrence_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_command_type not in ('complete','reopen','cancel')
     or char_length(v_key) not between 8 and 200
     or char_length(v_reason) not between 3 and 500
     or not agrocore_private.can_view_schedule_occurrence(
       p_organization_id,
       p_occurrence_id
     ) then
    raise exception 'AGROCORE_SCHEDULE_OCCURRENCE_FORBIDDEN_OR_INVALID';
  end if;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'occurrenceId', p_occurrence_id::text,
          'expectedVersion', p_expected_version,
          'commandType', p_command_type,
          'reason', v_reason
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || v_key, 0)
  );

  select *
  into v_receipt
  from agrocore_private.schedule_occurrence_command_receipts r
  where r.organization_id = p_organization_id
    and r.command_key = v_key;

  if found then
    if v_receipt.command_type <> p_command_type
       or v_receipt.occurrence_id <> p_occurrence_id
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'AGROCORE_SCHEDULE_IDEMPOTENCY_CONFLICT';
    end if;

    select *
    into v_occurrence
    from public.schedule_item_occurrences o
    where o.organization_id = p_organization_id
      and o.id = p_occurrence_id;

    if not found then
      raise exception 'AGROCORE_SCHEDULE_NOT_FOUND';
    end if;

    return v_occurrence;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':occurrence:' || p_occurrence_id::text,
      0
    )
  );

  select *
  into v_occurrence
  from public.schedule_item_occurrences o
  where o.organization_id = p_organization_id
    and o.id = p_occurrence_id
  for update;

  if not found then
    raise exception 'AGROCORE_SCHEDULE_NOT_FOUND';
  end if;

  select *
  into v_item
  from public.schedule_items s
  where s.organization_id = p_organization_id
    and s.id = v_occurrence.schedule_item_id;

  if not found then
    raise exception 'AGROCORE_SCHEDULE_NOT_FOUND';
  end if;

  if v_occurrence.version <> p_expected_version then
    raise exception 'AGROCORE_SCHEDULE_CONCURRENCY_CONFLICT';
  end if;

  v_can_manage := agrocore_private.can_manage_schedule(p_organization_id);

  if p_command_type = 'complete' then
    if not v_can_manage
       and v_item.responsible_user_id is distinct from v_actor then
      raise exception 'AGROCORE_SCHEDULE_RESPONSIBLE_MISMATCH';
    end if;
    if v_occurrence.status <> 'pending' then
      raise exception 'AGROCORE_SCHEDULE_INVALID_TRANSITION';
    end if;
    v_target_status := 'completed';
    v_action := 'completed';
  elsif p_command_type = 'cancel' then
    if not v_can_manage then
      raise exception 'AGROCORE_SCHEDULE_FORBIDDEN';
    end if;
    if v_occurrence.status <> 'pending' then
      raise exception 'AGROCORE_SCHEDULE_INVALID_TRANSITION';
    end if;
    v_target_status := 'cancelled';
    v_action := 'cancelled';
  else
    if not v_can_manage then
      raise exception 'AGROCORE_SCHEDULE_FORBIDDEN';
    end if;
    if v_occurrence.status not in ('completed','cancelled') then
      raise exception 'AGROCORE_SCHEDULE_INVALID_TRANSITION';
    end if;
    v_target_status := 'pending';
    v_action := 'reopened';
  end if;

  update public.schedule_item_occurrences
  set status = v_target_status,
      completed_at = case
        when v_target_status = 'completed' then statement_timestamp()
        else null
      end,
      cancelled_at = case
        when v_target_status = 'cancelled' then statement_timestamp()
        else null
      end,
      updated_at = statement_timestamp(),
      version = v_occurrence.version + 1
  where id = v_occurrence.id
  returning * into v_updated;

  insert into public.schedule_item_occurrence_audit (
    organization_id,
    occurrence_id,
    action,
    actor_user_id,
    occurred_at,
    occurrence_version,
    reason
  ) values (
    p_organization_id,
    p_occurrence_id,
    v_action,
    v_actor,
    v_updated.updated_at,
    v_updated.version,
    v_reason
  );

  insert into agrocore_private.schedule_occurrence_command_receipts (
    organization_id,
    occurrence_id,
    command_type,
    command_key,
    request_fingerprint,
    result_version
  ) values (
    p_organization_id,
    p_occurrence_id,
    p_command_type,
    v_key,
    v_fingerprint,
    v_updated.version
  );

  return v_updated;
end;
$$;

revoke all on function agrocore_private.transition_schedule_occurrence(
  uuid,uuid,integer,text,text,text
) from public, anon, authenticated;

create or replace function public.agrocore_complete_schedule_occurrence(
  p_organization_id uuid,
  p_occurrence_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_reason text
)
returns public.schedule_item_occurrences
language sql
volatile
security definer
set search_path = ''
as $$
  select agrocore_private.transition_schedule_occurrence(
    p_organization_id,
    p_occurrence_id,
    p_expected_version,
    p_idempotency_key,
    'complete',
    p_reason
  );
$$;

create or replace function public.agrocore_reopen_schedule_occurrence(
  p_organization_id uuid,
  p_occurrence_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_reason text
)
returns public.schedule_item_occurrences
language sql
volatile
security definer
set search_path = ''
as $$
  select agrocore_private.transition_schedule_occurrence(
    p_organization_id,
    p_occurrence_id,
    p_expected_version,
    p_idempotency_key,
    'reopen',
    p_reason
  );
$$;

create or replace function public.agrocore_cancel_schedule_occurrence(
  p_organization_id uuid,
  p_occurrence_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_reason text
)
returns public.schedule_item_occurrences
language sql
volatile
security definer
set search_path = ''
as $$
  select agrocore_private.transition_schedule_occurrence(
    p_organization_id,
    p_occurrence_id,
    p_expected_version,
    p_idempotency_key,
    'cancel',
    p_reason
  );
$$;

revoke all on function public.agrocore_complete_schedule_occurrence(
  uuid,uuid,integer,text,text
) from public, anon;
revoke all on function public.agrocore_reopen_schedule_occurrence(
  uuid,uuid,integer,text,text
) from public, anon;
revoke all on function public.agrocore_cancel_schedule_occurrence(
  uuid,uuid,integer,text,text
) from public, anon;

grant execute on function public.agrocore_complete_schedule_occurrence(
  uuid,uuid,integer,text,text
) to authenticated;
grant execute on function public.agrocore_reopen_schedule_occurrence(
  uuid,uuid,integer,text,text
) to authenticated;
grant execute on function public.agrocore_cancel_schedule_occurrence(
  uuid,uuid,integer,text,text
) to authenticated;

create or replace function agrocore_private.prune_pending_schedule_occurrences()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.status in ('completed','cancelled')
     and old.status is distinct from new.status then
    delete from public.schedule_item_occurrences o
    where o.organization_id = new.organization_id
      and o.schedule_item_id = new.id
      and o.status = 'pending';
  elsif new.recurrence is distinct from old.recurrence
     and coalesce(new.recurrence ->> 'frequency','none') = 'none' then
    delete from public.schedule_item_occurrences o
    where o.organization_id = new.organization_id
      and o.schedule_item_id = new.id
      and o.status = 'pending';
  end if;
  return new;
end;
$$;

revoke all on function agrocore_private.prune_pending_schedule_occurrences()
  from public, anon, authenticated;

drop trigger if exists agrocore_prune_pending_schedule_occurrences
  on public.schedule_items;
create trigger agrocore_prune_pending_schedule_occurrences
after update of status, recurrence on public.schedule_items
for each row
execute function agrocore_private.prune_pending_schedule_occurrences();

comment on table public.schedule_item_occurrences is
  'OE-008.004: ocorrências derivadas e idempotentes da recorrência canônica de schedule_items; não são nova fonte mestre.';
comment on table public.schedule_item_occurrence_audit is
  'OE-008.004: auditoria append-only das transições explícitas de cada ocorrência.';
comment on function public.agrocore_materialize_schedule_occurrences(
  uuid,uuid,timestamptz,timestamptz
) is
  'Materializa janela limitada de recorrência em fuso IANA, com idempotência, reconciliação de versão e bloqueio de horários DST inválidos/ambíguos.';
