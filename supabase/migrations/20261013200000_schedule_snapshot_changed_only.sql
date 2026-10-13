-- Applied and verified in production on 2026-10-13. Idempotent source-of-truth migration.
-- Scope: capture_schedule_daily_snapshot
CREATE OR REPLACE FUNCTION public.capture_schedule_daily_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_project_id uuid;
  v_snapshot_date date;
begin
  if new.sync_type <> 'schedule' or new.status <> 'success' or new.project_code is null then
    return new;
  end if;

  select p.id into v_project_id
  from public.projects p
  where p.code = new.project_code;

  if v_project_id is null then
    return new;
  end if;

  v_snapshot_date := (new.created_at at time zone 'Asia/Bangkok')::date;

  -- source unchanged: keep the daily snapshot and its historical timestamp intact.
  -- First successful check of a new local day still creates that day's snapshot.
  if coalesce(new.rows_written,0)=0 and exists(
    select 1 from public.schedule_task_daily_snapshots x
    where x.snapshot_date=v_snapshot_date and x.project_id=v_project_id
  ) then
    return new;
  end if;

  delete from public.schedule_task_daily_snapshots
  where snapshot_date = v_snapshot_date
    and project_id = v_project_id;

  insert into public.schedule_task_daily_snapshots(
    snapshot_date, synced_at, project_id, source_identity, source_task_no,
    category, task_name, area, planned_start, planned_end,
    actual_progress, current_plan_progress, current_variance, delay_days,
    site_status, blocker, next_action, source_file
  )
  select
    v_snapshot_date,
    new.created_at,
    s.project_id,
    s.source_identity,
    s.source_task_no,
    s.category,
    s.task_name,
    s.area,
    s.planned_start,
    s.planned_end,
    s.actual_progress,
    case
      when s.planned_start is null or s.planned_end is null then null::numeric
      when v_snapshot_date < s.planned_start then 0::numeric
      when v_snapshot_date >= s.planned_end then 1::numeric
      else round((v_snapshot_date - s.planned_start + 1)::numeric / greatest(1, s.planned_end - s.planned_start + 1)::numeric, 4)
    end,
    case
      when s.planned_start is null or s.planned_end is null then null::numeric
      when v_snapshot_date < s.planned_start then s.actual_progress
      when v_snapshot_date >= s.planned_end then s.actual_progress - 1::numeric
      else s.actual_progress - (v_snapshot_date - s.planned_start + 1)::numeric / greatest(1, s.planned_end - s.planned_start + 1)::numeric
    end,
    case
      when s.planned_end is null then 0
      when s.actual_progress >= 1::numeric and s.actual_end is not null then greatest(0, s.actual_end - s.planned_end)
      when s.actual_progress < 1::numeric and v_snapshot_date > s.planned_end then v_snapshot_date - s.planned_end
      else 0
    end,
    s.site_status,
    s.blocker,
    s.next_action,
    s.source_file
  from public.schedule_tasks s
  where s.project_id = v_project_id
    and s.is_active = true
    and s.source_identity is not null;

  return new;
end;
$function$

