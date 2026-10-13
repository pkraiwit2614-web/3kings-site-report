-- Applied and verified in production on 2026-10-13. Idempotent source-of-truth migration.
-- Scope: defect_manual_update_apply_checked
CREATE OR REPLACE FUNCTION public.defect_manual_update_apply_checked(p_room_no text, p_detail_text text, p_current_status text, p_status_group text, p_next_action text, p_client_session_id uuid, p_user_agent text, p_expected_source_modified_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_room text := upper(replace(btrim(coalesce(p_room_no,'')),' ',''));
  v_current_stamp timestamptz;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_expected_source_modified_at IS NULL THEN
    RAISE EXCEPTION 'DEFECT_REVISION_REQUIRED_LOAD_ROOM';
  END IF;
  SELECT r.source_modified_at INTO v_current_stamp
  FROM public.condo_room_status r WHERE r.room_no=v_room FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  IF v_current_stamp IS DISTINCT FROM p_expected_source_modified_at THEN
    RAISE EXCEPTION 'DEFECT_REVISION_CONFLICT_REFRESH_ROOM';
  END IF;
  RETURN public.defect_manual_update_apply(
    p_room_no,p_detail_text,p_current_status,p_status_group,
    p_next_action,p_client_session_id,p_user_agent);
END $function$

REVOKE ALL ON FUNCTION public.defect_manual_update_apply_checked(text,text,text,text,text,uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.defect_manual_update_apply_checked(text,text,text,text,text,uuid,text,timestamptz) TO authenticated;
