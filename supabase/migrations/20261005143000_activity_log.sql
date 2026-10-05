-- Activity Log: authenticated users can append only their own activity.
-- Only the Owner account can read logs. Logs are immutable from the web client.

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_session_id uuid not null,
  event_type text not null check (char_length(event_type) between 1 and 40),
  path text check (path is null or char_length(path) <= 500),
  action text check (action is null or char_length(action) <= 200),
  target text check (target is null or char_length(target) <= 120),
  metadata jsonb not null default '{}'::jsonb,
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  created_at timestamptz not null default now(),
  constraint activity_logs_metadata_size check (octet_length(metadata::text) <= 8192)
);

create index if not exists activity_logs_created_at_idx on public.activity_logs(created_at desc);
create index if not exists activity_logs_user_created_idx on public.activity_logs(user_id, created_at desc);
create index if not exists activity_logs_event_created_idx on public.activity_logs(event_type, created_at desc);

alter table public.activity_logs enable row level security;

revoke all on table public.activity_logs from anon, authenticated;
grant insert, select on table public.activity_logs to authenticated;

drop policy if exists activity_logs_insert_own on public.activity_logs;
create policy activity_logs_insert_own
on public.activity_logs
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists activity_logs_owner_select on public.activity_logs;
create policy activity_logs_owner_select
on public.activity_logs
for select
to authenticated
using ((select auth.uid()) = 'bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid);

comment on table public.activity_logs is 'Append-only authenticated web activity audit trail. Owner-only read access.';
