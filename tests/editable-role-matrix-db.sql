-- Run only as a transaction; no business data is written and all Matrix changes roll back.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='35s';
CREATE TEMP TABLE matrix_baseline(role text,table_name text,rows_visible bigint,phase text);
GRANT ALL ON matrix_baseline TO authenticated;
DO $test$ DECLARE u record;t text;c bigint;
BEGIN
 FOR u IN SELECT DISTINCT ON (role) role,user_id FROM public.profiles WHERE active ORDER BY role,user_id LOOP
 PERFORM set_config('request.jwt.claim.sub',u.user_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u.user_id,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 FOREACH t IN ARRAY ARRAY['schedule_tasks','daily_reports','report_items','report_photos','materials','tool_machine','procurement_items','procurement_item_projects','work_calendars','work_calendar_events','condo_room_status','hotel_room_availability','hotel_room_group_members','hotel_work_plan_days','hotel_work_plan_rooms','hotel_work_plan_sync_control','defect_manual_updates','labour_verification_batches','labour_daily_assignments','labour_workers','payroll_verification_records','payroll_verification_items','site_operations_entries','site_operations_management_reviews','projects','drive_photo_index'] LOOP
 EXECUTE format('SELECT count(*) FROM public.%I',t) INTO c;
 INSERT INTO matrix_baseline VALUES(u.role,t,c,'before');
 END LOOP;
 RESET ROLE;
 END LOOP;
END $test$;
\i supabase/migrations/20261014231301_editable_role_permission_matrix_preserve_defaults.sql
DO $test$ DECLARE u record;t text;c bigint;
BEGIN
 FOR u IN SELECT DISTINCT ON (role) role,user_id FROM public.profiles WHERE active ORDER BY role,user_id LOOP
 PERFORM set_config('request.jwt.claim.sub',u.user_id::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u.user_id,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 FOREACH t IN ARRAY ARRAY['schedule_tasks','daily_reports','report_items','report_photos','materials','tool_machine','procurement_items','procurement_item_projects','work_calendars','work_calendar_events','condo_room_status','hotel_room_availability','hotel_room_group_members','hotel_work_plan_days','hotel_work_plan_rooms','hotel_work_plan_sync_control','defect_manual_updates','labour_verification_batches','labour_daily_assignments','labour_workers','payroll_verification_records','payroll_verification_items','site_operations_entries','site_operations_management_reviews','projects','drive_photo_index'] LOOP
 EXECUTE format('SELECT count(*) FROM public.%I',t) INTO c;
 INSERT INTO matrix_baseline VALUES(u.role,t,c,'after');
 END LOOP;
 RESET ROLE;
 END LOOP;
END $test$;
DO $test$
DECLARE own uuid;viewer_id uuid;editor_id uuid;s jsonb;rev bigint;err text;
BEGIN

 SELECT user_id INTO own FROM public.profiles WHERE user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3' AND active AND role='manager';
 SELECT user_id INTO viewer_id FROM public.profiles WHERE role='viewer' AND active LIMIT 1;
 SELECT user_id INTO editor_id FROM public.profiles WHERE role='viewer_editor' AND active LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',viewer_id::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.role_permission_matrix_save(1,'[]');RAISE EXCEPTION 'TEST_FAILED_NON_OWNER'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'OWNER_ONLY' THEN RAISE;END IF; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',own::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.role_permission_matrix_save(1,'[{"role":"owner","module":"users","level":"none"}]');RAISE EXCEPTION 'TEST_FAILED_OWNER_LOCK'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PROTECTED_PERMISSION' THEN RAISE;END IF; END;
 BEGIN PERFORM public.role_permission_matrix_save(0,'[]');RAISE EXCEPTION 'TEST_FAILED_REVISION'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'REVISION_CONFLICT_RELOAD' THEN RAISE;END IF; END;
 s:=public.role_permission_matrix_save(1,'[{"role":"viewer","module":"schedule","level":"manage"},{"role":"viewer_editor","module":"schedule","level":"view"}]');
 IF (s->>'revision')::int<>2 THEN RAISE EXCEPTION 'TEST_FAILED_REVISION_INCREMENT'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',viewer_id::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.schedule_save_web_override(null,null,null,null,null,null,'pending',null,null);RAISE EXCEPTION 'TEST_FAILED_EMPTY_TASK'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'TASK_NOT_FOUND' THEN RAISE;END IF; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',editor_id::text,true);
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.schedule_save_web_override(null,null,null,null,null,null,'pending',null,null);RAISE EXCEPTION 'TEST_FAILED_REVOKED_RPC'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'NOT_AUTHORIZED_FOR_SCHEDULE_EDIT' THEN RAISE;END IF; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',own::text,true);
 SET LOCAL ROLE authenticated;
 s:=public.role_permission_matrix_save(2,'[{"role":"viewer","module":"schedule","level":"view"},{"role":"viewer_editor","module":"schedule","level":"manage"}]');
 IF jsonb_array_length(public.role_permission_matrix_history())<>2 THEN RAISE EXCEPTION 'AUDIT_FAILED'; END IF;
 RESET ROLE;
 IF EXISTS(SELECT 1 FROM private.role_permission_matrix WHERE level<>default_level) THEN RAISE EXCEPTION 'RESTORE_FAILED'; END IF;
END $test$;
SELECT 'matrix_owner_lock_concurrency_grant_revoke_audit_restore_passed' AS test_result;
DO $test$
DECLARE u record;c jsonb;l text;own uuid:='bc6ee244-3472-422f-bbf9-d551987ee9a3';rev bigint;err text;v_default text;v_dummy jsonb;calls integer:=0;
BEGIN
 FOR u IN SELECT DISTINCT ON (role) role,user_id FROM public.profiles WHERE active AND role<>'manager' ORDER BY role,user_id LOOP
 FOR c IN SELECT * FROM jsonb_array_elements('[{"module":"schedule","call":"public.schedule_save_web_override(null,null,null,null,null,null,''pending'',null,null)","denied":"NOT_AUTHORIZED_FOR_SCHEDULE_EDIT"},{"module":"reports","call":"public.site_operations_save_management_review(null,''pending'',null,null,null)","denied":"NOT_AUTHORIZED_FOR_SITE_OPERATIONS_EDIT"},{"module":"procurement","call":"public.procurement_save_web_override(null,null,null,null,null,''pending'',null,null)","denied":"NOT_AUTHORIZED_FOR_PROCUREMENT_EDIT"},{"module":"defect","call":"public.defect_submit_manual_details(null,null,null)","denied":"NOT_AUTHORIZED_FOR_DEFECT_EDIT"},{"module":"hotel","call":"public.hotel_room_availability_save(''ZZ'',''UNKNOWN'',null,null,null,null)","denied":"ROOM_AVAILABILITY_EDIT_DENIED"},{"module":"materials","call":"public.material_tool_override_save(''material'',null,null,null,null,null,null,null)","denied":"NOT_AUTHORIZED_FOR_MATERIAL_TOOL_EDIT"},{"module":"calendar","call":"public.work_calendar_create(null,null,null,null)","denied":"NOT_AUTHORIZED_FOR_CALENDAR_EDIT"},{"module":"payroll","call":"public.labour_verify_batch(null::uuid,null::text,null::jsonb,null::text,null::bigint)","denied":"NOT_AUTHORIZED_FOR_LABOUR_VERIFICATION"},{"module":"workplan","call":"public.hotel_work_plan_save_day(0,null,null,null)","denied":"HOTEL_WORK_PLAN_EDIT_DENIED"},{"module":"workplan","call":"public.hotel_work_plan_save_room(null,0,null,null,''pending'',null,null)","denied":"HOTEL_WORK_PLAN_EDIT_DENIED"},{"module":"workplan","call":"public.hotel_work_plan_save_combine_room(null,0,null,null,''pending'',null,null,null)","denied":"HOTEL_WORK_PLAN_EDIT_DENIED"}]'::jsonb) LOOP
 SELECT default_level INTO v_default FROM private.role_permission_matrix WHERE role=u.role AND module=c->>'module';
 FOREACH l IN ARRAY ARRAY['none','view','manage'] LOOP
 PERFORM set_config('request.jwt.claim.sub',own::text,true);
 SELECT revision INTO rev FROM private.role_permission_revision WHERE id;
 SET LOCAL ROLE authenticated;
 v_dummy:=public.role_permission_matrix_save(rev,jsonb_build_array(jsonb_build_object('role',u.role,'module',c->>'module','level',l)));
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub',u.user_id::text,true);
 SET LOCAL ROLE authenticated;
 err:=NULL;
 BEGIN EXECUTE 'SELECT '||(c->>'call'); EXCEPTION WHEN OTHERS THEN err:=SQLERRM; END;
 IF l<>'manage' AND err IS DISTINCT FROM c->>'denied' THEN RAISE EXCEPTION 'DENY_FAILED role=% module=% level=% error=%',u.role,c->>'module',l,err; END IF;
 IF l='manage' AND (err IS NULL OR err=c->>'denied' OR err ILIKE '%permission denied%') THEN RAISE EXCEPTION 'GRANT_FAILED role=% module=% error=%',u.role,c->>'module',err; END IF;
 RESET ROLE;
 calls:=calls+1;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',own::text,true);
 SELECT revision INTO rev FROM private.role_permission_revision WHERE id;
 SET LOCAL ROLE authenticated;
 v_dummy:=public.role_permission_matrix_save(rev,jsonb_build_array(jsonb_build_object('role',u.role,'module',c->>'module','level',v_default)));
 RESET ROLE;
 END LOOP;
 END LOOP;
 RAISE NOTICE 'RPC permission cases passed: %',calls;
END $test$;
SELECT '198 grant/deny cases passed across 6 non-owner roles and 11 RPCs' AS test_result;
SELECT count(*) FILTER (WHERE a.rows_visible<>b.rows_visible) AS baseline_differences FROM matrix_baseline a JOIN matrix_baseline b USING(role,table_name) WHERE a.phase='before' AND b.phase='after';
ROLLBACK;
