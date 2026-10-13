# Above Condo Defect — canonical source contract (2026-10-13)

## Approved Excel workbooks only

1. **Authoritative master:** `Handover_Defect_Summary_Updated_28-09-2026.xlsx` — Drive file ID `1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj`; sheet `ข้อมูลจำแนก`. This is the only workbook allowed to synchronize the 263 room statuses to `public.condo_room_status`.
2. **Human-facing overview:** `Status ภาพรวม รายห้อง-Building-A-B-Done_Updated_28-09-2026.xlsx` — Drive file ID `16JuK26rn7HGPDtSlnMMS2aljYGWyn0Y3`. When a room update requires corresponding report changes, update this workbook together with the master. It is **not** an independent third source for room classification.

No other Excel workbook may be treated as an authoritative room-status source; a hotel Defect PDF or photo may remain evidence for an individual defect without rewriting room classifications automatically.

## Database and UI

- Single active database table: `public.condo_room_status` (263 rooms, A162 / B101).
- Defect Report, Defect Flow, Defect dashboard and Defect-related presentations must use `condo_room_status`.
- `public.condo_defect_rooms` (113 incomplete historical rows) was retired; its static snapshot is stored outside exposed schemas as `private.condo_defect_rooms_archive_20261013`, with no client read permissions.
- Do not use the archived data to populate or override classifications; it is for recovery/audit only.
- Keep manual-update audit tables (e.g., `defect_manual_updates`) and defect-PDF evidence flows: they are not competing Excel master files.

## Sync constraints and deployment boundary

- The `/api/sync/drive?kind=defects` endpoint must require exact canonical file name **and** file ID, then validate exact 263-room set.
- The `drive_sync_apply_condo_defects` Postgres RPC independently rejects noncanonical file name/ID even if an API check is bypassed.
- The repository contains an updated `docs/apps-script/SmartSyncDefects_v1.3_2026-10-02.gs` reference pinned to the same workbook. Its Google Apps Script runtime installation must be checked independently; changing the GitHub copy alone does not deploy it.
- A direct Web App manual Defect update currently writes `condo_room_status` plus audit; that is **not proof of a write-back** to both Excel workbooks. Maintain the source workbooks through the authorized update workflow until end-to-end write-back is verified.
- Reject unexpected file changes, duplicate room numbers, or an incomplete 263-room workbook; do not replace existing room status with a partial import.
- Avoid touching Site Operations, labour/payroll, procurement, or photo mapping code.
