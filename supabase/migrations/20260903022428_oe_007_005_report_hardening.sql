-- AgroCore — OE-007.005 — hardening complementar de relatório final
-- Alinha validação de entradas e cobre a FK de autoria apontada pelo advisor.

create index if not exists technical_visit_report_versions_issued_by_idx
  on public.technical_visit_report_versions (issued_by_user_id);

create or replace function agrocore_private.validate_technical_visit_report_input(
  p_summary text,
  p_pending_items jsonb,
  p_revision_reason text default null,
  p_requires_revision_reason boolean default false
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if length(btrim(coalesce(p_summary, ''))) < 10
     or length(btrim(coalesce(p_summary, ''))) > 5000 then
    raise exception 'AGROCORE_REPORT_INVALID';
  end if;

  if p_pending_items is null
     or jsonb_typeof(p_pending_items) <> 'array'
     or jsonb_array_length(p_pending_items) > 50 then
    raise exception 'AGROCORE_REPORT_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_pending_items) item
    where jsonb_typeof(item) <> 'object'
       or length(btrim(coalesce(item ->> 'id', ''))) < 1
       or length(btrim(coalesce(item ->> 'id', ''))) > 120
       or coalesce(item ->> 'category', '') not in (
         'documentation',
         'property_registry',
         'evidence',
         'technical',
         'other'
       )
       or length(btrim(coalesce(item ->> 'description', ''))) < 3
       or length(btrim(coalesce(item ->> 'description', ''))) > 1000
  ) then
    raise exception 'AGROCORE_REPORT_INVALID';
  end if;

  if p_requires_revision_reason
     and (
       length(btrim(coalesce(p_revision_reason, ''))) < 3
       or length(btrim(coalesce(p_revision_reason, ''))) > 500
     ) then
    raise exception 'AGROCORE_REASON_REQUIRED';
  end if;
end;
$$;

revoke all on function agrocore_private.validate_technical_visit_report_input(
  text,jsonb,text,boolean
) from public, anon;
grant execute on function agrocore_private.validate_technical_visit_report_input(
  text,jsonb,text,boolean
) to authenticated;
