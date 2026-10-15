# Internal Work Order Viewer — phase 1 (2026-10-15)

## Scope and exact source
- Defect > Work Order is a read-only list for internal 3 Kings access roles only: owner, admin, viewer_editor, further restricted by the current Defect view permission matrix.
- Workbook: `Defect_Work_Order_Updated_2026-10-15.xlsx`, sheet `ใบแจกงานตามทีม`.
- Initial snapshot: 52 unique Work IDs in the contractor-dispatch sheet, 14 A / 38 B, from the file modified 2026-10-15T04:23:21Z. The workbook itself explicitly says **NOT automatically synced**. This migration imports a dated snapshot, not a continuous feed.
- Status source of truth remains `public.condo_room_status`; neither its schema nor its data, the Hotel Work Plan, OOO/OOS or Excel workbooks are mutated.

## Display and exclusion rules
- On every read, join each Work ID's room or Combine members to the current `condo_room_status` rows.
- Only show an unfinished Work ID when every member resolves to `Hotel - Incomplete`. If room status is different, a member is absent, or the statuses disagree, exclude from print and show the excluded item count; don't guess or close the Work ID.
- Different Work IDs are distinct defect jobs. A Combine group is one Work ID for the paired room, not a duplicate per room.
- No inferred received dates. 7-day overdue is displayed only when the workbook has an actual due date. Unverified dates display `รอยืนยัน`.
- Work descriptions, team/supervisor, QA warnings, and source evidence URLs are preserved from Excel, with no guessed image thumbnails.
- Every row's QA text accompanies printing. This is **pre-dispatch verification**, not a guarantee of contractor acceptance or checked photographs.

## Sync and permissions
- The app shows `อัพเดทล่าสุด` from `imported_at` of the work-order snapshot, **not** the room-status sync time.
- No Excel trigger or automatic sync to this new snapshot is installed as part of phase 1. Subsequent edits to Excel will NOT appear here until an authorized snapshot import workflow is established. Do not represent the snapshot as live Excel.
- SQL table grants SELECT only to authenticated 3 Kings staff with active profiles; anonymous, hotel-specific defect contributor/editor roles, and shared Viewer are blocked. RLS is enabled and forced.
- The UI cannot create/update/delete Work IDs or edit Defect state. Owner/admin can still use existing Defect functionality separately as per current role permissions.
- Print uses existing PageHeader/PrintButton and A4 landscape CSS; users filter by contractor/room/building before printing.
- Photo/PDF links only open the verified source URLs; direct photos are not embedded because the available source links point to PDF/evidence files and per-point photos are not confirmed.

## Deployment acceptance
1. Build + new tests pass, existing CI tests unchanged.
2. Database migration runs and SELECT for allowed role / denial for hotel and Viewer roles are verified.
3. Test counts, search `Good02`, Combine `A417+A418`, team filter, A/B cards, and print in Preview.
4. Confirm latest 3 Kings source file before Production. The source file is NOT a live sync and must not be advertised as one.
