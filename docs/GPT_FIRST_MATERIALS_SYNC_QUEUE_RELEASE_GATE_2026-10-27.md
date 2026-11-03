# GPT-first Materials Sync Queue — isolated installation and acceptance (27 October 2026)

**Current status: STAGING DISABLED / NOT DEPLOYED to Apps Script.**

This change enables ChatGPT to request the **existing** `materialsSyncProduction()` job via an owner-only native Google Sheet. No alternative Supabase writer, database schema change, frontend route or service-role secret is created.

## Verified live baseline

- Original GAS project: `1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT` (modified at `2026-10-27T08:16:48.329Z` when inspected).
- Live source retrieved as original Apps Script JSON (26 files). `sync3Kings` SHA-256 prefix `62ed909d0fb25d10b1`; `ShiftSyncScheduler_2026-10-13` prefix `482d8ed15d5237bd69`. These are diagnostic fingerprints, not authorization for write.
- Live `materialsSyncProduction()` invokes `syncMaterialsWorkbook_(..., {dryRun:false,force:false})` under the existing script lock. Materials source unchanged detection uses `SYNC_MATERIALS_BUNDLE_FILE_ID` and `_MODIFIED`; successful import records `drive_sync_runs` and updates both values after successful writes.
- The `source unchanged, sync skipped` log at 14:19 Bangkok preceded the 14:32 Materials Master edit. Do **not** infer change-detection failure from that log alone.
- Existing hourly Shift trigger schedules Materials in four local windows 08/11/14/17; **never replace** it or its Defect/Photo/Calendar/Payroll triggers.

## New isolated assets

| Item | Identifier |
|---|---|
| GPT queue Sheet (private, owner only) | `17mc-xMCiXUID4bmuT8cj5LlS1PYGdZdsnW5UWK6PpE0` |
| Master Workbook (unchanged ID) | `1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn` |
| Queue consumer (staged code) | `docs/apps-script/GPTMaterialsSyncQueue_2026-10-27.gs` |
| Offline regression tests | `tests/gpt-materials-sync-queue.test.cjs` |
| Issue | https://github.com/pkraiwit2614-web/3kings-site-report/issues/227 |

Queue Control is initialized to `queue_state=STAGING_DISABLED` and `worker_active=FALSE`. The queue Requests tab has **headers only; no production work requests**. The private sheet has only owner access at creation.

## Install and activate — strict sequence

1. **No parallel editor changes.** Confirm Antigravity has completed its 27 Oct Materials task. Re-fetch live Apps Script project content and compare all 26 source files before editing. Preserve every existing file; do not bulk overwrite the project with a staged Git snapshot.
2. Copy **only the new** `GPTMaterialsSyncQueue_2026-10-27.gs` into the same original Apps Script project using authorized Apps Script editing or the official `projects.updateContent` API with appropriate OAuth scopes. Do not deploy a new independent GAS project.
3. Confirm same script ID, existing functions still present, unchanged trigger inventory. Run `preflightGPTMaterialsQueue20261027()` in isolation; it must return `PREFLIGHT_ONLY` with status `STAGING_DISABLED` and **zero writes**.
4. With the Control sheet still disabled, call `installGPTMaterialsSyncQueue20261027()` **once**. It creates only one trigger every 5 minutes for `processGPTMaterialsSyncQueue20261027`; check count=1 and unrelated handlers unchanged. If project already has 20 triggers, stop: do not delete any existing trigger to make room.
5. Test calls to `processGPTMaterialsSyncQueue20261027()` while disabled return `disabled`. Test invalid request IDs, wrong source, wrong owner, stale revision and duplicate ID in the **isolated test harness**, not the production queue.
6. Once live permissions, code fingerprint, and trigger inventory pass, explicitly change Control to `LIVE_APPROVED` and `TRUE`. Queue **one** owner-authorized request with `request_id` UUID, `MATERIALS_SYNC`, fixed Master ID, exact Drive `modifiedTime`, requested/expires UTC ISO times within 60 minutes, requester equal to owner email, status `REQUESTED`, other cells blank.
7. Verify one and only one run. Consumer marks `RUNNING` then `WAIT_SYNC` after legacy import/skipped; failures remain `ERROR` or `REVIEW`, never auto-retry, never silently force-import. Explicitly check `drive_sync_runs` and affected `procurement_items` source rows and record IDs. Verify authenticated Materials/Procurement Web UI with a legitimate owner session; no anon key or SSO bypass.
8. Only after independent source / DB / authenticated UI parity declare **Production PASS**. A 200 response, successful trigger execution, zero writes or `WAIT_SYNC` are **not** sufficient.
9. Activate GPT-first routine in canonical SOP 06 only after live acceptance. SOP 13 remains read-only QA. Do not modify those SOPs merely because this PR passes CI.

## Rollback

- First set Control `worker_active=FALSE` and `queue_state=STAGING_DISABLED`.
- Run `uninstallGPTMaterialsSyncQueue20261027()` to delete **only its dedicated trigger**. Leave every other trigger intact.
- Revert/delete the one isolated .gs code file if needed. Preserve queue history, previous Excel Master IDs and DB records. Never revoke core GAS OAuth scopes or alter RLS.
- Existing timed `syncShiftHourly20261013` continues independently.

## Security and limitations

The private owner-only Google Sheet is a control plane. Neither its IDs nor `requester` field alone authenticate a caller: the GAS consumer checks actual Drive owner, private ACL, effective user, schema, fixed action, fixed Master ID, source revision, expiry, replay, and duplicate request IDs. A narrower Google-scope deployment may require one-time explicit owner OAuth.

This queue does **not** allow arbitrary URLs, SQL, shell commands, OAuth keys, service-role keys, force writes, non-Materials jobs, or automatic Web-to-Excel reversals.

**A live installation cannot be represented as complete until the authorized Apps Script project editor/API writes the new isolated file, runs preflight, adds a trigger, and obtains authenticated Web readback.** The current ChatGPT Google Drive connector can read/export the project JSON but does not expose the `script.projects` edit/execution operation. Never use the Drive raw media `files.update` endpoint to overwrite the entire native Apps Script project.

## Local CI

```
node --test tests/gpt-materials-sync-queue.test.cjs
```

12 offline safety/rollback tests PASS in isolated Node 22 simulation. Required GitHub CI is amended to run this test, but CI is not proof of live GAS authorization or authenticated UI parity.
