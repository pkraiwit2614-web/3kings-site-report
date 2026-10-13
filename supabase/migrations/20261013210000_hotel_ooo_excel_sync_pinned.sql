
-- Hotel OOO/OOS only: source Excel is pinned by Drive file ID.
-- Applied live on 2026-10-13; historical Defect and 3Kings classification untouched.
ALTER TABLE public.hotel_room_availability
  ADD COLUMN IF NOT EXISTS hotel_remark text,
  ADD COLUMN IF NOT EXISTS source_sync_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS source_synced_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_writeback_last_error text,
  ADD COLUMN IF NOT EXISTS source_writeback_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_synced_status text,
  ADD COLUMN IF NOT EXISTS source_synced_start date,
  ADD COLUMN IF NOT EXISTS source_synced_end date,
  ADD COLUMN IF NOT EXISTS source_synced_reason text,
  ADD COLUMN IF NOT EXISTS source_synced_remark text;
CREATE TABLE IF NOT EXISTS public.hotel_room_source_map (
  room_no text PRIMARY KEY REFERENCES public.condo_room_status(room_no) ON DELETE RESTRICT,
  source_file_id text NOT NULL,source_sheet text NOT NULL DEFAULT 'Schedule',
  source_row integer NOT NULL, master_sheet text NOT NULL DEFAULT 'OOO_OOS_Master',
  master_row integer NOT NULL,original_room_no text NOT NULL,
  additional_alias text,source_imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_src_row_valid CHECK(source_row>=5 AND source_row<=271 AND master_row>=5 AND master_row<=267)
);
CREATE UNIQUE INDEX IF NOT EXISTS hotel_source_map_file_row_uidx ON public.hotel_room_source_map(source_file_id,source_row);
CREATE UNIQUE INDEX IF NOT EXISTS hotel_source_map_file_master_uidx ON public.hotel_room_source_map(source_file_id,master_row);
ALTER TABLE public.hotel_room_source_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_room_source_map FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hotel_room_source_map TO authenticated;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hotel_room_source_map' AND policyname='hotel_source_map_owner_read') THEN
    CREATE POLICY hotel_source_map_owner_read ON public.hotel_room_source_map FOR SELECT TO authenticated
    USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=(SELECT auth.uid())
      AND p.active=true AND p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager'));
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.hotel_room_availability_save(p_room_no text, p_status text, p_start_date date, p_end_date date, p_reason text, p_expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_room text := upper(regexp_replace(btrim(coalesce(p_room_no,'')),'[[:space:]-]','','g'));
  v_group text;
  v_prev integer;
  v_revision integer;
  v_display_name text;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true
    AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')
  ) THEN RAISE EXCEPTION 'ROOM_AVAILABILITY_EDIT_DENIED'; END IF;
  IF v_room ~ '^GOOD0?[1-5]$' THEN v_room := 'B10'||right(v_room,1); END IF;
  IF v_room !~ '^[AB][0-9]{3}$' THEN RAISE EXCEPTION 'INVALID_ROOM'; END IF;
  SELECT r.room_no INTO v_group FROM public.condo_room_status r WHERE r.room_no=v_room;
  IF v_group IS NULL THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  -- Hotel operational OOO/OOS does not depend on 3 Kings hotel_participation; inconsistencies belong in owner reconciliation.
  IF p_status NOT IN ('AVAILABLE','OOO','OOS') THEN RAISE EXCEPTION 'INVALID_AVAILABILITY_STATUS'; END IF;
  IF p_status IN ('OOO','OOS') AND (p_start_date IS NULL OR nullif(btrim(coalesce(p_reason,'')),'') IS NULL) THEN
    RAISE EXCEPTION 'START_DATE_AND_REASON_REQUIRED';
  END IF;
  IF p_end_date IS NOT NULL AND (p_start_date IS NULL OR p_end_date<p_start_date) THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
  IF char_length(coalesce(p_reason,''))>2000 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;
  SELECT a.revision INTO v_prev FROM public.hotel_room_availability a WHERE a.room_no=v_group FOR UPDATE;
  IF v_prev IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
  SELECT coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.username),''),'ผู้ใช้') INTO v_display_name
    FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true;
  IF v_prev IS NULL THEN
    INSERT INTO public.hotel_room_availability(room_no,availability_status,start_date,end_date,reason,updated_by,updated_by_name,source_sync_state)
    VALUES(v_group,p_status,CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_start_date END,
       CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_end_date END,
       nullif(btrim(coalesce(p_reason,'')),''),v_uid,coalesce(v_display_name,'ผู้ใช้'),'pending');
    v_revision:=1;
  ELSE
    UPDATE public.hotel_room_availability SET availability_status=p_status,
      start_date=CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_start_date END,
      end_date=CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_end_date END,
      reason=nullif(btrim(coalesce(p_reason,'')),''),
      updated_by=v_uid,updated_by_name=coalesce(v_display_name,'ผู้ใช้'),
      updated_at=now(),revision=revision+1,
      source_sync_state='pending',source_writeback_last_error=null
    WHERE room_no=v_group RETURNING revision INTO v_revision;
  END IF;
  INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
  VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-room-status','hotel_room_availability_save',v_group,
    jsonb_build_object('status',p_status,'members',(
      SELECT jsonb_agg(m.room_no ORDER BY m.room_no) FROM public.hotel_room_group_members m WHERE m.room_no=v_group
    ),'revision',v_revision));
  RETURN jsonb_build_object('room_no',v_group,'revision',v_revision,'status',p_status);
END $function$
;

CREATE OR REPLACE FUNCTION public.hotel_room_excel_writeback_ack(p_sync_key text, p_room_no text, p_revision integer, p_file_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count integer;
BEGIN
 IF NOT private.drive_sync_key_valid(p_sync_key) THEN RAISE EXCEPTION 'INVALID_SYNC_KEY'; END IF;
 IF p_file_id <> '19TX2KinSx3QXLw_VMZCE3Gm-bQVzzsSC' THEN RAISE EXCEPTION 'WRONG_HOTEL_EXCEL_FILE_ID'; END IF;
 UPDATE public.hotel_room_availability
 SET source_sync_state='synced',source_synced_revision=p_revision,source_synced_at=now(),
     source_synced_status=availability_status,source_synced_start=start_date,
     source_synced_end=end_date,source_synced_reason=reason,
     source_synced_remark=hotel_remark,source_writeback_last_error=null
 WHERE room_no=upper(btrim(p_room_no)) AND revision=p_revision AND source_sync_state='pending';
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN jsonb_build_object('ok',v_count=1,'result',CASE WHEN v_count=1 THEN 'excel_readback_verified' ELSE 'revision_changed_retry' END);
END $function$
;

CREATE OR REPLACE FUNCTION public.hotel_room_excel_writeback_failure(p_sync_key text, p_room_no text, p_revision integer, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT private.drive_sync_key_valid(p_sync_key) THEN RAISE EXCEPTION 'INVALID_SYNC_KEY'; END IF;
 UPDATE public.hotel_room_availability
 SET source_writeback_last_error=left(coalesce(p_error,'unknown'),500),
     source_writeback_attempts=source_writeback_attempts+1
 WHERE room_no=upper(btrim(p_room_no)) AND revision=p_revision AND source_sync_state='pending';
 RETURN jsonb_build_object('ok',true);
END $function$
;

CREATE OR REPLACE FUNCTION public.hotel_room_excel_writeback_pull(p_sync_key text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_rows jsonb;
BEGIN
 IF NOT private.drive_sync_key_valid(p_sync_key) THEN RAISE EXCEPTION 'INVALID_SYNC_KEY'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.updated_at,x.room_no),'[]'::jsonb) INTO v_rows
 FROM (SELECT h.room_no,h.availability_status,h.start_date,h.end_date,h.reason,h.hotel_remark,
   h.revision,h.updated_by_name,h.updated_at,h.source_synced_revision,
   h.source_synced_status,h.source_synced_start,h.source_synced_end,h.source_synced_reason,h.source_synced_remark,
   m.source_file_id,m.source_row,m.master_row,m.original_room_no
   FROM public.hotel_room_availability h
   JOIN public.hotel_room_source_map m ON m.room_no=h.room_no
   WHERE h.source_sync_state='pending'
   ORDER BY h.updated_at,h.room_no LIMIT LEAST(GREATEST(coalesce(p_limit,10),1),25)) x;
 RETURN jsonb_build_object('ok',true,'rows',v_rows,'file_id','19TX2KinSx3QXLw_VMZCE3Gm-bQVzzsSC');
END $function$
;
REVOKE ALL ON FUNCTION public.hotel_room_excel_writeback_pull(text,integer) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.hotel_room_excel_writeback_ack(text,text,integer,text) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.hotel_room_excel_writeback_failure(text,text,integer,text) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_room_excel_writeback_pull(text,integer) TO anon,service_role;
GRANT EXECUTE ON FUNCTION public.hotel_room_excel_writeback_ack(text,text,integer,text) TO anon,service_role;
GRANT EXECUTE ON FUNCTION public.hotel_room_excel_writeback_failure(text,text,integer,text) TO anon,service_role;
-- SOURCE DATA: deliberately not committed into public GitHub repository.
-- Actual 263-ID map / 94 OOO/OOS statuses imported from pinned private hotel Excel directly.
