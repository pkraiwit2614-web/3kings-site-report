-- Permit bounded, independently verified source deltas instead of one frozen 82-ID batch.
-- No source data or approval is seeded. Existing function ACL is retained.
DO $preflight$ BEGIN
 IF md5(pg_get_functiondef('public.defect_work_order_nonretiring_stage_import(text,text,timestamptz,jsonb,boolean)'::regprocedure))
 IS DISTINCT FROM 'cd1ab6e2a1606fbfaea5b3b32a33b9b1' THEN RAISE EXCEPTION 'STAGING_FUNCTION_DRIFT_REVIEW_REQUIRED'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.defect_work_order_nonretiring_stage_import(p_sync_key text, p_source_file_id text, p_source_modified_at timestamp with time zone, p_rows jsonb, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_total integer;v_unique integer;v_invalid integer;v_unknown integer;
        v_new integer;v_changed integer:=0;v_before integer;v_active integer;
        v_retired integer;v_source_last timestamptz;
begin
 if private.drive_sync_key_valid(p_sync_key) is distinct from true
 then return jsonb_build_object('ok',false,'error','invalid_sync_key');end if;
 if p_source_file_id is distinct from '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx'
 then return jsonb_build_object('ok',false,'error','unapproved_source');end if;
 if p_source_modified_at is null or p_source_modified_at>now()+interval '5 minutes'
 then return jsonb_build_object('ok',false,'error','invalid_source_time');end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 300
 then return jsonb_build_object('ok',false,'error','invalid_source_row_count');end if;
 perform pg_advisory_xact_lock(hashtext('3kings_work_order_stage_import_v1'));
 lock table public.defect_work_order_snapshot in share mode nowait;
 lock table public.defect_work_order_import_staging in share row exclusive mode nowait;
 select count(*),count(distinct work_id),count(*) filter (where
    work_id is null or work_id !~ '^DF-[A-Za-z0-9()_-]+$'
    or room_group is null or room_group !~ '[AB][0-9]{3}'
    or building is null or building not in ('A','B') or left(room_group,1) is distinct from building
    or nullif(btrim(contractor),'') is null or nullif(btrim(defect_item),'') is null
    or source_master_row is null or source_master_row<=0
    or stage_decision is null or stage_decision not in
       ('STAGE_REVERIFY_NO_DB_WRITE','STAGE_HISTORY_ONLY','HOLD_MISSING_EVIDENCE','DENY_DISPATCH')
 ) into v_total,v_unique,v_invalid
 from jsonb_to_recordset(p_rows) as r(work_id text,room_group text,building text,
    contractor text,defect_item text,source_master_row integer,stage_decision text);
 if v_unique<>v_total or v_invalid>0 then
   return jsonb_build_object('ok',false,'error','invalid_or_duplicate_source', 'invalid',v_invalid);
 end if;
 select count(*) into v_unknown
 from jsonb_to_recordset(p_rows) r(room_group text)
 cross join lateral regexp_matches(r.room_group,'[AB][0-9]{3}','g') m(room)
 where not exists(select 1 from public.condo_room_status c where c.room_no=m.room[1]);
 if v_unknown<>0 then
   return jsonb_build_object('ok',false,'error','unknown_room','count',v_unknown);
 end if;
 -- Every submitted ID must be absent from Production; never replace or retire snapshot rows.
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
 if p_dry_run is distinct from false then
  return jsonb_build_object('ok',true,'dry_run',true,'source_rows',v_total,
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
 return jsonb_build_object('ok',true,'staged',v_total,'changed',v_changed,
    'production_mutation',0,'active_unchanged',v_active,'inactive_unchanged',v_retired);
exception when lock_not_available then
 return jsonb_build_object('ok',false,'error','concurrent_work_order_writer');
end $function$
;
