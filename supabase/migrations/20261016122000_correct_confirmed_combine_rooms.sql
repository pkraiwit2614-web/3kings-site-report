-- 16 Oct 2026: physical Combine map from the user-provided A/B room schedules.
-- Preserve all physical room IDs, historical Defect work, hotel availability and plan rows.
-- Source of truth for runtime mapping: hotel_room_group_members / lib/hotelRoomGroups.ts.
-- Idempotent: already-reconciled Production may have 30 groups and 60 members.
DO $$
DECLARE
 v_members integer;
 v_groups integer;
 v_wrong integer;
BEGIN
 SELECT count(*),count(DISTINCT group_key) INTO v_members,v_groups FROM public.hotel_room_group_members;
 IF v_members=60 AND v_groups=30
   AND EXISTS (SELECT 1 FROM public.hotel_room_group_members WHERE room_no='A518' AND group_key='A517')
   AND EXISTS (SELECT 1 FROM public.hotel_room_group_members WHERE room_no='A618' AND group_key='A617')
   AND NOT EXISTS (SELECT 1 FROM public.hotel_room_group_members WHERE room_no IN ('A223','A224','A225','A313','A314','A623','A624'))
 THEN RETURN;
 END IF;
 IF v_members<>63 OR v_groups<>31 THEN
   RAISE EXCEPTION 'Combine mapping changed unexpectedly: % members, % groups',v_members,v_groups;
 END IF;
 SELECT count(*) INTO v_wrong FROM (VALUES
  ('A223','A223'),('A224','A223'),('A225','A223'),
  ('A313','A313'),('A314','A313'),('A623','A623'),('A624','A623')
 ) x(room_no,group_key)
 LEFT JOIN public.hotel_room_group_members m ON m.room_no=x.room_no AND m.group_key=x.group_key
 WHERE m.room_no IS NULL;
 IF v_wrong<>0 THEN RAISE EXCEPTION 'Previous Combine rows changed: % mismatches',v_wrong; END IF;
 IF (SELECT count(*) FROM public.condo_room_status WHERE room_no IN ('A517','A518','A617','A618'))<>4
 OR (SELECT count(*) FROM public.hotel_room_source_map WHERE room_no IN ('A517','A518','A617','A618'))<>4
 OR EXISTS(SELECT 1 FROM public.hotel_room_group_members WHERE room_no IN ('A517','A518','A617','A618'))
 THEN RAISE EXCEPTION 'New Combine rooms missing or already mapped'; END IF;
 DELETE FROM public.hotel_room_group_members
 WHERE room_no IN ('A223','A224','A225','A313','A314','A623','A624');
 INSERT INTO public.hotel_room_group_members(room_no,group_key) VALUES
  ('A517','A517'),('A518','A517'),('A617','A617'),('A618','A617');
 SELECT count(*),count(DISTINCT group_key) INTO v_members,v_groups FROM public.hotel_room_group_members;
 IF v_members<>60 OR v_groups<>30 THEN RAISE EXCEPTION 'Combine postflight mismatch'; END IF;
END $$;
-- Deliberately no updates to condo_room_status, hotel_room_availability,
-- hotel_work_plan_rooms or defect_work_order_snapshot.
