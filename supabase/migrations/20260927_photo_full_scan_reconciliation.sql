create or replace function public.drive_photo_index_reconcile_full_scan(
  p_sync_key text,
  p_project_code text,
  p_seen_file_ids text[],
  p_scope text default 'folders',
  p_folder_ids text[] default '{}'::text[],
  p_source_folder text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_id uuid;
  v_deactivated integer := 0;
  v_scope text := lower(coalesce(p_scope,'folders'));
begin
  if not private.drive_sync_key_valid(p_sync_key) then
    return jsonb_build_object('ok',false,'error','invalid_sync_key');
  end if;

  select p.id into v_project_id
  from public.projects p
  where p.code = p_project_code and p.active = true;

  if v_project_id is null then
    return jsonb_build_object('ok',false,'error','project_not_found','project',p_project_code);
  end if;

  if v_scope not in ('project','folders') then
    return jsonb_build_object('ok',false,'error','invalid_scope');
  end if;

  if v_scope = 'folders' and coalesce(array_length(p_folder_ids,1),0) = 0 then
    return jsonb_build_object('ok',false,'error','folder_scope_requires_ids');
  end if;

  update public.drive_photo_index d
  set is_active = false,
      updated_at = now()
  where d.project_id = v_project_id
    and d.is_active = true
    and (
      v_scope = 'project'
      or d.drive_folder_id = any(coalesce(p_folder_ids,'{}'::text[]))
    )
    and not (d.drive_file_id = any(coalesce(p_seen_file_ids,'{}'::text[])));

  get diagnostics v_deactivated = row_count;

  insert into public.drive_sync_runs(
    sync_type, project_code, source_file, source_sheet,
    rows_read, rows_written, status, message
  ) values (
    'photos', p_project_code, coalesce(p_source_folder,'full-scan-reconciliation'), null,
    coalesce(array_length(p_seen_file_ids,1),0), v_deactivated, 'success',
    format('Full-scan reconciliation (%s): deactivated %s absent file(s); rows retained for history/audit',v_scope,v_deactivated)
  );

  return jsonb_build_object(
    'ok', true,
    'applied', true,
    'scope', v_scope,
    'seen', coalesce(array_length(p_seen_file_ids,1),0),
    'deactivated', v_deactivated,
    'deleted', 0
  );
end;
$function$;

revoke all on function public.drive_photo_index_reconcile_full_scan(text,text,text[],text,text[],text) from public;
grant execute on function public.drive_photo_index_reconcile_full_scan(text,text,text[],text,text[],text) to anon, authenticated;
