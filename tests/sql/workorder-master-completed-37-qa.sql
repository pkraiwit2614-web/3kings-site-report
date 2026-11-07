DO $qa$
DECLARE
  v_rows jsonb;
  r jsonb;
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT to_jsonb(t) INTO v_before
  FROM public.defect_work_order_snapshot t WHERE work_id='DF-B312-02';

  WITH ids AS (
    SELECT 'DF-'||x.room||'-'||lpad(n::text,2,'0') AS wid,x.room,n
    FROM (VALUES ('A207',4),('A301',2),('A327',2),('A416',9),('A512',12),('A612',8))
      x(room,max_no) CROSS JOIN LATERAL generate_series(1,x.max_no) n
  )
  SELECT jsonb_agg(jsonb_build_object(
    'work_id',wid,'room_group',room,
    'work_status','เสร็จแล้ว — งดแจก (รอตรวจรับ)',
    'contractor','3 Kings','defect_item','fixture defect',
    'next_action','inspection pending','supervisor','พี่ปู',
    'evidence_url','https://drive.google.com/file/d/fixture/view',
    'received_date','2026-11-03','due_date','2026-11-10',
    'source_master_row',CASE WHEN wid='DF-A207-04' THEN 341 ELSE 100+n END
  ) ORDER BY wid) INTO v_rows FROM ids;

  SELECT public.defect_work_order_master_completed_sync_20261107(
    'wrong-key','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
    '2026-11-06 17:55:16.040+00',v_rows,true) INTO r;
  IF r->>'error'<>'invalid_sync_key' THEN RAISE EXCEPTION 'invalid key must reject: %',r; END IF;

  SELECT public.defect_work_order_master_completed_sync_20261107(
    'isolated-fixture-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
    '2026-11-06 17:55:16.040+00',v_rows,true) INTO r;
  IF r->>'status'<>'DRY_RUN_MASTER_COMPLETED' OR (r->>'would_change')::int<>37
  THEN RAISE EXCEPTION 'dry-run 37 mismatch: %',r; END IF;
  IF (SELECT count(*) FROM public.work_order_promotion_audit)<>0
  THEN RAISE EXCEPTION 'dry-run made write'; END IF;

  SELECT public.defect_work_order_master_completed_sync_20261107(
    'isolated-fixture-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
    '2026-11-06 17:55:16.040+00',v_rows,false) INTO r;
  IF r->>'status'<>'MASTER_COMPLETION_SYNCED'
     OR (r->>'changed_existing')::int<>36
     OR (r->>'inserted_history')::int<>1
     OR (r->>'closed_total')::int<>37
  THEN RAISE EXCEPTION 'apply mismatch: %',r; END IF;

  IF (SELECT count(*) FROM public.defect_work_order_snapshot w
        WHERE w.room_group IN ('A207','A301','A327','A416','A512','A612'))<>37
    OR (SELECT count(*) FROM public.defect_work_order_snapshot w
        WHERE w.room_group IN ('A207','A301','A327','A416','A512','A612')
          AND w.work_status<>'เสร็จแล้ว — งดแจก (รอตรวจรับ)')<>0
    OR (SELECT count(*) FROM public.defect_work_order_snapshot w
        WHERE w.room_group IN ('A207','A301','A327','A416','A512','A612')
          AND w.qa_status ~* 'HOLD')<>0
  THEN RAISE EXCEPTION '37 records not reconciled'; END IF;
  IF (SELECT source_active FROM public.defect_work_order_snapshot
        WHERE work_id='DF-A207-04') IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'unapproved historical id became dispatch active'; END IF;
  IF (SELECT count(*) FROM public.work_order_promotion_approvals)<>36
     OR (SELECT count(*) FROM public.work_order_promotion_audit)<>37
  THEN RAISE EXCEPTION 'approval history tampered'; END IF;
  SELECT to_jsonb(t) INTO v_after FROM public.defect_work_order_snapshot t
    WHERE work_id='DF-B312-02';
  IF v_before IS DISTINCT FROM v_after
  THEN RAISE EXCEPTION 'unrelated Work ID changed'; END IF;

  SELECT public.defect_work_order_master_completed_sync_20261107(
    'isolated-fixture-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
    '2026-11-06 17:55:16.040+00',v_rows,false) INTO r;
  IF r->>'status'<>'NO_CHANGE' OR (r->>'closed_total')::int<>37
     OR (SELECT count(*) FROM public.work_order_promotion_audit)<>37
  THEN RAISE EXCEPTION 'repeat was not idempotent: %',r; END IF;

  INSERT INTO public.defect_web_overrides(room_no,source_sync_state)
    VALUES('A207','pending');
  SELECT public.defect_work_order_master_completed_sync_20261107(
    'isolated-fixture-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
    '2026-11-06 17:55:16.040+00',v_rows,true) INTO r;
  IF r->>'error'<>'pending_web_override'
  THEN RAISE EXCEPTION 'override gate ineffective: %',r; END IF;
  DELETE FROM public.defect_web_overrides WHERE room_no='A207';

  SELECT public.defect_work_order_master_completed_sync_20261107(
    'isolated-fixture-only','bad-file-id',
    '2026-11-06 17:55:16.040+00',v_rows,false) INTO r;
  IF r->>'error'<>'invalid_scope_or_file_version'
  THEN RAISE EXCEPTION 'source id guard ineffective: %',r; END IF;

  RAISE NOTICE 'EXACT_37_COMPLETED_MASTER_SYNC_ISOLATED_PASS (37/37, zero open, zero HOLD, approvals=36, audit=37, outside scope unchanged)';
END
$qa$;
