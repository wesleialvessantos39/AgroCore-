-- AgroCore — OE-007.005 R2 — integridade da transição autoritativa.
-- Impede que uma chamada direta ao RPC combine mudança de estado com alteração
-- silenciosa de dados de planejamento e passa a calcular changedFields no servidor.

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
  v_reason text;
  v_changed_fields jsonb := '[]'::jsonb;
  v_is_transition boolean;
begin
  begin
    v_org := (p_visit ->> 'organizationId')::uuid;
    v_id := (p_visit ->> 'id')::uuid;
    v_audit_id := (p_audit ->> 'id')::uuid;
  exception when others then
    raise exception 'AGROCORE_INVALID_INPUT';
  end;

  if v_actor is null
     or p_expected_version is null
     or p_expected_version < 1
     or not agrocore_private.can_operate_technical_visit(v_org) then
    if v_actor is null or not agrocore_private.can_operate_technical_visit(v_org) then
      raise exception 'AGROCORE_FORBIDDEN';
    end if;
    raise exception 'AGROCORE_INVALID_INPUT';
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

  v_is_transition := v_new_status <> v_current.status;
  v_reason := nullif(btrim(coalesce(p_audit ->> 'reason','')), '');

  if v_is_transition then
    if (p_visit ->> 'activityType') is distinct from (v_current.payload ->> 'activityType')
       or (p_visit ->> 'clientId') is distinct from (v_current.payload ->> 'clientId')
       or (p_visit ->> 'propertyId') is distinct from (v_current.payload ->> 'propertyId')
       or (p_visit ->> 'proposalId') is distinct from (v_current.payload ->> 'proposalId')
       or (p_visit ->> 'appraisalId') is distinct from (v_current.payload ->> 'appraisalId')
       or (p_visit ->> 'responsibleUserId') is distinct from (v_current.payload ->> 'responsibleUserId')
       or (p_visit ->> 'scheduledFor') is distinct from (v_current.payload ->> 'scheduledFor')
       or (p_visit -> 'preparation') is distinct from (v_current.payload -> 'preparation')
       or (p_visit ->> 'purpose') is distinct from (v_current.payload ->> 'purpose') then
      raise exception 'AGROCORE_INVALID_INPUT';
    end if;

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
    v_changed_fields := jsonb_build_array('status');
  else
    if v_current.status = 'in_progress' then
      raise exception 'AGROCORE_VISIT_LOCKED';
    end if;

    if v_reason is null or length(v_reason) < 3 or length(v_reason) > 500 then
      raise exception 'AGROCORE_REASON_REQUIRED';
    end if;

    v_audit_action := 'updated';

    if (p_visit ->> 'activityType') is distinct from (v_current.payload ->> 'activityType') then
      v_changed_fields := v_changed_fields || jsonb_build_array('activityType');
    end if;
    if (p_visit ->> 'clientId') is distinct from (v_current.payload ->> 'clientId') then
      v_changed_fields := v_changed_fields || jsonb_build_array('clientId');
    end if;
    if (p_visit ->> 'propertyId') is distinct from (v_current.payload ->> 'propertyId') then
      v_changed_fields := v_changed_fields || jsonb_build_array('propertyId');
    end if;
    if (p_visit ->> 'proposalId') is distinct from (v_current.payload ->> 'proposalId') then
      v_changed_fields := v_changed_fields || jsonb_build_array('proposalId');
    end if;
    if (p_visit ->> 'appraisalId') is distinct from (v_current.payload ->> 'appraisalId') then
      v_changed_fields := v_changed_fields || jsonb_build_array('appraisalId');
    end if;
    if (p_visit ->> 'responsibleUserId') is distinct from (v_current.payload ->> 'responsibleUserId') then
      v_changed_fields := v_changed_fields || jsonb_build_array('responsibleUserId');
    end if;
    if (p_visit ->> 'scheduledFor') is distinct from (v_current.payload ->> 'scheduledFor') then
      v_changed_fields := v_changed_fields || jsonb_build_array('scheduledFor');
    end if;
    if (p_visit -> 'preparation') is distinct from (v_current.payload -> 'preparation') then
      v_changed_fields := v_changed_fields || jsonb_build_array('preparation');
    end if;
    if (p_visit ->> 'purpose') is distinct from (v_current.payload ->> 'purpose') then
      v_changed_fields := v_changed_fields || jsonb_build_array('purpose');
    end if;

    if jsonb_array_length(v_changed_fields) = 0 then
      raise exception 'AGROCORE_INVALID_INPUT';
    end if;
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
    v_changed_fields := v_changed_fields || jsonb_build_array('confirmedAt');
  elsif v_current.status = 'confirmed' and v_new_status = 'in_progress' then
    v_next_payload := jsonb_set(v_next_payload, '{startedAt}', to_jsonb(v_now), true);
    v_changed_fields := v_changed_fields || jsonb_build_array('startedAt');
  elsif v_new_status = 'cancelled' then
    v_next_payload := jsonb_set(v_next_payload, '{cancelledAt}', to_jsonb(v_now), true);
    v_next_payload := jsonb_set(v_next_payload, '{cancellationReason}', to_jsonb(v_cancel_reason), true);
    v_changed_fields := v_changed_fields
      || jsonb_build_array('cancelledAt')
      || jsonb_build_array('cancellationReason');
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
    'reason',
      case
        when v_new_status = 'cancelled' then v_cancel_reason
        else v_reason
      end,
    'changedFields', v_changed_fields
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

comment on function public.agrocore_update_technical_visit(jsonb,jsonb,integer) is
  'OE-007.005 R2: atualização autoritativa com transições isoladas de alterações de planejamento e auditoria calculada no servidor.';
