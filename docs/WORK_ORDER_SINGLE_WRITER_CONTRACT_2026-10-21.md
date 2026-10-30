# Work Order Excel writeback — single-writer consolidation (21 Oct 2026)

**Status: staged guarded code on a review branch, NOT runtime or Production activation.** Supersedes PR #113 and PR #119. The new GAS completion writer and optional Web confirmation UI are staged with separate default-off gates; they do not install Apps Script, apply SQL, activate editing or write Excel by being committed.

## Verified baseline (21 Oct 2026)

- Source: current SOP 01 (Excel-first), SOP 13 (sync readback), SOP 15/16 (code/release) from the ACTIVE Google Drive SOP INDEX, together with `AGENTS.md`.
- Canonical Defect Master and canonical Work Order XLSX are two distinct approved sources. Current Work Order import is **read-only toward Excel**, with its existing 2-hour Apps Script path.
- Read-only production DB check: 32 active Work IDs; 58 total snapshot records, of which 26 are inactive; **zero** `web_completed_at`, pending, failed and synced writeback records at the time checked. Work Order source modified 21 Oct 2026 09:15:48Z.
- Production DB has `defect_work_order_complete`, `defect_work_order_writeback_pull/ack/fail` and `defect_work_order_sync_import`. Function presence **does not prove** an installed GAS executor, live UI action, successful E2E, or safe authorization for all roles.
- Main Work Order page has no invocation of `defect_work_order_complete`; completion UI from draft PR #119 must not be presumed live.
- Draft PR #113 pins **67 master / 54 dispatch** IDs based on 15 Oct sample and would reject the changed current dispatch; its 15-minute writer must not be installed.
- Draft PR #119 writes completion status plus time back to the *original* XLSX. Its proposed executor is not installed/verified; its SQL migration must not be blindly replayed since related routines are present in Production.
- Draft PR #159 is another non-live Work Order writeback proposal; do not deploy its worker alongside an independent completion writer.

## Data authority — per field / per Work ID

| Field | Authoritative input | Consumers / write authority |
| --- | --- | --- |
| Room-level Defect status, group, next action | Approved Defect Master XLSX, subject to Excel-first Web override/queue reconciliation | Existing guarded Defect import only; Work Order may **read** it for eligibility/display. |
| Work ID identity, contractor, item, manually entered Work Order details, due/receipt dates | Original Work Order XLSX | Existing Work Order importer reads; no reverse web overwrite. |
| Per-Work-ID Web completion intent, actor and confirmation timestamp | Authorized Web action, stored in DB with pending audit receipt | A **single** Work Order Excel writer may materialize the exact Work ID completion in the original XLSX; never automatically close a room. |
| Excel writeback receipt | Original XLSX **readback** of the same Work ID, status and timestamp, then DB acknowledgment | Only writer sets `synced`. Before readback keep `pending/error`. |
| Room-status mirror in Work Order UI | Derived from approved Defect Master/current guarded snapshot | Prefer read-only derivation. If physical mirror cells are ever required in XLSX, schedule **within the same writer and same workbook transaction**, never a second trigger. |

**Never allow separate independently scheduled writers to upload the same workbook.** In particular do **not** enable `defectWorkOrderScheduled20261015`, `syncWorkOrderCompletion20261015` or a #159 executor concurrently as separate Excel writers. Only one approved Work Order writer may be active.

## Required single-writer transaction contract

1. Verify live ACTIVE SOP, canonical file ID/name/MIME, parent location, last modified revision, current Work ID inventory, header/worksheet mapping and effective user's role. Do not trust historical counts.
2. Acquire one shared GAS project lock for the approved Work Order pipeline (read importer and writer must cooperate). External Excel/manual writers are not protected by GAS locks; require a revision/concurrency gate and hold if change is observed. Do not claim an atomic compare-and-swap without documented provider support.
3. Read current pending Web completions and latest original workbook **once**, reconstruct by exact Work ID. Duplicate/missing ID, Combine disagreement, unauthorized/retired ID, already completed with a different time, formula target, unexpected column/template or pending Excel/manual conflict => **block affected ID**, retain the original data and audit error.
4. Resolve conflicts by field ownership: Web completion request cannot override a more recent authoritative manual Excel edit; Excel import cannot revert a confirmed Web completion. No automatic resolution by timestamp alone when provenance conflicts. Unrelated safe IDs may continue if independent.
5. For approved IDs, change only current status and an explicitly added completion-date cell in the **existing worksheet XML**, preserving every other ZIP member, formulas, historical sheets, styles and links. Make one risk-based same-folder backup; never convert/re-save the XLSX workbook.
6. After a final revision check, upload **once** to the same File ID, then download and compare Work IDs/status/timestamps plus workbook structure/formulas and unchanged ZIP members. If revision changed before update, fail closed; if an independent edit can race with upload, the release must establish a real exclusive-writer window or verified provider precondition.
7. Acknowledge each item in DB only after exact Excel readback; queue acknowledgment is idempotent and tied to `work_id + web_completed_at`. On failure preserve `pending/error` and retry safely; do not lose the work completion.
8. Run existing importer once with the updated source revision, verify DB Work Order snapshot status/count and Web UI. Do not change room Defect, Hotel OOO/OOS, Work Plan, Materials, Payroll, Daily Report, Calendar or security policies as a side effect.
9. Report every outcome distinctly: `PENDING`, `SYNCED`, `ERROR`, `CONFLICT` or `NO_CHANGE`. Script completion is not E2E success.

## Release sequencing

1. **Supersede #113** as an independently scheduled Excel writer; keep its guarded read-only room-mirror logic as a reference, but retire its fixed inventory gate/legacy trigger. No need to write room-status mirror values to XLSX for the initial completion feature.
2. **Port only still-needed #119 code to a new main-based implementation**, not a merge of the old branch: per-ID UI action and confirmation, permission gate, existing DB queue integration, single XLSX executor, source import precedence, targeted tests. Recheck current role matrix and the *already existing* live functions, avoiding replay of duplicate/replacement SQL.
3. Keep #159's optional owner-authorized Defect writeback worker disabled; if later required, route through the same Work Order writer contract rather than a second XLSX worker.
   - The staged Work Order page calls the already-present `defect_work_order_complete` RPC only when `NEXT_PUBLIC_WORK_ORDER_COMPLETION_ENABLED=true`; this flag remains unset in existing deployments. The separate GAS writer checks `WORK_ORDER_SINGLE_WRITER_ENABLED=true` and preflight before any source write. **Neither flag is authorization to skip Excel readback, actual ACL or isolated E2E QA.**
4. Run isolated synthetic regression: duplicate Work IDs, Combine/mismatch, manual conflicting completion, stale Excel revision, formula preservation, unchanged ZIP members, idempotent retry after write-before-ack, failure-before-write, other Work IDs unchanged, 32-current-inventory variability and concurrency.
5. Run GitHub Actions affected Build/tests for the exact HEAD and separate-DB Auth/RBAC/RLS test; hosted Preview only if hosted integration cannot be proved in CI.
6. In the **original** GAS project, verify only one Work Order writer handler and the existing importer; execute read-only dry-run, then a user-controlled **QA-only same-ID write + restore** with backup and readback, never a synthetic write to real historical work records.
7. Confirm E2E: Web pending -> original Excel value -> DB import -> Work Order UI synced, including retry and error case. Only then allow Production release and live activation, with exact SHA/feature readback.

## Stop / help needed

- Until a single-writer executor is implemented and tested, leave website completion edit action disabled; the existing read-only import remains active.
- No direct GAS trigger inspection or invocation is available through this GitHub/Drive connection. An owner with Apps Script access must verify handlers and execute protected live tests; share **only function names, execution summaries and counts**, not credentials.
- If a new writable Web completion is required, verify real owner/editor role matrix and hosted runtime before release; never relax RLS or apply unreviewed migrations.
- This document is a coordination contract, **not** evidence of Production activation, XLSX writeback or QA PASS.

Reference: superseded PRs [#113](https://github.com/pkraiwit2614-web/3kings-site-report/pull/113) and [#119](https://github.com/pkraiwit2614-web/3kings-site-report/pull/119); related draft [#159](https://github.com/pkraiwit2614-web/3kings-site-report/pull/159).
