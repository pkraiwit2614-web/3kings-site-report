do $$
declare v_def text;
begin
  select pg_get_functiondef('public.drive_photo_index_upsert(text,text,text,jsonb)'::regprocedure) into v_def;
  v_def := replace(v_def, 'coalesce(v_score,0) >= 0.30', 'coalesce(v_score,0) >= 0.45');
  execute v_def;
end $$;

update public.drive_photo_index
set schedule_task_id=null, match_method='unmatched', match_score=null, updated_at=now()
where match_method='filename' and coalesce(match_score,0) < 0.45;

with mapping(file_name, task_no) as (values
  ('เก็บสีภายในห้องนอน ชั้น 2.JPG','34'),
  ('ประตู D1.JPG','40'),
  ('หลังคาระเบียงไม้ชั้น 2.JPG','26'),
  ('หลังคาระเบียงไม้ชั้น 2 (2).JPG','26')
)
update public.drive_photo_index d
set schedule_task_id=s.id, match_method='manual', match_score=1, updated_at=now()
from mapping m
join public.projects p on p.code='AV-P7'
join public.schedule_tasks s on s.project_id=p.id and s.source_task_no=m.task_no and s.is_active=true
where d.project_id=p.id and d.file_name=m.file_name;

update public.drive_photo_index d
set schedule_task_id=null, match_method='unmatched', match_score=null, updated_at=now()
where d.file_name in (
  'ติดตั้งสุขภัณฑ์-หน้าต่างอลูมิเนียม.JPG','ภายใน ห้องนอน.JPG','ภายใน ห้องนอน ใหญ่.JPG',
  'ภายใน ห้องนอน ชั้น 2.JPG','ภายใน ครัว ชั้น 1.JPG','ภายใน ชั้น1.JPG','โถงชั้น 2.JPG',
  'ห้องน้ำ ชั้น 2.JPG','ระบบน้ำล้น สระน้ำ.JPG'
) and d.match_method <> 'manual';
