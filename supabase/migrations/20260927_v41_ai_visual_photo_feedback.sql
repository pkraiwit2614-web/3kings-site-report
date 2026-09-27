create table if not exists public.photo_task_feedback (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.drive_photo_index(id) on delete cascade,
  task_id uuid not null references public.schedule_tasks(id) on delete cascade,
  status text not null check (status in ('approved','rejected')),
  note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(photo_id,task_id)
);

create index if not exists photo_task_feedback_task_idx on public.photo_task_feedback(task_id,status,updated_at desc);
create index if not exists photo_task_feedback_photo_idx on public.photo_task_feedback(photo_id,updated_at desc);

alter table public.photo_task_feedback enable row level security;

drop policy if exists photo_task_feedback_select_authenticated on public.photo_task_feedback;
create policy photo_task_feedback_select_authenticated
on public.photo_task_feedback for select to authenticated using (true);

drop policy if exists photo_task_feedback_write_manager_engineer on public.photo_task_feedback;
create policy photo_task_feedback_write_manager_engineer
on public.photo_task_feedback for all to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id = (select auth.uid()) and p.active = true and p.role in ('manager','engineer')
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id = (select auth.uid()) and p.active = true and p.role in ('manager','engineer')
));

grant select,insert,update,delete on public.photo_task_feedback to authenticated;

create table if not exists public.photo_ai_task_scores (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.drive_photo_index(id) on delete cascade,
  task_id uuid not null references public.schedule_tasks(id) on delete cascade,
  score numeric not null check (score >= 0 and score <= 100),
  detected_work text,
  reason text,
  model text not null,
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(photo_id,task_id)
);

create index if not exists photo_ai_task_scores_task_idx on public.photo_ai_task_scores(task_id,score desc,analyzed_at desc);
create index if not exists photo_ai_task_scores_photo_idx on public.photo_ai_task_scores(photo_id,analyzed_at desc);

alter table public.photo_ai_task_scores enable row level security;

drop policy if exists photo_ai_task_scores_select_authenticated on public.photo_ai_task_scores;
create policy photo_ai_task_scores_select_authenticated
on public.photo_ai_task_scores for select to authenticated using (true);

drop policy if exists photo_ai_task_scores_write_manager_engineer on public.photo_ai_task_scores;
create policy photo_ai_task_scores_write_manager_engineer
on public.photo_ai_task_scores for all to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id = (select auth.uid()) and p.active = true and p.role in ('manager','engineer')
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id = (select auth.uid()) and p.active = true and p.role in ('manager','engineer')
));

grant select,insert,update,delete on public.photo_ai_task_scores to authenticated;
