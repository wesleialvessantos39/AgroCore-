-- AgroCore — OE-007.003 R1: resiliência do salvamento progressivo.
-- Rascunhos aceitam campos ainda em edição, mantendo limites e tipos seguros.
-- O envio final continua submetido à validação completa da migration principal.

create or replace function
  agrocore_private.validate_technical_visit_field_form_draft(
    p_payload jsonb
  )
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sections jsonb;
  v_section jsonb;
  v_item jsonb;
  v_options jsonb;
  v_answer jsonb;
  v_section_id text;
  v_item_id text;
  v_type text;
  v_total_items integer := 0;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 524288 then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) key_name
    where key_name <> 'sections'
  ) then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;

  v_sections := p_payload -> 'sections';
  if v_sections is null
     or jsonb_typeof(v_sections) <> 'array'
     or jsonb_array_length(v_sections) > 20 then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_sections) section_row
    where jsonb_typeof(section_row) <> 'object'
  ) then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(v_sections)
  ) <> (
    select count(distinct section_row ->> 'id')
    from jsonb_array_elements(v_sections) section_row
  ) then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;

  for v_section in
    select value
    from jsonb_array_elements(v_sections)
  loop
    if exists (
      select 1
      from jsonb_object_keys(v_section) key_name
      where key_name not in ('id','title','description','order','items')
    ) then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;

    v_section_id := coalesce(v_section ->> 'id','');
    if v_section_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
       or jsonb_typeof(v_section -> 'title') is distinct from 'string'
       or length(v_section ->> 'title') > 120
       or (
         v_section ? 'description'
         and jsonb_typeof(v_section -> 'description') not in ('string','null')
       )
       or length(coalesce(v_section ->> 'description','')) > 600
       or jsonb_typeof(v_section -> 'order') is distinct from 'number'
       or (v_section ->> 'order') !~ '^[1-9][0-9]*$'
       or jsonb_typeof(v_section -> 'items') is distinct from 'array'
       or jsonb_array_length(v_section -> 'items') > 50 then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;

    v_total_items := v_total_items + jsonb_array_length(v_section -> 'items');
    if v_total_items > 200 then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;

    for v_item in
      select value
      from jsonb_array_elements(v_section -> 'items')
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      if exists (
        select 1
        from jsonb_object_keys(v_item) key_name
        where key_name not in
          ('id','label','type','required','options','answer','observation')
      ) then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      v_item_id := coalesce(v_item ->> 'id','');
      v_type := coalesce(v_item ->> 'type','');

      if v_item_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
         or jsonb_typeof(v_item -> 'label') is distinct from 'string'
         or length(v_item ->> 'label') > 180
         or v_type not in (
           'short_text','long_text','integer','decimal','boolean',
           'date','time','single_choice','multiple_choice'
         )
         or jsonb_typeof(v_item -> 'required') is distinct from 'boolean'
         or (
           v_item ? 'observation'
           and jsonb_typeof(v_item -> 'observation') not in ('string','null')
         )
         or length(coalesce(v_item ->> 'observation','')) > 1000
         or jsonb_typeof(v_item -> 'options') is distinct from 'array'
         or jsonb_array_length(v_item -> 'options') > 30 then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      v_options := v_item -> 'options';
      if exists (
        select 1
        from jsonb_array_elements(v_options) option_value
        where jsonb_typeof(option_value) <> 'string'
           or length(option_value #>> '{}') > 120
      ) then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      v_answer := coalesce(v_item -> 'answer', 'null'::jsonb);

      if jsonb_typeof(v_answer) <> 'null' then
        if v_type in ('short_text','long_text','date','time','single_choice')
           and jsonb_typeof(v_answer) <> 'string' then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        elsif v_type in ('integer','decimal')
           and jsonb_typeof(v_answer) <> 'number' then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        elsif v_type = 'integer'
           and (v_answer #>> '{}') !~ '^-?[0-9]+$' then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        elsif v_type = 'boolean'
           and jsonb_typeof(v_answer) <> 'boolean' then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        elsif v_type = 'multiple_choice'
           and jsonb_typeof(v_answer) <> 'array' then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        end if;

        if v_type = 'short_text'
           and length(v_answer #>> '{}') > 500 then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        end if;
        if v_type = 'long_text'
           and length(v_answer #>> '{}') > 4000 then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        end if;
        if v_type in ('date','time','single_choice')
           and length(v_answer #>> '{}') > 120 then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        end if;

        if v_type = 'multiple_choice' then
          if jsonb_array_length(v_answer) > 30 then
            raise exception 'AGROCORE_FIELD_FORM_INVALID';
          end if;
          if exists (
            select 1
            from jsonb_array_elements(v_answer) answer_value
            where jsonb_typeof(answer_value) <> 'string'
               or length(answer_value #>> '{}') > 120
          ) then
            raise exception 'AGROCORE_FIELD_FORM_INVALID';
          end if;
        end if;
      end if;
    end loop;
  end loop;

  if (
    select count(*)
    from (
      select item_value ->> 'id' item_id
      from jsonb_array_elements(v_sections) section_value,
           jsonb_array_elements(section_value -> 'items') item_value
    ) all_items
  ) <> (
    select count(distinct item_id)
    from (
      select item_value ->> 'id' item_id
      from jsonb_array_elements(v_sections) section_value,
           jsonb_array_elements(section_value -> 'items') item_value
    ) all_items
  ) then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;
end;
$$;

revoke all on function
  agrocore_private.validate_technical_visit_field_form_draft(jsonb)
  from public, anon, authenticated;

create or replace function public.agrocore_save_technical_visit_field_form(
  p_organization_id uuid,
  p_visit_id uuid,
  p_payload jsonb,
  p_expected_version integer,
  p_submit boolean default false
)
returns public.technical_visit_field_forms
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text := agrocore_private.current_organization_role(p_organization_id);
  v_visit public.technical_visits%rowtype;
  v_current public.technical_visit_field_forms%rowtype;
  v_result public.technical_visit_field_forms%rowtype;
  v_now timestamptz := clock_timestamp();
  v_next_version integer;
  v_action text;
begin
  if v_actor is null
     or v_role not in ('owner','company_admin','manager','project_designer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;

  select * into v_visit
  from public.technical_visits
  where id = p_visit_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'AGROCORE_NOT_FOUND';
  end if;

  if v_visit.responsible_user_id <> v_actor then
    raise exception 'AGROCORE_RESPONSIBLE_MISMATCH';
  end if;

  if coalesce(p_submit,false) then
    if v_visit.status <> 'in_progress' then
      raise exception 'AGROCORE_VISIT_NOT_READY';
    end if;
    perform agrocore_private.validate_technical_visit_field_form(
      p_payload,
      true
    );
  else
    if v_visit.status not in ('confirmed','in_progress') then
      raise exception 'AGROCORE_VISIT_NOT_READY';
    end if;
    perform agrocore_private.validate_technical_visit_field_form_draft(
      p_payload
    );
  end if;

  select * into v_current
  from public.technical_visit_field_forms
  where organization_id = p_organization_id
    and visit_id = p_visit_id
  for update;

  if found then
    if v_current.status = 'submitted' then
      raise exception 'AGROCORE_FIELD_FORM_LOCKED';
    end if;
    if v_current.version <> p_expected_version then
      raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
    end if;
    v_next_version := v_current.version + 1;

    update public.technical_visit_field_forms
    set status =
          case when coalesce(p_submit,false) then 'submitted' else 'draft' end,
        version = v_next_version,
        payload = p_payload,
        updated_by_user_id = v_actor,
        updated_at = v_now,
        submitted_by_user_id =
          case when coalesce(p_submit,false) then v_actor else null end,
        submitted_at =
          case when coalesce(p_submit,false) then v_now else null end
    where id = v_current.id
    returning * into v_result;
  else
    if p_expected_version <> 0 then
      raise exception 'AGROCORE_CONCURRENCY_CONFLICT';
    end if;
    v_next_version := 1;

    insert into public.technical_visit_field_forms (
      organization_id,
      visit_id,
      status,
      version,
      payload,
      created_by_user_id,
      created_at,
      updated_by_user_id,
      updated_at,
      submitted_by_user_id,
      submitted_at
    ) values (
      p_organization_id,
      p_visit_id,
      case when coalesce(p_submit,false) then 'submitted' else 'draft' end,
      v_next_version,
      p_payload,
      v_actor,
      v_now,
      v_actor,
      v_now,
      case when coalesce(p_submit,false) then v_actor else null end,
      case when coalesce(p_submit,false) then v_now else null end
    )
    returning * into v_result;
  end if;

  v_action :=
    case when coalesce(p_submit,false) then 'submitted' else 'draft_saved' end;

  insert into public.technical_visit_field_form_revisions (
    organization_id,
    field_form_id,
    visit_id,
    version,
    action,
    actor_user_id,
    occurred_at,
    payload
  ) values (
    p_organization_id,
    v_result.id,
    p_visit_id,
    v_result.version,
    v_action,
    v_actor,
    v_now,
    p_payload
  );

  return v_result;
end;
$$;

revoke all on function public.agrocore_save_technical_visit_field_form(
  uuid,uuid,jsonb,integer,boolean
) from public, anon;
grant execute on function public.agrocore_save_technical_visit_field_form(
  uuid,uuid,jsonb,integer,boolean
) to authenticated;
