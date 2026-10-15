-- Work Order completion is per Work ID; never modifies Defect Flow or hotel status.
ALTER TABLE public.defect_work_order_snapshot
  ADD COLUMN IF NOT EXISTS web_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS web_completed_by uuid,
  ADD COLUMN IF NOT EXISTS writeback_state text,
  ADD COLUMN IF NOT EXISTS writeback_error text;
CREATE INDEX IF NOT EXISTS defect_work_order_writeback_pending_idx
  ON public.defect_work_order_snapshot(writeback_state,web_completed_at)
  WHERE writeback_state IN ('pending','error');

CREATE OR REPLACE FUNCTION public.defect_work_order_complete(p_work_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_role text;
  v_row public.defect_work_order_snapshot%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','AUTH_REQUIRED');
  END IF;
  SELECT p.role INTO v_role FROM public.profiles p
    WHERE p.user_id=(SELECT auth.uid()) AND p.active IS TRUE;
  IF v_role IS NULL
    OR v_role NOT IN ('manager','admin','engineer','payroll','viewer_editor')
    OR NOT private.matrix_allowed(
      'defect','manage',
      v_role='viewer_editor' OR (v_role='manager'
        AND (SELECT auth.uid())='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid)
    ) THEN
    RETURN jsonb_build_object('ok',false,'error','FORBIDDEN');
  END IF;
  IF coalesce(p_work_id,'') !~ '^DF-[A-Za-z0-9()_-]+$' THEN
    RETURN jsonb_build_object('ok',false,'error','INVALID_WORK_ID');
  END IF;
  SELECT * INTO v_row FROM public.defect_work_order_snapshot
    WHERE work_id=p_work_id AND source_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','WORK_ID_NOT_FOUND');
  END IF;
  IF v_row.web_completed_at IS NOT NULL OR v_row.work_status ~ 'เสร็จแล้ว|งดแจก|ยกเลิก' THEN
    RETURN jsonb_build_object('ok',false,'error','ALREADY_COMPLETED');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM regexp_matches(v_row.room_group,'[AB][0-9]{3}','g') m(token)
  ) OR EXISTS (
    SELECT 1 FROM regexp_matches(v_row.room_group,'[AB][0-9]{3}','g') m(token)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.condo_room_status c
      WHERE c.room_no=m.token[1] AND c.status_group='Hotel - Incomplete'
    )
  ) THEN
    RETURN jsonb_build_object('ok',false,'error','DEFECT_ROOM_STATUS_CHANGED');
  END IF;
  UPDATE public.defect_work_order_snapshot
    SET work_status='เสร็จแล้ว',
        web_completed_at=now(),web_completed_by=(SELECT auth.uid()),
        writeback_state='pending',writeback_error=NULL
    WHERE work_id=p_work_id;
  RETURN jsonb_build_object('ok',true,'work_id',p_work_id,'writeback','pending');
END;
$fn$;
REVOKE ALL ON FUNCTION public.defect_work_order_complete(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.defect_work_order_complete(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.defect_work_order_writeback_pull(
  p_sync_key text,p_limit integer DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_sync_key');
  END IF;
  RETURN jsonb_build_object('ok',true,'rows',coalesce((
    SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT work_id,web_completed_at
      FROM public.defect_work_order_snapshot
      WHERE web_completed_at IS NOT NULL AND writeback_state IN ('pending','error')
      ORDER BY web_completed_at,work_id
      LIMIT greatest(1,least(coalesce(p_limit,10),20))
    ) x
  ),'[]'::jsonb));
END;
$fn$;
CREATE OR REPLACE FUNCTION public.defect_work_order_writeback_ack(
  p_sync_key text,p_work_id text,p_completed_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_count integer;
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_sync_key');
  END IF;
  UPDATE public.defect_work_order_snapshot
    SET writeback_state='synced',writeback_error=NULL
    WHERE work_id=p_work_id AND web_completed_at=p_completed_at
      AND writeback_state IN ('pending','error');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('ok',v_count=1,'count',v_count);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.defect_work_order_writeback_fail(
  p_sync_key text,p_work_id text,p_completed_at timestamptz,p_error text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_count integer;
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_sync_key');
  END IF;
  UPDATE public.defect_work_order_snapshot
    SET writeback_state='error',writeback_error=left(coalesce(p_error,'Unknown error'),500)
    WHERE work_id=p_work_id AND web_completed_at=p_completed_at
      AND writeback_state IN ('pending','error');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('ok',v_count=1,'count',v_count);
END;
$fn$;
REVOKE ALL ON FUNCTION public.defect_work_order_writeback_pull(text,integer) FROM PUBLIC,authenticated,anon;
REVOKE ALL ON FUNCTION public.defect_work_order_writeback_ack(text,text,timestamptz) FROM PUBLIC,authenticated,anon;
REVOKE ALL ON FUNCTION public.defect_work_order_writeback_fail(text,text,timestamptz,text) FROM PUBLIC,authenticated,anon;
GRANT EXECUTE ON FUNCTION public.defect_work_order_writeback_pull(text,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.defect_work_order_writeback_ack(text,text,timestamptz) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.defect_work_order_writeback_fail(text,text,timestamptz,text) TO anon,authenticated;
