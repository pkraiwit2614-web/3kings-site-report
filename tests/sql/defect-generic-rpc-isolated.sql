\set ON_ERROR_STOP on
-- Synthetic 263-room fixture; no user records, production keys or live DB calls.
CREATE FUNCTION private.drive_sync_key_valid(p_key text)
RETURNS boolean LANGUAGE sql AS $$ SELECT p_key='isolated-only-test-key' $$;
CREATE TABLE public.condo_room_status (
  room_no text PRIMARY KEY,
  building text, floor integer, hotel_participation text, customer_status text,
  current_status text, status_group text, follow_up text, priority text, next_action text,
  latest_source text, source_note text, hotel_complete_color text, hotel_remarks text,
  defect_detail text, source_file_id text,source_file_name text,source_modified_at timestamptz,
  synced_at timestamptz
);
CREATE TABLE public.defect_web_overrides (
  room_no text PRIMARY KEY,
  source_sync_state text,source_synced_at timestamptz
);
CREATE TABLE public.drive_sync_runs(
  sync_type text,project_code text,source_file text,source_sheet text,
  rows_read integer,rows_written integer,status text,message text
);
WITH ids AS (
  SELECT 'A'||i::text room_no FROM generate_series(101,259) i
  UNION ALL SELECT x FROM (VALUES ('A401'),('A404'),('A405'),('B515')) v(x)
  UNION ALL SELECT 'B'||i::text FROM generate_series(101,200) i
)
INSERT INTO public.condo_room_status
(room_no,building,floor,hotel_participation,customer_status,current_status,
 status_group,follow_up,priority,next_action,defect_detail)
SELECT room_no,left(room_no,1),substring(room_no,2,1)::integer,'ไม่ร่วมโรงแรม','มีลูกค้า',
  'Pending Handover / รอลูกค้าเข้าตรวจ','Non-Hotel - Pending Handover',
  'รอดำเนินการ','ปกติ','ตรวจสอบ',
  CASE WHEN room_no='B515' THEN 'Customer Defect B515 existing'
       WHEN room_no='A401' THEN 'รายการ Defect แจ้งผ่านแชต: existing'
       ELSE NULL END
FROM ids;
DO $t$ BEGIN
  IF (SELECT count(*) FROM public.condo_room_status)<>263 OR
     (SELECT count(*) FROM public.condo_room_status WHERE building='A')<>162 OR
     (SELECT count(*) FROM public.condo_room_status WHERE building='B')<>101
  THEN RAISE EXCEPTION 'fixture count mismatch';END IF;
END $t$;

\i /tmp/generic-defect-rpc.sql

DO $t$
DECLARE p jsonb; doc text; r jsonb; swapped jsonb; doc2 text; before_copy jsonb;
BEGIN
  doc:='A404 • Art House Group Doc ID 167 • PDF 28/10/2026 • Defect ใหม่ 43 รายการ'||E'\n'||
      (SELECT string_agg('#'||lpad(i::text,2,'0')||' [PFur] verified point '||i,E'\n' ORDER BY i)
       FROM generate_series(1,43) i);
  SELECT jsonb_agg(jsonb_build_object(
    'room_no',c.room_no,'building',c.building,'floor',c.floor,
    'hotel_participation',c.hotel_participation,'customer_status',c.customer_status,
    'current_status',c.current_status,'status_group',c.status_group,
    'follow_up',c.follow_up,'priority',c.priority,'next_action',c.next_action,
    'defect_detail',CASE WHEN c.room_no IN('A404','A405') THEN doc ELSE c.defect_detail END
  ) ORDER BY c.room_no) INTO p FROM public.condo_room_status c;
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.room_no) INTO before_copy FROM public.condo_room_status c;
  r:=public.drive_sync_apply_condo_defects('bad-key',
    'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
    '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',now(),p,true);
  IF r->>'error'<>'invalid_sync_key' THEN RAISE EXCEPTION 'key bypass %',r;END IF;
  r:=public.drive_sync_apply_condo_defects('isolated-only-test-key',
    'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
    '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',now(),p,true);
  IF r->>'ok'<>'true' OR r->>'changed'<>'2' THEN
    RAISE EXCEPTION 'expected exactly two source details, got %',r;END IF;
  IF before_copy IS DISTINCT FROM
     (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.room_no) FROM public.condo_room_status c)
  THEN RAISE EXCEPTION 'dryrun mutated source';END IF;
  r:=public.drive_sync_apply_condo_defects('isolated-only-test-key',
    'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
    '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',now(),p,false);
  IF r->>'ok'<>'true' OR r->>'changed'<>'2' THEN
    RAISE EXCEPTION 'scoped 2-room import rejected %',r;END IF;
  IF (SELECT count(*) FROM public.condo_room_status WHERE room_no IN('A404','A405')
      AND defect_detail=doc AND current_status='Pending Handover / รอลูกค้าเข้าตรวจ')<>2
  THEN RAISE EXCEPTION 'Combine details or handover state mismatched';END IF;
  IF (SELECT defect_detail FROM public.condo_room_status WHERE room_no='B515')<>'Customer Defect B515 existing' OR
     (SELECT defect_detail FROM public.condo_room_status WHERE room_no='A401')<>'รายการ Defect แจ้งผ่านแชต: existing'
  THEN RAISE EXCEPTION 'B515/chat detail lost';END IF;
  r:=public.drive_sync_apply_condo_defects('isolated-only-test-key',
    'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
    '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',now(),p,false);
  IF r->>'ok'<>'true' OR r->>'changed'<>'0' THEN
    RAISE EXCEPTION 'duplicate replay not idempotent %',r;END IF;
  -- An interrupted Web writeback on either Combine room must block the full pair.
  INSERT INTO public.defect_web_overrides VALUES ('A405','pending',NULL);
  doc2:='A404 • Art House Group Doc ID 168 • PDF 29/10/2026 • Defect ใหม่ 2 รายการ'||
        E'\n#01 [MEP] verified\n#02 [Wet] verified';
  SELECT jsonb_agg(CASE WHEN x.value->>'room_no' IN ('A404','A405')
      THEN jsonb_set(x.value,'{defect_detail}',to_jsonb(doc2)) ELSE x.value END ORDER BY x.value->>'room_no')
  INTO swapped FROM jsonb_array_elements(p) AS x(value);
  r:=public.drive_sync_apply_condo_defects('isolated-only-test-key',
    'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
    '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',now(),swapped,false);
  IF r->>'ok'<>'false' OR r->>'error' NOT LIKE '%DOC167_COMBINE_WEB_OVERRIDE_PENDING%'
  THEN RAISE EXCEPTION 'pending Combine override bypass %',r;END IF;
  IF (SELECT count(*) FROM public.condo_room_status WHERE room_no IN('A404','A405')
        AND defect_detail=doc)<>2
  THEN RAISE EXCEPTION 'half pair updated despite pending override';END IF;
  DELETE FROM public.defect_web_overrides WHERE room_no='A405';
  SELECT jsonb_agg(CASE WHEN x.value->>'room_no'='A405'
       THEN jsonb_set(x.value,'{defect_detail}',to_jsonb('invalid detail'::text)) ELSE x.value END ORDER BY x.value->>'room_no')
  INTO swapped FROM jsonb_array_elements(p) AS x(value);
  r:=public.drive_sync_apply_condo_defects('isolated-only-test-key',
    'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
    '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',now(),swapped,true);
  IF r->>'ok'<>'false' OR r->>'error' NOT LIKE '%DOC167_COMBINE_PAIR_MISMATCH%' THEN
    RAISE EXCEPTION 'malformed Combine input not rejected %',r; END IF;
  RAISE NOTICE 'ISOLATED RPC REGRESSION: SOURCE/COMBINE/OVERRIDE/B515/CHAT/RETRY PASS';
END $t$;
