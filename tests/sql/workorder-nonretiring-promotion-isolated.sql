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

\i supabase/migrations/20261029173000_nonretiring_approved_work_order_promotion.sql

DO $test$
DECLARE v jsonb; r timestamptz; snap jsonb;
BEGIN
  SELECT source_modified_at INTO r FROM public.defect_work_order_import_staging WHERE work_id='DF-A401-02';
  SELECT jsonb_agg(to_jsonb(w) ORDER BY w.work_id) INTO snap FROM public.defect_work_order_snapshot w;
  v:=public.defect_work_order_promote_nonretiring_approved('bad-key','DF-A401-02',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,true);
  IF v->>'error'<>'invalid_sync_key' THEN RAISE EXCEPTION 'key bypassed %',v; END IF;
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-02',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,true);
  IF v->>'error'<>'approved_evidence_missing_or_stale'
  THEN RAISE EXCEPTION 'unapproved Work ID promoted %',v; END IF;
  IF (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.work_id) FROM public.defect_work_order_snapshot w)<>snap
  THEN RAISE EXCEPTION 'read-only preflight mutated baseline';END IF;
  INSERT INTO private.work_order_promotion_approvals
    (work_id,source_file_id,source_modified_at,approval_evidence_url,approved_by,
     completion_confirmed_open,contractor_room_confirmed,override_queue_checked,combine_checked)
  VALUES ('DF-A401-02','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,
         'https://drive.google.com/file/d/verified-approval','Approved Reviewer',
         true,true,true,true);
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-02',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,true);
  IF v->>'status'<>'DRY_RUN_APPROVED' OR v->>'production_mutation'<>'0'
  THEN RAISE EXCEPTION 'approved dryrun failed %',v;END IF;
  IF (SELECT count(*) FROM public.defect_work_order_snapshot)<>74
  THEN RAISE EXCEPTION 'dry run inserted data';END IF;
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-02',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
  IF v->>'status'<>'PROMOTED_NEW_WORK_ID' OR v->>'retired'<>'0'
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
  IF v->>'status'<>'ALREADY_PRESENT_NO_CHANGE' THEN
     RAISE EXCEPTION 'duplicate retry not idempotent %',v;END IF;
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-03',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
      (SELECT source_modified_at FROM public.defect_work_order_import_staging WHERE work_id='DF-A401-03'),false);
  IF v->>'error'<>'approved_evidence_missing_or_stale' THEN
    RAISE EXCEPTION 'second ID auto-activated %',v; END IF;
  RAISE NOTICE 'NON-RETIRING PROMOTION: APPROVAL/IDEMPOTENCE/PRESERVATION PASS';
END $test$;

DO $test$
DECLARE r timestamptz;v jsonb;
BEGIN
  SELECT source_modified_at INTO r FROM public.defect_work_order_import_staging WHERE work_id='DF-A401-04';
  INSERT INTO private.work_order_promotion_approvals
    (work_id,source_file_id,source_modified_at,approval_evidence_url,approved_by,
     completion_confirmed_open,contractor_room_confirmed,override_queue_checked,combine_checked)
  VALUES ('DF-A401-04','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,
         'https://drive.google.com/file/d/verified','Approved Reviewer',true,true,true,true);
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A401-04',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
  IF v->>'error'<>'stage_not_dispatch_eligible' THEN
    RAISE EXCEPTION 'history-only active promotion allowed %',v;END IF;
  SELECT source_modified_at INTO r FROM public.defect_work_order_import_staging WHERE work_id='DF-A404-01';
  INSERT INTO private.work_order_promotion_approvals
    (work_id,source_file_id,source_modified_at,approval_evidence_url,approved_by,
     completion_confirmed_open,contractor_room_confirmed,override_queue_checked,combine_checked)
  VALUES ('DF-A404-01','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,
         'https://drive.google.com/file/d/verified','Approved Reviewer',true,true,true,true);
  INSERT INTO public.defect_web_overrides VALUES('A405','pending',NULL);
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A404-01',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
  IF v->>'error'<>'web_override_pending' THEN
    RAISE EXCEPTION 'pending Combine override bypassed %',v; END IF;
  DELETE FROM public.defect_web_overrides;
  UPDATE public.condo_room_status SET current_status='Hotel - Checked Complete' WHERE room_no='A405';
  v:=public.defect_work_order_promote_nonretiring_approved('isolated-key-only','DF-A404-01',
      '18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',r,false);
  IF v->>'error'<>'combine_status_mismatch' THEN
    RAISE EXCEPTION 'Combine mismatch bypassed %',v;END IF;
  IF (SELECT count(*) FROM public.defect_work_order_snapshot)<>75
  THEN RAISE EXCEPTION 'rejected ID inserted';END IF;
  RAISE NOTICE 'COMBINE/OVERRIDE/HISTORY-ONLY FAIL-CLOSED PASS';
END $test$;
DO $test$ BEGIN
  IF has_function_privilege('anon','public.defect_work_order_promote_nonretiring_approved(text,text,text,timestamptz,boolean)','EXECUTE') OR
     has_function_privilege('authenticated','public.defect_work_order_promote_nonretiring_approved(text,text,text,timestamptz,boolean)','EXECUTE') OR
     has_table_privilege('anon','private.work_order_promotion_approvals','SELECT') OR
     has_table_privilege('authenticated','private.work_order_promotion_approvals','INSERT')
  THEN RAISE EXCEPTION 'RBAC/RLS exposure'; END IF;
  RAISE NOTICE 'CLIENT ROLE DENIAL PASS';
END $test$;
