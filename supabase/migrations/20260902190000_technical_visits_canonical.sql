-- AgroCore — Persistência canônica do Módulo 007 até OE-007.002.

create table if not exists public.technical_visits (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  status text not null check (status in ('planned','confirmed','in_progress','completed','cancelled')),
  activity_type text not null,
  client_id uuid not null references public.clients(id) on delete restrict,
  property_id uuid references public.properties(id) on delete restrict,
  responsible_user_id uuid not null references auth.users(id) on delete restrict,
  scheduled_for timestamptz not null,
  version integer not null check (version >= 1),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists technical_visits_org_status_idx
  on public.technical_visits (organization_id,status,scheduled_for);
create index if not exists technical_visits_responsible_idx
  on public.technical_visits (organization_id,responsible_user_id,scheduled_for);
create index if not exists technical_visits_client_idx
  on public.technical_visits (organization_id,client_id,scheduled_for);
create index if not exists technical_visits_property_idx
  on public.technical_visits (organization_id,property_id,scheduled_for)
  where property_id is not null;

create table if not exists public.technical_visit_audit (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  visit_id uuid not null references public.technical_visits(id) on delete cascade,
  version integer not null check (version >= 1),
  action text not null check (action in ('created','updated','status_changed')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  unique (visit_id,version)
);

create index if not exists technical_visit_audit_org_visit_idx
  on public.technical_visit_audit (organization_id,visit_id,version);

alter table public.technical_visits enable row level security;
alter table public.technical_visit_audit enable row level security;

drop policy if exists "agrocore_technical_visits_select" on public.technical_visits;
create policy "agrocore_technical_visits_select"
on public.technical_visits for select to authenticated
using ((select agrocore_private.is_active_organization_member(organization_id)));

drop policy if exists "agrocore_technical_visit_audit_select" on public.technical_visit_audit;
create policy "agrocore_technical_visit_audit_select"
on public.technical_visit_audit for select to authenticated
using ((select agrocore_private.is_active_organization_member(organization_id)));

revoke all on table public.technical_visits from public,anon;
revoke all on table public.technical_visit_audit from public,anon;
revoke insert,update,delete,truncate,references,trigger on public.technical_visits from authenticated;
revoke insert,update,delete,truncate,references,trigger on public.technical_visit_audit from authenticated;
grant select on public.technical_visits to authenticated;
grant select on public.technical_visit_audit to authenticated;

create or replace function agrocore_private.can_operate_technical_visit(target_organization_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select coalesce(
    agrocore_private.current_organization_role(target_organization_id)
      in ('owner','company_admin','manager','project_designer'),
    false
  );
$$;

revoke all on function agrocore_private.can_operate_technical_visit(uuid) from public,anon;
grant execute on function agrocore_private.can_operate_technical_visit(uuid) to authenticated;

create or replace function agrocore_private.assert_visit_references(
  p_organization_id uuid,
  p_payload jsonb
)
returns void
language plpgsql stable security definer set search_path=''
as $$
declare
  v_client uuid;
  v_property uuid;
  v_responsible uuid;
begin
  begin
    v_client := (p_payload ->> 'clientId')::uuid;
    v_responsible := (p_payload ->> 'responsibleUserId')::uuid;
    if nullif(p_payload ->> 'propertyId','') is not null then
      v_property := (p_payload ->> 'propertyId')::uuid;
    end if;
  exception when invalid_text_representation then
    raise exception 'AGROCORE_INVALID_INPUT';
  end;

  if not exists (
    select 1 from public.clients c
    where c.id=v_client and c.organization_id=p_organization_id and c.status='active'
  ) then raise exception 'AGROCORE_CLIENT_MISMATCH'; end if;

  if v_property is not null and not exists (
    select 1 from public.properties p
    where p.id=v_property and p.organization_id=p_organization_id
      and p.status='active' and v_client=any(p.client_ids)
  ) then raise exception 'AGROCORE_PROPERTY_MISMATCH'; end if;

  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id
      and m.user_id=v_responsible
      and m.status='active'
      and m.organization_role in ('owner','company_admin','manager','project_designer')
  ) then raise exception 'AGROCORE_RESPONSIBLE_MISMATCH'; end if;
end;
$$;

create or replace function agrocore_private.assert_visit_schedule_conflict(
  p_organization_id uuid,
  p_visit_id uuid,
  p_payload jsonb
)
returns void
language plpgsql stable security definer set search_path=''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_duration integer;
  v_users uuid[];
  v_override jsonb := p_payload #> '{preparation,conflictOverride}';
begin
  if p_payload -> 'preparation' is null
     or p_payload -> 'preparation' = 'null'::jsonb then
    return;
  end if;

  begin
    v_start := (p_payload ->> 'scheduledFor')::timestamptz;
    v_duration := (p_payload #>> '{preparation,durationMinutes}')::integer;
    select array_agg(distinct user_id) into v_users
    from (
      select (p_payload ->> 'responsibleUserId')::uuid as user_id
      union all
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(p_payload #> '{preparation,participantUserIds}','[]'::jsonb)
      )
    ) users;
  exception when others then
    raise exception 'AGROCORE_INVALID_INPUT';
  end;

  if v_duration < 15 or v_duration > 1440 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  v_end := v_start + make_interval(mins=>v_duration);

  if exists (
    select 1
    from public.technical_visits other
    where other.organization_id=p_organization_id
      and other.id<>p_visit_id
      and other.status not in ('completed','cancelled')
      and other.scheduled_for <
        v_end
      and (
        other.scheduled_for
        + make_interval(
            mins=>coalesce(
              nullif(other.payload #>> '{preparation,durationMinutes}','')::integer,
              60
            )
          )
      ) > v_start
      and (
        other.responsible_user_id=any(v_users)
        or exists (
          select 1
          from jsonb_array_elements_text(
            coalesce(other.payload #> '{preparation,participantUserIds}','[]'::jsonb)
          ) participant(value)
          where participant.value::uuid=any(v_users)
        )
      )
  ) then
    if v_override is null or v_override='null'::jsonb then
      raise exception 'AGROCORE_SCHEDULE_CONFLICT';
    end if;
    if length(btrim(coalesce(v_override ->> 'reason',''))) < 5
       or (v_override ->> 'authorizedByUserId') is distinct from (select auth.uid())::text then
      raise exception 'AGROCORE_INVALID_CONFLICT_OVERRIDE';
    end if;
  end if;
end;
$$;

create or replace function public.agrocore_create_technical_visit(
  p_visit jsonb,
  p_audit jsonb
)
returns public.technical_visits
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_org uuid;
  v_id uuid;
  v_actor uuid := (select auth.uid());
  v_result public.technical_visits%rowtype;
begin
  begin
    v_org := (p_visit ->> 'organizationId')::uuid;
    v_id := (p_visit ->> 'id')::uuid;
  exception when others then
    raise exception 'AGROCORE_INVALID_INPUT';
  end;

  if v_actor is null or not agrocore_private.can_operate_technical_visit(v_org) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if (p_visit ->> 'createdByUserId') is distinct from v_actor::text
     or (p_visit ->> 'updatedByUserId') is distinct from v_actor::text
     or coalesce((p_visit ->> 'version')::integer,0)<>1
     or p_visit ->> 'status'<>'planned' then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform agrocore_private.assert_visit_references(v_org,p_visit);

  insert into public.technical_visits (
    id,organization_id,status,activity_type,client_id,property_id,
    responsible_user_id,scheduled_for,version,payload,created_at,updated_at
  ) values (
    v_id,v_org,p_visit ->> 'status',p_visit ->> 'activityType',
    (p_visit ->> 'clientId')::uuid,
    nullif(p_visit ->> 'propertyId','')::uuid,
    (p_visit ->> 'responsibleUserId')::uuid,
    (p_visit ->> 'scheduledFor')::timestamptz,
    1,p_visit,
    (p_visit ->> 'createdAt')::timestamptz,
    (p_visit ->> 'updatedAt')::timestamptz
  ) returning * into v_result;

  insert into public.technical_visit_audit (
    id,organization_id,visit_id,version,action,actor_user_id,occurred_at,payload
  ) values (
    (p_audit ->> 'id')::uuid,v_org,v_id,1,p_audit ->> 'action',
    v_actor,(p_audit ->> 'at')::timestamptz,p_audit
  );

  return v_result;
end;
$$;

create or replace function public.agrocore_update_technical_visit(
  p_visit jsonb,
  p_audit jsonb,
  p_expected_version integer
)
returns public.technical_visits
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_org uuid;
  v_id uuid;
  v_actor uuid := (select auth.uid());
  v_current public.technical_visits%rowtype;
  v_result public.technical_visits%rowtype;
  v_new_status text;
begin
  begin
    v_org := (p_visit ->> 'organizationId')::uuid;
    v_id := (p_visit ->> 'id')::uuid;
  exception when others then raise exception 'AGROCORE_INVALID_INPUT'; end;

  if v_actor is null or not agrocore_private.can_operate_technical_visit(v_org) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));

  select * into v_current
  from public.technical_visits
  where id=v_id and organization_id=v_org
  for update;
  if not found then raise exception 'AGROCORE_NOT_FOUND'; end if;
  if v_current.version<>p_expected_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
  end if;
  if coalesce((p_visit ->> 'version')::integer,0)<>p_expected_version+1
     or (p_visit ->> 'updatedByUserId') is distinct from v_actor::text then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform agrocore_private.assert_visit_references(v_org,p_visit);
  perform agrocore_private.assert_visit_schedule_conflict(v_org,v_id,p_visit);

  v_new_status := p_visit ->> 'status';
  if v_new_status in ('in_progress','completed')
     and (p_visit ->> 'responsibleUserId') is distinct from v_actor::text then
    raise exception 'AGROCORE_RESPONSIBLE_MISMATCH';
  end if;

  update public.technical_visits
  set status=v_new_status,
      activity_type=p_visit ->> 'activityType',
      client_id=(p_visit ->> 'clientId')::uuid,
      property_id=nullif(p_visit ->> 'propertyId','')::uuid,
      responsible_user_id=(p_visit ->> 'responsibleUserId')::uuid,
      scheduled_for=(p_visit ->> 'scheduledFor')::timestamptz,
      version=p_expected_version+1,
      payload=p_visit,
      updated_at=(p_visit ->> 'updatedAt')::timestamptz
  where id=v_id
  returning * into v_result;

  insert into public.technical_visit_audit (
    id,organization_id,visit_id,version,action,actor_user_id,occurred_at,payload
  ) values (
    (p_audit ->> 'id')::uuid,v_org,v_id,p_expected_version+1,
    p_audit ->> 'action',v_actor,(p_audit ->> 'at')::timestamptz,p_audit
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_create_technical_visit(jsonb,jsonb) from public,anon;
revoke all on function public.agrocore_update_technical_visit(jsonb,jsonb,integer) from public,anon;
grant execute on function public.agrocore_create_technical_visit(jsonb,jsonb) to authenticated;
grant execute on function public.agrocore_update_technical_visit(jsonb,jsonb,integer) to authenticated;

comment on table public.technical_visits is 'Visitas e vistorias canônicas do Módulo 007.';
comment on table public.technical_visit_audit is 'Trilha append-only das visitas e vistorias.';
