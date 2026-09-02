-- AgroCore — OE-007.003: Formulário de campo.
-- Coleta móvel tipada, progressiva, versionada e protegida contra perda.

create table if not exists public.technical_visit_field_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  visit_id uuid not null references public.technical_visits(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','submitted')),
  version integer not null check (version >= 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null,
  submitted_by_user_id uuid references auth.users(id) on delete restrict,
  submitted_at timestamptz,
  unique (organization_id, visit_id)
);

create index if not exists technical_visit_field_forms_org_status_idx
  on public.technical_visit_field_forms (organization_id, status, updated_at desc);

create table if not exists public.technical_visit_field_form_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  field_form_id uuid not null references public.technical_visit_field_forms(id) on delete restrict,
  visit_id uuid not null references public.technical_visits(id) on delete restrict,
  version integer not null check (version >= 1),
  action text not null check (action in ('draft_saved','submitted')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  unique (field_form_id, version)
);

create index if not exists technical_visit_field_form_revisions_org_visit_idx
  on public.technical_visit_field_form_revisions
  (organization_id, visit_id, version);

alter table public.technical_visit_field_forms enable row level security;
alter table public.technical_visit_field_form_revisions enable row level security;

-- A própria visita pode ser consultada por quem possui visão operacional de campo.
drop policy if exists "agrocore_technical_visits_select" on public.technical_visits;
create policy "agrocore_technical_visits_select"
on public.technical_visits
for select
to authenticated
using (
  coalesce(
    agrocore_private.current_organization_role(organization_id)
      in ('owner','company_admin','manager','project_designer','capturer'),
    false
  )
);

drop policy if exists "agrocore_technical_visit_audit_select" on public.technical_visit_audit;
create policy "agrocore_technical_visit_audit_select"
on public.technical_visit_audit
for select
to authenticated
using (
  coalesce(
    agrocore_private.current_organization_role(organization_id)
      in ('owner','company_admin','manager','project_designer','capturer'),
    false
  )
);

-- O conteúdo técnico do formulário fica restrito aos perfis capazes de executar
-- a operação de campo; o responsável efetivo é validado nas mutações.
drop policy if exists "agrocore_technical_visit_field_forms_select"
  on public.technical_visit_field_forms;
create policy "agrocore_technical_visit_field_forms_select"
on public.technical_visit_field_forms
for select
to authenticated
using (
  coalesce(
    agrocore_private.current_organization_role(organization_id)
      in ('owner','company_admin','manager','project_designer'),
    false
  )
);

drop policy if exists "agrocore_technical_visit_field_form_revisions_select"
  on public.technical_visit_field_form_revisions;
create policy "agrocore_technical_visit_field_form_revisions_select"
on public.technical_visit_field_form_revisions
for select
to authenticated
using (
  coalesce(
    agrocore_private.current_organization_role(organization_id)
      in ('owner','company_admin','manager','project_designer'),
    false
  )
);

revoke all on table public.technical_visit_field_forms from public, anon;
revoke all on table public.technical_visit_field_form_revisions from public, anon;

revoke insert, update, delete, truncate, references, trigger
  on table public.technical_visit_field_forms from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.technical_visit_field_form_revisions from authenticated;

grant select on table public.technical_visit_field_forms to authenticated;
grant select on table public.technical_visit_field_form_revisions to authenticated;

create or replace function agrocore_private.validate_technical_visit_field_form(
  p_payload jsonb,
  p_for_submission boolean
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
  v_title text;
  v_label text;
  v_type text;
  v_observation text;
  v_total_items integer := 0;
  v_section_count integer;
  v_item_count integer;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 524288 then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) as key_name
    where key_name <> 'sections'
  ) then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;

  v_sections := p_payload -> 'sections';
  if v_sections is null or jsonb_typeof(v_sections) <> 'array' then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;

  v_section_count := jsonb_array_length(v_sections);
  if v_section_count > 20 then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;
  if p_for_submission and v_section_count = 0 then
    raise exception 'AGROCORE_FIELD_FORM_INCOMPLETE';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(v_sections) section_row
    where jsonb_typeof(section_row) <> 'object'
  ) > 0 then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(v_sections) section_row
  ) <> (
    select count(distinct section_row ->> 'id')
    from jsonb_array_elements(v_sections) section_row
  ) then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;

  for v_section in
    select value from jsonb_array_elements(v_sections)
  loop
    if exists (
      select 1
      from jsonb_object_keys(v_section) as key_name
      where key_name not in ('id','title','description','order','items')
    ) then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;

    v_section_id := coalesce(v_section ->> 'id','');
    if v_section_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$' then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;

    if jsonb_typeof(v_section -> 'title') is distinct from 'string' then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;
    v_title := btrim(v_section ->> 'title');
    if length(v_title) > 120 then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;
    if p_for_submission and length(v_title) = 0 then
      raise exception 'AGROCORE_FIELD_FORM_INCOMPLETE';
    end if;

    if v_section ? 'description'
       and jsonb_typeof(v_section -> 'description') not in ('string','null') then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;
    if length(coalesce(v_section ->> 'description','')) > 600 then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;

    if jsonb_typeof(v_section -> 'order') is distinct from 'number'
       or (v_section ->> 'order') !~ '^[1-9][0-9]*$' then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;

    if jsonb_typeof(v_section -> 'items') is distinct from 'array' then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;

    v_item_count := jsonb_array_length(v_section -> 'items');
    if v_item_count > 50 then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;
    if p_for_submission and v_item_count = 0 then
      raise exception 'AGROCORE_FIELD_FORM_INCOMPLETE';
    end if;
    v_total_items := v_total_items + v_item_count;
    if v_total_items > 200 then
      raise exception 'AGROCORE_FIELD_FORM_INVALID';
    end if;

    for v_item in
      select value from jsonb_array_elements(v_section -> 'items')
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;
      if exists (
        select 1
        from jsonb_object_keys(v_item) as key_name
        where key_name not in
          ('id','label','type','required','options','answer','observation')
      ) then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      v_item_id := coalesce(v_item ->> 'id','');
      if v_item_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$' then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      if jsonb_typeof(v_item -> 'label') is distinct from 'string' then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;
      v_label := btrim(v_item ->> 'label');
      if length(v_label) > 180 then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;
      if p_for_submission and length(v_label) = 0 then
        raise exception 'AGROCORE_FIELD_FORM_INCOMPLETE';
      end if;

      v_type := coalesce(v_item ->> 'type','');
      if v_type not in (
        'short_text','long_text','integer','decimal','boolean',
        'date','time','single_choice','multiple_choice'
      ) then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      if jsonb_typeof(v_item -> 'required') is distinct from 'boolean' then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      v_options := v_item -> 'options';
      if v_options is null or jsonb_typeof(v_options) <> 'array'
         or jsonb_array_length(v_options) > 30 then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      if exists (
        select 1
        from jsonb_array_elements(v_options) option_value
        where jsonb_typeof(option_value) <> 'string'
          or length(btrim(option_value #>> '{}')) = 0
          or length(btrim(option_value #>> '{}')) > 120
      ) then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      if (
        select count(*) from jsonb_array_elements(v_options)
      ) <> (
        select count(distinct btrim(option_value #>> '{}'))
        from jsonb_array_elements(v_options) option_value
      ) then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      if v_type in ('single_choice','multiple_choice')
         and p_for_submission
         and jsonb_array_length(v_options) < 2 then
        raise exception 'AGROCORE_FIELD_FORM_INCOMPLETE';
      end if;

      if v_item ? 'observation'
         and jsonb_typeof(v_item -> 'observation') not in ('string','null') then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;
      v_observation := coalesce(v_item ->> 'observation','');
      if length(v_observation) > 1000 then
        raise exception 'AGROCORE_FIELD_FORM_INVALID';
      end if;

      v_answer := v_item -> 'answer';
      if v_answer is null then
        v_answer := 'null'::jsonb;
      end if;

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

        if v_type = 'short_text' and length(v_answer #>> '{}') > 500 then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        end if;
        if v_type = 'long_text' and length(v_answer #>> '{}') > 4000 then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        end if;
        if v_type = 'date'
           and (v_answer #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        end if;
        if v_type = 'time'
           and (v_answer #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        end if;

        if v_type = 'single_choice'
           and not exists (
             select 1
             from jsonb_array_elements_text(v_options) option_text
             where option_text = (v_answer #>> '{}')
           ) then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        end if;

        if v_type = 'multiple_choice' and exists (
          select 1
          from jsonb_array_elements(v_answer) answer_value
          where jsonb_typeof(answer_value) <> 'string'
             or not exists (
               select 1
               from jsonb_array_elements_text(v_options) option_text
               where option_text = (answer_value #>> '{}')
             )
        ) then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        end if;

        if v_type = 'multiple_choice'
           and (
             select count(*)
             from jsonb_array_elements_text(v_answer)
           ) <> (
             select count(distinct answer_text)
             from jsonb_array_elements_text(v_answer) answer_text
           ) then
          raise exception 'AGROCORE_FIELD_FORM_INVALID';
        end if;
      end if;

      if p_for_submission and coalesce((v_item ->> 'required')::boolean,false) then
        if jsonb_typeof(v_answer) = 'null' then
          raise exception 'AGROCORE_FIELD_FORM_INCOMPLETE';
        end if;
        if jsonb_typeof(v_answer) = 'string'
           and length(btrim(v_answer #>> '{}')) = 0 then
          raise exception 'AGROCORE_FIELD_FORM_INCOMPLETE';
        end if;
        if jsonb_typeof(v_answer) = 'array'
           and jsonb_array_length(v_answer) = 0 then
          raise exception 'AGROCORE_FIELD_FORM_INCOMPLETE';
        end if;
      end if;
    end loop;
  end loop;

  if p_for_submission and v_total_items = 0 then
    raise exception 'AGROCORE_FIELD_FORM_INCOMPLETE';
  end if;

  if (
    select count(*)
    from (
      select item_value ->> 'id' as item_id
      from jsonb_array_elements(v_sections) section_value,
           jsonb_array_elements(section_value -> 'items') item_value
    ) all_items
  ) <> (
    select count(distinct item_id)
    from (
      select item_value ->> 'id' as item_id
      from jsonb_array_elements(v_sections) section_value,
           jsonb_array_elements(section_value -> 'items') item_value
    ) all_items
  ) then
    raise exception 'AGROCORE_FIELD_FORM_INVALID';
  end if;
end;
$$;

revoke all on function
  agrocore_private.validate_technical_visit_field_form(jsonb,boolean)
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
  elsif v_visit.status not in ('confirmed','in_progress') then
    raise exception 'AGROCORE_VISIT_NOT_READY';
  end if;

  perform agrocore_private.validate_technical_visit_field_form(
    p_payload,
    coalesce(p_submit,false)
  );

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
    set status = case when coalesce(p_submit,false) then 'submitted' else 'draft' end,
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

  v_action := case when coalesce(p_submit,false) then 'submitted' else 'draft_saved' end;

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

create or replace function
  agrocore_private.enforce_technical_visit_field_form_before_completion()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and not exists (
       select 1
       from public.technical_visit_field_forms field_form
       where field_form.organization_id = new.organization_id
         and field_form.visit_id = new.id
         and field_form.status = 'submitted'
     ) then
    raise exception 'AGROCORE_FIELD_FORM_INCOMPLETE';
  end if;
  return new;
end;
$$;

revoke all on function
  agrocore_private.enforce_technical_visit_field_form_before_completion()
  from public, anon, authenticated;

drop trigger if exists agrocore_require_field_form_before_completion
  on public.technical_visits;
create trigger agrocore_require_field_form_before_completion
before update of status on public.technical_visits
for each row
execute function
  agrocore_private.enforce_technical_visit_field_form_before_completion();

comment on table public.technical_visit_field_forms
is 'Formulário de campo versionado da OE-007.003; um por visita.';
comment on table public.technical_visit_field_form_revisions
is 'Histórico append-only de salvamentos e envio do formulário de campo.';
