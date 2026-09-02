-- AgroCore — Persistência auxiliar dos Módulos 002, 003 e 004.

-- 1. Vínculo Cliente-Captador
create table if not exists public.client_capturer_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  capturer_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('active','terminated')),
  is_primary boolean not null default true,
  started_at timestamptz not null,
  ended_at timestamptz,
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  transfer_reason text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload)='object')
);

create unique index if not exists client_capturer_one_active_per_client
  on public.client_capturer_assignments (organization_id,client_id)
  where status='active';
create index if not exists client_capturer_capturer_idx
  on public.client_capturer_assignments (organization_id,capturer_user_id,status);

create table if not exists public.client_capturer_idempotency (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  command_payload jsonb not null,
  result_assignment_id uuid not null references public.client_capturer_assignments(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (organization_id,operation,idempotency_key)
);

alter table public.client_capturer_assignments enable row level security;
alter table public.client_capturer_idempotency enable row level security;

drop policy if exists "agrocore_client_capturer_select" on public.client_capturer_assignments;
create policy "agrocore_client_capturer_select"
on public.client_capturer_assignments for select to authenticated
using ((select agrocore_private.is_active_organization_member(organization_id)));

revoke all on public.client_capturer_assignments from public,anon;
revoke all on public.client_capturer_idempotency from public,anon,authenticated;
revoke insert,update,delete,truncate,references,trigger
  on public.client_capturer_assignments from authenticated;
grant select on public.client_capturer_assignments to authenticated;

create or replace function agrocore_private.can_manage_capturer_assignment(target_organization_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select coalesce(
    agrocore_private.current_organization_role(target_organization_id)
      in ('owner','company_admin','manager'),
    false
  );
$$;

revoke all on function agrocore_private.can_manage_capturer_assignment(uuid) from public,anon;
grant execute on function agrocore_private.can_manage_capturer_assignment(uuid) to authenticated;

create or replace function agrocore_private.assert_capturer_target(
  p_organization_id uuid,
  p_client_id uuid,
  p_capturer_user_id uuid
)
returns void
language plpgsql stable security definer set search_path=''
as $$
begin
  if not exists (
    select 1 from public.clients c
    where c.id=p_client_id and c.organization_id=p_organization_id and c.status='active'
  ) then raise exception 'AGROCORE_CLIENT_NOT_FOUND'; end if;

  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id
      and m.user_id=p_capturer_user_id
      and m.status='active'
      and m.organization_role='capturer'
  ) then raise exception 'AGROCORE_CAPTURER_NOT_FOUND'; end if;
end;
$$;

create or replace function agrocore_private.assignment_payload(
  p_row public.client_capturer_assignments
)
returns jsonb
language sql stable security invoker set search_path=''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_row.id::text,
    'organizationId',p_row.organization_id::text,
    'clientId',p_row.client_id::text,
    'capturerUserId',p_row.capturer_user_id::text,
    'status',p_row.status,
    'isPrimary',p_row.is_primary,
    'startedAt',p_row.started_at,
    'endedAt',p_row.ended_at,
    'assignedByUserId',p_row.assigned_by_user_id::text,
    'transferReason',p_row.transfer_reason,
    'createdAt',p_row.created_at,
    'updatedAt',p_row.updated_at
  ));
$$;

create or replace function public.agrocore_assign_capturer(
  p_organization_id uuid,
  p_client_id uuid,
  p_capturer_user_id uuid,
  p_is_primary boolean,
  p_idempotency_key text default null
)
returns public.client_capturer_assignments
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_command jsonb;
  v_existing public.client_capturer_assignments%rowtype;
  v_result public.client_capturer_assignments%rowtype;
begin
  if v_actor is null or not agrocore_private.can_manage_capturer_assignment(p_organization_id) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  perform agrocore_private.assert_capturer_target(
    p_organization_id,p_client_id,p_capturer_user_id
  );
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_client_id::text,0));

  v_command:=jsonb_build_object(
    'clientId',p_client_id::text,'capturerUserId',p_capturer_user_id::text,
    'assignedByUserId',v_actor::text,'isPrimary',coalesce(p_is_primary,true)
  );

  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is not null then
    select a.* into v_existing
    from public.client_capturer_idempotency i
    join public.client_capturer_assignments a on a.id=i.result_assignment_id
    where i.organization_id=p_organization_id
      and i.operation='assign'
      and i.idempotency_key=p_idempotency_key;
    if found then
      if (
        select i.command_payload
        from public.client_capturer_idempotency i
        where i.organization_id=p_organization_id
          and i.operation='assign'
          and i.idempotency_key=p_idempotency_key
      ) <> v_command then raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT'; end if;
      return v_existing;
    end if;
  end if;

  update public.client_capturer_assignments
  set status='terminated',ended_at=v_now,updated_at=v_now,
      transfer_reason='Substituição por nova atribuição direta de captador.'
  where organization_id=p_organization_id and client_id=p_client_id and status='active';

  insert into public.client_capturer_assignments (
    organization_id,client_id,capturer_user_id,status,is_primary,
    started_at,assigned_by_user_id,created_at,updated_at,payload
  ) values (
    p_organization_id,p_client_id,p_capturer_user_id,'active',coalesce(p_is_primary,true),
    v_now,v_actor,v_now,v_now,'{}'::jsonb
  ) returning * into v_result;

  update public.client_capturer_assignments
  set payload=agrocore_private.assignment_payload(v_result)
  where id=v_result.id
  returning * into v_result;

  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is not null then
    insert into public.client_capturer_idempotency (
      organization_id,operation,idempotency_key,command_payload,result_assignment_id
    ) values (
      p_organization_id,'assign',p_idempotency_key,v_command,v_result.id
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.agrocore_transfer_capturer(
  p_organization_id uuid,
  p_client_id uuid,
  p_new_capturer_user_id uuid,
  p_transfer_reason text,
  p_idempotency_key text default null
)
returns public.client_capturer_assignments
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_reason text := btrim(coalesce(p_transfer_reason,''));
  v_command jsonb;
  v_existing public.client_capturer_assignments%rowtype;
  v_result public.client_capturer_assignments%rowtype;
begin
  if v_actor is null or not agrocore_private.can_manage_capturer_assignment(p_organization_id) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if length(v_reason)<3 then raise exception 'AGROCORE_INVALID_INPUT'; end if;
  perform agrocore_private.assert_capturer_target(
    p_organization_id,p_client_id,p_new_capturer_user_id
  );
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_client_id::text,0));

  v_command:=jsonb_build_object(
    'clientId',p_client_id::text,'newCapturerUserId',p_new_capturer_user_id::text,
    'assignedByUserId',v_actor::text,'transferReason',v_reason
  );

  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is not null then
    select a.* into v_existing
    from public.client_capturer_idempotency i
    join public.client_capturer_assignments a on a.id=i.result_assignment_id
    where i.organization_id=p_organization_id
      and i.operation='transfer'
      and i.idempotency_key=p_idempotency_key;
    if found then
      if (
        select i.command_payload from public.client_capturer_idempotency i
        where i.organization_id=p_organization_id
          and i.operation='transfer'
          and i.idempotency_key=p_idempotency_key
      ) <> v_command then raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT'; end if;
      return v_existing;
    end if;
  end if;

  update public.client_capturer_assignments
  set status='terminated',ended_at=v_now,updated_at=v_now,transfer_reason=v_reason
  where organization_id=p_organization_id and client_id=p_client_id and status='active';

  insert into public.client_capturer_assignments (
    organization_id,client_id,capturer_user_id,status,is_primary,
    started_at,assigned_by_user_id,transfer_reason,created_at,updated_at,payload
  ) values (
    p_organization_id,p_client_id,p_new_capturer_user_id,'active',true,
    v_now,v_actor,v_reason,v_now,v_now,'{}'::jsonb
  ) returning * into v_result;

  update public.client_capturer_assignments
  set payload=agrocore_private.assignment_payload(v_result)
  where id=v_result.id
  returning * into v_result;

  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is not null then
    insert into public.client_capturer_idempotency (
      organization_id,operation,idempotency_key,command_payload,result_assignment_id
    ) values (
      p_organization_id,'transfer',p_idempotency_key,v_command,v_result.id
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.agrocore_terminate_capturer_assignment(
  p_organization_id uuid,
  p_client_id uuid,
  p_assignment_id uuid,
  p_reason text
)
returns public.client_capturer_assignments
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_reason text := btrim(coalesce(p_reason,''));
  v_result public.client_capturer_assignments%rowtype;
begin
  if v_actor is null or not agrocore_private.can_manage_capturer_assignment(p_organization_id) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if length(v_reason)<3 then raise exception 'AGROCORE_INVALID_INPUT'; end if;

  select * into v_result
  from public.client_capturer_assignments
  where id=p_assignment_id and organization_id=p_organization_id and client_id=p_client_id
  for update;
  if not found then raise exception 'AGROCORE_NOT_FOUND'; end if;
  if v_result.status='terminated' then return v_result; end if;

  update public.client_capturer_assignments
  set status='terminated',ended_at=v_now,updated_at=v_now,transfer_reason=v_reason
  where id=p_assignment_id
  returning * into v_result;

  update public.client_capturer_assignments
  set payload=agrocore_private.assignment_payload(v_result)
  where id=v_result.id
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.agrocore_assign_capturer(uuid,uuid,uuid,boolean,text) from public,anon;
revoke all on function public.agrocore_transfer_capturer(uuid,uuid,uuid,text,text) from public,anon;
revoke all on function public.agrocore_terminate_capturer_assignment(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.agrocore_assign_capturer(uuid,uuid,uuid,boolean,text) to authenticated;
grant execute on function public.agrocore_transfer_capturer(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.agrocore_terminate_capturer_assignment(uuid,uuid,uuid,text) to authenticated;

-- 2. Perfis profissionais técnicos
create table if not exists public.technical_professional_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null,
  council text not null,
  discipline text not null,
  registration_number text not null,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organization_id,user_id)
);

create index if not exists technical_profiles_org_filters_idx
  on public.technical_professional_profiles (organization_id,status,council,discipline);

alter table public.technical_professional_profiles enable row level security;

drop policy if exists "agrocore_technical_profiles_select" on public.technical_professional_profiles;
create policy "agrocore_technical_profiles_select"
on public.technical_professional_profiles for select to authenticated
using (
  user_id=(select auth.uid())
  or coalesce(
    agrocore_private.current_organization_role(organization_id)
      in ('owner','company_admin','manager'),
    false
  )
);

revoke all on public.technical_professional_profiles from public,anon;
revoke insert,update,delete,truncate,references,trigger
  on public.technical_professional_profiles from authenticated;
grant select on public.technical_professional_profiles to authenticated;

create or replace function public.agrocore_save_technical_profile(
  p_organization_id uuid,
  p_user_id uuid,
  p_profile_id uuid,
  p_input jsonb
)
returns public.technical_professional_profiles
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_current public.technical_professional_profiles%rowtype;
  v_now timestamptz := clock_timestamp();
  v_id uuid := coalesce(p_profile_id,gen_random_uuid());
  v_payload jsonb;
  v_result public.technical_professional_profiles%rowtype;
begin
  v_role:=agrocore_private.current_organization_role(p_organization_id);
  if v_actor is null or v_actor<>p_user_id or v_role<>'project_designer' then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id and m.user_id=p_user_id
      and m.status='active' and m.organization_role='project_designer'
  ) then raise exception 'AGROCORE_FORBIDDEN'; end if;

  select * into v_current
  from public.technical_professional_profiles
  where organization_id=p_organization_id and user_id=p_user_id
  for update;

  if found then
    v_id:=v_current.id;
    v_payload:=v_current.payload || p_input || jsonb_build_object(
      'id',v_id::text,'organizationId',p_organization_id::text,'userId',p_user_id::text,
      'status',v_current.status,'createdAt',v_current.created_at,'updatedAt',v_now
    );
    update public.technical_professional_profiles
    set council=coalesce(p_input->>'council',council),
        discipline=coalesce(p_input->>'discipline',discipline),
        registration_number=coalesce(p_input->>'registrationNumber',registration_number),
        payload=v_payload,updated_at=v_now
    where id=v_id returning * into v_result;
  else
    if length(btrim(coalesce(p_input->>'registrationNumber','')))<2
       or length(btrim(coalesce(p_input->>'declaredTitle','')))<2 then
      raise exception 'AGROCORE_INVALID_INPUT';
    end if;
    v_payload:=p_input || jsonb_build_object(
      'id',v_id::text,'organizationId',p_organization_id::text,'userId',p_user_id::text,
      'status','pending_review','capabilities',coalesce(p_input->'capabilities','[]'::jsonb),
      'createdAt',v_now,'updatedAt',v_now
    );
    insert into public.technical_professional_profiles(
      id,organization_id,user_id,status,council,discipline,registration_number,
      payload,created_at,updated_at
    ) values (
      v_id,p_organization_id,p_user_id,'pending_review',
      p_input->>'council',p_input->>'discipline',p_input->>'registrationNumber',
      v_payload,v_now,v_now
    ) returning * into v_result;
  end if;
  return v_result;
end;
$$;

create or replace function public.agrocore_verify_technical_profile(
  p_organization_id uuid,
  p_profile_id uuid,
  p_status text,
  p_verification_source text,
  p_impediments jsonb,
  p_capabilities jsonb
)
returns public.technical_professional_profiles
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text := agrocore_private.current_organization_role(p_organization_id);
  v_now timestamptz := clock_timestamp();
  v_current public.technical_professional_profiles%rowtype;
  v_payload jsonb;
  v_result public.technical_professional_profiles%rowtype;
begin
  if v_actor is null or v_role not in ('owner','company_admin','manager') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if p_status not in ('not_informed','pending_review','manually_verified','ineligible','suspended','expired')
     or p_verification_source not in ('manual_administrative','document_declared') then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  select * into v_current
  from public.technical_professional_profiles
  where organization_id=p_organization_id and id=p_profile_id
  for update;
  if not found then raise exception 'AGROCORE_NOT_FOUND'; end if;

  v_payload:=v_current.payload || jsonb_build_object(
    'status',p_status,'verificationSource',p_verification_source,
    'verifiedAt',v_now,'verifiedByUserId',v_actor::text,
    'impediments',coalesce(p_impediments,'[]'::jsonb),
    'capabilities',coalesce(p_capabilities,v_current.payload->'capabilities','[]'::jsonb),
    'updatedAt',v_now
  );

  update public.technical_professional_profiles
  set status=p_status,payload=v_payload,updated_at=v_now
  where id=p_profile_id returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.agrocore_save_technical_profile(uuid,uuid,uuid,jsonb) from public,anon;
revoke all on function public.agrocore_verify_technical_profile(uuid,uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.agrocore_save_technical_profile(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.agrocore_verify_technical_profile(uuid,uuid,text,text,jsonb,jsonb) to authenticated;

-- 3. Geometria canônica dos imóveis
create table if not exists public.property_geometries (
  property_id uuid primary key references public.properties(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  geometry_id text not null unique,
  status text not null check (status in ('draft','under_review','validated_internally')),
  internal_revision integer not null check (internal_revision>=1),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  updated_at timestamptz not null
);

create index if not exists property_geometries_org_idx
  on public.property_geometries (organization_id,status,updated_at desc);

alter table public.property_geometries enable row level security;

drop policy if exists "agrocore_property_geometries_select" on public.property_geometries;
create policy "agrocore_property_geometries_select"
on public.property_geometries for select to authenticated
using (
  coalesce(
    agrocore_private.current_organization_role(organization_id)
      in ('owner','company_admin','manager','project_designer','capturer'),
    false
  )
);

revoke all on public.property_geometries from public,anon;
revoke insert,update,delete,truncate,references,trigger on public.property_geometries from authenticated;
grant select on public.property_geometries to authenticated;

create or replace function public.agrocore_save_property_geometry(
  p_organization_id uuid,
  p_property_id uuid,
  p_geometry jsonb,
  p_expected_revision integer
)
returns public.property_geometries
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_role text := agrocore_private.current_organization_role(p_organization_id);
  v_current public.property_geometries%rowtype;
  v_revision integer;
  v_result public.property_geometries%rowtype;
begin
  if (select auth.uid()) is null
     or v_role not in ('owner','company_admin','manager','project_designer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if not exists (
    select 1 from public.properties p
    where p.id=p_property_id and p.organization_id=p_organization_id
  ) then raise exception 'AGROCORE_NOT_FOUND'; end if;

  select * into v_current
  from public.property_geometries
  where property_id=p_property_id and organization_id=p_organization_id
  for update;

  if found then
    if p_expected_revision is null or v_current.internal_revision<>p_expected_revision then
      raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
    end if;
    v_revision:=v_current.internal_revision+1;
  else
    if p_expected_revision is not null and p_expected_revision<>0 then
      raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
    end if;
    v_revision:=1;
  end if;

  if coalesce((p_geometry->>'internalRevision')::integer,0)<>v_revision
     or (p_geometry->>'propertyId') is distinct from p_property_id::text
     or (p_geometry->>'organizationId') is distinct from p_organization_id::text then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  insert into public.property_geometries(
    property_id,organization_id,geometry_id,status,internal_revision,payload,updated_at
  ) values (
    p_property_id,p_organization_id,p_geometry->>'id',p_geometry->>'status',
    v_revision,p_geometry,(p_geometry->>'updatedAt')::timestamptz
  )
  on conflict (property_id) do update set
    geometry_id=excluded.geometry_id,status=excluded.status,
    internal_revision=excluded.internal_revision,payload=excluded.payload,
    updated_at=excluded.updated_at
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.agrocore_clear_property_geometry(
  p_organization_id uuid,
  p_property_id uuid
)
returns boolean
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_role text := agrocore_private.current_organization_role(p_organization_id);
begin
  if (select auth.uid()) is null
     or v_role not in ('owner','company_admin','manager','project_designer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  delete from public.property_geometries
  where organization_id=p_organization_id and property_id=p_property_id;
  return true;
end;
$$;

revoke all on function public.agrocore_save_property_geometry(uuid,uuid,jsonb,integer) from public,anon;
revoke all on function public.agrocore_clear_property_geometry(uuid,uuid) from public,anon;
grant execute on function public.agrocore_save_property_geometry(uuid,uuid,jsonb,integer) to authenticated;
grant execute on function public.agrocore_clear_property_geometry(uuid,uuid) to authenticated;
