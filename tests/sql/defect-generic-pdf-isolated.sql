\set ON_ERROR_STOP on
-- Temporary PostgreSQL 17 fixture; production never contacted.
DO $t$
DECLARE
  ok boolean;
  source text;
  future text;
BEGIN
  source := 'A404 • Art House Group Doc ID 167 • PDF 28/10/2026 • Defect ใหม่ 43 รายการ' || E'\n' ||
    (SELECT string_agg('#'||lpad(i::text,2,'0')||' [PFur] verified point '||i,E'\n' ORDER BY i)
     FROM generate_series(1,43) i);
  IF NOT private.verified_pdf_defect_detail('A404',source)
     OR NOT private.verified_pdf_defect_detail('A405',source) THEN
    RAISE EXCEPTION 'Approved A404/A405 combine rejected';
  END IF;
  IF private.verified_pdf_defect_detail('A401',source)
     OR private.verified_pdf_defect_detail('A404',replace(source,'#43','#42'))
     OR private.verified_pdf_defect_detail('A404',replace(source,'43 รายการ','44 รายการ')) THEN
    RAISE EXCEPTION 'Wrong-room or malformed PDF detail accepted';
  END IF;
  future := 'A512 • Building Engineer Doc ID 168 • PDF 29/10/2026 • Defect ใหม่ 2 รายการ'||
    E'\n#01 [MEP] Verified item\n#02 [Wet] Verified item';
  IF NOT private.verified_pdf_defect_detail('A512',future)
     OR private.verified_pdf_defect_detail('A513',future)
     OR private.verified_pdf_defect_detail('A512',replace(future,'#02','#01'))
     OR private.verified_pdf_defect_detail('A512',replace(future,'2 รายการ','3 รายการ')) THEN
    RAISE EXCEPTION 'Generic forward compatibility or dedupe validation failed';
  END IF;
  IF private.verified_pdf_defect_detail('A512',NULL) OR
     private.verified_pdf_defect_detail('B515','Customer Defect B515') THEN
    RAISE EXCEPTION 'Unvalidated detail accepted';
  END IF;
  RAISE NOTICE 'Generic PDF ingestion PG17 validation PASS';
END $t$;
DO $t$ BEGIN
  IF has_function_privilege('authenticated','private.verified_pdf_defect_detail(text,text)','EXECUTE')
    OR has_function_privilege('anon','private.verified_pdf_defect_detail(text,text)','EXECUTE') THEN
     RAISE EXCEPTION 'Generic PDF validation function exposed to client roles';
  END IF;
  RAISE NOTICE 'RPC helper permission boundary PASS';
END $t$;
