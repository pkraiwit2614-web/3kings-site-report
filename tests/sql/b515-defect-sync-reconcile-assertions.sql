-- Synthetic assertions for B515 Scoped Reconcile & Regression on B214, B314, B315, B403.
-- ON_ERROR_STOP=1 catches any assertion failure.
SET client_min_messages = warning;

-- 1. Setup synthetic test rooms in condo_room_status and defect_web_overrides
INSERT INTO public.condo_room_status (
  room_no, building, floor, hotel_participation, customer_status,
  current_status, status_group, follow_up, priority, next_action,
  defect_detail, latest_source, source_file_id, source_file_name, source_modified_at
) VALUES
  ('B515', 'B', 5, 'ร่วมโรงแรม', 'มีลูกค้า',
   'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ', 'Hotel - Awaiting Check', 'รอติดตาม', 'normal', 'รอตรวจยืนยัน',
   'Customer Defect B515: ประตูระเบียงเปิดฝืด และกระเบื้องห้องน้ำบิ่น', 'Prior sync',
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

