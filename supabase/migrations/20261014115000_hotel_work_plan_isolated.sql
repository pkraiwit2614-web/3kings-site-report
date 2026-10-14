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
 source_row integer NOT NULL UNIQUE CHECK(source_row BETWEEN 5 AND 271),
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
(1,1,'A202','A202',5),
(2,1,'A203','A203',6),
(3,1,'A204','A204',7),
(4,1,'A205','A205',8),
(5,1,'A206','A206',9),
(6,1,'A208','A208',10),
(7,1,'A210','A210',11),
(8,1,'A211','A211',12),
(9,1,'A212','A212',13),
(10,1,'A213','A213',14),
(11,1,'A216','A216',15),
(12,1,'A217','A217',16),
(13,1,'A220','A220',17),
(14,1,'A226','A226',18),
(15,1,'A227','A227',19),
(16,1,'A304','A304',20),
(17,1,'A308','A308',21),
(18,1,'A310','A310',22),
(19,1,'A311','A311',23),
(20,1,'A313','A313',24),
(21,1,'A314','A314',25),
(22,1,'A316','A316',26),
(23,1,'A317','A317',27),
(24,1,'A320','A320',28),
(25,1,'A321','A321',29),
(26,1,'A322','A322',30),
(27,1,'A323','A323',31),
(28,1,'A324','A324',32),
(29,1,'A325','A325',33),
(30,1,'A326','A326',34),
(31,2,'A410','A410',35),
(32,2,'A412','A412',36),
(33,2,'A415','A415',37),
(34,2,'A416','A416',38),
(35,2,'A417','A417',39),
(36,2,'A419','A419',40),
(37,2,'A423','A423',41),
(38,2,'A424','A424',42),
(39,2,'A425','A425',43),
(40,2,'A426','A426',44),
(41,2,'A516','A516',45),
(42,2,'A517','A517',46),
(43,2,'A518','A518',47),
(44,2,'A520','A520',48),
(45,2,'A523','A523',49),
(46,2,'A524','A524',50),
(47,2,'A525','A525',51),
(48,2,'A526','A526',52),
(49,2,'A527','A527',53),
(50,2,'A602','A602',54),
(51,2,'A606','A606',55),
(52,2,'A610','A610',56),
(53,2,'A611','A611',57),
(54,2,'A613','A613',58),
(55,2,'A616','A616',59),
(56,2,'A620','A620',60),
(57,2,'A621','A621',61),
(58,2,'A626','A626',62),
(59,2,'A702','A702',63),
(60,2,'A706','A706',64),
(61,3,'A711','A711',65),
(62,3,'A716','A716',66),
(63,3,'A724','A724',67),
(64,3,'A725','A725',68),
(65,3,'A726','A726',69),
(66,3,'B102','B102',70),
(67,3,'B103','B103',71),
(68,3,'B104','B104',72),
(69,3,'B105','B105',73),
(70,3,'B209','B209',74),
(71,3,'B211','B211',75),
(72,3,'B214','B214',76),
(73,3,'B311','B311',77),
(74,3,'B312','B312',78),
(75,3,'B314','B314',79),
(76,3,'B315','B315',80),
(77,3,'B402','B402',81),
(78,3,'B403','B403',82),
(79,3,'B406','B406',83),
(80,3,'B408','B408',84),
(81,3,'B503','B503',85),
(82,3,'B509','B509',86),
(83,3,'B511','B511',87),
(84,3,'B512','B512',88),
(85,3,'B513','B513',89),
(86,3,'B514','B514',90),
(87,3,'B515','B515',91),
(88,3,'B610','B610',92),
(89,3,'B614','B614',93),
(90,3,'B709','B709',94),
(91,4,'B710','B710',95),
(92,4,'B712','B712',96),
(93,4,'B714','B714',97),
(94,4,'B716','B716',98),
(95,4,'A305','A305',99),
(96,4,'A309','A309',100),
(97,4,'A402','A402',101),
(98,4,'A413','A413',102),
(99,4,'A414','A414',103),
(100,4,'A501','A501',104),
(101,4,'A502','A502',105),
(102,4,'A505','A505',106),
(103,4,'A508','A508',107),
(104,4,'A513','A513',108),
(105,4,'A617','A617',109),
(106,4,'A618','A618',110),
(107,4,'A623','A623',111),
(108,4,'A624','A624',112),
(109,4,'A625','A625',113),
(110,4,'A717','A717',114),
(111,4,'A718','A718',115),
(112,4,'GOOD 02','B102',116),
(113,4,'GOOD 03','B103',117),
(114,4,'GOOD 04','B104',118),
(115,4,'GOOD 05','B105',119),
(116,4,'B205','B205',120),
(117,4,'B206','B206',121),
(118,4,'B212','B212',122),
(119,4,'B213','B213',123),
(120,4,'B215','B215',124),
(121,5,'B301','B301',125),
(122,5,'B306','B306',126),
(123,5,'B316','B316',127),
(124,5,'B404','B404',128),
(125,5,'B409','B409',129),
(126,5,'B412','B412',130),
(127,5,'B603','B603',131),
(128,5,'B604','B604',132),
(129,5,'B605','B605',133),
(130,5,'B606','B606',134),
(131,5,'B607','B607',135),
(132,5,'B608','B608',136),
(133,5,'B705','B705',137),
(134,5,'B711','B711',138),
(135,5,'A201','A201',139),
(136,5,'A207','A207',140),
(137,5,'A209','A209',141),
(138,5,'A214','A214',142),
(139,5,'A215','A215',143),
(140,5,'A218','A218',144),
(141,5,'A219','A219',145),
(142,5,'A221','A221',146),
(143,5,'A222','A222',147),
(144,5,'A223','A223',148),
(145,5,'A224','A224',149),
(146,5,'A225','A225',150),
(147,5,'A301','A301',151),
(148,5,'A302','A302',152),
(149,5,'A303','A303',153),
(150,5,'A306','A306',154),
(151,6,'A307','A307',155),
(152,6,'A312','A312',156),
(153,6,'A315','A315',157),
(154,6,'A318','A318',158),
(155,6,'A319','A319',159),
(156,6,'A327','A327',160),
(157,6,'A401','A401',161),
(158,6,'A403','A403',162),
(159,6,'A404','A404',163),
(160,6,'A405','A405',164),
(161,6,'A406','A406',165),
(162,6,'A407','A407',166),
(163,6,'A408','A408',167),
(164,6,'A409','A409',168),
(165,6,'A411','A411',169),
(166,6,'A418','A418',170),
(167,6,'A420','A420',171),
(168,6,'A421','A421',172),
(169,6,'A422','A422',173),
(170,6,'A427','A427',174),
(171,6,'A503','A503',175),
(172,6,'A504','A504',176),
(173,6,'A506','A506',177),
(174,6,'A507','A507',178),
(175,6,'A509','A509',179),
(176,6,'A510','A510',180),
(177,6,'A511','A511',181),
(178,6,'A512','A512',182),
(179,6,'A514','A514',183),
(180,6,'A515','A515',184),
(181,7,'A519','A519',185),
(182,7,'A521','A521',186),
(183,7,'A522','A522',187),
(184,7,'A601','A601',188),
(185,7,'A603','A603',189),
(186,7,'A604','A604',190),
(187,7,'A605','A605',191),
(188,7,'A607','A607',192),
(189,7,'A608','A608',193),
(190,7,'A609','A609',194),
(191,7,'A612','A612',195),
(192,7,'A614','A614',196),
(193,7,'A615','A615',197),
(194,7,'A619','A619',198),
(195,7,'A622','A622',199),
(196,7,'A627','A627',200),
(197,7,'A701','A701',201),
(198,7,'A703','A703',202),
(199,7,'A704','A704',203),
(200,7,'A705','A705',204),
(201,7,'A707','A707',205),
(202,7,'A708','A708',206),
(203,7,'A709','A709',207),
(204,7,'A710','A710',208),
(205,7,'A712','A712',209),
(206,7,'A713','A713',210),
(207,7,'A714','A714',211),
(208,7,'A715','A715',212),
(209,7,'A719','A719',213),
(210,7,'A720','A720',214),
(211,8,'A721','A721',215),
(212,8,'A722','A722',216),
(213,8,'A723','A723',217),
(214,8,'A727','A727',218),
(215,8,'GOOD 01','B101',219),
(216,8,'B201','B201',220),
(217,8,'B202','B202',221),
(218,8,'B203','B203',222),
(219,8,'B204','B204',223),
(220,8,'B207','B207',224),
(221,8,'B208','B208',225),
(222,8,'B210','B210',226),
(223,8,'B216','B216',227),
(224,8,'B302','B302',228),
(225,8,'B303','B303',229),
(226,8,'B304','B304',230),
(227,8,'B305','B305',231),
(228,8,'B307','B307',232),
(229,8,'B308','B308',233),
(230,8,'B309','B309',234),
(231,8,'B310','B310',235),
(232,8,'B313','B313',236),
(233,8,'B401','B401',237),
(234,8,'B405','B405',238),
(235,8,'B407','B407',239),
(236,8,'B410','B410',240),
(237,8,'B411','B411',241),
(238,8,'B413','B413',242),
(239,8,'B414','B414',243),
(240,8,'B415','B415',244),
(241,9,'B416','B416',245),
(242,9,'B501','B501',246),
(243,9,'B502','B502',247),
(244,9,'B504','B504',248),
(245,9,'B505','B505',249),
(246,9,'B506','B506',250),
(247,9,'B507','B507',251),
(248,9,'B508','B508',252),
(249,9,'B510','B510',253),
(250,9,'B516','B516',254),
(251,9,'B601','B601',255),
(252,9,'B602','B602',256),
(253,9,'B609','B609',257),
(254,9,'B611','B611',258),
(255,9,'B612','B612',259),
(256,9,'B613','B613',260),
(257,9,'B615','B615',261),
(258,9,'B616','B616',262),
(259,9,'B701','B701',263),
(260,9,'B702','B702',264),
(261,9,'B703','B703',265),
(262,9,'B704','B704',266),
(263,9,'B706','B706',267),
(264,9,'B707','B707',268),
(265,9,'B708','B708',269),
(266,9,'B713','B713',270),
(267,9,'B715','B715',271)
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
