-- Backward-compatibility while Vercel production still serves the earlier Hotel editor:
-- legacy OOO/OOS form may submit a reason, while the new status/date-only form sends NULL.
-- Preserve historical reason for the new editor; allow explicit non-empty reason from legacy client.
-- Keep the same authorization, Combine transaction, revision guard, audit, and Excel writeback.
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
      nullif(btrim(coalesce(p_reason,'')),''),v_uid,coalesce(v_name,'ผู้ใช้'),
      now(),1,'pending',null
    )
    ON CONFLICT(room_no) DO UPDATE SET
      availability_status=EXCLUDED.availability_status,start_date=EXCLUDED.start_date,
      end_date=EXCLUDED.end_date,reason=coalesce(nullif(btrim(p_reason),''),public.hotel_room_availability.reason),
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
