-- AgroCore — Reconciliação OE-008.001 a OE-008.003 R1
-- Permite backfill do último evento de calendário mesmo quando a visita avançou
-- por mudança de outro domínio que não alterou sua projeção de Agenda.

create or replace function agrocore_private.sync_schedule_from_visit_event(
  p_event_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.technical_visit_integration_events%rowtype;
  v_visit public.technical_visits%rowtype;
  v_existing public.schedule_items%rowtype;
  v_actor uuid;
  v_responsible uuid;
  v_participants uuid[] := '{}'::uuid[];
  v_current_participants uuid[] := '{}'::uuid[];
  v_duration integer;
  v_time_zone text;
  v_status text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_completed_at timestamptz;
  v_cancelled_at timestamptz;
  v_next_version integer;
  v_responsible_changed boolean;
  v_participants_changed boolean;
begin
  select *
  into v_event
  from public.technical_visit_integration_events e
  where e.id = p_event_id
    and e.target_domain = 'calendar'
    and e.event_type in (
      'calendar.visit_sync_requested',
      'calendar.visit_release_requested'
    );

  if not found then
    return;
  end if;

  select *
  into v_visit
  from public.technical_visits v
  where v.organization_id = v_event.organization_id
    and v.id = v_event.visit_id;

  if not found
     or v_event.source_version is null
     or v_event.source_version < 1
     or v_event.source_version > v_visit.version then
    return;
  end if;

  begin
    v_duration := nullif(
      btrim(coalesce(v_event.payload ->> 'durationMinutes','')),
      ''
    )::integer;
  exception when others then
    return;
  end;

  if v_duration is null or v_duration not between 15 and 1440 then
    return;
  end if;

  v_starts_at := v_visit.scheduled_for;
  v_ends_at := v_starts_at + make_interval(mins => v_duration);

  v_time_zone := nullif(
    btrim(coalesce(v_event.payload ->> 'timeZone','')),
    ''
  );
  if v_time_zone is null
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names
       where name = v_time_zone
     ) then
    v_time_zone := 'UTC';
  end if;

  v_responsible := v_visit.responsible_user_id;
  if v_responsible is null
     or not agrocore_private.is_eligible_schedule_member(
       v_event.organization_id,
       v_responsible
     ) then
    return;
  end if;

  if jsonb_typeof(v_event.payload -> 'participantUserIds') = 'array' then
    select coalesce(
      array_agg(q.user_id order by q.user_id),
      '{}'::uuid[]
    )
    into v_participants
    from (
      select distinct (x.value)::uuid as user_id
      from jsonb_array_elements_text(
        v_event.payload -> 'participantUserIds'
      ) x(value)
      where x.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and (x.value)::uuid <> v_responsible
        and agrocore_private.is_eligible_schedule_member(
          v_event.organization_id,
          (x.value)::uuid
        )
      order by user_id
      limit 50
    ) q;
  end if;

  v_status := case v_visit.status
    when 'in_progress' then 'in_progress'
    when 'completed' then 'completed'
    when 'cancelled' then 'cancelled'
    else 'pending'
  end;

  v_completed_at := case
    when v_status = 'completed' then v_event.occurred_at
    else null
  end;
  v_cancelled_at := case
    when v_status = 'cancelled' then v_event.occurred_at
    else null
  end;

  v_actor := (select auth.uid());
  if v_actor is null then
    select a.actor_user_id
    into v_actor
    from public.technical_visit_audit a
    where a.organization_id = v_event.organization_id
      and a.visit_id = v_event.visit_id
      and a.version = v_event.source_version
    order by a.occurred_at desc
    limit 1;
  end if;
  v_actor := coalesce(v_actor, v_responsible);

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_event.organization_id::text ||
      ':technical_visit:' ||
      v_event.visit_id::text,
      0
    )
  );

  select *
  into v_existing
  from public.schedule_items s
  where s.organization_id = v_event.organization_id
    and s.origin_type = 'domain_event'
    and s.source_domain = 'technical_visit'
    and s.source_id = v_event.visit_id::text
  for update;

  if found
     and coalesce(v_existing.source_version, 0) >= v_event.source_version then
    return;
  end if;

  if not found then
    insert into public.schedule_items (
      organization_id, item_kind, title, description, priority, status,
      time_zone, due_at, starts_at, ends_at, recurrence, origin_type,
      source_domain, source_id, source_version, source_event_key,
      responsible_user_id, completed_at, cancelled_at,
      created_by_user_id, created_at, updated_by_user_id, updated_at, version
    ) values (
      v_event.organization_id, 'appointment', 'Visita técnica', null,
      'medium', v_status, v_time_zone, null, v_starts_at, v_ends_at,
      '{"frequency":"none","interval":1,"weekdays":[],"endsAt":null}'::jsonb,
      'domain_event', 'technical_visit', v_event.visit_id::text,
      v_event.source_version, v_event.event_key, v_responsible,
      v_completed_at, v_cancelled_at, v_actor, v_event.occurred_at,
      v_actor, v_event.occurred_at, 1
    )
    returning * into v_existing;

    insert into public.schedule_item_participants (
      organization_id, schedule_item_id, user_id, added_by_user_id, added_at
    )
    select
      v_event.organization_id, v_existing.id, participant_id,
      v_actor, v_event.occurred_at
    from unnest(v_participants) participant_id;

    insert into public.schedule_item_audit (
      organization_id, schedule_item_id, action, actor_user_id, occurred_at,
      item_version, changed_fields, reason
    ) values (
      v_event.organization_id, v_existing.id, 'created', v_actor,
      v_event.occurred_at, 1,
      array[
        'item_kind','title','priority','status','time_zone',
        'starts_at','ends_at','origin_type','source_domain',
        'source_id','source_version','responsible_user_id',
        'participant_user_ids'
      ],
      'Sincronização canônica da visita técnica.'
    );

    if cardinality(v_participants) > 0 or v_responsible is not null then
      insert into public.schedule_item_collaboration_revisions (
        organization_id, schedule_item_id, item_version,
        responsible_user_id, participant_user_ids, actor_user_id,
        occurred_at, reason
      ) values (
        v_event.organization_id, v_existing.id, 1, v_responsible,
        v_participants, v_actor, v_event.occurred_at,
        'Sincronização canônica da visita técnica.'
      );
    end if;
    return;
  end if;

  select coalesce(
    array_agg(p.user_id order by p.user_id),
    '{}'::uuid[]
  )
  into v_current_participants
  from public.schedule_item_participants p
  where p.organization_id = v_event.organization_id
    and p.schedule_item_id = v_existing.id;

  v_responsible_changed :=
    v_existing.responsible_user_id is distinct from v_responsible;
  v_participants_changed :=
    v_current_participants is distinct from v_participants;

  delete from public.schedule_item_participants p
  where p.organization_id = v_event.organization_id
    and p.schedule_item_id = v_existing.id;

  v_next_version := v_existing.version + 1;

  update public.schedule_items
  set title = 'Visita técnica',
      description = null,
      priority = 'medium',
      status = v_status,
      time_zone = v_time_zone,
      due_at = null,
      starts_at = v_starts_at,
      ends_at = v_ends_at,
      recurrence = '{"frequency":"none","interval":1,"weekdays":[],"endsAt":null}'::jsonb,
      source_version = v_event.source_version,
      source_event_key = v_event.event_key,
      responsible_user_id = v_responsible,
      completed_at = v_completed_at,
      cancelled_at = v_cancelled_at,
      updated_by_user_id = v_actor,
      updated_at = v_event.occurred_at,
      version = v_next_version
  where id = v_existing.id;

  insert into public.schedule_item_participants (
    organization_id, schedule_item_id, user_id, added_by_user_id, added_at
  )
  select
    v_event.organization_id, v_existing.id, participant_id,
    v_actor, v_event.occurred_at
  from unnest(v_participants) participant_id;

  insert into public.schedule_item_audit (
    organization_id, schedule_item_id, action, actor_user_id, occurred_at,
    item_version, changed_fields, reason
  ) values (
    v_event.organization_id, v_existing.id, 'updated', v_actor,
    v_event.occurred_at, v_next_version,
    array[
      'status','time_zone','starts_at','ends_at','source_version',
      'source_event_key','responsible_user_id','participant_user_ids',
      'completed_at','cancelled_at'
    ],
    'Sincronização canônica da visita técnica.'
  );

  if v_responsible_changed or v_participants_changed then
    insert into public.schedule_item_collaboration_revisions (
      organization_id, schedule_item_id, item_version,
      responsible_user_id, participant_user_ids, actor_user_id,
      occurred_at, reason
    ) values (
      v_event.organization_id, v_existing.id, v_next_version,
      v_responsible, v_participants, v_actor, v_event.occurred_at,
      'Sincronização canônica da visita técnica.'
    );
  end if;
end;
$$;

revoke all on function agrocore_private.sync_schedule_from_visit_event(uuid)
  from public, anon, authenticated;

do $$
declare
  v_event_id uuid;
begin
  for v_event_id in
    select distinct on (e.organization_id, e.visit_id) e.id
    from public.technical_visit_integration_events e
    where e.target_domain = 'calendar'
      and e.event_type in (
        'calendar.visit_sync_requested',
        'calendar.visit_release_requested'
      )
    order by e.organization_id, e.visit_id,
      e.source_version desc, e.occurred_at desc, e.id desc
  loop
    perform agrocore_private.sync_schedule_from_visit_event(v_event_id);
  end loop;
end;
$$;
