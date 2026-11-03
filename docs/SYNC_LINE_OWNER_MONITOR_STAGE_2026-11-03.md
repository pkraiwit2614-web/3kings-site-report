# 3 Kings LINE owner Sync monitor — staging evidence (2026-11-03)

STATE: STAGED ONLY — NOT INSTALLED IN CLOUDFLARE; NOT SENDING.

## Verified production conditions
- Active 3kings-line-autopilot Worker last deployed on 2026-11-03, annotated PR #256. PR #256 is CLOSED WITHOUT MERGE, so GitHub main is not proof of the exact production Worker source.
- Existing owner LINE token and recipient secret bindings are configured on the active Worker. AUTOPILOT_ENABLED is false, and required LINE_MAIN_GROUP_ID is absent. Do not toggle AUTOPILOT_ENABLED or modify the existing Daily 07:45 / 19:30 delivery paths.
- Existing Cloudflare cron schedules must stay unchanged.
- drive_sync_runs records explicit success/error for schedule, defects, materials, photos, but it does not by itself provide Source-to-Parser-to-DB-to-Authenticated-Web per-run parity.
- Existing line_autopilot_claim RPC and deliveries ledger permit sync_failure, not the new sync_owner_run kind. Do not call original RPC for success alerts or change its guard without separately reviewed isolated migration.
- Some other pipelines (Work Order, Hotel Work Plan, Daily, Express) are outside drive_sync_runs. Their actual run logs must be mapped separately.

## Staged implementation
- operations/sync-monitor/owner-alerts.mjs: independent, OFF-by-default classifier and notification delivery interface; no DB, HTTP, GAS, or Cloudflare side effects on import.
- tests/sync-owner-line-monitor.test.cjs: negative and positive mocked tests including source-parity, authenticated Web evidence, quota, dedup, and LINE 429.
- This code does not create triggers or write Source/Master/Queue, alter Production, or send an actual LINE notification.

## Preconditions for LIVE
1. Read the exact Cloudflare deployed Worker source, reconcile against its deployment version and ensure no rollback of PR #256 Owner 07:45 LINE / evening 19:30 / signed webhook.
2. Obtain approved unique run ID and status per job. Read actual Source file/row hashes, Parser, Supabase and authenticated Web to populate four equal per-run proof stages. Never call a success log a Web PASS.
3. Add a dedicated, permission-restricted owner-sync notification ledger with unique event key + stable LINE retry UUID. Current daily-report ledger restrictions must remain unchanged.
4. Reuse existing LINE Channel Access Token and owner recipient; verify quota first. Send every completed run once, including FAIL and UNVERIFIED if E2E proof cannot be obtained. Independent watchdog is required to detect missing scheduled runs.
5. Run isolated mock tests, affected baseline CI, owner-only test message with approved sample run, and verify actual HTTP/ledger readback; preserve 429 and retry-key behavior.
6. Complete SOP 15/16 engineering QA and exact production readback before enabling any schedule. Do not change Defect, Work Order, Daily, Payroll, Materials, Express, Calendar, RBAC/RLS, Sync triggers, or data sources.

Release blocker: live Worker source exact readback and per-run E2E evidence producer not yet available. This staging PR is not Production acceptance.
