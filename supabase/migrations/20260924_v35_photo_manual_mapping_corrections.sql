with p as (
  select id from public.projects where code='AV-P7'
), s as (
  select id from public.schedule_tasks
  where project_id=(select id from p) and source_task_no='57' and is_active=true
  limit 1
)
update public.drive_photo_index d
set schedule_task_id=(select id from s), match_method='manual', match_score=1, updated_at=now()
where d.project_id=(select id from p)
  and d.file_name in ('ระบายน้ำภายนอกอาคาร2.JPG','ระบายน้ำภายนอกอาคาร3.JPG');
