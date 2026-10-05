-- Preserve audit history independently from auth user lifecycle.
-- Also keep audit timestamps server-controlled by excluding created_at/id from client INSERT grants.

alter table public.activity_logs
  drop constraint if exists activity_logs_user_id_fkey;

revoke insert on table public.activity_logs from authenticated;
grant insert (user_id, client_session_id, event_type, path, action, target, metadata, user_agent)
  on table public.activity_logs to authenticated;

comment on column public.activity_logs.user_id is 'Stable auth user UUID at event time; intentionally no cascading FK so audit history survives account deletion.';
