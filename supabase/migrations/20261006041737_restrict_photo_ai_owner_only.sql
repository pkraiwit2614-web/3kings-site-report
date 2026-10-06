drop policy if exists photo_ai_task_scores_insert_manager_engineer on public.photo_ai_task_scores;
drop policy if exists photo_ai_task_scores_update_manager_engineer on public.photo_ai_task_scores;
drop policy if exists photo_ai_task_scores_delete_manager_engineer on public.photo_ai_task_scores;

create policy photo_ai_task_scores_insert_golf_owner
on public.photo_ai_task_scores
for insert to authenticated
with check (
  (select auth.uid())='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role='manager'
  )
);

create policy photo_ai_task_scores_update_golf_owner
on public.photo_ai_task_scores
for update to authenticated
using (
  (select auth.uid())='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role='manager'
  )
)
with check (
  (select auth.uid())='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role='manager'
  )
);

create policy photo_ai_task_scores_delete_golf_owner
on public.photo_ai_task_scores
for delete to authenticated
using (
  (select auth.uid())='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid
  and exists(
    select 1 from public.profiles p
    where p.user_id=(select auth.uid())
      and p.active=true
      and p.role='manager'
  )
);
