-- Synthetic-only, PostgreSQL 17 in disposable Supabase Local / GitHub Actions.
-- A single transaction is rolled back, regardless of full test success.
BEGIN;
CREATE SCHEMA line_autopilot;
CREATE TABLE line_autopilot.daily_report_assets(
  report_date date NOT NULL,
  synthetic_position smallint NOT NULL
);
CREATE TABLE line_autopilot.daily_report_runs(
  report_date date PRIMARY KEY,
  pdf_file_id text NOT NULL,
  pdf_sha256 text NOT NULL,
  qa jsonb NOT NULL,
  completed_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);
GRANT USAGE ON SCHEMA line_autopilot TO service_role;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA line_autopilot TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
