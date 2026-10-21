-- Issue #205: one-time, four-room legacy NULL-override reconciliation.
-- Release candidate ONLY. Do not execute on Production without approved readback.
-- Existing defect_web_override_protect() and all RLS/RBAC/trigger definitions stay unchanged.
-- The existing SQL guard handles acceptance and append-only acceptance audit.
-- Atomic fail-closed: DO is one transaction statement. Any failed guard rolls everything back.
-- Requires a fresh source readback matching the pinned approved Excel revision.
DO $issue205$
DECLARE
  v_guard text;
  v_rows integer;
  v_accepted integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.defect_web_override_protect()'::pg_catalog.regprocedure
  ) INTO v_guard;
  IF pg_catalog.strpos(v_guard, 'Legacy synced rows have no baseline yet') = 0
     OR pg_catalog.strpos(v_guard,
         'previous_value IS NOT DISTINCT FROM accepted_value') = 0
     OR pg_catalog.strpos(v_guard,
         'new.source_modified_at > accepted_revision') = 0
     OR pg_catalog.strpos(v_guard, 'Pending Web->Excel writeback') = 0
  THEN
    RAISE EXCEPTION 'ISSUE205_GUARD_REVISION_UNEXPECTED';
  END IF;

  -- Lock exactly the four target rows and their Web acknowledgement rows.
  -- Never touch other room rows, trigger definitions, override history or Work Orders.
  PERFORM r.room_no
    FROM public.condo_room_status r
    JOIN public.defect_web_overrides o USING (room_no)
    WHERE r.room_no IN ('A527','A726','B102','B211')
    ORDER BY r.room_no
    FOR UPDATE OF r, o;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 4 THEN
    RAISE EXCEPTION 'ISSUE205_TARGET_SET_CHANGED: %', v_rows;
  END IF;

  SELECT count(*) INTO v_rows
  FROM public.condo_room_status r
  JOIN public.defect_web_overrides o USING (room_no)
  WHERE r.room_no IN ('A527','A726','B102','B211')
    AND r.current_status = 'Defect ยังไม่เสร็จ / ต้องปิดงาน'
    AND r.status_group = 'Hotel - Incomplete'
    AND r.latest_source = 'Web App manual update'
    AND r.source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx'
    -- Do not publish the private file identifier in a public migration.
    -- The already-installed guard contains the permitted canonical identity.
    AND r.source_file_id IS NOT NULL
    AND pg_catalog.strpos(v_guard, pg_catalog.quote_literal(r.source_file_id)) > 0
    AND pg_catalog.strpos(v_guard, pg_catalog.quote_literal(r.source_file_name)) > 0
    AND r.source_modified_at = '2026-10-21 09:15:38.877+00'::timestamptz
    AND r.synced_at >= r.source_modified_at
    AND o.source_sync_state = 'synced'
    AND o.source_synced_at IS NOT NULL
    AND o.source_synced_at >= o.updated_at
    AND r.source_modified_at > o.source_synced_at
    AND o.current_status IS NULL
    AND o.status_group IS NULL
    -- If a field-specific baseline exists, this repair is not applicable.
    AND NOT EXISTS (
      SELECT 1 FROM private.defect_reconcile_field_versions f
      WHERE f.room_no = r.room_no
        AND f.field_name IN ('current_status','status_group')
    )
    -- No later source decision may supersede the pinned evidence.
    AND NOT EXISTS (
      SELECT 1 FROM private.defect_reconcile_field_audit newer
      WHERE newer.room_no = r.room_no
        AND newer.field_name IN ('current_status','status_group')
        AND newer.source_revision > r.source_modified_at
    )
    -- Both blocked fields must have exact old/new values and acknowledged revision.
    AND 2 = (
      SELECT count(*)
      FROM private.defect_reconcile_field_audit a
      WHERE a.room_no = r.room_no
        AND a.source_revision = r.source_modified_at
        AND a.override_revision = o.updated_at
        AND a.decision = 'conflict_kept_db'
        AND (
          (a.field_name = 'current_status'
           AND a.previous_db_value = r.current_status
           AND a.proposed_excel_value = 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ')
          OR
          (a.field_name = 'status_group'
           AND a.previous_db_value = r.status_group
           AND a.proposed_excel_value = 'Hotel - Awaiting Check')
        )
    )
    -- The next_action from the same Excel revision must ALREADY be accepted.
    AND 1 = (
      SELECT count(*)
      FROM private.defect_reconcile_field_audit a
      WHERE a.room_no = r.room_no
        AND a.source_revision = r.source_modified_at
        AND a.override_revision = o.updated_at
        AND a.field_name = 'next_action'
        AND a.decision = 'accepted_excel'
        AND a.proposed_excel_value IS NOT DISTINCT FROM r.next_action
    );
  IF v_rows <> 4 THEN
    RAISE EXCEPTION 'ISSUE205_EVIDENCE_OR_ROW_CHANGED: eligible % / 4', v_rows;
  END IF;

  -- Seed only the missing two historical field baselines from CURRENT DB values.
  -- They are not invented "Web changes": null override fields signify no
  -- captured Web edit for these fields. The existing guard still must approve Excel.
  INSERT INTO private.defect_reconcile_field_versions
    (room_no, field_name, override_revision, last_source_revision,
     last_accepted_value, last_accepted_at)
  SELECT r.room_no, f.field_name, o.updated_at, o.source_synced_at,
         CASE f.field_name
           WHEN 'current_status' THEN r.current_status
           ELSE r.status_group
         END, pg_catalog.now()
  FROM public.condo_room_status r
  JOIN public.defect_web_overrides o USING (room_no)
  CROSS JOIN (VALUES ('current_status'),('status_group')) AS f(field_name)
  WHERE r.room_no IN ('A527','A726','B102','B211');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 8 THEN
    RAISE EXCEPTION 'ISSUE205_BASELINE_COUNT_MISMATCH: %', v_rows;
  END IF;

  -- Controlled one-time handoff to the EXISTING SQL trigger. Do NOT set
  -- app.defect_manual_update and do NOT disable the trigger or mutate overrides.
  UPDATE public.condo_room_status r
     SET current_status = a.proposed_status,
         status_group = a.proposed_group
  FROM (
    SELECT room_no,
       max(proposed_excel_value) FILTER (WHERE field_name='current_status') AS proposed_status,
       max(proposed_excel_value) FILTER (WHERE field_name='status_group') AS proposed_group
    FROM private.defect_reconcile_field_audit
    WHERE room_no IN ('A527','A726','B102','B211')
      AND source_revision = '2026-10-21 09:15:38.877+00'::timestamptz
      AND decision = 'conflict_kept_db'
      AND field_name IN ('current_status','status_group')
    GROUP BY room_no
  ) AS a
  WHERE r.room_no = a.room_no;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 4 THEN
    RAISE EXCEPTION 'ISSUE205_UPDATE_COUNT_MISMATCH: %', v_rows;
  END IF;

  SELECT count(*) INTO v_rows
  FROM public.condo_room_status r
  WHERE r.room_no IN ('A527','A726','B102','B211')
    AND r.current_status = 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ'
    AND r.status_group = 'Hotel - Awaiting Check';
  IF v_rows <> 4 THEN
    RAISE EXCEPTION 'ISSUE205_STATUS_READBACK_MISMATCH: %', v_rows;
  END IF;

  SELECT count(*) INTO v_accepted
  FROM private.defect_reconcile_field_versions f
  JOIN public.condo_room_status r USING (room_no)
  JOIN public.defect_web_overrides o USING (room_no)
  WHERE f.room_no IN ('A527','A726','B102','B211')
    AND f.field_name IN ('current_status','status_group')
    AND f.override_revision = o.updated_at
    AND f.last_source_revision = r.source_modified_at
    AND f.last_accepted_value = CASE f.field_name
      WHEN 'current_status' THEN r.current_status
      ELSE r.status_group END;
  IF v_accepted <> 8 THEN
    RAISE EXCEPTION 'ISSUE205_SQL_GUARD_DID_NOT_ACCEPT_ALL: %', v_accepted;
  END IF;

  SELECT count(*) INTO v_accepted
  FROM private.defect_reconcile_field_audit a
  WHERE a.room_no IN ('A527','A726','B102','B211')
    AND a.source_revision = '2026-10-21 09:15:38.877+00'::timestamptz
    AND a.field_name IN ('current_status','status_group')
    AND a.decision = 'accepted_excel';
  IF v_accepted <> 8 THEN
    RAISE EXCEPTION 'ISSUE205_ACCEPTANCE_AUDIT_MISMATCH: %', v_accepted;
  END IF;
END
$issue205$;
