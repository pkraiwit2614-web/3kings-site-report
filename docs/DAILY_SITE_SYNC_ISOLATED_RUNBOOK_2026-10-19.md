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

## Install plan — sequential
1. Create a Branch and open PR with only the new migration, GAS reference, tests, runbook. CI must pass; no Production code deploy is necessary for a purely isolated Apps Script/RPC importer.
2. Verify dry-run on the 17 observed rows 354..370 (4 backdated work-date 16 Oct, 13 work-date 17 Oct), plus post-insert assertions (17 new entries and pending labour batches) before any write.
3. Apply additive SQL migration **only after isolated QA**, ensuring grants `service_role` only and no changes to existing policies.
4. In Apps Script main project `3Kings Drive → Supabase Sync`, click **+ File** and paste only `docs/apps-script/DailySiteReportSync_2026-10-19.gs` into new file. Do not replace or rename existing files or run any other installer.
5. Run `dailySiteSyncDryRun20261019()`; should return `status=DRY_RUN_OK`, `would_insert_or_inserted=17`, `would_update_or_updated=0`, `blocked=0` on unchanged baseline. If not exact, **STOP**.
6. Run `dailySiteSyncNow20261019()` only after valid dry-run. Observe `PASS_READBACK` with inserted=17, updated=0, verified=17; read database `source_row BETWEEN 354 AND 370`, check 13 + 4 dates and 17 pending batches and unchanged preexisting 350 rows.
7. Only after readback, run `installDailySiteTrigger20261019()`, expect `before:9, after:10, dailyCount:1`. Never touch/delete the existing 9 triggers.
8. Verify first real scheduled run with zero new writes; check `daily_site_report_sync_audit` for counts and actual Reports/Labour Web UI with authenticated Owner session.

## Rollback
- If automated run fails or data changes unexpectedly: disable **only** `dailySiteSyncHourly20261019` (the newly created trigger); do not touch the other nine.
- This release must never rollback via truncation, deletion, blind replay, full-table restore, clearing monthly Google Sheets, or tampering with labour/payroll.
- The RPC and audit table remain available for diagnostics even if scheduled trigger is disabled.
- Label scope explicitly: no guarantee of retroactive edits for original rows <=353 without separate source-by-source, verified finance-aware reconciliation.

## Status / blocked actions
- GitHub reference source is **not** installed Apps Script code. Merging PR and applying DB migration do **not** install a trigger.
- No tool in this chat currently has direct access to create/edit the user's Apps Script code or its triggers. Those two GUI actions require the user in the Apps Script Editor.
