-- One-time gap fill for existing Combine physical-room statuses.
-- Evidence: 2026-10-13 production preflight found EXACTLY 14 groups with one
-- synced OOO source Room ID and one completely missing partner Room ID.
-- Never update/overwrite an existing Hotel row, Defect record, or Excel directly.
-- Every inserted target is sent through the existing guarded Excel writeback.
DO $$
DECLARE
  v record;
  v_count integer:=0;
  v_owner uuid:='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid;
BEGIN
  FOR v IN
    WITH single_source AS (
      SELECT m.group_key,min(h.room_no) AS source_room
      FROM public.hotel_room_group_members m
      JOIN public.hotel_room_availability h ON h.room_no=m.room_no
      GROUP BY m.group_key HAVING count(*)=1
    )
    SELECT m.group_key,m.room_no AS target_room,s.room_no AS source_room,
      s.availability_status,s.start_date,s.end_date,s.reason,s.hotel_remark
    FROM single_source g
    JOIN public.hotel_room_group_members m ON m.group_key=g.group_key
    JOIN public.hotel_room_availability s ON s.room_no=g.source_room
    JOIN public.hotel_room_source_map sm ON sm.room_no=m.room_no
    LEFT JOIN public.hotel_room_availability d ON d.room_no=m.room_no
    WHERE d.room_no IS NULL AND s.source_sync_state='synced'
    ORDER BY m.room_no
  LOOP
    -- Serializes against concurrent edits through hotel_room_availability_save.
    PERFORM 1 FROM public.condo_room_status r
      WHERE r.room_no IN (v.source_room,v.target_room)
      ORDER BY r.room_no FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.hotel_room_availability h WHERE h.room_no=v.target_room)
      THEN RAISE EXCEPTION 'COMBINE_TARGET_CONCURRENTLY_UPDATED: %',v.target_room; END IF;
    INSERT INTO public.hotel_room_availability (
      room_no,availability_status,start_date,end_date,reason,hotel_remark,
      updated_by,updated_by_name,revision,source_sync_state
    ) VALUES (
      v.target_room,v.availability_status,v.start_date,v.end_date,v.reason,v.hotel_remark,
      v_owner,'Combine sync from '||v.source_room,1,'pending'
    );
    INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
    VALUES (v_owner,gen_random_uuid(),'data_change','/hotel-room-status',
      'hotel_combine_missing_status_mirror',v.target_room,
      jsonb_build_object('source_room',v.source_room,'group_key',v.group_key,
        'status',v.availability_status,'initially_missing',true,'excel_writeback','pending'));
    v_count:=v_count+1;
  END LOOP;
  IF v_count<>14 THEN
    RAISE EXCEPTION 'COMBINE_MIRROR_PREFLIGHT_COUNT_MISMATCH: %, expected 14',v_count;
  END IF;
END $$;
