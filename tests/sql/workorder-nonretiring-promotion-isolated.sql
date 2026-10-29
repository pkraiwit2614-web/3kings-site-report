\set ON_ERROR_STOP on
-- Isolated PostgreSQL 17 fixture with no Production access.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA private;
CREATE FUNCTION private.drive_sync_key_valid(p_key text)
RETURNS boolean LANGUAGE sql AS $$ SELECT p_key='isolated-key-only' $$;
CREATE TABLE public.condo_room_status (
  room_no text PRIMARY KEY,current_status text,status_group text
);
INSERT INTO public.condo_room_status VALUES
 ('A401','Pending Handover','Non-Hotel - Pending Handover'),
 ('A404','Pending Handover','Non-Hotel - Pending Handover'),
 ('A405','Pending Handover','Non-Hotel - Pending Handover');
CREATE TABLE public.defect_web_overrides(
  room_no text PRIMARY KEY,
  source_sync_state text,
  source_synced_at timestamptz
);
CREATE TABLE public.defect_work_order_snapshot(
  work_id text PRIMARY KEY,
  room_group text NOT NULL,
  building text NOT NULL,
  contractor text NOT NULL,
  defect_item text NOT NULL,
  next_action text,
  work_status text,
  evidence_url text,
  qa_status text,
  source_sync_note text,
  source_modified_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  source_active boolean NOT NULL DEFAULT true
);
INSERT INTO public.defect_work_order_snapshot
(work_id,room_group,building,contractor,defect_item,work_status,source_modified_at,source_active)
SELECT 'DF-A401-LIVE'||i,'A401','A','Pre Fur.','Existing unchanged item '||i,
       CASE WHEN i<=48 THEN 'ยังไม่เริ่ม' ELSE 'เสร็จแล้ว' END,
       now()-interval '1 day', i<=48
FROM generate_series(1,74) i;
CREATE TABLE public.defect_work_order_import_staging(
  work_id text PRIMARY KEY,
  room_group text NOT NULL,
  building text NOT NULL,
  contractor text NOT NULL,
  defect_item text NOT NULL,
  source_work_status text,
  stage_decision text NOT NULL,
  source_master_row integer NOT NULL,
  source_evidence_url text,
  source_file_id text NOT NULL,
  source_modified_at timestamptz NOT NULL,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO public.defect_work_order_import_staging
(work_id,room_group,building,contractor,defect_item,source_work_status,
 stage_decision,source_master_row,source_evidence_url,source_file_id,source_modified_at,source_payload)
VALUES
('DF-A401-02','A401','A','Pre Fur.','Verified kitchen gap','รอดำเนินการ',
 'STAGE_REVERIFY_NO_DB_WRITE',2,'https://drive.google.com/file/d/source',
 '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now()-interval '1 hour','{"next_action":"check alignment"}'::jsonb),
('DF-A401-03','A401','A','Pre Fur.','Unapproved duplicate candidate','รอดำเนินการ',
 'STAGE_REVERIFY_NO_DB_WRITE',3,'https://drive.google.com/file/d/source',
 '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now()-interval '1 hour','{}'::jsonb),
('DF-A404-01','A404/A405','A','Pre Fur.','Combine item','รอดำเนินการ',
 'STAGE_REVERIFY_NO_DB_WRITE',4,'https://drive.google.com/file/d/source',
 '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now()-interval '1 hour','{}'::jsonb),
('DF-A401-04','A401','A','3 Kings','History only','เสร็จแล้ว',
 'STAGE_HISTORY_ONLY',5,'https://drive.google.com/file/d/source',
 '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now()-interval '1 hour','{}'::jsonb);

ALTER TABLE public.defect_work_order_snapshot
 ADD COLUMN supervisor text, ADD COLUMN received_date date, ADD COLUMN due_date date,
 ADD COLUMN conflict_note text, ADD COLUMN web_completed_at timestamptz,
 ADD COLUMN web_completed_by uuid, ADD COLUMN writeback_state text, ADD COLUMN writeback_error text;
CREATE OR REPLACE FUNCTION public.defect_work_order_sync_import(p_sync_key text, p_source_file_id text, p_source_file_name text, p_source_modified_at timestamp with time zone, p_rows jsonb, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_total integer;
  v_unique integer;
  v_invalid integer;
  v_unknown_room integer;
  v_before integer;
  v_new integer;
  v_retired integer := 0;
  v_changed integer := 0;
  v_last_source timestamptz;
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_sync_key');
  END IF;
  IF encode(sha256(convert_to(coalesce(p_source_file_id,''),'UTF8')),'hex')
        IS DISTINCT FROM '962738100f241f1bde034952744f2009333a0767d9560da405692a52c67835b5'
     OR p_source_file_name IS DISTINCT FROM 'Defect_Work_Order_Updated_2026-10-15.xlsx'
  THEN
    RETURN jsonb_build_object('ok',false,'error','unapproved_work_order_source');
  END IF;
  IF p_source_modified_at IS NULL OR p_source_modified_at > now() + interval '5 minutes' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_source_modified_time');
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 300
  THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_source_row_count');
  END IF;
  -- Serialized import: one workbook version at a time.
  PERFORM pg_advisory_xact_lock(hashtext('3kings_work_order_import_v1'));
  SELECT count(*),count(DISTINCT work_id),count(*) FILTER (
    WHERE work_id IS NULL OR work_id !~ '^DF-[A-Za-z0-9()_-]+$'
       OR room_group IS NULL OR room_group !~ '[AB][0-9]{3}'
       OR building NOT IN ('A','B') OR building IS NULL
       OR left(room_group,1) IS DISTINCT FROM building
       OR nullif(btrim(contractor),'') IS NULL
       OR nullif(btrim(defect_item),'') IS NULL
       OR (evidence_url IS NOT NULL AND evidence_url <> ''
           AND evidence_url NOT LIKE 'https://drive.google.com/%')
       OR (received_date IS NOT NULL AND due_date IS NOT NULL AND due_date < received_date)
    )
  INTO v_total,v_unique,v_invalid
  FROM jsonb_to_recordset(p_rows) AS x(
    work_id text,room_group text,building text,contractor text,
    defect_item text,next_action text,supervisor text,
    received_date date,due_date date,work_status text,evidence_url text,
    qa_status text,conflict_note text,source_sync_note text
  );
  IF v_unique <> v_total OR v_invalid > 0 THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_or_duplicate_work_ids',
                              'total',v_total,'unique',v_unique,'invalid',v_invalid);
  END IF;
  -- Every member of each listed room/group must exist in the 263-room master.
  SELECT count(*) INTO v_unknown_room
  FROM jsonb_to_recordset(p_rows) x(room_group text)
  CROSS JOIN LATERAL regexp_matches(x.room_group,'[AB][0-9]{3}','g') AS matched(room_token)
  WHERE NOT EXISTS (SELECT 1 FROM public.condo_room_status c WHERE c.room_no=matched.room_token[1]);
  IF v_unknown_room <> 0 THEN
    RETURN jsonb_build_object('ok',false,'error','unknown_room_in_source','count',v_unknown_room);
  END IF;
  SELECT count(*) INTO v_before
  FROM public.defect_work_order_snapshot WHERE source_active;
  -- Do not silently archive most dispatch records if the workbook is partial.
  IF v_before >= 10 AND v_total < ceil(v_before * 0.65) THEN
    RETURN jsonb_build_object('ok',false,'error','large_source_drop_requires_review',
                              'previous',v_before,'incoming',v_total);
  END IF;
  SELECT max(source_modified_at) INTO v_last_source
  FROM public.defect_work_order_snapshot;
  IF v_last_source IS NOT NULL AND p_source_modified_at < v_last_source THEN
    RETURN jsonb_build_object('ok',false,'error','stale_excel_revision');
  END IF;
  SELECT count(*) INTO v_new FROM jsonb_to_recordset(p_rows) r(work_id text)
  WHERE NOT EXISTS (SELECT 1 FROM public.defect_work_order_snapshot w WHERE w.work_id=r.work_id);
  IF p_dry_run THEN
    RETURN jsonb_build_object('ok',true,'dry_run',true,'rows',v_total,
                              'new_ids',v_new,'currently_active',v_before);
  END IF;

  WITH incoming AS (
    SELECT work_id FROM jsonb_to_recordset(p_rows) AS x(work_id text)
  )
  UPDATE public.defect_work_order_snapshot w
     SET source_active=false,imported_at=now(),source_modified_at=p_source_modified_at
   WHERE w.source_active AND NOT EXISTS
     (SELECT 1 FROM incoming i WHERE i.work_id=w.work_id);
  GET DIAGNOSTICS v_retired = ROW_COUNT;

  INSERT INTO public.defect_work_order_snapshot AS w(
    work_id,room_group,building,contractor,defect_item,next_action,
    supervisor,received_date,due_date,work_status,evidence_url,qa_status,
    conflict_note,source_sync_note,source_modified_at,imported_at,source_active
  )
  SELECT x.work_id,x.room_group,x.building,x.contractor,x.defect_item,x.next_action,
    x.supervisor,x.received_date,x.due_date,x.work_status,x.evidence_url,x.qa_status,
    x.conflict_note,x.source_sync_note,p_source_modified_at,now(),true
  FROM jsonb_to_recordset(p_rows) AS x(
    work_id text,room_group text,building text,contractor text,
    defect_item text,next_action text,supervisor text,
    received_date date,due_date date,work_status text,evidence_url text,
    qa_status text,conflict_note text,source_sync_note text
  )
  ON CONFLICT (work_id) DO UPDATE SET
    room_group=excluded.room_group,building=excluded.building,
    contractor=excluded.contractor,defect_item=excluded.defect_item,
    next_action=excluded.next_action,supervisor=excluded.supervisor,
    received_date=excluded.received_date,due_date=excluded.due_date,
    work_status=CASE WHEN w.web_completed_at IS NOT NULL THEN 'เสร็จแล้ว' ELSE excluded.work_status END,evidence_url=excluded.evidence_url,
    qa_status=excluded.qa_status,conflict_note=excluded.conflict_note,
    source_sync_note=excluded.source_sync_note,
    source_modified_at=excluded.source_modified_at,imported_at=now(),source_active=true
  WHERE ROW(w.room_group,w.building,w.contractor,w.defect_item,w.next_action,w.supervisor,
            w.received_date,w.due_date,w.work_status,w.evidence_url,w.qa_status,
            w.conflict_note,w.source_sync_note,w.source_active)
        IS DISTINCT FROM
        ROW(excluded.room_group,excluded.building,excluded.contractor,excluded.defect_item,
            excluded.next_action,excluded.supervisor,excluded.received_date,excluded.due_date,
            CASE WHEN w.web_completed_at IS NOT NULL THEN 'เสร็จแล้ว' ELSE excluded.work_status END,excluded.evidence_url,excluded.qa_status,
            excluded.conflict_note,excluded.source_sync_note, true);
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'dry_run',false,'rows',v_total,
                            'changed',v_changed,'retired',v_retired,
                            'active_total',(SELECT count(*) FROM public.defect_work_order_snapshot WHERE source_active));
END;
$function$
;
\i supabase/migrations/20261029173000_nonretiring_approved_work_order_promotion.sql

DO $test$
DECLARE v jsonb; r timestamptz; snap jsonb;
BEGIN
  SELECT source_modified_at INTO r FROM public.defect_work_order_import_staging WHERE work_id='DF-A401-02';
  SELECT jsonb_agg(to_jsonb(w) ORDER BY w.work_id) INTO snap FROM public.defect_work_order_snapshot w;
  v:=public.defect_work_order_promote_nonretiring_approved('bad-key','DF-A401-02',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,true);
  IF v->>'error' IS DISTINCT FROM 'invalid_sync_key' THEN RAISE EXCEPTION 'key bypassed %',v; END IF;
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-02',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,true);
  IF v->>'error' IS DISTINCT FROM 'approved_evidence_missing_or_stale'
  THEN RAISE EXCEPTION 'unapproved Work ID promoted %',v; END IF;
  IF (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.work_id) FROM public.defect_work_order_snapshot w)<>snap
  THEN RAISE EXCEPTION 'read-only preflight mutated baseline';END IF;
  INSERT INTO public.work_order_promotion_approvals
    (work_id,source_file_id,source_modified_at,approval_evidence_url,approved_by,
     completion_confirmed_open,contractor_room_confirmed,override_queue_checked,combine_checked,approved_stage_snapshot)
  VALUES ('DF-A401-02','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,
         'https://drive.google.com/file/d/verified-approval','Approved Reviewer',
         true,true,true,true,(SELECT to_jsonb(s) FROM public.defect_work_order_import_staging s WHERE work_id='DF-A401-02'));
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-02',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,true);
  IF v->>'status' IS DISTINCT FROM 'DRY_RUN_APPROVED' OR v->>'production_mutation' IS DISTINCT FROM '0'
  THEN RAISE EXCEPTION 'approved dryrun failed %',v;END IF;
  IF (SELECT count(*) FROM public.defect_work_order_snapshot)<>74
  THEN RAISE EXCEPTION 'dry run inserted data';END IF;
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-02',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
  IF v->>'status' IS DISTINCT FROM 'PROMOTED_NEW_WORK_ID' OR v->>'retired' IS DISTINCT FROM '0'
  THEN RAISE EXCEPTION 'approved promotion failed %',v;END IF;
  IF (SELECT count(*) FROM public.defect_work_order_snapshot)<>75 OR
     (SELECT count(*) FROM public.defect_work_order_snapshot WHERE source_active)<>49 OR
     (SELECT count(*) FROM public.defect_work_order_snapshot WHERE NOT source_active)<>26
  THEN RAISE EXCEPTION 'nonretiring baseline invariant failed';END IF;
  IF (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.work_id)
        FROM public.defect_work_order_snapshot w WHERE work_id<>'DF-A401-02')<>snap
  THEN RAISE EXCEPTION 'existing Work ID content changed';END IF;
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-02',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
  IF v->>'status' IS DISTINCT FROM 'ALREADY_PRESENT_NO_CHANGE' THEN
     RAISE EXCEPTION 'duplicate retry not idempotent %',v;END IF;
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-03',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
      (SELECT source_modified_at FROM public.defect_work_order_import_staging WHERE work_id='DF-A401-03'),false);
  IF v->>'error' IS DISTINCT FROM 'approved_evidence_missing_or_stale' THEN
    RAISE EXCEPTION 'second ID auto-activated %',v; END IF;
  RAISE NOTICE 'NON-RETIRING PROMOTION: APPROVAL/IDEMPOTENCE/PRESERVATION PASS';
END $test$;

DO $test$
DECLARE r timestamptz;v jsonb;
BEGIN
  SELECT source_modified_at INTO r FROM public.defect_work_order_import_staging WHERE work_id='DF-A401-04';
  INSERT INTO public.work_order_promotion_approvals
    (work_id,source_file_id,source_modified_at,approval_evidence_url,approved_by,
     completion_confirmed_open,contractor_room_confirmed,override_queue_checked,combine_checked,approved_stage_snapshot)
  VALUES ('DF-A401-04','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,
         'https://drive.google.com/file/d/verified','Approved Reviewer',true,true,true,true,(SELECT to_jsonb(s) FROM public.defect_work_order_import_staging s WHERE work_id='DF-A401-04'));
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-04',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
  IF v->>'error' IS DISTINCT FROM 'stage_not_dispatch_eligible' THEN
    RAISE EXCEPTION 'history-only active promotion allowed %',v;END IF;
  SELECT source_modified_at INTO r FROM public.defect_work_order_import_staging WHERE work_id='DF-A404-01';
  INSERT INTO public.work_order_promotion_approvals
    (work_id,source_file_id,source_modified_at,approval_evidence_url,approved_by,
     completion_confirmed_open,contractor_room_confirmed,override_queue_checked,combine_checked,approved_stage_snapshot)
  VALUES ('DF-A404-01','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,
         'https://drive.google.com/file/d/verified','Approved Reviewer',true,true,true,true,(SELECT to_jsonb(s) FROM public.defect_work_order_import_staging s WHERE work_id='DF-A404-01'));
  INSERT INTO public.defect_web_overrides VALUES('A405','pending',NULL);
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A404-01',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
  IF v->>'error' IS DISTINCT FROM 'web_override_pending' THEN
    RAISE EXCEPTION 'pending Combine override bypassed %',v; END IF;
  DELETE FROM public.defect_web_overrides;
  UPDATE public.condo_room_status SET current_status='Hotel - Checked Complete' WHERE room_no='A405';
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A404-01',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
  IF v->>'error' IS DISTINCT FROM 'combine_status_mismatch' THEN
    RAISE EXCEPTION 'Combine mismatch bypassed %',v;END IF;
  IF (SELECT count(*) FROM public.defect_work_order_snapshot)<>75
  THEN RAISE EXCEPTION 'rejected ID inserted';END IF;
  RAISE NOTICE 'COMBINE/OVERRIDE/HISTORY-ONLY FAIL-CLOSED PASS';
END $test$;
DO $test$ BEGIN
  IF has_function_privilege('anon','public.defect_work_order_promote_nonretiring_approved(text,text,text,timestamptz,boolean)','EXECUTE') OR
     has_function_privilege('authenticated','public.defect_work_order_promote_nonretiring_approved(text,text,text,timestamptz,boolean)','EXECUTE') OR
     has_table_privilege('anon','public.work_order_promotion_approvals','SELECT') OR
     has_table_privilege('authenticated','public.work_order_promotion_approvals','INSERT')
  THEN RAISE EXCEPTION 'RBAC/RLS exposure'; END IF;
  RAISE NOTICE 'CLIENT ROLE DENIAL PASS';
END $test$;

-- A promotion must survive the next REAL legacy importer, including a stale dispatch copy.
DO $test$
DECLARE payload jsonb; v jsonb; prior jsonb;
BEGIN
 SELECT to_jsonb(w) INTO prior FROM public.defect_work_order_snapshot w WHERE work_id='DF-A401-02';
 SELECT jsonb_agg(to_jsonb(w)) INTO payload FROM public.defect_work_order_snapshot w WHERE work_id<>'DF-A401-02' AND source_active;
 v:=public.defect_work_order_sync_import('isolated-key-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
   'Defect_Work_Order_Updated_2026-10-15.xlsx',now(),payload,false);
 IF NOT coalesce((v->>'ok')::boolean,false) THEN RAISE EXCEPTION 'legacy replay failed %',v; END IF;
 IF (SELECT to_jsonb(w) FROM public.defect_work_order_snapshot w WHERE work_id='DF-A401-02') IS DISTINCT FROM prior
 THEN RAISE EXCEPTION 'PROMOTED_ID_CHANGED_BY_NEXT_LEGACY_IMPORT'; END IF;
 payload:=payload||jsonb_build_array(prior||jsonb_build_object('contractor','stale assignment','work_status','เสร็จแล้ว','defect_item','stale text'));
 v:=public.defect_work_order_sync_import('isolated-key-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
   'Defect_Work_Order_Updated_2026-10-15.xlsx',now(),payload,false);
 IF NOT coalesce((v->>'ok')::boolean,false) THEN RAISE EXCEPTION 'legacy collision replay failed %',v; END IF;
 IF (SELECT to_jsonb(w) FROM public.defect_work_order_snapshot w WHERE work_id='DF-A401-02') IS DISTINCT FROM prior
 THEN RAISE EXCEPTION 'PROMOTED_ID_OVERWRITTEN_BY_STALE_DISPATCH'; END IF;
 RAISE NOTICE 'PROMOTION SURVIVES SUBSEQUENT LEGACY IMPORT';
END $test$;

DO $test$
DECLARE v jsonb; r timestamptz; before_row jsonb;
BEGIN
 SELECT source_modified_at INTO r FROM public.defect_work_order_import_staging WHERE work_id='DF-A401-03';
 INSERT INTO public.work_order_promotion_approvals
 (work_id,source_file_id,source_modified_at,approval_evidence_url,approved_by,
 completion_confirmed_open,contractor_room_confirmed,override_queue_checked,combine_checked,approved_stage_snapshot)
 SELECT work_id,source_file_id,source_modified_at,'https://drive.google.com/file/d/verified','Reviewer',
 true,true,true,true,to_jsonb(s) FROM public.defect_work_order_import_staging s WHERE work_id='DF-A401-03';
 v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-03','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,NULL);
 IF v->>'status' IS DISTINCT FROM 'DRY_RUN_APPROVED' OR EXISTS(SELECT 1 FROM public.defect_work_order_snapshot WHERE work_id='DF-A401-03') THEN RAISE EXCEPTION 'NULL dryrun wrote data %',v; END IF;
 UPDATE public.defect_work_order_import_staging SET defect_item='changed after approval' WHERE work_id='DF-A401-03';
 v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-03','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
 IF v->>'error' IS DISTINCT FROM 'approved_stage_content_changed' THEN RAISE EXCEPTION 'content drift bypassed %',v; END IF;
 SELECT to_jsonb(w) INTO before_row FROM public.defect_work_order_snapshot w WHERE work_id='DF-A401-LIVE1';
 INSERT INTO public.work_order_promotion_approvals
 (work_id,source_file_id,source_modified_at,approval_evidence_url,approved_by,
 completion_confirmed_open,contractor_room_confirmed,override_queue_checked,combine_checked,
 approved_stage_snapshot,approved_fields,expected_snapshot_hash)
 SELECT 'DF-A401-LIVE1',source_file_id,source_modified_at,'https://drive.google.com/file/d/verified','Reviewer',
 true,true,true,true,to_jsonb(s)||jsonb_build_object('work_id','DF-A401-LIVE1'),
 '{"defect_item":"Verified corrected detail"}'::jsonb,'wrong'
 FROM public.defect_work_order_import_staging s WHERE work_id='DF-A401-02';
 v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-LIVE1','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
 IF v->>'error' IS DISTINCT FROM 'existing_record_version_or_mapping_conflict' THEN RAISE EXCEPTION 'version bypass %',v; END IF;
 UPDATE public.work_order_promotion_approvals SET expected_snapshot_hash=md5(before_row::text) WHERE work_id='DF-A401-LIVE1';
 v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-LIVE1','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
 IF v->>'status' IS DISTINCT FROM 'UPDATED_APPROVED_FIELDS' THEN RAISE EXCEPTION 'approved update failed %',v; END IF;
 IF (SELECT to_jsonb(w)-'defect_item'-'source_modified_at' FROM public.defect_work_order_snapshot w WHERE work_id='DF-A401-LIVE1') IS DISTINCT FROM (before_row-'defect_item'-'source_modified_at') THEN RAISE EXCEPTION 'update touched unrelated fields'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.work_order_promotion_audit WHERE work_id='DF-A401-LIVE1' AND previous_row=before_row) THEN RAISE EXCEPTION 'history missing'; END IF;
 v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-LIVE1','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
 IF v->>'status' IS DISTINCT FROM 'ALREADY_PRESENT_NO_CHANGE' THEN RAISE EXCEPTION 'update retry not idempotent %',v; END IF;
 UPDATE public.work_order_promotion_approvals SET approved_fields='{"contractor":"Unapproved"}',last_applied_hash=NULL WHERE work_id='DF-A401-LIVE1';
 v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-LIVE1','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
 IF v->>'error' IS DISTINCT FROM 'unapproved_update_fields' THEN RAISE EXCEPTION 'assignment bypass %',v; END IF;
 UPDATE public.work_order_promotion_approvals SET approved_fields='{"defect_item":"new"}' WHERE work_id='DF-A401-LIVE1';
 UPDATE public.defect_work_order_snapshot SET source_active=false WHERE work_id='DF-A401-LIVE1';
 v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-LIVE1','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
 IF v->>'error' IS DISTINCT FROM 'closed_or_inactive_preserved' THEN RAISE EXCEPTION 'inactive bypass %',v; END IF;
 RAISE NOTICE 'PINNED CONTENT / APPROVED FIELD UPDATE / HISTORY / NULL DRYRUN PASS';
END $test$;

-- Separate backend proves fail-closed NOWAIT behavior without Production access.
CREATE EXTENSION dblink;
SELECT dblink_connect('writer','host=127.0.0.1 dbname=workorder_qa user=postgres password=isolated-only');
SELECT dblink_exec('writer','BEGIN');
SELECT dblink_exec('writer','LOCK TABLE public.defect_work_order_snapshot IN EXCLUSIVE MODE');
DO $test$
DECLARE v jsonb;
BEGIN
 v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-02',
 '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',(SELECT source_modified_at FROM public.work_order_promotion_approvals WHERE work_id='DF-A401-02'),false);
 IF v->>'error' IS DISTINCT FROM 'concurrent_work_order_writer' THEN RAISE EXCEPTION 'concurrent writer bypass %',v; END IF;
END $test$;
SELECT dblink_exec('writer','ROLLBACK');
SELECT dblink_disconnect('writer');

DO $test$
DECLARE payload jsonb; v jsonb; baseline jsonb;
BEGIN
 INSERT INTO public.defect_work_order_snapshot
 SELECT (jsonb_populate_record(NULL::public.defect_work_order_snapshot,
 to_jsonb(w)||jsonb_build_object('work_id','DF-A401-MANAGED'||i,'source_active',true))).*
 FROM public.defect_work_order_snapshot w CROSS JOIN generate_series(1,32) i WHERE w.work_id='DF-A401-02';
 INSERT INTO public.work_order_promotion_approvals
 SELECT (jsonb_populate_record(NULL::public.work_order_promotion_approvals,
 to_jsonb(a)||jsonb_build_object('work_id','DF-A401-MANAGED'||i))).*
 FROM public.work_order_promotion_approvals a CROSS JOIN generate_series(1,32) i WHERE a.work_id='DF-A401-02';
 SELECT jsonb_agg(to_jsonb(w) ORDER BY work_id) INTO baseline FROM public.defect_work_order_snapshot w;
 SELECT jsonb_agg(to_jsonb(w)) INTO payload FROM public.defect_work_order_snapshot w
 WHERE work_id LIKE 'DF-A401-MANAGED%' OR work_id='DF-A401-LIVE2';
 v:=public.defect_work_order_sync_import('isolated-key-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
 'Defect_Work_Order_Updated_2026-10-15.xlsx',now(),payload,false);
 IF v->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'managed incoming bypasses missing legacy guard %',v; END IF;
 IF (SELECT jsonb_agg(to_jsonb(w) ORDER BY work_id) FROM public.defect_work_order_snapshot w) IS DISTINCT FROM baseline THEN RAISE EXCEPTION 'rejected partial workbook mutated rows'; END IF;
 SELECT jsonb_agg(to_jsonb(w)) INTO payload FROM public.defect_work_order_snapshot w
 WHERE source_active AND work_id NOT LIKE 'DF-A401-MANAGED%' AND work_id<>'DF-A401-02';
 v:=public.defect_work_order_sync_import('isolated-key-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
 'Defect_Work_Order_Updated_2026-10-15.xlsx',now(),payload,false);
 IF v->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'managed retention falsely blocks full legacy workbook %',v; END IF;
 IF (SELECT count(*) FROM public.defect_work_order_snapshot WHERE work_id LIKE 'DF-A401-MANAGED%' AND source_active)<>32 THEN RAISE EXCEPTION 'managed IDs retired'; END IF;
 RAISE NOTICE 'MANAGED COUNTS CANNOT MASK MISSING LEGACY ROWS PASS';
END $test$;

ALTER TABLE public.defect_work_order_import_staging ADD COLUMN staged_at timestamptz DEFAULT now();
CREATE OR REPLACE FUNCTION public.defect_work_order_nonretiring_stage_import(p_sync_key text, p_source_file_id text, p_source_modified_at timestamp with time zone, p_rows jsonb, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_total integer;v_unique integer;v_invalid integer;v_unknown integer;
        v_new integer;v_changed integer:=0;v_before integer;v_active integer;
        v_retired integer;v_source_last timestamptz;
begin
 if not private.drive_sync_key_valid(p_sync_key)
 then return jsonb_build_object('ok',false,'error','invalid_sync_key');end if;
 if p_source_file_id is distinct from '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx'
 then return jsonb_build_object('ok',false,'error','unapproved_source');end if;
 if p_source_modified_at is null or p_source_modified_at>now()+interval '5 minutes'
 then return jsonb_build_object('ok',false,'error','invalid_source_time');end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<>82
 then return jsonb_build_object('ok',false,'error','expected_82_master_only_rows');end if;
 perform pg_advisory_xact_lock(hashtext('3kings_work_order_stage_import_v1'));
 select count(*),count(distinct work_id),count(*) filter (where
    work_id is null or work_id !~ '^DF-[A-Za-z0-9()_-]+$'
    or room_group is null or room_group !~ '[AB][0-9]{3}'
    or building not in ('A','B') or left(room_group,1) is distinct from building
    or nullif(btrim(contractor),'') is null or nullif(btrim(defect_item),'') is null
    or source_master_row is null or source_master_row<=0
    or stage_decision not in
       ('STAGE_REVERIFY_NO_DB_WRITE','STAGE_HISTORY_ONLY','HOLD_MISSING_EVIDENCE','DENY_DISPATCH')
 ) into v_total,v_unique,v_invalid
 from jsonb_to_recordset(p_rows) as r(work_id text,room_group text,building text,
    contractor text,defect_item text,source_master_row integer,stage_decision text);
 if v_unique<>82 or v_invalid>0 then
   return jsonb_build_object('ok',false,'error','invalid_or_duplicate_source', 'invalid',v_invalid);
 end if;
 select count(*) into v_unknown
 from jsonb_to_recordset(p_rows) r(room_group text)
 cross join lateral regexp_matches(r.room_group,'[AB][0-9]{3}','g') m(room)
 where not exists(select 1 from public.condo_room_status c where c.room_no=m.room[1]);
 if v_unknown<>0 then
   return jsonb_build_object('ok',false,'error','unknown_room','count',v_unknown);
 end if;
 -- STOP if the 82 include an existing Work ID: this is only the independently reconciled master-only set.
 select count(*) into v_before from jsonb_to_recordset(p_rows) r(work_id text)
 inner join public.defect_work_order_snapshot w using(work_id);
 if v_before>0 then
  return jsonb_build_object('ok',false,'error','source_no_longer_master_only','matched',v_before);
 end if;
 select count(*) filter(where source_active),count(*) filter(where not source_active)
 into v_active,v_retired from public.defect_work_order_snapshot;
 select max(source_modified_at) into v_source_last from public.defect_work_order_import_staging;
 if v_source_last is not null and p_source_modified_at<v_source_last then
  return jsonb_build_object('ok',false,'error','stale_source');
 end if;
 select count(*) into v_new from jsonb_to_recordset(p_rows) r(work_id text)
 where not exists(select 1 from public.defect_work_order_import_staging s where s.work_id=r.work_id);
 if p_dry_run then
  return jsonb_build_object('ok',true,'dry_run',true,'source_rows',82,
    'would_stage_new',v_new,'production_active_unchanged',v_active,
    'production_inactive_unchanged',v_retired,'production_mutation',0);
 end if;
 insert into public.defect_work_order_import_staging as s
  (work_id,room_group,building,contractor,defect_item,source_work_status,stage_decision,
   source_master_row,source_evidence_url,source_file_id,source_modified_at,source_payload)
 select work_id,room_group,building,contractor,defect_item,source_work_status,stage_decision,
   source_master_row,source_evidence_url,p_source_file_id,p_source_modified_at,payload
 from jsonb_to_recordset(p_rows) as r(work_id text,room_group text,building text,
   contractor text,defect_item text,source_work_status text,stage_decision text,
   source_master_row integer,source_evidence_url text,payload jsonb)
 on conflict(work_id) do update set
   room_group=excluded.room_group,building=excluded.building,
   contractor=excluded.contractor,defect_item=excluded.defect_item,
   source_work_status=excluded.source_work_status,stage_decision=excluded.stage_decision,
   source_master_row=excluded.source_master_row,source_evidence_url=excluded.source_evidence_url,
   source_modified_at=excluded.source_modified_at,source_payload=excluded.source_payload,
   staged_at=now()
 where row(s.room_group,s.building,s.contractor,s.defect_item,s.source_work_status,
           s.stage_decision,s.source_master_row,s.source_evidence_url,s.source_modified_at,
           s.source_payload)
 is distinct from
 row(excluded.room_group,excluded.building,excluded.contractor,excluded.defect_item,
     excluded.source_work_status,excluded.stage_decision,excluded.source_master_row,
     excluded.source_evidence_url,excluded.source_modified_at,excluded.source_payload);
 get diagnostics v_changed = row_count;
 if (select count(*) from public.defect_work_order_snapshot where source_active)<>v_active or
    (select count(*) from public.defect_work_order_snapshot where not source_active)<>v_retired
 then raise exception 'production_status_changed_during_staging'; end if;
 return jsonb_build_object('ok',true,'staged',82,'changed',v_changed,
    'production_mutation',0,'active_unchanged',v_active,'inactive_unchanged',v_retired);
end $function$
;
\i supabase/migrations/20261029220000_verified_work_order_source_deltas.sql
DO $test$
DECLARE rows jsonb;v jsonb;baseline jsonb;
BEGIN
 INSERT INTO public.condo_room_status VALUES('B706','Handover Complete','Non-Hotel - Handover Complete');
 SELECT jsonb_agg(to_jsonb(w) ORDER BY work_id) INTO baseline FROM public.defect_work_order_snapshot w;
 rows:=jsonb_build_array(jsonb_build_object('work_id','DF-B706-01','room_group','B706','building','B','contractor','RSE',
 'defect_item','Reported drain leak','source_work_status','รอดำเนินการ','stage_decision','STAGE_REVERIFY_NO_DB_WRITE',
 'source_master_row',148,'source_evidence_url','https://drive.google.com/file/d/verified','payload','{"next_action":"Inspect and repair"}'::jsonb));
 v:=public.defect_work_order_nonretiring_stage_import(NULL,'18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now(),rows,false);
 IF v->>'error' IS DISTINCT FROM 'invalid_sync_key' THEN RAISE EXCEPTION 'NULL key accepted %',v;END IF;
 v:=public.defect_work_order_nonretiring_stage_import('isolated-key-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now(),rows,NULL);
 IF v->>'dry_run' IS DISTINCT FROM 'true' OR EXISTS(SELECT 1 FROM public.defect_work_order_import_staging WHERE work_id='DF-B706-01') THEN RAISE EXCEPTION 'NULL dryrun wrote staging %',v;END IF;
 v:=public.defect_work_order_nonretiring_stage_import('isolated-key-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now(),rows,false);
 IF v->>'staged' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'one verified delta rejected %',v;END IF;
 v:=public.defect_work_order_nonretiring_stage_import('isolated-key-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now(),rows||rows,false);
 IF v->>'error' IS DISTINCT FROM 'invalid_or_duplicate_source' THEN RAISE EXCEPTION 'duplicate accepted %',v;END IF;
 v:=public.defect_work_order_nonretiring_stage_import('isolated-key-only','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',now(),'[]'::jsonb,false);
 IF v->>'error' IS DISTINCT FROM 'invalid_source_row_count' THEN RAISE EXCEPTION 'empty source accepted %',v;END IF;
 IF (SELECT jsonb_agg(to_jsonb(w) ORDER BY work_id) FROM public.defect_work_order_snapshot w) IS DISTINCT FROM baseline THEN RAISE EXCEPTION 'staging changed Production';END IF;
 RAISE NOTICE 'GENERIC BOUNDED STAGING / NULL KEY / NULL DRYRUN / DUPLICATE / SNAPSHOT PRESERVATION PASS';
END $test$;

DO $test$
DECLARE v jsonb;r timestamptz;
BEGIN
 UPDATE public.defect_work_order_import_staging SET source_payload=source_payload||
 '{"received_date":"2026-10-29","due_date":"2026-11-05","supervisor":"Verified PIC"}'::jsonb WHERE work_id='DF-B706-01';
 SELECT source_modified_at INTO r FROM public.defect_work_order_import_staging WHERE work_id='DF-B706-01';
 INSERT INTO public.work_order_promotion_approvals
 (work_id,source_file_id,source_modified_at,approval_evidence_url,approved_by,completion_confirmed_open,
 contractor_room_confirmed,override_queue_checked,combine_checked,approved_stage_snapshot)
 SELECT work_id,source_file_id,source_modified_at,'https://drive.google.com/file/d/verified','Reviewer',
 true,true,true,true,to_jsonb(s) FROM public.defect_work_order_import_staging s WHERE work_id='DF-B706-01';
 v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-B706-01',
 '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
 IF v->>'status' IS DISTINCT FROM 'PROMOTED_NEW_WORK_ID' THEN RAISE EXCEPTION 'dated new ID failed %',v;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.defect_work_order_snapshot WHERE work_id='DF-B706-01'
 AND received_date='2026-10-29'::date AND due_date='2026-11-05'::date AND supervisor='Verified PIC') THEN RAISE EXCEPTION 'notice metadata lost';END IF;
 IF (SELECT status_group FROM public.condo_room_status WHERE room_no='B706') IS DISTINCT FROM 'Non-Hotel - Handover Complete' THEN RAISE EXCEPTION 'handover status changed';END IF;
 RAISE NOTICE 'APPROVED NOTICE / SEVEN-DAY DUE / PIC METADATA PRESERVED; HANDOVER UNCHANGED PASS';
END $test$;
