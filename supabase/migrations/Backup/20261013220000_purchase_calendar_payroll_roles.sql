-- Production applied Oct 13 2026; role key names intentionally unchanged.
BEGIN;
ALTER POLICY "payroll roles read payroll records" ON public.payroll_verification_records
 USING ((SELECT private.is_active_user()) AND (SELECT private.has_app_role(ARRAY['manager','admin','engineer','payroll'])));
ALTER POLICY "payroll roles read payroll items" ON public.payroll_verification_items
 USING ((SELECT private.is_active_user()) AND (SELECT private.has_app_role(ARRAY['manager','admin','engineer','payroll'])));
DO $calendar$ DECLARE o oid; d text; old text:='p.role in (''manager'',''viewer_editor'')'; cnt int:=0;
BEGIN
 FOR o IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('work_calendar_create','work_calendar_update','work_calendar_delete','work_calendar_save_event','work_calendar_delete_event') LOOP
 d:=pg_get_functiondef(o);
 IF position('p.role in (''manager'',''viewer_editor'',''purchase'')' IN d)>0 THEN cnt:=cnt+1; CONTINUE; END IF;
 IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CALENDAR_GUARD_MISMATCH'; END IF;
 EXECUTE replace(d,old,'p.role in (''manager'',''viewer_editor'',''purchase'')');cnt:=cnt+1;
 END LOOP;
 IF cnt<>5 THEN RAISE EXCEPTION 'CALENDAR_RPC_COUNT_MISMATCH'; END IF;
END $calendar$;
COMMIT;