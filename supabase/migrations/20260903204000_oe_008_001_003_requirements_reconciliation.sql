-- AgroCore — Reconciliação OE-008.001 a OE-008.003
-- Alinha fonte canônica, leitura pessoal/equipe e consumo de eventos reais do Módulo 007.
-- Não materializa recorrências (OE-008.004) e não cria notificações (OE-008.005/006).

alter table public.schedule_items
  drop constraint if exists schedule_items_source_domain_check,
  drop constraint if exists schedule_items_source_domain_ck;

alter table public.schedule_items
  add constraint schedule_items_source_domain_ck
  check (
    source_domain is null
    or source_domain in ('technical_visit','appraisal','proposal')
  );

create unique index if not exists schedule_items_org_source_entity_uq
  on public.schedule_items (organization_id, source_domain, source_id)
  where origin_type = 'domain_event';

create or replace function agrocore_private.can_view_schedule_item(
  p_organization_id uuid,
  p_schedule_item_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
begin
  if v_actor is null
     or p_organization_id is null
     or p_schedule_item_id is null
     or not agrocore_private.can_view_schedule(p_organization_id) then
    return false;
  end if;

  v_role := agrocore_private.current_organization_role(p_organization_id);

  if v_role in ('owner','company_admin','manager') then
    return exists (
      select 1
      from public.schedule_items s
      where s.organization_id = p_organization_id
        and s.id = p_schedule_item_id
    );
  end if;

  if v_role not in ('project_designer','capturer') then
    return false;
  end if;

  return exists (
    select 1
    from public.schedule_items s
    where s.organization_id = p_organization_id
      and s.id = p_schedule_item_id
      and (
        s.created_by_user_id = v_actor
        or s.responsible_user_id = v_actor
        or exists (
          select 1
          from public.schedule_item_participants p
          where p.organization_id = p_organization_id
            and p.schedule_item_id = s.id
            and p.user_id = v_actor
        )
      )
  );
end;
$$;

revoke all on function agrocore_private.can_view_schedule_item(uuid,uuid)
  from public, anon, authenticated;
grant execute on function agrocore_private.can_view_schedule_item(uuid,uuid)
  to authenticated;

drop policy if exists "agrocore_schedule_items_select"
  on public.schedule_items;
create policy "agrocore_schedule_items_select"
on public.schedule_items
for select
to authenticated
using (
  (select agrocore_private.can_view_schedule_item(organization_id, id))
);

drop policy if exists "agrocore_schedule_item_audit_select"
  on public.schedule_item_audit;
create policy "agrocore_schedule_item_audit_select"
on public.schedule_item_audit
for select
to authenticated
using (
  (select agrocore_private.can_view_schedule_item(
    organization_id,
    schedule_item_id
  ))
);

drop policy if exists "agrocore_schedule_item_participants_select"
  on public.schedule_item_participants;
create policy "agrocore_schedule_item_participants_select"
on public.schedule_item_participants
for select
to authenticated
using (
  (select agrocore_private.can_view_schedule_item(
    organization_id,
    schedule_item_id
  ))
);

drop policy if exists "agrocore_schedule_item_collaboration_revisions_select"
  on public.schedule_item_collaboration_revisions;
create policy "agrocore_schedule_item_collaboration_revisions_select"
on public.schedule_item_collaboration_revisions
for select
to authenticated
using (
  (select agrocore_private.can_view_schedule_item(
    organization_id,
    schedule_item_id
  ))
);

create or replace function public.agrocore_list_schedule_members(
  p_organization_id uuid
)
returns table (
  user_id uuid,
  organization_role text,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not agrocore_private.can_manage_schedule(p_organization_id) then
    raise exception 'AGROCORE_SCHEDULE_FORBIDDEN';
  end if;

  return query
  select
    m.user_id,
    m.organization_role,
    left(
      coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
        'Integrante da organização'
      ),
      160
    ) as display_name
  from public.organization_memberships m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_organization_id
    and m.status = 'active'
    and m.organization_role in (
      'owner',
      'company_admin',
      'manager',
      'project_designer',
      'capturer'
    )
  order by display_name, m.user_id;
end;
$$;

revoke all on function public.agrocore_list_schedule_members(uuid)
  from public, anon;
grant execute on function public.agrocore_list_schedule_members(uuid)
  to authenticated;

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
     or v_event.source_version < v_visit.version then
    return;
  end if;

  begin
    v_duration := nullif(btrim(coalesce(v_event.payload ->> 'durationMinutes','')), '')::integer;
  exception when others then
    return;
  end;

  if v_duration is null or v_duration not between 15 and 1440 then
    return;
  end if;

  v_starts_at := v_visit.scheduled_for;
  v_ends_at := v_starts_at + make_interval(mins => v_duration);

  v_time_zone := nullif(btrim(coalesce(v_event.payload ->> 'timeZone','')), '');
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
    select coalesce(array_agg(q.user_id order by q.user_id), '{}'::uuid[])
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

  if found and coalesce(v_existing.source_version, 0) >= v_event.source_version then
    return;
  end if;

  if not found then
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
      source_domain,
      source_id,
      source_version,
      source_event_key,
      responsible_user_id,
      completed_at,
      cancelled_at,
      created_by_user_id,
      created_at,
      updated_by_user_id,
      updated_at,
      version
    ) values (
      v_event.organization_id,
      'appointment',
      'Visita técnica',
      null,
      'medium',
      v_status,
      v_time_zone,
      null,
      v_starts_at,
      v_ends_at,
      '{"frequency":"none","interval":1,"weekdays":[],"endsAt":null}'::jsonb,
      'domain_event',
      'technical_visit',
      v_event.visit_id::text,
      v_event.source_version,
      v_event.event_key,
      v_responsible,
      v_completed_at,
      v_cancelled_at,
      v_actor,
      v_event.occurred_at,
      v_actor,
      v_event.occurred_at,
      1
    )
    returning * into v_existing;

    insert into public.schedule_item_participants (
      organization_id,
      schedule_item_id,
      user_id,
      added_by_user_id,
      added_at
    )
    select
      v_event.organization_id,
      v_existing.id,
      participant_id,
      v_actor,
      v_event.occurred_at
    from unnest(v_participants) participant_id;

    insert into public.schedule_item_audit (
      organization_id,
      schedule_item_id,
      action,
      actor_user_id,
      occurred_at,
      item_version,
      changed_fields,
      reason
    ) values (
      v_event.organization_id,
      v_existing.id,
      'created',
      v_actor,
      v_event.occurred_at,
      1,
      array[
        'item_kind','title','priority','status','time_zone',
        'starts_at','ends_at','origin_type','source_domain',
        'source_id','source_version','responsible_user_id',
        'participant_user_ids'
      ],
      'Sincronização canônica da visita técnica.'
    );

    if v_responsible is not null or cardinality(v_participants) > 0 then
      insert into public.schedule_item_collaboration_revisions (
        organization_id,
        schedule_item_id,
        item_version,
        responsible_user_id,
        participant_user_ids,
        actor_user_id,
        occurred_at,
        reason
      ) values (
        v_event.organization_id,
        v_existing.id,
        1,
        v_responsible,
        v_participants,
        v_actor,
        v_event.occurred_at,
        'Sincronização canônica da visita técnica.'
      );
    end if;

    return;
  end if;

  select coalesce(array_agg(p.user_id order by p.user_id), '{}'::uuid[])
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
  set
    title = 'Visita técnica',
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
    organization_id,
    schedule_item_id,
    user_id,
    added_by_user_id,
    added_at
  )
  select
    v_event.organization_id,
    v_existing.id,
    participant_id,
    v_actor,
    v_event.occurred_at
  from unnest(v_participants) participant_id;

  insert into public.schedule_item_audit (
    organization_id,
    schedule_item_id,
    action,
    actor_user_id,
    occurred_at,
    item_version,
    changed_fields,
    reason
  ) values (
    v_event.organization_id,
    v_existing.id,
    'updated',
    v_actor,
    v_event.occurred_at,
    v_next_version,
    array[
      'status','time_zone','starts_at','ends_at','source_version',
      'source_event_key','responsible_user_id','participant_user_ids',
      'completed_at','cancelled_at'
    ],
    'Sincronização canônica da visita técnica.'
  );

  if v_responsible_changed or v_participants_changed then
    insert into public.schedule_item_collaboration_revisions (
      organization_id,
      schedule_item_id,
      item_version,
      responsible_user_id,
      participant_user_ids,
      actor_user_id,
      occurred_at,
      reason
    ) values (
      v_event.organization_id,
      v_existing.id,
      v_next_version,
      v_responsible,
      v_participants,
      v_actor,
      v_event.occurred_at,
      'Sincronização canônica da visita técnica.'
    );
  end if;
end;
$$;

revoke all on function agrocore_private.sync_schedule_from_visit_event(uuid)
  from public, anon, authenticated;

create or replace function agrocore_private.schedule_visit_event_trigger()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.target_domain = 'calendar'
     and new.event_type in (
       'calendar.visit_sync_requested',
       'calendar.visit_release_requested'
     ) then
    perform agrocore_private.sync_schedule_from_visit_event(new.id);
  end if;
  return new;
end;
$$;

revoke all on function agrocore_private.schedule_visit_event_trigger()
  from public, anon, authenticated;

drop trigger if exists agrocore_schedule_consume_visit_calendar_event
  on public.technical_visit_integration_events;

create trigger agrocore_schedule_consume_visit_calendar_event
after insert on public.technical_visit_integration_events
for each row
execute function agrocore_private.schedule_visit_event_trigger();

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
    order by
      e.organization_id,
      e.visit_id,
      e.source_version desc,
      e.occurred_at desc,
      e.id desc
  loop
    perform agrocore_private.sync_schedule_from_visit_event(v_event_id);
  end loop;
end;
$$;

comment on function agrocore_private.can_view_schedule_item(uuid,uuid) is
  'Leitura por linha da Agenda: gestão vê a organização; projetista/captador somente autoria, responsabilidade ou participação.';
comment on function agrocore_private.sync_schedule_from_visit_event(uuid) is
  'Projeta eventos canônicos de visita no único schedule_items, sem criar agenda paralela, recorrências materializadas ou notificações.';
comment on index public.schedule_items_org_source_entity_uq is
  'Uma única projeção de Agenda por entidade canônica de origem e organização.';
