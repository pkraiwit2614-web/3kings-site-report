revoke all privileges on table public.procurement_item_projects from anon;
revoke all privileges on table public.procurement_item_projects from public;
revoke truncate, references, trigger on table public.procurement_item_projects from authenticated;
grant select, insert, update, delete on table public.procurement_item_projects to authenticated;
