CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.drive_sync_key_valid(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p='isolated-fixture-only' $$;

CREATE TABLE public.condo_room_status(room_no text PRIMARY KEY,current_status text NOT NULL);
CREATE TABLE public.defect_web_overrides(
  room_no text PRIMARY KEY,source_sync_state text,source_synced_at timestamptz);
CREATE TABLE public.work_order_promotion_approvals(
  work_id text PRIMARY KEY,source_file_id text,source_modified_at timestamptz,
  approved_at timestamptz,promoted_at timestamptz,revoked_at timestamptz,
  completion_confirmed_open boolean,contractor_room_confirmed boolean,
  override_queue_checked boolean,combine_checked boolean,approval_evidence_url text);
CREATE TABLE public.defect_work_order_import_staging(
  work_id text PRIMARY KEY,source_file_id text,room_group text,
  stage_decision text,source_evidence_url text,source_master_row integer);
CREATE TABLE public.defect_work_order_snapshot(
  work_id text PRIMARY KEY,room_group text,building text,
  contractor text,defect_item text,next_action text,supervisor text,
  received_date date,due_date date,work_status text,evidence_url text,
  qa_status text,conflict_note text,source_sync_note text,
  source_modified_at timestamptz,imported_at timestamptz DEFAULT now(),
  source_active boolean DEFAULT true,
  web_completed_at timestamptz,writeback_state text);
CREATE TABLE public.work_order_promotion_audit(
  id bigserial PRIMARY KEY,work_id text NOT NULL,action text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  approval jsonb NOT NULL,previous_row jsonb,applied_row jsonb NOT NULL);

INSERT INTO public.condo_room_status(room_no,current_status)
SELECT room,CASE WHEN room='A416' THEN 'Defect เสร็จแล้ว / รอ Hotel ตรวจ'
                  ELSE 'Defect เสร็จแล้ว / รอตรวจ' END
FROM (VALUES ('A207'),('A301'),('A327'),('A416'),('A512'),('A612')) r(room);

WITH ids AS (
  SELECT 'DF-'||x.room||'-'||lpad(n::text,2,'0') wid,x.room
  FROM (VALUES ('A207',4),('A301',2),('A327',2),('A416',9),('A512',12),('A612',8))
    x(room,max_no) CROSS JOIN LATERAL generate_series(1,x.max_no) n
)
INSERT INTO public.defect_work_order_snapshot(
  work_id,room_group,building,contractor,defect_item,work_status,evidence_url,
  qa_status,source_modified_at,source_active)
SELECT wid,room,'A','3 Kings','fixture defect',
  CASE WHEN room='A327' THEN 'เสร็จแล้ว — งดแจก (รอตรวจรับ)'
       WHEN wid IN ('DF-A416-04','DF-A512-01','DF-A612-08') THEN 'HOLD รอยืนยันทีม'
       ELSE 'รอดำเนินการ' END,
  'https://drive.google.com/file/d/fixture/view',
  CASE WHEN wid IN ('DF-A416-04','DF-A512-01','DF-A612-08') THEN 'HOLD_MISSING_EVIDENCE'
       ELSE 'APPROVED_NONRETIRING' END,
  '2026-11-03 10:46:56+00',true FROM ids WHERE wid<>'DF-A207-04';

INSERT INTO public.defect_work_order_snapshot(
  work_id,room_group,building,contractor,defect_item,work_status,evidence_url,
  qa_status,source_modified_at,source_active)
VALUES('DF-B312-02','B312','B','RSE','unrelated defect','รอดำเนินการ',
       'https://drive.google.com/file/d/other/view','APPROVED_NONRETIRING',
       '2026-11-03 10:46:56+00',true);

INSERT INTO public.work_order_promotion_approvals(
  work_id,source_file_id,source_modified_at,approved_at,promoted_at,revoked_at,
  completion_confirmed_open,contractor_room_confirmed,override_queue_checked,combine_checked)
SELECT work_id,'18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
  '2026-11-03 10:46:56+00','2026-11-03 11:00:00+00',
  '2026-11-03 11:05:00+00',NULL,true,true,true,true
FROM public.defect_work_order_snapshot WHERE room_group IN
('A207','A301','A327','A416','A512','A612');

INSERT INTO public.defect_work_order_import_staging
(work_id,source_file_id,room_group,stage_decision,source_evidence_url,source_master_row)
VALUES('DF-A207-04','18P3OFYtOLsslCtDujlSQVf9IQSuplKcx','A207',
'HOLD_MISSING_EVIDENCE','https://drive.google.com/file/d/fixture/view',341);
