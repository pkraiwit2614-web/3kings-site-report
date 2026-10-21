-- Issue #205 positive assertions. Synthetic database ONLY.
DO $assert$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.condo_room_status
  WHERE room_no IN ('A527','A726','B102','B211')
    AND current_status = 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ'
    AND status_group = 'Hotel - Awaiting Check'
    AND next_action = 'Synthetic Excel action 21 Oct'
    AND defect_detail = 'Synthetic historical details (unchanged)'
    AND latest_source = 'Web App manual update'
    AND source_modified_at = '2026-10-21 09:15:38.877+00'::timestamptz;
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL_TARGET_READBACK %', n; END IF;

  SELECT count(*) INTO n FROM public.defect_web_overrides
  WHERE room_no IN ('A527','A726','B102','B211')
    AND source_sync_state='synced'
    AND current_status IS NULL AND status_group IS NULL
    AND next_action='Synthetic historic Web action'
    AND detail_text='Synthetic legacy detail'
    AND updated_at='2026-10-15 07:00+00'::timestamptz
    AND source_synced_at='2026-10-15 07:05+00'::timestamptz;
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL_OVERRIDE_HISTORY_CHANGED %', n; END IF;

  SELECT count(*) INTO n FROM private.defect_reconcile_field_versions
  WHERE room_no IN ('A527','A726','B102','B211')
    AND field_name IN ('current_status','status_group')
    AND last_source_revision = '2026-10-21 09:15:38.877+00'::timestamptz
    AND last_accepted_value IN (
      'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ','Hotel - Awaiting Check');
  IF n <> 8 THEN RAISE EXCEPTION 'FAIL_FIELD_BASELINE_NOT_ACCEPTED %', n; END IF;

  SELECT count(*) INTO n FROM private.defect_reconcile_field_audit
  WHERE room_no IN ('A527','A726','B102','B211')
    AND field_name IN ('current_status','status_group')
    AND decision='accepted_excel'
    AND source_revision='2026-10-21 09:15:38.877+00'::timestamptz;
  IF n <> 8 THEN RAISE EXCEPTION 'FAIL_SQL_ACCEPTANCE_AUDIT %', n; END IF;

  SELECT count(*) INTO n FROM private.defect_reconcile_field_audit
  WHERE room_no IN ('A527','A726','B102','B211')
    AND field_name IN ('current_status','status_group')
    AND decision='conflict_kept_db';
  IF n <> 8 THEN RAISE EXCEPTION 'FAIL_EXISTING_CONFLICT_HISTORY %', n; END IF;

  -- Verify none of the five existing fixture rooms or Web/DB history was modified.
  IF (SELECT count(*) FROM public.condo_room_status) <> 9
    OR (SELECT count(*) FROM public.defect_web_overrides) <> 8
    OR (SELECT count(*) FROM private.defect_reconcile_field_versions) <> 8
    OR (SELECT current_status FROM public.condo_room_status WHERE room_no='B314')
       <> 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ'
    OR (SELECT next_action FROM public.condo_room_status WHERE room_no='A313')
       <> 'Pending web edit'
    OR (SELECT next_action FROM public.condo_room_status WHERE room_no='A212')
       <> 'Web acknowledged'
  THEN
    RAISE EXCEPTION 'FAIL_OTHER_ROOMS_OR_OVERRIDE_CHANGED';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_trigger
      WHERE tgname='defect_web_override_before_sync' AND tgenabled='O') <> 1
  THEN RAISE EXCEPTION 'FAIL_SQL_GUARD_TRIGGER_CHANGED'; END IF;

  RAISE NOTICE 'PASS: 4/4 statuses; 8/8 audited fields; untouched history, triggers and unrelated rooms';
END
$assert$;
