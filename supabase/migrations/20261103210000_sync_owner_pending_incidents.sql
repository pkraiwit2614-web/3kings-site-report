-- 3 Kings owner Sync pending incident tracking ledger.
-- Separate from existing Daily LINE ledger and sync_owner_deliveries.
-- STAGED migration: do NOT apply to Production until isolated PostgreSQL + SOP 16 QA.
BEGIN;

CREATE SCHEMA IF NOT EXISTS line_autopilot;

CREATE TABLE IF NOT EXISTS line_autopilot.sync_owner_pending_incidents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pipeline text NOT NULL CHECK (pipeline IN
    ('defects','materials','schedule','photos','work_order','hotel_work_plan',
     'express','daily_site_report')),
  source_file_id text NOT NULL,
  original_run_key text NOT NULL CHECK (original_run_key ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  first_detected_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  missing_evidence text NOT NULL CHECK (char_length(missing_evidence) BETWEEN 4 AND 1000),
  next_round_due_at timestamptz,
  schedule_verified boolean NOT NULL DEFAULT false,
  alert_status text NOT NULL DEFAULT 'pending'
    CHECK (alert_status IN ('pending', 'overdue_alerted', 'resolved', 'quarantined')),
  resolved_at timestamptz,
  resolution_evidence text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (pipeline, original_run_key)
);

ALTER TABLE line_autopilot.sync_owner_pending_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE line_autopilot.sync_owner_pending_incidents
  FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA line_autopilot TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON line_autopilot.sync_owner_pending_incidents TO service_role;

CREATE OR REPLACE FUNCTION public.line_sync_owner_record_pending(
  p_pipeline text,
  p_source_file_id text,
  p_original_run_key text,
  p_missing_evidence text,
  p_next_round_due_at timestamptz,
  p_schedule_verified boolean
)
RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $$
DECLARE
  v_id bigint;
  v_status text;
BEGIN
  IF p_pipeline IS NULL OR p_pipeline NOT IN
    ('defects','materials','schedule','photos','work_order','hotel_work_plan',
     'express','daily_site_report')
  OR p_source_file_id IS NULL OR char_length(p_source_file_id) < 1
  OR p_original_run_key IS NULL OR p_original_run_key !~ '^[A-Za-z0-9_.:-]{1,160}$'
  OR p_missing_evidence IS NULL OR char_length(p_missing_evidence) NOT BETWEEN 4 AND 1000 THEN
    RAISE EXCEPTION 'Invalid owner pending incident parameters' USING errcode='22023';
  END IF;

  SELECT d.id, d.alert_status INTO v_id, v_status
  FROM line_autopilot.sync_owner_pending_incidents d
  WHERE d.pipeline = p_pipeline AND d.original_run_key = p_original_run_key;

  IF v_id IS NULL THEN
    INSERT INTO line_autopilot.sync_owner_pending_incidents
      (pipeline, source_file_id, original_run_key, missing_evidence, next_round_due_at, schedule_verified, alert_status)
    VALUES
      (p_pipeline, p_source_file_id, p_original_run_key, p_missing_evidence, p_next_round_due_at, coalesce(p_schedule_verified, false), 'pending')
    RETURNING line_autopilot.sync_owner_pending_incidents.id INTO v_id;
    RETURN v_id;
  END IF;

  -- If already resolved, do not reopen without explicit new run key
  IF v_status = 'resolved' THEN
    RETURN v_id;
  END IF;

  UPDATE line_autopilot.sync_owner_pending_incidents d
  SET missing_evidence = p_missing_evidence,
      next_round_due_at = coalesce(p_next_round_due_at, d.next_round_due_at),
      schedule_verified = coalesce(p_schedule_verified, d.schedule_verified),
      updated_at = pg_catalog.now()
  WHERE d.id = v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.line_sync_owner_record_pending(text,text,text,text,timestamptz,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.line_sync_owner_record_pending(text,text,text,text,timestamptz,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.line_sync_owner_resolve_pending(
  p_pipeline text,
  p_original_run_key text,
  p_resolution_evidence text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  IF p_pipeline IS NULL OR p_original_run_key IS NULL THEN
    RAISE EXCEPTION 'Invalid resolution parameters' USING errcode='22023';
  END IF;

  UPDATE line_autopilot.sync_owner_pending_incidents d
  SET alert_status = 'resolved',
      resolved_at = pg_catalog.now(),
      resolution_evidence = coalesce(p_resolution_evidence, 'Verified resolved'),
      updated_at = pg_catalog.now()
  WHERE d.pipeline = p_pipeline
    AND d.original_run_key = p_original_run_key
    AND d.alert_status <> 'resolved';

  v_updated := FOUND;
  RETURN v_updated;
END $$;

REVOKE ALL ON FUNCTION public.line_sync_owner_resolve_pending(text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.line_sync_owner_resolve_pending(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.line_sync_owner_mark_overdue(
  p_pipeline text,
  p_original_run_key text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  IF p_pipeline IS NULL OR p_original_run_key IS NULL THEN
    RAISE EXCEPTION 'Invalid overdue marker parameters' USING errcode='22023';
  END IF;

  UPDATE line_autopilot.sync_owner_pending_incidents d
  SET alert_status = 'overdue_alerted',
      updated_at = pg_catalog.now()
  WHERE d.pipeline = p_pipeline
    AND d.original_run_key = p_original_run_key
    AND d.alert_status = 'pending';

  v_updated := FOUND;
  RETURN v_updated;
END $$;

REVOKE ALL ON FUNCTION public.line_sync_owner_mark_overdue(text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.line_sync_owner_mark_overdue(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.line_sync_owner_get_pending(
  p_pipeline text DEFAULT NULL
)
RETURNS TABLE(
  id bigint,
  pipeline text,
  source_file_id text,
  original_run_key text,
  first_detected_at timestamptz,
  missing_evidence text,
  next_round_due_at timestamptz,
  schedule_verified boolean,
  alert_status text
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT d.id, d.pipeline, d.source_file_id, d.original_run_key,
         d.first_detected_at, d.missing_evidence, d.next_round_due_at,
         d.schedule_verified, d.alert_status
  FROM line_autopilot.sync_owner_pending_incidents d
  WHERE (p_pipeline IS NULL OR d.pipeline = p_pipeline)
    AND d.alert_status IN ('pending', 'overdue_alerted')
  ORDER BY d.first_detected_at ASC;
END $$;

REVOKE ALL ON FUNCTION public.line_sync_owner_get_pending(text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.line_sync_owner_get_pending(text) TO service_role;

COMMIT;
