-- AgroCore — OE-007.004 R3
-- Autoridade definitiva por imóvel + suporte a múltiplos clientes vinculados.
-- client_id permanece apenas como metadado legado/contextual e não participa
-- de identidade, autorização ou sincronização da evidência.

alter table public.field_evidence_sets
  alter column client_id drop not null;

comment on column public.field_evidence_sets.client_id is
  'Contexto legado do primeiro cliente; não é autoridade. A evidência é canônica por property_id.';

create or replace function agrocore_private.can_access_property_field_evidence(
  p_organization_id uuid,
  p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = p_property_id
      and p.organization_id = p_organization_id
      and (
        agrocore_private.current_organization_role(p_organization_id)
          in ('owner','company_admin','manager','project_designer')
        or (
          agrocore_private.current_organization_role(p_organization_id) = 'capturer'
          and exists (
            select 1
            from public.client_capturer_assignments a
            where a.organization_id = p_organization_id
              and a.client_id = any(p.client_ids)
              and a.capturer_user_id = (select auth.uid())
              and a.status = 'active'
          )
        )
      )
  );
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
    v_evidence.property_id
  ) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  return v_evidence;
end;
$$;

revoke all on function
  agrocore_private.assert_property_field_evidence_actor(uuid,uuid)
  from public, anon, authenticated;

drop policy if exists "agrocore_field_evidence_sets_select"
  on public.field_evidence_sets;
create policy "agrocore_field_evidence_sets_select"
on public.field_evidence_sets
for select
to authenticated
using (
  agrocore_private.can_access_property_field_evidence(
    organization_id,
    property_id
  )
);

drop policy if exists "agrocore_field_evidence_photos_select"
  on public.field_evidence_photos;
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
        e.property_id
      )
  )
);

drop policy if exists "agrocore_field_evidence_events_select"
  on public.field_evidence_events;
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
        e.property_id
      )
  )
);

drop policy if exists "agrocore_field_evidence_links_select"
  on public.field_evidence_links;
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
        e.property_id
      )
  )
);

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
    p_property_id
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
      null,
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
        e.property_id
      )
  );
$$;

revoke all on function
  agrocore_private.can_mutate_property_field_evidence_storage(uuid,uuid)
  from public, anon, authenticated;

drop policy if exists "agrocore_field_evidence_storage_select"
  on storage.objects;
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
        e.property_id
      )
  )
);

drop policy if exists "agrocore_field_evidence_storage_insert"
  on storage.objects;
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

drop policy if exists "agrocore_field_evidence_storage_update"
  on storage.objects;
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

drop policy if exists "agrocore_field_evidence_storage_delete"
  on storage.objects;
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

comment on table public.field_evidence_sets is
  'Fonte canônica única de fotos e geolocalização por imóvel, independente do cliente de contexto — OE-007.004 R3.';
