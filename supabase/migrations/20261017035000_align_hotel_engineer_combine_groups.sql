-- 2026-10-17: Hotel Engineer room inventory supersedes prior Hotel Combine pairing.
-- 16 Hotel pairs (144 physical rooms => 128 Hotel groups), 11 non-hotel pairs unchanged.
-- Group membership only. Do NOT rewrite room status, defect history, OOO/OOS or work plans.
DO $$
DECLARE
  v_members integer;
  v_groups integer;
  v_hotel integer;
  v_nonhotel integer;
  v_invalid integer;
BEGIN
  SELECT count(*), count(distinct group_key) INTO v_members,v_groups
  FROM public.hotel_room_group_members;

  IF v_members=54 AND v_groups=27 THEN
    -- Already applied directly to Production; verify below instead of rewriting.
    NULL;
  ELSIF v_members=60 AND v_groups=30 THEN
    WITH old_pair(room_no,group_key) AS (VALUES
      ('A517','A517'), ('A518','A517'), ('A606','A606'),
      ('A607','A606'), ('A617','A617'), ('A618','A617'))
    SELECT count(*) INTO v_invalid
    FROM old_pair p
      LEFT JOIN public.hotel_room_group_members m ON m.room_no=p.room_no
      LEFT JOIN public.condo_room_status c ON c.room_no=p.room_no
    WHERE m.group_key IS DISTINCT FROM p.group_key
       OR c.hotel_participation IS DISTINCT FROM 'ร่วมโรงแรม';
    IF v_invalid<>0 THEN RAISE EXCEPTION 'Combine source changed; abort (% mismatches)',v_invalid; END IF;

    DELETE FROM public.hotel_room_group_members
    WHERE (room_no,group_key) IN (
      ('A517','A517'), ('A518','A517'), ('A606','A606'),
      ('A607','A606'), ('A617','A617'), ('A618','A617'));
  ELSE
    RAISE EXCEPTION 'Unexpected Combine preflight inventory % members / % groups',v_members,v_groups;
  END IF;

  SELECT count(*), count(distinct group_key) INTO v_members,v_groups
  FROM public.hotel_room_group_members;
  SELECT count(distinct m.group_key) INTO v_hotel
  FROM public.hotel_room_group_members m
  JOIN public.condo_room_status c ON c.room_no=m.room_no
  WHERE c.hotel_participation='ร่วมโรงแรม';
  SELECT count(distinct m.group_key) INTO v_nonhotel
  FROM public.hotel_room_group_members m
  JOIN public.condo_room_status c ON c.room_no=m.room_no
  WHERE c.hotel_participation='ไม่ร่วมโรงแรม';

  IF v_members<>54 OR v_groups<>27 OR v_hotel<>16 OR v_nonhotel<>11
  OR EXISTS (SELECT 1 FROM public.hotel_room_group_members
             WHERE room_no IN ('A517','A518','A606','A607','A617','A618'))
  THEN
    RAISE EXCEPTION 'Hotel Engineer 27-pair postflight failed: members % groups % hotel % nonhotel %',
      v_members,v_groups,v_hotel,v_nonhotel;
  END IF;
END $$;
