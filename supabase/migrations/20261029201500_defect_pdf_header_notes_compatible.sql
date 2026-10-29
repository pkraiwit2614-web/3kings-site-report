-- Source-compatible PDF header suffix: only private helper changes.
-- No source data, Work Order, RLS, triggers or public RPC replacement.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('private.verified_pdf_defect_detail(text,text)'::regprocedure))
     <> '9fc8cf8aeffee1cb00ac3b68f30ad5bc' THEN
    RAISE EXCEPTION 'DEFECT_PDF_HELPER_REVISION_MISMATCH';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION private.verified_pdf_defect_detail(p_room text,p_detail text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO ''
AS $pdf$
DECLARE v_header text[]; v_expected integer; v_numbered integer; v_valid boolean;
BEGIN
  IF p_detail IS NULL OR length(p_detail)>100000 THEN RETURN false; END IF;
  v_header := regexp_match(btrim(split_part(p_detail,E'\n',1)),
    '^([AB][0-9]{3}) • .{2,120} Doc ID [0-9]{1,12} • PDF [0-9]{2}/[0-9]{2}/[0-9]{4} • Defect ใหม่ ([0-9]{1,3}) รายการ.{0,240}$');
  IF v_header IS NULL OR
    (v_header[1]<>p_room AND NOT(v_header[1]='A404' AND p_room='A405')) THEN RETURN false; END IF;
  v_expected:=v_header[2]::integer;
  IF v_expected<1 OR v_expected>200 THEN RETURN false; END IF;
  WITH numbered AS (
    SELECT line,row_number() OVER(ORDER BY ord) AS seq
    FROM regexp_split_to_table(p_detail,E'\n') WITH ORDINALITY AS src(line,ord)
    WHERE left(line,1)='#'
  )
  SELECT count(*),coalesce(bool_and(coalesce(
    line ~ '^#[0-9]{2,3}[[:space:]]+\[[^]]+\]' AND
    substring(line FROM '^#([0-9]{2,3})')::integer=seq,false)),false)
  INTO v_numbered,v_valid FROM numbered;
  RETURN v_numbered=v_expected AND v_valid;
END;
$pdf$;
REVOKE ALL ON FUNCTION private.verified_pdf_defect_detail(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.verified_pdf_defect_detail(text,text) TO service_role;

