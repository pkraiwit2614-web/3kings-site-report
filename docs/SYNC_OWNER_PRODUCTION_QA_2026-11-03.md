# 3 Kings Owner Sync LINE — Production QA checkpoint (2026-11-03)

**Overall gate: PARTIAL / OWNER LINE SEND NOT ACTIVATED.**

## A. Cloudflare source identity
- Live Worker `3kings-line-autopilot` v31, active version `272dc16c-2f38-4fef-9805-d5a29b2622d1`.
- Cloudflare `worker.mjs` source **byte-for-byte matches** GitHub PR #256 commit `3418d40ba2aff3930b518920e70e4b6a7bf1eeea`; SHA-256 `912c5aba52e138917c1961a1abacb01c4407639ce3cf2e93ca9cf4a2489286d5`, 36,176 characters.
- GitHub main is not deployed Worker source. Existing Worker bindings/crons remain untouched.

## B. NEW separate Supabase Production notification ledger — APPLIED + READBACK PASS
- Applied reviewed `supabase/migrations/20261103115147_sync_owner_line_ledger_isolated_20261103.sql` via connected Supabase apply_migration. API returned `{"success":true}`.
- Readback verified `line_autopilot.sync_owner_deliveries`, `public.line_sync_owner_claim`, `public.line_sync_owner_ack`.
- Grants: `service_role` can read/claim/ack; `anon` and `authenticated` cannot read ledger or execute claim.
- Production transaction-isolated synthetic test: `new` → `in_flight` → `delivered` → `already_sent`, same retry UUID. Explicit `ROLLBACK`; new ledger stayed **0 rows**.
- Existing Daily LINE `line_autopilot.deliveries` stayed **15 rows** before and after.
- No original RPC, LINE Daily, GAS script, Excel, Sync trigger, RBAC/RLS or Web app change.
- Production ledger installation does **NOT** mean LINE sending works: existing Worker still not connected to this new ledger.

## C. Actual Source → Supabase proof
- Hotel Work Plan exact Drive source File ID `1KZ-VMDssYeMmTE-TNLYU0d8fwQkSUtuS`, `Above_Element_Hotel_vs_Defect_2026-10-13.xlsx`. Read original XLSX directly from connected Drive.
- Compared `Hotel_Work_Plan` Excel sheet **all 267 rooms** to `public.hotel_work_plan_rooms`: sequence, room, day, override date, actual date, Thai→canonical work status, note and revision. **0 mismatches**.
- Compared **all 9 day records** of same sheet to `public.hotel_work_plan_days`: day plan date and note. **0 mismatches**.
- All 267 rooms + 9 days are in DB state `synced`. This is a validated **Source→DB MATCH** at the observed time, not authenticated Web proof or GAS Execution proof.
- Work Order Drive Source ID `18P3OFYtOLsslCtDujlSQVf9IQSuplKcx`, modified 2026-11-03 10:46:56.224 UTC. Parsed original XLSX Master: **336 unique Work IDs, no duplicates**. All 336 exist across union of staged/snapshot records; **none absent**. No assertion that all 336 should be published (HOLD/Approval).
- Work Order staged states at inspection: 206 `STAGE_REVERIFY_NO_DB_WRITE`, 48 `HOLD_MISSING_EVIDENCE`, 12 `STAGE_HISTORY_ONLY`, 1 `DENY_DISPATCH`. Approval table: 209 promoted, 3 pending. Latest staging timestamp 2026-11-03 11:02:48 UTC. Last accepted snapshot import 2026-11-03 00:07:35 UTC. **New staging ≠ successful promotion or UI sync.**
- Verified Work Order source updated after last accepted snapshot import. Need exact source-delta/Approval/HOLD reconciliation before any end-to-end PASS.

## D. Job schedule and Web evidence blockers (do NOT infer PASS)
- Work Order source code documents an `.everyHours(2)` installer, but actual GAS Trigger+Execution history is unavailable from the connected Google Drive connector. Cannot certify that all expected two-hour slots were executed. Staging data confirms ingestion activity, not every trigger firing.
- Hotel Work Plan `sync_control.last_verified_at` refreshed on 2026-11-03 and 267+9 DB states are synced. No unique, per-run Apps Script Execution ID; control timestamp not an Execution log.
- Authenticated Production Web role session and rowset parity were not available through current connectors. Latest Vercel Production deployment inspected, READY; a deployment READY/DB count alone is not authenticated UI readback.
- All other pipeline logs (defects/materials/schedule/photos/daily/express) have partial read/import evidence, **not every real run's four-stage canonical proof**.
- Therefore do **NOT** classify or push `SUCCESS_VERIFIED` for any pipeline based solely on logs or DB timestamps.

## E. No-send gate
- Review PR #260 exact SHA `49833d30052d9c1bcac7221d01bf5759fe5ee005`: Offline LINE QA, isolated PostgreSQL QA, CI are all successful for that SHA.
- The new ledger is ready but the live Worker is still v31 and its `AUTOPILOT_ENABLED` remains `false`. Do not bypass or flip the original global flag.
- Before real owner LINE test: independently verify authorized GAS Execution evidence and authenticated Web readback for the targeted run, implement isolated owner-only sender preserving v31 code and 10 secret/plain bindings, quota preflight, and verify LINE HTTP ack + ledger readback.
- Record first real send with unique run identity and retained Retry Key. Never send to a group or replay an existing event ID.

**Production mutations performed in this checkpoint: ONLY creation of separate owner Sync ledger + scoped RPCs. No live LINE message, Cloudflare deployment or Cron modification.**

## F. Follow-up evidence verification & material blockers (2026-11-03)
- The existing Apps Script project was located from the PRIVATE GAS Source Map and read-only `clasp list` succeeded on authorized Office laptop with **7 scripts**. No OAuth or Script code was changed.
- `clasp logs` returned **"GCP project ID is not set, unable to continue."** This is a documented limitation, not proof of healthy executions.
- The user's **existing** clasp OAuth access token was used solely for a read-only Google Apps Script `GET /v1/processes?userProcessFilter.scriptId=...` call. Result: **HTTP 403 PERMISSION_DENIED / ACCESS_TOKEN_SCOPE_INSUFFICIENT**. No token values were logged, no OAuth scopes were changed, and no script/triggers were executed. Therefore per-trigger Execution History is **NOT VERIFIED**.
- Work Order may return `source-unchanged` without database writes. Source/snapshot or staging timestamps cannot establish execution of every two-hour slot. Do not fabricate an Execution ID.
- Hotel Work Plan `public.hotel_work_plan_sync_ack` updates `last_verified_at` **only after** checking exactly 9 day and 267 room rows against the DB, then marking them synced; a successful ACK is strong Source→DB evidence, **not** authenticated Web proof or complete GAS Execution History.
- Actual Schedule Log includes `test.xlsx` rows (one `error/source_identity_missing` and a later success/cleaned 148 stale rows). These must be blocked from canonical Master owner-notification claims; do not obscure the anomaly or alter original Schedule sync.
- Schedule unchanged checks with 0 read/0 written and the explicit `source unchanged, sync skipped` text are now labeled `NO_CHANGE_UNVERIFIED` rather than completed import success. Photo scans with 0 upserts do **not** inherit this label.
- Data totals should not be substituted for run counts: `materials` has 753 rows in all sources (not the 412 synced Master subset); `procurement_items` has 169 spreadsheet-owned rows plus 8 externally protected rows; `drive_photo_index` has 2,999 total records versus the 2,636 images scanned in the most recent photo run. Keep log metrics and DB inventory metrics distinct.
- Web source inspected: actual Work Order UI queries `defect_work_order_snapshot` with `source_active=true` and separate HOLD view; Hotel Work Plan UI queries `hotel_work_plan_days`, `hotel_work_plan_rooms`, and `hotel_work_plan_sync_control`. Vercel Production READY and access-log pageviews **do not** certify a rowset through an authenticated login session. The available isolated GPT-Browser-QA profile is explicitly public-only; it is not an authenticated 3 Kings session.
- New code in PR #260: canonical source allowlist, no-change distinction, daily import count-integrity check, and `observation-adapters.mjs` keeping staging/DB-ACK/actual Execution/Web authentication distinct, with offline regression tests.
- Required next gate before enabling LINE owner sends for **every run**: (a) authorized actual GAS Execution results or approved independent per-run completion events for source-unchanged jobs (Work Order included), (b) authenticated Production Web readback for each module, (c) worker integration preserving exact live v31 daily LINE, (d) owner-only LINE quota, HTTP push and ledger readback. User's no-unapproved-OAuth/Trigger/Sync-change constraint remains binding; **do not bypass scope restrictions**.

**Conclusion: Production ledger installed/verified; monitored sending remains OFF / no LINE test has been sent.**
