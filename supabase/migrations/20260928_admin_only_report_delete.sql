-- Only active Admin users (profiles.role = manager) may delete submitted daily reports.
-- Report items, photos and revision rows continue to cascade from daily_reports.

drop policy if exists daily_delete_owner_or_manager on public.daily_reports;
drop policy if exists daily_delete_admin_only on public.daily_reports;

create policy daily_delete_admin_only
on public.daily_reports
for delete
to authenticated
using ((select private.has_app_role(array['manager']::text[])));
