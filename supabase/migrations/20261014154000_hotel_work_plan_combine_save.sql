-- Work Plan Combine edit: keep every source Seq. and Excel source-row mapping intact.
-- Each confirmed Web edit changes all planned entries for the same canonical room group
-- in one revision-checked transaction. Existing single-room and day RPCs are unchanged.
CREATE OR REPLACE FUNCTION public.hotel_work_plan_save_combine_room(
 p_seq integer,
 p_day integer,
 p_override_date date,
 p_actual_date date,
 p_status text,
 p_note text,
 p_expected_revision integer,
 p_group_expected jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_uid uuid := auth.uid();
 v_name text;
 v_anchor public.hotel_work_plan_rooms%ROWTYPE;
 v_before public.hotel_work_plan_rooms%ROWTYPE;
 v_after public.hotel_work_plan_rooms%ROWTYPE;
 v_group_key text;
 v_expected_revision integer;
 v_expected_matches integer;
 v_expected_count integer;
 v_changed integer := 0;
 v_anchor_revision integer;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.profiles p
  WHERE p.user_id=v_uid AND p.active=true
  AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')
 ) THEN RAISE EXCEPTION 'HOTEL_WORK_PLAN_EDIT_DENIED'; END IF;
 IF p_day NOT BETWEEN 1 AND 9
    OR p_status NOT IN ('pending','confirmed','in_progress','completed','postponed')
    OR length(coalesce(p_note,''))>2000
    OR p_group_expected IS NULL OR jsonb_typeof(p_group_expected)<>'array'
 THEN RAISE EXCEPTION 'INVALID_WORK_PLAN'; END IF;
 SELECT * INTO v_anchor FROM public.hotel_work_plan_rooms WHERE seq_no=p_seq;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_WORK_PLAN_SEQ'; END IF;
 SELECT group_key INTO v_group_key FROM public.hotel_room_group_members WHERE room_no=v_anchor.room_no;
 IF v_group_key IS NULL THEN RAISE EXCEPTION 'UNKNOWN_COMBINE_GROUP'; END IF;
 SELECT count(*) INTO v_expected_count
 FROM public.hotel_work_plan_rooms r
 JOIN public.hotel_room_group_members m ON m.room_no=r.room_no
 WHERE m.group_key=v_group_key;
 IF v_expected_count<2 OR v_expected_count<>jsonb_array_length(p_group_expected)
 THEN RAISE EXCEPTION 'COMBINE_ROOM_SET_CHANGED_RELOAD'; END IF;
 -- Lock in deterministic Seq. order so simultaneous edits of opposite room members
 -- cannot overwrite one another. Verify *every* peer revision before any mutation.
 FOR v_before IN
  SELECT r.* FROM public.hotel_work_plan_rooms r
  JOIN public.hotel_room_group_members m ON m.room_no=r.room_no
  WHERE m.group_key=v_group_key ORDER BY r.seq_no FOR UPDATE OF r
 LOOP
  SELECT count(*),max((e->>'revision')::integer)
  INTO v_expected_matches,v_expected_revision
  FROM jsonb_array_elements(p_group_expected) e
  WHERE e->>'seq'=v_before.seq_no::text;
  IF v_expected_matches<>1 OR v_before.revision IS DISTINCT FROM v_expected_revision
   OR (v_before.seq_no=p_seq AND v_before.revision IS DISTINCT FROM p_expected_revision)
  THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
  IF v_before.sync_state='conflict' THEN RAISE EXCEPTION 'WORK_PLAN_GROUP_SYNC_CONFLICT_RELOAD'; END IF;
 END LOOP;
 SELECT coalesce(nullif(p.full_name,''),nullif(p.username,''),'ผู้ใช้')
 INTO v_name FROM public.profiles p WHERE p.user_id=v_uid;
 FOR v_before IN
  SELECT r.* FROM public.hotel_work_plan_rooms r
  JOIN public.hotel_room_group_members m ON m.room_no=r.room_no
  WHERE m.group_key=v_group_key ORDER BY r.seq_no
 LOOP
  UPDATE public.hotel_work_plan_rooms
  SET day_no=p_day,planned_date_override=p_override_date,actual_date=p_actual_date,
      work_status=p_status,note=nullif(btrim(coalesce(p_note,'')),''),
      revision=revision+1,sync_state='pending',
      updated_by=v_uid,updated_by_name=v_name,updated_at=now()
  WHERE seq_no=v_before.seq_no RETURNING * INTO v_after;
  IF v_before.seq_no=p_seq THEN v_anchor_revision:=v_after.revision; END IF;
  INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
  VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-work-plan',
         'hotel_work_plan_save_combine_room',v_before.room_no,
         jsonb_build_object(
          'combine_group',v_group_key,'seq',v_before.seq_no,
          'previous_day',v_before.day_no,'new_day',v_after.day_no,
          'previous_date',v_before.planned_date_override,'new_date',v_after.planned_date_override,
          'previous_actual',v_before.actual_date,'new_actual',v_after.actual_date,
          'previous_status',v_before.work_status,'new_status',v_after.work_status,
          'previous_note',v_before.note,'new_note',v_after.note,
          'revision',v_after.revision));
  v_changed:=v_changed+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'revision',v_anchor_revision,'updated_rows',v_changed,'combine_group',v_group_key);
END $fn$;
REVOKE ALL ON FUNCTION public.hotel_work_plan_save_combine_room(integer,integer,date,date,text,text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_work_plan_save_combine_room(integer,integer,date,date,text,text,integer,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
