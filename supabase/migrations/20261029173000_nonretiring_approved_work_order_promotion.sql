-- Surgical review-to-production Work Order promotion. NO existing importer changes.
-- Production apply requires separate SOP 15/16 engineering, SQL/RLS, rollback and UI gates.
-- This migration only creates an isolated approval ledger and a default dry-run RPC.
CREATE TABLE IF NOT EXISTS private.work_order_promotion_approvals (
  work_id text PRIMARY KEY REFERENCES public.defect_work_order_import_staging(work_id),
  source_file_id text NOT NULL CHECK (source_file_id='18P3OFYtOLsslCtDujlSQVf9IQSuplKcx'),
  source_modified_at timestamptz NOT NULL,
  approval_evidence_url text NOT NULL CHECK (approval_evidence_url ~ '^https://[^[:space:]]+$'),
  approved_by text NOT NULL CHECK (length(btrim(approved_by))>=2),
  approved_at timestamptz NOT NULL DEFAULT now(),
  completion_confirmed_open boolean NOT NULL CHECK (completion_confirmed_open),
  contractor_room_confirmed boolean NOT NULL CHECK (contractor_room_confirmed),
  override_queue_checked boolean NOT NULL CHECK (override_queue_checked),
  combine_checked boolean NOT NULL CHECK (combine_checked),
  revoked_at timestamptz
);
ALTER TABLE private.work_order_promotion_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.work_order_promotion_approvals FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON private.work_order_promotion_approvals TO service_role;

CREATE OR REPLACE FUNCTION public.defect_work_order_promote_nonretiring_approved(
  p_sync_key text,
  p_work_id text,
  p_source_file_id text,
  p_source_modified_at timestamptz,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $promote$
DECLARE
  s public.defect_work_order_import_staging%ROWTYPE;
  a private.work_order_promotion_approvals%ROWTYPE;
  v_rooms text[];
  v_room text;
  v_room_count integer;
  v_override_count integer;
  v_existing_count integer;
  v_original_total integer;
  v_original_active integer;
  v_new_total integer;
  v_new_active integer;
  v_changed integer;
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key)
  THEN RETURN jsonb_build_object('ok',false,'error','invalid_sync_key'); END IF;

  IF p_work_id IS NULL OR p_work_id !~ '^DF-[A-Za-z0-9()_-]+$'
  THEN RETURN jsonb_build_object('ok',false,'error','invalid_work_id'); END IF;

  SELECT * INTO s FROM public.defect_work_order_import_staging WHERE work_id=p_work_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','work_id_not_staged'); END IF;

  IF s.source_file_id IS DISTINCT FROM '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx'
     OR p_source_file_id IS DISTINCT FROM s.source_file_id
     OR p_source_modified_at IS DISTINCT FROM s.source_modified_at
  THEN RETURN jsonb_build_object('ok',false,'error','source_revision_mismatch'); END IF;

  IF s.stage_decision <> 'STAGE_REVERIFY_NO_DB_WRITE'
     OR s.source_work_status NOT IN ('รอดำเนินการ','ยังไม่เริ่ม','กำลังดำเนินการ')
  THEN RETURN jsonb_build_object('ok',false,'error','stage_not_dispatch_eligible'); END IF;

  SELECT * INTO a FROM private.work_order_promotion_approvals WHERE work_id=p_work_id;
  IF NOT FOUND OR a.revoked_at IS NOT NULL OR
     a.source_file_id IS DISTINCT FROM s.source_file_id OR
     a.source_modified_at IS DISTINCT FROM s.source_modified_at OR
     a.approved_at < s.source_modified_at OR
     NOT (a.completion_confirmed_open AND a.contractor_room_confirmed
          AND a.override_queue_checked AND a.combine_checked)
  THEN RETURN jsonb_build_object('ok',false,'error','approved_evidence_missing_or_stale'); END IF;

  SELECT array_agg(m[1] ORDER BY n) INTO v_rooms
  FROM regexp_matches(s.room_group,'([AB][0-9]{3})','g') WITH ORDINALITY AS rx(m,n);
  v_room_count:=coalesce(cardinality(v_rooms),0);
  IF v_room_count NOT BETWEEN 1 AND 2 OR
     (SELECT count(DISTINCT v) FROM unnest(v_rooms) v)<>v_room_count OR
     EXISTS(SELECT 1 FROM unnest(v_rooms) v
       WHERE left(v,1)<>s.building OR NOT EXISTS(
         SELECT 1 FROM public.condo_room_status c WHERE c.room_no=v))
  THEN RETURN jsonb_build_object('ok',false,'error','unverified_room_mapping'); END IF;

  IF v_room_count=2 AND EXISTS(
      SELECT 1 FROM public.condo_room_status c
      WHERE c.room_no=ANY(v_rooms) AND
      (c.current_status IS DISTINCT FROM
         (SELECT c2.current_status FROM public.condo_room_status c2 WHERE c2.room_no=v_rooms[1])
       OR c.status_group IS DISTINCT FROM
         (SELECT c2.status_group FROM public.condo_room_status c2 WHERE c2.room_no=v_rooms[1])))
  THEN RETURN jsonb_build_object('ok',false,'error','combine_status_mismatch'); END IF;

  SELECT count(*) INTO v_override_count
  FROM public.defect_web_overrides w
  WHERE w.room_no=ANY(v_rooms) AND
        (w.source_sync_state IS DISTINCT FROM 'synced' OR w.source_synced_at IS NULL);
  IF v_override_count>0 THEN
    RETURN jsonb_build_object('ok',false,'error','web_override_pending');
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM public.defect_work_order_snapshot w WHERE w.work_id=p_work_id;
  IF v_existing_count>0 THEN
    RETURN jsonb_build_object('ok',true,'status','ALREADY_PRESENT_NO_CHANGE',
                              'work_id',p_work_id,'changed',0);
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object('ok',true,'status','DRY_RUN_APPROVED',
           'work_id',p_work_id,'would_insert',1,'production_mutation',0);
  END IF;

  -- NOWAIT prevents races with an existing Work Order importer and fails closed.
  LOCK TABLE public.defect_work_order_snapshot IN SHARE ROW EXCLUSIVE MODE NOWAIT;
  IF EXISTS(SELECT 1 FROM public.defect_work_order_snapshot w WHERE w.work_id=p_work_id)
  THEN RETURN jsonb_build_object('ok',true,'status','ALREADY_PRESENT_NO_CHANGE','changed',0);
  END IF;
  SELECT count(*),count(*) FILTER(WHERE source_active)
    INTO v_original_total,v_original_active FROM public.defect_work_order_snapshot;

  INSERT INTO public.defect_work_order_snapshot
    (work_id,room_group,building,contractor,defect_item,next_action,
     work_status,evidence_url,qa_status,source_sync_note,
     source_modified_at,source_active)
  VALUES
    (s.work_id,s.room_group,s.building,s.contractor,s.defect_item,
     NULLIF(s.source_payload->>'next_action',''),
     s.source_work_status,s.source_evidence_url,'APPROVED_NONRETIRING',
     'Approved evidence: '||a.approval_evidence_url||' | approved by '||a.approved_by,
     s.source_modified_at,true)
  ON CONFLICT (work_id) DO NOTHING;
  GET DIAGNOSTICS v_changed=ROW_COUNT;

  SELECT count(*),count(*) FILTER(WHERE source_active)
    INTO v_new_total,v_new_active FROM public.defect_work_order_snapshot;
  IF v_changed<>1 OR v_new_total<>v_original_total+1 OR
     v_new_active<>v_original_active+1 THEN
    RAISE EXCEPTION 'NONRETIRING_POSTWRITE_INVARIANT_FAILURE';
  END IF;

  RETURN jsonb_build_object('ok',true,'status','PROMOTED_NEW_WORK_ID',
            'work_id',p_work_id,'inserted',1,'retired',0,
            'total_before',v_original_total,'total_after',v_new_total,
            'active_before',v_original_active,'active_after',v_new_active);
EXCEPTION WHEN lock_not_available THEN
  RETURN jsonb_build_object('ok',false,'error','concurrent_work_order_writer');
END;
$promote$;
REVOKE ALL ON FUNCTION public.defect_work_order_promote_nonretiring_approved(
  text,text,text,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.defect_work_order_promote_nonretiring_approved(
  text,text,text,timestamptz,boolean) TO service_role;

-- NO approval rows are seeded: zero Work IDs can dispatch without future verified evidence.
-- Source Work Order 74 IDs / 48 active / DB-only, history, manual overrides and closed
-- state remain untouched. The old retiring importer is neither replaced nor invoked.
