-- Synthetic assertions for B515 Scoped Reconcile & Regression on B214, B314, B315, B403.
-- ON_ERROR_STOP=1 catches any assertion failure.
SET client_min_messages = warning;

-- 1. Setup synthetic test rooms in condo_room_status and defect_web_overrides
-- Use app.defect_manual_update='1' to seed initial baseline state cleanly
SET app.defect_manual_update = '1';

INSERT INTO public.condo_room_status (
  room_no, building, floor, hotel_participation, customer_status,
  current_status, status_group, follow_up, priority, next_action,
  defect_detail, latest_source, source_file_id, source_file_name, source_modified_at
) VALUES
  ('B515', 'B', 5, 'ร่วมโรงแรม', 'มีลูกค้า',
   'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ', 'Hotel - Awaiting Check', 'รอติดตาม', 'normal', 'รอตรวจยืนยัน',
   'Customer Defect B515: 9 customer defect items awaiting inspection [SYNTHETIC TEST]', 'Prior sync',
   '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj', 'Handover_Defect_Summary_Updated_28-09-2026.xlsx', '2026-10-25 08:00:00+00'),
  ('B214', 'B', 2, 'ร่วมโรงแรม', 'มีลูกค้า',
   'Defect ยังไม่เสร็จ / ต้องปิดงาน', 'Hotel - Incomplete', 'รอติดตาม', 'normal', 'แก้ไขบัวพื้น',
   'B214 detail', 'Prior sync',
   '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj', 'Handover_Defect_Summary_Updated_28-09-2026.xlsx', '2026-10-25 08:00:00+00'),
  ('B314', 'B', 3, 'ร่วมโรงแรม', 'มีลูกค้า',
   'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ', 'Hotel - Awaiting Check', 'รอติดตาม', 'normal', 'รอตรวจซ้ำ',
   'B314 detail', 'Prior sync',
   '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj', 'Handover_Defect_Summary_Updated_28-09-2026.xlsx', '2026-10-25 08:00:00+00'),
  ('B315', 'B', 3, 'ร่วมโรงแรม', 'มีลูกค้า',
   'Defect ยังไม่เสร็จ / ต้องปิดงาน', 'Hotel - Incomplete', 'รอติดตาม', 'normal', 'เก็บสีผนัง',
   'B315 detail', 'Prior sync',
   '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj', 'Handover_Defect_Summary_Updated_28-09-2026.xlsx', '2026-10-25 08:00:00+00'),
  ('B403', 'B', 4, 'ร่วมโรงแรม', 'มีลูกค้า',
   'Defect ยังไม่เสร็จ / ต้องปิดงาน', 'Hotel - Incomplete', 'รอติดตาม', 'normal', 'ตรวจไฟระเบียง',
   'B403 detail', 'Prior sync',
   '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj', 'Handover_Defect_Summary_Updated_28-09-2026.xlsx', '2026-10-25 08:00:00+00')
ON CONFLICT (room_no) DO UPDATE SET
  current_status = EXCLUDED.current_status,
  status_group = EXCLUDED.status_group,
  defect_detail = EXCLUDED.defect_detail,
  source_file_id = EXCLUDED.source_file_id,
  source_file_name = EXCLUDED.source_file_name,
  source_modified_at = EXCLUDED.source_modified_at;

RESET app.defect_manual_update;

INSERT INTO public.defect_web_overrides (
  room_no, current_status, status_group, next_action, detail_text,
  source_sync_state, updated_at, source_synced_at
) VALUES
  ('B515', null, null, null, null, 'synced', '2026-10-25 08:00:00+00', '2026-10-25 08:30:00+00'),
  ('B214', null, null, null, null, 'synced', '2026-10-25 08:00:00+00', '2026-10-25 08:30:00+00'),
  ('B314', null, null, null, null, 'synced', '2026-10-25 08:00:00+00', '2026-10-25 08:30:00+00'),
  ('B315', null, null, null, null, 'synced', '2026-10-25 08:00:00+00', '2026-10-25 08:30:00+00'),
  ('B403', null, null, null, null, 'synced', '2026-10-25 08:00:00+00', '2026-10-25 08:30:00+00')
ON CONFLICT (room_no) DO UPDATE SET
  source_sync_state = EXCLUDED.source_sync_state,
  updated_at = EXCLUDED.updated_at,
  source_synced_at = EXCLUDED.source_synced_at;

-- 2. Test B515 Acceptance from Canonical Excel Master revision 2026-10-26+
UPDATE public.condo_room_status SET
  current_status = 'Defect ยังไม่เสร็จ / ต้องปิดงาน',
  status_group = 'Hotel - Incomplete',
  next_action = 'รอตรวจยืนยัน Customer Defect B515',
  defect_detail = '', -- Incoming Excel has blank detail: trigger MUST retain old.defect_detail!
  source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
  source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
  source_modified_at = '2026-10-26 14:00:00+00'
WHERE room_no = 'B515';

DO $test_b515$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.condo_room_status WHERE room_no = 'B515';
  IF v_rec.current_status <> 'Defect ยังไม่เสร็จ / ต้องปิดงาน' THEN
    RAISE EXCEPTION 'FAIL: B515 status was not reconciled to Incomplete (got %)', v_rec.current_status;
  END IF;
  IF v_rec.status_group <> 'Hotel - Incomplete' THEN
    RAISE EXCEPTION 'FAIL: B515 group was not reconciled to Hotel - Incomplete (got %)', v_rec.status_group;
  END IF;
  IF v_rec.defect_detail <> 'Customer Defect B515: ประตูระเบียงเปิดฝืด และกระเบื้องห้องน้ำบิ่น' THEN
    RAISE EXCEPTION 'FAIL: B515 history defect_detail was not preserved (got %)', v_rec.defect_detail;
  END IF;
  IF (SELECT count(*) FROM private.defect_reconcile_field_audit WHERE room_no = 'B515' AND decision = 'accepted_excel') <> 3 THEN
    RAISE EXCEPTION 'FAIL: B515 audit rows were not created for status, group, and next_action';
  END IF;
  RAISE NOTICE 'PASS: B515 canonical Excel acceptance and history preservation verified';
END $test_b515$;

-- 3. Test B515 Pending Web Writeback Precedence (Fail-Closed)
UPDATE public.defect_web_overrides SET
  source_sync_state = 'pending',
  source_synced_at = NULL,
  updated_at = '2026-10-27 10:00:00+00',
  current_status = 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ',
  status_group = 'Hotel - Awaiting Check'
WHERE room_no = 'B515';

UPDATE public.condo_room_status SET
  current_status = 'Defect ยังไม่เสร็จ / ต้องปิดงาน',
  status_group = 'Hotel - Incomplete',
  source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
  source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
  source_modified_at = '2026-10-27 12:00:00+00'
WHERE room_no = 'B515';

DO $test_b515_pending$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.condo_room_status WHERE room_no = 'B515';
  -- Because Web override is pending, Excel cannot force overwrite
  IF v_rec.current_status <> 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ' THEN
    RAISE EXCEPTION 'FAIL: Pending Web override was overwritten by Excel (got %)', v_rec.current_status;
  END IF;
  RAISE NOTICE 'PASS: B515 pending Web writeback protected from Excel overwrite';
END $test_b515_pending$;

-- Reset B515 override state
UPDATE public.defect_web_overrides SET
  source_sync_state = 'synced',
  source_synced_at = '2026-10-27 13:00:00+00',
  updated_at = '2026-10-27 10:00:00+00'
WHERE room_no = 'B515';

-- 4. Test Regression on B214: Hotel Engineer transition
UPDATE public.condo_room_status SET
  current_status = 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว',
  status_group = 'Hotel - Checked Complete',
  defect_detail = 'Unsafe detail replacement',
  next_action = 'Unsafe next action replacement',
  source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
  source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
  source_modified_at = '2026-10-26 12:00:00+00'
WHERE room_no = 'B214';

DO $test_b214$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.condo_room_status WHERE room_no = 'B214';
  IF v_rec.current_status <> 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว' THEN
    RAISE EXCEPTION 'FAIL: B214 status regression (got %)', v_rec.current_status;
  END IF;
  IF v_rec.status_group <> 'Hotel - Checked Complete' THEN
    RAISE EXCEPTION 'FAIL: B214 group regression (got %)', v_rec.status_group;
  END IF;
  IF v_rec.defect_detail <> 'B214 detail' OR v_rec.next_action <> 'แก้ไขบัวพื้น' THEN
    RAISE EXCEPTION 'FAIL: B214 detail/next_action was not protected against override';
  END IF;
  RAISE NOTICE 'PASS: B214 Hotel Engineer transition regression verified';
END $test_b214$;

-- 5. Test Regression on B314: Hotel Engineer transition
UPDATE public.condo_room_status SET
  current_status = 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว',
  status_group = 'Hotel - Checked Complete',
  source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
  source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
  source_modified_at = '2026-10-26 12:00:00+00'
WHERE room_no = 'B314';

DO $test_b314$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.condo_room_status WHERE room_no = 'B314';
  IF v_rec.current_status <> 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว' THEN
    RAISE EXCEPTION 'FAIL: B314 status regression (got %)', v_rec.current_status;
  END IF;
  IF v_rec.status_group <> 'Hotel - Checked Complete' THEN
    RAISE EXCEPTION 'FAIL: B314 group regression (got %)', v_rec.status_group;
  END IF;
  RAISE NOTICE 'PASS: B314 Hotel Engineer transition regression verified';
END $test_b314$;

-- 6. Test Regression on B315: Hotel Engineer transition
UPDATE public.condo_room_status SET
  current_status = 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว',
  status_group = 'Hotel - Checked Complete',
  source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
  source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
  source_modified_at = '2026-10-26 12:00:00+00'
WHERE room_no = 'B315';

DO $test_b315$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.condo_room_status WHERE room_no = 'B315';
  IF v_rec.current_status <> 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว' THEN
    RAISE EXCEPTION 'FAIL: B315 status regression (got %)', v_rec.current_status;
  END IF;
  IF v_rec.status_group <> 'Hotel - Checked Complete' THEN
    RAISE EXCEPTION 'FAIL: B315 group regression (got %)', v_rec.status_group;
  END IF;
  RAISE NOTICE 'PASS: B315 Hotel Engineer transition regression verified';
END $test_b315$;

-- 7. Test Regression on B403: Hotel Engineer transition
UPDATE public.condo_room_status SET
  current_status = 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว',
  status_group = 'Hotel - Checked Complete',
  source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
  source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
  source_modified_at = '2026-10-26 12:00:00+00'
WHERE room_no = 'B403';

DO $test_b403$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.condo_room_status WHERE room_no = 'B403';
  IF v_rec.current_status <> 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว' THEN
    RAISE EXCEPTION 'FAIL: B403 status regression (got %)', v_rec.current_status;
  END IF;
  IF v_rec.status_group <> 'Hotel - Checked Complete' THEN
    RAISE EXCEPTION 'FAIL: B403 group regression (got %)', v_rec.status_group;
  END IF;
  RAISE NOTICE 'PASS: B403 Hotel Engineer transition regression verified';
END $test_b403$;

-- 8. Test Unapproved Status Transition Rejection on B214
UPDATE public.condo_room_status SET
  current_status = 'Arbitrary Status Not Permitted',
  status_group = 'Arbitrary Group',
  source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
  source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
  source_modified_at = '2026-10-27 12:00:00+00'
WHERE room_no = 'B214';

DO $test_b214_unapproved$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.condo_room_status WHERE room_no = 'B214';
  IF v_rec.current_status = 'Arbitrary Status Not Permitted' THEN
    RAISE EXCEPTION 'FAIL: Unapproved status was accepted on B214';
  END IF;
  RAISE NOTICE 'PASS: Unapproved status rejection on B214 verified';
END $test_b214_unapproved$;

-- 9. Rehearsed & Tested Executable Rollback
-- Restores baseline defect_web_override_protect (without B515 exception)
CREATE OR REPLACE FUNCTION public.defect_web_override_protect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v public.defect_web_overrides%rowtype;
  expected_status text;
  expected_group text;
  approved boolean := false;
  v_field_name text;
  proposed_value text;
  previous_value text;
  override_value text;
  accepted_value text;
  accepted_revision timestamptz;
  accepted_override_revision timestamptz;
  can_accept boolean;
  approved_source boolean;
BEGIN
  IF pg_catalog.current_setting('app.defect_manual_update',true) = '1' THEN
    RETURN new;
  END IF;

  SELECT * INTO v FROM public.defect_web_overrides WHERE room_no=new.room_no;

  IF new.room_no IN ('B214','B314','B315','B403','B515') THEN
    CASE new.room_no
      WHEN 'B214' THEN expected_status:='Defect ยังไม่เสร็จ / ต้องปิดงาน'; expected_group:='Hotel - Incomplete';
      WHEN 'B314' THEN expected_status:='Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ'; expected_group:='Hotel - Awaiting Check';
      WHEN 'B315' THEN expected_status:='Defect ยังไม่เสร็จ / ต้องปิดงาน'; expected_group:='Hotel - Incomplete';
      WHEN 'B403' THEN expected_status:='Defect ยังไม่เสร็จ / ต้องปิดงาน'; expected_group:='Hotel - Incomplete';
      WHEN 'B515' THEN expected_status:='Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ'; expected_group:='Hotel - Awaiting Check';
    END CASE;
    approved := new.source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj'
      AND new.source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx'
      AND old.current_status IS NOT DISTINCT FROM expected_status
      AND old.status_group IS NOT DISTINCT FROM expected_group
      AND new.current_status = 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว'
      AND new.status_group = 'Hotel - Checked Complete'
      AND (NOT FOUND OR v.source_sync_state = 'synced')
      AND (NOT FOUND OR new.source_modified_at > greatest(
          coalesce(v.updated_at,'-infinity'::timestamptz),
          coalesce(v.source_synced_at,'-infinity'::timestamptz)));
    IF NOT approved THEN
      new.current_status:=old.current_status;
      new.status_group:=old.status_group;
    END IF;
    new.next_action:=old.next_action;
    new.defect_detail:=old.defect_detail;
    new.latest_source:=CASE WHEN approved THEN new.latest_source ELSE old.latest_source END;
    RETURN new;
  END IF;

  IF NOT FOUND THEN RETURN new; END IF;

  IF v.source_sync_state <> 'synced' OR v.source_synced_at IS NULL THEN
    new.current_status:=coalesce(v.current_status,new.current_status);
    new.status_group:=coalesce(v.status_group,new.status_group);
    new.next_action:=coalesce(v.next_action,new.next_action);
    new.defect_detail:=coalesce(v.detail_text,new.defect_detail);
    IF (v.current_status IS NOT NULL OR v.status_group IS NOT NULL
        OR v.next_action IS NOT NULL) THEN
      new.latest_source:=old.latest_source;
    END IF;
    RETURN new;
  END IF;

  approved_source := new.source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj'
    AND new.source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx'
    AND v.source_synced_at >= v.updated_at
    AND new.source_modified_at > v.source_synced_at;

  FOREACH v_field_name IN ARRAY ARRAY[
    'current_status','status_group','next_action','defect_detail'
  ] LOOP
    previous_value := pg_catalog.to_jsonb(old)->>v_field_name;
    proposed_value := pg_catalog.to_jsonb(new)->>v_field_name;
    override_value := CASE WHEN v_field_name='defect_detail' THEN v.detail_text
      ELSE pg_catalog.to_jsonb(v)->>v_field_name END;

    IF proposed_value IS NOT DISTINCT FROM previous_value THEN CONTINUE; END IF;

    SELECT f.last_accepted_value,f.last_source_revision,f.override_revision
      INTO accepted_value,accepted_revision,accepted_override_revision
      FROM private.defect_reconcile_field_versions f
      WHERE f.room_no=new.room_no AND f.field_name=v_field_name;

    IF FOUND AND accepted_override_revision IS NOT DISTINCT FROM v.updated_at THEN
      can_accept := approved_source
        AND previous_value IS NOT DISTINCT FROM accepted_value
        AND new.source_modified_at > accepted_revision;
    ELSE
      can_accept := approved_source
        AND previous_value IS NOT DISTINCT FROM override_value;
    END IF;

    IF can_accept THEN
      INSERT INTO private.defect_reconcile_field_versions AS f (
        room_no,field_name,override_revision,last_source_revision,
        last_accepted_value,last_accepted_at
      ) VALUES (
        new.room_no,v_field_name,v.updated_at,new.source_modified_at,
        proposed_value,now()
      ) ON CONFLICT (room_no,field_name) DO UPDATE SET
        override_revision=excluded.override_revision,
        last_source_revision=excluded.last_source_revision,
        last_accepted_value=excluded.last_accepted_value,
        last_accepted_at=excluded.last_accepted_at;
      INSERT INTO private.defect_reconcile_field_audit (
        room_no,field_name,decision,override_revision,source_revision,
        previous_db_value,proposed_excel_value,web_override_value
      ) VALUES (
        new.room_no,v_field_name,'accepted_excel',v.updated_at,
        new.source_modified_at,previous_value,proposed_value,override_value
      );
    ELSE
      new := pg_catalog.jsonb_populate_record(new,
        pg_catalog.jsonb_build_object(v_field_name,previous_value));
      IF NOT EXISTS (
        SELECT 1 FROM private.defect_reconcile_field_audit a
        WHERE a.room_no=new.room_no AND a.field_name=v_field_name
          AND a.decision='conflict_kept_db'
          AND a.override_revision IS NOT DISTINCT FROM v.updated_at
          AND a.source_revision IS NOT DISTINCT FROM new.source_modified_at
          AND a.proposed_excel_value IS NOT DISTINCT FROM proposed_value
      ) THEN
        INSERT INTO private.defect_reconcile_field_audit (
          room_no,field_name,decision,override_revision,source_revision,
          previous_db_value,proposed_excel_value,web_override_value
        ) VALUES (
          new.room_no,v_field_name,'conflict_kept_db',v.updated_at,
          new.source_modified_at,previous_value,proposed_value,override_value
        );
      END IF;
    END IF;
  END LOOP;
  RETURN new;
END
$function$;

-- Post-Rollback Assertion: B515 Excel transition to Incomplete MUST BE REJECTED
UPDATE public.condo_room_status SET
  current_status = 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ',
  status_group = 'Hotel - Awaiting Check'
WHERE room_no = 'B515';

UPDATE public.condo_room_status SET
  current_status = 'Defect ยังไม่เสร็จ / ต้องปิดงาน',
  status_group = 'Hotel - Incomplete',
  source_file_id = '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
  source_file_name = 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
  source_modified_at = '2026-10-28 10:00:00+00'
WHERE room_no = 'B515';

DO $test_b515_post_rollback$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.condo_room_status WHERE room_no = 'B515';
  IF v_rec.current_status = 'Defect ยังไม่เสร็จ / ต้องปิดงาน' THEN
    RAISE EXCEPTION 'FAIL: After rollback, B515 transition to Incomplete was unexpectedly accepted!';
  END IF;
  RAISE NOTICE 'PASS: Tested Rollback successfully verified: B515 Incomplete rejected after rollback';
END $test_b515_post_rollback$;

