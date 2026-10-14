-- Audit the actual before/after note text for Hotel Work Plan room edits.
CREATE OR REPLACE FUNCTION public.hotel_work_plan_save_room(
 p_seq integer,p_day integer,p_override_date date,p_actual_date date,p_status text,p_note text,p_expected_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_uid uuid:=auth.uid();v_before public.hotel_work_plan_rooms%ROWTYPE;v_after public.hotel_work_plan_rooms%ROWTYPE;v_name text;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS (
 SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true
 AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')
 ) THEN RAISE EXCEPTION 'HOTEL_WORK_PLAN_EDIT_DENIED'; END IF;
 IF p_day NOT BETWEEN 1 AND 9 OR p_status NOT IN ('pending','confirmed','in_progress','completed','postponed')
 OR length(coalesce(p_note,''))>2000 THEN RAISE EXCEPTION 'INVALID_WORK_PLAN'; END IF;
 SELECT * INTO v_before FROM public.hotel_work_plan_rooms WHERE seq_no=p_seq FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_WORK_PLAN_SEQ'; END IF;
 IF v_before.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
 SELECT coalesce(nullif(p.full_name,''),nullif(p.username,''),'ผู้ใช้') INTO v_name FROM public.profiles p WHERE p.user_id=v_uid;
 UPDATE public.hotel_work_plan_rooms SET day_no=p_day,planned_date_override=p_override_date,actual_date=p_actual_date,
 work_status=p_status,note=nullif(btrim(coalesce(p_note,'')),''),revision=revision+1,sync_state='pending',
 updated_by=v_uid,updated_by_name=v_name,updated_at=now()
 WHERE seq_no=p_seq RETURNING * INTO v_after;
 INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
 VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-work-plan','hotel_work_plan_save_room',v_before.room_no,
 jsonb_build_object('seq',p_seq,'previous_day',v_before.day_no,'new_day',p_day,
 'previous_date',v_before.planned_date_override,'new_date',p_override_date,
 'previous_actual',v_before.actual_date,'new_actual',p_actual_date,
 'previous_status',v_before.work_status,'new_status',p_status,
 'previous_note',v_before.note,'new_note',v_after.note,'revision',v_after.revision));
 RETURN jsonb_build_object('ok',true,'revision',v_after.revision);
END $fn$;
REVOKE ALL ON FUNCTION public.hotel_work_plan_save_room(integer,integer,date,date,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_work_plan_save_room(integer,integer,date,date,text,text,integer) TO authenticated;
