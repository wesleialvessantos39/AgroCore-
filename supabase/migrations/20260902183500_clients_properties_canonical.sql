-- AgroCore — Persistência canônica dos Módulos 002 e 003.
-- Clientes e imóveis mantêm payload tipado integral em JSONB e colunas estruturais
-- para RLS, busca, paginação e unicidade autoritativa.

create or replace function agrocore_private.normalize_search_text(value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $
  select regexp_replace(
    translate(
      lower(coalesce(value,'')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  );
$;

create table if not exists public.clients (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  person_type text not null check (person_type in ('individual','legal_entity')),
  status text not null check (status in ('active','inactive')),
  display_name text not null check (length(btrim(display_name)) between 2 and 200),
  trade_name text,
  search_text text not null,
  document_digits text not null check (document_digits ~ '^[0-9]{11}([0-9]{3})?$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organization_id, document_digits)
);

create index if not exists clients_org_status_idx
  on public.clients (organization_id, status, updated_at desc);
create index if not exists clients_org_type_idx
  on public.clients (organization_id, person_type, updated_at desc);
create index if not exists clients_org_name_idx
  on public.clients (organization_id, lower(display_name));
create index if not exists clients_org_search_idx
  on public.clients (organization_id, search_text text_pattern_ops);

alter table public.clients enable row level security;

drop policy if exists "agrocore_clients_select" on public.clients;
create policy "agrocore_clients_select"
on public.clients
for select
to authenticated
using ((select agrocore_private.is_active_organization_member(organization_id)));

revoke all on table public.clients from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.clients from authenticated;
grant select on table public.clients to authenticated;

create or replace function agrocore_private.can_create_client(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    agrocore_private.current_organization_role(target_organization_id)
      in ('owner','company_admin','manager','capturer'),
    false
  );
$$;

create or replace function agrocore_private.can_edit_client(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    agrocore_private.current_organization_role(target_organization_id)
      in ('owner','company_admin','manager'),
    false
  );
$$;

revoke all on function agrocore_private.can_create_client(uuid) from public, anon;
revoke all on function agrocore_private.can_edit_client(uuid) from public, anon;
grant execute on function agrocore_private.can_create_client(uuid) to authenticated;
grant execute on function agrocore_private.can_edit_client(uuid) to authenticated;

create or replace function public.agrocore_create_client(
  p_organization_id uuid,
  p_input jsonb
)
returns public.clients
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_person_type text := p_input ->> 'personType';
  v_status text := p_input ->> 'status';
  v_display_name text;
  v_trade_name text;
  v_document text;
  v_payload jsonb;
  v_result public.clients%rowtype;
begin
  if (select auth.uid()) is null
     or not agrocore_private.can_create_client(p_organization_id) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
     or v_person_type not in ('individual','legal_entity')
     or v_status not in ('active','inactive') then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if v_person_type = 'individual' then
    v_display_name := btrim(coalesce(p_input ->> 'name',''));
    v_document := regexp_replace(coalesce(p_input ->> 'cpf',''), '[^0-9]', '', 'g');
    if length(v_document) <> 11 then raise exception 'AGROCORE_INVALID_INPUT'; end if;
  else
    v_display_name := btrim(coalesce(p_input ->> 'companyName',''));
    v_trade_name := nullif(btrim(coalesce(p_input ->> 'tradeName','')), '');
    v_document := regexp_replace(coalesce(p_input ->> 'cnpj',''), '[^0-9]', '', 'g');
    if length(v_document) <> 14 then raise exception 'AGROCORE_INVALID_INPUT'; end if;
  end if;
  if length(v_display_name) < 2 then raise exception 'AGROCORE_INVALID_INPUT'; end if;

  v_payload := p_input
    || jsonb_build_object(
      'id', v_id::text,
      'organizationId', p_organization_id::text,
      'createdAt', v_now,
      'updatedAt', v_now
    );

  insert into public.clients (
    id, organization_id, person_type, status, display_name, trade_name,
    search_text, document_digits, payload, created_at, updated_at
  ) values (
    v_id, p_organization_id, v_person_type, v_status, v_display_name, v_trade_name,
    agrocore_private.normalize_search_text(
      v_display_name || ' ' || coalesce(v_trade_name,'') || ' ' || v_document
    ),
    v_document, v_payload, v_now, v_now
  )
  returning * into v_result;
  return v_result;
exception
  when unique_violation then
    raise exception 'AGROCORE_DUPLICATE_DOCUMENT';
end;
$$;

create or replace function public.agrocore_update_client(
  p_organization_id uuid,
  p_client_id uuid,
  p_input jsonb
)
returns public.clients
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current public.clients%rowtype;
  v_now timestamptz := clock_timestamp();
  v_person_type text := p_input ->> 'personType';
  v_status text := p_input ->> 'status';
  v_display_name text;
  v_trade_name text;
  v_document text;
  v_payload jsonb;
  v_result public.clients%rowtype;
begin
  if (select auth.uid()) is null
     or not agrocore_private.can_edit_client(p_organization_id) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  select * into v_current
  from public.clients
  where organization_id = p_organization_id and id = p_client_id
  for update;
  if not found then raise exception 'AGROCORE_NOT_FOUND'; end if;

  if p_input is null or jsonb_typeof(p_input) <> 'object'
     or v_person_type is distinct from v_current.person_type
     or v_status not in ('active','inactive') then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if v_person_type = 'individual' then
    v_display_name := btrim(coalesce(p_input ->> 'name',''));
    v_document := regexp_replace(coalesce(p_input ->> 'cpf',''), '[^0-9]', '', 'g');
    if length(v_document) <> 11 then raise exception 'AGROCORE_INVALID_INPUT'; end if;
  else
    v_display_name := btrim(coalesce(p_input ->> 'companyName',''));
    v_trade_name := nullif(btrim(coalesce(p_input ->> 'tradeName','')), '');
    v_document := regexp_replace(coalesce(p_input ->> 'cnpj',''), '[^0-9]', '', 'g');
    if length(v_document) <> 14 then raise exception 'AGROCORE_INVALID_INPUT'; end if;
  end if;
  if length(v_display_name) < 2 then raise exception 'AGROCORE_INVALID_INPUT'; end if;

  v_payload := p_input
    || jsonb_build_object(
      'id', v_current.id::text,
      'organizationId', v_current.organization_id::text,
      'createdAt', v_current.created_at,
      'updatedAt', v_now
    );

  update public.clients
  set status = v_status,
      display_name = v_display_name,
      trade_name = v_trade_name,
      search_text = agrocore_private.normalize_search_text(
        v_display_name || ' ' || coalesce(v_trade_name,'') || ' ' || v_document
      ),
      document_digits = v_document,
      payload = v_payload,
      updated_at = v_now
  where id = v_current.id
  returning * into v_result;
  return v_result;
exception
  when unique_violation then
    raise exception 'AGROCORE_DUPLICATE_DOCUMENT';
end;
$$;

revoke all on function public.agrocore_create_client(uuid,jsonb) from public, anon;
revoke all on function public.agrocore_update_client(uuid,uuid,jsonb) from public, anon;
grant execute on function public.agrocore_create_client(uuid,jsonb) to authenticated;
grant execute on function public.agrocore_update_client(uuid,uuid,jsonb) to authenticated;

create table if not exists public.properties (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_type text not null check (property_type in ('rural','urban')),
  status text not null check (status in ('active','inactive')),
  name text not null check (length(btrim(name)) between 2 and 200),
  city text not null,
  state text not null,
  search_text text not null,
  cib_key text,
  sncr_key text,
  municipal_registration_key text,
  client_ids uuid[] not null default '{}'::uuid[],
  registration_keys text[] not null default '{}'::text[],
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists properties_org_cib_unique
  on public.properties (organization_id, cib_key)
  where cib_key is not null;
create unique index if not exists properties_org_sncr_unique
  on public.properties (organization_id, sncr_key)
  where sncr_key is not null;
create unique index if not exists properties_org_municipal_unique
  on public.properties (organization_id, municipal_registration_key)
  where municipal_registration_key is not null;
create index if not exists properties_org_status_idx
  on public.properties (organization_id, status, updated_at desc);
create index if not exists properties_org_type_idx
  on public.properties (organization_id, property_type, updated_at desc);
create index if not exists properties_org_search_idx
  on public.properties (organization_id, search_text text_pattern_ops);
create index if not exists properties_client_ids_gin
  on public.properties using gin (client_ids);
create index if not exists properties_registration_keys_gin
  on public.properties using gin (registration_keys);

alter table public.properties enable row level security;

drop policy if exists "agrocore_properties_select" on public.properties;
create policy "agrocore_properties_select"
on public.properties
for select
to authenticated
using ((select agrocore_private.is_active_organization_member(organization_id)));

revoke all on table public.properties from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.properties from authenticated;
grant select on table public.properties to authenticated;

create or replace function agrocore_private.can_create_property(target_organization_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    agrocore_private.current_organization_role(target_organization_id)
      in ('owner','company_admin','manager','project_designer','capturer'),
    false
  );
$$;

create or replace function agrocore_private.can_edit_property(target_organization_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    agrocore_private.current_organization_role(target_organization_id)
      in ('owner','company_admin','manager','project_designer','capturer'),
    false
  );
$$;

revoke all on function agrocore_private.can_create_property(uuid) from public, anon;
revoke all on function agrocore_private.can_edit_property(uuid) from public, anon;
grant execute on function agrocore_private.can_create_property(uuid) to authenticated;
grant execute on function agrocore_private.can_edit_property(uuid) to authenticated;

create or replace function agrocore_private.property_registration_keys(p_input jsonb)
returns text[]
language sql immutable security invoker set search_path = ''
as $$
  select coalesce(
    array_agg(distinct lower(
      btrim(item ->> 'registrationNumber') || '|' ||
      btrim(item ->> 'registryOffice') || '|' ||
      btrim(item ->> 'district')
    ) order by lower(
      btrim(item ->> 'registrationNumber') || '|' ||
      btrim(item ->> 'registryOffice') || '|' ||
      btrim(item ->> 'district')
    )) filter (
      where btrim(coalesce(item ->> 'registrationNumber','')) <> ''
        and btrim(coalesce(item ->> 'registryOffice','')) <> ''
        and btrim(coalesce(item ->> 'district','')) <> ''
    ),
    '{}'::text[]
  )
  from jsonb_array_elements(coalesce(p_input -> 'registrations','[]'::jsonb)) item;
$$;

create or replace function agrocore_private.property_client_ids(
  p_organization_id uuid,
  p_input jsonb
)
returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(distinct (item ->> 'clientId')::uuid), '{}'::uuid[])
  into v_ids
  from jsonb_array_elements(coalesce(p_input -> 'clientLinks','[]'::jsonb)) item
  where nullif(item ->> 'clientId','') is not null;

  if cardinality(v_ids) = 0 then raise exception 'AGROCORE_INVALID_INPUT'; end if;
  if (
    select count(*)
    from jsonb_array_elements(coalesce(p_input -> 'clientLinks','[]'::jsonb)) item
    where coalesce((item ->> 'isPrimaryHolder')::boolean, false)
  ) <> 1 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  if exists (
    select 1 from unnest(v_ids) client_id
    where not exists (
      select 1 from public.clients client
      where client.id = client_id
        and client.organization_id = p_organization_id
    )
  ) then
    raise exception 'AGROCORE_CLIENT_MISMATCH';
  end if;
  return v_ids;
exception
  when invalid_text_representation then
    raise exception 'AGROCORE_INVALID_INPUT';
end;
$$;

create or replace function agrocore_private.assert_property_registration_unique(
  p_organization_id uuid,
  p_property_id uuid,
  p_keys text[]
)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.properties other
    where other.organization_id = p_organization_id
      and (p_property_id is null or other.id <> p_property_id)
      and other.registration_keys && p_keys
  ) then
    raise exception 'AGROCORE_PROPERTY_REGISTRATION_CONFLICT';
  end if;
end;
$$;

create or replace function public.agrocore_create_property(
  p_input jsonb
)
returns public.properties
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_type text := p_input ->> 'propertyType';
  v_status text := p_input ->> 'status';
  v_name text := btrim(coalesce(p_input ->> 'name',''));
  v_city text := btrim(coalesce(p_input #>> '{location,city}',''));
  v_state text := upper(btrim(coalesce(p_input #>> '{location,state}','')));
  v_cib text := nullif(upper(regexp_replace(coalesce(p_input #>> '{identifiers,cib}',''), '[^A-Za-z0-9-]', '', 'g')), '');
  v_sncr text := nullif(regexp_replace(coalesce(p_input #>> '{identifiers,sncrIncraCode}',''), '[^0-9]', '', 'g'), '');
  v_municipal text := nullif(lower(btrim(coalesce(p_input #>> '{identifiers,municipalRegistration}',''))), '');
  v_clients uuid[];
  v_regs text[];
  v_payload jsonb;
  v_result public.properties%rowtype;
  v_constraint text;
begin
  begin v_org := (p_input ->> 'organizationId')::uuid;
  exception when others then raise exception 'AGROCORE_INVALID_INPUT'; end;

  if (select auth.uid()) is null or not agrocore_private.can_create_property(v_org) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if v_type not in ('rural','urban') or v_status not in ('active','inactive')
     or length(v_name) < 2 or length(v_city) < 2 or length(v_state) <> 2 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_clients := agrocore_private.property_client_ids(v_org, p_input);
  v_regs := agrocore_private.property_registration_keys(p_input);
  perform agrocore_private.assert_property_registration_unique(v_org, null, v_regs);

  v_payload := p_input
    || jsonb_build_object(
      'id', v_id::text,
      'organizationId', v_org::text,
      'createdAt', v_now,
      'updatedAt', v_now
    );

  insert into public.properties (
    id, organization_id, property_type, status, name, city, state, search_text,
    cib_key, sncr_key, municipal_registration_key, client_ids,
    registration_keys, payload, created_at, updated_at
  ) values (
    v_id, v_org, v_type, v_status, v_name, v_city, v_state,
    agrocore_private.normalize_search_text(
      v_name || ' ' || v_city || ' ' || v_state || ' ' ||
      coalesce(v_cib,'') || ' ' || coalesce(v_sncr,'') || ' ' || coalesce(v_municipal,'')
    ),
    v_cib, case when v_type='rural' then v_sncr else null end,
    case when v_type='urban' then v_municipal else null end,
    v_clients, v_regs, v_payload, v_now, v_now
  )
  returning * into v_result;
  return v_result;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'properties_org_cib_unique' then
      raise exception 'AGROCORE_PROPERTY_CIB_CONFLICT';
    elsif v_constraint = 'properties_org_sncr_unique' then
      raise exception 'AGROCORE_PROPERTY_SNCR_CONFLICT';
    elsif v_constraint = 'properties_org_municipal_unique' then
      raise exception 'AGROCORE_PROPERTY_MUNICIPAL_CONFLICT';
    end if;
    raise;
end;
$;

create or replace function public.agrocore_update_property(
  p_organization_id uuid,
  p_property_id uuid,
  p_input jsonb
)
returns public.properties
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_current public.properties%rowtype;
  v_now timestamptz := clock_timestamp();
  v_status text := p_input ->> 'status';
  v_name text := btrim(coalesce(p_input ->> 'name',''));
  v_city text := btrim(coalesce(p_input #>> '{location,city}',''));
  v_state text := upper(btrim(coalesce(p_input #>> '{location,state}','')));
  v_cib text := nullif(upper(regexp_replace(coalesce(p_input #>> '{identifiers,cib}',''), '[^A-Za-z0-9-]', '', 'g')), '');
  v_sncr text := nullif(regexp_replace(coalesce(p_input #>> '{identifiers,sncrIncraCode}',''), '[^0-9]', '', 'g'), '');
  v_municipal text := nullif(lower(btrim(coalesce(p_input #>> '{identifiers,municipalRegistration}',''))), '');
  v_clients uuid[];
  v_regs text[];
  v_payload jsonb;
  v_result public.properties%rowtype;
  v_constraint text;
begin
  if (select auth.uid()) is null or not agrocore_private.can_edit_property(p_organization_id) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  select * into v_current
  from public.properties
  where organization_id=p_organization_id and id=p_property_id
  for update;
  if not found then raise exception 'AGROCORE_NOT_FOUND'; end if;
  if v_status not in ('active','inactive')
     or length(v_name) < 2 or length(v_city) < 2 or length(v_state) <> 2 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_clients := agrocore_private.property_client_ids(p_organization_id, p_input);
  v_regs := agrocore_private.property_registration_keys(p_input);
  perform agrocore_private.assert_property_registration_unique(
    p_organization_id, p_property_id, v_regs
  );

  v_payload := p_input
    || jsonb_build_object(
      'id', v_current.id::text,
      'organizationId', v_current.organization_id::text,
      'propertyType', v_current.property_type,
      'createdAt', v_current.created_at,
      'updatedAt', v_now
    );

  update public.properties
  set status=v_status, name=v_name, city=v_city, state=v_state,
      search_text=agrocore_private.normalize_search_text(
        v_name || ' ' || v_city || ' ' || v_state || ' ' ||
        coalesce(v_cib,'') || ' ' || coalesce(v_sncr,'') || ' ' || coalesce(v_municipal,'')
      ),
      cib_key=v_cib,
      sncr_key=case when v_current.property_type='rural' then v_sncr else null end,
      municipal_registration_key=case when v_current.property_type='urban' then v_municipal else null end,
      client_ids=v_clients, registration_keys=v_regs, payload=v_payload,
      updated_at=v_now
  where id=v_current.id
  returning * into v_result;
  return v_result;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'properties_org_cib_unique' then
      raise exception 'AGROCORE_PROPERTY_CIB_CONFLICT';
    elsif v_constraint = 'properties_org_sncr_unique' then
      raise exception 'AGROCORE_PROPERTY_SNCR_CONFLICT';
    elsif v_constraint = 'properties_org_municipal_unique' then
      raise exception 'AGROCORE_PROPERTY_MUNICIPAL_CONFLICT';
    end if;
    raise;
end;
$;

revoke all on function public.agrocore_create_property(jsonb) from public, anon;
revoke all on function public.agrocore_update_property(uuid,uuid,jsonb) from public, anon;
grant execute on function public.agrocore_create_property(jsonb) to authenticated;
grant execute on function public.agrocore_update_property(uuid,uuid,jsonb) to authenticated;

comment on table public.clients is 'Cadastro canônico de clientes e produtores do AgroCore.';
comment on table public.properties is 'Cadastro canônico de imóveis rurais e urbanos do AgroCore.';
