create extension if not exists pg_trgm with schema extensions;

create table if not exists public.drive_photo_index (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  schedule_task_id uuid references public.schedule_tasks(id) on delete set null,
  drive_file_id text not null unique,
  drive_folder_id text,
  drive_folder_name text,
  file_name text not null,
  mime_type text,
  drive_url text not null,
  thumbnail_url text,
  photo_date date not null,
  phase text not null default 'other' check (phase in ('before','during','after','other')),
  match_method text not null default 'unmatched' check (match_method in ('explicit','filename','manual','unmatched')),
  match_score numeric,
  source_created_at timestamptz,
  source_modified_at timestamptz,
  is_active boolean not null default true,
  indexed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drive_photo_index_project_date_idx on public.drive_photo_index(project_id, photo_date desc);
create index if not exists drive_photo_index_task_date_idx on public.drive_photo_index(schedule_task_id, photo_date desc) where schedule_task_id is not null;
create index if not exists drive_photo_index_active_idx on public.drive_photo_index(project_id, is_active, photo_date desc);

alter table public.drive_photo_index enable row level security;

drop policy if exists drive_photo_index_select_authenticated on public.drive_photo_index;
create policy drive_photo_index_select_authenticated on public.drive_photo_index for select to authenticated using (true);

drop policy if exists drive_photo_index_update_manager_engineer on public.drive_photo_index;
create policy drive_photo_index_update_manager_engineer
on public.drive_photo_index for update to authenticated
using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.active = true and p.role in ('manager','engineer')))
with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.active = true and p.role in ('manager','engineer')));

alter table public.drive_sync_runs drop constraint if exists drive_sync_runs_sync_type_check;
alter table public.drive_sync_runs add constraint drive_sync_runs_sync_type_check
check (sync_type = any (array['schedule'::text,'materials'::text,'photos'::text]));

create or replace function public.drive_photo_index_upsert(p_sync_key text,p_project_code text,p_source_folder text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_project_id uuid; v_count integer := 0; v_matched integer := 0; v_unmatched integer := 0;
  v_match_id uuid; v_score numeric; v_name text; v_norm_name text; v_photo_date date;
  v_phase text; v_method text; r jsonb;
begin
  if not private.drive_sync_key_valid(p_sync_key) then return jsonb_build_object('ok',false,'error','invalid_sync_key'); end if;
  select p.id into v_project_id from public.projects p where p.code = p_project_code and p.active = true;
  if v_project_id is null then return jsonb_build_object('ok',false,'error','project_not_found','project',p_project_code); end if;
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_rows,'[]'::jsonb)) = 0 then
    return jsonb_build_object('ok',false,'error','empty_photo_rows','project',p_project_code);
  end if;

  begin
    for r in select value from jsonb_array_elements(p_rows) loop
      if nullif(r->>'drive_file_id','') is null then raise exception 'drive_file_id_missing'; end if;
      if nullif(r->>'photo_date','') is null then raise exception 'photo_date_missing'; end if;
      v_name := coalesce(nullif(r->>'file_name',''),'Unnamed photo');
      v_photo_date := (r->>'photo_date')::date;
      v_norm_name := lower(regexp_replace(regexp_replace(v_name, '\.[^.]+$', ''), '[._()\-]+', ' ', 'g'));
      v_match_id := null; v_score := null; v_method := 'unmatched';

      if nullif(r->>'schedule_task_id','') is not null then
        select s.id into v_match_id from public.schedule_tasks s
        where s.id=(r->>'schedule_task_id')::uuid and s.project_id=v_project_id and s.is_active=true;
        if v_match_id is not null then v_score:=1; v_method:='explicit'; end if;
      elsif v_norm_name !~* '^(img|dsc|pxl|photo|line)[ _-]?[0-9]+' then
        select q.id,q.score into v_match_id,v_score from (
          select s.id,greatest(
            extensions.similarity(v_norm_name,lower(regexp_replace(s.task_name,'[._()\-]+',' ','g'))),
            extensions.similarity(v_norm_name,lower(regexp_replace(concat_ws(' ',s.task_name,s.area,s.category),'[._()\-]+',' ','g'))),
            extensions.word_similarity(v_norm_name,lower(regexp_replace(concat_ws(' ',s.task_name,s.area,s.category),'[._()\-]+',' ','g')))
          ) score
          from public.schedule_tasks s
          where s.project_id=v_project_id and s.is_active=true and s.source_task_no<>'1'
            and (s.planned_start is null or s.planned_start <= v_photo_date + 45)
            and (s.planned_end is null or s.planned_end >= v_photo_date - 45)
        ) q order by q.score desc limit 1;
        if coalesce(v_score,0) >= 0.30 then v_method:='filename'; else v_match_id:=null; v_score:=null; end if;
      end if;

      v_phase := case
        when coalesce(nullif(r->>'phase',''),'') in ('before','during','after','other') then r->>'phase'
        when v_norm_name ~* '(^| )(before|ก่อน)( |$)' then 'before'
        when v_norm_name ~* '(^| )(after|done|complete|completed|เสร็จ|หลังทำ)( |$)' then 'after'
        when v_norm_name ~* '(^| )(during|ระหว่าง)( |$)' then 'during'
        else 'other' end;

      insert into public.drive_photo_index(project_id,schedule_task_id,drive_file_id,drive_folder_id,drive_folder_name,file_name,mime_type,drive_url,thumbnail_url,photo_date,phase,match_method,match_score,source_created_at,source_modified_at,is_active,indexed_at,updated_at)
      values(v_project_id,v_match_id,r->>'drive_file_id',nullif(r->>'drive_folder_id',''),nullif(r->>'drive_folder_name',''),v_name,nullif(r->>'mime_type',''),coalesce(nullif(r->>'drive_url',''),'https://drive.google.com/file/d/'||(r->>'drive_file_id')||'/view'),coalesce(nullif(r->>'thumbnail_url',''),'https://drive.google.com/thumbnail?id='||(r->>'drive_file_id')||'&sz=w1600'),v_photo_date,v_phase,v_method,v_score,nullif(r->>'created_time','')::timestamptz,nullif(r->>'modified_time','')::timestamptz,true,now(),now())
      on conflict (drive_file_id) do update set
        project_id=excluded.project_id,
        schedule_task_id=case when public.drive_photo_index.match_method='manual' then public.drive_photo_index.schedule_task_id else excluded.schedule_task_id end,
        drive_folder_id=excluded.drive_folder_id,drive_folder_name=excluded.drive_folder_name,file_name=excluded.file_name,mime_type=excluded.mime_type,drive_url=excluded.drive_url,thumbnail_url=excluded.thumbnail_url,photo_date=excluded.photo_date,
        phase=case when public.drive_photo_index.match_method='manual' then public.drive_photo_index.phase else excluded.phase end,
        match_method=case when public.drive_photo_index.match_method='manual' then 'manual' else excluded.match_method end,
        match_score=case when public.drive_photo_index.match_method='manual' then public.drive_photo_index.match_score else excluded.match_score end,
        source_created_at=excluded.source_created_at,source_modified_at=excluded.source_modified_at,is_active=true,indexed_at=now(),updated_at=now();

      v_count:=v_count+1;
      if v_match_id is null then v_unmatched:=v_unmatched+1; else v_matched:=v_matched+1; end if;
    end loop;

    insert into public.drive_sync_runs(sync_type,project_code,source_file,source_sheet,rows_read,rows_written,status,message)
    values('photos',p_project_code,p_source_folder,null,v_count,v_count,'success',format('Photo index sync: %s matched / %s unmatched',v_matched,v_unmatched));
    return jsonb_build_object('ok',true,'version','3.5','project',p_project_code,'rows',v_count,'matched',v_matched,'unmatched',v_unmatched,'source_folder',p_source_folder);
  exception when others then
    insert into public.drive_sync_runs(sync_type,project_code,source_file,source_sheet,rows_read,rows_written,status,message)
    values('photos',p_project_code,p_source_folder,null,v_count,0,'error',sqlerrm);
    return jsonb_build_object('ok',false,'version','3.5','project',p_project_code,'error',sqlerrm);
  end;
end;
$$;

revoke all on function public.drive_photo_index_upsert(text,text,text,jsonb) from public;
grant execute on function public.drive_photo_index_upsert(text,text,text,jsonb) to anon, authenticated;
