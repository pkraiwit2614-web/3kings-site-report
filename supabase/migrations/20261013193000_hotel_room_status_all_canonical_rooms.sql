-- Refine Hotel operations: room participation is not an OOO/OOS write-permission field.
-- Room Good01 (B101) can differ from 3 Kings classification; require owner reconciliation, not a silent block.
CREATE OR REPLACE FUNCTION public.hotel_room_availability_save(
  p_room_no text,p_status text,p_start_date date,p_end_date date,p_reason text,p_expected_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $func$
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
  SELECT coalesce(m.group_key,r.room_no) INTO v_group
  FROM public.condo_room_status r LEFT JOIN public.hotel_room_group_members m ON m.room_no=r.room_no
  WHERE r.room_no=v_room;
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
    INSERT INTO public.hotel_room_availability(room_no,availability_status,start_date,end_date,reason,updated_by,updated_by_name)
    VALUES(v_group,p_status,CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_start_date END,
       CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_end_date END,
       nullif(btrim(coalesce(p_reason,'')),''),v_uid,coalesce(v_display_name,'ผู้ใช้'));
    v_revision:=1;
  ELSE
    UPDATE public.hotel_room_availability SET availability_status=p_status,
      start_date=CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_start_date END,
      end_date=CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_end_date END,
      reason=nullif(btrim(coalesce(p_reason,'')),''),
      updated_by=v_uid,updated_by_name=coalesce(v_display_name,'ผู้ใช้'),
      updated_at=now(),revision=revision+1
    WHERE room_no=v_group RETURNING revision INTO v_revision;
  END IF;
  INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
  VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-room-status','hotel_room_availability_save',v_group,
    jsonb_build_object('status',p_status,'members',(
      SELECT jsonb_agg(m.room_no ORDER BY m.room_no) FROM public.hotel_room_group_members m WHERE m.group_key=v_group
    ),'revision',v_revision));
  RETURN jsonb_build_object('room_no',v_group,'revision',v_revision,'status',p_status);
END $func$;
REVOKE ALL ON FUNCTION public.hotel_room_availability_save(text,text,date,date,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_room_availability_save(text,text,date,date,text,integer) TO authenticated;

