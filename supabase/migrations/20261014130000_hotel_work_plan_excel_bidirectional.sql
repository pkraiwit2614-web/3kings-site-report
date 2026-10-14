
-- 2026-10-14: Pinned Above Element Excel Work Plan 2-way sync. Existing six Excel sheets and Defect/OOO tables are out of scope.
BEGIN;
ALTER TABLE public.hotel_work_plan_days
 ADD COLUMN IF NOT EXISTS source_synced_date date,
 ADD COLUMN IF NOT EXISTS source_synced_note text;
ALTER TABLE public.hotel_work_plan_rooms
 ADD COLUMN IF NOT EXISTS source_synced_day smallint,
 ADD COLUMN IF NOT EXISTS source_synced_override date,
 ADD COLUMN IF NOT EXISTS source_synced_actual date,
 ADD COLUMN IF NOT EXISTS source_synced_status text,
 ADD COLUMN IF NOT EXISTS source_synced_note text;
UPDATE public.hotel_work_plan_rooms
 SET source_synced_day=day_no,source_synced_override=planned_date_override,
 source_synced_actual=actual_date,source_synced_status=work_status,source_synced_note=note
 WHERE source_synced_day IS NULL AND revision=1 AND sync_state='synced';
CREATE TABLE IF NOT EXISTS public.hotel_work_plan_sync_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source text NOT NULL CHECK(source IN ('excel','writeback','conflict')),
 kind text NOT NULL CHECK(kind IN ('day','room')),
 item_id integer NOT NULL,
 old_data jsonb NOT NULL,
 new_data jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hotel_work_plan_sync_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_work_plan_sync_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hotel_work_plan_sync_audit TO authenticated;
CREATE POLICY hotel_plan_sync_audit_owner_read ON public.hotel_work_plan_sync_audit
 FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=(SELECT auth.uid()) AND p.active
 AND p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager'));
CREATE OR REPLACE FUNCTION public.hotel_work_plan_sync_snapshot(p_key text,p_file_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NOT private.drive_sync_key_valid(p_key) OR p_file_id<>'1KZ-VMDssYeMmTE-TNLYU0d8fwQkSUtuS'
 THEN RAISE EXCEPTION 'HOTEL_WORK_PLAN_SYNC_DENIED'; END IF;
 RETURN jsonb_build_object('ok',true,'file_id',p_file_id,
 'days',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.day_no),'[]'::jsonb) FROM public.hotel_work_plan_days d),
 'rooms',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.seq_no),'[]'::jsonb) FROM public.hotel_work_plan_rooms r));
END $fn$;
-- Spreadsheet changes are accepted only while the same row's Web version is synced,
-- with an optimistic revision check. One transaction handles the entire changed batch.
CREATE OR REPLACE FUNCTION public.hotel_work_plan_sync_import(p_key text,p_file_id text,p_changes jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE e jsonb;d public.hotel_work_plan_days%ROWTYPE;r public.hotel_work_plan_rooms%ROWTYPE;
 v_n integer:=0;v_id integer;v_date date;v_note text;v_day integer;v_actual date;v_override date;v_status text;
BEGIN
 IF NOT private.drive_sync_key_valid(p_key) OR p_file_id<>'1KZ-VMDssYeMmTE-TNLYU0d8fwQkSUtuS'
 THEN RAISE EXCEPTION 'HOTEL_WORK_PLAN_SYNC_DENIED'; END IF;
 IF jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)>276 THEN
 RAISE EXCEPTION 'INVALID_SYNC_BATCH'; END IF;
 -- Hold a single cooperative database lock so independent executor runs cannot interleave.
 PERFORM pg_advisory_xact_lock(20261014,267);
 -- Pass one: validate the COMPLETE change set before any update.
 FOR e IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
  v_id:=(e->>'id')::integer;
  IF (e->>'kind')='day' THEN
   SELECT * INTO d FROM public.hotel_work_plan_days WHERE day_no=v_id FOR UPDATE;
   IF NOT FOUND OR d.revision<>(e->>'revision')::integer OR d.sync_state<>'synced' THEN
    RAISE EXCEPTION 'DAY_WEB_REVISION_CONFLICT_%',v_id; END IF;
   v_date:=nullif(e->>'date','')::date;v_note:=nullif(btrim(coalesce(e->>'note','')),'');
   IF d.planned_date IS DISTINCT FROM d.source_synced_date OR d.note IS DISTINCT FROM d.source_synced_note
   THEN RAISE EXCEPTION 'DAY_WEB_PENDING_%',v_id; END IF;
  ELSIF (e->>'kind')='room' THEN
   SELECT * INTO r FROM public.hotel_work_plan_rooms WHERE seq_no=v_id FOR UPDATE;
   IF NOT FOUND OR r.revision<>(e->>'revision')::integer OR r.sync_state<>'synced'
   THEN RAISE EXCEPTION 'ROOM_WEB_REVISION_CONFLICT_%',v_id; END IF;
   v_day:=(e->>'day')::integer;v_override:=nullif(e->>'override','')::date;
   v_actual:=nullif(e->>'actual','')::date;v_status:=e->>'status';
   v_note:=nullif(btrim(coalesce(e->>'note','')),'');
   IF v_day NOT BETWEEN 1 AND 9 OR v_status NOT IN ('pending','confirmed','in_progress','completed','postponed') OR
    length(coalesce(v_note,''))>2000 OR r.day_no IS DISTINCT FROM r.source_synced_day OR
    r.planned_date_override IS DISTINCT FROM r.source_synced_override OR
    r.actual_date IS DISTINCT FROM r.source_synced_actual OR
    r.work_status IS DISTINCT FROM r.source_synced_status OR
    r.note IS DISTINCT FROM r.source_synced_note
   THEN RAISE EXCEPTION 'ROOM_WEB_PENDING_OR_INVALID_%',v_id; END IF;
  ELSE RAISE EXCEPTION 'INVALID_CHANGE_KIND'; END IF;
 END LOOP;
 -- Pass two: import only verified Excel-originated changes.
 FOR e IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
  v_id:=(e->>'id')::integer;v_note:=nullif(btrim(coalesce(e->>'note','')),'');
  IF (e->>'kind')='day' THEN
   SELECT * INTO d FROM public.hotel_work_plan_days WHERE day_no=v_id;
   v_date:=nullif(e->>'date','')::date;
   IF d.planned_date IS DISTINCT FROM v_date OR d.note IS DISTINCT FROM v_note THEN
    UPDATE public.hotel_work_plan_days SET planned_date=v_date,note=v_note,
    source_synced_date=v_date,source_synced_note=v_note,revision=revision+1,
    updated_by=NULL,updated_by_name='Excel',updated_at=now(),sync_state='synced' WHERE day_no=v_id;
    INSERT INTO public.hotel_work_plan_sync_audit(source,kind,item_id,old_data,new_data)
     VALUES('excel','day',v_id,jsonb_build_object('date',d.planned_date,'note',d.note),
     jsonb_build_object('date',v_date,'note',v_note));
    v_n:=v_n+1;
   END IF;
  ELSE
   SELECT * INTO r FROM public.hotel_work_plan_rooms WHERE seq_no=v_id;
   v_day:=(e->>'day')::integer;v_override:=nullif(e->>'override','')::date;
   v_actual:=nullif(e->>'actual','')::date;v_status:=e->>'status';
   IF r.day_no IS DISTINCT FROM v_day OR r.planned_date_override IS DISTINCT FROM v_override
    OR r.actual_date IS DISTINCT FROM v_actual OR r.work_status IS DISTINCT FROM v_status OR r.note IS DISTINCT FROM v_note THEN
    UPDATE public.hotel_work_plan_rooms SET day_no=v_day,planned_date_override=v_override,
    actual_date=v_actual,work_status=v_status,note=v_note,revision=revision+1,sync_state='synced',
    source_synced_day=v_day,source_synced_override=v_override,source_synced_actual=v_actual,
    source_synced_status=v_status,source_synced_note=v_note,
    updated_by=NULL,updated_by_name='Excel',updated_at=now() WHERE seq_no=v_id;
    INSERT INTO public.hotel_work_plan_sync_audit(source,kind,item_id,old_data,new_data)
     VALUES('excel','room',v_id,jsonb_build_object('day',r.day_no,'date',r.planned_date_override,'actual',r.actual_date,'status',r.work_status,'note',r.note),
     jsonb_build_object('day',v_day,'date',v_override,'actual',v_actual,'status',v_status,'note',v_note));
    v_n:=v_n+1;
   END IF;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'imported',v_n);
END $fn$;
-- Called only after reading back the Excel file ID and all target cells.
-- All 276 revisions and desired values must match before marking anything synced.
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
 RETURN jsonb_build_object('ok',true,'verified_rooms',v_n,'verified_days',9);
END $fn$;
REVOKE ALL ON FUNCTION public.hotel_work_plan_sync_snapshot(text,text) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.hotel_work_plan_sync_import(text,text,jsonb) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.hotel_work_plan_sync_ack(text,text,jsonb,jsonb) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_work_plan_sync_snapshot(text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.hotel_work_plan_sync_import(text,text,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.hotel_work_plan_sync_ack(text,text,jsonb,jsonb) TO anon;
COMMIT;