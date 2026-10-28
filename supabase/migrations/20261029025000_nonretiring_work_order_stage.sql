-- SAFE STAGING ONLY. Does not insert/update/delete public.defect_work_order_snapshot.
-- Owner authorization applies to 82 source-only Work IDs, not their automatic dispatch.
create table if not exists public.defect_work_order_import_staging (
 work_id text primary key check (work_id ~ '^DF-[A-Za-z0-9()_-]+$'),
 room_group text not null,
 building text not null check (building in ('A','B')),
 contractor text not null,
 defect_item text not null,
 source_work_status text,
 stage_decision text not null check (stage_decision in
 ('STAGE_REVERIFY_NO_DB_WRITE','STAGE_HISTORY_ONLY','HOLD_MISSING_EVIDENCE','DENY_DISPATCH')),
 source_master_row integer not null check(source_master_row>0),
 source_evidence_url text,
 source_file_id text not null check(source_file_id='18P3OFYtOLsslCtDujlSQVf9IQSuplKcx'),
 source_modified_at timestamptz not null,
 staged_at timestamptz not null default now(),
 source_payload jsonb not null default '{}'::jsonb
);
alter table public.defect_work_order_import_staging enable row level security;
revoke all on public.defect_work_order_import_staging from public,anon,authenticated;
grant all on public.defect_work_order_import_staging to service_role;

-- Scope-specific, idempotent and non-retiring import for review ONLY.
-- Caller must be service_role and possess existing GAS sync-key; the routine
-- cannot activate anything in Work Order and never changes the existing 74 rows.
create or replace function public.defect_work_order_nonretiring_stage_import(
 p_sync_key text,p_source_file_id text,p_source_modified_at timestamptz,
 p_rows jsonb,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_total integer;v_unique integer;v_invalid integer;v_unknown integer;
        v_new integer;v_changed integer:=0;v_before integer;v_active integer;
        v_retired integer;v_source_last timestamptz;
begin
 if not private.drive_sync_key_valid(p_sync_key)
 then return jsonb_build_object('ok',false,'error','invalid_sync_key');end if;
 if p_source_file_id is distinct from '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx'
 then return jsonb_build_object('ok',false,'error','unapproved_source');end if;
 if p_source_modified_at is null or p_source_modified_at>now()+interval '5 minutes'
 then return jsonb_build_object('ok',false,'error','invalid_source_time');end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<>82
 then return jsonb_build_object('ok',false,'error','expected_82_master_only_rows');end if;
 perform pg_advisory_xact_lock(hashtext('3kings_work_order_stage_import_v1'));
 select count(*),count(distinct work_id),count(*) filter (where
    work_id is null or work_id !~ '^DF-[A-Za-z0-9()_-]+$'
    or room_group is null or room_group !~ '[AB][0-9]{3}'
    or building not in ('A','B') or left(room_group,1) is distinct from building
    or nullif(btrim(contractor),'') is null or nullif(btrim(defect_item),'') is null
    or source_master_row is null or source_master_row<=0
    or stage_decision not in
       ('STAGE_REVERIFY_NO_DB_WRITE','STAGE_HISTORY_ONLY','HOLD_MISSING_EVIDENCE','DENY_DISPATCH')
 ) into v_total,v_unique,v_invalid
 from jsonb_to_recordset(p_rows) as r(work_id text,room_group text,building text,
    contractor text,defect_item text,source_master_row integer,stage_decision text);
 if v_unique<>82 or v_invalid>0 then
   return jsonb_build_object('ok',false,'error','invalid_or_duplicate_source', 'invalid',v_invalid);
 end if;
 select count(*) into v_unknown
 from jsonb_to_recordset(p_rows) r(room_group text)
 cross join lateral regexp_matches(r.room_group,'[AB][0-9]{3}','g') m(room)
 where not exists(select 1 from public.condo_room_status c where c.room_no=m.room[1]);
 if v_unknown<>0 then
   return jsonb_build_object('ok',false,'error','unknown_room','count',v_unknown);
 end if;
 -- STOP if the 82 include an existing Work ID: this is only the independently reconciled master-only set.
 select count(*) into v_before from jsonb_to_recordset(p_rows) r(work_id text)
 inner join public.defect_work_order_snapshot w using(work_id);
 if v_before>0 then
  return jsonb_build_object('ok',false,'error','source_no_longer_master_only','matched',v_before);
 end if;
 select count(*) filter(where source_active),count(*) filter(where not source_active)
 into v_active,v_retired from public.defect_work_order_snapshot;
 select max(source_modified_at) into v_source_last from public.defect_work_order_import_staging;
 if v_source_last is not null and p_source_modified_at<v_source_last then
  return jsonb_build_object('ok',false,'error','stale_source');
 end if;
 select count(*) into v_new from jsonb_to_recordset(p_rows) r(work_id text)
 where not exists(select 1 from public.defect_work_order_import_staging s where s.work_id=r.work_id);
 if p_dry_run then
  return jsonb_build_object('ok',true,'dry_run',true,'source_rows',82,
    'would_stage_new',v_new,'production_active_unchanged',v_active,
    'production_inactive_unchanged',v_retired,'production_mutation',0);
 end if;
 insert into public.defect_work_order_import_staging as s
  (work_id,room_group,building,contractor,defect_item,source_work_status,stage_decision,
   source_master_row,source_evidence_url,source_file_id,source_modified_at,source_payload)
 select work_id,room_group,building,contractor,defect_item,source_work_status,stage_decision,
   source_master_row,source_evidence_url,p_source_file_id,p_source_modified_at,payload
 from jsonb_to_recordset(p_rows) as r(work_id text,room_group text,building text,
   contractor text,defect_item text,source_work_status text,stage_decision text,
   source_master_row integer,source_evidence_url text,payload jsonb)
 on conflict(work_id) do update set
   room_group=excluded.room_group,building=excluded.building,
   contractor=excluded.contractor,defect_item=excluded.defect_item,
   source_work_status=excluded.source_work_status,stage_decision=excluded.stage_decision,
   source_master_row=excluded.source_master_row,source_evidence_url=excluded.source_evidence_url,
   source_modified_at=excluded.source_modified_at,source_payload=excluded.source_payload,
   staged_at=now()
 where row(s.room_group,s.building,s.contractor,s.defect_item,s.source_work_status,
           s.stage_decision,s.source_master_row,s.source_evidence_url,s.source_modified_at,
           s.source_payload)
 is distinct from
 row(excluded.room_group,excluded.building,excluded.contractor,excluded.defect_item,
     excluded.source_work_status,excluded.stage_decision,excluded.source_master_row,
     excluded.source_evidence_url,excluded.source_modified_at,excluded.source_payload);
 get diagnostics v_changed = row_count;
 if (select count(*) from public.defect_work_order_snapshot where source_active)<>v_active or
    (select count(*) from public.defect_work_order_snapshot where not source_active)<>v_retired
 then raise exception 'production_status_changed_during_staging'; end if;
 return jsonb_build_object('ok',true,'staged',82,'changed',v_changed,
    'production_mutation',0,'active_unchanged',v_active,'inactive_unchanged',v_retired);
end $$;
revoke all on function public.defect_work_order_nonretiring_stage_import(text,text,timestamptz,jsonb,boolean)
 from public,anon,authenticated;
grant execute on function public.defect_work_order_nonretiring_stage_import(text,text,timestamptz,jsonb,boolean)
 to service_role;
-- Future dispatch must be a separate per-Work-ID verified operation with own audit/QA gate.
