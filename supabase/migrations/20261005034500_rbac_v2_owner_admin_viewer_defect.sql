-- RBAC v2: Owner / Admin / Viewer / Defect Contributor
-- Built from Production after Prompt 2, Payroll direct-write closure and Prompt 12.
-- No existing user rows are rewritten automatically.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('manager','admin','viewer','defect_contributor','engineer','foreman','payroll'));

create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true and p.role<>'defect_contributor'
  );
$$;
revoke all on function private.is_active_user() from public,anon,authenticated;
grant execute on function private.is_active_user() to authenticated;

create or replace function private.can_write_reports()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true
      and p.role in ('manager','admin','engineer')
  );
$$;
revoke all on function private.can_write_reports() from public,anon,authenticated;
grant execute on function private.can_write_reports() to authenticated;

create or replace function private.can_manage_labour_payroll()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true
      and p.role in ('manager','admin','engineer','payroll')
  );
$$;
revoke all on function private.can_manage_labour_payroll() from public,anon,authenticated;
grant execute on function private.can_manage_labour_payroll() to authenticated;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_admin_provisioned boolean := coalesce((new.raw_app_meta_data ->> 'provisioned_by_admin')::boolean,false);
  v_requested_role text := lower(coalesce(new.raw_app_meta_data ->> 'app_role',''));
  v_role text;
  v_username text;
  v_active boolean;
begin
  if v_admin_provisioned and v_requested_role in ('admin','viewer','defect_contributor','engineer','foreman','payroll') then
    v_role:=v_requested_role; v_active:=true;
  else
    v_role:='viewer'; v_active:=false;
  end if;
  v_username:=case when v_admin_provisioned then nullif(upper(btrim(new.raw_app_meta_data ->> 'username')),'') else null end;
  insert into public.profiles(user_id,username,email,full_name,role,active)
  values(new.id,v_username,new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name',v_username,split_part(coalesce(new.email,''),'@',1)),
    v_role,v_active)
  on conflict(user_id) do update set
    username=coalesce(excluded.username,public.profiles.username),
    email=coalesce(excluded.email,public.profiles.email),
    full_name=coalesce(excluded.full_name,public.profiles.full_name),
    role=case when v_admin_provisioned then excluded.role else public.profiles.role end,
    active=case when v_admin_provisioned then true else public.profiles.active end,
    updated_at=now();
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public,anon,authenticated;

-- Role changes are Owner-only through admin-users. No signed-in user can update profiles directly.
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_manager_update on public.profiles;
revoke insert,update,delete,truncate,references,trigger on public.profiles from authenticated;
grant select on public.profiles to authenticated;

-- Defect Contributor is excluded from core application datasets at DB level.
drop policy if exists "active users read site operations" on public.site_operations_entries;
create policy "active users read site operations" on public.site_operations_entries
for select to authenticated using ((select private.is_active_user()));
drop policy if exists "active users read site operations projects" on public.site_operations_entry_projects;
create policy "active users read site operations projects" on public.site_operations_entry_projects
for select to authenticated using ((select private.is_active_user()));
drop policy if exists "active users read labour assignments" on public.labour_daily_assignments;
create policy "active users read labour assignments" on public.labour_daily_assignments
for select to authenticated using ((select private.is_active_user()));
drop policy if exists "active users read labour batches" on public.labour_verification_batches;
create policy "active users read labour batches" on public.labour_verification_batches
for select to authenticated using ((select private.is_active_user()));
drop policy if exists "active users read labour workers" on public.labour_workers;
create policy "active users read labour workers" on public.labour_workers
for select to authenticated using ((select private.is_active_user()));
drop policy if exists "active users read labour name map" on public.labour_name_map;
create policy "active users read labour name map" on public.labour_name_map
for select to authenticated using ((select private.is_active_user()));

-- Owner/Admin manage Labour; Viewer remains read-only.
drop policy if exists "payroll roles update site operation supervisor" on public.site_operations_entries;
create policy "payroll roles update site operation supervisor" on public.site_operations_entries
for update to authenticated using ((select private.can_manage_labour_payroll()))
with check ((select private.can_manage_labour_payroll()));

drop policy if exists "payroll roles insert labour assignments" on public.labour_daily_assignments;
create policy "payroll roles insert labour assignments" on public.labour_daily_assignments
for insert to authenticated with check ((select private.can_manage_labour_payroll()));
drop policy if exists "payroll roles update labour assignments" on public.labour_daily_assignments;
create policy "payroll roles update labour assignments" on public.labour_daily_assignments
for update to authenticated using ((select private.can_manage_labour_payroll())) with check ((select private.can_manage_labour_payroll()));
drop policy if exists "payroll roles delete labour assignments" on public.labour_daily_assignments;
create policy "payroll roles delete labour assignments" on public.labour_daily_assignments
for delete to authenticated using ((select private.can_manage_labour_payroll()));

drop policy if exists "payroll roles insert labour batches" on public.labour_verification_batches;
create policy "payroll roles insert labour batches" on public.labour_verification_batches
for insert to authenticated with check ((select private.can_manage_labour_payroll()));
drop policy if exists "payroll roles update labour batches" on public.labour_verification_batches;
create policy "payroll roles update labour batches" on public.labour_verification_batches
for update to authenticated using ((select private.can_manage_labour_payroll())) with check ((select private.can_manage_labour_payroll()));
drop policy if exists "payroll roles delete labour batches" on public.labour_verification_batches;
create policy "payroll roles delete labour batches" on public.labour_verification_batches
for delete to authenticated using ((select private.can_manage_labour_payroll()));

drop policy if exists "payroll roles insert labour name map" on public.labour_name_map;
create policy "payroll roles insert labour name map" on public.labour_name_map
for insert to authenticated with check ((select private.can_manage_labour_payroll()));
drop policy if exists "payroll roles update labour name map" on public.labour_name_map;
create policy "payroll roles update labour name map" on public.labour_name_map
for update to authenticated using ((select private.can_manage_labour_payroll())) with check ((select private.can_manage_labour_payroll()));

-- Payroll remains RPC-write-only; RLS also restricts SELECT to Owner/Admin-compatible roles.
drop policy if exists "payroll roles read payroll records" on public.payroll_verification_records;
create policy "payroll roles read payroll records" on public.payroll_verification_records
for select to authenticated using ((select private.can_manage_labour_payroll()));
drop policy if exists "payroll roles read payroll items" on public.payroll_verification_items;
create policy "payroll roles read payroll items" on public.payroll_verification_items
for select to authenticated using ((select private.can_manage_labour_payroll()));

-- Keep direct Payroll DML closed even if older policies still exist.
revoke insert,update,delete on public.payroll_verification_records from authenticated,anon;
revoke insert,update,delete on public.payroll_verification_items from authenticated,anon;
revoke select on public.payroll_verification_records from anon;
revoke select on public.payroll_verification_items from anon;
grant select on public.payroll_verification_records to authenticated;
grant select on public.payroll_verification_items to authenticated;

-- Admin can create/edit Daily Report data. Delete remains Owner-only.
drop policy if exists daily_update_owner_or_manager on public.daily_reports;
create policy daily_update_owner_or_manager on public.daily_reports
for update to authenticated
using ((select private.can_write_reports()) and (reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','admin','engineer']::text[]))))
with check ((select private.can_write_reports()) and (reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','admin','engineer']::text[]))));

drop policy if exists report_items_insert_owner on public.report_items;
create policy report_items_insert_owner on public.report_items for insert to authenticated
with check ((select private.can_write_reports()) and exists (
  select 1 from public.daily_reports d where d.id=report_items.daily_report_id
    and (d.reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','admin','engineer']::text[])))
));
drop policy if exists report_items_update_owner on public.report_items;
create policy report_items_update_owner on public.report_items for update to authenticated
using ((select private.can_write_reports()) and exists (
  select 1 from public.daily_reports d where d.id=report_items.daily_report_id
    and (d.reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','admin','engineer']::text[])))
))
with check ((select private.can_write_reports()) and exists (
  select 1 from public.daily_reports d where d.id=report_items.daily_report_id
    and (d.reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','admin','engineer']::text[])))
));
drop policy if exists report_items_delete_owner on public.report_items;
create policy report_items_delete_owner on public.report_items for delete to authenticated
using ((select private.can_write_reports()) and exists (
  select 1 from public.daily_reports d where d.id=report_items.daily_report_id
    and (d.reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','admin','engineer']::text[])))
));

drop policy if exists report_photos_update_self on public.report_photos;
create policy report_photos_update_self on public.report_photos for update to authenticated
using ((select private.can_write_reports()) and (uploaded_by=(select auth.uid()) or (select private.has_app_role(array['manager','admin','engineer']::text[]))))
with check ((select private.can_write_reports()) and (uploaded_by=(select auth.uid()) or (select private.has_app_role(array['manager','admin','engineer']::text[]))));
drop policy if exists report_photos_delete_self on public.report_photos;
create policy report_photos_delete_self on public.report_photos for delete to authenticated
using ((select private.can_write_reports()) and (uploaded_by=(select auth.uid()) or (select private.has_app_role(array['manager','admin','engineer']::text[]))));

CREATE OR REPLACE FUNCTION public.daily_report_apply_revision_v34(p_report_id uuid, p_reason text, p_report_date date, p_weather text, p_overall_progress numeric, p_total_manpower integer, p_summary text, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$;
declare
  v_report public.daily_reports%rowtype; v_items jsonb; v_photos jsonb; v_snapshot jsonb; v_new_revision integer;
begin
  if auth.uid() is null or not private.is_active_user() then raise exception 'unauthorized'; end if;
  if not private.can_write_reports() then raise exception 'report_write_forbidden'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'items_must_be_array'; end if;
  select * into v_report from public.daily_reports where id=p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;
  if v_report.reporter_id<>auth.uid() and not private.has_app_role(array['manager','admin','engineer']::text[]) then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at,i.id),'[]'::jsonb) into v_items from public.report_items i where i.daily_report_id=p_report_id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at,p.id),'[]'::jsonb) into v_photos from public.report_photos p where p.daily_report_id=p_report_id;
  v_snapshot:=jsonb_build_object('report',to_jsonb(v_report),'items',v_items,'photos',v_photos);
  insert into public.daily_report_revisions(daily_report_id,revision_no,snapshot,edited_by,reason) values(p_report_id,v_report.revision_no,v_snapshot,auth.uid(),nullif(btrim(coalesce(p_reason,'')),''));

  update public.report_photos set report_item_id=null where daily_report_id=p_report_id and report_item_id is not null;
  delete from public.report_items where daily_report_id=p_report_id;
  v_new_revision:=v_report.revision_no+1;
  update public.daily_reports set report_date=coalesce(p_report_date,v_report.report_date),weather=nullif(btrim(coalesce(p_weather,'')),''),overall_progress=greatest(0::numeric,least(1::numeric,coalesce(p_overall_progress,0))),total_manpower=greatest(0,coalesce(p_total_manpower,0)),summary=nullif(btrim(coalesce(p_summary,'')),''),revision_no=v_new_revision,last_edited_by=auth.uid(),last_edited_at=now() where id=p_report_id;

  insert into public.report_items(daily_report_id,schedule_task_id,work_category,work_item,actual_progress,manpower,contractor,status,blocker,next_action,target_date,remarks)
  select p_report_id,nullif(x.schedule_task_id,'')::uuid,nullif(btrim(coalesce(x.work_category,'')),''),btrim(x.work_item),greatest(0::numeric,least(1::numeric,coalesce(x.actual_progress,0))),greatest(0,coalesce(x.manpower,0)),nullif(btrim(coalesce(x.contractor,'')),''),coalesce(nullif(x.status,''),'in_progress'),nullif(btrim(coalesce(x.blocker,'')),''),nullif(btrim(coalesce(x.next_action,'')),''),nullif(x.target_date,'')::date,nullif(btrim(coalesce(x.remarks,'')),'')
  from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(schedule_task_id text,work_category text,work_item text,actual_progress numeric,manpower integer,contractor text,status text,blocker text,next_action text,target_date text,remarks text)
  where btrim(coalesce(x.work_item,''))<>'';
  return v_new_revision;
end; $function$;


CREATE OR REPLACE FUNCTION public.labour_confirm_supervisor_mapping(p_batch_id uuid, p_worker_id text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$;
declare
  v_user uuid := (select auth.uid());
  v_entry_id uuid;
  v_source_name text;
  v_norm text;
  v_worker_name text;
  v_team text;
  v_has_project boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_LABOUR_VERIFICATION';
  end if;

  select b.site_operations_entry_id,e.supervisor_raw
  into v_entry_id,v_source_name
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_batch_id
  for update of b;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

  select w.full_name,w.default_team into v_worker_name,v_team
  from public.labour_workers w where w.worker_id=p_worker_id;

  if not found then raise exception 'UNKNOWN_WORKER_ID'; end if;
  if nullif(btrim(coalesce(v_source_name,'')),'') is null then raise exception 'SOURCE_SUPERVISOR_EMPTY'; end if;

  v_norm:=lower(regexp_replace(v_source_name,'[[:space:]().,_/\\-]+','','g'));
  select exists(select 1 from public.site_operations_entry_projects ep where ep.entry_id=v_entry_id) into v_has_project;

  insert into public.labour_name_map(
    source_name_norm,source_name,worker_id,canonical_name,map_type,status,source_file_id,synced_at
  )
  values(v_norm,v_source_name,p_worker_id,v_worker_name,'WEB_VERIFIED','CONFIRMED','WEB_LABOUR_VERIFICATION',now())
  on conflict(source_name_norm) do update set
    source_name=excluded.source_name,worker_id=excluded.worker_id,canonical_name=excluded.canonical_name,
    map_type='WEB_VERIFIED',status='CONFIRMED',source_file_id='WEB_LABOUR_VERIFICATION',synced_at=now();

  update public.site_operations_entries
  set supervisor_worker_id=p_worker_id,
      mapping_status=case when v_has_project then 'mapped' else 'partial' end,
      updated_at=now()
  where id=v_entry_id;

  update public.labour_verification_batches
  set supervisor_worker_id=p_worker_id,
      home_team=v_team,
      verification_status=case when verification_status='verified' then 'needs_review' else 'pending' end,
      updated_at=now()
  where id=p_batch_id;

  update public.payroll_verification_records
  set status=case when status in ('verified','external_verified') then 'needs_review' else status end,
      updated_at=now()
  where labour_batch_id=p_batch_id;

  return p_worker_id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.labour_confirm_headcount(p_batch_id uuid, p_confirmed_headcount integer, p_basis text, p_evidence_note text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$;
declare
  v_user uuid := (select auth.uid());
  v_source_status text;
  v_old_confirmed integer;
  v_total integer;
  v_male integer;
  v_female integer;
  v_note text := nullif(btrim(coalesce(p_evidence_note,'')),'');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_LABOUR_VERIFICATION';
  end if;

  if p_confirmed_headcount is null or p_confirmed_headcount<0 then
    raise exception 'INVALID_CONFIRMED_HEADCOUNT';
  end if;

  if p_basis not in (
    'source_total','male_female','daily_report','monthly_report',
    'company_roster','contractor_only','manual_review'
  ) then
    raise exception 'INVALID_HEADCOUNT_BASIS';
  end if;

  select
    b.headcount_source_status,b.confirmed_headcount,
    e.total_manpower,e.male_count,e.female_count
  into v_source_status,v_old_confirmed,v_total,v_male,v_female
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_batch_id
  for update of b;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

  if p_basis='source_total' then
    if v_total is null then raise exception 'SOURCE_TOTAL_UNKNOWN'; end if;
    if p_confirmed_headcount<>v_total then raise exception 'CONFIRMED_HEADCOUNT_MUST_MATCH_SOURCE_TOTAL'; end if;
  elsif p_basis='male_female' then
    if v_male is null or v_female is null then raise exception 'MALE_FEMALE_UNKNOWN'; end if;
    if p_confirmed_headcount<>v_male+v_female then raise exception 'CONFIRMED_HEADCOUNT_MUST_MATCH_MALE_FEMALE'; end if;
  elsif p_basis='contractor_only' and p_confirmed_headcount<>0 then
    raise exception 'CONTRACTOR_ONLY_WORKER_PAYROLL_HEADCOUNT_MUST_BE_ZERO';
  end if;

  if (v_source_status<>'matched'
      or p_basis in ('daily_report','monthly_report','company_roster','contractor_only','manual_review'))
     and v_note is null then
    raise exception 'HEADCOUNT_EVIDENCE_NOTE_REQUIRED';
  end if;

  update public.labour_verification_batches
  set
    confirmed_headcount=p_confirmed_headcount,
    expected_headcount=p_confirmed_headcount,
    confirmed_headcount_basis=p_basis,
    confirmed_headcount_evidence=v_note,
    headcount_confirmed_by=v_user,
    headcount_confirmed_at=now(),
    headcount_confirmation_status='confirmed',
    verification_status=case
      when verification_status='verified' and v_old_confirmed is distinct from p_confirmed_headcount
        then 'needs_review'
      else verification_status
    end,
    updated_at=now()
  where id=p_batch_id;

  return p_confirmed_headcount;
end;
$function$;


CREATE OR REPLACE FUNCTION public.labour_verify_batch(p_batch_id uuid, p_note text, p_assignments jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$;
declare
  v_user uuid := (select auth.uid());
  v_expected integer;
  v_confirmed integer;
  v_headcount_confirmation_status text;
  v_work_date date;
  v_entry_id uuid;
  v_entry_work_date date;
  v_work_date_validation_status text;
  v_supervisor_worker_id text;
  v_source_fingerprint text;
  v_distinct_workers integer:=0;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_LABOUR_VERIFICATION';
  end if;

  if p_assignments is null or jsonb_typeof(p_assignments)<>'array' then
    raise exception 'ASSIGNMENTS_MUST_BE_ARRAY';
  end if;

  select
    b.expected_headcount,b.confirmed_headcount,b.headcount_confirmation_status,
    b.work_date,b.site_operations_entry_id,b.supervisor_worker_id,
    e.source_fingerprint,e.work_date,e.work_date_validation_status
  into
    v_expected,v_confirmed,v_headcount_confirmation_status,
    v_work_date,v_entry_id,v_supervisor_worker_id,
    v_source_fingerprint,v_entry_work_date,v_work_date_validation_status
  from public.labour_verification_batches b
  join public.site_operations_entries e on e.id=b.site_operations_entry_id
  where b.id=p_batch_id
  for update of b;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

  if v_work_date is distinct from v_entry_work_date then
    raise exception 'LABOUR_BATCH_WORK_DATE_MISMATCH';
  end if;

  if coalesce(v_work_date_validation_status,'valid')<>'valid'
     or v_entry_work_date>(current_timestamp at time zone 'Asia/Bangkok')::date then
    raise exception 'WORK_DATE_REVIEW_REQUIRED';
  end if;

  if v_headcount_confirmation_status<>'confirmed'
     or v_confirmed is null
     or v_expected is distinct from v_confirmed then
    raise exception 'HEADCOUNT_CONFIRMATION_REQUIRED';
  end if;

  select count(distinct x.worker_id)
    into v_distinct_workers
  from jsonb_to_recordset(p_assignments) as x(
    worker_id text,project_id uuid,working_team text,movement_status text,
    allocation_hours numeric,allocation_share numeric,notes text
  )
  where v_supervisor_worker_id is null or x.worker_id<>v_supervisor_worker_id;

  if v_distinct_workers<>v_confirmed then
    raise exception 'HEADCOUNT_MISMATCH_CONFIRMED_%_GOT_%',v_confirmed,v_distinct_workers;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as x(
      worker_id text,project_id uuid,working_team text,movement_status text,
      allocation_hours numeric,allocation_share numeric,notes text
    )
    left join public.labour_workers w on w.worker_id=x.worker_id
    where w.worker_id is null
  ) then
    raise exception 'UNKNOWN_WORKER_ID';
  end if;

  delete from public.labour_daily_assignments where batch_id=p_batch_id;

  insert into public.labour_daily_assignments(
    batch_id,worker_id,work_date,project_id,home_team,working_team,movement_status,
    allocation_hours,allocation_share,work_detail,notes,verified_by,verified_at
  )
  select
    p_batch_id,x.worker_id,v_work_date,x.project_id,w.default_team,
    coalesce(nullif(btrim(x.working_team),''),w.default_team),
    case
      when x.movement_status in ('same_team','borrowed','returned','other') then x.movement_status
      else case
        when coalesce(nullif(btrim(x.working_team),''),w.default_team) is distinct from w.default_team
          then 'borrowed'
        else 'same_team'
      end
    end,
    x.allocation_hours,x.allocation_share,e.work_detail,x.notes,v_user,now()
  from jsonb_to_recordset(p_assignments) as x(
    worker_id text,project_id uuid,working_team text,movement_status text,
    allocation_hours numeric,allocation_share numeric,notes text
  )
  join public.labour_workers w on w.worker_id=x.worker_id
  join public.site_operations_entries e on e.id=v_entry_id
  where v_supervisor_worker_id is null or x.worker_id<>v_supervisor_worker_id;

  update public.labour_verification_batches
  set
    verification_status='verified',
    verified_by=v_user,
    verified_at=now(),
    verified_source_fingerprint=v_source_fingerprint,
    note=nullif(btrim(coalesce(p_note,'')),''),
    updated_at=now()
  where id=p_batch_id;

  update public.payroll_verification_records
  set
    status=case when status in ('verified','external_verified') then 'needs_review' else status end,
    updated_at=now()
  where labour_batch_id=p_batch_id;

  return v_distinct_workers;
end;
$function$;


CREATE OR REPLACE FUNCTION public.labour_payroll_guard_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$;
declare
 b public.labour_verification_batches%rowtype;
 r public.payroll_verification_records%rowtype;
 w public.labour_workers%rowtype;
 v_id uuid;
 v_user uuid := auth.uid();
begin
 if tg_op='UPDATE' and new.id is distinct from old.id then raise exception 'IMMUTABLE_ID'; end if;
 if tg_table_name='labour_verification_batches' then
   if tg_op='UPDATE' and new.site_operations_entry_id is distinct from old.site_operations_entry_id then
     raise exception 'IMMUTABLE_LABOUR_SOURCE';
   end if;
   if tg_op<>'DELETE' and new.verification_status='verified'
     and (tg_op='INSERT' or old.verification_status is distinct from new.verification_status
       or old.verified_by is distinct from new.verified_by
       or old.verified_at is distinct from new.verified_at
       or old.verified_source_fingerprint is distinct from new.verified_source_fingerprint) then
     if v_user is null or not exists(select 1 from public.profiles where user_id=v_user and active and role in ('manager','admin','engineer','payroll')) then
       raise exception 'AUTH_REQUIRED_FOR_VERIFICATION';
     end if;
     new.verified_by:=v_user;
     new.verified_at:=now();
     -- Source fingerprint is asserted, never silently accept a stale revision.
   end if;
   if tg_op='UPDATE' and (new.verification_status is distinct from old.verification_status
     or new.verified_at is distinct from old.verified_at
     or new.verified_source_fingerprint is distinct from old.verified_source_fingerprint
     or new.supervisor_worker_id is distinct from old.supervisor_worker_id
     or new.work_date is distinct from old.work_date or new.expected_headcount is distinct from old.expected_headcount) then
     update public.payroll_verification_records set status='needs_review',updated_at=now()
       where labour_batch_id=old.id and status in ('timecard_checked','verified','external_verified');
   end if;
 elsif tg_table_name='labour_daily_assignments' then
   if tg_op='UPDATE' and (new.batch_id is distinct from old.batch_id or new.worker_id is distinct from old.worker_id) then
     raise exception 'IMMUTABLE_ASSIGNMENT_IDENTITY';
   end if;
   v_id:=case when tg_op='DELETE' then old.batch_id else new.batch_id end;
   select * into b from public.labour_verification_batches where id=v_id for update;
   update public.payroll_verification_records set status='needs_review',updated_at=now()
     where labour_batch_id=v_id and status in ('timecard_checked','verified','external_verified');
   if tg_op<>'DELETE' then
     if v_user is null or not exists(select 1 from public.profiles where user_id=v_user and active and role in ('manager','admin','engineer','payroll')) then
       raise exception 'AUTH_REQUIRED_FOR_VERIFICATION';
     end if;
     if new.work_date is distinct from b.work_date or new.worker_id=b.supervisor_worker_id then
       raise exception 'INVALID_LABOUR_ASSIGNMENT';
     end if;
     select * into w from public.labour_workers where worker_id=new.worker_id;
     if not found then raise exception 'UNKNOWN_WORKER_ID'; end if;
     if new.home_team is distinct from w.default_team then raise exception 'HOME_TEAM_MUST_MATCH_WORKER'; end if;
     new.verified_by:=v_user; new.verified_at:=now();
   end if;
 elsif tg_table_name='payroll_verification_records' then
   if tg_op='UPDATE' and new.labour_batch_id is distinct from old.labour_batch_id then raise exception 'IMMUTABLE_PAYROLL_BATCH'; end if;
   v_id:=case when tg_op='DELETE' then old.labour_batch_id else new.labour_batch_id end;
   perform 1 from public.labour_verification_batches where id=v_id for update;
   if tg_op<>'DELETE' then
     if new.status in ('timecard_checked','verified','external_verified') then
       if v_user is null or not exists(select 1 from public.profiles where user_id=v_user and active and role in ('manager','admin','engineer','payroll')) then
         raise exception 'AUTH_REQUIRED_FOR_VERIFICATION';
       end if;
       if new.status in ('timecard_checked','verified') then
         new.timecard_checked_by:=v_user; new.timecard_checked_at:=now();
       end if;
       if new.status in ('verified','external_verified') then new.verified_by:=v_user; new.verified_at:=now(); end if;
     else
       new.verified_by:=null; new.verified_at:=null;
     end if;
   end if;
 else -- payroll items
   if tg_op='UPDATE' and (new.record_id is distinct from old.record_id or new.worker_id is distinct from old.worker_id) then
     raise exception 'IMMUTABLE_PAYROLL_ITEM_IDENTITY';
   end if;
   v_id:=case when tg_op='DELETE' then old.record_id else new.record_id end;
   select * into r from public.payroll_verification_records where id=v_id;
   select * into b from public.labour_verification_batches where id=r.labour_batch_id for update;
   if r.status in ('timecard_checked','verified') and r.timecard_checked_at is distinct from now() then
     raise exception 'PAYROLL_REVERIFICATION_REQUIRED';
   end if;
   if tg_op<>'DELETE' and r.verification_method='web' then
     -- FK SET NULL during re-verification preserves historical items, but never a checked state.
     if not (tg_op='UPDATE' and new.labour_assignment_id is null and old.labour_assignment_id is not null
       and r.status in ('draft','needs_review')
       and not exists(select 1 from public.labour_daily_assignments where id=old.labour_assignment_id)) and not exists(select 1 from public.labour_daily_assignments a
         where a.id=new.labour_assignment_id and a.batch_id=b.id and a.worker_id=new.worker_id
           and (b.supervisor_worker_id is null or a.worker_id<>b.supervisor_worker_id)) then
       raise exception 'PAYROLL_ITEM_NOT_IN_VERIFIED_TEAM';
     end if;
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.payroll_save_verification(p_labour_batch_id uuid, p_method text, p_status text, p_note text, p_external_reference text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$;
declare
  v_user uuid := (select auth.uid());
  v_batch public.labour_verification_batches%rowtype;
  v_record_id uuid;
  v_expected_items integer := 0;
  v_received_items integer := 0;
  v_item jsonb;
  v_key text;
  v_value numeric;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')
  ) then
    raise exception 'NOT_AUTHORIZED_FOR_PAYROLL_VERIFICATION';
  end if;

  if p_method is null or p_method not in ('web','legacy_excel') then raise exception 'INVALID_VERIFICATION_METHOD'; end if;
  if p_status is null or p_status not in ('draft','timecard_checked','verified','external_verified','needs_review') then raise exception 'INVALID_PAYROLL_STATUS'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'ITEMS_MUST_BE_ARRAY'; end if;

  -- No approved effective-dated rate/formula/rounding source exists yet.
  -- Neither manual labels nor an Excel reference constitute approval.
  if p_status in ('verified','external_verified') or p_method='legacy_excel' then
    raise exception 'PAYROLL_RULES_NOT_APPROVED';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'INVALID_PAYROLL_ITEM'; end if;
    if (v_item->>'attendance_status') is null or
       (v_item->>'attendance_status') not in ('present','absent','leave','half_day','other') then
      raise exception 'INVALID_ATTENDANCE_STATUS';
    end if;
    foreach v_key in array array['work_units','ot_hours','adjustment'] loop
      if v_key='adjustment' and not (v_item ? v_key) then continue; end if;
      if jsonb_typeof(v_item->v_key) is distinct from 'number' then
        raise exception 'INVALID_PAYROLL_NUMBER_%',v_key;
      end if;
      v_value := (v_item->>v_key)::numeric;
      if v_value::text in ('NaN','Infinity','-Infinity') or v_value<>trunc(v_value,2) then
        raise exception 'INVALID_PAYROLL_PRECISION_%',v_key;
      end if;
      if (v_key='work_units' and (v_value<0 or v_value>1)) or
         (v_key='ot_hours' and (v_value<0 or v_value>24)) or
         (v_key='adjustment' and abs(v_value)>9999999999.99) then
        raise exception 'INVALID_PAYROLL_RANGE_%',v_key;
      end if;
    end loop;
    foreach v_key in array array['regular_rate','ot_rate','regular_pay','ot_pay','total_pay'] loop
      if v_item ? v_key and v_item->v_key <> 'null'::jsonb then
        raise exception 'CLIENT_PAYROLL_MONEY_NOT_ALLOWED';
      end if;
    end loop;
    if v_item ? 'calculation_status' and
       v_item->>'calculation_status' is distinct from 'rate_pending' then
      raise exception 'CLIENT_CALCULATION_STATUS_NOT_ALLOWED';
    end if;
  end loop;

  select * into v_batch
  from public.labour_verification_batches
  where id=p_labour_batch_id
  for update;

  if not found then raise exception 'LABOUR_BATCH_NOT_FOUND'; end if;

  if p_method='legacy_excel' then
    if p_status<>'external_verified' then raise exception 'LEGACY_EXCEL_REQUIRES_EXTERNAL_VERIFIED'; end if;
    if nullif(btrim(coalesce(p_external_reference,'')),'') is null then raise exception 'EXTERNAL_REFERENCE_REQUIRED'; end if;
  else
    if p_status='external_verified' then raise exception 'WEB_METHOD_CANNOT_USE_EXTERNAL_VERIFIED'; end if;
    if v_batch.verification_status<>'verified' and p_status in ('timecard_checked','verified') then
      raise exception 'LABOUR_TEAM_MUST_BE_VERIFIED_FIRST';
    end if;
  end if;

  select count(*) into v_expected_items
  from public.labour_daily_assignments a
  where a.batch_id=p_labour_batch_id
    and (v_batch.supervisor_worker_id is null or a.worker_id<>v_batch.supervisor_worker_id);

  select count(distinct x.worker_id) into v_received_items
  from jsonb_to_recordset(p_items) as x(
    labour_assignment_id uuid, worker_id text, attendance_status text,
    clock_in time, clock_out time, work_units numeric, ot_hours numeric,
    timecard_match boolean, regular_rate numeric, ot_rate numeric,
    regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
    calculation_status text, note text
  );

  if p_method='web' and p_status in ('timecard_checked','verified') and v_received_items<>v_expected_items then
    raise exception 'PAYROLL_ITEM_COUNT_MISMATCH_EXPECTED_%_GOT_%',v_expected_items,v_received_items;
  end if;

  if p_method='web' and exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    )
    left join public.labour_daily_assignments a
      on a.id=x.labour_assignment_id
     and a.batch_id=p_labour_batch_id
     and a.worker_id=x.worker_id
    where a.id is null
       or (v_batch.supervisor_worker_id is not null and x.worker_id=v_batch.supervisor_worker_id)
  ) then
    raise exception 'PAYROLL_ITEM_NOT_IN_VERIFIED_TEAM';
  end if;

  if p_method='web' and p_status in ('timecard_checked','verified') and exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    )
    where coalesce(x.timecard_match,false)=false
  ) then
    raise exception 'ALL_TIMECARDS_MUST_BE_MATCHED';
  end if;

  if p_method='web' and p_status='verified' and exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    )
    where coalesce(x.calculation_status,'rate_pending') not in ('calculated','manual','excluded')
       or (coalesce(x.calculation_status,'rate_pending')<>'excluded' and x.total_pay is null)
  ) then
    raise exception 'PAYROLL_TOTALS_REQUIRED_FOR_VERIFIED';
  end if;

  insert into public.payroll_verification_records(
    labour_batch_id,verification_method,status,source_labour_verified_at,
    external_reference,note,timecard_checked_by,timecard_checked_at,
    verified_by,verified_at,updated_at
  )
  values(
    p_labour_batch_id,p_method,p_status,v_batch.verified_at,
    nullif(btrim(coalesce(p_external_reference,'')),''),
    nullif(btrim(coalesce(p_note,'')),''),
    case when p_status in ('timecard_checked','verified') then v_user else null end,
    case when p_status in ('timecard_checked','verified') then now() else null end,
    case when p_status in ('verified','external_verified') then v_user else null end,
    case when p_status in ('verified','external_verified') then now() else null end,
    now()
  )
  on conflict(labour_batch_id) do update set
    verification_method=excluded.verification_method,
    status=excluded.status,
    source_labour_verified_at=excluded.source_labour_verified_at,
    external_reference=excluded.external_reference,
    note=excluded.note,
    timecard_checked_by=case when excluded.timecard_checked_by is not null then excluded.timecard_checked_by else public.payroll_verification_records.timecard_checked_by end,
    timecard_checked_at=case when excluded.timecard_checked_at is not null then excluded.timecard_checked_at else public.payroll_verification_records.timecard_checked_at end,
    verified_by=excluded.verified_by,
    verified_at=excluded.verified_at,
    updated_at=now()
  returning id into v_record_id;

  if p_method='web' then
    delete from public.payroll_verification_items where record_id=v_record_id;

    insert into public.payroll_verification_items(
      record_id,labour_assignment_id,worker_id,attendance_status,clock_in,clock_out,
      work_units,ot_hours,timecard_match,regular_rate,ot_rate,regular_pay,ot_pay,
      adjustment,total_pay,calculation_status,note,updated_at
    )
    select
      v_record_id,x.labour_assignment_id,x.worker_id,
      case when x.attendance_status in ('present','absent','leave','half_day','other') then x.attendance_status else 'present' end,
      x.clock_in,x.clock_out,
      x.work_units,
      x.ot_hours,
      coalesce(x.timecard_match,false),
      null,null,null,null,coalesce(x.adjustment,0),null,
      'rate_pending',
      nullif(btrim(coalesce(x.note,'')),''),
      now()
    from jsonb_to_recordset(p_items) as x(
      labour_assignment_id uuid, worker_id text, attendance_status text,
      clock_in time, clock_out time, work_units numeric, ot_hours numeric,
      timecard_match boolean, regular_rate numeric, ot_rate numeric,
      regular_pay numeric, ot_pay numeric, adjustment numeric, total_pay numeric,
      calculation_status text, note text
    );
  end if;

  return v_record_id;
end;
$function$;


revoke all on function public.labour_confirm_supervisor_mapping(uuid,text) from public,anon;
grant execute on function public.labour_confirm_supervisor_mapping(uuid,text) to authenticated;
revoke all on function public.labour_confirm_headcount(uuid,integer,text,text) from public,anon;
grant execute on function public.labour_confirm_headcount(uuid,integer,text,text) to authenticated;
revoke all on function public.labour_verify_batch(uuid,text,jsonb) from public,anon;
grant execute on function public.labour_verify_batch(uuid,text,jsonb) to authenticated;
revoke all on function public.payroll_save_verification(uuid,text,text,text,text,jsonb) from public,anon;
grant execute on function public.payroll_save_verification(uuid,text,text,text,text,jsonb) to authenticated;

-- Preserve Prompt 2 hardening after CREATE OR REPLACE.
alter function public.payroll_save_verification(uuid,text,text,text,text,jsonb) security definer;
alter function public.payroll_save_verification(uuid,text,text,text,text,jsonb) set search_path='';

revoke select on public.v_schedule_snapshot_days from anon;
grant select on public.v_schedule_snapshot_days to authenticated;
