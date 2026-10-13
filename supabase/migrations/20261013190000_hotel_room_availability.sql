-- Hotel Room Availability is a separate operational layer. Zero changes to existing Defect source/status rows.
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS public.hotel_room_group_members (
  room_no text PRIMARY KEY REFERENCES public.condo_room_status(room_no),
  group_key text NOT NULL REFERENCES public.condo_room_status(room_no)
);
INSERT INTO public.hotel_room_group_members(room_no,group_key) VALUES
('A213','A213'),
('A214','A213'),
('A217','A217'),
('A218','A217'),
('A221','A221'),
('A222','A221'),
('A223','A223'),
('A224','A223'),
('A225','A223'),
('A308','A308'),
('A309','A308'),
('A313','A313'),
('A314','A313'),
('A317','A317'),
('A318','A317'),
('A402','A402'),
('A403','A402'),
('A404','A404'),
('A405','A404'),
('A413','A413'),
('A414','A413'),
('A417','A417'),
('A418','A417'),
('A506','A506'),
('A507','A506'),
('A508','A508'),
('A509','A508'),
('A513','A513'),
('A514','A513'),
('A521','A521'),
('A522','A521'),
('A602','A602'),
('A603','A602'),
('A604','A604'),
('A605','A604'),
('A606','A606'),
('A607','A606'),
('A608','A608'),
('A609','A608'),
('A613','A613'),
('A614','A613'),
('A621','A621'),
('A622','A621'),
('A623','A623'),
('A624','A623'),
('A702','A702'),
('A703','A702'),
('A704','A704'),
('A705','A704'),
('A706','A706'),
('A707','A706'),
('A708','A708'),
('A709','A708'),
('A713','A713'),
('A714','A713'),
('A717','A717'),
('A718','A717'),
('B610','B610'),
('B611','B610'),
('B614','B614'),
('B615','B614'),
('B712','B712'),
('B713','B712')
ON CONFLICT (room_no) DO NOTHING;
CREATE INDEX IF NOT EXISTS hotel_room_group_members_key_idx ON public.hotel_room_group_members(group_key);
ALTER TABLE public.hotel_room_group_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_room_group_members FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hotel_room_group_members TO authenticated;
CREATE POLICY hotel_group_read_active ON public.hotel_room_group_members FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=(SELECT auth.uid()) AND p.active=true));

CREATE TABLE public.hotel_room_availability (
  room_no text PRIMARY KEY REFERENCES public.condo_room_status(room_no),
  availability_status text NOT NULL CHECK (availability_status IN ('AVAILABLE','OOO','OOS')),
  start_date date,
  end_date date,
  reason text,
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  CONSTRAINT hotel_availability_dates_valid CHECK (end_date IS NULL OR (start_date IS NOT NULL AND end_date>=start_date))
);
COMMENT ON TABLE public.hotel_room_availability IS 'Hotel-maintained availability. One canonical record per combine group. Never modifies condo_room_status or Defect writeback.';
ALTER TABLE public.hotel_room_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_room_availability FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hotel_room_availability TO authenticated;
CREATE POLICY hotel_availability_read_active ON public.hotel_room_availability FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=(SELECT auth.uid()) AND p.active=true));

CREATE TABLE public.hotel_room_availability_reviews (
  room_no text PRIMARY KEY REFERENCES public.hotel_room_availability(room_no) ON DELETE RESTRICT,
  reviewed_status text NOT NULL CHECK (reviewed_status IN ('AVAILABLE','OOO','OOS')),
  reviewed_revision integer NOT NULL,
  reviewed_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.hotel_room_availability_reviews IS 'Independent owner-reviewed 3 Kings baseline; Hotel edits do not auto-approve or overwrite it.';
ALTER TABLE public.hotel_room_availability_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_room_availability_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hotel_room_availability_reviews TO authenticated;
CREATE POLICY hotel_reviews_owner_read ON public.hotel_room_availability_reviews FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=(SELECT auth.uid()) AND p.active=true AND p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager'));

CREATE OR REPLACE FUNCTION public.hotel_room_availability_save(
  p_room_no text,p_status text,p_start_date date,p_end_date date,p_reason text,p_expected_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $func$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_room text := upper(regexp_replace(btrim(coalesce(p_room_no,'')),'[[:space:]-]','','g'));
  v_group text;
  v_prev integer;
  v_revision integer;
  v_display_name text;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true
    AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')
  ) THEN RAISE EXCEPTION 'ROOM_AVAILABILITY_EDIT_DENIED'; END IF;
  IF v_room ~ '^GOOD0?[1-5]$' THEN v_room := 'B10'||right(v_room,1); END IF;
  IF v_room !~ '^[AB][0-9]{3}$' THEN RAISE EXCEPTION 'INVALID_ROOM'; END IF;
  SELECT coalesce(m.group_key,r.room_no) INTO v_group
  FROM public.condo_room_status r LEFT JOIN public.hotel_room_group_members m ON m.room_no=r.room_no
  WHERE r.room_no=v_room;
  IF v_group IS NULL THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  -- The hotel editor may change availability only for Hotel-program units.
  IF NOT EXISTS(
    SELECT 1 FROM public.condo_room_status r
    WHERE r.room_no=v_room AND r.hotel_participation='ร่วมโรงแรม'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.role='manager'
    AND p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  ) THEN RAISE EXCEPTION 'ROOM_OUTSIDE_HOTEL_PROGRAM'; END IF;
  IF p_status NOT IN ('AVAILABLE','OOO','OOS') THEN RAISE EXCEPTION 'INVALID_AVAILABILITY_STATUS'; END IF;
  IF p_status IN ('OOO','OOS') AND (p_start_date IS NULL OR nullif(btrim(coalesce(p_reason,'')),'') IS NULL) THEN
    RAISE EXCEPTION 'START_DATE_AND_REASON_REQUIRED';
  END IF;
  IF p_end_date IS NOT NULL AND (p_start_date IS NULL OR p_end_date<p_start_date) THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
  IF char_length(coalesce(p_reason,''))>2000 THEN RAISE EXCEPTION 'REASON_TOO_LONG'; END IF;
  SELECT a.revision INTO v_prev FROM public.hotel_room_availability a WHERE a.room_no=v_group FOR UPDATE;
  IF v_prev IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
  SELECT coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.username),''),'ผู้ใช้') INTO v_display_name
    FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true;
  IF v_prev IS NULL THEN
    INSERT INTO public.hotel_room_availability(room_no,availability_status,start_date,end_date,reason,updated_by,updated_by_name)
    VALUES(v_group,p_status,CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_start_date END,
       CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_end_date END,
       nullif(btrim(coalesce(p_reason,'')),''),v_uid,coalesce(v_display_name,'ผู้ใช้'));
    v_revision:=1;
  ELSE
    UPDATE public.hotel_room_availability SET availability_status=p_status,
      start_date=CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_start_date END,
      end_date=CASE WHEN p_status='AVAILABLE' THEN NULL ELSE p_end_date END,
      reason=nullif(btrim(coalesce(p_reason,'')),''),
      updated_by=v_uid,updated_by_name=coalesce(v_display_name,'ผู้ใช้'),
      updated_at=now(),revision=revision+1
    WHERE room_no=v_group RETURNING revision INTO v_revision;
  END IF;
  INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
  VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-room-status','hotel_room_availability_save',v_group,
    jsonb_build_object('status',p_status,'members',(
      SELECT jsonb_agg(m.room_no ORDER BY m.room_no) FROM public.hotel_room_group_members m WHERE m.group_key=v_group
    ),'revision',v_revision));
  RETURN jsonb_build_object('room_no',v_group,'revision',v_revision,'status',p_status);
END $func$;
REVOKE ALL ON FUNCTION public.hotel_room_availability_save(text,text,date,date,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_room_availability_save(text,text,date,date,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.hotel_room_availability_review(p_room_no text,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $func$
DECLARE v_uid uuid := (SELECT auth.uid());v_room text := upper(btrim(coalesce(p_room_no,'')));
  v_status text;v_revision integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true
    AND p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager')
    THEN RAISE EXCEPTION 'REVIEW_OWNER_ONLY'; END IF;
  SELECT availability_status,revision INTO v_status,v_revision FROM public.hotel_room_availability
    WHERE room_no=v_room FOR UPDATE;
  IF v_revision IS NULL OR v_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
  INSERT INTO public.hotel_room_availability_reviews(room_no,reviewed_status,reviewed_revision,reviewed_by,reviewed_at)
  VALUES(v_room,v_status,v_revision,v_uid,now())
  ON CONFLICT(room_no) DO UPDATE SET reviewed_status=EXCLUDED.reviewed_status,
    reviewed_revision=EXCLUDED.reviewed_revision,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=now();
  INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
  VALUES(v_uid,gen_random_uuid(),'data_change','/data-health','hotel_room_availability_review',v_room,
    jsonb_build_object('status',v_status,'revision',v_revision));
  RETURN jsonb_build_object('ok',true,'room_no',v_room,'revision',v_revision);
END $func$;
REVOKE ALL ON FUNCTION public.hotel_room_availability_review(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_room_availability_review(text,integer) TO authenticated;
