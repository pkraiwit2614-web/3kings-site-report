-- Owner-only mutation controls for Photo Mapping/Data Health tooling.
-- Keep authenticated SELECT on drive_photo_index because Executive Presentation and Site Photos require it.

drop policy if exists drive_photo_index_update_manager_engineer on public.drive_photo_index;
create policy drive_photo_index_update_golf_owner
on public.drive_photo_index
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role='manager'
      and lower(trim(coalesce(p.full_name,'')))='golf'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role='manager'
      and lower(trim(coalesce(p.full_name,'')))='golf'
  )
);

drop policy if exists photo_task_feedback_insert_manager_engineer on public.photo_task_feedback;
drop policy if exists photo_task_feedback_update_manager_engineer on public.photo_task_feedback;
drop policy if exists photo_task_feedback_delete_manager_engineer on public.photo_task_feedback;

create policy photo_task_feedback_insert_golf_owner
on public.photo_task_feedback
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role='manager'
      and lower(trim(coalesce(p.full_name,'')))='golf'
  )
);

create policy photo_task_feedback_update_golf_owner
on public.photo_task_feedback
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role='manager'
      and lower(trim(coalesce(p.full_name,'')))='golf'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role='manager'
      and lower(trim(coalesce(p.full_name,'')))='golf'
  )
);

create policy photo_task_feedback_delete_golf_owner
on public.photo_task_feedback
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role='manager'
      and lower(trim(coalesce(p.full_name,'')))='golf'
  )
);
