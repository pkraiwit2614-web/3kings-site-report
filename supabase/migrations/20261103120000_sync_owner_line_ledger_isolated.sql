-- 3 Kings owner Sync-only delivery ledger. Separate from existing Daily LINE ledger.
-- STAGED migration: do NOT apply to Production until isolated PostgreSQL + SOP 16 QA.
BEGIN;
CREATE SCHEMA IF NOT EXISTS line_autopilot;
CREATE TABLE IF NOT EXISTS line_autopilot.sync_owner_deliveries (
  event_key text PRIMARY KEY CHECK (event_key ~ '^[0-9a-f]{64}$'),
  pipeline text NOT NULL CHECK (pipeline IN
    ('defects','materials','schedule','photos','work_order','hotel_work_plan',
     'express','daily_site_report')),
  run_key text NOT NULL CHECK (run_key ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 4 AND 600),
  retry_key uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  delivery_status text NOT NULL DEFAULT 'claimed'
    CHECK (delivery_status IN ('claimed','delivered','uncertain')),
  last_http_status integer CHECK
    (last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  delivered_at timestamptz,
  UNIQUE (pipeline,run_key)
);
ALTER TABLE line_autopilot.sync_owner_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE line_autopilot.sync_owner_deliveries
  FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA line_autopilot TO service_role;
GRANT SELECT,INSERT,UPDATE ON line_autopilot.sync_owner_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.line_sync_owner_claim(
 p_event_key text,p_pipeline text,p_run_key text,p_summary text)
RETURNS TABLE(claim_status text,retry_key uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $$
DECLARE v_key uuid; v_state text;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$'
 OR p_run_key IS NULL OR p_run_key !~ '^[A-Za-z0-9_.:-]{1,160}$'
 OR p_pipeline IS NULL OR p_pipeline NOT IN
   ('defects','materials','schedule','photos','work_order','hotel_work_plan',
    'express','daily_site_report')
 OR p_summary IS NULL OR char_length(p_summary) NOT BETWEEN 4 AND 600 THEN
  RAISE EXCEPTION 'Invalid owner Sync delivery claim' USING errcode='22023';
 END IF;
 INSERT INTO line_autopilot.sync_owner_deliveries
    (event_key,pipeline,run_key,summary)
 VALUES(p_event_key,p_pipeline,p_run_key,p_summary)
 ON CONFLICT(event_key) DO NOTHING
 RETURNING line_autopilot.sync_owner_deliveries.retry_key INTO v_key;
 IF v_key IS NOT NULL THEN
   RETURN QUERY SELECT 'new'::text,v_key; RETURN;
 END IF;
 SELECT d.retry_key,d.delivery_status INTO v_key,v_state
 FROM line_autopilot.sync_owner_deliveries d
 WHERE d.event_key=p_event_key AND d.pipeline=p_pipeline AND d.run_key=p_run_key;
 IF v_key IS NULL THEN
   RAISE EXCEPTION 'Conflict between event key and run identity' USING errcode='23505';
 END IF;
 RETURN QUERY SELECT
   (CASE WHEN v_state='delivered' THEN 'already_sent'
         ELSE 'in_flight' END)::text,v_key;
END $$;
REVOKE ALL ON FUNCTION public.line_sync_owner_claim(text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.line_sync_owner_claim(text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.line_sync_owner_ack(
 p_event_key text,p_retry_key uuid,p_status text,p_http_status integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $$
DECLARE v_state text;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$'
 OR p_retry_key IS NULL OR p_status NOT IN ('delivered','uncertain')
 OR (p_http_status IS NOT NULL AND
      (p_http_status<100 OR p_http_status>599))
 OR (p_status='delivered' AND
      (p_http_status IS NULL OR p_http_status<200 OR p_http_status>=300)) THEN
  RAISE EXCEPTION 'Invalid owner Sync delivery acknowledgement' USING errcode='22023';
 END IF;
 UPDATE line_autopilot.sync_owner_deliveries d
 SET delivery_status=p_status,last_http_status=p_http_status,
   updated_at=pg_catalog.now(),
   delivered_at=CASE WHEN p_status='delivered' THEN pg_catalog.now()
                     ELSE delivered_at END
 WHERE d.event_key=p_event_key AND d.retry_key=p_retry_key
   AND d.delivery_status<>'delivered'
 RETURNING d.delivery_status INTO v_state;
 IF v_state IS NOT NULL THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM line_autopilot.sync_owner_deliveries d
   WHERE d.event_key=p_event_key AND d.retry_key=p_retry_key
     AND d.delivery_status='delivered' AND p_status='delivered');
END $$;
REVOKE ALL ON FUNCTION public.line_sync_owner_ack(text,uuid,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.line_sync_owner_ack(text,uuid,text,integer) TO service_role;
COMMIT;
