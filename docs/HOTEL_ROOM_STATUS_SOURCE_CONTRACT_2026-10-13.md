# Hotel availability OOO/OOS source contract — 2026-10-13

## Destination and activation gate
- Drive: Above / CONDO / Defect / Hotel Room Status - OOO OOS
- Target folder ID: `1Qj1Mudmm_FdNWq1liPgrFqSCgWEzp_tN`.
- Intended original workbook (hotel-supplied): `Contractor_Schedule_Above_Element_30_per_Day_v2.xlsx` dated 13 October 2026.
- **Not active**: Original workbook is not accessible as a verified Drive file from this audit. Do **not** use a report derived from this workbook as the authoritative input. Upload/copy the original to the dedicated folder, read back its Drive file ID, worksheet names, checksum and modified time, then pin the ID in the import/writeback handler. Do not select the "latest filename" by pattern.
- No invented original file ID. No import into `hotel_room_availability` until the file and mapping pass validation.

## Required source validation
1. Parse hotel sheet headers and rows, OOO/OOS, start/end dates, reason/comments, and Rental Pool classification. Preserve raw source row number, original text, file ID and SHA/modifiedTime for audit.
2. Canonicalize Good01–Good05 to B101–B105 *without creating additional rooms*. Existing comparisons showed 267 input rows representing 263 canonical rooms; do not count four duplicate B102–B105 placeholders as new rooms.
3. Reject conflicting OOO/OOS/date/reason for identical canonical room or combined-room group; require owner Data Reconciliation (no guessing). Missing OOO/OOS is `UNKNOWN`, **not** AVAILABLE.
4. Validate against `condo_room_status` inventory (263, Building A 162 and B 101) without changing `condo_room_status`, `defect_manual_updates`, or the two canonical Defect Excel source workbooks.
5. Show Joined/Non-Join disagreements to owner without overwriting either source. Previous source reconciliation observed 63 disagreements, but this number requires fresh validation from the original workbook.
6. Hotel status writes update only `hotel_room_availability`, using its revision guard and owner-only reconciliation review; Defect status remains separate.
7. Two-way writeback must target the exact original file ID, verify the source revision before writing, edit only the original source row's OOO/OOS/date/comment cells, protect all formulas/formatting, and verify readback. If Excel changes concurrently, hold the row for owner reconciliation without overwriting.
8. Retain a baseline backup in the source folder's `Backup` subfolder before first in-place XLSX write.
9. Confirm permissions at both page and database/RPC levels; `defect_editor` can edit hotel availability, owner can reconcile, all other roles limited to their existing access.

## Important separation
Web save -> Supabase availability revision -> verified Excel writeback queue (not directly into Defect status).
Excel import -> identity+hash validation -> only unchanged/unmodified hotel availability rows auto-update; divergent rows to owner reconciliation.
No automatic deletion of existing room records, no broad import into unrelated tables.

## Ops
Schedule/import timings live in Google Apps Script runtime, not in GitHub source alone. See `docs/apps-script/ShiftSyncScheduler_2026-10-13.gs`. Existing five-minute Defect Web-to-Excel executor is independent; do not remove its trigger as part of changing inbound Defect imports to hourly.
