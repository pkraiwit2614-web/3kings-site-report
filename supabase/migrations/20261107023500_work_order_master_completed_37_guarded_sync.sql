-- Existing Work Order Sync extension: exact 37 owner-confirmed completed Work IDs.
-- Source remains the ORIGINAL XLSX, never a rebuilt sheet or a web override.
-- Guarded by the existing private sync key, immutable ID scope, row approvals,
-- canonical room status, staged history and the existing protected writers.
-- No trigger, RBAC/RLS, master workbook or other Work Order changes.

CREATE OR REPLACE FUNCTION public.defect_work_order_master_completed_sync_20261107(
  p_sync_key text,
  p_source_file_id text,
  p_source_modified_at timestamptz,
  p_rows jsonb,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  item jsonb;
  w public.defect_work_order_snapshot%rowtype;
  a public.work_order_promotion_approvals%rowtype;
  s public.defect_work_order_import_staging%rowtype;
  before_row jsonb;
  after_row jsonb;
  wid text;
  room text;
  incoming_status text;
  changed_count integer := 0;
  unchanged_count integer := 0;
  inserted_count integer := 0;
  planned_changes integer := 0;
  seen_count integer;
  existing_count integer;
  v_max_source timestamptz;
  qa_after text;
BEGIN
  IF private.drive_sync_key_valid(p_sync_key) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_sync_key');
  END IF;
  IF p_source_file_id IS DISTINCT FROM '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx'
     OR p_source_modified_at IS NULL
     OR p_source_modified_at < '2026-11-06 17:55:16.040+00'::timestamptz
     OR p_source_modified_at > now() + interval '5 minutes'
     OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) <> 37 THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_scope_or_file_version');
  END IF;

  -- These are exactly the owner's six repaired rooms, not a general bulk close.
  WITH expected AS (
    SELECT 'DF-'||x.room||'-'||lpad(n::text,2,'0') AS work_id
    FROM (VALUES ('A207',4),('A301',2),('A327',2),('A416',9),('A512',12),('A612',8))
      x(room,max_no)
    CROSS JOIN LATERAL generate_series(1,x.max_no) n
  ), actual AS (
    SELECT elem->>'work_id' AS work_id FROM jsonb_array_elements(p_rows) elem
  )
  SELECT count(DISTINCT work_id) INTO seen_count FROM actual;
  IF seen_count <> 37
      OR EXISTS (
        WITH expected AS (
          SELECT 'DF-'||x.room||'-'||lpad(n::text,2,'0') AS work_id
          FROM (VALUES ('A207',4),('A301',2),('A327',2),('A416',9),('A512',12),('A612',8))
            x(room,max_no) CROSS JOIN LATERAL generate_series(1,x.max_no) n
        ), actual AS (SELECT elem->>'work_id' work_id FROM jsonb_array_elements(p_rows) elem)
        SELECT work_id FROM expected EXCEPT SELECT work_id FROM actual
      )
      OR EXISTS (
        WITH expected AS (
          SELECT 'DF-'||x.room||'-'||lpad(n::text,2,'0') AS work_id
          FROM (VALUES ('A207',4),('A301',2),('A327',2),('A416',9),('A512',12),('A612',8))
            x(room,max_no) CROSS JOIN LATERAL generate_series(1,x.max_no) n
        ), actual AS (SELECT elem->>'work_id' work_id FROM jsonb_array_elements(p_rows) elem)
        SELECT work_id FROM actual EXCEPT SELECT work_id FROM expected
      ) THEN
    RETURN jsonb_build_object('ok',false,'error','work_id_scope_or_duplicate_mismatch');
  END IF;

  -- Keep this serialized with standard imports, approved promotions, and web queues.
  LOCK TABLE public.defect_work_order_snapshot IN SHARE ROW EXCLUSIVE MODE NOWAIT;
  LOCK TABLE public.work_order_promotion_approvals IN SHARE MODE NOWAIT;
  LOCK TABLE public.defect_work_order_import_staging IN SHARE MODE NOWAIT;
  LOCK TABLE public.defect_web_overrides IN SHARE MODE NOWAIT;
  SELECT max(source_modified_at) INTO v_max_source FROM public.defect_work_order_snapshot;
  IF v_max_source IS NOT NULL AND p_source_modified_at < v_max_source THEN
    RETURN jsonb_build_object('ok',false,'error','stale_master_revision');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.defect_web_overrides o
    WHERE o.room_no=ANY(ARRAY['A207','A301','A327','A416','A512','A612'])
      AND (o.source_sync_state IS DISTINCT FROM 'synced' OR o.source_synced_at IS NULL)
  ) THEN
    RETURN jsonb_build_object('ok',false,'error','pending_web_override');
  END IF;

  -- Validate all 37 before writing a single row; every error is fail-closed.
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    wid := item->>'work_id';
    room := item->>'room_group';
    incoming_status := item->>'work_status';
    IF room IS DISTINCT FROM substring(wid from '^DF-([AB][0-9]{3})-')
       OR incoming_status IS DISTINCT FROM 'เสร็จแล้ว — งดแจก (รอตรวจรับ)'
       OR NULLIF(btrim(item->>'contractor'),'') IS NULL
       OR NULLIF(btrim(item->>'defect_item'),'') IS NULL
       OR coalesce(item->>'evidence_url','') !~ '^https://drive[.]google[.]com/'
       OR (item->>'source_master_row') !~ '^[0-9]+$'
       OR (NULLIF(item->>'received_date','') IS NOT NULL
           AND (item->>'received_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
       OR (NULLIF(item->>'due_date','') IS NOT NULL
           AND (item->>'due_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
       OR (NULLIF(item->>'received_date','') IS NOT NULL
           AND NULLIF(item->>'due_date','') IS NOT NULL
           AND (item->>'due_date')::date < (item->>'received_date')::date)
    THEN
      RETURN jsonb_build_object('ok',false,'error','invalid_master_completed_row','work_id',wid);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.condo_room_status c
      WHERE c.room_no=room AND c.current_status =
        CASE WHEN room='A416' THEN 'Defect เสร็จแล้ว / รอ Hotel ตรวจ'
             ELSE 'Defect เสร็จแล้ว / รอตรวจ' END
    ) THEN
      RETURN jsonb_build_object('ok',false,'error','room_master_not_completed','work_id',wid);
    END IF;

    SELECT * INTO w FROM public.defect_work_order_snapshot WHERE work_id=wid FOR UPDATE;
    IF FOUND THEN
      IF w.room_group IS DISTINCT FROM room OR w.building IS DISTINCT FROM left(room,1)
         OR w.source_modified_at > p_source_modified_at
         OR w.writeback_state IN ('pending','error')
         OR (w.web_completed_at IS NOT NULL
             AND coalesce(w.work_status,'') !~ 'เสร็จแล้ว|เสร็จสิ้น|งดแจก')
      THEN
        RETURN jsonb_build_object('ok',false,'error','existing_work_id_conflict','work_id',wid);
      END IF;
      SELECT * INTO a FROM public.work_order_promotion_approvals WHERE work_id=wid;
      IF NOT FOUND OR a.revoked_at IS NOT NULL OR a.promoted_at IS NULL
         OR a.source_file_id IS DISTINCT FROM p_source_file_id
         OR NOT(coalesce(a.completion_confirmed_open,false)
                 AND coalesce(a.contractor_room_confirmed,false)
                 AND coalesce(a.override_queue_checked,false)
                 AND coalesce(a.combine_checked,false))
      THEN
        RETURN jsonb_build_object('ok',false,'error','existing_approval_missing','work_id',wid);
      END IF;
      IF w.work_status IS DISTINCT FROM incoming_status
         OR w.source_modified_at IS DISTINCT FROM p_source_modified_at
         OR coalesce(w.qa_status,'') ~* 'HOLD' THEN
         planned_changes := planned_changes + 1;
      END IF;
    ELSE
      -- A207-04 was staged HOLD, never approved for dispatch.
      -- Record as INACTIVE completed history only; no approval or dispatch is minted.
      IF wid <> 'DF-A207-04' THEN
        RETURN jsonb_build_object('ok',false,'error','unexpected_missing_work_id','work_id',wid);
      END IF;
      SELECT * INTO a FROM public.work_order_promotion_approvals WHERE work_id=wid;
      IF FOUND THEN
        RETURN jsonb_build_object('ok',false,'error','unapproved_history_conflict','work_id',wid);
      END IF;
      SELECT * INTO s FROM public.defect_work_order_import_staging WHERE work_id=wid;
      IF NOT FOUND OR s.source_file_id IS DISTINCT FROM p_source_file_id
         OR s.room_group IS DISTINCT FROM room
         OR s.stage_decision IS DISTINCT FROM 'HOLD_MISSING_EVIDENCE'
         OR s.source_evidence_url IS DISTINCT FROM (item->>'evidence_url')
         OR s.source_master_row IS DISTINCT FROM (item->>'source_master_row')::integer THEN
        RETURN jsonb_build_object('ok',false,'error','staged_history_evidence_missing','work_id',wid);
      END IF;
      planned_changes := planned_changes + 1;
    END IF;
  END LOOP;

  IF p_dry_run IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('ok',true,'status','DRY_RUN_MASTER_COMPLETED',
      'checked',37,'would_change',planned_changes,'retired',0,
      'source_file_id',p_source_file_id,'source_modified_at',p_source_modified_at);
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    wid := item->>'work_id';
    room := item->>'room_group';
    incoming_status := item->>'work_status';
    SELECT * INTO w FROM public.defect_work_order_snapshot WHERE work_id=wid FOR UPDATE;
    IF FOUND THEN
      before_row := to_jsonb(w);
      qa_after := CASE WHEN coalesce(w.qa_status,'') ~* 'HOLD'
        THEN 'MASTER_COMPLETED_AWAITING_INSPECTION_NO_DISPATCH'
        ELSE w.qa_status END;
      IF w.work_status IS NOT DISTINCT FROM incoming_status
         AND w.source_modified_at IS NOT DISTINCT FROM p_source_modified_at
         AND w.qa_status IS NOT DISTINCT FROM qa_after THEN
        unchanged_count := unchanged_count + 1;
        CONTINUE;
      END IF;
      UPDATE public.defect_work_order_snapshot t
      SET work_status=incoming_status,qa_status=qa_after,
          source_modified_at=p_source_modified_at,imported_at=now()
      WHERE t.work_id=wid;
      changed_count := changed_count+1;
      SELECT to_jsonb(t) INTO after_row
        FROM public.defect_work_order_snapshot t WHERE t.work_id=wid;
      SELECT * INTO a FROM public.work_order_promotion_approvals WHERE work_id=wid;
      INSERT INTO public.work_order_promotion_audit
        (work_id,action,approval,previous_row,applied_row)
      VALUES(wid,'SYNC_OWNER_CONFIRMED_MASTER_COMPLETION',
        jsonb_build_object('source_file_id',p_source_file_id,
          'source_modified_at',p_source_modified_at,
          'existing_approved_at',a.approved_at,
          'existing_approval_evidence_url',a.approval_evidence_url,
          'master_row',item->>'source_master_row'),
        before_row,after_row);
    ELSE
      INSERT INTO public.defect_work_order_snapshot
        (work_id,room_group,building,contractor,defect_item,next_action,
         supervisor,received_date,due_date,work_status,evidence_url,
         qa_status,source_sync_note,source_modified_at,imported_at,source_active)
      VALUES(wid,room,left(room,1),item->>'contractor',
        item->>'defect_item',nullif(item->>'next_action',''),
        nullif(item->>'supervisor',''),
        nullif(item->>'received_date','')::date,
        nullif(item->>'due_date','')::date,incoming_status,
        item->>'evidence_url',
        'MASTER_COMPLETED_AWAITING_INSPECTION_NO_DISPATCH',
        'Historical HOLD: owner confirmed completion; dispatch NOT approved',
        p_source_modified_at,now(),false);
      inserted_count := inserted_count+1;
      SELECT to_jsonb(t) INTO after_row
        FROM public.defect_work_order_snapshot t WHERE t.work_id=wid;
      INSERT INTO public.work_order_promotion_audit
        (work_id,action,approval,previous_row,applied_row)
      VALUES(wid,'ARCHIVE_STAGED_HOLD_AS_COMPLETED_NO_DISPATCH',
        jsonb_build_object('source_file_id',p_source_file_id,
          'source_modified_at',p_source_modified_at,
          'history_only',true,'not_dispatch_approved',true,
          'master_row',item->>'source_master_row',
          'original_stage_decision','HOLD_MISSING_EVIDENCE'),
        NULL,after_row);
    END IF;
  END LOOP;
  SELECT count(*) INTO existing_count FROM public.defect_work_order_snapshot w
    WHERE w.room_group=ANY(ARRAY['A207','A301','A327','A416','A512','A612'])
    AND w.work_id IN (SELECT x->>'work_id' FROM jsonb_array_elements(p_rows) x)
    AND w.work_status='เสร็จแล้ว — งดแจก (รอตรวจรับ)';
  IF existing_count <> 37 THEN
    RAISE EXCEPTION 'COMPLETED_MASTER_READBACK_MISMATCH' USING ERRCODE='check_violation';
  END IF;
  RETURN jsonb_build_object('ok',true,
    'status',CASE WHEN changed_count+inserted_count=0 THEN 'NO_CHANGE'
                  ELSE 'MASTER_COMPLETION_SYNCED' END,
    'checked',37,'changed_existing',changed_count,'inserted_history',inserted_count,
    'unchanged',unchanged_count,'closed_total',existing_count,'retired',0,
    'source_file_id',p_source_file_id,'source_modified_at',p_source_modified_at);
EXCEPTION WHEN lock_not_available THEN
  RETURN jsonb_build_object('ok',false,'error','concurrent_work_order_writer');
END;
$function$;

REVOKE ALL ON FUNCTION public.defect_work_order_master_completed_sync_20261107(text,text,timestamptz,jsonb,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defect_work_order_master_completed_sync_20261107(text,text,timestamptz,jsonb,boolean)
  TO anon, authenticated;