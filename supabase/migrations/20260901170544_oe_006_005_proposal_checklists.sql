-- OE-006.005 — modelos e checklists documentais por proposta.
-- Escritas diretas permanecem fechadas; configuração, aplicação e decisões
-- passam por funções transacionais com identidade derivada da sessão.

create table if not exists public.proposal_checklist_template_versions (
  id uuid primary key,
  logical_template_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(btrim(name)) between 3 and 120),
  proposal_type text not null check (
    proposal_type in ('all', 'credit', 'appraisal', 'technical_project', 'environmental_regularization')
  ),
  proposal_category text not null check (
    proposal_category in (
      'all', 'custeio', 'investimento', 'comercializacao',
      'industrializacao', 'servico_tecnico', 'outros'
    )
  ),
  status text not null check (status in ('active', 'archived')),
  is_current boolean not null,
  version_number integer not null check (version_number > 0),
  predecessor_template_version_id uuid
    references public.proposal_checklist_template_versions(id) on delete restrict,
  change_reason text not null check (length(btrim(change_reason)) between 3 and 300),
  created_by_user_id uuid not null,
  created_by_display_name text not null check (
    length(btrim(created_by_display_name)) between 3 and 120
  ),
  created_at timestamptz not null,
  constraint proposal_checklist_template_lineage_valid check (
    (version_number = 1 and predecessor_template_version_id is null and id = logical_template_id)
    or (
      version_number > 1
      and predecessor_template_version_id is not null
      and id <> logical_template_id
    )
  ),
  unique (organization_id, logical_template_id, version_number)
);

create unique index if not exists proposal_checklist_template_one_current_idx
  on public.proposal_checklist_template_versions (organization_id, logical_template_id)
  where is_current;

create unique index if not exists proposal_checklist_template_current_name_idx
  on public.proposal_checklist_template_versions (organization_id, lower(name))
  where is_current and status = 'active';

create index if not exists proposal_checklist_template_history_idx
  on public.proposal_checklist_template_versions (
    organization_id, logical_template_id, version_number desc
  );

create index if not exists proposal_checklist_template_predecessor_idx
  on public.proposal_checklist_template_versions (predecessor_template_version_id)
  where predecessor_template_version_id is not null;

create table if not exists public.proposal_checklist_template_items (
  id uuid primary key,
  template_version_id uuid not null
    references public.proposal_checklist_template_versions(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null check (length(btrim(title)) between 3 and 120),
  category text not null check (
    category in (
      'registration_certificate', 'car_receipt', 'topography_map',
      'descriptive_memorial', 'technical_report', 'photo_report',
      'professional_record', 'commercial_support', 'other'
    )
  ),
  access_scope text not null check (
    access_scope in ('organization', 'participants', 'management')
  ),
  required boolean not null,
  due_in_days integer check (due_in_days between 0 and 3650),
  position integer not null check (position between 1 and 50),
  unique (template_version_id, position)
);

create index if not exists proposal_checklist_template_items_parent_idx
  on public.proposal_checklist_template_items (template_version_id, position);

create unique index if not exists proposal_checklist_template_items_identity_idx
  on public.proposal_checklist_template_items (
    template_version_id, category, lower(title)
  );

create table if not exists public.proposal_document_checklists (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  proposal_id text not null check (
    length(proposal_id) between 1 and 160
    and proposal_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$'
  ),
  proposal_number text not null check (length(btrim(proposal_number)) between 1 and 80),
  proposal_title text not null check (length(btrim(proposal_title)) between 3 and 160),
  proposal_type text not null check (
    proposal_type in ('credit', 'appraisal', 'technical_project', 'environmental_regularization')
  ),
  proposal_category text not null check (
    proposal_category in (
      'custeio', 'investimento', 'comercializacao',
      'industrializacao', 'servico_tecnico', 'outros'
    )
  ),
  template_logical_id uuid not null,
  template_version_id uuid not null
    references public.proposal_checklist_template_versions(id) on delete restrict,
  template_version_number integer not null check (template_version_number > 0),
  template_name text not null check (length(btrim(template_name)) between 3 and 120),
  status text not null check (status in ('active', 'completed')),
  version_number integer not null check (version_number > 0),
  created_by_user_id uuid not null,
  created_by_display_name text not null check (
    length(btrim(created_by_display_name)) between 3 and 120
  ),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organization_id, proposal_id)
);

create index if not exists proposal_document_checklists_list_idx
  on public.proposal_document_checklists (organization_id, updated_at desc, id);

create index if not exists proposal_document_checklists_template_idx
  on public.proposal_document_checklists (template_version_id);

create table if not exists agrocore_private.proposal_checklist_access (
  checklist_id uuid primary key
    references public.proposal_document_checklists(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  authorized_user_ids uuid[] not null default '{}'::uuid[] check (
    cardinality(authorized_user_ids) <= 256
    and array_position(authorized_user_ids, null) is null
  ),
  updated_at timestamptz not null default clock_timestamp(),
  unique (organization_id, checklist_id)
);

revoke all on table agrocore_private.proposal_checklist_access
  from public, anon, authenticated;

create table if not exists public.proposal_document_checklist_items (
  id uuid primary key,
  checklist_id uuid not null
    references public.proposal_document_checklists(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  template_item_id uuid not null
    references public.proposal_checklist_template_items(id) on delete restrict,
  title text not null check (length(btrim(title)) between 3 and 120),
  category text not null check (
    category in (
      'registration_certificate', 'car_receipt', 'topography_map',
      'descriptive_memorial', 'technical_report', 'photo_report',
      'professional_record', 'commercial_support', 'other'
    )
  ),
  access_scope text not null check (
    access_scope in ('organization', 'participants', 'management')
  ),
  required boolean not null,
  position integer not null check (position between 1 and 50),
  due_on date,
  state text not null check (
    state in ('pending', 'received', 'in_review', 'approved', 'rejected', 'expired')
  ),
  linked_document_id uuid references public.document_versions(id) on delete restrict,
  received_at timestamptz,
  reviewed_at timestamptz,
  decided_at timestamptz,
  decided_by_user_id uuid,
  decision_reason text check (
    decision_reason is null or length(btrim(decision_reason)) between 1 and 500
  ),
  version_number integer not null check (version_number > 0),
  updated_at timestamptz not null,
  constraint proposal_document_checklist_item_state_valid check (
    (state = 'pending' and linked_document_id is null)
    or (state in ('received', 'in_review') and linked_document_id is not null)
    or (
      state in ('approved', 'rejected', 'expired')
      and linked_document_id is not null
      and decided_at is not null
      and decided_by_user_id is not null
    )
  ),
  unique (checklist_id, position),
  unique (checklist_id, template_item_id)
);

create index if not exists proposal_document_checklist_items_parent_idx
  on public.proposal_document_checklist_items (checklist_id, position);

create index if not exists proposal_document_checklist_items_attention_idx
  on public.proposal_document_checklist_items (organization_id, state, due_on, checklist_id)
  where state in ('pending', 'received', 'in_review', 'rejected', 'expired');

create index if not exists proposal_document_checklist_items_document_idx
  on public.proposal_document_checklist_items (linked_document_id)
  where linked_document_id is not null;

create index if not exists proposal_document_checklist_items_template_idx
  on public.proposal_document_checklist_items (template_item_id);

create table if not exists public.proposal_document_checklist_history (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  checklist_id uuid not null
    references public.proposal_document_checklists(id) on delete restrict,
  checklist_item_id uuid not null
    references public.proposal_document_checklist_items(id) on delete restrict,
  from_state text check (
    from_state is null
    or from_state in ('pending', 'received', 'in_review', 'approved', 'rejected', 'expired')
  ),
  to_state text not null check (
    to_state in ('pending', 'received', 'in_review', 'approved', 'rejected', 'expired')
  ),
  linked_document_id uuid references public.document_versions(id) on delete restrict,
  actor_user_id uuid not null,
  actor_display_name text not null check (
    length(btrim(actor_display_name)) between 3 and 120
  ),
  reason text check (reason is null or length(btrim(reason)) between 1 and 500),
  occurred_at timestamptz not null,
  correlation_id text not null check (length(correlation_id) between 8 and 200),
  constraint proposal_document_checklist_history_initial_valid check (
    (from_state is null and to_state = 'pending') or from_state is not null
  )
);

create index if not exists proposal_document_checklist_history_parent_idx
  on public.proposal_document_checklist_history (
    checklist_id, occurred_at desc, id
  );

create index if not exists proposal_document_checklist_history_item_idx
  on public.proposal_document_checklist_history (
    checklist_item_id, occurred_at desc, id
  );

create index if not exists proposal_document_checklist_history_document_idx
  on public.proposal_document_checklist_history (linked_document_id)
  where linked_document_id is not null;

create table if not exists agrocore_private.proposal_checklist_command_receipts (
  organization_id uuid not null,
  actor_user_id uuid not null,
  operation text not null check (
    operation in ('configure-template', 'apply-checklist', 'transition-item')
  ),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  result_template_version_id uuid
    references public.proposal_checklist_template_versions(id) on delete restrict,
  result_checklist_id uuid
    references public.proposal_document_checklists(id) on delete restrict,
  result_item_id uuid
    references public.proposal_document_checklist_items(id) on delete restrict,
  result_item_version integer,
  created_at timestamptz not null default clock_timestamp(),
  constraint proposal_checklist_receipt_result_valid check (
    (
      operation = 'configure-template'
      and result_template_version_id is not null
      and result_checklist_id is null
      and result_item_id is null
      and result_item_version is null
    )
    or (
      operation = 'apply-checklist'
      and result_template_version_id is null
      and result_checklist_id is not null
      and result_item_id is null
      and result_item_version is null
    )
    or (
      operation = 'transition-item'
      and result_template_version_id is null
      and result_checklist_id is not null
      and result_item_id is not null
      and result_item_version is not null
    )
  ),
  primary key (organization_id, operation, idempotency_key)
);

revoke all on table agrocore_private.proposal_checklist_command_receipts
  from public, anon, authenticated;

create or replace function agrocore_private.can_read_proposal_checklist_templates(
  target_organization_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_role text;
begin
  if v_actor_id is null then return false; end if;
  v_role := agrocore_private.document_member_role(target_organization_id);
  return v_role in ('owner', 'company_admin', 'manager');
end;
$$;

create or replace function agrocore_private.can_read_proposal_checklist(
  target_organization_id uuid,
  target_checklist_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_role text;
begin
  if v_actor_id is null then return false; end if;
  v_role := agrocore_private.document_member_role(target_organization_id);
  if v_role in ('owner', 'company_admin', 'manager') then return true; end if;
  if v_role not in ('project_designer', 'capturer') then return false; end if;
  return exists (
    select 1
    from agrocore_private.proposal_checklist_access access_rule
    where access_rule.organization_id = target_organization_id
      and access_rule.checklist_id = target_checklist_id
      and v_actor_id = any (access_rule.authorized_user_ids)
  ) and exists (
    select 1
    from public.proposal_document_checklist_items item
    where item.organization_id = target_organization_id
      and item.checklist_id = target_checklist_id
      and item.access_scope <> 'management'
  );
end;
$$;

revoke all on function agrocore_private.can_read_proposal_checklist_templates(uuid)
  from public, anon;
revoke all on function agrocore_private.can_read_proposal_checklist(uuid, uuid)
  from public, anon;
grant execute on function agrocore_private.can_read_proposal_checklist_templates(uuid)
  to authenticated;
grant execute on function agrocore_private.can_read_proposal_checklist(uuid, uuid)
  to authenticated;

alter table public.proposal_checklist_template_versions enable row level security;
alter table public.proposal_checklist_template_items enable row level security;
alter table public.proposal_document_checklists enable row level security;
alter table public.proposal_document_checklist_items enable row level security;
alter table public.proposal_document_checklist_history enable row level security;

drop policy if exists "agrocore_proposal_checklist_templates_select"
  on public.proposal_checklist_template_versions;
create policy "agrocore_proposal_checklist_templates_select"
on public.proposal_checklist_template_versions
for select
to authenticated
using (
  (select agrocore_private.can_read_proposal_checklist_templates(organization_id))
);

drop policy if exists "agrocore_proposal_checklist_template_items_select"
  on public.proposal_checklist_template_items;
create policy "agrocore_proposal_checklist_template_items_select"
on public.proposal_checklist_template_items
for select
to authenticated
using (
  (select agrocore_private.can_read_proposal_checklist_templates(
    proposal_checklist_template_items.organization_id
  ))
  and exists (
    select 1
    from public.proposal_checklist_template_versions template
    where template.id = proposal_checklist_template_items.template_version_id
      and template.organization_id = proposal_checklist_template_items.organization_id
  )
);

drop policy if exists "agrocore_proposal_document_checklists_select"
  on public.proposal_document_checklists;
create policy "agrocore_proposal_document_checklists_select"
on public.proposal_document_checklists
for select
to authenticated
using (
  (select agrocore_private.can_read_proposal_checklist(organization_id, id))
);

drop policy if exists "agrocore_proposal_document_checklist_items_select"
  on public.proposal_document_checklist_items;
create policy "agrocore_proposal_document_checklist_items_select"
on public.proposal_document_checklist_items
for select
to authenticated
using (
  (select agrocore_private.can_read_proposal_checklist(
    proposal_document_checklist_items.organization_id,
    proposal_document_checklist_items.checklist_id
  ))
  and exists (
    select 1
    from public.proposal_document_checklists checklist
    where checklist.id = proposal_document_checklist_items.checklist_id
      and checklist.organization_id = proposal_document_checklist_items.organization_id
  )
  and (
    proposal_document_checklist_items.access_scope <> 'management'
    or (select agrocore_private.document_member_role(
      proposal_document_checklist_items.organization_id
    )) in ('owner', 'company_admin', 'manager')
  )
);

drop policy if exists "agrocore_proposal_document_checklist_history_select"
  on public.proposal_document_checklist_history;
create policy "agrocore_proposal_document_checklist_history_select"
on public.proposal_document_checklist_history
for select
to authenticated
using (
  (select agrocore_private.can_read_proposal_checklist(
    proposal_document_checklist_history.organization_id,
    proposal_document_checklist_history.checklist_id
  ))
  and exists (
    select 1
    from public.proposal_document_checklists checklist
    where checklist.id = proposal_document_checklist_history.checklist_id
      and checklist.organization_id = proposal_document_checklist_history.organization_id
  )
  and exists (
    select 1
    from public.proposal_document_checklist_items item
    where item.id = proposal_document_checklist_history.checklist_item_id
      and item.checklist_id = proposal_document_checklist_history.checklist_id
      and item.organization_id = proposal_document_checklist_history.organization_id
      and (
        item.access_scope <> 'management'
        or (select agrocore_private.document_member_role(item.organization_id))
          in ('owner', 'company_admin', 'manager')
      )
  )
);

revoke all on table public.proposal_checklist_template_versions
  from public, anon, authenticated;
revoke all on table public.proposal_checklist_template_items
  from public, anon, authenticated;
revoke all on table public.proposal_document_checklists
  from public, anon, authenticated;
revoke all on table public.proposal_document_checklist_items
  from public, anon, authenticated;
revoke all on table public.proposal_document_checklist_history
  from public, anon, authenticated;

grant select on table public.proposal_checklist_template_versions to authenticated;
grant select on table public.proposal_checklist_template_items to authenticated;
grant select on table public.proposal_document_checklists to authenticated;
grant select on table public.proposal_document_checklist_items to authenticated;
grant select on table public.proposal_document_checklist_history to authenticated;

create or replace function agrocore_private.configure_proposal_checklist_template(
  p_template jsonb,
  p_items jsonb,
  p_previous_template_version_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_payload_hash text
)
returns public.proposal_checklist_template_versions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid := (p_template ->> 'organizationId')::uuid;
  v_template_id uuid := (p_template ->> 'id')::uuid;
  v_logical_template_id uuid := (p_template ->> 'logicalTemplateId')::uuid;
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_previous public.proposal_checklist_template_versions%rowtype;
  v_receipt agrocore_private.proposal_checklist_command_receipts%rowtype;
  v_result public.proposal_checklist_template_versions%rowtype;
  v_item jsonb;
begin
  if v_actor_id is null then raise exception 'AGROCORE_FORBIDDEN'; end if;
  if p_template is null
    or jsonb_typeof(p_template) is distinct from 'object'
    or p_items is null
    or p_payload_hash is null
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 200
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  v_role := agrocore_private.document_member_role(v_organization_id);
  if v_role not in ('owner', 'company_admin', 'manager') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':checklist-template:' || p_idempotency_key, 0)
  );
  select * into v_receipt
  from agrocore_private.proposal_checklist_command_receipts
  where organization_id = v_organization_id
    and operation = 'configure-template'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_user_id <> v_actor_id then raise exception 'AGROCORE_FORBIDDEN'; end if;
    if v_receipt.payload_hash <> p_payload_hash then
      raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
    end if;
    select * into strict v_result
    from public.proposal_checklist_template_versions
    where id = v_receipt.result_template_version_id;
    return v_result;
  end if;

  if (p_template ->> 'createdByUserId') is distinct from v_actor_id::text
    or coalesce((p_template ->> 'isCurrent')::boolean, false) is not true
    or (p_template ->> 'status') is distinct from 'active' then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if p_previous_template_version_id is null then
    if p_expected_version is not null
      or v_template_id is distinct from v_logical_template_id
      or (p_template ->> 'versionNumber')::integer is distinct from 1
      or p_template ? 'predecessorTemplateVersionId' then
      raise exception 'AGROCORE_INVALID_INPUT';
    end if;
  else
    select * into v_previous
    from public.proposal_checklist_template_versions
    where organization_id = v_organization_id
      and id = p_previous_template_version_id
    for update;
    if not found then raise exception 'AGROCORE_TEMPLATE_NOT_FOUND'; end if;
    if not v_previous.is_current or v_previous.version_number is distinct from p_expected_version then
      raise exception 'AGROCORE_VERSION_CONFLICT';
    end if;
    if v_logical_template_id is distinct from v_previous.logical_template_id
      or (p_template ->> 'predecessorTemplateVersionId')::uuid is distinct from v_previous.id
      or (p_template ->> 'versionNumber')::integer is distinct from v_previous.version_number + 1 then
      raise exception 'AGROCORE_INVALID_INPUT';
    end if;
    update public.proposal_checklist_template_versions
    set is_current = false
    where id = v_previous.id;
  end if;

  if exists (
    select 1
    from public.proposal_checklist_template_versions template
    where template.organization_id = v_organization_id
      and template.is_current
      and template.status = 'active'
      and template.logical_template_id <> v_logical_template_id
      and lower(template.name) = lower(p_template ->> 'name')
  ) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  insert into public.proposal_checklist_template_versions (
    id, logical_template_id, organization_id, name, proposal_type,
    proposal_category, status, is_current, version_number,
    predecessor_template_version_id, change_reason, created_by_user_id,
    created_by_display_name, created_at
  ) values (
    v_template_id,
    v_logical_template_id,
    v_organization_id,
    p_template ->> 'name',
    p_template ->> 'proposalType',
    p_template ->> 'proposalCategory',
    'active',
    true,
    (p_template ->> 'versionNumber')::integer,
    p_previous_template_version_id,
    p_template ->> 'changeReason',
    v_actor_id,
    agrocore_private.document_actor_display_name(),
    v_now
  ) returning * into v_result;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.proposal_checklist_template_items (
      id, template_version_id, organization_id, title, category,
      access_scope, required, due_in_days, position
    ) values (
      (v_item ->> 'id')::uuid,
      v_result.id,
      v_organization_id,
      v_item ->> 'title',
      v_item ->> 'category',
      v_item ->> 'accessScope',
      (v_item ->> 'required')::boolean,
      nullif(v_item ->> 'dueInDays', '')::integer,
      (v_item ->> 'position')::integer
    );
  end loop;

  if (
    select count(*)
    from public.proposal_checklist_template_items item
    where item.template_version_id = v_result.id
  ) <> jsonb_array_length(p_items) then
    raise exception 'AGROCORE_INVALID_STATE';
  end if;

  insert into agrocore_private.proposal_checklist_command_receipts (
    organization_id, actor_user_id, operation, idempotency_key,
    payload_hash, result_template_version_id
  ) values (
    v_organization_id, v_actor_id, 'configure-template', p_idempotency_key,
    p_payload_hash, v_result.id
  );
  return v_result;
end;
$$;

create or replace function agrocore_private.apply_proposal_checklist(
  p_checklist jsonb,
  p_items jsonb,
  p_history jsonb,
  p_authorized_user_ids uuid[],
  p_idempotency_key text,
  p_payload_hash text
)
returns public.proposal_document_checklists
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid := (p_checklist ->> 'organizationId')::uuid;
  v_checklist_id uuid := (p_checklist ->> 'id')::uuid;
  v_template_id uuid := (p_checklist ->> 'templateVersionId')::uuid;
  v_authorized_user_ids uuid[] := array(
    select distinct candidate
    from unnest(coalesce(p_authorized_user_ids, '{}'::uuid[])) authorized(candidate)
    order by candidate
  );
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_template public.proposal_checklist_template_versions%rowtype;
  v_template_item public.proposal_checklist_template_items%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_history_id uuid;
  v_receipt agrocore_private.proposal_checklist_command_receipts%rowtype;
  v_result public.proposal_document_checklists%rowtype;
begin
  if v_actor_id is null then raise exception 'AGROCORE_FORBIDDEN'; end if;
  if p_checklist is null
    or jsonb_typeof(p_checklist) is distinct from 'object'
    or p_items is null
    or p_history is null
    or p_payload_hash is null
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 200
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_typeof(p_history) is distinct from 'array'
    or cardinality(v_authorized_user_ids) > 256 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  v_role := agrocore_private.document_member_role(v_organization_id);
  if v_role not in ('owner', 'company_admin', 'manager') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if exists (
    select 1
    from unnest(v_authorized_user_ids) authorized_user_id
    where not exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id::text = v_organization_id::text
        and membership.user_id = authorized_user_id
        and membership.status::text = 'active'
    )
  ) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_organization_id::text || ':proposal-checklist:' || (p_checklist ->> 'proposalId'),
      0
    )
  );

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':apply-checklist:' || p_idempotency_key, 0)
  );
  select * into v_receipt
  from agrocore_private.proposal_checklist_command_receipts
  where organization_id = v_organization_id
    and operation = 'apply-checklist'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_user_id <> v_actor_id then raise exception 'AGROCORE_FORBIDDEN'; end if;
    if v_receipt.payload_hash <> p_payload_hash then
      raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
    end if;
    select * into strict v_result
    from public.proposal_document_checklists
    where id = v_receipt.result_checklist_id;
    return v_result;
  end if;

  select * into v_template
  from public.proposal_checklist_template_versions
  where organization_id = v_organization_id
    and id = v_template_id
    and is_current
    and status = 'active'
  for share;
  if not found then raise exception 'AGROCORE_TEMPLATE_NOT_FOUND'; end if;
  if (v_template.proposal_type <> 'all'
      and v_template.proposal_type <> (p_checklist ->> 'proposalType'))
    or (v_template.proposal_category <> 'all'
      and v_template.proposal_category <> (p_checklist ->> 'proposalCategory')) then
    raise exception 'AGROCORE_TEMPLATE_MISMATCH';
  end if;
  if (p_checklist ->> 'createdByUserId') is distinct from v_actor_id::text
    or (p_checklist ->> 'templateLogicalId')::uuid is distinct from v_template.logical_template_id
    or (p_checklist ->> 'templateVersionNumber')::integer is distinct from v_template.version_number
    or (p_checklist ->> 'templateName') is distinct from v_template.name
    or (p_checklist ->> 'status') is distinct from 'active'
    or (p_checklist ->> 'versionNumber')::integer is distinct from 1 then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  if exists (
    select 1
    from public.proposal_document_checklists checklist
    where checklist.organization_id = v_organization_id
      and checklist.proposal_id = p_checklist ->> 'proposalId'
  ) then
    raise exception 'AGROCORE_CHECKLIST_EXISTS';
  end if;
  if jsonb_array_length(p_items) <> (
    select count(*)
    from public.proposal_checklist_template_items item
    where item.template_version_id = v_template.id
  ) or jsonb_array_length(p_history) <> jsonb_array_length(p_items) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  insert into public.proposal_document_checklists (
    id, organization_id, proposal_id, proposal_number, proposal_title,
    proposal_type, proposal_category, template_logical_id, template_version_id,
    template_version_number, template_name, status, version_number,
    created_by_user_id, created_by_display_name, created_at, updated_at
  ) values (
    v_checklist_id,
    v_organization_id,
    p_checklist ->> 'proposalId',
    p_checklist ->> 'proposalNumber',
    p_checklist ->> 'proposalTitle',
    p_checklist ->> 'proposalType',
    p_checklist ->> 'proposalCategory',
    v_template.logical_template_id,
    v_template.id,
    v_template.version_number,
    v_template.name,
    'active',
    1,
    v_actor_id,
    agrocore_private.document_actor_display_name(),
    v_now,
    v_now
  ) returning * into v_result;

  insert into agrocore_private.proposal_checklist_access (
    checklist_id, organization_id, authorized_user_ids, updated_at
  ) values (
    v_result.id, v_organization_id, v_authorized_user_ids, v_now
  );

  for v_template_item in
    select *
    from public.proposal_checklist_template_items template_item
    where template_item.template_version_id = v_template.id
    order by template_item.position, template_item.id
  loop
    select value into v_item
    from jsonb_array_elements(p_items)
    where value ->> 'templateItemId' = v_template_item.id::text
    limit 1;
    if v_item is null
      or (v_item ->> 'title') is distinct from v_template_item.title
      or (v_item ->> 'category') is distinct from v_template_item.category
      or (v_item ->> 'accessScope') is distinct from v_template_item.access_scope
      or (v_item ->> 'required')::boolean is distinct from v_template_item.required
      or (v_item ->> 'position')::integer is distinct from v_template_item.position
      or (v_item ->> 'state') is distinct from 'pending'
      or (v_item ->> 'versionNumber')::integer is distinct from 1 then
      raise exception 'AGROCORE_INVALID_INPUT';
    end if;
    v_item_id := (v_item ->> 'id')::uuid;
    insert into public.proposal_document_checklist_items (
      id, checklist_id, organization_id, template_item_id, title, category,
      access_scope, required, position, due_on, state, version_number, updated_at
    ) values (
      v_item_id,
      v_result.id,
      v_organization_id,
      v_template_item.id,
      v_template_item.title,
      v_template_item.category,
      v_template_item.access_scope,
      v_template_item.required,
      v_template_item.position,
      case
        when v_template_item.due_in_days is null then null
        else (v_now at time zone 'UTC')::date + v_template_item.due_in_days
      end,
      'pending',
      1,
      v_now
    );
    select (value ->> 'id')::uuid into v_history_id
    from jsonb_array_elements(p_history)
    where value ->> 'checklistItemId' = v_item_id::text
      and value ->> 'toState' = 'pending'
    limit 1;
    if v_history_id is null then raise exception 'AGROCORE_INVALID_INPUT'; end if;
    insert into public.proposal_document_checklist_history (
      id, organization_id, checklist_id, checklist_item_id, from_state,
      to_state, actor_user_id, actor_display_name, occurred_at, correlation_id
    ) values (
      v_history_id, v_organization_id, v_result.id, v_item_id, null,
      'pending', v_actor_id, agrocore_private.document_actor_display_name(),
      v_now, p_idempotency_key
    );
  end loop;

  insert into agrocore_private.proposal_checklist_command_receipts (
    organization_id, actor_user_id, operation, idempotency_key,
    payload_hash, result_checklist_id
  ) values (
    v_organization_id, v_actor_id, 'apply-checklist', p_idempotency_key,
    p_payload_hash, v_result.id
  );
  return v_result;
end;
$$;

create or replace function agrocore_private.transition_proposal_checklist_item(
  p_organization_id uuid,
  p_checklist_id uuid,
  p_item jsonb,
  p_history jsonb,
  p_expected_version integer,
  p_idempotency_key text,
  p_payload_hash text
)
returns public.proposal_document_checklists
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_target_state text := p_item ->> 'state';
  v_document_id uuid := nullif(p_item ->> 'linkedDocumentId', '')::uuid;
  v_reason text := nullif(btrim(p_history ->> 'reason'), '');
  v_checklist public.proposal_document_checklists%rowtype;
  v_current public.proposal_document_checklist_items%rowtype;
  v_document public.document_versions%rowtype;
  v_receipt agrocore_private.proposal_checklist_command_receipts%rowtype;
begin
  if v_actor_id is null then raise exception 'AGROCORE_FORBIDDEN'; end if;
  if p_item is null
    or jsonb_typeof(p_item) is distinct from 'object'
    or p_history is null
    or jsonb_typeof(p_history) is distinct from 'object'
    or p_payload_hash is null
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 200
    or p_expected_version is null
    or p_expected_version < 1
    or v_target_state not in ('received', 'in_review', 'approved', 'rejected', 'expired') then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  v_role := agrocore_private.document_member_role(p_organization_id);
  if v_role is null then raise exception 'AGROCORE_FORBIDDEN'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':checklist-item:' || p_idempotency_key, 0)
  );
  select * into v_receipt
  from agrocore_private.proposal_checklist_command_receipts
  where organization_id = p_organization_id
    and operation = 'transition-item'
    and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.actor_user_id <> v_actor_id then raise exception 'AGROCORE_FORBIDDEN'; end if;
    if v_receipt.payload_hash <> p_payload_hash then
      raise exception 'AGROCORE_IDEMPOTENCY_CONFLICT';
    end if;
    select * into strict v_checklist
    from public.proposal_document_checklists
    where id = v_receipt.result_checklist_id;
    return v_checklist;
  end if;

  select * into v_checklist
  from public.proposal_document_checklists
  where organization_id = p_organization_id and id = p_checklist_id
  for update;
  if not found then raise exception 'AGROCORE_CHECKLIST_NOT_FOUND'; end if;
  if v_role in ('project_designer', 'capturer') and not exists (
    select 1
    from agrocore_private.proposal_checklist_access access_rule
    where access_rule.organization_id = p_organization_id
      and access_rule.checklist_id = p_checklist_id
      and v_actor_id = any (access_rule.authorized_user_ids)
  ) then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if v_role not in ('owner', 'company_admin', 'manager', 'project_designer', 'capturer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  select * into v_current
  from public.proposal_document_checklist_items
  where organization_id = p_organization_id
    and checklist_id = p_checklist_id
    and id = (p_item ->> 'id')::uuid
  for update;
  if not found then raise exception 'AGROCORE_ITEM_NOT_FOUND'; end if;
  if v_current.version_number is distinct from p_expected_version then
    raise exception 'AGROCORE_VERSION_CONFLICT';
  end if;
  if (p_item ->> 'versionNumber')::integer is distinct from v_current.version_number + 1
    or (p_history ->> 'checklistItemId')::uuid is distinct from v_current.id
    or (p_history ->> 'fromState') is distinct from v_current.state
    or (p_history ->> 'toState') is distinct from v_target_state then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;

  if not (
    (v_current.state = 'pending' and v_target_state = 'received')
    or (v_current.state = 'received' and v_target_state in ('in_review', 'expired'))
    or (v_current.state = 'in_review' and v_target_state in ('approved', 'rejected', 'expired'))
    or (v_current.state = 'approved' and v_target_state = 'expired')
    or (v_current.state in ('rejected', 'expired') and v_target_state = 'received')
  ) then
    raise exception 'AGROCORE_INVALID_TRANSITION';
  end if;
  if v_role in ('project_designer', 'capturer')
    and v_current.access_scope = 'management' then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;
  if v_target_state <> 'received'
    and v_role not in ('owner', 'company_admin', 'manager', 'project_designer') then
    raise exception 'AGROCORE_FORBIDDEN';
  end if;

  if v_target_state = 'received' then
    if v_document_id is null then raise exception 'AGROCORE_DOCUMENT_MISMATCH'; end if;
    select * into v_document
    from public.document_versions document
    where document.organization_id = p_organization_id
      and document.id = v_document_id
      and document.logical_owner_type = 'proposal'
      and document.logical_owner_id = v_checklist.proposal_id
      and document.category = v_current.category
      and document.is_current
      and document.status = 'active';
    if not found then raise exception 'AGROCORE_DOCUMENT_MISMATCH'; end if;
    if v_document.expires_on is not null
      and v_document.expires_on < (v_now at time zone 'UTC')::date then
      raise exception 'AGROCORE_DOCUMENT_EXPIRED';
    end if;
  else
    if v_document_id is distinct from v_current.linked_document_id then
      raise exception 'AGROCORE_DOCUMENT_MISMATCH';
    end if;
    select * into v_document
    from public.document_versions document
    where document.organization_id = p_organization_id
      and document.id = v_current.linked_document_id;
    if not found then raise exception 'AGROCORE_DOCUMENT_MISMATCH'; end if;
  end if;
  if v_target_state = 'rejected' and (v_reason is null or length(v_reason) < 3) then
    raise exception 'AGROCORE_INVALID_INPUT';
  end if;
  if v_target_state = 'expired'
    and (
      v_document.expires_on is null
      or v_document.expires_on >= (v_now at time zone 'UTC')::date
    ) then
    raise exception 'AGROCORE_INVALID_TRANSITION';
  end if;

  update public.proposal_document_checklist_items
  set state = v_target_state,
      linked_document_id = v_document_id,
      received_at = case
        when v_target_state = 'received' then v_now
        else received_at
      end,
      reviewed_at = case
        when v_target_state = 'received' then null
        when v_target_state = 'in_review' then v_now
        else reviewed_at
      end,
      decided_at = case
        when v_target_state in ('approved', 'rejected', 'expired') then v_now
        else null
      end,
      decided_by_user_id = case
        when v_target_state in ('approved', 'rejected', 'expired') then v_actor_id
        else null
      end,
      decision_reason = case
        when v_target_state = 'expired' then coalesce(v_reason, 'Validade documental encerrada.')
        when v_target_state in ('approved', 'rejected') then v_reason
        else null
      end,
      version_number = version_number + 1,
      updated_at = v_now
  where id = v_current.id
  returning * into v_current;

  insert into public.proposal_document_checklist_history (
    id, organization_id, checklist_id, checklist_item_id, from_state,
    to_state, linked_document_id, actor_user_id, actor_display_name,
    reason, occurred_at, correlation_id
  ) values (
    (p_history ->> 'id')::uuid,
    p_organization_id,
    p_checklist_id,
    v_current.id,
    p_history ->> 'fromState',
    v_target_state,
    v_current.linked_document_id,
    v_actor_id,
    agrocore_private.document_actor_display_name(),
    case
      when v_target_state = 'expired' then coalesce(v_reason, 'Validade documental encerrada.')
      else v_reason
    end,
    v_now,
    p_idempotency_key
  );

  update public.proposal_document_checklists checklist
  set status = case
        when not exists (
          select 1
          from public.proposal_document_checklist_items item
          where item.checklist_id = checklist.id
            and item.required
            and item.state <> 'approved'
        ) then 'completed'
        else 'active'
      end,
      version_number = version_number + 1,
      updated_at = v_now
  where checklist.id = p_checklist_id
  returning * into v_checklist;

  insert into agrocore_private.proposal_checklist_command_receipts (
    organization_id, actor_user_id, operation, idempotency_key, payload_hash,
    result_checklist_id, result_item_id, result_item_version
  ) values (
    p_organization_id, v_actor_id, 'transition-item', p_idempotency_key,
    p_payload_hash, v_checklist.id, v_current.id, v_current.version_number
  );
  return v_checklist;
end;
$$;

revoke all on function agrocore_private.configure_proposal_checklist_template(
  jsonb, jsonb, uuid, integer, text, text
) from public, anon, authenticated;
revoke all on function agrocore_private.apply_proposal_checklist(
  jsonb, jsonb, jsonb, uuid[], text, text
) from public, anon, authenticated;
revoke all on function agrocore_private.transition_proposal_checklist_item(
  uuid, uuid, jsonb, jsonb, integer, text, text
) from public, anon, authenticated;

create or replace function public.agrocore_configure_proposal_checklist_template(
  p_template jsonb,
  p_items jsonb,
  p_previous_template_version_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_payload_hash text
)
returns setof public.proposal_checklist_template_versions
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.configure_proposal_checklist_template(
    p_template, p_items, p_previous_template_version_id, p_expected_version,
    p_idempotency_key, p_payload_hash
  )).*;
$$;

create or replace function public.agrocore_apply_proposal_checklist(
  p_checklist jsonb,
  p_items jsonb,
  p_history jsonb,
  p_authorized_user_ids uuid[],
  p_idempotency_key text,
  p_payload_hash text
)
returns setof public.proposal_document_checklists
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.apply_proposal_checklist(
    p_checklist, p_items, p_history, p_authorized_user_ids,
    p_idempotency_key, p_payload_hash
  )).*;
$$;

create or replace function public.agrocore_transition_proposal_checklist_item(
  p_organization_id uuid,
  p_checklist_id uuid,
  p_item jsonb,
  p_history jsonb,
  p_expected_version integer,
  p_idempotency_key text,
  p_payload_hash text
)
returns setof public.proposal_document_checklists
language sql
volatile
security definer
set search_path = ''
as $$
  select (agrocore_private.transition_proposal_checklist_item(
    p_organization_id, p_checklist_id, p_item, p_history,
    p_expected_version, p_idempotency_key, p_payload_hash
  )).*;
$$;

revoke all on function public.agrocore_configure_proposal_checklist_template(
  jsonb, jsonb, uuid, integer, text, text
) from public, anon, authenticated;
revoke all on function public.agrocore_apply_proposal_checklist(
  jsonb, jsonb, jsonb, uuid[], text, text
) from public, anon, authenticated;
revoke all on function public.agrocore_transition_proposal_checklist_item(
  uuid, uuid, jsonb, jsonb, integer, text, text
) from public, anon, authenticated;

grant execute on function public.agrocore_configure_proposal_checklist_template(
  jsonb, jsonb, uuid, integer, text, text
) to authenticated;
grant execute on function public.agrocore_apply_proposal_checklist(
  jsonb, jsonb, jsonb, uuid[], text, text
) to authenticated;
grant execute on function public.agrocore_transition_proposal_checklist_item(
  uuid, uuid, jsonb, jsonb, integer, text, text
) to authenticated;

comment on table public.proposal_checklist_template_versions
is 'Versões imutáveis dos modelos documentais configurados por organização.';
comment on table public.proposal_document_checklists
is 'Checklist documental único aplicado a uma proposta existente.';
comment on table public.proposal_document_checklist_history
is 'Histórico append-only de recebimento, análise e decisão de cada requisito.';
