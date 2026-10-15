# Work Order — sticky header, Combine icon, guarded Excel import (2026-10-15)

## Unchanged boundaries
- Canonical Defect/Handover source remains `public.condo_room_status`; never update it here.
- Work Order frontend is still Viewer + Print; it does not permit manual writes.
- Only source workbook: `Defect_Work_Order_Updated_2026-10-15.xlsx` in the existing Above/CONDO/Defect Drive folder, sheet `ใบแจกงานตามทีม`. Its Drive ID is held in Script Properties instead of public GitHub source. Do not use an old prototype or a backup workbook.
- Existing source Excel, sheet formulas, Defect Flow, Report, Work Plan, OOO/OOS, Payroll, Materials, existing Apps Script triggers remain unchanged.

## Page
- Vertical table scrollbar with sticky thead; still permits horizontal scrolling on a narrow display.
- Print uses the existing Print button. In print media, scrolling/sticky behavior is removed and `thead` repeats across pages.
- Combine `c` superscript and `Combine: ROOM + ROOM` follow `lib/hotelRoomGroups.ts` (same room grouping as the Defect interface). A shared Work ID is displayed once; a search for either member finds the group.
- Rows `source_active=false` are excluded. The existing unfinished + canonical room-status checks remain in place.

## Database (migration deployed separately)
- `supabase/migrations/20261015140000_defect_work_order_auto_import.sql` extends only `defect_work_order_snapshot` with `source_active` and adds `defect_work_order_sync_import`.
- This RPC checks the private Defect sync key, the fixed approved source filename, and the SHA-256 of the approved private Google Drive ID.
- The importer validates Work ID uniqueness, confirmed room inventory, required fields, date relationships and a maximum unexpected reduction; blank/partial/corrupt source is rejected without changing existing data.
- Semantic changes are upserted by Work ID. Source-removed rows are marked inactive, not deleted, keeping original historic records. A failure rolls the whole transaction back.
- Only Work Order snapshot rows may be changed; `condo_room_status` and every other table are not written.
- Anonymous SQL clients can't update the table directly. RPC execution is permitted only with a valid private sync key.

## Enabling actual automatic Excel sync — one-time step
**Status until installation and verified first run:** DB RPC and GAS file are ready; automatic schedule is NOT confirmed active. The GitHub file is a reference copy and does not magically install into an existing Apps Script runtime.

1. In the **existing 3 Kings Apps Script project** (the one running `syncShiftHourly20261013` / Defect SmartSync), add one script file by pasting the complete source from `docs/apps-script/WorkOrderAutoSync_2026-10-15.gs`. Do not replace other files or triggers.
2. In Project Settings → Script Properties, add `WORK_ORDER_FILE_ID` with the actual private Google Drive ID of the approved XLSX. Leave `DEFECT_SYNC_KEY` and `SUPABASE_PUBLISHABLE_KEY` unchanged. Do not copy their values into GitHub or chat.
3. Run `workOrderDryRun20261015()`. It must return `status:'dry-run',rows:...` and `db.ok:true`, with no edits to Excel or DB.
4. Run `workOrderSyncNow20261015()` once; verify `status:'success'` and the returned active row count. Compare against the original worksheet and Work Order Web.
5. Run `installWorkOrderTrigger20261015()`. Its return must have `count:1`. This installs exactly one *independent* hourly trigger. The handler internally runs Mon–Sat 08:00–18:59 Asia/Bangkok and skips Sundays.
6. Run `workOrderSyncStatus20261015()` to verify `handlerInstalled:true` and a nonempty `lastAcceptedExcelRevision`.
7. Edit one controlled Work Order cell in the source XLSX and wait for a scheduled run; confirm `lastAcceptedExcelRevision` advances, changes appear in the isolated snapshot and the web, and no unrelated worksheets/tables change. Revert the controlled test edit through normal source-workbook handling when appropriate.

## Monitoring & failure behavior
- Unchanged `file.getLastUpdated()` → no conversion, no API call, no DB write.
- Source changed → open a **temporary converted copy** for reading; never write or rename the original XLSX.
- Use a script lock, verify the file name and file ID, and reject concurrent source modification.
- Any RPC error: throw; do not advance Script Properties revision. Next run may retry.
- Missing/renamed sheet, duplicate Work ID, bad source, missing permissions or excessive list reduction: fail closed.
- This is a one-way Excel → Work Order snapshot operation, not Excel ↔ Web editing.

## Regression and acceptance
- `node --test tests/work-order-viewer.test.cjs tests/work-order-auto-sync.test.cjs`
- Run full GitHub CI, inspect Vercel Preview and role matrix, then deploy.
- **Do not claim end-to-end schedule works until handler installation and the first successful Apps Script invocation are actually verified.**
