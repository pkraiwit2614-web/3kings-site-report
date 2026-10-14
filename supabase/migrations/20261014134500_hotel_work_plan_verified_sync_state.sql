-- Explicit indicator prevents claiming Excel is synced before a REAL Drive readback.
CREATE TABLE IF NOT EXISTS public.hotel_work_plan_sync_control(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 last_verified_at timestamptz,
 verified_file_id text
);
ALTER TABLE public.hotel_work_plan_sync_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_work_plan_sync_control FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hotel_work_plan_sync_control TO authenticated;
CREATE POLICY hotel_work_plan_sync_status_read ON public.hotel_work_plan_sync_control
 FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
INSERT INTO public.hotel_work_plan_sync_control(id) VALUES(true) ON CONFLICT(id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.hotel_work_plan_sync_ack(p_key text,p_file_id text,p_days jsonb,p_rooms jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE e jsonb;d public.hotel_work_plan_days%ROWTYPE;r public.hotel_work_plan_rooms%ROWTYPE;
 v_date date;v_note text;v_n integer:=0;
BEGIN
 IF NOT private.drive_sync_key_valid(p_key) OR p_file_id<>'1KZ-VMDssYeMmTE-TNLYU0d8fwQkSUtuS'
 THEN RAISE EXCEPTION 'HOTEL_WORK_PLAN_SYNC_DENIED'; END IF;
 IF jsonb_typeof(p_days)<>'array' OR jsonb_array_length(p_days)<>9 OR
 jsonb_typeof(p_rooms)<>'array' OR jsonb_array_length(p_rooms)<>267 THEN
 RAISE EXCEPTION 'SYNC_ACK_MUST_VERIFY_276_ROWS'; END IF;
 PERFORM pg_advisory_xact_lock(20261014,267);
 FOR e IN SELECT value FROM jsonb_array_elements(p_days) LOOP
  SELECT * INTO d FROM public.hotel_work_plan_days WHERE day_no=(e->>'id')::integer FOR UPDATE;
  v_date:=nullif(e->>'date','')::date;v_note:=nullif(btrim(coalesce(e->>'note','')),'');
  IF NOT FOUND OR d.revision<>(e->>'revision')::integer OR d.planned_date IS DISTINCT FROM v_date
   OR d.note IS DISTINCT FROM v_note THEN RAISE EXCEPTION 'DAY_ACK_CONFLICT_%',e->>'id'; END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(p_rooms) LOOP
  SELECT * INTO r FROM public.hotel_work_plan_rooms WHERE seq_no=(e->>'id')::integer FOR UPDATE;
  IF NOT FOUND OR r.revision<>(e->>'revision')::integer OR r.day_no<>(e->>'day')::integer OR
  r.planned_date_override IS DISTINCT FROM nullif(e->>'override','')::date OR
  r.actual_date IS DISTINCT FROM nullif(e->>'actual','')::date OR
  r.work_status IS DISTINCT FROM (e->>'status') OR
  r.note IS DISTINCT FROM nullif(btrim(coalesce(e->>'note','')),'')
  THEN RAISE EXCEPTION 'ROOM_ACK_CONFLICT_%',e->>'id'; END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(p_days) LOOP
  UPDATE public.hotel_work_plan_days SET source_synced_date=planned_date,
  source_synced_note=note,sync_state='synced' WHERE day_no=(e->>'id')::integer;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(p_rooms) LOOP
  UPDATE public.hotel_work_plan_rooms SET source_synced_day=day_no,
  source_synced_override=planned_date_override,source_synced_actual=actual_date,
  source_synced_status=work_status,source_synced_note=note,sync_state='synced'
  WHERE seq_no=(e->>'id')::integer;v_n:=v_n+1;
 END LOOP;
 INSERT INTO public.hotel_work_plan_sync_control(id,last_verified_at,verified_file_id)
 VALUES(true,now(),p_file_id) ON CONFLICT(id) DO UPDATE
 SET last_verified_at=EXCLUDED.last_verified_at,verified_file_id=EXCLUDED.verified_file_id;
 RETURN jsonb_build_object('ok',true,'verified_rooms',v_n,'verified_days',9);
END $fn$;
REVOKE ALL ON FUNCTION public.hotel_work_plan_sync_ack(text,text,jsonb,jsonb) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_work_plan_sync_ack(text,text,jsonb,jsonb) TO anon;