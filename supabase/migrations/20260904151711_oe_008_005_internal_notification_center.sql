-- AgroCore — OE-008.005 — Central de notificações internas
-- Fonte canônica única de notificações in-app, preferências, validade e contadores reais.
-- Não implementa e-mail, SMS, push externo, filas de entrega ou escalonamento (OE-008.006).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  category text not null check (char_length(btrim(category)) between 3 and 80),
  notification_type text not null check (char_length(btrim(notification_type)) between 3 and 80),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  message text not null check (char_length(btrim(message)) between 3 and 500),
  source_domain text not null check (char_length(btrim(source_domain)) between 3 and 80),
  source_id text not null check (char_length(btrim(source_id)) between 1 and 200),
  source_event_key text not null check (char_length(btrim(source_event_key)) between 8 and 240),
  route text null check (
    route is null
    or (
      char_length(route) between 1 and 500
      and left(route, 1) = '/'
      and left(route, 2) <> '//'
      and position('://' in route) = 0
    )
  ),
  available_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  read_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version >= 1),
  constraint notifications_validity_ck check (expires_at > available_at),
  constraint notifications_read_ck check (read_at is null or read_at >= created_at),
  constraint notifications_event_uq unique (
    organization_id,
    recipient_user_id,
    source_event_key
  )
);

create index if not exists notifications_recipient_active_idx
  on public.notifications (
    organization_id,
    recipient_user_id,
    available_at desc,
    created_at desc
  )
  where read_at is null;

create index if not exists notifications_recipient_expiry_idx
  on public.notifications (
    organization_id,
    recipient_user_id,
    expires_at
  );

create index if not exists notifications_source_idx
  on public.notifications (
    organization_id,
    source_domain,
    source_id,
    notification_type
  );

create table if not exists public.notification_preferences (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  category text not null check (
    category in (
      'schedule_assignment',
      'schedule_deadline',
      'schedule_status'
    )
  ),
  enabled boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version >= 1),
  primary key (organization_id, user_id, category)
);

create index if not exists notification_preferences_user_idx
  on public.notification_preferences (user_id, organization_id);

create table if not exists public.notification_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  notification_id uuid null references public.notifications(id) on delete restrict,
  action text not null check (
    action in ('created', 'read', 'read_all', 'expired', 'preference_changed')
  ),
  category text null check (
    category is null or char_length(btrim(category)) between 3 and 80
  ),
  actor_user_id uuid null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default statement_timestamp(),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);

create index if not exists notification_audit_recipient_idx
  on public.notification_audit (
    organization_id,
    recipient_user_id,
    occurred_at desc
  );

create index if not exists notification_audit_notification_idx
  on public.notification_audit (notification_id)
  where notification_id is not null;

create table if not exists agrocore_private.notification_command_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  command_type text not null check (command_type in ('set_preference')),
  command_key text not null check (char_length(btrim(command_key)) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint) = 64),
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, actor_user_id, command_key)
);

create index if not exists notification_command_receipts_actor_idx
  on agrocore_private.notification_command_receipts (
    actor_user_id,
    organization_id,
    created_at desc
  );

revoke all on agrocore_private.notification_command_receipts
  from public, anon, authenticated;

create or replace function agrocore_private.can_access_notifications(
  p_organization_id uuid
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
      and m.user_id = (select auth.uid())
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

revoke all on function agrocore_private.can_access_notifications(uuid)
  from public, anon, authenticated;
grant execute on function agrocore_private.can_access_notifications(uuid)
  to authenticated;

create or replace function agrocore_private.is_notification_recipient_eligible(
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

revoke all on function agrocore_private.is_notification_recipient_eligible(uuid,uuid)
  from public, anon, authenticated;

create or replace function agrocore_private.notification_category_enabled(
  p_organization_id uuid,
  p_user_id uuid,
  p_category text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.enabled
      from public.notification_preferences p
      where p.organization_id = p_organization_id
        and p.user_id = p_user_id
        and p.category = p_category
    ),
    true
  );
$$;

revoke all on function agrocore_private.notification_category_enabled(uuid,uuid,text)
  from public, anon, authenticated;

create or replace function agrocore_private.schedule_notification_recipients(
  p_organization_id uuid,
  p_schedule_item_id uuid
)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct recipient.user_id
  from (
    select s.created_by_user_id as user_id
    from public.schedule_items s
    where s.organization_id = p_organization_id
      and s.id = p_schedule_item_id

    union all

    select s.responsible_user_id
    from public.schedule_items s
    where s.organization_id = p_organization_id
      and s.id = p_schedule_item_id
      and s.responsible_user_id is not null

    union all

    select p.user_id
    from public.schedule_item_participants p
    where p.organization_id = p_organization_id
      and p.schedule_item_id = p_schedule_item_id
  ) recipient
  where recipient.user_id is not null
    and agrocore_private.is_notification_recipient_eligible(
      p_organization_id,
      recipient.user_id
    );
$$;

revoke all on function agrocore_private.schedule_notification_recipients(uuid,uuid)
  from public, anon, authenticated;

create or replace function agrocore_private.emit_internal_notification(
  p_organization_id uuid,
  p_recipient_user_id uuid,
  p_category text,
  p_notification_type text,
  p_title text,
  p_message text,
  p_source_domain text,
  p_source_id text,
  p_source_event_key text,
  p_route text,
  p_available_at timestamptz,
  p_expires_at timestamptz,
  p_actor_user_id uuid default null,
  p_reactivate boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_organization_id is null
     or p_recipient_user_id is null
     or not agrocore_private.is_notification_recipient_eligible(
       p_organization_id,
       p_recipient_user_id
     )
     or p_category not in (
       'schedule_assignment',
       'schedule_deadline',
       'schedule_status'
     )
     or char_length(btrim(coalesce(p_notification_type, ''))) not between 3 and 80
     or char_length(btrim(coalesce(p_title, ''))) not between 3 and 160
     or char_length(btrim(coalesce(p_message, ''))) not between 3 and 500
     or char_length(btrim(coalesce(p_source_domain, ''))) not between 3 and 80
     or char_length(btrim(coalesce(p_source_id, ''))) not between 1 and 200
     or char_length(btrim(coalesce(p_source_event_key, ''))) not between 8 and 240
     or p_available_at is null
     or p_expires_at is null
     or p_expires_at <= p_available_at
     or (
       p_route is not null
       and (
         char_length(p_route) not between 1 and 500
         or left(p_route, 1) <> '/'
         or left(p_route, 2) = '//'
         or position('://' in p_route) > 0
       )
     ) then
    raise exception 'AGROCORE_NOTIFICATION_INVALID_INPUT';
  end if;

  insert into public.notifications (
    organization_id,
    recipient_user_id,
    category,
    notification_type,
    title,
    message,
    source_domain,
    source_id,
    source_event_key,
    route,
    available_at,
    expires_at,
    read_at,
    created_at,
    version
  ) values (
    p_organization_id,
    p_recipient_user_id,
    btrim(p_category),
    btrim(p_notification_type),
    btrim(p_title),
    btrim(p_message),
    btrim(p_source_domain),
    btrim(p_source_id),
    btrim(p_source_event_key),
    p_route,
    p_available_at,
    p_expires_at,
    null,
    statement_timestamp(),
    1
  )
  on conflict (organization_id, recipient_user_id, source_event_key)
  do update set
    category = excluded.category,
    notification_type = excluded.notification_type,
    title = excluded.title,
    message = excluded.message,
    route = excluded.route,
    available_at = excluded.available_at,
    expires_at = excluded.expires_at,
    read_at = case
      when p_reactivate then null
      else public.notifications.read_at
    end,
    version = public.notifications.version + 1
  where p_reactivate
    and (
      public.notifications.available_at is distinct from excluded.available_at
      or public.notifications.expires_at is distinct from excluded.expires_at
      or public.notifications.read_at is not null
      or public.notifications.title is distinct from excluded.title
      or public.notifications.message is distinct from excluded.message
      or public.notifications.route is distinct from excluded.route
    )
  returning id into v_id;

  if v_id is not null and not exists (
    select 1
    from public.notification_audit a
    where a.notification_id = v_id
      and a.action = 'created'
  ) then
    insert into public.notification_audit (
      organization_id,
      recipient_user_id,
      notification_id,
      action,
      category,
      actor_user_id,
      details
    ) values (
      p_organization_id,
      p_recipient_user_id,
      v_id,
      'created',
      p_category,
      p_actor_user_id,
      jsonb_build_object(
        'sourceDomain', p_source_domain,
        'sourceId', p_source_id,
        'eventKey', p_source_event_key
      )
    );
  end if;

  if v_id is null then
    select n.id
    into v_id
    from public.notifications n
    where n.organization_id = p_organization_id
      and n.recipient_user_id = p_recipient_user_id
      and n.source_event_key = p_source_event_key;
  end if;

  return v_id;
end;
$$;

revoke all on function agrocore_private.emit_internal_notification(
  uuid,uuid,text,text,text,text,text,text,text,text,timestamptz,timestamptz,uuid,boolean
) from public, anon, authenticated;

create or replace function agrocore_private.expire_schedule_notifications(
  p_organization_id uuid,
  p_recipient_user_id uuid,
  p_source_domain text,
  p_source_id text,
  p_notification_type text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  for v_row in
    update public.notifications n
    set
      expires_at = greatest(n.available_at + interval '1 second', statement_timestamp()),
      version = n.version + 1
    where n.organization_id = p_organization_id
      and n.recipient_user_id = p_recipient_user_id
      and n.source_domain = p_source_domain
      and n.source_id = p_source_id
      and n.notification_type = p_notification_type
      and n.expires_at > statement_timestamp()
    returning n.id, n.category
  loop
    insert into public.notification_audit (
      organization_id,
      recipient_user_id,
      notification_id,
      action,
      category,
      actor_user_id,
      details
    ) values (
      p_organization_id,
      p_recipient_user_id,
      v_row.id,
      'expired',
      v_row.category,
      (select auth.uid()),
      jsonb_build_object('reason', 'source_state_changed')
    );
  end loop;
end;
$$;

revoke all on function agrocore_private.expire_schedule_notifications(
  uuid,uuid,text,text,text
) from public, anon, authenticated;

create or replace function agrocore_private.notify_schedule_item_assignment()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old_responsible uuid;
  v_event_key text;
begin
  v_old_responsible := case when tg_op = 'UPDATE' then old.responsible_user_id else null end;

  if v_old_responsible is not null
     and v_old_responsible is distinct from new.responsible_user_id then
    perform agrocore_private.expire_schedule_notifications(
      new.organization_id,
      v_old_responsible,
      'schedule_item',
      new.id::text,
      'schedule_assignment'
    );
  end if;

  if new.responsible_user_id is not null
     and (
       tg_op = 'INSERT'
       or new.responsible_user_id is distinct from v_old_responsible
     ) then
    v_event_key :=
      'schedule-assignment:item:' || new.id::text ||
      ':responsible:' || new.responsible_user_id::text;

    perform agrocore_private.emit_internal_notification(
      new.organization_id,
      new.responsible_user_id,
      'schedule_assignment',
      'schedule_assignment',
      'Nova responsabilidade na agenda',
      'Você foi definido como responsável por um item da agenda corporativa.',
      'schedule_item',
      new.id::text,
      v_event_key,
      '/agenda',
      statement_timestamp(),
      statement_timestamp() + interval '30 days',
      new.updated_by_user_id,
      true
    );
  end if;

  return new;
end;
$$;

revoke all on function agrocore_private.notify_schedule_item_assignment()
  from public, anon, authenticated;

drop trigger if exists agrocore_notify_schedule_item_assignment
  on public.schedule_items;

create trigger agrocore_notify_schedule_item_assignment
after insert or update of responsible_user_id
on public.schedule_items
for each row
execute function agrocore_private.notify_schedule_item_assignment();

create or replace function agrocore_private.notify_schedule_participant()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_key text;
begin
  if tg_op = 'DELETE' then
    perform agrocore_private.expire_schedule_notifications(
      old.organization_id,
      old.user_id,
      'schedule_item',
      old.schedule_item_id::text,
      'schedule_assignment'
    );

    perform agrocore_private.expire_schedule_notifications(
      old.organization_id,
      old.user_id,
      'schedule_item',
      old.schedule_item_id::text,
      'schedule_deadline'
    );
    return old;
  end if;

  v_event_key :=
    'schedule-assignment:item:' || new.schedule_item_id::text ||
    ':participant:' || new.user_id::text;

  perform agrocore_private.emit_internal_notification(
    new.organization_id,
    new.user_id,
    'schedule_assignment',
    'schedule_assignment',
    'Nova participação na agenda',
    'Você foi incluído como participante de um item da agenda corporativa.',
    'schedule_item',
    new.schedule_item_id::text,
    v_event_key,
    '/agenda',
    statement_timestamp(),
    statement_timestamp() + interval '30 days',
    new.added_by_user_id,
    true
  );

  return new;
end;
$$;

revoke all on function agrocore_private.notify_schedule_participant()
  from public, anon, authenticated;

drop trigger if exists agrocore_notify_schedule_participant
  on public.schedule_item_participants;

create trigger agrocore_notify_schedule_participant
after insert or delete
on public.schedule_item_participants
for each row
execute function agrocore_private.notify_schedule_participant();

create or replace function agrocore_private.notify_schedule_item_deadline_and_status()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_instant timestamptz;
  v_event_key text;
  v_status_message text;
  v_relevant_change boolean;
begin
  v_relevant_change :=
    tg_op = 'INSERT'
    or old.due_at is distinct from new.due_at
    or old.starts_at is distinct from new.starts_at
    or old.recurrence is distinct from new.recurrence
    or old.status is distinct from new.status;

  if not v_relevant_change then
    return new;
  end if;

  for v_recipient in
    select *
    from agrocore_private.schedule_notification_recipients(
      new.organization_id,
      new.id
    )
  loop
    perform agrocore_private.expire_schedule_notifications(
      new.organization_id,
      v_recipient,
      'schedule_item',
      new.id::text,
      'schedule_deadline'
    );
  end loop;

  if new.status not in ('completed', 'cancelled')
     and coalesce(new.recurrence ->> 'frequency', 'none') = 'none' then
    v_instant := coalesce(new.due_at, new.starts_at);

    if v_instant is not null then
      for v_recipient in
        select *
        from agrocore_private.schedule_notification_recipients(
          new.organization_id,
          new.id
        )
      loop
        v_event_key :=
          'schedule-deadline:item:' || new.id::text ||
          ':v' || new.version::text ||
          ':' || v_recipient::text;

        perform agrocore_private.emit_internal_notification(
          new.organization_id,
          v_recipient,
          'schedule_deadline',
          'schedule_deadline',
          'Prazo da agenda',
          'Um prazo relacionado à sua agenda corporativa chegou ao horário programado.',
          'schedule_item',
          new.id::text,
          v_event_key,
          '/agenda',
          v_instant,
          v_instant + interval '30 days',
          new.updated_by_user_id,
          false
        );
      end loop;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.status is distinct from new.status then
    v_status_message := case new.status
      when 'completed' then 'Um item relacionado a você foi concluído.'
      when 'cancelled' then 'Um item relacionado a você foi cancelado.'
      when 'pending' then 'Um item relacionado a você voltou para pendente.'
      when 'in_progress' then 'Um item relacionado a você entrou em andamento.'
      when 'blocked' then 'Um item relacionado a você foi marcado como bloqueado.'
      else 'A situação de um item relacionado a você foi alterada.'
    end;

    for v_recipient in
      select *
      from agrocore_private.schedule_notification_recipients(
        new.organization_id,
        new.id
      )
    loop
      if v_recipient is distinct from new.updated_by_user_id then
        v_event_key :=
          'schedule-status:item:' || new.id::text ||
          ':v' || new.version::text ||
          ':' || v_recipient::text;

        perform agrocore_private.emit_internal_notification(
          new.organization_id,
          v_recipient,
          'schedule_status',
          'schedule_status',
          'Agenda atualizada',
          v_status_message,
          'schedule_item',
          new.id::text,
          v_event_key,
          '/agenda',
          statement_timestamp(),
          statement_timestamp() + interval '30 days',
          new.updated_by_user_id,
          false
        );
      end if;
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function agrocore_private.notify_schedule_item_deadline_and_status()
  from public, anon, authenticated;

drop trigger if exists agrocore_notify_schedule_item_deadline_status
  on public.schedule_items;

create trigger agrocore_notify_schedule_item_deadline_status
after insert or update of due_at, starts_at, recurrence, status
on public.schedule_items
for each row
execute function agrocore_private.notify_schedule_item_deadline_and_status();

create or replace function agrocore_private.notify_schedule_occurrence_deadline()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_event_key text;
begin
  if tg_op = 'UPDATE'
     and old.scheduled_at is not distinct from new.scheduled_at
     and old.status is not distinct from new.status
     and old.source_item_version is not distinct from new.source_item_version then
    return new;
  end if;

  for v_recipient in
    select *
    from agrocore_private.schedule_notification_recipients(
      new.organization_id,
      new.schedule_item_id
    )
  loop
    perform agrocore_private.expire_schedule_notifications(
      new.organization_id,
      v_recipient,
      'schedule_occurrence',
      new.id::text,
      'schedule_deadline'
    );

    if new.status = 'pending' then
      v_event_key :=
        'schedule-deadline:occurrence:' || new.id::text ||
        ':v' || new.version::text ||
        ':' || v_recipient::text;

      perform agrocore_private.emit_internal_notification(
        new.organization_id,
        v_recipient,
        'schedule_deadline',
        'schedule_deadline',
        'Prazo recorrente da agenda',
        'Uma ocorrência recorrente relacionada à sua agenda chegou ao horário programado.',
        'schedule_occurrence',
        new.id::text,
        v_event_key,
        '/agenda',
        new.scheduled_at,
        new.scheduled_at + interval '30 days',
        null,
        false
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function agrocore_private.notify_schedule_occurrence_deadline()
  from public, anon, authenticated;

drop trigger if exists agrocore_notify_schedule_occurrence_deadline
  on public.schedule_item_occurrences;

create trigger agrocore_notify_schedule_occurrence_deadline
after insert or update of scheduled_at, status, source_item_version
on public.schedule_item_occurrences
for each row
execute function agrocore_private.notify_schedule_occurrence_deadline();

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_audit enable row level security;

drop policy if exists "agrocore_notifications_select"
  on public.notifications;
create policy "agrocore_notifications_select"
on public.notifications
for select
to authenticated
using (
  recipient_user_id = (select auth.uid())
  and (select agrocore_private.can_access_notifications(organization_id))
);

drop policy if exists "agrocore_notification_preferences_select"
  on public.notification_preferences;
create policy "agrocore_notification_preferences_select"
on public.notification_preferences
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select agrocore_private.can_access_notifications(organization_id))
);

drop policy if exists "agrocore_notification_audit_select"
  on public.notification_audit;
create policy "agrocore_notification_audit_select"
on public.notification_audit
for select
to authenticated
using (
  recipient_user_id = (select auth.uid())
  and (select agrocore_private.can_access_notifications(organization_id))
);

revoke all on public.notifications from public, anon;
revoke all on public.notification_preferences from public, anon;
revoke all on public.notification_audit from public, anon;

revoke insert, update, delete, truncate, references, trigger
  on public.notifications from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.notification_preferences from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.notification_audit from authenticated;

grant select on public.notifications to authenticated;
grant select on public.notification_preferences to authenticated;
grant select on public.notification_audit to authenticated;

create or replace function public.agrocore_notification_snapshot(
  p_organization_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_notifications jsonb;
  v_unread_count bigint;
begin
  if v_actor is null
     or p_organization_id is null
     or p_limit is null
     or p_limit not between 1 and 100
     or not agrocore_private.can_access_notifications(p_organization_id) then
    raise exception 'AGROCORE_NOTIFICATION_FORBIDDEN';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'organizationId', q.organization_id,
        'recipientUserId', q.recipient_user_id,
        'category', q.category,
        'type', q.notification_type,
        'title', q.title,
        'message', q.message,
        'sourceDomain', q.source_domain,
        'sourceId', q.source_id,
        'sourceEventKey', q.source_event_key,
        'route', q.route,
        'availableAt', q.available_at,
        'expiresAt', q.expires_at,
        'readAt', q.read_at,
        'createdAt', q.created_at,
        'version', q.version
      )
      order by q.available_at desc, q.created_at desc, q.id desc
    ),
    '[]'::jsonb
  )
  into v_notifications
  from (
    select n.*
    from public.notifications n
    where n.organization_id = p_organization_id
      and n.recipient_user_id = v_actor
      and n.available_at <= statement_timestamp()
      and n.expires_at > statement_timestamp()
      and agrocore_private.notification_category_enabled(
        n.organization_id,
        n.recipient_user_id,
        n.category
      )
    order by n.available_at desc, n.created_at desc, n.id desc
    limit p_limit
  ) q;

  select count(*)
  into v_unread_count
  from public.notifications n
  where n.organization_id = p_organization_id
    and n.recipient_user_id = v_actor
    and n.read_at is null
    and n.available_at <= statement_timestamp()
    and n.expires_at > statement_timestamp()
    and agrocore_private.notification_category_enabled(
      n.organization_id,
      n.recipient_user_id,
      n.category
    );

  return jsonb_build_object(
    'notifications', v_notifications,
    'unreadCount', v_unread_count
  );
end;
$$;

revoke all on function public.agrocore_notification_snapshot(uuid,integer)
  from public, anon;
grant execute on function public.agrocore_notification_snapshot(uuid,integer)
  to authenticated;

create or replace function public.agrocore_get_notification_preferences(
  p_organization_id uuid
)
returns table (
  category text,
  enabled boolean,
  version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null
     or p_organization_id is null
     or not agrocore_private.can_access_notifications(p_organization_id) then
    raise exception 'AGROCORE_NOTIFICATION_FORBIDDEN';
  end if;

  return query
  with categories(category) as (
    values
      ('schedule_assignment'::text),
      ('schedule_deadline'::text),
      ('schedule_status'::text)
  )
  select
    c.category,
    coalesce(p.enabled, true) as enabled,
    coalesce(p.version, 0) as version
  from categories c
  left join public.notification_preferences p
    on p.organization_id = p_organization_id
   and p.user_id = v_actor
   and p.category = c.category
  order by c.category;
end;
$$;

revoke all on function public.agrocore_get_notification_preferences(uuid)
  from public, anon;
grant execute on function public.agrocore_get_notification_preferences(uuid)
  to authenticated;

create or replace function public.agrocore_set_notification_preference(
  p_organization_id uuid,
  p_category text,
  p_enabled boolean,
  p_expected_version integer,
  p_idempotency_key text
)
returns public.notification_preferences
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current public.notification_preferences%rowtype;
  v_updated public.notification_preferences%rowtype;
  v_receipt agrocore_private.notification_command_receipts%rowtype;
  v_fingerprint text;
begin
  if v_actor is null
     or p_organization_id is null
     or p_category not in (
       'schedule_assignment',
       'schedule_deadline',
       'schedule_status'
     )
     or p_enabled is null
     or p_expected_version is null
     or p_expected_version < 0
     or char_length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200
     or not agrocore_private.can_access_notifications(p_organization_id) then
    raise exception 'AGROCORE_NOTIFICATION_INVALID_INPUT_OR_FORBIDDEN';
  end if;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'category', p_category,
          'enabled', p_enabled,
          'expectedVersion', p_expected_version
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || v_actor::text || ':' ||
      btrim(p_idempotency_key),
      0
    )
  );

  select *
  into v_receipt
  from agrocore_private.notification_command_receipts r
  where r.organization_id = p_organization_id
    and r.actor_user_id = v_actor
    and r.command_key = btrim(p_idempotency_key);

  if found then
    if v_receipt.command_type <> 'set_preference'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'AGROCORE_NOTIFICATION_IDEMPOTENCY_CONFLICT';
    end if;

    return jsonb_populate_record(
      null::public.notification_preferences,
      v_receipt.result_snapshot
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || v_actor::text || ':' || p_category,
      0
    )
  );

  select *
  into v_current
  from public.notification_preferences p
  where p.organization_id = p_organization_id
    and p.user_id = v_actor
    and p.category = p_category
  for update;

  if found then
    if v_current.version <> p_expected_version then
      raise exception 'AGROCORE_NOTIFICATION_CONCURRENCY_CONFLICT';
    end if;

    update public.notification_preferences
    set
      enabled = p_enabled,
      updated_at = statement_timestamp(),
      version = version + 1
    where organization_id = p_organization_id
      and user_id = v_actor
      and category = p_category
    returning * into v_updated;
  else
    if p_expected_version <> 0 then
      raise exception 'AGROCORE_NOTIFICATION_CONCURRENCY_CONFLICT';
    end if;

    insert into public.notification_preferences (
      organization_id,
      user_id,
      category,
      enabled
    ) values (
      p_organization_id,
      v_actor,
      p_category,
      p_enabled
    )
    returning * into v_updated;
  end if;

  insert into public.notification_audit (
    organization_id,
    recipient_user_id,
    notification_id,
    action,
    category,
    actor_user_id,
    details
  ) values (
    p_organization_id,
    v_actor,
    null,
    'preference_changed',
    p_category,
    v_actor,
    jsonb_build_object(
      'enabled', p_enabled,
      'version', v_updated.version
    )
  );

  insert into agrocore_private.notification_command_receipts (
    organization_id,
    actor_user_id,
    command_type,
    command_key,
    request_fingerprint,
    result_snapshot
  ) values (
    p_organization_id,
    v_actor,
    'set_preference',
    btrim(p_idempotency_key),
    v_fingerprint,
    to_jsonb(v_updated)
  );

  return v_updated;
end;
$$;

revoke all on function public.agrocore_set_notification_preference(
  uuid,text,boolean,integer,text
) from public, anon;
grant execute on function public.agrocore_set_notification_preference(
  uuid,text,boolean,integer,text
) to authenticated;

create or replace function public.agrocore_mark_notification_read(
  p_organization_id uuid,
  p_notification_id uuid
)
returns public.notifications
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current public.notifications%rowtype;
begin
  if v_actor is null
     or p_organization_id is null
     or p_notification_id is null
     or not agrocore_private.can_access_notifications(p_organization_id) then
    raise exception 'AGROCORE_NOTIFICATION_FORBIDDEN';
  end if;

  select *
  into v_current
  from public.notifications n
  where n.organization_id = p_organization_id
    and n.id = p_notification_id
    and n.recipient_user_id = v_actor
  for update;

  if not found then
    raise exception 'AGROCORE_NOTIFICATION_NOT_FOUND';
  end if;

  if v_current.read_at is null then
    update public.notifications
    set
      read_at = statement_timestamp(),
      version = version + 1
    where organization_id = p_organization_id
      and id = p_notification_id
      and recipient_user_id = v_actor
    returning * into v_current;

    insert into public.notification_audit (
      organization_id,
      recipient_user_id,
      notification_id,
      action,
      category,
      actor_user_id,
      details
    ) values (
      p_organization_id,
      v_actor,
      p_notification_id,
      'read',
      v_current.category,
      v_actor,
      '{}'::jsonb
    );
  end if;

  return v_current;
end;
$$;

revoke all on function public.agrocore_mark_notification_read(uuid,uuid)
  from public, anon;
grant execute on function public.agrocore_mark_notification_read(uuid,uuid)
  to authenticated;

create or replace function public.agrocore_mark_all_notifications_read(
  p_organization_id uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_row record;
  v_count integer := 0;
begin
  if v_actor is null
     or p_organization_id is null
     or not agrocore_private.can_access_notifications(p_organization_id) then
    raise exception 'AGROCORE_NOTIFICATION_FORBIDDEN';
  end if;

  for v_row in
    update public.notifications n
    set
      read_at = statement_timestamp(),
      version = n.version + 1
    where n.organization_id = p_organization_id
      and n.recipient_user_id = v_actor
      and n.read_at is null
      and n.available_at <= statement_timestamp()
      and n.expires_at > statement_timestamp()
      and agrocore_private.notification_category_enabled(
        n.organization_id,
        n.recipient_user_id,
        n.category
      )
    returning n.id, n.category
  loop
    v_count := v_count + 1;
    insert into public.notification_audit (
      organization_id,
      recipient_user_id,
      notification_id,
      action,
      category,
      actor_user_id,
      details
    ) values (
      p_organization_id,
      v_actor,
      v_row.id,
      'read_all',
      v_row.category,
      v_actor,
      '{}'::jsonb
    );
  end loop;

  return v_count;
end;
$$;

revoke all on function public.agrocore_mark_all_notifications_read(uuid)
  from public, anon;
grant execute on function public.agrocore_mark_all_notifications_read(uuid)
  to authenticated;

create or replace function public.agrocore_sync_internal_notifications(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_item record;
  v_count integer := 0;
  v_event_key text;
  v_instant timestamptz;
  v_occurrence record;
begin
  if v_actor is null
     or p_organization_id is null
     or p_from is null
     or p_to is null
     or p_to <= p_from
     or p_to - p_from > interval '62 days'
     or not agrocore_private.can_access_notifications(p_organization_id) then
    raise exception 'AGROCORE_NOTIFICATION_FORBIDDEN_OR_INVALID_WINDOW';
  end if;

  for v_item in
    select distinct s.*
    from public.schedule_items s
    left join public.schedule_item_participants p
      on p.organization_id = s.organization_id
     and p.schedule_item_id = s.id
     and p.user_id = v_actor
    where s.organization_id = p_organization_id
      and (
        s.created_by_user_id = v_actor
        or s.responsible_user_id = v_actor
        or p.user_id = v_actor
      )
  loop
    if v_item.responsible_user_id = v_actor then
      v_event_key :=
        'schedule-assignment:item:' || v_item.id::text ||
        ':responsible:' || v_actor::text;

      perform agrocore_private.emit_internal_notification(
        p_organization_id,
        v_actor,
        'schedule_assignment',
        'schedule_assignment',
        'Responsabilidade na agenda',
        'Você está definido como responsável por um item da agenda corporativa.',
        'schedule_item',
        v_item.id::text,
        v_event_key,
        '/agenda',
        statement_timestamp(),
        statement_timestamp() + interval '30 days',
        null,
        false
      );
      v_count := v_count + 1;
    elsif exists (
      select 1
      from public.schedule_item_participants p
      where p.organization_id = p_organization_id
        and p.schedule_item_id = v_item.id
        and p.user_id = v_actor
    ) then
      v_event_key :=
        'schedule-assignment:item:' || v_item.id::text ||
        ':participant:' || v_actor::text;

      perform agrocore_private.emit_internal_notification(
        p_organization_id,
        v_actor,
        'schedule_assignment',
        'schedule_assignment',
        'Participação na agenda',
        'Você participa de um item da agenda corporativa.',
        'schedule_item',
        v_item.id::text,
        v_event_key,
        '/agenda',
        statement_timestamp(),
        statement_timestamp() + interval '30 days',
        null,
        false
      );
      v_count := v_count + 1;
    end if;

    if v_item.status not in ('completed', 'cancelled') then
      if coalesce(v_item.recurrence ->> 'frequency', 'none') = 'none' then
        v_instant := coalesce(v_item.due_at, v_item.starts_at);

        if v_instant is not null
           and v_instant >= p_from
           and v_instant < p_to then
          v_event_key :=
            'schedule-deadline:item:' || v_item.id::text ||
            ':v' || v_item.version::text ||
            ':' || v_actor::text;

          perform agrocore_private.emit_internal_notification(
            p_organization_id,
            v_actor,
            'schedule_deadline',
            'schedule_deadline',
            'Prazo da agenda',
            'Um prazo relacionado à sua agenda corporativa chegou ao horário programado.',
            'schedule_item',
            v_item.id::text,
            v_event_key,
            '/agenda',
            v_instant,
            v_instant + interval '30 days',
            null,
            false
          );
          v_count := v_count + 1;
        end if;
      else
        perform public.agrocore_materialize_schedule_occurrences(
          p_organization_id,
          v_item.id,
          p_from,
          p_to
        );

        for v_occurrence in
          select o.id, o.scheduled_at, o.version
          from public.schedule_item_occurrences o
          where o.organization_id = p_organization_id
            and o.schedule_item_id = v_item.id
            and o.status = 'pending'
            and o.scheduled_at >= p_from
            and o.scheduled_at < p_to
          order by o.scheduled_at, o.id
        loop
          v_event_key :=
            'schedule-deadline:occurrence:' || v_occurrence.id::text ||
            ':v' || v_occurrence.version::text ||
            ':' || v_actor::text;

          perform agrocore_private.emit_internal_notification(
            p_organization_id,
            v_actor,
            'schedule_deadline',
            'schedule_deadline',
            'Prazo recorrente da agenda',
            'Uma ocorrência recorrente relacionada à sua agenda chegou ao horário programado.',
            'schedule_occurrence',
            v_occurrence.id::text,
            v_event_key,
            '/agenda',
            v_occurrence.scheduled_at,
            v_occurrence.scheduled_at + interval '30 days',
            null,
            false
          );
          v_count := v_count + 1;
        end loop;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.agrocore_sync_internal_notifications(
  uuid,timestamptz,timestamptz
) from public, anon;
grant execute on function public.agrocore_sync_internal_notifications(
  uuid,timestamptz,timestamptz
) to authenticated;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;

  if exists (
    select 1 from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_preferences'
  ) then
    execute 'alter publication supabase_realtime add table public.notification_preferences';
  end if;
end;
$$;
