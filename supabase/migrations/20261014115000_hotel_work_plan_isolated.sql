-- Above Element Hotel Work Plan: additive, isolated from Defect and Hotel OOO/OOS.
-- The source is the immutable 2026-10-13 comparison snapshot, NOT live Defect truth.
BEGIN;
CREATE TABLE IF NOT EXISTS public.hotel_work_plan_days (
 day_no smallint PRIMARY KEY CHECK(day_no BETWEEN 1 AND 9),
 planned_date date,
 note text CHECK(note IS NULL OR length(note)<=2000),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 sync_state text NOT NULL DEFAULT 'synced' CHECK(sync_state IN ('synced','pending','conflict')),
 updated_by uuid REFERENCES auth.users(id),
 updated_by_name text,
 updated_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.hotel_work_plan_rooms (
 seq_no integer PRIMARY KEY CHECK(seq_no BETWEEN 1 AND 267),
 day_no smallint NOT NULL REFERENCES public.hotel_work_plan_days(day_no),
 source_room text NOT NULL,
 room_no text NOT NULL,
 source_row integer NOT NULL UNIQUE CHECK(source_row BETWEEN 4 AND 270),
 planned_date_override date,
 actual_date date,
 work_status text NOT NULL DEFAULT 'pending' CHECK(work_status IN ('pending','confirmed','in_progress','completed','postponed')),
 note text CHECK(note IS NULL OR length(note)<=2000),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 sync_state text NOT NULL DEFAULT 'synced' CHECK(sync_state IN ('synced','pending','conflict')),
 updated_by uuid REFERENCES auth.users(id),
 updated_by_name text,
 updated_at timestamptz
);
COMMENT ON TABLE public.hotel_work_plan_rooms IS 'Above Element Day 1–9: 267 source schedule entries; distinct GOOD aliases preserve original Seq. No Defect/OOO data mutation.';
CREATE INDEX IF NOT EXISTS hotel_work_plan_rooms_day_idx ON public.hotel_work_plan_rooms(day_no,seq_no);
CREATE INDEX IF NOT EXISTS hotel_work_plan_rooms_room_idx ON public.hotel_work_plan_rooms(room_no);
ALTER TABLE public.hotel_work_plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_work_plan_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hotel_work_plan_days,public.hotel_work_plan_rooms FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.hotel_work_plan_days,public.hotel_work_plan_rooms TO authenticated;
CREATE POLICY hotel_work_plan_day_read ON public.hotel_work_plan_days FOR SELECT TO authenticated
 USING ((SELECT private.is_active_user()));
CREATE POLICY hotel_work_plan_room_read ON public.hotel_work_plan_rooms FOR SELECT TO authenticated
 USING ((SELECT private.is_active_user()));
INSERT INTO public.hotel_work_plan_days(day_no) SELECT generate_series(1,9)
 ON CONFLICT(day_no) DO NOTHING;
INSERT INTO public.hotel_work_plan_rooms(seq_no,day_no,source_room,room_no,source_row)
VALUES
(1,1,'A202','A202',4),
(2,1,'A203','A203',5),
(3,1,'A204','A204',6),
(4,1,'A205','A205',7),
(5,1,'A206','A206',8),
(6,1,'A208','A208',9),
(7,1,'A210','A210',10),
(8,1,'A211','A211',11),
(9,1,'A212','A212',12),
(10,1,'A213','A213',13),
(11,1,'A216','A216',14),
(12,1,'A217','A217',15),
(13,1,'A220','A220',16),
(14,1,'A226','A226',17),
(15,1,'A227','A227',18),
(16,1,'A304','A304',19),
(17,1,'A308','A308',20),
(18,1,'A310','A310',21),
(19,1,'A311','A311',22),
(20,1,'A313','A313',23),
(21,1,'A314','A314',24),
(22,1,'A316','A316',25),
(23,1,'A317','A317',26),
(24,1,'A320','A320',27),
(25,1,'A321','A321',28),
(26,1,'A322','A322',29),
(27,1,'A323','A323',30),
(28,1,'A324','A324',31),
(29,1,'A325','A325',32),
(30,1,'A326','A326',33),
(31,2,'A410','A410',34),
(32,2,'A412','A412',35),
(33,2,'A415','A415',36),
(34,2,'A416','A416',37),
(35,2,'A417','A417',38),
(36,2,'A419','A419',39),
(37,2,'A423','A423',40),
(38,2,'A424','A424',41),
(39,2,'A425','A425',42),
(40,2,'A426','A426',43),
(41,2,'A516','A516',44),
(42,2,'A517','A517',45),
(43,2,'A518','A518',46),
(44,2,'A520','A520',47),
(45,2,'A523','A523',48),
(46,2,'A524','A524',49),
(47,2,'A525','A525',50),
(48,2,'A526','A526',51),
(49,2,'A527','A527',52),
(50,2,'A602','A602',53),
(51,2,'A606','A606',54),
(52,2,'A610','A610',55),
(53,2,'A611','A611',56),
(54,2,'A613','A613',57),
(55,2,'A616','A616',58),
(56,2,'A620','A620',59),
(57,2,'A621','A621',60),
(58,2,'A626','A626',61),
(59,2,'A702','A702',62),
(60,2,'A706','A706',63),
(61,3,'A711','A711',64),
(62,3,'A716','A716',65),
(63,3,'A724','A724',66),
(64,3,'A725','A725',67),
(65,3,'A726','A726',68),
(66,3,'B102','B102',69),
(67,3,'B103','B103',70),
(68,3,'B104','B104',71),
(69,3,'B105','B105',72),
(70,3,'B209','B209',73),
(71,3,'B211','B211',74),
(72,3,'B214','B214',75),
(73,3,'B311','B311',76),
(74,3,'B312','B312',77),
(75,3,'B314','B314',78),
(76,3,'B315','B315',79),
(77,3,'B402','B402',80),
(78,3,'B403','B403',81),
(79,3,'B406','B406',82),
(80,3,'B408','B408',83),
(81,3,'B503','B503',84),
(82,3,'B509','B509',85),
(83,3,'B511','B511',86),
(84,3,'B512','B512',87),
(85,3,'B513','B513',88),
(86,3,'B514','B514',89),
(87,3,'B515','B515',90),
(88,3,'B610','B610',91),
(89,3,'B614','B614',92),
(90,3,'B709','B709',93),
(91,4,'B710','B710',94),
(92,4,'B712','B712',95),
(93,4,'B714','B714',96),
(94,4,'B716','B716',97),
(95,4,'A305','A305',98),
(96,4,'A309','A309',99),
(97,4,'A402','A402',100),
(98,4,'A413','A413',101),
(99,4,'A414','A414',102),
(100,4,'A501','A501',103),
(101,4,'A502','A502',104),
(102,4,'A505','A505',105),
(103,4,'A508','A508',106),
(104,4,'A513','A513',107),
(105,4,'A617','A617',108),
(106,4,'A618','A618',109),
(107,4,'A623','A623',110),
(108,4,'A624','A624',111),
(109,4,'A625','A625',112),
(110,4,'A717','A717',113),
(111,4,'A718','A718',114),
(112,4,'GOOD 02','B102',115),
(113,4,'GOOD 03','B103',116),
(114,4,'GOOD 04','B104',117),
(115,4,'GOOD 05','B105',118),
(116,4,'B205','B205',119),
(117,4,'B206','B206',120),
(118,4,'B212','B212',121),
(119,4,'B213','B213',122),
(120,4,'B215','B215',123),
(121,5,'B301','B301',124),
(122,5,'B306','B306',125),
(123,5,'B316','B316',126),
(124,5,'B404','B404',127),
(125,5,'B409','B409',128),
(126,5,'B412','B412',129),
(127,5,'B603','B603',130),
(128,5,'B604','B604',131),
(129,5,'B605','B605',132),
(130,5,'B606','B606',133),
(131,5,'B607','B607',134),
(132,5,'B608','B608',135),
(133,5,'B705','B705',136),
(134,5,'B711','B711',137),
(135,5,'A201','A201',138),
(136,5,'A207','A207',139),
(137,5,'A209','A209',140),
(138,5,'A214','A214',141),
(139,5,'A215','A215',142),
(140,5,'A218','A218',143),
(141,5,'A219','A219',144),
(142,5,'A221','A221',145),
(143,5,'A222','A222',146),
(144,5,'A223','A223',147),
(145,5,'A224','A224',148),
(146,5,'A225','A225',149),
(147,5,'A301','A301',150),
(148,5,'A302','A302',151),
(149,5,'A303','A303',152),
(150,5,'A306','A306',153),
(151,6,'A307','A307',154),
(152,6,'A312','A312',155),
(153,6,'A315','A315',156),
(154,6,'A318','A318',157),
(155,6,'A319','A319',158),
(156,6,'A327','A327',159),
(157,6,'A401','A401',160),
(158,6,'A403','A403',161),
(159,6,'A404','A404',162),
(160,6,'A405','A405',163),
(161,6,'A406','A406',164),
(162,6,'A407','A407',165),
(163,6,'A408','A408',166),
(164,6,'A409','A409',167),
(165,6,'A411','A411',168),
(166,6,'A418','A418',169),
(167,6,'A420','A420',170),
(168,6,'A421','A421',171),
(169,6,'A422','A422',172),
(170,6,'A427','A427',173),
(171,6,'A503','A503',174),
(172,6,'A504','A504',175),
(173,6,'A506','A506',176),
(174,6,'A507','A507',177),
(175,6,'A509','A509',178),
(176,6,'A510','A510',179),
(177,6,'A511','A511',180),
(178,6,'A512','A512',181),
(179,6,'A514','A514',182),
(180,6,'A515','A515',183),
(181,7,'A519','A519',184),
(182,7,'A521','A521',185),
(183,7,'A522','A522',186),
(184,7,'A601','A601',187),
(185,7,'A603','A603',188),
(186,7,'A604','A604',189),
(187,7,'A605','A605',190),
(188,7,'A607','A607',191),
(189,7,'A608','A608',192),
(190,7,'A609','A609',193),
(191,7,'A612','A612',194),
(192,7,'A614','A614',195),
(193,7,'A615','A615',196),
(194,7,'A619','A619',197),
(195,7,'A622','A622',198),
(196,7,'A627','A627',199),
(197,7,'A701','A701',200),
(198,7,'A703','A703',201),
(199,7,'A704','A704',202),
(200,7,'A705','A705',203),
(201,7,'A707','A707',204),
(202,7,'A708','A708',205),
(203,7,'A709','A709',206),
(204,7,'A710','A710',207),
(205,7,'A712','A712',208),
(206,7,'A713','A713',209),
(207,7,'A714','A714',210),
(208,7,'A715','A715',211),
(209,7,'A719','A719',212),
(210,7,'A720','A720',213),
(211,8,'A721','A721',214),
(212,8,'A722','A722',215),
(213,8,'A723','A723',216),
(214,8,'A727','A727',217),
(215,8,'GOOD 01','B101',218),
(216,8,'B201','B201',219),
(217,8,'B202','B202',220),
(218,8,'B203','B203',221),
(219,8,'B204','B204',222),
(220,8,'B207','B207',223),
(221,8,'B208','B208',224),
(222,8,'B210','B210',225),
(223,8,'B216','B216',226),
(224,8,'B302','B302',227),
(225,8,'B303','B303',228),
(226,8,'B304','B304',229),
(227,8,'B305','B305',230),
(228,8,'B307','B307',231),
(229,8,'B308','B308',232),
(230,8,'B309','B309',233),
(231,8,'B310','B310',234),
(232,8,'B313','B313',235),
(233,8,'B401','B401',236),
(234,8,'B405','B405',237),
(235,8,'B407','B407',238),
(236,8,'B410','B410',239),
(237,8,'B411','B411',240),
(238,8,'B413','B413',241),
(239,8,'B414','B414',242),
(240,8,'B415','B415',243),
(241,9,'B416','B416',244),
(242,9,'B501','B501',245),
(243,9,'B502','B502',246),
(244,9,'B504','B504',247),
(245,9,'B505','B505',248),
(246,9,'B506','B506',249),
(247,9,'B507','B507',250),
(248,9,'B508','B508',251),
(249,9,'B510','B510',252),
(250,9,'B516','B516',253),
(251,9,'B601','B601',254),
(252,9,'B602','B602',255),
(253,9,'B609','B609',256),
(254,9,'B611','B611',257),
(255,9,'B612','B612',258),
(256,9,'B613','B613',259),
(257,9,'B615','B615',260),
(258,9,'B616','B616',261),
(259,9,'B701','B701',262),
(260,9,'B702','B702',263),
(261,9,'B703','B703',264),
(262,9,'B704','B704',265),
(263,9,'B706','B706',266),
(264,9,'B707','B707',267),
(265,9,'B708','B708',268),
(266,9,'B713','B713',269),
(267,9,'B715','B715',270)
ON CONFLICT(seq_no) DO NOTHING;
DO $$BEGIN
 IF (SELECT count(*) FROM public.hotel_work_plan_rooms)<>267 THEN RAISE EXCEPTION 'HOTEL_PLAN_267_ROW_PRECONDITION'; END IF;
 IF EXISTS(SELECT 1 FROM public.hotel_work_plan_rooms WHERE room_no!~'^[AB][0-9]{3}$') THEN RAISE EXCEPTION 'HOTEL_PLAN_INVALID_ROOM_ALIAS'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.hotel_work_plan_save_day(
 p_day integer,p_planned_date date,p_note text,p_expected_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_uid uuid:=auth.uid();v_before public.hotel_work_plan_days%ROWTYPE;v_after public.hotel_work_plan_days%ROWTYPE;v_name text;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS (
 SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true
 AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')
 ) THEN RAISE EXCEPTION 'HOTEL_WORK_PLAN_EDIT_DENIED'; END IF;
 IF p_day NOT BETWEEN 1 AND 9 OR length(coalesce(p_note,''))>2000 THEN RAISE EXCEPTION 'INVALID_WORK_PLAN'; END IF;
 SELECT * INTO v_before FROM public.hotel_work_plan_days WHERE day_no=p_day FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_WORK_PLAN_DAY'; END IF;
 IF v_before.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
 SELECT coalesce(nullif(p.full_name,''),nullif(p.username,''),'ผู้ใช้') INTO v_name FROM public.profiles p WHERE p.user_id=v_uid;
 UPDATE public.hotel_work_plan_days SET planned_date=p_planned_date,note=nullif(btrim(coalesce(p_note,'')),''),
 revision=revision+1,sync_state='pending',updated_by=v_uid,updated_by_name=v_name,updated_at=now()
 WHERE day_no=p_day RETURNING * INTO v_after;
 INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
 VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-work-plan','hotel_work_plan_save_day','Day '||p_day,
 jsonb_build_object('previous_date',v_before.planned_date,'new_date',v_after.planned_date,
 'previous_note',v_before.note,'new_note',v_after.note,'revision',v_after.revision));
 RETURN jsonb_build_object('ok',true,'revision',v_after.revision);
END $fn$;
CREATE OR REPLACE FUNCTION public.hotel_work_plan_save_room(
 p_seq integer,p_day integer,p_override_date date,p_actual_date date,p_status text,p_note text,p_expected_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_uid uuid:=auth.uid();v_before public.hotel_work_plan_rooms%ROWTYPE;v_after public.hotel_work_plan_rooms%ROWTYPE;v_name text;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS (
 SELECT 1 FROM public.profiles p WHERE p.user_id=v_uid AND p.active=true
 AND ((p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid AND p.role='manager') OR p.role='defect_editor')
 ) THEN RAISE EXCEPTION 'HOTEL_WORK_PLAN_EDIT_DENIED'; END IF;
 IF p_day NOT BETWEEN 1 AND 9 OR p_status NOT IN ('pending','confirmed','in_progress','completed','postponed')
 OR length(coalesce(p_note,''))>2000 THEN RAISE EXCEPTION 'INVALID_WORK_PLAN'; END IF;
 SELECT * INTO v_before FROM public.hotel_work_plan_rooms WHERE seq_no=p_seq FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_WORK_PLAN_SEQ'; END IF;
 IF v_before.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT_RELOAD'; END IF;
 SELECT coalesce(nullif(p.full_name,''),nullif(p.username,''),'ผู้ใช้') INTO v_name FROM public.profiles p WHERE p.user_id=v_uid;
 UPDATE public.hotel_work_plan_rooms SET day_no=p_day,planned_date_override=p_override_date,actual_date=p_actual_date,
 work_status=p_status,note=nullif(btrim(coalesce(p_note,'')),''),revision=revision+1,sync_state='pending',
 updated_by=v_uid,updated_by_name=v_name,updated_at=now()
 WHERE seq_no=p_seq RETURNING * INTO v_after;
 INSERT INTO public.activity_logs(user_id,client_session_id,event_type,path,action,target,metadata)
 VALUES(v_uid,gen_random_uuid(),'data_change','/hotel-work-plan','hotel_work_plan_save_room',v_before.room_no,
 jsonb_build_object('seq',p_seq,'previous_day',v_before.day_no,'new_day',p_day,
 'previous_date',v_before.planned_date_override,'new_date',p_override_date,
 'previous_actual',v_before.actual_date,'new_actual',p_actual_date,
 'previous_status',v_before.work_status,'new_status',p_status,'revision',v_after.revision));
 RETURN jsonb_build_object('ok',true,'revision',v_after.revision);
END $fn$;
REVOKE ALL ON FUNCTION public.hotel_work_plan_save_day(integer,date,text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hotel_work_plan_save_room(integer,integer,date,date,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_work_plan_save_day(integer,date,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_work_plan_save_room(integer,integer,date,date,text,text,integer) TO authenticated;
COMMIT;
