-- AgroCore — OE-008.007 — Homologação final e hardening do Módulo 008
-- Corrige a janela residual de expiração da Central, endurece leitura direta
-- e exige organização ativa para Agenda/Notificações sem recriar fontes canônicas.

alter table public.notifications
  drop constraint if exists notifications_validity_ck;

alter table public.notifications
  add constraint notifications_validity_ck
  check (expires_at >= available_at);

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
    from public.organizations o
    join public.organization_memberships m
      on m.organization_id = o.id
    where o.id = p_organization_id
      and o.status = 'active'
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
    from public.organizations o
    join public.organization_memberships m
      on m.organization_id = o.id
    where o.id = p_organization_id
      and o.status = 'active'
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
      expires_at = greatest(n.available_at, statement_timestamp()),
      version = n.version + 1
    where n.organization_id = p_organization_id
      and n.recipient_user_id = p_recipient_user_id
      and n.source_domain = p_source_domain
      and n.source_id = p_source_id
      and n.notification_type = p_notification_type
      and n.expires_at > statement_timestamp()
    returning n.id, n.category, n.expires_at
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
      jsonb_build_object(
        'reason', 'source_state_changed',
        'effectiveExpiresAt', v_row.expires_at
      )
    );
  end loop;
end;
$$;

revoke all on function agrocore_private.expire_schedule_notifications(
  uuid,uuid,text,text,text
) from public, anon, authenticated;

drop policy if exists "agrocore_notifications_select"
  on public.notifications;

create policy "agrocore_notifications_select"
on public.notifications
for select
to authenticated
using (
  recipient_user_id = (select auth.uid())
  and (select agrocore_private.can_access_notifications(organization_id))
  and available_at <= statement_timestamp()
  and expires_at > statement_timestamp()
  and agrocore_private.notification_category_enabled(
    organization_id,
    recipient_user_id,
    category
  )
);
