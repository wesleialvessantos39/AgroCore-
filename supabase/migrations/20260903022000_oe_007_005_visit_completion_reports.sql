-- AgroCore — OE-007.005 — Conclusão e relatório de visita/vistoria
-- Hardening residual da OE-007.004: a máquina de estados também é validada no banco.

create table if not exists public.technical_visit_report_versions (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  visit_id uuid not null references public.technical_visits(id) on delete restrict,
  version integer not null check (version >= 1),
  issued_by_user_id uuid not null references auth.users(id) on delete restrict,
  issued_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  unique (visit_id, version)
);

create index if not exists technical_visit_report_versions_org_visit_idx
  on public.technical_visit_report_versions (organization_id, visit_id, version desc);

alter table public.technical_visit_report_versions enable row level security;

drop policy if exists "agrocore_technical_visit_reports_select"
  on public.technical_visit_report_versions;
create policy "agrocore_technical_visit_reports_select"
on public.technical_visit_report_versions
for select
to authenticated
using (
  coalesce(
    agrocore_private.current_organization_role(organization_id)
      in ('owner','company_admin','manager'),
    false
  )
  or (
    agrocore_private.current_organization_role(organization_id) = 'project_designer'
    and exists (
      select 1
      from public.technical_visits v
      where v.id = visit_id
        and v.organization_id = organization_id
        and v.responsible_user_id = (select auth.uid())
    )
  )
);

revoke all on table public.technical_visit_report_versions from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.technical_visit_report_versions from authenticated;
grant select on public.technical_visit_report_versions to authenticated;

create or replace function agrocore_private.validate_technical_visit_report_input(
  p_summary text,
  p_pending_items jsonb,
  p_revision_reason text default null,
  p_requires_revision_reason boolean default false
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if length(btrim(coalesce(p_summary, ''))) < 10
     or length(btrim(coalesce(p_summary, ''))) > 5000 then
    raise exception 'AGROCORE_REPORT_INVALID';
  end if;

  if p_pending_items is null
     or jsonb_typeof(p_pending_items) <> 'array'
     or jsonb_array_length(p_pending_items) > 50 then
    raise exception 'AGROCORE_REPORT_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_pending_items) item
    where jsonb_typeof(item) <> 'object'
       or length(btrim(coalesce(item ->> 'id', ''))) < 1
       or coalesce(item ->> 'category', '') not in (
         'documentation',
         'property_registry',
         'evidence',
         'technical',
         'other'
       )
       or length(btrim(coalesce(item ->> 'description', ''))) < 3
       or length(btrim(coalesce(item ->> 'description', ''))) > 1000
  ) then
    raise exception 'AGROCORE_REPORT_INVALID';
  end if;

  if p_requires_revision_reason
     and (
       length(btrim(coalesce(p_revision_reason, ''))) < 3
       or length(btrim(coalesce(p_revision_reason, ''))) > 500
     ) then
    raise exception 'AGROCORE_REASON_REQUIRED';
  end if;
end;
$$;

revoke all on function agrocore_private.validate_technical_visit_report_input(
  text,jsonb,text,boolean
) from public, anon;
grant execute on function agrocore_private.validate_technical_visit_report_input(
  text,jsonb,text,boolean
) to authenticated;

create or replace function public.agrocore_update_technical_visit(
  p_visit jsonb,
  p_audit jsonb,
  p_expected_version integer
)
returns public.technical_visits
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
  v_actor uuid := (select auth.uid());
  v_current public.technical_visits%rowtype;
  v_result public.technical_visits%rowtype;
  v_new_status text;
  v_now timestamptz := clock_timestamp();
  v_next_payload jsonb;
  v_audit_id uuid;
  v_audit_action text;
  v_audit_payload jsonb;
  v_cancel_reason text;
begin
  begin
    v_org := (p_visit ->> 'organizationId')::uuid;
    v_id := (p_visit ->> 'id')::uuid;
    v_audit_id := (p_audit ->> 'id')::uuid;
  exception when others then
    raise exception 'AGROCORE_INVALID_INPUT';
  end;

  if v_actor is null or not agrocore_private.can_operate_technical_visit(v_org) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || v_id::text, 0));

  select * into v_current
  from public.technical_visits
  where id = v_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'AGROCORE_NOT_FOUND';
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
  end if;

  if v_current.status in ('completed','cancelled') then
    raise exception 'AGROCORE_VISIT_LOCKED';
  end if;

  if coalesce((p_visit ->> 'version')::integer, 0) <> p_expected_version + 1 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if (p_visit ->> 'createdByUserId') is distinct from
       (v_current.payload ->> 'createdByUserId')
     or (p_visit ->> 'createdAt') is distinct from
       (v_current.payload ->> 'createdAt') then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  v_new_status := p_visit ->> 'status';
  if v_new_status not in ('planned','confirmed','in_progress','completed','cancelled') then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if v_new_status = v_current.status then
    if v_current.status = 'in_progress' then
      raise exception 'AGROCORE_VISIT_LOCKED';
    end if;
    v_audit_action := 'updated';
  else
    if v_current.status = 'planned'
       and v_new_status not in ('confirmed','cancelled') then
      raise exception 'AGROCORE_INVALID_TRANSITION';
    elsif v_current.status = 'confirmed'
       and v_new_status not in ('in_progress','cancelled') then
      raise exception 'AGROCORE_INVALID_TRANSITION';
    elsif v_current.status = 'in_progress' and v_new_status = 'completed' then
      raise exception 'AGROCORE_REPORT_REQUIRED';
    elsif v_current.status = 'in_progress' and v_new_status <> 'cancelled' then
      raise exception 'AGROCORE_INVALID_TRANSITION';
    end if;
    v_audit_action := 'status_changed';
  end if;

  if v_new_status = 'in_progress' then
    if v_current.responsible_user_id <> v_actor then
      raise exception 'AGROCORE_RESPONSIBLE_MISMATCH';
    end if;
    if v_current.payload -> 'preparation' is null
       or v_current.payload -> 'preparation' = 'null'::jsonb
       or exists (
         select 1
         from jsonb_array_elements(
           coalesce(v_current.payload #> '{preparation,checklist}', '[]'::jsonb)
         ) item
         where coalesce((item ->> 'required')::boolean, false)
           and not coalesce((item ->> 'completed')::boolean, false)
       ) then
      raise exception 'AGROCORE_PREPARATION_INCOMPLETE';
    end if;
  end if;

  if v_new_status = 'cancelled' then
    v_cancel_reason := btrim(coalesce(p_visit ->> 'cancellationReason', ''));
    if length(v_cancel_reason) < 3 or length(v_cancel_reason) > 500 then
      raise exception 'AGROCORE_REASON_REQUIRED';
    end if;
  end if;

  v_next_payload := p_visit || jsonb_build_object(
    'id', v_id,
    'organizationId', v_org,
    'status', v_new_status,
    'createdByUserId', v_current.payload ->> 'createdByUserId',
    'createdAt', v_current.payload ->> 'createdAt',
    'updatedByUserId', v_actor,
    'updatedAt', v_now,
    'version', p_expected_version + 1,
    'confirmedAt', v_current.payload -> 'confirmedAt',
    'startedAt', v_current.payload -> 'startedAt',
    'completedAt', v_current.payload -> 'completedAt',
    'cancelledAt', v_current.payload -> 'cancelledAt',
    'cancellationReason', v_current.payload -> 'cancellationReason'
  );

  if v_current.status = 'planned' and v_new_status = 'confirmed' then
    v_next_payload := jsonb_set(v_next_payload, '{confirmedAt}', to_jsonb(v_now), true);
  elsif v_current.status = 'confirmed' and v_new_status = 'in_progress' then
    v_next_payload := jsonb_set(v_next_payload, '{startedAt}', to_jsonb(v_now), true);
  elsif v_new_status = 'cancelled' then
    v_next_payload := jsonb_set(v_next_payload, '{cancelledAt}', to_jsonb(v_now), true);
    v_next_payload := jsonb_set(v_next_payload, '{cancellationReason}', to_jsonb(v_cancel_reason), true);
  end if;

  perform agrocore_private.assert_visit_references(v_org, v_next_payload);
  perform agrocore_private.assert_visit_schedule_conflict(v_org, v_id, v_next_payload);

  update public.technical_visits
  set status = v_new_status,
      activity_type = v_next_payload ->> 'activityType',
      client_id = (v_next_payload ->> 'clientId')::uuid,
      property_id = nullif(v_next_payload ->> 'propertyId','')::uuid,
      responsible_user_id = (v_next_payload ->> 'responsibleUserId')::uuid,
      scheduled_for = (v_next_payload ->> 'scheduledFor')::timestamptz,
      version = p_expected_version + 1,
      payload = v_next_payload,
      updated_at = v_now
  where id = v_id
    and organization_id = v_org
  returning * into v_result;

  v_audit_payload := jsonb_build_object(
    'id', v_audit_id,
    'organizationId', v_org,
    'visitId', v_id,
    'action', v_audit_action,
    'actorUserId', v_actor,
    'at', v_now,
    'version', p_expected_version + 1,
    'fromStatus', v_current.status,
    'toStatus', v_new_status,
    'reason', nullif(btrim(coalesce(p_audit ->> 'reason','')), ''),
    'changedFields',
      case
        when jsonb_typeof(p_audit -> 'changedFields') = 'array'
          then p_audit -> 'changedFields'
        else jsonb_build_array('status')
      end
  );

  insert into public.technical_visit_audit (
    id, organization_id, visit_id, version, action,
    actor_user_id, occurred_at, payload
  ) values (
    v_audit_id, v_org, v_id, p_expected_version + 1, v_audit_action,
    v_actor, v_now, v_audit_payload
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_update_technical_visit(
  jsonb,jsonb,integer
) from public, anon;
grant execute on function public.agrocore_update_technical_visit(
  jsonb,jsonb,integer
) to authenticated;

create or replace function public.agrocore_complete_technical_visit(
  p_organization_id uuid,
  p_visit_id uuid,
  p_expected_version integer,
  p_summary text,
  p_pending_items jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current public.technical_visits%rowtype;
  v_form public.technical_visit_field_forms%rowtype;
  v_evidence jsonb;
  v_now timestamptz := clock_timestamp();
  v_visit_payload jsonb;
  v_snapshot jsonb;
  v_report_id uuid := gen_random_uuid();
  v_audit_id uuid := gen_random_uuid();
  v_report_payload jsonb;
begin
  if v_actor is null
     or not agrocore_private.can_operate_technical_visit(p_organization_id) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  perform agrocore_private.validate_technical_visit_report_input(
    p_summary, p_pending_items, null, false
  );

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_visit_id::text, 0)
  );

  select * into v_current
  from public.technical_visits
  where id = p_visit_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'AGROCORE_NOT_FOUND';
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
  end if;

  if v_current.status <> 'in_progress' then
    raise exception 'AGROCORE_INVALID_TRANSITION';
  end if;

  if v_current.responsible_user_id <> v_actor then
    raise exception 'AGROCORE_RESPONSIBLE_MISMATCH';
  end if;

  select * into v_form
  from public.technical_visit_field_forms f
  where f.organization_id = p_organization_id
    and f.visit_id = p_visit_id
    and f.status = 'submitted'
  for share;

  if not found then
    raise exception 'AGROCORE_FIELD_FORM_INCOMPLETE';
  end if;

  if exists (
    select 1
    from public.technical_visit_report_versions r
    where r.organization_id = p_organization_id
      and r.visit_id = p_visit_id
  ) then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
  end if;

  select jsonb_build_object(
    'evidenceId', e.id,
    'version', e.version,
    'propertyId', e.property_id,
    'location', e.location,
    'photoCount', (
      select count(*)::integer
      from public.field_evidence_photos p
      where p.organization_id = e.organization_id
        and p.evidence_id = e.id
    )
  )
  into v_evidence
  from public.field_evidence_sets e
  where e.organization_id = p_organization_id
    and e.visit_id = p_visit_id
  order by e.updated_at desc, e.id
  limit 1;

  v_visit_payload := v_current.payload || jsonb_build_object(
    'status', 'completed',
    'updatedByUserId', v_actor,
    'updatedAt', v_now,
    'completedAt', v_now,
    'version', p_expected_version + 1
  );

  update public.technical_visits
  set status = 'completed',
      version = p_expected_version + 1,
      payload = v_visit_payload,
      updated_at = v_now
  where id = p_visit_id
    and organization_id = p_organization_id;

  insert into public.technical_visit_audit (
    id, organization_id, visit_id, version, action,
    actor_user_id, occurred_at, payload
  ) values (
    v_audit_id,
    p_organization_id,
    p_visit_id,
    p_expected_version + 1,
    'status_changed',
    v_actor,
    v_now,
    jsonb_build_object(
      'id', v_audit_id,
      'organizationId', p_organization_id,
      'visitId', p_visit_id,
      'action', 'status_changed',
      'actorUserId', v_actor,
      'at', v_now,
      'version', p_expected_version + 1,
      'fromStatus', 'in_progress',
      'toStatus', 'completed',
      'reason', 'Conclusão com relatório final',
      'changedFields', jsonb_build_array('status','completedAt')
    )
  );

  v_snapshot := jsonb_build_object(
    'visit', v_visit_payload,
    'fieldForm', jsonb_build_object(
      'id', v_form.id,
      'version', v_form.version,
      'submittedAt', v_form.submitted_at,
      'payload', v_form.payload
    ),
    'fieldEvidence', v_evidence
  );

  v_report_payload := jsonb_build_object(
    'id', v_report_id,
    'organizationId', p_organization_id,
    'visitId', p_visit_id,
    'version', 1,
    'summary', btrim(p_summary),
    'pendingItems', p_pending_items,
    'snapshot', v_snapshot,
    'issuedByUserId', v_actor,
    'issuedAt', v_now,
    'revisionReason', null
  );

  insert into public.technical_visit_report_versions (
    id, organization_id, visit_id, version,
    issued_by_user_id, issued_at, payload
  ) values (
    v_report_id, p_organization_id, p_visit_id, 1,
    v_actor, v_now, v_report_payload
  );

  return jsonb_build_object(
    'visit', v_visit_payload,
    'report', v_report_payload
  );
end;
$$;

revoke all on function public.agrocore_complete_technical_visit(
  uuid,uuid,integer,text,jsonb
) from public, anon;
grant execute on function public.agrocore_complete_technical_visit(
  uuid,uuid,integer,text,jsonb
) to authenticated;

create or replace function public.agrocore_create_technical_visit_report_revision(
  p_organization_id uuid,
  p_visit_id uuid,
  p_expected_report_version integer,
  p_summary text,
  p_pending_items jsonb,
  p_revision_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text := agrocore_private.current_organization_role(p_organization_id);
  v_visit public.technical_visits%rowtype;
  v_current_report public.technical_visit_report_versions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_next_id uuid := gen_random_uuid();
  v_next_version integer;
  v_payload jsonb;
begin
  if v_actor is null then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  perform agrocore_private.validate_technical_visit_report_input(
    p_summary, p_pending_items, p_revision_reason, true
  );

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_visit_id::text, 0)
  );

  select * into v_visit
  from public.technical_visits
  where id = p_visit_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'AGROCORE_NOT_FOUND';
  end if;

  if v_visit.status <> 'completed' then
    raise exception 'AGROCORE_REPORT_LOCKED';
  end if;

  if not (
    v_role in ('owner','company_admin','manager')
    or (
      v_role = 'project_designer'
      and v_visit.responsible_user_id = v_actor
    )
  ) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  select * into v_current_report
  from public.technical_visit_report_versions
  where organization_id = p_organization_id
    and visit_id = p_visit_id
  order by version desc
  limit 1;

  if not found then
    raise exception 'AGROCORE_REPORT_NOT_FOUND';
  end if;

  if v_current_report.version <> p_expected_report_version then
    raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
  end if;

  v_next_version := v_current_report.version + 1;

  v_payload := jsonb_build_object(
    'id', v_next_id,
    'organizationId', p_organization_id,
    'visitId', p_visit_id,
    'version', v_next_version,
    'summary', btrim(p_summary),
    'pendingItems', p_pending_items,
    'snapshot', v_current_report.payload -> 'snapshot',
    'issuedByUserId', v_actor,
    'issuedAt', v_now,
    'revisionReason', btrim(p_revision_reason)
  );

  insert into public.technical_visit_report_versions (
    id, organization_id, visit_id, version,
    issued_by_user_id, issued_at, payload
  ) values (
    v_next_id, p_organization_id, p_visit_id, v_next_version,
    v_actor, v_now, v_payload
  );

  return v_payload;
end;
$$;

revoke all on function public.agrocore_create_technical_visit_report_revision(
  uuid,uuid,integer,text,jsonb,text
) from public, anon;
grant execute on function public.agrocore_create_technical_visit_report_revision(
  uuid,uuid,integer,text,jsonb,text
) to authenticated;

comment on table public.technical_visit_report_versions is
  'Versões imutáveis do relatório final de visita/vistoria — OE-007.005.';
comment on function public.agrocore_complete_technical_visit(
  uuid,uuid,integer,text,jsonb
) is
  'Conclui atomicamente a visita em execução e emite a versão 1 do relatório final.';
comment on function public.agrocore_create_technical_visit_report_revision(
  uuid,uuid,integer,text,jsonb,text
) is
  'Cria nova versão imutável do relatório, preservando o snapshot técnico original.';
