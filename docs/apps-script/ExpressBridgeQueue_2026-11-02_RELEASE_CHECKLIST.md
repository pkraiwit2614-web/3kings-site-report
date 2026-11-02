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

On 2026-11-02, Apps Script API / `clasp run` produced `NOT_FOUND` and zero-second API Executions. An initial Editor dry-run at 21:21:34 Asia/Bangkok was canceled after ~43 seconds; its cancellation root cause remains unverified. **Recovery later the same day:** a fresh, exact Editor invocation of `expressBridgeMasterImportDryRun20261022` produced `MASTER_IMPORT_PREFLIGHT_PASS` at 22:38:53; subsequent scoped Master writer and Express Registry writer passed their existing readback gates. See verified execution evidence below. This proves the Editor execution path worked; it does **not** establish the cause of the earlier manual cancellation or repair `clasp run`.

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

## Verified 2026-11-02 live E2E recovery (22:38–22:59 Asia/Bangkok)

The **existing** owner-controlled GAS functions were executed through Apps Script Editor, without any production code/trigger/OAuth changes:

| Boundary | Evidence |
|---|---|
| Master dry-run | `MASTER_IMPORT_PREFLIGHT_PASS` 22:38:53; source CSV 17, documents 3,758, lines 13,256, review 273, skippedCanceled 68, unassignedPlot 3,229 |
| Existing Master Release Gates | Read-only `inspectExpressBridgeGates20261023` 22:40:24: both Master and DB gates were already `true`; neither was changed in this workflow |
| Same-ID XLSX Master writer | `MASTER_REGISTER_WRITE_READBACK_PASS` 22:45:38; original ID `1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn`; before SHA-256 `b6de48054aaa9f7297b5c02ea4084591160e2d9bc5b38aa17c0c8b6aefec2505`, after `519e3a96ea2d2897599c6945e3a331ead820917416847209316d51aa99a70a1f`; updated only the two approved Express register worksheets |
| Independent Drive file readback | The original Drive file retained the same ID and was 4,216,349 bytes; ZIP integrity check `testzip()=None`, 61 ZIP parts, 13 worksheet XML parts, register sheet12 rows=3,759 and sheet13 rows=13,257 (including header), SHA-256 exactly matches the GAS readback log |
| Registry dry-run | `DB_SYNC_DRY_RUN_PASS` 22:47:56; documents=3,758, lines=13,256 |
| Existing Express Registry DB writer | `DB_REGISTER_READBACK_PASS` 22:53:39; completed Batch ID `5f139284-b339-4ef2-9a61-4f47b4fba28e`, sourceFiles=17, documents=3,758, lines=13,256, review=273; Supabase independently confirmed `state=complete` |
| New PO/PL | All 20 source-identified new document numbers found in Supabase, 20 header rows and 72 item rows |
| Historical proof | Earlier document numbers `PL0000001`, `PL0000588`, `PL0000589`, `PC690225004`, `PC690225005` remain in the *full-history latest batch* |
| Authenticated Production UI | `https://3kings-site-report.vercel.app/materials`, signed-in browser: Express section showed 3,758 documents, 13,256 lines, 273 review. Exact filter `PO691102001` returned one document dated 02/11/69. The existing Procurement/Materials operational rows were not manually changed by the registry import |

**Important boundary:** These successes apply to the **existing** Express Bridge source → same-ID XLSX two-register-tabs → isolated Supabase Express Register → authenticated Materials page. They do **not** prove an arbitrary registered PO/PL was promoted into operational `procurement_items` or physically received. Express Registry remains a read-only, historical view until SOP evidence maps it to a specific Plot/ordering/receipt status.

## Isolated GAS queue QA evidence

A separate GAS project named `3Kings_ExpressQueue_Isolated_QA_20261102` (script ID `1TZ8Pn4k7hiKYU02C0516ALUZ4T86-GWzHcxapN_cPZl8v97a6hMQQ6rw`) was created only for testing. The staged worker's Google service globals were replaced **in this QA project only** with `QAMock` service objects so the test did not authorize Drive/Sheets OAuth scopes or access Production data. `runExpressQueueIsolatedQA20261102()` passed in Apps Script V8 with log `ISOLATED_GAS_QA_PASS` at 22:58:54. Synthetic dataset: 3 documents, 4 lines. Coverage: disabled fail-closed, synthetic request validation, both inherited release gates using simulated writers only, and no legacy Materials calls.

The **actual proposed production worker** remains on this Draft PR and was **not** pushed to the live GAS project; no Express Queue transport Sheet, Script Property, or trigger has been activated. Real queue transport/lock/trigger integration and owner-only access QA remain PENDING. The QA source differs from the staged source only by replacement of Google service globals with self-contained mocks and the QA script ID.

## Release decision

- **Existing Express Bridge source→Master→DB→authenticated UI: PASS** for the verified 2026-11-02 batch.
- **Proposed new Express Queue: STAGING_QA_PASS / NOT_PRODUCTION_READY**. Do not merge/push/enable without independent integration review of the new owner-only Queue Sheet, exact-source fingerprint, auth, locks, retry safety, elapsed 6-minute GAS execution limit, and regression on all unrelated pipelines.
- **clasp Execution API: NOT_FIXED**. Apps Script Editor was the working alternative; the earlier canceled execution's cause was not conclusively identified.
