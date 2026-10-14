-- Abort if a policy changed concurrently after inspection.
DO $policy_guard$
DECLARE p jsonb; current_hash text;
BEGIN
 FOR p IN SELECT * FROM jsonb_array_elements($policies$[{"schema":"public","table":"projects","name":"projects_select_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"schedule_tasks","name":"schedule_select_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"daily_reports","name":"daily_select_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"report_items","name":"report_items_select_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"site_operations_duplicate_groups","name":"active users read duplicate groups","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"site_operations_duplicate_members","name":"active users read duplicate members","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"report_photos","name":"report_photos_select_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"materials","name":"materials_select_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"procurement_items","name":"procurement_select_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"schedule_task_overrides","name":"schedule_task_overrides_read_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"weekly_snapshots","name":"weekly_select_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"procurement_item_overrides","name":"procurement_item_overrides_read_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"storage","table":"objects","name":"site_photos_select","hash":"1983e752218fec7bc7ec5b872386f8f6"},{"schema":"public","table":"site_operations_management_reviews","name":"site_operations_management_reviews_read_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"defect_manual_updates","name":"defect_manual_updates_read_active","hash":"8d470c77eb24513efeef8db6b82646bf"},{"schema":"public","table":"report_drafts","name":"report_drafts_select_own","hash":"e9102f5347c07fdeb1432c6f68e18d13"},{"schema":"public","table":"daily_report_revisions","name":"daily_report_revisions_select_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"drive_photo_index","name":"drive_photo_index_select_authenticated","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"schedule_task_daily_snapshots","name":"schedule_snapshots_select_authenticated","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"tool_machine","name":"tool_machine_select_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"condo_room_status","name":"active users can view condo room status","hash":"8d470c77eb24513efeef8db6b82646bf"},{"schema":"public","table":"photo_task_feedback","name":"photo_task_feedback_select_authenticated","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"work_calendars","name":"work_calendars_read_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"work_calendar_events","name":"work_calendar_events_read_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"labour_name_map","name":"active users read labour name map","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"payroll_verification_items","name":"payroll roles read payroll items","hash":"39ace9af69a5b1fb43d0886543e85add"},{"schema":"public","table":"procurement_item_projects","name":"procurement_item_projects_select_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"storage","table":"objects","name":"photo_archive_staging_select_own","hash":"43d34fa58de9b5132af7d629a57f6f08"},{"schema":"storage","table":"objects","name":"photo_archive_staging_select_archived","hash":"5fc0f03929543f3f7b9dd0206eea7d3c"},{"schema":"public","table":"drive_sync_runs","name":"drive_sync_runs_select_authenticated","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"photo_ai_task_scores","name":"photo_ai_task_scores_select_authenticated","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"storage","table":"objects","name":"defect_flow_staging_insert","hash":"60dda44c2de2d90fba101a48cc14340d"},{"schema":"storage","table":"objects","name":"defect_flow_staging_delete_own","hash":"53e6b2120c268c6c859312f6c57a804f"},{"schema":"public","table":"hotel_room_group_members","name":"hotel_group_read_active","hash":"8d470c77eb24513efeef8db6b82646bf"},{"schema":"public","table":"hotel_room_availability","name":"hotel_availability_read_active","hash":"8d470c77eb24513efeef8db6b82646bf"},{"schema":"public","table":"payroll_verification_records","name":"payroll roles insert payroll records","hash":"ac470b13e2ff613bb6c88658568122ae"},{"schema":"public","table":"payroll_verification_records","name":"payroll roles update payroll records","hash":"ad53f4eee4fc5280355db1c75e2a3e57"},{"schema":"public","table":"payroll_verification_records","name":"payroll roles delete payroll records","hash":"d028bf60362f06402d88f5bf5525056c"},{"schema":"public","table":"labour_daily_assignments","name":"active users read labour assignments","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"payroll_verification_items","name":"payroll roles insert payroll items","hash":"ac470b13e2ff613bb6c88658568122ae"},{"schema":"public","table":"payroll_verification_items","name":"payroll roles update payroll items","hash":"ad53f4eee4fc5280355db1c75e2a3e57"},{"schema":"public","table":"payroll_verification_items","name":"payroll roles delete payroll items","hash":"d028bf60362f06402d88f5bf5525056c"},{"schema":"public","table":"payroll_verification_records","name":"payroll roles read payroll records","hash":"39ace9af69a5b1fb43d0886543e85add"},{"schema":"public","table":"labour_verification_batches","name":"active users read labour batches","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"material_tool_web_overrides","name":"material_tool_overrides_read_active","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"labour_workers","name":"active users read labour workers","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"procurement_calendar_delivery","name":"procurement_calendar_delivery_read","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"procurement_item_projects","name":"procurement_item_projects_insert_manage","hash":"939962c6d8170a733d71c088e395cad5"},{"schema":"public","table":"procurement_item_projects","name":"procurement_item_projects_update_manage","hash":"8e6ad683687bc5f0fca92e7595df7240"},{"schema":"public","table":"procurement_item_projects","name":"procurement_item_projects_delete_manage","hash":"7ea9474cbbe404fee8773304c42ec922"},{"schema":"public","table":"site_operations_entries","name":"active users read site operations","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"site_operations_entry_projects","name":"active users read site operations projects","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"hotel_work_plan_days","name":"hotel_work_plan_day_read","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"hotel_work_plan_rooms","name":"hotel_work_plan_room_read","hash":"5a69a38b999271dfd7bd3ab4763fb85b"},{"schema":"public","table":"hotel_work_plan_sync_control","name":"hotel_work_plan_sync_status_read","hash":"5a69a38b999271dfd7bd3ab4763fb85b"}]$policies$::jsonb) LOOP
  SELECT md5(coalesce(qual,'')||E'\n'||coalesce(with_check,'')) INTO current_hash FROM pg_policies
   WHERE schemaname=p->>'schema' AND tablename=p->>'table' AND policyname=p->>'name';
  IF current_hash IS DISTINCT FROM p->>'hash' THEN RAISE EXCEPTION 'PERMISSION_POLICY_CHANGED: %',p->>'name';END IF;
 END LOOP;
END $policy_guard$;

-- No changes to profiles, business rows, sync keys, or role names.
CREATE TABLE private.role_permission_matrix (
 role text NOT NULL, module text NOT NULL, level text NOT NULL CHECK(level IN ('none','view','manage')),
 default_level text NOT NULL CHECK(default_level IN ('none','view','manage')), locked boolean NOT NULL DEFAULT false,
 PRIMARY KEY(role,module)
);
ALTER TABLE private.role_permission_matrix ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.role_permission_matrix FROM PUBLIC,anon,authenticated;
CREATE TABLE private.role_permission_revision(id boolean PRIMARY KEY DEFAULT true CHECK(id),revision bigint NOT NULL DEFAULT 1);
ALTER TABLE private.role_permission_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.role_permission_revision FROM PUBLIC,anon,authenticated;
INSERT INTO private.role_permission_revision VALUES(true,1);
CREATE TABLE private.role_permission_history(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, revision bigint NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(),changed_by uuid NOT NULL,changes jsonb NOT NULL);
ALTER TABLE private.role_permission_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.role_permission_history FROM PUBLIC,anon,authenticated;
INSERT INTO private.role_permission_matrix(role,module,level,default_level,locked) VALUES
('owner','workplan','manage','manage',true),
('admin','workplan','view','view',false),
('viewer','workplan','view','view',false),
('viewer_editor','workplan','view','view',false),
('purchase','workplan','view','view',false),
('defect_contributor','workplan','view','view',false),
('defect_editor','workplan','manage','manage',false),
('owner','dashboard','manage','manage',true),
('owner','presentation','manage','manage',true),
('owner','schedule','manage','manage',true),
('owner','reports','manage','manage',true),
('owner','defect','manage','manage',true),
('owner','hotel','manage','manage',true),
('owner','materials','manage','manage',true),
('owner','procurement','manage','manage',true),
('owner','calendar','manage','manage',true),
('owner','payroll','manage','manage',true),
('owner','users','manage','manage',true),
('owner','activity','view','view',true),
('owner','reconciliation','manage','manage',true),
('admin','dashboard','view','view',false),
('admin','presentation','view','view',false),
('admin','schedule','view','view',false),
('admin','reports','manage','manage',false),
('admin','defect','view','view',false),
('admin','hotel','view','view',false),
('admin','materials','view','view',false),
('admin','procurement','view','view',false),
('admin','calendar','view','view',false),
('admin','payroll','manage','manage',false),
('admin','users','none','none',true),
('admin','activity','none','none',true),
('admin','reconciliation','none','none',true),
('viewer','dashboard','view','view',false),
('viewer','presentation','view','view',false),
('viewer','schedule','view','view',false),
('viewer','reports','view','view',false),
('viewer','defect','view','view',false),
('viewer','hotel','view','view',false),
('viewer','materials','view','view',false),
('viewer','procurement','view','view',false),
('viewer','calendar','view','view',false),
('viewer','payroll','none','none',false),
('viewer','users','none','none',true),
('viewer','activity','none','none',true),
('viewer','reconciliation','none','none',true),
('viewer_editor','dashboard','view','view',false),
('viewer_editor','presentation','view','view',false),
('viewer_editor','schedule','manage','manage',false),
('viewer_editor','reports','view','view',false),
('viewer_editor','defect','manage','manage',false),
('viewer_editor','hotel','view','view',false),
('viewer_editor','materials','view','view',false),
('viewer_editor','procurement','view','view',false),
('viewer_editor','calendar','manage','manage',false),
('viewer_editor','payroll','none','none',false),
('viewer_editor','users','none','none',true),
('viewer_editor','activity','none','none',true),
('viewer_editor','reconciliation','none','none',true),
('purchase','dashboard','view','view',false),
('purchase','presentation','view','view',false),
('purchase','schedule','view','view',false),
('purchase','reports','view','view',false),
('purchase','defect','view','view',false),
('purchase','hotel','view','view',false),
('purchase','materials','manage','manage',false),
('purchase','procurement','manage','manage',false),
('purchase','calendar','manage','manage',false),
('purchase','payroll','none','none',false),
('purchase','users','none','none',true),
('purchase','activity','none','none',true),
('purchase','reconciliation','none','none',true),
('defect_contributor','dashboard','none','none',false),
('defect_contributor','presentation','none','none',false),
('defect_contributor','schedule','none','none',false),
('defect_contributor','reports','none','none',false),
('defect_contributor','defect','view','view',false),
('defect_contributor','hotel','view','view',false),
('defect_contributor','materials','none','none',false),
('defect_contributor','procurement','none','none',false),
('defect_contributor','calendar','none','none',false),
('defect_contributor','payroll','none','none',false),
('defect_contributor','users','none','none',true),
('defect_contributor','activity','none','none',true),
('defect_contributor','reconciliation','none','none',true),
('defect_editor','dashboard','none','none',false),
('defect_editor','presentation','none','none',false),
('defect_editor','schedule','none','none',false),
('defect_editor','reports','none','none',false),
('defect_editor','defect','manage','manage',false),
('defect_editor','hotel','manage','manage',false),
('defect_editor','materials','none','none',false),
('defect_editor','procurement','none','none',false),
('defect_editor','calendar','none','none',false),
('defect_editor','payroll','none','none',false),
('defect_editor','users','none','none',true),
('defect_editor','activity','none','none',true),
('defect_editor','reconciliation','none','none',true);

CREATE OR REPLACE FUNCTION private.matrix_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager' THEN 'owner'
 WHEN p.role IN ('manager','admin','engineer','payroll') THEN 'admin' WHEN p.role IN ('foreman','viewer') THEN 'viewer'
 ELSE p.role END FROM public.profiles p WHERE p.user_id=(SELECT auth.uid()) AND p.active=true
$$;
REVOKE ALL ON FUNCTION private.matrix_role() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.matrix_role() TO authenticated;
CREATE OR REPLACE FUNCTION private.matrix_allowed(p_module text,p_action text,p_legacy boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cell private.role_permission_matrix%ROWTYPE;r text:=private.matrix_role();
BEGIN
 IF r IS NULL THEN RETURN false; END IF;
 SELECT * INTO cell FROM private.role_permission_matrix WHERE role=r AND module=p_module;
 -- Unchanged cells delegate to the exact pre-migration rule, including legacy and ownership restrictions.
 IF NOT FOUND OR cell.level=cell.default_level OR cell.locked THEN RETURN coalesce(p_legacy,false); END IF;
 IF p_action='view' THEN RETURN cell.level<>'none'; END IF;
 IF p_action='manage' THEN RETURN cell.level='manage'; END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.matrix_allowed(text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.matrix_allowed(text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.role_permission_matrix_read() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF private.matrix_role() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 SELECT jsonb_build_object('revision',(SELECT revision FROM private.role_permission_revision WHERE id),
 'rows',jsonb_agg(to_jsonb(m) ORDER BY m.role,m.module)) INTO result FROM private.role_permission_matrix m;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.role_permission_matrix_read() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.role_permission_matrix_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.role_permission_matrix_save(p_expected_revision bigint,p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_revision bigint; c jsonb; old_cell private.role_permission_matrix%ROWTYPE; diffs jsonb:='[]'::jsonb; next_level text;
BEGIN
 IF private.matrix_role() IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 SELECT revision INTO v_revision FROM private.role_permission_revision WHERE id FOR UPDATE;
 IF p_expected_revision IS DISTINCT FROM v_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
 IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)>98 THEN RAISE EXCEPTION 'INVALID_CHANGES'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_changes))<>(SELECT count(DISTINCT (x->>'role',x->>'module')) FROM jsonb_array_elements(p_changes) x) THEN RAISE EXCEPTION 'DUPLICATE_CELL'; END IF;
 FOR c IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
  SELECT * INTO old_cell FROM private.role_permission_matrix WHERE role=c->>'role' AND module=c->>'module' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_CELL'; END IF;
  next_level:=c->>'level';
  IF next_level IS NULL OR next_level NOT IN ('none','view','manage') THEN RAISE EXCEPTION 'INVALID_LEVEL'; END IF;
  IF old_cell.locked AND next_level<>old_cell.level THEN RAISE EXCEPTION 'PROTECTED_PERMISSION'; END IF;
  IF old_cell.module IN ('dashboard','presentation') AND old_cell.role<>'owner' AND next_level='manage' THEN RAISE EXCEPTION 'READ_ONLY_MODULE'; END IF;
  IF next_level<>old_cell.level THEN
   UPDATE private.role_permission_matrix SET level=next_level WHERE role=old_cell.role AND module=old_cell.module;
   diffs:=diffs||jsonb_build_array(jsonb_build_object('role',old_cell.role,'module',old_cell.module,'before',old_cell.level,'after',next_level));
  END IF;
 END LOOP;
 IF jsonb_array_length(diffs)>0 THEN
  UPDATE private.role_permission_revision SET revision=revision+1 WHERE id RETURNING revision INTO v_revision;
  INSERT INTO private.role_permission_history(revision,changed_by,changes) VALUES(v_revision,auth.uid(),diffs);
  INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
  VALUES(auth.uid(),gen_random_uuid(),'data_change','/users','role_permission_matrix_save',v_revision::text,jsonb_build_object('changes',diffs));
 END IF;
 RETURN public.role_permission_matrix_read();
END $$;
REVOKE ALL ON FUNCTION public.role_permission_matrix_save(bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.role_permission_matrix_save(bigint,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.role_permission_matrix_history() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF private.matrix_role() IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'OWNER_ONLY'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.revision DESC),'[]'::jsonb) FROM
  (SELECT h.revision,h.changed_at,h.changed_by,p.full_name,h.changes FROM private.role_permission_history h LEFT JOIN public.profiles p ON p.user_id=h.changed_by ORDER BY h.revision DESC LIMIT 30) h);
END $$;
REVOKE ALL ON FUNCTION public.role_permission_matrix_history() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.role_permission_matrix_history() TO authenticated;

-- Invoker RPCs cannot resolve names in the private schema; expose only the caller's
-- override, with no caller-supplied identity or legacy authorization boolean.
CREATE OR REPLACE FUNCTION public.role_permission_override(p_module text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN m.locked OR m.level=m.default_level THEN NULL ELSE m.level END
 FROM private.role_permission_matrix m WHERE m.role=private.matrix_role() AND m.module=p_module
$$;
REVOKE ALL ON FUNCTION public.role_permission_override(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.role_permission_override(text) TO authenticated;



CREATE OR REPLACE FUNCTION private.matrix_can_read(p_modules text[],p_legacy boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r text:=private.matrix_role();
BEGIN
 IF r IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.role_permission_matrix m WHERE m.role=r AND m.module=ANY(p_modules) AND m.level<>m.default_level AND NOT m.locked) THEN RETURN coalesce(p_legacy,false); END IF;
 RETURN EXISTS(SELECT 1 FROM private.role_permission_matrix m WHERE m.role=r AND m.module=ANY(p_modules) AND m.level<>'none');
END $$;
REVOKE ALL ON FUNCTION private.matrix_can_read(text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.matrix_can_read(text[],boolean) TO authenticated;


-- Each authorization-only replacement is pinned to the inspected function definition.
-- Abort the whole migration if any function changed after the baseline inspection.
DO $patch$
DECLARE patch jsonb; definition text; function_oid oid;
BEGIN
 FOR patch IN SELECT * FROM jsonb_array_elements($patchdata$[{"schema":"private","name":"can_write_reports","args":"","md5":"034dd6e2f7c7cd47917d986ab55c3df1","start":158,"length":156,"replacement":"private.matrix_allowed('reports','manage',exists (\n    select 1 from public.profiles p\n    where p.user_id=(select auth.uid()) and p.active=true\n      and p.role in ('manager','admin','engineer')\n  )"},{"schema":"private","name":"can_manage_labour_payroll","args":"","md5":"66b44d84237256b436ffe71862eb015a","start":166,"length":166,"replacement":"private.matrix_allowed('payroll','manage',exists (\n    select 1 from public.profiles p\n    where p.user_id=(select auth.uid()) and p.active=true\n      and p.role in ('manager','admin','engineer','payroll')\n  )"},{"schema":"public","name":"labour_confirm_supervisor_mapping","args":"p_batch_id uuid, p_worker_id text","md5":"73da12c30239dd1deae7b865175d1950","start":424,"length":147,"replacement":"coalesce(public.role_permission_override('payroll')='manage',exists (\n    select 1 from public.profiles p\n    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')\n  )"},{"schema":"public","name":"labour_confirm_headcount","args":"p_batch_id uuid, p_confirmed_headcount integer, p_basis text, p_evidence_note text","md5":"bcd9074bc3bf5e65e3244e599e485b8d","start":523,"length":147,"replacement":"coalesce(public.role_permission_override('payroll')='manage',exists (\n    select 1 from public.profiles p\n    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')\n  )"},{"schema":"public","name":"payroll_save_verification","args":"p_labour_batch_id uuid, p_method text, p_status text, p_note text, p_external_reference text, p_items jsonb","md5":"49001f65e35eb1d8f001882871b919f8","start":573,"length":147,"replacement":"private.matrix_allowed('payroll','manage',exists (\n    select 1 from public.profiles p\n    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')\n  )"},{"schema":"public","name":"labour_payroll_guard_row","args":"","md5":"f5565237adefd7fbaaae29b74130faf3","start":1050,"length":2942,"replacement":"private.matrix_allowed('payroll','manage',exists(select 1 from public.profiles where user_id=v_user and active and role in ('manager','admin','engineer','payroll'))) then\n       raise exception 'AUTH_REQUIRED_FOR_VERIFICATION';\n     end if;\n     new.verified_by:=v_user;\n     new.verified_at:=now();\n     -- Source fingerprint is asserted, never silently accept a stale revision.\n   end if;\n   if tg_op='UPDATE' and (new.verification_status is distinct from old.verification_status\n     or new.verified_at is distinct from old.verified_at\n     or new.verified_source_fingerprint is distinct from old.verified_source_fingerprint\n     or new.supervisor_worker_id is distinct from old.supervisor_worker_id\n     or new.work_date is distinct from old.work_date or new.expected_headcount is distinct from old.expected_headcount) then\n     update public.payroll_verification_records set status='needs_review',updated_at=now()\n       where labour_batch_id=old.id and status in ('timecard_checked','verified','external_verified');\n   end if;\n elsif tg_table_name='labour_daily_assignments' then\n   if tg_op='UPDATE' and (new.batch_id is distinct from old.batch_id or new.worker_id is distinct from old.worker_id) then\n     raise exception 'IMMUTABLE_ASSIGNMENT_IDENTITY';\n   end if;\n   v_id:=case when tg_op='DELETE' then old.batch_id else new.batch_id end;\n   select * into b from public.labour_verification_batches where id=v_id for update;\n   update public.payroll_verification_records set status='needs_review',updated_at=now()\n     where labour_batch_id=v_id and status in ('timecard_checked','verified','external_verified');\n   if tg_op<>'DELETE' then\n     if v_user is null or not private.matrix_allowed('payroll','manage',exists(select 1 from public.profiles where user_id=v_user and active and role in ('manager','admin','engineer','payroll'))) then\n       raise exception 'AUTH_REQUIRED_FOR_VERIFICATION';\n     end if;\n     if new.work_date is distinct from b.work_date or new.worker_id=b.supervisor_worker_id then\n       raise exception 'INVALID_LABOUR_ASSIGNMENT';\n     end if;\n     select * into w from public.labour_workers where worker_id=new.worker_id;\n     if not found then raise exception 'UNKNOWN_WORKER_ID'; end if;\n     if new.home_team is distinct from w.default_team then raise exception 'HOME_TEAM_MUST_MATCH_WORKER'; end if;\n     new.verified_by:=v_user; new.verified_at:=now();\n   end if;\n elsif tg_table_name='payroll_verification_records' then\n   if tg_op='UPDATE' and new.labour_batch_id is distinct from old.labour_batch_id then raise exception 'IMMUTABLE_PAYROLL_BATCH'; end if;\n   v_id:=case when tg_op='DELETE' then old.labour_batch_id else new.labour_batch_id end;\n   perform 1 from public.labour_verification_batches where id=v_id for update;\n   if tg_op<>'DELETE' then\n     if new.status in ('timecard_checked','verified','external_verified') then\n       if v_user is null or not private.matrix_allowed('payroll','manage',exists(select 1 from public.profiles where user_id=v_user and active and role in ('manager','admin','engineer','payroll')"},{"schema":"public","name":"labour_verify_batch","args":"p_batch_id uuid, p_note text, p_assignments jsonb, p_expected_source_fingerprint text, p_expected_batch_revision bigint","md5":"657bbb801975987d0fea264f5c6ef27a","start":819,"length":147,"replacement":"coalesce(public.role_permission_override('payroll')='manage',exists (\n    select 1 from public.profiles p\n    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')\n  )"},{"schema":"public","name":"payroll_save_verification","args":"p_labour_batch_id uuid, p_method text, p_status text, p_note text, p_external_reference text, p_items jsonb, p_expected_source_fingerprint text, p_expected_batch_revision bigint, p_expected_payroll_revision bigint","md5":"7dca810c3892cba1069db47bf47f235c","start":875,"length":147,"replacement":"private.matrix_allowed('payroll','manage',exists (\n    select 1 from public.profiles p\n    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')\n  )"},{"schema":"public","name":"labour_confirm_contractor_count","args":"p_batch_id uuid, p_count integer, p_basis text, p_evidence text, p_expected_source_fingerprint text, p_expected_batch_revision bigint","md5":"be6b9f3e6802cd66dbbfa71ebd65de13","start":527,"length":147,"replacement":"coalesce(public.role_permission_override('payroll')='manage',exists (\n    select 1 from public.profiles p\n    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')\n  )"},{"schema":"public","name":"labour_verify_batch","args":"p_batch_id uuid, p_note text, p_assignments jsonb","md5":"09f2c52ff82376f6a8ba76375ad35215","start":624,"length":147,"replacement":"coalesce(public.role_permission_override('payroll')='manage',exists (\n    select 1 from public.profiles p\n    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')\n  )"},{"schema":"public","name":"schedule_save_web_override","args":"p_task_id uuid, p_site_status text, p_next_action text, p_target_close date, p_blocker text, p_notes text, p_review_status text, p_client_session_id uuid, p_user_agent text","md5":"aaf1add3a28e362950186260276034f3","start":450,"length":133,"replacement":"private.matrix_allowed('schedule','manage',exists(\n    select 1 from public.profiles p\n    where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor')\n  )"},{"schema":"public","name":"defect_writeback_status","args":"p_room_no text","md5":"ff5c47cc042fca626d73b04c2a9e4372","start":291,"length":246,"replacement":"private.matrix_allowed('defect','manage',EXISTS (\n    SELECT 1 FROM public.profiles p\n    WHERE p.user_id = v_user AND p.active = true\n      AND ((p.user_id = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager')\n           OR p.role IN ('defect_editor','viewer_editor'))\n  )"},{"schema":"public","name":"procurement_save_web_override","args":"p_item_id uuid, p_current_status text, p_expected_delivery_text text, p_expected_delivery date, p_condition_note text, p_review_status text, p_client_session_id uuid, p_user_agent text","md5":"ccc2d188ffcacbeed33138e64842cfb7","start":485,"length":236,"replacement":"private.matrix_allowed('procurement','manage',exists(\n    select 1\n    from public.profiles p\n    where p.user_id=v_user\n      and p.active=true\n      and (\n        p.role='purchase'\n        or (p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager')\n      )\n  )"},{"schema":"public","name":"site_operations_save_management_review","args":"p_entry_id uuid, p_review_status text, p_management_note text, p_client_session_id uuid, p_user_agent text","md5":"84653592309187f371929f91acbfbb15","start":396,"length":146,"replacement":"private.matrix_allowed('reports','manage',exists(\n    select 1 from public.profiles p\n    where p.user_id=v_user and p.active=true and p.role in ('manager','admin','engineer','payroll')\n  )"},{"schema":"public","name":"defect_submit_manual_details","args":"p_updates jsonb, p_client_session_id uuid, p_user_agent text","md5":"d38f18014d78a0a35a75a18e5ab457ea","start":407,"length":228,"replacement":"private.matrix_allowed('defect','manage',exists(\n    select 1 from public.profiles p\n    where p.user_id=v_user and p.active=true\n      and ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager') or p.role in ('defect_editor','viewer_editor'))\n  )"},{"schema":"public","name":"work_calendar_create","args":"p_name text, p_color text, p_client_session_id uuid, p_user_agent text","md5":"cd7306d9046a9a4d4ffe4c5fd75d4329","start":423,"length":131,"replacement":"private.matrix_allowed('calendar','manage',exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor','purchase')"},{"schema":"public","name":"work_calendar_save_event","args":"p_event_id uuid, p_calendar_id uuid, p_event_date date, p_title text, p_detail text, p_client_session_id uuid, p_user_agent text","md5":"4ba3b634acf2aa7d01dd04321d4e4429","start":411,"length":131,"replacement":"private.matrix_allowed('calendar','manage',exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor','purchase')"},{"schema":"public","name":"defect_register_validated_file","args":"p_server_token text, p_file_name text, p_storage_path text, p_mime_type text, p_file_size bigint, p_content_sha256 text, p_detected_rooms text[], p_validation_reason text, p_client_session_id uuid, p_user_agent text","md5":"dd68ace37e401ce2c517d5394e152665","start":575,"length":228,"replacement":"private.matrix_allowed('defect','manage',exists(\n    select 1 from public.profiles p\n    where p.user_id=v_user and p.active=true\n      and ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager') or p.role in ('defect_editor','viewer_editor'))\n  )"},{"schema":"public","name":"defect_forget_rejected_upload","args":"p_id uuid","md5":"450642134ee86133d43085ab255455d5","start":291,"length":188,"replacement":"private.matrix_allowed('defect','manage',exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager') or p.role='defect_editor')"},{"schema":"public","name":"defect_manual_update_apply","args":"p_room_no text, p_detail_text text, p_current_status text, p_status_group text, p_next_action text, p_client_session_id uuid, p_user_agent text","md5":"398b61edacfc0258fd0ad79df30d1379","start":649,"length":208,"replacement":"private.matrix_allowed('defect','manage',exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager') or p.role in ('defect_editor','viewer_editor')"},{"schema":"public","name":"work_calendar_delete","args":"p_calendar_id uuid, p_client_session_id uuid, p_user_agent text","md5":"134779b4169c61f6271935af7b16bc2a","start":378,"length":131,"replacement":"private.matrix_allowed('calendar','manage',exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor','purchase')"},{"schema":"public","name":"work_calendar_update","args":"p_calendar_id uuid, p_name text, p_color text, p_client_session_id uuid, p_user_agent text","md5":"560b9f9aeabd908ed9b1a8a7f7374961","start":369,"length":131,"replacement":"private.matrix_allowed('calendar','manage',exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor','purchase')"},{"schema":"public","name":"hotel_room_availability_save","args":"p_room_no text, p_status text, p_start_date date, p_end_date date, p_reason text, p_expected_revision integer","md5":"aeb8eff9c87b3d178cc99ab19efa3606","start":567,"length":203,"replacement":"private.matrix_allowed('hotel','manage',EXISTS (\n    SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true\n      AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')\n  )"},{"schema":"public","name":"procurement_calendar_link_delivery","args":"p_item_id uuid, p_event_key text, p_expected_delivery date, p_client_session_id uuid, p_user_agent text","md5":"b0485ca7888a358c51dd32ce1ebe5937","start":420,"length":186,"replacement":"private.matrix_allowed('procurement','manage',exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true\n    and (p.role='purchase' or (p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager')"},{"schema":"public","name":"procurement_calendar_unlink_delivery","args":"p_event_key text, p_client_session_id uuid, p_user_agent text","md5":"e02aac1c96e6a63d08664a2242be3f2c","start":365,"length":186,"replacement":"private.matrix_allowed('procurement','manage',exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true\n    and (p.role='purchase' or (p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid and p.role='manager')"},{"schema":"public","name":"work_calendar_delete_event","args":"p_event_id uuid, p_client_session_id uuid, p_user_agent text","md5":"df0af045c109a16fb33bf8b2f5e6d04b","start":398,"length":131,"replacement":"private.matrix_allowed('calendar','manage',exists(select 1 from public.profiles p where p.user_id=v_user and p.active=true and p.role in ('manager','viewer_editor','purchase')"},{"schema":"public","name":"material_tool_override_save","args":"p_item_type text, p_item_id uuid, p_status text, p_status_detail text, p_notes text, p_location text, p_responsible_person text, p_expected_updated_at timestamp with time zone","md5":"1fa27a2e6d2c4338fe522ff8fe120a4f","start":510,"length":179,"replacement":"private.matrix_allowed('materials','manage',EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=u AND p.active=true\n  AND (p.role='purchase' OR (p.role='manager' AND p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid)"},{"schema":"public","name":"hotel_work_plan_save_combine_room","args":"p_seq integer, p_day integer, p_override_date date, p_actual_date date, p_status text, p_note text, p_expected_revision integer, p_group_expected jsonb","md5":"e32e99d4175aab1fa489ac8b6aeb9038","start":691,"length":198,"replacement":"private.matrix_allowed('workplan','manage',EXISTS(\n  SELECT 1 FROM public.profiles p\n  WHERE p.user_id=v_uid AND p.active=true\n  AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')\n ))"},{"schema":"public","name":"hotel_work_plan_save_day","args":"p_day integer, p_planned_date date, p_note text, p_expected_revision integer","md5":"38e973259d33a4a3638482d687fe6be9","start":390,"length":195,"replacement":"private.matrix_allowed('workplan','manage',EXISTS (\n SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true\n AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')\n ))"},{"schema":"public","name":"hotel_work_plan_save_room","args":"p_seq integer, p_day integer, p_override_date date, p_actual_date date, p_status text, p_note text, p_expected_revision integer","md5":"c84148a405a7ab19436b06e54be87964","start":444,"length":195,"replacement":"private.matrix_allowed('workplan','manage',EXISTS (\n SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true\n AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')\n ))"}]$patchdata$::jsonb) LOOP
  SELECT p.oid,pg_get_functiondef(p.oid) INTO function_oid,definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname=patch->>'schema' AND p.proname=patch->>'name'
    AND pg_get_function_identity_arguments(p.oid)=patch->>'args';
  IF definition IS NULL OR md5(definition)<>patch->>'md5' THEN
   RAISE EXCEPTION 'PERMISSION_BASELINE_CHANGED: %',patch->>'name';
  END IF;
  EXECUTE overlay(definition placing patch->>'replacement' from (patch->>'start')::integer for (patch->>'length')::integer);
 END LOOP;
END $patch$;
ALTER POLICY "schedule_select_active" ON "public"."schedule_tasks" USING ((private.matrix_allowed('schedule','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "daily_select_active" ON "public"."daily_reports" USING ((private.matrix_allowed('reports','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "report_items_select_active" ON "public"."report_items" USING ((private.matrix_allowed('reports','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "active users read duplicate groups" ON "public"."site_operations_duplicate_groups" USING (private.matrix_can_read(ARRAY['reports','payroll'],(( SELECT private.is_active_user() AS is_active_user))));
ALTER POLICY "active users read duplicate members" ON "public"."site_operations_duplicate_members" USING (private.matrix_can_read(ARRAY['reports','payroll'],(( SELECT private.is_active_user() AS is_active_user))));
ALTER POLICY "report_photos_select_active" ON "public"."report_photos" USING (private.matrix_can_read(ARRAY['reports','presentation'],(( SELECT private.is_active_user() AS is_active_user))));
ALTER POLICY "materials_select_active" ON "public"."materials" USING ((private.matrix_allowed('materials','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "procurement_select_active" ON "public"."procurement_items" USING ((private.matrix_allowed('procurement','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "schedule_task_overrides_read_active" ON "public"."schedule_task_overrides" USING ((private.matrix_allowed('schedule','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "procurement_item_overrides_read_active" ON "public"."procurement_item_overrides" USING ((private.matrix_allowed('procurement','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "site_operations_management_reviews_read_active" ON "public"."site_operations_management_reviews" USING ((private.matrix_allowed('reports','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "defect_manual_updates_read_active" ON "public"."defect_manual_updates" USING ((private.matrix_allowed('defect','view',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true))))))));
ALTER POLICY "report_drafts_select_own" ON "public"."report_drafts" USING ((( SELECT (private.matrix_allowed('reports','view',(private.is_active_user()))) AS is_active_user) AND (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "daily_report_revisions_select_active" ON "public"."daily_report_revisions" USING ((private.matrix_allowed('reports','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "drive_photo_index_select_authenticated" ON "public"."drive_photo_index" USING (private.matrix_can_read(ARRAY['presentation','reports'],(( SELECT private.is_active_user() AS is_active_user))));
ALTER POLICY "schedule_snapshots_select_authenticated" ON "public"."schedule_task_daily_snapshots" USING ((private.matrix_allowed('schedule','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "tool_machine_select_active" ON "public"."tool_machine" USING ((private.matrix_allowed('materials','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "active users can view condo room status" ON "public"."condo_room_status" USING ((private.matrix_allowed('defect','view',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))))) OR private.matrix_allowed('hotel','view',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true))))))));
ALTER POLICY "photo_task_feedback_select_authenticated" ON "public"."photo_task_feedback" USING ((private.matrix_allowed('presentation','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "work_calendars_read_active" ON "public"."work_calendars" USING ((private.matrix_allowed('calendar','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "work_calendar_events_read_active" ON "public"."work_calendar_events" USING ((private.matrix_allowed('calendar','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "active users read labour name map" ON "public"."labour_name_map" USING ((private.matrix_allowed('payroll','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "payroll roles read payroll items" ON "public"."payroll_verification_items" USING ((private.matrix_allowed('payroll','view',((( SELECT private.is_active_user() AS is_active_user) AND ( SELECT private.has_app_role(ARRAY['manager'::text, 'admin'::text, 'engineer'::text, 'payroll'::text]) AS has_app_role))))));
ALTER POLICY "procurement_item_projects_select_active" ON "public"."procurement_item_projects" USING ((private.matrix_allowed('procurement','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "photo_ai_task_scores_select_authenticated" ON "public"."photo_ai_task_scores" USING ((private.matrix_allowed('presentation','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "defect_flow_staging_insert" ON "storage"."objects" WITH CHECK (((bucket_id = 'defect-flow-staging'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (private.matrix_allowed('defect','manage',EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (((p.user_id = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) AND (p.role = 'manager'::text)) OR (p.role = ANY (ARRAY['defect_editor'::text, 'viewer_editor'::text])))))))));
ALTER POLICY "defect_flow_staging_delete_own" ON "storage"."objects" USING (((bucket_id = 'defect-flow-staging'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (private.matrix_allowed('defect','manage',EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (((p.user_id = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) AND (p.role = 'manager'::text)) OR (p.role = ANY (ARRAY['defect_editor'::text, 'viewer_editor'::text])))))))));
ALTER POLICY "hotel_group_read_active" ON "public"."hotel_room_group_members" USING ((private.matrix_allowed('defect','view',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))))) OR private.matrix_allowed('hotel','view',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true))))))));
ALTER POLICY "hotel_availability_read_active" ON "public"."hotel_room_availability" USING ((private.matrix_allowed('hotel','view',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true))))))));
ALTER POLICY "payroll roles insert payroll records" ON "public"."payroll_verification_records" WITH CHECK (private.matrix_allowed('payroll','manage',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))))));
ALTER POLICY "payroll roles update payroll records" ON "public"."payroll_verification_records" USING (private.matrix_allowed('payroll','manage',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text])))))))) WITH CHECK (private.matrix_allowed('payroll','manage',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))))));
ALTER POLICY "payroll roles delete payroll records" ON "public"."payroll_verification_records" USING (private.matrix_allowed('payroll','manage',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))))));
ALTER POLICY "active users read labour assignments" ON "public"."labour_daily_assignments" USING (private.matrix_can_read(ARRAY['reports','payroll'],(( SELECT private.is_active_user() AS is_active_user))));
ALTER POLICY "payroll roles insert payroll items" ON "public"."payroll_verification_items" WITH CHECK (private.matrix_allowed('payroll','manage',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))))));
ALTER POLICY "payroll roles update payroll items" ON "public"."payroll_verification_items" USING (private.matrix_allowed('payroll','manage',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text])))))))) WITH CHECK (private.matrix_allowed('payroll','manage',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))))));
ALTER POLICY "payroll roles delete payroll items" ON "public"."payroll_verification_items" USING (private.matrix_allowed('payroll','manage',((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true) AND (p.role = ANY (ARRAY['manager'::text, 'engineer'::text, 'payroll'::text]))))))));
ALTER POLICY "payroll roles read payroll records" ON "public"."payroll_verification_records" USING ((private.matrix_allowed('payroll','view',((( SELECT private.is_active_user() AS is_active_user) AND ( SELECT private.has_app_role(ARRAY['manager'::text, 'admin'::text, 'engineer'::text, 'payroll'::text]) AS has_app_role))))));
ALTER POLICY "active users read labour batches" ON "public"."labour_verification_batches" USING (private.matrix_can_read(ARRAY['reports','payroll'],(( SELECT private.is_active_user() AS is_active_user))));
ALTER POLICY "material_tool_overrides_read_active" ON "public"."material_tool_web_overrides" USING ((private.matrix_allowed('materials','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "active users read labour workers" ON "public"."labour_workers" USING ((private.matrix_allowed('payroll','view',(( SELECT private.is_active_user() AS is_active_user)))));
ALTER POLICY "procurement_calendar_delivery_read" ON "public"."procurement_calendar_delivery" USING (private.matrix_can_read(ARRAY['procurement','calendar'],(( SELECT private.is_active_user() AS is_active_user))));
ALTER POLICY "procurement_item_projects_insert_manage" ON "public"."procurement_item_projects" WITH CHECK (private.matrix_allowed('procurement','manage',(((( SELECT auth.uid() AS uid) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) OR ( SELECT private.has_app_role(ARRAY['purchase'::text]) AS has_app_role)))));
ALTER POLICY "procurement_item_projects_update_manage" ON "public"."procurement_item_projects" USING (private.matrix_allowed('procurement','manage',(((( SELECT auth.uid() AS uid) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) OR ( SELECT private.has_app_role(ARRAY['purchase'::text]) AS has_app_role))))) WITH CHECK (private.matrix_allowed('procurement','manage',(((( SELECT auth.uid() AS uid) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) OR ( SELECT private.has_app_role(ARRAY['purchase'::text]) AS has_app_role)))));
ALTER POLICY "procurement_item_projects_delete_manage" ON "public"."procurement_item_projects" USING (private.matrix_allowed('procurement','manage',(((( SELECT auth.uid() AS uid) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid) OR ( SELECT private.has_app_role(ARRAY['purchase'::text]) AS has_app_role)))));
ALTER POLICY "active users read site operations" ON "public"."site_operations_entries" USING (private.matrix_can_read(ARRAY['reports','payroll'],(( SELECT private.is_active_user() AS is_active_user))));
ALTER POLICY "active users read site operations projects" ON "public"."site_operations_entry_projects" USING (private.matrix_can_read(ARRAY['reports','payroll'],(( SELECT private.is_active_user() AS is_active_user))));
ALTER POLICY "projects_select_active" ON "public"."projects" USING (private.matrix_can_read(ARRAY['dashboard','presentation'],(( SELECT private.is_active_user() AS is_active_user))));
ALTER POLICY "weekly_select_active" ON "public"."weekly_snapshots" USING (private.matrix_can_read(ARRAY['dashboard','presentation'],(( SELECT private.is_active_user() AS is_active_user))));
ALTER POLICY "site_photos_select" ON "storage"."objects" USING (((bucket_id = 'site-photos'::text) AND ( SELECT private.matrix_can_read(ARRAY['reports','presentation'],(private.is_active_user())) AS is_active_user)));
ALTER POLICY "photo_archive_staging_select_own" ON "storage"."objects" USING (((bucket_id = 'photo-archive-staging'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ( SELECT private.matrix_can_read(ARRAY['reports','presentation'],(private.is_active_user())) AS is_active_user)));
ALTER POLICY "photo_archive_staging_select_archived" ON "storage"."objects" USING (((bucket_id = 'photo-archive-staging'::text) AND ( SELECT private.matrix_can_read(ARRAY['reports','presentation'],(private.is_active_user())) AS is_active_user) AND photo_archive_staging_deletable(name)));
ALTER POLICY "drive_sync_runs_select_authenticated" ON "public"."drive_sync_runs" USING (private.matrix_can_read(ARRAY['dashboard','presentation'],(( SELECT private.is_active_user() AS is_active_user))));

ALTER POLICY "active users can view condo room status" ON public."condo_room_status" USING (private.matrix_can_read(ARRAY['defect','hotel','workplan'],((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))))));

ALTER POLICY "hotel_availability_read_active" ON public."hotel_room_availability" USING (private.matrix_can_read(ARRAY['defect','hotel','workplan'],((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))))));

ALTER POLICY "hotel_group_read_active" ON public."hotel_room_group_members" USING (private.matrix_can_read(ARRAY['defect','hotel','workplan'],((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = ( SELECT auth.uid() AS uid)) AND (p.active = true)))))));

ALTER POLICY "hotel_work_plan_day_read" ON public."hotel_work_plan_days" USING (private.matrix_can_read(ARRAY['workplan','defect'],(( SELECT private.is_active_user() AS is_active_user))));

ALTER POLICY "hotel_work_plan_room_read" ON public."hotel_work_plan_rooms" USING (private.matrix_can_read(ARRAY['workplan','defect'],(( SELECT private.is_active_user() AS is_active_user))));

ALTER POLICY "hotel_work_plan_sync_status_read" ON public."hotel_work_plan_sync_control" USING (private.matrix_can_read(ARRAY['workplan'],(( SELECT private.is_active_user() AS is_active_user))));
