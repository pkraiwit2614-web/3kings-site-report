-- Security advisor grant hardening (surgical)
-- Preserve external sync/callback flows that intentionally use anon + private key/token validation.
-- Do not change RLS policies, business RPC logic, payroll, defect or calendar authorization.

-- v_schedule_tasks is a read view. Keep only SELECT for API roles that need it.
revoke insert, update, delete, truncate, references, trigger
on public.v_schedule_tasks
from service_role;
grant select on public.v_schedule_tasks to authenticated, service_role;

-- External integration RPCs are invoked with the publishable/anon role plus
-- an internal sync/callback/device token. Signed-in users do not need direct EXECUTE.
revoke execute on function public.drive_photo_index_reconcile_full_scan(text,text,text[],text,text[],text) from authenticated;
revoke execute on function public.drive_photo_index_upsert(text,text,text,jsonb) from authenticated;
revoke execute on function public.drive_sync_apply_condo_defects(text,text,text,timestamptz,jsonb,boolean) from authenticated;
revoke execute on function public.drive_sync_replace_materials_tools(text,text,jsonb,jsonb,jsonb) from authenticated;
revoke execute on function public.get_wallpaper_payload(text) from authenticated;
revoke execute on function public.photo_archive_clear_staging(text,uuid) from authenticated;
revoke execute on function public.photo_archive_finalize(text,uuid,text,text,text,text,text,text) from authenticated;
revoke execute on function public.photo_archive_staging_deletable(text) from authenticated;

-- Intentionally retain anon EXECUTE on the external integration RPCs above.
-- Each write-capable function validates its sync/callback token internally;
-- photo_archive_staging_deletable is required by the anon storage cleanup policy.
