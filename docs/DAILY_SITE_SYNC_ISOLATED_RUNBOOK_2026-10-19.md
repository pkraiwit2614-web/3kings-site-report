# Daily Site Report → Supabase, isolated rollout (19 October 2026)

## Source & scope
- SOP index and latest SOP 13/SOP Daily Site Report have priority.
- Native Form responses ID `1-ZSZXulxaje4vDP1ztvUBXsjlmffjAcDu0w1OHRnpUw`; tab `การตอบแบบฟอร์ม 1`, 13 fixed header columns.
- Database `public.site_operations_entries` and linked **pending only** `labour_verification_batches` / source-project links.
- Uses the **existing** SUPABASE_SERVICE_ROLE_KEY Script Property; no new OAuth, token or secret visible in GitHub/chat.
- **Does not touch native monthly Daily Report tabs, formulas, layout, PDFs, payroll money, Defect, Materials or existing 9 triggers.**

## Hard safety gates
- The existing 350 source rows through 353 keep their original `AUTO|...` fingerprints untouched. No forced conversion of legacy fingerprints.
- The first allowed source row is **354**. New rows use SHA-256 of canonical source values, with `DSR2|` prefix; later corrections to these rows are guarded by a two-phase compare-and-swap source revision and fingerprint check.
- Modified rows with verified/reviewed labour batches, assignments, payroll records, manual project mapping, mapped supervisor, changed work date/supervisor/project/area are **BLOCKED for manual review**; never silently mutate finance evidence.
- A headcount mismatch, missing source column, future work date, unexpected project code, stale source revision or any missing readback aborts the transaction. Preserve all existing state.
- Multiple project links reference sites only. **Never allocate worker counts or salary per project automatically**.
- On commit, inserts pending labour batch per new source row; no verified status or finance payment action. Check database constraints before using.

## Current verified state (after authorized backfill)
- On 19 Oct 2026, RPC migration was installed; one guarded, source-pinned 17-row commit returned inserted=17, updated=0, verified=17. Source rows 354..370 are now in Supabase: 4 dated Oct 16 and 13 dated Oct 17.
- SiteOps prior 350 rows and prior 350 Labour Batches were hash-compared and unchanged; old 26 worker assignments unchanged; Payroll records 0 unchanged. New entries have 17 **pending** Labour Batches and 21 source project links. New audit row read=369, parsed=17, inserted=17, updated=0, verified=17.
- Auth grants confirmed anon=false/authenticated=false/service_role=true for the new RPC.
- Read-only tests: unchanged v2 row skipped=1; synthetic work-detail-only correction would_update=1. No synthetic change persisted.
- Apps Script is **not yet installed in the existing GAS project**; therefore no new scheduled trigger exists until the operator completes the following install.

## Install plan — sequential (current data already backfilled)
1. In existing Apps Script project `3Kings Drive → Supabase Sync`, add a **new** file named `DailySiteReportSync_2026-10-19.gs`, copying only `docs/apps-script/DailySiteReportSync_2026-10-19.gs` from latest GitHub main. DO NOT replace any of the existing files.
2. Confirm existing Script Property `SUPABASE_SERVICE_ROLE_KEY` exists. Do not show or paste its value in chat, or create a new credential.
3. Run `dailySiteSyncDryRun20261019()`. If Form has not changed from the readback state, expect `DRY_RUN_OK`, inserted=0, updated=0, skipped=17, blocked=0. New Form submissions may lead to inserted>0, but **STOP and review the exact new source row/date before commit**.
4. Run `dailySiteSyncNow20261019()` only if the dry-run is consistent. Expect `PASS_READBACK` with verified=all processed and **zero new writes** if source is unchanged. The original 17 rows are NOT inserted again.
5. Only after that safe no-op, run `installDailySiteTrigger20261019()`: expect `status=INSTALLED`, `before:9`, `after:10`, `dailyCount:1`. No prior trigger is deleted, edited or disabled.
6. Verify the next scheduled invocation completes and keeps inserted=updated=0 when source unchanged. Compare `site_operations_entries`, pending labour batches, source project mapping, monthly native sheet and Owner-authenticated `/reports` / `/reports/labour` UI.
7. On a mismatch, STOP and disable ONLY `dailySiteSyncHourly20261019`. Do not touch the old nine triggers, replay old rows or alter Payroll.

The Apps Script batches requests in groups of at most 200 source rows and dry-runs all groups before committing any. Each RPC commit is individually atomic; if source changes between chunks, earlier committed chunks remain safely recorded and the next call can resume idempotently.

## Rollback
- If automated run fails or data changes unexpectedly: disable **only** `dailySiteSyncHourly20261019` (the newly created trigger); do not touch the other nine.
- This release must never rollback via truncation, deletion, blind replay, full-table restore, clearing monthly Google Sheets, or tampering with labour/payroll.
- The RPC and audit table remain available for diagnostics even if scheduled trigger is disabled.
- Label scope explicitly: no guarantee of retroactive edits for original rows <=353 without separate source-by-source, verified finance-aware reconciliation.

## Status / blocked actions
- GitHub reference source is **not** installed Apps Script code. Merging PR and applying DB migration do **not** install a trigger.
- No tool in this chat currently has direct access to create/edit the user's Apps Script code or its triggers. Those two GUI actions require the user in the Apps Script Editor.

## 19 Oct 2026 HTTP 400 diagnostic (06:46 Bangkok time)
- Owner-run `dailySiteSyncDryRun20261019` reached PostgREST but failed `DSR_RPC_FAILED_HTTP_400`; correlated `postgres_logs` contained `DSR_SERVICE_ROLE_ONLY`. Database 17 imported rows and one historical audit remained unchanged.
- RPC v1 used legacy `request.jwt.claim.role` GUC for a role gate. On modern PostgREST this may be absent even when the effective database role is `service_role`; fix only the RPC to validate `current_user = 'service_role'` (invoker, JWT role mapped by PostgREST). Do not modify the Script Property or share any key.
- **After migration and permission checks**, re-run only `dailySiteSyncDryRun20261019`; expect no-op `insert=0, update=0, skipped=17, blocked=0` if Form unchanged. No trigger installation until dry-run and no-op `dailySiteSyncNow20261019` pass.
- If it still fails, examine PostgREST/Postgres error code and verify the existing service-role credential privately; never print the credential or raw request headers.
