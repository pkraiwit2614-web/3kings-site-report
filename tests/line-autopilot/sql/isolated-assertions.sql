-- Confirm source function executes in isolated PostgreSQL with real role checking.
-- Current date is only used for completed_at; report dates are fixture dates.
DO $block$
DECLARE
  q jsonb := '{"sopIndexRead":true,"sourceFresh":true,"formRowsReconciled":true,
    "monthlySheetVerified":true,"sheetFormulaPreserved":true,
    "pdf4PagesVerified":true,"pdfA4LandscapeVerified":true,
    "driveReadbackVerified":true,"png4Verified":true,
    "sopSheetsV2Read":true,"sopPublishV2Read":true,"sheetReadbackVerified":true}'::jsonb;
BEGIN
  BEGIN
    PERFORM public.daily_line_finalize('2026-10-20','synthetic_file_id_20261020',repeat('a',64),now(),q);
    RAISE EXCEPTION 'FAIL_ROLE_CHECK_NOT_ENFORCED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'SERVICE_ROLE_ONLY' THEN
      RAISE EXCEPTION 'FAIL_ROLE_CHECK: %',SQLERRM;
    END IF;
  END;
END $block$;

SET ROLE service_role;
DO $block$
DECLARE
  q jsonb := '{"sopIndexRead":true,"sourceFresh":true,"formRowsReconciled":true,
    "monthlySheetVerified":true,"sheetFormulaPreserved":true,
    "pdf4PagesVerified":true,"pdfA4LandscapeVerified":true,
    "driveReadbackVerified":true,"png4Verified":true,
    "sopSheetsV2Read":true,"sopPublishV2Read":true,"sheetReadbackVerified":true}'::jsonb;
  legacy jsonb := '{"sopIndexRead":true,"sourceFresh":true,"formRowsReconciled":true,
    "monthlySheetVerified":true,"sheetFormulaPreserved":true,
    "pdf4PagesVerified":true,"pdfA4LandscapeVerified":true,
    "driveReadbackVerified":true,"png4Verified":true,
    "sopSheetsV14Read":true,"sopPublishV1Read":true,"sheetReadbackVerified":true}'::jsonb;
  result jsonb;
BEGIN
  -- A report without 4 PNG rows must not be finalized.
  BEGIN
    PERFORM public.daily_line_finalize('2026-10-20','synthetic_file_id_20261020',repeat('a',64),now(),q);
    RAISE EXCEPTION 'FAIL_PNG_COUNT_NOT_ENFORCED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'BLOCK_PNG_ASSETS_INCOMPLETE' THEN
      RAISE EXCEPTION 'FAIL_MISSING_PNG: %',SQLERRM;
    END IF;
  END;

  -- Four synthetic assets for the new date and historical date.
  INSERT INTO line_autopilot.daily_report_assets(report_date,synthetic_position)
    SELECT '2026-10-20'::date,generate_series(1,4)::smallint;
  INSERT INTO line_autopilot.daily_report_assets(report_date,synthetic_position)
    SELECT '2026-10-19'::date,generate_series(1,4)::smallint;

  -- Old SOP proofs must not satisfy a new-date v2 gate.
  BEGIN
    PERFORM public.daily_line_finalize('2026-10-20','synthetic_file_id_20261020',repeat('a',64),now(),legacy);
    RAISE EXCEPTION 'FAIL_LEGACY_PROOF_ACCEPTED_FOR_V2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'BLOCK_QA_INCOMPLETE' THEN
      RAISE EXCEPTION 'FAIL_LEGACY_QA: %',SQLERRM;
    END IF;
  END;
  -- Missing either independent SOP proof must fail closed.
  BEGIN
    PERFORM public.daily_line_finalize('2026-10-20','synthetic_file_id_20261020',repeat('a',64),now(),q - 'sopPublishV2Read');
    RAISE EXCEPTION 'FAIL_MISSING_PUBLISH_PROOF';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'BLOCK_QA_INCOMPLETE' THEN
      RAISE EXCEPTION 'FAIL_PUBLISH_QA: %',SQLERRM;
    END IF;
  END;
  BEGIN
    PERFORM public.daily_line_finalize('2026-10-20','synthetic_file_id_20261020',repeat('a',64),now(),q - 'sopSheetsV2Read');
    RAISE EXCEPTION 'FAIL_MISSING_SHEETS_PROOF';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'BLOCK_QA_INCOMPLETE' THEN
      RAISE EXCEPTION 'FAIL_SHEETS_QA: %',SQLERRM;
    END IF;
  END;
  BEGIN
    PERFORM public.daily_line_finalize('2026-10-20','synthetic_file_id_20261020',repeat('a',64),now(),q - 'driveReadbackVerified');
    RAISE EXCEPTION 'FAIL_NO_DRIVE_READBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'BLOCK_QA_INCOMPLETE' THEN
      RAISE EXCEPTION 'FAIL_READBACK_QA: %',SQLERRM;
    END IF;
  END;
  BEGIN
    PERFORM public.daily_line_finalize('2026-10-20','invalid',repeat('a',64),now(),q);
    RAISE EXCEPTION 'FAIL_BAD_FILE_ID';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'BLOCK_MANUAL_RUN_NOT_VERIFIED' THEN
      RAISE EXCEPTION 'FAIL_FILE_ID: %',SQLERRM;
    END IF;
  END;

  -- Successful new-date finalization and stable same-manifest idempotency.
  result:=public.daily_line_finalize('2026-10-20','synthetic_file_id_20261020',repeat('a',64),now(),q);
  IF result->>'status'<>'QA_FINALIZED' OR (result->>'png_count')::int<>4 THEN
     RAISE EXCEPTION 'FAIL_NEW_DATE_FINALIZE: %',result;
  END IF;
  result:=public.daily_line_finalize('2026-10-20','synthetic_file_id_20261020',repeat('a',64),now(),q);
  IF result->>'status'<>'QA_FINALIZED' THEN
     RAISE EXCEPTION 'FAIL_IDEMPOTENCY: %',result;
  END IF;
  BEGIN
    PERFORM public.daily_line_finalize('2026-10-20','synthetic_file_id_20261020',repeat('b',64),now(),q);
    RAISE EXCEPTION 'FAIL_MANIFEST_CONFLICT_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'BLOCK_FINALIZED_MANIFEST_CHANGED' THEN
      RAISE EXCEPTION 'FAIL_MANIFEST: %',SQLERRM;
    END IF;
  END;
  -- Historical date must still accept v1.4 Publisher evidence.
  result:=public.daily_line_finalize('2026-10-19','synthetic_file_id_20261019',repeat('c',64),now(),legacy);
  IF result->>'status'<>'QA_FINALIZED' THEN
     RAISE EXCEPTION 'FAIL_HISTORICAL_COMPAT: %',result;
  END IF;
  IF (SELECT count(*) FROM line_autopilot.daily_report_runs)<>2 THEN
     RAISE EXCEPTION 'FAIL_FINALIZE_ROW_COUNT';
  END IF;
  RAISE NOTICE 'LINE_SOP_V2_ISOLATED_TESTS_PASS';
END $block$;
RESET ROLE;
ROLLBACK;
\echo LINE_SOP_V2_ISOLATED_ROLLBACK_PASS
