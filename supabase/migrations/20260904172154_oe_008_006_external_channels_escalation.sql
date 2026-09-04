-- AgroCore — OE-008.006 — Canais externos e escalonamento
-- Fila derivada da Central interna da OE-008.005. Não cria segunda fonte de eventos.
-- E-mail e Web Push são opcionais, assíncronos e fail-closed quando o provedor não está configurado.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.notification_external_preferences (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  channel text not null check (channel in ('email', 'push')),
  enabled boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version >= 1),
  primary key (organization_id, user_id, channel)
);

create index if not exists notification_external_preferences_user_idx
  on public.notification_external_preferences (user_id, organization_id);

create table if not exists public.notification_escalation_policies (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  category text not null check (
    category in ('schedule_assignment', 'schedule_deadline', 'schedule_status')
  ),
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,
  minimum_priority text not null default 'high'
    check (minimum_priority in ('low', 'medium', 'high', 'urgent')),
  critical_priority text not null default 'urgent'
    check (critical_priority in ('low', 'medium', 'high', 'urgent')),
  delay_minutes integer not null default 30
    check (delay_minutes between 0 and 10080),
  critical_delay_minutes integer not null default 0
    check (critical_delay_minutes between 0 and 1440),
  max_attempts integer not null default 5
    check (max_attempts between 1 and 10),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version >= 1),
  primary key (organization_id, category),
  constraint notification_escalation_priority_ck check (
    (case critical_priority
      when 'low' then 1 when 'medium' then 2 when 'high' then 3 when 'urgent' then 4
    end)
    >=
    (case minimum_priority
      when 'low' then 1 when 'medium' then 2 when 'high' then 3 when 'urgent' then 4
    end)
  )
);

create table if not exists agrocore_private.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  endpoint text not null check (char_length(endpoint) between 12 and 2048),
  endpoint_hash text not null check (char_length(endpoint_hash) = 64),
  p256dh text not null check (char_length(p256dh) between 20 and 512),
  auth_secret text not null check (char_length(auth_secret) between 8 and 256),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  last_success_at timestamptz null,
  revoked_at timestamptz null,
  version integer not null default 1 check (version >= 1),
  unique (organization_id, user_id, endpoint_hash)
);

create index if not exists notification_push_subscriptions_active_idx
  on agrocore_private.notification_push_subscriptions (
    organization_id, user_id, updated_at desc
  ) where revoked_at is null;

create table if not exists agrocore_private.notification_external_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  notification_id uuid not null references public.notifications(id) on delete restrict,
  notification_version integer not null check (notification_version >= 1),
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  channel text not null check (channel in ('email', 'push')),
  push_subscription_id uuid null references agrocore_private.notification_push_subscriptions(id) on delete restrict,
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'retry', 'blocked', 'delivered', 'failed', 'suppressed', 'expired')
  ),
  scheduled_at timestamptz not null,
  next_attempt_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null check (max_attempts between 1 and 10),
  lease_token uuid null,
  lease_expires_at timestamptz null,
  delivered_at timestamptz null,
  last_http_status integer null check (
    last_http_status is null or last_http_status between 100 and 599
  ),
  last_error_code text null check (
    last_error_code is null or char_length(last_error_code) between 2 and 80
  ),
  provider_message_id text null check (
    provider_message_id is null or char_length(provider_message_id) between 1 and 200
  ),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint notification_delivery_push_target_ck check (
    (channel = 'email' and push_subscription_id is null)
    or (channel = 'push' and push_subscription_id is not null)
  )
);

create unique index if not exists notification_external_delivery_email_uq
  on agrocore_private.notification_external_deliveries (
    notification_id, notification_version
  ) where channel = 'email';

create unique index if not exists notification_external_delivery_push_uq
  on agrocore_private.notification_external_deliveries (
    notification_id, notification_version, push_subscription_id
  ) where channel = 'push';

create index if not exists notification_external_delivery_due_idx
  on agrocore_private.notification_external_deliveries (
    next_attempt_at, priority desc, created_at
  ) where status in ('queued', 'retry', 'blocked');

create index if not exists notification_external_delivery_recipient_idx
  on agrocore_private.notification_external_deliveries (
    organization_id, recipient_user_id, created_at desc
  );

create table if not exists agrocore_private.notification_external_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references agrocore_private.notification_external_deliveries(id) on delete restrict,
  attempt_number integer not null check (attempt_number >= 1),
  outcome text not null check (
    outcome in ('delivered', 'transient_failure', 'permanent_failure')
  ),
  http_status integer null check (
    http_status is null or http_status between 100 and 599
  ),
  error_code text null check (
    error_code is null or char_length(error_code) between 2 and 80
  ),
  provider_message_id text null check (
    provider_message_id is null or char_length(provider_message_id) between 1 and 200
  ),
  occurred_at timestamptz not null default statement_timestamp(),
  unique (delivery_id, attempt_number)
);

create index if not exists notification_external_attempts_delivery_idx
  on agrocore_private.notification_external_attempts (delivery_id, occurred_at desc);

create table if not exists agrocore_private.notification_external_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid null references auth.users(id) on delete restrict,
  recipient_user_id uuid null references auth.users(id) on delete restrict,
  notification_id uuid null references public.notifications(id) on delete restrict,
  delivery_id uuid null references agrocore_private.notification_external_deliveries(id) on delete restrict,
  action text not null check (
    action in (
      'preference_changed', 'policy_changed',
      'push_subscription_registered', 'push_subscription_revoked',
      'enqueued', 'blocked', 'delivered', 'retry_scheduled',
      'failed', 'suppressed', 'expired'
    )
  ),
  occurred_at timestamptz not null default statement_timestamp(),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);

create index if not exists notification_external_audit_org_idx
  on agrocore_private.notification_external_audit (
    organization_id, occurred_at desc
  );

create table if not exists agrocore_private.notification_external_command_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  command_type text not null check (
    command_type in ('set_external_preference', 'set_escalation_policy')
  ),
  command_key text not null check (char_length(btrim(command_key)) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint) = 64),
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, actor_user_id, command_key)
);

create table if not exists agrocore_private.notification_worker_credentials (
  worker_name text primary key check (worker_name = 'external-delivery'),
  token_hash text not null check (char_length(token_hash) = 64),
  created_at timestamptz not null default statement_timestamp(),
  rotated_at timestamptz not null default statement_timestamp()
);

revoke all on agrocore_private.notification_push_subscriptions,
  agrocore_private.notification_external_deliveries,
  agrocore_private.notification_external_attempts,
  agrocore_private.notification_external_audit,
  agrocore_private.notification_external_command_receipts,
  agrocore_private.notification_worker_credentials
from public, anon, authenticated;

create or replace function agrocore_private.notification_priority_rank(p_priority text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_priority
    when 'low' then 1
    when 'medium' then 2
    when 'high' then 3
    when 'urgent' then 4
    else 0
  end;
$$;

revoke all on function agrocore_private.notification_priority_rank(text)
  from public, anon, authenticated;

create or replace function agrocore_private.resolve_notification_priority(
  p_organization_id uuid,
  p_source_domain text,
  p_source_id text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_priority text;
begin
  if p_source_id is null or p_source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return 'medium';
  end if;

  if p_source_domain = 'schedule_item' then
    select s.priority
    into v_priority
    from public.schedule_items s
    where s.organization_id = p_organization_id
      and s.id = p_source_id::uuid;
  elsif p_source_domain = 'schedule_occurrence' then
    select s.priority
    into v_priority
    from public.schedule_item_occurrences o
    join public.schedule_items s
      on s.organization_id = o.organization_id
     and s.id = o.schedule_item_id
    where o.organization_id = p_organization_id
      and o.id = p_source_id::uuid;
  end if;

  return coalesce(v_priority, 'medium');
end;
$$;

revoke all on function agrocore_private.resolve_notification_priority(uuid,text,text)
  from public, anon, authenticated;

create or replace function agrocore_private.external_channel_enabled(
  p_organization_id uuid,
  p_user_id uuid,
  p_channel text
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
      from public.notification_external_preferences p
      where p.organization_id = p_organization_id
        and p.user_id = p_user_id
        and p.channel = p_channel
    ),
    false
  );
$$;

revoke all on function agrocore_private.external_channel_enabled(uuid,uuid,text)
  from public, anon, authenticated;

create or replace function agrocore_private.enqueue_external_notification(
  p_notification_id uuid,
  p_notification_version integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_notification public.notifications%rowtype;
  v_policy public.notification_escalation_policies%rowtype;
  v_priority text;
  v_delay integer;
  v_scheduled_at timestamptz;
  v_subscription record;
  v_count integer := 0;
  v_delivery_id uuid;
begin
  select * into v_notification
  from public.notifications n
  where n.id = p_notification_id;

  if not found
     or v_notification.version <> p_notification_version
     or v_notification.read_at is not null
     or v_notification.expires_at <= statement_timestamp()
     or not agrocore_private.is_notification_recipient_eligible(
       v_notification.organization_id, v_notification.recipient_user_id
     )
     or not agrocore_private.notification_category_enabled(
       v_notification.organization_id,
       v_notification.recipient_user_id,
       v_notification.category
     ) then
    return 0;
  end if;

  select * into v_policy
  from public.notification_escalation_policies p
  where p.organization_id = v_notification.organization_id
    and p.category = v_notification.category;

  if not found or (not v_policy.email_enabled and not v_policy.push_enabled) then
    return 0;
  end if;

  v_priority := agrocore_private.resolve_notification_priority(
    v_notification.organization_id,
    v_notification.source_domain,
    v_notification.source_id
  );

  if agrocore_private.notification_priority_rank(v_priority)
       < agrocore_private.notification_priority_rank(v_policy.minimum_priority) then
    return 0;
  end if;

  v_delay := case
    when agrocore_private.notification_priority_rank(v_priority)
      >= agrocore_private.notification_priority_rank(v_policy.critical_priority)
    then v_policy.critical_delay_minutes
    else v_policy.delay_minutes
  end;
  v_scheduled_at := v_notification.available_at + make_interval(mins => v_delay);
  if v_scheduled_at >= v_notification.expires_at then return 0; end if;

  if v_policy.email_enabled and agrocore_private.external_channel_enabled(
    v_notification.organization_id, v_notification.recipient_user_id, 'email'
  ) then
    v_delivery_id := null;
    insert into agrocore_private.notification_external_deliveries (
      organization_id, notification_id, notification_version,
      recipient_user_id, channel, push_subscription_id, priority,
      status, scheduled_at, next_attempt_at, max_attempts
    ) values (
      v_notification.organization_id, v_notification.id, v_notification.version,
      v_notification.recipient_user_id, 'email', null, v_priority,
      'queued', v_scheduled_at, v_scheduled_at, v_policy.max_attempts
    ) on conflict do nothing returning id into v_delivery_id;

    if v_delivery_id is not null then
      v_count := v_count + 1;
      insert into agrocore_private.notification_external_audit (
        organization_id, recipient_user_id, notification_id, delivery_id, action, details
      ) values (
        v_notification.organization_id, v_notification.recipient_user_id,
        v_notification.id, v_delivery_id, 'enqueued',
        jsonb_build_object('channel','email','category',v_notification.category,'priority',v_priority,'scheduledAt',v_scheduled_at)
      );
    end if;
  end if;

  if v_policy.push_enabled and agrocore_private.external_channel_enabled(
    v_notification.organization_id, v_notification.recipient_user_id, 'push'
  ) then
    for v_subscription in
      select s.id from agrocore_private.notification_push_subscriptions s
      where s.organization_id = v_notification.organization_id
        and s.user_id = v_notification.recipient_user_id
        and s.revoked_at is null
      order by s.updated_at desc, s.id
    loop
      v_delivery_id := null;
      insert into agrocore_private.notification_external_deliveries (
        organization_id, notification_id, notification_version,
        recipient_user_id, channel, push_subscription_id, priority,
        status, scheduled_at, next_attempt_at, max_attempts
      ) values (
        v_notification.organization_id, v_notification.id, v_notification.version,
        v_notification.recipient_user_id, 'push', v_subscription.id, v_priority,
        'queued', v_scheduled_at, v_scheduled_at, v_policy.max_attempts
      ) on conflict do nothing returning id into v_delivery_id;

      if v_delivery_id is not null then
        v_count := v_count + 1;
        insert into agrocore_private.notification_external_audit (
          organization_id, recipient_user_id, notification_id, delivery_id, action, details
        ) values (
          v_notification.organization_id, v_notification.recipient_user_id,
          v_notification.id, v_delivery_id, 'enqueued',
          jsonb_build_object('channel','push','category',v_notification.category,'priority',v_priority,'scheduledAt',v_scheduled_at)
        );
      end if;
    end loop;
  end if;
  return v_count;
end;
$$;

revoke all on function agrocore_private.enqueue_external_notification(uuid,integer)
  from public, anon, authenticated;

create or replace function agrocore_private.enqueue_external_notification_trigger()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_should_enqueue boolean := false;
begin
  if tg_op = 'INSERT' then
    v_should_enqueue := true;
  elsif new.read_at is null and (
    old.read_at is not null
    or new.expires_at > old.expires_at
    or new.available_at is distinct from old.available_at
  ) then
    v_should_enqueue := true;
  end if;
  if v_should_enqueue then
    perform agrocore_private.enqueue_external_notification(new.id, new.version);
  end if;
  return new;
end;
$$;

revoke all on function agrocore_private.enqueue_external_notification_trigger()
  from public, anon, authenticated;

drop trigger if exists agrocore_enqueue_external_notification on public.notifications;
create trigger agrocore_enqueue_external_notification
after insert or update of available_at, expires_at, read_at
on public.notifications
for each row execute function agrocore_private.enqueue_external_notification_trigger();

create or replace function agrocore_private.reconcile_external_notification_queue(
  p_organization_id uuid,
  p_recipient_user_id uuid default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select n.id, n.version
    from public.notifications n
    where n.organization_id = p_organization_id
      and (p_recipient_user_id is null or n.recipient_user_id = p_recipient_user_id)
      and n.read_at is null
      and n.expires_at > statement_timestamp()
      and agrocore_private.notification_category_enabled(
        n.organization_id, n.recipient_user_id, n.category
      )
    order by n.available_at, n.id
  loop
    v_count := v_count + agrocore_private.enqueue_external_notification(v_row.id, v_row.version);
  end loop;
  return v_count;
end;
$$;

revoke all on function agrocore_private.reconcile_external_notification_queue(uuid,uuid)
  from public, anon, authenticated;

alter table public.notification_external_preferences enable row level security;
alter table public.notification_escalation_policies enable row level security;

drop policy if exists "agrocore_notification_external_preferences_select" on public.notification_external_preferences;
create policy "agrocore_notification_external_preferences_select"
on public.notification_external_preferences for select to authenticated
using (
  user_id = (select auth.uid())
  and (select agrocore_private.can_access_notifications(organization_id))
);

drop policy if exists "agrocore_notification_escalation_policies_select" on public.notification_escalation_policies;
create policy "agrocore_notification_escalation_policies_select"
on public.notification_escalation_policies for select to authenticated
using ((select agrocore_private.can_manage_schedule(organization_id)));

revoke all on public.notification_external_preferences, public.notification_escalation_policies
from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.notification_external_preferences from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.notification_escalation_policies from authenticated;
grant select on public.notification_external_preferences to authenticated;
grant select on public.notification_escalation_policies to authenticated;

create or replace function public.agrocore_get_external_notification_preferences(p_organization_id uuid)
returns table (channel text, enabled boolean, version integer)
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or p_organization_id is null
     or not agrocore_private.can_access_notifications(p_organization_id) then
    raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_FORBIDDEN';
  end if;
  return query
  with channels(channel) as (values ('email'::text), ('push'::text))
  select c.channel, coalesce(p.enabled,false), coalesce(p.version,0)
  from channels c
  left join public.notification_external_preferences p
    on p.organization_id=p_organization_id and p.user_id=v_actor and p.channel=c.channel
  order by c.channel;
end;
$$;
revoke all on function public.agrocore_get_external_notification_preferences(uuid) from public, anon;
grant execute on function public.agrocore_get_external_notification_preferences(uuid) to authenticated;

create or replace function public.agrocore_set_external_notification_preference(
  p_organization_id uuid,
  p_channel text,
  p_enabled boolean,
  p_expected_version integer,
  p_idempotency_key text
)
returns public.notification_external_preferences
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current public.notification_external_preferences%rowtype;
  v_updated public.notification_external_preferences%rowtype;
  v_receipt agrocore_private.notification_external_command_receipts%rowtype;
  v_fingerprint text;
begin
  if v_actor is null or p_organization_id is null or p_channel not in ('email','push')
     or p_enabled is null or p_expected_version is null or p_expected_version < 0
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 200
     or not agrocore_private.can_access_notifications(p_organization_id) then
    raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_INVALID_INPUT_OR_FORBIDDEN';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'channel',p_channel,'enabled',p_enabled,'expectedVersion',p_expected_version
  )::text,'UTF8'),'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':'||v_actor::text||':'||btrim(p_idempotency_key),0));

  select * into v_receipt
  from agrocore_private.notification_external_command_receipts r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor
    and r.command_key=btrim(p_idempotency_key);
  if found then
    if v_receipt.command_type <> 'set_external_preference'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_populate_record(null::public.notification_external_preferences,v_receipt.result_snapshot);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':'||v_actor::text||':'||p_channel,0));
  select * into v_current from public.notification_external_preferences p
  where p.organization_id=p_organization_id and p.user_id=v_actor and p.channel=p_channel for update;

  if found then
    if v_current.version <> p_expected_version then
      raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_CONCURRENCY_CONFLICT';
    end if;
    update public.notification_external_preferences set
      enabled=p_enabled, updated_at=statement_timestamp(), version=version+1
    where organization_id=p_organization_id and user_id=v_actor and channel=p_channel
    returning * into v_updated;
  else
    if p_expected_version <> 0 then raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_CONCURRENCY_CONFLICT'; end if;
    insert into public.notification_external_preferences(organization_id,user_id,channel,enabled)
    values(p_organization_id,v_actor,p_channel,p_enabled) returning * into v_updated;
  end if;

  insert into agrocore_private.notification_external_audit(
    organization_id,actor_user_id,recipient_user_id,action,details
  ) values(p_organization_id,v_actor,v_actor,'preference_changed',jsonb_build_object(
    'channel',p_channel,'enabled',p_enabled,'version',v_updated.version));

  insert into agrocore_private.notification_external_command_receipts(
    organization_id,actor_user_id,command_type,command_key,request_fingerprint,result_snapshot
  ) values(p_organization_id,v_actor,'set_external_preference',btrim(p_idempotency_key),v_fingerprint,to_jsonb(v_updated));

  if p_enabled then
    perform agrocore_private.reconcile_external_notification_queue(p_organization_id,v_actor);
  else
    update agrocore_private.notification_external_deliveries set
      status='suppressed',last_error_code='channel_disabled',lease_token=null,
      lease_expires_at=null,updated_at=statement_timestamp()
    where organization_id=p_organization_id and recipient_user_id=v_actor
      and channel=p_channel and status in ('queued','retry','blocked');
  end if;
  return v_updated;
end;
$$;
revoke all on function public.agrocore_set_external_notification_preference(uuid,text,boolean,integer,text) from public, anon;
grant execute on function public.agrocore_set_external_notification_preference(uuid,text,boolean,integer,text) to authenticated;

create or replace function public.agrocore_get_notification_escalation_policies(p_organization_id uuid)
returns table (
  category text,email_enabled boolean,push_enabled boolean,minimum_priority text,
  delay_minutes integer,critical_priority text,critical_delay_minutes integer,
  max_attempts integer,version integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or p_organization_id is null
     or not agrocore_private.can_manage_schedule(p_organization_id) then
    raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_FORBIDDEN';
  end if;
  return query
  with categories(category) as (values
    ('schedule_assignment'::text),('schedule_deadline'::text),('schedule_status'::text)
  )
  select c.category,coalesce(p.email_enabled,false),coalesce(p.push_enabled,false),
    coalesce(p.minimum_priority,'high'),coalesce(p.delay_minutes,30),
    coalesce(p.critical_priority,'urgent'),coalesce(p.critical_delay_minutes,0),
    coalesce(p.max_attempts,5),coalesce(p.version,0)
  from categories c left join public.notification_escalation_policies p
    on p.organization_id=p_organization_id and p.category=c.category
  order by c.category;
end;
$$;
revoke all on function public.agrocore_get_notification_escalation_policies(uuid) from public, anon;
grant execute on function public.agrocore_get_notification_escalation_policies(uuid) to authenticated;

create or replace function public.agrocore_set_notification_escalation_policy(
  p_organization_id uuid,p_category text,p_email_enabled boolean,p_push_enabled boolean,
  p_minimum_priority text,p_delay_minutes integer,p_critical_priority text,
  p_critical_delay_minutes integer,p_max_attempts integer,p_expected_version integer,
  p_idempotency_key text
)
returns public.notification_escalation_policies
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current public.notification_escalation_policies%rowtype;
  v_updated public.notification_escalation_policies%rowtype;
  v_receipt agrocore_private.notification_external_command_receipts%rowtype;
  v_fingerprint text;
begin
  if v_actor is null or p_organization_id is null
     or p_category not in ('schedule_assignment','schedule_deadline','schedule_status')
     or p_email_enabled is null or p_push_enabled is null
     or p_minimum_priority not in ('low','medium','high','urgent')
     or p_critical_priority not in ('low','medium','high','urgent')
     or agrocore_private.notification_priority_rank(p_critical_priority)
        < agrocore_private.notification_priority_rank(p_minimum_priority)
     or p_delay_minutes is null or p_delay_minutes not between 0 and 10080
     or p_critical_delay_minutes is null or p_critical_delay_minutes not between 0 and 1440
     or p_max_attempts is null or p_max_attempts not between 1 and 10
     or p_expected_version is null or p_expected_version < 0
     or char_length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 200
     or not agrocore_private.can_manage_schedule(p_organization_id) then
    raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_INVALID_INPUT_OR_FORBIDDEN';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'category',p_category,'emailEnabled',p_email_enabled,'pushEnabled',p_push_enabled,
    'minimumPriority',p_minimum_priority,'delayMinutes',p_delay_minutes,
    'criticalPriority',p_critical_priority,'criticalDelayMinutes',p_critical_delay_minutes,
    'maxAttempts',p_max_attempts,'expectedVersion',p_expected_version
  )::text,'UTF8'),'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':'||v_actor::text||':'||btrim(p_idempotency_key),0));
  select * into v_receipt from agrocore_private.notification_external_command_receipts r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor
    and r.command_key=btrim(p_idempotency_key);
  if found then
    if v_receipt.command_type <> 'set_escalation_policy'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_populate_record(null::public.notification_escalation_policies,v_receipt.result_snapshot);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_category,0));
  select * into v_current from public.notification_escalation_policies p
  where p.organization_id=p_organization_id and p.category=p_category for update;
  if found then
    if v_current.version <> p_expected_version then raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_CONCURRENCY_CONFLICT'; end if;
    update public.notification_escalation_policies set
      email_enabled=p_email_enabled,push_enabled=p_push_enabled,
      minimum_priority=p_minimum_priority,delay_minutes=p_delay_minutes,
      critical_priority=p_critical_priority,critical_delay_minutes=p_critical_delay_minutes,
      max_attempts=p_max_attempts,updated_at=statement_timestamp(),version=version+1
    where organization_id=p_organization_id and category=p_category returning * into v_updated;
  else
    if p_expected_version <> 0 then raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_CONCURRENCY_CONFLICT'; end if;
    insert into public.notification_escalation_policies(
      organization_id,category,email_enabled,push_enabled,minimum_priority,delay_minutes,
      critical_priority,critical_delay_minutes,max_attempts
    ) values(
      p_organization_id,p_category,p_email_enabled,p_push_enabled,p_minimum_priority,p_delay_minutes,
      p_critical_priority,p_critical_delay_minutes,p_max_attempts
    ) returning * into v_updated;
  end if;

  insert into agrocore_private.notification_external_audit(organization_id,actor_user_id,action,details)
  values(p_organization_id,v_actor,'policy_changed',jsonb_build_object(
    'category',p_category,'emailEnabled',p_email_enabled,'pushEnabled',p_push_enabled,
    'minimumPriority',p_minimum_priority,'delayMinutes',p_delay_minutes,
    'criticalPriority',p_critical_priority,'criticalDelayMinutes',p_critical_delay_minutes,
    'maxAttempts',p_max_attempts,'version',v_updated.version));
  insert into agrocore_private.notification_external_command_receipts(
    organization_id,actor_user_id,command_type,command_key,request_fingerprint,result_snapshot
  ) values(p_organization_id,v_actor,'set_escalation_policy',btrim(p_idempotency_key),v_fingerprint,to_jsonb(v_updated));
  if p_email_enabled or p_push_enabled then
    perform agrocore_private.reconcile_external_notification_queue(p_organization_id,null);
  end if;
  return v_updated;
end;
$$;
revoke all on function public.agrocore_set_notification_escalation_policy(uuid,text,boolean,boolean,text,integer,text,integer,integer,integer,text) from public, anon;
grant execute on function public.agrocore_set_notification_escalation_policy(uuid,text,boolean,boolean,text,integer,text,integer,integer,integer,text) to authenticated;

create or replace function public.agrocore_register_push_subscription(
  p_organization_id uuid,p_endpoint text,p_p256dh text,p_auth_secret text
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_hash text; v_id uuid;
begin
  if v_actor is null or p_organization_id is null
     or char_length(btrim(coalesce(p_endpoint,''))) not between 12 and 2048
     or left(btrim(p_endpoint),8) <> 'https://'
     or char_length(btrim(coalesce(p_p256dh,''))) not between 20 and 512
     or char_length(btrim(coalesce(p_auth_secret,''))) not between 8 and 256
     or not agrocore_private.can_access_notifications(p_organization_id) then
    raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_INVALID_INPUT_OR_FORBIDDEN';
  end if;
  v_hash := encode(extensions.digest(convert_to(btrim(p_endpoint),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||v_actor::text||':'||v_hash,0));
  insert into agrocore_private.notification_push_subscriptions(
    organization_id,user_id,endpoint,endpoint_hash,p256dh,auth_secret,revoked_at
  ) values(p_organization_id,v_actor,btrim(p_endpoint),v_hash,btrim(p_p256dh),btrim(p_auth_secret),null)
  on conflict(organization_id,user_id,endpoint_hash) do update set
    endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,
    updated_at=statement_timestamp(),revoked_at=null,
    version=agrocore_private.notification_push_subscriptions.version+1
  returning id into v_id;
  insert into agrocore_private.notification_external_audit(
    organization_id,actor_user_id,recipient_user_id,action,details
  ) values(p_organization_id,v_actor,v_actor,'push_subscription_registered',jsonb_build_object('endpointHash',v_hash));
  perform agrocore_private.reconcile_external_notification_queue(p_organization_id,v_actor);
  return v_id;
end;
$$;
revoke all on function public.agrocore_register_push_subscription(uuid,text,text,text) from public, anon;
grant execute on function public.agrocore_register_push_subscription(uuid,text,text,text) to authenticated;

create or replace function public.agrocore_revoke_push_subscription(p_organization_id uuid,p_endpoint text)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_hash text; v_count integer;
begin
  if v_actor is null or p_organization_id is null
     or char_length(btrim(coalesce(p_endpoint,''))) not between 12 and 2048
     or not agrocore_private.can_access_notifications(p_organization_id) then
    raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_INVALID_INPUT_OR_FORBIDDEN';
  end if;
  v_hash := encode(extensions.digest(convert_to(btrim(p_endpoint),'UTF8'),'sha256'),'hex');
  update agrocore_private.notification_push_subscriptions set
    revoked_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1
  where organization_id=p_organization_id and user_id=v_actor and endpoint_hash=v_hash and revoked_at is null;
  get diagnostics v_count = row_count;
  update agrocore_private.notification_external_deliveries d set
    status='suppressed',last_error_code='subscription_revoked',lease_token=null,
    lease_expires_at=null,updated_at=statement_timestamp()
  where d.organization_id=p_organization_id and d.recipient_user_id=v_actor and d.channel='push'
    and d.push_subscription_id in(select s.id from agrocore_private.notification_push_subscriptions s
      where s.organization_id=p_organization_id and s.user_id=v_actor and s.endpoint_hash=v_hash)
    and d.status in ('queued','retry','blocked','processing');
  if v_count > 0 then
    insert into agrocore_private.notification_external_audit(
      organization_id,actor_user_id,recipient_user_id,action,details
    ) values(p_organization_id,v_actor,v_actor,'push_subscription_revoked',jsonb_build_object('endpointHash',v_hash));
  end if;
  return v_count > 0;
end;
$$;
revoke all on function public.agrocore_revoke_push_subscription(uuid,text) from public, anon;
grant execute on function public.agrocore_revoke_push_subscription(uuid,text) to authenticated;

create or replace function public.agrocore_external_delivery_status(p_organization_id uuid,p_limit integer default 20)
returns table(
  id uuid,notification_id uuid,channel text,status text,priority text,scheduled_at timestamptz,
  next_attempt_at timestamptz,attempt_count integer,max_attempts integer,delivered_at timestamptz,last_error_code text
)
language plpgsql stable security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or p_organization_id is null or p_limit is null or p_limit not between 1 and 100
     or not agrocore_private.can_access_notifications(p_organization_id) then
    raise exception 'AGROCORE_EXTERNAL_NOTIFICATION_FORBIDDEN';
  end if;
  return query select d.id,d.notification_id,d.channel,d.status,d.priority,d.scheduled_at,
    d.next_attempt_at,d.attempt_count,d.max_attempts,d.delivered_at,d.last_error_code
  from agrocore_private.notification_external_deliveries d
  where d.organization_id=p_organization_id and d.recipient_user_id=v_actor
  order by d.created_at desc,d.id desc limit p_limit;
end;
$$;
revoke all on function public.agrocore_external_delivery_status(uuid,integer) from public, anon;
grant execute on function public.agrocore_external_delivery_status(uuid,integer) to authenticated;

create or replace function agrocore_private.valid_notification_worker_token(p_token_hash text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_token_hash is not null and char_length(p_token_hash)=64 and exists(
    select 1 from agrocore_private.notification_worker_credentials c
    where c.worker_name='external-delivery' and c.token_hash=p_token_hash
  );
$$;
revoke all on function agrocore_private.valid_notification_worker_token(text) from public, anon, authenticated;

create or replace function public.agrocore_claim_notification_deliveries(
  p_worker_token_hash text,p_limit integer default 25
)
returns table(
  delivery_id uuid,organization_id uuid,notification_id uuid,recipient_user_id uuid,
  channel text,priority text,attempt_number integer,max_attempts integer,title text,message text,
  route text,push_endpoint text,push_p256dh text,push_auth_secret text,lease_token uuid
)
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not agrocore_private.valid_notification_worker_token(p_worker_token_hash)
     or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'AGROCORE_NOTIFICATION_WORKER_FORBIDDEN';
  end if;

  update agrocore_private.notification_external_deliveries d set
    status='retry',next_attempt_at=statement_timestamp(),lease_token=null,lease_expires_at=null,
    last_error_code='lease_expired',updated_at=statement_timestamp()
  where d.status='processing' and d.lease_expires_at <= statement_timestamp();

  update agrocore_private.notification_external_deliveries d set
    status=case when n.expires_at <= statement_timestamp() then 'expired' else 'suppressed' end,
    last_error_code=case
      when n.expires_at <= statement_timestamp() then 'notification_expired'
      when n.read_at is not null then 'notification_read'
      when not agrocore_private.notification_category_enabled(n.organization_id,n.recipient_user_id,n.category) then 'category_disabled'
      when not agrocore_private.external_channel_enabled(d.organization_id,d.recipient_user_id,d.channel) then 'channel_disabled'
      when d.channel='email' and not p.email_enabled then 'policy_disabled'
      when d.channel='push' and not p.push_enabled then 'policy_disabled'
      when d.channel='push' and not exists(select 1 from agrocore_private.notification_push_subscriptions s where s.id=d.push_subscription_id and s.revoked_at is null) then 'subscription_revoked'
      else 'not_eligible' end,
    lease_token=null,lease_expires_at=null,updated_at=statement_timestamp()
  from public.notifications n, public.notification_escalation_policies p
  where d.notification_id=n.id and p.organization_id=n.organization_id and p.category=n.category
    and d.status in ('queued','retry','blocked') and(
      n.read_at is not null or n.expires_at <= statement_timestamp()
      or not agrocore_private.notification_category_enabled(n.organization_id,n.recipient_user_id,n.category)
      or not agrocore_private.external_channel_enabled(d.organization_id,d.recipient_user_id,d.channel)
      or(d.channel='email' and not p.email_enabled) or(d.channel='push' and not p.push_enabled)
      or(d.channel='push' and not exists(select 1 from agrocore_private.notification_push_subscriptions s where s.id=d.push_subscription_id and s.revoked_at is null))
    );

  return query
  with candidates as(
    select d.id from agrocore_private.notification_external_deliveries d
    join public.notifications n on n.id=d.notification_id
    where d.status in ('queued','retry','blocked') and d.next_attempt_at <= statement_timestamp()
      and d.scheduled_at <= statement_timestamp() and n.read_at is null
      and n.available_at <= statement_timestamp() and n.expires_at > statement_timestamp()
    order by agrocore_private.notification_priority_rank(d.priority) desc,d.next_attempt_at,d.created_at,d.id
    for update of d skip locked limit p_limit
  ), claimed as(
    update agrocore_private.notification_external_deliveries d set
      status='processing',lease_token=gen_random_uuid(),lease_expires_at=statement_timestamp()+interval '2 minutes',
      updated_at=statement_timestamp()
    where d.id in(select id from candidates) returning d.*
  )
  select c.id,c.organization_id,c.notification_id,c.recipient_user_id,c.channel,c.priority,
    c.attempt_count+1,c.max_attempts,n.title,n.message,n.route,s.endpoint,s.p256dh,s.auth_secret,c.lease_token
  from claimed c join public.notifications n on n.id=c.notification_id
  left join agrocore_private.notification_push_subscriptions s on s.id=c.push_subscription_id
  order by agrocore_private.notification_priority_rank(c.priority) desc,c.next_attempt_at,c.id;
end;
$$;
revoke all on function public.agrocore_claim_notification_deliveries(text,integer) from public, anon, authenticated;
grant execute on function public.agrocore_claim_notification_deliveries(text,integer) to service_role;

create or replace function public.agrocore_complete_notification_delivery(
  p_worker_token_hash text,p_delivery_id uuid,p_lease_token uuid,p_outcome text,
  p_http_status integer default null,p_error_code text default null,
  p_provider_message_id text default null,p_retry_after_seconds integer default null,
  p_revoke_push boolean default false
)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_delivery agrocore_private.notification_external_deliveries%rowtype;
  v_attempt integer; v_next timestamptz; v_backoff_seconds integer;
begin
  if not agrocore_private.valid_notification_worker_token(p_worker_token_hash)
     or p_delivery_id is null or p_lease_token is null
     or p_outcome not in('delivered','transient_failure','permanent_failure','provider_unconfigured','recipient_unavailable')
     or(p_http_status is not null and p_http_status not between 100 and 599)
     or(p_error_code is not null and char_length(p_error_code) not between 2 and 80)
     or(p_provider_message_id is not null and char_length(p_provider_message_id) not between 1 and 200)
     or(p_retry_after_seconds is not null and p_retry_after_seconds not between 1 and 86400) then
    raise exception 'AGROCORE_NOTIFICATION_WORKER_INVALID_INPUT';
  end if;
  select * into v_delivery from agrocore_private.notification_external_deliveries d
  where d.id=p_delivery_id and d.status='processing' and d.lease_token=p_lease_token
    and d.lease_expires_at > statement_timestamp() for update;
  if not found then raise exception 'AGROCORE_NOTIFICATION_DELIVERY_LEASE_CONFLICT'; end if;

  if p_outcome='provider_unconfigured' then
    update agrocore_private.notification_external_deliveries set
      status='blocked',next_attempt_at=statement_timestamp()+interval '1 hour',lease_token=null,
      lease_expires_at=null,last_http_status=p_http_status,last_error_code=coalesce(p_error_code,'provider_unconfigured'),
      updated_at=statement_timestamp() where id=p_delivery_id;
    insert into agrocore_private.notification_external_audit(
      organization_id,recipient_user_id,notification_id,delivery_id,action,details
    ) values(v_delivery.organization_id,v_delivery.recipient_user_id,v_delivery.notification_id,v_delivery.id,'blocked',
      jsonb_build_object('channel',v_delivery.channel,'reason',coalesce(p_error_code,'provider_unconfigured')));
    return 'blocked';
  end if;

  if p_outcome='recipient_unavailable' then
    update agrocore_private.notification_external_deliveries set
      status='suppressed',lease_token=null,lease_expires_at=null,last_http_status=p_http_status,
      last_error_code=coalesce(p_error_code,'recipient_unavailable'),updated_at=statement_timestamp()
    where id=p_delivery_id;
    insert into agrocore_private.notification_external_audit(
      organization_id,recipient_user_id,notification_id,delivery_id,action,details
    ) values(v_delivery.organization_id,v_delivery.recipient_user_id,v_delivery.notification_id,v_delivery.id,'suppressed',
      jsonb_build_object('channel',v_delivery.channel,'reason',coalesce(p_error_code,'recipient_unavailable')));
    return 'suppressed';
  end if;

  v_attempt := v_delivery.attempt_count+1;
  insert into agrocore_private.notification_external_attempts(
    delivery_id,attempt_number,outcome,http_status,error_code,provider_message_id
  ) values(v_delivery.id,v_attempt,p_outcome,p_http_status,p_error_code,p_provider_message_id);

  if p_outcome='delivered' then
    update agrocore_private.notification_external_deliveries set
      status='delivered',attempt_count=v_attempt,delivered_at=statement_timestamp(),lease_token=null,
      lease_expires_at=null,last_http_status=p_http_status,last_error_code=null,
      provider_message_id=p_provider_message_id,updated_at=statement_timestamp()
    where id=p_delivery_id;
    if v_delivery.channel='push' and v_delivery.push_subscription_id is not null then
      update agrocore_private.notification_push_subscriptions set
        last_success_at=statement_timestamp(),updated_at=statement_timestamp()
      where id=v_delivery.push_subscription_id and revoked_at is null;
    end if;
    insert into agrocore_private.notification_external_audit(
      organization_id,recipient_user_id,notification_id,delivery_id,action,details
    ) values(v_delivery.organization_id,v_delivery.recipient_user_id,v_delivery.notification_id,v_delivery.id,'delivered',
      jsonb_build_object('channel',v_delivery.channel,'attempt',v_attempt));
    return 'delivered';
  end if;

  if p_revoke_push and v_delivery.channel='push' and v_delivery.push_subscription_id is not null then
    update agrocore_private.notification_push_subscriptions set
      revoked_at=coalesce(revoked_at,statement_timestamp()),updated_at=statement_timestamp(),
      version=version+case when revoked_at is null then 1 else 0 end
    where id=v_delivery.push_subscription_id;
  end if;

  if p_outcome='permanent_failure' or v_attempt >= v_delivery.max_attempts then
    update agrocore_private.notification_external_deliveries set
      status='failed',attempt_count=v_attempt,lease_token=null,lease_expires_at=null,
      last_http_status=p_http_status,last_error_code=coalesce(p_error_code,'delivery_failed'),
      provider_message_id=p_provider_message_id,updated_at=statement_timestamp()
    where id=p_delivery_id;
    insert into agrocore_private.notification_external_audit(
      organization_id,recipient_user_id,notification_id,delivery_id,action,details
    ) values(v_delivery.organization_id,v_delivery.recipient_user_id,v_delivery.notification_id,v_delivery.id,'failed',
      jsonb_build_object('channel',v_delivery.channel,'attempt',v_attempt,'reason',coalesce(p_error_code,'delivery_failed')));
    return 'failed';
  end if;

  v_backoff_seconds := case v_attempt when 1 then 60 when 2 then 300 when 3 then 900 when 4 then 3600 else 14400 end;
  if p_retry_after_seconds is not null then v_backoff_seconds:=greatest(v_backoff_seconds,p_retry_after_seconds); end if;
  v_next:=statement_timestamp()+make_interval(secs=>v_backoff_seconds);
  update agrocore_private.notification_external_deliveries set
    status='retry',attempt_count=v_attempt,next_attempt_at=v_next,lease_token=null,lease_expires_at=null,
    last_http_status=p_http_status,last_error_code=coalesce(p_error_code,'transient_failure'),
    provider_message_id=p_provider_message_id,updated_at=statement_timestamp()
  where id=p_delivery_id;
  insert into agrocore_private.notification_external_audit(
    organization_id,recipient_user_id,notification_id,delivery_id,action,details
  ) values(v_delivery.organization_id,v_delivery.recipient_user_id,v_delivery.notification_id,v_delivery.id,'retry_scheduled',
    jsonb_build_object('channel',v_delivery.channel,'attempt',v_attempt,'nextAttemptAt',v_next,'reason',coalesce(p_error_code,'transient_failure')));
  return 'retry';
end;
$$;
revoke all on function public.agrocore_complete_notification_delivery(text,uuid,uuid,text,integer,text,text,integer,boolean) from public, anon, authenticated;
grant execute on function public.agrocore_complete_notification_delivery(text,uuid,uuid,text,integer,text,text,integer,boolean) to service_role;

do $$
declare v_worker_token text; v_worker_hash text; v_job_id bigint;
begin
  v_worker_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_worker_hash:=encode(extensions.digest(convert_to(v_worker_token,'UTF8'),'sha256'),'hex');
  insert into agrocore_private.notification_worker_credentials(worker_name,token_hash)
  values('external-delivery',v_worker_hash)
  on conflict(worker_name) do update set token_hash=excluded.token_hash,rotated_at=statement_timestamp();
  begin perform cron.unschedule('agrocore-notification-delivery-worker'); exception when others then null; end;
  v_job_id:=cron.schedule(
    'agrocore-notification-delivery-worker','* * * * *',
    format($job$
      select net.http_post(
        url := 'https://zmmegteqpnvitldjdnuy.supabase.co/functions/v1/notification-delivery-worker',
        headers := jsonb_build_object('Content-Type','application/json','x-agrocore-worker-token',%L),
        body := '{"source":"pg_cron"}'::jsonb,
        timeout_milliseconds := 15000
      );
    $job$,v_worker_token)
  );
  if v_job_id is null then raise exception 'AGROCORE_NOTIFICATION_WORKER_SCHEDULE_FAILED'; end if;
end;
$$;
