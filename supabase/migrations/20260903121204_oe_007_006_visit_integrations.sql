-- AgroCore — OE-007.006 — Integração de visitas com agenda, propostas e frota.
-- Cria links estáveis e eventos idempotentes sem antecipar os domínios completos
-- de Agenda/Tarefas (Módulo 008) ou Frota (Módulo 009).

create table if not exists public.technical_visit_integration_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  visit_id uuid not null references public.technical_visits(id) on delete cascade,
  target_domain text not null check (target_domain in ('calendar','proposal','fleet')),
  stable_reference text not null check (length(btrim(stable_reference)) between 1 and 200),
  status text not null check (status in ('active','released')),
  source_version integer not null check (source_version >= 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organization_id, visit_id, target_domain)
);

create index if not exists technical_visit_integration_links_org_domain_idx
  on public.technical_visit_integration_links (organization_id, target_domain, status, updated_at desc);

create table if not exists public.technical_visit_integration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  visit_id uuid not null references public.technical_visits(id) on delete cascade,
  event_key text not null check (length(btrim(event_key)) between 8 and 300),
  target_domain text not null check (target_domain in ('calendar','proposal','fleet')),
  event_type text not null check (
    event_type in (
      'calendar.visit_sync_requested',
      'calendar.visit_release_requested',
      'proposal.visit_linked',
      'proposal.visit_relinked',
      'proposal.visit_unlinked',
      'proposal.visit_status_changed',
      'fleet.visit_sync_requested',
      'fleet.visit_release_requested'
    )
  ),
  source_version integer not null check (source_version >= 1),
  occurred_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  unique (organization_id, event_key)
);

create index if not exists technical_visit_integration_events_org_visit_idx
  on public.technical_visit_integration_events (
    organization_id, visit_id, source_version desc, occurred_at desc
  );

create index if not exists technical_visit_integration_events_org_domain_idx
  on public.technical_visit_integration_events (
    organization_id, target_domain, occurred_at desc
  );

alter table public.technical_visit_integration_links enable row level security;
alter table public.technical_visit_integration_events enable row level security;

create or replace function agrocore_private.can_view_technical_visit_integrations(
  p_organization_id uuid,
  p_visit_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    agrocore_private.current_organization_role(p_organization_id)
      in ('owner','company_admin','manager'),
    false
  )
  or (
    agrocore_private.current_organization_role(p_organization_id) = 'project_designer'
    and exists (
      select 1
      from public.technical_visits v
      where v.organization_id = p_organization_id
        and v.id = p_visit_id
        and v.responsible_user_id = (select auth.uid())
    )
  );
$$;

revoke all on function agrocore_private.can_view_technical_visit_integrations(uuid,uuid)
  from public, anon, authenticated;

drop policy if exists "agrocore_technical_visit_integration_links_select"
  on public.technical_visit_integration_links;
create policy "agrocore_technical_visit_integration_links_select"
on public.technical_visit_integration_links
for select
to authenticated
using (
  (select agrocore_private.can_view_technical_visit_integrations(organization_id, visit_id))
);

drop policy if exists "agrocore_technical_visit_integration_events_select"
  on public.technical_visit_integration_events;
create policy "agrocore_technical_visit_integration_events_select"
on public.technical_visit_integration_events
for select
to authenticated
using (
  (select agrocore_private.can_view_technical_visit_integrations(organization_id, visit_id))
);

revoke all on public.technical_visit_integration_links from public, anon;
revoke all on public.technical_visit_integration_events from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.technical_visit_integration_links from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.technical_visit_integration_events from authenticated;
grant select on public.technical_visit_integration_links to authenticated;
grant select on public.technical_visit_integration_events to authenticated;

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
begin
  if p_target_domain not in ('calendar','proposal','fleet')
     or p_status not in ('active','released')
     or length(btrim(coalesce(p_stable_reference,''))) not between 1 and 200
     or p_source_version is null
     or p_source_version < 1
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'AGROCORE_INVALID_INPUT';
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
    btrim(p_stable_reference),
    p_status,
    p_source_version,
    p_payload,
    p_occurred_at,
    p_occurred_at
  )
  on conflict (organization_id, visit_id, target_domain)
  do update set
    stable_reference = excluded.stable_reference,
    status = excluded.status,
    source_version = excluded.source_version,
    payload = excluded.payload,
    updated_at = excluded.updated_at;
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
begin
  if p_target_domain not in ('calendar','proposal','fleet')
     or length(btrim(coalesce(p_event_key,''))) not between 8 and 300
     or p_source_version is null
     or p_source_version < 1
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  select *
  into v_existing
  from public.technical_visit_integration_events e
  where e.organization_id = p_organization_id
    and e.event_key = p_event_key;

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
    btrim(p_event_key),
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

create or replace function agrocore_private.sync_technical_visit_integrations(
  p_new public.technical_visits,
  p_old public.technical_visits,
  p_is_insert boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_at timestamptz := p_new.updated_at;
  v_terminal boolean := p_new.status in ('completed','cancelled');
  v_old_proposal text := nullif(btrim(coalesce(p_old.payload ->> 'proposalId','')), '');
  v_new_proposal text := nullif(btrim(coalesce(p_new.payload ->> 'proposalId','')), '');
  v_calendar_changed boolean;
  v_fleet_changed boolean;
  v_calendar_event_type text;
  v_fleet_event_type text;
  v_payload jsonb;
begin
  if p_new.organization_id is null
     or p_new.id is null
     or p_new.version is null
     or p_new.version < 1
     or jsonb_typeof(p_new.payload) <> 'object' then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_calendar_changed := coalesce(p_is_insert,false)
    or p_old.scheduled_for is distinct from p_new.scheduled_for
    or p_old.responsible_user_id is distinct from p_new.responsible_user_id
    or p_old.status is distinct from p_new.status
    or (p_old.payload -> 'preparation') is distinct from (p_new.payload -> 'preparation');

  v_payload := jsonb_build_object(
    'organizationId', p_new.organization_id::text,
    'visitId', p_new.id::text,
    'targetDomain', 'calendar',
    'stableReference', p_new.id::text,
    'status', case when v_terminal then 'released' else 'active' end,
    'sourceVersion', p_new.version,
    'scheduledFor', p_new.scheduled_for,
    'responsibleUserId', p_new.responsible_user_id::text,
    'participantUserIds', coalesce(p_new.payload #> '{preparation,participantUserIds}', '[]'::jsonb),
    'durationMinutes', p_new.payload #> '{preparation,durationMinutes}',
    'timeZone', p_new.payload #> '{preparation,timeZone}',
    'address', p_new.payload #> '{preparation,address}'
  );

  perform agrocore_private.upsert_technical_visit_integration_link(
    p_new.organization_id,
    p_new.id,
    'calendar',
    p_new.id::text,
    case when v_terminal then 'released' else 'active' end,
    p_new.version,
    v_payload,
    v_event_at
  );

  if v_calendar_changed then
    v_calendar_event_type := case
      when v_terminal then 'calendar.visit_release_requested'
      else 'calendar.visit_sync_requested'
    end;
    perform agrocore_private.emit_technical_visit_integration_event(
      p_new.organization_id,
      p_new.id,
      p_new.id::text || ':' || p_new.version::text || ':calendar:' || v_calendar_event_type,
      'calendar',
      v_calendar_event_type,
      p_new.version,
      v_payload,
      v_event_at
    );
  end if;

  if v_old_proposal is distinct from v_new_proposal then
    if v_old_proposal is not null then
      v_payload := jsonb_build_object(
        'organizationId', p_new.organization_id::text,
        'visitId', p_new.id::text,
        'targetDomain', 'proposal',
        'stableReference', v_old_proposal,
        'status', 'released',
        'sourceVersion', p_new.version,
        'clientId', p_new.client_id::text,
        'propertyId', p_new.property_id,
        'visitStatus', p_new.status
      );
      perform agrocore_private.emit_technical_visit_integration_event(
        p_new.organization_id,
        p_new.id,
        p_new.id::text || ':' || p_new.version::text || ':proposal:proposal.visit_unlinked',
        'proposal',
        'proposal.visit_unlinked',
        p_new.version,
        v_payload,
        v_event_at
      );
    end if;

    if v_new_proposal is not null then
      v_payload := jsonb_build_object(
        'organizationId', p_new.organization_id::text,
        'visitId', p_new.id::text,
        'targetDomain', 'proposal',
        'stableReference', v_new_proposal,
        'status', 'active',
        'sourceVersion', p_new.version,
        'clientId', p_new.client_id::text,
        'propertyId', p_new.property_id,
        'visitStatus', p_new.status
      );

      perform agrocore_private.upsert_technical_visit_integration_link(
        p_new.organization_id,
        p_new.id,
        'proposal',
        v_new_proposal,
        'active',
        p_new.version,
        v_payload,
        v_event_at
      );

      perform agrocore_private.emit_technical_visit_integration_event(
        p_new.organization_id,
        p_new.id,
        p_new.id::text || ':' || p_new.version::text || ':proposal:' ||
          case when v_old_proposal is null then 'proposal.visit_linked' else 'proposal.visit_relinked' end,
        'proposal',
        case when v_old_proposal is null then 'proposal.visit_linked' else 'proposal.visit_relinked' end,
        p_new.version,
        v_payload,
        v_event_at
      );
    elsif v_old_proposal is not null then
      perform agrocore_private.upsert_technical_visit_integration_link(
        p_new.organization_id,
        p_new.id,
        'proposal',
        v_old_proposal,
        'released',
        p_new.version,
        v_payload,
        v_event_at
      );
    end if;
  elsif v_new_proposal is not null then
    v_payload := jsonb_build_object(
      'organizationId', p_new.organization_id::text,
      'visitId', p_new.id::text,
      'targetDomain', 'proposal',
      'stableReference', v_new_proposal,
      'status', 'active',
      'sourceVersion', p_new.version,
      'clientId', p_new.client_id::text,
      'propertyId', p_new.property_id,
      'visitStatus', p_new.status
    );

    perform agrocore_private.upsert_technical_visit_integration_link(
      p_new.organization_id,
      p_new.id,
      'proposal',
      v_new_proposal,
      'active',
      p_new.version,
      v_payload,
      v_event_at
    );

    if p_old.status is distinct from p_new.status then
      perform agrocore_private.emit_technical_visit_integration_event(
        p_new.organization_id,
        p_new.id,
        p_new.id::text || ':' || p_new.version::text || ':proposal:proposal.visit_status_changed',
        'proposal',
        'proposal.visit_status_changed',
        p_new.version,
        v_payload,
        v_event_at
      );
    end if;
  end if;

  v_fleet_changed := coalesce(p_is_insert,false)
    or p_old.scheduled_for is distinct from p_new.scheduled_for
    or p_old.responsible_user_id is distinct from p_new.responsible_user_id
    or p_old.property_id is distinct from p_new.property_id
    or p_old.status is distinct from p_new.status
    or (p_old.payload -> 'preparation') is distinct from (p_new.payload -> 'preparation');

  v_payload := jsonb_build_object(
    'organizationId', p_new.organization_id::text,
    'visitId', p_new.id::text,
    'targetDomain', 'fleet',
    'stableReference', p_new.id::text,
    'status', case when v_terminal then 'released' else 'active' end,
    'sourceVersion', p_new.version,
    'scheduledFor', p_new.scheduled_for,
    'responsibleUserId', p_new.responsible_user_id::text,
    'propertyId', p_new.property_id,
    'durationMinutes', p_new.payload #> '{preparation,durationMinutes}',
    'address', p_new.payload #> '{preparation,address}'
  );

  perform agrocore_private.upsert_technical_visit_integration_link(
    p_new.organization_id,
    p_new.id,
    'fleet',
    p_new.id::text,
    case when v_terminal then 'released' else 'active' end,
    p_new.version,
    v_payload,
    v_event_at
  );

  if v_fleet_changed then
    v_fleet_event_type := case
      when v_terminal then 'fleet.visit_release_requested'
      else 'fleet.visit_sync_requested'
    end;

    perform agrocore_private.emit_technical_visit_integration_event(
      p_new.organization_id,
      p_new.id,
      p_new.id::text || ':' || p_new.version::text || ':fleet:' || v_fleet_event_type,
      'fleet',
      v_fleet_event_type,
      p_new.version,
      v_payload,
      v_event_at
    );
  end if;
end;
$$;

revoke all on function agrocore_private.sync_technical_visit_integrations(
  public.technical_visits,public.technical_visits,boolean
) from public, anon, authenticated;

create or replace function agrocore_private.technical_visit_integration_trigger()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform agrocore_private.sync_technical_visit_integrations(new, null, true);
  else
    perform agrocore_private.sync_technical_visit_integrations(new, old, false);
  end if;
  return new;
end;
$$;

revoke all on function agrocore_private.technical_visit_integration_trigger()
  from public, anon, authenticated;

drop trigger if exists agrocore_technical_visit_integrations_sync
  on public.technical_visits;
create trigger agrocore_technical_visit_integrations_sync
after insert or update on public.technical_visits
for each row
execute function agrocore_private.technical_visit_integration_trigger();

-- Backfill seguro para visitas já existentes. Não altera a visita nem sua versão.
do $$
declare
  v_visit public.technical_visits%rowtype;
begin
  for v_visit in
    select *
    from public.technical_visits
    order by organization_id, id
  loop
    perform agrocore_private.sync_technical_visit_integrations(v_visit, null, true);
  end loop;
end;
$$;

comment on table public.technical_visit_integration_links is
  'OE-007.006: links estáveis entre visita e projeções de agenda, proposta e frota.';
comment on table public.technical_visit_integration_events is
  'OE-007.006: outbox append-only de eventos idempotentes de integração da visita.';
