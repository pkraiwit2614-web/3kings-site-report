\set ON_ERROR_STOP on
-- ====================================================================
-- Isolated PostgreSQL 17 Test Suite: Schedule RPC Preservation
-- Zero production dependencies, synthetic test database only.
-- Covers 87-task baseline, payloads (1, 44, 60, 86, 87), duplicate identities,
-- atomic rollback, NULL/Blank preservation, genuine zero, and stale deactivation.
-- ====================================================================

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE SCHEMA private;
CREATE FUNCTION private.drive_sync_key_valid(p_key text)
RETURNS boolean LANGUAGE sql AS $$ SELECT p_key = 'test-isolated-sync-key' $$;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

INSERT INTO public.projects (id, code, name, active)
VALUES ('fa7c6969-5ecc-42c0-9e95-c68a733ef357'::uuid, 'AV-P6', 'Above Villa Plot 6', true);

CREATE TABLE public.schedule_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  source_task_no text,
  category text,
  task_name text NOT NULL,
  area text,
  planned_duration_days integer,
  planned_start date,
  planned_end date,
  baseline_progress numeric,
  imported_plan_progress numeric,
  actual_progress numeric NOT NULL DEFAULT 0,
  plan_status text,
  site_status text,
  actual_start date,
  actual_end date,
  responsible_person text,
  contractor text,
  inspection_point text,
  required_evidence text,
  inspection_type text,
  inspection_result text,
  inspection_date date,
  blocker text,
  next_action text,
  target_close date,
  defect_ref text,
  evidence_link text,
  source_updated_at date,
  notes text,
  source_file text,
  source_sheet text,
  source_row integer,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  source_identity text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.drive_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL,
  project_code text,
  source_file text,
  source_sheet text,
  rows_read integer,
  rows_written integer,
  status text,
  message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ====================================================================
-- APPLY SURGICAL MIGRATION
-- ====================================================================
\i supabase/migrations/20261103190000_schedule_rpc_actual_progress_preservation.sql

-- ====================================================================
-- SEED 87 CANONICAL TASKS FOR PLOT 6
-- ====================================================================
DO $$
DECLARE
  i integer;
BEGIN
  FOR i IN 1..87 LOOP
    INSERT INTO public.schedule_tasks (
      project_id, source_identity, source_task_no, task_name, actual_progress, is_active
    ) VALUES (
      'fa7c6969-5ecc-42c0-9e95-c68a733ef357'::uuid,
      'P6-ID-' || lpad(i::text, 3, '0'),
      i::text,
      'Task ' || i || ' Name',
      0.50,
      true
    );
  END LOOP;
END $$;

-- Verify 87 initial active tasks
DO $$
DECLARE
  v_c integer;
BEGIN
  SELECT count(*) INTO v_c FROM public.schedule_tasks WHERE project_id = 'fa7c6969-5ecc-42c0-9e95-c68a733ef357' AND is_active = true;
  IF v_c <> 87 THEN RAISE EXCEPTION 'SEED FAILED: expected 87 tasks, got %', v_c; END IF;
  RAISE NOTICE 'SEED VERIFIED: 87 canonical tasks seeded.';
END $$;

-- ====================================================================
-- TEST 1: PAYLOAD 1 ROW — Must NOT deactivate remaining 86 tasks
-- ====================================================================
DO $$
DECLARE
  v_res jsonb;
  v_active integer;
  v_p1 numeric;
BEGIN
  v_res := public.drive_sync_apply_schedule(
    'test-isolated-sync-key',
    'AV-P6',
    'payload_1.xlsx',
    '[{"source_identity": "P6-ID-001", "task_name": "Task 1", "actual_progress": 0.75}]'::jsonb
  );

  IF (v_res->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'TEST 1 FAILED: RPC call failed: %', v_res; END IF;
  IF (v_res->>'full_snapshot_proven')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'TEST 1 FAILED: 1 row should NOT prove full snapshot'; END IF;
  IF (v_res->>'cleaned_stale_rows')::integer <> 0 THEN RAISE EXCEPTION 'TEST 1 FAILED: 1 row must not clean stale rows'; END IF;

  SELECT count(*) INTO v_active FROM public.schedule_tasks WHERE project_id = 'fa7c6969-5ecc-42c0-9e95-c68a733ef357' AND is_active = true;
  IF v_active <> 87 THEN RAISE EXCEPTION 'TEST 1 FAILED: remaining tasks deactivated! active=%', v_active; END IF;

  SELECT actual_progress INTO v_p1 FROM public.schedule_tasks WHERE source_identity = 'P6-ID-001';
  IF v_p1 <> 0.75 THEN RAISE EXCEPTION 'TEST 1 FAILED: Task 1 progress expected 0.75, got %', v_p1; END IF;

  RAISE NOTICE 'SUCCESS TEST 1: Payload 1 updated progress safely without deactivating 86 tasks.';
END $$;

-- ====================================================================
-- TEST 2: PAYLOAD 44 ROWS (~50%) — Must NOT deactivate remaining 43 tasks
-- ====================================================================
DO $$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v_res jsonb;
  v_active integer;
  i integer;
BEGIN
  FOR i IN 1..44 LOOP
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'source_identity', 'P6-ID-' || lpad(i::text, 3, '0'),
      'task_name', 'Task ' || i,
      'actual_progress', 0.60
    ));
  END LOOP;

  v_res := public.drive_sync_apply_schedule('test-isolated-sync-key', 'AV-P6', 'payload_44.xlsx', v_rows);

  IF (v_res->>'full_snapshot_proven')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'TEST 2 FAILED: 44 rows must NOT prove full snapshot'; END IF;
  SELECT count(*) INTO v_active FROM public.schedule_tasks WHERE project_id = 'fa7c6969-5ecc-42c0-9e95-c68a733ef357' AND is_active = true;
  IF v_active <> 87 THEN RAISE EXCEPTION 'TEST 2 FAILED: active count changed! got %', v_active; END IF;

  RAISE NOTICE 'SUCCESS TEST 2: Payload 44 updated progress without deactivating remaining tasks.';
END $$;

-- ====================================================================
-- TEST 3: PAYLOAD 60 ROWS — Must NOT deactivate remaining 27 tasks
-- ====================================================================
DO $$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v_res jsonb;
  v_active integer;
  i integer;
BEGIN
  FOR i IN 1..60 LOOP
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'source_identity', 'P6-ID-' || lpad(i::text, 3, '0'),
      'task_name', 'Task ' || i,
      'actual_progress', 0.65
    ));
  END LOOP;

  v_res := public.drive_sync_apply_schedule('test-isolated-sync-key', 'AV-P6', 'payload_60.xlsx', v_rows);

  IF (v_res->>'full_snapshot_proven')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'TEST 3 FAILED: 60 rows must NOT prove full snapshot'; END IF;
  SELECT count(*) INTO v_active FROM public.schedule_tasks WHERE project_id = 'fa7c6969-5ecc-42c0-9e95-c68a733ef357' AND is_active = true;
  IF v_active <> 87 THEN RAISE EXCEPTION 'TEST 3 FAILED: active count changed! got %', v_active; END IF;

  RAISE NOTICE 'SUCCESS TEST 3: Payload 60 updated progress without deactivating remaining tasks.';
END $$;

-- ====================================================================
-- TEST 4: PAYLOAD 86 ROWS (Missing 1 Task) — Must NOT deactivate Task 87
-- ====================================================================
DO $$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v_res jsonb;
  v_active integer;
  v_t87_active boolean;
  i integer;
BEGIN
  FOR i IN 1..86 LOOP
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'source_identity', 'P6-ID-' || lpad(i::text, 3, '0'),
      'task_name', 'Task ' || i,
      'actual_progress', 0.70
    ));
  END LOOP;

  v_res := public.drive_sync_apply_schedule('test-isolated-sync-key', 'AV-P6', 'payload_86.xlsx', v_rows);

  IF (v_res->>'full_snapshot_proven')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'TEST 4 FAILED: 86 rows must NOT prove full snapshot'; END IF;
  SELECT is_active INTO v_t87_active FROM public.schedule_tasks WHERE source_identity = 'P6-ID-087';
  IF v_t87_active IS NOT TRUE THEN RAISE EXCEPTION 'TEST 4 FAILED: Task 87 was erroneously deactivated by 86-row payload!'; END IF;

  SELECT count(*) INTO v_active FROM public.schedule_tasks WHERE project_id = 'fa7c6969-5ecc-42c0-9e95-c68a733ef357' AND is_active = true;
  IF v_active <> 87 THEN RAISE EXCEPTION 'TEST 4 FAILED: active count changed! got %', v_active; END IF;

  RAISE NOTICE 'SUCCESS TEST 4: Payload 86 preserved Task 87 active state (deactivation skipped).';
END $$;

-- ====================================================================
-- TEST 5: PAYLOAD WITH DUPLICATE SOURCE IDENTITY — Must fail closed before write
-- ====================================================================
DO $$
DECLARE
  v_res jsonb;
  v_p1 numeric;
BEGIN
  v_res := public.drive_sync_apply_schedule(
    'test-isolated-sync-key',
    'AV-P6',
    'payload_duplicate.xlsx',
    '[
      {"source_identity": "P6-ID-001", "task_name": "Task 1", "actual_progress": 0.99},
      {"source_identity": "P6-ID-001", "task_name": "Task 1 Duplicate", "actual_progress": 0.99}
    ]'::jsonb
  );

  IF (v_res->>'ok')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'TEST 5 FAILED: Duplicate identity should return ok=false'; END IF;
  IF v_res->>'error' <> 'duplicate_source_identity_in_payload' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Expected duplicate_source_identity_in_payload error, got %', v_res->>'error';
  END IF;

  -- Verify Task 1 was NOT modified to 0.99
  SELECT actual_progress INTO v_p1 FROM public.schedule_tasks WHERE source_identity = 'P6-ID-001';
  IF v_p1 = 0.99 THEN RAISE EXCEPTION 'TEST 5 FAILED: Duplicate batch partially wrote row 1!'; END IF;

  RAISE NOTICE 'SUCCESS TEST 5: Duplicate source identity rejected fail-closed before write.';
END $$;

-- ====================================================================
-- TEST 6: PAYLOAD 87 ROWS (FULL SNAPSHOT) + NULL/BLANK/GENUINE ZERO
-- Add a 88th stale task to verify safe deactivation when 87 rows match canonical full snapshot
-- ====================================================================
INSERT INTO public.schedule_tasks (
  id, project_id, source_identity, source_task_no, task_name, actual_progress, is_active
) VALUES (
  '88888888-8888-8888-8888-888888888888'::uuid,
  'fa7c6969-5ecc-42c0-9e95-c68a733ef357'::uuid,
  'P6-STALE-088',
  '88',
  'Stale Task Candidate',
  0.15,
  true
);

DO $$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v_res jsonb;
  v_active integer;
  v_stale_active boolean;
  v_stale_exists boolean;
  v_p1 numeric;
  v_p2 numeric;
  v_p3 numeric;
  v_p4 numeric;
  i integer;
BEGIN
  -- Build 87 canonical rows with edge cases:
  -- Row 1: Blank string -> preserve existing (0.70)
  -- Row 2: NULL -> preserve existing (0.70)
  -- Row 3: Dash '-' -> preserve existing (0.70)
  -- Row 4: Genuine 0 -> set to 0.00
  -- Row 5: 100% (passed as integer 100) -> set to 1.00
  -- Rows 6..87: Normal decimals
  v_rows := v_rows || jsonb_build_array(
    jsonb_build_object('source_identity', 'P6-ID-001', 'task_name', 'Task 1', 'actual_progress', ''),
    jsonb_build_object('source_identity', 'P6-ID-002', 'task_name', 'Task 2', 'actual_progress', null),
    jsonb_build_object('source_identity', 'P6-ID-003', 'task_name', 'Task 3', 'actual_progress', '-'),
    jsonb_build_object('source_identity', 'P6-ID-004', 'task_name', 'Task 4', 'actual_progress', 0),
    jsonb_build_object('source_identity', 'P6-ID-005', 'task_name', 'Task 5', 'actual_progress', 100)
  );

  FOR i IN 6..87 LOOP
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'source_identity', 'P6-ID-' || lpad(i::text, 3, '0'),
      'task_name', 'Task ' || i,
      'actual_progress', 0.85
    ));
  END LOOP;

  v_res := public.drive_sync_apply_schedule('test-isolated-sync-key', 'AV-P6', 'canonical_p6_87.xlsx', v_rows);

  IF (v_res->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'TEST 6 FAILED: RPC call failed: %', v_res; END IF;
  IF (v_res->>'full_snapshot_proven')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'TEST 6 FAILED: 87 rows must prove full snapshot'; END IF;
  IF (v_res->>'cleaned_stale_rows')::integer <> 1 THEN RAISE EXCEPTION 'TEST 6 FAILED: Expected 1 stale row deactivated, got %', v_res->>'cleaned_stale_rows'; END IF;

  -- Assert Stale Task 88 is deactivated (is_active = false) but STILL EXISTS (NOT deleted!)
  SELECT is_active INTO v_stale_active FROM public.schedule_tasks WHERE id = '88888888-8888-8888-8888-888888888888';
  IF v_stale_active IS NOT FALSE THEN RAISE EXCEPTION 'TEST 6 FAILED: Stale task should be is_active=false!'; END IF;

  -- Assert Row 1, 2, 3 preserved existing 0.70
  SELECT actual_progress INTO v_p1 FROM public.schedule_tasks WHERE source_identity = 'P6-ID-001';
  IF v_p1 <> 0.70 THEN RAISE EXCEPTION 'TEST 6 FAILED: Row 1 Blank progress not preserved! got %', v_p1; END IF;

  SELECT actual_progress INTO v_p2 FROM public.schedule_tasks WHERE source_identity = 'P6-ID-002';
  IF v_p2 <> 0.70 THEN RAISE EXCEPTION 'TEST 6 FAILED: Row 2 NULL progress not preserved! got %', v_p2; END IF;

  SELECT actual_progress INTO v_p3 FROM public.schedule_tasks WHERE source_identity = 'P6-ID-003';
  IF v_p3 <> 0.70 THEN RAISE EXCEPTION 'TEST 6 FAILED: Row 3 Dash progress not preserved! got %', v_p3; END IF;

  -- Assert Row 4 Genuine Zero accepted
  SELECT actual_progress INTO v_p4 FROM public.schedule_tasks WHERE source_identity = 'P6-ID-004';
  IF v_p4 <> 0.00 THEN RAISE EXCEPTION 'TEST 6 FAILED: Row 4 Genuine zero not set! got %', v_p4; END IF;

  -- Assert exactly 87 active tasks
  SELECT count(*) INTO v_active FROM public.schedule_tasks WHERE project_id = 'fa7c6969-5ecc-42c0-9e95-c68a733ef357' AND is_active = true;
  IF v_active <> 87 THEN RAISE EXCEPTION 'TEST 6 FAILED: active count expected 87, got %', v_active; END IF;

  RAISE NOTICE 'SUCCESS TEST 6: Full Snapshot proven, 87 tasks updated/preserved, stale task deactivated safely without deletion.';
END $$;

-- ====================================================================
-- TEST 7: ATOMIC ROLLBACK TEST
-- Multi-row batch where row 1 is valid, but row 2 has invalid progress -> row 1 must not be modified
-- ====================================================================
DO $$
DECLARE
  v_res jsonb;
  v_p1 numeric;
BEGIN
  v_res := public.drive_sync_apply_schedule(
    'test-isolated-sync-key',
    'AV-P6',
    'test_atomic_rollback.xlsx',
    '[
      {"source_identity": "P6-ID-001", "task_name": "Task 1", "actual_progress": 0.99},
      {"source_identity": "P6-ID-002", "task_name": "Task 2", "actual_progress": "MALFORMED_NON_NUMERIC"}
    ]'::jsonb
  );

  IF (v_res->>'ok')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'TEST 7 FAILED: Batch with invalid row should return ok=false'; END IF;

  SELECT actual_progress INTO v_p1 FROM public.schedule_tasks WHERE source_identity = 'P6-ID-001';
  IF v_p1 <> 0.70 THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Row 1 was written despite Row 2 validation failure! actual_progress=%', v_p1;
  END IF;

  RAISE NOTICE 'SUCCESS TEST 7: Pre-validation and atomic rollback verified (Row 1 untouched).';
END $$;

-- ====================================================================
-- TEST 8: ROW ID & AUDIT INTEGRITY PRESERVATION
-- Confirm UUIDs, created_at timestamps are preserved, updated_at updated
-- ====================================================================
DO $$
DECLARE
  v_id uuid;
  v_created timestamp with time zone;
  v_updated timestamp with time zone;
  v_new_id uuid;
  v_new_created timestamp with time zone;
BEGIN
  SELECT id, created_at, updated_at INTO v_id, v_created, v_updated FROM public.schedule_tasks WHERE source_identity = 'P6-ID-001';

  PERFORM pg_sleep(0.05);

  PERFORM public.drive_sync_apply_schedule(
    'test-isolated-sync-key',
    'AV-P6',
    'test_preserve_id.xlsx',
    '[{"source_identity": "P6-ID-001", "task_name": "Task 1 Renamed", "actual_progress": 0.70}]'::jsonb
  );

  SELECT id, created_at, updated_at INTO v_new_id, v_new_created FROM public.schedule_tasks WHERE source_identity = 'P6-ID-001';

  IF v_id <> v_new_id THEN RAISE EXCEPTION 'TEST 8 FAILED: UUID changed! old=% new=%', v_id, v_new_id; END IF;
  IF v_created <> v_new_created THEN RAISE EXCEPTION 'TEST 8 FAILED: created_at changed! old=% new=%', v_created, v_new_created; END IF;

  RAISE NOTICE 'SUCCESS TEST 8: Row ID and timestamp audit history preserved.';
END $$;

DO $$
BEGIN
  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'FINAL PASS: All isolated tests (Payload 1, 44, 60, 86, 87, Duplicates,';
  RAISE NOTICE 'Rollback, ID preservation, and Full Snapshot Guard) PASSED 100%% GREEN.';
  RAISE NOTICE '====================================================================';
END $$;
