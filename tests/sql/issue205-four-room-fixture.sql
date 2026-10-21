-- Issue #205 synthetic fixture: four legacy synced overrides with NULL status fields.
-- Run ONLY in disposable PostgreSQL after the existing PR #171 fixture + migration.
-- Room codes are synthetic fixture keys; no customer/work-order data copied.
INSERT INTO public.condo_room_status (
  room_no,current_status,status_group,next_action,defect_detail,latest_source,
  source_file_id,source_file_name,source_modified_at,synced_at
)
SELECT t.room_no,
 'Defect ยังไม่เสร็จ / ต้องปิดงาน',
 'Hotel - Incomplete',
 'Synthetic Excel action 21 Oct',
 'Synthetic historical details (unchanged)',
 'Web App manual update',
 (SELECT source_file_id FROM public.condo_room_status WHERE room_no='A212'),
 (SELECT source_file_name FROM public.condo_room_status WHERE room_no='A212'),
 '2026-10-21 09:15:38.877+00'::timestamptz,
 '2026-10-21 09:19:13.678+00'::timestamptz
FROM (VALUES ('A527'),('A726'),('B102'),('B211')) AS t(room_no);

INSERT INTO public.defect_web_overrides (
 room_no,current_status,status_group,next_action,detail_text,
 source_sync_state,updated_at,source_synced_at
)
SELECT t.room_no,NULL,NULL,'Synthetic historic Web action',
 'Synthetic legacy detail','synced',
 '2026-10-15 07:00+00'::timestamptz,
 '2026-10-15 07:05+00'::timestamptz
FROM (VALUES ('A527'),('A726'),('B102'),('B211')) AS t(room_no);

INSERT INTO private.defect_reconcile_field_audit (
 room_no,field_name,decision,override_revision,source_revision,
 previous_db_value,proposed_excel_value,web_override_value
)
SELECT r.room_no, f.field_name, 'conflict_kept_db',
 o.updated_at,r.source_modified_at,
 CASE f.field_name
   WHEN 'current_status' THEN r.current_status
   ELSE r.status_group END,
 CASE f.field_name
   WHEN 'current_status' THEN 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ'
   ELSE 'Hotel - Awaiting Check' END,
 NULL
FROM public.condo_room_status r
JOIN public.defect_web_overrides o USING (room_no)
CROSS JOIN (VALUES ('current_status'),('status_group')) AS f(field_name)
WHERE r.room_no IN ('A527','A726','B102','B211');

INSERT INTO private.defect_reconcile_field_audit (
 room_no,field_name,decision,override_revision,source_revision,
 previous_db_value,proposed_excel_value,web_override_value
)
SELECT r.room_no,'next_action','accepted_excel',
 o.updated_at,r.source_modified_at,
 'Synthetic historic Web action',r.next_action,o.next_action
FROM public.condo_room_status r
JOIN public.defect_web_overrides o USING (room_no)
WHERE r.room_no IN ('A527','A726','B102','B211');
