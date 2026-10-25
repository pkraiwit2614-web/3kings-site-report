# 3 KINGS CONSTRUCTION — FULL GOOGLE APPS SCRIPT AUDIT & DEPENDENCY ANALYSIS
**Execution Date**: 2026-10-24  
**Audit Scope**: All Google Apps Script (GAS) projects, codebases, triggers, deployments, execution channels, dependencies, and production interactions.  
**Auditor**: Antigravity Autonomous System Auditor  
**Security Classification**: CONFIDENTIAL — INTERNAL SYSTEM AUDIT  

---

## TABLE OF CONTENTS
1. [REPORT A — Executive Summary](#report-a--executive-summary)
2. [REPORT B — GAS Project Inventory](#report-b--gas-project-inventory)
3. [REPORT C — Execution & Trigger Health Audit](#report-c--execution--trigger-health-audit)
4. [REPORT D — Dependency Map & End-to-End Data Flow](#report-d--dependency-map--end-to-end-data-flow)
5. [REPORT E — Cleanup & Disposal Register](#report-e--cleanup--disposal-register)
6. [REPORT F — Risk Register & Action Plan (P0 → P3 + INFO)](#report-f--risk-register--action-plan)

---

## REPORT A — Executive Summary

### High-Level Statistics
| Metric | Count | Details & Verified Status |
| :--- | :---: | :--- |
| **Total Discovered Standalone GAS Projects** | **5** | Identified via Google Drive API & `@google/clasp` across all accessible drives |
| **Projects Fully Audited** | **5** | 100% of discovered projects inspected (Code, Manifest, Triggers, Deployments) |
| **Total Source Files Audited** | **30** | 24 in Proj 1 (HEAD), 1 in Proj 2, 1 in Proj 3, 4 in Proj 4, 1 in Proj 5 |
| **Total Functions Cataloged** | **531** | Complete function declarations extracted and mapped |
| **Active Production Projects** | **2** | Project 1 (Core Sync Hub) & Project 5 (Daily Report Generator) |
| **Projects with Active Triggers** | **2** | Project 1 (11 Clock Triggers installed) & Project 5 (3 Form/Edit/Clock Triggers) |
| **Projects with Active Deployments** | **1** | Project 1 (3 Deployments: HEAD, Version 1, Version 9 Dynamic Gateway) |
| **Healthy Projects** | **1** | Project 5 (`3Kings Daily Report Automation`) operating deterministically |
| **Active Projects with Issues** | **1** | Project 1 (`3Kings Drive → Supabase Sync`) has 1 missing trigger handler in HEAD |
| **Duplicate / Redundant Projects** | **2** | Project 2 & Project 3 (Both named `3Kings Materials PR XLSX Executor QA`) |
| **Legacy / Backup Projects** | **1** | Project 4 (`BACKUP_before_MaterialsSyncFix_2026-10-10_3Kings_Sync`) |
| **P0 Critical Risks** | **0** | No live production database crash or RLS breach observed |
| **P1 High Risks** | **2** | P1-1: Missing trigger handler in HEAD; P1-2: Duplicate Defect trigger clash |
| **P2 Medium Risks** | **3** | Unprotected backup project, duplicate project names, global namespace clash |
| **P3 Low Risks** | **2** | Local workspace worktree desync, lingering one-off patch scripts |
| **Projects Deleted During Audit** | **0** | Strictly governed: Deletion criteria not fully met (staged as candidates) |
| **Projects Staged for Future Cleanup** | **2** | Project 2 (`1nVPw`) & Project 3 (`1iw1H`) staged as `UNUSED_CANDIDATE` |

---

## REPORT B — GAS Project Inventory

### Inventory Table of All 5 Projects

| # | Project Name & Script ID | Type | GCP / Container | Source Files | Deployments | Active Triggers | Owner & Scopes | Confirmed Status |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **3Kings Drive → Supabase Sync**<br>`1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT` | Standalone Script | Google Default Managed (`1072944905499`) | 24 files (HEAD)<br>25 files (v9)<br>332 functions | **3 Deployments**:<br>- HEAD (`AKfycbw_ep...`)<br>- v1 (`AKfycbyeF-...`)<br>- v9 (`AKfycbxcdwx...`) | **11 Active Clock Triggers** | `Kraiwit Poommai`<br>(`p.kraiwit2614@gmail.com`)<br>Drive, External Req, Sheets | **ACTIVE_WITH_ISSUES**<br>(Core system, but missing 1 trigger handler in HEAD) |
| **2** | **3Kings Materials PR XLSX Executor QA**<br>`1nVPw2sEHHxuoEZWAJpJuOccWqJPAr8l8aOOqefRtQPEAdP7hP6oi5uIU` | Standalone Script | Google Default Managed | 1 file (`รหัส.gs`)<br>17 functions | Default 1970 only<br>(No Web App) | **0 Triggers** | `Kraiwit Poommai`<br>(`p.kraiwit2614@gmail.com`)<br>Drive, External Req | **DUPLICATED / UNUSED_CANDIDATE**<br>(Staging test created 2026-10-21 13:32 UTC) |
| **3** | **3Kings Materials PR XLSX Executor QA**<br>`1iw1H5Rg_6Sx0mVkM-xmpZrk5lXwMmXOq6K3-MsftWOw_gCn6dcLl3OIP` | Standalone Script | Google Default Managed | 1 file (`รหัส.gs`)<br>27 functions | Default 1970 only<br>(No Web App) | **0 Triggers** | `Kraiwit Poommai`<br>(`p.kraiwit2614@gmail.com`)<br>Drive, External Req | **DUPLICATED / UNUSED_CANDIDATE**<br>(Canary V5 test created 2026-10-21 06:27 UTC) |
| **4** | **BACKUP_before_MaterialsSyncFix_2026-10-10_3Kings_Sync**<br>`1IQDehXxFCJ34cLKyY0iF2Z5-KLjwolZcl4cmnQddYTiIrYkmAdtMLRLr` | Standalone Script | Google Default Managed | 4 files (`SmartSync`, `sync3Kings`, etc.)<br>101 functions | Default 1970 only<br>(No Web App) | **0 Active Triggers** | `Kraiwit Poommai`<br>(`p.kraiwit2614@gmail.com`)<br>Drive, External Req | **LEGACY / BACKUP**<br>(Preserve recovery snapshot; do not execute) |
| **5** | **3Kings Daily Report Automation**<br>`19ZzdTIhmLoMBIxL0RVNIUDmMxvWvGe7ScDFhhzkuxqtkDbEyzVLq5qpT` | Standalone Script | Google Default Managed | 1 file (`รหัส.gs`)<br>54 functions | Default 1970 only<br>(No Web App) | **3 Active Triggers**<br>(Form Submit, Edit, Clock) | `Kraiwit Poommai`<br>(`p.kraiwit2614@gmail.com`)<br>Spreadsheet, Drive | **ACTIVE**<br>(Automates Form Responses → Daily Report Sheet → Excel) |

---

### Project 1 File Catalog Breakdown
Location: `1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT`

| File Name | Size (Bytes) | Functions Count | Domain / Purpose | Status / Risk |
| :--- | :---: | :---: | :--- | :--- |
| `DailySiteReportSync_2026-10-19.gs` | 9,041 | 12 | Form responses (>= row 354) → Supabase RPC `daily_site_report_sync_v1` | ACTIVE (Trigger 1) |
| `ShiftSyncScheduler_2026-10-13.gs` | 8,929 | 11 | Master hourly shift dispatcher (Villa Progress, Materials, Defect, Calendar) | ACTIVE (Triggers 2, 4, 5, 6) |
| `HotelWorkPlanExcelBidirectional.gs` | 22,752 | 35 | Excel `Hotel_Work_Plan.xlsx` ↔ Supabase bidirectional sync | ACTIVE (Trigger 3) |
| `SmartSyncDefects_v1.3.gs.gs` | 17,753 | 12 | Defect sync from `Handover_Defect_Summary.xlsx` (`ข้อมูลจำแนก`) → Supabase | ACTIVE (Trigger 7) |
| `DefectExcelWriteback_v2_1_Aligned.gs` | 23,160 | 25 | Supabase web overrides / queue → Excel cell writeback | ACTIVE (Trigger 8) |
| `WorkOrderAutoSync_2026-10-15.gs` | 9,493 | 12 | Work Orders from Excel → Supabase snapshot | ACTIVE (Trigger 9) |
| `DailyLineGatewayExecutor_20261024` | 19,425 | 15 | Daily LINE broadcast trigger & webhook receiver `doPost` | **MISSING IN HEAD** (Trigger 10) |
| `HotelOOOExcelWriteback_2026-10-13.gs` | 15,756 | 19 | Hotel OOO/OOS room availability writeback to Excel | ACTIVE (Trigger 11) |
| `GoogleCalendarAutoSync_2026-10-23.gs` | 57,276 | 20 | Google Calendar ↔ Supabase two-way sync (SOP 12) | STAGING (Gated by property) |
| `sync3Kings.gs` | 78,301 | 80 | Monolithic sync library (Villa P6-P9, Materials, Photo indexing) | ACTIVE (Invoked by scheduler) |
| `SmartSync.gs` | 21,885 | 19 | Earlier smart sync scheduler (pre-v1.3) | LEGACY (Dormant functions) |
| `ExpressBridgeMasterImporter.gs` | 9,141 | 3 | Express PO/PL/PR → Google Drive PR Master Excel | ON-DEMAND (Owner gated) |
| `ExpressBridgeSupabaseSync.gs` | 8,435 | 7 | Express PO Registry → Supabase database | ON-DEMAND (Owner gated) |
| `ExpressBridgeAppendQA.gs` | 12,444 | 9 | XML cell append validation for Express PO Excel | QA TOOLING |
| `ExpressBridgeFullQA.gs` | 18,126 | 18 | Express PO file parsing, hashing, and normalization QA | QA TOOLING |
| `ExpressBridgeOwnerGate.gs` | 2,914 | 1 | Owner preflight validation for Express Bridge operations | SECURITY GATE |
| `ExpressBridgePropertiesFix_20261023.gs` | 7,328 | 4 | Script Properties auditor & approval gate setter | ADMIN UTILITY |
| `WorkOrderSingleWriterCompletion_2026-10-21.gs` | 15,153 | 18 | Atomic single-cell completion updater in Work Order Excel | ON-DEMAND (Gated) |
| `WorkOrderSingleWriterIsolatedQA_2026-10-21.gs` | 9,211 | 3 | Isolated test runner for Work Order single writer | QA TOOLING |
| `WorkOrderImporterCheck_20261021.gs` | 329 | 1 | Preflight check for work order importer | QA TOOLING |
| `DefectWorkOrderWebMirror.gs` | 14,211 | 18 | Web mirror synchronizer for defect work orders | ON-DEMAND / TESTING |
| `Defect PR #168.gs` | 2,117 | 1 | Preflight audit function from PR #168 (`audit3KingsDefectPfurPreflight`) | HISTORICAL PATCH |
| `3Kings_Materials_Patch_QA.gs` | 9,027 | 3 | Historical patch for steel materials synchronization | HISTORICAL PATCH |
| `รหัส.gs` | 846 | 1 | Google Drive & Supabase connectivity diagnostic (`testDriveAndSupabase`) | DIAGNOSTIC UTILITY |
| `appsscript.json` | 198 | N/A | Manifest with Drive v3 Advanced Service, `Asia/Bangkok` TZ, V8 runtime | ACTIVE MANIFEST |

---

## REPORT C — Execution & Trigger Health Audit

### Project 1 Active Clock Triggers (Live Inspection at 2026-10-24 08:57:10 UTC)

| Trigger ID / Handler Name | Defined In File | Frequency / Schedule | Target Destination | Execution Health | Issues / Anomalies |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **`dailySiteSyncHourly20261019`** | `DailySiteReportSync_2026-10-19.gs` | Every Hour | Supabase RPC `daily_site_report_sync_v1` | **HEALTHY** | None. Rows < 354 protected. |
| **`syncShiftHourly20261013`** | `ShiftSyncScheduler_2026-10-13.gs` | Every Hour (08:00–18:00 Mon-Sat) | Supabase (`schedule_tasks`, `materials`) | **HEALTHY** | Quota-conscious shift gates active. |
| **`hotelWorkPlanSyncNow`** | `HotelWorkPlanExcelBidirectional.gs` | Time-Driven (Clock) | Drive `Hotel_Work_Plan.xlsx` & Supabase | **HEALTHY** | LockService enabled. |
| **`syncShiftPhoto0800`** | `ShiftSyncScheduler_2026-10-13.gs` | Daily @ 08:00 Bangkok | Supabase `drive_photo_index` | **HEALTHY** | Scheduled morning photo scan. |
| **`syncShiftPhoto1200`** | `ShiftSyncScheduler_2026-10-13.gs` | Daily @ 12:00 Bangkok | Supabase `drive_photo_index` | **HEALTHY** | Scheduled midday photo scan. |
| **`syncShiftPhoto1700`** | `ShiftSyncScheduler_2026-10-13.gs` | Daily @ 17:00 Bangkok | Supabase `drive_photo_index` | **HEALTHY** | Scheduled evening photo scan. |
| **`smartSyncDefectsV13_15m`** | `SmartSyncDefects_v1.3.gs.gs` | Every 15 Minutes | Supabase `condo_room_status` | **HEALTHY** | Preserves Web App manual overrides. |
| **`defectWritebackScheduledV2`** | `DefectExcelWriteback_v2_1_Aligned.gs` | Every 5 Minutes | Drive `Handover_Defect_Summary.xlsx` | **HEALTHY** | Drains Supabase writeback queue. |
| **`syncWorkOrderHourly20261015`** | `WorkOrderAutoSync_2026-10-15.gs` | Every Hour | Supabase `defect_work_order_snapshot` | **HEALTHY** | Syncs contractor work orders. |
| **`dailyLineGatewayScheduled0730`** | `DailyLineGatewayExecutor_20261024` | Daily @ 07:30 Bangkok | Supabase Staging & Daily LINE Publisher | **FAILING / CRITICAL** | **File missing in HEAD revision!** Will fail at next 07:30 run. |
| **`hotelOOOExecuteWriteback`** | `HotelOOOExcelWriteback_2026-10-13.gs` | Time-Driven (Clock) | Drive Hotel OOO Excel XML | **HEALTHY** | Writes room availability to Excel. |

---

### Project 5 Active Triggers (`3Kings Daily Report Automation`)

| Trigger Handler | Trigger Type | Event Source | Target Spreadsheets | Status | Notes |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **`onDailyReportFormSubmit`** | Installable Form Submit | Google Form Responses Sheet | `1z57u9sJEDtEAsSORONGRaeNDmUvhS6dw2YkVCv2ovhQ` | **HEALTHY** | Appends new form submissions to date tab |
| **`onDailyReportSourceEdit`** | Installable Edit Trigger | Google Form Responses Sheet | `1z57u9sJEDtEAsSORONGRaeNDmUvhS6dw2YkVCv2ovhQ` | **HEALTHY** | Reconciles source edits without clear-sheet |
| **`reconcileDailyReport`** | Time-Driven Clock Trigger | Timer (Periodic) | `1z57u9sJEDtEAsSORONGRaeNDmUvhS6dw2YkVCv2ovhQ` | **HEALTHY** | Runs Layer 1 & 2 QA validators and exports Excel |

---

## REPORT D — Dependency Map & End-to-End Data Flow

```
                                      +---------------------------------------------+
                                      |   Google Form: Daily Site Report Entry      |
                                      +---------------------------------------------+
                                                             |
                                                             v
                                      +---------------------------------------------+
                                      | Google Sheet: Form Responses 1              |
                                      | (ID: 1-ZSZXulxaje4vDP1ztvUBXsjlmffjAcDu...) |
                                      +---------------------------------------------+
                                              |                              |
                   (All Form Rows >= 267)     |                              | (Rows >= 354)
                                              v                              v
           +---------------------------------------+      +-----------------------------------------+
           | Project 5: GAS Daily Report Automation |      | Project 1: DailySiteReportSync (Trigger)|
           | (Script ID: 19ZzdTIhmLoMBIxL0RV...)   |      | (Script ID: 1sKddwvs-DOav0ltdrcxyqP...) |
           +---------------------------------------+      +-----------------------------------------+
                     |                     |                                    |
                     v                     v                                    v
     +--------------------------+  +----------------------+             +-------------------+
     | Master Google Sheet      |  | Excel Export (.xlsx) |             | Supabase RPC:     |
     | "Daily Report - Oct 26"  |  | Folder: 1pLZ33h2...  |             | daily_site_report |
     | (ID: 1z57u9sJEDtEAsS...) |  +----------------------+             | _sync_v1          |
     +--------------------------+                                       +-------------------+
                     |
                     v (Daily Report Tab + PDF + 4 PNGs)
     +----------------------------------------------------+
     | Project 1: DailyLineGatewayExecutor (v9 WebApp)   |
     | - Trigger @ 07:30 (BROKEN IN HEAD)                |
     | - Webhook doPost(e) HMAC SHA-256                   |
     +----------------------------------------------------+
           |                                  |
           v                                  v
+-----------------------+          +------------------------------------+
| Supabase RPC:         |          | Cloudflare Worker:                 |
| daily_line_ready()    |          | 3kings-line-autopilot-owner-only   |
+-----------------------+          +------------------------------------+
                                                      |
                                                      v
                                           +----------------------+
                                           | LINE Official Notify |
                                           +----------------------+
```

### Core Business Flows & Data Lifecycles

```
[FLOW 1: DEFECT & HANDOVER FLOW]
Drive Excel (Handover_Defect_Summary.xlsx / ข้อมูลจำแนก)
  ▲                         │
  │ (Every 5 min Writeback) │ (Every 15 min SmartSync v1.3)
  │                         ▼
Project 1: DefectExcelWriteback_v2 ◄──► Project 1: SmartSyncDefects_v1.3
  ▲                                            │
  │                                            ▼
Supabase: defect_writeback_queue          Supabase: condo_room_status (263 rooms)
  ▲                                            │
  │ (User Edits Status)                        ▼
3 Kings Web App UI (Defect Flow / Defect Grid) ◄┘ (Realtime / Cached Query)


[FLOW 2: VILLA PROGRESS & MATERIALS]
Drive Excel (Above Villa Plot 6/7/8/9 Construction Progress.xlsx)
  │
  │ (Hourly Shift Sync: 08:00 - 18:00 Mon-Sat)
  ▼
Project 1: ShiftSyncScheduler_2026-10-13 -> syncProgressPlot_()
  │
  ▼
Supabase: schedule_tasks & schedule_task_daily_snapshots

Drive Excel (ABOVE_MATERIALS_STATUS.xlsx: 01 รายการทั้งหมด, 04 Purchasing, 06 Tools)
  │
  │ (Every 3 Hours: 08, 11, 14, 17 Bangkok)
  ▼
Project 1: ShiftSyncScheduler_2026-10-13 -> syncMaterialsWorkbook_()
  │
  ▼
Supabase: materials, procurement_items, tool_machine


[FLOW 3: HOTEL OOO/OOS & WORK PLAN]
Drive Excel (Hotel_Work_Plan.xlsx) ◄──► Project 1: HotelWorkPlanExcelBidirectional ◄──► Supabase: hotel_work_plan_*
Drive Excel (Hotel Room Availability) ◄── Project 1: HotelOOOExcelWriteback ◄── Supabase: hotel_room_availability


[FLOW 4: GOOGLE CALENDAR (SOP 12)]
Supabase: work_calendar_events
  ▲
  │ (Scheduled Sync / On-demand, Gated by CALENDAR_SYNC_ENABLED)
  ▼
Project 1: GoogleCalendarAutoSync_2026-10-23
  ▲
  │ (CalendarApp REST)
  ▼
Google Calendar (3 Kings Work Calendar)
```

---

## REPORT E — Cleanup & Disposal Register

### Evaluation Against 10 Mandatory Safety Rules for Deletion

| Rule # | Deletion Safety Requirement | Project 2 (`1nVPw`) | Project 3 (`1iw1H`) | Project 4 (`1IQDe`) | Project 5 (`19Zzd`) |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **1** | Inspected execution history across full business cycle | PARTIAL (3 days) | PARTIAL (3 days) | N/A (Backup) | ACTIVE |
| **2** | No essential active triggers installed | PASS | PASS | PASS | FAIL (Active) |
| **3** | No active Webhook, Deployment, or External Caller | PASS | PASS | PASS | PASS |
| **4** | No other GAS or system depends on this project | PASS | PASS | PASS | FAIL (Dep for Flow 1) |
| **5** | NOT a recovery snapshot or backup system | PASS | PASS | **FAIL (Explicit Backup)** | PASS |
| **6** | NOT a Source of Truth | PASS | PASS | PASS | FAIL (Daily Master) |
| **7** | No blast radius on Production or historical logs | PASS | PASS | FAIL (Hist backup) | FAIL |
| **8** | Full, verifiable source code backup exists locally | **PASS** | **PASS** | **PASS** | **PASS** |
| **9** | Deletion authorized under live Drive ACTIVE SOP | **BLOCKED** (SOP OAuth limit) | **BLOCKED** (SOP OAuth limit) | **BLOCKED** | **BLOCKED** |
| **10** | Verifiable readback possible without side effects | PASS | PASS | PASS | PASS |
| **FINAL** | **Cleanup Disposition** | **UNUSED_CANDIDATE** | **UNUSED_CANDIDATE** | **LEGACY (DO NOT DELETE)** | **ACTIVE (PROTECT)** |

### Disposal Register Table
- **Project 1 (`1sKddwvs...`)**: `ACTIVE_WITH_ISSUES` — Production critical. Do not delete. Must repair HEAD.
- **Project 2 (`1nVPw2sE...`)**: `UNUSED_CANDIDATE` — Staging script created 2026-10-21. Retain until owner approves consolidation with Project 1.
- **Project 3 (`1iw1H5Rg...`)**: `UNUSED_CANDIDATE` — Staging script created 2026-10-21 (earlier build of Project 2). Safe candidate for consolidation/archival after owner review.
- **Project 4 (`1IQDehXx...`)**: `LEGACY / BACKUP` — Named `BACKUP_before_MaterialsSyncFix_2026-10-10_3Kings_Sync`. Condition 5 explicitly protects backup systems. **DO NOT DELETE**.
- **Project 5 (`19ZzdTIhm...`)**: `ACTIVE` — Production critical for Daily Site Reports. Do not delete.

---

## REPORT F — Risk Register & Action Plan

### Priority Matrix (P0 → P3 + INFO)

```
+----+-------------+---------------------------------------------------------------+----------------------------------+
| P  | Category    | Finding Description                                           | Immediate Recommended Action     |
+----+-------------+---------------------------------------------------------------+----------------------------------+
| P1 | INTEGRITY   | Trigger `dailyLineGatewayScheduled0730` active, but           | Push missing executor file to    |
|    |             | `DailyLineGatewayExecutor_20261024` is absent in HEAD         | Project 1 HEAD via clasp push    |
+----+-------------+---------------------------------------------------------------+----------------------------------+
| P1 | CONCURRENCY | Defect triggers fire concurrently at the top of the hour      | Coordinate scheduler to skip     |
|    |             | (`smartSyncDefectsV13_15m` vs `syncShiftHourly20261013`)      | defect slot if 15m trigger runs  |
+----+-------------+---------------------------------------------------------------+----------------------------------+
| P2 | GOVERNANCE  | Duplicate project titles (`3Kings Materials PR XLSX...`)      | Rename Project 3 to ARCHIVE/V5   |
|    |             | for Project 2 and Project 3 created on same date              | to eliminate developer confusion |
+----+-------------+---------------------------------------------------------------+----------------------------------+
| P2 | SAFETY      | Project 4 contains runnable legacy trigger code               | Add throw Error("BACKUP_ONLY")   |
|    |             | pointing to deprecated sheet names (`รายการห้อง`)             | guard at top of Project 4 code   |
+----+-------------+---------------------------------------------------------------+----------------------------------+
| P2 | ARCHITECTURE| 24 files in Project 1 share single global V8 namespace;       | Encapsulate helper utilities into|
|    |             | helper function collisions (`normalizeRoomNo_`, etc.)         | scoped modules or namespaces     |
+----+-------------+---------------------------------------------------------------+----------------------------------+
| P3 | WORKSPACE   | Local subdirectories in `gas-inspection/` out of sync         | Align local staging directories  |
|    |             | with clasp targets                                            | to single authoritative worktree |
+----+-------------+---------------------------------------------------------------+----------------------------------+
| INFO| DOCS       | Dual Daily Report pipelines (Project 5 vs Project 1)          | Document dual upstream pattern   |
|    |             | exist in parallel without conflict                            | in system architecture handbook  |
+----+-------------+---------------------------------------------------------------+----------------------------------+
```

### Detailed Issue Reports

#### ISSUE 1 [P1 — HIGH]: Active Trigger Pointing to Missing Function in Project 1 HEAD
- **Affected Project**: `1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT`
- **Affected Trigger**: `dailyLineGatewayScheduled0730` (Daily clock trigger @ 07:30 Bangkok time)
- **Symptom**: When the clock trigger fires, execution aborts with error `Script function not found: dailyLineGatewayScheduled0730`.
- **Root Cause**: At 2026-10-24 07:37 UTC, Version 9 was deployed containing `DailyLineGatewayExecutor_20261024.js`. However, at 2026-10-24 08:50 UTC, a subsequent clasp push from a local worktree directory that lacked this file updated HEAD, removing `DailyLineGatewayExecutor_20261024` from HEAD. In Google Apps Script, all time-driven triggers run exclusively against HEAD.
- **Affected Systems**: Daily LINE broadcast automated staging, HEAD Web App endpoint (`/exec`).
- **Remediation**:
  1. Copy `gas-inspection/proj1_drive_to_supabase/DailyLineGatewayExecutor_20261024.js` to the active clasp staging folder.
  2. Execute `clasp push` to restore `DailyLineGatewayExecutor_20261024` to HEAD in Project 1.
  3. Verify with `clasp status` and WebApp doGet inspection.

#### ISSUE 2 [P1 — HIGH]: Duplicate Concurrency on Defect Synchronization at Hour Mark
- **Affected Project**: `1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT`
- **Affected Handlers**: `smartSyncDefectsV13_15m` (standalone 15m trigger) and `syncShiftHourly20261013` (hourly trigger)
- **Symptom**: At :00 every hour during working shift (08:00, 09:00, ... 18:00), both handlers invoke `runDefectSyncV13_` almost simultaneously.
- **Evidence**:
  - `SmartSyncDefects_v1.3.gs.gs`: `ScriptApp.newTrigger('smartSyncDefectsV13_15m').timeBased().everyMinutes(15).create()`
  - `ShiftSyncScheduler_2026-10-13.gs`: lines 78-92 explicitly claim a defect slot and call `smartSyncDefectsV13_15m()`.
- **Impact**: One process encounters `LockService.tryLock(1000)` failure and aborts with `Defect Sync v1.3 SKIP: another sync is active`. Wastes execution quota (Apps Script has daily trigger execution limits of 90 min/day for consumer accounts).
- **Remediation**: In `ShiftSyncScheduler_2026-10-13.gs`, remove the redundant call to `smartSyncDefectsV13_15m()` since the dedicated 15-minute trigger already guarantees execution within at most 15 minutes.

#### ISSUE 3 [P2 — MEDIUM]: Unprotected Legacy Backup Project
- **Affected Project**: `1IQDehXxFCJ34cLKyY0iF2Z5-KLjwolZcl4cmnQddYTiIrYkmAdtMLRLr`
- **Symptom**: Project contains outdated `SmartSync.gs` with old sheet reference `รายการห้อง` and `installSmartSyncTriggers()`.
- **Risk**: If a developer opens the Apps Script IDE and runs `installSmartSyncTriggers()`, legacy triggers will install and write stale/corrupted room statuses to Supabase.
- **Remediation**: Prepend a fail-closed guard throwing an error in all `.gs` files in Project 4, or archive the project in Google Drive.

---
*End of 3 Kings Full Google Apps Script Audit Report.*
