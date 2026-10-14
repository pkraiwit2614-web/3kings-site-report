# Above Element — Work Plan XLSX ↔ Web App (2026-10-14)

## Target / boundaries
- Drive pinned file ID: `1KZ-VMDssYeMmTE-TNLYU0d8fwQkSUtuS`
- File: `3Kings Construction/Above/CONDO/Room Status/Above_Element_Hotel_vs_Defect_2026-10-13.xlsx`
- Existing 6 sheets are read-only, including **all formulas, styles, merges, tables, and shared strings**.
- Executor creates **one** sheet: `Hotel_Work_Plan` (OOXML `xl/worksheets/sheet7.xml`).
- New sheet editable columns C (Day), D (room Plan Date), E (Actual Date), F (work status), G (note); master Day dates and notes L2:M10. Preserve A/B (Seq, room) and K2:K10 (Day identity), H–J (audit display).
- Defect Report, Defect Flow, OOO/OOS, payroll, Materials, and Work Calendar data are not modified by this executor.

## Live deployment prerequisite (must not claim sync active before completion)
This executor MUST be installed into the **existing** 3 Kings Google Apps Script project used for Hotel OOO/OOS and Defect sync. The GitHub `.gs` file alone does not install or schedule Apps Script.

1. In that Apps Script project, create **one new script file** named `HotelWorkPlanExcelBidirectional`.
2. Paste the contents of `docs/apps-script/HotelWorkPlanExcelBidirectional_2026-10-14.gs`. Leave the existing scripts/triggers unchanged.
3. Existing Script Properties required: `SUPABASE_PUBLISHABLE_KEY` and `DEFECT_SYNC_KEY`; **never put either value in source control**.
4. Run **`hotelWorkPlanDryRun()`**. Before sheet creation, expected `ok:true,bootstrapRequired:true,sourceRows:267`. If false, STOP and investigate.
5. Run **`hotelWorkPlanSyncNow()`** once. Expect `ok:true,bootstrapped:true,verified:267,backupId:...`. This adds the dedicated sheet to the same pinned Excel ID and creates a backup in the original folder's `Backup` subfolder, without changing original 6 worksheet contents.
6. Verify the **same Drive file ID**, **7 sheets**, **9 Day cards**, **267 rows**; compare formula counts and original worksheet XML parts to the backup. If any mismatch: STOP, do not install trigger.
7. Do a **controlled canary** with a **real agreed date** in one Day or room: edit new sheet; run `hotelWorkPlanDryRun()`; run `hotelWorkPlanSyncNow()`; confirm Work Plan Web and `updated_by_name=Excel`. Then edit date from an authorized Work Plan editor on Web; run again and confirm Excel updated and `source_synced_*` matches. Keep real data; avoid fake test edits.
8. Validate conflict: in a disposable copy/test database (NOT Production), make different edits to the same field on both sides; expect no overwrite, audit record source `conflict`, and `sync_state=conflict`.
9. Only after all tests, run **`hotelWorkPlanInstallTrigger()`** once. It creates only `hotelWorkPlanSyncNow` every 15 minutes and leaves other existing triggers alone.
10. Merge PR #99 after CI, Preview, database checks, and Drive readback pass. Confirm Production commit SHA and real user-role paths.

## Safe algorithm
- Before any write, verify file ID/name/MIME, canonical 267 Seq + source Room identifiers and exact Day identities.
- Database RPC `hotel_work_plan_sync_snapshot` reads live desired values and *last verified Excel baselines*.
- Compare Excel sheet to baseline: import Excel-originated changes ONLY when Web has not changed the same record. `hotel_work_plan_sync_import` verifies every row revision and imports atomically.
- On differing simultaneous edits, mark `hotel_work_plan_sync_conflict` and stop. Never select a winner automatically.
- For Web-originated pending changes, patch only `sheet7.xml`; Excel originals are not rewritten in memory.
- Check source Drive modified timestamp before upload; create a verified Drive backup; upload same file ID.
- Re-download the file, compare the SHA-256 of all non-target ZIP parts against the pre-write copy, read all 276 target rows and verify values/identities.
- Only then `hotel_work_plan_sync_ack` marks revisions synced, optimistically and atomically. Revision mismatch fails, leaving pending/conflict.
- No actions can update `condo_room_status`, `hotel_room_availability`, or underlying Defect Excel workbook.

## Monitoring & troubleshooting
- `hotelWorkPlanDryRun()`: read-only and safe to execute anytime.
- `hotelWorkPlanSyncNow()`: normal write path; `ok:true` with `imported`, `writtenCells`, `verified` expected.
- `ok:false,conflict:true`: compare displayed Seq/Day between latest Web data and Excel (do not manually override blindly). Owner sees Excel conflict history on Work Plan.
- `source_sync_state=pending` on Web: no verified Excel ACK yet; do **not** call it synced.
- `PINNED_WORKBOOK_ID_NAME_MIME_MISMATCH`: file name/ID changed; stop rather than switching source.
- `Formula detected in editable cell`: a user inserted a formula in an input cell; refuse to overwrite it.
- `Non-target Excel part changed`: stop, inspect before proceeding; the backup is in the same folder.
- First bootstrap requires a backup; subsequent changed writes also create a backup. No new backup when nothing is changed.

## Security
- Work Plan Web edits use the existing real-profile scope: Owner and `defect_editor`; never trust a role-preview UI to authorize database changes.
- Supabase sync RPCs are pinned to the exact Drive file ID and validate the existing private server-side sync key.
- Do not place Drive OAuth tokens, sync key, or Supabase secrets in GitHub, logs or user-visible messages.
- Web edit history remains in `activity_logs`, Excel-origin changes/conflicts in `hotel_work_plan_sync_audit`; owner-only read policy.

## Production release checklist
- [ ] Apps Script module installed and authorized in original project
- [ ] First dry run returns pinned 267 rows
- [ ] First real bootstrap returns verified 267 and backup ID
- [ ] Existing six sheet data/formulas/styles byte-for-byte verified
- [ ] Excel->Web canary passes
- [ ] Web->Excel canary passes
- [ ] Conflicts fail closed
- [ ] 15-minute trigger is installed exactly once
- [ ] Existing unrelated triggers unchanged
- [ ] PR checks pass, new Work Plan page uses correct roles
- [ ] Production deployed and checked against correct commit
