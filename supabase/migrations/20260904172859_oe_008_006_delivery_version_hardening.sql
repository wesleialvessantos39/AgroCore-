-- AgroCore — OE-008.006 R1 — Hardening de versão da fila externa
-- Uma reativação/atualização da mesma notificação interna cria uma nova versão
-- e invalida entregas ainda pendentes da versão anterior, evitando duplicidade.

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
  select *
  into v_notification
  from public.notifications n
  where n.id = p_notification_id;

  if not found
     or v_notification.version <> p_notification_version
     or v_notification.read_at is not null
     or v_notification.expires_at <= statement_timestamp()
     or not agrocore_private.is_notification_recipient_eligible(
       v_notification.organization_id,
       v_notification.recipient_user_id
     )
     or not agrocore_private.notification_category_enabled(
       v_notification.organization_id,
       v_notification.recipient_user_id,
       v_notification.category
     ) then
    return 0;
  end if;

  update agrocore_private.notification_external_deliveries d
  set
    status = 'suppressed',
    last_error_code = 'superseded_notification_version',
    lease_token = null,
    lease_expires_at = null,
    updated_at = statement_timestamp()
  where d.notification_id = v_notification.id
    and d.notification_version <> v_notification.version
    and d.status in ('queued', 'retry', 'blocked');

  select *
  into v_policy
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

  if v_scheduled_at >= v_notification.expires_at then
    return 0;
  end if;

  if v_policy.email_enabled
     and agrocore_private.external_channel_enabled(
       v_notification.organization_id,
       v_notification.recipient_user_id,
       'email'
     ) then
    v_delivery_id := null;
    insert into agrocore_private.notification_external_deliveries (
      organization_id,
      notification_id,
      notification_version,
      recipient_user_id,
      channel,
      push_subscription_id,
      priority,
      status,
      scheduled_at,
      next_attempt_at,
      max_attempts
    ) values (
      v_notification.organization_id,
      v_notification.id,
      v_notification.version,
      v_notification.recipient_user_id,
      'email',
      null,
      v_priority,
      'queued',
      v_scheduled_at,
      v_scheduled_at,
      v_policy.max_attempts
    )
    on conflict do nothing
    returning id into v_delivery_id;

    if v_delivery_id is not null then
      v_count := v_count + 1;
      insert into agrocore_private.notification_external_audit (
        organization_id, recipient_user_id, notification_id, delivery_id, action, details
      ) values (
        v_notification.organization_id,
        v_notification.recipient_user_id,
        v_notification.id,
        v_delivery_id,
        'enqueued',
        jsonb_build_object(
          'channel', 'email',
          'category', v_notification.category,
          'priority', v_priority,
          'scheduledAt', v_scheduled_at,
          'notificationVersion', v_notification.version
        )
      );
    end if;
  end if;

  if v_policy.push_enabled
     and agrocore_private.external_channel_enabled(
       v_notification.organization_id,
       v_notification.recipient_user_id,
       'push'
     ) then
    for v_subscription in
      select s.id
      from agrocore_private.notification_push_subscriptions s
      where s.organization_id = v_notification.organization_id
        and s.user_id = v_notification.recipient_user_id
        and s.revoked_at is null
      order by s.updated_at desc, s.id
    loop
      v_delivery_id := null;
      insert into agrocore_private.notification_external_deliveries (
        organization_id,
        notification_id,
        notification_version,
        recipient_user_id,
        channel,
        push_subscription_id,
        priority,
        status,
        scheduled_at,
        next_attempt_at,
        max_attempts
      ) values (
        v_notification.organization_id,
        v_notification.id,
        v_notification.version,
        v_notification.recipient_user_id,
        'push',
        v_subscription.id,
        v_priority,
        'queued',
        v_scheduled_at,
        v_scheduled_at,
        v_policy.max_attempts
      )
      on conflict do nothing
      returning id into v_delivery_id;

      if v_delivery_id is not null then
        v_count := v_count + 1;
        insert into agrocore_private.notification_external_audit (
          organization_id, recipient_user_id, notification_id, delivery_id, action, details
        ) values (
          v_notification.organization_id,
          v_notification.recipient_user_id,
          v_notification.id,
          v_delivery_id,
          'enqueued',
          jsonb_build_object(
            'channel', 'push',
            'category', v_notification.category,
            'priority', v_priority,
            'scheduledAt', v_scheduled_at,
            'notificationVersion', v_notification.version
          )
        );
      end if;
    end loop;
  end if;

  return v_count;
end;
$$;

revoke all on function agrocore_private.enqueue_external_notification(uuid,integer)
  from public, anon, authenticated;

create or replace function public.agrocore_claim_notification_deliveries(
  p_worker_token_hash text,
  p_limit integer default 25
)
returns table (
  delivery_id uuid,
  organization_id uuid,
  notification_id uuid,
  recipient_user_id uuid,
  channel text,
  priority text,
  attempt_number integer,
  max_attempts integer,
  title text,
  message text,
  route text,
  push_endpoint text,
  push_p256dh text,
  push_auth_secret text,
  lease_token uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not agrocore_private.valid_notification_worker_token(p_worker_token_hash)
     or p_limit is null
     or p_limit not between 1 and 100 then
    raise exception 'AGROCORE_NOTIFICATION_WORKER_FORBIDDEN';
  end if;

  update agrocore_private.notification_external_deliveries d
  set
    status = 'retry',
    next_attempt_at = statement_timestamp(),
    lease_token = null,
    lease_expires_at = null,
    last_error_code = 'lease_expired',
    updated_at = statement_timestamp()
  where d.status = 'processing'
    and d.lease_expires_at <= statement_timestamp();

  update agrocore_private.notification_external_deliveries d
  set
    status = case
      when n.expires_at <= statement_timestamp() then 'expired'
      else 'suppressed'
    end,
    last_error_code = case
      when n.expires_at <= statement_timestamp() then 'notification_expired'
      when d.notification_version <> n.version then 'superseded_notification_version'
      when n.read_at is not null then 'notification_read'
      when not agrocore_private.notification_category_enabled(
        n.organization_id, n.recipient_user_id, n.category
      ) then 'category_disabled'
      when not agrocore_private.external_channel_enabled(
        d.organization_id, d.recipient_user_id, d.channel
      ) then 'channel_disabled'
      when d.channel = 'email' and not p.email_enabled then 'policy_disabled'
      when d.channel = 'push' and not p.push_enabled then 'policy_disabled'
      when d.channel = 'push' and not exists (
        select 1
        from agrocore_private.notification_push_subscriptions s
        where s.id = d.push_subscription_id
          and s.revoked_at is null
      ) then 'subscription_revoked'
      else 'not_eligible'
    end,
    lease_token = null,
    lease_expires_at = null,
    updated_at = statement_timestamp()
  from public.notifications n,
       public.notification_escalation_policies p
  where d.notification_id = n.id
    and p.organization_id = n.organization_id
    and p.category = n.category
    and d.status in ('queued', 'retry', 'blocked')
    and (
      d.notification_version <> n.version
      or n.read_at is not null
      or n.expires_at <= statement_timestamp()
      or not agrocore_private.notification_category_enabled(
        n.organization_id, n.recipient_user_id, n.category
      )
      or not agrocore_private.external_channel_enabled(
        d.organization_id, d.recipient_user_id, d.channel
      )
      or (d.channel = 'email' and not p.email_enabled)
      or (d.channel = 'push' and not p.push_enabled)
      or (
        d.channel = 'push'
        and not exists (
          select 1
          from agrocore_private.notification_push_subscriptions s
          where s.id = d.push_subscription_id
            and s.revoked_at is null
        )
      )
    );

  return query
  with candidates as (
    select d.id
    from agrocore_private.notification_external_deliveries d
    join public.notifications n
      on n.id = d.notification_id
    where d.status in ('queued', 'retry', 'blocked')
      and d.notification_version = n.version
      and d.next_attempt_at <= statement_timestamp()
      and d.scheduled_at <= statement_timestamp()
      and n.read_at is null
      and n.available_at <= statement_timestamp()
      and n.expires_at > statement_timestamp()
    order by
      agrocore_private.notification_priority_rank(d.priority) desc,
      d.next_attempt_at,
      d.created_at,
      d.id
    for update of d skip locked
    limit p_limit
  ),
  claimed as (
    update agrocore_private.notification_external_deliveries d
    set
      status = 'processing',
      lease_token = gen_random_uuid(),
      lease_expires_at = statement_timestamp() + interval '2 minutes',
      updated_at = statement_timestamp()
    where d.id in (select id from candidates)
    returning d.*
  )
  select
    c.id as delivery_id,
    c.organization_id,
    c.notification_id,
    c.recipient_user_id,
    c.channel,
    c.priority,
    c.attempt_count + 1 as attempt_number,
    c.max_attempts,
    n.title,
    n.message,
    n.route,
    s.endpoint as push_endpoint,
    s.p256dh as push_p256dh,
    s.auth_secret as push_auth_secret,
    c.lease_token
  from claimed c
  join public.notifications n
    on n.id = c.notification_id
   and n.version = c.notification_version
  left join agrocore_private.notification_push_subscriptions s
    on s.id = c.push_subscription_id
  order by
    agrocore_private.notification_priority_rank(c.priority) desc,
    c.next_attempt_at,
    c.id;
end;
$$;

revoke all on function public.agrocore_claim_notification_deliveries(text,integer)
  from public, anon, authenticated;
grant execute on function public.agrocore_claim_notification_deliveries(text,integer)
  to service_role;
