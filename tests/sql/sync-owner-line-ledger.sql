\set ON_ERROR_STOP on
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
\i supabase/migrations/20261103120000_sync_owner_line_ledger_isolated.sql

DO $$
BEGIN
 IF has_function_privilege('anon','public.line_sync_owner_claim(text,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.line_sync_owner_claim(text,text,text,text)','EXECUTE')
 OR has_table_privilege('anon','line_autopilot.sync_owner_deliveries','SELECT')
 OR has_table_privilege('authenticated','line_autopilot.sync_owner_deliveries','SELECT')
 THEN RAISE EXCEPTION 'PUBLIC ACCESS EXPOSURE'; END IF;
 IF NOT has_function_privilege('service_role','public.line_sync_owner_claim(text,text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.line_sync_owner_ack(text,uuid,text,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'SERVICE RPC PERMISSION MISSING'; END IF;
END $$;
SET ROLE service_role;
DO $$
DECLARE s text; k uuid; new_key uuid;
BEGIN
 SELECT claim_status,retry_key INTO s,k FROM public.line_sync_owner_claim(
  repeat('a',64),'materials','materials:run-1','Sync completed');
 IF s IS DISTINCT FROM 'new' OR k IS NULL THEN RAISE EXCEPTION 'NEW CLAIM FAILED'; END IF;
 SELECT claim_status,retry_key INTO s,new_key FROM public.line_sync_owner_claim(
  repeat('a',64),'materials','materials:run-1','Sync completed');
 IF s IS DISTINCT FROM 'in_flight' OR k<>new_key THEN RAISE EXCEPTION 'IDEMPOTENCY FAILED'; END IF;
 IF NOT public.line_sync_owner_ack(repeat('a',64),k,'delivered',200)
 THEN RAISE EXCEPTION 'ACK FAILED'; END IF;
 SELECT claim_status,retry_key INTO s,new_key FROM public.line_sync_owner_claim(
  repeat('a',64),'materials','materials:run-1','Sync completed');
 IF s IS DISTINCT FROM 'already_sent' OR k<>new_key THEN
   RAISE EXCEPTION 'ALREADY_SENT FAILED';
 END IF;
 IF NOT public.line_sync_owner_ack(repeat('a',64),k,'delivered',200)
 THEN RAISE EXCEPTION 'ACK IDEMPOTENCY FAILED'; END IF;
 IF public.line_sync_owner_ack(repeat('a',64),k,'uncertain',429)
 THEN RAISE EXCEPTION 'DELIVERED DOWNGRADE ALLOWED'; END IF;
 SELECT claim_status,retry_key INTO s,k FROM public.line_sync_owner_claim(
  repeat('b',64),'defects','defects:run-2','Sync failed');
 IF s<>'new' THEN RAISE EXCEPTION 'SECOND RUN FAILED'; END IF;
 IF NOT public.line_sync_owner_ack(repeat('b',64),k,'uncertain',429)
 THEN RAISE EXCEPTION 'UNCERTAIN ACK FAILED'; END IF;
 SELECT claim_status,retry_key INTO s,new_key FROM public.line_sync_owner_claim(
  repeat('b',64),'defects','defects:run-2','Sync failed');
 IF s<>'in_flight' OR k<>new_key THEN
   RAISE EXCEPTION 'UNCERTAIN RESEND DUPLICATE PREVENTION FAILED';
 END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
 IF (SELECT count(*) FROM line_autopilot.sync_owner_deliveries)<>2 THEN
  RAISE EXCEPTION 'LEDGER COUNT WRONG'; END IF;
 IF (SELECT count(*) FROM line_autopilot.sync_owner_deliveries WHERE delivery_status='delivered')<>1
 OR (SELECT count(*) FROM line_autopilot.sync_owner_deliveries WHERE delivery_status='uncertain')<>1
 THEN RAISE EXCEPTION 'STATUS SUMMARY WRONG'; END IF;
END $$;
SELECT 'SYNC_OWNER_LEDGER_ISOLATED_SQL_PASS' AS acceptance;
