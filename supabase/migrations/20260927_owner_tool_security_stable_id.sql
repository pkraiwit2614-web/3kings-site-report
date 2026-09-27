drop policy if exists drive_photo_index_update_golf_owner on public.drive_photo_index;
create policy drive_photo_index_update_golf_owner
on public.drive_photo_index
for update
to authenticated
using (
  (select auth.uid()) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true and p.role='manager'
  )
)
with check (
  (select auth.uid()) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true and p.role='manager'
  )
);

drop policy if exists photo_task_feedback_insert_golf_owner on public.photo_task_feedback;
drop policy if exists photo_task_feedback_update_golf_owner on public.photo_task_feedback;
drop policy if exists photo_task_feedback_delete_golf_owner on public.photo_task_feedback;

create policy photo_task_feedback_insert_golf_owner
on public.photo_task_feedback
for insert
to authenticated
with check (
  (select auth.uid()) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true and p.role='manager'
  )
);

create policy photo_task_feedback_update_golf_owner
on public.photo_task_feedback
for update
to authenticated
using (
  (select auth.uid()) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true and p.role='manager'
  )
)
with check (
  (select auth.uid()) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true and p.role='manager'
  )
);

create policy photo_task_feedback_delete_golf_owner
on public.photo_task_feedback
for delete
to authenticated
using (
  (select auth.uid()) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.active=true and p.role='manager'
  )
);
