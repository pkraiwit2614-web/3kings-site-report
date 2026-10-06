-- 3 Kings role matrix expansion and safe Web edit overlays.
-- Principle: Drive/Form/Hotel raw rows remain source evidence. Web edits live in separate overlay tables.

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

-- Raw Schedule and Procurement are Drive-synced evidence.
-- Browser users must write overlays through audited RPCs instead of mutating raw rows.
drop policy if exists schedule_insert_manage on public.schedule_tasks;
drop policy if exists schedule_update_manage on public.schedule_tasks;
drop policy if exists schedule_delete_manage on public.schedule_tasks;
revoke insert,update,delete on public.schedule_tasks from authenticated,anon;

drop policy if exists procurement_insert_manage on public.procurement_items;
drop policy if exists procurement_update_manage on public.procurement_items;
drop policy if exists procurement_delete_manage on public.procurement_items;
revoke insert,update,delete on public.procurement_items from authenticated,anon;

create table if not exists public.schedule_task_overrides (
  task_id uuid primary key references public.schedule_tasks(id) on delete cascade,
  site_status text,
  next_action text,
  target_close date,
  blocker text,
  notes text,
  review_status text not null default 'pending'
    check (review_status in ('pending','confirmed','needs_review')),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.schedule_task_overrides enable row level security;
revoke all on table public.schedule_task_overrides from anon,authenticated;
grant select on table public.schedule_task_overrides to authenticated;

drop policy if exists schedule_task_overrides_read_active on public.schedule_task_overrides;
create policy schedule_task_overrides_read_active
on public.schedule_task_overrides
for select to authenticated
using ((select private.is_active_user()));

create or replace view public.v_schedule_tasks
with (security_invoker=true)
as
select
  s.id,
  s.project_id,
  s.source_task_no,
  s.category,
  s.task_name,
  s.area,
  s.planned_duration_days,
  s.planned_start,
  s.planned_end,
  s.baseline_progress,
  s.imported_plan_progress,
  s.actual_progress,
  s.plan_status,
  case when o.task_id is not null then o.site_status else s.site_status end as site_status,
  s.actual_start,
  s.actual_end,
  s.responsible_person,
  s.contractor,
  s.inspection_point,
  s.required_evidence,
  s.inspection_type,
  s.inspection_result,
  s.inspection_date,
  case when o.task_id is not null then o.blocker else s.blocker end as blocker,
  case when o.task_id is not null then o.next_action else s.next_action end as next_action,
  case when o.task_id is not null then o.target_close else s.target_close end as target_close,
  s.defect_ref,
  s.evidence_link,
  s.source_updated_at,
  case when o.task_id is not null then o.notes else s.notes end as notes,
  s.source_file,
  s.source_sheet,
  s.source_row,
  s.updated_by,
  s.created_at,
  s.updated_at,
  case
    when s.planned_start is null or s.planned_end is null then null::numeric
    when (now() at time zone 'Asia/Bangkok')::date < s.planned_start then 0::numeric
    when (now() at time zone 'Asia/Bangkok')::date >= s.planned_end then 1::numeric
    else round(
      ((now() at time zone 'Asia/Bangkok')::date - s.planned_start + 1)::numeric
      / greatest(1,s.planned_end-s.planned_start+1)::numeric,
      4
    )
  end as current_plan_progress,
  case
    when s.planned_end is null then 0
    when s.actual_progress>=1::numeric and s.actual_end is not null then greatest(0,s.actual_end-s.planned_end)
    when s.actual_progress<1::numeric and (now() at time zone 'Asia/Bangkok')::date>s.planned_end
      then (now() at time zone 'Asia/Bangkok')::date-s.planned_end
    else 0
  end as delay_days,
  case
    when s.planned_start is null or s.planned_end is null then null::numeric
    when (now() at time zone 'Asia/Bangkok')::date<s.planned_start then s.actual_progress
    when (now() at time zone 'Asia/Bangkok')::date>=s.planned_end then s.actual_progress-1::numeric
    else s.actual_progress-
      ((now() at time zone 'Asia/Bangkok')::date-s.planned_start+1)::numeric
      / greatest(1,s.planned_end-s.planned_start+1)::numeric
  end as current_variance,
  o.review_status as web_review_status,
  o.updated_at as web_override_updated_at,
  o.updated_by as web_override_updated_by
from public.schedule_tasks s
left join public.schedule_task_overrides o on o.task_id=s.id
where s.is_active=true;

revoke all on public.v_schedule_tasks from anon;
grant select on public.v_schedule_tasks to authenticated;

create or replace function public.schedule_save_web_override(
  p_task_id uuid,
  p_site_status text,
  p_next_action text,
  p_target_close date,
  p_blocker text,
  p_notes text,
  p_review_status text,
  p_client_session_id uuid,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_SCHEDULE_EDIT';
  end if;
  if p_review_status not in ('pending','confirmed','needs_review') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;
  if not exists(select 1 from public.schedule_tasks s where s.id=p_task_id and s.is_active=true) then
    raise exception 'TASK_NOT_FOUND';
  end if;
  if char_length(coalesce(p_site_status,''))>500
     or char_length(coalesce(p_next_action,''))>4000
     or char_length(coalesce(p_blocker,''))>4000
     or char_length(coalesce(p_notes,''))>4000 then
    raise exception 'TEXT_TOO_LONG';
  end if;

  insert into public.schedule_task_overrides(
    task_id,site_status,next_action,target_close,blocker,notes,review_status,updated_by,updated_at
  )
  values(
    p_task_id,nullif(btrim(coalesce(p_site_status,'')),''),
    nullif(btrim(coalesce(p_next_action,'')),''),
    p_target_close,
    nullif(btrim(coalesce(p_blocker,'')),''),
    nullif(btrim(coalesce(p_notes,'')),''),
    p_review_status,v_user,now()
  )
  on conflict(task_id) do update set
    site_status=excluded.site_status,
    next_action=excluded.next_action,
    target_close=excluded.target_close,
    blocker=excluded.blocker,
    notes=excluded.notes,
    review_status=excluded.review_status,
    updated_by=v_user,
    updated_at=now();

  insert into public.activity_logs(
    user_id,client_session_id,event_type,path,action,target,metadata,user_agent
  ) values (
    v_user,coalesce(p_client_session_id,gen_random_uuid()),
    'data_change','/schedule','schedule_web_override_save',p_task_id::text,
    jsonb_build_object('review_status',p_review_status),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );

  return p_task_id;
end;
$function$;

revoke all on function public.schedule_save_web_override(uuid,text,text,date,text,text,text,uuid,text) from public,anon;
grant execute on function public.schedule_save_web_override(uuid,text,text,date,text,text,text,uuid,text) to authenticated;

create or replace view public.v_procurement_source_rows
with (security_invoker=true)
as
with base as (
  select
    p.*,
    coalesce((
      select string_agg(prj.code,',' order by prj.code)
      from public.procurement_item_projects l
      join public.projects prj on prj.id=l.project_id
      where l.procurement_item_id=p.id
    ),'') as identity_project_codes,
    lower(regexp_replace(btrim(coalesce(p.vendor,'')),'\\s+',' ','g')) as identity_vendor,
    lower(regexp_replace(btrim(coalesce(p.item_name,'')),'\\s+',' ','g')) as identity_item
  from public.procurement_items p
),
ranked as (
  select
    b.*,
    row_number() over (
      partition by b.identity_vendor,b.identity_item,b.identity_project_codes
      order by coalesce(b.source_sheet,''),coalesce(b.source_row,2147483647),b.id
    ) as identity_occurrence
  from base b
)
select
  r.*,
  md5(concat_ws('|',r.identity_vendor,r.identity_item,r.identity_project_codes,r.identity_occurrence::text)) as source_identity
from ranked r;

revoke all on public.v_procurement_source_rows from anon;
grant select on public.v_procurement_source_rows to authenticated;

create table if not exists public.procurement_item_overrides (
  source_identity text primary key,
  last_item_id uuid,
  current_status text,
  expected_delivery_text text,
  expected_delivery date,
  condition_note text,
  review_status text not null default 'pending'
    check (review_status in ('pending','confirmed','needs_review')),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.procurement_item_overrides enable row level security;
revoke all on table public.procurement_item_overrides from anon,authenticated;
grant select on table public.procurement_item_overrides to authenticated;

drop policy if exists procurement_item_overrides_read_active on public.procurement_item_overrides;
create policy procurement_item_overrides_read_active
on public.procurement_item_overrides
for select to authenticated
using ((select private.is_active_user()));

create or replace view public.v_procurement_items
with (security_invoker=true)
as
select
  p.id,p.project_id,p.vendor,p.item_name,p.procurement_status,p.payment_status,
  case when o.source_identity is not null then o.current_status else p.current_status end as current_status,
  p.pr_no,p.po_no,
  case when o.source_identity is not null then o.expected_delivery_text else p.expected_delivery_text end as expected_delivery_text,
  case when o.source_identity is not null then o.expected_delivery else p.expected_delivery end as expected_delivery,
  p.actual_delivery,
  case when o.source_identity is not null then o.condition_note else p.condition_note end as condition_note,
  p.source_updated_at,p.source_sheet,p.source_row,p.updated_by,p.created_at,p.updated_at,
  p.source_identity,
  o.review_status as web_review_status,
  o.updated_at as web_override_updated_at,
  o.updated_by as web_override_updated_by
from public.v_procurement_source_rows p
left join public.procurement_item_overrides o on o.source_identity=p.source_identity;

revoke all on public.v_procurement_items from anon;
grant select on public.v_procurement_items to authenticated;

create or replace function public.procurement_save_web_override(
  p_item_id uuid,
  p_current_status text,
  p_expected_delivery_text text,
  p_expected_delivery date,
  p_condition_note text,
  p_review_status text,
  p_client_session_id uuid,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_identity text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','purchase')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_PROCUREMENT_EDIT';
  end if;
  if p_review_status not in ('pending','confirmed','needs_review') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;

  select p.source_identity into v_identity
  from public.v_procurement_source_rows p
  where p.id=p_item_id;

  if v_identity is null then raise exception 'PROCUREMENT_ITEM_NOT_FOUND'; end if;
  if char_length(coalesce(p_current_status,''))>1000
     or char_length(coalesce(p_expected_delivery_text,''))>1000
     or char_length(coalesce(p_condition_note,''))>4000 then
    raise exception 'TEXT_TOO_LONG';
  end if;

  insert into public.procurement_item_overrides(
    source_identity,last_item_id,current_status,expected_delivery_text,expected_delivery,condition_note,
    review_status,updated_by,updated_at
  )
  values(
    v_identity,p_item_id,
    nullif(btrim(coalesce(p_current_status,'')),''),
    nullif(btrim(coalesce(p_expected_delivery_text,'')),''),
    p_expected_delivery,
    nullif(btrim(coalesce(p_condition_note,'')),''),
    p_review_status,v_user,now()
  )
  on conflict(source_identity) do update set
    last_item_id=excluded.last_item_id,
    current_status=excluded.current_status,
    expected_delivery_text=excluded.expected_delivery_text,
    expected_delivery=excluded.expected_delivery,
    condition_note=excluded.condition_note,
    review_status=excluded.review_status,
    updated_by=v_user,
    updated_at=now();

  insert into public.activity_logs(
    user_id,client_session_id,event_type,path,action,target,metadata,user_agent
  ) values (
    v_user,coalesce(p_client_session_id,gen_random_uuid()),
    'data_change','/procurement','procurement_web_override_save',p_item_id::text,
    jsonb_build_object('review_status',p_review_status,'source_identity',v_identity),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );

  return p_item_id;
end;
$function$;

revoke all on function public.procurement_save_web_override(uuid,text,text,date,text,text,uuid,text) from public,anon;
grant execute on function public.procurement_save_web_override(uuid,text,text,date,text,text,uuid,text) to authenticated;

create table if not exists public.site_operations_management_reviews (
  entry_id uuid primary key references public.site_operations_entries(id) on delete cascade,
  review_status text not null default 'pending'
    check (review_status in ('pending','confirmed','needs_review')),
  management_note text,
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.site_operations_management_reviews enable row level security;
revoke all on table public.site_operations_management_reviews from anon,authenticated;
grant select on table public.site_operations_management_reviews to authenticated;

drop policy if exists site_operations_management_reviews_read_active on public.site_operations_management_reviews;
create policy site_operations_management_reviews_read_active
on public.site_operations_management_reviews
for select to authenticated
using ((select private.is_active_user()));

create or replace function public.site_operations_save_management_review(
  p_entry_id uuid,
  p_review_status text,
  p_management_note text,
  p_client_session_id uuid,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_SITE_OPERATIONS_EDIT';
  end if;
  if p_review_status not in ('pending','confirmed','needs_review') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;
  if not exists(select 1 from public.site_operations_entries e where e.id=p_entry_id) then
    raise exception 'SITE_OPERATIONS_ENTRY_NOT_FOUND';
  end if;
  if char_length(coalesce(p_management_note,''))>4000 then raise exception 'TEXT_TOO_LONG'; end if;

  insert into public.site_operations_management_reviews(
    entry_id,review_status,management_note,updated_by,updated_at
  )
  values(
    p_entry_id,p_review_status,nullif(btrim(coalesce(p_management_note,'')),''),
    v_user,now()
  )
  on conflict(entry_id) do update set
    review_status=excluded.review_status,
    management_note=excluded.management_note,
    updated_by=v_user,
    updated_at=now();

  insert into public.activity_logs(
    user_id,client_session_id,event_type,path,action,target,metadata,user_agent
  ) values (
    v_user,coalesce(p_client_session_id,gen_random_uuid()),
    'data_change','/reports','site_operations_management_review_save',p_entry_id::text,
    jsonb_build_object('review_status',p_review_status),
    left(nullif(btrim(coalesce(p_user_agent,'')),''),500)
  );

  return p_entry_id;
end;
$function$;

revoke all on function public.site_operations_save_management_review(uuid,text,text,uuid,text) from public,anon;
grant execute on function public.site_operations_save_management_review(uuid,text,text,uuid,text) to authenticated;

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

comment on table public.schedule_task_overrides is
  'Web App management override layer for Schedule. Raw schedule_tasks remains Drive evidence.';
comment on table public.procurement_item_overrides is
  'Web App management override layer for Procurement. Raw procurement_items remains Drive evidence.';
comment on table public.site_operations_management_reviews is
  'Management review layer for Site Operations. Raw daily report evidence remains unchanged.';
comment on table public.defect_manual_updates is
  'Append-only manual Defect detail layer from Web App. Does not overwrite Hotel/Drive source rows.';
