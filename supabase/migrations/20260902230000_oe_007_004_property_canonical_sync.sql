-- AgroCore — OE-007.004 R2
-- Fonte canônica por imóvel + solicitações cadastrais Projetista -> Captador.

-- ---------------------------------------------------------------------------
-- 1. Evidência passa a pertencer exclusivamente ao imóvel.
-- ---------------------------------------------------------------------------

alter table public.field_evidence_sets
  drop constraint if exists field_evidence_sets_check;

alter table public.field_evidence_sets
  alter column property_id set not null;

drop index if exists public.field_evidence_sets_org_visit_uq;
drop index if exists public.field_evidence_sets_org_appraisal_uq;

create unique index if not exists field_evidence_sets_org_property_uq
  on public.field_evidence_sets (organization_id, property_id);

create table if not exists public.field_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  evidence_id uuid not null references public.field_evidence_sets(id) on delete cascade,
  entity_type text not null check (entity_type in ('visit','appraisal')),
  entity_id text not null check (length(btrim(entity_id)) between 1 and 180),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (organization_id, entity_type, entity_id)
);

create index if not exists field_evidence_links_evidence_idx
  on public.field_evidence_links (evidence_id);

alter table public.field_evidence_links enable row level security;

alter table public.field_evidence_photos
  drop constraint if exists field_evidence_photos_source_check;

alter table public.field_evidence_photos
  add constraint field_evidence_photos_source_check
  check (
    source in (
      'property_document',
      'property_capture',
      'visit_capture',
      'appraisal_capture'
    )
  );

alter table public.field_evidence_photos
  drop constraint if exists field_evidence_photos_check1;

alter table public.field_evidence_photos
  drop column if exists legacy_reference;

drop index if exists public.field_evidence_photos_legacy_uq;

-- ---------------------------------------------------------------------------
-- 2. Autorização canônica por imóvel/cliente.
-- ---------------------------------------------------------------------------

create or replace function agrocore_private.can_access_property_field_evidence(
  p_organization_id uuid,
  p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when (select auth.uid()) is null then false
      when agrocore_private.current_organization_role(p_organization_id)
        in ('owner','company_admin','manager','project_designer') then true
      when agrocore_private.current_organization_role(p_organization_id) = 'capturer'
        then exists (
          select 1
          from public.client_capturer_assignments a
          where a.organization_id = p_organization_id
            and a.client_id = p_client_id
            and a.capturer_user_id = (select auth.uid())
            and a.status = 'active'
        )
      else false
    end;
$$;

revoke all on function
  agrocore_private.can_access_property_field_evidence(uuid,uuid)
  from public, anon, authenticated;

create or replace function agrocore_private.assert_property_field_evidence_actor(
  p_organization_id uuid,
  p_evidence_id uuid
)
returns public.field_evidence_sets
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_evidence public.field_evidence_sets%rowtype;
begin
  select * into v_evidence
  from public.field_evidence_sets
  where id = p_evidence_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'AGROCORE_NOT_FOUND';
  end if;

  if not agrocore_private.can_access_property_field_evidence(
    p_organization_id,
    v_evidence.client_id
  ) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  return v_evidence;
end;
$$;

revoke all on function
  agrocore_private.assert_property_field_evidence_actor(uuid,uuid)
  from public, anon, authenticated;

drop policy if exists "agrocore_field_evidence_sets_select" on public.field_evidence_sets;
create policy "agrocore_field_evidence_sets_select"
on public.field_evidence_sets
for select
to authenticated
using (
  agrocore_private.can_access_property_field_evidence(
    organization_id,
    client_id
  )
);

drop policy if exists "agrocore_field_evidence_photos_select" on public.field_evidence_photos;
create policy "agrocore_field_evidence_photos_select"
on public.field_evidence_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.field_evidence_sets e
    where e.id = field_evidence_photos.evidence_id
      and e.organization_id = field_evidence_photos.organization_id
      and agrocore_private.can_access_property_field_evidence(
        e.organization_id,
        e.client_id
      )
  )
);

drop policy if exists "agrocore_field_evidence_events_select" on public.field_evidence_events;
create policy "agrocore_field_evidence_events_select"
on public.field_evidence_events
for select
to authenticated
using (
  exists (
    select 1
    from public.field_evidence_sets e
    where e.id = field_evidence_events.evidence_id
      and e.organization_id = field_evidence_events.organization_id
      and agrocore_private.can_access_property_field_evidence(
        e.organization_id,
        e.client_id
      )
  )
);

drop policy if exists "agrocore_field_evidence_links_select" on public.field_evidence_links;
create policy "agrocore_field_evidence_links_select"
on public.field_evidence_links
for select
to authenticated
using (
  exists (
    select 1
    from public.field_evidence_sets e
    where e.id = field_evidence_links.evidence_id
      and e.organization_id = field_evidence_links.organization_id
      and agrocore_private.can_access_property_field_evidence(
        e.organization_id,
        e.client_id
      )
  )
);

revoke all on table public.field_evidence_links from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.field_evidence_links from authenticated;
grant select on table public.field_evidence_links to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Inicialização canônica por imóvel.
-- ---------------------------------------------------------------------------

create or replace function public.agrocore_initialize_property_field_evidence(
  p_organization_id uuid,
  p_property_id uuid,
  p_client_id uuid,
  p_visit_id uuid default null,
  p_appraisal_id text default null,
  p_registry_location jsonb default null
)
returns public.field_evidence_sets
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_property public.properties%rowtype;
  v_visit public.technical_visits%rowtype;
  v_result public.field_evidence_sets%rowtype;
  v_location jsonb;
  v_current_location jsonb;
  v_geometry_payload jsonb;
  v_label text;
  v_lat_text text;
  v_lon_text text;
  v_imported integer := 0;
  v_changed boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null
     or p_property_id is null
     or p_client_id is null then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  select * into v_property
  from public.properties
  where id = p_property_id
    and organization_id = p_organization_id;

  if not found
     or not (v_property.client_ids @> array[p_client_id]) then
    raise exception 'AGROCORE_EVIDENCE_CONFLICT';
  end if;

  if not exists (
    select 1 from public.clients c
    where c.id = p_client_id
      and c.organization_id = p_organization_id
  ) then
    raise exception 'AGROCORE_NOT_FOUND';
  end if;

  if not agrocore_private.can_access_property_field_evidence(
    p_organization_id,
    p_client_id
  ) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  if p_visit_id is not null then
    select * into v_visit
    from public.technical_visits
    where id = p_visit_id
      and organization_id = p_organization_id;

    if not found
       or v_visit.client_id <> p_client_id
       or v_visit.property_id is distinct from p_property_id then
      raise exception 'AGROCORE_EVIDENCE_CONFLICT';
    end if;
  end if;

  v_label := concat_ws(
    ', ',
    nullif(v_property.payload #>> '{location,street}',''),
    nullif(v_property.payload #>> '{location,number}',''),
    nullif(v_property.payload #>> '{location,neighborhood}',''),
    nullif(v_property.payload #>> '{location,ruralRegionOrCommunity}',''),
    nullif(v_property.payload #>> '{location,district}',''),
    nullif(v_property.payload #>> '{location,city}',''),
    nullif(v_property.payload #>> '{location,state}','')
  );

  v_lat_text := nullif(v_property.payload #>> '{referenceCoordinate,latitude}','');
  v_lon_text := nullif(v_property.payload #>> '{referenceCoordinate,longitude}','');

  if v_lat_text ~ '^-?[0-9]+([.][0-9]+)?$'
     and v_lon_text ~ '^-?[0-9]+([.][0-9]+)?$'
     and v_lat_text::double precision between -90 and 90
     and v_lon_text::double precision between -180 and 180 then
    v_location := jsonb_build_object(
      'latitude', v_lat_text::double precision,
      'longitude', v_lon_text::double precision,
      'label', nullif(v_label,''),
      'source', 'property_reference'
    );
  else
    select payload into v_geometry_payload
    from public.property_geometries
    where property_id = p_property_id
      and organization_id = p_organization_id;

    v_lat_text := nullif(v_geometry_payload #>> '{totalMetrics,centroid,latitude}','');
    v_lon_text := nullif(v_geometry_payload #>> '{totalMetrics,centroid,longitude}','');

    if v_lat_text ~ '^-?[0-9]+([.][0-9]+)?$'
       and v_lon_text ~ '^-?[0-9]+([.][0-9]+)?$'
       and v_lat_text::double precision between -90 and 90
       and v_lon_text::double precision between -180 and 180 then
      v_location := jsonb_build_object(
        'latitude', v_lat_text::double precision,
        'longitude', v_lon_text::double precision,
        'label', nullif(v_label,''),
        'source', 'property_geometry'
      );
    elsif nullif(v_label,'') is not null then
      v_location := jsonb_build_object(
        'latitude', null,
        'longitude', null,
        'label', v_label,
        'source', 'property_reference'
      );
    end if;
  end if;

  perform agrocore_private.validate_field_evidence_location(v_location);

  select * into v_result
  from public.field_evidence_sets
  where organization_id = p_organization_id
    and property_id = p_property_id
  for update;

  if not found then
    insert into public.field_evidence_sets (
      organization_id,
      visit_id,
      appraisal_id,
      property_id,
      client_id,
      location,
      version,
      created_by_user_id,
      created_at,
      updated_by_user_id,
      updated_at
    ) values (
      p_organization_id,
      null,
      null,
      p_property_id,
      p_client_id,
      v_location,
      1,
      v_actor,
      v_now,
      v_actor,
      v_now
    )
    returning * into v_result;

    insert into public.field_evidence_events (
      organization_id,evidence_id,action,actor_user_id,occurred_at,version,details
    ) values (
      p_organization_id,v_result.id,'initialized',v_actor,v_now,1,
      jsonb_build_object('propertyId',p_property_id,'clientId',p_client_id)
    );
  else
    if v_result.client_id <> p_client_id then
      raise exception 'AGROCORE_EVIDENCE_CONFLICT';
    end if;

    v_current_location := v_result.location;

    -- O cadastro do imóvel é a autoridade. Só substitui a evidência quando a
    -- coordenada cadastral mudou; mantém a proveniência de GPS/manual se os
    -- números continuam exatamente iguais.
    if v_location is not null then
      if v_current_location is null
         or coalesce(v_current_location ->> 'latitude','') <>
            coalesce(v_location ->> 'latitude','')
         or coalesce(v_current_location ->> 'longitude','') <>
            coalesce(v_location ->> 'longitude','')
         or (
           (v_current_location -> 'latitude' is null
             or jsonb_typeof(v_current_location -> 'latitude')='null')
           and
           (v_location -> 'latitude' is not null
             and jsonb_typeof(v_location -> 'latitude')<>'null')
         ) then
        update public.field_evidence_sets
        set location = v_location,
            version = version + 1,
            updated_by_user_id = v_actor,
            updated_at = v_now
        where id = v_result.id
        returning * into v_result;
        v_changed := true;
      end if;
    end if;
  end if;

  if p_visit_id is not null then
    insert into public.field_evidence_links (
      organization_id,evidence_id,entity_type,entity_id,created_by_user_id,created_at
    ) values (
      p_organization_id,v_result.id,'visit',p_visit_id::text,v_actor,v_now
    )
    on conflict (organization_id,entity_type,entity_id)
    do update set evidence_id=excluded.evidence_id;
  end if;

  if nullif(btrim(coalesce(p_appraisal_id,'')),'') is not null then
    insert into public.field_evidence_links (
      organization_id,evidence_id,entity_type,entity_id,created_by_user_id,created_at
    ) values (
      p_organization_id,v_result.id,'appraisal',btrim(p_appraisal_id),v_actor,v_now
    )
    on conflict (organization_id,entity_type,entity_id)
    do update set evidence_id=excluded.evidence_id;
  end if;

  -- Somente fotos documentais do próprio imóvel entram automaticamente.
  insert into public.field_evidence_photos (
    id,
    organization_id,
    evidence_id,
    source,
    document_version_id,
    storage_bucket,
    storage_object_path,
    mime_type,
    file_size_bytes,
    caption,
    captured_at,
    captured_by_user_id
  )
  select
    gen_random_uuid(),
    p_organization_id,
    v_result.id,
    'property_document',
    d.id,
    d.storage_bucket,
    d.storage_object_path,
    d.mime_type,
    d.file_size_bytes,
    d.display_name,
    coalesce(d.storage_uploaded_at,d.created_at),
    d.created_by_user_id
  from public.document_versions d
  where d.organization_id = p_organization_id
    and d.logical_owner_type = 'property'
    and d.logical_owner_id = p_property_id::text
    and d.category = 'photo_report'
    and d.is_current
    and d.status = 'active'
    and d.storage_state = 'stored'
    and d.storage_bucket = 'organization-documents'
    and d.storage_object_path is not null
    and d.mime_type in ('image/jpeg','image/png','image/tiff')
  on conflict (evidence_id,document_version_id)
    where document_version_id is not null
  do nothing;

  get diagnostics v_imported = row_count;

  if v_imported > 0 then
    update public.field_evidence_sets
    set version = version + 1,
        updated_by_user_id = v_actor,
        updated_at = v_now
    where id = v_result.id
    returning * into v_result;

    insert into public.field_evidence_events (
      organization_id,evidence_id,action,actor_user_id,occurred_at,version,details
    ) values (
      p_organization_id,v_result.id,'appraisal_imported',v_actor,v_now,v_result.version,
      jsonb_build_object('source','property_document','count',v_imported)
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.agrocore_initialize_property_field_evidence(
  uuid,uuid,uuid,uuid,text,jsonb
) from public, anon;
grant execute on function public.agrocore_initialize_property_field_evidence(
  uuid,uuid,uuid,uuid,text,jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Localização gravada em evidência atualiza também o cadastro do imóvel.
-- ---------------------------------------------------------------------------

create or replace function public.agrocore_set_property_field_evidence_location(
  p_organization_id uuid,
  p_evidence_id uuid,
  p_expected_version integer,
  p_location jsonb
)
returns public.field_evidence_sets
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current public.field_evidence_sets%rowtype;
  v_result public.field_evidence_sets%rowtype;
  v_lat double precision;
  v_lon double precision;
  v_origin text;
  v_now timestamptz := clock_timestamp();
begin
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform agrocore_private.validate_field_evidence_location(p_location);

  if p_location -> 'latitude' is null
     or jsonb_typeof(p_location -> 'latitude')='null'
     or p_location -> 'longitude' is null
     or jsonb_typeof(p_location -> 'longitude')='null' then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_current := agrocore_private.assert_property_field_evidence_actor(
    p_organization_id,
    p_evidence_id
  );

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
  end if;

  v_lat := (p_location ->> 'latitude')::double precision;
  v_lon := (p_location ->> 'longitude')::double precision;
  v_origin := case
    when p_location ->> 'source' = 'device' then 'gnss'
    else 'manual'
  end;

  update public.properties
  set payload = jsonb_set(
        payload,
        '{referenceCoordinate}',
        coalesce(payload -> 'referenceCoordinate','{}'::jsonb)
          || jsonb_build_object(
            'latitude', v_lat::text,
            'longitude', v_lon::text,
            'geodeticSystem', 'SIRGAS2000',
            'format', 'decimal_degrees',
            'origin', v_origin,
            'pointDescription', coalesce(p_location ->> 'label','')
          ),
        true
      ),
      updated_at = v_now
  where id = v_current.property_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'AGROCORE_NOT_FOUND';
  end if;

  update public.field_evidence_sets
  set location = p_location,
      version = version + 1,
      updated_by_user_id = v_actor,
      updated_at = v_now
  where id = p_evidence_id
  returning * into v_result;

  insert into public.field_evidence_events (
    organization_id,evidence_id,action,actor_user_id,occurred_at,version,details
  ) values (
    p_organization_id,p_evidence_id,'location_updated',v_actor,v_now,v_result.version,
    jsonb_build_object(
      'propertyId',v_result.property_id,
      'source',p_location ->> 'source',
      'synchronizedToProperty',true
    )
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_set_property_field_evidence_location(
  uuid,uuid,integer,jsonb
) from public, anon;
grant execute on function public.agrocore_set_property_field_evidence_location(
  uuid,uuid,integer,jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Fotos capturadas em qualquer fluxo pertencem ao mesmo imóvel.
-- ---------------------------------------------------------------------------

create or replace function public.agrocore_register_property_field_evidence_photo(
  p_organization_id uuid,
  p_evidence_id uuid,
  p_expected_version integer,
  p_photo_id uuid,
  p_source text,
  p_storage_object_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_caption text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns public.field_evidence_sets
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current public.field_evidence_sets%rowtype;
  v_result public.field_evidence_sets%rowtype;
  v_now timestamptz := clock_timestamp();
  v_expected_prefix text;
begin
  if p_expected_version is null
     or p_expected_version < 1
     or p_photo_id is null
     or p_source not in ('property_capture','visit_capture','appraisal_capture')
     or p_mime_type not in ('image/jpeg','image/png','image/tiff')
     or p_file_size_bytes <= 0
     or p_file_size_bytes > 15728640
     or length(coalesce(p_caption,'')) > 500
     or ((p_latitude is null) <> (p_longitude is null))
     or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
     or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_current := agrocore_private.assert_property_field_evidence_actor(
    p_organization_id,
    p_evidence_id
  );

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
  end if;

  v_expected_prefix :=
    p_organization_id::text || '/' ||
    p_evidence_id::text || '/' ||
    p_photo_id::text || '.';

  if position(v_expected_prefix in p_storage_object_path) <> 1
     or not exists (
       select 1
       from storage.objects o
       where o.bucket_id = 'field-evidence'
         and o.name = p_storage_object_path
     ) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  insert into public.field_evidence_photos (
    id,organization_id,evidence_id,source,
    storage_bucket,storage_object_path,mime_type,file_size_bytes,
    caption,captured_at,captured_by_user_id,latitude,longitude
  ) values (
    p_photo_id,p_organization_id,p_evidence_id,p_source,
    'field-evidence',p_storage_object_path,p_mime_type,p_file_size_bytes,
    nullif(btrim(coalesce(p_caption,'')),''),
    v_now,v_actor,p_latitude,p_longitude
  );

  update public.field_evidence_sets
  set version = version + 1,
      updated_by_user_id = v_actor,
      updated_at = v_now
  where id = p_evidence_id
  returning * into v_result;

  insert into public.field_evidence_events (
    organization_id,evidence_id,action,actor_user_id,occurred_at,version,details
  ) values (
    p_organization_id,p_evidence_id,'photo_added',v_actor,v_now,v_result.version,
    jsonb_build_object(
      'propertyId',v_result.property_id,
      'photoId',p_photo_id,
      'source',p_source
    )
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_register_property_field_evidence_photo(
  uuid,uuid,integer,uuid,text,text,text,bigint,text,double precision,double precision
) from public, anon;
grant execute on function public.agrocore_register_property_field_evidence_photo(
  uuid,uuid,integer,uuid,text,text,text,bigint,text,double precision,double precision
) to authenticated;

-- Antigos RPCs não podem mais ser usados para criar evidência paralela.
revoke execute on function public.agrocore_initialize_field_evidence(
  uuid,uuid,text,uuid,uuid,jsonb,text[]
) from authenticated;
revoke execute on function public.agrocore_set_field_evidence_location(
  uuid,uuid,integer,jsonb
) from authenticated;
revoke execute on function public.agrocore_register_field_evidence_photo(
  uuid,uuid,integer,uuid,text,text,text,bigint,text,double precision,double precision
) from authenticated;

-- ---------------------------------------------------------------------------
-- 6. Storage segue a mesma autorização do imóvel/cliente.
-- ---------------------------------------------------------------------------

create or replace function agrocore_private.can_mutate_property_field_evidence_storage(
  p_organization_id uuid,
  p_evidence_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.field_evidence_sets e
    where e.id = p_evidence_id
      and e.organization_id = p_organization_id
      and agrocore_private.can_access_property_field_evidence(
        e.organization_id,
        e.client_id
      )
  );
$$;

revoke all on function
  agrocore_private.can_mutate_property_field_evidence_storage(uuid,uuid)
  from public, anon, authenticated;

drop policy if exists "agrocore_field_evidence_storage_select" on storage.objects;
create policy "agrocore_field_evidence_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'field-evidence'
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and agrocore_private.can_access_property_field_evidence(
        e.organization_id,
        e.client_id
      )
  )
);

drop policy if exists "agrocore_field_evidence_storage_insert" on storage.objects;
create policy "agrocore_field_evidence_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'field-evidence'
  and agrocore_private.can_mutate_property_field_evidence_storage(
    split_part(name,'/',1)::uuid,
    split_part(name,'/',2)::uuid
  )
);

drop policy if exists "agrocore_field_evidence_storage_update" on storage.objects;
create policy "agrocore_field_evidence_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'field-evidence'
  and agrocore_private.can_mutate_property_field_evidence_storage(
    split_part(name,'/',1)::uuid,
    split_part(name,'/',2)::uuid
  )
)
with check (
  bucket_id = 'field-evidence'
  and agrocore_private.can_mutate_property_field_evidence_storage(
    split_part(name,'/',1)::uuid,
    split_part(name,'/',2)::uuid
  )
);

drop policy if exists "agrocore_field_evidence_storage_delete" on storage.objects;
create policy "agrocore_field_evidence_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'field-evidence'
  and agrocore_private.can_mutate_property_field_evidence_storage(
    split_part(name,'/',1)::uuid,
    split_part(name,'/',2)::uuid
  )
);

-- ---------------------------------------------------------------------------
-- 7. Solicitações de cadastro para o captador responsável.
-- ---------------------------------------------------------------------------

create table if not exists public.client_registry_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  property_id uuid references public.properties(id) on delete restrict,
  assigned_capturer_user_id uuid not null references auth.users(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  source_type text not null check (source_type in ('appraisal','visit')),
  source_id text not null check (length(btrim(source_id)) between 1 and 180),
  scope text not null check (
    scope in (
      'property_registration',
      'geolocation',
      'photos',
      'photos_and_geolocation'
    )
  ),
  status text not null default 'open'
    check (status in ('open','in_progress','fulfilled','cancelled')),
  note text check (note is null or length(note) <= 1200),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  fulfilled_at timestamptz
);

create index if not exists client_registry_requests_assigned_idx
  on public.client_registry_requests (
    organization_id,assigned_capturer_user_id,status,created_at desc
  );

create index if not exists client_registry_requests_requester_idx
  on public.client_registry_requests (
    organization_id,requested_by_user_id,created_at desc
  );

create index if not exists client_registry_requests_client_idx
  on public.client_registry_requests (organization_id,client_id,status);

create unique index if not exists client_registry_requests_open_source_uq
  on public.client_registry_requests (
    organization_id,source_type,source_id,scope
  )
  where status in ('open','in_progress');

create table if not exists public.client_registry_request_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null references public.client_registry_requests(id) on delete cascade,
  action text not null check (
    action in ('created','started','property_attached','fulfilled','cancelled')
  ),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object')
);

create index if not exists client_registry_request_events_request_idx
  on public.client_registry_request_events (request_id,occurred_at);

alter table public.client_registry_requests enable row level security;
alter table public.client_registry_request_events enable row level security;

drop policy if exists "agrocore_client_registry_requests_select"
  on public.client_registry_requests;
create policy "agrocore_client_registry_requests_select"
on public.client_registry_requests
for select
to authenticated
using (
  organization_id is not null
  and (
    requested_by_user_id = (select auth.uid())
    or assigned_capturer_user_id = (select auth.uid())
    or agrocore_private.current_organization_role(organization_id)
      in ('owner','company_admin','manager')
  )
);

drop policy if exists "agrocore_client_registry_request_events_select"
  on public.client_registry_request_events;
create policy "agrocore_client_registry_request_events_select"
on public.client_registry_request_events
for select
to authenticated
using (
  exists (
    select 1
    from public.client_registry_requests r
    where r.id = client_registry_request_events.request_id
      and r.organization_id = client_registry_request_events.organization_id
      and (
        r.requested_by_user_id = (select auth.uid())
        or r.assigned_capturer_user_id = (select auth.uid())
        or agrocore_private.current_organization_role(r.organization_id)
          in ('owner','company_admin','manager')
      )
  )
);

revoke all on table public.client_registry_requests from public, anon;
revoke all on table public.client_registry_request_events from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.client_registry_requests from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.client_registry_request_events from authenticated;
grant select on table public.client_registry_requests to authenticated;
grant select on table public.client_registry_request_events to authenticated;

create or replace function public.agrocore_create_client_registry_request(
  p_organization_id uuid,
  p_client_id uuid,
  p_property_id uuid,
  p_source_type text,
  p_source_id text,
  p_scope text,
  p_note text default null
)
returns public.client_registry_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text := agrocore_private.current_organization_role(p_organization_id);
  v_capturer uuid;
  v_result public.client_registry_requests%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null
     or v_role not in ('owner','company_admin','manager','project_designer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  if p_source_type not in ('appraisal','visit')
     or p_scope not in (
       'property_registration','geolocation','photos','photos_and_geolocation'
     )
     or nullif(btrim(coalesce(p_source_id,'')),'') is null
     or length(coalesce(p_note,'')) > 1200 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if not exists (
    select 1 from public.clients c
    where c.id=p_client_id and c.organization_id=p_organization_id
  ) then
    raise exception 'AGROCORE_NOT_FOUND';
  end if;

  if p_property_id is not null and not exists (
    select 1 from public.properties p
    where p.id=p_property_id
      and p.organization_id=p_organization_id
      and p.client_ids @> array[p_client_id]
  ) then
    raise exception 'AGROCORE_EVIDENCE_CONFLICT';
  end if;

  select a.capturer_user_id into v_capturer
  from public.client_capturer_assignments a
  where a.organization_id=p_organization_id
    and a.client_id=p_client_id
    and a.status='active'
  order by a.is_primary desc,a.started_at desc,a.id
  limit 1;

  if v_capturer is null then
    raise exception 'AGROCORE_CAPTURER_NOT_ASSIGNED';
  end if;

  select * into v_result
  from public.client_registry_requests r
  where r.organization_id=p_organization_id
    and r.source_type=p_source_type
    and r.source_id=btrim(p_source_id)
    and r.scope=p_scope
    and r.status in ('open','in_progress')
  order by r.created_at desc
  limit 1;

  if found then
    return v_result;
  end if;

  insert into public.client_registry_requests (
    organization_id,client_id,property_id,
    assigned_capturer_user_id,requested_by_user_id,
    source_type,source_id,scope,status,note,
    created_at,updated_at
  ) values (
    p_organization_id,p_client_id,p_property_id,
    v_capturer,v_actor,
    p_source_type,btrim(p_source_id),p_scope,'open',
    nullif(btrim(coalesce(p_note,'')),''),
    v_now,v_now
  )
  returning * into v_result;

  insert into public.client_registry_request_events (
    organization_id,request_id,action,actor_user_id,occurred_at,details
  ) values (
    p_organization_id,v_result.id,'created',v_actor,v_now,
    jsonb_build_object(
      'clientId',p_client_id,
      'propertyId',p_property_id,
      'assignedCapturerUserId',v_capturer,
      'scope',p_scope
    )
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_create_client_registry_request(
  uuid,uuid,uuid,text,text,text,text
) from public, anon;
grant execute on function public.agrocore_create_client_registry_request(
  uuid,uuid,uuid,text,text,text,text
) to authenticated;

create or replace function public.agrocore_start_client_registry_request(
  p_organization_id uuid,
  p_request_id uuid
)
returns public.client_registry_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_result public.client_registry_requests%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_result
  from public.client_registry_requests
  where id=p_request_id and organization_id=p_organization_id
  for update;

  if not found then raise exception 'AGROCORE_NOT_FOUND'; end if;

  if v_result.assigned_capturer_user_id <> v_actor
     and agrocore_private.current_organization_role(p_organization_id)
       not in ('owner','company_admin','manager') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  if v_result.status='fulfilled' then return v_result; end if;
  if v_result.status='cancelled' then raise exception 'AGROCORE_INVALID_INPUT'; end if;

  if v_result.status='open' then
    update public.client_registry_requests
    set status='in_progress',updated_at=v_now
    where id=p_request_id
    returning * into v_result;

    insert into public.client_registry_request_events (
      organization_id,request_id,action,actor_user_id,occurred_at,details
    ) values (
      p_organization_id,p_request_id,'started',v_actor,v_now,'{}'::jsonb
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.agrocore_start_client_registry_request(uuid,uuid)
  from public, anon;
grant execute on function public.agrocore_start_client_registry_request(uuid,uuid)
  to authenticated;

create or replace function public.agrocore_attach_property_to_registry_request(
  p_organization_id uuid,
  p_request_id uuid,
  p_property_id uuid
)
returns public.client_registry_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_result public.client_registry_requests%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_result
  from public.client_registry_requests
  where id=p_request_id and organization_id=p_organization_id
  for update;

  if not found then raise exception 'AGROCORE_NOT_FOUND'; end if;

  if v_result.assigned_capturer_user_id <> v_actor
     and agrocore_private.current_organization_role(p_organization_id)
       not in ('owner','company_admin','manager') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.properties p
    where p.id=p_property_id
      and p.organization_id=p_organization_id
      and p.client_ids @> array[v_result.client_id]
  ) then
    raise exception 'AGROCORE_EVIDENCE_CONFLICT';
  end if;

  update public.client_registry_requests
  set property_id=p_property_id,
      scope=case
        when scope='property_registration' then 'photos_and_geolocation'
        else scope
      end,
      status='in_progress',
      updated_at=v_now
  where id=p_request_id
  returning * into v_result;

  if v_result.source_type='visit' then
    update public.technical_visits v
    set property_id=p_property_id,
        version=v.version+1,
        payload=jsonb_set(
          jsonb_set(
            jsonb_set(
              v.payload,
              '{propertyId}',
              to_jsonb(p_property_id::text),
              true
            ),
            '{updatedByUserId}',
            to_jsonb(v_actor::text),
            true
          ),
          '{updatedAt}',
          to_jsonb(v_now::text),
          true
        ),
        updated_at=v_now
    where v.id::text=v_result.source_id
      and v.organization_id=p_organization_id
      and v.client_id=v_result.client_id
      and v.property_id is null;

    if found then
      insert into public.technical_visit_audit (
        id,organization_id,visit_id,version,action,actor_user_id,occurred_at,payload
      )
      select
        gen_random_uuid(),
        v.organization_id,
        v.id,
        v.version,
        'updated',
        v_actor,
        v_now,
        jsonb_build_object(
          'id',gen_random_uuid()::text,
          'organizationId',v.organization_id::text,
          'visitId',v.id::text,
          'action','updated',
          'actorUserId',v_actor::text,
          'at',v_now::text,
          'version',v.version,
          'fromStatus',v.status,
          'toStatus',v.status,
          'reason','Imóvel cadastrado pela solicitação de fotos e geolocalização.',
          'changedFields',jsonb_build_array('propertyId')
        )
      from public.technical_visits v
      where v.id::text=v_result.source_id
        and v.organization_id=p_organization_id;
    end if;
  end if;

  insert into public.client_registry_request_events (
    organization_id,request_id,action,actor_user_id,occurred_at,details
  ) values (
    p_organization_id,p_request_id,'property_attached',v_actor,v_now,
    jsonb_build_object('propertyId',p_property_id,'scope',v_result.scope)
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_attach_property_to_registry_request(
  uuid,uuid,uuid
) from public, anon;
grant execute on function public.agrocore_attach_property_to_registry_request(
  uuid,uuid,uuid
) to authenticated;

create or replace function public.agrocore_fulfill_client_registry_request(
  p_organization_id uuid,
  p_request_id uuid
)
returns public.client_registry_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_result public.client_registry_requests%rowtype;
  v_evidence public.field_evidence_sets%rowtype;
  v_has_geo boolean := false;
  v_has_photos boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_result
  from public.client_registry_requests
  where id=p_request_id and organization_id=p_organization_id
  for update;

  if not found then raise exception 'AGROCORE_NOT_FOUND'; end if;

  if v_result.assigned_capturer_user_id <> v_actor
     and agrocore_private.current_organization_role(p_organization_id)
       not in ('owner','company_admin','manager') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  if v_result.status='fulfilled' then return v_result; end if;

  if v_result.property_id is not null then
    select * into v_evidence
    from public.field_evidence_sets e
    where e.organization_id=p_organization_id
      and e.property_id=v_result.property_id;

    if found then
      v_has_geo :=
        v_evidence.location is not null
        and v_evidence.location -> 'latitude' is not null
        and jsonb_typeof(v_evidence.location -> 'latitude') <> 'null'
        and v_evidence.location -> 'longitude' is not null
        and jsonb_typeof(v_evidence.location -> 'longitude') <> 'null';

      v_has_photos := exists (
        select 1
        from public.field_evidence_photos p
        where p.organization_id=p_organization_id
          and p.evidence_id=v_evidence.id
      );
    end if;
  end if;

  if v_result.scope='property_registration' and v_result.property_id is null then
    raise exception 'AGROCORE_REQUEST_NOT_READY';
  elsif v_result.scope='geolocation' and not v_has_geo then
    raise exception 'AGROCORE_REQUEST_NOT_READY';
  elsif v_result.scope='photos' and not v_has_photos then
    raise exception 'AGROCORE_REQUEST_NOT_READY';
  elsif v_result.scope='photos_and_geolocation'
    and not (v_has_geo and v_has_photos) then
    raise exception 'AGROCORE_REQUEST_NOT_READY';
  end if;

  update public.client_registry_requests
  set status='fulfilled',
      fulfilled_at=v_now,
      updated_at=v_now
  where id=p_request_id
  returning * into v_result;

  insert into public.client_registry_request_events (
    organization_id,request_id,action,actor_user_id,occurred_at,details
  ) values (
    p_organization_id,p_request_id,'fulfilled',v_actor,v_now,
    jsonb_build_object(
      'propertyId',v_result.property_id,
      'scope',v_result.scope
    )
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_fulfill_client_registry_request(uuid,uuid)
  from public, anon;
grant execute on function public.agrocore_fulfill_client_registry_request(uuid,uuid)
  to authenticated;

comment on table public.field_evidence_sets is
  'Fonte canônica única de fotos e geolocalização por imóvel — OE-007.004 R2.';
comment on table public.field_evidence_links is
  'Vínculos de laudos e visitas à evidência canônica do imóvel, sem cópia.';
comment on table public.client_registry_requests is
  'Solicitações cadastrais do projetista ao captador responsável pelo cliente.';
