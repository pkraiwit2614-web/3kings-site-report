# Above Condo Defect — verified Web App → original two Excel workbooks

## Scope and non-negotiable constraints

- **Canonical web database:** `public.condo_room_status` (263 rooms, A162/B101).
- **Authoritative workbook:** `Handover_Defect_Summary_Updated_28-09-2026.xlsx` (Drive ID `1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj`), sheet `ข้อมูลจำแนก`.
- **Derived overview workbook:** `Status ภาพรวม รายห้อง-Building-A-B-Done_Updated_28-09-2026.xlsx` (Drive ID `16JuK26rn7HGPDtSlnMMS2aljYGWyn0Y3`), sheet `Room Data`.
- No new Excel files or replacements, no source filename changes, no entire-sheet clear, no formula-cell writes, no change to payroll, procurement, materials, permissions, or photo mapping.
- Only **confirmed/manual Defect saves on the Web App** create outbound entries. Evidence PDFs remain in their existing validation system.

## Architecture

1. Existing `defect_manual_update_apply` saves the new Defect status to `condo_room_status` in one authenticated database transaction.
2. Existing `defect_web_override_after_manual` trigger records the revision in `defect_web_overrides`, `source_sync_state='pending'`. Inbound Excel sync already protects these manual values.
3. An Apps Script **installed in the actual existing Google Apps Script project** runs `runDefectWritebackScheduled` at most once every five minutes and calls `defect_writeback_pull` via the existing private sync secret.
4. The executor opens the two original .xlsx files by **Drive file ID**. It surgically edits only:
   - master sheet `ข้อมูลจำแนก`: F (Current Status), I (Status Group), L (Next Action), M (Latest Source), N (Source Note), new Q (Defect Detail);
   - overview `Room Data`: new R–V (Web Defect Status / Group / Next Action / Detail / Confirmed revision). All original A–Q data, formulas, and room type classification remain untouched.
5. Before any first live write, the executor saves a one-time untouched copy of each original workbook into its *same-parent* `Backup` folder. No backup on every later edit.
6. It rewrites only the specific worksheet XML cell records inside the XLSX ZIP and uploads to the **same Drive ID**, leaving all other workbook components intact.
7. It **fetches both XLSX files back from Drive**, validates each new cell, then calls revision-locked `defect_writeback_ack`. If either write/readback fails or a newer user update appears, the queue remains pending and retries. Both partial writes are idempotent and latest revision wins.
8. The Web App shows `pending` vs `synced`, and only claims both Excel files are updated after the backend ack.

**Important:** The Web App displays new Defect values *immediately* from Supabase. This outbound step is an asynchronous Excel persistence/verification process, **not** a reason to overwrite the new Web App values with old Excel content. Existing inbound sync still runs from the approved Master only.

## Mandatory deployment to existing Google Apps Script project

Changing the GitHub reference file is **not** deploying a running Apps Script. The following must be done in the project which already runs `smartSyncDefectsV13_15m`:

1. Add the complete `docs/apps-script/DefectExcelWriteback_2026-10-13.gs` as a new Apps Script source file. Do not replace old files.
2. Add to **Script Properties**: `SUPABASE_PUBLISHABLE_KEY` (same publishable key as Web App) and `DEFECT_SYNC_KEY` (existing 3Kings Drive Sync secret; do not expose in client, code, logs, or chat).
3. Preserve all existing scopes, and ensure Apps Script appsscript.json contains `https://www.googleapis.com/auth/drive` and `https://www.googleapis.com/auth/script.external_request`.
4. Execute `runDefectWritebackDryRun`. It checks both existing workbook layouts and 263-room identity without writing to Drive. Verify no errors.
5. Execute `installDefectWritebackTrigger` **once**, then verify the five-minute trigger appears under Apps Script Triggers. This installer only modifies its own trigger, not Smart Sync.
6. With a permitted Defect Editor, make **one legitimate Defect edit** in the Web App, verify the recorded status changes to `pending`, then `synced` only after reading both original Excel file IDs back. Verify the exact row/cells manually in Drive.
7. Verify Defect Report, Defect Flow, permissions, PDF upload and Site Operations regressions. If any result does not match, **disable only the new `runDefectWritebackScheduled` trigger**, leave the two original workbooks untouched, and investigate pending row error.

## Boundaries / limitations

- This is a **five-minute scheduled writeback**, not atomic cross-service distributed transaction. The DB is immediate; Excel availability is subject to Google Apps Script execution and Drive API.
- The script updates the authoritative per-room status sheet and the detailed overview `Room Data` sheet; static human-edited presentation text and precomputed summary blocks on other Excel sheets are **not rewritten**. They should be audited separately before describing the *entire workbook's summary tables* as reconciled.
- Do not mark the workflow live until the Apps Script installation, read-back test, actual room edit, and production E2E all succeed.
- If Excel is manually edited during upload, the executor detects changed Drive modification timestamp and declines the update. Rare millisecond races remain possible because Google Drive does not provide workbook cell-level compare-and-swap for `.xlsx` files.
