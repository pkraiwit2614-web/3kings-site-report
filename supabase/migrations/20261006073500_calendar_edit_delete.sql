-- 2026-10-06: edit/delete controls for Web App calendars and events.
-- Existing read RLS and write-through-RPC model remain unchanged.

create or replace function public.work_calendar_update(
  p_calendar_id uuid,p_name text,p_color text,p_client_session_id uuid,p_user_agent text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor')) then
    raise exception 'NOT_AUTHORIZED_FOR_CALENDAR_EDIT';
  end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null or char_length(btrim(p_name))>120 then raise exception 'INVALID_CALENDAR_NAME'; end if;
  if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_CALENDAR_COLOR'; end if;

  update public.work_calendars
  set name=btrim(p_name),color=p_color,updated_at=now()
  where id=p_calendar_id and active=true
  returning id into v_id;

  if v_id is null then raise exception 'CALENDAR_NOT_FOUND'; end if;

  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar','calendar_update',v_id::text,
    jsonb_build_object('name',btrim(p_name),'color',p_color),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $$;

create or replace function public.work_calendar_delete(
  p_calendar_id uuid,p_client_session_id uuid,p_user_agent text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_id uuid; v_name text; v_event_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor')) then
    raise exception 'NOT_AUTHORIZED_FOR_CALENDAR_EDIT';
  end if;

  select c.name,(select count(*) from public.work_calendar_events e where e.calendar_id=c.id)
  into v_name,v_event_count
  from public.work_calendars c
  where c.id=p_calendar_id and c.active=true;

  if v_name is null then raise exception 'CALENDAR_NOT_FOUND'; end if;

  delete from public.work_calendars where id=p_calendar_id returning id into v_id;

  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar','calendar_delete',v_id::text,
    jsonb_build_object('name',v_name,'deleted_event_count',v_event_count),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $$;

create or replace function public.work_calendar_delete_event(
  p_event_id uuid,p_client_session_id uuid,p_user_agent text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_id uuid; v_calendar_id uuid; v_event_date date; v_title text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor')) then
    raise exception 'NOT_AUTHORIZED_FOR_CALENDAR_EDIT';
  end if;

  delete from public.work_calendar_events
  where id=p_event_id
  returning id,calendar_id,event_date,title into v_id,v_calendar_id,v_event_date,v_title;

  if v_id is null then raise exception 'EVENT_NOT_FOUND'; end if;

  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar','calendar_event_delete',v_id::text,
    jsonb_build_object('calendar_id',v_calendar_id,'event_date',v_event_date,'title',v_title),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $$;

revoke all on function public.work_calendar_update(uuid,text,text,uuid,text) from public,anon;
revoke all on function public.work_calendar_delete(uuid,uuid,text) from public,anon;
revoke all on function public.work_calendar_delete_event(uuid,uuid,text) from public,anon;
grant execute on function public.work_calendar_update(uuid,text,text,uuid,text) to authenticated;
grant execute on function public.work_calendar_delete(uuid,uuid,text) to authenticated;
grant execute on function public.work_calendar_delete_event(uuid,uuid,text) to authenticated;
