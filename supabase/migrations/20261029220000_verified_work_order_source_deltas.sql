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

-- Preserve source notice/SLA metadata for newly approved IDs; no existing assignment/status mutation.
CREATE OR REPLACE FUNCTION public.defect_work_order_promote_nonretiring_approved(
 p_sync_key text,p_work_id text,p_source_file_id text,p_source_modified_at timestamptz,
 p_dry_run boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $promote$
DECLARE
 s public.defect_work_order_import_staging%ROWTYPE;
 a public.work_order_promotion_approvals%ROWTYPE;
 w public.defect_work_order_snapshot%ROWTYPE;
 v_rooms text[]; v_count integer; v_exists boolean; v_staged boolean;
 v_hash text; v_before jsonb; v_after jsonb; v_fields jsonb;
BEGIN
 IF private.drive_sync_key_valid(p_sync_key) IS DISTINCT FROM true THEN
   RETURN jsonb_build_object('ok',false,'error','invalid_sync_key');
 END IF;
 IF p_work_id IS NULL OR p_work_id !~ '^DF-[A-Za-z0-9()_-]+$' THEN
   RETURN jsonb_build_object('ok',false,'error','invalid_work_id');
 END IF;
 IF p_source_modified_at IS NULL OR p_source_modified_at>now()+interval '5 minutes' THEN
   RETURN jsonb_build_object('ok',false,'error','invalid_source_time');
 END IF;
 -- Lock before the queue/version reads. Standard imports and completion writers conflict here.
 LOCK TABLE public.defect_work_order_snapshot IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 LOCK TABLE public.defect_web_overrides IN SHARE MODE NOWAIT;
 SELECT * INTO w FROM public.defect_work_order_snapshot WHERE work_id=p_work_id FOR UPDATE;
 v_exists:=FOUND;
 SELECT * INTO a FROM public.work_order_promotion_approvals WHERE work_id=p_work_id FOR UPDATE;
 IF NOT FOUND OR a.revoked_at IS NOT NULL OR
    a.source_file_id IS DISTINCT FROM p_source_file_id OR
    a.source_modified_at IS DISTINCT FROM p_source_modified_at OR
    a.approved_at<a.source_modified_at OR
    NOT(a.completion_confirmed_open AND a.contractor_room_confirmed AND a.override_queue_checked AND a.combine_checked)
 THEN RETURN jsonb_build_object('ok',false,'error','approved_evidence_missing_or_stale'); END IF;
 SELECT * INTO s FROM public.defect_work_order_import_staging WHERE work_id=p_work_id FOR SHARE;
 v_staged:=FOUND;
 IF NOT v_staged THEN
   IF NOT v_exists THEN RETURN jsonb_build_object('ok',false,'error','work_id_not_staged'); END IF;
   s:=jsonb_populate_record(NULL::public.defect_work_order_import_staging,a.approved_stage_snapshot);
 ELSIF to_jsonb(s) IS DISTINCT FROM a.approved_stage_snapshot THEN
   RETURN jsonb_build_object('ok',false,'error','approved_stage_content_changed');
 END IF;
 IF s.work_id IS DISTINCT FROM p_work_id OR
    s.source_file_id IS DISTINCT FROM '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx' OR
    s.source_file_id IS DISTINCT FROM p_source_file_id OR
    s.source_modified_at IS DISTINCT FROM p_source_modified_at THEN
   RETURN jsonb_build_object('ok',false,'error','source_revision_mismatch');
 END IF;
 IF s.stage_decision IS DISTINCT FROM 'STAGE_REVERIFY_NO_DB_WRITE' OR
    s.source_work_status IS NULL OR s.source_work_status NOT IN ('รอดำเนินการ','ยังไม่เริ่ม','กำลังดำเนินการ') OR
    nullif(btrim(s.contractor),'') IS NULL OR nullif(btrim(s.defect_item),'') IS NULL OR
    coalesce(s.source_payload->>'next_action','') ~* 'HOLD|รอยืนยัน' THEN
   RETURN jsonb_build_object('ok',false,'error','stage_not_dispatch_eligible');
 END IF;
 IF s.room_group IS NULL OR s.room_group !~ '^[AB][0-9]{3}([+/][AB][0-9]{3})?$' THEN
   RETURN jsonb_build_object('ok',false,'error','unverified_room_mapping');
 END IF;
 SELECT array_agg(m[1] ORDER BY n) INTO v_rooms
 FROM regexp_matches(s.room_group,'([AB][0-9]{3})','g') WITH ORDINALITY rx(m,n);
 v_count:=coalesce(cardinality(v_rooms),0);
 IF v_count NOT BETWEEN 1 AND 2 OR s.building IS NULL OR
    (SELECT count(DISTINCT r) FROM unnest(v_rooms) r)<>v_count OR
    EXISTS(SELECT 1 FROM unnest(v_rooms) r WHERE left(r,1) IS DISTINCT FROM s.building OR
      NOT EXISTS(SELECT 1 FROM public.condo_room_status c WHERE c.room_no=r)) THEN
   RETURN jsonb_build_object('ok',false,'error','unverified_room_mapping');
 END IF;
 IF v_count=2 AND EXISTS(
   SELECT 1 FROM public.condo_room_status c WHERE c.room_no=ANY(v_rooms) AND
   (c.current_status IS DISTINCT FROM (SELECT current_status FROM public.condo_room_status WHERE room_no=v_rooms[1]) OR
    c.status_group IS DISTINCT FROM (SELECT status_group FROM public.condo_room_status WHERE room_no=v_rooms[1]))) THEN
   RETURN jsonb_build_object('ok',false,'error','combine_status_mismatch');
 END IF;
 IF EXISTS(SELECT 1 FROM public.defect_web_overrides o WHERE o.room_no=ANY(v_rooms) AND
           (o.source_sync_state IS DISTINCT FROM 'synced' OR o.source_synced_at IS NULL)) OR
    (v_exists AND w.writeback_state IN ('pending','error')) THEN
   RETURN jsonb_build_object('ok',false,'error','web_override_pending');
 END IF;
 v_hash:=md5((to_jsonb(a)-'promoted_at'-'last_applied_hash'-'last_applied_at')::text);
 IF v_exists AND a.last_applied_hash=v_hash THEN
   RETURN jsonb_build_object('ok',true,'status','ALREADY_PRESENT_NO_CHANGE','work_id',p_work_id,'changed',0);
 END IF;
 v_fields:=a.approved_fields;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_fields) k WHERE k NOT IN ('defect_item','next_action','evidence_url')) OR
    (v_fields ? 'defect_item' AND nullif(btrim(v_fields->>'defect_item'),'') IS NULL) OR
    (v_fields ? 'evidence_url' AND (v_fields->>'evidence_url' IS NULL OR v_fields->>'evidence_url' !~ '^https://drive[.]google[.]com/[^[:space:]]+$')) THEN
   RETURN jsonb_build_object('ok',false,'error','unapproved_update_fields');
 END IF;
 IF v_exists THEN
   IF v_fields='{}'::jsonb THEN RETURN jsonb_build_object('ok',true,'status','ALREADY_PRESENT_NO_CHANGE','changed',0); END IF;
   IF NOT w.source_active OR w.web_completed_at IS NOT NULL OR coalesce(w.work_status,'') ~ 'เสร็จแล้ว|งดแจก|ยกเลิก' THEN
     RETURN jsonb_build_object('ok',false,'error','closed_or_inactive_preserved');
   END IF;
   IF w.room_group IS DISTINCT FROM s.room_group OR w.building IS DISTINCT FROM s.building OR
      w.contractor IS DISTINCT FROM s.contractor OR a.expected_snapshot_hash IS DISTINCT FROM md5(to_jsonb(w)::text) OR
      p_source_modified_at<w.source_modified_at THEN
     RETURN jsonb_build_object('ok',false,'error','existing_record_version_or_mapping_conflict');
   END IF;
   v_before:=to_jsonb(w);
 ELSE
   IF v_fields<>'{}'::jsonb OR a.expected_snapshot_hash IS NOT NULL THEN
     RETURN jsonb_build_object('ok',false,'error','new_id_requires_exact_staged_payload');
   END IF;
   IF nullif(btrim(s.source_evidence_url),'') IS NULL OR
      s.source_evidence_url !~ '^https://drive[.]google[.]com/[^[:space:]]+$' THEN
     RETURN jsonb_build_object('ok',false,'error','source_evidence_missing');
   END IF;
 END IF;
 IF EXISTS (
   SELECT 1 FROM (VALUES(s.source_payload->>'received_date'),(s.source_payload->>'due_date')) d(value)
   WHERE nullif(value,'') IS NOT NULL AND
    (value !~ '^\d{4}-\d{2}-\d{2}$' OR
     to_char(to_date(value,'YYYY-MM-DD'),'YYYY-MM-DD') IS DISTINCT FROM value)
 ) THEN RETURN jsonb_build_object('ok',false,'error','invalid_notice_date'); END IF;
 IF nullif(s.source_payload->>'received_date','') IS NOT NULL AND
    nullif(s.source_payload->>'due_date','') IS NOT NULL AND
    (s.source_payload->>'due_date')::date IS DISTINCT FROM (s.source_payload->>'received_date')::date+7 THEN
   RETURN jsonb_build_object('ok',false,'error','invalid_seven_day_due_date');
 END IF;
 IF p_dry_run IS DISTINCT FROM false THEN
   RETURN jsonb_build_object('ok',true,'status','DRY_RUN_APPROVED','work_id',p_work_id,
                            'would_insert',CASE WHEN v_exists THEN 0 ELSE 1 END,
                            'would_update',CASE WHEN v_exists THEN 1 ELSE 0 END,'production_mutation',0);
 END IF;
 IF v_exists THEN
   UPDATE public.defect_work_order_snapshot SET
     defect_item=CASE WHEN v_fields ? 'defect_item' THEN v_fields->>'defect_item' ELSE defect_item END,
     next_action=CASE WHEN v_fields ? 'next_action' THEN v_fields->>'next_action' ELSE next_action END,
     evidence_url=CASE WHEN v_fields ? 'evidence_url' THEN v_fields->>'evidence_url' ELSE evidence_url END,
     source_modified_at=p_source_modified_at
   WHERE work_id=p_work_id;
 ELSE
   INSERT INTO public.defect_work_order_snapshot
    (work_id,room_group,building,contractor,defect_item,next_action,work_status,evidence_url,qa_status,received_date,due_date,supervisor,
     source_sync_note,source_modified_at,source_active)
   VALUES(s.work_id,s.room_group,s.building,s.contractor,s.defect_item,
    nullif(s.source_payload->>'next_action',''),s.source_work_status,s.source_evidence_url,
    'APPROVED_NONRETIRING',nullif(s.source_payload->>'received_date','')::date,
    nullif(s.source_payload->>'due_date','')::date,nullif(s.source_payload->>'supervisor',''),'Approved evidence: '||a.approval_evidence_url||' | approved by '||a.approved_by,
    s.source_modified_at,true);
 END IF;
 SELECT to_jsonb(t) INTO v_after FROM public.defect_work_order_snapshot t WHERE work_id=p_work_id;
 INSERT INTO public.work_order_promotion_audit(work_id,action,approval,previous_row,applied_row)
 VALUES(p_work_id,CASE WHEN v_exists THEN 'UPDATE_APPROVED_FIELDS' ELSE 'INSERT_APPROVED_ID' END,to_jsonb(a),v_before,v_after);
 UPDATE public.work_order_promotion_approvals SET
   promoted_at=coalesce(promoted_at,now()),last_applied_hash=v_hash,last_applied_at=now() WHERE work_id=p_work_id;
 RETURN jsonb_build_object('ok',true,'status',CASE WHEN v_exists THEN 'UPDATED_APPROVED_FIELDS' ELSE 'PROMOTED_NEW_WORK_ID' END,
   'work_id',p_work_id,'inserted',CASE WHEN v_exists THEN 0 ELSE 1 END,
   'updated',CASE WHEN v_exists THEN 1 ELSE 0 END,'retired',0);
EXCEPTION WHEN lock_not_available THEN
 RETURN jsonb_build_object('ok',false,'error','concurrent_work_order_writer');
END $promote$;
