-- Approved per-ID promotion. Default dry-run; no source rows or approvals are seeded.
CREATE TABLE IF NOT EXISTS public.work_order_promotion_approvals (
 work_id text PRIMARY KEY,
 source_file_id text NOT NULL CHECK (source_file_id='18P3OFYtOLsslCtDujlSQVf9IQSuplKcx'),
 source_modified_at timestamptz NOT NULL,
 approval_evidence_url text NOT NULL CHECK (approval_evidence_url ~ '^https://[^[:space:]]+$'),
 approved_by text NOT NULL CHECK (length(btrim(approved_by))>=2),
 approved_at timestamptz NOT NULL DEFAULT now(),
 completion_confirmed_open boolean NOT NULL CHECK(completion_confirmed_open),
 contractor_room_confirmed boolean NOT NULL CHECK(contractor_room_confirmed),
 override_queue_checked boolean NOT NULL CHECK(override_queue_checked),
 combine_checked boolean NOT NULL CHECK(combine_checked),
 approved_stage_snapshot jsonb NOT NULL CHECK(jsonb_typeof(approved_stage_snapshot)='object'),
 approved_fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(approved_fields)='object'),
 expected_snapshot_hash text,
 promoted_at timestamptz,
 last_applied_hash text,
 last_applied_at timestamptz,
 revoked_at timestamptz
);
ALTER TABLE public.work_order_promotion_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_promotion_approvals FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.work_order_promotion_approvals TO service_role;
CREATE TABLE IF NOT EXISTS public.work_order_promotion_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 work_id text NOT NULL, action text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 approval jsonb NOT NULL, previous_row jsonb, applied_row jsonb NOT NULL
);
ALTER TABLE public.work_order_promotion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_promotion_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.work_order_promotion_audit TO service_role;

-- Modify only the existing legacy importer's retirement/update predicates.
-- Its key checks, source validation, completion handling, ACL and unrelated records remain intact.
DO $guard$
DECLARE d text; original text; retirement text; upsert_predicate text;
BEGIN
 d:=pg_get_functiondef('public.defect_work_order_sync_import(text,text,text,timestamptz,jsonb,boolean)'::regprocedure);
 original:=d;
 retirement:='WHERE w.source_active AND NOT EXISTS
     (SELECT 1 FROM incoming i WHERE i.work_id=w.work_id)';
 upsert_predicate:='WHERE ROW(w.room_group,w.building,w.contractor,w.defect_item,w.next_action,w.supervisor,';
 IF strpos(d,'work_order_promotion_approvals')>0 THEN
   RAISE EXCEPTION 'LEGACY_PROMOTION_GUARD_ALREADY_CHANGED_REVIEW_REQUIRED';
 END IF;
 IF (length(d)-length(replace(d,retirement,'')))/length(retirement)<>1 OR
    (length(d)-length(replace(d,upsert_predicate,'')))/length(upsert_predicate)<>1 THEN
   RAISE EXCEPTION 'LEGACY_IMPORT_PREDICATE_DRIFT';
 END IF;
 d:=replace(d,retirement,retirement||'
     AND NOT EXISTS (SELECT 1 FROM public.work_order_promotion_approvals a
                     WHERE a.work_id=w.work_id AND a.promoted_at IS NOT NULL)');
 d:=replace(d,upsert_predicate,'WHERE NOT EXISTS (SELECT 1 FROM public.work_order_promotion_approvals a
                           WHERE a.work_id=w.work_id AND a.promoted_at IS NOT NULL)
    AND ROW(w.room_group,w.building,w.contractor,w.defect_item,w.next_action,w.supervisor,');
 IF d=original THEN RAISE EXCEPTION 'LEGACY_GUARD_NOT_APPLIED'; END IF;
 IF strpos(d,'  v_before integer;')=0 OR
    strpos(d,'IF v_before >= 10 AND v_total < ceil(v_before * 0.65) THEN')=0 THEN
   RAISE EXCEPTION 'LEGACY_DROP_GUARD_DRIFT';
 END IF;
 d:=replace(d,'  v_before integer;','  v_before integer;
  v_managed_active integer;');
 d:=replace(d,'  -- Do not silently archive most dispatch records if the workbook is partial.',
   '  SELECT count(*) INTO v_managed_active FROM public.defect_work_order_snapshot w
    WHERE w.source_active AND EXISTS(SELECT 1 FROM public.work_order_promotion_approvals a
      WHERE a.work_id=w.work_id AND a.promoted_at IS NOT NULL);
  -- Do not silently archive most dispatch records if the workbook is partial.');
 d:=replace(d,'IF v_before >= 10 AND v_total < ceil(v_before * 0.65) THEN',
   'IF (v_before-v_managed_active) >= 10 AND v_total < ceil((v_before-v_managed_active) * 0.65) THEN');
 EXECUTE d;
END $guard$;

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
    (work_id,room_group,building,contractor,defect_item,next_action,work_status,evidence_url,qa_status,
     source_sync_note,source_modified_at,source_active)
   VALUES(s.work_id,s.room_group,s.building,s.contractor,s.defect_item,
    nullif(s.source_payload->>'next_action',''),s.source_work_status,s.source_evidence_url,
    'APPROVED_NONRETIRING','Approved evidence: '||a.approval_evidence_url||' | approved by '||a.approved_by,
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
REVOKE ALL ON FUNCTION public.defect_work_order_promote_nonretiring_approved(text,text,text,timestamptz,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.defect_work_order_promote_nonretiring_approved(text,text,text,timestamptz,boolean) TO service_role;
-- Rollback: revoke RPC EXECUTE and stop new approvals. Do not delete approvals/audit or
-- remove the legacy retention predicates while managed IDs exist; that would risk retirement.
