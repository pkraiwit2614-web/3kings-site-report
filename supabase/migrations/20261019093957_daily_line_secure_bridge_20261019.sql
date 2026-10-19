
CREATE TABLE IF NOT EXISTS line_autopilot.daily_report_assets (
 report_date date NOT NULL, site text NOT NULL CHECK(site IN ('above_villa','above_condo','mirage','henessy')),
 filename text NOT NULL, drive_file_id text NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 width integer NOT NULL CHECK(width=2947), height integer NOT NULL CHECK(height>100 AND height<20000),
 png bytea NOT NULL CHECK(octet_length(png) BETWEEN 101 AND 1048576), updated_at timestamptz DEFAULT now(),
 PRIMARY KEY(report_date,site)
);
CREATE TABLE IF NOT EXISTS line_autopilot.daily_report_runs (
 report_date date PRIMARY KEY, pdf_file_id text NOT NULL, pdf_sha256 text NOT NULL CHECK(pdf_sha256 ~ '^[0-9a-f]{64}$'),
 qa jsonb NOT NULL, completed_at timestamptz NOT NULL, verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS line_autopilot.daily_delivery_detail (
 event_key text PRIMARY KEY CHECK(event_key ~ '^[0-9a-f]{64}$'),report_date date NOT NULL,
 site_code text NOT NULL,group_id text NOT NULL,stage text NOT NULL CHECK(stage IN ('form_text','image')),
 asset_sha256 text,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE line_autopilot.daily_report_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_autopilot.daily_report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_autopilot.daily_delivery_detail ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON line_autopilot.daily_report_assets FROM PUBLIC,anon,authenticated;
REVOKE ALL ON line_autopilot.daily_report_runs FROM PUBLIC,anon,authenticated;
REVOKE ALL ON line_autopilot.daily_delivery_detail FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON line_autopilot.daily_report_assets TO service_role;
GRANT SELECT,INSERT,UPDATE ON line_autopilot.daily_report_runs TO service_role;
GRANT SELECT,INSERT ON line_autopilot.daily_delivery_detail TO service_role;

CREATE OR REPLACE FUNCTION public.daily_line_stage_asset(
 p_report_date date,p_site text,p_drive_file_id text,p_png_base64 text,p_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE v_png bytea; v_width int; v_height int; v_suffix text; v_name text;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_ONLY'; END IF;
 v_suffix:=CASE p_site WHEN 'above_villa' THEN 'Page_01_Above_Villa'
 WHEN 'above_condo' THEN 'Page_02_Above_Condo' WHEN 'mirage' THEN 'Page_03_Mirage'
 WHEN 'henessy' THEN 'Page_04_Henessy' END;
 IF v_suffix IS NULL OR p_report_date IS NULL OR p_report_date>(now() AT TIME ZONE 'Asia/Bangkok')::date
 OR p_drive_file_id IS NULL OR length(p_drive_file_id)<12 OR p_sha256 !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'BLOCK_INVALID_ASSET_METADATA'; END IF;
 IF length(p_png_base64)>1500000 THEN RAISE EXCEPTION 'BLOCK_ASSET_SIZE'; END IF;
 v_png:=decode(p_png_base64,'base64');
 IF octet_length(v_png) NOT BETWEEN 101 AND 1048576 OR
 substring(v_png FROM 1 FOR 8)<>decode('89504e470d0a1a0a','hex')
 OR encode(extensions.digest(v_png,'sha256'),'hex')<>p_sha256
 THEN RAISE EXCEPTION 'BLOCK_ASSET_CHECKSUM'; END IF;
 v_width:=get_byte(v_png,16)*16777216+get_byte(v_png,17)*65536+get_byte(v_png,18)*256+get_byte(v_png,19);
 v_height:=get_byte(v_png,20)*16777216+get_byte(v_png,21)*65536+get_byte(v_png,22)*256+get_byte(v_png,23);
 IF v_width<>2947 OR v_height NOT BETWEEN 101 AND 19999 THEN RAISE EXCEPTION 'BLOCK_IMAGE_DIMENSIONS'; END IF;
 IF EXISTS(SELECT 1 FROM line_autopilot.daily_report_runs WHERE report_date=p_report_date)
  AND EXISTS(SELECT 1 FROM line_autopilot.daily_report_assets WHERE report_date=p_report_date AND site=p_site AND sha256<>p_sha256)
 THEN RAISE EXCEPTION 'BLOCK_FINALIZED_ASSET_REPLACEMENT'; END IF;
 v_name:='Daily_Site_Report_'||to_char(p_report_date,'DD-MM-YYYY')||'_'||v_suffix||'.png';
 INSERT INTO line_autopilot.daily_report_assets(report_date,site,filename,drive_file_id,sha256,width,height,png)
 VALUES(p_report_date,p_site,v_name,p_drive_file_id,p_sha256,v_width,v_height,v_png)
 ON CONFLICT(report_date,site) DO UPDATE SET filename=excluded.filename,
 drive_file_id=excluded.drive_file_id,sha256=excluded.sha256,width=excluded.width,
 height=excluded.height,png=excluded.png,updated_at=now();
 RETURN jsonb_build_object('status','STAGED_READBACK','site',p_site,'sha256',p_sha256,'bytes',octet_length(v_png));
END; $$;

CREATE OR REPLACE FUNCTION public.daily_line_finalize(
 p_report_date date,p_pdf_file_id text,p_pdf_sha256 text,p_completed_at timestamptz,p_qa jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE v_count int;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_ONLY'; END IF;
 IF p_report_date IS NULL OR p_pdf_file_id IS NULL OR length(p_pdf_file_id)<12
 OR p_pdf_sha256 !~ '^[0-9a-f]{64}$' OR p_completed_at IS NULL
 OR (p_completed_at AT TIME ZONE 'Asia/Bangkok')::date<>(now() AT TIME ZONE 'Asia/Bangkok')::date
 OR p_completed_at>now()+interval '1 minute'
 THEN RAISE EXCEPTION 'BLOCK_MANUAL_RUN_NOT_VERIFIED'; END IF;
 IF p_qa IS NULL OR NOT(p_qa @> '{"sopIndexRead":true,"sopV13Read":true,"sourceFresh":true,"formRowsReconciled":true,"monthlySheetVerified":true,"sheetFormulaPreserved":true,"pdf4PagesVerified":true,"pdfA4LandscapeVerified":true,"driveReadbackVerified":true,"png4Verified":true}'::jsonb)
 THEN RAISE EXCEPTION 'BLOCK_QA_INCOMPLETE'; END IF;
 SELECT count(*) INTO v_count FROM line_autopilot.daily_report_assets WHERE report_date=p_report_date;
 IF v_count<>4 THEN RAISE EXCEPTION 'BLOCK_PNG_ASSETS_INCOMPLETE'; END IF;
 IF EXISTS(SELECT 1 FROM line_autopilot.daily_report_runs
 WHERE report_date=p_report_date AND(pdf_sha256<>p_pdf_sha256 OR pdf_file_id<>p_pdf_file_id))
 THEN RAISE EXCEPTION 'BLOCK_FINALIZED_MANIFEST_CHANGED'; END IF;
 INSERT INTO line_autopilot.daily_report_runs(report_date,pdf_file_id,pdf_sha256,qa,completed_at)
 VALUES(p_report_date,p_pdf_file_id,p_pdf_sha256,p_qa,p_completed_at)
 ON CONFLICT(report_date) DO UPDATE SET qa=excluded.qa,completed_at=excluded.completed_at,verified_at=now();
 RETURN jsonb_build_object('status','QA_FINALIZED','date',p_report_date,'png_count',v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.daily_line_ready(p_report_date date)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO '' AS $$
 SELECT CASE WHEN current_user<>'service_role' THEN '{"ready":false}'::jsonb
 WHEN r.report_date IS NULL OR
 (r.completed_at AT TIME ZONE 'Asia/Bangkok')::date<>(now() AT TIME ZONE 'Asia/Bangkok')::date OR
 (SELECT count(*) FROM line_autopilot.daily_report_assets WHERE report_date=p_report_date)<>4
 THEN '{"ready":false}'::jsonb
 ELSE jsonb_build_object('ready',true,'report_date',r.report_date,'pdf_sha256',r.pdf_sha256,
 'assets',(SELECT jsonb_agg(jsonb_build_object('site',a.site,'sha256',a.sha256,'width',a.width,
 'height',a.height,'filename',a.filename) ORDER BY a.site)
 FROM line_autopilot.daily_report_assets a WHERE a.report_date=p_report_date))
 END
 FROM (SELECT 1) x LEFT JOIN line_autopilot.daily_report_runs r ON r.report_date=p_report_date
$$;

CREATE OR REPLACE FUNCTION public.daily_line_image_read(p_report_date date,p_site text,p_sha256 text)
RETURNS TABLE(content_base64 text,checksum text,mime text)
LANGUAGE sql SECURITY INVOKER SET search_path TO '' AS $$
 SELECT encode(a.png,'base64'),a.sha256,'image/png'::text
 FROM line_autopilot.daily_report_assets a
 JOIN line_autopilot.daily_report_runs r ON r.report_date=a.report_date
 WHERE current_user='service_role' AND a.report_date=p_report_date AND a.site=p_site
 AND a.sha256=p_sha256
$$;

CREATE OR REPLACE FUNCTION public.daily_line_record_delivery(
 p_event_key text,p_report_date date,p_site_code text,p_group_id text,p_stage text,p_asset_sha256 text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_ONLY'; END IF;
 IF p_event_key !~ '^[0-9a-f]{64}$' OR p_stage NOT IN ('form_text','image')
 OR p_site_code NOT IN ('above_villa','above_condo_a','above_condo_b','mirage','henessy')
 OR p_group_id !~ '^C[0-9a-f]{32}$'
 THEN RAISE EXCEPTION 'BLOCK_DELIVERY_LOG_METADATA'; END IF;
 INSERT INTO line_autopilot.daily_delivery_detail(event_key,report_date,site_code,group_id,stage,asset_sha256)
 VALUES(p_event_key,p_report_date,p_site_code,p_group_id,p_stage,p_asset_sha256)
 ON CONFLICT(event_key) DO NOTHING;
 RETURN EXISTS (SELECT 1 FROM line_autopilot.daily_delivery_detail
 WHERE event_key=p_event_key AND report_date=p_report_date AND site_code=p_site_code
 AND group_id=p_group_id AND stage=p_stage
 AND asset_sha256 IS NOT DISTINCT FROM p_asset_sha256);
END; $$;
REVOKE ALL ON FUNCTION public.daily_line_stage_asset(date,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.daily_line_finalize(date,text,text,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.daily_line_ready(date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.daily_line_image_read(date,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.daily_line_record_delivery(text,date,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.daily_line_stage_asset(date,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_line_finalize(date,text,text,timestamptz,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_line_ready(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_line_image_read(date,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_line_record_delivery(text,date,text,text,text,text) TO service_role;
