# Work Order completion: Preview validation and safe XLSX writeback

## Scope and approved authority
- UI: `app/work-order/page.tsx`. New `เสร็จแล้ว` action is **per Work ID**, not room-completion nor Hotel acceptance.
- Defect Report column label only: `วันที่ Hotel แจ้ง` → `วันที่รับแจ้ง`. Shared display helper `lib/defectNoticeDate.ts` preserves existing report values.
- Original Work Order XLSX: `Defect_Work_Order_Updated_2026-10-15.xlsx`, Google Drive ID supplied privately by `WORK_ORDER_FILE_ID`.
- Only worksheet `ใบแจกงานคงค้าง 151026` is editable by the completion executor. The `ใบแจกงานตามทีม` sheet is **historical**, not an edit target.
- Source inspected 15 Oct 2026: 8 worksheets; active worksheet 61 rows × 15 columns, headers on row 5, Work ID in C, status in J, P unused, no pre-existing P merges. A1:O61 dimension. The approved dispatch worksheet contains 52 listed Work IDs, but the Web snapshot's `source_active` status is a distinct indicator. Reverify before activating after changes to Excel.
- No change to Defect Flow, Defect Report data, Work Plan, OOO/OOS, Payroll, Materials, scripts or existing triggers.

## Rollout order (do not bypass)
1. Verify CI on [PR 119](https://github.com/pkraiwit2614-web/3kings-site-report/pull/119). No Production deploy while CI is failing.
2. Apply the **two** additive Supabase migrations from this branch to project `wtqubwdduzedmcvyhbgs`, in filename order:
   - `20261015150000_work_order_completion_writeback.sql`: adds isolated columns/RPC queue.
   - `20261015151000_work_order_import_preserve_completion.sql`: makes the existing Excel importer preserve web-confirmed Work ID status, without changing old import guardrails.
3. Reconcile Work IDs and statuses against the latest importer before deployment. On 15 Oct 2026 preflight the database had 52 TOTAL, 26 `source_active=true` and 26 inactive (23 already marked completed, 3 sent to juristic); **do not assume all 52 Excel rows should be active**. Verify no unintended room status changes, existing read RLS, and zero `writeback_state='pending'` rows. Verify a no-login attempt to completion returns `AUTH_REQUIRED` or permission denied. Verify protected roles and existing Role Matrix remain unchanged.
4. In the **existing 3 Kings Apps Script project** containing `WorkOrderAutoSync_2026-10-15.gs`, ADD (do not replace) the new file `docs/apps-script/WorkOrderCompletionWriteback_2026-10-15.gs`. It calls the existing `workOrderConfig20261015_()` and uses existing `WORK_ORDER_FILE_ID`, `SUPABASE_PUBLISHABLE_KEY`, `DEFECT_SYNC_KEY`. Never post key values to GitHub or chats.
5. Run `workOrderCompletionDryRun20261015()` first; expected `status:"dry-run"`; when queue is empty `queued:0,verified:0,errors:[]`. It does not change original XLSX.
6. Check `installWorkOrderCompletionTrigger20261015()` returns `count:1` (independent 5-minute trigger). Confirm through Apps Script UI/trigger list; preserve original 2-hour import trigger and all unrelated triggers.
7. Deploy approved branch to **Vercel Preview**, sign in as each relevant existing role. Verify view/edit rights, modal confirmation, Work ID, initial `pending` status, Work Order date display, 7-day flags and print. Check Defect page and other modules for regressions.
8. For controlled end-to-end test, use **one genuine unfinished Work ID only after actual onsite completion is confirmed**. Confirm once in Web App → `pending`; run `workOrderCompletionSyncNow20261015()` in Apps Script; verify returned `status:'success'`, `verified:1`, `errors:[]`; open original same Drive ID and confirm only this Work ID row has J=`เสร็จแล้ว`, P=`DD/MM/YYYY HH:mm:ss`; verify queue becomes `synced`. A status change must NOT modify `condo_room_status` or other rows.
9. Run `workOrderDryRun20261015()` and `workOrderSyncNow20261015()` to verify Excel→DB import does not revert completed status. Refresh web, verify `เสร็จแล้ว` appears in DONE view, previous jobs remain intact.
10. Only after all verifications, mark PR ready for review, merge and confirm Production deployment commit. Retest after Production promotion.

## Fail-safe and recovery
- Backend authorizes with active authenticated profile, current Defect Manage Role Matrix and existing internal Work Order role restriction. Default role grants are unchanged.
- Every Work ID action is idempotent: already-completed Work IDs cannot be completed a second time via the Web RPC.
- No direct browser write privileges granted to Work Order table; database RPC limits the update to one active Work ID and records timestamp + actor.
- Excel writer checks exact private file ID, name, XLSX MIME, approved sheet, unique Work ID, original status/date, available P column, no target-cell formulas, and revision not concurrently edited. Makes a one-time backup in the existing folder's `Backup`.
- Writes only J(status), P(header/date) in active sheet XML, keeping every other ZIP member unchanged. Uploads original file ID and reads it back before acknowledging completion. Failure leaves queue in `error` until resolved; web must **never** claim Excel sync succeeded before acknowledgement.
- Existing two-hour Excel importer must never revert a Web-confirmed completion. If a conflict is detected or sheet structure changes, stop and inspect; never overwrite manually edited values.
- Keep statuses for completed Work IDs independent of room-level Defect status and hotel acceptance.
- If new writing path fails, disable only `syncWorkOrderCompletion20261015` trigger and block Web completion before reverting/deploying; don't delete Defect rows or rewind already written XLSX bytes. Review queue, backups and audit before any data changes.
- No need to modify the original Excel or create duplicate XLSX files during deployment.

## Acceptance checks
- `node --test tests/work-order-viewer.test.cjs tests/work-order-auto-sync.test.cjs tests/work-order-completion.test.cjs`
- Full GitHub CI (includes other modules). No bypass of unrelated failing Materials Print tests.
- Real production acceptance requires Apps Script install + trigger confirmation + original Drive file readback, **not merely a successful preview build**.
