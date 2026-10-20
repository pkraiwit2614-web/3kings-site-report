-- All test-only synthetic fixture values; no real customers, room data, identities, or payroll.
INSERT INTO private.role_permission_matrix(role,module,level,default_level,locked) VALUES
('viewer','activity','none','none',true),
('viewer','calendar','view','view',false),
('viewer','contact_book','view','view',false),
('viewer','dashboard','view','view',false),
('viewer','defect','view','view',false),
('viewer','hotel','view','view',false),
('viewer','materials','view','view',false),
('viewer','payroll','none','none',false),
('viewer','presentation','view','view',false),
('viewer','procurement','view','view',false),
('viewer','reconciliation','none','none',true),
('viewer','reports','view','view',false),
('viewer','schedule','view','view',false),
('viewer','users','none','none',true),
('viewer','workplan','view','view',false);
INSERT INTO public.projects(id,code,name,site_group,active,sort_order)
VALUES ('11111111-1111-4111-8111-111111111111','AV-QA','CI-ONLY PROJECT','Test',true,1);
INSERT INTO public.materials(id,project_id,source_row,item_name,status,category,source_location)
VALUES ('22222222-2222-4222-8222-222222222222',
'11111111-1111-4111-8111-111111111111',1,'CI-ONLY MATERIAL','Received','Test','CI-ONLY');
INSERT INTO public.condo_room_status(room_no,building,floor,hotel_participation,
 customer_status,current_status,status_group,defect_detail,source_modified_at,synced_at)
VALUES ('A991','A',9,'Not participating','No customer','CI-ONLY OPEN',
'Hotel - Incomplete','CI-ONLY DEFECT',now(),now());
INSERT INTO public.site_operations_entries(id,work_date,project_name_raw,area_raw,
 total_manpower,work_detail,status_text,mapping_status,synced_at,work_date_validation_status,source_row,supervisor_raw)
VALUES ('33333333-3333-4333-8333-333333333333',current_date,
'CI-ONLY PROJECT','CI-ONLY',1,'CI-ONLY REPORT','In progress','mapped',now(),'valid',1,'CI-ONLY SUPERVISOR');
INSERT INTO public.payroll_verification_records(id,note)
VALUES ('44444444-4444-4444-8444-444444444444','CI-ONLY PAYROLL SYNTHETIC');
