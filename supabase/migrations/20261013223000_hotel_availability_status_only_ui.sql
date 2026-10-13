-- OOO/OOS status-only editor. No changes to Defect data, hotel classifications or Excel files here.
-- Database status UNKNOWN maps to blank Excel cells in the existing pinned writeback executor.
-- Existing canonical Combine-group revision guard, RLS and activity logging are retained.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.hotel_room_availability
 DROP CONSTRAINT hotel_room_availability_availability_status_check;
ALTER TABLE public.hotel_room_availability
 ADD CONSTRAINT hotel_room_availability_availability_status_check
 CHECK (availability_status IN ('AVAILABLE','OOO','OOS','UNKNOWN'));

CREATE OR REPLACE FUNCTION public.hotel_room_availability_save(
  p_room_no text,p_status text,p_start_date date,p_end_date date,p_reason text,p_expected_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_room text := upper(regexp_replace(btrim(coalesce(p_room_no,'')),'[[:space:]-]','','g'));
  v_group text;
  v_rooms text[];
  v_member text;
  v_prev integer;
  v_rev integer;
  v_name text;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true
      AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')
  ) THEN RAISE EXCEPTION 'ROOM_AVAILABILITY_EDIT_DENIED'; END IF;
  IF v_room ~ '^GOOD0?[1-5]$' THEN v_room:='B10'||right(v_room,1); END IF;
  IF v_room !~ '^[AB][0-9]{3}$' THEN RAISE EXCEPTION 'INVALID_ROOM'; END IF;
  SELECT coalesce(m.group_key,r.room_no) INTO v_group
  FROM public.condo_room_status r LEFT JOIN public.hotel_room_group_members m ON m.room_no=r.room_no
  WHERE r.room_no=v_room;
  IF v_group IS NULL THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  IF p_status NOT IN ('AVAILABLE','OOO','OOS','UNKNOWN') THEN RAISE EXCEPTION 'INVALID_AVAILABILITY_STATUS'; END IF;
  IF p_status IN ('OOO','OOS') AND p_start_date IS NULL
    THEN RAISE EXCEPTION 'START_DATE_REQUIRED'; END IF;
  IF p_end_date IS NOT NULL AND (p_start_date IS NULL OR p_end_date<p_start_date)
    THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
  IF char_length(coalesce(p_reason,''))>2000 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;

  SELECT array_agg(r.room_no ORDER BY r.room_no) INTO v_rooms FROM public.condo_room_status r
  WHERE r.room_no=v_group OR EXISTS (
    SELECT 1 FROM public.hotel_room_group_members m WHERE m.room_no=r.room_no AND m.group_key=v_group);
  IF coalesce(array_length(v_rooms,1),0)=0 OR NOT v_room=ANY(v_rooms) THEN RAISE EXCEPTION 'ROOM_GROUP_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(v_rooms) AS v(room_no)
    WHERE NOT EXISTS(SELECT 1 FROM public.hotel_room_source_map sm WHERE sm.room_no=v.room_no))
    THEN RAISE EXCEPTION 'ROOM_GROUP_EXCEL_MAPPING_MISSING'; END IF;
  -- Lock physical identities in stable order even when an availability row does not exist yet.
  PERFORM 1 FROM public.condo_room_status r WHERE r.room_no=ANY(v_rooms) ORDER BY r.room_no FOR UPDATE;
  SELECT h.revision INTO v_prev FROM public.hotel_room_availability h
  WHERE h.room_no=v_room FOR UPDATE;
  IF v_prev IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
  SELECT coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.username),''),'ผู้ใช้')
    INTO v_name FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true;

  FOREACH v_member IN ARRAY v_rooms LOOP
    INSERT INTO public.hotel_room_availability(
      room_no,availability_status,start_date,end_date,reason,updated_by,updated_by_name,
      updated_at,revision,source_sync_state,source_writeback_last_error
    ) VALUES (
      v_member,p_status,p_start_date,p_end_date,
      NULL,v_uid,coalesce(v_name,'ผู้ใช้'),
      now(),1,'pending',null
    )
    ON CONFLICT(room_no) DO UPDATE SET
      availability_status=EXCLUDED.availability_status,start_date=EXCLUDED.start_date,
      end_date=EXCLUDED.end_date,reason=public.hotel_room_availability.reason,
      updated_by=EXCLUDED.updated_by,updated_by_name=EXCLUDED.updated_by_name,
      updated_at=now(),revision=public.hotel_room_availability.revision+1,
      source_sync_state='pending',source_writeback_last_error=null
    RETURNING revision INTO v_rev;
    v_result:=v_result||jsonb_build_array(jsonb_build_object('room_no',v_member,'revision',v_rev));
  END LOOP;
  INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
  VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-room-status',
    'hotel_room_availability_save',v_room,
    jsonb_build_object('status',p_status,'group_key',v_group,'members',v_rooms,
      'updated_revisions',v_result));
  RETURN jsonb_build_object('room_no',v_room,'group_key',v_group,'members',v_result,'status',p_status);
END $function$;
REVOKE ALL ON FUNCTION public.hotel_room_availability_save(text,text,date,date,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_room_availability_save(text,text,date,date,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.hotel_room_excel_writeback_ack(p_sync_key text, p_room_no text, p_revision integer, p_file_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_count integer;
BEGIN
 IF NOT private.drive_sync_key_valid(p_sync_key) THEN RAISE EXCEPTION 'INVALID_SYNC_KEY'; END IF;
 IF p_file_id <> '19TX2KinSx3QXLw_VMZCE3Gm-bQVzzsSC' THEN RAISE EXCEPTION 'WRONG_HOTEL_EXCEL_FILE_ID'; END IF;
 UPDATE public.hotel_room_availability
 SET source_sync_state='synced',source_synced_revision=p_revision,source_synced_at=now(),
     source_synced_status=CASE WHEN availability_status='UNKNOWN' THEN '' ELSE availability_status END,
     source_synced_start=start_date,source_synced_end=end_date,source_synced_reason=reason,
     source_synced_remark=hotel_remark,source_writeback_last_error=null
 WHERE room_no=upper(btrim(p_room_no)) AND revision=p_revision AND source_sync_state='pending';
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN jsonb_build_object('ok',v_count=1,'result',CASE WHEN v_count=1 THEN 'excel_readback_verified' ELSE 'revision_changed_retry' END);
END $function$;
REVOKE ALL ON FUNCTION public.hotel_room_excel_writeback_ack(text,text,integer,text) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_room_excel_writeback_ack(text,text,integer,text) TO anon,service_role;

CREATE OR REPLACE FUNCTION public.hotel_room_excel_writeback_pull(p_sync_key text, p_limit integer DEFAULT 10)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_rows jsonb;
BEGIN
 IF NOT private.drive_sync_key_valid(p_sync_key) THEN RAISE EXCEPTION 'INVALID_SYNC_KEY'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.updated_at,x.room_no),'[]'::jsonb) INTO v_rows
 FROM (SELECT h.room_no,
   CASE WHEN h.availability_status='UNKNOWN' THEN '' ELSE h.availability_status END AS availability_status,
   h.start_date,h.end_date,h.reason,h.hotel_remark,
   h.revision,h.updated_by_name,h.updated_at,h.source_synced_revision,
   h.source_synced_status,h.source_synced_start,h.source_synced_end,h.source_synced_reason,h.source_synced_remark,
   m.source_file_id,m.source_row,m.master_row,m.original_room_no
   FROM public.hotel_room_availability h
   JOIN public.hotel_room_source_map m ON m.room_no=h.room_no
   WHERE h.source_sync_state='pending'
   ORDER BY h.updated_at,h.room_no LIMIT LEAST(GREATEST(coalesce(p_limit,10),1),25)) x;
 RETURN jsonb_build_object('ok',true,'rows',v_rows,'file_id','19TX2KinSx3QXLw_VMZCE3Gm-bQVzzsSC');
END $function$;
REVOKE ALL ON FUNCTION public.hotel_room_excel_writeback_pull(text,integer) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_room_excel_writeback_pull(text,integer) TO anon,service_role;

COMMIT;
