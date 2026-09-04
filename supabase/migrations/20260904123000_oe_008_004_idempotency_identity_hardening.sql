-- AgroCore — OE-008.004 — hardening de identidade e idempotência
-- Corrige dois resíduos sem criar fonte canônica paralela:
-- 1) a identidade lógica da ocorrência passa a ser a data local no fuso do item;
-- 2) replay idempotente retorna o snapshot original da resposta, mesmo após transições posteriores.

alter table public.schedule_item_occurrences
  add column if not exists occurrence_local_date date;

update public.schedule_item_occurrences o
set occurrence_local_date = (o.scheduled_at at time zone s.time_zone)::date
from public.schedule_items s
where s.organization_id = o.organization_id
  and s.id = o.schedule_item_id
  and o.occurrence_local_date is null;

do $$
begin
  if exists (
    select 1
    from public.schedule_item_occurrences o
    group by o.organization_id, o.schedule_item_id, o.occurrence_local_date
    having o.occurrence_local_date is null or count(*) > 1
  ) then
    raise exception 'AGROCORE_SCHEDULE_OCCURRENCE_IDENTITY_RECONCILIATION_REQUIRED';
  end if;
end;
$$;

alter table public.schedule_item_occurrences
  alter column occurrence_local_date set not null;

create unique index if not exists schedule_item_occurrences_org_item_local_date_uq
  on public.schedule_item_occurrences (
    organization_id,
    schedule_item_id,
    occurrence_local_date
  );

comment on column public.schedule_item_occurrences.occurrence_local_date is
  'Identidade lógica da ocorrência recorrente no fuso IANA canônico do schedule_item; impede duplicação ao alterar apenas o horário.';

alter table agrocore_private.schedule_occurrence_command_receipts
  add column if not exists result_snapshot jsonb;

update agrocore_private.schedule_occurrence_command_receipts r
set result_snapshot = to_jsonb(o)
from public.schedule_item_occurrences o
where o.organization_id = r.organization_id
  and o.id = r.occurrence_id
  and r.result_snapshot is null;

do $$
begin
  if exists (
    select 1
    from agrocore_private.schedule_occurrence_command_receipts r
    where r.result_snapshot is null
  ) then
    raise exception 'AGROCORE_SCHEDULE_OCCURRENCE_RECEIPT_RECONCILIATION_REQUIRED';
  end if;
end;
$$;

alter table agrocore_private.schedule_occurrence_command_receipts
  alter column result_snapshot set not null;

alter table agrocore_private.schedule_occurrence_command_receipts
  drop constraint if exists schedule_occurrence_command_receipts_snapshot_ck;
alter table agrocore_private.schedule_occurrence_command_receipts
  add constraint schedule_occurrence_command_receipts_snapshot_ck
  check (jsonb_typeof(result_snapshot) = 'object');

comment on column agrocore_private.schedule_occurrence_command_receipts.result_snapshot is
  'Snapshot imutável da resposta do primeiro comando; replays não observam estado posterior da ocorrência.';

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
  v_generated_dates date[] := '{}'::date[];
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
    and s.id = p_schedule_item_id
  for share;

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

    v_generated_dates := array_append(v_generated_dates, v_candidate_date);

    insert into public.schedule_item_occurrences (
      organization_id,
      schedule_item_id,
      source_item_version,
      occurrence_local_date,
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
      v_candidate_date,
      v_candidate_utc,
      v_candidate_end,
      'pending',
      null,
      null,
      statement_timestamp(),
      statement_timestamp(),
      1
    )
    on conflict (organization_id, schedule_item_id, occurrence_local_date)
    do update set
      source_item_version = excluded.source_item_version,
      scheduled_at = excluded.scheduled_at,
      ends_at = excluded.ends_at,
      updated_at = statement_timestamp(),
      version = public.schedule_item_occurrences.version + 1
    where public.schedule_item_occurrences.status = 'pending'
      and (
        public.schedule_item_occurrences.source_item_version
          < excluded.source_item_version
        or public.schedule_item_occurrences.scheduled_at
          is distinct from excluded.scheduled_at
        or public.schedule_item_occurrences.ends_at
          is distinct from excluded.ends_at
      );
  end loop;

  if cardinality(v_generated_dates) = 0 then
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
      and not (o.occurrence_local_date = any(v_generated_dates));
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

    v_updated := jsonb_populate_record(
      null::public.schedule_item_occurrences,
      v_receipt.result_snapshot
    );

    if v_updated.id is null
       or v_updated.organization_id <> p_organization_id
       or v_updated.id <> p_occurrence_id
       or v_updated.version <> v_receipt.result_version then
      raise exception 'AGROCORE_SCHEDULE_IDEMPOTENCY_RECEIPT_INVALID';
    end if;

    return v_updated;
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
    result_version,
    result_snapshot
  ) values (
    p_organization_id,
    p_occurrence_id,
    p_command_type,
    v_key,
    v_fingerprint,
    v_updated.version,
    to_jsonb(v_updated)
  );

  return v_updated;
end;
$$;

comment on function public.agrocore_materialize_schedule_occurrences(
  uuid,uuid,timestamptz,timestamptz
) is
  'Materializa recorrências por identidade lógica de data local, preservando ocorrências terminais e impedindo duplicação após mudança apenas de horário.';