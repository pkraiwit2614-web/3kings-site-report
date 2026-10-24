# 3 Kings — Google Calendar Auto Sync Runbook (SOP 12)
**Date:** 2026-10-23  
**Status:** STAGED_VERIFIED_LOCAL_TESTS_PASS  
**Target:** Google Calendar Auto Sync across 7 Production Calendars (188 Existing Events)

---

## 1. Executive Summary & Objective

In accordance with **SOP 12 (Work Calendar)** and the Antigravity Autonomous Development Framework:
- Enforce the canonical event title format across Google Calendar:
  ```text
  รายละเอียดงานเหมือนเดิม • สถานะ [สถานที่] [กลุ่มงาน]
  ```
- **Examples:**
  - `งานสถาปัตยกรรม 25.9% • ล่าช้า [Plot 9] [สถาปัตย์]`
  - `Cleaning A221/A222 • แผนช่วงบ่าย [Condo A] [Cleaning]`
  - `Handover A401 • แผน [Condo A] [Handover]`
- Protect the **188 formatted events** across **7 Google Calendars** from being overwritten, renamed back to legacy styles, or duplicated during subsequent automatic sync cycles.

---

## 2. Root Cause Analysis: Event Duplication & Name Reversion

Previous sync risks were traced to four core failure modes:

| Failure Mode | Root Cause | Preventive Solution in v2026-10-23 |
|---|---|---|
| **1. Title-Based Lookup Failure** | Comparing `event.getTitle() === newTitle`. When progress changes (e.g., 25.9% → 26.5%) or status updates, the lookup fails to find the event and calls `createEvent()`. | **3-Tier Identity Matching**: Strips progress `%` to extract base task identity, location, and trade; updates existing event title instead of creating a new one. |
| **2. Missing Stored Event ID** | Events lacked persistent linkage to source records, forcing fragile heuristics on every sync. | **Tier 1 (Stored ID) & Tier 2 (Stable Key)**: Stores Event ID and attaches `[3Kings-Key: ...]` in description or tags for O(1) matching. |
| **3. Combine Room Splitting** | Naive string matching treats `A221/A222`, `A221+A222`, and `A221, A222` as different entities, creating duplicates. | **Canonical Room Normalization**: Extracts room tokens `[AB]\d{3}` and sorts them (e.g. `A221,A222`), equating all divider variants. |
| **4. Concurrency Race Conditions** | Overlapping scheduled triggers running simultaneously see empty calendar slots and both insert events. | **Script Lock**: `LockService.getScriptLock()` with 30-second timeout ensures single-threaded atomic sync. |

---

## 3. The 7 Production Google Calendars

| # | Calendar ID | Label | Color |
|---|---|---|---|
| 1 | `family17900518303332507254@group.calendar.google.com` | 3 Kings – Construction Plan | `#b99aff` |
| 2 | `9fad4dc9a66ea28e8e98f833119dbd8a4978b66574a329f2d9d1bb8d71b7f498@group.calendar.google.com` | 3 Kings – Site / Actual | `#ff7537` |
| 3 | `6cf6a83e431fa95467563ac0e82400d126601d3e6d3c76936ee26de0813e3614@group.calendar.google.com` | กำหนดส่ง-ของเข้าหน้างาน | `#a47ae2` |
| 4 | `9b7068d0a450c0f2acbc58783d9eabf80c2957b329d99bdbb1078586994ac210@group.calendar.google.com` | 3K - Above Villa 6 | `#c2c2c2` |
| 5 | `7ca8d4a9ade6e05b36ec81c9e0dc025d12c567541414a9ceaee1958e344d187c@group.calendar.google.com` | 3K - Above Villa 7 | `#ff7537` |
| 6 | `d31b1dafb3231456407795ea8400bdc0daf490553d441449312e01725a7fd379@group.calendar.google.com` | 3K - Above Villa 8 | `#cca6ac` |
| 7 | `958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com` | 3K - Above Villa 9 | `#b3dc6c` |

---

## 4. Reconciliation Hierarchy (3-Tier Protocol)

1. **Tier 1: Explicit Stored ID (`calendarId` + `eventId`)**
   - Exact match by Google Calendar Event ID.
   - If title or description has changed, calls `event.setTitle(newTitle)`.
   - Result: `NOOP` or `UPDATE` (preserves existing Event ID).

2. **Tier 2: Stable Source Key Tag**
   - Checked via `event.getTag('source_key')` or `[3Kings-Key: ...]` in description.
   - Built from `domain:location:workGroup:baseTask:date` (excludes progress `%`).

3. **Tier 3: Retroactive Semantic Reconciliation (For existing 188 events)**
   - Date (`YYYY-MM-DD` in `Asia/Bangkok`).
   - Location (normalized, e.g., `Plot 9`, `Condo A`).
   - Work Group (normalized, e.g., `สถาปัตย์`, `Cleaning`, `Handover`).
   - Base Detail / Canonical Rooms.
   - **Ambiguity Guard**: If more than 1 existing event matches, the item is quarantined as `REVIEW` and **NO new event is created**.

---

## 5. Deployment & Execution Instructions in Google Apps Script

To install or update the code in Google Apps Script:

1. Open the existing **3 Kings Apps Script Project** in the Google Apps Script Editor (`https://script.google.com`).
2. Add a new script file: `GoogleCalendarAutoSync_2026-10-23.gs`.
3. Copy and paste the complete content of:
   [`docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs`](file:///c:/Users/Acer/Projects/3kings-site-report/docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs).
4. Save the project.
5. In the function dropdown, run `dryRunGoogleCalendarSync()`:
   - Verifies all 7 calendars.
   - Verifies all 188 existing events are recognized.
   - Confirms `createdCount === 0`.
6. **Safety Rules:**
   - **Do NOT** create a new independent Apps Script project.
   - **Do NOT** delete or edit existing triggers (`syncShiftHourly20261013`, `smartSyncDefectsV13_15m`, `dailySiteSyncHourly20261019`, `syncWorkOrderHourly20261015`, `hotelOOOExecuteWriteback`).
   - **Do NOT** insert dummy or test events into the 7 Production calendars.

---

## 6. Verification and Regression Test Evidence

The regression suite [`tests/google-calendar-auto-sync.test.cjs`](file:///c:/Users/Acer/Projects/3kings-site-report/tests/google-calendar-auto-sync.test.cjs) was executed with 11 test assertions:

```text
✔ GoogleCalendarAutoSync script compiles cleanly without syntax errors
✔ enforces exact canonical title format: รายละเอียดงานเหมือนเดิม • สถานะ [สถานที่] [กลุ่มงาน]
✔ parses existing event titles into constituent parts without losing detail
✔ Combine room normalization equates slash, plus and comma separators
✔ Progress percentage update modifies existing event title and preserves same Event ID
✔ Retroactive matching links untagged existing events by date + location + trade without creating duplicates
✔ Ambiguous matches (>1 candidates) fail closed to REVIEW and do not create duplicates
✔ Dry-run mode executes zero mutations and returns audit ledger
✔ Two-pass sync idempotency on 188 simulated production events across 7 calendars
✔ Retry logic performs exponential backoff on transient errors and succeeds upon recovery
✔ Safety boundaries: zero modification to Defect Flow, Work Orders, Materials or unrelated triggers

PASS: 11 / 11 tests passed (0 failures)
```
