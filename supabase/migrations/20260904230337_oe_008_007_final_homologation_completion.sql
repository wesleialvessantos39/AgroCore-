-- AgroCore — OE-008.007 R2 — conclusão do hardening de homologação
-- Fecha a mutação de leitura individual para obedecer às mesmas regras
-- de validade e preferência aplicadas ao snapshot/RLS da Central.

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
    and n.available_at <= statement_timestamp()
    and n.expires_at > statement_timestamp()
    and agrocore_private.notification_category_enabled(
      n.organization_id,
      n.recipient_user_id,
      n.category
    )
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
