-- Isolated QA Baseline Schema Fixture for Local/CI Full-Root Migration Replay
-- This file exists ONLY for isolated disposable testing of historical migration sequences.
-- It is NEVER deployed to Production and does not touch Production schema or migration history.

CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION private.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT true;
$$;

CREATE OR REPLACE FUNCTION private.drive_sync_key_valid(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT true;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  username text,
  full_name text,
  role text NOT NULL DEFAULT 'viewer',
  active boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text,
  site_group text,
  target_handover date,
  active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.projects (code, name, active) VALUES
  ('AV-P6', 'Above Villa Plot 6', true),
  ('AV-P7', 'Above Villa Plot 7', true),
  ('AV-P8', 'Above Villa Plot 8', true),
  ('AV-P9', 'Above Villa Plot 9', true),
  ('MIRAGE', 'Mirage', true),
  ('CONDO-A', 'Above Condo', true),
  ('HENESSY', 'Henessy', true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.schedule_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  source_task_no text,
  task_name text,
  category text,
  area text,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  current_plan_progress numeric DEFAULT 0,
  actual_progress numeric DEFAULT 0,
  current_variance numeric DEFAULT 0,
  delay_days integer DEFAULT 0,
  site_status text,
  blocker text,
  next_action text,
  target_close date,
  contractor text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE VIEW public.v_schedule_tasks AS
  SELECT * FROM public.schedule_tasks;

CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  report_date date,
  total_manpower integer DEFAULT 0,
  summary text,
  status text DEFAULT 'submitted',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_report_id uuid REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  schedule_task_id uuid REFERENCES public.schedule_tasks(id) ON DELETE SET NULL,
  work_category text,
  work_item text,
  actual_progress numeric,
  manpower integer,
  contractor text,
  status text,
  blocker text,
  next_action text,
  target_date date,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_report_id uuid REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  photo_url text,
  caption text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_row integer,
  item_name text,
  status text,
  category text,
  source_location text,
  source_item_no text,
  status_detail text,
  data_group text,
  synced_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.procurement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  vendor text,
  item_name text DEFAULT 'Unnamed procurement item',
  procurement_status text,
  payment_status text,
  current_status text,
  expected_delivery_text text,
  expected_delivery date,
  condition_note text,
  source_updated_at date,
  source_sheet text DEFAULT '04 Purchasing ค้างส่ง',
  source_row integer,
  po_no text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.condo_room_status (
  room_no text PRIMARY KEY,
  building text,
  floor integer,
  owner_name text,
  hotel_participation text,
  customer_status text,
  current_status text,
  status_group text,
  follow_up text,
  priority text,
  next_action text,
  defect_detail text,
  latest_source text,
  source_note text,
  source_modified_at timestamptz,
  synced_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.defect_manual_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_no text REFERENCES public.condo_room_status(room_no),
  detail_text text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.defect_web_overrides (
  room_no text PRIMARY KEY REFERENCES public.condo_room_status(room_no),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.drive_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text,
  project_code text,
  source_file text,
  source_sheet text,
  rows_read integer,
  rows_written integer,
  status text,
  message text,
  created_at timestamptz DEFAULT now()
);
