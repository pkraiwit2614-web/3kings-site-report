# 3 Kings — LINE Owner Sync Monitoring | SOP 13 / 15 / 16

**State: STAGED / NOT DEPLOYED / NO LIVE LINE SEND**

## Exact Cloudflare Production source — VERIFIED PASS (3 Nov 2026)
- Worker: `3kings-line-autopilot`; Production version **31**; version ID `272dc16c-2f38-4fef-9805-d5a29b2622d1`.
- Cloudflare version metadata commit `3418d40ba2aff3930b518920e70e4b6a7bf1eeea` (PR #256).
- Read Worker `/content/v2` from Cloudflare, extract `worker.mjs` multipart payload; compare with GitHub file at **exact commit**. **Byte-for-byte equal, 36,176 characters, SHA-256 `912c5aba52e138917c1961a1abacb01c4407639ce3cf2e93ca9cf4a2489286d5` on both sides.**
- This equality does **not** imply that GitHub `main` is deployed. PR #256 closed without merge; preserve live worker source and Daily 07:45 / evening 19:30 LINE behavior.
- `AUTOPILOT_ENABLED=false`, original Cloudflare cron/bindings unchanged.
- No Cloudflare deployment, secret, cron, webhook, LINE owner, or OAuth change is authorized by this stage.

## Isolated implementation and ledger
- `operations/sync-monitor/owner-alerts.mjs`: OFF-by-default owner-only message/status logic; accepts independent E2E proof; stable per-pipeline+run hash.
- `operations/sync-monitor/pipeline-metrics.mjs`: count adapters with actual units; does not infer Web PASS or error-row counts.
- `supabase/migrations/20261103120000_sync_owner_line_ledger_isolated.sql`: new, separate `line_autopilot.sync_owner_deliveries` table with unique event key and pipeline/run pair, stable LINE retry UUID, service-role-only `line_sync_owner_claim` and `line_sync_owner_ack` RPCs. **Not yet applied to Production**.
- Never modify existing `line_autopilot.deliveries`, `line_autopilot_claim`, `line_autopilot_ack`, source Excel, Synced Supabase tables, GAS triggers or existing Web feature flags.
- Isolated PostgreSQL 17 test: service-role permissions and anon/auth deny, new→in-flight→already_sent, ack idempotency and no delivered downgrade. Test run `41627811872`: **PASS**.
- Mock LINE + existing Daily LINE regression and count-format tests run `41627811866`: **PASS**.

## Evidence streams and limits
| Pipeline | Source evidence available | Counts available | Authenticated-Web E2E proof |
|---|---|---|---|
| Defect | `drive_sync_runs` | rows_read, rows_written | not captured per run |
| Materials / Procurement | `drive_sync_runs` | rows_read, rows_written | not captured per run |
| Villa Schedule | `drive_sync_runs` | rows_read, rows_written (skipped no-change != entire source 0) | not captured per run |
| Photos | `drive_sync_runs` | rows_read, rows_written | not captured per run |
| Daily Site Report Import | `daily_site_report_sync_audit` | source rows, parsed, added, updated, skipped, DB verified | not captured per run |
| Express Register | `express_register_runs` | source files, documents, lines, review, canceled | not captured per run |
| Work Order | original GAS execution + `defect_work_order_snapshot` | DB snapshot exists but **no verified per-run log ID** | not captured per run |
| Hotel Work Plan | original GAS execution + `hotel_work_plan_sync_audit` | per-item historical audit; **not per-run** | not captured per run |

Use **E2E PASS only if** source, parsed, database, authenticated Web carry identical source File ID, revision, row count and canonical rowset SHA-256. Missing stage => `UNVERIFIED`; mismatch => `FAIL`; explicit error log => `FAIL`; no-change without verified Web => `UNVERIFIED`.

### Real production DB examples (verified read-only)
- Daily Site Report audit id 45 on 03-Nov: source_rows_read 569; parsed 17; inserted 2; skipped 15; import-verified 17. **Not 17 Web-verified.**
- Materials 03-Nov latest example: read 614; written 15, only DB log.
- Defect 03-Nov latest example: read 263 rooms; one semantic DB write, not Web proof.
- Express latest register run: 3,758 documents; 13,256 lines; 273 review; 68 canceled. Complete register DB is not Web PASS.

## Remaining engineering gates before LIVE
1. Attach independent, authorized source-parser-DB-authenticated-Web readback producer for each real scheduled sync run; **do not edit existing Sync/GAS handlers** merely to make counts appear.
2. Supply unique real Execution/Run IDs for Work Order and Hotel Work Plan. Do not synthesize from item history or snapshots.
3. Add independent missed-schedule watchdog with an authoritative, evidenced job schedule. Every round needs an event key and observer checkpoint to avoid omissions and replays; preserve original Apps Script triggers.
4. Run owner-only test using existing LINE token/owner recipient **only after** actual E2E and dedicated ledger installed. Verify LINE API status, quota, retried duplicates, Supabase delivery readback; no group sends.
5. SOP 15/16 Production release gate: exact SHA, all required CI, permission/security QA, no cross-module regressions and Production readback. **Do not merge/deploy a broad change that overwrites the active unmerged PR #256 Cloudflare Worker.**

## Non-regression statement
No Production updates to Defect, Materials, Daily, Payroll, Calendar, RBAC/RLS, Excel Sync, GAS triggers, Supabase data/schema, Vercel, Cloudflare Worker, or existing LINE routes as a result of this PR. This is staging QA only.
