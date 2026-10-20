-- REFERENCE-ONLY P2 RELEASE CANDIDATE. DO NOT AUTO-APPLY OR MOVE TO supabase/migrations.
-- Origin: LIVE function public.daily_line_finalize(date,text,text,timestamptz,jsonb), read 20-Oct-2026.
-- Scope: new report dates >= 2026-10-20 require both ACTIVE v2.0 SOP evidence tokens.
-- Earlier report dates retain their exact historical contracts. No grant, table, RLS,
-- Delivery Log, Edge Function, Worker, group, sender, or Cron changes.
-- Release only in a separately authorized database change after isolated PostgreSQL
-- replay + rollback and real Writer→PDF/PNG QA evidence; never spoof old SOP tokens.
-- Rollback: restore the exact previous pg_get_functiondef snapshot after verifying
-- zero newer report runs depend on v2-only proofs; do not overwrite newer writes.

CREATE OR REPLACE FUNCTION public.daily_line_finalize(p_report_date date, p_pdf_file_id text, p_pdf_sha256 text, p_completed_at timestamp with time zone, p_qa jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_count int; v_required jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_ONLY'; END IF;
 IF p_report_date IS NULL OR p_pdf_file_id IS NULL OR length(p_pdf_file_id)<12
 OR p_pdf_sha256 !~ '^[0-9a-f]{64}$' OR p_completed_at IS NULL
 OR (p_completed_at AT TIME ZONE 'Asia/Bangkok')::date<>(now() AT TIME ZONE 'Asia/Bangkok')::date
 OR p_completed_at>now()+interval '1 minute'
 THEN RAISE EXCEPTION 'BLOCK_MANUAL_RUN_NOT_VERIFIED'; END IF;
 v_required:='{"sopIndexRead":true,"sourceFresh":true,"formRowsReconciled":true,
 "monthlySheetVerified":true,"sheetFormulaPreserved":true,
 "pdf4PagesVerified":true,"pdfA4LandscapeVerified":true,
 "driveReadbackVerified":true,"png4Verified":true}'::jsonb;
 IF p_qa IS NULL OR NOT(p_qa @> v_required)
 OR (
   CASE
   WHEN p_report_date>='2026-10-20'::date THEN NOT(
      p_qa @> '{"sopSheetsV2Read":true,"sopPublishV2Read":true,"sheetReadbackVerified":true}'::jsonb
   )
   WHEN p_report_date>='2026-10-19'::date THEN NOT(
      p_qa @> '{"sopSheetsV14Read":true,"sopPublishV1Read":true,"sheetReadbackVerified":true}'::jsonb
   )
   ELSE NOT(p_qa @> '{"sopV13Read":true}'::jsonb)
   END
 ) THEN RAISE EXCEPTION 'BLOCK_QA_INCOMPLETE'; END IF;
 SELECT count(*) INTO v_count FROM line_autopilot.daily_report_assets WHERE report_date=p_report_date;
 IF v_count<>4 THEN RAISE EXCEPTION 'BLOCK_PNG_ASSETS_INCOMPLETE'; END IF;
 IF EXISTS(SELECT 1 FROM line_autopilot.daily_report_runs
 WHERE report_date=p_report_date AND(pdf_sha256<>p_pdf_sha256 OR pdf_file_id<>p_pdf_file_id))
 THEN RAISE EXCEPTION 'BLOCK_FINALIZED_MANIFEST_CHANGED'; END IF;
 INSERT INTO line_autopilot.daily_report_runs(report_date,pdf_file_id,pdf_sha256,qa,completed_at)
 VALUES(p_report_date,p_pdf_file_id,p_pdf_sha256,p_qa,p_completed_at)
 ON CONFLICT(report_date) DO UPDATE SET qa=excluded.qa,completed_at=excluded.completed_at,verified_at=now();
 RETURN jsonb_build_object('status','QA_FINALIZED','date',p_report_date,'png_count',v_count);
END;
$function$

