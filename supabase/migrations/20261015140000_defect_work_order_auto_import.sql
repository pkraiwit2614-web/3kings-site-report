-- Work Order import is isolated from the canonical Defect master and all Excel writebacks.
ALTER TABLE public.defect_work_order_snapshot
  ADD COLUMN IF NOT EXISTS source_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS defect_work_order_snapshot_active_idx
  ON public.defect_work_order_snapshot(source_active,building,contractor);

CREATE OR REPLACE FUNCTION public.defect_work_order_sync_import(
  p_sync_key text,
  p_source_file_id text,
  p_source_file_name text,
  p_source_modified_at timestamptz,
  p_rows jsonb,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_total integer;
  v_unique integer;
  v_invalid integer;
  v_unknown_room integer;
  v_before integer;
  v_new integer;
  v_retired integer := 0;
  v_changed integer := 0;
  v_last_source timestamptz;
BEGIN
  IF NOT private.drive_sync_key_valid(p_sync_key) THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_sync_key');
  END IF;
  IF encode(sha256(convert_to(coalesce(p_source_file_id,''),'UTF8')),'hex')
        IS DISTINCT FROM '962738100f241f1bde034952744f2009333a0767d9560da405692a52c67835b5'
     OR p_source_file_name IS DISTINCT FROM 'Defect_Work_Order_Updated_2026-10-15.xlsx'
  THEN
    RETURN jsonb_build_object('ok',false,'error','unapproved_work_order_source');
  END IF;
  IF p_source_modified_at IS NULL OR p_source_modified_at > now() + interval '5 minutes' THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_source_modified_time');
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 300
  THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_source_row_count');
  END IF;
  -- Serialized import: one workbook version at a time.
  PERFORM pg_advisory_xact_lock(hashtext('3kings_work_order_import_v1'));
  SELECT count(*),count(DISTINCT work_id),count(*) FILTER (
    WHERE work_id IS NULL OR work_id !~ '^DF-[A-Za-z0-9()_-]+$'
       OR room_group IS NULL OR room_group !~ '[AB][0-9]{3}'
       OR building NOT IN ('A','B') OR building IS NULL
       OR left(room_group,1) IS DISTINCT FROM building
       OR nullif(btrim(contractor),'') IS NULL
       OR nullif(btrim(defect_item),'') IS NULL
       OR (evidence_url IS NOT NULL AND evidence_url <> ''
           AND evidence_url NOT LIKE 'https://drive.google.com/%')
       OR (received_date IS NOT NULL AND due_date IS NOT NULL AND due_date < received_date)
    )
  INTO v_total,v_unique,v_invalid
  FROM jsonb_to_recordset(p_rows) AS x(
    work_id text,room_group text,building text,contractor text,
    defect_item text,next_action text,supervisor text,
    received_date date,due_date date,work_status text,evidence_url text,
    qa_status text,conflict_note text,source_sync_note text
  );
  IF v_unique <> v_total OR v_invalid > 0 THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_or_duplicate_work_ids',
                              'total',v_total,'unique',v_unique,'invalid',v_invalid);
  END IF;
  -- Every member of each listed room/group must exist in the 263-room master.
  SELECT count(*) INTO v_unknown_room
  FROM jsonb_to_recordset(p_rows) x(room_group text)
  CROSS JOIN LATERAL regexp_matches(x.room_group,'[AB][0-9]{3}','g') AS matched(room_token)
  WHERE NOT EXISTS (SELECT 1 FROM public.condo_room_status c WHERE c.room_no=matched.room_token[1]);
  IF v_unknown_room <> 0 THEN
    RETURN jsonb_build_object('ok',false,'error','unknown_room_in_source','count',v_unknown_room);
  END IF;
  SELECT count(*) INTO v_before
  FROM public.defect_work_order_snapshot WHERE source_active;
  -- Do not silently archive most dispatch records if the workbook is partial.
  IF v_before >= 10 AND v_total < ceil(v_before * 0.65) THEN
    RETURN jsonb_build_object('ok',false,'error','large_source_drop_requires_review',
                              'previous',v_before,'incoming',v_total);
  END IF;
  SELECT max(source_modified_at) INTO v_last_source
  FROM public.defect_work_order_snapshot;
  IF v_last_source IS NOT NULL AND p_source_modified_at < v_last_source THEN
    RETURN jsonb_build_object('ok',false,'error','stale_excel_revision');
  END IF;
  SELECT count(*) INTO v_new FROM jsonb_to_recordset(p_rows) r(work_id text)
  WHERE NOT EXISTS (SELECT 1 FROM public.defect_work_order_snapshot w WHERE w.work_id=r.work_id);
  IF p_dry_run THEN
    RETURN jsonb_build_object('ok',true,'dry_run',true,'rows',v_total,
                              'new_ids',v_new,'currently_active',v_before);
  END IF;

  WITH incoming AS (
    SELECT work_id FROM jsonb_to_recordset(p_rows) AS x(work_id text)
  )
  UPDATE public.defect_work_order_snapshot w
     SET source_active=false,imported_at=now(),source_modified_at=p_source_modified_at
   WHERE w.source_active AND NOT EXISTS
     (SELECT 1 FROM incoming i WHERE i.work_id=w.work_id);
  GET DIAGNOSTICS v_retired = ROW_COUNT;

  INSERT INTO public.defect_work_order_snapshot AS w(
    work_id,room_group,building,contractor,defect_item,next_action,
    supervisor,received_date,due_date,work_status,evidence_url,qa_status,
    conflict_note,source_sync_note,source_modified_at,imported_at,source_active
  )
  SELECT x.work_id,x.room_group,x.building,x.contractor,x.defect_item,x.next_action,
    x.supervisor,x.received_date,x.due_date,x.work_status,x.evidence_url,x.qa_status,
    x.conflict_note,x.source_sync_note,p_source_modified_at,now(),true
  FROM jsonb_to_recordset(p_rows) AS x(
    work_id text,room_group text,building text,contractor text,
    defect_item text,next_action text,supervisor text,
    received_date date,due_date date,work_status text,evidence_url text,
    qa_status text,conflict_note text,source_sync_note text
  )
  ON CONFLICT (work_id) DO UPDATE SET
    room_group=excluded.room_group,building=excluded.building,
    contractor=excluded.contractor,defect_item=excluded.defect_item,
    next_action=excluded.next_action,supervisor=excluded.supervisor,
    received_date=excluded.received_date,due_date=excluded.due_date,
    work_status=excluded.work_status,evidence_url=excluded.evidence_url,
    qa_status=excluded.qa_status,conflict_note=excluded.conflict_note,
    source_sync_note=excluded.source_sync_note,
    source_modified_at=excluded.source_modified_at,imported_at=now(),source_active=true
  WHERE ROW(w.room_group,w.building,w.contractor,w.defect_item,w.next_action,w.supervisor,
            w.received_date,w.due_date,w.work_status,w.evidence_url,w.qa_status,
            w.conflict_note,w.source_sync_note,w.source_active)
        IS DISTINCT FROM
        ROW(excluded.room_group,excluded.building,excluded.contractor,excluded.defect_item,
            excluded.next_action,excluded.supervisor,excluded.received_date,excluded.due_date,
            excluded.work_status,excluded.evidence_url,excluded.qa_status,
            excluded.conflict_note,excluded.source_sync_note, true);
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'dry_run',false,'rows',v_total,
                            'changed',v_changed,'retired',v_retired,
                            'active_total',(SELECT count(*) FROM public.defect_work_order_snapshot WHERE source_active));
END;
$function$;

REVOKE ALL ON FUNCTION public.defect_work_order_sync_import(text,text,text,timestamptz,jsonb,boolean)
  FROM PUBLIC,authenticated,anon;
-- The Apps Script caller uses the existing publishable key + private sync key.
-- A valid private.drive_sync_key_valid() result is required on every call.
GRANT EXECUTE ON FUNCTION public.defect_work_order_sync_import(text,text,text,timestamptz,jsonb,boolean)
  TO anon,authenticated;
