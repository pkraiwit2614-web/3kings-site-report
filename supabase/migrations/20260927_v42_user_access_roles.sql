alter table public.profiles add column if not exists username text;

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username))
  where username is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.profiles'::regclass and conname='profiles_username_format_check'
  ) then
    alter table public.profiles add constraint profiles_username_format_check
      check (username is null or username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$');
  end if;
end $$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_admin_provisioned boolean := coalesce((new.raw_app_meta_data ->> 'provisioned_by_admin')::boolean,false);
  v_requested_role text := lower(coalesce(new.raw_app_meta_data ->> 'app_role',''));
  v_role text;
  v_username text;
begin
  v_role := case
    when v_admin_provisioned and v_requested_role in ('manager','engineer','foreman','viewer') then v_requested_role
    when v_admin_provisioned then 'viewer'
    else 'viewer'
  end;
  v_username := case when v_admin_provisioned then nullif(upper(btrim(new.raw_app_meta_data ->> 'username')),'') else null end;

  insert into public.profiles(user_id,email,full_name,username,role,active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', v_username, split_part(coalesce(new.email,''),'@',1)),
    v_username,
    v_role,
    v_admin_provisioned
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function private.can_write_reports()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role in ('manager','engineer','foreman')
  );
$$;

revoke all on function private.can_write_reports() from public,anon,authenticated;
grant execute on function private.can_write_reports() to authenticated;

drop policy if exists daily_insert_self on public.daily_reports;
create policy daily_insert_self on public.daily_reports for insert to authenticated
with check ((select private.can_write_reports()) and reporter_id=(select auth.uid()));

drop policy if exists daily_update_owner_or_manager on public.daily_reports;
create policy daily_update_owner_or_manager on public.daily_reports for update to authenticated
using ((select private.can_write_reports()) and (reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','engineer']::text[]))))
with check ((select private.can_write_reports()) and (reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','engineer']::text[]))));

drop policy if exists daily_delete_owner_or_manager on public.daily_reports;
create policy daily_delete_owner_or_manager on public.daily_reports for delete to authenticated
using ((select private.can_write_reports()) and (reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','engineer']::text[]))));

drop policy if exists report_items_insert_owner on public.report_items;
create policy report_items_insert_owner on public.report_items for insert to authenticated
with check ((select private.can_write_reports()) and exists (
  select 1 from public.daily_reports d where d.id=report_items.daily_report_id
    and (d.reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','engineer']::text[])))
));

drop policy if exists report_items_update_owner on public.report_items;
create policy report_items_update_owner on public.report_items for update to authenticated
using ((select private.can_write_reports()) and exists (
  select 1 from public.daily_reports d where d.id=report_items.daily_report_id
    and (d.reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','engineer']::text[])))
))
with check ((select private.can_write_reports()) and exists (
  select 1 from public.daily_reports d where d.id=report_items.daily_report_id
    and (d.reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','engineer']::text[])))
));

drop policy if exists report_items_delete_owner on public.report_items;
create policy report_items_delete_owner on public.report_items for delete to authenticated
using ((select private.can_write_reports()) and exists (
  select 1 from public.daily_reports d where d.id=report_items.daily_report_id
    and (d.reporter_id=(select auth.uid()) or (select private.has_app_role(array['manager','engineer']::text[])))
));

drop policy if exists report_photos_insert_self on public.report_photos;
create policy report_photos_insert_self on public.report_photos for insert to authenticated
with check ((select private.can_write_reports()) and uploaded_by=(select auth.uid()));

drop policy if exists report_photos_update_self on public.report_photos;
create policy report_photos_update_self on public.report_photos for update to authenticated
using ((select private.can_write_reports()) and (uploaded_by=(select auth.uid()) or (select private.has_app_role(array['manager','engineer']::text[]))))
with check ((select private.can_write_reports()) and (uploaded_by=(select auth.uid()) or (select private.has_app_role(array['manager','engineer']::text[]))));

drop policy if exists report_photos_archive_update_own on public.report_photos;
create policy report_photos_archive_update_own on public.report_photos for update to authenticated
using ((select private.can_write_reports()) and uploaded_by=(select auth.uid()))
with check ((select private.can_write_reports()) and uploaded_by=(select auth.uid()));

drop policy if exists report_photos_delete_self on public.report_photos;
create policy report_photos_delete_self on public.report_photos for delete to authenticated
using ((select private.can_write_reports()) and (uploaded_by=(select auth.uid()) or (select private.has_app_role(array['manager','engineer']::text[]))));

drop policy if exists report_drafts_insert_own on public.report_drafts;
create policy report_drafts_insert_own on public.report_drafts for insert to authenticated
with check ((select private.can_write_reports()) and user_id=(select auth.uid()));

drop policy if exists report_drafts_update_own on public.report_drafts;
create policy report_drafts_update_own on public.report_drafts for update to authenticated
using ((select private.can_write_reports()) and user_id=(select auth.uid()))
with check ((select private.can_write_reports()) and user_id=(select auth.uid()));

drop policy if exists report_drafts_delete_own on public.report_drafts;
create policy report_drafts_delete_own on public.report_drafts for delete to authenticated
using ((select private.can_write_reports()) and user_id=(select auth.uid()));

create or replace function public.daily_report_submit_v34(
  p_submission_key text,p_project_id uuid,p_report_date date,p_reporter_id uuid,p_weather text,
  p_overall_progress numeric,p_total_manpower integer,p_summary text,p_items jsonb
) returns uuid
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_report_id uuid; v_existing public.daily_reports%rowtype;
begin
  if auth.uid() is null or auth.uid()<>p_reporter_id then raise exception 'unauthorized'; end if;
  if not private.is_active_user() then raise exception 'inactive_user'; end if;
  if not private.can_write_reports() then raise exception 'report_write_forbidden'; end if;
  if coalesce(btrim(p_submission_key),'')='' or length(p_submission_key)>240 then raise exception 'invalid_submission_key'; end if;
  if p_project_id is null or p_report_date is null then raise exception 'project_and_date_required'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'items_must_be_array'; end if;

  select * into v_existing from public.daily_reports where client_submission_key=p_submission_key;
  if found then
    if v_existing.reporter_id<>auth.uid() or v_existing.project_id<>p_project_id then raise exception 'submission_key_conflict'; end if;
    return v_existing.id;
  end if;

  insert into public.daily_reports(project_id,report_date,reporter_id,weather,overall_progress,total_manpower,summary,status,client_submission_key,revision_no)
  values(p_project_id,p_report_date,p_reporter_id,nullif(btrim(coalesce(p_weather,'')),''),greatest(0::numeric,least(1::numeric,coalesce(p_overall_progress,0))),greatest(0,coalesce(p_total_manpower,0)),nullif(btrim(coalesce(p_summary,'')),''),'submitted',p_submission_key,1)
  on conflict (client_submission_key) where client_submission_key is not null do nothing returning id into v_report_id;

  if v_report_id is null then
    select * into v_existing from public.daily_reports where client_submission_key=p_submission_key;
    if not found or v_existing.reporter_id<>auth.uid() or v_existing.project_id<>p_project_id then raise exception 'submission_key_conflict'; end if;
    return v_existing.id;
  end if;

  insert into public.report_items(daily_report_id,schedule_task_id,work_category,work_item,actual_progress,manpower,contractor,status,blocker,next_action,target_date,remarks)
  select v_report_id,nullif(x.schedule_task_id,'')::uuid,nullif(btrim(coalesce(x.work_category,'')),''),btrim(x.work_item),greatest(0::numeric,least(1::numeric,coalesce(x.actual_progress,0))),greatest(0,coalesce(x.manpower,0)),nullif(btrim(coalesce(x.contractor,'')),''),coalesce(nullif(x.status,''),'in_progress'),nullif(btrim(coalesce(x.blocker,'')),''),nullif(btrim(coalesce(x.next_action,'')),''),nullif(x.target_date,'')::date,nullif(btrim(coalesce(x.remarks,'')),'')
  from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(schedule_task_id text,work_category text,work_item text,actual_progress numeric,manpower integer,contractor text,status text,blocker text,next_action text,target_date text,remarks text)
  where btrim(coalesce(x.work_item,''))<>'';
  return v_report_id;
end; $$;

create or replace function public.daily_report_apply_revision_v34(
  p_report_id uuid,p_reason text,p_report_date date,p_weather text,p_overall_progress numeric,
  p_total_manpower integer,p_summary text,p_items jsonb
) returns integer
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
  v_report public.daily_reports%rowtype; v_items jsonb; v_photos jsonb; v_snapshot jsonb; v_new_revision integer;
begin
  if auth.uid() is null or not private.is_active_user() then raise exception 'unauthorized'; end if;
  if not private.can_write_reports() then raise exception 'report_write_forbidden'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'items_must_be_array'; end if;
  select * into v_report from public.daily_reports where id=p_report_id for update;
  if not found then raise exception 'report_not_found'; end if;
  if v_report.reporter_id<>auth.uid() and not private.has_app_role(array['manager','engineer']::text[]) then raise exception 'forbidden'; end if;

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
end; $$;

revoke all on function public.daily_report_submit_v34(text,uuid,date,uuid,text,numeric,integer,text,jsonb) from public,anon;
grant execute on function public.daily_report_submit_v34(text,uuid,date,uuid,text,numeric,integer,text,jsonb) to authenticated;
revoke all on function public.daily_report_apply_revision_v34(uuid,text,date,text,numeric,integer,text,jsonb) from public,anon;
grant execute on function public.daily_report_apply_revision_v34(uuid,text,date,text,numeric,integer,text,jsonb) to authenticated;
