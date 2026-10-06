-- 2026-10-06: canonical editor roles, Web App calendars, Defect manual/file staging.
-- Keep raw source-of-truth tables protected; edits go through narrow RPCs with Activity Log.

create table if not exists public.work_calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  color text not null default '#7b61ff' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_calendar_events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.work_calendars(id) on delete cascade,
  event_date date not null,
  title text not null check (char_length(title) between 1 and 200),
  detail text,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_calendar_event_detail_size check (detail is null or char_length(detail) <= 4000)
);

create index if not exists work_calendars_created_by_date_idx on public.work_calendars(created_by,created_at desc);
create index if not exists work_calendar_events_date_idx on public.work_calendar_events(event_date,calendar_id);

alter table public.work_calendars enable row level security;
alter table public.work_calendar_events enable row level security;

revoke insert,update,delete on public.work_calendars from authenticated,anon;
revoke insert,update,delete on public.work_calendar_events from authenticated,anon;
grant select on public.work_calendars, public.work_calendar_events to authenticated;

drop policy if exists work_calendars_read_active on public.work_calendars;
create policy work_calendars_read_active on public.work_calendars for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true));

drop policy if exists work_calendar_events_read_active on public.work_calendar_events;
create policy work_calendar_events_read_active on public.work_calendar_events for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true));

create or replace function public.work_calendar_create(
  p_name text,p_color text,p_client_session_id uuid,p_user_agent text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_id uuid; v_today date:=(now() at time zone 'Asia/Bangkok')::date; v_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor')) then
    raise exception 'NOT_AUTHORIZED_FOR_CALENDAR_EDIT';
  end if;
  select count(*) into v_count from public.work_calendars c
   where c.created_by=v_user and (c.created_at at time zone 'Asia/Bangkok')::date=v_today;
  if v_count>=3 then raise exception 'CALENDAR_DAILY_CREATE_LIMIT_3'; end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null or char_length(btrim(p_name))>120 then raise exception 'INVALID_CALENDAR_NAME'; end if;
  if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_CALENDAR_COLOR'; end if;
  insert into public.work_calendars(name,color,created_by) values(btrim(p_name),p_color,v_user) returning id into v_id;
  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar','calendar_create',v_id::text,jsonb_build_object('name',btrim(p_name)),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $$;

create or replace function public.work_calendar_save_event(
  p_event_id uuid,p_calendar_id uuid,p_event_date date,p_title text,p_detail text,
  p_client_session_id uuid,p_user_agent text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor')) then
    raise exception 'NOT_AUTHORIZED_FOR_CALENDAR_EDIT';
  end if;
  if not exists(select 1 from public.work_calendars c where c.id=p_calendar_id and c.active=true) then raise exception 'CALENDAR_NOT_FOUND'; end if;
  if p_event_date is null or nullif(btrim(coalesce(p_title,'')),'') is null then raise exception 'EVENT_DATE_TITLE_REQUIRED'; end if;
  if char_length(btrim(p_title))>200 or char_length(coalesce(p_detail,''))>4000 then raise exception 'TEXT_TOO_LONG'; end if;

  if p_event_id is null then
    insert into public.work_calendar_events(calendar_id,event_date,title,detail,created_by,updated_by)
    values(p_calendar_id,p_event_date,btrim(p_title),nullif(btrim(coalesce(p_detail,'')),''),v_user,v_user)
    returning id into v_id;
  else
    update public.work_calendar_events set calendar_id=p_calendar_id,event_date=p_event_date,title=btrim(p_title),
      detail=nullif(btrim(coalesce(p_detail,'')),''),updated_by=v_user,updated_at=now()
    where id=p_event_id returning id into v_id;
    if v_id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  end if;

  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/calendar',
    case when p_event_id is null then 'calendar_event_create' else 'calendar_event_update' end,
    v_id::text,jsonb_build_object('calendar_id',p_calendar_id,'event_date',p_event_date),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $$;

create table if not exists public.defect_file_uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check(file_size>0 and file_size<=20971520),
  target_drive_folder_id text not null default '14lNNqG34BZgFiH6ZJW4sRaIH2rjE6WcM',
  status text not null default 'pending_drive_sync' check(status in ('pending_drive_sync','processing','completed','failed')),
  error_text text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.defect_file_uploads enable row level security;
revoke insert,update,delete on public.defect_file_uploads from authenticated,anon;
grant select on public.defect_file_uploads to authenticated;
drop policy if exists defect_file_uploads_read_allowed on public.defect_file_uploads;
create policy defect_file_uploads_read_allowed on public.defect_file_uploads for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','defect_contributor','defect_editor')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('defect-flow-staging','defect-flow-staging',false,20971520,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=array['application/pdf'];

drop policy if exists defect_flow_staging_insert on storage.objects;
create policy defect_flow_staging_insert on storage.objects for insert to authenticated
with check (
  bucket_id='defect-flow-staging'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','defect_contributor','defect_editor'))
);
drop policy if exists defect_flow_staging_select on storage.objects;
create policy defect_flow_staging_select on storage.objects for select to authenticated
using (
  bucket_id='defect-flow-staging'
  and exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.active=true and p.role in ('manager','defect_contributor','defect_editor'))
);

create or replace function public.defect_register_file_upload(
  p_file_name text,p_storage_path text,p_mime_type text,p_file_size bigint,
  p_client_session_id uuid,p_user_agent text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','defect_contributor','defect_editor')) then
    raise exception 'NOT_AUTHORIZED_FOR_DEFECT_EDIT';
  end if;
  if p_mime_type<>'application/pdf' or p_file_size<=0 or p_file_size>20971520 then raise exception 'INVALID_PDF_FILE'; end if;
  if p_storage_path not like v_user::text||'/%' then raise exception 'INVALID_STORAGE_OWNER'; end if;
  insert into public.defect_file_uploads(file_name,storage_path,mime_type,file_size,created_by)
  values(left(p_file_name,255),p_storage_path,p_mime_type,p_file_size,v_user) returning id into v_id;
  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/defect-flow','defect_pdf_upload',v_id::text,
    jsonb_build_object('file_name',left(p_file_name,255),'status','pending_drive_sync'),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $$;

create or replace function public.defect_manual_update_apply(
  p_room_no text,p_detail_text text,p_current_status text,p_status_group text,p_next_action text,
  p_client_session_id uuid,p_user_agent text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid()); v_id uuid; v_room text:=upper(replace(btrim(coalesce(p_room_no,'')),' ',''));
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','defect_contributor','defect_editor')) then
    raise exception 'NOT_AUTHORIZED_FOR_DEFECT_EDIT';
  end if;
  if v_room !~ '^[AB][0-9]{3}$' then raise exception 'INVALID_ROOM_NO'; end if;
  if nullif(btrim(coalesce(p_detail_text,'')),'') is null then raise exception 'DETAIL_REQUIRED'; end if;
  if char_length(p_detail_text)>4000 or char_length(coalesce(p_current_status,''))>1000 or char_length(coalesce(p_next_action,''))>4000 then raise exception 'TEXT_TOO_LONG'; end if;
  if not exists(select 1 from public.condo_room_status r where r.room_no=v_room) then raise exception 'ROOM_NOT_FOUND'; end if;

  insert into public.defect_manual_updates(room_no,detail_text,created_by)
  values(v_room,btrim(p_detail_text),v_user) returning id into v_id;

  update public.condo_room_status set
    defect_detail=btrim(p_detail_text),
    current_status=coalesce(nullif(btrim(coalesce(p_current_status,'')),''),current_status),
    status_group=coalesce(nullif(btrim(coalesce(p_status_group,'')),''),status_group),
    next_action=coalesce(nullif(btrim(coalesce(p_next_action,'')),''),next_action),
    latest_source='Web App manual update',
    source_note='Manual Defect update from authorized Web App user',
    source_modified_at=now(),
    synced_at=now()
  where room_no=v_room;

  insert into public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata,user_agent)
  values(v_user,coalesce(p_client_session_id,gen_random_uuid()),'data_change','/defect-flow','defect_manual_update',v_room,
    jsonb_build_object('manual_update_id',v_id),left(nullif(btrim(coalesce(p_user_agent,'')),''),500));
  return v_id;
end $$;

revoke all on function public.work_calendar_create(text,text,uuid,text) from public,anon;
revoke all on function public.work_calendar_save_event(uuid,uuid,date,text,text,uuid,text) from public,anon;
revoke all on function public.defect_register_file_upload(text,text,text,bigint,uuid,text) from public,anon;
revoke all on function public.defect_manual_update_apply(text,text,text,text,text,uuid,text) from public,anon;
grant execute on function public.work_calendar_create(text,text,uuid,text) to authenticated;
grant execute on function public.work_calendar_save_event(uuid,uuid,date,text,text,uuid,text) to authenticated;
grant execute on function public.defect_register_file_upload(text,text,text,bigint,uuid,text) to authenticated;
grant execute on function public.defect_manual_update_apply(text,text,text,text,text,uuid,text) to authenticated;
