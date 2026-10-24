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

1. Open the existing **3 Kings Apps Script Project** in the Google Apps Script Editor (`https://script.google.com/home/projects/1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT/edit`).
2. Verify or update files:
   - `GoogleCalendarAutoSync_2026-10-23.gs`: Complete content from [`docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs`](file:///c:/Users/Acer/Projects/3kings-site-report/docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs).
   - `ShiftSyncScheduler_2026-10-13.gs`: Complete content from [`docs/apps-script/ShiftSyncScheduler_2026-10-13.gs`](file:///c:/Users/Acer/Projects/3kings-site-report/docs/apps-script/ShiftSyncScheduler_2026-10-13.gs).
3. **Trigger Architecture**:
   - Calendar sync is integrated directly into the existing hourly trigger `syncShiftHourly20261013` via `shiftOnce20261013_('calendar-sync', slot, ...)`.
   - **Zero duplicate triggers**: All 5 existing triggers remain intact (`syncShiftHourly20261013`, `smartSyncDefectsV13_15m`, `dailySiteSyncHourly20261019`, `syncWorkOrderHourly20261015`, `hotelOOOExecuteWriteback`).
4. **Safety Rules:**
   - **Do NOT** create a new independent Apps Script project or duplicate trigger.
   - **Do NOT** delete or edit existing 5 triggers.
   - **Do NOT** insert dummy or test events into the 7 Production calendars.

---

## 6. Verification and Regression Test Evidence

The regression suite [`tests/google-calendar-auto-sync.test.cjs`](file:///c:/Users/Acer/Projects/3kings-site-report/tests/google-calendar-auto-sync.test.cjs) was executed with 23 comprehensive test assertions:

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
✔ dryRunGoogleCalendarSync audits exact 188 inventory distribution confirmed by ChatGPT without mutations
✔ dryRunGoogleCalendarSync and scheduled job fail closed when CalendarApp is missing or calendar inaccessible
✔ resolveCalendarIdForTask separates Construction Plan, Site Actual, Deliveries and Plot calendars with Actual priority
✔ dryRunGoogleCalendarSync detects intra-calendar duplicates, unformatted titles and count mismatches
✔ syncGoogleCalendarScheduledJob updates existing event title upon progress delta and preserves same Event ID
✔ syncGoogleCalendarScheduledJob called with NO ARGUMENTS fetches source from provider and verifies destination readback
✔ syncGoogleCalendarScheduledJob fails closed to reviewQueue when destination readback fails
✔ dryRunGoogleCalendarSync safely handles null/empty titles and timezone date formatting
✔ diagnoseCalendarAccess20261024 inspects all 7 calendars and Supabase connectivity
✔ fetchAuthorizedCalendarSourceItems_ maps real actual_progress and site_status without fabricated values
✔ syncGoogleCalendarScheduledJob supports skipLock to prevent nested LockService deadlock
✔ 301 active tasks reconciliation: unmatched tasks fail closed without creating unwanted events

PASS: 23 / 23 tests passed (0 failures)
```

---

## 7. Diagnostic & Troubleshooting Protocol for Owner

### Step 1: Copy Execution Error without Re-running
If an error was previously reported, Owner does NOT need to re-run:
1. Open Google Apps Script Executions:
   `https://script.google.com/home/projects/1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT/executions`
2. Click on the failed execution row (`dryRunGoogleCalendarSync`).
3. Copy the Error message, line number, and stack trace.

### Step 2: Run Read-Only Diagnostic Tool (`diagnoseCalendarAccess20261024`)
A dedicated, 100% read-only diagnostic function is now deployed to Live GAS:
1. Open Apps Script Editor:
   `https://script.google.com/home/projects/1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT/edit`
2. Select function **`diagnoseCalendarAccess20261024`** from the function dropdown.
3. Click **"Run"**.
   - If prompted for authorization: click "Review permissions" -> choose Owner Google account -> "Advanced" -> "Go to 3Kings-App (unsafe)" -> "Allow".
4. Review the Execution Log:
   - Each of the 7 calendars is tested individually:
     ```text
     [OK] 3 Kings – Construction Plan ("3 Kings – Construction Plan"): 62 events (TZ: Asia/Bangkok)
     [OK] 3 Kings – Site / Actual ("3 Kings – Site / Actual"): 90 events (TZ: Asia/Bangkok)
     ...
     Total Accessible Calendars: 7 / 7
     Total Events Found: 188
     [SUPABASE] Read 301 tasks successfully
     ```
   - If any calendar returns `[FAIL] ...: NOT ACCESSIBLE`, that calendar ID has not been added or shared with the account executing the script.

### Step 3: Run `dryRunGoogleCalendarSync`
Once all 7 calendars are accessible:
1. Select function **`dryRunGoogleCalendarSync`** and click **"Run"**.
2. Confirm status is **`AUDIT_PASS`** with 188 total events and 0 mutations.

### Step 4: Activating Scheduled Writes (SOP 16 Release Gate Required)
The hourly scheduler `syncShiftHourly20261013` currently has a **Fail-closed Gate**:
- `output.calendar` executes `CALENDAR_SYNC_NOT_ENABLED_FAIL_CLOSED` by default.
- Scheduled writes will NEVER execute until:
  1. `dryRunGoogleCalendarSync` returns `AUDIT_PASS` in Live GAS.
  2. Release gate passes and Owner explicitly sets Script Property:
     `CALENDAR_SYNC_ENABLED = "true"`
- All 5 existing triggers remain intact and unaffected.

