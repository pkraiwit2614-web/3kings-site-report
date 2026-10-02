do $$
declare
  t text;
begin
  foreach t in array array[
    'projects',
    'schedule_tasks',
    'daily_reports',
    'materials',
    'procurement_items',
    'procurement_item_projects',
    'tool_machine',
    'drive_sync_runs',
    'condo_room_status'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
