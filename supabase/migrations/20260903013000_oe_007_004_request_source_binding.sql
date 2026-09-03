-- AgroCore — OE-007.004 R5
-- Vincula solicitações cadastrais à origem real do atendimento.
-- Evita que uma solicitação seja criada com cliente/imóvel divergente do fluxo
-- que a originou.

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
  v_visit public.technical_visits%rowtype;
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
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.organization_id = p_organization_id
      and c.status = 'active'
  ) then
    raise exception 'AGROCORE_NOT_FOUND';
  end if;

  if p_property_id is not null
     and not exists (
       select 1
       from public.properties p
       where p.id = p_property_id
         and p.organization_id = p_organization_id
         and p.status = 'active'
         and p.client_ids @> array[p_client_id]
     ) then
    raise exception 'AGROCORE_EVIDENCE_CONFLICT';
  end if;

  if p_source_type = 'visit' then
    select * into v_visit
    from public.technical_visits v
    where v.id::text = btrim(p_source_id)
      and v.organization_id = p_organization_id;

    if not found
       or v_visit.client_id <> p_client_id
       or v_visit.property_id is distinct from p_property_id then
      raise exception 'AGROCORE_EVIDENCE_CONFLICT';
    end if;

    if v_role = 'project_designer'
       and v_visit.responsible_user_id <> v_actor then
      raise exception 'AGROCORE_FORBIDDEN';
    end if;
  else
    if p_property_id is null then
      raise exception 'AGROCORE_INVALID_INPUT';
    end if;

    if not exists (
      select 1
      from public.field_evidence_links l
      join public.field_evidence_sets e
        on e.id = l.evidence_id
       and e.organization_id = l.organization_id
      join public.properties p
        on p.id = e.property_id
       and p.organization_id = e.organization_id
      where l.organization_id = p_organization_id
        and l.entity_type = 'appraisal'
        and l.entity_id = btrim(p_source_id)
        and e.property_id = p_property_id
        and p.client_ids @> array[p_client_id]
    ) then
      raise exception 'AGROCORE_EVIDENCE_CONFLICT';
    end if;
  end if;

  select a.capturer_user_id into v_capturer
  from public.client_capturer_assignments a
  where a.organization_id = p_organization_id
    and a.client_id = p_client_id
    and a.status = 'active'
  order by a.is_primary desc, a.started_at desc, a.id
  limit 1;

  if v_capturer is null then
    raise exception 'AGROCORE_CAPTURER_NOT_ASSIGNED';
  end if;

  select * into v_result
  from public.client_registry_requests r
  where r.organization_id = p_organization_id
    and r.source_type = p_source_type
    and r.source_id = btrim(p_source_id)
    and r.scope = p_scope
    and r.status in ('open','in_progress')
  order by r.created_at desc
  limit 1;

  if found then
    if v_result.client_id <> p_client_id
       or v_result.property_id is distinct from p_property_id
       or v_result.assigned_capturer_user_id <> v_capturer then
      raise exception 'AGROCORE_EVIDENCE_CONFLICT';
    end if;
    return v_result;
  end if;

  insert into public.client_registry_requests (
    organization_id,
    client_id,
    property_id,
    assigned_capturer_user_id,
    requested_by_user_id,
    source_type,
    source_id,
    scope,
    status,
    note,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_client_id,
    p_property_id,
    v_capturer,
    v_actor,
    p_source_type,
    btrim(p_source_id),
    p_scope,
    'open',
    nullif(btrim(coalesce(p_note,'')),''),
    v_now,
    v_now
  )
  returning * into v_result;

  insert into public.client_registry_request_events (
    organization_id,
    request_id,
    action,
    actor_user_id,
    occurred_at,
    details
  ) values (
    p_organization_id,
    v_result.id,
    'created',
    v_actor,
    v_now,
    jsonb_build_object(
      'clientId', p_client_id,
      'propertyId', p_property_id,
      'assignedCapturerUserId', v_capturer,
      'scope', p_scope,
      'sourceType', p_source_type,
      'sourceId', btrim(p_source_id)
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

comment on function public.agrocore_create_client_registry_request(
  uuid,uuid,uuid,text,text,text,text
) is
  'Cria solicitação cadastral somente quando cliente/imóvel correspondem à origem real (visita ou laudo vinculado). OE-007.004 R5.';
