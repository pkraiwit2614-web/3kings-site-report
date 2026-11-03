\set ON_ERROR_STOP on
-- ====================================================================
-- Isolated PostgreSQL 17 Test Suite: Schedule RPC Preservation
-- Zero production dependencies, synthetic test database only.
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
-- SEED EXISTING TASKS
-- ====================================================================
INSERT INTO public.schedule_tasks (
  project_id, source_identity, source_task_no, task_name, actual_progress, is_active
) VALUES
  ('fa7c6969-5ecc-42c0-9e95-c68a733ef357'::uuid, 'P6-TASK-01', '1', 'Task 1 - Existing 75%', 0.75, true),
  ('fa7c6969-5ecc-42c0-9e95-c68a733ef357'::uuid, 'P6-TASK-02', '2', 'Task 2 - Existing 60%', 0.60, true),
  ('fa7c6969-5ecc-42c0-9e95-c68a733ef357'::uuid, 'P6-TASK-03', '3', 'Task 3 - Existing 50%', 0.50, true),
  ('fa7c6969-5ecc-42c0-9e95-c68a733ef357'::uuid, 'P6-TASK-04', '4', 'Task 4 - Existing 40%', 0.40, true),
  ('fa7c6969-5ecc-42c0-9e95-c68a733ef357'::uuid, 'P6-TASK-05', '5', 'Task 5 - Existing 65%', 0.65, true),
  ('fa7c6969-5ecc-42c0-9e95-c68a733ef357'::uuid, 'P6-TASK-06', '6', 'Task 6 - Existing 10%', 0.10, true),
  ('fa7c6969-5ecc-42c0-9e95-c68a733ef357'::uuid, 'P6-TASK-07', '7', 'Task 7 - Stale candidate', 0.30, true);

-- ====================================================================
-- TEST SUITE EXECUTION
-- ====================================================================

-- Test Batch: Valid rows preserving progress and updating genuine values
SELECT public.drive_sync_apply_schedule(
  'test-isolated-sync-key',
  'AV-P6',
  'test_p6_schedule.xlsx',
  '[
    {"source_identity": "P6-TASK-01", "task_name": "Task 1", "actual_progress": ""},
    {"source_identity": "P6-TASK-02", "task_name": "Task 2", "actual_progress": null},
    {"source_identity": "P6-TASK-03", "task_name": "Task 3", "actual_progress": "-"},
    {"source_identity": "P6-TASK-04", "task_name": "Task 4", "actual_progress": 0.55},
    {"source_identity": "P6-TASK-05", "task_name": "Task 5", "actual_progress": 0},
    {"source_identity": "P6-TASK-06", "task_name": "Task 6", "actual_progress": 1.00},
    {"source_identity": "P6-NEW-01",  "task_name": "New Task 1", "actual_progress": 0}
  ]'::jsonb
);

-- Assertions for Valid Batch
DO $$
DECLARE
  v_p1 numeric;
  v_p2 numeric;
  v_p3 numeric;
  v_p4 numeric;
  v_p5 numeric;
  v_p6 numeric;
  v_p_new numeric;
  v_p7_active boolean;
  v_p7_exists boolean;
BEGIN
  SELECT actual_progress INTO v_p1 FROM public.schedule_tasks WHERE source_identity = 'P6-TASK-01';
  IF v_p1 <> 0.75 THEN RAISE EXCEPTION 'ASSERTION_FAILED: Task 1 expected 0.75, got %', v_p1; END IF;

  SELECT actual_progress INTO v_p2 FROM public.schedule_tasks WHERE source_identity = 'P6-TASK-02';
  IF v_p2 <> 0.60 THEN RAISE EXCEPTION 'ASSERTION_FAILED: Task 2 expected 0.60, got %', v_p2; END IF;

  SELECT actual_progress INTO v_p3 FROM public.schedule_tasks WHERE source_identity = 'P6-TASK-03';
  IF v_p3 <> 0.50 THEN RAISE EXCEPTION 'ASSERTION_FAILED: Task 3 expected 0.50, got %', v_p3; END IF;

  SELECT actual_progress INTO v_p4 FROM public.schedule_tasks WHERE source_identity = 'P6-TASK-04';
  IF v_p4 <> 0.55 THEN RAISE EXCEPTION 'ASSERTION_FAILED: Task 4 expected 0.55, got %', v_p4; END IF;

  SELECT actual_progress INTO v_p5 FROM public.schedule_tasks WHERE source_identity = 'P6-TASK-05';
  IF v_p5 <> 0.00 THEN RAISE EXCEPTION 'ASSERTION_FAILED: Task 5 expected 0.00, got %', v_p5; END IF;

  SELECT actual_progress INTO v_p6 FROM public.schedule_tasks WHERE source_identity = 'P6-TASK-06';
  IF v_p6 <> 1.00 THEN RAISE EXCEPTION 'ASSERTION_FAILED: Task 6 expected 1.00, got %', v_p6; END IF;

  SELECT actual_progress INTO v_p_new FROM public.schedule_tasks WHERE source_identity = 'P6-NEW-01';
  IF v_p_new <> 0.00 THEN RAISE EXCEPTION 'ASSERTION_FAILED: New Task expected 0.00, got %', v_p_new; END IF;

  -- Verify stale task P6-TASK-07: MUST be is_active = false, NOT deleted!
  SELECT is_active INTO v_p7_active FROM public.schedule_tasks WHERE source_identity = 'P6-TASK-07';
  IF v_p7_active IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'ASSERTION_FAILED: Stale Task 7 should be deactivated (is_active=false)';
  END IF;

  RAISE NOTICE 'SUCCESS: All preservation, genuine zero, update, new row and deactivation assertions PASSED';
END $$;

-- Test Fail-Closed: Invalid numeric format must fail closed and return ok=false
DO $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.drive_sync_apply_schedule(
    'test-isolated-sync-key',
    'AV-P6',
    'test_invalid.xlsx',
    '[{"source_identity": "P6-TASK-01", "task_name": "Task 1", "actual_progress": "not-a-number"}]'::jsonb
  );
  IF (v_res->>'ok')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION_FAILED: Invalid progress string should return ok=false';
  END IF;
  RAISE NOTICE 'SUCCESS: Invalid progress format failed closed as expected: %', v_res->>'error';
END $$;

-- Test Fail-Closed: New task with blank/null progress must fail closed and return ok=false
DO $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.drive_sync_apply_schedule(
    'test-isolated-sync-key',
    'AV-P6',
    'test_new_blank.xlsx',
    '[{"source_identity": "P6-BRAND-NEW-WITHOUT-PROG", "task_name": "Brand New", "actual_progress": null}]'::jsonb
  );
  IF (v_res->>'ok')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'ASSERTION_FAILED: New task without progress should return ok=false';
  END IF;
  RAISE NOTICE 'SUCCESS: New task without progress failed closed as expected: %', v_res->>'error';
END $$;

-- Verify Task 1 actual_progress is still 0.75 (unmodified by failed transactions)
DO $$
DECLARE
  v_p1 numeric;
BEGIN
  SELECT actual_progress INTO v_p1 FROM public.schedule_tasks WHERE source_identity = 'P6-TASK-01';
  IF v_p1 <> 0.75 THEN RAISE EXCEPTION 'ASSERTION_FAILED: Task 1 progress was modified during failed transactions!'; END IF;
  RAISE NOTICE 'FINAL PASS: Isolated PostgreSQL 17 test suite completed with 100%% assertions green.';
END $$;
