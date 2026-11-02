# 3 Kings — Express Bridge Queue isolated staging (2026-11-02)

## Scope and status

**Status: STAGING / DRAFT / NOT INSTALLED.**

The user authorized development and impact assessment of a queue exclusively for Express import. This change adds one *separate* GAS source candidate and an isolated offline Node regression test to the repository. It does not touch running Apps Script, Google Drive masters, existing queues, Supabase, GitHub main, Vercel, Trigger schedules, OAuth, users, or web components.

- Live GAS project: `1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT`
- Canonical Materials Master: `1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn`
- Existing queue: `processGPTMaterialsSyncQueue20261027` (MATERIALS_SYNC only; Control was STAGING_DISABLED / worker_active FALSE as inspected on 2026-11-02)
- Existing Express functions: `expressBridgeMasterImportDryRun20261022`, `expressBridgeMasterImportOnce20261022`, `expressBridgeRegistrySyncDryRun20261022`, `expressBridgeRegistrySyncOnce20261022`
- Source: `docs/apps-script/ExpressBridgeQueue_2026-11-02.gs`
- Offline QA: `node scripts/test-express-bridge-queue.cjs`

## Failure investigation checkpoint

On 2026-11-02, Apps Script API / `clasp run` produced `NOT_FOUND` and zero-second API Executions. Subsequently the exact Master Import Dry-run was selected and invoked in the **existing Apps Script Editor** at 21:21:34 Asia/Bangkok; the next inspected Execution entry showed `Canceled`, duration ~43.389 seconds, with **no PREFLIGHT_PASS evidence**. The reason for cancellation was not verified. **Do not execute the live Master writer or registry writer on this evidence.** Obtain complete Editor/Execution log and rerun dry-run only when failure/cancellation handling is understood.

## Impact matrix

| Pipeline / system | Proposed change | Expected impact | Mandatory release check |
|---|---|---|---|
| Express CSV exports | Read with existing Express reader, checksum fingerprint | Read-only; all available files, not only latest | Prove CP874/TIS-620, revisions, cancellation, multi-Plot and dedup retain SOP logic |
| Materials XLSX master | Delegate only to existing `expressBridgeMasterImportOnce20261022` | Writes **only** through existing gated importer | Exact same Drive File ID, OOXML ZIP parts, formulas, row identity, readback; no duplicate import |
| Express Supabase register | Delegate only to existing `expressBridgeRegistrySyncOnce20261022` | Writes only through existing gated importer | Complete batch, count, key-wise readback and auth web UI |
| Existing Materials Queue | No call, no config or trigger edits | NONE | Compare before/after Control, handler, trigger |
| Legacy Materials Sync | No call to `materialsSyncProduction` | NONE | Source grep and regression |
| Defect, Work Order, Daily, Calendar, Payroll, RBAC/RLS | No source change | NONE | Git diff isolated and smoke baseline |
| Script/owner access | Owner-only private **new** queue transport, fail-closed | No OAuth changes expected; GAS effective-user, Drive and Sheets scopes must be verified in live project | Manual authorization/trigger check only after approval |
| Trigger / deployments / GitHub main | No new trigger and no code deployment | NONE | Confirm no live Queue handler, no changes to production SHA |

## Release and activation gates (NOT satisfied yet)

1. **Clear the existing Express failure:** get Editor execution detail and full trace of the canceled Master Dry-run. If Editor itself cannot complete, HOLD; queue is not the fix for a broken importer.
2. **Live source comparison:** compare repo candidate against live GAS source and helper signatures (including `EB_qaReadFolder_`, `EB_dbFingerprint_` and existing importer return codes). Resolve mismatches through isolated QA, not a blind production paste.
3. **Owner-only queue Sheet:** create a new private Google Sheet, **not** existing Materials Queue. Tabs: `Control` with `key,value,description`; `Requests` exact 15-column header defined by code. Required control keys: `schema_version=1`, `allowed_script_project_id`, `allowed_master_file_id`, `owner_email`, `queue_state=STAGING_DISABLED`, `worker_active=FALSE`. Do not place secrets in Sheet.
4. **No automatic activation:** Script Properties `EXPRESS_QUEUE_SHEET_ID_20261102` and `EXPRESS_QUEUE_ENABLED_20261102` remain unset. Both `EXPRESS_BRIDGE_MASTER_WRITE_APPROVED` and `EXPRESS_BRIDGE_DB_SYNC_APPROVED` remain as-is. Changing them is a separate release decision.
5. **Staging testing:** verify invalid/expired/duplicate/dirty requests -> REVIEW, source fingerprint mismatch -> REVIEW, disabled -> no side effects, crashing importer -> ERROR with **no auto retry**. Verify simultaneous queue workers and interrupted `RUNNING` requests never double-write. Confirm GAS execution quotas and source batch sizes.
6. **Engineering approval and release:** only after exact-source review and tests. Stage new GAS source in the original project; do not modify old handler/code/trigger. Enable no new time-based trigger until an owner-authorized staged invocation passes and rollback is available.
7. **Production acceptance:** first Master dry-run PASS, owner-approved importer, same-ID Master readback, register dry-run PASS, owner-approved registry sync, Supabase counts and key identity, authenticated Materials/Procurement/Express Register UI, then repeat unchanged batch as NO_CHANGE. Do not mark DONE because code deployed or a queue worker returned.
8. **Rollback:** disable only the new Express Queue at its own Script Property/Control and remove only its dedicated trigger if one is installed by a separately approved change. **Never disable or delete the original Materials Queue, legacy triggers, writer gates, or source files.**

## Queue contract and lifecycle

- Actions: `EXPRESS_MASTER_DRY_RUN`, `EXPRESS_MASTER_IMPORT`, `EXPRESS_REGISTRY_DRY_RUN`, `EXPRESS_REGISTRY_SYNC`.
- Identity: UUID request ID; 64-hex full-folder source fingerprint; owner identity; exact Master File ID; <=60-minute request lifetime.
- State: `REQUESTED -> RUNNING -> WAIT_QA` or `REVIEW` / `ERROR`. `WAIT_QA` is **not** a Production PASS. `RUNNING` after timeout is **not retried automatically**.
- The existing writer functions own business parsing, approval/release gates, cancellation filtering, multi-Plot relationships, ZIP readback, and database-specific idempotency.
- One request per invocation to reduce runtime quota risk. Time-based scheduling, if any, is a separate authorized change.
- Do not use this queue to repair `NOT_FOUND` on the Apps Script Execution API; it is a separate execution path only **after** the existing importer is proven functional.

## Tested evidence

On 2026-11-02, an isolated copy of this branch ran `node scripts/test-express-bridge-queue.cjs` with exit status `0`: disabled default, allowlist, owner/expiry/UUID/fingerprint checks, inherited release gates, no trigger installer, and no call to legacy Materials Sync.

This is **offline unit QA only**, not live GAS/Source/Master/DB/Web acceptance.
