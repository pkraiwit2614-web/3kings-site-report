export type Project = { id: string; code: string; name: string; site_group: string | null; target_handover: string | null; active: boolean; sort_order: number }
export type ScheduleTask = {
  id: string; project_id: string; source_task_no: string | null; category: string | null; task_name: string;
  area: string | null; planned_start: string | null; planned_end: string | null; current_plan_progress: number | null;
  actual_progress: number | null; current_variance: number | null; delay_days: number | null; site_status: string | null;
  actual_start?: string | null; actual_end?: string | null;
  blocker: string | null; next_action: string | null; target_close: string | null; contractor: string | null;
}
