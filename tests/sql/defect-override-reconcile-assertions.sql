-- SQL execution assertions use synthetic rows only. ON_ERROR_STOP=1 catches all.
SET client_min_messages=warning;

-- Synced, newer canonical source, different next_action: accept once.
UPDATE public.condo_room_status SET
  next_action='Excel newer 19 Oct',
  source_modified_at='2026-10-19 19:29+07'
WHERE room_no='A212';
DO $t$
BEGIN
 IF (SELECT next_action FROM public.condo_room_status WHERE room_no='A212')
    <> 'Excel newer 19 Oct' THEN
   RAISE EXCEPTION 'FAIL: synced acknowledged value was not reconciled';
 END IF;
 IF (SELECT next_action FROM public.defect_web_overrides WHERE room_no='A212')
    <> 'Web acknowledged' THEN
   RAISE EXCEPTION 'FAIL: original override history changed';
 END IF;
 IF (SELECT count(*) FROM private.defect_reconcile_field_audit
     WHERE room_no='A212' AND field_name='next_action'
       AND decision='accepted_excel') <> 1 THEN
   RAISE EXCEPTION 'FAIL: Excel adoption was not audited';
 END IF;
END $t$;

-- Idempotency: no additional audit, unchanged value stays.
UPDATE public.condo_room_status SET
  next_action='Excel newer 19 Oct',
  source_modified_at='2026-10-19 19:29+07'
WHERE room_no='A212';
DO $t$
BEGIN
 IF (SELECT count(*) FROM private.defect_reconcile_field_audit
     WHERE room_no='A212' AND decision='accepted_excel') <> 1 THEN
   RAISE EXCEPTION 'FAIL: identical re-run changed history';
 END IF;
END $t$;

-- Row/field version advances only when source is newer and baseline matches.
UPDATE public.condo_room_status SET
  next_action='Excel newer 20 Oct',
  source_modified_at='2026-10-20 09:00+07'
WHERE room_no='A212';
DO $t$
BEGIN
 IF (SELECT next_action FROM public.condo_room_status WHERE room_no='A212')
    <> 'Excel newer 20 Oct' THEN
   RAISE EXCEPTION 'FAIL: newer field-level revision rejected';
 END IF;
END $t$;

-- Conflict: diverged DB status is held, while safe next_action may advance.
SET app.defect_manual_update = '1';
UPDATE public.condo_room_status SET
  status_group='New unacknowledged DB status'
WHERE room_no='A212';
RESET app.defect_manual_update;
UPDATE public.condo_room_status SET
  status_group='Excel claims different status',
  next_action='Excel 21 Oct',
  source_modified_at='2026-10-21 09:00+07'
WHERE room_no='A212';
DO $t$
BEGIN
 IF (SELECT status_group FROM public.condo_room_status WHERE room_no='A212')
    <> 'New unacknowledged DB status' THEN
   RAISE EXCEPTION 'FAIL: conflict overwrote DB status';
 END IF;
 IF (SELECT next_action FROM public.condo_room_status WHERE room_no='A212')
    <> 'Excel 21 Oct' THEN
   RAISE EXCEPTION 'FAIL: safe independent field was blocked';
 END IF;
 IF (SELECT count(*) FROM private.defect_reconcile_field_audit
     WHERE room_no='A212' AND field_name='status_group'
       AND decision='conflict_kept_db') <> 1 THEN
   RAISE EXCEPTION 'FAIL: conflict was not audited';
 END IF;
END $t$;

-- Pending protects source, status and detail, irrespective of Excel version.
UPDATE public.condo_room_status SET
  current_status='Bad Excel status',next_action='Bad Excel next action',
  defect_detail='Bad Excel detail',latest_source='Bad Excel source',
  source_modified_at='2026-10-22 09:00+07'
WHERE room_no='A313';
DO $t$
BEGIN
 IF EXISTS (SELECT 1 FROM public.condo_room_status WHERE room_no='A313'
     AND (current_status <> 'Checked' OR next_action <> 'Pending web edit'
       OR defect_detail <> 'Web edited details'
       OR latest_source <> 'Web App manual update')) THEN
   RAISE EXCEPTION 'FAIL: pending Web update was overwritten';
 END IF;
END $t$;

-- Wrong master source rejected for synced room.
UPDATE public.condo_room_status SET
  next_action='Wrong source',source_file_id='unapproved',
  source_modified_at='2026-10-21 09:00+07'
WHERE room_no='B208';
DO $t$
BEGIN
 IF (SELECT next_action FROM public.condo_room_status WHERE room_no='B208')
   <> 'Web old' THEN
   RAISE EXCEPTION 'FAIL: unapproved master was allowed';
 END IF;
END $t$;

-- Special-case B314 safety is unchanged.
UPDATE public.condo_room_status SET
  current_status='Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว',
  status_group='Hotel - Checked Complete',
  next_action='Unsafe overwritten',
  defect_detail='Unsafe overwritten',
  source_modified_at='2026-10-19 19:29+07'
WHERE room_no='B314';
DO $t$
BEGIN
 IF EXISTS (SELECT 1 FROM public.condo_room_status WHERE room_no='B314'
   AND (next_action <> 'Protected special' OR defect_detail <> 'History special')) THEN
  RAISE EXCEPTION 'FAIL: special-case fields changed';
 END IF;
END $t$;

-- Non-overridden rows retain original importer behavior.
UPDATE public.condo_room_status SET
  next_action='Safe no-override update',
  source_modified_at='2026-10-19 19:29+07'
WHERE room_no='A401';
DO $t$
BEGIN
 IF (SELECT next_action FROM public.condo_room_status WHERE room_no='A401')
    <> 'Safe no-override update' THEN
  RAISE EXCEPTION 'FAIL: non-override room changed semantics';
 END IF;
 IF (SELECT count(*) FROM public.defect_web_overrides) <> 4 THEN
  RAISE EXCEPTION 'FAIL: historic override count was modified';
 END IF;
 RAISE NOTICE 'PASS: pending/synced/field version/conflict/audit/special/no-override';
END $t$;
