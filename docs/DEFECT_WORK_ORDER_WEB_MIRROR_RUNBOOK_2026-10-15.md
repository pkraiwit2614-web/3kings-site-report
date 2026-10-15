# Defect Work Order — synchronize room status without losing manually managed tasks

**Target:** `3Kings Construction/Above/CONDO/Room Status/Defect_Work_Order_Updated_2026-10-15.xlsx` (Drive ID `18P3OFYtOLsslCtDujlSQVf9IQSuplKcx`).

**Verified status source:** the **existing** two-workbook Defect writeback already reflects the Web App into `Handover_Defect_Summary_Updated_28-09-2026.xlsx` (Drive ID `1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj`, sheet `ข้อมูลจำแนก`). This Work Order sync is downstream of the master, **not** a new canonical source and **not** a direct API call into Web App. If the master writeback is pending/failed, Work Order cannot be described as live or current.

## Write surface — extremely narrow

- `รายการ Defect` **AL:AQ**: Web room status, Web status group, Web next action, dispatch review flag, Combine consistency flag, source modification time. Existing **A:AK** are immutable, especially Work ID, room, contractors, item-level status (X), manual dates, evidence and formulas.
- `ใบแจกงานคงค้าง 151026` **L:O**: Web room status, item-level dispatch review flag, source modification time and Combine consistency. Existing **A:K** including printable manual item status (J) are immutable.
- All other sheets, PDFs, Work Plan, Hotel OOO/OOS, Supabase data, RBAC, Payroll, Materials and existing Apps Script triggers are untouched.
- Work IDs remain the authority for **individual work items**. Defect Master stores **room-level** statuses only. Therefore room-level completion does **not** silently remove a Work ID or mark a trade's remaining subtask complete. A manager must confirm item-level completion and approve removing it from the next print work order. An item list fully derived from Web requires recording per-Work-ID states in Web, which is **not** authorized here.
- Add a one-time baseline backup in the Work Order's same-folder `Backup` only before the **first real write**. Never create a new alternate main Excel file or change its ID/name.

## Safe executor

`docs/apps-script/DefectWorkOrderWebMirror_2026-10-15.gs` is a self-contained additive source module. It expects the **same existing Apps Script project** that already runs `runDefectWritebackScheduled`. Once installed:

1. In the existing Apps Script project add the complete `.gs` source as a new file. **Do not replace** `DefectExcelWriteback_2026-10-13.gs` or existing triggers. Existing OAuth scopes must include Google Drive and external HTTP requests.
2. Manually run `defectWorkOrderDryRun20261015` and review its execution log. Expected for the pinned 15-Oct files: `workItems=67`, `dispatchItems=54`, `conflicts=[]`, `wroteFile=false`. If the source inventory changes, investigate before installing.
3. Run `defectWorkOrderInstall20261015` **once**; it creates only its own 15-minute time trigger. Because Defect Master writeback runs every ~5 minutes, a Web edit may need an additional 15-minute window to appear in Work Order.
4. Run `defectWorkOrderScheduled20261015` once, then download/read Work Order **under its original file ID** and confirm AL:AQ and L:O mirror the status, group and next action. Cross-check a known Combine pair, a finished room, and a still-open room.
5. Compare originals against the baseline ZIP: no changes to XLSX members other than `xl/worksheets/sheet1.xml` and `xl/worksheets/sheet8.xml`; within those sheets, only new mirror cells and used-range dimensions are allowed. Check original formulas, validation, names, merges, formatting and prints. Recheck Work Order 7-day SLA separately; the mirror **does not alter old 3-day rules or item-level status**.
6. Confirm a new legitimate Web defect update flows to its existing master file first and then the Work Order mirror. A script run that does not change any mirrored values must leave the Work Order file untouched.

## Hard stops and rollback

- **Preflight fails shut** if the file IDs/names/type/sheet identities change; room inventory is not 263 (A162/B101); master Work ID count differs from 67 or dispatch ID count differs from 54; duplicate Work IDs occur; a Work Order room does not match the Combine set; any Combine member has a contradictory room status; or another user modified one of the two Drive workbooks during the operation.
- The Apps Script execution log returns counts, conflict list and `wroteFile`. On conflicts, no Excel write occurs; resolve identity in source, **not** by guessing or deleting rows.
- All XLSX parts except two named worksheet XML files are carried through byte-for-byte in uncompressed contents, without conversion to Google Sheets. The script fetches the Work Order back from Drive and validates both changed worksheet XML strings before declaring a write successful.
- If installed execution produces errors, disable **only** `defectWorkOrderScheduled20261015`; leave existing Defect Master writeback, Web App, data and other schedules unchanged. Restore original Work Order from the backup only if a verified workbook corruption occurred.

**Activation boundary:** GitHub changes and CI tests do **not** install the Apps Script module. The system is not live until the actual Apps Script project has been updated, its dry run and first writeback pass, and Drive readback confirms current data.