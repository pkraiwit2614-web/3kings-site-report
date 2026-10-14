-- Persist genuine Excel/Web simultaneous edits as visible conflicts; no source data overwritten.
CREATE OR REPLACE FUNCTION public.hotel_work_plan_sync_conflict(p_key text,p_file_id text,p_issues jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE e jsonb;v_id integer;v_count integer:=0;v_kind text;v_revision integer;v_old jsonb;
BEGIN
 IF NOT private.drive_sync_key_valid(p_key) OR p_file_id<>'1KZ-VMDssYeMmTE-TNLYU0d8fwQkSUtuS'
 THEN RAISE EXCEPTION 'HOTEL_WORK_PLAN_SYNC_DENIED'; END IF;
 IF jsonb_typeof(p_issues)<>'array' OR jsonb_array_length(p_issues)>276 THEN
 RAISE EXCEPTION 'INVALID_SYNC_CONFLICTS'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_issues) LOOP
  v_kind:=e->>'kind';v_id:=(e->>'id')::integer;v_revision:=(e->>'revision')::integer;
  IF v_kind='day' THEN
   SELECT to_jsonb(d) INTO v_old FROM public.hotel_work_plan_days d
    WHERE d.day_no=v_id AND d.revision=v_revision FOR UPDATE;
   IF v_old IS NOT NULL AND v_old->>'sync_state'<>'conflict' THEN
    UPDATE public.hotel_work_plan_days SET sync_state='conflict' WHERE day_no=v_id AND revision=v_revision;
    INSERT INTO public.hotel_work_plan_sync_audit(source,kind,item_id,old_data,new_data)
     VALUES('conflict','day',v_id,v_old,jsonb_build_object('reason','EXCEL_AND_WEB_CHANGED','source','Excel'));
    v_count:=v_count+1;
   END IF;
  ELSIF v_kind='room' THEN
   SELECT to_jsonb(r) INTO v_old FROM public.hotel_work_plan_rooms r
    WHERE r.seq_no=v_id AND r.revision=v_revision FOR UPDATE;
   IF v_old IS NOT NULL AND v_old->>'sync_state'<>'conflict' THEN
    UPDATE public.hotel_work_plan_rooms SET sync_state='conflict' WHERE seq_no=v_id AND revision=v_revision;
    INSERT INTO public.hotel_work_plan_sync_audit(source,kind,item_id,old_data,new_data)
     VALUES('conflict','room',v_id,v_old,jsonb_build_object('reason','EXCEL_AND_WEB_CHANGED','source','Excel'));
    v_count:=v_count+1;
   END IF;
  ELSE RAISE EXCEPTION 'INVALID_CONFLICT_KIND'; END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'flagged',v_count);
END $fn$;
REVOKE ALL ON FUNCTION public.hotel_work_plan_sync_conflict(text,text,jsonb) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_work_plan_sync_conflict(text,text,jsonb) TO anon;