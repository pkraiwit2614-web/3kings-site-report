-- Defect Web App -> approved Excel files durable outbound queue.
-- Existing defect_web_overrides is populated by the verified manual-edit trigger.
-- The queue is not a second room-status source and cannot overwrite other files.
ALTER TABLE public.defect_web_overrides
  ADD COLUMN IF NOT EXISTS writeback_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS writeback_last_error text,
  ADD COLUMN IF NOT EXISTS writeback_attempt_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.defect_writeback_pull(
  p_sync_key text,
  p_limit integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RAISE EXCEPTION 'INVALID_SYNC_KEY';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'room_no', x.room_no,
    'revision', x.updated_at,
    'current_status', x.current_status,
    'status_group', x.status_group,
    'next_action', x.next_action,
    'defect_detail', x.defect_detail,
    'latest_source', x.latest_source,
    'source_note', x.source_note,
    'hotel_participation', x.hotel_participation,
    'customer_status', x.customer_status,
    'attempts', x.attempts
  ) ORDER BY x.updated_at, x.room_no), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT c.room_no, ov.updated_at, c.current_status, c.status_group,
           c.next_action, c.defect_detail, c.latest_source, c.source_note,
           c.hotel_participation, c.customer_status,
           ov.writeback_attempt_count as attempts
    FROM public.defect_web_overrides ov
    JOIN public.condo_room_status c ON c.room_no = ov.room_no
    WHERE ov.source_sync_state = 'pending'
    ORDER BY ov.updated_at, ov.room_no
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 25)
  ) x;
  RETURN jsonb_build_object('ok', true, 'rows', v_result);
END; $$;

CREATE OR REPLACE FUNCTION public.defect_writeback_ack(
  p_sync_key text,
  p_room_no text,
  p_revision timestamptz,
  p_master_file_id text,
  p_overview_file_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated int := 0;
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RAISE EXCEPTION 'INVALID_SYNC_KEY';
  END IF;
  IF p_master_file_id IS DISTINCT FROM '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj'
     OR p_overview_file_id IS DISTINCT FROM '16JuK26rn7HGPDtSlnMMS2aljYGWyn0Y3' THEN
    RAISE EXCEPTION 'INVALID_WRITEBACK_TARGET';
  END IF;
  UPDATE public.defect_web_overrides
  SET source_sync_state = 'synced',
      source_synced_at = now(),
      writeback_last_attempt_at = now(),
      writeback_last_error = NULL
  WHERE room_no = upper(btrim(p_room_no))
    AND updated_at = p_revision
    AND source_sync_state = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  -- If a newer edit happened while Excel was being written, do NOT acknowledge.
  RETURN jsonb_build_object('ok', v_updated = 1,
    'result', CASE WHEN v_updated = 1 THEN 'both_excel_files_verified' ELSE 'stale_revision_retry' END);
END; $$;

CREATE OR REPLACE FUNCTION public.defect_writeback_failure(
  p_sync_key text,
  p_room_no text,
  p_revision timestamptz,
  p_error text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated int := 0;
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RAISE EXCEPTION 'INVALID_SYNC_KEY';
  END IF;
  UPDATE public.defect_web_overrides
  SET writeback_last_attempt_at = now(),
      writeback_attempt_count = writeback_attempt_count + 1,
      writeback_last_error = left(coalesce(p_error, 'unknown'), 500)
  WHERE room_no = upper(btrim(p_room_no)) AND updated_at = p_revision
    AND source_sync_state = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated = 1);
END; $$;

CREATE OR REPLACE FUNCTION public.defect_writeback_status(p_room_no text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user uuid := (SELECT auth.uid());
DECLARE v_row public.defect_web_overrides%ROWTYPE;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = v_user AND p.active = true
      AND ((p.user_id = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager')
           OR p.role IN ('defect_editor','viewer_editor'))
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_DEFECT_EDIT';
  END IF;
  SELECT * INTO v_row FROM public.defect_web_overrides
  WHERE room_no = upper(btrim(p_room_no));
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'not_queued'); END IF;
  RETURN jsonb_build_object(
    'state', v_row.source_sync_state,
    'room_no', v_row.room_no,
    'revision', v_row.updated_at,
    'verified_at', v_row.source_synced_at,
    'attempts', v_row.writeback_attempt_count,
    'last_error', v_row.writeback_last_error);
END; $$;

REVOKE ALL ON FUNCTION public.defect_writeback_pull(text,integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.defect_writeback_ack(text,text,timestamptz,text,text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.defect_writeback_failure(text,text,timestamptz,text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.defect_writeback_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.defect_writeback_pull(text,integer) TO anon,service_role;
GRANT EXECUTE ON FUNCTION public.defect_writeback_ack(text,text,timestamptz,text,text) TO anon,service_role;
GRANT EXECUTE ON FUNCTION public.defect_writeback_failure(text,text,timestamptz,text) TO anon,service_role;
GRANT EXECUTE ON FUNCTION public.defect_writeback_status(text) TO authenticated;
