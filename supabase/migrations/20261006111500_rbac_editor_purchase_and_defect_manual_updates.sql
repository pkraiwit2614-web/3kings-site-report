-- Role matrix expansion + safe manual Defect update layer.
-- Raw Drive/Hotel defect rows remain untouched. Manual entries are append-only history.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array[
    'manager'::text,
    'admin'::text,
    'viewer'::text,
    'viewer_editor'::text,
    'defect_contributor'::text,
    'defect_editor'::text,
    'purchase'::text,
    'engineer'::text,
    'foreman'::text,
    'payroll'::text
  ]));

create or replace function public.owner_set_profile_role(p_user_id uuid, p_role text)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_owner constant uuid := 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid;
begin
  if auth.uid() is distinct from v_owner
     or not exists(
       select 1 from public.profiles p
       where p.user_id=v_owner and p.active=true and p.role='manager'
     ) then
    raise exception 'OWNER_ONLY';
  end if;
  if p_user_id=v_owner then raise exception 'OWNER_ROLE_IMMUTABLE'; end if;
  if p_role not in ('admin','viewer','viewer_editor','defect_contributor','defect_editor','purchase') then
    raise exception 'INVALID_ROLE';
  end if;

  update public.profiles
  set role=p_role,updated_at=now()
  where user_id=p_user_id;

  if not found then raise exception 'USER_NOT_FOUND'; end if;
  return p_role;
end;
$function$;

revoke all on function public.owner_set_profile_role(uuid,text) from public,anon;
grant execute on function public.owner_set_profile_role(uuid,text) to authenticated;

-- Strict write roles:
-- Owner(manager) + Viewer & Editor may change schedule source rows through existing editor paths.
drop policy if exists schedule_insert_manage on public.schedule_tasks;
create policy schedule_insert_manage on public.schedule_tasks
for insert to authenticated
with check ((select private.has_app_role(array['manager'::text,'viewer_editor'::text])));

drop policy if exists schedule_update_manage on public.schedule_tasks;
create policy schedule_update_manage on public.schedule_tasks
for update to authenticated
using ((select private.has_app_role(array['manager'::text,'viewer_editor'::text])))
with check ((select private.has_app_role(array['manager'::text,'viewer_editor'::text])));

drop policy if exists schedule_delete_manage on public.schedule_tasks;
create policy schedule_delete_manage on public.schedule_tasks
for delete to authenticated
using ((select private.has_app_role(array['manager'::text,'viewer_editor'::text])));

-- Owner(manager) + Purchase may change procurement rows through existing editor paths.
drop policy if exists procurement_insert_manage on public.procurement_items;
create policy procurement_insert_manage on public.procurement_items
for insert to authenticated
with check ((select private.has_app_role(array['manager'::text,'purchase'::text])));

drop policy if exists procurement_update_manage on public.procurement_items;
create policy procurement_update_manage on public.procurement_items
for update to authenticated
using ((select private.has_app_role(array['manager'::text,'purchase'::text])))
with check ((select private.has_app_role(array['manager'::text,'purchase'::text])));

drop policy if exists procurement_delete_manage on public.procurement_items;
create policy procurement_delete_manage on public.procurement_items
for delete to authenticated
using ((select private.has_app_role(array['manager'::text,'purchase'::text])));

create table if not exists public.defect_manual_updates (
  id uuid primary key default gen_random_uuid(),
  room_no text not null references public.condo_room_status(room_no) on update cascade on delete restrict,
  detail_text text not null check (char_length(btrim(detail_text)) between 1 and 4000),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists defect_manual_updates_room_created_idx
  on public.defect_manual_updates(room_no,created_at desc);

alter table public.defect_manual_updates enable row level security;

revoke all on table public.defect_manual_updates from anon,authenticated;
grant select on table public.defect_manual_updates to authenticated;

drop policy if exists defect_manual_updates_read_active on public.defect_manual_updates;
create policy defect_manual_updates_read_active
on public.defect_manual_updates
for select to authenticated
using (
  exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true
  )
);

create or replace function public.defect_submit_manual_details(
  p_updates jsonb,
  p_client_session_id uuid,
  p_user_agent text
)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
  v_rooms text[];
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=v_user
      and p.active=true
      and p.role in ('manager','defect_contributor','defect_editor')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_DEFECT_EDIT';
  end if;

  if p_updates is null or jsonb_typeof(p_updates)<>'array' then
    raise exception 'UPDATES_MUST_BE_ARRAY';
  end if;

  select count(*),array_agg(upper(btrim(x.room_no)) order by upper(btrim(x.room_no)))
  into v_count,v_rooms
  from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text);

  if v_count<1 or v_count>50 then raise exception 'INVALID_UPDATE_COUNT'; end if;
  if (select count(distinct upper(btrim(x.room_no)))
      from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text))<>v_count then
    raise exception 'DUPLICATE_ROOM_IN_REQUEST';
  end if;

  if exists(
    select 1
    from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text)
    where upper(btrim(x.room_no)) !~ '^[AB][0-9]{3}$'
       or nullif(btrim(coalesce(x.detail_text,'')),'') is null
       or char_length(btrim(x.detail_text))>4000
  ) then
    raise exception 'INVALID_DEFECT_DETAIL';
  end if;

  if exists(
    select 1
    from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text)
    left join public.condo_room_status r on r.room_no=upper(btrim(x.room_no))
    where r.room_no is null
  ) then
    raise exception 'UNKNOWN_ROOM';
  end if;

  insert into public.defect_manual_updates(room_no,detail_text,created_by)
  select upper(btrim(x.room_no)),btrim(x.detail_text),v_user
  from jsonb_to_recordset(p_updates) as x(room_no text,detail_text text);

  insert into public.activity_logs(
    user_id,client_session_id,event_type,path,action,target,metadata,user_agent
  )
  values(
    v_user,
    coalesce(p_client_session_id,gen_random_uuid()),
    'data_change',
    '/defect-flow',
    'defect_manual_detail_add',
    array_to_string(v_rooms,','),
    jsonb_build_object('room_count',v_count,'rooms',to_jsonb(v_rooms)),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );

  return v_count;
end;
$function$;

revoke all on function public.defect_submit_manual_details(jsonb,uuid,text) from public,anon;
grant execute on function public.defect_submit_manual_details(jsonb,uuid,text) to authenticated;

comment on table public.defect_manual_updates is
  'Append-only manual Defect detail layer from Web App. Does not overwrite Hotel/Drive source rows.';
