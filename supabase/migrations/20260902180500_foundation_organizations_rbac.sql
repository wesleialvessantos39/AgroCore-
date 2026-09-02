-- AgroCore — Fundação Supabase para autenticação, organizações e RBAC.
-- Necessária antes das migrations documentais do Módulo 006.

create schema if not exists agrocore_private;
revoke all on schema agrocore_private from public, anon;
grant usage on schema agrocore_private to authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 100),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'pending_verification')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_role text not null check (
    organization_role in (
      'owner', 'company_admin', 'manager',
      'project_designer', 'finance', 'capturer'
    )
  ),
  status text not null default 'active'
    check (status in ('active', 'pending', 'revoked')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (organization_id, user_id)
);

create table if not exists public.user_platform_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  platform_role text not null default 'none'
    check (platform_role in ('platform_super_admin', 'none')),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists organization_memberships_user_idx
  on public.organization_memberships (user_id, status);
create index if not exists organization_memberships_org_idx
  on public.organization_memberships (organization_id, status, organization_role);

create or replace function agrocore_private.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select role_row.platform_role = 'platform_super_admin'
      from public.user_platform_roles role_row
      where role_row.user_id = (select auth.uid())
    ),
    false
  );
$$;

create or replace function agrocore_private.is_active_organization_member(
  target_organization_id uuid
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
      where membership.organization_id = target_organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    );
$$;

create or replace function agrocore_private.current_organization_role(
  target_organization_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership.organization_role
  from public.organization_memberships membership
  where membership.organization_id = target_organization_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
  limit 1;
$$;

revoke all on function agrocore_private.is_platform_super_admin() from public, anon;
revoke all on function agrocore_private.is_active_organization_member(uuid) from public, anon;
revoke all on function agrocore_private.current_organization_role(uuid) from public, anon;
grant execute on function agrocore_private.is_platform_super_admin() to authenticated;
grant execute on function agrocore_private.is_active_organization_member(uuid) to authenticated;
grant execute on function agrocore_private.current_organization_role(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.user_platform_roles enable row level security;

drop policy if exists "agrocore_organizations_select" on public.organizations;
create policy "agrocore_organizations_select"
on public.organizations
for select
to authenticated
using (
  (select agrocore_private.is_platform_super_admin())
  or (select agrocore_private.is_active_organization_member(id))
);

drop policy if exists "agrocore_memberships_select_self" on public.organization_memberships;
create policy "agrocore_memberships_select_self"
on public.organization_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select agrocore_private.is_platform_super_admin())
);

drop policy if exists "agrocore_platform_roles_select_self" on public.user_platform_roles;
create policy "agrocore_platform_roles_select_self"
on public.user_platform_roles
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.organizations from public, anon;
revoke all on table public.organization_memberships from public, anon;
revoke all on table public.user_platform_roles from public, anon;

revoke insert, update, delete, truncate, references, trigger
  on table public.organizations from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.organization_memberships from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.user_platform_roles from authenticated;

grant select on table public.organizations to authenticated;
grant select on table public.organization_memberships to authenticated;
grant select on table public.user_platform_roles to authenticated;

create or replace function public.agrocore_get_platform_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select role_row.platform_role
      from public.user_platform_roles role_row
      where role_row.user_id = (select auth.uid())
    ),
    'none'
  );
$$;

create or replace function public.agrocore_list_my_memberships()
returns table (
  organization_id uuid,
  user_id uuid,
  organization_role text,
  membership_status text,
  organization_name text,
  organization_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    membership.organization_id,
    membership.user_id,
    membership.organization_role,
    membership.status,
    organization.name,
    organization.status
  from public.organization_memberships membership
  join public.organizations organization
    on organization.id = membership.organization_id
  where membership.user_id = (select auth.uid())
  order by
    case membership.status when 'active' then 0 when 'pending' then 1 else 2 end,
    organization.name,
    membership.organization_id;
$$;

create or replace function public.agrocore_configure_initial_organization(
  p_name text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if length(v_name) not between 2 and 100 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  if exists (
    select 1
    from public.organization_memberships membership
    where membership.user_id = v_user_id
      and membership.status in ('active', 'pending')
  ) then
    raise exception 'AGROCORE_ORGANIZATION_ALREADY_CONFIGURED';
  end if;

  insert into public.organizations (
    name, status, created_by_user_id
  ) values (
    v_name, 'active', v_user_id
  )
  returning id into v_organization_id;

  insert into public.organization_memberships (
    organization_id, user_id, organization_role, status
  ) values (
    v_organization_id, v_user_id, 'owner', 'active'
  );

  return v_organization_id;
end;
$$;

create or replace function public.agrocore_list_organization_members(
  p_organization_id uuid
)
returns table (
  membership_id uuid,
  user_id uuid,
  member_name text,
  member_email text,
  organization_role text,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if (select auth.uid()) is null then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  v_role := agrocore_private.current_organization_role(p_organization_id);
  if v_role is null and not agrocore_private.is_platform_super_admin() then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  return query
  select
    membership.id,
    membership.user_id,
    left(
      btrim(
        coalesce(
          user_row.raw_user_meta_data ->> 'name',
          user_row.raw_user_meta_data ->> 'full_name',
          split_part(coalesce(user_row.email, ''), '@', 1),
          'Integrante'
        )
      ),
      120
    ),
    coalesce(user_row.email, ''),
    membership.organization_role,
    membership.status = 'active'
  from public.organization_memberships membership
  join auth.users user_row on user_row.id = membership.user_id
  where membership.organization_id = p_organization_id
  order by
    case membership.status when 'active' then 0 else 1 end,
    membership.organization_role,
    membership.created_at,
    membership.user_id;
end;
$$;

revoke all on function public.agrocore_get_platform_role() from public, anon;
revoke all on function public.agrocore_list_my_memberships() from public, anon;
revoke all on function public.agrocore_configure_initial_organization(text) from public, anon;
revoke all on function public.agrocore_list_organization_members(uuid) from public, anon;

grant execute on function public.agrocore_get_platform_role() to authenticated;
grant execute on function public.agrocore_list_my_memberships() to authenticated;
grant execute on function public.agrocore_configure_initial_organization(text) to authenticated;
grant execute on function public.agrocore_list_organization_members(uuid) to authenticated;

comment on table public.organizations
is 'Organizações canônicas do AgroCore.';
comment on table public.organization_memberships
is 'Vínculos organizacionais e papéis RBAC canônicos do AgroCore.';
comment on table public.user_platform_roles
is 'Papéis globais da plataforma; usuários comuns permanecem com none.';
