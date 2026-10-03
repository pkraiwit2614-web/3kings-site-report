revoke update on public.site_operations_entries from authenticated;
grant update (supervisor_worker_id, mapping_status, updated_at)
  on public.site_operations_entries to authenticated;

revoke insert, update on public.labour_name_map from authenticated;
grant insert (
  source_name_norm,source_name,worker_id,canonical_name,map_type,status,source_file_id,synced_at
) on public.labour_name_map to authenticated;
grant update (
  source_name,worker_id,canonical_name,map_type,status,source_file_id,synced_at
) on public.labour_name_map to authenticated;
