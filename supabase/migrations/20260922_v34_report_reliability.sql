-- V3.4 Report Reliability
-- Auto-save Draft + idempotent submit + Edit/Revision + Photo Retry

alter table public.daily_reports
  add column if not exists client_submission_key text,
  add column if not exists revision_no integer not null default 1,
  add column if not exists last_edited_by uuid references auth.users(id) on delete set null,
  add column if not exists last_edited_at timestamptz;

alter table public.daily_reports drop constraint if exists daily_reports_revision_no_check;
alter table public.daily_reports add constraint daily_reports_revision_no_check check (revision_no >= 1);
create unique index if not exists daily_reports_client_submission_key_uidx on public.daily_reports(client_submission_key) where client_submission_key is not null;

alter table public.report_photos
  add column if not exists client_photo_key text,
  add column if not exists archive_retry_count integer not null default 0,
  add column if not exists archive_last_attempt_at timestamptz,
  add column if not exists archive_last_attempt_by uuid references auth.users(id) on delete set null;

alter table public.report_photos drop constraint if exists report_photos_archive_retry_count_check;
alter table public.report_photos add constraint report_photos_archive_retry_count_check check (archive_retry_count >= 0);
create unique index if not exists report_photos_client_photo_key_uidx on public.report_photos(client_photo_key) where client_photo_key is not null;

create table if not exists public.report_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_key text not null,
  report_date date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_drafts_user_key_unique unique(user_id,draft_key)
);
create index if not exists report_drafts_user_updated_idx on public.report_drafts(user_id,updated_at desc);
alter table public.report_drafts enable row level security;
drop policy if exists report_drafts_select_own on public.report_drafts;
create policy report_drafts_select_own on public.report_drafts for select to authenticated using ((select private.is_active_user()) and user_id=(select auth.uid()));
drop policy if exists report_drafts_insert_own on public.report_drafts;
create policy report_drafts_insert_own on public.report_drafts for insert to authenticated with check ((select private.is_active_user()) and user_id=(select auth.uid()));
drop policy if exists report_drafts_update_own on public.report_drafts;
create policy report_drafts_update_own on public.report_drafts for update to authenticated using ((select private.is_active_user()) and user_id=(select auth.uid())) with check ((select private.is_active_user()) and user_id=(select auth.uid()));
drop policy if exists report_drafts_delete_own on public.report_drafts;
create policy report_drafts_delete_own on public.report_drafts for delete to authenticated using ((select private.is_active_user()) and user_id=(select auth.uid()));
grant select,insert,update,delete on public.report_drafts to authenticated;
create or replace trigger trg_report_drafts_updated_at before update on public.report_drafts for each row execute function private.set_updated_at();

create table if not exists public.daily_report_revisions (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  revision_no integer not null,
  snapshot jsonb not null,
  edited_by uuid not null references auth.users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  constraint daily_report_revisions_unique unique(daily_report_id,revision_no),
  constraint daily_report_revisions_revision_check check (revision_no >= 1)
);
create index if not exists daily_report_revisions_report_idx on public.daily_report_revisions(daily_report_id,revision_no desc);
alter table public.daily_report_revisions enable row level security;
drop policy if exists daily_report_revisions_select_active on public.daily_report_revisions;
create policy daily_report_revisions_select_active on public.daily_report_revisions for select to authenticated using ((select private.is_active_user()));
grant select on public.daily_report_revisions to authenticated;
revoke insert,update,delete on public.daily_report_revisions from authenticated,anon;

create or replace function public.daily_report_submit_v34(
  p_submission_key text,p_project_id uuid,p_report_date date,p_reporter_id uuid,p_weather text,
  p_overall_progress numeric,p_total_manpower integer,p_summary text,p_items jsonb
) returns uuid
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_report_id uuid; v_existing public.daily_reports%rowtype;
begin
  if auth.uid() is null or auth.uid()<>p_reporter_id then raise exception 'unauthorized'; end if;
  if not private.is_active_user() then raise exception 'inactive_user'; end if;
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
revoke all on function public.daily_report_submit_v34(text,uuid,date,uuid,text,numeric,integer,text,jsonb) from public,anon;
grant execute on function public.daily_report_submit_v34(text,uuid,date,uuid,text,numeric,integer,text,jsonb) to authenticated;

create or replace function public.daily_report_apply_revision_v34(
  p_report_id uuid,p_reason text,p_report_date date,p_weather text,p_overall_progress numeric,
  p_total_manpower integer,p_summary text,p_items jsonb
) returns integer
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
  v_report public.daily_reports%rowtype; v_items jsonb; v_photos jsonb; v_snapshot jsonb; v_new_revision integer;
begin
  if auth.uid() is null or not private.is_active_user() then raise exception 'unauthorized'; end if;
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
revoke all on function public.daily_report_apply_revision_v34(uuid,text,date,text,numeric,integer,text,jsonb) from public,anon;
grant execute on function public.daily_report_apply_revision_v34(uuid,text,date,text,numeric,integer,text,jsonb) to authenticated;
