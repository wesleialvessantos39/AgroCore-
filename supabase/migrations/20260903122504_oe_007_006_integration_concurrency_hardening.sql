-- AgroCore — OE-007.006 R3 — concorrência e monotonicidade da outbox.
-- Impede regressão de projeções durante backfill concorrente e serializa
-- a chave idempotente antes da leitura/inserção do evento.

create or replace function agrocore_private.upsert_technical_visit_integration_link(
  p_organization_id uuid,
  p_visit_id uuid,
  p_target_domain text,
  p_stable_reference text,
  p_status text,
  p_source_version integer,
  p_payload jsonb,
  p_occurred_at timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current public.technical_visit_integration_links%rowtype;
  v_reference text := btrim(coalesce(p_stable_reference,''));
begin
  if p_target_domain not in ('calendar','proposal','fleet')
     or p_status not in ('active','released')
     or length(v_reference) not between 1 and 200
     or p_source_version is null
     or p_source_version < 1
     or jsonb_typeof(p_payload) <> 'object'
     or p_occurred_at is null then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_visit_id::text || ':' || p_target_domain,
      0
    )
  );

  select *
  into v_current
  from public.technical_visit_integration_links l
  where l.organization_id = p_organization_id
    and l.visit_id = p_visit_id
    and l.target_domain = p_target_domain
  for update;

  if found then
    if v_current.source_version > p_source_version then
      return;
    end if;

    if v_current.source_version = p_source_version then
      if v_current.stable_reference is distinct from v_reference
         or v_current.status is distinct from p_status
         or v_current.payload is distinct from p_payload then
        raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
      end if;
      return;
    end if;

    update public.technical_visit_integration_links
    set stable_reference = v_reference,
        status = p_status,
        source_version = p_source_version,
        payload = p_payload,
        updated_at = p_occurred_at
    where id = v_current.id;
    return;
  end if;

  insert into public.technical_visit_integration_links (
    organization_id,
    visit_id,
    target_domain,
    stable_reference,
    status,
    source_version,
    payload,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_visit_id,
    p_target_domain,
    v_reference,
    p_status,
    p_source_version,
    p_payload,
    p_occurred_at,
    p_occurred_at
  );
end;
$$;

revoke all on function agrocore_private.upsert_technical_visit_integration_link(
  uuid,uuid,text,text,text,integer,jsonb,timestamptz
) from public, anon, authenticated;

create or replace function agrocore_private.emit_technical_visit_integration_event(
  p_organization_id uuid,
  p_visit_id uuid,
  p_event_key text,
  p_target_domain text,
  p_event_type text,
  p_source_version integer,
  p_payload jsonb,
  p_occurred_at timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existing public.technical_visit_integration_events%rowtype;
  v_event_key text := btrim(coalesce(p_event_key,''));
begin
  if p_target_domain not in ('calendar','proposal','fleet')
     or length(v_event_key) not between 8 and 300
     or p_source_version is null
     or p_source_version < 1
     or jsonb_typeof(p_payload) <> 'object'
     or p_occurred_at is null then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || v_event_key, 0)
  );

  select *
  into v_existing
  from public.technical_visit_integration_events e
  where e.organization_id = p_organization_id
    and e.event_key = v_event_key;

  if found then
    if v_existing.visit_id is distinct from p_visit_id
       or v_existing.target_domain is distinct from p_target_domain
       or v_existing.event_type is distinct from p_event_type
       or v_existing.source_version is distinct from p_source_version
       or v_existing.payload is distinct from p_payload then
      raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
    end if;
    return;
  end if;

  insert into public.technical_visit_integration_events (
    organization_id,
    visit_id,
    event_key,
    target_domain,
    event_type,
    source_version,
    occurred_at,
    payload
  ) values (
    p_organization_id,
    p_visit_id,
    v_event_key,
    p_target_domain,
    p_event_type,
    p_source_version,
    p_occurred_at,
    p_payload
  );
end;
$$;

revoke all on function agrocore_private.emit_technical_visit_integration_event(
  uuid,uuid,text,text,text,integer,jsonb,timestamptz
) from public, anon, authenticated;

comment on function agrocore_private.upsert_technical_visit_integration_link(
  uuid,uuid,text,text,text,integer,jsonb,timestamptz
) is
  'OE-007.006 R3: projeção monotônica por source_version, com conflito explícito para mesma versão divergente.';

comment on function agrocore_private.emit_technical_visit_integration_event(
  uuid,uuid,text,text,text,integer,jsonb,timestamptz
) is
  'OE-007.006 R3: emissão idempotente serializada por organização e event_key.';
