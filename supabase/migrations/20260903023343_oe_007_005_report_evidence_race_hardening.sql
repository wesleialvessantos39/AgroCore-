-- AgroCore — OE-007.005 R3 — snapshot resiliente da evidência canônica.
-- A evidência pertence ao imóvel. A conclusão não depende de o painel ter
-- terminado de criar field_evidence_links antes do clique de concluir.

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
  v_pending_items jsonb;
begin
  if v_actor is null
     or p_expected_version is null
     or p_expected_version < 1
     or not agrocore_private.can_operate_technical_visit(p_organization_id) then
    if v_actor is null
       or not agrocore_private.can_operate_technical_visit(p_organization_id) then
      raise exception 'AGROCORE_FORBIDDEN';
    end if;
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform agrocore_private.validate_technical_visit_report_input(
    p_summary, p_pending_items, null, false
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', btrim(item ->> 'id'),
        'category', item ->> 'category',
        'description', btrim(item ->> 'description')
      )
      order by ordinal
    ),
    '[]'::jsonb
  )
  into v_pending_items
  from jsonb_array_elements(p_pending_items) with ordinality pending(item, ordinal);

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

  -- OE-007.004 definiu o imóvel como autoridade da evidência. Portanto o
  -- snapshot é resolvido por property_id e não depende da ordem de montagem
  -- do painel React que cria o vínculo semântico da visita.
  if v_current.property_id is not null then
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
      ),
      'linkedToVisit', exists (
        select 1
        from public.field_evidence_links l
        where l.organization_id = e.organization_id
          and l.evidence_id = e.id
          and l.entity_type = 'visit'
          and l.entity_id = p_visit_id::text
      )
    )
    into v_evidence
    from public.field_evidence_sets e
    where e.organization_id = p_organization_id
      and e.property_id = v_current.property_id
    limit 1;
  end if;

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
    'pendingItems', v_pending_items,
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

comment on function public.agrocore_complete_technical_visit(
  uuid,uuid,integer,text,jsonb
) is
  'OE-007.005 R3: conclusão atômica com snapshot resiliente da evidência canônica do imóvel, independente da corrida de criação do vínculo da visita.';
