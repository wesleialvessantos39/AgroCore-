
-- AgroCore — OE-008.003 — Atribuição e colaboração
-- Responsável único, participantes, conclusão, reabertura e cancelamento.
-- Não materializa recorrência nem cria notificações/canais externos.

alter table agrocore_private.schedule_item_command_receipts
  drop constraint if exists schedule_item_command_receipts_command_type_check;

alter table agrocore_private.schedule_item_command_receipts
  add constraint schedule_item_command_receipts_command_type_check
  check (
    command_type in (
      'create',
      'update',
      'collaboration',
      'complete',
      'reopen',
      'cancel'
    )
  );

alter table public.schedule_items
  add column if not exists responsible_user_id uuid null
    references auth.users(id) on delete restrict,
  add column if not exists completed_at timestamptz null,
  add column if not exists cancelled_at timestamptz null;

alter table public.schedule_items
  drop constraint if exists schedule_items_terminal_timestamps_ck;

alter table public.schedule_items
  add constraint schedule_items_terminal_timestamps_ck
  check (
    (
      status = 'completed'
      and completed_at is not null
      and cancelled_at is null
    )
    or
    (
      status = 'cancelled'
      and cancelled_at is not null
      and completed_at is null
    )
    or
    (
      status not in ('completed', 'cancelled')
      and completed_at is null
      and cancelled_at is null
    )
  );

create index if not exists schedule_items_responsible_fk_idx
  on public.schedule_items (responsible_user_id)
  where responsible_user_id is not null;

create index if not exists schedule_items_org_responsible_status_idx
  on public.schedule_items (organization_id, responsible_user_id, status)
  where responsible_user_id is not null;

create table if not exists public.schedule_item_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  schedule_item_id uuid not null references public.schedule_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  added_by_user_id uuid not null references auth.users(id) on delete restrict,
  added_at timestamptz not null default statement_timestamp(),
  unique (schedule_item_id, user_id)
);

create index if not exists schedule_item_participants_org_user_item_idx
  on public.schedule_item_participants (
    organization_id,
    user_id,
    schedule_item_id
  );

create index if not exists schedule_item_participants_user_fk_idx
  on public.schedule_item_participants (user_id);

create index if not exists schedule_item_participants_added_by_fk_idx
  on public.schedule_item_participants (added_by_user_id);

create table if not exists public.schedule_item_collaboration_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  schedule_item_id uuid not null references public.schedule_items(id) on delete restrict,
  item_version integer not null check (item_version >= 1),
  responsible_user_id uuid null references auth.users(id) on delete restrict,
  participant_user_ids uuid[] not null default '{}'::uuid[]
    check (cardinality(participant_user_ids) <= 50),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default statement_timestamp(),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  unique (schedule_item_id, item_version)
);

create index if not exists schedule_item_collaboration_revisions_item_idx
  on public.schedule_item_collaboration_revisions (
    organization_id,
    schedule_item_id,
    item_version desc
  );

create index if not exists schedule_item_collaboration_revisions_responsible_fk_idx
  on public.schedule_item_collaboration_revisions (responsible_user_id)
  where responsible_user_id is not null;

create index if not exists schedule_item_collaboration_revisions_actor_fk_idx
  on public.schedule_item_collaboration_revisions (actor_user_id);

create or replace function agrocore_private.is_eligible_schedule_member(
  p_organization_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and m.organization_role in (
        'owner',
        'company_admin',
        'manager',
        'project_designer',
        'capturer'
      )
  );
$$;

revoke all on function agrocore_private.is_eligible_schedule_member(uuid,uuid)
  from public, anon, authenticated;

create or replace function agrocore_private.validate_schedule_item_responsible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.responsible_user_id is null then
    return new;
  end if;

  if not agrocore_private.is_eligible_schedule_member(
    new.organization_id,
    new.responsible_user_id
  ) then
    raise exception 'AGROCORE_SCHEDULE_COLLABORATOR_INELIGIBLE';
  end if;

  if exists (
    select 1
    from public.schedule_item_participants p
    where p.organization_id = new.organization_id
      and p.schedule_item_id = new.id
      and p.user_id = new.responsible_user_id
  ) then
    raise exception 'AGROCORE_SCHEDULE_COLLABORATOR_DUPLICATE';
  end if;

  return new;
end;
$$;

revoke all on function agrocore_private.validate_schedule_item_responsible()
  from public, anon, authenticated;

drop trigger if exists agrocore_validate_schedule_item_responsible
  on public.schedule_items;

create trigger agrocore_validate_schedule_item_responsible
before insert or update of responsible_user_id, organization_id
on public.schedule_items
for each row
execute function agrocore_private.validate_schedule_item_responsible();

create or replace function agrocore_private.validate_schedule_item_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.schedule_items%rowtype;
begin
  select *
  into v_item
  from public.schedule_items s
  where s.id = new.schedule_item_id;

  if not found
     or v_item.organization_id <> new.organization_id then
    raise exception 'AGROCORE_SCHEDULE_NOT_FOUND';
  end if;

  if not agrocore_private.is_eligible_schedule_member(
    new.organization_id,
    new.user_id
  ) then
    raise exception 'AGROCORE_SCHEDULE_COLLABORATOR_INELIGIBLE';
  end if;

  if v_item.responsible_user_id is not null
     and v_item.responsible_user_id = new.user_id then
    raise exception 'AGROCORE_SCHEDULE_COLLABORATOR_DUPLICATE';
  end if;

  return new;
end;
$$;

revoke all on function agrocore_private.validate_schedule_item_participant()
  from public, anon, authenticated;

drop trigger if exists agrocore_validate_schedule_item_participant
  on public.schedule_item_participants;

create trigger agrocore_validate_schedule_item_participant
before insert or update of organization_id, schedule_item_id, user_id
on public.schedule_item_participants
for each row
execute function agrocore_private.validate_schedule_item_participant();

alter table public.schedule_item_participants enable row level security;
alter table public.schedule_item_collaboration_revisions enable row level security;

drop policy if exists "agrocore_schedule_item_participants_select"
  on public.schedule_item_participants;
create policy "agrocore_schedule_item_participants_select"
on public.schedule_item_participants
for select
to authenticated
using ((select agrocore_private.can_view_schedule(organization_id)));

drop policy if exists "agrocore_schedule_item_collaboration_revisions_select"
  on public.schedule_item_collaboration_revisions;
create policy "agrocore_schedule_item_collaboration_revisions_select"
on public.schedule_item_collaboration_revisions
for select
to authenticated
using ((select agrocore_private.can_view_schedule(organization_id)));

revoke all on public.schedule_item_participants from public, anon;
revoke all on public.schedule_item_collaboration_revisions from public, anon;

revoke insert, update, delete, truncate, references, trigger
  on public.schedule_item_participants from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.schedule_item_collaboration_revisions from authenticated;

grant select on public.schedule_item_participants to authenticated;
grant select on public.schedule_item_collaboration_revisions to authenticated;

create or replace function public.agrocore_list_schedule_members(
  p_organization_id uuid
)
returns table (
  user_id uuid,
  organization_role text,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not agrocore_private.can_view_schedule(p_organization_id) then
    raise exception 'AGROCORE_SCHEDULE_FORBIDDEN';
  end if;

  return query
  select
    m.user_id,
    m.organization_role,
    left(
      coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
        'Integrante da organização'
      ),
      160
    ) as display_name
  from public.organization_memberships m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_organization_id
    and m.status = 'active'
    and m.organization_role in (
      'owner',
      'company_admin',
      'manager',
      'project_designer',
      'capturer'
    )
  order by display_name, m.user_id;
end;
$$;

revoke all on function public.agrocore_list_schedule_members(uuid)
  from public, anon;
grant execute on function public.agrocore_list_schedule_members(uuid)
  to authenticated;

create or replace function public.agrocore_set_schedule_collaboration(
  p_organization_id uuid,
  p_schedule_item_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_responsible_user_id uuid,
  p_participant_user_ids uuid[],
  p_reason text
)
returns public.schedule_items
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current public.schedule_items%rowtype;
  v_updated public.schedule_items%rowtype;
  v_receipt agrocore_private.schedule_item_command_receipts%rowtype;
  v_participants uuid[] := coalesce(p_participant_user_ids, '{}'::uuid[]);
  v_current_participants uuid[];
  v_changed_fields text[];
  v_reason text := btrim(coalesce(p_reason, ''));
  v_fingerprint text;
begin
  if v_actor is null
     or p_organization_id is null
     or p_schedule_item_id is null
     or not agrocore_private.can_manage_schedule(p_organization_id) then
    raise exception 'AGROCORE_SCHEDULE_FORBIDDEN';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or p_idempotency_key is null
     or char_length(btrim(p_idempotency_key)) not between 8 and 200
     or char_length(v_reason) not between 3 and 500
     or cardinality(v_participants) > 50 then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end if;

  if exists (
    select 1 from unnest(v_participants) u(user_id)
    where user_id is null
  ) then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end if;

  if (
    select count(*) <> count(distinct user_id)
    from unnest(v_participants) u(user_id)
  ) then
    raise exception 'AGROCORE_SCHEDULE_COLLABORATOR_DUPLICATE';
  end if;

  select coalesce(array_agg(user_id order by user_id), '{}'::uuid[])
  into v_participants
  from unnest(v_participants) u(user_id);

  if p_responsible_user_id is not null
     and p_responsible_user_id = any(v_participants) then
    raise exception 'AGROCORE_SCHEDULE_COLLABORATOR_DUPLICATE';
  end if;

  if p_responsible_user_id is not null
     and not agrocore_private.is_eligible_schedule_member(
       p_organization_id,
       p_responsible_user_id
     ) then
    raise exception 'AGROCORE_SCHEDULE_COLLABORATOR_INELIGIBLE';
  end if;

  if exists (
    select 1
    from unnest(v_participants) u(user_id)
    where not agrocore_private.is_eligible_schedule_member(
      p_organization_id,
      user_id
    )
  ) then
    raise exception 'AGROCORE_SCHEDULE_COLLABORATOR_INELIGIBLE';
  end if;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'scheduleItemId', p_schedule_item_id::text,
          'expectedVersion', p_expected_version,
          'responsibleUserId', p_responsible_user_id,
          'participantUserIds', to_jsonb(v_participants),
          'reason', v_reason
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || btrim(p_idempotency_key),
      0
    )
  );

  select *
  into v_receipt
  from agrocore_private.schedule_item_command_receipts r
  where r.organization_id = p_organization_id
    and r.command_key = btrim(p_idempotency_key);

  if found then
    if v_receipt.command_type <> 'collaboration'
       or v_receipt.schedule_item_id <> p_schedule_item_id
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'AGROCORE_SCHEDULE_IDEMPOTENCY_CONFLICT';
    end if;

    select *
    into v_current
    from public.schedule_items s
    where s.organization_id = p_organization_id
      and s.id = p_schedule_item_id;

    if not found then
      raise exception 'AGROCORE_SCHEDULE_NOT_FOUND';
    end if;

    return v_current;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_schedule_item_id::text,
      0
    )
  );

  select *
  into v_current
  from public.schedule_items s
  where s.organization_id = p_organization_id
    and s.id = p_schedule_item_id
  for update;

  if not found then
    raise exception 'AGROCORE_SCHEDULE_NOT_FOUND';
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_SCHEDULE_CONCURRENCY_CONFLICT';
  end if;

  if v_current.origin_type <> 'manual' then
    raise exception 'AGROCORE_SCHEDULE_SOURCE_OWNED';
  end if;

  if v_current.status in ('completed', 'cancelled') then
    raise exception 'AGROCORE_SCHEDULE_STATUS_LOCKED';
  end if;

  select coalesce(array_agg(p.user_id order by p.user_id), '{}'::uuid[])
  into v_current_participants
  from public.schedule_item_participants p
  where p.organization_id = p_organization_id
    and p.schedule_item_id = p_schedule_item_id;

  v_changed_fields := array_remove(array[
    case
      when v_current.responsible_user_id is distinct from p_responsible_user_id
      then 'responsible_user_id'
    end,
    case
      when v_current_participants is distinct from v_participants
      then 'participant_user_ids'
    end
  ], null);

  if cardinality(v_changed_fields) = 0 then
    raise exception 'AGROCORE_SCHEDULE_NO_CHANGES';
  end if;

  delete from public.schedule_item_participants
  where organization_id = p_organization_id
    and schedule_item_id = p_schedule_item_id;

  update public.schedule_items
  set
    responsible_user_id = p_responsible_user_id,
    updated_by_user_id = v_actor,
    updated_at = statement_timestamp(),
    version = v_current.version + 1
  where id = v_current.id
  returning * into v_updated;

  insert into public.schedule_item_participants (
    organization_id,
    schedule_item_id,
    user_id,
    added_by_user_id
  )
  select
    p_organization_id,
    p_schedule_item_id,
    user_id,
    v_actor
  from unnest(v_participants) u(user_id);

  insert into public.schedule_item_audit (
    organization_id,
    schedule_item_id,
    action,
    actor_user_id,
    item_version,
    changed_fields,
    reason
  ) values (
    p_organization_id,
    p_schedule_item_id,
    'updated',
    v_actor,
    v_updated.version,
    v_changed_fields,
    v_reason
  );

  insert into public.schedule_item_collaboration_revisions (
    organization_id,
    schedule_item_id,
    item_version,
    responsible_user_id,
    participant_user_ids,
    actor_user_id,
    reason
  ) values (
    p_organization_id,
    p_schedule_item_id,
    v_updated.version,
    p_responsible_user_id,
    v_participants,
    v_actor,
    v_reason
  );

  insert into agrocore_private.schedule_item_command_receipts (
    organization_id,
    schedule_item_id,
    command_type,
    command_key,
    request_fingerprint,
    result_version
  ) values (
    p_organization_id,
    p_schedule_item_id,
    'collaboration',
    btrim(p_idempotency_key),
    v_fingerprint,
    v_updated.version
  );

  return v_updated;
end;
$$;

revoke all on function public.agrocore_set_schedule_collaboration(
  uuid,uuid,integer,text,uuid,uuid[],text
) from public, anon;
grant execute on function public.agrocore_set_schedule_collaboration(
  uuid,uuid,integer,text,uuid,uuid[],text
) to authenticated;

create or replace function agrocore_private.transition_schedule_item(
  p_organization_id uuid,
  p_schedule_item_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_target_status text,
  p_command_type text,
  p_reason text
)
returns public.schedule_items
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current public.schedule_items%rowtype;
  v_updated public.schedule_items%rowtype;
  v_receipt agrocore_private.schedule_item_command_receipts%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_fingerprint text;
  v_changed_fields text[];
begin
  if v_actor is null
     or p_organization_id is null
     or p_schedule_item_id is null
     or p_target_status not in ('pending','completed','cancelled')
     or p_command_type not in ('complete','reopen','cancel')
     or char_length(v_reason) not between 3 and 500
     or p_expected_version is null
     or p_expected_version < 1
     or p_idempotency_key is null
     or char_length(btrim(p_idempotency_key)) not between 8 and 200 then
    raise exception 'AGROCORE_SCHEDULE_INVALID_INPUT';
  end if;

  if p_command_type = 'complete' then
    if not agrocore_private.can_view_schedule(p_organization_id) then
      raise exception 'AGROCORE_SCHEDULE_FORBIDDEN';
    end if;
  elsif not agrocore_private.can_manage_schedule(p_organization_id) then
    raise exception 'AGROCORE_SCHEDULE_FORBIDDEN';
  end if;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'scheduleItemId', p_schedule_item_id::text,
          'expectedVersion', p_expected_version,
          'targetStatus', p_target_status,
          'commandType', p_command_type,
          'reason', v_reason
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || btrim(p_idempotency_key),
      0
    )
  );

  select *
  into v_receipt
  from agrocore_private.schedule_item_command_receipts r
  where r.organization_id = p_organization_id
    and r.command_key = btrim(p_idempotency_key);

  if found then
    if v_receipt.command_type <> p_command_type
       or v_receipt.schedule_item_id <> p_schedule_item_id
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'AGROCORE_SCHEDULE_IDEMPOTENCY_CONFLICT';
    end if;

    select *
    into v_current
    from public.schedule_items s
    where s.organization_id = p_organization_id
      and s.id = p_schedule_item_id;

    if not found then
      raise exception 'AGROCORE_SCHEDULE_NOT_FOUND';
    end if;

    return v_current;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_schedule_item_id::text,
      0
    )
  );

  select *
  into v_current
  from public.schedule_items s
  where s.organization_id = p_organization_id
    and s.id = p_schedule_item_id
  for update;

  if not found then
    raise exception 'AGROCORE_SCHEDULE_NOT_FOUND';
  end if;

  if v_current.origin_type <> 'manual' then
    raise exception 'AGROCORE_SCHEDULE_SOURCE_OWNED';
  end if;

  if p_command_type = 'complete'
     and not agrocore_private.can_manage_schedule(p_organization_id)
     and v_current.responsible_user_id is distinct from v_actor then
    raise exception 'AGROCORE_SCHEDULE_RESPONSIBLE_MISMATCH';
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'AGROCORE_SCHEDULE_CONCURRENCY_CONFLICT';
  end if;

  if p_command_type = 'complete' then
    if v_current.status not in ('pending','in_progress','blocked')
       or p_target_status <> 'completed' then
      raise exception 'AGROCORE_SCHEDULE_INVALID_TRANSITION';
    end if;
    v_changed_fields := array['status','completed_at'];
  elsif p_command_type = 'cancel' then
    if v_current.status not in ('pending','in_progress','blocked')
       or p_target_status <> 'cancelled' then
      raise exception 'AGROCORE_SCHEDULE_INVALID_TRANSITION';
    end if;
    v_changed_fields := array['status','cancelled_at'];
  else
    if v_current.status not in ('completed','cancelled')
       or p_target_status <> 'pending' then
      raise exception 'AGROCORE_SCHEDULE_INVALID_TRANSITION';
    end if;
    v_changed_fields := array['status','completed_at','cancelled_at'];
  end if;

  update public.schedule_items
  set
    status = p_target_status,
    completed_at = case
      when p_target_status = 'completed' then statement_timestamp()
      else null
    end,
    cancelled_at = case
      when p_target_status = 'cancelled' then statement_timestamp()
      else null
    end,
    updated_by_user_id = v_actor,
    updated_at = statement_timestamp(),
    version = v_current.version + 1
  where id = v_current.id
  returning * into v_updated;

  insert into public.schedule_item_audit (
    organization_id,
    schedule_item_id,
    action,
    actor_user_id,
    item_version,
    changed_fields,
    reason
  ) values (
    p_organization_id,
    p_schedule_item_id,
    'updated',
    v_actor,
    v_updated.version,
    v_changed_fields,
    v_reason
  );

  insert into agrocore_private.schedule_item_command_receipts (
    organization_id,
    schedule_item_id,
    command_type,
    command_key,
    request_fingerprint,
    result_version
  ) values (
    p_organization_id,
    p_schedule_item_id,
    p_command_type,
    btrim(p_idempotency_key),
    v_fingerprint,
    v_updated.version
  );

  return v_updated;
end;
$$;

revoke all on function agrocore_private.transition_schedule_item(
  uuid,uuid,integer,text,text,text,text
) from public, anon, authenticated;

create or replace function public.agrocore_complete_schedule_item(
  p_organization_id uuid,
  p_schedule_item_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_reason text
)
returns public.schedule_items
language sql
volatile
security definer
set search_path = ''
as $$
  select agrocore_private.transition_schedule_item(
    p_organization_id,
    p_schedule_item_id,
    p_expected_version,
    p_idempotency_key,
    'completed',
    'complete',
    p_reason
  );
$$;

create or replace function public.agrocore_reopen_schedule_item(
  p_organization_id uuid,
  p_schedule_item_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_reason text
)
returns public.schedule_items
language sql
volatile
security definer
set search_path = ''
as $$
  select agrocore_private.transition_schedule_item(
    p_organization_id,
    p_schedule_item_id,
    p_expected_version,
    p_idempotency_key,
    'pending',
    'reopen',
    p_reason
  );
$$;

create or replace function public.agrocore_cancel_schedule_item(
  p_organization_id uuid,
  p_schedule_item_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_reason text
)
returns public.schedule_items
language sql
volatile
security definer
set search_path = ''
as $$
  select agrocore_private.transition_schedule_item(
    p_organization_id,
    p_schedule_item_id,
    p_expected_version,
    p_idempotency_key,
    'cancelled',
    'cancel',
    p_reason
  );
$$;

revoke all on function public.agrocore_complete_schedule_item(
  uuid,uuid,integer,text,text
) from public, anon;
revoke all on function public.agrocore_reopen_schedule_item(
  uuid,uuid,integer,text,text
) from public, anon;
revoke all on function public.agrocore_cancel_schedule_item(
  uuid,uuid,integer,text,text
) from public, anon;

grant execute on function public.agrocore_complete_schedule_item(
  uuid,uuid,integer,text,text
) to authenticated;
grant execute on function public.agrocore_reopen_schedule_item(
  uuid,uuid,integer,text,text
) to authenticated;
grant execute on function public.agrocore_cancel_schedule_item(
  uuid,uuid,integer,text,text
) to authenticated;

comment on column public.schedule_items.responsible_user_id is
  'Responsável atual da tarefa/compromisso; deve ser integrante ativo e elegível da mesma organização.';
comment on table public.schedule_item_participants is
  'Participantes ativos da agenda; relação canônica por IDs, sem copiar perfis ou dados pessoais.';
comment on table public.schedule_item_collaboration_revisions is
  'Snapshots append-only da colaboração, contendo apenas IDs, versão, ator e motivo.';
comment on function public.agrocore_list_schedule_members(uuid) is
  'Diretório sanitizado de integrantes ativos elegíveis à Agenda; não expõe email.';
comment on function public.agrocore_set_schedule_collaboration(
  uuid,uuid,integer,text,uuid,uuid[],text
) is
  'Atribui responsável/participantes de forma atômica, concorrente e idempotente.';
comment on function public.agrocore_complete_schedule_item(
  uuid,uuid,integer,text,text
) is
  'Conclusão idempotente: gestão ou responsável atual podem concluir registro manual.';
comment on function public.agrocore_reopen_schedule_item(
  uuid,uuid,integer,text,text
) is
  'Reabertura idempotente restrita à gestão.';
comment on function public.agrocore_cancel_schedule_item(
  uuid,uuid,integer,text,text
) is
  'Cancelamento idempotente restrito à gestão.';
