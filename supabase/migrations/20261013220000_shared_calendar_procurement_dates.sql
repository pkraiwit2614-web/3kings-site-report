-- 2026-10-13: Calendar linked procurement delivery dates. Preserve every source cell,
-- PO/PR, status, quantities and existing manual procurement overrides.
-- Google events and Web App calendars remain separate; only authorized Procurement roles
-- may link an event to a sourced procurement item.
create table if not exists public.procurement_calendar_delivery(
  source_identity text primary key,
  last_item_id uuid not null,
  event_key text not null unique,
  expected_delivery date not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  constraint procurement_calendar_event_key_valid check(char_length(event_key) between 5 and 1200)
);
create index if not exists procurement_calendar_delivery_item_idx on public.procurement_calendar_delivery(last_item_id);
alter table public.procurement_calendar_delivery enable row level security;
revoke all on public.procurement_calendar_delivery from anon;
revoke insert,update,delete,truncate,references,trigger on public.procurement_calendar_delivery from authenticated;
grant select on public.procurement_calendar_delivery to authenticated;
drop policy if exists procurement_calendar_delivery_read on public.procurement_calendar_delivery;
create policy procurement_calendar_delivery_read on public.procurement_calendar_delivery
  for select to authenticated using ((select private.is_active_user()));

create or replace function public.procurement_calendar_link_delivery(
  p_item_id uuid,p_event_key text,p_expected_delivery date,p_client_session_id uuid,p_user_agent text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_identity text; v_delivered date;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true
    and (p.role='purchase' or (p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager')))
    then raise exception 'NOT_AUTHORIZED_FOR_PROCUREMENT_EDIT'; end if;
  if nullif(btrim(coalesce(p_event_key,'')),'') is null or char_length(p_event_key)>1200
    or p_event_key !~ '^g:[^[:space:]]+:[A-Za-z0-9_-]{4,1024}$'
    then raise exception 'INVALID_CALENDAR_EVENT'; end if;
  if p_expected_delivery is null or p_expected_delivery<'2020-01-01'::date
    or p_expected_delivery>'2100-12-31'::date then raise exception 'INVALID_DELIVERY_DATE'; end if;
  select p.source_identity,p.actual_delivery into v_identity,v_delivered
  from public.v_procurement_source_rows p where p.id=p_item_id;
  if v_identity is null then raise exception 'PROCUREMENT_ITEM_NOT_FOUND'; end if;
  if v_delivered is not null then raise exception 'ITEM_ALREADY_DELIVERED'; end if;
  insert into public.procurement_calendar_delivery(source_identity,last_item_id,event_key,expected_delivery,updated_by,updated_at)
    values(v_identity,p_item_id,p_event_key,p_expected_delivery,v_user,now())
  on conflict(source_identity) do update
    set last_item_id=excluded.last_item_id,event_key=excluded.event_key,
      expected_delivery=excluded.expected_delivery,updated_by=v_user,updated_at=now();
  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar',
   'calendar_procurement_expected_delivery',p_item_id::text,
   jsonb_build_object('source_identity',v_identity,'event_key',p_event_key,'expected_delivery',p_expected_delivery),
   left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return p_item_id;
end $$;

create or replace function public.procurement_calendar_unlink_delivery(
  p_event_key text,p_client_session_id uuid,p_user_agent text
) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_identity text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true
    and (p.role='purchase' or (p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager')))
    then raise exception 'NOT_AUTHORIZED_FOR_PROCUREMENT_EDIT'; end if;
  delete from public.procurement_calendar_delivery where event_key=p_event_key returning source_identity into v_identity;
  if v_identity is not null then
    insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
    values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar',
      'calendar_procurement_unlink',v_identity,jsonb_build_object('event_key',p_event_key),
      left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  end if;
  return v_identity is not null;
end $$;

revoke all on function public.procurement_calendar_link_delivery(uuid,text,date,uuid,text) from public,anon;
revoke all on function public.procurement_calendar_unlink_delivery(text,uuid,text) from public,anon;
grant execute on function public.procurement_calendar_link_delivery(uuid,text,date,uuid,text) to authenticated;
grant execute on function public.procurement_calendar_unlink_delivery(text,uuid,text) to authenticated;

-- Existing v_procurement_items columns and column order are preserved; only the
-- linked estimated delivery date/text take precedence. No raw workbook writeback.
create or replace view public.v_procurement_items as
 SELECT p.id,
    p.project_id,
    p.vendor,
    p.item_name,
    p.procurement_status,
    p.payment_status,
        CASE
            WHEN o.source_identity IS NOT NULL THEN o.current_status
            ELSE p.current_status
        END AS current_status,
    p.pr_no,
    p.po_no,
        CASE
            WHEN d.source_identity IS NOT NULL THEN d.expected_delivery::text
            WHEN o.source_identity IS NOT NULL THEN o.expected_delivery_text
            ELSE p.expected_delivery_text
        END AS expected_delivery_text,
        CASE
            WHEN d.source_identity IS NOT NULL THEN d.expected_delivery
            WHEN o.source_identity IS NOT NULL THEN o.expected_delivery
            ELSE p.expected_delivery
        END AS expected_delivery,
    p.actual_delivery,
        CASE
            WHEN o.source_identity IS NOT NULL THEN o.condition_note
            ELSE p.condition_note
        END AS condition_note,
    p.source_updated_at,
    p.source_sheet,
    p.source_row,
    p.updated_by,
    p.created_at,
    p.updated_at,
    p.source_identity,
    o.review_status AS web_review_status,
    o.updated_at AS web_override_updated_at,
    o.updated_by AS web_override_updated_by
   FROM v_procurement_source_rows p
     LEFT JOIN procurement_item_overrides o ON o.source_identity = p.source_identity
     LEFT JOIN procurement_calendar_delivery d ON d.source_identity = p.source_identity;

-- Extend five existing *calendar-only* RPCs to Purchase without touching payroll,
-- Defect, schedule, procurement or Site Operations permissions. Fail if signature differs.
do $$
declare rec record; v_sql text;
begin
  for rec in select p.oid,p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('work_calendar_create','work_calendar_update','work_calendar_delete',
       'work_calendar_save_event','work_calendar_delete_event')
  loop
    v_sql:=pg_get_functiondef(rec.oid);
    if position('p.role in (''manager'',''viewer_editor'')' in v_sql)=0 then
      raise exception 'Calendar authorization function changed: %',rec.proname;
    end if;
    execute replace(v_sql,
      'p.role in (''manager'',''viewer_editor'')',
      'p.role in (''manager'',''viewer_editor'',''purchase'')');
  end loop;
end $$;
