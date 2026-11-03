-- 3 Kings Construction: Surgical SQL Migration
-- Function: public.drive_sync_apply_schedule
-- Purpose: Preserve existing actual_progress when incoming source is NULL / Blank / '-',
--          accept genuine 0%, fail closed on new tasks without progress,
--          fail closed on invalid numeric formats, ensure atomic validation before write,
--          safely protect against accidental partial-payload bulk deactivation (Full Snapshot contract),
--          and deactivate stale active tasks safely without dropping existing history or IDs.
-- Version: 3.2.4

CREATE OR REPLACE FUNCTION public.drive_sync_apply_schedule(
  p_sync_key text,
  p_project_code text,
  p_source_file text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_project_id uuid;
  v_count integer := 0;
  v_written integer := 0;
  v_deactivated integer := 0;
  v_existing_active_count integer := 0;
  v_active_identities text[] := ARRAY[]::text[];
  r jsonb;
  v_identity text;
  v_existing_id uuid;
  v_existing_progress numeric;
  v_actual_progress numeric;
  v_incoming_raw text;
  v_numeric_val numeric;
BEGIN
  -- 1. Sync Key Authorization
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_sync_key');
  END IF;

  -- 2. Project Resolution
  SELECT p.id INTO v_project_id
  FROM public.projects p
  WHERE p.code = p_project_code AND p.active = true;

  IF v_project_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'project_not_found', 'project', p_project_code);
  END IF;

  -- 3. Array Payload Validation
  IF jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_schedule_rows', 'project', p_project_code);
  END IF;

  -- Count current active tasks for deactivation threshold safety
  SELECT count(*) INTO v_existing_active_count
  FROM public.schedule_tasks
  WHERE project_id = v_project_id AND is_active = true;

  -- 4. Pass 1: Strict Pre-Validation (Validate ALL rows before performing any DML)
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_identity := btrim(coalesce(r->>'source_identity', ''));
    IF v_identity = '' OR v_identity IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'source_identity_missing',
        'project', p_project_code,
        'version', '3.2.4'
      );
    END IF;

    -- Pre-validate actual_progress format & new task requirements
    v_incoming_raw := r->>'actual_progress';
    IF v_incoming_raw IS NULL
       OR btrim(v_incoming_raw) = ''
       OR btrim(v_incoming_raw) = '-' THEN
      -- Must exist in schedule_tasks, otherwise fail closed
      IF NOT EXISTS (
        SELECT 1 FROM public.schedule_tasks s
        WHERE s.project_id = v_project_id AND s.source_identity = v_identity
      ) THEN
        RAISE EXCEPTION 'NEW_TASK_PROGRESS_REQUIRED: source_identity=%', v_identity;
      END IF;
    ELSE
      BEGIN
        v_numeric_val := v_incoming_raw::numeric;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_ACTUAL_PROGRESS: identity=% value=%', v_identity, v_incoming_raw;
      END;

      IF v_numeric_val < 0::numeric OR v_numeric_val > 100::numeric THEN
        RAISE EXCEPTION 'OUT_OF_BOUNDS_ACTUAL_PROGRESS: identity=% value=%', v_identity, v_numeric_val;
      END IF;
    END IF;
  END LOOP;

  -- 5. Pass 2: Process Rows Transactionally
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_identity := btrim(coalesce(r->>'source_identity', ''));
    v_count := v_count + 1;
    v_active_identities := array_append(v_active_identities, v_identity);

    -- Find existing task
    SELECT s.id, s.actual_progress
    INTO v_existing_id, v_existing_progress
    FROM public.schedule_tasks s
    WHERE s.project_id = v_project_id
      AND s.source_identity = v_identity;

    -- Process actual_progress
    v_incoming_raw := r->>'actual_progress';

    IF v_incoming_raw IS NULL
       OR btrim(v_incoming_raw) = ''
       OR btrim(v_incoming_raw) = '-' THEN
      -- Existing progress is preserved
      v_actual_progress := coalesce(v_existing_progress, 0::numeric);
    ELSE
      v_numeric_val := v_incoming_raw::numeric;
      IF v_numeric_val > 1::numeric AND v_numeric_val <= 100::numeric THEN
        v_actual_progress := round(v_numeric_val / 100::numeric, 6);
      ELSE
        v_actual_progress := round(greatest(0::numeric, least(1::numeric, v_numeric_val)), 6);
      END IF;
    END IF;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.schedule_tasks
      SET
        source_task_no = nullif(btrim(coalesce(r->>'source_task_no', '')), ''),
        category = nullif(btrim(coalesce(r->>'category', '')), ''),
        task_name = coalesce(nullif(btrim(coalesce(r->>'task_name', '')), ''), 'Unnamed task'),
        area = nullif(btrim(coalesce(r->>'area', '')), ''),
        planned_duration_days = nullif(r->>'planned_duration_days', '')::integer,
        planned_start = nullif(r->>'planned_start', '')::date,
        planned_end = nullif(r->>'planned_end', '')::date,
        baseline_progress = nullif(r->>'baseline_progress', '')::numeric,
        imported_plan_progress = nullif(r->>'imported_plan_progress', '')::numeric,
        actual_progress = v_actual_progress,
        plan_status = nullif(btrim(coalesce(r->>'plan_status', '')), ''),
        site_status = nullif(btrim(coalesce(r->>'site_status', '')), ''),
        actual_start = nullif(r->>'actual_start', '')::date,
        actual_end = nullif(r->>'actual_end', '')::date,
        responsible_person = nullif(btrim(coalesce(r->>'responsible_person', '')), ''),
        contractor = nullif(btrim(coalesce(r->>'contractor', '')), ''),
        inspection_point = nullif(btrim(coalesce(r->>'inspection_point', '')), ''),
        required_evidence = nullif(btrim(coalesce(r->>'required_evidence', '')), ''),
        inspection_type = nullif(btrim(coalesce(r->>'inspection_type', '')), ''),
        inspection_result = nullif(btrim(coalesce(r->>'inspection_result', '')), ''),
        inspection_date = nullif(r->>'inspection_date', '')::date,
        blocker = nullif(btrim(coalesce(r->>'blocker', '')), ''),
        next_action = nullif(btrim(coalesce(r->>'next_action', '')), ''),
        target_close = nullif(r->>'target_close', '')::date,
        defect_ref = nullif(btrim(coalesce(r->>'defect_ref', '')), ''),
        evidence_link = nullif(btrim(coalesce(r->>'evidence_link', '')), ''),
        source_updated_at = nullif(r->>'source_updated_at', '')::date,
        notes = nullif(btrim(coalesce(r->>'notes', '')), ''),
        source_file = coalesce(nullif(btrim(coalesce(r->>'source_file', '')), ''), p_source_file),
        source_sheet = nullif(btrim(coalesce(r->>'source_sheet', '')), ''),
        source_row = nullif(r->>'source_row', '')::integer,
        is_active = true,
        updated_at = now()
      WHERE id = v_existing_id;
    ELSE
      INSERT INTO public.schedule_tasks (
        project_id, source_identity, source_task_no, category, task_name,
        area, planned_duration_days, planned_start, planned_end,
        baseline_progress, imported_plan_progress, actual_progress,
        plan_status, site_status, actual_start, actual_end,
        responsible_person, contractor, inspection_point, required_evidence,
        inspection_type, inspection_result, inspection_date,
        blocker, next_action, target_close, defect_ref, evidence_link,
        source_updated_at, notes, source_file, source_sheet, source_row,
        is_active, created_at, updated_at
      ) VALUES (
        v_project_id,
        v_identity,
        nullif(btrim(coalesce(r->>'source_task_no', '')), ''),
        nullif(btrim(coalesce(r->>'category', '')), ''),
        coalesce(nullif(btrim(coalesce(r->>'task_name', '')), ''), 'Unnamed task'),
        nullif(btrim(coalesce(r->>'area', '')), ''),
        nullif(r->>'planned_duration_days', '')::integer,
        nullif(r->>'planned_start', '')::date,
        nullif(r->>'planned_end', '')::date,
        nullif(r->>'baseline_progress', '')::numeric,
        nullif(r->>'imported_plan_progress', '')::numeric,
        v_actual_progress,
        nullif(btrim(coalesce(r->>'plan_status', '')), ''),
        nullif(btrim(coalesce(r->>'site_status', '')), ''),
        nullif(r->>'actual_start', '')::date,
        nullif(r->>'actual_end', '')::date,
        nullif(btrim(coalesce(r->>'responsible_person', '')), ''),
        nullif(btrim(coalesce(r->>'contractor', '')), ''),
        nullif(btrim(coalesce(r->>'inspection_point', '')), ''),
        nullif(btrim(coalesce(r->>'required_evidence', '')), ''),
        nullif(btrim(coalesce(r->>'inspection_type', '')), ''),
        nullif(btrim(coalesce(r->>'inspection_result', '')), ''),
        nullif(r->>'inspection_date', '')::date,
        nullif(btrim(coalesce(r->>'blocker', '')), ''),
        nullif(btrim(coalesce(r->>'next_action', '')), ''),
        nullif(r->>'target_close', '')::date,
        nullif(btrim(coalesce(r->>'defect_ref', '')), ''),
        nullif(btrim(coalesce(r->>'evidence_link', '')), ''),
        nullif(r->>'source_updated_at', '')::date,
        nullif(btrim(coalesce(r->>'notes', '')), ''),
        coalesce(nullif(btrim(coalesce(r->>'source_file', '')), ''), p_source_file),
        nullif(btrim(coalesce(r->>'source_sheet', '')), ''),
        nullif(r->>'source_row', '')::integer,
        true, now(), now()
      );
    END IF;

    v_written := v_written + 1;
  END LOOP;

  -- 6. Stale Task Deactivation (Full Snapshot Contract Safeguard)
  -- Accidental partial payloads MUST NOT deactivate the rest of the project.
  -- Only deactivate if incoming payload meets full snapshot threshold (at least 50% of existing active tasks)
  IF v_existing_active_count = 0 OR v_count >= ceil(v_existing_active_count * 0.5) THEN
    UPDATE public.schedule_tasks
    SET is_active = false, updated_at = now()
    WHERE project_id = v_project_id
      AND is_active = true
      AND source_identity IS NOT NULL
      AND NOT (source_identity = ANY(v_active_identities));

    GET DIAGNOSTICS v_deactivated = ROW_COUNT;
  ELSE
    -- Under-threshold partial payload: protect existing tasks from deactivation
    v_deactivated := 0;
  END IF;

  -- 7. Record Sync Run
  INSERT INTO public.drive_sync_runs (
    sync_type, project_code, source_file, source_sheet,
    rows_read, rows_written, status, message
  ) VALUES (
    'schedule', p_project_code, p_source_file, null,
    v_count, v_written, 'success',
    format('Schedule sync: %s rows processed, %s deactivated', v_count, v_deactivated)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'rows', v_written,
    'project', p_project_code,
    'version', '3.2.4',
    'source_file', p_source_file,
    'cleaned_stale_rows', v_deactivated
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.drive_sync_runs (
    sync_type, project_code, source_file, source_sheet,
    rows_read, rows_written, status, message
  ) VALUES (
    'schedule', p_project_code, p_source_file, null,
    coalesce(v_count, 0), 0, 'error', SQLERRM
  );
  RETURN jsonb_build_object(
    'ok', false,
    'project', p_project_code,
    'error', SQLERRM,
    'version', '3.2.4'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.drive_sync_apply_schedule(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drive_sync_apply_schedule(text, text, text, jsonb) TO anon, service_role;
