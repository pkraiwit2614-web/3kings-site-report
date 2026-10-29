-- DRAFT ONLY: A404/A405 Doc167 detail. Never apply until isolated SQL/RLS + GAS QA.
-- Exact live function fingerprints observed 29 Oct 2026, fail closed on source drift.
DO $gate$
BEGIN
  IF md5(pg_get_functiondef('public.drive_sync_apply_condo_defects(text,text,text,timestamptz,jsonb,boolean)'::regprocedure))
     <> 'd8ee3a2beb09cd91c692346f26b740e6' THEN
    RAISE EXCEPTION 'DOC167_DEFECT_RPC_REVISION_CHANGED';
  END IF;
  IF md5(pg_get_functiondef('public.defect_web_override_protect()'::regprocedure))
     <> 'f2cbfa3be5fbe026a3a88f4ccfcc70ce' THEN
    RAISE EXCEPTION 'DOC167_WEB_OVERRIDE_TRIGGER_CHANGED';
  END IF;
END
$gate$;

-- Independently validate standard PDF defect details without a fixed Document ID.
CREATE OR REPLACE FUNCTION private.verified_pdf_defect_detail(p_room text,p_detail text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO ''
AS $pdf$
DECLARE v_header text[]; v_expected integer; v_numbered integer; v_valid boolean;
BEGIN
  IF p_detail IS NULL OR length(p_detail)>100000 THEN RETURN false; END IF;
  v_header := regexp_match(btrim(split_part(p_detail,E'\n',1)),
    '^([AB][0-9]{3}) • .{2,120} Doc ID [0-9]{1,12} • PDF [0-9]{2}/[0-9]{2}/[0-9]{4} • Defect ใหม่ ([0-9]{1,3}) รายการ$');
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

CREATE OR REPLACE FUNCTION public.drive_sync_apply_condo_defects(
  p_sync_key text,
  p_source_file text,
  p_source_file_id text,
  p_source_modified_at timestamp with time zone,
  p_rows jsonb,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r jsonb;
  v_room text;
  v_total integer := 0;
  v_unique integer := 0;
  v_a integer := 0;
  v_b integer := 0;
  v_invalid integer := 0;
  v_changed integer := 0;
  v_needs_write boolean := false;
  v_missing text[] := array[]::text[];
  v_extra text[] := array[]::text[];
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_sync_key');
  END IF;

  IF p_source_file IS DISTINCT FROM 'Handover_Defect_Summary_Updated_28-09-2026.xlsx'
     OR p_source_file_id IS DISTINCT FROM '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unapproved_defect_source');
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'defect_rows_must_be_json_array';
  END IF;

  SELECT
    count(*),
    count(DISTINCT upper(coalesce(value->>'room_no',''))),
    count(*) FILTER (WHERE upper(coalesce(value->>'building','')) = 'A'),
    count(*) FILTER (WHERE upper(coalesce(value->>'building','')) = 'B'),
    count(*) FILTER (
      WHERE upper(coalesce(value->>'room_no','')) !~ '^[AB][0-9]{3}$'
         OR upper(coalesce(value->>'building','')) NOT IN ('A','B')
         OR nullif(value->>'hotel_participation','') IS NULL
         OR nullif(value->>'customer_status','') IS NULL
         OR nullif(value->>'current_status','') IS NULL
         OR nullif(value->>'status_group','') IS NULL
         OR nullif(value->>'follow_up','') IS NULL
         OR nullif(value->>'priority','') IS NULL
         OR nullif(value->>'next_action','') IS NULL
    )
  INTO v_total, v_unique, v_a, v_b, v_invalid
  FROM jsonb_array_elements(p_rows);

  IF v_total <> 263 OR v_unique <> 263 THEN
    RAISE EXCEPTION 'defect_inventory_count_mismatch total=% unique=% expected=263', v_total, v_unique;
  END IF;

  IF v_a <> 162 OR v_b <> 101 THEN
    RAISE EXCEPTION 'defect_building_count_mismatch A=% B=% expected_A=162 expected_B=101', v_a, v_b;
  END IF;

  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'defect_invalid_required_rows=%', v_invalid;
  END IF;

  SELECT coalesce(array_agg(c.room_no ORDER BY c.room_no), array[]::text[])
  INTO v_missing
  FROM public.condo_room_status c
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) x
    WHERE upper(x->>'room_no') = c.room_no
  );

  SELECT coalesce(array_agg(upper(x->>'room_no') ORDER BY upper(x->>'room_no')), array[]::text[])
  INTO v_extra
  FROM jsonb_array_elements(p_rows) x
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.condo_room_status c
    WHERE c.room_no = upper(x->>'room_no')
  );

  IF cardinality(v_missing) > 0 OR cardinality(v_extra) > 0 THEN
    RAISE EXCEPTION 'defect_room_set_mismatch missing=[%] extra=[%]',
      array_to_string(v_missing, ','),
      array_to_string(v_extra, ',');
  END IF;

  -- Treat the A404+A405 Combine as one inspection with two synchronized copies.
  -- Existing room delivery states remain under their normal RPC + override guards.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) item
    WHERE upper(item->>'room_no') IN ('A404','A405')
      AND private.verified_pdf_defect_detail(upper(item->>'room_no'),item->>'defect_detail')
  ) AND (
    (SELECT count(DISTINCT coalesce(item->>'defect_detail',''))
     FROM jsonb_array_elements(p_rows) item
     WHERE upper(item->>'room_no') IN ('A404','A405')) <> 1
    OR (SELECT count(DISTINCT coalesce(item->>'current_status',''))
        FROM jsonb_array_elements(p_rows) item
        WHERE upper(item->>'room_no') IN ('A404','A405')) <> 1
    OR (SELECT count(DISTINCT coalesce(item->>'status_group',''))
        FROM jsonb_array_elements(p_rows) item
        WHERE upper(item->>'room_no') IN ('A404','A405')) <> 1
  ) THEN
    RAISE EXCEPTION 'DOC167_COMBINE_PAIR_MISMATCH';
  END IF;


  -- Fail closed for the entire Combine when either room has an unfinished Web writeback.
  -- Do not let per-room override protection produce a one-sided PDF detail update.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) item
    WHERE upper(item->>'room_no') IN ('A404','A405')
      AND private.verified_pdf_defect_detail(upper(item->>'room_no'),item->>'defect_detail')
  ) AND EXISTS (
    SELECT 1 FROM public.defect_web_overrides w
    WHERE w.room_no IN ('A404','A405')
      AND (w.source_sync_state IS DISTINCT FROM 'synced' OR w.source_synced_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'DOC167_COMBINE_WEB_OVERRIDE_PENDING';
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_room := upper(r->>'room_no');

    SELECT (
      c.building IS DISTINCT FROM upper(r->>'building')
      OR c.floor IS DISTINCT FROM (r->>'floor')::integer
      OR c.hotel_participation IS DISTINCT FROM (r->>'hotel_participation')
      OR c.customer_status IS DISTINCT FROM (r->>'customer_status')
      OR c.current_status IS DISTINCT FROM (r->>'current_status')
      OR c.status_group IS DISTINCT FROM (r->>'status_group')
      OR c.follow_up IS DISTINCT FROM (r->>'follow_up')
      OR c.priority IS DISTINCT FROM (r->>'priority')
      OR c.next_action IS DISTINCT FROM (r->>'next_action')
      OR c.latest_source IS DISTINCT FROM coalesce(nullif(r->>'latest_source',''), c.latest_source)
      OR c.source_note IS DISTINCT FROM coalesce(nullif(r->>'source_note',''), c.source_note)
      OR c.hotel_complete_color IS DISTINCT FROM coalesce(nullif(r->>'hotel_complete_color',''), c.hotel_complete_color)
      OR c.hotel_remarks IS DISTINCT FROM coalesce(nullif(r->>'hotel_remarks',''), c.hotel_remarks)
      -- Scoped Excel-first chat detail; leave unrelated descriptions untouched.
      OR (v_room IN ('A311','A401','B204','B502','B707') AND coalesce(r->>'defect_detail','') LIKE '%รายการ Defect แจ้งผ่านแชต:%'
          AND NOT EXISTS (SELECT 1 FROM public.defect_web_overrides w
            WHERE w.room_no = v_room
              AND (w.source_sync_state <> 'synced' OR w.source_synced_at IS NULL))
          AND c.defect_detail IS DISTINCT FROM r->>'defect_detail')
      -- Standard validated PDF detail from the canonical approved Master.
      OR (private.verified_pdf_defect_detail(v_room,r->>'defect_detail')
          AND NOT EXISTS (SELECT 1 FROM public.defect_web_overrides w
            WHERE w.room_no=v_room AND (w.source_sync_state<>'synced' OR w.source_synced_at IS NULL))
          AND c.defect_detail IS DISTINCT FROM r->>'defect_detail')
      -- Scoped B515 Customer Defect detail
      OR (v_room = 'B515' AND coalesce(r->>'defect_detail','') LIKE '%Customer Defect B515%'
          AND NOT EXISTS (SELECT 1 FROM public.defect_web_overrides w
            WHERE w.room_no = v_room
              AND (w.source_sync_state <> 'synced' OR w.source_synced_at IS NULL))
          AND c.defect_detail IS DISTINCT FROM r->>'defect_detail')
    )
    INTO v_needs_write
    FROM public.condo_room_status c
    WHERE c.room_no = v_room;

    IF coalesce(v_needs_write, false) THEN
      v_changed := v_changed + 1;

      IF NOT p_dry_run THEN
        UPDATE public.condo_room_status c
        SET
          building = upper(r->>'building'),
          floor = (r->>'floor')::integer,
          hotel_participation = r->>'hotel_participation',
          customer_status = r->>'customer_status',
          current_status = r->>'current_status',
          status_group = r->>'status_group',
          follow_up = r->>'follow_up',
          priority = r->>'priority',
          next_action = r->>'next_action',
          latest_source = coalesce(nullif(r->>'latest_source',''), c.latest_source),
          source_note = coalesce(nullif(r->>'source_note',''), c.source_note),
          hotel_complete_color = coalesce(nullif(r->>'hotel_complete_color',''), c.hotel_complete_color),
          hotel_remarks = coalesce(nullif(r->>'hotel_remarks',''), c.hotel_remarks),
          defect_detail = CASE
            WHEN v_room IN ('A311','A401','B204','B502','B707') AND coalesce(r->>'defect_detail','') LIKE '%รายการ Defect แจ้งผ่านแชต:%'
              AND NOT EXISTS (SELECT 1 FROM public.defect_web_overrides w
                WHERE w.room_no = v_room
                  AND (w.source_sync_state <> 'synced' OR w.source_synced_at IS NULL))
              THEN r->>'defect_detail'
            WHEN private.verified_pdf_defect_detail(v_room,r->>'defect_detail')
              AND NOT EXISTS (SELECT 1 FROM public.defect_web_overrides w
                WHERE w.room_no=v_room AND (w.source_sync_state<>'synced' OR w.source_synced_at IS NULL))
              THEN r->>'defect_detail'
            WHEN v_room = 'B515' AND coalesce(r->>'defect_detail','') LIKE '%Customer Defect B515%'
              AND NOT EXISTS (SELECT 1 FROM public.defect_web_overrides w
                WHERE w.room_no = v_room
                  AND (w.source_sync_state <> 'synced' OR w.source_synced_at IS NULL))
              THEN r->>'defect_detail'
            ELSE c.defect_detail END,
          source_file_id = coalesce(nullif(p_source_file_id,''), c.source_file_id),
          source_file_name = coalesce(nullif(p_source_file,''), c.source_file_name),
          source_modified_at = coalesce(p_source_modified_at, c.source_modified_at),
          synced_at = now()
        WHERE c.room_no = v_room;
      END IF;
    END IF;
  END LOOP;

  IF NOT p_dry_run THEN
    INSERT INTO public.drive_sync_runs(
      sync_type, project_code, source_file, source_sheet,
      rows_read, rows_written, status, message
    )
    VALUES (
      'defects', null, p_source_file, 'ข้อมูลจำแนก',
      v_total, v_changed, 'success',
      format(
        'Server defect sync validated 263 rooms (A=162, B=101); %s semantic row(s) changed',
        v_changed
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'rooms', v_total,
    'building_a', v_a,
    'building_b', v_b,
    'changed', v_changed,
    'source_file', p_source_file,
    'validation', '263/263 exact room-set match'
  );

EXCEPTION WHEN others THEN
  IF NOT coalesce(p_dry_run, false) THEN
    BEGIN
      INSERT INTO public.drive_sync_runs(
        sync_type, project_code, source_file, source_sheet,
        rows_read, rows_written, status, message
      )
      VALUES (
        'defects', null, p_source_file, 'ข้อมูลจำแนก',
        coalesce(v_total, 0), 0, 'error', left(sqlerrm, 1000)
      );
    EXCEPTION WHEN others THEN
      null;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'error', sqlerrm,
    'rooms', coalesce(v_total, 0),
    'building_a', coalesce(v_a, 0),
    'building_b', coalesce(v_b, 0)
  );
END;
$function$;
