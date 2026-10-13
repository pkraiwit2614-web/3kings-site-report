# เปิดใช้งาน 3 Kings Sync Triggers — 13 Oct 2026

## Before enabling
- Work inside the **existing** Apps Script project that contains `sync3Kings`, `smartSyncDefectsV13_15m` and the current Defect Excel writeback code. Do **not** create a second independent hourly sync project.
- Preserve `Script Properties` and other functions unchanged.
- Set Apps Script project timezone to `Asia/Bangkok`.
- Verify the Hotel Excel file ID `19TX2KinSx3QXLw_VMZCE3Gm-bQVzzsSC` and file title `Contractor_Schedule_Above_Element_OOO_OOS_Updated_2026-10-13.xlsx`. The file is in `3Kings Construction/Above/CONDO/Defect/Hotel Room Status - OOO OOS`.
- Do not delete Daily Report, Labour, Payroll, Google Calendar, or Defect Web-to-Excel triggers.

## Add two new .gs files in the existing project
1. `docs/apps-script/ShiftSyncScheduler_2026-10-13.gs`
2. `docs/apps-script/HotelOOOExcelWriteback_2026-10-13.gs`

Use the Apps Script editor (+ → Script), paste the exact GitHub files, and Save.

## Run checks, then install
Run these in sequence from the Apps Script function picker:
1. `hotelOOOReadinessCheck` — READ ONLY; expected 263 canonical rooms, 93 OOO and 1 OOS for the initial baseline.
2. `hotelOOODryRun` — READ ONLY; verifies any waiting web updates without uploading to Excel.
3. `installShiftSync20261013` — removes ONLY the old source-import triggers listed in the shift module and installs 4 source-sync triggers. It does **not** remove the existing Web-to-Excel Defect executor.
4. `hotelOOOInstallTrigger` — installs **one** Hotel OOO/OOS Excel writeback trigger (every 15 minutes).
5. `getShiftSyncStatus20261013` — should show 4 new managed sync triggers; verify that `hotelOOOExecuteWriteback` and all unrelated original triggers are also listed.

Google prompts for authorization the first time; grant only if logged into the correct Google account / correct script project.

## Timetable (Asia/Bangkok)
- Project Schedule: Mon–Sat, hourly windows 08:00 through 18:00 inclusive.
- Materials: Mon–Sat, 08:00, 11:00, 14:00 and 17:00.
- Defect inbound Excel: Mon–Sat, hourly windows 08:00 through 18:00 inclusive.
- Photo: daily (including Sunday), 08:00, 12:00 and 17:00 (Apps Script trigger minute may drift by ~15 min).
- Hotel OOO/OOS web save -> Excel: every 15 minutes, independent of inbound Defect schedule.
- Existing Defect Web -> Excel work remains unchanged at its previous cadence.

## Identity and safety
- Hotel OOO/OOS is per *physical* room; Good01–05 aliases are B101–B105.
- Combined rooms are navigational groups only, **not** one shared OOO record.
- Only the `OOO_OOS_Master` status/date/reason/remark, and `Schedule` columns H:K for the same source row, may be edited by Hotel Excel writer.
- The writer refuses ID/revision/content mismatch or formula writes. Conflicts are reported to owner Data Reconciliation, not forcibly resolved.
- Same Drive file ID is preserved across date-based renames.
- Source file remains private; NEVER share `DEFECT_SYNC_KEY` or `SUPABASE_PUBLISHABLE_KEY` in screenshots or logs.

## Rollback
- Remove only the newly installed `syncShiftHourly20261013`, `syncShiftPhoto0800`, `syncShiftPhoto1200`, `syncShiftPhoto1700`, and `hotelOOOExecuteWriteback` triggers.
- Restore the known former sync trigger cadence only after checking active scripts.
- The original Hotel Excel workbook is backed up under the same folder's `Backup`.
- Database history, Defect sources, and 3Kings room records remain separate.

## Reminder
GitHub commit/deploy alone does NOT install Apps Script triggers. Only the above action in the correct Apps Script account activates them.
