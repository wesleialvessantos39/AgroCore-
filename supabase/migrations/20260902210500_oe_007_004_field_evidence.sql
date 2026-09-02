-- AgroCore — OE-007.004: fotos, geolocalização e sincronização Laudo <-> Visita/Vistoria.
-- Evidência única compartilhada entre Módulos 004 e 007.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'field-evidence',
  'field-evidence',
  false,
  15728640,
  array['image/jpeg','image/png','image/tiff']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.field_evidence_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  visit_id uuid references public.technical_visits(id) on delete restrict,
  appraisal_id text,
  property_id uuid references public.properties(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  location jsonb,
  version integer not null default 1 check (version >= 1),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  check (visit_id is not null or appraisal_id is not null),
  check (location is null or jsonb_typeof(location) = 'object')
);

create unique index if not exists field_evidence_sets_org_visit_uq
  on public.field_evidence_sets (organization_id, visit_id)
  where visit_id is not null;

create unique index if not exists field_evidence_sets_org_appraisal_uq
  on public.field_evidence_sets (organization_id, appraisal_id)
  where appraisal_id is not null;

create index if not exists field_evidence_sets_property_idx
  on public.field_evidence_sets (organization_id, property_id);

create table if not exists public.field_evidence_photos (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  evidence_id uuid not null references public.field_evidence_sets(id) on delete restrict,
  source text not null check (
    source in ('appraisal_document','registry_document','appraisal_legacy','visit_capture','appraisal_capture')
  ),
  document_version_id uuid references public.document_versions(id) on delete restrict,
  legacy_reference text,
  storage_bucket text,
  storage_object_path text,
  mime_type text check (
    mime_type is null or mime_type in ('image/jpeg','image/png','image/tiff')
  ),
  file_size_bytes bigint check (
    file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 52428800)
  ),
  caption text check (caption is null or length(caption) <= 500),
  captured_at timestamptz not null default clock_timestamp(),
  captured_by_user_id uuid references auth.users(id) on delete restrict,
  latitude double precision,
  longitude double precision,
  check (latitude is null or (latitude >= -90 and latitude <= 90)),
  check (longitude is null or (longitude >= -180 and longitude <= 180)),
  check ((latitude is null) = (longitude is null)),
  check (
    (source = 'appraisal_legacy' and legacy_reference is not null)
    or
    (source <> 'appraisal_legacy')
  )
);

create unique index if not exists field_evidence_photos_document_uq
  on public.field_evidence_photos (evidence_id, document_version_id)
  where document_version_id is not null;

create unique index if not exists field_evidence_photos_legacy_uq
  on public.field_evidence_photos (evidence_id, legacy_reference)
  where legacy_reference is not null;

create index if not exists field_evidence_photos_evidence_idx
  on public.field_evidence_photos (organization_id, evidence_id, captured_at);

create table if not exists public.field_evidence_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  evidence_id uuid not null references public.field_evidence_sets(id) on delete restrict,
  action text not null check (
    action in ('initialized','linked','location_updated','photo_added','appraisal_imported')
  ),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  version integer not null check (version >= 1),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);

create index if not exists field_evidence_events_org_evidence_idx
  on public.field_evidence_events (organization_id, evidence_id, version, occurred_at);

alter table public.field_evidence_sets enable row level security;
alter table public.field_evidence_photos enable row level security;
alter table public.field_evidence_events enable row level security;

drop policy if exists "agrocore_field_evidence_sets_select" on public.field_evidence_sets;
create policy "agrocore_field_evidence_sets_select"
on public.field_evidence_sets
for select
to authenticated
using (
  coalesce(
    agrocore_private.current_organization_role(organization_id)
      in ('owner','company_admin','manager','project_designer'),
    false
  )
);

drop policy if exists "agrocore_field_evidence_photos_select" on public.field_evidence_photos;
create policy "agrocore_field_evidence_photos_select"
on public.field_evidence_photos
for select
to authenticated
using (
  coalesce(
    agrocore_private.current_organization_role(organization_id)
      in ('owner','company_admin','manager','project_designer'),
    false
  )
);

drop policy if exists "agrocore_field_evidence_events_select" on public.field_evidence_events;
create policy "agrocore_field_evidence_events_select"
on public.field_evidence_events
for select
to authenticated
using (
  coalesce(
    agrocore_private.current_organization_role(organization_id)
      in ('owner','company_admin','manager','project_designer'),
    false
  )
);

revoke all on table public.field_evidence_sets from public, anon;
revoke all on table public.field_evidence_photos from public, anon;
revoke all on table public.field_evidence_events from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.field_evidence_sets from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.field_evidence_photos from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.field_evidence_events from authenticated;
grant select on table public.field_evidence_sets to authenticated;
grant select on table public.field_evidence_photos to authenticated;
grant select on table public.field_evidence_events to authenticated;

create or replace function agrocore_private.validate_field_evidence_location(
  p_location jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lon double precision;
  v_accuracy double precision;
  v_source text;
begin
  if p_location is null then
    return;
  end if;

  if jsonb_typeof(p_location) <> 'object' then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_source := coalesce(p_location ->> 'source','');
  if v_source not in (
    'appraisal','property_reference','property_geometry',
    'registry_address','device','manual'
  ) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if p_location ? 'label'
     and jsonb_typeof(p_location -> 'label') not in ('string','null') then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  if length(coalesce(p_location ->> 'label','')) > 500 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if (
    (p_location -> 'latitude') is null
    or jsonb_typeof(p_location -> 'latitude') = 'null'
  ) <> (
    (p_location -> 'longitude') is null
    or jsonb_typeof(p_location -> 'longitude') = 'null'
  ) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if p_location -> 'latitude' is not null
     and jsonb_typeof(p_location -> 'latitude') <> 'null' then
    if jsonb_typeof(p_location -> 'latitude') <> 'number'
       or jsonb_typeof(p_location -> 'longitude') <> 'number' then
      raise exception 'AGROCORE_INVALID_INPUT';
    end if;
    v_lat := (p_location ->> 'latitude')::double precision;
    v_lon := (p_location ->> 'longitude')::double precision;
    if v_lat < -90 or v_lat > 90 or v_lon < -180 or v_lon > 180 then
      raise exception 'AGROCORE_INVALID_INPUT';
    end if;
  end if;

  if p_location ? 'accuracyMeters'
     and jsonb_typeof(p_location -> 'accuracyMeters') <> 'null' then
    if jsonb_typeof(p_location -> 'accuracyMeters') <> 'number' then
      raise exception 'AGROCORE_INVALID_INPUT';
    end if;
    v_accuracy := (p_location ->> 'accuracyMeters')::double precision;
    if v_accuracy < 0 or v_accuracy > 100000 then
      raise exception 'AGROCORE_INVALID_INPUT';
    end if;
  end if;
end;
$$;

revoke all on function agrocore_private.validate_field_evidence_location(jsonb)
  from public, anon, authenticated;

create or replace function agrocore_private.assert_field_evidence_actor(
  p_organization_id uuid,
  p_evidence_id uuid,
  p_require_edit boolean
)
returns public.field_evidence_sets
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text := agrocore_private.current_organization_role(p_organization_id);
  v_evidence public.field_evidence_sets%rowtype;
  v_visit public.technical_visits%rowtype;
begin
  if v_actor is null
     or v_role not in ('owner','company_admin','manager','project_designer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  select * into v_evidence
  from public.field_evidence_sets
  where id = p_evidence_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'AGROCORE_NOT_FOUND';
  end if;

  if p_require_edit and v_evidence.visit_id is not null then
    select * into v_visit
    from public.technical_visits
    where id = v_evidence.visit_id
      and organization_id = p_organization_id;

    if not found then
      raise exception 'AGROCORE_NOT_FOUND';
    end if;
    if v_visit.responsible_user_id <> v_actor then
      raise exception 'AGROCORE_RESPONSIBLE_MISMATCH';
    end if;
    if v_visit.status not in ('confirmed','in_progress') then
      raise exception 'AGROCORE_VISIT_NOT_READY';
    end if;
  end if;

  return v_evidence;
end;
$$;

revoke all on function agrocore_private.assert_field_evidence_actor(uuid,uuid,boolean)
  from public, anon, authenticated;

create or replace function public.agrocore_initialize_field_evidence(
  p_organization_id uuid,
  p_visit_id uuid,
  p_appraisal_id text,
  p_property_id uuid,
  p_client_id uuid,
  p_registry_location jsonb default null,
  p_legacy_photo_references text[] default '{}'::text[]
)
returns public.field_evidence_sets
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text := agrocore_private.current_organization_role(p_organization_id);
  v_visit public.technical_visits%rowtype;
  v_by_visit public.field_evidence_sets%rowtype;
  v_by_appraisal public.field_evidence_sets%rowtype;
  v_result public.field_evidence_sets%rowtype;
  v_location jsonb := p_registry_location;
  v_property_payload jsonb;
  v_geometry_payload jsonb;
  v_client_payload jsonb;
  v_label text;
  v_lat_text text;
  v_lon_text text;
  v_changed boolean := false;
  v_imported_total integer := 0;
  v_inserted integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null
     or v_role not in ('owner','company_admin','manager','project_designer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  if p_client_id is null
     or (p_visit_id is null and nullif(btrim(coalesce(p_appraisal_id,'')),'') is null) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if not exists (
    select 1 from public.clients c
    where c.id = p_client_id
      and c.organization_id = p_organization_id
  ) then
    raise exception 'AGROCORE_NOT_FOUND';
  end if;

  if p_property_id is not null and not exists (
    select 1 from public.properties p
    where p.id = p_property_id
      and p.organization_id = p_organization_id
      and p.client_ids @> array[p_client_id]
  ) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if p_visit_id is not null then
    select * into v_visit
    from public.technical_visits
    where id = p_visit_id
      and organization_id = p_organization_id;

    if not found then
      raise exception 'AGROCORE_NOT_FOUND';
    end if;
    if v_visit.client_id <> p_client_id
       or (v_visit.property_id is not null and v_visit.property_id is distinct from p_property_id)
       or (
         nullif(v_visit.payload ->> 'appraisalId','') is not null
         and nullif(v_visit.payload ->> 'appraisalId','') is distinct from
             nullif(btrim(coalesce(p_appraisal_id,'')),'')
       ) then
      raise exception 'AGROCORE_EVIDENCE_CONFLICT';
    end if;
  end if;

  perform agrocore_private.validate_field_evidence_location(v_location);

  if p_visit_id is not null then
    select * into v_by_visit
    from public.field_evidence_sets
    where organization_id = p_organization_id
      and visit_id = p_visit_id
    for update;
  end if;

  if nullif(btrim(coalesce(p_appraisal_id,'')),'') is not null then
    select * into v_by_appraisal
    from public.field_evidence_sets
    where organization_id = p_organization_id
      and appraisal_id = btrim(p_appraisal_id)
    for update;
  end if;

  if v_by_visit.id is not null
     and v_by_appraisal.id is not null
     and v_by_visit.id <> v_by_appraisal.id then
    raise exception 'AGROCORE_EVIDENCE_CONFLICT';
  end if;

  if v_by_visit.id is not null then
    v_result := v_by_visit;
  elsif v_by_appraisal.id is not null then
    v_result := v_by_appraisal;
  end if;

  if v_location is null and p_property_id is not null then
    select payload into v_property_payload
    from public.properties
    where id = p_property_id
      and organization_id = p_organization_id;

    v_lat_text := nullif(v_property_payload #>> '{referenceCoordinate,latitude}','');
    v_lon_text := nullif(v_property_payload #>> '{referenceCoordinate,longitude}','');
    v_label := concat_ws(
      ', ',
      nullif(v_property_payload #>> '{location,street}',''),
      nullif(v_property_payload #>> '{location,number}',''),
      nullif(v_property_payload #>> '{location,neighborhood}',''),
      nullif(v_property_payload #>> '{location,ruralRegionOrCommunity}',''),
      nullif(v_property_payload #>> '{location,district}',''),
      nullif(v_property_payload #>> '{location,city}',''),
      nullif(v_property_payload #>> '{location,state}','')
    );

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
    end if;

    if v_location is null then
      select payload into v_geometry_payload
      from public.property_geometries
      where property_id = p_property_id
        and organization_id = p_organization_id;

      v_lat_text := nullif(v_geometry_payload #>> '{totalMetrics,centroid,latitude}','');
      v_lon_text := nullif(v_geometry_payload #>> '{totalMetrics,centroid,longitude}','');

      if v_lat_text ~ '^-?[0-9]+([.][0-9]+)?
    from public.clients
    where id = p_client_id
      and organization_id = p_organization_id;

    v_label := concat_ws(
      ', ',
      nullif(v_client_payload #>> '{address,street}',''),
      nullif(v_client_payload #>> '{address,number}',''),
      nullif(v_client_payload #>> '{address,neighborhood}',''),
      nullif(v_client_payload #>> '{address,locality}',''),
      nullif(v_client_payload #>> '{address,city}',''),
      nullif(v_client_payload #>> '{address,state}','')
    );
    if nullif(v_label,'') is not null then
      v_location := jsonb_build_object(
        'latitude', null,
        'longitude', null,
        'label', v_label,
        'source', 'registry_address'
      );
    end if;
  end if;

  perform agrocore_private.validate_field_evidence_location(v_location);

  if v_result.id is null then
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
      p_visit_id,
      nullif(btrim(coalesce(p_appraisal_id,'')),''),
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
      jsonb_build_object('visitId',p_visit_id,'appraisalId',p_appraisal_id)
    );
  else
    if v_result.client_id <> p_client_id
       or (v_result.property_id is not null and p_property_id is not null
           and v_result.property_id <> p_property_id) then
      raise exception 'AGROCORE_EVIDENCE_CONFLICT';
    end if;

    if v_result.visit_id is null and p_visit_id is not null then
      v_result.visit_id := p_visit_id;
      v_changed := true;
    end if;
    if v_result.appraisal_id is null
       and nullif(btrim(coalesce(p_appraisal_id,'')),'') is not null then
      v_result.appraisal_id := btrim(p_appraisal_id);
      v_changed := true;
    end if;
    if v_result.property_id is null and p_property_id is not null then
      v_result.property_id := p_property_id;
      v_changed := true;
    end if;
    if v_result.location is null and v_location is not null then
      v_result.location := v_location;
      v_changed := true;
    end if;

    if v_changed then
      update public.field_evidence_sets
      set visit_id = v_result.visit_id,
          appraisal_id = v_result.appraisal_id,
          property_id = v_result.property_id,
          location = v_result.location,
          version = version + 1,
          updated_by_user_id = v_actor,
          updated_at = v_now
      where id = v_result.id
      returning * into v_result;

      insert into public.field_evidence_events (
        organization_id,evidence_id,action,actor_user_id,occurred_at,version,details
      ) values (
        p_organization_id,v_result.id,'linked',v_actor,v_now,v_result.version,
        jsonb_build_object('visitId',p_visit_id,'appraisalId',p_appraisal_id)
      );
    end if;
  end if;

  if nullif(btrim(coalesce(p_appraisal_id,'')),'') is not null then
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
      'appraisal_document',
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
      and d.logical_owner_type = 'appraisal'
      and d.logical_owner_id = btrim(p_appraisal_id)
      and d.category = 'photo_report'
      and d.is_current
      and d.status = 'active'
      and d.storage_state = 'stored'
      and d.storage_bucket = 'organization-documents'
      and d.storage_object_path is not null
      and d.mime_type in ('image/jpeg','image/png','image/tiff')
    on conflict (evidence_id, document_version_id)
      where document_version_id is not null
    do nothing;

    get diagnostics v_inserted = row_count;
    v_imported_total := v_imported_total + v_inserted;
  end if;

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
    'registry_document',
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
    and (
      (d.logical_owner_type = 'client' and d.logical_owner_id = p_client_id::text)
      or
      (p_property_id is not null
       and d.logical_owner_type = 'property'
       and d.logical_owner_id = p_property_id::text)
    )
    and d.category = 'photo_report'
    and d.is_current
    and d.status = 'active'
    and d.storage_state = 'stored'
    and d.storage_bucket = 'organization-documents'
    and d.storage_object_path is not null
    and d.mime_type in ('image/jpeg','image/png','image/tiff')
  on conflict (evidence_id, document_version_id)
    where document_version_id is not null
  do nothing;

  get diagnostics v_inserted = row_count;
  v_imported_total := v_imported_total + v_inserted;

  if coalesce(array_length(p_legacy_photo_references,1),0) > 0 then
    insert into public.field_evidence_photos (
      id,
      organization_id,
      evidence_id,
      source,
      legacy_reference,
      captured_at
    )
    select
      gen_random_uuid(),
      p_organization_id,
      v_result.id,
      'appraisal_legacy',
      btrim(reference),
      v_now
    from unnest(p_legacy_photo_references) reference
    where nullif(btrim(reference),'') is not null
    on conflict (evidence_id, legacy_reference)
      where legacy_reference is not null
    do nothing;

    get diagnostics v_inserted = row_count;
    v_imported_total := v_imported_total + v_inserted;
  end if;

  if v_imported_total > 0 then
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
      jsonb_build_object('count',v_imported_total)
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.agrocore_initialize_field_evidence(
  uuid,uuid,text,uuid,uuid,jsonb,text[]
) from public, anon;
grant execute on function public.agrocore_initialize_field_evidence(
  uuid,uuid,text,uuid,uuid,jsonb,text[]
) to authenticated;

create or replace function public.agrocore_set_field_evidence_location(
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
  v_now timestamptz := clock_timestamp();
begin
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform agrocore_private.validate_field_evidence_location(p_location);
  v_current := agrocore_private.assert_field_evidence_actor(
    p_organization_id,
    p_evidence_id,
    true
  );

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
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
    jsonb_build_object('source',p_location ->> 'source')
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_set_field_evidence_location(
  uuid,uuid,integer,jsonb
) from public, anon;
grant execute on function public.agrocore_set_field_evidence_location(
  uuid,uuid,integer,jsonb
) to authenticated;

create or replace function public.agrocore_register_field_evidence_photo(
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
     or p_source not in ('visit_capture','appraisal_capture')
     or p_mime_type not in ('image/jpeg','image/png','image/tiff')
     or p_file_size_bytes <= 0
     or p_file_size_bytes > 15728640
     or length(coalesce(p_caption,'')) > 500
     or ((p_latitude is null) <> (p_longitude is null))
     or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
     or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_current := agrocore_private.assert_field_evidence_actor(
    p_organization_id,
    p_evidence_id,
    true
  );

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
  end if;

  v_expected_prefix :=
    p_organization_id::text || '/' || p_evidence_id::text || '/' || p_photo_id::text || '.';

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
    id,
    organization_id,
    evidence_id,
    source,
    storage_bucket,
    storage_object_path,
    mime_type,
    file_size_bytes,
    caption,
    captured_at,
    captured_by_user_id,
    latitude,
    longitude
  ) values (
    p_photo_id,
    p_organization_id,
    p_evidence_id,
    p_source,
    'field-evidence',
    p_storage_object_path,
    p_mime_type,
    p_file_size_bytes,
    nullif(btrim(coalesce(p_caption,'')),''),
    v_now,
    v_actor,
    p_latitude,
    p_longitude
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
    jsonb_build_object('photoId',p_photo_id,'source',p_source)
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_register_field_evidence_photo(
  uuid,uuid,integer,uuid,text,text,text,bigint,text,double precision,double precision
) from public, anon;
grant execute on function public.agrocore_register_field_evidence_photo(
  uuid,uuid,integer,uuid,text,text,text,bigint,text,double precision,double precision
) to authenticated;

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
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
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
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
);

drop policy if exists "agrocore_field_evidence_storage_update" on storage.objects;
create policy "agrocore_field_evidence_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'field-evidence'
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
)
with check (
  bucket_id = 'field-evidence'
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
);

drop policy if exists "agrocore_field_evidence_storage_delete" on storage.objects;
create policy "agrocore_field_evidence_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'field-evidence'
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
);

comment on table public.field_evidence_sets
is 'Evidência canônica compartilhada por laudos e visitas/vistorias — OE-007.004.';
comment on table public.field_evidence_photos
is 'Fotografias compartilhadas sem duplicação entre Módulos 004 e 007.';
comment on table public.field_evidence_events
is 'Trilha append-only das sincronizações, fotos e geolocalizações de campo.';

         and v_lon_text ~ '^-?[0-9]+([.][0-9]+)?
    from public.clients
    where id = p_client_id
      and organization_id = p_organization_id;

    v_label := concat_ws(
      ', ',
      nullif(v_client_payload #>> '{address,street}',''),
      nullif(v_client_payload #>> '{address,number}',''),
      nullif(v_client_payload #>> '{address,neighborhood}',''),
      nullif(v_client_payload #>> '{address,locality}',''),
      nullif(v_client_payload #>> '{address,city}',''),
      nullif(v_client_payload #>> '{address,state}','')
    );
    if nullif(v_label,'') is not null then
      v_location := jsonb_build_object(
        'latitude', null,
        'longitude', null,
        'label', v_label,
        'source', 'registry_address'
      );
    end if;
  end if;

  perform agrocore_private.validate_field_evidence_location(v_location);

  if v_result.id is null then
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
      p_visit_id,
      nullif(btrim(coalesce(p_appraisal_id,'')),''),
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
      jsonb_build_object('visitId',p_visit_id,'appraisalId',p_appraisal_id)
    );
  else
    if v_result.client_id <> p_client_id
       or (v_result.property_id is not null and p_property_id is not null
           and v_result.property_id <> p_property_id) then
      raise exception 'AGROCORE_EVIDENCE_CONFLICT';
    end if;

    if v_result.visit_id is null and p_visit_id is not null then
      v_result.visit_id := p_visit_id;
      v_changed := true;
    end if;
    if v_result.appraisal_id is null
       and nullif(btrim(coalesce(p_appraisal_id,'')),'') is not null then
      v_result.appraisal_id := btrim(p_appraisal_id);
      v_changed := true;
    end if;
    if v_result.property_id is null and p_property_id is not null then
      v_result.property_id := p_property_id;
      v_changed := true;
    end if;
    if v_result.location is null and v_location is not null then
      v_result.location := v_location;
      v_changed := true;
    end if;

    if v_changed then
      update public.field_evidence_sets
      set visit_id = v_result.visit_id,
          appraisal_id = v_result.appraisal_id,
          property_id = v_result.property_id,
          location = v_result.location,
          version = version + 1,
          updated_by_user_id = v_actor,
          updated_at = v_now
      where id = v_result.id
      returning * into v_result;

      insert into public.field_evidence_events (
        organization_id,evidence_id,action,actor_user_id,occurred_at,version,details
      ) values (
        p_organization_id,v_result.id,'linked',v_actor,v_now,v_result.version,
        jsonb_build_object('visitId',p_visit_id,'appraisalId',p_appraisal_id)
      );
    end if;
  end if;

  if nullif(btrim(coalesce(p_appraisal_id,'')),'') is not null then
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
      'appraisal_document',
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
      and d.logical_owner_type = 'appraisal'
      and d.logical_owner_id = btrim(p_appraisal_id)
      and d.category = 'photo_report'
      and d.is_current
      and d.status = 'active'
      and d.storage_state = 'stored'
      and d.storage_bucket = 'organization-documents'
      and d.storage_object_path is not null
      and d.mime_type in ('image/jpeg','image/png','image/tiff')
    on conflict (evidence_id, document_version_id)
      where document_version_id is not null
    do nothing;

    get diagnostics v_inserted = row_count;
    v_imported_total := v_imported_total + v_inserted;
  end if;

  if coalesce(array_length(p_legacy_photo_references,1),0) > 0 then
    insert into public.field_evidence_photos (
      id,
      organization_id,
      evidence_id,
      source,
      legacy_reference,
      captured_at
    )
    select
      gen_random_uuid(),
      p_organization_id,
      v_result.id,
      'appraisal_legacy',
      btrim(reference),
      v_now
    from unnest(p_legacy_photo_references) reference
    where nullif(btrim(reference),'') is not null
    on conflict (evidence_id, legacy_reference)
      where legacy_reference is not null
    do nothing;

    get diagnostics v_inserted = row_count;
    v_imported_total := v_imported_total + v_inserted;
  end if;

  if v_imported_total > 0 then
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
      jsonb_build_object('count',v_imported_total)
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.agrocore_initialize_field_evidence(
  uuid,uuid,text,uuid,uuid,jsonb,text[]
) from public, anon;
grant execute on function public.agrocore_initialize_field_evidence(
  uuid,uuid,text,uuid,uuid,jsonb,text[]
) to authenticated;

create or replace function public.agrocore_set_field_evidence_location(
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
  v_now timestamptz := clock_timestamp();
begin
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform agrocore_private.validate_field_evidence_location(p_location);
  v_current := agrocore_private.assert_field_evidence_actor(
    p_organization_id,
    p_evidence_id,
    true
  );

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
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
    jsonb_build_object('source',p_location ->> 'source')
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_set_field_evidence_location(
  uuid,uuid,integer,jsonb
) from public, anon;
grant execute on function public.agrocore_set_field_evidence_location(
  uuid,uuid,integer,jsonb
) to authenticated;

create or replace function public.agrocore_register_field_evidence_photo(
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
     or p_source not in ('visit_capture','appraisal_capture')
     or p_mime_type not in ('image/jpeg','image/png','image/tiff')
     or p_file_size_bytes <= 0
     or p_file_size_bytes > 15728640
     or length(coalesce(p_caption,'')) > 500
     or ((p_latitude is null) <> (p_longitude is null))
     or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
     or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_current := agrocore_private.assert_field_evidence_actor(
    p_organization_id,
    p_evidence_id,
    true
  );

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
  end if;

  v_expected_prefix :=
    p_organization_id::text || '/' || p_evidence_id::text || '/' || p_photo_id::text || '.';

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
    id,
    organization_id,
    evidence_id,
    source,
    storage_bucket,
    storage_object_path,
    mime_type,
    file_size_bytes,
    caption,
    captured_at,
    captured_by_user_id,
    latitude,
    longitude
  ) values (
    p_photo_id,
    p_organization_id,
    p_evidence_id,
    p_source,
    'field-evidence',
    p_storage_object_path,
    p_mime_type,
    p_file_size_bytes,
    nullif(btrim(coalesce(p_caption,'')),''),
    v_now,
    v_actor,
    p_latitude,
    p_longitude
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
    jsonb_build_object('photoId',p_photo_id,'source',p_source)
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_register_field_evidence_photo(
  uuid,uuid,integer,uuid,text,text,text,bigint,text,double precision,double precision
) from public, anon;
grant execute on function public.agrocore_register_field_evidence_photo(
  uuid,uuid,integer,uuid,text,text,text,bigint,text,double precision,double precision
) to authenticated;

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
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
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
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
);

drop policy if exists "agrocore_field_evidence_storage_update" on storage.objects;
create policy "agrocore_field_evidence_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'field-evidence'
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
)
with check (
  bucket_id = 'field-evidence'
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
);

drop policy if exists "agrocore_field_evidence_storage_delete" on storage.objects;
create policy "agrocore_field_evidence_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'field-evidence'
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
);

comment on table public.field_evidence_sets
is 'Evidência canônica compartilhada por laudos e visitas/vistorias — OE-007.004.';
comment on table public.field_evidence_photos
is 'Fotografias compartilhadas sem duplicação entre Módulos 004 e 007.';
comment on table public.field_evidence_events
is 'Trilha append-only das sincronizações, fotos e geolocalizações de campo.';

         and v_lat_text::double precision between -90 and 90
         and v_lon_text::double precision between -180 and 180 then
        v_location := jsonb_build_object(
          'latitude', v_lat_text::double precision,
          'longitude', v_lon_text::double precision,
          'label', nullif(v_label,''),
          'source', 'property_geometry'
        );
      end if;
    end if;

    if v_location is null and nullif(v_label,'') is not null then
      v_location := jsonb_build_object(
        'latitude', null,
        'longitude', null,
        'label', v_label,
        'source', 'registry_address'
      );
    end if;
  end if;

  if v_location is null then
    select payload into v_client_payload
    from public.clients
    where id = p_client_id
      and organization_id = p_organization_id;

    v_label := concat_ws(
      ', ',
      nullif(v_client_payload #>> '{address,street}',''),
      nullif(v_client_payload #>> '{address,number}',''),
      nullif(v_client_payload #>> '{address,neighborhood}',''),
      nullif(v_client_payload #>> '{address,locality}',''),
      nullif(v_client_payload #>> '{address,city}',''),
      nullif(v_client_payload #>> '{address,state}','')
    );
    if nullif(v_label,'') is not null then
      v_location := jsonb_build_object(
        'latitude', null,
        'longitude', null,
        'label', v_label,
        'source', 'registry_address'
      );
    end if;
  end if;

  perform agrocore_private.validate_field_evidence_location(v_location);

  if v_result.id is null then
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
      p_visit_id,
      nullif(btrim(coalesce(p_appraisal_id,'')),''),
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
      jsonb_build_object('visitId',p_visit_id,'appraisalId',p_appraisal_id)
    );
  else
    if v_result.client_id <> p_client_id
       or (v_result.property_id is not null and p_property_id is not null
           and v_result.property_id <> p_property_id) then
      raise exception 'AGROCORE_EVIDENCE_CONFLICT';
    end if;

    if v_result.visit_id is null and p_visit_id is not null then
      v_result.visit_id := p_visit_id;
      v_changed := true;
    end if;
    if v_result.appraisal_id is null
       and nullif(btrim(coalesce(p_appraisal_id,'')),'') is not null then
      v_result.appraisal_id := btrim(p_appraisal_id);
      v_changed := true;
    end if;
    if v_result.property_id is null and p_property_id is not null then
      v_result.property_id := p_property_id;
      v_changed := true;
    end if;
    if v_result.location is null and v_location is not null then
      v_result.location := v_location;
      v_changed := true;
    end if;

    if v_changed then
      update public.field_evidence_sets
      set visit_id = v_result.visit_id,
          appraisal_id = v_result.appraisal_id,
          property_id = v_result.property_id,
          location = v_result.location,
          version = version + 1,
          updated_by_user_id = v_actor,
          updated_at = v_now
      where id = v_result.id
      returning * into v_result;

      insert into public.field_evidence_events (
        organization_id,evidence_id,action,actor_user_id,occurred_at,version,details
      ) values (
        p_organization_id,v_result.id,'linked',v_actor,v_now,v_result.version,
        jsonb_build_object('visitId',p_visit_id,'appraisalId',p_appraisal_id)
      );
    end if;
  end if;

  if nullif(btrim(coalesce(p_appraisal_id,'')),'') is not null then
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
      'appraisal_document',
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
      and d.logical_owner_type = 'appraisal'
      and d.logical_owner_id = btrim(p_appraisal_id)
      and d.category = 'photo_report'
      and d.is_current
      and d.status = 'active'
      and d.storage_state = 'stored'
      and d.storage_bucket = 'organization-documents'
      and d.storage_object_path is not null
      and d.mime_type in ('image/jpeg','image/png','image/tiff')
    on conflict (evidence_id, document_version_id)
      where document_version_id is not null
    do nothing;

    get diagnostics v_inserted = row_count;
    v_imported_total := v_imported_total + v_inserted;
  end if;

  if coalesce(array_length(p_legacy_photo_references,1),0) > 0 then
    insert into public.field_evidence_photos (
      id,
      organization_id,
      evidence_id,
      source,
      legacy_reference,
      captured_at
    )
    select
      gen_random_uuid(),
      p_organization_id,
      v_result.id,
      'appraisal_legacy',
      btrim(reference),
      v_now
    from unnest(p_legacy_photo_references) reference
    where nullif(btrim(reference),'') is not null
    on conflict (evidence_id, legacy_reference)
      where legacy_reference is not null
    do nothing;

    get diagnostics v_inserted = row_count;
    v_imported_total := v_imported_total + v_inserted;
  end if;

  if v_imported_total > 0 then
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
      jsonb_build_object('count',v_imported_total)
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.agrocore_initialize_field_evidence(
  uuid,uuid,text,uuid,uuid,jsonb,text[]
) from public, anon;
grant execute on function public.agrocore_initialize_field_evidence(
  uuid,uuid,text,uuid,uuid,jsonb,text[]
) to authenticated;

create or replace function public.agrocore_set_field_evidence_location(
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
  v_now timestamptz := clock_timestamp();
begin
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform agrocore_private.validate_field_evidence_location(p_location);
  v_current := agrocore_private.assert_field_evidence_actor(
    p_organization_id,
    p_evidence_id,
    true
  );

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
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
    jsonb_build_object('source',p_location ->> 'source')
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_set_field_evidence_location(
  uuid,uuid,integer,jsonb
) from public, anon;
grant execute on function public.agrocore_set_field_evidence_location(
  uuid,uuid,integer,jsonb
) to authenticated;

create or replace function public.agrocore_register_field_evidence_photo(
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
     or p_source not in ('visit_capture','appraisal_capture')
     or p_mime_type not in ('image/jpeg','image/png','image/tiff')
     or p_file_size_bytes <= 0
     or p_file_size_bytes > 15728640
     or length(coalesce(p_caption,'')) > 500
     or ((p_latitude is null) <> (p_longitude is null))
     or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
     or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_current := agrocore_private.assert_field_evidence_actor(
    p_organization_id,
    p_evidence_id,
    true
  );

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
  end if;

  v_expected_prefix :=
    p_organization_id::text || '/' || p_evidence_id::text || '/' || p_photo_id::text || '.';

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
    id,
    organization_id,
    evidence_id,
    source,
    storage_bucket,
    storage_object_path,
    mime_type,
    file_size_bytes,
    caption,
    captured_at,
    captured_by_user_id,
    latitude,
    longitude
  ) values (
    p_photo_id,
    p_organization_id,
    p_evidence_id,
    p_source,
    'field-evidence',
    p_storage_object_path,
    p_mime_type,
    p_file_size_bytes,
    nullif(btrim(coalesce(p_caption,'')),''),
    v_now,
    v_actor,
    p_latitude,
    p_longitude
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
    jsonb_build_object('photoId',p_photo_id,'source',p_source)
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_register_field_evidence_photo(
  uuid,uuid,integer,uuid,text,text,text,bigint,text,double precision,double precision
) from public, anon;
grant execute on function public.agrocore_register_field_evidence_photo(
  uuid,uuid,integer,uuid,text,text,text,bigint,text,double precision,double precision
) to authenticated;

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
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
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
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
);

drop policy if exists "agrocore_field_evidence_storage_update" on storage.objects;
create policy "agrocore_field_evidence_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'field-evidence'
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
)
with check (
  bucket_id = 'field-evidence'
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
);

drop policy if exists "agrocore_field_evidence_storage_delete" on storage.objects;
create policy "agrocore_field_evidence_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'field-evidence'
  and exists (
    select 1
    from public.field_evidence_sets e
    where e.organization_id::text = split_part(name,'/',1)
      and e.id::text = split_part(name,'/',2)
      and coalesce(
        agrocore_private.current_organization_role(e.organization_id)
          in ('owner','company_admin','manager','project_designer'),
        false
      )
  )
);

comment on table public.field_evidence_sets
is 'Evidência canônica compartilhada por laudos e visitas/vistorias — OE-007.004.';
comment on table public.field_evidence_photos
is 'Fotografias compartilhadas sem duplicação entre Módulos 004 e 007.';
comment on table public.field_evidence_events
is 'Trilha append-only das sincronizações, fotos e geolocalizações de campo.';
