-- P0-B DESIGN ONLY. DO NOT EXECUTE ON PRODUCTION OR PREVIEW DATABASE.
-- Not in supabase/migrations, to prevent accidental migration on deployment.
-- Future approval requires role/RLS review and backup/rollback planning.
BEGIN;
CREATE SCHEMA IF NOT EXISTS ai_operations;
REVOKE ALL ON SCHEMA ai_operations FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS ai_operations.central_error_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id char(64) NOT NULL UNIQUE,
  fingerprint char(64) NOT NULL,
  source text NOT NULL CHECK (source IN ('GAS_TRIGGER','GAS_EXECUTION','SUPABASE_SYNC',
    'GITHUB_ACTIONS','VERCEL_BUILD','CLOUDFLARE_WORKER','LINE_DELIVERY')),
  component text NOT NULL CHECK (length(component) <= 96),
  error_code text NOT NULL CHECK (length(error_code) <= 80),
  state text NOT NULL CHECK (state IN ('FAILED','WARN','RECOVERED','UNKNOWN')),
  severity text NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  occurred_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  proposed_executor text NOT NULL,
  proposed_action text NOT NULL CHECK (proposed_action IN ('INSPECT_ONLY','MANUAL_SECURITY_REVIEW')),
  dispatch_allowed boolean NOT NULL DEFAULT false CHECK (dispatch_allowed = false),
  evidence text NOT NULL DEFAULT 'METADATA_ONLY_NO_RAW_LOGS'
);
ALTER TABLE ai_operations.central_error_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_operations.central_error_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE ai_operations.central_error_log_id_seq FROM PUBLIC, anon, authenticated;
-- No user-facing Data API grants, no SECURITY DEFINER, no triggers, no schedulers.
-- Future service account access requires a separate, reviewed least-privilege design.
CREATE INDEX IF NOT EXISTS ai_operations_error_log_fingerprint_time_idx
  ON ai_operations.central_error_log (fingerprint, occurred_at DESC);
COMMIT;