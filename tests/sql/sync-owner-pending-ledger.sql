\set ON_ERROR_STOP on
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;
\i supabase/migrations/20261103210000_sync_owner_pending_incidents.sql
\i supabase/migrations/20261104070000_sync_owner_active_source_unique.sql

-- 1. Security / permission verification
DO $$
BEGIN
 IF has_function_privilege('anon','public.line_sync_owner_record_pending(text,text,text,text,timestamptz,boolean)','EXECUTE')
 OR has_function_privilege('authenticated','public.line_sync_owner_record_pending(text,text,text,text,timestamptz,boolean)','EXECUTE')
 OR has_table_privilege('anon','line_autopilot.sync_owner_pending_incidents','SELECT')
 OR has_table_privilege('authenticated','line_autopilot.sync_owner_pending_incidents','SELECT')
 THEN RAISE EXCEPTION 'PUBLIC ACCESS EXPOSURE ON PENDING INCIDENTS'; END IF;
 IF NOT has_function_privilege('service_role','public.line_sync_owner_record_pending(text,text,text,text,timestamptz,boolean)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.line_sync_owner_resolve_pending(text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.line_sync_owner_mark_overdue(text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.line_sync_owner_get_pending(text)','EXECUTE')
 THEN RAISE EXCEPTION 'SERVICE RPC PERMISSION MISSING ON PENDING INCIDENTS'; END IF;
END $$;

-- 2. Behavioral verification under service_role
SET ROLE service_role;
DO $$
DECLARE
  v_id1 bigint;
  v_id2 bigint;
  v_count int;
  v_status text;
BEGIN
  -- Record new pending incident
  v_id1 := public.line_sync_owner_record_pending(
    'materials',
    'master-drive-id-123',
    'materials:run-101',
    'Missing authenticated Web readback after DB write',
    pg_catalog.now() + interval '2 hours',
    true
  );
  IF v_id1 IS NULL OR v_id1 <= 0 THEN RAISE EXCEPTION 'RECORD NEW PENDING FAILED'; END IF;

  -- Verify it appears in get_pending
  SELECT count(*) INTO v_count FROM public.line_sync_owner_get_pending('materials');
  IF v_count <> 1 THEN RAISE EXCEPTION 'GET PENDING FAILED'; END IF;

  -- Update with same original_run_key (idempotent update, preserves pending status)
  v_id2 := public.line_sync_owner_record_pending(
    'materials',
    'master-drive-id-123',
    'materials:run-101',
    'Updated: still missing Web readback',
    pg_catalog.now() + interval '3 hours',
    true
  );
  IF v_id1 <> v_id2 THEN RAISE EXCEPTION 'IDEMPOTENT UPDATE CREATED NEW ROW'; END IF;

  -- Mark overdue alerted
  IF NOT public.line_sync_owner_mark_overdue('materials', 'materials:run-101') THEN
    RAISE EXCEPTION 'MARK OVERDUE FAILED';
  END IF;

  -- Second mark overdue should return false (already alerted)
  IF public.line_sync_owner_mark_overdue('materials', 'materials:run-101') THEN
    RAISE EXCEPTION 'DUPLICATE MARK OVERDUE SUCCEEDED UNEXPECTEDLY';
  END IF;

  -- Recording pending again on an overdue_alerted item must NOT reset alert_status to pending!
  PERFORM public.line_sync_owner_record_pending(
    'materials',
    'master-drive-id-123',
    'materials:run-101',
    'Later check: still unverified',
    pg_catalog.now() + interval '4 hours',
    true
  );
  SELECT alert_status INTO v_status FROM line_autopilot.sync_owner_pending_incidents WHERE id = v_id1;
  IF v_status <> 'overdue_alerted' THEN
    RAISE EXCEPTION 'STATUS WAS RESET FROM OVERDUE_ALERTED TO %', v_status;
  END IF;

  -- Resolve pending incident
  IF NOT public.line_sync_owner_resolve_pending('materials', 'materials:run-101', 'Web readback confirmed: 15 items') THEN
    RAISE EXCEPTION 'RESOLVE PENDING FAILED';
  END IF;

  -- Verify it no longer appears in get_pending
  SELECT count(*) INTO v_count FROM public.line_sync_owner_get_pending('materials');
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESOLVED ITEM STILL IN GET PENDING'; END IF;

  -- Verify second resolve returns false
  IF public.line_sync_owner_resolve_pending('materials', 'materials:run-101', 'Duplicate resolve') THEN
    RAISE EXCEPTION 'DUPLICATE RESOLVE SUCCEEDED';
  END IF;
END $$;
RESET ROLE;

-- Prevent two overlapping Cloudflare cron executions claiming the same Master
-- with different Run IDs. This must be rejected without changing Daily tables.
SET ROLE service_role;
DO $
DECLARE
 blocked boolean := false;
BEGIN
 PERFORM public.line_sync_owner_record_pending(
   'schedule','master-plot6','schedule:original-1',
   'Missing authenticated Web E2E readback',null,false);
 BEGIN
  PERFORM public.line_sync_owner_record_pending(
   'schedule','master-plot6','schedule:original-2',
   'Second concurrent incident on same source',null,false);
 EXCEPTION WHEN unique_violation THEN blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'SECOND ACTIVE SOURCE INCIDENT ALLOWED'; END IF;
 IF NOT public.line_sync_owner_resolve_pending(
   'schedule','schedule:original-1','Verified corrected') THEN
   RAISE EXCEPTION 'FIRST SOURCE INCIDENT RESOLVE FAILED'; END IF;
 PERFORM public.line_sync_owner_record_pending(
   'schedule','master-plot6','schedule:next-after-resolved',
   'New unique incident after resolution',null,false);
END $;
RESET ROLE;

SELECT 'SYNC_OWNER_PENDING_INCIDENTS_SQL_PASS' AS acceptance;
